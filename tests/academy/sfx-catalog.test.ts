import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_SEMANTIC_SFX_CUES,
    SHINDAY_SFX_ASSETS,
    SHINDAY_SFX_CATALOG,
    playAcademySfxCue,
    resolveDirectorSfxCue,
    type AcademySfxDomain,
} from '../../src/academy/audio/sfx-catalog';

interface DeliveryObject {
    readonly key: string;
    readonly sourceCollection: string;
    readonly sourceRelativePath: string;
    readonly contentType: string;
    readonly bytes: number;
    readonly durationSeconds: number;
    readonly sha256: string;
    readonly rightsId: string;
}

function json(pathname: string): unknown {
    return JSON.parse(readFileSync(path.resolve(pathname), 'utf8'));
}

describe('Academy Shinday SFX catalog', () => {
    it('keeps the typed catalog and both public copies identical', () => {
        const publicPath = 'public/academy/content/audio/sfx-catalog.json';
        const docsPath = 'docs/public/academy/content/audio/sfx-catalog.json';

        expect(json(publicPath)).toEqual(SHINDAY_SFX_CATALOG);
        expect(readFileSync(path.resolve(docsPath), 'utf8')).toBe(readFileSync(path.resolve(publicPath), 'utf8'));
    });

    it('inventories exactly the hash-pinned Shinday delivery objects', () => {
        const delivery = json('workers/yomu-academy/media-manifest.json') as {
            rightsBasis: Record<string, unknown>;
            objects: DeliveryObject[];
        };
        const delivered = delivery.objects.filter(object => object.sourceCollection === 'shinday');

        expect(Object.keys(SHINDAY_SFX_ASSETS)).toHaveLength(14);
        expect(new Set(Object.values(SHINDAY_SFX_ASSETS).map(asset => asset.deliveryKey))).toEqual(
            new Set(delivered.map(object => object.key)),
        );
        expect(delivery.rightsBasis[SHINDAY_SFX_CATALOG.provenance.rightsId]).toMatchObject({
            rightsHolder: SHINDAY_SFX_CATALOG.provenance.rightsHolder,
            basis: SHINDAY_SFX_CATALOG.provenance.basis,
            attestedAt: SHINDAY_SFX_CATALOG.provenance.attestedAt,
            delivery: SHINDAY_SFX_CATALOG.provenance.delivery,
        });

        for (const asset of Object.values(SHINDAY_SFX_ASSETS)) {
            expect(delivered.find(object => object.key === asset.deliveryKey)).toMatchObject({
                sourceRelativePath: asset.sourceRelativePath,
                contentType: asset.contentType,
                bytes: asset.bytes,
                durationSeconds: asset.durationSeconds,
                sha256: asset.sha256,
                rightsId: SHINDAY_SFX_CATALOG.provenance.rightsId,
            });
        }
    });

    it('uses only current AudioDirector bindings and their exact delivery keys', () => {
        const manifest = json('src/academy/audio/manifest.json') as {
            sfx: Array<{ cue: string; mediaKey: string }>;
        };
        const manifestKeyByCue = new Map(manifest.sfx.map(entry => [entry.cue, entry.mediaKey]));

        for (const definition of ACADEMY_SEMANTIC_SFX_CUES) {
            if (definition.status !== 'mapped') continue;
            const asset = SHINDAY_SFX_ASSETS[definition.assetId];
            expect(asset.directorCues).toContain(definition.directorCue);
            expect(definition.deliveryKey).toBe(asset.deliveryKey);
            expect(manifestKeyByCue.get(definition.directorCue)).toBe(definition.deliveryKey);
            expect(resolveDirectorSfxCue(definition.cue)).toBe(definition.directorCue);
        }
    });

    it('covers every requested semantic domain and leaves unsupported cues as explicit gaps', () => {
        const domains = new Set<AcademySfxDomain>(ACADEMY_SEMANTIC_SFX_CUES.map(cue => cue.domain));
        expect(domains).toEqual(new Set<AcademySfxDomain>([
            'vn', 'speaker', 'door', 'travel', 'worksheet', 'minigame', 'ceremony',
        ]));

        const gaps = ACADEMY_SEMANTIC_SFX_CUES.filter(cue => cue.status === 'gap');
        expect(gaps.map(gap => gap.cue)).toEqual(expect.arrayContaining([
            'vn.reveal',
            'speaker.arrival',
            'speaker.emphasis',
            'door.open',
            'door.close',
            'travel.footstep.indoor',
            'travel.footstep.wet',
        ]));
        for (const gap of gaps) {
            expect(gap.reason.length).toBeGreaterThan(20);
            expect(gap).not.toHaveProperty('assetId');
            expect(gap).not.toHaveProperty('directorCue');
            expect(gap).not.toHaveProperty('deliveryKey');
            expect(resolveDirectorSfxCue(gap.cue)).toBeNull();
        }
    });

    it('plugs semantic cues into AudioDirectorControl while keeping gaps silent', () => {
        const played: string[] = [];
        const audio = {
            playSfx(cue: string): void { played.push(cue); },
            setVolume(): void {},
        };

        expect(playAcademySfxCue(audio, 'vn.choice.confirm')).toBe(true);
        expect(playAcademySfxCue(audio, 'speaker.arrival')).toBe(false);
        expect(played).toEqual(['menu.confirm']);
    });
});
