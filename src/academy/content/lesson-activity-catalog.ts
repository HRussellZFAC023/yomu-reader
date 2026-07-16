import { createKanjiWritingActivity } from '../activities/kanji-writing';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type ActivityModel } from '../domain/activity-runtime';
import { getAcademyCastMember } from '../domain/cast-registry';
import type { KanjiWritingService } from '../integration/yomu-bridge';
import type {
    DragSortModel,
    SequenceModel,
    SoundCheckModel,
    TypedResponseModel,
} from '../minigames/activity-kit';
import { createClassActivityModel } from './class-activity-catalog';
import { createMegaPackLessonOneBeats } from './mega-pack-lesson-one';
import { createLessonOneGreetingWorksheetBeat } from './lesson-one-greeting-worksheet';
import { createLessonSevenShopCounterBeat } from './lesson-seven-shop-counter';
import { createLessonEightTimeWorkbookBeat } from './lesson-eight-time-workbook';
import { createLessonNineWeeklyPlanBeat } from './lesson-nine-weekly-plan';
import { createLessonTenDailyRoutineWorkbookBeat } from './lesson-ten-daily-routine';
import { createLessonElevenAdjectiveWorkbookBeat } from './lesson-eleven-adjective-workbook';
import { createLessonTwelvePreferenceWorkbookBeat } from './lesson-twelve-preference-workbook';
import { createLessonThirteenSkillUnderstandingWorkbookBeat } from './lesson-thirteen-skill-understanding-workbook';
import { createLessonFourteenReasonWorkbookBeat } from './lesson-fourteen-reason-workbook';
import { createLessonSixteenExistenceLocationWorkbookBeat } from './lesson-sixteen-existence-location-workbook';
import { createLessonSeventeenMuseumLocationWorkbookBeat } from './lesson-seventeen-museum-location-workbook';
import { createLessonEighteenFridgeInventoryWorkbookBeat } from './lesson-eighteen-fridge-inventory-workbook';
import { createLessonNineteenOrderingFoodBeat } from './lesson-nineteen-ordering-food';
import { createLessonNineteenListeningGridBeat } from './lesson-nineteen-listening-grid';
import { createLessonTwentyFrequencyLensBeat } from './lesson-twenty-frequency-lens';
import { createLessonTwentyOneCommuteComparisonBeat } from './lesson-twenty-one-commute-comparison';
import { createLessonTwentyTwoKatakanaShapeRelayBeat } from './lesson-twenty-two-katakana-shape-relay';
import { createLessonTwentyThreeKatakanaColumnSortBeat } from './lesson-twenty-three-katakana-column-sort';
import { createLessonTwentyFourKatakanaTwoRowAudioRouteBeat } from './lesson-twenty-four-katakana-two-row-audio-route';
import {
    createLessonL2L23KanjiColumnSortBeat,
    createLessonL2L23LibraryReadingBeat,
    createLessonL2L23ReturnWritingBeat,
    createLessonL2L23SourceVocabularyBeat,
} from './lesson-l2-l23-kanji-handover';
import { createLessonL2L25ProbabilityBriefingBeat } from './lesson-l2-l25-probability-briefing';
import {
    createLessonL2L26KuruImperativeBeat,
    createLessonL2L26RunnerSequenceBeat,
    createLessonL2L26SignMeaningBeat,
    createLessonL2L26VerbGroupSortBeat,
} from './lesson-l2-l26-imperative-source-return';
import { createLessonL2L27ReportedMessageBeat } from './lesson-l2-l27-reported-message-workshop';
import { createLessonL2L28FollowModelBeat } from './lesson-l2-l28-follow-the-model-workshop';
import { createLessonTwentyFiveKatakanaRowSwitchboardBeat } from './lesson-twenty-five-katakana-row-switchboard';
import { createLessonTwentySixKatakanaFinalRowShelfBeat } from './lesson-twenty-six-katakana-final-row-shelf';
import { createLessonTwentySevenExperiencePostcardListeningBeat } from './lesson-twenty-seven-experience-postcard-listening';
import { createLessonTwentyEightPlainStyleMatrixBeat } from './lesson-twenty-eight-plain-style-matrix';
import { createLessonTwentyNineHolidayItineraryTapeBeat } from './lesson-twenty-nine-holiday-itinerary-tape';
import { createLessonThirtyListeningHingeBeat } from './lesson-thirty-listening-hinge';
import { createLessonThirtyB25DiaryListeningBeat } from './lesson-thirty-b25-diary-listening';
import { createLessonThirtyMinna069ConversationBeat } from './lesson-thirty-minna-069-conversation';
import { createLessonThirtyOneOpinionTransformationBeat } from './lesson-thirty-one-opinion-transformation';
import { createLessonThirtyOneMinna072ConversationBeat } from './lesson-thirty-one-minna-072-conversation';
import { createLessonThirtyTwoConfirmationSignalBeat } from './lesson-thirty-two-confirmation-signal';
import { createLessonThirtyTwoMinna074ListeningBeat } from './lesson-thirty-two-minna-074-listening';
import { createLessonThirtyThreeClauseRailBeat } from './lesson-thirty-three-clause-rail';
import { createLessonThirtyFourParticleSignalMixerBeat } from './lesson-thirty-four-particle-signal-mixer';
import { createLessonThirtyFourMinna075ConversationBeat } from './lesson-thirty-four-minna-075-conversation';
import { createLessonThirtyFiveTokiThresholdBeat } from './lesson-thirty-five-toki-threshold';
import { createLessonThirtyFiveMinna077ListeningBeat } from './lesson-thirty-five-minna-077-listening';
import { createLessonThirtySixOccasionRouteBeat } from './lesson-thirty-six-occasion-route';
import { createLessonThirtySevenNagaraWorkshopBeat } from './lesson-thirty-seven-nagara-workshop';
import { createLessonThirtySevenTrack78BankListeningBeat } from './lesson-thirty-seven-track-78-bank-listening';
import { createLessonThirtySevenTrack79FavorDirectionBeat } from './lesson-thirty-seven-track-79-favor-direction';
import { createLessonThirtyEightShiReasonChainBeat } from './lesson-thirty-eight-shi-reason-chain';
import { createLessonThirtyEightA11MealSurveyListeningBeat } from './lesson-thirty-eight-a11-meal-survey-listening';
import { createLessonThirtyNineStateInspectionBeat } from './lesson-thirty-nine-state-inspection';
import { createLessonFortyCompletionRepairBeat } from './lesson-forty-completion-repair';
import { createLessonFortyOnePreparedStateAuditBeat } from './lesson-forty-one-prepared-state-audit';
import { createLessonFortyTwoAdvancePreparationBeat } from './lesson-forty-two-advance-preparation';
import { createLessonFortyThreeMessageHandoffBeat } from './lesson-forty-three-message-handoff';
import { createLessonFortyFourVolitionalPlanBeat } from './lesson-forty-four-volitional-plan';
import { createLessonFortyFiveIntentionRouteBeat } from './lesson-forty-five-intention-route';
import { createLessonFortySixPlanChangeRepairBeat } from './lesson-forty-six-plan-change-repair';
import { createLessonL2L29TeaCeremonyBeat } from './lesson-l2-l29-tea-ceremony';
import { createLessonL2L30ConditionalWorkshopBeat } from './lesson-l2-l30-conditional-workshop';
import { createLessonL2L31AdjectiveNounConditionalsBeat } from './lesson-l2-l31-adjective-noun-conditionals';
import { createLessonL2L32NaraGuidanceWorkshopBeat } from './lesson-l2-l32-nara-guidance-workshop';
import { createLessonL2L33Chapter35HomeworkReviewBeat } from './lesson-l2-l33-chapter-35-homework-review';
import { createLessonL2L34KanjiMenuReadingBeat, createLessonL2L34RiWritingBeat } from './lesson-l2-l34-kanji-menu-workshop';
import { createLessonL2L35ConsiderateRecommendationBeat } from './lesson-l2-l35-considerate-recommendation';
import { createLessonL2L36YouniGoalWorkshopBeat } from './lesson-l2-l36-youni-goal-workshop';
import { createLessonFourObjectDistanceModel } from './lesson-four-object-distance';
import { createLessonFourPictureVocabularyModel } from './lesson-four-picture-vocabulary';
import { createLessonTwoProfileBoardModel } from './lesson-two-profile-board';
import { createLessonThreeMoodleListeningModel } from './lesson-three-moodle-listening';
import { createLessonThreeProfileQuestionMatchModel } from './lesson-three-profile-questions';
import { createLessonFivePossessionPhraseModel } from './lesson-five-possession-phrases';
import { createLessonSixPlaceAndOwnerModel } from './lesson-six-place-and-owner';
import type { LessonActivityBeat, LessonActivityChapter } from '../ui/lesson-activity-chapter';
import { loadStoryRuntime, type StoryEpisode } from './story-runtime';

export const LESSON_ACTIVITY_CHAPTER_PACKAGES = Object.freeze([
    'l1-l08',
    'l1-l09',
    'l1-l10',
    'l1-l11',
    'l1-l12',
    'l1-l13',
    'l1-l14',
    'l1-l16',
    'l1-l17',
    'l1-l18',
    'l1-l19',
    'l1-l20',
    'l1-l21',
    'l1-l22',
    'l1-l23',
    'l1-l24',
    'l1-l25',
    'l1-l26',
    'l2-l02',
    'l2-l03',
    'l2-l04',
    'l2-l05',
    'l2-l06',
    'l2-l07',
    'l2-l08',
    'l2-l22',
    'l2-l23',
    'l2-l25',
    'l2-l26',
    'l2-l27',
    'l2-l28',
    'l2-l34',
    'l1-l01',
    'l1-l02',
    'l1-l03',
    'l1-l04',
    'l1-l05',
    'l1-l06',
    'l1-l15',
    'l2-l09',
    'l2-l10',
    'l2-l11',
    'l2-l12',
    'l2-l13',
    'l2-l14',
    'l2-l15',
    'l2-l16',
    'l2-l17',
    'l2-l18',
    'l2-l19',
    'l2-l20',
    'l2-l21',
    'l2-l29',
    'l2-l30',
    'l2-l31',
    'l2-l32',
    'l2-l33',
    'l1-l07',
] as const);

const DIRECT_ACTIVITY_CHAPTER_PACKAGES = Object.freeze(['l2-l35', 'l2-l36'] as const);

type ChapterPackageId =
    | typeof LESSON_ACTIVITY_CHAPTER_PACKAGES[number]
    | typeof DIRECT_ACTIVITY_CHAPTER_PACKAGES[number];

