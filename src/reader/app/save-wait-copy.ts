import { APP_NAME } from './constants';

/** The status a learner's save shows while another tab holds its storage lease (ui/save-wait-status.ts). */
export const SAVE_WAIT_COPY = {
    en: {
        saveWaitingForAnotherTab: `Waiting for another ${APP_NAME} tab to finish saving…`,
    },
    ja: {
        saveWaitingForAnotherTab: `ほかの${APP_NAME}タブの保存が終わるのを待っています…`,
    },
} as const;
