import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type GradeResult, type ReviewSeed, type ValidationIssue } from '../../domain/activity-runtime';
import { gradeFromScore, text, validateFeedback } from '../activity-kit/shared';
import type {
    StateInspectionModel,
    StateInspectionResponse,
    StateInspectionRound,
    StateInspectionSourceVisual,
} from './manifest';

const LESSON_39_PROFILE = {
    packageId: 'l2-l14', packageOrder: 41, responseKind: 'moodle-chapter-29-resulting-state-inspection',
    moduleId: 8121267, archiveId: 'archive-000087', sourceAudioMembers: 4,
    mediaStatus: 'audio-members-quarantined-unpaired',
    answerKeyBasis: 'yomu-derived-completions-over-canonical-source-pages-and-prompts',
    minna: 'Minna no Nihongo II · Lesson 29', genki: '≈ Genki II · Resulting states and verb pairs',
    sourceSheets: [
        visual('3b6d33916d8db01f3aa529f0d908f32cdff051c259f7e3c53f0e90f54e685605', 'Handouts/New_Chapter 29-1〜ている-4_intransitive verbs_States in Effect grammar exercise.pdf', 1, '/academy/content/lessons/l2-l14/moodle-chapter-29-1-states-page-1.png', '2e2caf0281d4fded34bbe048ea394bbd68587c65368dcfcb24fc5aa51b3668de'),
        visual('3b6d33916d8db01f3aa529f0d908f32cdff051c259f7e3c53f0e90f54e685605', 'Handouts/New_Chapter 29-1〜ている-4_intransitive verbs_States in Effect grammar exercise.pdf', 2, '/academy/content/lessons/l2-l14/moodle-chapter-29-1-states-page-2.png', 'b96eb554de5fe31948496e2584883a77d1a0312ae8a1ba40754fb773b00d7127'),
        visual('3b6d33916d8db01f3aa529f0d908f32cdff051c259f7e3c53f0e90f54e685605', 'Handouts/New_Chapter 29-1〜ている-4_intransitive verbs_States in Effect grammar exercise.pdf', 3, '/academy/content/lessons/l2-l14/moodle-chapter-29-1-states-page-3.png', '7e96bf07343e125e13aa037620067d968cb6ae4577b3ba575e61b0ba6481225f'),
        visual('3b6d33916d8db01f3aa529f0d908f32cdff051c259f7e3c53f0e90f54e685605', 'Handouts/New_Chapter 29-1〜ている-4_intransitive verbs_States in Effect grammar exercise.pdf', 4, '/academy/content/lessons/l2-l14/moodle-chapter-29-1-states-page-4.png', '6ece5c49c000519585b15a5d3510b8b2943f4c4832199b15642af475f0fadcd9'),
    ],
    headings: [
        [1, '1: Look at the picture below and please describe the state in effect.'],
        [2, '2: Following the example, please create sentence to tell the state and what to do.'],
        [5, '5: Following the example, please create sentence to tell the state and what to do.'],
    ],
    interactions: ['state-select', 'state-select', 'state-select', 'action-choice', 'action-choice', 'action-choice', 'typed-report', 'typed-report'],
    tasks: [1, 1, 1, 2, 2, 2, 2, 5], items: [1, 2, 3, 1, 2, 3, 4, 1], pages: [2, 2, 2, 2, 2, 2, 2, 3],
    teachingCount: 5,
} as const;

const LESSON_41_PROFILE = {
    packageId: 'l2-l16', packageOrder: 43, responseKind: 'moodle-chapter-30-prepared-state-audit',
    moduleId: 8121269, archiveId: 'archive-000066', sourceAudioMembers: 3,
    mediaStatus: 'audio-members-quarantined-unpaired',
    answerKeyBasis: 'yomu-derived-prepared-state-reports-over-canonical-source-pages-and-prompts',
    minna: 'Minna no Nihongo II · Lesson 30', genki: '≈ Genki II · Prepared resultant states',
    sourceSheets: [
        visual('a24f5e14a09ee74f45855296fa1a0df00775a7e9037c0ec6fc350e6b98a26db8', 'Handouts/Chapter 30-1 Vocabulary Sheet.pdf', 1, '/academy/content/lessons/l2-l16/moodle-chapter-30-1-vocabulary-page-1.png', '1152918885025693d42f59d0844e315acf7aacf0fa1747ba5509aac317dd38e1'),
        visual('a24f5e14a09ee74f45855296fa1a0df00775a7e9037c0ec6fc350e6b98a26db8', 'Handouts/Chapter 30-1 Vocabulary Sheet.pdf', 2, '/academy/content/lessons/l2-l16/moodle-chapter-30-1-vocabulary-page-2.png', '5bbae29bcf083f2b9f6c1843c1848b32bbe294b2079ed2528bff2ceea3c12754'),
        visual('0db539c444b66c4e83424da858d8206c2dfa0e34f80c3d4342605a20ff9ecada', 'Handouts/Chapter 30-1 〜てある-1 Grammar exercise.pdf', 1, '/academy/content/lessons/l2-l16/moodle-chapter-30-1-tearu-1-page-1.png', '5d9c9a9e3a2b241eb3a31ff96855f2ce24e0987dd6a1c5b5f632226b181d535c'),
        visual('0db539c444b66c4e83424da858d8206c2dfa0e34f80c3d4342605a20ff9ecada', 'Handouts/Chapter 30-1 〜てある-1 Grammar exercise.pdf', 2, '/academy/content/lessons/l2-l16/moodle-chapter-30-1-tearu-1-page-2.png', 'b8786e398c80109f92caa5fd9cf9ec129348f1ff541005d5e592f4b7a21a9cd6'),
        visual('1c3abd70bbd7971c9bdb119d400634d088356bb22c68495daf9a722b46ed9cf9', 'Handouts/Chapter 30-1 〜てある-2 Grammar exercise and summary.pdf', 1, '/academy/content/lessons/l2-l16/moodle-chapter-30-1-tearu-2-page-1.png', 'ddc590cf0270e321e98b933ccc2972798367051343e3ca221f88bcfc5dcc430f'),
        visual('1c3abd70bbd7971c9bdb119d400634d088356bb22c68495daf9a722b46ed9cf9', 'Handouts/Chapter 30-1 〜てある-2 Grammar exercise and summary.pdf', 2, '/academy/content/lessons/l2-l16/moodle-chapter-30-1-tearu-2-page-2.png', '9f98114f963287be60c3ab2074af0823c229d078cff290fc15a0c0008853016f'),
        visual('1c3abd70bbd7971c9bdb119d400634d088356bb22c68495daf9a722b46ed9cf9', 'Handouts/Chapter 30-1 〜てある-2 Grammar exercise and summary.pdf', 3, '/academy/content/lessons/l2-l16/moodle-chapter-30-1-tearu-2-page-3.png', 'e44924a1d24809feaa577fb59c0ca90b64fded5743fba2d3ede3457a4b78529d'),
        visual('ec9736ce5fe4c09b825ad9d47cf216821f7ac96ac461b05f5ab5a85f63ac898e', 'Handouts/Chapter 30 〜てある information gap exercise_completed.pdf', 1, '/academy/content/lessons/l2-l16/moodle-chapter-30-information-gap-page-1.png', 'db345d3097b5e664a19d1274c3c0eda961f6406ac6ac9536614518c45de86556'),
    ],
    headings: [
        [6, '6: Please choose an appropriate one: 〜ています／〜てあります.'],
        [2, '2: Look at the picture below and create sentences: どこに なにが ありますか / それは どこに ありますか.'],
        ['room-a', '1: Please explain Room A so your classmate can draw a picture.'],
    ],
    interactions: ['state-select', 'state-select', 'state-select', 'action-choice', 'action-choice', 'typed-report', 'typed-report', 'typed-report'],
    tasks: [6, 6, 6, 2, 2, 2, 2, 'room-a'], items: [1, 2, 3, 1, 2, 3, 4, 1], pages: [3, 3, 3, 2, 2, 2, 2, 1],
    teachingCount: 5,
} as const;

