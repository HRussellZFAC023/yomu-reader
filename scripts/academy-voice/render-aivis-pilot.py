#!/usr/bin/env python3
"""Voice pilot: render real authored chapter lines through AivisSpeech.

Picks a handful of (speaker, native-band japanese) lines from authored v2
chapters, resolves each speaker -> installed AivisHub model -> engine style id,
synthesizes WAV via audio_query -> synthesis, and encodes Opus alongside.
Output: public/academy/audio/story-pilot/<chapter>__<lineid>__<speaker>.{wav,opus}
"""
import json, subprocess, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs' / 'academy' / 'audio'
SRC = ROOT / 'src' / 'academy' / 'content' / 'story-sources'
OUT = ROOT / 'public' / 'academy' / 'audio' / 'story-pilot'
ENGINE = 'http://127.0.0.1:10101'
NATIVE = {1: ['n5', 'foundation'], 2: ['n4', 'n5'], 3: ['n3'], 4: ['n2']}

def api(path, method='GET', timeout=180):
    req = urllib.request.Request(ENGINE + path, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cast = json.load(open(DOCS / 'aivis-cast-models.json'))
    uuid_by_speaker = {c['speaker']: c['uuid'] for c in cast if c['uuid']}
    # engine speakers: supported_features via /speakers (name+styles w/ ids); match via /aivm_models detail
    models = api('/aivm_models')
    style_by_uuid = {}
    for uu, m in models.items():
        try:
            spk = m['manifest']['speakers'][0]
            style_by_uuid[uu] = spk['styles'][0]['local_id'] + int(spk.get('aivm_style_id_base', 0)) if isinstance(spk['styles'][0].get('local_id'), int) else None
        except Exception:
            pass
    # fallback: map via /speakers by model name containment
    speakers = api('/speakers')
    def style_for(uuid, model_name):
        m = models.get(uuid)
        if m:
            mname = m['manifest']['name']
            for s in speakers:
                if s['name'] in mname or mname in s['name'] or s['name'] in model_name:
                    return s['styles'][0]['id']
        for s in speakers:
            if s['name'] and s['name'] in model_name:
                return s['styles'][0]['id']
        return None

    # collect pilot lines: first 2 line-nodes each from a spread of chapters
    picks = ['s1e13-dinner-by-if', 's1e02-margin-map', 's1e14-two-answers', 's1e24-lanterns-return']
    jobs = []
    for cid in picks:
        f = next(SRC.glob(cid + '.v2.json'), None)
        if not f:
            continue
        pkg = json.load(open(f))
        bands = NATIVE.get(pkg.get('season', 1), ['n5'])
        n = 0
        for sc in pkg['scenes']:
            for nd in sc['nodes']:
                if nd.get('kind') == 'line' and n < 2:
                    ja = next((nd['variants'][b]['japanese'] for b in bands if b in nd.get('variants', {})), None)
                    if ja:
                        jobs.append((cid, nd['id'].split(':')[-1], nd['speakerId'], ja))
                        n += 1
    print(f'{len(jobs)} pilot lines')
    name_by_speaker = {c['speaker']: c['model'] for c in cast}
    done = 0
    for cid, lid, spk, ja in jobs:
        uu = uuid_by_speaker.get(spk)
        st = style_for(uu, name_by_speaker.get(spk, '')) if uu else None
        if st is None:
            print(f'skip {spk} ({lid}): model not installed/matched')
            continue
        q = urllib.parse.urlencode({'text': ja, 'speaker': st})
        aq = urllib.request.urlopen(urllib.request.Request(f'{ENGINE}/audio_query?{q}', method='POST'), timeout=60).read()
        wav = urllib.request.urlopen(urllib.request.Request(f'{ENGINE}/synthesis?speaker={st}', data=aq, headers={'Content-Type': 'application/json'}, method='POST'), timeout=300).read()
        base = OUT / f'{cid}__{lid}__{spk}'
        base.with_suffix('.wav').write_bytes(wav)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(base.with_suffix('.wav')), '-c:a', 'libopus', '-b:a', '48k', str(base.with_suffix('.opus'))], check=False)
        done += 1
        print(f'ok {spk:8} {lid[:36]:38} {ja[:40]}')
    print(f'rendered {done}/{len(jobs)} -> {OUT}')

if __name__ == '__main__':
    main()