export async function loadLessonActivityChapter(
    packageId: string,
    kanjiWriting: KanjiWritingService,
): Promise<LessonActivityChapter | null> {
    const registered = (LESSON_ACTIVITY_CHAPTER_PACKAGES as readonly string[]).includes(packageId)
        || (DIRECT_ACTIVITY_CHAPTER_PACKAGES as readonly string[]).includes(packageId);
    if (!registered) return null;
    switch (packageId as ChapterPackageId) {
        case 'l1-l08': {
            const trace = await kanjiWriting.lookup('一');
            if (!trace) throw new Error('The pinned 一 trace is required for the Lesson 8 story activity.');
            return chapter('l1-l08', 's1e04-welcome-frequency', 'mika', {
                ja: '音のランタン',
                en: 'The sound-room lantern',
            }, {
                ja: '授業の時間表を片づけると、ミカが音の部屋から手を振ります。ランタンは大きな声ではなく、日本語の拍に反応しています。',
                en: 'As the timetable is put away, Mika waves from the sound room. The lantern is responding to Japanese rhythm, not volume.',
            }, {
                ja: 'ミカの静かな聞き方で、長い母音も小さい「っ」も、ランタンの輪にはっきり残りました。最後に「一」を書き、最初の時刻カードを地図へ戻します。',
                en: 'Mika’s careful listening leaves both the long vowel and small っ clear in the lantern rings. One written 一 returns the first time card to the map.',
            }, [createLessonEightTimeWorkbookBeat(), soundBeat(), kanjiOneBeat(trace), classActivityBeat('free-time-board', {
                ja: '音の輪が静かになると、入口の時間表にジョディの予定のコマが光ります。エンジェルも時計を確認し、一人ずつ空き時間を置きます。',
                en: 'As the sound rings settle, Jodi’s schedule token lights up on the doorway board. Angel checks the clock while everyone adds their availability in turn.',
            }, 'l1-l08')]);
        }
        case 'l1-l09':
            return chapter('l1-l09', 's1e05-final-boss-kana', 'tom', {
                ja: '一週間の作戦表',
                en: 'The weekly plan board',
            }, {
                ja: '次のゲーム会を決めるため、ジェニーとトムが授業の曜日カードと時刻カードを机に並べます。',
                en: 'To plan the next game night, Jenny and Tom lay the lesson’s weekday and time cards across the table.',
            }, {
                ja: '元の問題を順番に解き、一週間の予定が読める形になりました。間違えたカードだけをもう一度確認します。',
                en: 'The source problems are complete in order, leaving a readable weekly plan. Only missed cards return for repair.',
            }, [createLessonNineWeeklyPlanBeat()]);
        case 'l1-l10':
            return chapter('l1-l10', 's1e13-dinner-by-if', 'jenny', {
                ja: '一日の時間割',
                en: 'A day in order',
            }, {
                ja: '夕食の準備を始める前に、ジェニーが授業の一日カードを時間順に広げます。',
                en: 'Before dinner preparation begins, Jenny spreads the lesson’s daily-routine cards into time order.',
            }, {
                ja: '元の語彙と問題を順番どおりに終え、自分の一日を時間と動詞で説明できるようになりました。',
                en: 'With the source vocabulary and problems complete in order, the learner can describe a day with times and verbs.',
            }, [createLessonTenDailyRoutineWorkbookBeat()]);
        case 'l1-l11':
            return chapter('l1-l11', 's1e07-no-spoilers', 'tom', {
                ja: '名前のない町の紹介',
                en: 'A place description without its name',
            }, {
                ja: 'カーテンの向こうの番組を説明する前に、トムが町の紹介カードを広げます。名前を言わずに、どんな場所かを形容詞で伝える練習です。',
                en: 'Before describing the programme beyond the curtain, Tom lays out town-description cards. The task is to say what kind of place each is without naming it.',
            }, {
                ja: '形容詞を名詞につなぎ、二つの説明を順に結びました。名前がなくても、聞く人が場所の手がかりをたどれる説明になりました。',
                en: 'The adjectives now attach to nouns and pair into clear descriptions. Even without a name, the listener can follow the clues to the place.',
            }, [createLessonElevenAdjectiveWorkbookBeat()]);
        case 'l1-l12':
            return chapter('l1-l12', 's1e08-menu-without-pictures', 'shin', {
                ja: '好みのメニューカード',
                en: 'Preference cards for the menu',
            }, {
                ja: '絵のないメニューの候補を前に、シンが好みのカードを並べます。どんな料理や飲み物が好きかをたずね、答えの強さも確かめます。',
                en: 'With the pictureless menu options open, Shin lays out preference cards. Ask what kind of food or drink each person likes, then check the strength of each reply.',
            }, {
                ja: '好き・きらいと「どんな」の質問がそろい、メニューの手がかりを好みで絞れました。間違えたカードだけをもう一度確かめます。',
                en: 'Preference statements and どんな questions now narrow the menu clues. Only missed cards return for repair.',
            }, [createLessonTwelvePreferenceWorkbookBeat()]);
        case 'l1-l13':
            return chapter('l1-l13', 's1e05-final-boss-kana', 'mika', {
                ja: 'とくいなことのカード',
                en: 'Skill and understanding cards',
            }, {
                ja: 'ゲーム部のテーブルで、ミカが活動カードを広げます。アーカッシュは、読める文字と得意なことを一枚ずつ確かめます。',
                en: 'At the game-club table, Mika spreads out activity cards. Aakash checks, one by one, what people understand and what they are good at.',
            }, {
                ja: '技能と理解の型を使い、Moodle、みんなの日本語、Genkiの15問を元資料の順番どおりに終えました。間違えた問題だけを直します。',
                en: 'Using the skill and understanding patterns, all 15 Moodle, Minna, and Genki items are complete in source order. Only missed items return for repair.',
            }, [createLessonThirteenSkillUnderstandingWorkbookBeat()]);
        case 'l1-l14':
            return chapter('l1-l14', 's1e02-margin-map', 'rie', {
                ja: '理由をつなぐカード',
                en: 'Cards that connect a reason',
            }, {
                ja: '図書館の学習席で、リエが理由のカードを並べます。トムは、元の動作を変えずに「どうして」と「から」で二つの文をつなげます。',
                en: 'At the library study bay, Rie lays out reason cards. Tom connects the two clauses with why and because without changing the source action.',
            }, {
                ja: 'Moodleの8問とGenkiの3問を元資料の順番どおりに終え、Minnaは第9課との時系列対応だけを確認しました。間違えた問題だけを直します。',
                en: 'The eight Moodle and three Genki items are complete in source order; Minna only confirms the Lesson 9 chronology map. Only missed items return for repair.',
            }, [createLessonFourteenReasonWorkbookBeat()]);
        case 'l1-l16':
            return chapter('l1-l16', 's1e03-route-zero', 'aakash', {
                ja: '中庭の場所カード',
                en: 'Courtyard location cards',
            }, {
                ja: '中庭のルート札を広げると、アーカーシュが物と人・動物のカードを分けます。どこに何がいるかを、まずMoodleの型で確かめます。',
                en: 'As the courtyard route cards open, Aakash sorts things from people and animals. First, the Moodle frame establishes what is where.',
            }, {
                ja: 'Moodleの8問を先に分け、Genkiの2問へ進みました。Minnaは第10課との時系列対応だけを記録し、間違えた問題だけを直します。',
                en: 'The eight Moodle items come first, followed by two Genki transfers. Minna records only the Lesson 10 chronology map, and only missed items return for repair.',
            }, [createLessonSixteenExistenceLocationWorkbookBeat()]);
        case 'l1-l17':
            return chapter('l1-l17', 's1e03-route-zero', 'tom', {
                ja: '美術館の案内カード',
                en: 'Museum guide cards',
            }, {
                ja: '中庭のルート札を片づけたあと、トムが美術館の案内カードを広げます。展示物と場所を読み、まずMoodleの位置の型を確かめます。',
                en: 'After the courtyard route cards are put away, Tom lays out museum guide cards. The exhibits and their places first establish the Moodle location frames.',
            }, {
                ja: 'Moodleの8問を元資料の順番どおりに終え、Genkiの2問へ転移できました。Minnaは第10課との時系列対応だけを記録し、間違えた問題だけを直します。',
                en: 'The eight Moodle items are complete in source order, followed by two Genki transfers. Minna records only the Lesson 10 chronology map, and only missed items return for repair.',
            }, [createLessonSeventeenMuseumLocationWorkbookBeat()]);
        case 'l1-l18':
            return chapter('l1-l18', 's1e08-menu-without-pictures', 'shin', {
                ja: '二つの冷蔵庫メモ',
                en: 'Two refrigerator notes',
            }, {
                ja: '共有テーブルの数を確認したあと、シンとピーターが練習キッチンの二つの冷蔵庫メモを開きます。相手のメモは見せずに、物があるか、いくつあるかを聞きます。',
                en: 'After checking the shared-table count, Shin and Peter open two practice-kitchen fridge notes. Without showing the other note, they ask what exists and how many there are.',
            }, {
                ja: '二つの冷蔵庫の物と数がそろい、相手の情報を一つの報告文にできました。シンとピーターは、次の手がかりの前に数と助数詞をもう一度確認します。',
                en: 'The items and quantities in both fridges now agree, and the partner’s information can be reported in one sentence. Shin and Peter check each counter once more before the next clue.',
            }, [createLessonEighteenFridgeInventoryWorkbookBeat(), vegetableBagBeat(), counterMatchBeat()]);
        case 'l1-l19':
            return chapter('l1-l19', 's1e08-menu-without-pictures', 'shin', {
                ja: '元のメニューで注文する',
                en: 'Ordering from the original menu',
            }, {
                ja: '絵のないメニューをもう一度開くと、シンが先生の注文会話の2ページ目を机に置きます。飲み物の一行を見つけ、同じ順番で手に並べてみます。',
                en: 'When the pictureless menu opens again, Shin places page two of the teacher’s ordering dialogue on the table. Find the drink line, then build it by hand in the same order.',
            }, {
                ja: '元の順番で飲み物の注文が言え、二つのMoodle音声もそのまま聞けました。シンは次のメニューの手がかりを急がず、注文の形を残します。',
                en: 'The drink order now follows the original sequence, and both Moodle tracks remain available to hear unchanged. Shin leaves the order pattern in place before following the next menu clue.',
            }, [createLessonNineteenOrderingFoodBeat(), createLessonNineteenListeningGridBeat()]);
        case 'l1-l20':
            return chapter('l1-l20', 's1e09-the-story-in-two-tenses', 'jodi', {
                ja: '回数の予定カード',
                en: 'Frequency schedule cards',
            }, {
                ja: 'ジョディが窓辺に六つの予定カードを置きます。ピーターは、時間の長さと回数を一度に答えようとせず、まず「何回」のカードだけを見るように言います。',
                en: 'Jodi lays six schedule cards by the window. Peter asks the learner not to answer duration and frequency at once: look first for the cards that say how often.',
            }, {
                ja: '六つのカードが期間、に、回数でそろいました。ジョディは、予定を比べる前に、何を数えているかを確かめる習慣を残します。',
                en: 'All six cards now align period, に, and repetition. Before comparing schedules, Jodi leaves behind the habit of checking what is being counted.',
            }, [createLessonTwentyFrequencyLensBeat()]);
        case 'l1-l21':
            return chapter('l1-l21', 's1e17-catwalk-clue', 'peter', {
                ja: '通勤をくらべる二行ノート',
                en: 'A two-line commute notebook',
            }, {
                ja: 'ピーターがストの日といつもの通勤を二行のノートに分けます。エンジェルは、数字を急いで選ぶ前に、その行がどちらの日なのか確かめます。',
                en: 'Peter separates the strike-day and usual commutes into a two-line notebook. Before choosing numbers, Angel checks which day each line describes.',
            }, {
                ja: '三つの通勤メモで、交通手段と時間をそれぞれの日に戻せました。ピーターは、回数か時間かを聞く質問が、実際の移動を話すときにも役立つと確かめます。',
                en: 'The three commute notes now return each transport and duration to its day. Peter sees that asking whether a number is frequency or duration also helps when talking about a real journey.',
            }, [createLessonTwentyOneCommuteComparisonBeat()]);
        case 'l1-l22':
            return chapter('l1-l22', 's1e18-the-memory-card-museum', 'stasi', {
                ja: 'カタカナの音のリレー',
                en: 'Katakana sound relay',
            }, {
                ja: 'りえ先生が二枚のカタカナ表を机に並べます。ミカは、形を急いで選ぶ前に、五つのリレー台を一つずつ聞きます。',
                en: 'Rie lays two katakana charts on the table. Before choosing a shape, Mika listens to the five relay stations one at a time.',
            }, {
                ja: '五つの音が、先生の最初の行の形へ戻りました。ミカは、次の行へ急がず、聞いた音と見た形をもう一度確かめます。',
                en: 'All five sounds now return to the shapes in Sensei’s first row. Mika checks the heard sound and seen shape once more before moving to the next row.',
            }, [createLessonTwentyTwoKatakanaShapeRelayBeat()]);
        case 'l1-l23':
            return chapter('l1-l23', 's1e16-the-night-the-map-went-dark', 'angel', {
                ja: 'カ行の母音の列',
                en: 'Ka-row vowel columns',
            }, {
                ja: 'カタカナの母音の行を確認したあと、エンジェルがカ行の五つの札を五つの列の前に置きます。ソフィーは、英語のつづりに急がず、聞いた音がどの母音の列へ戻るかを確かめます。',
                en: 'After the vowel row is checked, Angel places five ka-row tiles before five columns. Sophie asks the learner not to rush to English spelling, but to check which vowel column each heard sound returns to.',
            }, {
                ja: '五つのカ行の札が、先生の表と同じ母音の列に戻りました。エンジェルとソフィーは、ガ行を先取りせず、カ行だけを確かめた形で次の書く練習へ渡します。',
                en: 'All five ka-row tiles now return to the same vowel columns as Sensei’s chart. Without jumping ahead to the ga row, Angel and Sophie pass on a checked ka row for the next writing practice.',
            }, [createLessonTwentyThreeKatakanaColumnSortBeat()]);
        case 'l1-l24':
            return chapter('l1-l24', 's1e05-final-boss-kana', 'mika', {
                ja: 'サ行とタ行の音の道順',
                en: 'A sound route through the sa and ta rows',
            }, {
                ja: '二つの新しいカタカナ行を前に、ミカが先生の表を二本の道に分けます。エンジェルは、音を聞いてから行と母音の位置を一つずつ指します。',
                en: 'With two new katakana rows open, Mika separates Sensei’s chart into two routes. Angel points to one row and vowel position at a time after listening.',
            }, {
                ja: '十の音が二本の道に戻り、サ行とタ行の対比を確かめられました。見本の濁音は、次の練習に持ち込まず、表に残します。',
                en: 'All ten sounds return to the two routes, confirming the sa/ta contrast. The voiced examples remain on the chart rather than being pulled into the next practice.',
            }, [createLessonTwentyFourKatakanaTwoRowAudioRouteBeat()]);
        case 'l1-l25':
            return chapter('l1-l25', 's1e16-the-night-the-map-went-dark', 'angel', {
                ja: 'ナ行とハ行のスイッチボード',
                en: 'The na and ha row switchboard',
            }, {
                ja: '先生の新しい二行を前に、エンジェルがスイッチボードを開きます。ミカは音を聞いてから、行のスイッチと母音のダイヤルを別々に合わせます。',
                en: 'With Sensei’s two new rows open, Angel brings up a switchboard. Mika listens first, then sets the row switch and vowel dial separately.',
            }, {
                ja: '十の音をナ行とハ行の設定へ戻せました。エンジェルとミカは、パ行とバ行の見本をまだ表に残します。',
                en: 'All ten sounds return to their na/ha settings. Angel and Mika leave the pa and ba examples on the chart for now.',
            }, [createLessonTwentyFiveKatakanaRowSwitchboardBeat()]);
        case 'l1-l26':
            return chapter('l1-l26', 's1e05-final-boss-kana', 'mika', {
                ja: '最後の四行の棚',
                en: 'Shelves for the final four rows',
            }, {
                ja: '先生の最後の四行を前に、ミカが長さの違う棚を開きます。エンジェルは、聞こえた音を急いで五つの位置にそろえず、表にある場所だけを選びます。',
                en: 'With Sensei’s final four rows open, Mika lays out shelves of different lengths. Angel does not force each heard sound into five positions, but chooses only a place visible on the chart.',
            }, {
                ja: '十六の音が、マ行・ヤ行・ラ行・ワ行にある正しい棚へ戻りました。短い行の空いている場所を作らずに、最後のカタカナ表を確かめられました。',
                en: 'All sixteen sounds return to their correct ma, ya, ra, and wa shelves. The final katakana chart is checked without inventing empty positions in its shorter rows.',
            }, [createLessonTwentySixKatakanaFinalRowShelfBeat()]);
        case 'l2-l02':
            return chapter('l2-l02', 's1e11-storm-route-variant', 'alex', {
                ja: '経験のポストカード',
                en: 'Experience postcards',
            }, {
                ja: '先生のChapter 19-1のことばの表を前に、アレックスが三枚の旅行の札を並べます。ジョディは、B-21を聞く前に絵の答えを決めず、一枚ずつ印を置きます。',
                en: 'With Sensei’s Chapter 19-1 vocabulary sheet open, Alex lays out three travel cards. Jodi does not decide the pictures before B-21 plays, and stamps them one at a time.',
            }, {
                ja: '三つの印が先生のB-21の絵と音声に戻りました。次は、聞こえた経験を自分の質問へ変えられます。',
                en: 'The three stamps return to Sensei’s B-21 picture page and audio. The experiences can now become the learner’s own questions.',
            }, [createLessonTwentySevenExperiencePostcardListeningBeat()]);
        case 'l2-l03':
            return chapter('l2-l03', 's1e09-the-story-in-two-tenses', 'jodi', {
                ja: '夏休みの音声ピン',
                en: 'Summer-holiday audio pins',
            }, {
                ja: '記憶のギャラリーで、ジョディが先生の夏休みのページを開きます。アレックスは、B-22を聞くまで、二人の予定の細部を見せないようにします。',
                en: 'In the memory gallery, Jodi opens Sensei’s summer-holiday page. Alex keeps the details of the two plans hidden until B-22 has been heard.',
            }, {
                ja: '四つのピンが、それぞれ聞こえた話し手の棚に戻りました。ジョディは、全部の行動を言い切らずに例を挙げる形を残します。',
                en: 'All four pins now return to the speaker who said them. Jodi leaves the pattern that lists examples without claiming every action.',
            }, [createLessonTwentyNineHolidayItineraryTapeBeat()]);
        case 'l2-l04':
            return chapter('l2-l04', 's1e03-route-zero', 'tom', {
                ja: '普通形の行列',
                en: 'The plain-form matrix',
            }, {
                ja: 'トムが先生の Chapter 20-1 の語彙と動詞の表を開きます。フランシスは、見えている四つの列を先に読み、空いている形を急いで言いません。',
                en: 'Tom opens Sensei’s Chapter 20-1 vocabulary and verb matrix. Francis reads the four visible columns first and does not rush to supply a missing form.',
            }, {
                ja: '四つの行が、先生の表にある辞書形・ない形・なかった形へ戻りました。次は、丁寧な話し方と普通形を場面に合わせて選べます。',
                en: 'Four rows now return to the dictionary, negative, and past-negative columns on Sensei’s matrix. The next step can choose polite or plain style for a situation.',
            }, [createLessonTwentyEightPlainStyleMatrixBeat()]);
        case 'l2-l05':
            return chapter('l2-l05', 's1e11-storm-route-variant', 'alex', {
                ja: 'B-24、B-25、Minna 069 の聞き取り',
                en: 'B-24, B-25, and Minna 069 listening',
            }, {
                ja: 'アレックスが先生の Chapter 20-2 の語彙とB-24のページを開きます。トムは、音声を聞くまで三つの選択を左と右のヒンジにしたままにします。',
                en: 'Alex opens Sensei’s Chapter 20-2 vocabulary and B-24 page. Tom keeps the three choices as left and right hinges until the audio has been heard.',
            }, {
                ja: '三つのヒンジが聞こえた選択へ戻りました。アレックスは、肯定と否定を急いで言い換えず、音声で確かめた選択だけを残します。',
                en: 'The three hinges now return to the choices that were heard. Alex keeps only the audio-checked choices instead of rushing to restate positive and negative forms.',
            }, [createLessonThirtyListeningHingeBeat(), createLessonThirtyB25DiaryListeningBeat(), createLessonThirtyMinna069ConversationBeat()]);
        case 'l2-l06':
            return chapter('l2-l06', 's1e08-menu-without-pictures', 'shin', {
                ja: '「〜と思います」の変換ノートと Minna 072',
                en: 'The 〜と思います notebook and Minna 072',
            }, {
                ja: 'シンが先生の Chapter 21 の語彙、説明、五つの元の文を順に開きます。ソフィーは、答えを見せる前に、と の前の形を一つずつ確かめます。',
                en: 'Shin opens Sensei’s Chapter 21 vocabulary, explanation, and five original statements in order. Sophie checks the form before と one item at a time before any completion is shown.',
            }, {
                ja: '五つの元の文が普通形 + と 思います の推量に変わりました。まちがえた文だけがヒントといっしょにノートへ戻ります。',
                en: 'All five original statements now use plain form + と 思います for supposition. Only missed statements return to the notebook with earned hints.',
            }, [createLessonThirtyOneOpinionTransformationBeat(), createLessonThirtyOneMinna072ConversationBeat()]);
        case 'l2-l07':
            return chapter('l2-l07', 's1e08-menu-without-pictures', 'shin', {
                ja: '「〜でしょう」の確認信号と Minna 074',
                en: 'The 〜でしょう confirmation signals and Minna 074',
            }, {
                ja: 'シンがアカデミー練習キッチンの掲示台に、先生の Chapter 21「〜でしょう」ページを開きます。ソフィーは問題へ進む前に、基本文、説明、例を順に読み、そのあと Minna 074 の正確な聞き取り確認へ進みます。',
                en: 'At the Academy practice-kitchen display, Shin opens Sensei’s Chapter 21 〜でしょう page. Sophie keeps the route on its basic sentence, explanation, and examples before the questions begin, then brings in Minna 074 for an exact listening check.',
            }, {
                ja: '四つの確認文が、普通形と上がるイントネーションの信号につながり、Minna 074 の五つの文にも元音声どおりの○か×が付きました。先生の説明へ戻る道も掲示台に残っています。',
                en: 'All four confirmation sentences now connect plain form with a rising-intonation signal, and all five Minna 074 statements have a source-true ○ or ×. The route back to Sensei’s teaching remains on the display.',
            }, [createLessonThirtyTwoConfirmationSignalBeat(), createLessonThirtyTwoMinna074ListeningBeat()]);
        case 'l2-l08':
            return chapter('l2-l08', 's1e17-catwalk-clue', 'felix', {
                ja: '名詞の前まで走る節のレール',
                en: 'Clause rails to the noun',
            }, {
                ja: 'シンが練習キッチンの掲示を温室のことば散歩道へ渡すと、フェリックスが先生の Chapter 22-1 のページを開きます。四つの物の札は、説明する節が名詞の直前に来るまで名前が決まりません。',
                en: 'Shin passes the practice-kitchen display into the glasshouse word walk, where Felix opens Sensei’s Chapter 22-1 page. The four object cards stay unnamed until each describing clause reaches the position directly before its noun.',
            }, {
                ja: '四つの節が普通形になり、コート、写真、ケーキ、絵の直前につながりました。先生の説明へ戻る道と、もう一度すべてのレールで試す道をフェリックスが残します。',
                en: 'All four clauses now use plain form and sit directly before coat, photo, cake, and picture. Felix leaves both the route back to Sensei’s teaching and a fresh replay of every rail open.',
            }, [createLessonThirtyThreeClauseRailBeat()]);
        case 'l2-l22':
            return chapter('l2-l22', 's1e10-instructions-for-a-cloud', 'christian', {
                ja: '雲への指示',
                en: 'Instructions for a cloud',
            }, {
                ja: '窓の予報を読み終えると、クリスチャンがランタン工房へ地図を運びます。紙の雲はまだ閉じたままで、説明カードは作業台の上で順番を失っています。',
                en: 'After the window forecast, Christian carries the map into the lantern workshop. The paper cloud is still closed, and its instruction cards have lost their order.',
            }, {
                ja: '予報と手順がつながると、紙の雲が正しく開きました。クリスチャンの説明は道を示しますが、ほかの人の直し方も残しています。',
                en: 'Once forecast and sequence agree, the paper cloud opens correctly. Christian’s instructions show a route while leaving room for someone else’s repair.',
            }, [weatherDescriptionBeat(), cloudSequenceBeat()]);
        case 'l2-l23': {
            const trace = await kanjiWriting.lookup('帰');
            if (!trace) throw new Error('The pinned 帰 trace is required for the Lesson 23 source-writing activity.');
            return chapter('l2-l23', 's1e08-menu-without-pictures', 'shin', {
                ja: '九つの漢字、先生のワークシート',
                en: 'Nine kanji from Sensei’s worksheet',
            }, {
                ja: 'シンが漢字6の七枚の原本ページを机に並べます。音声はこのパッケージにないので足さず、先生が印刷した字、読み、練習欄から始めます。',
                en: 'Shin lays all seven original Kanji 6 pages on the table. The package has no audio, so none is added: begin with the characters, readings, and practice panels Sensei printed.',
            }, {
                ja: '新聞、図書館、帰の読みと形を、先生のページに戻って確認できるようになりました。Minnaは漢字6の順番だけを示し、Genkiの本文や音声は足していません。',
                en: 'You can now return to Sensei’s pages to check 新聞, 図書館, and the form of 帰. Minna supplies only the Kanji 6 sequence; no Genki text or audio has been added.',
            }, [
                createLessonL2L23SourceVocabularyBeat(),
                createLessonL2L23KanjiColumnSortBeat(),
                createLessonL2L23LibraryReadingBeat(),
                createLessonL2L23ReturnWritingBeat(trace),
            ]);
        }
        case 'l2-l25':
            return chapter('l2-l25', 's1e10-instructions-for-a-cloud', 'rie', {
                ja: '予報に残す余白',
                en: 'Room inside a forecast',
            }, {
                ja: 'リエ先生が Chapter 32-2 と 32-3 の六枚を開きます。ミカとヘンリーは、強い予想と小さい可能性を、先生が印刷した八つの例から見分けます。',
                en: 'Rie opens all six Chapter 32-2 and 32-3 pages. Mika and Henry distinguish stronger predictions from smaller possibilities using the eight examples Sensei printed.',
            }, {
                ja: '八つの原文例を、ふりがな、空白、句読点、原本の綴りを変えずに確認できました。未対応の資料と音声は、関係を推測せず隔離したままです。',
                en: 'All eight source examples are checked without changing readings, spacing, punctuation, or the source spelling. Unconverted documents and unpaired audio remain quarantined rather than inferred.',
            }, [createLessonL2L25ProbabilityBriefingBeat()]);
        case 'l2-l26':
            return chapter('l2-l26', 's1e10-instructions-for-a-cloud', 'christian', {
                ja: '標識と命令形、先生のChapter 33',
                en: 'Signs and imperatives from Sensei’s Chapter 33',
            }, {
                ja: 'クリスチャンがChapter 33の九枚の原本ページを並べます。五つの音声ファイルは課題との組み合わせが未確認なので再生せず、標識、活用表、例文、宿題の見えている行だけから始めます。',
                en: 'Christian lays out nine canonical Chapter 33 pages. Five archived audio files remain quarantined because their task pairings are unverified, so begin only with the visible signs, conjugation tables, examples, and homework rows.',
            }, {
                ja: '使用禁止、三つの動詞グループ、頑張れ、くる→こいを、原本の行と順番へ戻って確認できるようになりました。音声や未確認の解答は足していません。',
                en: 'You can now return to the source lines and order for 使用禁止, the three verb groups, 頑張れ, and くる→こい. No audio or unverified answer key has been added.',
            }, [
                createLessonL2L26SignMeaningBeat(),
                createLessonL2L26VerbGroupSortBeat(),
                createLessonL2L26RunnerSequenceBeat(),
                createLessonL2L26KuruImperativeBeat(),
            ]);
        case 'l2-l27':
            return chapter('l2-l27', 's1e07-no-spoilers', 'ruparna', {
                ja: '伝言を渡し、意味を保つ',
                en: 'Pass the message, keep the meaning',
            }, {
                ja: 'ルパーナが先生の Chapter 33-2 の四枚を開きます。ヘンリーは、普通形の伝言、直接引用、発言の報告、標識の意味を別々の欄へ置きます。',
                en: 'Ruparna opens Sensei’s four Chapter 33-2 pages. Henry separates plain-form relays, direct quotations, reported speech, and sign meanings into their own columns.',
            }, {
                ja: '八つの原文を、引用符、普通形、丁寧さ、意味の型を変えずに戻せました。対応が確認できない六つの音声は隔離したままです。',
                en: 'All eight source lines are restored without changing quotation marks, plain form, register, or the meaning frame. The six audio members with unverified pairings remain quarantined.',
            }, [createLessonL2L27ReportedMessageBeat()]);
        case 'l2-l28':
            return chapter('l2-l28', 's1e10-instructions-for-a-cloud', 'rie', {
                ja: '見本どおりに、そのあとで',
                en: 'As shown, then one step more',
            }, {
                ja: 'リエ先生が Chapter 34-1 の五枚を開きます。最初に「とおり」と「あとで」の説明と例を読み、二つの関係を別々の列へ置きます。',
                en: 'Rie opens five Chapter 34-1 pages. First read Sensei’s explanations and examples for とおり and あとで, then place the two relations in separate columns.',
            }, {
                ja: '七つの原文項目を、動詞と名詞の型、時間関係、準備の違いを保って戻せました。三つの未確認音声と二つの解答PDFは隔離したままです。',
                en: 'All seven source items are restored with their verb/noun patterns, time relation, and preparation contrast intact. Three unpaired audio files and two answer PDFs remain quarantined.',
            }, [createLessonL2L28FollowModelBeat()]);
        case 'l2-l34': {
            const trace = await kanjiWriting.lookup('理');
            if (!trace) throw new Error('The pinned 理 trace is required for the Lesson l2-l34 source-writing activity.');
            return chapter('l2-l34', 's1e08-menu-without-pictures', 'shin', {
                ja: 'メニューの七つの漢字',
                en: 'Seven kanji on the menu',
            }, {
                ja: 'シンが先生の漢字7の二枚を机に並べます。このパッケージに音声はないので足さず、先生が印刷した読み方、ことば、例文、書き順、読み練習から始めます。',
                en: 'Shin lays out both original Kanji 7 pages. The package has no audio, so none is added: begin with the readings, words, examples, stroke rows, and reading task Sensei printed.',
            }, {
                ja: '八つの印刷された読みと「理」の形を、先生の原本へ戻って確認できるようになりました。MinnaとGenkiは順番と範囲だけを示し、音声や未確認の解答は足していません。',
                en: 'You can now return to Sensei’s pages to check eight printed readings and the form of 理. Minna and Genki supply chronology and scope only; no audio or unverified answer key has been added.',
            }, [createLessonL2L34KanjiMenuReadingBeat(), createLessonL2L34RiWritingBeat(trace)]);
        }
        case 'l2-l35':
            return chapter('l2-l35', 's1e09-the-story-in-two-tenses', 'jodi', {
                ja: '相手を思いやる提案',
                en: 'A considerate recommendation',
            }, {
                ja: 'ジョディが先生の Chapter 35 の四枚を開きます。相手の状況を聞き、押しつけずに提案する会話を、印刷された順番のまま戻します。',
                en: 'Jodi opens Sensei’s four Chapter 35 pages. Restore the printed exchange in order: listen to the other person’s situation, then offer a suggestion without pushing it on them.',
            }, {
                ja: '八つの部分が一つの自然な会話に戻り、相手を思いやる「〜ませんか」の提案を原文どおりに使えました。',
                en: 'All eight segments are back in one natural exchange, preserving Sensei’s considerate 〜ませんか recommendation exactly.',
            }, [createLessonL2L35ConsiderateRecommendationBeat()]);
        case 'l2-l36':
            return chapter('l2-l36', 's1e10-instructions-for-a-cloud', 'rie', {
                ja: '行動につながる目標',
                en: 'Goals you can act toward',
            }, {
                ja: 'りえ先生が Chapter 36-1 の四枚を作業台に並べます。目標と、そのために今できる行動を「ように」でつなぎます。',
                en: 'Rie lays the four Chapter 36-1 pages across the workbench. Connect each goal to an action you can take now with ように.',
            }, {
                ja: '八つの印刷例を原文どおりに戻し、目標と行動、避けたい結果と予防を分けられるようになりました。',
                en: 'All eight printed examples are restored in source wording, separating goals from actions and unwanted outcomes from prevention.',
            }, [createLessonL2L36YouniGoalWorkshopBeat()]);
        case 'l1-l01':
            return chapter('l1-l01', 's1e01-the-blank-atlas', 'rie', {
                ja: '白い地図帳の名札',
                en: 'Name cards for the Blank Atlas',
            }, {
                ja: '最初の自己紹介が終わると、りえ先生がまだ白い地図帳を図書館のテーブルに開きます。道を描く前に、隣の人の名前と答えを聞く必要があります。',
                en: 'After the first introductions, Rie opens the still-blank Atlas on a library table. Before a route can be drawn, you need to hear the name and answer of the person beside you.',
            }, {
                ja: '自己紹介と質問が一つの会話になり、二人の名札が地図帳に残りました。知らない名前を集める最初の道がここから始まります。',
                en: 'Introduction and question now form one exchange, leaving both name cards in the Atlas. The first route made from newly learned names begins here.',
            }, [createLessonOneGreetingWorksheetBeat(), ...createMegaPackLessonOneBeats(), classActivityBeat('blank-atlas-pair', {
                ja: 'りえ先生がアーカッシュの席を指します。「書くだけではなく、質問の答えまで聞いてください。」',
                en: 'Rie points to Aakash’s seat. “Do not stop after writing. Listen through the answer to your question.”',
            }, 'l1-l01')]);
        case 'l1-l02':
            return chapter('l1-l02', 's1e01-the-blank-atlas', 'rie', {
                ja: '四人のプロフィール札',
                en: 'Four profile cards',
            }, {
                ja: '名札が地図帳に残ると、りえ先生が四人のプロフィール札を机に並べます。国、仕事、専攻を先に読み、それから一人ずつ確かめます。',
                en: 'Once the name cards remain in the Atlas, Rie lays out four profile cards. Read country, work, and major first, then identify each person.',
            }, {
                ja: '四人の手がかりが正しいプロフィールにつながりました。名前だけでなく、その人について質問する道が開きます。',
                en: 'Each clue now leads to the right profile. The route opens from learning a name to asking about the person.',
            }, [beat('profile-board', {
                ja: 'りえ先生が最初の例を指します。「答える前に、プロフィールのどの欄を聞いているか見ましょう。」',
                en: 'Rie points to the worked example. “Before answering, notice which profile field the question asks for.”',
            }, createLessonTwoProfileBoardModel())]);
        case 'l1-l03':
            return chapter('l1-l03', 's1e01-the-blank-atlas', 'rie', {
                ja: 'メアリーへの六つの質問',
                en: 'Six questions for Mary',
            }, {
                ja: '四人の札を片づける前に、りえ先生がメアリーの一枚を残します。六つの質問と六つの答えを、意味を確認してから結びます。',
                en: 'Before putting the cards away, Rie leaves Mary’s profile on the desk. Check the meaning, then connect six questions with six answers.',
            }, {
                ja: '質問と答えが一対一につながり、プロフィールを会話として聞けるようになりました。',
                en: 'Every question now has its matching answer, turning the profile into a conversation.',
            }, [beat('moodle-listening-a-or-b', {
                ja: 'りえ先生が音声の前に、名前と国の二つの質問の形を指します。「先にAとBを見てから、聞こえた音を比べましょう。」',
                en: 'Before starting the audio, Rie points to the two question frames. “Look at A and B first, then compare the sound you hear.”',
            }, createLessonThreeMoodleListeningModel()), beat('profile-question-match', {
                ja: '名前、仕事、学年、年齢、専攻、電話番号の順に、例を声に出して確かめます。',
                en: 'Check the examples aloud: name, work, year, age, major, then telephone number.',
            }, createLessonThreeProfileQuestionMatchModel())]);
        case 'l1-l04':
            return chapter('l1-l04', 's1e01-the-blank-atlas', 'rie', {
                ja: '地図帳の三つの距離',
                en: 'Three distances on the atlas',
            }, {
                ja: 'りえ先生が白い地図帳に三つの印を置きます。話す人の近く、聞く人の近く、二人から遠い場所です。',
                en: 'Rie places three markers on the Blank Atlas: near the speaker, near the listener, and far from both people.',
            }, {
                ja: '九つの場面が地図帳の位置と合いました。物の名前だけでなく、だれの視点かを確かめてから、次の札を置けます。',
                en: 'All nine scenes now agree with the Atlas positions. The next label can be placed by checking whose viewpoint is speaking, not only the object name.',
            }, [beat('source-picture-vocabulary', {
                ja: 'りえ先生が絵の丸数字と単語帳の番号を並べます。「答える前に、同じ番号の行を一度、声に出して見ましょう。」',
                en: 'Rie places the circled picture numbers beside the vocabulary rows. “Before answering, read the matching numbered row aloud once.”',
            }, createLessonFourPictureVocabularyModel()), beat('object-distance-board', {
                ja: 'りえ先生はペン、本、かさの札を動かしながら言います。「ことばの前に、だれの近くかを見ましょう。」',
                en: 'Rie moves the pen, book, and umbrella cards: “Before choosing the word, notice whose side the object is on.”',
            }, createLessonFourObjectDistanceModel())]);
        case 'l1-l05':
            return chapter('l1-l05', 's1e01-the-blank-atlas', 'rie', {
                ja: 'だれの持ち物ですか',
                en: 'Whose object is it?',
            }, {
                ja: '距離の札の横に、持ち主のない物が五つ残っています。りえ先生の例で「AのB」を読んでから、持ち主と物を結びます。',
                en: 'Five objects remain beside the distance cards without owners. Read Rie’s A-no-B example first, then connect each owner and object.',
            }, {
                ja: '五つの物に持ち主が戻り、地図帳の忘れ物欄が完成しました。',
                en: 'All five objects have their owners again, completing the Atlas lost-property page.',
            }, [beat('possession-phrase-builder', {
                ja: '二つの札を選ぶ前に、「だれ」と「何」の順を確認します。',
                en: 'Before choosing the two cards, check the order: whose, then what.',
            }, createLessonFivePossessionPhraseModel())]);
        case 'l1-l06':
            return chapter('l1-l06', 's1e01-the-blank-atlas', 'rie', {
                ja: '場所と持ち主のページ',
                en: 'The place-and-owner page',
            }, {
                ja: '忘れ物の持ち主が分かると、りえ先生が地図帳の場所欄を開きます。物がどこにあるか、そしてだれの物かを、例から順に確かめます。',
                en: 'Once the lost objects have owners, Rie opens the Atlas location page. Use the examples to check where each object is and who owns it.',
            }, {
                ja: '場所と持ち主の二つの手がかりがそろい、教室の物を正しく案内できるようになりました。',
                en: 'Place and owner now work together, so the classroom objects can be described clearly.',
            }, [beat('place-and-owner-workbook', {
                ja: '最初に場所を選び、そのあと「AのB」で持ち主を作ります。',
                en: 'Choose the place first, then build the owner phrase with A-no-B.',
            }, createLessonSixPlaceAndOwnerModel())]);
        case 'l1-l15':
            return chapter('l1-l15', 's1e06-invitation-chain', 'robert', {
                ja: 'カフェの誘いボード',
                en: 'The cafe invitation board',
            }, {
                ja: '小さな集まりの話が始まると、ロバートがアカデミーカフェの共有ボードを開きます。一つの誘いが次の人の理由と返事につながる仕組みです。',
                en: 'As talk of a small get-together begins, Robert opens the shared board in the Academy cafe. Each invitation passes into the next person’s reason and reply.',
            }, {
                ja: '好きなこと、理由、場所、あたたかい返事が一つの誘いの鎖になりました。予定は押しつけず、次の人が参加できる形で残ります。',
                en: 'A preference, reason, place, and warm response now make one invitation chain. The plan remains open enough for the next person to join.',
            }, [classActivityBeat('cafe-group-board', {
                ja: 'ロバートが最初の欄を空け、シンユ、フランシス、ミカへ順番にペンを渡します。',
                en: 'Robert leaves the first field open and passes the pen around Xingyu, Francis, and Mika in order.',
            }, 'l1-l15')]);
        case 'l2-l09':
            return chapter('l2-l09', 's1e07-no-spoilers', 'ruparna', {
                ja: '「を」と「が」の信号ミキサー',
                en: 'The wo/ga signal mixer',
            }, {
                ja: '温室のことば散歩道で節のレールを終えると、フェリックスが先生の Chapter 22-2 の二ページをメディア室のルパーナへ渡します。ルパーナは答えを伏せ、普通形と外側の助詞を別々の信号にします。',
                en: 'After the clause rails in the glasshouse word walk, Felix passes Sensei’s two Chapter 22-2 pages to Ruparna in the media room. Ruparna keeps the answers covered and separates the plain form from the outer-particle signal.',
            }, {
                ja: '四つの名詞句が、普通形の節を保ったまま「を」と「が」の正しいチャンネルへ届きました。先生の説明へ戻るボタンと、四つを最初から再生する信号がメディア室に残ります。',
                en: 'All four noun phrases reach the correct wo or ga channel with their plain-form clauses intact. The media room keeps both a return to Sensei’s teaching and a fresh replay of all four signals.',
            }, [createLessonThirtyFourParticleSignalMixerBeat(), createLessonThirtyFourMinna075ConversationBeat()]);
        case 'l2-l10':
            return chapter('l2-l10', 's1e16-the-night-the-map-went-dark', 'angel', {
                ja: '「とき」の境目',
                en: 'The toki threshold',
            }, {
                ja: 'メディア室の信号を片づけると、ルパーナが先生の Chapter 23-1 の二ページをエンジェルへ送ります。アトラス管理デスクでは、駅ルートの一つ一つの行動に「完了する前」と「完了した後」の境目が必要です。',
                en: 'As the media-room signals settle, Ruparna sends Sensei’s two Chapter 23-1 pages to Angel. At the Atlas control desk, each action on the station route needs a clear threshold: before completion or after it.',
            }, {
                ja: '四つのことばが正しい境目を通り、駅ルートは辞書形とた形の時点を見分けられる案内になりました。先生の説明へ戻る道と、四つを最初からやり直す道も残っています。',
                en: 'All four speech bubbles cross the right threshold, leaving a station route that distinguishes dictionary-form timing from ta-form timing. A return to Sensei’s teaching and a fresh replay of all four remain open.',
            }, [createLessonThirtyFiveTokiThresholdBeat(), createLessonThirtyFiveMinna077ListeningBeat()]);
        case 'l2-l11':
            return chapter('l2-l11', 's1e16-the-night-the-map-went-dark', 'rie', {
                ja: '「とき」の案内ルート',
                en: 'The toki occasion routes',
            }, {
                ja: 'アトラス管理デスクの境目を通し終えると、エンジェルが先生の新しい Chapter 23-1 のページを駅コンコースのりえ先生へ届けます。りえ先生は四つの案内カードを、行動や状態が「ある／ない」の二つの路線へ置きます。',
                en: 'After the last threshold clears the Atlas control desk, Angel delivers Sensei’s new Chapter 23-1 page to Rie at the station concourse. Rie places four notice cards across two routes: an action or state that is present, and one that is absent.',
            }, {
                ja: '四つの元の二文が、辞書形とない形の正しい「とき」ルートで一文になりました。先生の説明へ戻る道と、四つを最初からやり直す路線も残っています。',
                en: 'All four source pairs now form one sentence through the correct dictionary-form or nai-form toki route. A return to Sensei’s teaching and a fresh replay of all four routes remain open.',
            }, [createLessonThirtySixOccasionRouteBeat()]);
        case 'l2-l12':
            return chapter('l2-l12', 's1e16-the-night-the-map-went-dark', 'aakash', {
                ja: '二つの動作の「ながら」工房',
                en: 'The two-action nagara workshop',
            }, {
                ja: '駅コンコースの案内文を片づけると、りえ先生が次の Chapter 28-1 の二ページを共有キッチンのアカシュへ届けます。ラジオとスープの二つの動作から、後ろに残る主動作を見つけます。',
                en: 'After the station notices are complete, Rie delivers the next Chapter 28-1 pages to Aakash in the shared kitchen. Radio and soup supply two simultaneous actions, and the task is to identify the main action that remains at the end.',
            }, {
                ja: '六つの元の二文が、ます語幹＋ながらと主動作の順番を保った一文になりました。先生の説明へ戻る道と、六つを最初からやり直す工房も残っています。',
                en: 'All six source pairs now form one sentence with the masu-stem plus nagara and the main action in its source position. A return to Sensei’s teaching and a fresh replay of all six joins remain open.',
            }, [
                createLessonThirtySevenNagaraWorkshopBeat(),
                createLessonThirtySevenTrack78BankListeningBeat(),
                createLessonThirtySevenTrack79FavorDirectionBeat(),
            ]);
        case 'l2-l13':
            return chapter('l2-l13', 's1e06-invitation-chain', 'robert', {
                ja: '理由をつなぐ「し」の鎖',
                en: 'The shi reason chain',
            }, {
                ja: '共有キッチンで二つの動作をつなぎ終えると、アカシュが先生の Chapter 28-2 の二ページをカフェのロバートへ届けます。ロバートは、似た情報と理由から結論までを「し」でつなぎます。',
                en: 'After joining two simultaneous actions in the shared kitchen, Aakash delivers Sensei\'s Chapter 28-2 pages to Robert at the cafe. Robert links similar details and carries multiple reasons through to their conclusion with shi.',
            }, {
                ja: '八つの原文が、普通形の「し」と理由のあとの結論を保つ鎖になりました。先生の説明へ戻る道と、八つを最初からやり直す道もカフェに残っています。',
                en: 'All eight source prompts now form chains that preserve plain-form shi and the conclusion after its reasons. The cafe keeps both a return to Sensei\'s teaching and a fresh replay of all eight chains.',
            }, [
                createLessonThirtyEightShiReasonChainBeat(),
                createLessonThirtyEightA11MealSurveyListeningBeat(),
            ]);
        case 'l2-l14':
            return chapter('l2-l14', 's1e07-no-spoilers', 'ruparna', {
                ja: '部屋が伝える結果の状態',
                en: 'What the room’s state tells us',
            }, {
                ja: 'カフェの集まりが終わると、ロバートが先生の Chapter 29-1 の四ページをメディア室のルパーナへ届けます。ルパーナは、部屋に残った変化の結果を、安全な引き継ぎへ変えます。',
                en: 'When the cafe gathering ends, Robert delivers Sensei’s four Chapter 29-1 pages to Ruparna in the media room. Ruparna turns the visible results left in the room into a safe handover.',
            }, {
                ja: '八つの原問が、自動詞＋「が」の状態、次の行動、話題の「は」を保った報告になりました。先生の説明へ戻る道と、八つを最初からやり直す点検も残っています。',
                en: 'All eight source prompts now preserve the intransitive state with ga, the next action, or the topic with wa. A return to Sensei’s teaching and a fresh replay of all eight inspections remain available.',
            }, [createLessonThirtyNineStateInspectionBeat()]);
        case 'l2-l15':
            return chapter('l2-l15', 's1e07-no-spoilers', 'ruparna', {
                ja: '終わったことと、やってしまったこと',
                en: 'Finished it, or went and did it',
            }, {
                ja: 'メディア室の引き継ぎを閉じる前に、教室のクリスチャンから、落とした携帯についてのメッセージと先生の Chapter 29-2 の五ページが届きます。ルパーナは、完了と残念な結果の同じ形を文脈で分けます。',
                en: 'Before Ruparna closes the media-room handover, a classroom message arrives from Christian about his dropped phone with Sensei’s five Chapter 29-2 pages. Ruparna uses context to separate completion from a regrettable result in the same form.',
            }, {
                ja: '八つの原問が、完了の質問、先に終える決意、残念な結果を保つ文になりました。先生の説明へ戻る道と、八つを最初からやり直す修復も残っています。',
                en: 'All eight source prompts now preserve completed-action questions, finish-first intentions, or regrettable results. A return to Sensei’s teaching and a fresh replay of all eight repairs remain available.',
            }, [createLessonFortyCompletionRepairBeat()]);
        case 'l2-l16':
            return chapter('l2-l16', 's1e07-no-spoilers', 'ruparna', {
                ja: 'だれかが準備しておいた部屋',
                en: 'The room someone left ready',
            }, {
                ja: '完了と残念な出来事を分けたあと、クリスチャンは落とした携帯をそっと置き、ヘンリーと次の教室の準備表を開きます。ルパーナは先生の Chapter 30-1 と二つの部屋を並べます。',
                en: 'After separating completion from regret, Christian sets his dropped phone down carefully and opens the next classroom preparation sheet with Henry. Ruparna lays out Sensei’s Chapter 30-1 pages beside the two room plans.',
            }, {
                ja: '八つの原問が、見えるだけの状態と、だれかが準備して残した状態を分ける報告になりました。先生の説明へ戻る道と、八つを最初からやり直す点検も残っています。',
                en: 'All eight source prompts now distinguish a merely visible state from one someone deliberately left prepared. A return to Sensei’s teaching and a fresh replay of all eight reports remain available.',
            }, [createLessonFortyOnePreparedStateAuditBeat()]);
        case 'l2-l17':
            return chapter('l2-l17', 's1e07-no-spoilers', 'ruparna', {
                ja: '先にしておくこと、あとで戻すこと',
                en: 'Do it now, thank yourself later',
            }, {
                ja: '教室の準備表を閉じると、エンジェルが帰国前の予定を持ってきます。クリスチャンとヘンリーは先生の Chapter 30-2 と語彙表を広げ、旅の前、使ったあと、今の状態を保つために何をしておくかを整理します。',
                en: 'When the classroom preparation sheet closes, Angel arrives with her plans before returning home. Christian and Henry open Sensei’s Chapter 30-2 and vocabulary sheet to decide what to do before the journey, after using something, or to preserve its current state.',
            }, {
                ja: '八つの原問が、期限までの準備、次に使うための片付け、そのままにする意図を保つ文になりました。先生の説明へ戻る道と、八つを最初からやり直す道も残っています。',
                en: 'All eight source prompts now preserve preparation by a deadline, resetting for next use, and the intention to leave a state unchanged. A return to Sensei’s teaching and a fresh replay of all eight prompts remain available.',
            }, [createLessonFortyTwoAdvancePreparationBeat()]);
        case 'l2-l18':
            return chapter('l2-l18', 's1e07-no-spoilers', 'ruparna', {
                ja: '全部ではなく、必要なことだけ',
                en: 'Say enough, not everything',
            }, {
                ja: 'エンジェルの帰国準備を手伝っていると、教室の明かりが一度消えます。ジョディは先生の Chapter 30-3 語彙表と伝言メモを非常袋の横に広げ、クリスチャンと必要な例だけを残す練習を始めます。',
                en: 'While the class helps Angel prepare to return home, the classroom lights flicker out. Jodi opens Sensei’s Chapter 30-3 vocabulary and message memos beside the emergency bag, then practises leaving Christian only the examples and instruction he needs.',
            }, {
                ja: '八つの原問で、一般的な「とか」の例、特定の出来事、伝言の大切な行動を区別できました。先生の原本、段階ヒント、間違えた問だけの修復、最初からの再挑戦はいつでも戻れます。',
                en: 'Across eight source prompts, you separated general とか examples, specific events, and the actionable part of a message. Sensei’s originals, earned hints, missed-item repair, and a full replay remain available.',
            }, [createLessonFortyThreeMessageHandoffBeat()]);
        case 'l2-l19':
            return chapter('l2-l19', 's1e07-no-spoilers', 'ruparna', {
                ja: '一つの動詞から始める計画',
                en: 'One verb, then a plan',
            }, {
                ja: '非常袋のメモを閉じると、ルパーナが Chapter 31 の原本と動詞の表をメディア室の机に置きます。サムは一つの小さな計画を言い、ロバートとエンジェルは、その形がどの動詞の組に入るかを確かめます。',
                en: 'When the emergency-bag notes close, Ruparna lays Sensei’s Chapter 31 originals and verb-form sheet on the media-room table. Sam offers one small plan while Robert and Angel check which verb group gives it its shape.',
            }, {
                ja: '八つの原問で、五段・一段・不規則動詞の意向形を作れました。先生の原本、間違えた問だけの修復、三段階のヒント、最初からの再挑戦はいつでも戻れます。',
                en: 'Across eight source prompts, the volitional forms for godan, ichidan, and irregular verbs are now in place. Sensei’s originals, missed-item repair, three earned hints, and a full replay remain available.',
            }, [createLessonFortyFourVolitionalPlanBeat()]);
        case 'l2-l20':
            return chapter('l2-l20', 's1e07-no-spoilers', 'ruparna', {
                ja: '考えてきた、小さな計画',
                en: 'A small plan you have been carrying',
            }, {
                ja: 'ルパーナが先生の Chapter 31-1 の原本と語彙表を開きます。サムは、すぐ決めたことではなく、少し前から考えていることを、意向形で一つずつ言います。',
                en: 'Ruparna opens Sensei’s Chapter 31-1 originals and vocabulary sheet. Sam practises saying one intention at a time: not a decision made this instant, but one considered for a while.',
            }, {
                ja: '八つの原問で、意向形を「〜ようと思っています」の計画につなげられました。先生の原本、三段階のヒント、間違えた問だけの修復、最初からの再挑戦はいつでも戻れます。',
                en: 'Across eight source prompts, you connected volitional forms to plans with 〜ようと思っています. Sensei’s originals, three earned hints, missed-item repair, and a full replay remain available.',
            }, [createLessonFortyFiveIntentionRouteBeat()]);
        case 'l2-l21':
            return chapter('l2-l21', 's1e07-no-spoilers', 'ruparna', {
                ja: '決めたこと、決まっていること',
                en: 'What you decided, what is arranged',
            }, {
                ja: 'ヘンリーは先生の Chapter 31-2 の語彙表を開き、エンジェルと二つの欄を作ります。一つは自分で決めたこと、もう一つはすでに予定になっていることです。クリスチャンは「実は」と理由を加え、形が変わるところを確かめます。',
                en: 'Henry opens Sensei’s Chapter 31-2 vocabulary sheet and builds two columns with Angel: things she has decided herself and things that are already arranged. Christian adds a reason with 実は and checks where the form changes.',
            }, {
                ja: '八つの原問で、つもり、予定、近い未来、確信のつもりを区別できました。先生の原本、三段階のヒント、間違えた問だけの修復、最初からの再挑戦はいつでも戻れます。',
                en: 'Across eight source prompts, you separated つもり, 予定, immediate future, and the conviction meaning of つもり. Sensei’s originals, three earned hints, missed-item repair, and a full replay remain available.',
            }, [createLessonFortySixPlanChangeRepairBeat()]);
        case 'l2-l29':
            return chapter('l2-l29', 's1e07-no-spoilers', 'ruparna', {
                ja: 'これで、しないで',
                en: 'With this, without that',
            }, {
                ja: 'ルパーナが先生の Chapter 34-2 語彙表と文法原本を開き、Track 27 の茶道会話を再生します。まず形を選び、それからクララが聞いた手順をたどります。',
                en: 'Ruparna opens Sensei’s Chapter 34-2 vocabulary and grammar originals, then plays the tea-ceremony conversation on Track 27. First the class chooses the form; then it follows the instructions Clara heard.',
            }, {
                ja: '八つの原問で、同時の動作、しないで行う動作、茶道の順序を確認できました。間違えた問だけの修復と、原本からの再挑戦が残っています。',
                en: 'Across eight source prompts, you checked simultaneous actions, actions done without another action, and the tea sequence. Missed-item repair and a fresh replay from the originals remain available.',
            }, [createLessonL2L29TeaCeremonyBeat()]);
        case 'l2-l30':
            return chapter('l2-l30', 's1e07-no-spoilers', 'ruparna', {
                ja: '条件から、その先へ',
                en: 'From condition to consequence',
            }, {
                ja: 'ルパーナが先生の Chapter 35 条件形表、ことわざ、練習原本を順に開きます。リエ先生の形を確認してから、条件の後に何が続くかを確かめます。',
                en: 'Ruparna opens Sensei’s Chapter 35 conditional tables, proverbs, and exercise originals in order. The class checks Rie’s printed forms, then works out what follows from each condition.',
            }, {
                ja: '八つの原問で、活用表の形、ことわざ、肯定と否定の文接続を確認できました。原本、三段階のヒント、間違えた問だけの修復、最初からの再挑戦はいつでも戻れます。',
                en: 'Across eight source prompts, you retrieved table forms, a proverb, and positive and negative sentence joins. Sensei’s originals, three earned hints, missed-item repair, and a full replay remain available.',
            }, [createLessonL2L30ConditionalWorkshopBeat()]);
        case 'l2-l31':
            return chapter('l2-l31', 's1e07-no-spoilers', 'ruparna', {
                ja: '形容詞と名詞の条件',
                en: 'Conditions for qualities and nouns',
            }, {
                ja: 'ルパーナが先生の Chapter 35-2 語彙表と条件形の原本を開きます。語彙と作り方を確認してから、い形容詞、な形容詞、名詞の条件を作ります。',
                en: 'Ruparna opens Sensei’s Chapter 35-2 vocabulary and conditional-form originals. After checking the words and formation rules, the class builds conditions from i-adjectives, na-adjectives, and nouns.',
            }, {
                ja: '八つの原文で、語彙と「ければ／なら」の使い分けを確認できました。原本、三段階のヒント、間違えた問だけの修復、最初からの再挑戦はいつでも戻れます。',
                en: 'Across eight source cues, you checked the vocabulary and the choice between ければ and なら. Sensei’s originals, three earned hints, missed-item repair, and a full replay remain available.',
            }, [createLessonL2L31AdjectiveNounConditionalsBeat()]);
        case 'l2-l32':
            return chapter('l2-l32', 's1e07-no-spoilers', 'ruparna', {
                ja: '条件から、役に立つ提案へ',
                en: 'From condition to useful guidance',
            }, {
                ja: 'クリスチャンが先生の Chapter 35-2 と 35-3 の原本を開き、ピーターが形容詞・名詞の条件と、相手の話に返す「なら」の情報を分けます。健康の参照語彙も、原本のまま先に確認します。',
                en: 'Christian opens Sensei’s Chapter 35-2 and 35-3 originals while Peter separates adjective and noun conditions from なら information offered in reply. The class checks the health reference in its original form first, too.',
            }, {
                ja: '八つの印刷例で、形容詞・名詞の条件と、名詞＋ならの情報・提案を復元できました。三つの未確認音声は隔離されたまま、原本、間違えた行だけの修復、三段階のヒント、最初からの再挑戦はいつでも戻れます。',
                en: 'Across eight printed examples, you restored adjective and noun conditions plus noun + なら information and suggestions. The three unresolved audio files remain quarantined; Sensei’s originals, missed-row repair, three earned hints, and a full replay remain available.',
            }, [createLessonL2L32NaraGuidanceWorkshopBeat()]);
        case 'l2-l33':
            return chapter('l2-l33', 's1e07-no-spoilers', 'ruparna', {
                ja: 'Chapter 35 宿題の印刷例',
                en: 'Printed models from the Chapter 35 homework',
            }, {
                ja: 'クリスチャンが先生の宿題原本を二ページとも開き、ピーターが条件、町の提案、理由、疑問詞の印刷例を分けます。Track 30 は未確認のまま再生しません。',
                en: 'Christian opens both pages of Sensei’s homework while Peter separates the printed conditions, town recommendations, reasons, and interrogative model. Track 30 remains unplayed while its pairing is unresolved.',
            }, {
                ja: '八つの見える印刷例と理由の対応を復元できました。開放問題は自由なまま、三つの未確認音声は隔離され、間違えた行だけの修復と原本からの再挑戦が残っています。',
                en: 'You restored eight visible printed models and reason mappings. Open responses remain open, all three unresolved audio files stay quarantined, and missed-row repair plus a fresh replay from the originals remain available.',
            }, [createLessonL2L33Chapter35HomeworkReviewBeat()]);
        case 'l1-l07':
            return chapter('l1-l07', 's1e06-invitation-chain', 'robert', {
                ja: 'カフェの れんしゅうレジ',
                en: 'The cafe practice counter',
            }, {
                ja: '本当の カフェの 予定を 立てる 前に、ロバートが レッスンの 買い物ことばを 使う れんしゅうレジを 開きます。',
                en: 'Before the cafe makes any real plans, Robert opens a practice counter for the lesson’s shopping language.',
            }, {
                ja: '三つの レジ券が そろい、ねだんを たずねて、ほしい ものを たのめる ように なりました。',
                en: 'The three tickets now agree, ready for asking a price and requesting the item you want.',
            }, [createLessonSevenShopCounterBeat()]);
    }
}

