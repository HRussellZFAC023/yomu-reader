#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 || $# -gt 5 ]]; then
  echo "Usage: $0 <cast-id> <expression> <raw-source> <single|panel> [tl|tr|bl|br]" >&2
  exit 64
fi

cast_id="$1"
expression="$2"
raw_source="$3"
mode="$4"
panel="${5:-}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../../../../../" && pwd)"
public_root="$repo_root/public/academy/art/codex-production-v1/sprites"
source_path="$public_root/sources/${cast_id}__${expression}__raw.png"
person_dir="$public_root/people/$cast_id"
final_path="$person_dir/${cast_id}__${expression}__halfbody__v001.png"
qa_path="$public_root/qa/${cast_id}__${expression}.json"

mkdir -p "$person_dir" "$(dirname "$source_path")" "$(dirname "$qa_path")"
cp "$raw_source" "$source_path"
temp_dir="$(mktemp -d -t yomu-sprite-alpha.XXXXXX)"
temp_alpha="$temp_dir/alpha.png"
trap 'rm -rf "$temp_dir"' EXIT

python3 "$script_dir/key-cyan-sprite.py" \
  --input "$source_path" \
  --out "$temp_alpha"

case "$mode" in
  single)
    ffmpeg -hide_banner -loglevel error -y -i "$temp_alpha" \
      -vf "scale=1536:2048:flags=lanczos" \
      -pix_fmt rgba "$final_path"
    ;;
  panel)
    case "$panel" in
      tl) crop="crop=iw/2:ih/2:0:0" ;;
      tr) crop="crop=iw/2:ih/2:iw/2:0" ;;
      bl) crop="crop=iw/2:ih/2:0:ih/2" ;;
      br) crop="crop=iw/2:ih/2:iw/2:ih/2" ;;
      *) echo "Panel mode requires tl, tr, bl, or br." >&2; exit 64 ;;
    esac
    ffmpeg -hide_banner -loglevel error -y -i "$temp_alpha" \
      -vf "$crop,scale=1536:1536:flags=lanczos,pad=1536:2048:0:0:color=black@0" \
      -pix_fmt rgba "$final_path"
    ;;
  *) echo "Mode must be single or panel." >&2; exit 64 ;;
esac

python3 "$script_dir/verify-sprite-alpha.py" "$final_path" > "$qa_path"
printf '%s\n' "$final_path"
