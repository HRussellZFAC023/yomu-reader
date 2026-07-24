#!/usr/bin/env python3
"""Validate or stage deterministic AivisSpeech learning-voice renders."""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLAN_PATH = ROOT / "docs" / "academy" / "audio" / "learning-voice-production.json"
QUERY_EVIDENCE_PATH = ROOT / "docs" / "academy" / "audio" / "learning-voice-query-evidence.json"
MODEL_EVIDENCE_PATH = ROOT / "docs" / "academy" / "audio" / "learning-voice-model-evidence.json"
CATALOG_PATH = ROOT / "public" / "academy" / "audio" / "learning-voice-playback.json"
MIRROR_CATALOG_PATH = ROOT / "docs" / "public" / "academy" / "audio" / "learning-voice-playback.json"
STAGING_AUDIO = ROOT / "qa-artifacts" / "academy-learning-voice" / "staging" / "audio"
QUERY_FIELDS = {
    "speedScale",
    "pitchScale",
    "intonationScale",
    "volumeScale",
    "prePhonemeLength",
    "postPhonemeLength",
    "pauseLengthScale",
}
MORA_FIELDS = {"accentPhrase", "mora", "pitch", "vowel_length", "consonant_length"}
SHA256 = re.compile(r"^[a-f0-9]{64}$")
MODEL_UUID = re.compile(r"^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$")
LINE_ID = re.compile(r"^[a-z0-9][a-z0-9._:-]*$")
SUPPORTED_MODEL_LICENSES = {"ACML-1.0", "CC-BY-SA-4.0"}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="http://127.0.0.1:10101")
    parser.add_argument("--plan", type=Path, default=PLAN_PATH)
    parser.add_argument("--query-evidence", type=Path, default=QUERY_EVIDENCE_PATH)
    parser.add_argument("--model-evidence", type=Path, default=MODEL_EVIDENCE_PATH)
    parser.add_argument("--catalog", type=Path, default=CATALOG_PATH)
    parser.add_argument("--mirror-catalog", type=Path, default=MIRROR_CATALOG_PATH)
    parser.add_argument("--staging-audio", type=Path, default=STAGING_AUDIO)
    parser.add_argument("--render-staging", action="store_true")
    parser.add_argument("--archive-query-evidence", action="store_true")
    parser.add_argument("--fill-pending-contract", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def read_json(path):
    return json.loads(path.read_text())


def cache_payload(plan, entry, mapping):
    identity = entry["identity"]
    render_identity = {
        "voiceLineId": identity["voiceLineId"],
        "speakerId": identity["speakerId"],
        "intent": identity["intent"],
        "locale": identity["locale"],
        "sourceRevision": identity["sourceRevision"],
        "bindingIds": identity["bindingIds"],
    }
    return {
        "schema": plan["render"]["schema"],
        "engine": {
            "name": plan["render"]["engine"]["name"],
            "version": plan["render"]["engine"]["version"],
        },
        "modelUuid": mapping["modelUuid"],
        "modelVersion": mapping["modelVersion"],
        "modelPayloadSha256": mapping["modelPayloadSha256"],
        "styleId": mapping["styleId"],
        "styleName": mapping["styleName"],
        "japanese": entry["japanese"],
        "identity": render_identity,
        "bindings": entry["bindings"],
        "queryOverrides": entry["queryOverrides"],
        "moraOverrides": entry.get("moraOverrides", []),
        "audioQuerySha256": entry["audioQuerySha256"],
        "encoder": plan["render"]["encoder"],
    }


def deterministic_cache_key(plan, entry, mapping):
    return sha256_bytes(canonical_json(cache_payload(plan, entry, mapping)).encode("utf-8"))


def validate_plan(plan):
    require(plan.get("schema") == "yomu-academy.learning-voice-production.v2", "unexpected production schema")
    require(LINE_ID.fullmatch(plan.get("batchId", "")), "invalid learning voice batch id")
    quality = plan.get("qualityApproval", {})
    require(quality.get("codexQualityAccepted") is True, "Codex output-quality acceptance is missing")
    require(quality.get("ownerLineByLineReviewed") is False, "contract must not claim owner line review")
    require(quality.get("humanReviewed") is False, "production contract fabricates human review")
    require(isinstance(quality.get("scope"), str) and quality["scope"].strip(), "acceptance scope is missing")
    require(plan.get("acceptancePolicy") == {
        "acceptedBy": "Codex",
        "humanReviewed": False,
        "ownerLineByLineReviewed": False,
        "independentAudioReviewRequired": True,
        "blanketCharacterErrorRateAllowed": False,
        "criticalMorphemeNumeralParticleMismatch": "hard-fail",
    }, "Codex acceptance policy is stale")
    render = plan.get("render", {})
    require(render.get("schema") == "yomu-academy.learning-voice-render.v1", "unexpected render schema")
    require(render.get("engine", {}).get("name") == "AivisSpeech Engine", "unexpected render engine")
    require(render.get("encoder", {}).get("name") == "ffmpeg/libopus", "unexpected encoder")
    require(render.get("encoder", {}).get("bitrateKbps") == 64, "learning voice bitrate is not 64 kbps")
    require(render.get("encoder", {}).get("application") == "voip", "learning voice Opus mode is stale")

    mappings = plan.get("voiceMappings")
    require(isinstance(mappings, list) and mappings, "voice mappings are missing")
    mapping_by_id = {}
    for mapping in mappings:
        mapping_id = mapping.get("mappingId")
        speaker_id = mapping.get("speakerId")
        require(LINE_ID.fullmatch(mapping_id or ""), f"invalid mapping id: {mapping_id!r}")
        require(LINE_ID.fullmatch(speaker_id or ""), f"invalid mapped speaker: {speaker_id!r}")
        require(mapping_id not in mapping_by_id, f"duplicate mapping id: {mapping_id}")
        require(MODEL_UUID.fullmatch(mapping.get("modelUuid", "")), f"invalid model UUID: {mapping_id}")
        require(isinstance(mapping.get("modelName"), str) and mapping["modelName"], f"model name is missing: {mapping_id}")
        require(isinstance(mapping.get("modelVersion"), str) and mapping["modelVersion"], f"model version is missing: {mapping_id}")
        require(SHA256.fullmatch(mapping.get("modelPayloadSha256", "")), f"model payload is not pinned: {mapping_id}")
        require(mapping.get("engineFamily") == "AivisSpeech + Style-Bert-VITS2 JP-Extra",
                f"engine family is stale: {mapping_id}")
        require(isinstance(mapping.get("modelSourceUrl"), str)
                and mapping["modelSourceUrl"].startswith("https://hub.aivis-project.com/"),
                f"model source record is stale: {mapping_id}")
        distribution = mapping.get("modelDistribution", {})
        require(distribution.get("kind") == "installed-aivmx-distribution"
                and distribution.get("fileName") == f"{mapping['modelUuid']}.aivmx"
                and isinstance(distribution.get("bytes"), int) and distribution["bytes"] > 0
                and distribution.get("sha256") == mapping["modelPayloadSha256"]
                and distribution.get("authority") == "exact-distribution-bytes",
                f"model distribution bytes are not pinned: {mapping_id}")
        require(mapping.get("modelLicense") in SUPPORTED_MODEL_LICENSES,
                f"model licence is not pinned: {mapping_id}")
        require(type(mapping.get("styleId")) is int, f"style id is not pinned: {mapping_id}")
        require(isinstance(mapping.get("styleName"), str) and mapping["styleName"], f"style name is missing: {mapping_id}")
        require(isinstance(mapping.get("surfaceClasses"), list) and mapping["surfaceClasses"],
                f"mapped surface classes are missing: {mapping_id}")
        require(all(isinstance(surface, str) and surface.strip() for surface in mapping["surfaceClasses"]),
                f"mapped surface class is invalid: {mapping_id}")
        require(mapping.get("fallback") == "worker-tts-then-browser-speech", f"fallback is stale: {mapping_id}")
        mapping_by_id[mapping_id] = mapping

    entries = plan.get("entries")
    require(isinstance(entries, list) and entries, "learning voice entries are missing")
    line_ids = set()
    accepted_line_ids = set()
    rejected_line_ids = set()
    binding_ids = set()
    for entry in entries:
        identity = entry.get("identity", {})
        line_id = identity.get("voiceLineId")
        require(LINE_ID.fullmatch(line_id or ""), f"invalid voice line id: {line_id!r}")
        require(line_id not in line_ids, f"duplicate addressable voice unit: {line_id}")
        line_ids.add(line_id)
        mapping = mapping_by_id.get(entry.get("mappingId"))
        require(mapping is not None, f"voice mapping is missing: {line_id}")
        require(identity.get("speakerId") == mapping["speakerId"], f"speaker mapping is stale: {line_id}")
        require(identity.get("locale") == "ja-JP", f"locale is stale: {line_id}")
        require(identity.get("band") == "native", f"native-band coverage is missing: {line_id}")
        require(isinstance(identity.get("intent"), str) and identity["intent"].strip(), f"intent is missing: {line_id}")
        require(entry.get("role") in {"learning-ui", "textbook-character", "academy-character"},
                f"voice role is invalid: {line_id}")
        require(isinstance(entry.get("surface"), str) and entry["surface"].strip(), f"surface is missing: {line_id}")
        require(isinstance(entry.get("japanese"), str) and entry["japanese"].strip() == entry["japanese"],
                f"Japanese line is invalid: {line_id}")
        disposition = entry.get("disposition", {})
        require(disposition.get("status") in {"accepted", "rejected"}, f"line disposition is missing: {line_id}")
        gates = disposition.get("criticalPhraseGates")
        require(isinstance(gates, list) and gates
                and all(isinstance(gate, str) and gate in entry["japanese"] for gate in gates),
                f"critical phrase gates are invalid: {line_id}")
        if disposition["status"] == "accepted":
            require(disposition.get("acceptedBy") == "Codex"
                    and disposition.get("humanReviewed") is False
                    and isinstance(disposition.get("independentAudioReview"), str),
                    f"Codex acceptance is incomplete: {line_id}")
            accepted_line_ids.add(line_id)
        else:
            require(isinstance(disposition.get("reasonCode"), str)
                    and isinstance(disposition.get("basis"), str), f"rejection is incomplete: {line_id}")
            rejected_line_ids.add(line_id)
        source_revision = sha256_bytes(entry.get("japanese", "").encode("utf-8"))
        require(identity.get("sourceRevision") == source_revision, f"source revision is stale: {line_id}")
        bindings = entry.get("bindings")
        require(isinstance(bindings, list) and bindings, f"runtime binding is missing: {line_id}")
        current_binding_ids = []
        for binding in bindings:
            binding_id = binding.get("lineId")
            require(LINE_ID.fullmatch(binding_id or ""), f"invalid binding id: {line_id}")
            require(binding_id not in binding_ids, f"duplicate runtime binding: {binding_id}")
            require(isinstance(binding.get("surface"), str) and binding["surface"].strip(),
                    f"runtime binding surface is missing: {binding_id}")
            labels = binding.get("accessibleReplayLabel", {})
            require(all(isinstance(labels.get(language), str) and labels[language].strip() for language in ("en", "ja")),
                    f"accessible replay label is missing: {binding_id}")
            binding_ids.add(binding_id)
            current_binding_ids.append(binding_id)
        require(identity.get("bindingIds") == current_binding_ids, f"binding identity is stale: {line_id}")
        require(SHA256.fullmatch(entry.get("audioQuerySha256", "")), f"audio query is not pinned: {line_id}")
        require(SHA256.fullmatch(entry.get("expectedCacheKey", "")), f"cache key is not pinned: {line_id}")
        require(set(entry.get("queryOverrides", {})) == QUERY_FIELDS, f"query controls are incomplete: {line_id}")
        require(all(type(value) in (int, float) for value in entry["queryOverrides"].values()),
                f"query control is non-numeric: {line_id}")
        for override in entry.get("moraOverrides", []):
            require(set(override).issubset(MORA_FIELDS), f"unsupported mora control: {line_id}")
            require(isinstance(override.get("accentPhrase"), int) and isinstance(override.get("mora"), int),
                    f"mora address is invalid: {line_id}")
            require(any(field in override for field in ("pitch", "vowel_length", "consonant_length")),
                    f"mora override has no prosody control: {line_id}")
        actual_cache_key = deterministic_cache_key(plan, entry, mapping)
        require(actual_cache_key == entry.get("expectedCacheKey"), f"deterministic cache key is stale: {line_id}")

    triage = plan.get("triage", {})
    require(set(triage.get("reviewedCandidateVoiceLineIds", [])) == line_ids,
            "candidate-line triage does not match the batch")
    require(set(triage.get("acceptedVoiceLineIds", [])) == accepted_line_ids,
            "accepted-line triage does not match the batch")
    require(set(triage.get("rejectedVoiceLineIds", [])) == rejected_line_ids,
            "rejected-line triage does not match the batch")
    require(isinstance(triage.get("reviewedExclusions"), list), "reviewed exclusions are missing")
    return mapping_by_id


def validate_catalog(plan, catalog, mapping_by_id, catalog_path, mirror_catalog_path):
    require(catalog_path.read_bytes() == mirror_catalog_path.read_bytes(), "hosted catalog mirror is stale")
    require(catalog.get("schema") == "yomu-academy.learning-voice-playback.v3", "unexpected playback schema")
    require(catalog.get("batchId") == plan["batchId"], "catalog batch id is stale")
    require(catalog.get("qualityApproval") == plan["qualityApproval"], "catalog quality acceptance is stale")
    require(catalog.get("acceptancePolicy") == plan["acceptancePolicy"], "catalog acceptance policy is stale")
    require(catalog.get("engine") == plan["render"]["engine"], "catalog engine lock is stale")
    require(catalog.get("encoder") == plan["render"]["encoder"], "catalog encoder lock is stale")
    catalog_by_id = {entry.get("lineId"): entry for entry in catalog.get("entries", [])}
    accepted_sources = [entry for entry in plan["entries"] if entry["disposition"]["status"] == "accepted"]
    require(len(catalog_by_id) == len(accepted_sources), "catalog does not contain exactly the accepted voice units")

    for source in accepted_sources:
        identity = source["identity"]
        line_id = identity["voiceLineId"]
        entry = catalog_by_id.get(line_id)
        mapping = mapping_by_id[source["mappingId"]]
        require(entry is not None, f"catalog line is missing: {line_id}")
        expected = {
            "speakerId": identity["speakerId"],
            "role": source["role"],
            "intent": identity["intent"],
            "locale": identity["locale"],
            "band": identity["band"],
            "surface": source["surface"],
            "japanese": source["japanese"],
            "bindings": source["bindings"],
            "sourceSha256": identity["sourceRevision"],
            "sourceRevision": identity["sourceRevision"],
            "audioQuerySha256": source["audioQuerySha256"],
            "cacheKey": source["expectedCacheKey"],
            "modelUuid": mapping["modelUuid"],
            "modelName": mapping["modelName"],
            "modelVersion": mapping["modelVersion"],
            "modelSourceUrl": mapping["modelSourceUrl"],
            "modelLicense": mapping["modelLicense"],
            "modelPayloadSha256": mapping["modelPayloadSha256"],
            "styleId": mapping["styleId"],
            "styleName": mapping["styleName"],
            "queryOverrides": source["queryOverrides"],
            "moraOverrides": source["moraOverrides"],
        }
        for field, value in expected.items():
            require(entry.get(field) == value, f"catalog {field} is stale: {line_id}")
        expected_url = f"/academy/audio/learning-lines/{identity['speakerId']}/{line_id}__{source['expectedCacheKey'][:16]}.opus"
        require(entry.get("url") == expected_url, f"catalog URL is not cache-addressed: {line_id}")
        require(entry.get("reviewStatus") == "accepted", f"catalog line is not accepted: {line_id}")
        require(entry.get("qualityApprovalStatus") == "codex-accepted", f"catalog Codex acceptance is missing: {line_id}")
        listening = entry.get("review", {}).get("listening", {})
        require(listening.get("ownerLineByLineReviewed") is False, f"line fabricates owner review: {line_id}")
        require(listening.get("humanReviewed") is False, f"line fabricates human review: {line_id}")
        require(listening.get("codexAccepted") is True, f"line lacks explicit Codex acceptance: {line_id}")
        public_asset = ROOT / "public" / entry["url"].removeprefix("/")
        mirror_asset = ROOT / "docs" / "public" / entry["url"].removeprefix("/")
        require(public_asset.is_file(), f"production asset is missing: {line_id}")
        require(mirror_asset.is_file(), f"hosted asset mirror is missing: {line_id}")
        require(public_asset.read_bytes() == mirror_asset.read_bytes(), f"hosted asset mirror differs: {line_id}")
        require(public_asset.stat().st_size == entry.get("bytes"), f"asset byte lock is stale: {line_id}")
        require(sha256_file(public_asset) == entry.get("assetSha256"), f"asset hash lock is stale: {line_id}")


def validate_query_evidence(plan, catalog, mapping_by_id, evidence, model_evidence,
                            plan_path, model_evidence_path):
    require(model_evidence.get("schema") == "yomu-academy.learning-voice-model-evidence.v4",
            "unexpected model evidence schema")
    require(model_evidence.get("productionContractSha256") == sha256_file(plan_path),
            "model evidence production contract hash is stale")
    require(evidence.get("schema") == "yomu-academy.learning-voice-query-evidence.v2",
            "unexpected query evidence schema")
    require(evidence.get("batchId") == plan["batchId"], "query evidence batch id is stale")
    require(evidence.get("productionContractSha256") == sha256_file(plan_path),
            "query evidence production contract hash is stale")
    require(evidence.get("modelEvidenceSha256") == sha256_file(model_evidence_path),
            "query evidence model archive hash is stale")
    require(evidence.get("engine") == plan["render"]["engine"], "query evidence engine is stale")
    require(evidence.get("renderContract") == {
        "schema": plan["render"]["schema"],
        "cacheKey": plan["render"]["cacheKey"],
    }, "query evidence render contract is stale")

    model_by_uuid = {model.get("uuid"): model for model in model_evidence.get("models", [])}
    license_by_id = {license_record.get("id"): license_record
                     for license_record in model_evidence.get("licenses", [])}
    require(set(license_by_id) == {mapping["modelLicense"] for mapping in mapping_by_id.values()},
            "archived model licence set is stale")
    require(all(SHA256.fullmatch(license_record.get("sha256", ""))
                and isinstance(license_record.get("text"), str)
                and sha256_bytes(license_record["text"].encode("utf-8")) == license_record["sha256"]
                for license_record in license_by_id.values()),
            "archived model licence text is invalid")
    engine_mapping_by_id = {
        mapping.get("mappingId"): mapping for mapping in model_evidence.get("engineStyleMappings", [])
    }
    archived_mapping_by_id = {mapping.get("mappingId"): mapping for mapping in evidence.get("styleMappings", [])}
    require(len(archived_mapping_by_id) == len(mapping_by_id), "query evidence style mapping count is stale")
    for mapping_id, mapping in mapping_by_id.items():
        model = model_by_uuid.get(mapping["modelUuid"])
        engine_mapping = engine_mapping_by_id.get(mapping_id)
        archived = archived_mapping_by_id.get(mapping_id)
        require(model is not None and engine_mapping is not None and archived is not None,
                f"query evidence style mapping is missing: {mapping_id}")
        require(model.get("payloadSha256") == mapping["modelPayloadSha256"]
                == engine_mapping.get("modelPayloadSha256"),
                f"archived model payload hash is stale: {mapping_id}")
        require((model.get("name"), model.get("version"))
                == (mapping["modelName"], mapping["modelVersion"]),
                f"archived model identity is stale: {mapping_id}")
        require(model.get("distribution") == mapping["modelDistribution"],
                f"archived model distribution is stale: {mapping_id}")
        license_record = license_by_id.get(mapping["modelLicense"])
        require(license_record is not None
                and model.get("licenseId") == mapping["modelLicense"]
                and model.get("licenseSha256") == license_record["sha256"],
                f"archived model licence is stale: {mapping_id}")
        matching_local_styles = [
            style for speaker in model.get("speakers", [])
            if speaker.get("name") == engine_mapping.get("engineSpeakerName")
            for style in speaker.get("styles", [])
            if style.get("name") == mapping["styleName"]
        ]
        require(len(matching_local_styles) == 1, f"embedded local style is ambiguous: {mapping_id}")
        expected = {
            "mappingId": mapping_id,
            "modelUuid": mapping["modelUuid"],
            "modelPayloadSha256": mapping["modelPayloadSha256"],
            "engineSpeakerUuid": engine_mapping["engineSpeakerUuid"],
            "engineSpeakerName": engine_mapping["engineSpeakerName"],
            "globalStyleId": mapping["styleId"],
            "localStyleId": matching_local_styles[0]["localId"],
            "styleName": mapping["styleName"],
        }
        require(archived == expected, f"global-to-local style mapping is stale: {mapping_id}")

    catalog_by_id = {entry.get("lineId"): entry for entry in catalog.get("entries", [])}
    archived_by_id = {entry.get("voiceLineId"): entry for entry in evidence.get("entries", [])}
    require(len(archived_by_id) == len(plan["entries"]), "query evidence line count is stale")
    for entry in plan["entries"]:
        line_id = entry["identity"]["voiceLineId"]
        mapping = mapping_by_id[entry["mappingId"]]
        catalog_entry = catalog_by_id.get(line_id)
        archived = archived_by_id.get(line_id)
        require(archived is not None, f"query evidence line is missing: {line_id}")
        require(archived.get("mappingId") == entry["mappingId"], f"query mapping is stale: {line_id}")
        require(archived.get("text") == entry["japanese"], f"query text is stale: {line_id}")
        require(archived.get("request") == {
            "method": "POST",
            "path": "/audio_query",
            "text": entry["japanese"],
            "globalStyleId": mapping["styleId"],
        }, f"query request identity is stale: {line_id}")
        require(archived.get("options") == {
            "queryOverrides": entry["queryOverrides"],
            "moraOverrides": entry.get("moraOverrides", []),
        }, f"query options are stale: {line_id}")
        query_hash = sha256_bytes(canonical_json(archived.get("audioQuery")).encode("utf-8"))
        require(query_hash == archived.get("audioQuerySha256") == entry["audioQuerySha256"],
                f"canonical audio query hash is stale: {line_id}")
        cache_key = deterministic_cache_key(plan, entry, mapping)
        require(cache_key == archived.get("cacheKey") == entry["expectedCacheKey"],
                f"query cache key is stale: {line_id}")
        require(archived.get("disposition") == entry["disposition"]["status"],
                f"query disposition is stale: {line_id}")
        if entry["disposition"]["status"] == "accepted":
            require(catalog_entry is not None, f"accepted query has no catalog line: {line_id}")
            require(archived.get("asset") == {
                "url": catalog_entry["url"],
                "sha256": catalog_entry["assetSha256"],
                "bytes": catalog_entry["bytes"],
            }, f"query asset lock is stale: {line_id}")
        else:
            require(catalog_entry is None and archived.get("asset") is None
                    and isinstance(archived.get("rejectedAssetFingerprint"), dict),
                    f"rejected query is still shippable: {line_id}")


def require_loopback_engine(engine):
    parsed = urllib.parse.urlparse(engine)
    require(parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost", "::1"},
            "learning voice rendering requires a loopback Aivis engine URL")
    return engine.rstrip("/")


def request_json(engine, path, method="GET", payload=None, timeout=180):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(engine + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def request_bytes(engine, path, payload, timeout=300):
    request = urllib.request.Request(engine + path,
                                     data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                                     method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def apply_controls(query, entry):
    for field, value in entry["queryOverrides"].items():
        query[field] = float(value)
    phrases = query.get("accent_phrases", query.get("accentPhrases", []))
    for override in entry.get("moraOverrides", []):
        mora = phrases[int(override["accentPhrase"])]["moras"][int(override["mora"])]
        for field in ("pitch", "vowel_length", "consonant_length"):
            if field in override:
                mora[field] = float(override[field])
    return query


def validate_installed_models(engine, mapping_by_id):
    models = request_json(engine, "/aivm_models")
    speakers = request_json(engine, "/speakers")
    styles = {(speaker.get("name"), style.get("name"), style.get("id"))
              for speaker in speakers for style in speaker.get("styles", [])}
    for mapping in mapping_by_id.values():
        installed = models.get(mapping["modelUuid"])
        manifest = installed.get("manifest", {}) if isinstance(installed, dict) else {}
        require((manifest.get("name"), manifest.get("version")) == (mapping["modelName"], mapping["modelVersion"]),
                f"installed model mismatch: {mapping['mappingId']}")
        require((mapping["modelName"], mapping["styleName"], mapping["styleId"]) in styles,
                f"installed style mismatch: {mapping['mappingId']}")
        payload = Path(installed.get("file_path", ""))
        require(payload.is_file()
                and payload.stat().st_size == mapping["modelDistribution"]["bytes"]
                and sha256_file(payload) == mapping["modelPayloadSha256"],
                f"installed model payload mismatch: {mapping['mappingId']}")


def render_staging(args, plan, mapping_by_id):
    engine = require_loopback_engine(args.engine)
    staging_audio = args.staging_audio.resolve()
    require(request_json(engine, "/version") == plan["render"]["engine"]["version"], "Aivis engine version is stale")
    validate_installed_models(engine, mapping_by_id)
    ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    require(Path(ffmpeg).is_file(), "ffmpeg is unavailable")
    accepted_by_id = {
        entry["lineId"]: entry for entry in read_json(args.catalog.resolve()).get("entries", [])
    }
    results = []
    for entry in plan["entries"]:
        mapping = mapping_by_id[entry["mappingId"]]
        identity = entry["identity"]
        encoded = urllib.parse.urlencode({"text": entry["japanese"], "speaker": mapping["styleId"]})
        query = apply_controls(request_json(engine, f"/audio_query?{encoded}", method="POST"), entry)
        query_hash = sha256_bytes(canonical_json(query).encode("utf-8"))
        require(query_hash == entry["audioQuerySha256"], f"Aivis query changed: {identity['voiceLineId']}")
        cache_key = deterministic_cache_key(plan, entry, mapping)
        relative = Path("learning-lines") / identity["speakerId"] / f"{identity['voiceLineId']}__{cache_key[:16]}.opus"
        output = (staging_audio / relative).resolve()
        require(output.is_relative_to(staging_audio), "staging output escaped its root")
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.overwrite or not output.is_file():
            wav = request_bytes(engine, f"/synthesis?speaker={mapping['styleId']}", query)
            temporary_output = output.with_name(
                f".{output.stem}.{os.getpid()}.tmp{output.suffix}"
            )
            with tempfile.NamedTemporaryFile(suffix=".wav") as temporary_wav:
                temporary_wav.write(wav)
                temporary_wav.flush()
                subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", temporary_wav.name,
                                "-c:a", "libopus", "-b:a", "64k", "-application", "voip",
                                str(temporary_output)], check=True)
                os.replace(temporary_output, output)
        asset_sha256 = sha256_file(output)
        accepted = accepted_by_id.get(identity["voiceLineId"])
        results.append({"voiceLineId": identity["voiceLineId"], "cacheKey": cache_key,
                        "disposition": entry["disposition"]["status"],
                        "assetSha256": asset_sha256, "bytes": output.stat().st_size,
                        "acceptedAssetSha256": accepted.get("assetSha256") if accepted else None,
                        "matchesAcceptedBytes": asset_sha256 == accepted.get("assetSha256") if accepted else None,
                        "drift": bool(accepted and asset_sha256 != accepted.get("assetSha256")),
                        "path": str(output.relative_to(ROOT))})
    report_path = staging_audio.parent / "render-report.json"
    report_path.write_text(json.dumps({"schema": "yomu-academy.learning-voice-staging-render.v1",
                                       "batchId": plan["batchId"], "humanReviewed": False,
                                       "codexAcceptance": {"humanReviewed": False},
                                       "driftDetected": any(result["drift"] for result in results),
                                       "entries": results},
                                      ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"staged": len(results), "report": str(report_path.relative_to(ROOT))}))
    require(not any(result["drift"] for result in results),
            "staging rerender drifted from accepted bytes; see render-report.json")


