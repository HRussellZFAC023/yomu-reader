const epoch = { type: 'integer', format: 'int64', description: 'Unix time in milliseconds.' };
const uuid = { type: 'string', format: 'uuid' };
const base64url = { type: 'string', pattern: '^[A-Za-z0-9_-]+$', description: 'Unpadded base64url.' };
const ok = {
    type: 'object',
    required: ['ok'],
    properties: { ok: { type: 'boolean', const: true } },
    additionalProperties: false,
};

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = schema => ({ 'application/json': { schema } });
const query = (name, schema, description, required = false) => ({
    name,
    in: 'query',
    required,
    description,
    schema,
});
const pathParameter = (name, description, schema = { type: 'string' }) => ({
    name,
    in: 'path',
    required: true,
    description,
    schema,
});

function makeOperation(entry, securitySchemes) {
    const successStatus = String(entry.successStatus ?? 200);
    const responses = entry.responses ?? {
        [successStatus]: {
            description: entry.successDescription ?? 'Successful response.',
            ...(entry.response ? { content: jsonContent(ref(entry.response)) } : {}),
        },
        ...(entry.errors === false ? {} : {
            '400': { description: 'The request was malformed.', content: jsonContent(ref('Error')) },
            '401': { description: 'Authentication is required or invalid.', content: jsonContent(ref('Error')) },
            '403': { description: 'The authenticated caller is not permitted to perform this operation.', content: jsonContent(ref('Error')) },
            '409': { description: 'The request conflicts with current server state.', content: jsonContent(ref('Error')) },
            '429': { description: 'The caller exceeded a rate limit.', content: jsonContent(ref('Error')) },
            '500': { description: 'The service could not complete the request.', content: jsonContent(ref('Error')) },
        }),
    };
    const operation = {
        operationId: entry.operationId,
        tags: [entry.tag],
        summary: entry.summary,
        description: entry.description,
        security: entry.security === undefined ? [] : entry.security.map(name => ({ [name]: [] })),
        responses,
    };
    if (entry.parameters?.length) operation.parameters = entry.parameters;
    if (entry.request) {
        operation.requestBody = {
            required: entry.requestRequired ?? true,
            ...(entry.requestDescription ? { description: entry.requestDescription } : {}),
            content: jsonContent(ref(entry.request)),
        };
    }
    if (entry.requestBody) operation.requestBody = entry.requestBody;
    if (entry.sameOrigin) operation['x-yomu-same-origin'] = true;
    if (entry.internal) operation['x-internal'] = true;
    if (entry.deprecated) operation.deprecated = true;
    if (entry.server) operation.servers = [{ url: entry.server }];
    for (const scheme of entry.security ?? []) {
        if (!securitySchemes[scheme]) throw new TypeError(`Unknown security scheme ${scheme}.`);
    }
    return operation;
}

function makeDocument({ title, version, description, server, tags, operations, schemas, securitySchemes = {} }) {
    const paths = {};
    for (const entry of operations) {
        const path = paths[entry.path] ?? {};
        if (path[entry.method]) throw new TypeError(`Duplicate OpenAPI operation ${entry.method.toUpperCase()} ${entry.path}.`);
        path[entry.method] = makeOperation(entry, securitySchemes);
        paths[entry.path] = path;
    }
    return {
        openapi: '3.1.0',
        info: {
            title,
            version,
            description,
            contact: { name: 'Yomu', url: 'https://yomureader.com/' },
            license: { name: 'MIT', identifier: 'MIT' },
        },
        servers: [{ url: server }],
        tags,
        paths,
        components: { schemas, securitySchemes },
        externalDocs: { description: 'Yomu documentation', url: 'https://yomureader.com/' },
    };
}

const academySecurity = {
    sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: '__Host-academy_session',
        description: 'Opaque Academy browser session cookie. It is issued and rotated by the session endpoints.',
    },
    deviceBearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Yomu device credential',
        description: 'Reader device credential returned once when a device pairing is claimed.',
    },
    adminBearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Yomu admin token',
        description: 'Server-managed administrative credential. Never embed it in a browser client.',
    },
};

