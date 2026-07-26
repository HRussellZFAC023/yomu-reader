import { yomuSettingsSurfaceCompanion } from '../companions/registry';
import type { installAcademyReaderSrsSync as installAcademyReaderSrsSyncImpl } from './account-sync';

// Core-side facade for the Yomu Settings Surface companion (ADR-0003 split).
// Academy device pairing, its crypto, and the reader<->account SRS bridge are
// account-surface concerns that only run for a paired Academy account, so they
// ship with the companion that owns the account panel. Without the companion
// the reader simply never installs the sync listener.
export const installAcademyReaderSrsSync: typeof installAcademyReaderSrsSyncImpl = () => {
    yomuSettingsSurfaceCompanion()?.installAcademyReaderSrsSync?.();
};
