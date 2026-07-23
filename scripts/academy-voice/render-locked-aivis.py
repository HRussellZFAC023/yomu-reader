#!/usr/bin/env python3
"""Render only current, hash-locked Academy lines through AivisSpeech."""

import argparse
import json
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "academy" / "audio"
AUDIO = ROOT / "public" / "academy" / "audio"
MANIFEST = DOCS / "voice-production-manifest.json"
BUILDER = Path(__file__).with_name("build-voice-production-manifest.mjs")
QUERY_FIELDS = {
    "speedScale",
    "pitchScale",
    "intonationScale",
    "volumeScale",
    "prePhonemeLength",
    "postPhonemeLength",
    "pauseLengthScale",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="http://127.0.0.1:10101")
    parser.add_argument("--key", action="append", default=[])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--keep-wav", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--no-refresh", action="store_true")
    return parser.parse_args()


def request_json(engine, path, method="GET", payload=None, timeout=180):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        engine + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def request_bytes(engine, path, payload, timeout=300):
    request = urllib.request.Request(
        engine + path,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def resolve_style_ids(engine):
    models = request_json(engine, "/aivm_models")
    speakers = request_json(engine, "/speakers")
    resolved = {}
    for model_uuid, model in models.items():
        direct = next(
            (speaker for speaker in speakers if speaker.get("speaker_uuid") == model_uuid),
            None,
        )
        if direct and direct.get("styles"):
            resolved[model_uuid] = direct["styles"][0]["id"]
            continue
        model_name = model.get("manifest", {}).get("name", "")
        named = next(
            (
                speaker
                for speaker in speakers
                if speaker.get("name")
                and (speaker["name"] in model_name or model_name in speaker["name"])
            ),
            None,
        )
        if named and named.get("styles"):
            resolved[model_uuid] = named["styles"][0]["id"]
    return resolved


def apply_pitch_review(query, review):
    for field, value in review.get("queryOverrides", {}).items():
        if field not in QUERY_FIELDS:
            raise ValueError(f"unsupported query override: {field}")
        query[field] = float(value)

    phrases = query.get("accent_phrases", query.get("accentPhrases", []))
    for override in review.get("moraOverrides", []):
        phrase = phrases[int(override["accentPhrase"])]
        mora = phrase["moras"][int(override["mora"])]
        for field in ("pitch", "vowel_length", "consonant_length"):
            if field in override:
                mora[field] = float(override[field])
    return query


def output_path(entry):
    runtime_output = entry.get("output") or entry.get("pilotOutput")
    if runtime_output and runtime_output.startswith("/academy/audio/"):
        relative = runtime_output.removeprefix("/academy/audio/")
    else:
        line = entry["lineId"].split(":")[-1]
        relative = (
            f"story-lines/{entry['chapterId']}__{line}__"
            f"{entry['speakerId']}__{entry['band']}.opus"
        )
    output = (AUDIO / relative).resolve()
    if AUDIO.resolve() not in output.parents:
        raise ValueError(f"output escaped audio root: {output}")
    return output


def main():
    args = parse_args()
    if not args.no_refresh:
        subprocess.run(["node", str(BUILDER)], cwd=ROOT, check=True)

    manifest = json.loads(MANIFEST.read_text())
    selected = [entry for entry in manifest["entries"] if entry.get("status") == "locked"]
    if args.key:
        wanted = set(args.key)
        selected = [entry for entry in selected if entry["key"] in wanted]
        missing = wanted.difference(entry["key"] for entry in selected)
        if missing:
            raise SystemExit(f"not current and locked: {', '.join(sorted(missing))}")

    jobs = []
    for entry in selected:
        model = entry.get("voiceModel") or {}
        if not model.get("uuid"):
            raise SystemExit(f"locked line has no voice model: {entry['key']}")
        jobs.append((entry, output_path(entry)))

    if args.dry_run:
        print(json.dumps({
            "locked": len(jobs),
            "jobs": [{"key": entry["key"], "output": str(output)} for entry, output in jobs],
        }, indent=2))
        return

    style_by_uuid = resolve_style_ids(args.engine)
    rendered = 0
    skipped = 0
    for entry, output in jobs:
        if output.exists() and not args.overwrite:
            skipped += 1
            print(f"keep {entry['key']} -> {output.relative_to(ROOT)}")
            continue
        model_uuid = entry["voiceModel"]["uuid"]
        style_id = style_by_uuid.get(model_uuid)
        if style_id is None:
            raise SystemExit(f"model is not installed or matched: {model_uuid} ({entry['key']})")

        encoded = urllib.parse.urlencode({"text": entry["japanese"], "speaker": style_id})
        query = request_json(args.engine, f"/audio_query?{encoded}", method="POST")
        query = apply_pitch_review(query, entry.get("pitch") or {})
        wav = request_bytes(args.engine, f"/synthesis?speaker={style_id}", query)
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(suffix=".wav") as temporary:
            temporary.write(wav)
            temporary.flush()
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error", "-i", temporary.name,
                    "-c:a", "libopus", "-b:a", "48k", str(output),
                ],
                check=True,
            )
            if args.keep_wav:
                output.with_suffix(".wav").write_bytes(wav)
        rendered += 1
        print(f"render {entry['key']} -> {output.relative_to(ROOT)}")

    print(json.dumps({"selected": len(jobs), "rendered": rendered, "kept": skipped}))


if __name__ == "__main__":
    main()