const LESSON_42_PROFILE = {
    packageId: 'l2-l17', packageOrder: 44, responseKind: 'moodle-chapter-30-advance-preparation',
    moduleId: 8121270, archiveId: 'archive-000008', sourceAudioMembers: 4,
    mediaStatus: 'audio-members-quarantined-unpaired',
    answerKeyBasis: 'sensei-verbatim-examples-and-yomu-derived-deterministic-completions-over-canonical-source-pages',
    minna: 'Minna no Nihongo II · Lesson 30', genki: '≈ Genki II · Advance preparation and leaving things as they are',
    sourceSheets: [
        visual('46a2d4445826046b564660774854fa065595dc103c2baaa2f2aa3ec3c5646bb6', 'Chapter 30-2 〜ておきますGrammar Speaking exercise', 1, '/academy/content/lessons/l2-l17/moodle-chapter-30-2-teoku-speaking-page-1.png', '03e596ec3b21e2f56ac996e5745aa6af45cd6173887582ab4a8f235d801cb902'),
        visual('90b589e71a04e270602824c2c12497ca171baa8a347b251dc0ce9f1ec4e32eb3', 'Chapter 30-2 〜ておく-1,2,3 Grammar exercise', 1, '/academy/content/lessons/l2-l17/moodle-chapter-30-2-teoku-grammar-page-1.png', '7b63a738f396068857231f336a4cae5d523693a387e0bed999b4ca73eb1571b4'),
        visual('90b589e71a04e270602824c2c12497ca171baa8a347b251dc0ce9f1ec4e32eb3', 'Chapter 30-2 〜ておく-1,2,3 Grammar exercise', 2, '/academy/content/lessons/l2-l17/moodle-chapter-30-2-teoku-grammar-page-2.png', '9f3f61f2e4ef494dd62609f86e788d19eca778c4743942282294b4a3cbab015e'),
        visual('90b589e71a04e270602824c2c12497ca171baa8a347b251dc0ce9f1ec4e32eb3', 'Chapter 30-2 〜ておく-1,2,3 Grammar exercise', 3, '/academy/content/lessons/l2-l17/moodle-chapter-30-2-teoku-grammar-page-3.png', 'de4ec14cbdfad8a2b137140968bd2ff8ae3c55e99c85c32e712b56981e9a6b09'),
        visual('90b589e71a04e270602824c2c12497ca171baa8a347b251dc0ce9f1ec4e32eb3', 'Chapter 30-2 〜ておく-1,2,3 Grammar exercise', 4, '/academy/content/lessons/l2-l17/moodle-chapter-30-2-teoku-grammar-page-4.png', '49907afc412052e69c4584da08181e11cf2285c87e22a558204ef067819e73a7'),
        visual('90b589e71a04e270602824c2c12497ca171baa8a347b251dc0ce9f1ec4e32eb3', 'Chapter 30-2 〜ておく-1,2,3 Grammar exercise', 5, '/academy/content/lessons/l2-l17/moodle-chapter-30-2-teoku-grammar-page-5.png', '36d227d976d9fbf5c6034fe6c1e69445b8e9b56261017049109eb6b2cf247689'),
        visual('8881424ea8009aec174aee22a0b404d89fc177e1422cd6986ff51ad7e4426eb4', 'New Chapter 30-2 Vocabulary Sheet', 1, '/academy/content/lessons/l2-l17/moodle-chapter-30-2-vocabulary-page-1.png', '2cd5b7dae44b376aab79ef533b94153518a6cc221386c2d1423caedd5f050917'),
        visual('8881424ea8009aec174aee22a0b404d89fc177e1422cd6986ff51ad7e4426eb4', 'New Chapter 30-2 Vocabulary Sheet', 2, '/academy/content/lessons/l2-l17/moodle-chapter-30-2-vocabulary-page-2.png', '8bea9a4e4de77280beea393440b6a06efbed9a6083f395d25543b3d4de4646e7'),
    ],
    headings: [
        [1, '1: Create a sentence using 〜まえに／〜のまえに and 〜ておきます.'],
        [3, '3: Ask or suggest what should be prepared for an upcoming event.'],
        [2, '2: Complete a necessary action in preparation for the next use.'],
        ['note', 'Note: distinguish ています, てあります, and ておきます.'],
    ],
    interactions: ['action-choice', 'action-choice', 'typed-report', 'typed-report', 'state-select', 'typed-report', 'state-select', 'action-choice'],
    tasks: [1, 1, 1, 3, 2, 2, 3, 'note'], items: [1, 2, 3, 1, 1, 2, 1, 3], pages: [1, 1, 1, 2, 3, 3, 3, 5],
    teachingCount: 6,
} as const;

const LESSON_43_PROFILE = {
    packageId: 'l2-l18', packageOrder: 45, responseKind: 'moodle-chapter-30-message-handoff',
    moduleId: 8121271, archiveId: 'archive-000044', sourceAudioMembers: 1,
    sourceAudioTracksDelivered: 1,
    mediaStatus: 'audio-member-verified-script-and-worksheet-pairing',
    answerKeyBasis: 'sensei-verbatim-examples-and-separately-attributed-yomu-model-completions-over-canonical-source-pages',
    minna: 'Minna no Nihongo II · Lessons 26 and 30 review',
    genki: '≈ Genki II · Examples, explanations, and careful requests',
    sourceSheets: [
        visual('0da41a083ba196d0b8dab00b5ccd06baf4e649bdb9c1ea047b926277a0690851', 'Chapter 30-3 Vocabulary Sheet', 1, '/academy/content/lessons/l2-l18/moodle-chapter-30-3-vocabulary-1.png', 'b0c0670c80adc4b31ecae77d56f83311b6d22a6184594f025c19d66581f43c38'),
        visual('0da41a083ba196d0b8dab00b5ccd06baf4e649bdb9c1ea047b926277a0690851', 'Chapter 30-3 Vocabulary Sheet', 2, '/academy/content/lessons/l2-l18/moodle-chapter-30-3-vocabulary-2.png', 'a7644b9f3dc5c4d2d8a9642c006aa4166a775b37bb6ca2e3eeef78ba79c3a51f'),
        visual('d8bde07203834d887897daedd75dd7378b3e3adebd02fc3d222c4288b271fca3', 'Reference Chapter 30 Vocabulary Emergency', 1, '/academy/content/lessons/l2-l18/moodle-chapter-30-emergency-vocabulary-1.png', '422c0d4534842be79f1007bd388cf573371e339b9d2c5e47c576aca74424e0de'),
        visual('a3047558bbefa828f2ba023e62bb9ea039e9ddbe1cd507b196b7015c037f3ffe', 'Chapter 30-3 〜とか、〜とか Grammar listening speaking exercise', 1, '/academy/content/lessons/l2-l18/moodle-chapter-30-3-toka-grammar-1.png', 'd01f3cd3ac1b2b26fbd26fbc24dd135cafcf99cb58314f605223cd4a17e73db3'),
        visual('a3047558bbefa828f2ba023e62bb9ea039e9ddbe1cd507b196b7015c037f3ffe', 'Chapter 30-3 〜とか、〜とか Grammar listening speaking exercise', 2, '/academy/content/lessons/l2-l18/moodle-chapter-30-3-toka-grammar-2.png', '9e0c96b76d8f0b25881ab8a3a1bd3ae9c181436e44151aa0e97b8d20f6c5f28c'),
        visual('38a9974c41c43cea05d332ce504149b6614f1cd6069fe00570a2a447ae1d3c13', 'Chapter 30 Conversation listening script', 1, '/academy/content/lessons/l2-l18/moodle-chapter-30-conversation-script-1.png', '32845fc5e1416ee779018a2245a5973103b3907523e8e2f3f8a48534f8c5dce0'),
        visual('e63689d47daab01e6e21698fc5f0267f17cdabe00cad3f25cc63ceb701b594c6', 'Chapter 30 Conversation listening', 1, '/academy/content/lessons/l2-l18/moodle-chapter-30-conversation-listening-1.png', '97b1a7cbc76a2df6eb8c0813c1b7a7fd8ecf68d39518261aa44e0365066b8b75'),
        visual('dacefe0eb959a982fd3df004782eb757da08b278dfa581bd5741d6beddad6f44', 'Chapter 30 reading and speaking 伝言メモ', 1, '/academy/content/lessons/l2-l18/moodle-chapter-30-message-memo-1.png', 'f2ce68d61198cf057550c2075fd7b08eae181fd2ae6c22012092a21d7a760865'),
        visual('dacefe0eb959a982fd3df004782eb757da08b278dfa581bd5741d6beddad6f44', 'Chapter 30 reading and speaking 伝言メモ', 2, '/academy/content/lessons/l2-l18/moodle-chapter-30-message-memo-2.png', '4ef9d5d4a08a96608e4ee6dcfcc14eac819c41af325888f5bf26782291ecc833'),
        visual('5118e6832fcfd924f93ec8636c2acb046db30bfed53df067e2e471b1e5f1c46f', 'New HW Chapter 26-30 grammar review-1', 1, '/academy/content/lessons/l2-l18/moodle-chapter-26-30-review-1.png', '14ba5a05b417df87caae0929d1911c738b105d31982c6a86e045b5dd9111e9d6'),
        visual('305a4d89c101682a4475ceebfe249ea7ff1129142a9d475391fa0920ea91c9ff', 'New HW Chapter 30 grammar review てある ている ておく', 1, '/academy/content/lessons/l2-l18/moodle-chapter-30-state-review-1.png', 'ccd631965e0684ba9648b77cca66a2779fc6367a37455c198708b6c89c19914b'),
    ],
    answerSheets: [
        visual('de21995ba280fc828e67ce6e74a533069b86e03945a9046472a2681b494d0c06', 'Chapter 30 quiz あります います おきます answer', 1, '/academy/content/lessons/l2-l18/moodle-chapter-30-answer-1.png', '5a5fd16d22b9abfd66109e48daa8e1aff854cc7fd090da51af7b853e7a9c2423'),
    ],
    headings: [
        ['vocabulary', 'Emergency vocabulary: prepare what the reference page names.'],
        [1, '〜とか: give open, general examples.'],
        ['listening', 'Conversation listening: replay Track 13, then answer from what you heard.'],
        ['message', '伝言メモ: preserve the instruction the recipient must act on.'],
        ['review', 'Chapter 26–30 review: repair the form, then contrast Chapter 30 states.'],
    ],
    interactions: ['action-choice', 'action-choice', 'typed-report', 'action-choice', 'state-select', 'typed-report', 'typed-report', 'action-choice'],
    tasks: ['vocabulary', 1, 1, 'listening', 'message', 'message', 'review', 'review'],
    items: [3, 1, 4, 4, 5, 1, 5, 4], pages: [1, 1, 1, 1, 1, 2, 1, 1],
    teachingCount: 7,
} as const;