def archive_query_evidence(args, plan, mapping_by_id, catalog, model_evidence,
                           plan_path, model_evidence_path, output_path):
    engine = require_loopback_engine(args.engine)
    require(request_json(engine, "/version") == plan["render"]["engine"]["version"],
            "Aivis engine version is stale")
    validate_installed_models(engine, mapping_by_id)
    model_by_uuid = {model["uuid"]: model for model in model_evidence["models"]}
    engine_mapping_by_id = {
        mapping["mappingId"]: mapping for mapping in model_evidence["engineStyleMappings"]
    }
    style_mappings = []
    for mapping in plan["voiceMappings"]:
        model = model_by_uuid[mapping["modelUuid"]]
        engine_mapping = engine_mapping_by_id[mapping["mappingId"]]
        local_styles = [
            style for speaker in model["speakers"]
            if speaker["name"] == engine_mapping["engineSpeakerName"]
            for style in speaker["styles"]
            if style["name"] == mapping["styleName"]
        ]
        require(len(local_styles) == 1, f"embedded local style is ambiguous: {mapping['mappingId']}")
        style_mappings.append({
            "mappingId": mapping["mappingId"],
            "modelUuid": mapping["modelUuid"],
            "modelPayloadSha256": mapping["modelPayloadSha256"],
            "engineSpeakerUuid": engine_mapping["engineSpeakerUuid"],
            "engineSpeakerName": engine_mapping["engineSpeakerName"],
            "globalStyleId": mapping["styleId"],
            "localStyleId": local_styles[0]["localId"],
            "styleName": mapping["styleName"],
        })
    catalog_by_id = {entry["lineId"]: entry for entry in catalog["entries"]}
    previous_by_id = {}
    if output_path.is_file():
        previous_by_id = {entry["voiceLineId"]: entry for entry in read_json(output_path).get("entries", [])}
    entries = []
    for entry in plan["entries"]:
        line_id = entry["identity"]["voiceLineId"]
        mapping = mapping_by_id[entry["mappingId"]]
        encoded = urllib.parse.urlencode({"text": entry["japanese"], "speaker": mapping["styleId"]})
        query = apply_controls(request_json(engine, f"/audio_query?{encoded}", method="POST"), entry)
        query_hash = sha256_bytes(canonical_json(query).encode("utf-8"))
        require(query_hash == entry["audioQuerySha256"], f"Aivis query changed: {line_id}")
        cache_key = deterministic_cache_key(plan, entry, mapping)
        catalog_entry = catalog_by_id.get(line_id)
        previous = previous_by_id.get(line_id, {})
        previous_fingerprint = previous.get("rejectedAssetFingerprint") or previous.get("asset")
        disposition = entry["disposition"]["status"]
        entries.append({
            "voiceLineId": line_id,
            "mappingId": entry["mappingId"],
            "text": entry["japanese"],
            "request": {
                "method": "POST",
                "path": "/audio_query",
                "text": entry["japanese"],
                "globalStyleId": mapping["styleId"],
            },
            "options": {
                "queryOverrides": entry["queryOverrides"],
                "moraOverrides": entry.get("moraOverrides", []),
            },
            "audioQuery": query,
            "audioQuerySha256": query_hash,
            "cacheKey": cache_key,
            "disposition": disposition,
            "asset": {
                "url": catalog_entry["url"],
                "sha256": catalog_entry["assetSha256"],
                "bytes": catalog_entry["bytes"],
            } if catalog_entry else None,
            "rejectedAssetFingerprint": previous_fingerprint if disposition == "rejected" else None,
        })
    archive = {
        "schema": "yomu-academy.learning-voice-query-evidence.v2",
        "capturedOn": "2026-07-20",
        "batchId": plan["batchId"],
        "productionContractSha256": sha256_file(plan_path),
        "modelEvidenceSha256": sha256_file(model_evidence_path),
        "engine": plan["render"]["engine"],
        "renderContract": {
            "schema": plan["render"]["schema"],
            "cacheKey": plan["render"]["cacheKey"],
        },
        "styleMappings": style_mappings,
        "entries": entries,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(archive, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"archivedQueries": len(entries), "path": str(output_path.relative_to(ROOT))}))


