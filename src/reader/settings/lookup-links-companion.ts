import { yomuSettingsSurfaceCompanion } from '../companions/registry';
import type { DictionaryLookupLink } from '../app/types';

export type LookupLinkComponent = 'definition' | 'sentences' | 'audio' | 'images';

export interface TargetLookupSite {
    readonly id: string;
    readonly label: string;
    readonly urlTemplate: string;
    readonly components: readonly LookupLinkComponent[];
    readonly enabled: boolean;
    readonly origin: 'native' | 'shared';
}

export function hasTargetLookupSites(targetLanguage: string): boolean {
    return yomuSettingsSurfaceCompanion()?.lookupLinks?.hasTargetLookupSites(targetLanguage) ?? false;
}

export function targetLookupSiteIds(): readonly string[] {
    return yomuSettingsSurfaceCompanion()?.lookupLinks?.targetLookupSiteIds() ?? [];
}

export function isTargetLookupLinkId(id: string): boolean {
    return yomuSettingsSurfaceCompanion()?.lookupLinks?.isTargetLookupLinkId(id) ?? false;
}

export function targetLookupSites(targetLanguage: string): readonly TargetLookupSite[] {
    return yomuSettingsSurfaceCompanion()?.lookupLinks?.targetLookupSites(targetLanguage) ?? [];
}

export function targetLookupLinks(targetLanguage: string): DictionaryLookupLink[] {
    return yomuSettingsSurfaceCompanion()?.lookupLinks?.targetLookupLinks(targetLanguage) ?? [];
}

export function lookupSiteComponents(
    targetLanguage: string,
    linkId: string,
): readonly LookupLinkComponent[] {
    return yomuSettingsSurfaceCompanion()?.lookupLinks?.lookupSiteComponents(targetLanguage, linkId) ?? [];
}

export function missingLookupComponents(targetLanguage: string): readonly LookupLinkComponent[] {
    return yomuSettingsSurfaceCompanion()?.lookupLinks?.missingLookupComponents(targetLanguage) ?? [];
}