const LESSON_44_PROFILE = {
    packageId: 'l2-l19', packageOrder: 46, responseKind: 'moodle-chapter-31-volitional-plan',
    moduleId: 8121273, archiveId: 'archive-000084', sourceAudioMembers: 0,
    mediaStatus: 'no-audio-members-in-package',
    answerKeyBasis: 'sensei-verbatim-form-tables-and-yomu-derived-deterministic-volitional-completions-over-canonical-source-pages',
    minna: 'Minna no Nihongo II · Lesson 31', genki: '≈ Genki II · Volitional form and intentions',
    sourceSheets: [
        visual('092723d74f266e627c7eefba92cc567cba80328fe7961e19ca321e2d1495ddee', 'Chapter 31 volitional form', 1, '/academy/content/lessons/l2-l19/moodle-chapter-31-volitional-page-1.png', '937da5c5e578dfcaf1d651815233f119f8c2da0a82d6f1586c23609e90e6f3b7'),
        visual('092723d74f266e627c7eefba92cc567cba80328fe7961e19ca321e2d1495ddee', 'Chapter 31 volitional form', 2, '/academy/content/lessons/l2-l19/moodle-chapter-31-volitional-page-2.png', '6f085bcf2b068cc7ae7be47d30696fd556cd111fd2b8e684f4b65ae187308721'),
        visual('4da024b1ca32facc7b41b03895910d6bc681f98c7116d5789780b7d220f4a2a5', 'New HW Chapter 31 Creating volitional form', 1, '/academy/content/lessons/l2-l19/moodle-chapter-31-form-sheet-page-1.png', 'de41bd3514974735073a89df40c03fd2f124a343ff2abd28ad37fc8594e595d5'),
        visual('4da024b1ca32facc7b41b03895910d6bc681f98c7116d5789780b7d220f4a2a5', 'New HW Chapter 31 Creating volitional form', 2, '/academy/content/lessons/l2-l19/moodle-chapter-31-form-sheet-page-2.png', '1ec250f9b336d7dc5dccd8bd875a400da969cc860c0a04f3d1da531a00e30c6b'),
    ],
    headings: [
        [1, '1: Check √ to create Volitional form of verbs.'],
        [2, '2: Try again! How to classify and create Potential forms. Please fill in the brackets.'],
        [3, '3: Please complete the chart. If you don’t know the meaning, please check them.'],
    ],
    interactions: ['action-choice', 'typed-report', 'state-select', 'typed-report', 'typed-report', 'state-select', 'action-choice', 'typed-report'],
    tasks: [1, 1, 2, 2, 3, 3, 3, 3], items: [1, 2, 1, 2, 1, 2, 3, 4], pages: [1, 1, 1, 1, 2, 2, 2, 2],
    teachingCount: 4,
} as const;

const LESSON_45_PROFILE = {
    packageId: 'l2-l20', packageOrder: 47, responseKind: 'moodle-chapter-31-intention-route',
    moduleId: 8121275, archiveId: 'archive-000064', sourceAudioMembers: 1,
    mediaStatus: 'audio-member-quarantined-pairing-unproven',
    answerKeyBasis: 'sensei-verbatim-intention-examples-and-yomu-derived-deterministic-completions-over-canonical-source-pages',
    minna: 'Minna no Nihongo II · Lesson 31', genki: '≈ Genki II · Volitional form and intentions',
    sourceSheets: [
        visual('ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef', 'Chapter 31-1 〜ようと思っています grammar exercise', 1, '/academy/content/lessons/l2-l20/moodle-chapter-31-intention-grammar-page-1.png', '28837b83244eb87d41b1cad8afdf980303ed25ba669a39c8864700c44c7ba9f8'),
        visual('ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef', 'Chapter 31-1 〜ようと思っています grammar exercise', 2, '/academy/content/lessons/l2-l20/moodle-chapter-31-intention-grammar-page-2.png', '6846226c05243a01905183c38d2bf08d24772a28850173e7b55318e363ed30ba'),
        visual('d76736ced083bb11fe341e9f7f344777b75b3ce1be3dc6be841cef178ff02e3c', 'Chapter 31-1 verb volitional form exercise', 1, '/academy/content/lessons/l2-l20/moodle-chapter-31-volitional-exercise-page-1.png', '67af928bf27e3fc6593eb46419cae00826b2fcf8866ec7d74669b097f91983ce'),
        visual('d76736ced083bb11fe341e9f7f344777b75b3ce1be3dc6be841cef178ff02e3c', 'Chapter 31-1 verb volitional form exercise', 2, '/academy/content/lessons/l2-l20/moodle-chapter-31-volitional-exercise-page-2.png', 'df2dedc3a96c914a0dd3e72d9dbe1e587baf177c8f32edaca6889b55f6c5949f'),
        visual('3a4757f4bdccdc447df62720a1ec466d4272b9f137c8b2d5db90d1a1d953b895', 'Chapter 31-1 Vocabulary Sheet', 1, '/academy/content/lessons/l2-l20/moodle-chapter-31-vocabulary-page-1.png', 'c59b0398fc3587f6a1c3926b22bb233180f25f3e65cbe5cad2a4c6ba9c3d0f2e'),
        visual('3a4757f4bdccdc447df62720a1ec466d4272b9f137c8b2d5db90d1a1d953b895', 'Chapter 31-1 Vocabulary Sheet', 2, '/academy/content/lessons/l2-l20/moodle-chapter-31-vocabulary-page-2.png', 'e1cb38564b1a6b8d1e9918f414f6ed980f331dfc3a3e083ac8873d0286757145'),
    ],
    headings: [
        [1, '1: Construct sentences as in example.'],
        [2, '2: Create sentences using〜ようとおもっています'],
    ],
    interactions: ['action-choice', 'typed-report', 'state-select', 'typed-report', 'action-choice', 'typed-report', 'state-select', 'typed-report'],
    tasks: [1, 1, 1, 1, 2, 2, 2, 2], items: [1, 2, 4, 6, 1, 2, 3, 4], pages: [2, 2, 2, 2, 2, 2, 2, 2],
    teachingCount: 4,
} as const;

