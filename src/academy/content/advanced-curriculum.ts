import type { ActivityModel } from '../domain/activity-runtime';
import type { JlptBand } from '../domain/learner-record';
import type { LocalizedText } from '../domain/source-library';
import {
    N3_SOURCE_OPENING_PACKAGE_IDS,
    createN3SourceOpeningPackage,
} from './n3-source-opening/package';
import {
    N3_N4_SLEEP_BRIDGE_PACKAGES,
} from './n3-n4-sleep-bridge/registry';
import { N3_PET_HOUSING_PACKAGES } from './n3-pet-housing/registry';
import { N2_HOME_LIFE_OPENING_SEQUENCE } from './n2-home-life-opening-sequence/registry';
import { N2_EXTENSIVE_READING_PACKAGES } from './n2-extensive-reading/registry';
import { N2_EXTENSIVE_READING_PROVENANCE } from './n2-extensive-reading/source';
import { N2_POLICY_SCOPE_PACKAGES } from './n2-policy-scope/registry';
import { N1_OPENING_SEQUENCE_PACKAGES } from './n1-opening-sequence/registry';
import { N1_SOUND_DISCRIMINATION_PACKAGES } from './n1-sound-discrimination/registry';
import { N1_CONTRAST_INFERENCE_PACKAGES } from './n1-contrast-inference/registry';
import { ADVANCED_IMMERSION_PACKAGES } from './advanced-immersion/registry';
import {
    N2_APARTMENT_MOVING_PACKAGE_ID,
} from './n2-apartment-moving/types';
import { N2_PPOI_IMPRESSION_PACKAGE_ID } from './n2-ppoi-impression/types';
import { N2_MOVING_COUPON_PACKAGE_ID } from './n2-moving-coupon/types';
import { N2_HOME_LIFE_READER_PACKAGE_ID } from './n2-home-life-reader/types';
import { N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID } from './n2-moving-priority-listening/types';
import { N3_N4_SLEEP_BRIDGE_PACKAGE_ID } from './n3-n4-sleep-bridge/source';
import { N3_PET_HOUSING_PACKAGE_ID } from './n3-pet-housing/source';
import { N2_POLICY_SCOPE_PACKAGE_ID } from './n2-policy-scope/source';
import { N1_OPENING_SEQUENCE_PACKAGE_ID } from './n1-opening-sequence/source';
import { N1_SOUND_DISCRIMINATION_PACKAGE_ID } from './n1-sound-discrimination/source';
import { N1_CONTRAST_INFERENCE_PACKAGE_ID } from './n1-contrast-inference/source';

export type AdvancedCurriculumBand = 'n3' | 'n2' | 'n1';

const N2_EXTENSIVE_READING_PACKAGE_ID = N2_EXTENSIVE_READING_PROVENANCE.packageId;

export type AdvancedPackageId =
    | 'n3-source-opening-01'
    | 'n3-source-opening-02'
    | 'n3-source-opening-03'
    | typeof N3_N4_SLEEP_BRIDGE_PACKAGE_ID
    | typeof N3_PET_HOUSING_PACKAGE_ID
    | typeof N2_APARTMENT_MOVING_PACKAGE_ID
    | typeof N2_PPOI_IMPRESSION_PACKAGE_ID
    | typeof N2_MOVING_COUPON_PACKAGE_ID
    | typeof N2_HOME_LIFE_READER_PACKAGE_ID
    | typeof N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID
    | typeof N2_EXTENSIVE_READING_PACKAGE_ID
    | typeof N2_POLICY_SCOPE_PACKAGE_ID
    | typeof N1_OPENING_SEQUENCE_PACKAGE_ID
    | typeof N1_SOUND_DISCRIMINATION_PACKAGE_ID
    | typeof N1_CONTRAST_INFERENCE_PACKAGE_ID
    | 'advanced-immersion-n3-n1-01';

export type AdvancedLessonId = `advanced:${AdvancedPackageId}`;

export interface AdvancedCurriculumHost {
    readonly id: string;
    readonly name: string;
    readonly localizedName: LocalizedText;
}

export interface AdvancedCurriculumMetadata {
    readonly title: LocalizedText;
    readonly summary: LocalizedText;
    readonly location: LocalizedText;
    readonly host: AdvancedCurriculumHost;
}

export interface AdvancedCurriculumEntry<
    PackageId extends AdvancedPackageId = AdvancedPackageId,
    Model extends ActivityModel = ActivityModel,
> extends AdvancedCurriculumMetadata {
    readonly band: AdvancedCurriculumBand;
    readonly id: PackageId;
    readonly packageId: PackageId;
    readonly lessonId: `advanced:${PackageId}`;
    readonly activity: Model;
}

