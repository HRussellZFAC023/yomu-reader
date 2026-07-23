#!/usr/bin/env python3
"""Render and objectively QA the remaining Lesson Zero authored input audio."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import tempfile
import urllib.parse
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT / "public/academy/content/lessons/lesson-zero.v1.json"
CAST_PATH = ROOT / "docs/academy/audio/aivis-cast-models.json"
OUTPUT_DIR = ROOT / "public/academy/audio/lesson-zero"
MANIFEST_PATH = ROOT / "docs/academy/audio/lesson-zero-input-manifest.json"
ENGINE = "http://127.0.0.1:10101"
WHISPER_MODEL = Path("/Users/heru/.cache/whisper-cpp/ggml-small.bin")

helper_spec = importlib.util.spec_from_file_location(
    "yomu_blank_atlas_voice_helpers",
    Path(__file__).with_name("render-blank-atlas-voice.py"),
)
if helper_spec is None or helper_spec.loader is None:
    raise RuntimeError("Could not load the established Yomu voice QA helpers.")
helper = importlib.util.module_from_spec(helper_spec)
helper_spec.loader.exec_module(helper)

LINES = (
    {
        "lineId": "line:lesson-zero-vowel-row",
        "speakerId": "xingyu",
        "group": "vowel",
        "filename": "vowel-row.opus",
        "settings": {"speedScale": 0.84, "pitchScale": 0.0, "intonationScale": 1.03},
    },
    {
        "lineId": "line:lesson-zero-text-sophie",
        "speakerId": "sophie",
        "group": "text",
        "filename": "text-sophie.opus",
        "settings": {"speedScale": 0.93, "pitchScale": 0.0, "intonationScale": 1.03},
    },
    {
        "lineId": "line:lesson-zero-text-ruparna",
        "speakerId": "ruparna",
        "group": "text",
        "filename": "text-ruparna.opus",
        "settings": {"speedScale": 0.93, "pitchScale": -0.01, "intonationScale": 1.04},
    },
    {
        "lineId": "line:lesson-zero-speaking-aakash-introduction",
        "speakerId": "aakash",
        "group": "speaking",
        "filename": "speaking-aakash-introduction.opus",
        "settings": {"speedScale": 0.94, "pitchScale": -0.01, "intonationScale": 1.05},
    },
    {
        "lineId": "line:lesson-zero-speaking-sam",
        "speakerId": "sam",
        "group": "speaking",
        "filename": "speaking-sam.opus",
        "settings": {"speedScale": 0.94, "pitchScale": -0.01, "intonationScale": 1.04},
    },
    {
        "lineId": "line:lesson-zero-speaking-aakash-cue",
        "speakerId": "aakash",
        "group": "speaking",
        "filename": "speaking-aakash-cue.opus",
        "settings": {"speedScale": 0.91, "pitchScale": -0.01, "intonationScale": 1.07},
    },
)

SPOKEN_NAMES = {
    "Sophie": "ソフィー",
    "Ruparna": "ルパルナ",
    "Aakash": "アーカッシュ",
    "Sam": "サム",
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def source_lines(package: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lines: dict[str, dict[str, Any]] = {}
    for script in package["lesson"]["inputScripts"]:
        for line in script.get("lines", []):
            if line["id"] in lines:
                raise RuntimeError(f"Duplicate Lesson Zero line id: {line['id']}")
            lines[line["id"]] = line
    return lines


def spoken_form(text: str) -> tuple[str, str | None]:
    spoken = text
    changed: list[str] = []
    for latin, japanese in SPOKEN_NAMES.items():
        if latin in spoken:
            spoken = spoken.replace(latin, japanese)
            changed.append(f"{latin}={japanese}")
    note = None if not changed else "Display-name pronunciation only: " + ", ".join(changed)
    return spoken, note


def encode_opus(wav_path: Path, output_path: Path) -> None:
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(wav_path), "-ac", "1", "-ar", "48000",
        "-c:a", "libopus", "-b:a", "64k", "-vbr", "on", str(output_path),
    ], check=True)


def combine(group: str, wav_paths: list[Path], temp: Path) -> Path:
    pause = temp / f"{group}-pause.wav"
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "0.58", str(pause),
    ], check=True)
    playlist = temp / f"{group}-concat.txt"
    ordered: list[Path] = []
    for index, wav_path in enumerate(wav_paths):
        if index:
            ordered.append(pause)
        ordered.append(wav_path)
    playlist.write_text("".join(f"file '{path.as_posix()}'\n" for path in ordered), encoding="utf-8")
    output = OUTPUT_DIR / f"{group}-hosts.opus"
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(playlist),
        "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "64k", "-vbr", "on",
        str(output),
    ], check=True)
    return output


def assert_media(media: dict[str, Any], key: str, *, maximum: float) -> None:
    if media["codec"] != "opus" or media["sampleRate"] != 48000 or media["channels"] != 1:
        raise RuntimeError(f"Wrong media contract for {key}: {media}")
    if media["durationSeconds"] < 0.45 or media["durationSeconds"] > maximum:
        raise RuntimeError(f"Implausible duration for {key}: {media['durationSeconds']}")
    if media["maxVolumeDb"] < -20 or media["maxVolumeDb"] > -0.1:
        raise RuntimeError(f"Unsafe loudness for {key}: {media['maxVolumeDb']}dB")


def main() -> None:
    if not WHISPER_MODEL.is_file():
        raise RuntimeError(f"Whisper model is missing: {WHISPER_MODEL}")
    package = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    authored_lines = source_lines(package)
    cast = {entry["speaker"]: entry for entry in json.loads(CAST_PATH.read_text(encoding="utf-8"))}
    models = helper.request_json(ENGINE, "/aivm_models")
    engine_version = helper.request_json(ENGINE, "/version")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, Any]] = []
    grouped_wavs: dict[str, list[Path]] = {"text": [], "speaking": []}

    with tempfile.TemporaryDirectory(prefix="yomu-lesson-zero-input-") as temp_name:
        temp = Path(temp_name)
        for config in LINES:
            line = authored_lines.get(config["lineId"])
            if not line or line["speakerId"] != config["speakerId"]:
                raise RuntimeError(f"Authored speaker binding changed for {config['lineId']}")
            model, speaker, style = helper.find_installed_voice(cast[config["speakerId"]], models)
            style_id = int(style["id"])
            spoken, normalization = spoken_form(line["japanese"])
            encoded = urllib.parse.urlencode({"text": spoken, "speaker": style_id})
            query = helper.request_json(ENGINE, f"/audio_query?{encoded}", method="POST", payload={})
            query.update({
                **config["settings"],
                "volumeScale": 0.78 if config["speakerId"] == "ruparna" else 0.85,
                "prePhonemeLength": 0.12,
                "postPhonemeLength": 0.18,
                "pauseLengthScale": 1.02,
            })
            trace = helper.pitch_trace(query)
            target_reading = helper.query_reading(query)
            wav = temp / f"{config['lineId'].split(':')[-1]}.wav"
            wav.write_bytes(helper.request_bytes(ENGINE, f"/synthesis?speaker={style_id}", query))
            if config["group"] in grouped_wavs:
                grouped_wavs[config["group"]].append(wav)
            output = OUTPUT_DIR / config["filename"]
            encode_opus(wav, output)
            media = helper.probe_media(output)
            assert_media(media, config["lineId"], maximum=24)
            transcript = helper.transcribe(output, WHISPER_MODEL, temp)
            if not transcript:
                raise RuntimeError(f"Whisper returned no Japanese for {config['lineId']}")
            transcript_encoded = urllib.parse.urlencode({"text": transcript, "speaker": style_id})
            transcript_query = helper.request_json(
                ENGINE,
                f"/audio_query?{transcript_encoded}",
                method="POST",
                payload={},
            )
            transcript_reading = helper.query_reading(transcript_query)
            phonetic_similarity = helper.similarity(target_reading, transcript_reading)
            if phonetic_similarity < 0.64:
                raise RuntimeError(
                    f"ASR phonetic gate failed for {config['lineId']}: {phonetic_similarity:.3f}; "
                    f"target={target_reading}; transcript={transcript}; reading={transcript_reading}"
                )
            model_path = Path(model["file_path"])
            manifest = model.get("manifest", {})
            entry = {
                "lineId": config["lineId"],
                "speakerId": config["speakerId"],
                "authoredJapanese": line["japanese"],
                "spokenJapanese": spoken,
                **({"spokenFormNormalization": normalization} if normalization else {}),
                "sourceSha256": sha256_bytes(stable_json(line)),
                "runtimeUrl": f"/academy/audio/lesson-zero/{config['filename']}",
                "assetSha256": helper.sha256_file(output),
                "bytes": output.stat().st_size,
                "model": {
                    "modelUuid": cast[config["speakerId"]]["uuid"],
                    "modelName": manifest.get("name"),
                    "modelVersion": manifest.get("version"),
                    "speakerUuid": speaker.get("speaker_uuid"),
                    "speakerName": speaker.get("name"),
                    "styleId": style_id,
                    "styleName": style.get("name"),
                    "payloadSha256": helper.sha256_file(model_path),
                },
                "queryOverrides": query | {},
                "querySha256": sha256_bytes(stable_json(query)),
                "pitchTrace": trace,
                "media": media,
                "whisper": {
                    "model": WHISPER_MODEL.name,
                    "transcript": transcript,
                    "targetPhoneticReading": target_reading,
                    "transcriptPhoneticReading": transcript_reading,
                    "phoneticSimilarity": round(phonetic_similarity, 3),
                    "minimumSimilarity": 0.64,
                    "passed": True,
                },
                "verdict": "pass",
            }
            # Keep the manifest reviewable: settings and pitch are retained, but the full engine query is hashed.
            entry["queryOverrides"] = {
                key: query[key]
                for key in (
                    "speedScale", "pitchScale", "intonationScale", "volumeScale",
                    "prePhonemeLength", "postPhonemeLength", "pauseLengthScale",
                )
            }
            entries.append(entry)
            print(f"pass {config['lineId']} ({media['durationSeconds']}s, ASR {phonetic_similarity:.3f})")

        aggregates: list[dict[str, Any]] = []
        for group, wav_paths in grouped_wavs.items():
            output = combine(group, wav_paths, temp)
            media = helper.probe_media(output)
            assert_media(media, f"{group}-hosts", maximum=55)
            aggregates.append({
                "assetId": f"audio:lesson-zero-{group}-hosts",
                "runtimeUrl": f"/academy/audio/lesson-zero/{group}-hosts.opus",
                "lineIds": [entry["lineId"] for entry in entries if next(
                    config for config in LINES if config["lineId"] == entry["lineId"]
                )["group"] == group],
                "pauseMs": 580,
                "assetSha256": helper.sha256_file(output),
                "bytes": output.stat().st_size,
                "media": media,
                "verdict": "pass",
            })

    manifest = {
        "schema": "yomu-academy.lesson-zero-input-voice-qa.v1",
        "qualityBoundary": (
            "Codex objective QA: exact authored line and speaker binding, pinned Aivis model and style, "
            "accent/mora trace, Opus shape, duration, loudness, hash, and independent Japanese Whisper "
            "phonetic comparison. No human-audition claim."
        ),
        "source": {"path": SOURCE_PATH.relative_to(ROOT).as_posix(), "sha256": helper.sha256_file(SOURCE_PATH)},
        "engine": {"name": "AivisSpeech Engine", "version": engine_version},
        "whisper": {"model": WHISPER_MODEL.name, "sha256": helper.sha256_file(WHISPER_MODEL)},
        "complete": all(entry["verdict"] == "pass" for entry in entries + aggregates),
        "entries": entries,
        "aggregates": aggregates,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(MANIFEST_PATH), "lines": len(entries), "aggregates": len(aggregates)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