const LESSON_46_PROFILE = {
    packageId: 'l2-l21', packageOrder: 48, responseKind: 'moodle-chapter-31-plan-change-repair',
    moduleId: 8121277, archiveId: 'archive-000010', sourceAudioMembers: 6,
    mediaStatus: 'audio-members-quarantined-unpaired',
    answerKeyBasis: 'sensei-verbatim-examples-and-yomu-derived-deterministic-completions-over-canonical-source-pages',
    minna: 'Minna no Nihongo II · Lesson 31', genki: '≈ Genki II · Volitional form and intentions',
    sourceSheets: [
        visual('8c1351970eebe85982be7e175f957914d21bd30abfcb16e21098b00b9cbea8a9', 'Chapter 31-2 Vocabulary Sheet', 1, '/academy/content/lessons/l2-l21/moodle-chapter-31-2-vocabulary-page-1.png', 'b6ddb6e94a83d6bae470f30807bf79bd3d672f0128e8dbd1a1407fd995dc2ff6'),
        visual('8c1351970eebe85982be7e175f957914d21bd30abfcb16e21098b00b9cbea8a9', 'Chapter 31-2 Vocabulary Sheet', 2, '/academy/content/lessons/l2-l21/moodle-chapter-31-2-vocabulary-page-2.png', '566fcbb4db961dbaa03bd0fc1900a90b49eeb9ab6b48e53b1854e8704e97a4c9'),
        visual('105aa28ed8bd9294f8ecfab64aa145b425ee49df13cdb19debe7824b5651da74', 'Chapter 31-2 つもり よてい grammar exercise', 1, '/academy/content/lessons/l2-l21/moodle-chapter-31-2-tsumori-yotei-page-1.png', '251c6515ec63247e1688d2879dd1f55b55f57dee273b69bd5d831277220d079a'),
        visual('105aa28ed8bd9294f8ecfab64aa145b425ee49df13cdb19debe7824b5651da74', 'Chapter 31-2 つもり よてい grammar exercise', 2, '/academy/content/lessons/l2-l21/moodle-chapter-31-2-tsumori-yotei-page-2.png', '10649eeb7297c8bbc48b70e1eb39e2e25eef70170edc8fde81b6fa26873d3887'),
        visual('105aa28ed8bd9294f8ecfab64aa145b425ee49df13cdb19debe7824b5651da74', 'Chapter 31-2 つもり よてい grammar exercise', 3, '/academy/content/lessons/l2-l21/moodle-chapter-31-2-tsumori-yotei-page-3.png', 'd835b0dcca0385f8b8f4fedb1a4067a7db23b17a7797fbc9d24f5b4e48aae210'),
        visual('105aa28ed8bd9294f8ecfab64aa145b425ee49df13cdb19debe7824b5651da74', 'Chapter 31-2 つもり よてい grammar exercise', 4, '/academy/content/lessons/l2-l21/moodle-chapter-31-2-tsumori-yotei-page-4.png', 'd8e0f90c50716fad63b470486314f3fb0c77f13274836ef6280f88c255fbeee2'),
        visual('37db0f595c82d4179a7dde9630482e04d09753c818e0138f8e2dc4de12f517d2', 'Chapter 31 つもり-2 grammar exercise', 1, '/academy/content/lessons/l2-l21/moodle-chapter-31-3-tsumori-conviction-page-1.png', '4b47397b2c309842c4ea85d5df7b6623993b3f1ab7b8c95ca7830a0c0cd0c214'),
        visual('10572e757fa6dc59353ce6a873efcc14cd82a7def16cef381ed421474b317454', 'HW Chapter 31 grammar review-2 〜つもり 〜よてい', 1, '/academy/content/lessons/l2-l21/moodle-chapter-31-homework-plan-review-page-1.png', '5ae680e64834193b0cc80d3b070dec6c4d8e33f30a63dd16ea994a88907aaab5'),
        visual('10572e757fa6dc59353ce6a873efcc14cd82a7def16cef381ed421474b317454', 'HW Chapter 31 grammar review-2 〜つもり 〜よてい', 2, '/academy/content/lessons/l2-l21/moodle-chapter-31-homework-plan-review-page-2.png', 'a4f04e04b3ad749ab36ff3da22849be0782b19e009fa7b5383ffc4bcc767c8ed'),
    ],
    headings: [
        ['vocabulary', 'Chapter 31-2 vocabulary: read the exact planning, travel, and explanation words before the grammar work.'],
        ['grammar', '1–2: Read the source contrast, then form an intention or a scheduled plan.'],
        ['speaking', '4: Ask a partner about an Easter plan, then keep the difference between an arrangement and an intention clear.'],
        ['homework', 'Homework: use the printed travel example before making a responsible plan statement.'],
    ],
    interactions: ['action-choice', 'state-select', 'typed-report', 'action-choice', 'typed-report', 'state-select', 'action-choice', 'typed-report'],
    tasks: ['vocabulary', 'grammar', 'grammar', 'grammar', 'grammar', 'speaking', 'grammar', 'homework'],
    items: [1, 2, 3, 4, 5, 1, 1, 1], pages: [1, 1, 2, 3, 3, 4, 1, 2],
    teachingCount: 6,
} as const;

const LESSON_52_PROFILE = {
    packageId: 'l2-l25', packageOrder: 52, responseKind: 'moodle-chapter-32-probability-briefing',
    moduleId: 8121279, archiveId: 'archive-000078', sourceAudioMembers: 3,
    mediaStatus: 'audio-members-quarantined-unpaired',
    answerKeyBasis: 'sensei-verbatim-probability-examples-over-canonical-source-pages',
    minna: 'Minna no Nihongo II · Lesson 32', genki: 'No Genki prerequisite anchor; curriculum crosswalk gap declared',
    sourceSheets: [
        visual('4327bdf7c9734ac453b5453d6eb8997121d5f3e2e693d37e1d32772f830fad1b', 'New_Chapter 32-2 〜でしょう grammar_exercise', 1, '/academy/content/lessons/l2-l25/moodle-chapter-32-2-deshou-page-1.png', 'ae496e3085da40ad4916986038a38b6510c331bb9238f2687901682aa7838718'),
        visual('4327bdf7c9734ac453b5453d6eb8997121d5f3e2e693d37e1d32772f830fad1b', 'New_Chapter 32-2 〜でしょう grammar_exercise', 2, '/academy/content/lessons/l2-l25/moodle-chapter-32-2-deshou-page-2.png', 'ea386de18237eb9bfb44f4ccf1fa4255c35b48b028d24203a81a0df736ffb514'),
        visual('4327bdf7c9734ac453b5453d6eb8997121d5f3e2e693d37e1d32772f830fad1b', 'New_Chapter 32-2 〜でしょう grammar_exercise', 3, '/academy/content/lessons/l2-l25/moodle-chapter-32-2-deshou-page-3.png', '4c41b71aec0de71f696d84ee2819e69f8ee355ae48eac83dfef4ebab22565fbb'),
        visual('b2d999296ac31099b6dafcb7aa129663490c2d4048f12b02a8ac9351635ebc08', 'Chapter 32-3 〜かもしれません grammar_exercise', 1, '/academy/content/lessons/l2-l25/moodle-chapter-32-3-kamoshiremasen-page-1.png', 'ec0914378f28514af2d8b906658f295ced63c96f1754104fc66da1eb180f68f5'),
        visual('b2d999296ac31099b6dafcb7aa129663490c2d4048f12b02a8ac9351635ebc08', 'Chapter 32-3 〜かもしれません grammar_exercise', 2, '/academy/content/lessons/l2-l25/moodle-chapter-32-3-kamoshiremasen-page-2.png', 'c28481aaca331815a0abcbadfe5e6ab844dfa11bb197997c5bb3295bbb865fed'),
        visual('b2d999296ac31099b6dafcb7aa129663490c2d4048f12b02a8ac9351635ebc08', 'Chapter 32-3 〜かもしれません grammar_exercise', 3, '/academy/content/lessons/l2-l25/moodle-chapter-32-3-kamoshiremasen-page-3.png', 'aa0212a4c882d56aecc10a7c334981a7fc4510caae7b2da605944c88605b74e0'),
    ],
    headings: [
        ['grammar', 'Chapter 32-2 〜でしょう: read the rule and printed examples before choosing the stronger prediction.'],
        ['review', 'Chapter 32-3 〜かもしれません: read the rule and printed examples before keeping the smaller possibility open.'],
    ],
    interactions: ['action-choice', 'state-select', 'typed-report', 'action-choice', 'state-select', 'typed-report', 'action-choice', 'typed-report'],
    tasks: ['grammar', 'grammar', 'grammar', 'grammar', 'review', 'review', 'review', 'review'],
    items: [1, 2, 3, 4, 1, 2, 3, 4], pages: [1, 1, 1, 1, 1, 1, 1, 1],
    teachingCount: 5,
} as const;

