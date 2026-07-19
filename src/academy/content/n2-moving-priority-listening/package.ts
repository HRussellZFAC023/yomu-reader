import {
    choiceOption,
    choiceQuestion,
    createN2OpeningPackage,
    localizedText,
    n2OpeningFeedback,
    n2OpeningInstruction,
    n2OpeningPrerequisite,
    n2OpeningReview,
} from '../n2-opening-kit';
import {
    N2_MOVING_PRIORITY_ANSWER,
    N2_MOVING_PRIORITY_LISTENING_PROVENANCE,
    N2_MOVING_PRIORITY_TRANSCRIPT,
    N2_MOVING_PRIORITY_WRONG_ANSWERS,
} from './source';
import {
    N2_MOVING_PRIORITY_LISTENING_ACTIVITY_KIND,
    N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID,
    type N2MovingPriorityListeningPackage,
} from './types';

export const N2_MOVING_PRIORITY_STRATEGY = Object.freeze([
    'することがいくつも聞こえたら、「もう済んだこと」「ほかの人がすること」「この後まずすること」に分けます。最後に更新された予定を答えにします。',
]);

export function createN2MovingPriorityListeningPackage(): N2MovingPriorityListeningPackage {
    const concept = 'listening:n2-task-priority-update';
    const source = N2_MOVING_PRIORITY_LISTENING_PROVENANCE.sourceItem;
    return createN2OpeningPackage({
        id: N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID,
        kind: N2_MOVING_PRIORITY_LISTENING_ACTIVITY_KIND,
        responseKind: 'n2-moving-priority-listening-v1',
        order: 5,
        previousPackageId: 'n2-home-life-opening-04-reader',
        provenance: N2_MOVING_PRIORITY_LISTENING_PROVENANCE,
        sourceQuestionId: source.sourceId,
        introduces: concept,
        recycles: ['vocabulary:n2-home-and-moving', 'grammar:n2-ppoi-evaluation', 'reading:n2-practical-constraints', 'reading:n2-narrative-turn'],
        prerequisite: n2OpeningPrerequisite('reading:n2-narrative-turn', '短い物語で予定や判断の変化を追える。', 'Can track a change of plan or judgment in a short story.', 'n2-home-life-opening-04-reader'),
        prompt: localizedText('引っ越し会話を聞き、更新された「まずすること」を一度で決めましょう。', 'Listen to the moving conversation and commit to the updated first task.'),
        instructionTitle: localizedText('音より先に、予定の更新を追う', 'Track plan updates, not isolated task words'),
        instructionEntries: [
            n2OpeningInstruction('済んだ：もう箱に詰めた', 'Remove tasks explicitly described as already complete.'),
            n2OpeningInstruction('不要になった：もう用意してある', 'Remove a planned task when someone says it is already handled.'),
            n2OpeningInstruction('まず・その後：最後の順番を取る', 'Use explicit sequencing after all updates have been heard.'),
        ],
        contentTitle: localizedText('聞く前の一行メモ', 'One-line pre-listening note'),
        paragraphs: N2_MOVING_PRIORITY_STRATEGY,
        media: Object.freeze({
            kind: 'exact-soya-listening' as const,
            audioUrl: source.sourceAudio.packageUrl,
            imageUrl: source.sourceImage.packageUrl,
            imageAlt: localizedText('引っ越しの箱を前に話す夫婦', 'A couple talking beside moving boxes'),
            transcriptVisibility: 'after-attempt' as const,
            answerVisibility: 'after-attempt' as const,
            transcript: N2_MOVING_PRIORITY_TRANSCRIPT,
            correctAnswer: N2_MOVING_PRIORITY_ANSWER,
        }),
        questions: [choiceQuestion('listening-priority', '夫はこの後、まず何をしなければなりませんか。', 'What must the husband do first?', [
            choiceOption('bulky-waste', N2_MOVING_PRIORITY_ANSWER, 'Arrange bulky-waste collection'),
            choiceOption('boxes', N2_MOVING_PRIORITY_WRONG_ANSWERS[0], 'Get cardboard boxes'),
            choiceOption('dishes', N2_MOVING_PRIORITY_WRONG_ANSWERS[1], 'Pack the kitchen dishes'),
            choiceOption('furniture', N2_MOVING_PRIORITY_WRONG_ANSWERS[2], 'Move the furniture to the entrance'),
        ], 'bulky-waste', 'listening-priority')],
        feedback: n2OpeningFeedback(
            '済んだ作業と後でする作業を外し、最後に更新された最初の行動を選べました。',
            'You excluded completed and later tasks and selected the final updated first action.',
            '書き取った作業に「済・不要・まず・後」の印を付けてください。',
            'Mark each noted task done, no longer needed, first, or later.',
            '最後の二往復だけを聞き直し、だれが何をするかを確定してください。',
            'Replay the final two exchanges and confirm who will do what.',
            '「箱はもうある。まず電話する。食器はその後」なら、答えは電話です。',
            'If the boxes are ready, the call is first, and dishes are later, the answer is the call.',
        ),
        reviewTargets: [
            n2OpeningReview(N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID, 'bulky-waste', concept, '粗大ごみの収集を申し込む', 'そだいごみのしゅうしゅうをもうしこむ', ['arrange bulky-waste collection'], N2_MOVING_PRIORITY_TRANSCRIPT[6].text, ['listening-priority']),
            n2OpeningReview(N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID, 'packing', concept, '荷造り', 'にづくり', ['packing for a move'], N2_MOVING_PRIORITY_TRANSCRIPT[1].text, ['listening-priority']),
        ],
        miningRequests: [],
    });
}