def fill_pending_contract(args, plan, plan_path):
    engine = require_loopback_engine(args.engine)
    require(request_json(engine, "/version") == plan["render"]["engine"]["version"],
            "Aivis engine version is stale")
    mapping_by_id = {mapping["mappingId"]: mapping for mapping in plan.get("voiceMappings", [])}
    filled = []
    for entry in plan.get("entries", []):
        line_id = entry.get("identity", {}).get("voiceLineId", "<unknown>")
        query_pending = entry.get("audioQuerySha256") == "0" * 64
        cache_pending = entry.get("expectedCacheKey") == "0" * 64
        require(query_pending == cache_pending, f"partial pending contract identity: {line_id}")
        if not query_pending:
            continue
        mapping = mapping_by_id.get(entry.get("mappingId"))
        require(mapping is not None, f"voice mapping is missing: {line_id}")
        encoded = urllib.parse.urlencode({"text": entry["japanese"], "speaker": mapping["styleId"]})
        query = apply_controls(request_json(engine, f"/audio_query?{encoded}", method="POST"), entry)
        entry["audioQuerySha256"] = sha256_bytes(canonical_json(query).encode("utf-8"))
        entry["expectedCacheKey"] = deterministic_cache_key(plan, entry, mapping)
        filled.append(line_id)
    require(filled, "no pending learning-voice contract identities were found")
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"filled": filled, "path": str(plan_path.relative_to(ROOT))}))