const LESSON_56_PROFILE = {
    packageId: 'l2-l29', packageOrder: 56, responseKind: 'moodle-chapter-34-means-and-tea-listening',
    moduleId: 8121295, archiveId: 'archive-000001', sourceAudioMembers: 3,
    sourceAudioTracksDelivered: 1,
    mediaStatus: 'audio-member-verified-by-archive-task-script-identity',
    answerKeyBasis: 'sensei-verbatim-grammar-choices-and-script-grounded-listening-answers',
    minna: 'Minna no Nihongo II · Lesson 34',
    genki: '≈ Genki II · Means, attendant circumstances, and following instructions',
    sourceSheets: [
        visual('ba7cab72fb58a1573c5c721fef0d7bd11c5258a11a395c4a27f6a37c8503bd9f', 'Chapter 34-2 Vocabulary Sheet', 1, '/academy/content/lessons/l2-l29/moodle-chapter-34-2-vocabulary-1.png', '426ba2deb53196efe99959a04d0b90ac40bf49edb5eea6cecf815f94c1a33314'),
        visual('ba7cab72fb58a1573c5c721fef0d7bd11c5258a11a395c4a27f6a37c8503bd9f', 'Chapter 34-2 Vocabulary Sheet', 2, '/academy/content/lessons/l2-l29/moodle-chapter-34-2-vocabulary-2.png', '61e07b85aaaefa3b2a7c7ab4af592322fbf79609128cc25f7f6bf24d46d1a6f2'),
        visual('c1f433123a9cc856eb0445443eb8c76f673601c9ca66a61e0292870962a53fe0', 'Chapter 34-2_〜て_で_ないで-1_grammar exercise', 1, '/academy/content/lessons/l2-l29/moodle-chapter-34-2-te-de-naide-1.png', 'c7331af374d28490073b676762e904cb072b8c7c24e30ff20c05f831830ae8fc'),
        visual('c1f433123a9cc856eb0445443eb8c76f673601c9ca66a61e0292870962a53fe0', 'Chapter 34-2_〜て_で_ないで-1_grammar exercise', 2, '/academy/content/lessons/l2-l29/moodle-chapter-34-2-te-de-naide-2.png', 'da47a3e00aac1957d084b4aa9bfbfe8c5878bcdf35e4dbae5457a31cbf09dc98'),
        visual('c1f433123a9cc856eb0445443eb8c76f673601c9ca66a61e0292870962a53fe0', 'Chapter 34-2_〜て_で_ないで-1_grammar exercise', 3, '/academy/content/lessons/l2-l29/moodle-chapter-34-2-te-de-naide-3.png', '92c9f661b1eda4b2039c9eafaa6d639f6b80668cf63741a104b952ff0a482ec6'),
        visual('4ef611211a772b2aa164e4906260b3a719e79abd084dd6a3d81cf96b10521b5a', 'Chapter 34-2_〜て_で_ないで-2_grammar exercise', 1, '/academy/content/lessons/l2-l29/moodle-chapter-34-2-alternative-naide-1.png', '28e3ecb2843b18af686bbfdf9b1ac90a498d62575179ef4af3681c894bc55e9f'),
        visual('8633da381ade835b0c1f47a36fbcc5359bb604e9d3733db1f7b8f590d309c62e', 'Chapter 34-2_〜て_で_ないで-1 speaking practice-1', 1, '/academy/content/lessons/l2-l29/moodle-chapter-34-2-speaking-1.png', '401544677da0df0fe5c045681fb90db20661d5b9922657ee7bb4653ed3348296'),
        visual('65aaa460558043b069f759c31a3c0e1663080fbd2f795eb175a8037ad5da2f21', 'HW Chapter 34_Conversation listening', 1, '/academy/content/lessons/l2-l29/moodle-chapter-34-tea-listening-1.png', 'a8f7115154c2ce9258462900513461534b0853bba77da4e588dfde1bf2b4cd8b'),
        visual('d79b17c0a31646378f02d7a8ee4ab75a553d0997cfe636a2342f1eb57cba2927', 'Chapter 34_Conversation listening script', 1, '/academy/content/lessons/l2-l29/moodle-chapter-34-tea-script-1.png', '89fd7e24c44499e1eeb769088dbd10d0dad4666bca7c1df319532c10d9924bea'),
    ],
    headings: [
        ['vocabulary', 'Chapter 34-2 vocabulary: read the exact source rows before the grammar and listening tasks.'],
        [1, '2: Choose correct one in the brackets.'],
        ['listening', 'Chapter 34 conversation listening: replay Track 27, then answer the five source questions.'],
    ],
    interactions: ['action-choice', 'action-choice', 'action-choice', 'action-choice', 'typed-report', 'typed-report', 'action-choice', 'typed-report'],
    tasks: [1, 1, 1, 'listening', 'listening', 'listening', 'listening', 'listening'],
    items: [1, 2, 3, 1, 2, 3, 4, 5], pages: [2, 2, 2, 1, 1, 1, 1, 1],
    teachingCount: 6,
} as const;

const LESSON_57_PROFILE = {
    packageId: 'l2-l30', packageOrder: 57, responseKind: 'moodle-chapter-35-conditional-workshop',
    moduleId: 8121299, archiveId: 'archive-000025', sourceAudioMembers: 0,
    mediaStatus: 'no-audio-members-in-package',
    answerKeyBasis: 'sensei-verbatim-tables-proverb-and-example-with-yomu-derived-deterministic-conditional-joins',
    minna: 'Minna no Nihongo II · Lesson 35', genki: '≈ Genki II · parallel N4 scope',
    sourceSheets: [
        visual('9094654d6999483fedebbd644a7c13966c754c1f2d5e456c6a0ab8d3feb0948e', 'Chapter 35 conditional form', 1, '/academy/content/lessons/l2-l30/moodle-chapter-35-conditional-1.png', '54cb797da19389aee803b7bf3ea28c9169404b609ad821f6bc004c43e9955950'),
        visual('9094654d6999483fedebbd644a7c13966c754c1f2d5e456c6a0ab8d3feb0948e', 'Chapter 35 conditional form', 2, '/academy/content/lessons/l2-l30/moodle-chapter-35-conditional-2.png', 'c55c278e439360669e5c6b1c52f63d7a36ed8ef4ca4ba36379565e520a5bffc4'),
        visual('69cded81bfe44567286f274456fcd9bdfe4cfc771f4bcb7aa20e26b9512f7d27', 'Chapter 35 Reference Vocabulary_Proverbs', 1, '/academy/content/lessons/l2-l30/moodle-chapter-35-proverbs-1.png', '3bc703c3dbe6e811d3641cef375605f43e48758f27f721e21cd224256062b909'),
        visual('36993b824e4fe4f4ffee180d3dcc38e87aba11b05e19394736887135c8d485cb', 'Chapter 35-1_Verb conditionalば_なければ_grammar exercise', 1, '/academy/content/lessons/l2-l30/moodle-chapter-35-1-conditional-exercise-1.png', '42f9704a3a37087ace383e5b48f3b5444781ddad5b8912e82137e35adf26b401'),
        visual('36993b824e4fe4f4ffee180d3dcc38e87aba11b05e19394736887135c8d485cb', 'Chapter 35-1_Verb conditionalば_なければ_grammar exercise', 2, '/academy/content/lessons/l2-l30/moodle-chapter-35-1-conditional-exercise-2.png', 'a652275dc5665e48cfd7ae33fa371e6f048da18df2ded60dc7b98b75fd46750f'),
        visual('36993b824e4fe4f4ffee180d3dcc38e87aba11b05e19394736887135c8d485cb', 'Chapter 35-1_Verb conditionalば_なければ_grammar exercise', 3, '/academy/content/lessons/l2-l30/moodle-chapter-35-1-conditional-exercise-3.png', '58608fc14c6847f9c56e17e498497c32072e78f8605ea2e9556682a7977cc3bc'),
        visual('36993b824e4fe4f4ffee180d3dcc38e87aba11b05e19394736887135c8d485cb', 'Chapter 35-1_Verb conditionalば_なければ_grammar exercise', 4, '/academy/content/lessons/l2-l30/moodle-chapter-35-1-conditional-exercise-4.png', '94cf45911a8ee4d620d363b35c854ec90ee489f540979bb523a1fa9d1bcfbac8'),
        visual('36993b824e4fe4f4ffee180d3dcc38e87aba11b05e19394736887135c8d485cb', 'Chapter 35-1_Verb conditionalば_なければ_grammar exercise', 5, '/academy/content/lessons/l2-l30/moodle-chapter-35-1-conditional-exercise-5.png', 'f9f92ff40aec5acf1c03865b6debcb6dced7b38c759d4f46935d6cc626d0f743'),
    ],
    headings: [
        ['grammar', 'Chapter 35 Conditional form'],
        ['vocabulary', 'Chapter 35 Vocabulary_Proverbs'],
        [1, '1: join the two sentences into one sentences using conditional form 〜ば.'],
        [3, '3: join the two sentences into one sentences using conditional form 〜なければ.'],
        [6, '6: Short conversation-1: Please look at the example and give instructions how to use the word.'],
    ],
    interactions: ['action-choice', 'state-select', 'typed-report', 'action-choice', 'state-select', 'typed-report', 'action-choice', 'typed-report'],
    tasks: ['grammar', 'grammar', 'grammar', 'grammar', 'vocabulary', 1, 3, 6],
    items: [1, 2, 3, 4, 1, 1, 1, 1], pages: [1, 2, 2, 2, 1, 3, 3, 5],
    teachingCount: 6,
} as const;