const N3_SOURCE_OPENING_PACKAGES = N3_SOURCE_OPENING_PACKAGE_IDS.map(id => createN3SourceOpeningPackage(id));

const catalog = [
    entry('n3', N3_SOURCE_OPENING_PACKAGES[0]!, 'n3-source-opening-01', metadata(
        ['町の流れ', 'Town flow'],
        ['視点・追加・変化を、資料文の流れに沿って追います。', 'Track viewpoint, addition, and change through a source passage.'],
        ['言語ラボ', 'Language lab'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n3', N3_SOURCE_OPENING_PACKAGES[1]!, 'n3-source-opening-02', metadata(
        ['地理を聞く', 'Geography listening'],
        ['場所と対比の手がかりを、長めの聞き取りで保ちます。', 'Hold place and contrast cues through a longer listening task.'],
        ['駅のホーム', 'Station platform'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n3', N3_SOURCE_OPENING_PACKAGES[2]!, 'n3-source-opening-03', metadata(
        ['根拠を読む', 'Evidence reading'],
        ['主張・根拠・控えめな要約を、資料文から取り出します。', 'Find claim, evidence, and a bounded summary in a source text.'],
        ['図書館', 'Library'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n3', N3_N4_SLEEP_BRIDGE_PACKAGES[0]!, N3_N4_SLEEP_BRIDGE_PACKAGE_ID, metadata(
        ['夜の図書館', 'The late library'],
        ['順序・両面・推測の強さを、聞いた資料文で区別します。', 'Separate sequence, trade-offs, and inference strength in a source text.'],
        ['夜の図書館', 'Late library'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n3', N3_PET_HOUSING_PACKAGES[0]!, N3_PET_HOUSING_PACKAGE_ID, metadata(
        ['住まいの相談', 'Housing conversation'],
        ['理由・対比・起こりうる結果を、短い資料文から分けます。', 'Separate reason, contrast, and possible consequence in a short source text.'],
        ['カフェ', 'Academy cafe'],
        'aakash', ['アーカッシュ', 'Aakash'],
    )),
    entry('n2', N2_HOME_LIFE_OPENING_SEQUENCE[0]!, N2_APARTMENT_MOVING_PACKAGE_ID, metadata(
        ['アパート探し', 'Apartment search'],
        ['物件の条件と、引っ越しの行動を結び付けます。', 'Connect property conditions with practical moving actions.'],
        ['住まいのデスク', 'Home desk'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n2', N2_HOME_LIFE_OPENING_SEQUENCE[1]!, N2_PPOI_IMPRESSION_PACKAGE_ID, metadata(
        ['見学の印象', 'The viewing impression'],
        ['客観的な条件と、見た印象の「〜っぽい」を分けます。', 'Separate objective conditions from the impression expressed by -ppoi.'],
        ['アパートの内見', 'Apartment viewing'],
        'aakash', ['アーカッシュ', 'Aakash'],
    )),
    entry('n2', N2_HOME_LIFE_OPENING_SEQUENCE[2]!, N2_MOVING_COUPON_PACKAGE_ID, metadata(
        ['引っ越し用品の券', 'Moving-supply coupon'],
        ['期限・対象・例外・使う順番を、実用文から取り出します。', 'Retrieve deadlines, eligibility, exceptions, and order from a practical notice.'],
        ['青葉生活店', 'Aoba Living shop'],
        'mika', ['ミカ', 'Mika'],
    )),
    entry('n2', N2_HOME_LIFE_OPENING_SEQUENCE[3]!, N2_HOME_LIFE_READER_PACKAGE_ID, metadata(
        ['新しい部屋', 'The new room'],
        ['知らない語で止まらず、物語の転換と決め手まで読みます。', 'Keep moving through an unfamiliar text to its turn and deciding factor.'],
        ['家の廊下', 'Home hallway'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n2', N2_HOME_LIFE_OPENING_SEQUENCE[4]!, N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID, metadata(
        ['更新された予定', 'The updated plan'],
        ['済んだことと変更後の「まずすること」を聞き分けます。', 'Distinguish completed tasks from the updated first action.'],
        ['引っ越し前の家', 'Home before the move'],
        'sophie', ['ソフィー', 'Sophie'],
    )),
    entry('n2', N2_EXTENSIVE_READING_PACKAGES[0]!, N2_EXTENSIVE_READING_PACKAGE_ID, metadata(
        ['止まらない長文', 'Keep moving'],
        ['細部で止まらず、長文の全体と限定までつかみます。', 'Keep moving through a longer text and retain its qualification.'],
        ['図書館', 'Library'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n2', N2_POLICY_SCOPE_PACKAGES[0]!, N2_POLICY_SCOPE_PACKAGE_ID, metadata(
        ['範囲を保つ', 'Keep the scope'],
        ['理由・条件・目的を、本文が言う範囲のまま読みます。', 'Read reason, condition, and purpose without widening the text’s scope.'],
        ['地域センター', 'Community centre'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n1', N1_OPENING_SEQUENCE_PACKAGES[0]!, N1_OPENING_SEQUENCE_PACKAGE_ID, metadata(
        ['冷却センターの記録', 'The cooling-centre record'],
        ['読解・文法・聴解をつなぎ、資料から慎重に判断します。', 'Join reading, grammar, and listening to reason carefully from sources.'],
        ['図書館', 'Library'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n1', N1_SOUND_DISCRIMINATION_PACKAGES[0]!, N1_SOUND_DISCRIMINATION_PACKAGE_ID, metadata(
        ['音の境界', 'Sound boundaries'],
        ['似た音の拍と子音を、文脈の前に聞き分けます。', 'Distinguish near-sound morae and consonants before using context.'],
        ['音声ラボ', 'Language lab'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n1', N1_CONTRAST_INFERENCE_PACKAGES[0]!, N1_CONTRAST_INFERENCE_PACKAGE_ID, metadata(
        ['対比から推論する', 'Contrast and inference'],
        ['対比の方向を追い、根拠を超えない要約を書きます。', 'Track the contrast and write a summary that stays within the evidence.'],
        ['水辺の図書館', 'Waterfront library'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
    entry('n1', ADVANCED_IMMERSION_PACKAGES[0]!, 'advanced-immersion-n3-n1-01', metadata(
        ['根拠の境界', 'The evidence boundary'],
        ['N3資料の聞き取りからN1転移文へ進み、根拠を越えない判断を保ちます。', 'Move from N3 source listening into an N1 transfer passage without outrunning the evidence.'],
        ['音声ラボ', 'Language lab'],
        'rie', ['りえ先生', 'Rie-sensei'],
    )),
] as const satisfies readonly AdvancedCurriculumEntry[];

export const ADVANCED_CURRICULUM: readonly AdvancedCurriculumEntry[] = Object.freeze(catalog);

export function advancedCurriculumForBand(
    band?: JlptBand,
): readonly AdvancedCurriculumEntry[] {
    return band === undefined
        ? ADVANCED_CURRICULUM
        : ADVANCED_CURRICULUM.filter(entry => entry.band === band);
}

export function resolveAdvancedCurriculumEntry(id: string): AdvancedCurriculumEntry {
    const packageId = id.startsWith('advanced:') ? advancedPackageIdFromLessonId(id) : id;
    const found = ADVANCED_CURRICULUM.find(entry => entry.id === packageId);
    if (!found) throw new TypeError(`Unknown advanced curriculum package: ${id}`);
    return found;
}

export function advancedLessonId(id: string): string {
    return `advanced:${id}`;
}

export function advancedPackageIdFromLessonId(lessonId?: string): AdvancedPackageId | undefined {
    if (!lessonId) return undefined;
    const prefix = 'advanced:';
    if (!lessonId.startsWith(prefix)) return undefined;
    const packageId = lessonId.slice(prefix.length);
    return ADVANCED_CURRICULUM.some(entry => entry.id === packageId)
        ? packageId as AdvancedPackageId
        : undefined;
}

export function isAdvancedLessonId(lessonId: string): lessonId is AdvancedLessonId {
    return advancedPackageIdFromLessonId(lessonId) !== undefined;
}

function entry<PackageId extends AdvancedPackageId, Model extends ActivityModel>(
    band: AdvancedCurriculumBand,
    packageRecord: Readonly<{ readonly id: string; readonly activity: Model }>,
    packageId: PackageId,
    metadata: AdvancedCurriculumMetadata,
): AdvancedCurriculumEntry<PackageId, Model> {
    if (packageRecord.id !== packageId) {
        throw new TypeError(`Advanced catalog package mismatch: ${packageRecord.id} !== ${packageId}`);
    }
    return Object.freeze({
        band,
        id: packageId,
        packageId,
        lessonId: advancedLessonId(packageId) as `advanced:${PackageId}`,
        ...metadata,
        activity: packageRecord.activity,
    });
}

function metadata(
    title: readonly [string, string],
    summary: readonly [string, string],
    location: readonly [string, string],
    hostId: string,
    hostName: readonly [string, string],
): AdvancedCurriculumMetadata {
    return Object.freeze({
        title: localized(title),
        summary: localized(summary),
        location: localized(location),
        host: Object.freeze({ id: hostId, name: hostName[1], localizedName: localized(hostName) }),
    });
}

function localized([ja, en]: readonly [string, string]): LocalizedText {
    return Object.freeze({ ja, en });
}