const academySchemas = {
    Error: {
        type: 'object',
        required: ['error'],
        properties: { error: { type: 'string' } },
        additionalProperties: false,
    },
    Ok: ok,
    EmptyObject: { type: 'object', maxProperties: 0, additionalProperties: false },
    Health: {
        type: 'object',
        required: ['ok'],
        properties: {
            ok: { type: 'boolean', const: true },
        },
        additionalProperties: false,
    },
    InviteCodeRequest: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', description: 'Academy invitation code.' } },
        additionalProperties: false,
    },
    Session: {
        type: 'object',
        required: ['sessionId', 'expiresAt', 'offlineResumeUntil', 'accountRequired'],
        properties: {
            sessionId: uuid,
            expiresAt: epoch,
            offlineResumeUntil: epoch,
            accountRequired: { type: 'boolean', const: true },
        },
        additionalProperties: false,
    },
    SessionStatus: {
        type: 'object',
        required: ['state'],
        properties: {
            state: {
                type: 'string',
                enum: ['signed-out', 'active-unlinked', 'resumable', 'linked'],
            },
        },
        additionalProperties: false,
    },
    ReaderAuthSession: {
        type: 'object',
        required: ['sessionId', 'expiresAt', 'offlineResumeUntil', 'accountRequired', 'state'],
        properties: {
            sessionId: uuid,
            expiresAt: epoch,
            offlineResumeUntil: epoch,
            accountRequired: { type: 'boolean', const: true },
            state: { type: 'string', enum: ['active-unlinked', 'linked'] },
        },
        additionalProperties: false,
    },
    AccountPatch: {
        type: 'object',
        minProperties: 1,
        properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 32 },
            avatarKey: { type: ['string', 'null'], enum: ['quality-2', 'quality-3', 'quality-4', 'quality-5', null] },
            boardVisible: { type: 'boolean' },
            shareAvatar: { type: 'boolean' },
        },
        additionalProperties: false,
    },
    ClassMembership: {
        type: 'object',
        required: ['classId', 'name', 'role', 'boardHidden'],
        properties: {
            classId: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['learner', 'sensei'] },
            boardHidden: { type: 'boolean' },
        },
        additionalProperties: false,
    },
    Account: {
        type: 'object',
        required: ['accountId', 'displayName', 'displayTag', 'nameChosen', 'avatarKey', 'boardVisible', 'shareAvatar', 'academyAccess', 'classes'],
        properties: {
            accountId: uuid,
            displayName: { type: 'string' },
            displayTag: { type: 'string' },
            nameChosen: { type: 'boolean' },
            avatarKey: { type: ['string', 'null'] },
            boardVisible: { type: 'boolean' },
            shareAvatar: { type: 'boolean' },
            academyAccess: { type: 'boolean' },
            classes: { type: 'array', items: ref('ClassMembership') },
        },
        additionalProperties: false,
    },
    Profile: {
        type: 'object',
        required: ['profileId', 'deviceId', 'accountId', 'keyVersion', 'createdAt'],
        properties: {
            profileId: uuid,
            deviceId: uuid,
            accountId: { type: ['string', 'null'], format: 'uuid' },
            keyVersion: { type: 'integer', minimum: 1 },
            createdAt: epoch,
        },
        additionalProperties: false,
    },
    KeyCommitmentRequest: {
        type: 'object',
        required: ['keyCommitment'],
        properties: { keyCommitment: { ...base64url, minLength: 43, maxLength: 43 } },
        additionalProperties: false,
    },
    KeyInitialized: {
        type: 'object',
        required: ['initialized'],
        properties: { initialized: { type: 'boolean', const: true } },
        additionalProperties: false,
    },
    Entitlement: {
        oneOf: [
            {
                type: 'object',
                required: ['entitlement'],
                properties: { entitlement: { type: 'string', const: 'none' } },
                additionalProperties: false,
            },
            {
                type: 'object',
                required: ['entitlement', 'source', 'state'],
                properties: {
                    entitlement: { type: 'string', const: 'academy' },
                    source: { type: 'string' },
                    state: { type: 'string' },
                    expiresAt: { type: ['integer', 'null'], format: 'int64' },
                },
                additionalProperties: true,
            },
        ],
    },
    EntitlementRedeemRequest: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string' } },
        additionalProperties: false,
    },
    PairingTicket: {
        type: 'object',
        required: ['pairingId', 'code', 'expiresAt'],
        properties: { pairingId: uuid, code: { type: 'string' }, expiresAt: epoch },
        additionalProperties: false,
    },
    KeyEnvelope: {
        type: 'object',
        required: ['keyVersion', 'salt', 'nonce', 'ciphertext'],
        properties: {
            keyVersion: { type: 'integer', minimum: 1 },
            salt: base64url,
            nonce: base64url,
            ciphertext: base64url,
        },
        additionalProperties: false,
    },
    PairingReady: {
        type: 'object',
        required: ['pairingId', 'ready'],
        properties: { pairingId: uuid, ready: { type: 'boolean', const: true } },
        additionalProperties: false,
    },
    PairingClaimRequest: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string' } },
        additionalProperties: false,
    },
    DevicePairingClaimRequest: {
        type: 'object',
        required: ['code', 'claimId', 'deviceSecret'],
        properties: {
            code: { type: 'string' },
            claimId: uuid,
            deviceSecret: { ...base64url, minLength: 43, maxLength: 43 },
        },
        additionalProperties: false,
    },
    PairingClaim: {
        type: 'object',
        required: ['pairingId', 'profileId', 'deviceId', 'keyEnvelope'],
        properties: {
            connected: { type: 'boolean' },
            pairingId: uuid,
            profileId: uuid,
            deviceId: uuid,
            credential: { type: 'string', description: 'Returned only for Reader device pairing claims.' },
            keyEnvelope: ref('KeyEnvelope'),
        },
        additionalProperties: false,
    },
    DeviceStatus: {
        type: 'object',
        required: ['connected', 'profileId', 'deviceId', 'keyVersion'],
        properties: {
            connected: { type: 'boolean', const: true },
            profileId: uuid,
            deviceId: uuid,
            keyVersion: { type: 'integer', minimum: 1 },
        },
        additionalProperties: true,
    },
    DeviceList: {
        type: 'object',
        required: ['devices'],
        properties: {
            devices: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['deviceId', 'createdAt', 'lastSeenAt'],
                    properties: { deviceId: uuid, createdAt: epoch, lastSeenAt: epoch },
                    additionalProperties: false,
                },
            },
        },
        additionalProperties: false,
    },
    RevokedDevice: {
        type: 'object',
        required: ['revoked'],
        properties: { revoked: { type: 'boolean', const: true }, deviceId: uuid },
        additionalProperties: false,
    },
    EncryptedEvent: {
        type: 'object',
        required: ['id', 'occurredAt', 'keyVersion', 'nonce', 'ciphertext'],
        properties: {
            cursor: { type: 'integer', minimum: 0 },
            id: { type: 'string' },
            occurredAt: epoch,
            keyVersion: { type: 'integer', minimum: 1 },
            nonce: base64url,
            ciphertext: base64url,
            sourceDeviceId: { type: ['string', 'null'] },
            receivedAt: epoch,
        },
        additionalProperties: false,
    },
    EncryptedEventPush: {
        type: 'object',
        required: ['events'],
        properties: { events: { type: 'array', minItems: 1, maxItems: 50, items: ref('EncryptedEvent') } },
        additionalProperties: false,
    },
    EncryptedReaderEventPush: {
        type: 'object',
        required: ['events'],
        properties: { events: { type: 'array', minItems: 1, maxItems: 20, items: ref('EncryptedEvent') } },
        additionalProperties: false,
    },
    SyncPushResult: {
        type: 'object',
        required: ['accepted', 'inserted', 'duplicates', 'conflicts'],
        properties: {
            accepted: { type: 'integer', minimum: 0 },
            inserted: { type: 'integer', minimum: 0 },
            duplicates: { type: 'integer', minimum: 0 },
            conflicts: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
    },
    SyncPage: {
        type: 'object',
        required: ['events', 'nextCursor', 'hasMore'],
        properties: {
            events: { type: 'array', items: ref('EncryptedEvent') },
            nextCursor: { type: 'integer', minimum: 0 },
            hasMore: { type: 'boolean' },
        },
        additionalProperties: false,
    },
    ProgressSnapshot: {
        type: 'object',
        required: ['knownWordCount', 'reviewsCompleted', 'reviewsDue', 'lessonsCompleted', 'lessonsTotal'],
        properties: {
            knownWordCount: { type: 'integer', minimum: 0 },
            reviewsCompleted: { type: 'integer', minimum: 0 },
            reviewsDue: { type: 'integer', minimum: 0 },
            lessonsCompleted: { type: 'integer', minimum: 0 },
            lessonsTotal: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
    },
    ProgressSyncRequest: {
        type: 'object',
        required: ['mutationId', 'progress', 'studyDays'],
        properties: {
            mutationId: { type: 'string', minLength: 8, maxLength: 80 },
            progress: ref('ProgressSnapshot'),
            studyDays: { type: 'array', maxItems: 366, items: { type: 'string', format: 'date' } },
        },
        additionalProperties: false,
    },
    ProgressSyncResult: {
        type: 'object',
        required: ['merged'],
        properties: { merged: { type: 'boolean' } },
        additionalProperties: false,
    },
    AnswerCheckRequest: {
        type: 'object',
        required: ['contractVersion', 'taskContext', 'learnerResponse', 'allowedRubric', 'allowedEvidence'],
        properties: {
            contractVersion: { type: 'string', const: 'answer-check.v1' },
            taskContext: {
                type: 'object',
                required: ['taskId', 'skill', 'learningGoal', 'instruction'],
                properties: {
                    taskId: { type: 'string', maxLength: 128 },
                    skill: { type: 'string', enum: ['recognition', 'reading', 'listening', 'speaking', 'writing', 'grammar', 'vocabulary', 'kanji'] },
                    learningGoal: { type: 'string', maxLength: 240 },
                    instruction: { type: 'string', maxLength: 1000 },
                },
                additionalProperties: false,
            },
            learnerResponse: {
                type: 'object',
                required: ['kind', 'value'],
                properties: {
                    kind: { type: 'string', enum: ['text', 'choice', 'boolean', 'number', 'tokens'] },
                    value: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'array', items: { type: 'string' } }] },
                },
                additionalProperties: false,
            },
            allowedRubric: {
                type: 'object',
                required: ['criteria'],
                properties: {
                    criteria: {
                        type: 'array', minItems: 1, maxItems: 8,
                        items: {
                            type: 'object', required: ['id', 'label'],
                            properties: { id: { type: 'string', maxLength: 64 }, label: { type: 'string', maxLength: 240 } },
                            additionalProperties: false,
                        },
                    },
                },
                additionalProperties: false,
            },
            allowedEvidence: {
                type: 'array', maxItems: 16,
                items: {
                    type: 'object', required: ['id', 'kind', 'description'],
                    properties: {
                        id: { type: 'string', maxLength: 64 },
                        kind: { type: 'string', enum: ['observation', 'interaction', 'source_context'] },
                        description: { type: 'string', maxLength: 240 },
                    },
                    additionalProperties: false,
                },
            },
        },
        additionalProperties: false,
    },
    AnswerCheckResponse: {
        type: 'object',
        required: ['contractVersion', 'status', 'verdict', 'uncertainty', 'suggestedRepair'],
        properties: {
            contractVersion: { type: 'string', const: 'answer-check.v1' },
            status: { type: 'string', const: 'complete' },
            verdict: {
                type: 'object', required: ['outcome', 'criteria'],
                properties: {
                    outcome: { type: 'string', enum: ['correct', 'partially_correct', 'incorrect', 'uncertain'] },
                    criteria: {
                        type: 'array',
                        items: {
                            type: 'object', required: ['criterionId', 'outcome'],
                            properties: {
                                criterionId: { type: 'string' },
                                outcome: { type: 'string', enum: ['met', 'partially_met', 'not_met', 'uncertain'] },
                            },
                            additionalProperties: false,
                        },
                    },
                },
                additionalProperties: false,
            },
            uncertainty: {
                type: 'object', required: ['level', 'reason'],
                properties: {
                    level: { type: 'string', enum: ['low', 'medium', 'high'] },
                    reason: { type: 'string', enum: ['none', 'ambiguous_response', 'insufficient_evidence', 'provider_limits'] },
                },
                additionalProperties: false,
            },
            suggestedRepair: {
                oneOf: [
                    { type: 'null' },
                    {
                        type: 'object', required: ['kind', 'criterionId'],
                        properties: {
                            kind: { type: 'string', enum: ['retry', 'review_criterion', 'ask_for_clarification'] },
                            criterionId: { type: ['string', 'null'] },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        },
        additionalProperties: false,
    },
    ClassMember: {
        type: 'object',
        required: ['accountId', 'displayTag', 'role'],
        properties: {
            accountId: uuid,
            displayTag: { type: 'string' },
            avatarKey: { type: 'string' },
            role: { type: 'string', enum: ['learner', 'sensei'] },
            value: { type: 'number' },
            updatedAt: { type: ['integer', 'null'], format: 'int64' },
        },
        additionalProperties: true,
    },
    ClassBoard: {
        type: 'object',
        required: ['classId', 'members'],
        properties: { classId: { type: 'string' }, members: { type: 'array', items: ref('ClassMember') } },
        additionalProperties: false,
    },
    ClassLeaderboard: {
        type: 'object',
        required: ['classId', 'metric', 'entries', 'me', 'pagination', 'updatedAt', 'freshness'],
        properties: {
            classId: { type: 'string' },
            metric: {
                type: 'object',
                required: ['id', 'meaning', 'unit', 'window'],
                properties: {
                    id: { type: 'string', enum: ['streak', 'review-activity', 'known-words', 'lesson-progress'] },
                    meaning: { type: 'string' },
                    unit: { type: 'string', enum: ['days', 'words', 'lessons'] },
                    window: { type: 'string', enum: ['current-streak', 'rolling-7-utc-days', 'all-time'] },
                    startsOn: { type: 'string', format: 'date' },
                    endsOn: { type: 'string', format: 'date' },
                    asOf: { type: 'string', format: 'date' },
                },
                additionalProperties: false,
            },
            entries: { type: 'array', items: ref('ClassMember') },
            me: { oneOf: [{ type: 'null' }, ref('ClassMember')] },
            pagination: {
                type: 'object', required: ['page', 'limit', 'visibleEntries', 'pages'],
                properties: {
                    page: { type: 'integer', minimum: 1 },
                    limit: { type: 'integer', minimum: 1, maximum: 50 },
                    visibleEntries: { type: 'integer', minimum: 0 },
                    pages: { type: 'integer', minimum: 0 },
                },
                additionalProperties: false,
            },
            updatedAt: { type: ['integer', 'null'], format: 'int64' },
            freshness: {
                type: 'object', required: ['generatedAt', 'mode', 'realTime'],
                properties: {
                    generatedAt: epoch,
                    mode: { type: 'string', const: 'server-snapshot' },
                    realTime: { type: 'boolean', const: false },
                },
                additionalProperties: false,
            },
        },
        additionalProperties: false,
    },
    ClassSummary: {
        type: 'object',
        required: ['classId'],
        properties: { classId: { type: 'string' } },
        additionalProperties: true,
    },
    AdminInviteRequest: {
        type: 'object',
        properties: {
            code: { type: 'string' },
            uses: { type: 'integer', minimum: 1 },
            expiresAt: { type: ['integer', 'null'], format: 'int64' },
            classId: { type: 'string' },
        },
        additionalProperties: false,
    },
    AdminInvite: {
        type: 'object',
        required: ['inviteId', 'uses', 'expiresAt'],
        properties: { inviteId: uuid, code: { type: 'string' }, uses: { type: 'integer' }, expiresAt: { type: ['integer', 'null'] } },
        additionalProperties: false,
    },
    AdminClassRequest: {
        type: 'object',
        required: ['classId', 'name', 'inviteCode'],
        properties: { classId: { type: 'string' }, name: { type: 'string' }, inviteCode: { type: 'string' } },
        additionalProperties: false,
    },
    AdminClass: {
        type: 'object',
        required: ['classId', 'name'],
        properties: { classId: { type: 'string' }, name: { type: 'string' } },
        additionalProperties: false,
    },
    AdminRoleRequest: {
        type: 'object',
        required: ['classId', 'accountId', 'role'],
        properties: { classId: { type: 'string' }, accountId: uuid, role: { type: 'string', enum: ['learner', 'sensei'] } },
        additionalProperties: false,
    },
    AdminPaymentCodeRequest: {
        type: 'object',
        required: ['provider', 'referenceType', 'reference'],
        properties: {
            provider: { type: 'string', enum: ['stripe', 'kofi', 'patreon'] },
            referenceType: { type: 'string', enum: ['subject', 'transaction'] },
            reference: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
    },
    AdminPaymentCode: {
        type: 'object',
        required: ['provider', 'code'],
        properties: {
            provider: { type: 'string', enum: ['stripe', 'kofi', 'patreon'] },
            code: { type: 'string' },
        },
        additionalProperties: false,
    },
    ModerationRequest: {
        type: 'object',
        minProperties: 1,
        properties: { boardHidden: { type: 'boolean' }, role: { type: 'string', enum: ['learner', 'sensei'] } },
        additionalProperties: false,
    },
    ExportEventPage: {
        type: 'object',
        required: ['events', 'nextCursor', 'hasMore', 'exportCursor'],
        properties: {
            events: { type: 'array', items: { type: 'object', additionalProperties: true } },
            nextCursor: { type: 'integer', minimum: 0 },
            hasMore: { type: 'boolean' },
            exportCursor: { type: ['string', 'null'] },
        },
        additionalProperties: false,
    },
    ReaderExportEventPage: {
        type: 'object',
        required: ['events', 'nextCursor', 'hasMore'],
        properties: {
            events: { type: 'array', items: { type: 'object', additionalProperties: true } },
            nextCursor: { type: 'integer', minimum: 0 },
            hasMore: { type: 'boolean' },
        },
        additionalProperties: false,
    },
    ExportPage: {
        type: 'object',
        required: ['schemaVersion', 'eventPage', 'readerSrsEventPage'],
        properties: {
            schemaVersion: { type: 'integer', const: 2 },
            eventPage: ref('ExportEventPage'),
            readerSrsEventPage: ref('ReaderExportEventPage'),
        },
        additionalProperties: true,
    },
    ExportRequest: {
        type: 'object',
        properties: {
            cursor: {
                type: 'string',
                pattern: '^v2\\.[A-Za-z0-9_-]{43}\\.[0-9a-z]+\\.[0-9a-f]{64}$',
                description: 'Opaque single-use continuation cursor from the previous export page.',
            },
        },
        additionalProperties: false,
    },
    DeleteAccountRequest: {
        type: 'object',
        required: ['confirmation'],
        properties: { confirmation: { type: 'string', const: 'delete-account' } },
        additionalProperties: false,
    },
    DeleteProfileRequest: {
        type: 'object',
        required: ['confirmation'],
        properties: { confirmation: { type: 'string', const: 'delete-profile' } },
        additionalProperties: false,
    },
    LifecycleProofGrantRequest: {
        type: 'object',
        required: ['accountId', 'runNonce'],
        properties: {
            accountId: uuid,
            runNonce: { ...base64url, minLength: 43, maxLength: 43, description: 'Supervisor-provided 32-byte run nonce.' },
        },
        additionalProperties: false,
    },
    LifecycleProofAuthorizationRequest: {
        type: 'object',
        required: ['proofToken', 'runNonce'],
        properties: {
            proofToken: { ...base64url, minLength: 43, maxLength: 43, description: 'Single-use production proof token.' },
            runNonce: { ...base64url, minLength: 43, maxLength: 43, description: 'Run nonce bound to the proof token.' },
        },
        additionalProperties: false,
    },
    LifecycleProofDeletionRequest: {
        type: 'object',
        required: ['proofToken', 'runNonce', 'confirmation'],
        properties: {
            proofToken: { ...base64url, minLength: 43, maxLength: 43, description: 'Single-use production proof token.' },
            runNonce: { ...base64url, minLength: 43, maxLength: 43, description: 'Run nonce bound to the proof token.' },
            confirmation: { type: 'string', const: 'delete-account' },
        },
        additionalProperties: false,
    },
    LifecycleProofGrant: {
        type: 'object',
        required: ['proofToken', 'runNonce', 'accountId', 'environment', 'scope', 'expiresAt'],
        properties: {
            proofToken: { ...base64url, minLength: 43, maxLength: 43 },
            runNonce: { ...base64url, minLength: 43, maxLength: 43 },
            accountId: uuid,
            environment: { type: 'string', const: 'production' },
            scope: { type: 'string', const: 'account-lifecycle-production-test' },
            expiresAt: epoch,
        },
        additionalProperties: false,
    },
    LifecycleProofVerification: {
        type: 'object',
        required: ['verified', 'accountId', 'environment', 'scope', 'expiresAt'],
        properties: {
            verified: { type: 'boolean', const: true },
            accountId: uuid,
            environment: { type: 'string', const: 'production' },
            scope: { type: 'string', const: 'account-lifecycle-production-test' },
            expiresAt: epoch,
        },
        additionalProperties: false,
    },
    DeletionReceipt: {
        type: 'object',
        required: ['deletionId', 'scope', 'deletedAt', 'profileCount', 'deviceCount', 'syncedRecordCount', 'retainedUntil'],
        properties: {
            deletionId: uuid,
            scope: { type: 'string', enum: ['profile', 'account'] },
            deletedAt: epoch,
            profileCount: { type: 'integer', minimum: 0 },
            deviceCount: { type: 'integer', minimum: 0 },
            syncedRecordCount: { type: 'integer', minimum: 0 },
            retainedUntil: epoch,
        },
        additionalProperties: false,
    },
    DeletedResource: {
        type: 'object',
        required: ['deleted', 'scope', 'deletionReceipt'],
        properties: {
            deleted: { type: 'boolean', const: true },
            scope: { type: 'string', enum: ['profile', 'account'] },
            deletionReceipt: ref('DeletionReceipt'),
        },
        additionalProperties: false,
    },
};

const browser = ['sessionCookie'];
const device = ['deviceBearer'];
const admin = ['adminBearer'];
const cursorParameters = [
    query('cursor', { type: 'integer', minimum: 0, default: 0 }, 'Return events after this cursor.'),
    query('limit', { type: 'integer', minimum: 1, maximum: 200, default: 200 }, 'Maximum events to return.'),
];

export const academyOperations = [
    { method: 'get', path: '/academy/api/health', operationId: 'getAcademyHealth', tag: 'System', summary: 'Check Academy API health', description: 'Returns deploy metadata for the production Academy Worker.', response: 'Health', errors: false },
    { method: 'post', path: '/academy/api/session', operationId: 'createAcademySession', tag: 'Sessions', summary: 'Exchange an invitation code', description: 'Creates an eight-hour browser session and a fixed 30-day offline-resume window.', request: 'InviteCodeRequest', response: 'Session', sameOrigin: true },
    { method: 'get', path: '/academy/api/session', operationId: 'getAcademySession', tag: 'Sessions', summary: 'Read the active session', description: 'Returns the session bound to the secure host cookie.', security: browser, response: 'Session' },
    { method: 'get', path: '/academy/api/session/status', operationId: 'getAcademySessionStatus', tag: 'Sessions', summary: 'Check browser session state', description: 'Returns a state-only, non-mutating account-shell projection. Missing, malformed, revoked, unknown, and elapsed cookies all return signed-out with status 200.', response: 'SessionStatus' },
    { method: 'post', path: '/academy/api/session/resume', operationId: 'resumeAcademySession', tag: 'Sessions', summary: 'Rotate and resume a session', description: 'Rotates a resumable browser cookie without consuming another invitation.', security: browser, response: 'Session', sameOrigin: true },
    { method: 'post', path: '/academy/api/logout', operationId: 'logoutAcademySession', tag: 'Sessions', summary: 'Log out', description: 'Revokes the session family and clears the browser cookie.', security: browser, response: 'Ok', sameOrigin: true },
    { method: 'post', path: '/academy/api/auth/google/recovery', operationId: 'createGoogleRecoverySession', tag: 'Authentication', summary: 'Start account recovery', description: 'Creates an auth-only session for recovering an existing Google-linked account.', request: 'EmptyObject', response: 'Session', successStatus: 201, sameOrigin: true },
    {
        method: 'post',
        path: '/academy/api/auth/google/reader',
        operationId: 'ensureReaderAccountSession',
        tag: 'Authentication',
        summary: 'Prepare Reader account sign-in',
        description: 'Keeps an active or resumable paid, invite, Reader, or linked recovery session. Converts an unlinked recovery session to Reader, and creates a free Reader session only when the request carries no usable session family.',
        request: 'EmptyObject',
        sameOrigin: true,
        responses: {
            '200': { description: 'The existing session was kept or resumed.', content: jsonContent(ref('ReaderAuthSession')) },
            '201': { description: 'A free Reader auth session was created.', content: jsonContent(ref('ReaderAuthSession')) },
            '400': { description: 'The request was malformed.', content: jsonContent(ref('Error')) },
            '401': { description: 'A concurrent rotation consumed the presented token.', content: jsonContent(ref('Error')) },
            '403': { description: 'The request was not same-origin.', content: jsonContent(ref('Error')) },
            '409': { description: 'The presented session family changed in another request.', content: jsonContent(ref('Error')) },
            '429': { description: 'The caller exceeded a rate limit.', content: jsonContent(ref('Error')) },
            '500': { description: 'The service could not prepare sign-in.', content: jsonContent(ref('Error')) },
        },
    },
    { method: 'get', path: '/academy/api/auth/google/start', operationId: 'startGoogleOidc', tag: 'Authentication', summary: 'Begin Google OIDC', description: 'Redirects the active session to Google. Browser navigation only.', security: browser, parameters: [query('returnTo', { type: 'string' }, 'Safe same-origin route after sign-in.')], responses: { '302': { description: 'Redirect to Google.', headers: { Location: { schema: { type: 'string', format: 'uri' } } } }, '401': { description: 'No active session.', content: jsonContent(ref('Error')) } } },
    { method: 'get', path: '/academy/api/auth/google/callback', operationId: 'completeGoogleOidc', tag: 'Authentication', summary: 'Complete Google OIDC', description: 'Google callback endpoint. This is not called directly by application code.', parameters: [query('code', { type: 'string' }, 'Google authorization code.'), query('state', { type: 'string' }, 'OIDC state token.')], responses: { '302': { description: 'Redirect back to Academy after success or a normalized failure.', headers: { Location: { schema: { type: 'string', format: 'uri' } } } } } },
    { method: 'get', path: '/academy/api/account', operationId: 'getAcademyAccount', tag: 'Account', summary: 'Read the signed-in account', description: 'Returns public account preferences, class memberships, and Academy-access state.', security: browser, response: 'Account' },
    { method: 'patch', path: '/academy/api/account', operationId: 'patchAcademyAccount', tag: 'Account', summary: 'Update account preferences', description: 'Updates the learner name, approved avatar, and class-board sharing preferences.', security: browser, request: 'AccountPatch', response: 'Account', sameOrigin: true },
    { method: 'get', path: '/academy/api/account/devices', operationId: 'listReaderDevices', tag: 'Devices', summary: 'List Reader devices', description: 'Lists non-revoked devices attached to the signed-in account profile.', security: browser, response: 'DeviceList' },
    { method: 'delete', path: '/academy/api/account/devices/{deviceId}', operationId: 'revokeReaderDeviceFromAccount', tag: 'Devices', summary: 'Revoke a Reader device', description: 'Revokes one device from the signed-in account.', security: browser, parameters: [pathParameter('deviceId', 'Public Reader device UUID.', uuid)], response: 'RevokedDevice', sameOrigin: true },
    { method: 'post', path: '/academy/api/account/export', operationId: 'exportAccountData', tag: 'Account', summary: 'Export account data', description: 'Starts or continues a frozen, bounded export of account-owned data.', security: browser, request: 'ExportRequest', response: 'ExportPage', sameOrigin: true },
    { method: 'delete', path: '/academy/api/account', operationId: 'deleteAcademyAccount', tag: 'Account', summary: 'Delete the account', description: 'Permanently deletes the signed-in account and returns a deletion receipt.', security: browser, request: 'DeleteAccountRequest', response: 'DeletedResource', sameOrigin: true },
    { method: 'post', path: '/academy/api/account/lifecycle-proof/verify', operationId: 'verifyAccountLifecycleProof', tag: 'Account', summary: 'Verify a production lifecycle proof grant', description: 'Verifies that the signed-in disposable account matches an unexpired supervised proof grant without consuming it.', security: browser, request: 'LifecycleProofAuthorizationRequest', response: 'LifecycleProofVerification', sameOrigin: true },
    { method: 'delete', path: '/academy/api/account/lifecycle-proof', operationId: 'deleteLifecycleProofAccount', tag: 'Account', summary: 'Delete a supervised production proof account', description: 'Consumes the bound single-use proof grant and deletes the authenticated disposable account.', security: browser, request: 'LifecycleProofDeletionRequest', response: 'DeletedResource', sameOrigin: true },
    { method: 'get', path: '/academy/api/entitlement', operationId: 'getAcademyEntitlement', tag: 'Entitlements', summary: 'Read Academy access', description: 'Returns the active paid/class entitlement or an explicit none state.', security: browser, response: 'Entitlement' },
    { method: 'post', path: '/academy/api/entitlement/redeem', operationId: 'redeemAcademyEntitlement', tag: 'Entitlements', summary: 'Redeem an access code', description: 'Binds a paid access code to the signed-in account.', security: browser, request: 'EntitlementRedeemRequest', response: 'Entitlement', sameOrigin: true },
    { method: 'get', path: '/academy/api/profile', operationId: 'getAcademyProfile', tag: 'Profiles', summary: 'Read the encrypted-sync profile', description: 'Returns opaque profile and device identifiers. Yomu never receives the client encryption key.', security: browser, response: 'Profile' },
    { method: 'post', path: '/academy/api/profile/key', operationId: 'initializeProfileKey', tag: 'Profiles', summary: 'Pin the profile key commitment', description: 'Atomically records the SHA-256 commitment of the client-held encryption key.', security: browser, request: 'KeyCommitmentRequest', response: 'KeyInitialized', sameOrigin: true },
    { method: 'post', path: '/academy/api/profile/export', operationId: 'exportProfileData', tag: 'Profiles', summary: 'Export profile data', description: 'Starts or continues a frozen, bounded export of encrypted profile data.', security: browser, request: 'ExportRequest', response: 'ExportPage', sameOrigin: true },
    { method: 'delete', path: '/academy/api/profile', operationId: 'deleteAcademyProfile', tag: 'Profiles', summary: 'Delete the profile', description: 'Deletes an eligible profile and returns a deletion receipt.', security: browser, request: 'DeleteProfileRequest', response: 'DeletedResource', sameOrigin: true },
    { method: 'post', path: '/academy/api/pairings', operationId: 'createBrowserPairing', tag: 'Pairing', summary: 'Create a browser pairing code', description: 'Creates a one-use, ten-minute pairing ticket.', security: browser, response: 'PairingTicket', successStatus: 201, sameOrigin: true },
    { method: 'put', path: '/academy/api/pairings/{pairingId}', operationId: 'completeBrowserPairing', tag: 'Pairing', summary: 'Attach an encrypted key envelope', description: 'Makes a pairing ticket claimable by attaching the client-encrypted profile key.', security: browser, parameters: [pathParameter('pairingId', 'Pairing ticket UUID.', uuid)], request: 'KeyEnvelope', response: 'PairingReady', sameOrigin: true },
    { method: 'post', path: '/academy/api/pairings/claim', operationId: 'claimBrowserPairing', tag: 'Pairing', summary: 'Claim a pairing in the browser', description: 'Moves a fresh browser device onto the paired profile and returns the encrypted key envelope.', security: browser, request: 'PairingClaimRequest', response: 'PairingClaim', sameOrigin: true },
    { method: 'post', path: '/academy/api/device/pairings', operationId: 'createDevicePairing', tag: 'Pairing', summary: 'Create a pairing from a Reader device', description: 'Creates a pairing code using a durable Reader device credential.', security: device, response: 'PairingTicket', successStatus: 201 },
    { method: 'put', path: '/academy/api/device/pairings/{pairingId}', operationId: 'completeDevicePairing', tag: 'Pairing', summary: 'Complete a device pairing', description: 'Attaches an encrypted profile-key envelope using a Reader device credential.', security: device, parameters: [pathParameter('pairingId', 'Pairing ticket UUID.', uuid)], request: 'KeyEnvelope', response: 'PairingReady' },
    { method: 'post', path: '/academy/api/device/pairings/claim', operationId: 'claimDevicePairing', tag: 'Pairing', summary: 'Claim a Reader device pairing', description: 'Consumes a pairing code and returns a durable device credential once.', request: 'DevicePairingClaimRequest', response: 'PairingClaim', successStatus: 201 },
    { method: 'get', path: '/academy/api/device/status', operationId: 'getReaderDeviceStatus', tag: 'Devices', summary: 'Check a Reader device credential', description: 'Returns the profile/device identifiers attached to the bearer credential.', security: device, response: 'DeviceStatus' },
    { method: 'delete', path: '/academy/api/device', operationId: 'revokeReaderDevice', tag: 'Devices', summary: 'Revoke the current Reader device', description: 'Revokes the bearer credential and its device.', security: device, response: 'RevokedDevice' },
    { method: 'post', path: '/academy/api/srs/push', operationId: 'pushAcademySrsEvents', tag: 'SRS sync', summary: 'Push encrypted Academy SRS events', description: 'Appends up to 50 immutable, client-encrypted event envelopes. Byte-identical retries are idempotent.', security: browser, request: 'EncryptedEventPush', response: 'SyncPushResult', sameOrigin: true },
    { method: 'get', path: '/academy/api/srs/pull', operationId: 'pullAcademySrsEvents', tag: 'SRS sync', summary: 'Pull encrypted Academy SRS events', description: 'Returns one cursor-ordered page of encrypted Academy events.', security: browser, parameters: cursorParameters, response: 'SyncPage' },
    { method: 'post', path: '/academy/api/device/srs/push', operationId: 'pushReaderSrsEvents', tag: 'SRS sync', summary: 'Push encrypted Reader SRS events', description: 'Appends up to 20 immutable Reader deck mutations.', security: device, request: 'EncryptedReaderEventPush', response: 'SyncPushResult' },
    { method: 'get', path: '/academy/api/device/srs/pull', operationId: 'pullReaderSrsEvents', tag: 'SRS sync', summary: 'Pull encrypted Reader SRS events', description: 'Returns one cursor-ordered page of encrypted Reader deck mutations.', security: device, parameters: cursorParameters, response: 'SyncPage' },
    { method: 'post', path: '/academy/api/progress/sync', operationId: 'syncAcademyProgress', tag: 'Progress', summary: 'Merge aggregate learner progress', description: 'Idempotently merges non-sensitive aggregate progress and UTC study dates for class features.', security: browser, request: 'ProgressSyncRequest', response: 'ProgressSyncResult', sameOrigin: true },
    { method: 'post', path: '/academy/api/answer-check', operationId: 'checkAcademyAnswer', tag: 'Learning', summary: 'Check a speaking or writing answer', description: 'Evaluates one learner answer through the configured provider and returns normalized feedback.', security: browser, request: 'AnswerCheckRequest', response: 'AnswerCheckResponse', sameOrigin: true },
    { method: 'get', path: '/academy/api/classes/{classId}/board', operationId: 'getClassBoard', tag: 'Classes', summary: 'Read a class board', description: 'Returns opted-in class members visible to the authenticated learner.', security: browser, parameters: [pathParameter('classId', 'Class identifier.')], response: 'ClassBoard' },
    { method: 'get', path: '/academy/api/classes/{classId}/leaderboard', operationId: 'getClassLeaderboard', tag: 'Classes', summary: 'Read a class leaderboard', description: 'Returns a paginated ranking for the selected aggregate metric.', security: browser, parameters: [pathParameter('classId', 'Class identifier.'), query('metric', { type: 'string', enum: ['streak', 'review-activity', 'known-words', 'lesson-progress'], default: 'streak' }, 'Ranking metric.'), query('page', { type: 'integer', minimum: 1, maximum: 1000, default: 1 }, 'One-based page.'), query('limit', { type: 'integer', minimum: 1, maximum: 50, default: 20 }, 'Entries per page.')], response: 'ClassLeaderboard' },
    { method: 'get', path: '/academy/api/classes/{classId}/summary', operationId: 'getClassSummary', tag: 'Classes', summary: 'Read a class summary', description: 'Returns aggregate class progress for learners and sensei views.', security: browser, parameters: [pathParameter('classId', 'Class identifier.')], response: 'ClassSummary' },
    { method: 'patch', path: '/academy/api/classes/{classId}/members/{accountId}/moderation', operationId: 'moderateClassMember', tag: 'Classes', summary: 'Moderate a class member', description: 'Updates a member’s board visibility or class role. Sensei/admin only.', security: browser, parameters: [pathParameter('classId', 'Class identifier.'), pathParameter('accountId', 'Public account UUID.', uuid)], request: 'ModerationRequest', response: 'Ok', sameOrigin: true },
    { method: 'get', path: '/academy/media/{assetPath}', operationId: 'getProtectedAcademyMedia', tag: 'Media', summary: 'Read protected Academy media', description: 'Streams an allowlisted R2 object to an authenticated Academy learner.', security: browser, parameters: [pathParameter('assetPath', 'Allowlisted media key.', { type: 'string' })], responses: { '200': { description: 'Protected media bytes.', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, '401': { description: 'No active Academy session.', content: jsonContent(ref('Error')) }, '403': { description: 'The session lacks Academy access.', content: jsonContent(ref('Error')) }, '404': { description: 'The asset is not allowlisted or does not exist.', content: jsonContent(ref('Error')) } } },
    { method: 'post', path: '/academy/api/admin/invites', operationId: 'createAcademyInvite', tag: 'Administration', summary: 'Create an invitation', description: 'Creates or registers an Academy invitation. Server-side administration only.', security: admin, request: 'AdminInviteRequest', response: 'AdminInvite', successStatus: 201 },
    { method: 'post', path: '/academy/api/admin/classes', operationId: 'upsertAcademyClass', tag: 'Administration', summary: 'Create or update a class', description: 'Upserts a class and attaches an invitation code.', security: admin, request: 'AdminClassRequest', response: 'AdminClass' },
    { method: 'post', path: '/academy/api/admin/roles', operationId: 'setAcademyClassRole', tag: 'Administration', summary: 'Set a class role', description: 'Assigns learner or sensei to an existing class member.', security: admin, request: 'AdminRoleRequest', response: 'Ok' },
    { method: 'post', path: '/academy/api/admin/lifecycle-proof-grants', operationId: 'createAccountLifecycleProofGrant', tag: 'Administration', summary: 'Create a production lifecycle proof grant', description: 'Creates an expiring single-use grant bound to one disposable production account and run nonce.', security: admin, request: 'LifecycleProofGrantRequest', response: 'LifecycleProofGrant', successStatus: 201 },
    { method: 'post', path: '/academy/api/admin/payment-code', operationId: 'getAcademyPaymentCode', tag: 'Administration', summary: 'Retrieve an unredeemed payment access code', description: 'Looks up an active provider entitlement by a server-held subject or transaction reference. Patreon supports subject references only.', security: admin, request: 'AdminPaymentCodeRequest', response: 'AdminPaymentCode' },
];

const academyDocument = makeDocument({
    title: 'Yomu Academy API',
    version: '1.0.0',
    description: 'Accounts, secure browser sessions, Reader device pairing, encrypted SRS sync, class progress, learning feedback, and protected Academy media. Browser mutations marked `x-yomu-same-origin` also require an Origin header matching https://yomureader.com.',
    server: 'https://yomureader.com',
    tags: [
        ['System', 'Health and deploy metadata.'], ['Sessions', 'Invitation-backed browser sessions.'],
        ['Authentication', 'Google OIDC entry and callback.'], ['Account', 'Account preferences, export, and deletion.'],
        ['Entitlements', 'Academy access state.'], ['Profiles', 'Client-encrypted profile lifecycle.'],
        ['Pairing', 'One-use cross-device key transfer.'], ['Devices', 'Durable Reader device credentials.'],
        ['SRS sync', 'Opaque encrypted event synchronization.'], ['Progress', 'Aggregate learner progress.'],
        ['Learning', 'Speaking and writing answer checking.'], ['Classes', 'Class boards and rankings.'],
        ['Media', 'Protected learning media.'], ['Administration', 'Server-managed administrative operations.'],
    ].map(([name, description]) => ({ name, description })),
    operations: academyOperations,
    schemas: academySchemas,
    securitySchemes: academySecurity,
});

const audioSchemas = {
    Error: academySchemas.Error,
    AudioSourceList: {
        type: 'object',
        required: ['type', 'audioSources'],
        properties: {
            type: { type: 'string', const: 'audioSourceList' },
            audioSources: { type: 'array', items: { type: 'object', required: ['name', 'url'], properties: { name: { type: 'string' }, url: { type: 'string', format: 'uri' } }, additionalProperties: false } },
        },
        additionalProperties: false,
    },
    AudioStatus: {
        type: 'object',
        required: ['service', 'status', 'r2Configured', 'manifestKey', 'indexPrefix', 'upstreamConfigured', 'cors', 'cache', 'tts'],
        properties: {
            service: { type: 'string', const: 'yomu-audio' }, status: { type: 'string', enum: ['ok', 'disabled', 'unconfigured'] },
            r2Configured: { type: 'boolean' }, manifestKey: { type: 'string' }, indexPrefix: { type: 'string' }, upstreamConfigured: { type: 'boolean' },
            cors: { type: 'boolean', const: true }, cache: { type: 'object', additionalProperties: true }, tts: { type: 'string', enum: ['enabled', 'disabled'] },
        },
        additionalProperties: false,
    },
};

const audioBinaryResponses = {
    '200': { description: 'Audio bytes. Content type depends on the active synthesis engine or stored object.', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } }, 'audio/ogg': { schema: { type: 'string', format: 'binary' } }, 'audio/wav': { schema: { type: 'string', format: 'binary' } } } },
    '400': { description: 'A required query value is missing or invalid.', content: jsonContent(ref('Error')) },
    '401': { description: 'Admin authorization is required.', content: jsonContent(ref('Error')) },
    '503': { description: 'No TTS engine is configured.', content: jsonContent(ref('Error')) },
};

const audioSecurity = {
    voiceAdminBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'Yomu voice admin token', description: 'Server-side token for generating and caching story dialogue.' },
};

export const audioOperations = [
    { method: 'get', path: '/status', operationId: 'getAudioStatus', tag: 'System', summary: 'Check audio service status', description: 'Reports storage, index, fallback, CORS, cache, and TTS readiness.', response: 'AudioStatus', errors: false },
    { method: 'get', path: '/healthz', operationId: 'getAudioHealth', tag: 'System', summary: 'Check audio service health', description: 'Alias of `/status` for infrastructure health checks.', response: 'AudioStatus', errors: false },
    { method: 'get', path: '/', operationId: 'findJapaneseAudio', tag: 'Lookup', summary: 'Find pronunciation audio', description: 'Looks up hosted audio by expression/reading and falls back to a public pronunciation source when needed.', parameters: [query('term', { type: 'string' }, 'Japanese expression.'), query('reading', { type: 'string' }, 'Kana reading.')], response: 'AudioSourceList', errors: false },
    { method: 'get', path: '/audio/tts', operationId: 'synthesizeWordAudio', tag: 'Synthesis', summary: 'Synthesize pitch-aware word audio', description: 'Returns cached or newly synthesized Japanese word audio. Polly can apply the stored pitch-accent phoneme; Azure/MeloTTS use the reading.', parameters: [query('term', { type: 'string' }, 'Japanese expression.', true), query('reading', { type: 'string' }, 'Kana reading.'), query('voice', { type: 'string', enum: ['Tomoko', 'Kazuha', 'Takumi'], default: 'Tomoko' }, 'Polly voice when Polly is active.')], responses: audioBinaryResponses },
    { method: 'get', path: '/voice/line', operationId: 'synthesizeStoryLine', tag: 'Synthesis', summary: 'Synthesize a voiced story line', description: 'Generates and caches one Japanese dialogue line using the cast voice registry. Administrative production endpoint.', security: ['voiceAdminBearer'], parameters: [query('text', { type: 'string', minLength: 1, maxLength: 500 }, 'Japanese dialogue line.', true), query('speaker', { type: 'string', default: 'narrator' }, 'Cast speaker id.')], responses: audioBinaryResponses },
    { method: 'get', path: '/audio/{key}', operationId: 'getHostedAudioObject', tag: 'Objects', summary: 'Read a hosted audio object', description: 'Streams an indexed R2 audio object with range and cache headers.', parameters: [pathParameter('key', 'R2 audio object key.')], responses: { '200': { description: 'Audio object bytes.', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, '404': { description: 'Audio object not found.', content: { 'text/plain': { schema: { type: 'string' } } } } }, errors: false },
];

const audioDocument = makeDocument({
    title: 'Yomu Audio API', version: '1.0.0',
    description: 'Pronunciation lookup, pitch-aware word synthesis, cast dialogue synthesis, and hosted audio delivery. Public read operations allow cross-origin GET/HEAD requests.',
    server: 'https://audio.yomureader.com',
    tags: [['System', 'Service readiness.'], ['Lookup', 'Japanese pronunciation lookup.'], ['Synthesis', 'Cached Japanese TTS.'], ['Objects', 'Hosted audio files.']].map(([name, description]) => ({ name, description })),
    operations: audioOperations, schemas: audioSchemas, securitySchemes: audioSecurity,
});

const supportProviderIds = ['stripe', 'kofi', 'bmac', 'paypal', 'patreon'];
const supportDisplayCurrencies = [
    'GBP', 'USD', 'EUR', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'NZD', 'SGD',
    'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'BRL', 'MXN', 'INR', 'KRW', 'ZAR', 'TRY',
    'THB', 'IDR', 'PHP', 'MYR',
];

const supportSchemas = {
    SupportGoalBreakdownItem: {
        type: 'object',
        required: ['id', 'label', 'monthlyGbp'],
        properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            detail: { type: 'string' },
            monthlyGbp: { type: 'number', minimum: 0 },
            category: { type: 'string' },
        },
        additionalProperties: false,
    },
    SupportGoal: {
        type: 'object',
        required: ['service', 'currency', 'floorGBP', 'forecastGBP', 'monthlyGoalGBP', 'breakdown'],
        properties: {
            service: { type: 'string', const: 'yomu-support' },
            currency: { type: 'string', const: 'GBP' },
            floorGBP: { type: 'number', minimum: 0 },
            forecastGBP: { type: 'number', minimum: 0 },
            monthlyGoalGBP: { type: 'number', minimum: 0 },
            breakdown: { type: 'array', items: ref('SupportGoalBreakdownItem') },
        },
        additionalProperties: false,
    },
    SupportProviderProgress: {
        type: 'object',
        required: ['provider', 'monthGbp', 'source'],
        properties: {
            provider: { type: 'string', enum: supportProviderIds },
            monthGbp: { type: 'number', minimum: 0 },
            source: { type: 'string', enum: ['d1', 'kv', 'env', 'none'] },
        },
        additionalProperties: false,
    },
    SupportProgress: {
        type: 'object',
        required: ['service', 'currency', 'month', 'totalThisMonthGbp', 'totalTodayGbp', 'needsRate', 'providers', 'source'],
        properties: {
            service: { type: 'string', const: 'yomu-support' },
            currency: { type: 'string', const: 'GBP' },
            month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
            totalThisMonthGbp: { type: 'number', minimum: 0 },
            totalTodayGbp: { type: 'number', minimum: 0 },
            needsRate: { type: 'integer', minimum: 0 },
            providers: { type: 'array', items: ref('SupportProviderProgress') },
            source: { type: 'string', enum: ['d1', 'env'] },
        },
        additionalProperties: false,
    },
    SupportRevision: {
        type: 'object',
        required: ['version', 'deploymentId', 'deployedAt'],
        properties: {
            version: { type: 'string' },
            deploymentId: { type: ['string', 'null'] },
            deployedAt: { type: ['string', 'null'], format: 'date-time' },
        },
        additionalProperties: false,
    },
    SupportProviderLink: {
        type: 'object',
        required: ['id', 'label', 'url', 'kind', 'enabled'],
        properties: {
            id: { type: 'string', enum: supportProviderIds },
            label: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            kind: { type: 'string', enum: ['checkout', 'link'] },
            enabled: { type: 'boolean' },
        },
        additionalProperties: false,
    },
    SupportCurrencyDisplay: {
        type: 'object',
        required: ['locale', 'currency', 'symbol', 'amount', 'goal', 'amountText', 'goalText', 'rate', 'rateDate', 'converted'],
        properties: {
            locale: { type: 'string' },
            currency: { type: 'string', enum: supportDisplayCurrencies },
            symbol: { type: 'string' },
            amount: { type: 'integer', minimum: 0 },
            goal: { type: 'integer', minimum: 0 },
            amountText: { type: 'string' },
            goalText: { type: 'string' },
            rate: { type: 'number', exclusiveMinimum: 0 },
            rateDate: { type: 'string' },
            converted: { type: 'boolean' },
        },
        additionalProperties: false,
    },
    SupportAcademyDeliveryAlert: {
        type: 'object',
        required: ['configured', 'configurationFailures', 'lastConfigurationFailureAt'],
        properties: {
            configured: { type: 'boolean' },
            configurationFailures: { type: 'integer', minimum: 0 },
            lastConfigurationFailureAt: { type: ['string', 'null'], format: 'date-time' },
        },
        additionalProperties: false,
    },
    SupportBanner: {
        type: 'object',
        required: ['enabled', 'dismissVersion', 'message', 'costLabel', 'goalLabel', 'ctaLabel', 'donateUrl'],
        properties: {
            enabled: { type: 'boolean' },
            dismissVersion: { type: 'string' },
            message: { type: 'string' },
            costLabel: { type: 'string' },
            goalLabel: { type: 'string' },
            ctaLabel: { type: 'string' },
            donateUrl: { type: 'string', format: 'uri' },
        },
        additionalProperties: false,
    },
    SupportStatus: {
        type: 'object',
        required: [
            'service', 'status', 'revision', 'currency', 'dailyBudgetGbp', 'donationGoalGbp',
            'floorGbp', 'forecastGbp', 'donationsTodayGbp', 'donationsThisMonthGbp',
            'donationsSource', 'needsRate', 'estimatedDailyCostGbp', 'estimatedMonthlyCostGbp',
            'goalMet', 'progressRatio', 'donateUrl', 'featuresAtRisk', 'providers', 'breakdown',
            'academyDeliveryAlert', 'display', 'banner',
        ],
        properties: {
            service: { type: 'string', const: 'yomu-support' },
            status: { type: 'string', enum: ['ok', 'stripe-test-mode', 'stripe-unconfigured'] },
            revision: ref('SupportRevision'),
            currency: { type: 'string', const: 'GBP' },
            dailyBudgetGbp: { type: 'number', minimum: 0 },
            donationGoalGbp: { type: 'integer', minimum: 0 },
            floorGbp: { type: 'number', minimum: 0 },
            forecastGbp: { type: 'number', minimum: 0 },
            donationsTodayGbp: { type: 'number', minimum: 0 },
            donationsThisMonthGbp: { type: 'number', minimum: 0 },
            donationsSource: { type: 'string', enum: ['d1', 'env'] },
            needsRate: { type: 'integer', minimum: 0 },
            estimatedDailyCostGbp: { type: 'number', minimum: 0 },
            estimatedMonthlyCostGbp: { type: 'number', minimum: 0 },
            goalMet: { type: 'boolean' },
            progressRatio: { type: 'number', minimum: 0, maximum: 1 },
            donateUrl: { type: 'string', format: 'uri' },
            featuresAtRisk: { type: 'array', items: { type: 'string' } },
            providers: { type: 'array', items: ref('SupportProviderLink') },
            breakdown: { type: 'array', items: ref('SupportGoalBreakdownItem') },
            academyDeliveryAlert: ref('SupportAcademyDeliveryAlert'),
            display: ref('SupportCurrencyDisplay'),
            banner: ref('SupportBanner'),
        },
        additionalProperties: false,
    },
    SupportWebhookReceipt: {
        type: 'object',
        required: ['received', 'recorded'],
        properties: {
            received: { type: 'boolean', const: true },
            recorded: { type: 'boolean' },
        },
        additionalProperties: false,
    },
};

const providerBody = {
    required: true,
    description: 'Provider-defined webhook payload. The service validates the provider signature before accepting it.',
    content: {
        'application/json': { schema: { type: 'object', additionalProperties: true } },
        'application/x-www-form-urlencoded': { schema: { type: 'object', additionalProperties: true } },
    },
};

const providerResponse = {
    '200': { description: 'The verified event was accepted; recorded is false for ignored or non-contribution events.', content: jsonContent(ref('SupportWebhookReceipt')) },
    '400': { description: 'The payload is malformed.', content: { 'text/plain': { schema: { type: 'string' } } } },
    '401': { description: 'The provider signature is invalid.', content: { 'text/plain': { schema: { type: 'string' } } } },
    '422': { description: 'The verified contribution is missing the identity required for delivery.', content: { 'text/plain': { schema: { type: 'string' } } } },
    '500': { description: 'The event could not be persisted.', content: { 'text/plain': { schema: { type: 'string' } } } },
    '503': { description: 'The provider webhook or donation ledger is not configured.', content: { 'text/plain': { schema: { type: 'string' } } } },
};

export const supportOperations = [
    { method: 'get', path: '/status', operationId: 'getSupportStatus', tag: 'System', summary: 'Check supporter service status', description: 'Reports checkout, provider, persistence, and Academy-bridge readiness without exposing secrets.', response: 'SupportStatus', errors: false },
    { method: 'get', path: '/healthz', operationId: 'getSupportHealth', tag: 'System', summary: 'Check supporter service health', description: 'Alias of `/status` for infrastructure health checks.', response: 'SupportStatus', errors: false },
    { method: 'get', path: '/goal', operationId: 'getSupportGoal', tag: 'Funding', summary: 'Read the monthly funding goal', description: 'Returns the public GBP operating-cost forecast and effective monthly goal.', response: 'SupportGoal', errors: false },
    { method: 'get', path: '/progress', operationId: 'getSupportProgress', tag: 'Funding', summary: 'Read verified contribution progress', description: 'Returns the public aggregate contribution progress used by Yomu’s support bar.', response: 'SupportProgress', errors: false },
    { method: 'get', path: '/donate', operationId: 'createDonationCheckout', tag: 'Checkout', summary: 'Open the contribution checkout', description: 'Creates a Stripe Checkout Session and redirects the browser.', parameters: [query('amount', { type: 'number', minimum: 1 }, 'Optional contribution amount.'), query('currency', { type: 'string', enum: ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY'] }, 'Checkout currency.')], responses: { '302': { description: 'Redirect to Stripe Checkout.', headers: { Location: { schema: { type: 'string', format: 'uri' } } } }, '503': { description: 'Checkout is not configured.', content: { 'text/plain': { schema: { type: 'string' } } } } } },
    { method: 'get', path: '/checkout', operationId: 'createDonationCheckoutAlias', tag: 'Checkout', summary: 'Open the contribution checkout (alias)', description: 'Backward-compatible alias of `/donate`.', parameters: [query('amount', { type: 'number', minimum: 1 }, 'Optional contribution amount.'), query('currency', { type: 'string' }, 'Checkout currency.')], responses: { '302': { description: 'Redirect to Stripe Checkout.', headers: { Location: { schema: { type: 'string', format: 'uri' } } } } }, deprecated: true },
    { method: 'get', path: '/claim', operationId: 'claimVerifiedDonation', tag: 'Checkout', summary: 'Claim a verified contribution', description: 'Completes the Stripe return flow using the checkout session id and the secure claim cookie issued before redirecting to Stripe.', parameters: [query('session_id', { type: 'string', pattern: '^cs_[A-Za-z0-9_-]{3,255}$' }, 'Stripe Checkout Session id.', true)], responses: { '200': { description: 'The permanent Academy access code.', content: { 'text/plain': { schema: { type: 'string' } } } }, '202': { description: 'The payment is still being confirmed. Retry after the indicated delay.', headers: { 'Retry-After': { schema: { type: 'integer', const: 2 } } }, content: { 'text/plain': { schema: { type: 'string' } } } }, '400': { description: 'The return link or claim cookie is incomplete.', content: { 'text/plain': { schema: { type: 'string' } } } }, '401': { description: 'The claim was not accepted.', content: { 'text/plain': { schema: { type: 'string' } } } }, '409': { description: 'The contribution could not be verified or is no longer claimable.', content: { 'text/plain': { schema: { type: 'string' } } } } } },
    { method: 'post', path: '/stripe/webhook', operationId: 'receiveStripeWebhook', tag: 'Provider webhooks', summary: 'Receive Stripe events', description: 'Signature-verified Stripe webhook ingress.', requestBody: providerBody, responses: providerResponse },
    { method: 'post', path: '/webhook', operationId: 'receiveStripeWebhookAlias', tag: 'Provider webhooks', summary: 'Receive Stripe events (legacy alias)', description: 'Legacy alias of `/stripe/webhook`.', requestBody: providerBody, responses: providerResponse, deprecated: true },
    { method: 'post', path: '/webhooks/kofi', operationId: 'receiveKofiWebhook', tag: 'Provider webhooks', summary: 'Receive Ko-fi events', description: 'Token-verified Ko-fi webhook ingress.', requestBody: providerBody, responses: providerResponse },
    { method: 'post', path: '/webhooks/bmac', operationId: 'receiveBmacWebhook', tag: 'Provider webhooks', summary: 'Receive Buy Me a Coffee events', description: 'HMAC-SHA256-verified Buy Me a Coffee donation webhook ingress.', requestBody: providerBody, responses: providerResponse },
    { method: 'post', path: '/webhooks/paypal', operationId: 'receivePaypalWebhook', tag: 'Provider webhooks', summary: 'Receive PayPal events', description: 'PayPal-postback-verified capture webhook ingress.', requestBody: providerBody, responses: providerResponse },
    { method: 'post', path: '/webhooks/patreon', operationId: 'receivePatreonWebhook', tag: 'Provider webhooks', summary: 'Receive Patreon events', description: 'Signature-verified Patreon webhook ingress.', requestBody: providerBody, responses: providerResponse },
];

const supportDocument = makeDocument({
    title: 'Yomu Support API', version: '1.0.0',
    description: 'Public funding status, contribution checkout, verified donation claims, and provider webhook ingress.',
    server: 'https://support.yomureader.com',
    tags: [['System', 'Service readiness.'], ['Funding', 'Public cost and contribution totals.'], ['Checkout', 'Contribution checkout and access claims.'], ['Provider webhooks', 'Authenticated payment-provider ingress.']].map(([name, description]) => ({ name, description })),
    operations: supportOperations, schemas: supportSchemas,
});

const edgeSchemas = {
    EdgeStatus: { type: 'object', required: ['service', 'status', 'allowlistVersion', 'allowedMethods', 'allowedHosts', 'policy', 'budget', 'analytics'], properties: { service: { type: 'string', const: 'yomu-jpdb-public-proxy' }, status: { type: 'string', enum: ['ok', 'disabled'] }, allowlistVersion: { type: 'string' }, allowedMethods: { type: 'array', items: { type: 'string', enum: ['GET', 'HEAD'] } }, allowedHosts: { type: 'array', items: { type: 'string' } }, policy: { type: 'object', additionalProperties: { type: 'boolean' } }, budget: { type: 'object', additionalProperties: true }, analytics: { type: 'object', additionalProperties: true } }, additionalProperties: false },
};

export const edgeOperations = [
    { method: 'get', path: '/status', operationId: 'getEdgeStatus', tag: 'System', summary: 'Check edge gateway status', description: 'Reports the public allowlist and privacy policy without logging target queries or forwarding credentials.', response: 'EdgeStatus', errors: false },
    { method: 'get', path: '/healthz', operationId: 'getEdgeHealth', tag: 'System', summary: 'Check edge gateway health', description: 'Alias of `/status` for infrastructure health checks.', response: 'EdgeStatus', errors: false },
    { method: 'get', path: '/', operationId: 'proxyPublicJapaneseResource', tag: 'Gateway', summary: 'Fetch an allowlisted public resource', description: 'CORS-enables an anonymous GET/HEAD to a strictly allowlisted Japanese-learning resource. Private/local targets, credentials, sensitive query parameters, cookies, and arbitrary hosts are rejected.', parameters: [query('url', { type: 'string', format: 'uri' }, 'Absolute HTTPS URL on the public allowlist.', true)], responses: { '200': { description: 'The allowlisted upstream response. Content type is preserved.', content: { '*/*': { schema: { type: 'string', format: 'binary' } } } }, '400': { description: 'The target is absent or not allowed.', content: { 'text/plain': { schema: { type: 'string' } } } }, '429': { description: 'The public daily budget or an upstream cooldown is active.', content: { 'text/plain': { schema: { type: 'string' } } } }, '503': { description: 'The public gateway is disabled.', content: { 'text/plain': { schema: { type: 'string' } } } } }, errors: false },
];

const edgeDocument = makeDocument({
    title: 'Yomu Edge API', version: '1.0.0',
    description: 'Anonymous, read-only, privacy-preserving CORS gateway for a narrow allowlist of public Japanese-learning resources.',
    server: 'https://edge.yomureader.com',
    tags: [{ name: 'System', description: 'Gateway policy and readiness.' }, { name: 'Gateway', description: 'Allowlisted anonymous reads.' }],
    operations: edgeOperations, schemas: edgeSchemas,
});

export const serviceDocuments = {
    academy: academyDocument,
    audio: audioDocument,
    support: supportDocument,
    edge: edgeDocument,
};

export function validateOpenApiDocuments(documents = serviceDocuments) {
    const operationIds = new Set();
    for (const [service, document] of Object.entries(documents)) {
        if (document.openapi !== '3.1.0') throw new TypeError(`${service} must use OpenAPI 3.1.0.`);
        if (!Object.keys(document.paths).length) throw new TypeError(`${service} has no paths.`);
        for (const [path, pathItem] of Object.entries(document.paths)) {
            if (!path.startsWith('/')) throw new TypeError(`${service} path ${path} is not absolute.`);
            for (const [method, operation] of Object.entries(pathItem)) {
                if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
                if (!operation.operationId) throw new TypeError(`${service} ${method} ${path} has no operationId.`);
                if (operationIds.has(operation.operationId)) throw new TypeError(`Duplicate operationId ${operation.operationId}.`);
                operationIds.add(operation.operationId);
                if (!operation.responses || !Object.keys(operation.responses).length) {
                    throw new TypeError(`${operation.operationId} has no responses.`);
                }
            }
        }
    }
    return { services: Object.keys(documents).length, operations: operationIds.size };
}