const LESSON_58_PROFILE = {
    packageId: 'l2-l31', packageOrder: 58, responseKind: 'moodle-chapter-35-adjective-noun-conditionals',
    moduleId: 8121300, archiveId: 'archive-000048', sourceAudioMembers: 1,
    mediaStatus: 'audio-member-quarantined-pairing-unproven',
    answerKeyBasis: 'sensei-verbatim-vocabulary-and-prompts-with-yomu-derived-deterministic-adjective-noun-conditionals',
    minna: 'Minna no Nihongo II · Lesson 35', genki: '≈ Genki II · parallel N4 scope',
    sourceSheets: [
        visual('5fafa9605db9ee5937563a442379d249854d74db219767f0fde29e7a7f421411', 'Chapter 35-2 Vocabulary Sheet', 1, '/academy/content/lessons/l2-l31/moodle-chapter-35-2-vocabulary-1.png', 'c1e16d0582636e864a8eb0c96ad52d267612d706d04946acdd0c2740e1c5aeaa'),
        visual('5fafa9605db9ee5937563a442379d249854d74db219767f0fde29e7a7f421411', 'Chapter 35-2 Vocabulary Sheet', 2, '/academy/content/lessons/l2-l31/moodle-chapter-35-2-vocabulary-2.png', '93bc4379a5acee6d97c62198321017855637199d36e8076c68e90666157a9d6d'),
        visual('67bda5b3968519440ae273cf3c59f614ffc1b41a9875e84e79e7b74ca23e1dd4', 'Chapter 35-2_adj_noun conditional form 〜ければ 〜なら_grammar exercise', 1, '/academy/content/lessons/l2-l31/moodle-chapter-35-2-adjective-noun-conditional-1.png', 'd2ba5d2b67f78d33ab4415bcad29c2eacf26d6fb140343031701f4c5c79a19da'),
        visual('67bda5b3968519440ae273cf3c59f614ffc1b41a9875e84e79e7b74ca23e1dd4', 'Chapter 35-2_adj_noun conditional form 〜ければ 〜なら_grammar exercise', 2, '/academy/content/lessons/l2-l31/moodle-chapter-35-2-adjective-noun-conditional-2.png', 'a9627efdaf339b7a397c22586108832c5795caafdb934bbcd4e84222a8ab0719'),
    ],
    headings: [
        ['vocabulary', 'Chapter 35-2 Vocabulary Sheet'],
        [1, '1: Create conditional forms_adjectives and nouns'],
        [2, '2: Create one sentence using conditional form.'],
        [4, '4: Answer the questions using conditional form.'],
    ],
    interactions: ['state-select', 'action-choice', 'typed-report', 'action-choice', 'state-select', 'typed-report', 'action-choice', 'typed-report'],
    tasks: ['vocabulary', 'vocabulary', 1, 1, 1, 1, 2, 4],
    items: [18, 21, 10, 11, 12, 13, 1, 1], pages: [2, 2, 1, 1, 1, 1, 1, 2],
    teachingCount: 6,
} as const;

const LESSON_59_PROFILE = {
    packageId: 'l2-l32', packageOrder: 59, responseKind: 'moodle-chapter-35-nara-guidance-workshop',
    moduleId: 8121301, archiveId: 'archive-000042', sourceAudioMembers: 3,
    mediaStatus: 'three-audio-members-quarantined-unresolved-pairing',
    answerKeyBasis: 'sensei-verbatim-adjective-noun-and-nara-examples-with-no-source-answer-key-claim',
    minna: 'Minna no Nihongo II · Lessons 35–36', genki: '≈ Genki II · parallel N4 scope',
    sourceSheets: [
        visual('3368165df2d31b2d17c058e854e0958e55c7f4b0bad8f0339dbbbf9ac2ae0258', 'Chapter 35-2 Vocabulary Sheet', 1, '/academy/content/lessons/l2-l32/moodle-chapter-35-2-vocabulary-page-1.png', 'fa6f77b803c9d08f4c8db0407e80f36c51e63b3250f9eef8d64fea878fcfb3aa'),
        visual('3368165df2d31b2d17c058e854e0958e55c7f4b0bad8f0339dbbbf9ac2ae0258', 'Chapter 35-2 Vocabulary Sheet', 2, '/academy/content/lessons/l2-l32/moodle-chapter-35-2-vocabulary-page-2.png', 'cb7dcc7f8d63494d4b24ee5939d4bec8f2aa46b06b9cb899942199b2cc992500'),
        visual('67bda5b3968519440ae273cf3c59f614ffc1b41a9875e84e79e7b74ca23e1dd4', 'Chapter 35-2_adj_noun conditional form 〜ければ 〜なら_grammar exercise', 1, '/academy/content/lessons/l2-l32/moodle-chapter-35-2-adjective-noun-conditional-page-1.png', '44d14785120d35cc2ad260d75868dfaa821897d6db09a29fdefebb324f228b4e'),
        visual('67bda5b3968519440ae273cf3c59f614ffc1b41a9875e84e79e7b74ca23e1dd4', 'Chapter 35-2_adj_noun conditional form 〜ければ 〜なら_grammar exercise', 2, '/academy/content/lessons/l2-l32/moodle-chapter-35-2-adjective-noun-conditional-page-2.png', 'dfbed7d744624519feb8838e6b67cbb1480dbc6b256227b4bb0920b558087d33'),
        visual('89e6a87f527dc69b0535ba6347e84af82ad73f96d7cb3c3b6712420611e427ef', 'Chapter 35-3_noun〜なら_making suggestions grammar exercise', 1, '/academy/content/lessons/l2-l32/moodle-chapter-35-3-noun-nara-suggestions-page-1.png', 'd4db4b2406fe07b9798910c572265206247fcb307abe585982630e12b718eeec'),
        visual('89e6a87f527dc69b0535ba6347e84af82ad73f96d7cb3c3b6712420611e427ef', 'Chapter 35-3_noun〜なら_making suggestions grammar exercise', 2, '/academy/content/lessons/l2-l32/moodle-chapter-35-3-noun-nara-suggestions-page-2.png', '914c5362988c8dd45f2076014a506859d3c61e88cb4d9e95c744952bab5eb747'),
        visual('62242b14c4fd24c272e2f41da3f494757770eda77cec4f46e88344697b452424', 'Chapter 36 Reference Vocabulary_Health', 1, '/academy/content/lessons/l2-l32/moodle-chapter-36-health-vocabulary-page-1.png', '82597963956ef3cdd7422e7c11ab208c4aa8484fc02c55d0b6bf82b475f2b79b'),
    ],
    headings: [
        ['grammar', 'Basic sentence:'],
        [3, '3: Pair work_Create questions and answer to them. Please tell your own thoughts with Yes or No.'],
        ['speaking', '1: Please complete a sentence using 〜なら.'],
        [2, '2: Please complete a sentence using 〜なら and create your own reason.'],
    ],
    interactions: ['action-choice', 'state-select', 'typed-report', 'action-choice', 'state-select', 'typed-report', 'action-choice', 'typed-report'],
    tasks: ['grammar', 'grammar', 'grammar', 'grammar', 'speaking', 'speaking', 'speaking', 'speaking'],
    items: [1, 2, 3, 4, 1, 2, 3, 4], pages: [1, 1, 1, 1, 1, 1, 1, 1],
    teachingCount: 6,
} as const;