/** In-progress authored extensions cannot take down the conforming core lesson route. */
export async function loadReachableLessonActivityChapter(
    packageId: string,
    kanjiWriting: KanjiWritingService,
): Promise<LessonActivityChapter | null> {
    try {
        return await loadLessonActivityChapter(packageId, kanjiWriting);
    } catch {
        return null;
    }
}

function chapter(
    lessonPackageId: ChapterPackageId,
    canonicalEpisodeId: string,
    hostId: string,
    title: LessonActivityChapter['title'],
    introduction: LessonActivityChapter['introduction'],
    conclusion: LessonActivityChapter['conclusion'],
    beats: readonly LessonActivityBeat[],
): LessonActivityChapter {
    const episode = requiredEpisode(canonicalEpisodeId);
    if (!episode.cast.includes(hostId)) throw new TypeError(`${hostId} is not in canonical episode ${canonicalEpisodeId}.`);
    const member = getAcademyCastMember(hostId);
    return Object.freeze({
        id: `chapter:${lessonPackageId}:${canonicalEpisodeId}`,
        lessonPackageId,
        canonicalEpisodeId,
        title,
        location: { ja: japaneseLocation(episode), en: episode.location.label },
        host: { id: hostId, name: member.firstName },
        introduction,
        conclusion,
        beats: Object.freeze(beats.map(beat => Object.freeze(beat))),
    });
}

