import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import { conversationListeningCheckReviewSeeds, gradeConversationListeningCheck, validateConversationListeningCheck } from './engine';
import { CONVERSATION_LISTENING_CHECK_KIND, type ConversationListeningCheckModel, type ConversationListeningCheckResponse } from './manifest';
import { renderConversationListeningCheck } from './view';

export const conversationListeningCheckPlugin: ActivityPlugin<ConversationListeningCheckModel, ConversationListeningCheckResponse> = {
    kind: CONVERSATION_LISTENING_CHECK_KIND,
    validate: validateConversationListeningCheck,
    render: renderConversationListeningCheck,
    grade: gradeConversationListeningCheck,
    toReviewSeeds: conversationListeningCheckReviewSeeds,
};

export * from './engine';
export * from './manifest';