const LESSON_60_PROFILE = {
    packageId: 'l2-l33', packageOrder: 60, responseKind: 'moodle-chapter-35-nara-guidance-workshop',
    moduleId: 8121301, archiveId: 'archive-000042', sourceAudioMembers: 3,
    mediaStatus: 'three-audio-members-quarantined-unresolved-pairing',
    answerKeyBasis: 'sensei-verbatim-adjective-noun-and-nara-examples-with-no-source-answer-key-claim',
    minna: 'Minna no Nihongo II · Lessons 35–36', genki: '≈ Genki II · parallel N4 scope',
    sourceSheets: [
        visual('bf9737e27d9ffc740f8bc597538968157f5b87c63207e28a2c55b6dae9ad66ce', 'HW Chapter 35 grammar review', 1, '/academy/content/lessons/l2-l33/moodle-hw-chapter-35-grammar-review-page-1.png', '8e4905077b0b7ade5793ad1c6e942d7a33f10d16e242592e4b7cb62f851f68b9'),
        visual('bf9737e27d9ffc740f8bc597538968157f5b87c63207e28a2c55b6dae9ad66ce', 'HW Chapter 35 grammar review', 2, '/academy/content/lessons/l2-l33/moodle-hw-chapter-35-grammar-review-page-2.png', '0ca76763c1bafb638aabe1d35b26b25f7af1f4417d8f125e780df779ba5092c5'),
    ],
    headings: [
        [1, '1: You can use the words given or write freely about yourself and create sentences.'],
        [2, '2: Please write your about your town. recommendation and the reason why you recommend.'],
        [4, '4: Please complete sentences according to the contexts.'],
        ['homework', '4: Read the conversation and create question using interrogatives and conditional form.'],
        [5, '5: Put appropriate words in the brackets and choose the reason from the box.'],
    ],
    interactions: ['action-choice', 'state-select', 'typed-report', 'action-choice', 'state-select', 'typed-report', 'action-choice', 'typed-report'],
    tasks: [1, 1, 2, 2, 4, 'homework', 5, 5], items: [1, 2, 1, 2, 1, 2, 1, 2], pages: [1, 1, 1, 1, 1, 2, 2, 2],
    teachingCount: 6,
} as const;

const LESSON_61_PROFILE = {
    packageId: 'l2-l34', packageOrder: 61, responseKind: 'moodle-kanji-7-menu-reading',
    moduleId: 8121293, archiveId: 'archive-000096', sourceAudioMembers: 0,
    mediaStatus: 'no-audio-members-in-package',
    answerKeyBasis: 'source-provided-readings-with-yomu-derived-deterministic-reading-pairing',
    minna: 'Minna no Nihongo II · food and quantity vocabulary', genki: '≈ Genki II · parallel N4 kanji scope',
    sourceSheets: [
        visual('0139b9a8eac967df4d2f159a9a64077b23e3225a04159eff6f601751d8ff9fbd', 'Kanji 7-肉、料、理、野、半、大、小_worksheets', 1, '/academy/content/lessons/l2-l34/moodle-kanji-7-worksheet-page-1.png', 'c4f0432c78ee351c4d1b1361289078dc511301788b0f43abe7acd1b025798c89'),
        visual('0139b9a8eac967df4d2f159a9a64077b23e3225a04159eff6f601751d8ff9fbd', 'Kanji 7-肉、料、理、野、半、大、小_worksheets', 2, '/academy/content/lessons/l2-l34/moodle-kanji-7-worksheet-page-2.png', '799c46dd724fc02f14711be447fbfbf032a6d9b7da65b43744e78df3406e26c6'),
    ],
    headings: [
        ['word-table', '読み方・ことば'],
        [1, '1: 漢字の 練習をしましょう。'],
        [2, '2: 漢字を 読んでみましょう。'],
    ],
    interactions: ['state-select', 'action-choice', 'typed-report', 'action-choice', 'typed-report', 'state-select', 'typed-report', 'action-choice'],
    tasks: ['word-table', 'word-table', 'word-table', 'word-table', 'word-table', 'word-table', 2, 2],
    items: [1, 2, 3, 4, 5, 6, 1, 4], pages: [1, 1, 1, 1, 2, 2, 2, 2],
    teachingCount: 5,
} as const;

type ValidationProfile =
    | typeof LESSON_39_PROFILE
    | typeof LESSON_41_PROFILE
    | typeof LESSON_42_PROFILE
    | typeof LESSON_43_PROFILE
    | typeof LESSON_44_PROFILE
    | typeof LESSON_45_PROFILE
    | typeof LESSON_46_PROFILE
    | typeof LESSON_52_PROFILE
    | typeof LESSON_56_PROFILE
    | typeof LESSON_57_PROFILE
    | typeof LESSON_58_PROFILE
    | typeof LESSON_59_PROFILE
    | typeof LESSON_60_PROFILE
    | typeof LESSON_61_PROFILE;

export function validateStateInspection(model: StateInspectionModel): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const profile = profileFor(model);
    if (!profile) {
        return [{ path: 'provenance.packageId', message: 'The state inspection requires a registered exact lesson package.' }];
    }
    if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
        issues.push({ path: 'answerSupport', message: 'The state inspection requires assessed answer support.' });
    }
    const moodle = model.provenance?.moodle;
    if (model.provenance?.packageId !== profile.packageId
        || model.provenance.packageOrder !== profile.packageOrder
        || model.responseKind !== profile.responseKind
        || model.provenance.answerVisibility !== 'after-attempt'
        || moodle?.moduleId !== profile.moduleId
        || moodle.archiveId !== profile.archiveId
        || moodle.answerKeyBasis !== profile.answerKeyBasis) {
        issues.push({ path: 'provenance.moodle', message: `${profile.packageId} requires its exact package and canonical Moodle source.` });
    }
    if (!Array.isArray(moodle?.sourceSheets)
        || moodle.sourceSheets.length !== profile.sourceSheets.length
        || moodle.sourceSheets.some((sourceVisual, index) => !validVisual(sourceVisual, profile.sourceSheets[index]))) {
        issues.push({ path: 'provenance.moodle.sourceSheets', message: 'All canonical source pages are required in authored order.' });
    }
    const expectedAnswerSheets = 'answerSheets' in profile ? profile.answerSheets : [];
    const answerSheets = moodle?.answerSheets ?? [];
    if (answerSheets.length !== expectedAnswerSheets.length
        || answerSheets.some((sourceVisual, index) => !validVisual(sourceVisual, expectedAnswerSheets[index]))) {
        issues.push({ path: 'provenance.moodle.answerSheets', message: 'Canonical answer pages must remain gated until after an attempt.' });
    }
    const expectedDeliveredTracks = 'sourceAudioTracksDelivered' in profile
        ? profile.sourceAudioTracksDelivered
        : 0;
    if (moodle?.media.status !== profile.mediaStatus
        || moodle.media.sourceAudioMembers !== profile.sourceAudioMembers
        || moodle.media.sourceAudioTracksDelivered !== expectedDeliveredTracks) {
        issues.push({ path: 'provenance.moodle.media', message: 'Source audio delivery must match the exact package verification state.' });
    }
    if (profile.packageId === 'l2-l18') {
        const audio = moodle?.media.audio;
        if (!audio
            || audio.url !== '/academy/content/lessons/l2-l18/moodle-track-13.mp3'
            || audio.payloadSha256 !== 'aca35dbabfc34bac27deef4f328382718a57734e5ef67c2f73e348616fd8494c'
            || audio.durationSeconds !== 50.12
            || audio.transcriptPayloadSha256 !== '38a9974c41c43cea05d332ce504149b6614f1cd6069fe00570a2a447ae1d3c13'
            || audio.worksheetPayloadSha256 !== 'e63689d47daab01e6e21698fc5f0267f17cdabe00cad3f25cc63ceb701b594c6'
            || audio.verification !== 'exact-script-and-independent-transcript-match') {
            issues.push({ path: 'provenance.moodle.media.audio', message: 'Lesson 43 requires verified Track 13, its exact script, and its exact worksheet pairing.' });
        }
    }
    if (profile.packageId === 'l2-l29') {
        const audio = moodle?.media.audio;
        if (!audio
            || audio.url !== '/academy/content/lessons/l2-l29/moodle-track-27.mp3'
            || audio.payloadSha256 !== '06b35860230b1320c7d68fd0e863363f59f2619a79eef3460368c588a770bd96'
            || audio.durationSeconds !== 111.44
            || audio.transcriptPayloadSha256 !== 'd79b17c0a31646378f02d7a8ee4ab75a553d0997cfe636a2342f1eb57cba2927'
            || audio.worksheetPayloadSha256 !== '65aaa460558043b069f759c31a3c0e1663080fbd2f795eb175a8037ad5da2f21'
            || audio.verification !== 'same-archive-adjacency-and-exact-task-script-identity') {
            issues.push({ path: 'provenance.moodle.media.audio', message: 'l2-l29 requires Track 27 and the exact Chapter 34 script/task identity without an independent transcript claim.' });
        }
        const references = model.provenance.support.references;
        if (references?.shinKanzen.learnerFacingMaterial !== false
            || references.tobira.learnerFacingMaterial !== false
            || references.soya.learnerFacingMaterial !== false
            || references.soya.rightsState !== 'item-review-required') {
            issues.push({ path: 'provenance.support.references', message: 'Private N3 references and the rights-review-required Soya corpus must contribute no learner-facing material.' });
        }
    }
    if (model.provenance?.support.minna.reference !== profile.minna
        || model.provenance.support.minna.reuse !== 'chronology-and-scope-only'
        || model.provenance.support.genki.crosswalk !== profile.genki
        || model.provenance.support.genki.reuse !== 'sequence-only') {
        issues.push({ path: 'provenance.support', message: 'Minna and Genki support sequence only and supply no prompts or answers.' });
    }
    if (!Array.isArray(model.payload?.teaching)
        || model.payload.teaching.length !== profile.teachingCount
        || model.payload.teaching.some(step => !text(step.title) || !text(step.text))) {
        issues.push({ path: 'payload.teaching', message: 'The source pattern, state rule, particle contrast, topic note, and examples must precede assessment.' });
    }
    if (!Array.isArray(model.payload?.taskHeadings)
        || model.payload.taskHeadings.map(heading => heading.text).join('|') !== profile.headings.map(heading => heading[1]).join('|')
        || model.payload.taskHeadings.map(heading => heading.sourceTask).join(',') !== profile.headings.map(heading => heading[0]).join(',')) {
        issues.push({ path: 'payload.taskHeadings', message: 'The three selected source task headings are required in source order.' });
    }
    const rounds = model.payload?.rounds;
    if (!Array.isArray(rounds)
        || rounds.length !== 8
        || rounds.map(round => round.sourceOrder).join(',') !== '1,2,3,4,5,6,7,8'
        || rounds.some((round, index) => round.interaction !== profile.interactions[index]
            || round.sourceTask !== profile.tasks[index] || round.sourceItem !== profile.items[index]
            || round.sourcePage !== profile.pages[index])) {
        issues.push({ path: 'payload.rounds', message: 'The eight selected source prompts and three interaction modes must remain in authored order.' });
    } else {
        const ids = new Set<string>();
        const sourceIds = new Set<string>();
        const errorTags = new Set<string>();
        rounds.forEach((round, index) => validateRound(model, round, index, profile, ids, sourceIds, errorTags, issues));
    }
    if (model.payload?.passScore !== 1) issues.push({ path: 'payload.passScore', message: 'All eight state reports are required.' });
    validateFeedback(model.payload?.feedback, issues);
    return issues;
}