function requiredEpisode(id: string): StoryEpisode {
    const episode = loadStoryRuntime().episode(id);
    if (!episode) throw new TypeError(`Unknown canonical story episode ${id}.`);
    return episode;
}

function japaneseLocation(episode: StoryEpisode): string {
    const locations: Readonly<Record<string, string>> = {
        'sound-room': 'アカデミー音響室',
        'practice-kitchen': 'アカデミー練習キッチン',
        'game-club-table': 'ゲーム部のテーブル',
        'lantern-workshop': 'ランタン工房',
        'academy-library': 'アカデミー図書館',
        'library-study-bay': '図書館の学習席',
        'academy-cafe': 'アカデミーカフェ',
        'academy-courtyard': 'アカデミー中庭',
        'media-room': 'アカデミーメディア室',
        'atlas-control-desk': 'アトラスの管理デスク',
        'memory-gallery': '記憶のギャラリー',
        'glasshouse-word-walk': '温室のことば散歩道',
        'mnemonic-gallery': '語呂合わせのギャラリー',
        'atlas-simulation-room': 'アトラスのシミュレーション室',
    };
    const label = locations[episode.location.id];
    if (!label) throw new TypeError(`Missing Japanese location for ${episode.location.id}.`);
    return label;
}

function soundBeat(): LessonActivityBeat {
    const activity: SoundCheckModel = {
        id: 'activity:l1-l08-welcome-frequency',
        kind: 'academy-sound-check',
        responseKind: 'listening-and-pronunciation',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: ['concept:long-vowel-obāsan', 'concept:small-tsu-gakkou'],
        prompt: {
            ja: '音声を聞き、声に出しながら一拍ずつたたいてください。',
            en: 'Listen, repeat aloud, and tap once for each mora.',
        },
        payload: {
            rounds: [
                { id: 'long-vowel', task: 'mora-tap', cue: { ja: '長い母音を聞き分けます。', en: 'Keep the long vowel audible.' }, spokenText: 'おばあさん', expectedMora: 5, errorTag: 'long-vowel-mora' },
                { id: 'small-tsu', task: 'mora-tap', cue: { ja: '小さい「っ」の一拍を残します。', en: 'Keep one beat for the small っ.' }, spokenText: 'がっこう', expectedMora: 4, errorTag: 'small-tsu-mora' },
            ],
            passScore: 1,
            feedback: feedback(
                { ja: '長い音と小さい「っ」が、どちらも拍として聞こえました。', en: 'Both the long vowel and small っ have their own audible beat.' },
                { ja: 'どちらかの拍が短くなったか、増えています。', en: 'One rhythm lost or added a mora.' },
                { ja: '音声をもう一度再生し、指で拍を数えてください。', en: 'Replay the audio and count the beats on your fingers.' },
                { ja: 'が・っ・こ・うは四拍です。', en: 'が・っ・こ・う has four mora.' },
            ),
            reviewTargets: [
                review('review:l1-l08:obaasan', 'concept:long-vowel-obāsan', 'おばあさん', ['grandmother']),
                review('review:l1-l08:gakkou', 'concept:small-tsu-gakkou', 'がっこう', ['school']),
            ],
        },
    };
    return beat('welcome-frequency', {
        ja: 'ミカは「大きく言わなくていいです。拍を同じ長さで置きましょう」と、ランタンの輪を指します。',
        en: 'Mika points to the lantern rings: “It does not need to be loud. Give each beat its space.”',
    }, activity);
}

