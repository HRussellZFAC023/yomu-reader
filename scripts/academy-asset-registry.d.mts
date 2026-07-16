import type { ACADEMY_RUNTIME_ASSET_REGISTRY } from '../src/academy/assets';

export interface RegistryDelivery {
    readonly variant: string;
    readonly path: string;
    readonly sha256: string;
}

export interface RegistryRuntimeAsset {
    readonly id: string;
    readonly kind: string;
    readonly approval: string;
    readonly provenance: Readonly<Record<string, unknown>>;
    readonly runtimeUses: readonly string[];
    readonly orphanStatus: string;
    readonly deliveries: readonly RegistryDelivery[];
}

export interface RegistryMedia {
    readonly path: string;
    readonly sha256: string;
    readonly type?: string;
    readonly provenance: Readonly<Record<string, unknown>>;
    readonly runtimeUse: string | null;
    readonly orphanStatus: string;
}

export interface RegistryGap {
    readonly id: string;
    readonly status: string;
    readonly need: string;
    readonly supportedBy: readonly string[];
}

export interface LessonRegistryEntry {
    readonly ordinal: number;
    readonly packageId: string;
    readonly plateAssetId: string | null;
    readonly provenance: {
        readonly lessonPackage: string;
        readonly media: readonly RegistryMedia[];
        readonly packagedListening: readonly RegistryMedia[];
    };
    readonly runtimeUse: {
        readonly status: string;
        readonly plateAsset: RegistryRuntimeAsset;
    };
    readonly orphanStatus: string;
    readonly responsiveVariants: {
        readonly status: string;
        readonly wide: RegistryDelivery | null;
        readonly mobile: RegistryDelivery | null;
    };
    readonly intentionalOmissions: readonly string[];
    readonly missingPurposefulAssets: readonly RegistryGap[];
}

export interface RecoveryCandidate {
    readonly sha256: string;
    readonly type: string;
    readonly path: string;
    readonly provenance: Readonly<Record<string, unknown>>;
    readonly runtimeUses: readonly string[];
    readonly orphanStatus: string;
    readonly approval: string;
}

export interface WorldRegistryEntry {
    readonly id: string;
    readonly provenance: Readonly<Record<string, unknown>>;
    readonly runtimeUse: {
        readonly status: string;
        readonly plates: readonly RegistryRuntimeAsset[];
        readonly items: readonly RegistryRuntimeAsset[];
    };
    readonly orphanStatus: string;
    readonly responsiveVariants: readonly Readonly<Record<string, unknown>>[];
    readonly recoveredCandidates: readonly RecoveryCandidate[];
    readonly missingPurposefulAssets: readonly RegistryGap[];
}

export interface AcademyAssetRegistry {
    readonly schemaVersion: number;
    readonly snapshotDate: string;
    readonly purpose: string;
    readonly authority: Readonly<Record<string, unknown>>;
    readonly scope: {
        readonly lessons: { readonly first: number; readonly last: number; readonly packageIds: readonly string[] };
        readonly worlds: readonly string[];
    };
    readonly counts: Readonly<Record<string, number>>;
    readonly lessons: readonly LessonRegistryEntry[];
    readonly worlds: readonly WorldRegistryEntry[];
    readonly missingPurposefulAssets: readonly (RegistryGap & { readonly scope: string })[];
}

export function buildRegistry(options?: {
    readonly runtimeRegistry?: typeof ACADEMY_RUNTIME_ASSET_REGISTRY;
}): Promise<AcademyAssetRegistry>;
export function serializeRegistry(registry: AcademyAssetRegistry): string;
export function validateRegistry(registry: AcademyAssetRegistry): string[];