export function gradeStateInspection(model: StateInspectionModel, response: StateInspectionResponse): GradeResult {
    const answers = parseResponse(model, response);
    const errors: string[] = [];
    let correct = 0;
    model.payload.rounds.forEach(round => {
        const value = answers.get(round.id) ?? '';
        if (round.acceptedAnswers.some(answer => normalize(answer) === normalize(value))) correct += 1;
        else errors.push(round.errorTag);
    });
    return gradeFromScore(correct / model.payload.rounds.length, model.payload.passScore, errors.sort(), model.payload.feedback);
}

export function stateInspectionReviewSeeds(model: StateInspectionModel, result: GradeResult): readonly ReviewSeed[] {
    return model.payload.rounds.flatMap(round => result.outcome === 'lapse' && !result.errorTags.includes(round.errorTag)
        ? []
        : [{
            id: `review:${model.provenance.packageId}:state-inspection:${round.id}`,
            conceptId: round.conceptId,
            reason: result.outcome === 'pass' ? 'new-learning' : 'repair',
            sourceQuestionId: round.sourceQuestionId,
            content: {
                expression: round.answerExpression,
                meanings: [`Sensei source task ${round.sourceTask} item ${round.sourceItem}`],
            },
        } satisfies ReviewSeed]);
}

function validateRound(
    model: StateInspectionModel,
    round: StateInspectionRound,
    index: number,
    profile: ValidationProfile,
    ids: Set<string>,
    sourceIds: Set<string>,
    errorTags: Set<string>,
    issues: ValidationIssue[],
): void {
    const optionCount = round.interaction === 'typed-report' ? 0 : 2;
    if (!text(round.id) || ids.has(round.id)
        || !text(round.sourceQuestionId) || sourceIds.has(round.sourceQuestionId)
        || !text(round.sourcePrompt) || !text(round.answerValue) || !text(round.answerExpression)
        || !Array.isArray(round.acceptedAnswers) || round.acceptedAnswers.length < 1
        || !round.acceptedAnswers.some(answer => normalize(answer) === normalize(round.answerValue))
        || !model.conceptIds.includes(round.conceptId)
        || !text(round.errorTag) || errorTags.has(round.errorTag)
        || round.sourcePage !== profile.pages[index]
        || !Array.isArray(round.options) || round.options.length !== optionCount
        || round.options.some(option => !text(option.value) || !text(option.label.en) || !text(option.label.ja))
        || (round.options.length > 0 && !round.options.some(option => normalize(option.value) === normalize(round.answerValue)))
        || !Array.isArray(round.hints) || round.hints.length !== 3
        || round.hints.some(hint => !text(hint.en) || !text(hint.ja))) {
        issues.push({ path: `payload.rounds.${index}`, message: 'Each source prompt needs one concealed completion and exactly three bilingual hints.' });
    }
    ids.add(round.id);
    sourceIds.add(round.sourceQuestionId);
    errorTags.add(round.errorTag);
}

function parseResponse(model: StateInspectionModel, response: StateInspectionResponse): ReadonlyMap<string, string> {
    if (!response || !Array.isArray(response.answers) || response.answers.length !== model.payload.rounds.length) {
        throw new TypeError('Complete all eight source state reports.');
    }
    const answers = new Map<string, string>();
    response.answers.forEach(answer => {
        if (!model.payload.rounds.some(round => round.id === answer.roundId)
            || answers.has(answer.roundId)
            || !text(answer.value)) {
            throw new TypeError('Each source state row needs one unique response.');
        }
        answers.set(answer.roundId, answer.value);
    });
    return answers;
}

function validVisual(value: StateInspectionSourceVisual | undefined, expected: ReturnType<typeof visual> | undefined): boolean {
    return Boolean(value && expected && text(value.sourceId) && value.title === expected.title
        && value.page === expected.page && value.payloadSha256 === expected.payloadSha256
        && value.url === expected.url && value.sha256 === expected.sha256
        && text(value.alt.en) && text(value.alt.ja));
}

function profileFor(model: StateInspectionModel): ValidationProfile | null {
    if (model.provenance?.packageId === LESSON_39_PROFILE.packageId) return LESSON_39_PROFILE;
    if (model.provenance?.packageId === LESSON_41_PROFILE.packageId) return LESSON_41_PROFILE;
    if (model.provenance?.packageId === LESSON_42_PROFILE.packageId) return LESSON_42_PROFILE;
    if (model.provenance?.packageId === LESSON_43_PROFILE.packageId) return LESSON_43_PROFILE;
    if (model.provenance?.packageId === LESSON_44_PROFILE.packageId) return LESSON_44_PROFILE;
    if (model.provenance?.packageId === LESSON_45_PROFILE.packageId) return LESSON_45_PROFILE;
    if (model.provenance?.packageId === LESSON_46_PROFILE.packageId) return LESSON_46_PROFILE;
    if (model.provenance?.packageId === LESSON_52_PROFILE.packageId) return LESSON_52_PROFILE;
    if (model.provenance?.packageId === LESSON_56_PROFILE.packageId) return LESSON_56_PROFILE;
    if (model.provenance?.packageId === LESSON_57_PROFILE.packageId) return LESSON_57_PROFILE;
    if (model.provenance?.packageId === LESSON_58_PROFILE.packageId) return LESSON_58_PROFILE;
    if (model.provenance?.packageId === LESSON_59_PROFILE.packageId) return LESSON_59_PROFILE;
    if (model.provenance?.packageId === LESSON_60_PROFILE.packageId) return LESSON_60_PROFILE;
    if (model.provenance?.packageId === LESSON_61_PROFILE.packageId) return LESSON_61_PROFILE;
    return null;
}

function visual(payloadSha256: string, title: string, page: 1 | 2 | 3 | 4 | 5, url: string, sha256: string) {
    return Object.freeze({ payloadSha256, title, page, url, sha256 });
}

function normalize(value: string): string {
    return value.normalize('NFKC').replace(/[\s、。・]/gu, '').trim();
}