function kanjiOneBeat(trace: NonNullable<Awaited<ReturnType<KanjiWritingService['lookup']>>>): LessonActivityBeat {
    const activity = createKanjiWritingActivity(trace, {
        id: 'activity:l1-l08-kanji-one-clock',
        conceptId: 'concept:l1-l08:kanji-one',
        prompt: { ja: '時刻カードの「一」を書き、読み方を入力してください。', en: 'Write the 一 on the time card, then enter its reading.' },
        reading: 'いち',
        meaning: { ja: 'ひとつ', en: 'one' },
        strokeInstruction: { ja: '左から右へ、一画で書いてください。', en: 'Write one steady stroke from left to right.' },
        readingPrompt: { ja: '時刻カードの「一」はどう読みますか。', en: 'How do you read 一 on this card?' },
        writingFeedback: {
            pass: { ja: '左から右へ、きれいな一画です。', en: 'One steady stroke, left to right.' },
            lapse: { ja: '線の数・形・方向を確認しましょう。', en: 'Check the line count, shape, and direction.' },
            repair: { ja: '消してから、左から右へ長い線を一本書いてください。', en: 'Clear the card and draw one long line from left to right.' },
            example: { ja: '見本の線を指でなぞってから、もう一度書きます。', en: 'Trace the guide with one finger, then write it again.' },
        },
        readingFeedback: {
            pass: { ja: 'はい。ここでは「いち」です。', en: 'Yes. It is いち here.' },
            lapse: { ja: 'このカードの読み方とはまだ合っていません。', en: 'That does not match this card’s reading yet.' },
            repair: { ja: '「い」で始まる二拍を声に出してください。', en: 'Say the two-mora reading that begins with い.' },
            example: { ja: '一時は「いちじ」から始まります。', en: '一時 begins with いち.' },
        },
        review: { id: 'review:l1-l08:kanji-one', expression: '一', reading: 'いち', meanings: ['one'] },
    });
    return beat('clock-kanji', {
        ja: '音の輪が落ち着くと、最初の時刻カードだけが白いままです。ミカが鉛筆を渡します。',
        en: 'When the sound rings settle, only the first time card remains blank. Mika passes over a pencil.',
    }, activity, 'kanji-reading-recalled');
}

