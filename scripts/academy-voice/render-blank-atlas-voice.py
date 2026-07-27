#!/usr/bin/env python3
"""Render and objectively QA every voiced variant in The Blank Atlas."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SOURCE_RELATIVE = Path("src/academy/content/story-sources/s1e01-the-blank-atlas.v2.json")
SOURCE_PATH = ROOT / SOURCE_RELATIVE
CAST_PATH = ROOT / "docs/academy/audio/aivis-cast-models.json"
LOCKS_PATH = ROOT / "docs/academy/audio/voice-line-locks.json"
MANIFEST_RELATIVE = Path("docs/academy/audio/blank-atlas-voice-manifest.json")
MANIFEST_PATH = ROOT / MANIFEST_RELATIVE
PLAYBACK_PATH = ROOT / "public/academy/audio/story-voice-playback.json"
OUTPUT_ROOT = ROOT / "public/academy/audio/story-lines"
BUILDER = ROOT / "scripts/academy-voice/build-voice-production-manifest.mjs"
CHAPTER_ID = "s1e01-the-blank-atlas"

STYLE_BY_SPEAKER = {
    "rie": "ノーマル",
    "xingyu": "ノーマル",
    "mika": "ノーマル",
    "sophie": "おちつき",
    "ruparna": "ノーマル",
    "sam": "ノーマル",
    "aakash": "ノーマル",
}

PITCH_BY_SPEAKER = {
    "rie": -0.01,
    "xingyu": 0.0,
    "mika": -0.015,
    "sophie": 0.0,
    "ruparna": -0.01,
    "sam": -0.01,
    "aakash": -0.01,
}

VOLUME_BY_SPEAKER = {
    "ruparna": 0.72,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="http://127.0.0.1:10101")
    parser.add_argument(
        "--whisper-model",
        default="/Users/heru/.cache/whisper-cpp/ggml-small.bin",
    )
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument(
        "--line-id",
        action="append",
        dest="line_ids",
        default=[],
        help="Render only this authored line ID. Repeat for more than one line.",
    )
    return parser.parse_args()


def request_json(
    engine: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout: int = 300,
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


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def source_hash(source: dict[str, Any], scene: dict[str, Any], node: dict[str, Any], band: str) -> str:
    variant = node["variants"][band]
    return sha256_bytes("\n".join([
        source["id"],
        scene["id"],
        node.get("speakerId", ""),
        band,
        variant["japanese"],
        variant["reading"],
        variant["english"],
    ]).encode("utf-8"))


def settings_for(line_id: str, speaker: str, band: str) -> dict[str, float]:
    speed = 0.94 if band == "foundation" else 0.98
    intonation = 1.04
    pause = 1.02 if band == "foundation" else 0.98
    if line_id.endswith("rie-too-fast"):
        speed = 1.02
        intonation = 1.07
    elif line_id.endswith("rie-repetition-works"):
        speed = 0.91 if band == "foundation" else 0.95
        pause = 1.06
    elif line_id.endswith("rie-open-choice"):
        speed = 0.93 if band == "foundation" else 0.96
        pause = 1.05
    elif speaker != "rie":
        intonation = 1.06
    return {
        "speedScale": speed,
        "pitchScale": PITCH_BY_SPEAKER[speaker],
        "intonationScale": intonation,
        "volumeScale": VOLUME_BY_SPEAKER.get(speaker, 0.86),
        "prePhonemeLength": 0.12,
        "postPhonemeLength": 0.18,
        "pauseLengthScale": pause,
    }


def spoken_form(text: str, line_id: str) -> tuple[str, str | None]:
    normalized = text.replace("Rie", "りえ")
    notes: list[str] = []
    if normalized != text:
        notes.append("The display name Rie is pronounced as りえ.")
    if line_id == "line:blank-atlas:rie-hiragana-route":
        normalized = normalized.replace("ひらがな", "平仮名")
        notes.append("The spoken form uses the standard kanji spelling 平仮名 to stabilize the same reading.")
    if normalized == text:
        return text, None
    return normalized, " ".join(notes)


def find_installed_voice(
    cast_entry: dict[str, Any],
    models: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    model_uuid = cast_entry.get("uuid")
    model = models.get(model_uuid)
    if not model:
        raise RuntimeError(f"Pinned model is not installed for {cast_entry['speaker']}: {model_uuid}")
    installed_speakers = model.get("speakers") or []
    if len(installed_speakers) != 1:
        raise RuntimeError(f"Expected one installed speaker for {cast_entry['speaker']}")
    speaker = installed_speakers[0].get("speaker") or {}
    expected_style = STYLE_BY_SPEAKER[cast_entry["speaker"]]
    style = next((item for item in speaker.get("styles", []) if item.get("name") == expected_style), None)
    if not style:
        raise RuntimeError(
            f"Pinned style {expected_style} is missing for {cast_entry['speaker']} ({speaker.get('name')})"
        )
    return model, speaker, style


def pitch_trace(query: dict[str, Any]) -> list[dict[str, Any]]:
    trace: list[dict[str, Any]] = []
    phrases = query.get("accent_phrases", query.get("accentPhrases", []))
    for phrase_index, phrase in enumerate(phrases):
        moras = phrase.get("moras", [])
        accent = phrase.get("accent")
        if not isinstance(accent, int) or accent < 0 or accent > len(moras):
            raise RuntimeError(f"Invalid accent nucleus in phrase {phrase_index}: {accent}")
        for mora_index, mora in enumerate(moras):
            trace.append({
                "accentPhrase": phrase_index,
                "accent": accent,
                "mora": mora_index,
                "text": mora.get("text"),
                "consonant": mora.get("consonant"),
                "consonantLength": mora.get("consonant_length"),
                "vowel": mora.get("vowel"),
                "vowelLength": mora.get("vowel_length"),
                "pitch": mora.get("pitch"),
            })
    if not trace:
        raise RuntimeError("Aivis returned no accent-phrase mora trace.")
    return trace


def query_reading(query: dict[str, Any]) -> str:
    phrases = query.get("accent_phrases", query.get("accentPhrases", []))
    text = "".join(
        str(mora.get("text", ""))
        for phrase in phrases
        for mora in phrase.get("moras", [])
    )
    return normalize_kana(text)


def normalize_kana(value: str) -> str:
    normalized: list[str] = []
    for character in value:
        codepoint = ord(character)
        if 0x30A1 <= codepoint <= 0x30F6:
            normalized.append(chr(codepoint - 0x60))
        elif character in "ーゔぁぃぅぇぉゃゅょっゎかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ":
            normalized.append(character)
    return "".join(normalized)


def levenshtein(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(min(
                current[-1] + 1,
                previous[right_index] + 1,
                previous[right_index - 1] + (left_character != right_character),
            ))
        previous = current
    return previous[-1]


def similarity(left: str, right: str) -> float:
    longest = max(len(left), len(right), 1)
    return 1.0 - (levenshtein(left, right) / longest)


def probe_media(path: Path) -> dict[str, Any]:
    probe = json.loads(subprocess.run([
        "ffprobe", "-v", "error",
        "-show_entries", "stream=codec_name,sample_rate,channels:format=duration,bit_rate",
        "-of", "json", str(path),
    ], check=True, capture_output=True, text=True).stdout)
    volume = subprocess.run([
        "ffmpeg", "-hide_banner", "-i", str(path),
        "-af", "volumedetect", "-f", "null", "-",
    ], capture_output=True, text=True)
    if volume.returncode != 0:
        raise RuntimeError(f"ffmpeg loudness probe failed for {path.name}")
    max_volume = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", volume.stderr)
    mean_volume = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", volume.stderr)
    if not max_volume or not mean_volume:
        raise RuntimeError(f"ffmpeg returned no loudness evidence for {path.name}")
    stream = probe["streams"][0]
    media_format = probe["format"]
    return {
        "codec": stream["codec_name"],
        "sampleRate": int(stream["sample_rate"]),
        "channels": int(stream["channels"]),
        "durationSeconds": round(float(media_format["duration"]), 3),
        "bitRate": int(media_format["bit_rate"]),
        "meanVolumeDb": float(mean_volume.group(1)),
        "maxVolumeDb": float(max_volume.group(1)),
    }


def transcribe(path: Path, whisper_model: Path, temp: Path) -> str:
    wav_path = temp / f"{path.stem}.wav"
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(path),
        "-ar", "16000", "-ac", "1", str(wav_path),
    ], check=True)
    output = subprocess.run([
        "whisper-cli", "-m", str(whisper_model), "-l", "ja", "-nt", "-np", str(wav_path),
    ], check=True, capture_output=True, text=True).stdout
    return re.sub(r"\s+", "", output).strip()


def main() -> None:
    args = parse_args()
    whisper_model = Path(args.whisper_model)
    if not whisper_model.is_file():
        raise RuntimeError(f"Whisper model is missing: {whisper_model}")
    source = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    if source.get("id") != CHAPTER_ID:
        raise RuntimeError(f"Unexpected Chapter 1 source id: {source.get('id')}")
    all_line_nodes = [
        node
        for scene in source["scenes"]
        for node in scene["nodes"]
        if node.get("kind") == "line"
    ]
    requested_line_ids = set(args.line_ids)
    known_line_ids = {node["id"] for node in all_line_nodes}
    unknown_line_ids = requested_line_ids.difference(known_line_ids)
    if unknown_line_ids:
        raise RuntimeError(f"Unknown Chapter 1 line IDs: {sorted(unknown_line_ids)}")
    selected_line_nodes = [
        node
        for node in all_line_nodes
        if not requested_line_ids or node["id"] in requested_line_ids
    ]
    cast = {entry["speaker"]: entry for entry in json.loads(CAST_PATH.read_text(encoding="utf-8"))}
    engine_version = request_json(args.engine, "/version")
    models = request_json(args.engine, "/aivm_models")

    required_speakers = {
        node["speakerId"] for node in selected_line_nodes
    }
    missing_cast = required_speakers.difference(cast)
    if missing_cast:
        raise RuntimeError(f"Chapter 1 speakers have no cast entry: {sorted(missing_cast)}")

    installed: dict[str, dict[str, Any]] = {}
    for speaker_id in sorted(required_speakers):
        model, speaker, style = find_installed_voice(cast[speaker_id], models)
        model_path = Path(model["file_path"])
        manifest = model.get("manifest", {})
        installed[speaker_id] = {
            "model": model,
            "speaker": speaker,
            "style": style,
            "evidence": {
                "modelUuid": cast[speaker_id]["uuid"],
                "modelName": manifest.get("name"),
                "modelVersion": manifest.get("version"),
                "speakerUuid": speaker.get("speaker_uuid"),
                "speakerName": speaker.get("name"),
                "styleId": style.get("id"),
                "styleName": style.get("name"),
                "payloadBytes": model_path.stat().st_size,
                "payloadSha256": sha256_file(model_path),
                "licenseSha256": sha256_bytes(str(manifest.get("license", "")).encode("utf-8")),
            },
        }

    results: list[dict[str, Any]] = []
    locks = json.loads(LOCKS_PATH.read_text(encoding="utf-8"))
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="yomu-blank-atlas-voice-") as temp_name:
        temp = Path(temp_name)
        for scene in source["scenes"]:
            for node in scene["nodes"]:
                if node.get("kind") != "line":
                    continue
                if requested_line_ids and node["id"] not in requested_line_ids:
                    continue
                speaker_id = node["speakerId"]
                voice = installed[speaker_id]
                style_id = int(voice["style"]["id"])
                for band, variant in node.get("variants", {}).items():
                    key = f"{node['id']}::{band}"
                    line_slug = node["id"].split(":")[-1]
                    filename = f"{CHAPTER_ID}__{line_slug}__{speaker_id}__{band}.opus"
                    output_path = OUTPUT_ROOT / filename
                    runtime_url = f"/academy/audio/story-lines/{filename}"
                    source_sha = source_hash(source, scene, node, band)
                    text, normalization = spoken_form(variant["japanese"], node["id"])
                    settings = settings_for(node["id"], speaker_id, band)

                    encoded = urllib.parse.urlencode({"text": text, "speaker": style_id})
                    query = request_json(args.engine, f"/audio_query?{encoded}", method="POST", payload={})
                    query.update(settings)
                    trace = pitch_trace(query)
                    target_reading = query_reading(query)
                    if len(target_reading) < 3:
                        raise RuntimeError(f"Implausibly short phonetic target for {key}: {target_reading}")

                    if args.overwrite or not output_path.exists():
                        wav_bytes = request_bytes(args.engine, f"/synthesis?speaker={style_id}", query)
                        wav_path = temp / f"{filename}.wav"
                        wav_path.write_bytes(wav_bytes)
                        subprocess.run([
                            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                            "-i", str(wav_path), "-ac", "1", "-ar", "48000",
                            "-c:a", "libopus", "-b:a", "64k", "-vbr", "on",
                            str(output_path),
                        ], check=True)

                    media = probe_media(output_path)
                    if media["codec"] != "opus" or media["sampleRate"] != 48000 or media["channels"] != 1:
                        raise RuntimeError(f"Wrong media contract for {key}: {media}")
                    if media["durationSeconds"] < 0.55 or media["durationSeconds"] > 20:
                        raise RuntimeError(f"Implausible duration for {key}: {media['durationSeconds']}")
                    if media["maxVolumeDb"] < -18 or media["maxVolumeDb"] > -0.1:
                        raise RuntimeError(f"Unsafe loudness for {key}: {media['maxVolumeDb']}dB")

                    transcript = transcribe(output_path, whisper_model, temp)
                    if not transcript:
                        raise RuntimeError(f"Whisper returned no Japanese for {key}")
                    transcript_encoded = urllib.parse.urlencode({"text": transcript, "speaker": style_id})
                    transcript_query = request_json(
                        args.engine,
                        f"/audio_query?{transcript_encoded}",
                        method="POST",
                        payload={},
                    )
                    transcript_reading = query_reading(transcript_query)
                    asr_similarity = similarity(target_reading, transcript_reading)
                    if asr_similarity < 0.68:
                        raise RuntimeError(
                            f"ASR phonetic gate failed for {key}: {asr_similarity:.3f}; "
                            f"target={target_reading}; transcript={transcript}; reading={transcript_reading}"
                        )

                    entry = {
                        "key": key,
                        "sceneId": scene["id"],
                        "lineId": node["id"],
                        "speakerId": speaker_id,
                        "band": band,
                        "japanese": variant["japanese"],
                        "spokenJapanese": text,
                        **({"spokenFormNormalization": normalization} if normalization else {}),
                        "sourceSha256": source_sha,
                        "output": runtime_url,
                        "assetSha256": sha256_file(output_path),
                        "bytes": output_path.stat().st_size,
                        "model": voice["evidence"],
                        "queryOverrides": settings,
                        "querySha256": sha256_bytes(stable_json(query)),
                        "accentPhraseCount": len(query.get("accent_phrases", [])),
                        "pitchTrace": trace,
                        "media": media,
                        "whisper": {
                            "model": whisper_model.name,
                            "transcript": transcript,
                            "targetPhoneticReading": target_reading,
                            "transcriptPhoneticReading": transcript_reading,
                            "phoneticSimilarity": round(asr_similarity, 3),
                            "minimumSimilarity": 0.68,
                            "passed": True,
                        },
                        "verdict": "pass",
                    }
                    results.append(entry)
                    locks[key] = {
                        "status": "locked",
                        "sourceSha256": source_sha,
                        "output": runtime_url,
                        "pitch": {
                            "status": "rendered",
                            "manualReview": "codex-objective-qa",
                            "evidence": MANIFEST_RELATIVE.as_posix(),
                            "queryOverrides": settings,
                        },
                    }
                    print(f"pass {key} ({speaker_id}, {media['durationSeconds']}s, ASR {asr_similarity:.3f})")

    expected_count = sum(len(node.get("variants", {})) for node in selected_line_nodes)
    if len(results) != expected_count:
        raise RuntimeError(f"Expected {expected_count} selected voice variants, rendered {len(results)}")

    existing_manifest = (
        json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if requested_line_ids and MANIFEST_PATH.is_file()
        else {}
    )
    entries_by_key = {
        entry["key"]: entry
        for entry in existing_manifest.get("entries", [])
        if entry.get("lineId") not in requested_line_ids
    }
    entries_by_key.update({entry["key"]: entry for entry in results})
    expected_keys = [
        f"{node['id']}::{band}"
        for node in all_line_nodes
        for band in node.get("variants", {})
    ]
    manifest_entries = [
        entries_by_key[key]
        for key in expected_keys
        if key in entries_by_key
    ]
    manifest_speakers = {
        **existing_manifest.get("speakers", {}),
        **{speaker: installed[speaker]["evidence"] for speaker in sorted(installed)},
    }

    manifest = {
        "schema": "yomu-academy.blank-atlas-voice-qa.v1",
        "qualityBoundary": (
            "Codex objective QA: exact authored source, pinned Aivis model and style, full accent-phrase "
            "and mora trace, render-time delivery controls, Opus media shape, duration, loudness, hash, "
            "and independent Japanese Whisper phonetic comparison. No human-audition claim."
        ),
        "source": {
            "path": SOURCE_RELATIVE.as_posix(),
            "revision": source.get("revision"),
            "sha256": sha256_file(SOURCE_PATH),
        },
        "engine": {"name": "AivisSpeech Engine", "version": engine_version},
        "whisper": {
            "executable": "whisper-cli",
            "model": whisper_model.name,
            "modelSha256": sha256_file(whisper_model),
            "language": "ja",
        },
        "speakers": manifest_speakers,
        "complete": (
            len(manifest_entries) == len(expected_keys)
            and all(entry["verdict"] == "pass" for entry in manifest_entries)
        ),
        "entries": manifest_entries,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    LOCKS_PATH.write_text(json.dumps(locks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    subprocess.run(["node", str(BUILDER)], cwd=ROOT, check=True)

    playback = json.loads(PLAYBACK_PATH.read_text(encoding="utf-8"))
    chapter_playback = [entry for entry in playback["entries"] if entry["lineId"].startswith("line:blank-atlas:")]
    chapter_expected_count = len(expected_keys)
    if len(chapter_playback) != chapter_expected_count:
        raise RuntimeError(
            f"Playback catalog contains {len(chapter_playback)} of "
            f"{chapter_expected_count} Chapter 1 variants"
        )
    print(json.dumps({
        "manifest": MANIFEST_RELATIVE.as_posix(),
        "renderedEntries": len(results),
        "manifestEntries": len(manifest_entries),
        "playbackEntries": len(chapter_playback),
        "renderedSpeakers": sorted(required_speakers),
        "complete": manifest["complete"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
