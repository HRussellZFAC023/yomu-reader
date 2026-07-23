#!/usr/bin/env python3
"""Render Rie's canonical first line with reproducible AivisSpeech evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SOURCE_RELATIVE = Path("src/academy/content/story-sources/s1e01-the-blank-atlas.v2.json")
SOURCE_PATH = ROOT / SOURCE_RELATIVE
OUTPUT_RELATIVE = Path(
    "public/academy/audio/story-pilot/"
    "s1e01-the-blank-atlas__rie-konbanwa__rie.opus"
)
OUTPUT_PATH = ROOT / OUTPUT_RELATIVE
MANIFEST_PATH = ROOT / "docs/academy/audio/rie-introduction-manifest.json"

LINE_ID = "line:blank-atlas:rie-konbanwa"
BAND = "foundation"
MODEL_UUID = "baaae3c0-7b22-4605-8ba5-80c959b41a48"
MODEL_NAME = "morioki"
MODEL_VERSION = "1.0.0"
SPEAKER_UUID = "396a746d-742f-4e43-b722-1182a7fab9af"
SPEAKER_NAME = "morioki"
STYLE_ID = 497929760
STYLE_NAME = "ノーマル"

QUERY_OVERRIDES = {
    "speedScale": 0.96,
    "pitchScale": -0.01,
    "intonationScale": 1.06,
    "volumeScale": 0.86,
    "prePhonemeLength": 0.12,
    "postPhonemeLength": 0.18,
    "pauseLengthScale": 0.96,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="http://127.0.0.1:10101")
    return parser.parse_args()


def request_json(
    engine: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout: int = 180,
) -> Any:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{engine}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def request_bytes(engine: str, path: str, payload: dict[str, Any]) -> bytes:
    request = urllib.request.Request(
        f"{engine}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_line() -> dict[str, Any]:
    chapter = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    for scene in chapter["scenes"]:
        for node in scene["nodes"]:
            if node.get("id") != LINE_ID:
                continue
            variant = node.get("variants", {}).get(BAND)
            if node.get("speakerId") != "rie" or not variant:
                raise RuntimeError("Rie introduction source no longer matches its canonical speaker and band.")
            source_hash = sha256_bytes("\n".join([
                chapter["id"],
                scene["id"],
                node["speakerId"],
                BAND,
                variant["japanese"],
                variant["reading"],
                variant["english"],
            ]).encode("utf-8"))
            return {
                "chapterId": chapter["id"],
                "sceneId": scene["id"],
                "lineId": node["id"],
                "speakerId": node["speakerId"],
                "band": BAND,
                "japanese": variant["japanese"],
                "reading": variant["reading"],
                "english": variant["english"],
                "sourceSha256": source_hash,
            }
    raise RuntimeError(f"Canonical line not found: {LINE_ID}")


def assert_installed_cast(engine: str) -> dict[str, Any]:
    models = request_json(engine, "/aivm_models")
    model = models.get(MODEL_UUID)
    manifest = model.get("manifest", {}) if model else {}
    if (
        not model
        or manifest.get("name") != MODEL_NAME
        or manifest.get("version") != MODEL_VERSION
        or manifest.get("uuid") != MODEL_UUID
    ):
        raise RuntimeError("Installed Aivis model does not match the pinned Rie model.")

    speaker = next(
        (item for item in request_json(engine, "/speakers") if item.get("speaker_uuid") == SPEAKER_UUID),
        None,
    )
    style = next(
        (item for item in (speaker or {}).get("styles", []) if int(item.get("id", -1)) == STYLE_ID),
        None,
    )
    if (
        not speaker
        or speaker.get("name") != SPEAKER_NAME
        or not style
        or style.get("name") != STYLE_NAME
    ):
        raise RuntimeError("Installed Aivis speaker/style does not match the pinned Rie cast.")

    model_path = Path(model["file_path"])
    if not model_path.is_file() or model_path.stat().st_size != int(model["file_size"]):
        raise RuntimeError("Pinned Rie model payload is missing or has the wrong size.")
    return {
        "uuid": MODEL_UUID,
        "name": MODEL_NAME,
        "version": MODEL_VERSION,
        "architecture": manifest.get("model_architecture"),
        "format": manifest.get("model_format"),
        "speakerUuid": SPEAKER_UUID,
        "speakerName": SPEAKER_NAME,
        "styleId": STYLE_ID,
        "styleName": STYLE_NAME,
        "payloadBytes": model_path.stat().st_size,
        "payloadSha256": sha256_file(model_path),
        "licenseSha256": sha256_bytes(manifest.get("license", "").encode("utf-8")),
    }


def ffprobe(path: Path) -> dict[str, Any]:
    completed = subprocess.run([
        "ffprobe",
        "-v", "error",
        "-show_entries", "stream=codec_name,sample_rate,channels,channel_layout:format=duration,bit_rate",
        "-of", "json",
        str(path),
    ], check=True, capture_output=True, text=True)
    payload = json.loads(completed.stdout)
    stream = payload["streams"][0]
    media_format = payload["format"]
    return {
        "codec": stream["codec_name"],
        "sampleRate": int(stream["sample_rate"]),
        "channels": int(stream["channels"]),
        "channelLayout": stream.get("channel_layout"),
        "durationSeconds": round(float(media_format["duration"]), 3),
        "bitRate": int(media_format["bit_rate"]),
    }


def pitch_trace(query: dict[str, Any]) -> list[dict[str, Any]]:
    trace: list[dict[str, Any]] = []
    for phrase_index, phrase in enumerate(query.get("accent_phrases", [])):
        for mora_index, mora in enumerate(phrase.get("moras", [])):
            trace.append({
                "accentPhrase": phrase_index,
                "accent": phrase.get("accent"),
                "mora": mora_index,
                "text": mora.get("text"),
                "consonant": mora.get("consonant"),
                "vowel": mora.get("vowel"),
                "pitch": mora.get("pitch"),
            })
    return trace


def main() -> None:
    args = parse_args()
    source = source_line()
    cast = assert_installed_cast(args.engine)
    engine_version = request_json(args.engine, "/version")

    synthesis_text = source["japanese"].replace("Rie", "りえ")
    if synthesis_text == source["japanese"]:
        raise RuntimeError("Expected the canonical Latin display name to require a spoken-form normalization.")
    encoded = urllib.parse.urlencode({"text": synthesis_text, "speaker": STYLE_ID})
    query = request_json(args.engine, f"/audio_query?{encoded}", method="POST", payload={})
    query.update(QUERY_OVERRIDES)
    if len(query.get("accent_phrases", [])) != 3:
        raise RuntimeError("Unexpected accent-phrase segmentation for Rie's introduction.")
    query_bytes = canonical_json_bytes(query)
    wav_bytes = request_bytes(args.engine, f"/synthesis?speaker={STYLE_ID}", query)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
        wav.write(wav_bytes)
        wav.flush()
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", wav.name,
            "-ac", "1", "-ar", "48000",
            "-c:a", "libopus", "-b:a", "64k", "-vbr", "on",
            str(OUTPUT_PATH),
        ], check=True)

    media = ffprobe(OUTPUT_PATH)
    if media["codec"] != "opus" or media["sampleRate"] != 48000 or media["channels"] != 1:
        raise RuntimeError(f"Unexpected rendered media contract: {media}")
    if not 1.0 <= media["durationSeconds"] <= 12.0:
        raise RuntimeError(f"Rendered introduction duration is implausible: {media['durationSeconds']}")

    manifest = {
        "schema": "yomu-academy.rie-introduction-voice.v1",
        "qualityBoundary": (
            "Automated canonical-source, pinned-model, synthesis-query, accent-phrase, "
            "duration, codec, channel, and hash verification; no human-audition claim."
        ),
        "source": {
            "path": SOURCE_RELATIVE.as_posix(),
            "fileSha256": sha256_file(SOURCE_PATH),
            **source,
        },
        "spokenForm": {
            "text": synthesis_text,
            "normalization": "The display name Rie is pronounced as りえ; no other source text changes.",
        },
        "engine": {"name": "AivisSpeech", "version": engine_version},
        "model": cast,
        "synthesis": {
            "queryOverrides": QUERY_OVERRIDES,
            "querySha256": sha256_bytes(query_bytes),
            "audioQuery": query,
            "pitchTrace": pitch_trace(query),
            "wavSha256": sha256_bytes(wav_bytes),
        },
        "asset": {
            "runtimeUrl": f"/{OUTPUT_RELATIVE.relative_to('public').as_posix()}",
            "path": OUTPUT_RELATIVE.as_posix(),
            "sha256": sha256_file(OUTPUT_PATH),
            "bytes": OUTPUT_PATH.stat().st_size,
            **media,
        },
        "objectiveQa": {
            "canonicalLineBound": True,
            "displayAndSpokenFormsSeparated": True,
            "modelAndStylePinned": True,
            "accentPhrasesPreserved": True,
            "deterministicQueryHashed": True,
            "runtimeMediaVerified": True,
        },
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "manifest": str(MANIFEST_PATH.relative_to(ROOT)),
        "asset": str(OUTPUT_PATH.relative_to(ROOT)),
        "sourceSha256": source["sourceSha256"],
        "assetSha256": manifest["asset"]["sha256"],
        "durationSeconds": media["durationSeconds"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