function vegetableBagBeat(): LessonActivityBeat {
    const items = [
        ...Array.from({ length: 4 }, (_, index) => ({ id: `carrot-${index + 1}`, label: 'にんじん', correctZoneId: index < 3 ? 'bag' : null })),
        ...Array.from({ length: 3 }, (_, index) => ({ id: `onion-${index + 1}`, label: 'たまねぎ', correctZoneId: index < 2 ? 'bag' : null })),
    ];
    const activity: DragSortModel = {
        id: 'activity:l1-l18-vegetable-bag',
        kind: 'academy-drag-sort',
        responseKind: 'drag-or-keyboard-sort',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: ['concept:counters-vegetables'],
        prompt: { ja: 'にんじんを三本、たまねぎを二つ、袋に入れてください。', en: 'Put three carrots and two onions into the bag.' },
        payload: {
            sourceLabel: { ja: '野菜の台', en: 'Vegetable tray' },
            items,
            zones: [{ id: 'bag', label: { ja: '買い物袋', en: 'Shopping bag' }, appearance: 'bag' }],
            passScore: 1,
            errorTag: 'vegetable-counter-quantity',
            feedback: feedback(
                { ja: 'にんじん三本と、たまねぎ二つが入りました。', en: 'The bag has three carrots and two onions.' },
                { ja: '袋の数がメモの助数詞と合っていません。', en: 'The bag does not match the quantities on the counter note.' },
                { ja: 'にんじんは「本」、たまねぎは「つ」で一つずつ数えてください。', en: 'Count carrots with 本 and onions with つ, one item at a time.' },
                { ja: '一本、二本、三本／一つ、二つ', en: '一本, 二本, 三本 / 一つ, 二つ' },
            ),
            reviewTargets: [review('review:l1-l18:vegetables', 'concept:counters-vegetables', 'にんじん三本・たまねぎ二つ', ['three carrots and two onions'])],
        },
    };
    return beat('pack-vegetables', {
        ja: '元の冷蔵庫メモを終えたあと、シンは助数詞をもう一度使う買い物袋を置きます。にんじんは本、たまねぎはつで数え、余分な野菜は台に残します。',
        en: 'After the source fridge notes, Shin sets out a shopping bag for one more counter practice. Count carrots with 本 and onions with つ, leaving extras on the tray.',
    }, activity);
}