def main():
    args = parse_args()
    plan_path = args.plan.resolve()
    query_evidence_path = args.query_evidence.resolve()
    model_evidence_path = args.model_evidence.resolve()
    catalog_path = args.catalog.resolve()
    mirror_catalog_path = args.mirror_catalog.resolve()
    plan = read_json(plan_path)
    if args.fill_pending_contract:
        fill_pending_contract(args, plan, plan_path)
        return
    mappings = validate_plan(plan)
    require(sum((args.render_staging, args.archive_query_evidence, args.fill_pending_contract)) <= 1,
            "choose one live learning-voice operation")
    if args.render_staging:
        render_staging(args, plan, mappings)
        return
    catalog = read_json(catalog_path)
    validate_catalog(plan, catalog, mappings, catalog_path, mirror_catalog_path)
    model_evidence = read_json(model_evidence_path)
    if args.archive_query_evidence:
        archive_query_evidence(args, plan, mappings, catalog, model_evidence,
                               plan_path, model_evidence_path, query_evidence_path)
        return
    query_evidence = read_json(query_evidence_path)
    validate_query_evidence(plan, catalog, mappings, query_evidence, model_evidence,
                            plan_path, model_evidence_path)
    accepted = [entry for entry in plan["entries"] if entry["disposition"]["status"] == "accepted"]
    rejected = [entry for entry in plan["entries"] if entry["disposition"]["status"] == "rejected"]
    print(json.dumps({"reviewedCandidates": len(plan["entries"]),
                      "accepted": len(accepted),
                      "rejected": len(rejected),
                      "bindings": sum(len(entry["bindings"]) for entry in accepted),
                      "nativeBand": len(accepted),
                      "archivedQueries": len(query_evidence["entries"]),
                      "acceptedBy": "Codex",
                      "humanReviewed": False}))


if __name__ == "__main__":
    main()
