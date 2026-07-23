#!/usr/bin/env python3
"""Render the two Lesson Zero sound-mission lines through local AivisSpeech."""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
ENGINE = "http://127.0.0.1:10101"
OUTPUT_DIR = ROOT / "public/academy/audio/lesson-zero"
MANIFEST_PATH = ROOT / "docs/academy/audio/lesson-zero-sound-manifest.json"

LINES = (
    {
        "id": "line:lesson-zero-sound-xingyu",
        "assetId": "audio:lesson-zero-sound-xingyu",
        "filename": "sound-xingyu.opus",
        "text": "はじめまして。シンユです。",
        "modelUuid": "e9339137-2ae3-4d41-9394-fb757a7e61e6",
        "speakerUuid": "41b7785f-35cc-4089-a360-dd8a63da5e75",
        "speakerName": "まい",
        "styleId": 1431611904,
        "styleName": "ノーマル",
        "queryOverrides": {
            "speedScale": 1.02,
            "pitchScale": 0.01,
            "intonationScale": 1.08,
            "volumeScale": 0.85,
            "prePhonemeLength": 0.10,
            "postPhonemeLength": 0.16,
        },
    },
    {
        "id": "line:lesson-zero-sound-mika",
        "assetId": "audio:lesson-zero-sound-mika",
        "filename": "sound-mika.opus",
        "text": "ミカです。よろしくお願いします。",
        "modelUuid": "47e53151-a378-46f3-abee-ce13aa07feb1",
        "speakerUuid": "561e4e59-3bc9-4726-9028-44a3c12a6f1d",
        "speakerName": "阿井田 茂",
        "styleId": 1310138977,
        "styleName": "Calm",
        "queryOverrides": {
            "speedScale": 0.94,
            "pitchScale": -0.02,
            "intonationScale": 0.95,
            "volumeScale": 0.82,
            "prePhonemeLength": 0.14,
            "postPhonemeLength": 0.20,
        },
    },
)


def request_json(path: str, *, body: dict[str, Any] | None = None) -> Any:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{ENGINE}{path}",
        data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def request_bytes(path: str, body: dict[str, Any]) -> bytes:
    request = urllib.request.Request(
        f"{ENGINE}{path}",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def model_catalog() -> dict[int, tuple[str, str, str, str]]:
    model_by_speaker: dict[str, str] = {}
    for model_uuid, model in request_json("/aivm_models").items():
        for speaker in model.get("manifest", {}).get("speakers", []):
            model_by_speaker[speaker["uuid"]] = model_uuid
    catalog: dict[int, tuple[str, str, str, str]] = {}
    for speaker in request_json("/speakers"):
        for style in speaker["styles"]:
            speaker_uuid = speaker["speaker_uuid"]
            catalog[int(style["id"])] = (
                model_by_speaker.get(speaker_uuid, ""),
                speaker_uuid,
                speaker["name"],
                style["name"],
            )
    return catalog


def pitch_trace(query: dict[str, Any]) -> list[dict[str, Any]]:
    trace: list[dict[str, Any]] = []
    for phrase_index, phrase in enumerate(query.get("accent_phrases", [])):
        for mora in phrase.get("moras", []):
            trace.append({
                "phrase": phrase_index,
                "text": mora.get("text"),
                "consonant": mora.get("consonant"),
                "vowel": mora.get("vowel"),
                "pitch": mora.get("pitch"),
            })
    return trace


def encode_opus(wav_path: Path, opus_path: Path) -> None:
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(wav_path), "-c:a", "libopus", "-b:a", "64k", "-vbr", "on", str(opus_path),
    ], check=True)


def duration_seconds(path: Path) -> float:
    completed = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], check=True, capture_output=True, text=True)
    return round(float(completed.stdout.strip()), 3)


def combine_audio(inputs: list[Path], output: Path, pause_ms: int = 650) -> None:
    pause_seconds = pause_ms / 1000
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(inputs[0]), "-i", str(inputs[1]),
        "-filter_complex",
        (
            "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono[first];"
            f"anullsrc=r=48000:cl=mono,atrim=duration={pause_seconds}[pause];"
            "[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono[second];"
            "[first][pause][second]concat=n=3:v=0:a=1[out]"
        ),
        "-map", "[out]", "-c:a", "libopus", "-b:a", "64k", "-vbr", "on", str(output),
    ], check=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    catalog = model_catalog()
    engine_version = request_json("/version")
    rendered: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="yomu-lesson-zero-sound-") as temp_name:
        temp = Path(temp_name)
        wav_paths: list[Path] = []
        for line in LINES:
            expected = (line["modelUuid"], line["speakerUuid"], line["speakerName"], line["styleName"])
            if catalog.get(line["styleId"]) != expected:
                raise RuntimeError(f"Installed Aivis style does not match pinned cast for {line['id']}.")
            encoded_text = urllib.parse.urlencode({"text": line["text"], "speaker": line["styleId"]})
            query = request_json(f"/audio_query?{encoded_text}", body={})
            query.update(line["queryOverrides"])
            query_bytes = json.dumps(query, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            wav_bytes = request_bytes(f"/synthesis?speaker={line['styleId']}", query)
            wav_path = temp / f"{line['id'].split('-')[-1]}.wav"
            wav_path.write_bytes(wav_bytes)
            wav_paths.append(wav_path)
            opus_path = OUTPUT_DIR / line["filename"]
            encode_opus(wav_path, opus_path)
            rendered.append({
                "lineId": line["id"],
                "assetId": line["assetId"],
                "text": line["text"],
                "modelUuid": line["modelUuid"],
                "speakerUuid": line["speakerUuid"],
                "speakerName": line["speakerName"],
                "styleId": line["styleId"],
                "styleName": line["styleName"],
                "queryOverrides": line["queryOverrides"],
                "querySha256": sha256_bytes(query_bytes),
                "pitchTrace": pitch_trace(query),
                "runtimeUrl": f"/academy/audio/lesson-zero/{line['filename']}",
                "fileSha256": sha256_file(opus_path),
                "bytes": opus_path.stat().st_size,
                "durationSeconds": duration_seconds(opus_path),
            })
        combined_opus = OUTPUT_DIR / "sound-hosts.opus"
        combine_audio(wav_paths, combined_opus)
    manifest = {
        "schemaVersion": 1,
        "engine": {"name": "AivisSpeech", "version": engine_version},
        "qualityBoundary": "Automated model, text, accent-query, duration, and hash verification; no human-audition claim.",
        "lines": rendered,
        "combined": {
            "assetId": "audio:lesson-zero-sound-hosts",
            "runtimeUrl": "/academy/audio/lesson-zero/sound-hosts.opus",
            "pauseMs": 650,
            "fileSha256": sha256_file(combined_opus),
            "bytes": combined_opus.stat().st_size,
            "durationSeconds": duration_seconds(combined_opus),
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(MANIFEST_PATH), "lines": len(rendered)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