function counterMatchBeat(): LessonActivityBeat {
    const activity: DragSortModel = {
        id: 'activity:l1-l18-counter-match',
        kind: 'academy-drag-sort',
        responseKind: 'drag-or-keyboard-sort',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: ['concept:counters-match'],
        prompt: { ja: 'それぞれのことばを、合う助数詞のカードへ移してください。', en: 'Move each word to its matching counter card.' },
        payload: {
            sourceLabel: { ja: 'ことば', en: 'Words' },
            items: [
                { id: 'carrot', label: 'にんじん', correctZoneId: 'hon' },
                { id: 'onion', label: 'たまねぎ', correctZoneId: 'tsu' },
                { id: 'plate', label: 'さら', correctZoneId: 'mai' },
                { id: 'people', label: '人', correctZoneId: 'nin' },
            ],
            zones: [
                { id: 'hon', label: { ja: '本', en: '本 · long objects' } },
                { id: 'tsu', label: { ja: 'つ', en: 'つ · general things' } },
                { id: 'mai', label: { ja: '枚', en: '枚 · flat things' } },
                { id: 'nin', label: { ja: '人', en: '人 · people' } },
            ],
            passScore: 1,
            errorTag: 'counter-noun-match',
            feedback: feedback(
                { ja: '四つのことばが、それぞれの助数詞と合いました。', en: 'All four words match their counters.' },
                { ja: 'ものの形や種類と助数詞が合わない組があります。', en: 'At least one noun does not match its counter class.' },
                { ja: '長いもの・普通のもの・平たいもの・人に分けてください。', en: 'Sort by long object, general thing, flat thing, and person.' },
                { ja: 'さら一枚、人が一人', en: 'さら一枚; 人が一人' },
            ),
            reviewTargets: [review('review:l1-l18:counter-match', 'concept:counters-match', '本・つ・枚・人', ['common Japanese counters'])],
        },
    };
    return beat('match-counters', {
        ja: '冷蔵庫の答えを報告したあと、シンは助数詞だけのカードを並べます。野菜、皿、人を、使う助数詞ごとに分けます。',
        en: 'After reporting the fridge answers, Shin lays out counter-only cards. Sort vegetables, a plate, and people by the counter each uses.',
    }, activity);
}

function weatherDescriptionBeat(): LessonActivityBeat {
    const activity: TypedResponseModel = {
        id: 'activity:l2-l22-weather-lantern',
        kind: 'academy-typed-response',
        responseKind: 'written-description',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: ['concept:l2-l22:forecast-advice'],
        prompt: {
            ja: '暗い空から起こりそうなことを一文、地図を守る助言を一文書いてください。',
            en: 'Write one likely outcome from the dark sky and one piece of advice that protects the map.',
        },
        payload: {
            inputLabel: { ja: '予報と助言', en: 'Forecast and advice' },
            multiline: true,
            requiredGroups: [
                ['雨が降るでしょう', '雨がふるでしょう', '雨でしょう'],
                ['かさを持っていったほうがいい', '傘を持っていったほうがいい'],
            ],
            errorTag: 'forecast-advice-form',
            feedback: feedback(
                { ja: '予報の確率と、地図を守る助言が自然につながりました。', en: 'The likely forecast and practical advice connect naturally.' },
                { ja: '予報の「でしょう」か、助言の「たほうがいい」が足りません。', en: 'The forecast needs でしょう or the advice needs たほうがいい.' },
                { ja: '空の証拠で予報し、そのあと「かさ」を使う助言を書いてください。', en: 'Use the sky as forecast evidence, then advise taking an umbrella.' },
                { ja: '雨が降るでしょう。暖かい服を着たほうがいいです。', en: '雨が降るでしょう。暖かい服を着たほうがいいです。' },
            ),
            reviewTargets: [review('review:l2-l22:forecast-advice', 'concept:l2-l22:forecast-advice', '雨が降るでしょう。かさを持っていったほうがいいです。', ['It will probably rain. You should take an umbrella.'])],
        },
    };
    return beat('forecast-cloud', {
        ja: 'クリスチャンは暗い窓と紙の地図を見比べます。「予報は約束ではありません。でも、準備の理由になります。」',
        en: 'Christian compares the dark window with the paper map. “A forecast is not a promise, but it can give us a reason to prepare.”',
    }, activity);
}

function cloudSequenceBeat(): LessonActivityBeat {
    const activity: SequenceModel = {
        id: 'activity:l2-l22-cloud-sequence',
        kind: 'academy-sequence',
        responseKind: 'ordered-items',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: ['concept:l2-l22:instruction-sequence'],
        prompt: { ja: '雲のランタンを作る順番に、指示カードを並べてください。', en: 'Order the instruction cards for building the cloud lantern.' },
        payload: {
            items: [
                { id: 'hang', label: '窓にかけます' },
                { id: 'fold', label: '紙を半分に折って' },
                { id: 'tie', label: 'ひもを結んで' },
                { id: 'frame', label: '骨をつけて' },
            ],
            correctOrder: ['fold', 'frame', 'tie', 'hang'],
            errorTag: 'cloud-instruction-order',
            feedback: feedback(
                { ja: '折る、骨をつける、結ぶ、かけるの順で雲が開きました。', en: 'Fold, frame, tie, and hang: the cloud opens in a workable order.' },
                { ja: '作業の前後が入れ替わり、雲を安全にかけられません。', en: 'At least one action happens before its prerequisite.' },
                { ja: '紙の形を作ってから、骨とひもをつけ、最後に窓へかけます。', en: 'Shape the paper first, add frame and string, then hang it last.' },
                { ja: '紙を折って、骨をつけて、ひもを結びます。', en: '紙を折って、骨をつけて、ひもを結びます。' },
            ),
            reviewTargets: [review('review:l2-l22:cloud-sequence', 'concept:l2-l22:instruction-sequence', '紙を折って、骨をつけて、ひもを結びます。', ['Fold the paper, attach the frame, and tie the string.'])],
        },
    };
    return beat('order-cloud', {
        ja: '予報はできましたが、風で四枚の指示カードが混ざりました。クリスチャンは「先に完成形を想像してから直しましょう」と言います。',
        en: 'The forecast is ready, but wind has mixed the four instruction cards. Christian asks the group to picture the finished cloud before repairing the sequence.',
    }, activity);
}

function beat(
    id: string,
    narrative: LessonActivityBeat['narrative'],
    activity: ActivityModel,
    completionErrorTag?: string,
): LessonActivityBeat {
    return { id, narrative, activity, ...(completionErrorTag ? { completionErrorTag } : {}) };
}

function classActivityBeat(
    id: string,
    narrative: LessonActivityBeat['narrative'],
    packageId: Parameters<typeof createClassActivityModel>[0],
): LessonActivityBeat {
    return beat(id, narrative, createClassActivityModel(packageId));
}

function feedback(
    pass: { readonly en: string; readonly ja: string },
    lapse: { readonly en: string; readonly ja: string },
    repair: { readonly en: string; readonly ja: string },
    example: { readonly en: string; readonly ja: string },
) {
    return {
        pass: { explanation: pass },
        lapse: { explanation: lapse, repairPrompt: repair, nearbyExample: example },
    } as const;
}

function review(id: string, conceptId: string, expression: string, meanings: readonly string[]) {
    return { id, conceptId, expression, meanings } as const;
}
