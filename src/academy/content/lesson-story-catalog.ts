import type { AcademyCastMemberId } from '../domain/cast-registry';
import type { WorldPlaceId } from '../domain/world-locations';

export type LessonStoryCallbackState = 'seed' | 'echo' | 'transform' | 'payoff';

export type LessonStoryPackageId =
    | 'lesson:foundation-00'
    | 'l1-l01' | 'l1-l02' | 'l1-l03' | 'l1-l04' | 'l1-l05'
    | 'l1-l06' | 'l1-l07' | 'l1-l08' | 'l1-l09' | 'l1-l10'
    | 'l1-l11' | 'l1-l12' | 'l1-l13' | 'l1-l14' | 'l1-l15'
    | 'l1-l16' | 'l1-l17' | 'l1-l18' | 'l1-l19' | 'l1-l20' | 'l1-l21' | 'l1-l22' | 'l1-l23' | 'l1-l24' | 'l1-l25' | 'l1-l26' | 'l2-l02' | 'l2-l03' | 'l2-l04' | 'l2-l05' | 'l2-l06' | 'l2-l07' | 'l2-l08' | 'l2-l09' | 'l2-l10' | 'l2-l11' | 'l2-l12' | 'l2-l13' | 'l2-l14' | 'l2-l15' | 'l2-l16';

type LessonStoryCallbackId =
    | 'callback:blank-atlas-route'
    | 'callback:shared-plan'
    | 'callback:place-description'
    | 'callback:reasoned-invitation'
    | 'callback:l1plus-open-list'
    | 'callback:l1plus-frequency-lens'
    | 'callback:l1plus-katakana-start'
    | 'callback:l1plus-katakana-two-row'
    | 'callback:l1plus-katakana-final-shelf'
    | 'callback:l2-experience-postcards'
    | 'callback:l2-holiday-itinerary'
    | 'callback:l2-plain-style-matrix'
    | 'callback:l2-b24-listening-hinge'
    | 'callback:l2-plain-form-transfer'
    | 'callback:l2-toki-threshold'
    | 'callback:l2-occasion-route'
    | 'callback:l3-2-routine-reasons'
    | 'callback:l3-2-room-state'
    | 'callback:l3-2-completion-regret'
    | 'callback:l3-2-prepared-state';

export interface LessonStoryCatalogEntry {
    readonly packageId: LessonStoryPackageId;
    readonly classWeekId: string;
    readonly hostId: AcademyCastMemberId;
    readonly supportingIds: readonly AcademyCastMemberId[];
    /** Named only: these classmates have no approved runtime likenesses. */
    readonly presentation: 'name-only';
    readonly location: Readonly<{ id: string; en: string; ja: string }>;
    /** The small practical reason that carries the learner into this lesson. */
    readonly setup: Readonly<{ en: string; ja: string }>;
    /** A grounded exit line, not a new scene or a canonical plot outcome. */
    readonly handoff: Readonly<{ en: string; ja: string }>;
    /** Keep the story language at one supported step beyond the prior handoff. */
    readonly nPlusOne: Readonly<{
        carries: string;
        introduces: string;
        /** Present only where an adaptive entry must consume the immediately preceding lesson handoff. */
        prerequisite?: Readonly<{
            packageId: LessonStoryPackageId;
            activityId: string;
            fallbackSetup: Readonly<{ en: string; ja: string }>;
        }>;
    }>;
    readonly threadId: LessonStoryCallbackId;
    readonly callback: Readonly<{
        readonly id: LessonStoryCallbackId;
        readonly state: LessonStoryCallbackState;
        readonly meaningNow: Readonly<{ en: string; ja: string }>;
        readonly fallback: Readonly<{ en: string; ja: string }>;
    }>;
    /** World framing is authored, while completion still returns to the route frame the learner actually used. */
    readonly world?: Readonly<{
        readonly originPlaceId: WorldPlaceId;
        readonly completionReturn: 'originating-route-frame';
    }>;
    /** A compact need/model/transfer exchange around the exact source activity. */
    readonly dialogue?: readonly Readonly<{
        readonly speakerId: AcademyCastMemberId;
        readonly purpose: 'need' | 'model' | 'transfer';
        readonly line: Readonly<{ en: string; ja: string }>;
    }>[];
    /** Encounter evidence unlocks the named cast and gives Journal replay a valid lesson package target. */
    readonly journal?: Readonly<{
        readonly encounterId: `class-week:${string}`;
        readonly sceneId: `scene:class-week:${string}`;
        readonly replayLessonId: LessonStoryPackageId;
        readonly stateWrite: 'met-characters-and-journal';
    }>;
    readonly plotBoundary: Readonly<{
        readonly canonicalWrites: false;
        readonly completesThread: boolean;
        readonly replay: 'separate-optional';
    }>;
}

/**
 * A deliberately small, name-only continuity layer through Lesson 41. It bridges existing source-backed lesson scenes without
 * adding a second plot track or changing the canonical/replay catalogs.
 */
export const LESSON_STORY_CATALOG: readonly LessonStoryCatalogEntry[] = Object.freeze([
    entry({
        packageId: 'lesson:foundation-00', classWeekId: 'orientation', hostId: 'xingyu', supportingIds: ['mika', 'sophie', 'ruparna', 'aakash', 'sam'],
        location: place('academy-orientation-route', 'Sound room, library, and classroom entrance', '音の部屋、図書館、教室の入口'),
        setup: line('A short orientation moves from sound to text to speaking. Aakash ends with one practical invitation to meet the person beside you.', '短いオリエンテーションは、音、文字、話すことの順に進みます。最後にアーカーシュさんが、となりの人に会うための実用的な誘いを一つ出します。'),
        handoff: line('The supported greeting cue becomes one name-card exchange at the library table.', '支えのあるあいさつの合図が、図書館のテーブルでの名札のやり取り一つにつながります。'),
        nPlusOne: step('recognise a supported classroom cue', 'answer one bounded greeting cue'),
        callback: callback('callback:blank-atlas-route', 'seed', 'A blank route begins with one person being heard, rather than with a completed map.', '白い道は、完成した地図ではなく、一人の声を聞くことから始まります。', 'The next task needs one answer, not a finished backstory.', '次の課題に必要なのは、一つの答えであって、完成した経歴ではありません。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l01', classWeekId: 'l1-l01', hostId: 'stasi', supportingIds: ['mika'],
        location: place('library-atlas-table', 'Library Atlas table', '図書館の地図帳テーブル'),
        setup: line('The orientation invitation arrives as two response cards. Stasi keeps the exchange to one heard prompt at a time, and Mika files a card only after its exact answer is checked.', 'オリエンテーションの誘いは二枚の返事の札になります。スタシさんは一度に一つの聞こえた問いだけを扱い、ミカさんは正確な答えを確かめてから札をしまいます。'),
        handoff: line('A returned greeting and one answered name prompt give the next profile card a reliable person to stay attached to.', 'あいさつを返し、名前の問いに一つ答えると、次のプロフィール札を確かな人につなげたままにできます。'),
        nPlusOne: step('answer one bounded greeting cue', 'answer one name prompt', {
            packageId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-greet-rie',
            fallbackSetup: line('The first response card is still open. Stasi keeps the prompt visible, and Mika waits while the greeting cue is checked before any name card is filed.', '最初の返事の札はまだ開いたままです。スタシさんは問いを見えるままにし、ミカさんはあいさつの合図を確かめてから名札をしまいます。'),
        }),
        callback: callback('callback:blank-atlas-route', 'echo', 'A name card earns its place only after its answer is heard.', '名札は、答えを聞いてから初めて場所を持ちます。', 'A name can be checked again before the next card is added.', '次の札を足す前に、名前をもう一度確かめられます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l02', classWeekId: 'l1-l02', hostId: 'jenny', supportingIds: ['mika'],
        location: place('library-profile-table', 'Library profile table', '図書館のプロフィールテーブル'),
        setup: line('Jenny uses the already-filed name cards as headings for four profile cards, while Mika keeps each detail attached to the card it came from.', 'ジェニーさんは、しまった名札を四枚のプロフィール札の見出しにします。ミカさんは、それぞれの情報を元の札につけたままにします。'),
        handoff: line('One identified profile leaves a reason to ask a specific question instead of guessing from the card.', '一人のプロフィールが分かると、札から推測せず、具体的な質問をする理由が残ります。'),
        nPlusOne: step('answer one name prompt', 'identify one profile detail'),
        callback: callback('callback:blank-atlas-route', 'echo', 'A profile detail stays with the named person instead of becoming a loose fact.', 'プロフィールの情報は、ばらばらの事実ではなく、名前のある人につながったままです。', 'The next question can check one detail directly.', '次の質問では、一つの情報を直接確かめられます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l03', classWeekId: 'l1-l03', hostId: 'xingyu', supportingIds: ['peter'],
        location: place('library-question-table', 'Library question table', '図書館の質問テーブル'),
        setup: line('Xingyu keeps one profile card open and Peter separates the six question-and-answer pairs before anyone fills in a missing fact.', 'シンユさんはプロフィール札を一枚だけ開いたままにし、ピーターさんは足りない情報を埋める前に、六つの質問と答えを分けます。'),
        handoff: line('A matched answer makes the next Atlas marker a matter of viewpoint, not a guessed fact.', '答えが対応すると、次の地図帳の印は推測ではなく、視点の問題になります。'),
        nPlusOne: step('identify a profile detail', 'match one question to its answer'),
        callback: callback('callback:blank-atlas-route', 'echo', 'A matched answer lets the route use what was said without inventing what was not.', '対応した答えがあると、言われなかったことを作らずに、道に使えます。', 'The next marker can be placed from the answer already given.', '次の印は、すでに出た答えから置けます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l04', classWeekId: 'l1-l04', hostId: 'peter', supportingIds: ['jenny'],
        location: place('library-atlas-markers', 'Library Atlas markers', '図書館の地図帳の印'),
        setup: line('Peter turns the answered profile into three visible Atlas positions; Jenny names whose side each marker is on before it moves.', 'ピーターさんは、答えられたプロフィールを地図帳の三つの見える位置にします。ジェニーさんは、印を動かす前に、だれの近くかを言います。'),
        handoff: line('Once a viewpoint is clear, an object can be returned to its owner without moving the whole map again.', '視点が分かると、地図全体を動かし直さなくても、物を持ち主に返せます。'),
        nPlusOne: step('match a question and answer', 'choose an object by speaker distance'),
        callback: callback('callback:blank-atlas-route', 'transform', 'The route stops treating a label as neutral: where a thing is depends on who is speaking.', '道は、名札を中立なものとして扱うのをやめます。物の場所は、だれが話しているかによって決まります。', 'The next object can be checked from the speaker’s position first.', '次の物は、まず話す人の位置から確かめられます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l05', classWeekId: 'l1-l05', hostId: 'sophie', supportingIds: ['jenny'],
        location: place('library-lost-property-page', 'Library lost-property page', '図書館の忘れ物ページ'),
        setup: line('Sophie keeps the distance markers where they are and asks Jenny to pair each object with an owner only after the viewpoint is settled.', 'ソフィーさんは距離の印をそのままにし、ジェニーさんに、視点が決まってから物と持ち主を組みにしてもらいます。'),
        handoff: line('The returned objects need one final location check before the Atlas page can be used to guide someone else.', '返された物は、地図帳のページでだれかを案内する前に、最後に一度だけ場所を確かめます。'),
        nPlusOne: step('choose an object by distance', 'name an owner-object relationship'),
        callback: callback('callback:blank-atlas-route', 'echo', 'The Atlas keeps the speaker’s viewpoint while an object is returned to its owner.', '地図帳は、物を持ち主に返すときも、話す人の視点を保ちます。', 'The final place check can use both viewpoint and owner.', '最後の場所の確認では、視点と持ち主の両方を使えます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l06', classWeekId: 'l1-l06', hostId: 'aakash', supportingIds: ['jenny'],
        location: place('library-place-and-owner-page', 'Library place-and-owner page', '図書館の場所と持ち主のページ'),
        setup: line('Aakash uses the returned objects as directions, while Jenny checks the place before the owner phrase is added.', 'アーカーシュさんは返された物を道案内に使い、ジェニーさんは持ち主の表現を足す前に場所を確かめます。'),
        handoff: line('The completed page can leave the library as a short counter request instead of another map exercise.', '完成したページは、もう一度の地図の練習ではなく、短い売り場での頼み方として図書館を出られます。'),
        nPlusOne: step('name an owner-object relationship', 'ask where something is and identify its owner'),
        callback: callback('callback:blank-atlas-route', 'payoff', 'The first route is now useful: it helps someone locate a real object with no invented history attached.', '最初の道は役に立つものになります。作り話の経歴を足さずに、だれかが本当の物を見つけられます。', 'A clear place-and-owner answer is enough to continue.', '分かりやすい場所と持ち主の答えがあれば、先へ進めます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l07', classWeekId: 'l1-l07', hostId: 'aakash', supportingIds: ['jenny'],
        location: place('academy-shop-counter', 'Academy shop counter', 'アカデミーの売り場'),
        setup: line('At the counter, Aakash turns the finished location answer into one polite request; Jenny keeps the object card visible so the request has a concrete referent.', '売り場で、アーカーシュさんは完成した場所の答えを一つの丁寧な頼み方にします。ジェニーさんは、頼み方に具体的な対象があるよう、物の札を見えるままにします。'),
        handoff: line('The counter slip carries one agreed item to the sound-room timetable, where the question changes from what is wanted to when it fits.', '売り場の控えは、決まった一つの物を音の部屋の時間表へ運びます。質問は、何がほしいかから、いつ合うかへ変わります。'),
        nPlusOne: step('identify a place and owner', 'make one counter request'),
        callback: callback('callback:shared-plan', 'seed', 'A shared plan begins with one specific request, not an assumed group decision.', '共有の計画は、決めつけた集団の判断ではなく、一つの具体的な頼み方から始まります。', 'The item can be timed before anyone promises to join.', 'だれかが参加を約束する前に、その物の時間を決められます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l08', classWeekId: 'l1-l08', hostId: 'christian', supportingIds: ['peter'],
        location: place('sound-room-timetable', 'Sound-room timetable', '音の部屋の時間表'),
        setup: line('Christian receives the counter slip at the timetable, and Peter isolates the time card before the group tries to arrange anything around it.', 'クリスチャンさんは売り場の控えを時間表で受け取り、ピーターさんは、みんなが予定を組む前に時刻の札だけを分けます。'),
        handoff: line('A known time gives the next table a limit: choose a day before turning the request into a full week.', '時刻が分かると、次のテーブルに限りができます。頼み方を一週間の予定にする前に、曜日を選びます。'),
        nPlusOne: step('make one concrete request', 'state one time'),
        callback: callback('callback:shared-plan', 'echo', 'The request now has a time, but nobody has been enrolled by learning it.', '頼み方には時刻がつきますが、時刻を知っただけでだれかが参加したことにはなりません。', 'A day can be compared without committing a person.', '人を約束させずに、曜日を比べられます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l09', classWeekId: 'l1-l09', hostId: 'angel', supportingIds: ['sam'],
        location: place('game-club-weekly-board', 'Game-club weekly board', 'ゲーム部の週間ボード'),
        setup: line('Angel brings the time card to a weekly board and Sam asks for one day at a time, leaving the rest of the board available to change.', 'エンジェルさんは時刻の札を週間ボードに持っていき、サムさんは一度に一つの曜日を聞きます。残りのボードは変えられるままにします。'),
        handoff: line('A chosen day can be tested against an ordinary routine before it is offered as a plan.', '選んだ曜日は、計画として出す前に、ふだんの一日と照らして確かめられます。'),
        nPlusOne: step('state one time', 'choose one day in a weekly plan'),
        callback: callback('callback:shared-plan', 'transform', 'The board changes from a list of possibilities into a revisable proposal with one time and one day.', 'ボードは可能性の一覧から、時刻と曜日が一つずつある、直せる提案に変わります。', 'The proposal can be checked against a normal day before it is offered.', '提案は、出す前にふだんの一日と照らして確かめられます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l10', classWeekId: 'l1-l10', hostId: 'sam', supportingIds: ['christian'],
        location: place('academy-cafe-routine-table', 'Academy cafe routine table', 'アカデミーカフェの一日テーブル'),
        setup: line('Sam checks the proposed day against an ordinary routine, while Christian keeps the routine cards in time order rather than treating availability as a promise.', 'サムさんは提案した曜日をふだんの一日と照らし、クリスチャンさんは空き時間を約束として扱わず、行動札を時刻順に置きます。'),
        handoff: line('The practical plan pauses here; the next scene can describe a place without pretending the group has already met there.', '実用的な計画はここでいったん止まります。次の場面は、もう集まったふりをせず、場所を説明できます。'),
        nPlusOne: step('choose a day and time', 'describe one daily routine'),
        callback: callback('callback:shared-plan', 'payoff', 'A useful plan is a clear proposal that survives contact with real routines and still leaves room to decline.', '役に立つ計画は、ふだんの一日に照らしても残り、断る余地もある分かりやすい提案です。', 'The next task may describe a place without treating attendance as settled.', '次の課題は、参加が決まったことにせずに、場所を説明できます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l11', classWeekId: 'l1plus-l01', hostId: 'jenny', supportingIds: ['aakash'],
        location: place('screening-room-curtain', 'Screening-room curtain', '上映室のカーテン'),
        setup: line('Jenny uses the pause after the routine board to describe the room beyond a curtain, and Aakash keeps the description to visible qualities rather than a guessed name.', 'ジェニーさんは一日のボードのあとの間を使って、カーテンの向こうの部屋を説明します。アーカーシュさんは、推測した名前ではなく、見える性質だけに説明をとどめます。'),
        handoff: line('A place described without a claim can make room for a preference question at the cafe table.', '断定せずに説明された場所は、カフェのテーブルで好みを聞く余地になります。'),
        nPlusOne: step('describe an ordinary routine', 'describe one kind of place'),
        callback: callback('callback:place-description', 'seed', 'A useful place description names what is visible and leaves its unknown name unknown.', '役に立つ場所の説明は、見えるものを言い、分からない名前は分からないままにします。', 'A preference can be asked without turning the description into a claim.', '説明を断定にせずに、好みを聞けます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l12', classWeekId: 'l1plus-l02', hostId: 'felix', supportingIds: ['francis'],
        location: place('academy-cafe-menu-table', 'Academy cafe menu table', 'アカデミーカフェのメニューテーブル'),
        setup: line('Felix brings the unnamed-place clues to a menu table, and Francis asks what someone likes before treating any dish as the obvious choice.', 'フェリックスさんは名前のない場所の手がかりをメニューテーブルに持っていきます。フランシスさんは、どの料理が当然かと決める前に、何が好きかを聞きます。'),
        handoff: line('A stated preference gives the game-club table a reason to ask what each person can do, not what they should choose.', '言われた好みがあると、ゲーム部のテーブルでは、何を選ぶべきかではなく、何ができるかを聞く理由になります。'),
        nPlusOne: step('describe one kind of place', 'state one preference'),
        callback: callback('callback:place-description', 'echo', 'A preference narrows a choice without declaring one option right for everyone.', '好みは選択をしぼれますが、全員にとって一つの選択が正しいとは言いません。', 'The next table can ask about skill rather than assign a choice.', '次のテーブルでは、選択を決めずに技能を聞けます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l13', classWeekId: 'l1plus-l03', hostId: 'stasi', supportingIds: ['mika'],
        location: place('game-club-skill-table', 'Game-club skill table', 'ゲーム部の技能テーブル'),
        setup: line('Stasi carries the preference cards to a game-club table, and Mika asks what each person understands or is good at before assigning a role.', 'スタシさんは好みの札をゲーム部のテーブルに持っていきます。ミカさんは役を決める前に、それぞれが何を分かるか、何が得意かを聞きます。'),
        handoff: line('A named skill can support one reason at the library study bay without turning it into an obligation.', '言われた技能があると、義務にせずに、図書館の学習席で一つの理由を支えられます。'),
        nPlusOne: step('state one preference', 'say what someone understands or can do'),
        callback: callback('callback:place-description', 'transform', 'The description becomes practical when a preference is matched with a skill, not when a role is imposed.', '説明は、役を押しつけずに、好みと技能を合わせると実用的になります。', 'A reason can now explain one choice without asking for agreement.', '次は同意を求めずに、一つの選択の理由を説明できます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l14', classWeekId: 'l1plus-l04', hostId: 'francis', supportingIds: ['peter'],
        location: place('library-reason-bay', 'Library study bay', '図書館の学習席'),
        setup: line('Francis turns a skill card into one reason, and Peter checks that the reason explains a choice without demanding agreement from anyone else.', 'フランシスさんは技能の札を一つの理由にします。ピーターさんは、その理由がだれかの同意を求めずに選択を説明しているか確かめます。'),
        handoff: line('A reason can be offered at the cafe board as context for an invitation, never as pressure to accept it.', '理由は、カフェのボードで誘いの背景として出せますが、受けるよう迫るものにはなりません。'),
        nPlusOne: step('say what someone can do', 'give one reason for a choice'),
        callback: callback('callback:place-description', 'payoff', 'A clear description has become a reasoned choice while still leaving other readings possible.', '分かりやすい説明は、ほかの見方を残したまま、理由のある選択になります。', 'The next invitation can name its reason without turning it into pressure.', '次の誘いでは、圧力にせずに理由を言えます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l15', classWeekId: 'l1plus-l05', hostId: 'sam', supportingIds: ['rose'],
        location: place('academy-cafe-invitation-board', 'Academy cafe invitation board', 'アカデミーカフェの誘いのボード'),
        setup: line('Sam writes one small cafe invitation with its place and reason; Rose leaves the reply field blank so a yes, no, or later answer remains equally ordinary.', 'サムさんは場所と理由をそえた小さなカフェの誘いを一つ書きます。ローズさんは返事の欄を空け、はい、いいえ、あとで、のどれもふつうに残します。'),
        handoff: line('The board does not book the meeting; it simply gives the courtyard route cards a concrete place to check.', 'ボードは集まりを予約しません。中庭のルート札で確かめるための、具体的な場所を一つ出すだけです。'),
        nPlusOne: step('give one reason for a choice', 'make an invitation with an easy decline'),
        callback: callback('callback:reasoned-invitation', 'seed', 'An invitation states its place and reason, then leaves every reply open.', '誘いは場所と理由を言い、それからどの返事も開いたままにします。', 'The route may be checked without treating it as attendance.', '道順は、参加すると決めたことにせずに確かめられます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l16', classWeekId: 'l1plus-l06', hostId: 'aakash', supportingIds: ['jenny'],
        location: place('courtyard-route-cards', 'Courtyard route cards', '中庭のルート札'),
        setup: line('Aakash treats the invitation location as a route question, and Jenny separates people from things before saying what is there.', 'アーカーシュさんは誘いの場所を道順の質問として扱い、ジェニーさんは、そこに何があるかを言う前に、人と物を分けます。'),
        handoff: line('The established route can be rehearsed with museum guide cards without claiming that anyone has agreed to go.', '決まった道順は、だれかが行くと決めたことにせず、美術館の案内札で練習できます。'),
        nPlusOne: step('name a place in an invitation', 'say what person or thing is at a place'),
        callback: callback('callback:reasoned-invitation', 'payoff', 'The route is useful preparation, not a substitute for anyone’s answer.', '道順は役に立つ準備ですが、だれかの返事の代わりにはなりません。', 'A fictional rehearsal can use the route without booking a real visit.', '架空の練習では、本当の訪問を予約せずに、その道順を使えます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l17', classWeekId: 'l1plus-l07', hostId: 'stasi', supportingIds: ['aakash'],
        location: place('classroom-museum-table', 'Classroom museum table', '教室の美術館テーブル'),
        setup: line('Stasi hosts a tabletop rehearsal for a fictional museum display; Aakash keeps the route map practical and leaves one label open.', 'スタシさんが、教室で架空の美術館の小さな展示を準備します。アーカッシュさんは地図を見やすくし、一つのラベルを空けておきます。'),
        handoff: line('The open label becomes a shared count at the practice kitchen, rather than a claim that the display is finished.', '空いたラベルは、展示が完成したという主張ではなく、練習キッチンでみんなで数えるものになります。'),
        nPlusOne: step('say what is at a place', 'locate one thing relative to another'),
        callback: callback('callback:l1plus-open-list', 'seed', 'Stasi leaves one label open rather than pretend the display is finished, making careful help welcome.', 'スタシさんは、展示が完成したふりをせず、一つのラベルを空けておきます。手伝いがしやすくなります。', 'A place can be described clearly even while its list is still being checked.', 'リストを確認している途中でも、場所を分かりやすく説明できます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l18', classWeekId: 'l1plus-l08', hostId: 'shin', supportingIds: ['peter'],
        location: place('practice-kitchen-shared-table', 'Practice-kitchen shared table', '練習キッチンの共有テーブル'),
        setup: line('Shin turns the open display list into a shared-table count, while Peter asks what is actually needed before anyone assumes.', 'シンさんが、空いている展示リストを共有テーブルの数のリストにします。ピーターさんは、決めつける前に何が必要か聞きます。'),
        handoff: line('The checked count carries one clear menu order back to the cafe table; no one needs to disclose a preference beyond the practice task.', '確認した数は、一つの分かりやすいメニューの注文としてカフェのテーブルへ戻ります。練習の課題を超えて、だれかが好みを明かす必要はありません。'),
        nPlusOne: step('locate one thing relative to another', 'count what is present and needed'),
        callback: callback('callback:l1plus-open-list', 'echo', 'The unfinished label becomes shared information, not someone else’s mistake.', '完成していないラベルは、誰かの間違いではなく、みんなで使う情報になります。', 'Counting what is present and what is needed makes a small shared task manageable.', 'ある物と必要な物を数えると、小さな共同作業が進めやすくなります。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l19', classWeekId: 'l1plus-l09', hostId: 'robert', supportingIds: ['shin'],
        location: place('academy-cafe-menu-table', 'Academy cafe menu table', 'アカデミーカフェのメニューテーブル'),
        setup: line('Robert uses the checked count for one bounded menu practice, while Shin separates frequency from duration so no one promises more than they mean.', 'ロバートさんは確認した数を一つの限られたメニュー練習に使います。シンさんは回数と時間を分けて、無理な約束にならないようにします。'),
        handoff: line('The menu practice closes as a short optional invitation; the next schedule cards begin from what is counted, not from a presumed attendance list.', 'メニューの練習は短く任意の誘いとして終わります。次の予定札は、参加する人の一覧を決めつけず、何を数えるかから始まります。'),
        nPlusOne: step('count what is present and needed', 'state frequency separately from duration'),
        callback: callback('callback:l1plus-open-list', 'payoff', 'A checked list becomes one clear, time-bounded invitation with room to decline.', '確認したリストは、断る余地のある、時間を区切った一つの分かりやすい誘いになります。', 'Frequency and duration make an invitation clear without making participation an obligation.', '回数と時間を言うと、参加を義務にせず、誘いを分かりやすくできます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l20', classWeekId: 'l1plus-l10', hostId: 'jodi', supportingIds: ['peter'],
        location: place('academy-cafe-window-schedule', 'Cafe window schedule cards', 'カフェの窓辺の予定札'),
        setup: line('Jodi carries only the time-bound invitation to the window cards. Peter asks what is being counted before anyone compares a week, month, or year.', 'ジョディさんは時間を区切った誘いだけを窓辺の札に持っていきます。ピーターさんは、一週間、一か月、一年を比べる前に、何を数えているか聞きます。'),
        handoff: line('The first twenty lessons end on a reusable checking habit, not on an off-screen gathering or a new plot promise.', '最初の二十課は、画面の外で集まったことや新しい物語の約束ではなく、繰り返し使える確認の習慣で終わります。'),
        nPlusOne: step('separate frequency from duration', 'compare one count across a period'),
        callback: callback('callback:l1plus-frequency-lens', 'seed', 'A count is useful only when its unit is named before it is compared.', '数は、比べる前に何を数えるかを言って初めて役に立ちます。', 'The lens can be reused without creating a new commitment or plot event.', 'この見方は、新しい約束や物語の出来事を作らずに繰り返し使えます。'),
        completesThread: false,
    }),
    entry({
        packageId: 'l1-l21', classWeekId: 'l1plus-summer-homework', hostId: 'peter', supportingIds: ['angel'],
        location: place('academy-commute-notebook', 'Academy commute notebook', 'アカデミーの通勤ノート'),
        setup: line('Peter reopens Jodi’s question in a practical commute notebook, while Angel keeps the strike day and the usual day in separate rows.', 'ピーターさんはジョディさんの質問を通勤ノートで確かめます。エンジェルさんは、ストの日といつもの日を別々の行に残します。'),
        handoff: line('The notebook closes with a comparison that keeps an unusual journey and an ordinary routine distinct, without turning either into a promise.', 'ノートは、特別な移動とふだんの予定を、どちらも約束にせず別々に残す比べ方で終わります。'),
        nPlusOne: step('separate frequency from duration', 'compare a disrupted journey with the usual journey'),
        callback: callback('callback:l1plus-frequency-lens', 'payoff', 'Once the number’s job is clear, a comparison can preserve both an unusual day and an ordinary routine.', '数字が何を表すか分かると、特別な日といつもの予定をどちらも正しく比べられます。', 'A two-line note keeps a changed journey and the usual journey clear.', '二行のメモにすると、変わった移動といつもの移動が分かりやすくなります。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l22', classWeekId: 'l1plus-katakana-1', hostId: 'stasi', supportingIds: ['mika'],
        location: place('academy-katakana-table', 'Academy katakana table', 'アカデミーのカタカナテーブル'),
        setup: line('Stasi opens Rie’s first katakana charts after Peter closes the commute notebook, and Mika keeps each heard vowel beside its shape instead of rushing to an English spelling.', 'スタシさんは、ピーターさんが通勤ノートを閉じたあとで、りえ先生の最初のカタカナ表を開きます。ミカさんは、英語のつづりを急ぐ代わりに、聞こえた母音を形のそばに置きます。'),
        handoff: line('The five-shape relay ends with a checked vowel row; the next table can add the ka row without pretending the two rows are already the same task.', '五つの形のリレーは、確認した母音の行で終わります。次のテーブルでは、二つの行を同じ課題にせずに、カ行を足せます。'),
        nPlusOne: step('compare a disrupted journey with the usual journey', 'match the five katakana vowel sounds to their shapes'),
        callback: callback('callback:l1plus-katakana-start', 'seed', 'A chart becomes usable when a heard sound can return to one visible shape.', '表は、聞こえた音が一つの見える形に戻ると、使えるものになります。', 'The first row is secure enough to add a new consonant row carefully.', '最初の行が確かになると、新しい子音の行を注意して足せます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l23', classWeekId: 'l1plus-katakana-2', hostId: 'angel', supportingIds: ['sophie'],
        location: place('academy-katakana-columns', 'Academy katakana column table', 'アカデミーのカタカナ列テーブル'),
        setup: line('Angel carries the checked vowel row to a five-column table, while Sophie keeps the ka-row tiles separate from the visible ga-row examples.', 'エンジェルさんは、確認した母音の行を五つの列のテーブルへ運びます。ソフィーさんは、カ行の札を、見本にあるガ行とは別にします。'),
        handoff: line('Each ka-row tile returns to its vowel column, leaving a small checked writing row rather than a claim that the voiced row has already been learned.', 'カ行の札は、それぞれの母音の列に戻ります。ガ行まで学んだという主張ではなく、小さく確認した書く行が残ります。'),
        nPlusOne: step('match the five katakana vowel sounds to their shapes', 'sort the ka row by its vowel columns'),
        callback: callback('callback:l1plus-katakana-start', 'payoff', 'A second row reuses the vowel-column map without making a larger chart feel finished.', '二つ目の行は、表全体が終わったようにせず、母音の列の見方を使います。', 'The learner can carry one checked row into writing practice before adding another contrast.', '次の対比を足す前に、確認した一行を、書く練習へ持っていけます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l24', classWeekId: 'l1plus-katakana-3', hostId: 'mika', supportingIds: ['angel'],
        location: place('academy-katakana-two-row-route', 'Academy two-row katakana route', 'アカデミーの二行カタカナの道'),
        setup: line('Mika opens Sensei’s sa and ta rows as two routes, while Angel keeps the voiced examples on the worksheet and asks only which row and vowel position a heard sound returns to.', 'ミカさんは先生のサ行とタ行を二本の道として開きます。エンジェルさんは濁音の見本をワークシートに残し、聞こえた音がどの行と母音の位置に戻るかだけを聞きます。'),
        handoff: line('The two-row route ends with ten checked positions, not a claim that the visible za and da rows have been learned.', '二行の道は確認した十の位置で終わります。見えているザ行とダ行まで学んだという主張にはしません。'),
        nPlusOne: step('sort one row by vowel columns', 'locate one heard sound by both row and vowel coordinate'),
        callback: callback('callback:l1plus-katakana-two-row', 'seed', 'A vowel column becomes a usable coordinate only after its consonant row is named as well.', '母音の列は、子音の行も言って初めて使える位置になります。', 'Two rows can be checked without treating their visible voiced companions as complete.', '二つの行は、見えている濁音まで終えたことにせずに確認できます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l25', classWeekId: 'l1plus-katakana-4', hostId: 'angel', supportingIds: ['mika'],
        location: place('academy-katakana-switchboard', 'Academy katakana switchboard', 'アカデミーのカタカナスイッチボード'),
        setup: line('Angel opens Sensei’s na and ha rows on a switchboard, while Mika keeps the visible pa and ba examples on the worksheet and asks the learner to set the row and vowel separately for every heard sound.', 'エンジェルさんは先生のナ行とハ行をスイッチボードで開きます。ミカさんは、見えているパ行とバ行の見本をワークシートに残し、聞こえた音ごとに行と母音を別々に合わせるように聞きます。'),
        handoff: line('The switchboard ends with ten checked na/ha settings, without claiming that the visible pa and ba rows have been learned.', 'スイッチボードは確認した十のナ行・ハ行の設定で終わります。見えているパ行とバ行まで学んだという主張にはしません。'),
        nPlusOne: step('locate one heard sound by both row and vowel coordinate', 'set the row and vowel independently for a new pair of katakana rows'),
        callback: callback('callback:l1plus-katakana-two-row', 'payoff', 'Two controls can preserve a careful contrast: row identity first, then its vowel position.', '二つの操作は、注意深い対比を保てます。まず行を決めてから、その母音の位置を選びます。', 'A visible chart can keep later rows as examples while the current pair is checked precisely.', '見える表は、今の二行を正確に確かめながら、後の行を見本のままにできます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l1-l26', classWeekId: 'l1plus-katakana-5', hostId: 'mika', supportingIds: ['angel'],
        location: place('academy-katakana-final-shelf', 'Academy final katakana shelf', 'アカデミーの最後のカタカナ棚'),
        setup: line('Mika lays Sensei’s ma, ya, ra, and wa rows onto shelves of their actual lengths, while Angel keeps the shorter rows short instead of filling the gaps by guesswork.', 'ミカさんは先生のマ行・ヤ行・ラ行・ワ行を、本当の長さの棚に写します。エンジェルさんは、短い行を推測で埋めず、短いままにします。'),
        handoff: line('The final shelf map returns sixteen heard signs to visible positions, leaving a checked chart and no invented cells.', '最後の棚の地図は、聞こえた十六の形を見える位置へ戻します。確認した表だけが残り、作った位置はありません。'),
        nPlusOne: step('set a row and vowel independently', 'locate a heard sign in a source row whose visible positions can vary'),
        callback: callback('callback:l1plus-katakana-final-shelf', 'seed', 'A completed chart stays trustworthy when its gaps are read as part of the chart, not as missing answers to fill.', '完成した表は、空いている所を埋める答えではなく、表の一部として読むと信頼できます。', 'The final rows can be checked by returning each sound only to a visible shelf.', '最後の行は、音を見えている棚だけに戻して確かめられます。'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l02', classWeekId: 'l2plus-l01', hostId: 'alex', supportingIds: ['jodi'],
        location: place('academy-experience-postcard-table', 'Academy experience postcard table', 'アカデミーの経験ポストカードのテーブル'),
        setup: line('Alex opens Sensei’s Chapter 19-1 vocabulary sheet beside three travel cards, and Jodi keeps the picture choices unmarked until B-21 has been heard.', 'アレックスさんは先生のChapter 19-1のことばの表を三枚の旅行の札の横に開きます。ジョディさんは、B-21を聞くまで絵の選択に印をつけません。'),
        handoff: line('Once each audio stop has one earned mark, the cards can be turned into questions about a learner’s own experiences.', '音声の場所ごとに得た印が一つずつつくと、札は学習者自身の経験を聞く質問に変えられます。'),
        nPlusOne: step('match one heard experience to a source picture', 'ask whether someone has had an experience'),
        callback: callback('callback:l2-experience-postcards', 'payoff', 'An experience is heard before it is claimed: the source cards make room for a careful question.', '経験は言い切る前に聞かれます。原本の札は注意深い質問の余地を作ります。', 'The next question can ask about a real experience without supplying its answer.', '次の質問では、答えを決めずに本当の経験を聞けます。'),
        world: world('station'),
        dialogue: dialogue(
            turn('alex', 'need', 'These cards show journeys, but they do not tell us which picture B-21 describes.', 'この札には旅行が見えます。でも、B-21がどの絵を説明するかは、まだ分かりません。'),
            turn('jodi', 'model', 'Let’s listen before we mark one. A picture becomes evidence only after the voice reaches it.', '印をつける前に聞きましょう。声とつながってから、その絵が根拠になります。'),
            turn('alex', 'transfer', 'After that, we can ask about your own experience and leave your answer open.', 'そのあとで、あなた自身の経験を聞けます。答えは決めつけません。'),
        ),
        journal: journal('l2-l02', 'l2plus-l01'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l03', classWeekId: 'l2plus-l02', hostId: 'jodi', supportingIds: ['alex'],
        location: place('academy-memory-gallery-itinerary-wall', 'Academy memory-gallery itinerary wall', 'アカデミー記憶ギャラリーの予定の壁'),
        setup: line('Jodi opens Sensei’s summer-holiday page beneath four blank audio pins, while Alex leaves the two speaker shelves unnamed until B-22 has been heard.', 'ジョディさんは先生の夏休みのページを四つの空の音声ピンの下に開きます。アレックスさんは、B-22を聞くまで二つの話し手の棚の名前を出しません。'),
        handoff: line('Once each pin returns to the speaker who said it, the page can support a careful question about typical holiday activities without treating a plan as a promise.', 'どのピンも話した人のところへ戻ると、そのページは予定を約束のように扱わず、よくする休みの活動を注意深く聞く質問を支えます。'),
        nPlusOne: step('ask whether someone has had an experience', 'separate two speakers’ typical holiday activities'),
        callback: callback('callback:l2-holiday-itinerary', 'seed', 'A plan becomes evidence only after the speaker is identified; the grammar page keeps example actions open rather than exhaustive.', '予定は、話した人が分かって初めて根拠になります。文法のページは、行動を全部ではなく例として開いたままにします。', 'A future exchange can ask about a holiday routine without turning it into a commitment.', '次のやり取りでは、休みの予定を約束にせずに聞けます。'),
        world: world('home'),
        dialogue: dialogue(
            turn('jodi', 'need', 'The journal holds two holiday accounts. Neither one is a promise about what happens next.', '日誌には二人の休みの話があります。どちらも、次にすることの約束ではありません。'),
            turn('alex', 'model', 'We’ll hear B-22, then pin each detail to the person who actually said it.', 'B-22を聞いてから、それぞれの情報を実際に言った人のところへ留めましょう。'),
            turn('jodi', 'transfer', 'Then we can ask what someone usually does while keeping examples as examples.', 'そうすれば、例を例のままにして、休みによくすることを聞けます。'),
        ),
        journal: journal('l2-l03', 'l2plus-l02'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l04', classWeekId: 'l2plus-l03', hostId: 'tom', supportingIds: ['francis'],
        location: place('academy-plain-style-matrix-table', 'Academy plain-style matrix table', 'アカデミー普通形の表のテーブル'),
        setup: line('Tom opens Sensei’s Chapter 20-1 matrix with four columns visible, while Francis names the column before anyone fills a form into it.', 'トムさんは、先生の Chapter 20-1 の四つの列が見える表を開きます。フランシスさんは、形を入れる前に、どの列かを言います。'),
        handoff: line('Once each row returns to its named plain-form column, the table can support a careful choice between a polite exchange and a plain one.', 'どの行も名前のある普通形の列へ戻ると、その表は丁寧なやり取りと普通形のやり取りを注意深く選ぶ支えになります。'),
        nPlusOne: step('separate two speakers’ typical holiday activities', 'place a verb in one named plain-form column'),
        callback: callback('callback:l2-plain-style-matrix', 'seed', 'A form is more useful when its column is named before it is supplied.', '形は、入れる前にどの列かを言うと、もっと役に立ちます。', 'A later exchange can choose a style without treating one register as a person’s whole identity.', '次のやり取りでは、一つの話し方をその人の全部のように扱わずに、形を選べます。'),
        world: world('classroom'),
        dialogue: dialogue(
            turn('tom', 'need', 'Four columns, four different jobs. This is not a race to fill the page.', '四つの列には、四つの違う役目があります。このページを急いで埋める競争ではありません。'),
            turn('francis', 'model', 'Name the form and the situation first; then the verb has somewhere precise to go.', '先に形と場面を言いましょう。そうすれば、動詞を正しい場所へ置けます。'),
            turn('tom', 'transfer', 'We’ll choose polite or plain style for this exchange, not use one register to label a whole person.', 'このやり取りに合わせて丁寧形か普通形を選びます。一つの話し方で人全体を決めません。'),
        ),
        journal: journal('l2-l04', 'l2plus-l03'),
        completesThread: false,
    }),
    entry({
        packageId: 'l2-l05', classWeekId: 'l2plus-l04', hostId: 'alex', supportingIds: ['tom'],
        location: place('academy-b24-listening-hinge-table', 'Academy B-24 listening-hinge table', 'アカデミーB-24聞き取りヒンジのテーブル'),
        setup: line('Alex opens Sensei’s B-24 page beside three unturned hinges, while Tom leaves the left and right choices unclaimed until the original audio is heard.', 'アレックスさんは先生のB-24のページを三つのまだ動かしていないヒンジの横に開きます。トムさんは、原音声を聞くまで左右の選択を決めません。'),
        handoff: line('Once each hinge follows the heard choice, the page can support a casual invitation without assuming a yes or a no before someone answers.', 'どのヒンジも聞こえた選択へ動くと、そのページは答える前に「はい」か「いいえ」を決めつけず、気軽な誘いを支えられます。'),
        nPlusOne: step('place a verb in one named plain-form column', 'hear whether a person does or does not join an ordinary plan'),
        callback: callback('callback:l2-b24-listening-hinge', 'payoff', 'A choice becomes useful after it is heard, not when a listener supplies a likely answer.', '選択は、聞いたあとに役に立ちます。聞く人がありそうな答えを足したときではありません。', 'The next invitation can leave room for a real answer on either side.', '次の誘いでは、どちらの答えにも本当の余地を残せます。'),
        world: world('station'),
        dialogue: dialogue(
            turn('alex', 'need', 'The departure board lists destinations. It does not mean anyone has agreed to go.', '出発案内には行き先があります。でも、だれかが行くと決めた意味ではありません。'),
            turn('tom', 'model', 'We’ll hear each B-24 choice before turning its hinge, then keep the B-25 diary in its own order.', 'B-24の選択を聞いてからヒンジを動かし、そのあとB-25の日記を元の順番のまま確かめます。'),
            turn('alex', 'transfer', 'A casual invitation can follow, with yes, no, or later all still available.', 'そのあとで気軽に誘えます。「はい」「いいえ」「あとで」のどれも選べるままです。'),
        ),
        journal: journal('l2-l05', 'l2plus-l04'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l06', classWeekId: 'l2plus-l05', hostId: 'shin', supportingIds: ['sophie'],
        location: place('academy-library-opinion-notebook', 'Library opinion notebook', '図書館の意見ノート'),
        setup: line('At the library reading desk, Shin opens Sensei’s Chapter 21 statements in order, while Sophie keeps each original sentence separate from the supposition written after it.', '図書館の閲覧机で、シンさんは先生のChapter 21の文を順番に開きます。ソフィーさんは、それぞれの元の文と、そのあとに書く推量を分けたままにします。'),
        handoff: line('Once every statement has a checked plain form before と, the notebook can carry an opinion without turning supposition into fact.', 'どの文も「と」の前の普通形を確かめると、推量を事実にせず、ノートに意見を残せます。'),
        nPlusOne: step('hear whether a person does or does not join an ordinary plan', 'express a supposition while preserving the source statement'),
        callback: callback('callback:l2-plain-style-matrix', 'payoff', 'The named plain-form columns now support an opinion whose confidence stays visible.', '名前を確かめた普通形の列が、確かさを見えるままにした意見を支えます。', 'A source statement and a supposition can be read again without either becoming hidden plot fact.', '元の文と推量は、どちらも隠れた物語の事実にせず、もう一度読めます。'),
        world: world('library'),
        dialogue: dialogue(
            turn('shin', 'need', 'Five source statements. The notebook must not turn any of them into a fact about our story.', '元の文は五つです。このノートで、どれも私たちの物語の事実にしてはいけません。'),
            turn('sophie', 'model', 'Check the plain form before と, then mark the result clearly as supposition.', '「と」の前の普通形を確かめてから、その文が推量だとはっきり示しましょう。'),
            turn('shin', 'transfer', 'Then you can say what you think without claiming what another person knows.', 'そうすれば、ほかの人が何を知っているか決めつけずに、自分の考えを言えます。'),
        ),
        journal: journal('l2-l06', 'l2plus-l05'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l07', classWeekId: 'l2plus-l06', hostId: 'francis', supportingIds: ['xingyu'],
        location: place('academy-practice-kitchen-confirmation-display', 'Academy practice-kitchen confirmation display', 'アカデミー練習キッチンの確認掲示'),
        setup: line('At the practice-kitchen display, Francis opens Sensei’s Chapter 21 confirmation page while Xingyu keeps form and rising intonation as two separate signals.', '練習キッチンの掲示で、フランシスさんは先生の Chapter 21 の確認ページを開きます。シンユさんは、形と上がるイントネーションを二つの別の信号にします。'),
        handoff: line('Once all four signals are checked, the same plain forms can move to a new job directly before a noun.', '四つの信号を確かめると、同じ普通形を名詞の直前という新しい役目へ移せます。'),
        nPlusOne: step('express a supposition while preserving the source statement', 'seek confirmation with plain form and rising intonation'),
        callback: callback('callback:l2-plain-form-transfer', 'seed', 'Plain form now seeks confirmation without treating agreement as automatic.', '普通形は、同意を決めつけずに確認を求める形になります。', 'The source page remains available whenever form and intonation need to be separated again.', '形とイントネーションをもう一度分けるときは、原本のページへ戻れます。'),
        world: world('ramen'),
        dialogue: dialogue(
            turn('francis', 'need', 'The page asks for confirmation, but a question mark alone does not show both signals.', 'このページは確認を求めますが、疑問符だけでは二つの信号が分かりません。'),
            turn('xingyu', 'model', 'Choose the plain form first, then mark the rising voice separately.', '先に普通形を選び、そのあとで上がる声を別に示しましょう。'),
            turn('francis', 'transfer', 'That keeps confirmation open until another person actually answers.', 'そうすれば、相手が本当に答えるまで確認を開いたままにできます。'),
        ),
        journal: journal('l2-l07', 'l2plus-l06'),
        completesThread: false,
    }),
    entry({
        packageId: 'l2-l08', classWeekId: 'l2plus-l07', hostId: 'jenny', supportingIds: ['stasi'],
        location: place('fictional-glasshouse-word-walk', 'Fictional glasshouse word walk', '架空の温室のことば散歩道'),
        setup: line('On the glasshouse word walk, Jenny opens Sensei’s Chapter 22-1 page while Stasi leaves each object unnamed until its plain-form clause reaches the noun.', '温室のことば散歩道で、ジェニーさんは先生の Chapter 22-1 のページを開きます。スタシさんは、普通形の節が名詞へ届くまで、それぞれの物の名前を決めません。'),
        handoff: line('Four clauses now sit directly before their nouns, ready to remain intact when the whole noun phrase enters a larger sentence.', '四つの節が名詞の直前に置かれ、名詞句全体が大きな文へ入っても、その形を保てるようになりました。'),
        nPlusOne: step('seek confirmation with plain form and rising intonation', 'attach a plain-form clause directly before its noun'),
        callback: callback('callback:l2-plain-form-transfer', 'transform', 'The checked plain form changes jobs: it now identifies a noun instead of seeking agreement.', '確認した普通形は役目を変え、同意を求める代わりに名詞を説明します。', 'The exact Chapter 22-1 page keeps every source object and clause visible before attachment.', 'Chapter 22-1 の原本ページで、つなぐ前の物と節をすべて確認できます。'),
        world: world('park'),
        dialogue: dialogue(
            turn('jenny', 'need', 'These object cards need descriptions, but the source leaves every completion open.', 'この物の札には説明が必要ですが、原本ではどの完成文も空いたままです。'),
            turn('stasi', 'model', 'Put the clause in plain form and move it directly before the noun it describes.', '節を普通形にして、説明する名詞の直前へ動かしましょう。'),
            turn('jenny', 'transfer', 'Then the whole noun phrase can travel without losing its clause boundary.', 'そうすれば、節の境目を失わずに名詞句全体を次へ運べます。'),
        ),
        journal: journal('l2-l08', 'l2plus-l07'),
        completesThread: false,
    }),
    entry({
        packageId: 'l2-l09', classWeekId: 'l2plus-l08', hostId: 'francis', supportingIds: ['sophie'],
        location: place('academy-media-room-signal-console', 'Academy media-room signal console', 'アカデミーメディア室の信号卓'),
        setup: line('At the media-room console, Francis opens Sensei’s two Chapter 22-2 pages while Sophie keeps the clause form and the outer particle on separate channels.', 'メディア室の信号卓で、フランシスさんは先生の Chapter 22-2 の二ページを開きます。ソフィーさんは、節の形と外側の助詞を別々のチャンネルにします。'),
        handoff: line('Each complete noun phrase now reaches its correct を or が channel without exposing a derived answer before an attempt.', 'どの名詞句も、試す前に派生した答えを見せず、正しい「を」または「が」のチャンネルへ届きました。'),
        nPlusOne: step('attach a plain-form clause directly before its noun', 'choose the outer particle for a complete noun phrase'),
        callback: callback('callback:l2-plain-form-transfer', 'payoff', 'The clause remains intact while the larger sentence gives its noun phrase an outer particle.', '節の形を保ったまま、大きな文が名詞句に外側の助詞を与えます。', 'Both exact source pages remain available for a fresh comparison of form and particle.', '形と助詞をもう一度比べるため、二枚の原本ページへ戻れます。'),
        world: world('lab'),
        dialogue: dialogue(
            turn('francis', 'need', 'A correct clause is not enough; the larger sentence still needs the noun phrase on the right channel.', '正しい節だけでは足りません。大きな文では、名詞句を正しいチャンネルへ送る必要があります。'),
            turn('sophie', 'model', 'Keep the clause attached, then choose を or が from the predicate outside it.', '節をつないだまま、その外の述語から「を」か「が」を選びましょう。'),
            turn('francis', 'transfer', 'Now form and particle can be checked independently without changing Sensei’s prompts.', 'これで、先生の問題を変えずに、形と助詞を別々に確認できます。'),
        ),
        journal: journal('l2-l09', 'l2plus-l08'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l10', classWeekId: 'l2plus-l09', hostId: 'christian', supportingIds: ['aakash'],
        location: place('atlas-station-threshold-desk', 'Atlas station threshold desk', 'アトラス駅ルートの境目デスク'),
        setup: line('At the station-route desk, Christian opens Sensei\'s two Chapter 23-1 pages while Aakash keeps each speech bubble on the visible side of action completion.', '駅ルートのデスクで、クリスチャンさんは先生の Chapter 23-1 の二ページを開きます。アーカーシュさんは、それぞれのことばを動作完了の見える側に保ちます。'),
        handoff: line('All four speech bubbles now cross the before-or-after threshold without exposing a derived completion before an attempt.', '四つのことばが、試す前に派生した完成文を見せず、「完了する前／完了した後」の境目を通りました。'),
        nPlusOne: step('choose the outer particle for a complete noun phrase', 'place a speech act before or after action completion'),
        callback: callback('callback:l2-toki-threshold', 'payoff', 'The station route makes the action boundary visible while every source prompt stays unchanged.', '駅ルートで動作の境目が見えるようになり、原本の問題文はすべてそのまま保たれます。', 'Both exact Chapter 23-1 pages remain available whenever the timing boundary needs another look.', '時間の境目をもう一度確かめるときは、Chapter 23-1 の原本二ページへ戻れます。'),
        world: world('station'),
        dialogue: dialogue(
            turn('christian', 'need', 'Each source bubble needs a timing side, but its completed sentence must stay covered until you try.', '原本のことばには時間の側が必要ですが、完成文は試すまで伏せておきます。'),
            turn('aakash', 'model', 'Check whether the action is complete, then choose the dictionary form or the た-form side.', '動作が完了しているか確かめてから、辞書形か「た形」の側を選びましょう。'),
            turn('christian', 'transfer', 'That keeps the route readable without changing Sensei\'s words or showing the answer early.', 'そうすれば、先生のことばを変えず、答えを早く見せずにルートを読めます。'),
        ),
        journal: journal('l2-l10', 'l2plus-l09'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l11', classWeekId: 'l2plus-l10', hostId: 'angel', supportingIds: ['alex'],
        location: place('station-concourse-occasion-board', 'Station concourse occasion board', '駅コンコースの場面ボード'),
        setup: line('At the station concourse, Angel opens Sensei\'s exact Chapter 23-1 page while Alex keeps each notice on its present-action or absent-state route.', '駅コンコースで、エンジェルさんは先生の Chapter 23-1 の原本ページを開きます。アレックスさんは、それぞれの案内を「する・ある」か「しない・ない」の道に保ちます。'),
        handoff: line('All four source pairs now join through the correct occasion route, with every derived completion covered until an attempt.', '原本の四組の文が正しい場面の道でつながり、派生した完成文は試すまで伏せられています。'),
        nPlusOne: step('place a speech act before or after action completion', 'distinguish a present action or state from an absent one before とき'),
        callback: callback('callback:l2-occasion-route', 'payoff', 'The station board separates what happens from what does not happen while Sensei\'s source page stays inspectable.', '駅のボードは、先生の原本ページを確認できるまま、起こることと起こらないことを分けます。', 'The exact page and four routes remain available for a fresh attempt without revealing a completion early.', '完成文を早く見せず、原本ページと四つの道へもう一度戻れます。'),
        world: world('station'),
        dialogue: dialogue(
            turn('angel', 'need', 'Each source pair needs one occasion route, but the completed sentence stays covered until you choose.', '原本の文の組には場面の道が一つ必要ですが、完成文は選ぶまで伏せておきます。'),
            turn('alex', 'model', 'Check whether the first action or state is present or absent, then choose the form before とき.', '最初の行動や状態があるかないかを確かめてから、「とき」の前の形を選びましょう。'),
            turn('angel', 'transfer', 'That keeps the source wording intact and makes only the affirmative or negative route visible.', 'そうすれば、原本のことばを変えず、肯定か否定の道だけを見えるようにできます。'),
        ),
        journal: journal('l2-l11', 'l2plus-l10'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l12', classWeekId: 'l3-2-l01', hostId: 'christian', supportingIds: ['xingyu'],
        location: place('home-routine-writing-desk', 'Home routine writing desk', '家の習慣を書く机'),
        setup: line('At the home writing desk, Christian opens Sensei\'s exact Chapter 28-1 pages while Xingyu keeps the simultaneous action separate from the main action that remains at the end.', '家の机で、クリスチャンさんは先生の Chapter 28-1 の原本二ページを開きます。シンユさんは、同時にする動作と、文末に残る主な動作を分けて保ちます。'),
        handoff: line('All six source pairs now join through ます-stem plus ながら, with every Yomu-derived completion covered until an attempt.', '原本の六組の文が「ます語幹＋ながら」でつながり、よむが派生した完成文は試すまで伏せられています。'),
        nPlusOne: step('distinguish a present action or state from an absent one before とき', 'join a simultaneous action to the main action with ながら'),
        callback: callback('callback:l3-2-routine-reasons', 'seed', 'The home routine keeps two actions in one sentence without changing which action is primary.', '家の習慣では、主な動作を変えずに二つの動作を一文に保ちます。', 'Both exact Chapter 28-1 pages remain inspectable before a fresh attempt.', 'Chapter 28-1 の原本二ページは、もう一度試す前にも確認できます。'),
        world: world('home'),
        dialogue: dialogue(
            turn('christian', 'need', 'Each source pair needs one sentence, but its derived completion stays covered until you try.', '原本の文の組には一つの文が必要ですが、派生した完成文は試すまで伏せておきます。'),
            turn('xingyu', 'model', 'Use the first verb\'s ます-stem before ながら and keep the main action at the end.', '最初の動詞の「ます語幹」を「ながら」の前に置き、主な動作を文末に保ちましょう。'),
            turn('christian', 'transfer', 'That preserves Sensei\'s prompt order while making the two-action relationship visible.', 'そうすれば、先生の問題の順番を保ったまま、二つの動作の関係を見えるようにできます。'),
        ),
        journal: journal('l2-l12', 'l3-2-l01'),
        completesThread: false,
    }),
    entry({
        packageId: 'l2-l13', classWeekId: 'l3-2-l02', hostId: 'francis', supportingIds: ['sam'],
        location: place('restaurant-reason-table', 'Set-meal restaurant reason table', '定食屋の理由テーブル'),
        setup: line('At the restaurant table, Francis opens Sensei\'s exact Chapter 28-2 pages while Sam keeps each listed point in plain form before the conclusion.', '定食屋のテーブルで、フランシスさんは先生の Chapter 28-2 の原本二ページを開きます。サムさんは、結論の前に並べる各点を普通形に保ちます。'),
        handoff: line('All eight source prompts now carry their listed points or reasons into a conclusion, with every Yomu-derived completion covered until an attempt.', '原本の八問が、並べる点や理由を結論へつなぎ、よむが派生した完成文は試すまで伏せられています。'),
        nPlusOne: step('join a simultaneous action to the main action with ながら', 'list more than one point or reason with plain-form し'),
        callback: callback('callback:l3-2-routine-reasons', 'payoff', 'A routine can now become an explanation: more than one grounded point leads to one practical conclusion.', '習慣を説明に変えられます。根拠のある複数の点が、一つの実用的な結論へつながります。', 'Both exact Chapter 28-2 pages remain inspectable before a fresh attempt.', 'Chapter 28-2 の原本二ページは、もう一度試す前にも確認できます。'),
        world: world('restaurant'),
        dialogue: dialogue(
            turn('francis', 'need', 'Each source prompt has several points, but the completed chain stays covered until you choose or type it.', '原本の各問題には複数の点がありますが、完成した鎖は選ぶか入力するまで伏せておきます。'),
            turn('sam', 'model', 'Put each point in plain form before し, then keep the source conclusion at the end.', '各点を普通形にして「し」の前に置き、原本の結論を文末に保ちましょう。'),
            turn('francis', 'transfer', 'That keeps both source uses visible without supplying an answer before the attempt.', 'そうすれば、試す前に答えを与えず、原本の二つの用法を見えるままにできます。'),
        ),
        journal: journal('l2-l13', 'l3-2-l02'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l14', classWeekId: 'l3-2-l03', hostId: 'jenny', supportingIds: ['angel'],
        location: place('language-lab-state-desk', 'Language lab state desk', '語学ラボの状態確認デスク'),
        setup: line('At the language lab, Jenny opens Sensei\'s exact four Chapter 29-1 pages while Angel checks what each visible change leaves in effect.', '語学ラボで、ジェニーさんは先生の Chapter 29-1 の原本四ページを開きます。エンジェルさんは、見える変化のあとに何が残っているかを確かめます。'),
        handoff: line('All eight selected source prompts now report a resulting state, its next action, or its topic, with every Yomu-derived completion covered until an attempt.', '選んだ原本八問が、結果の状態、次の行動、または話題を報告する形になり、よむが派生した完成文は試すまで伏せられています。'),
        nPlusOne: step('list more than one point or reason with plain-form し', 'report the visible state left by a change with an intransitive verb'),
        callback: callback('callback:l3-2-room-state', 'payoff', 'The room itself now supplies evidence for a resulting-state report instead of an unseen actor.', '見えない動作主ではなく、部屋そのものが結果の状態を報告する根拠になります。', 'All four exact Chapter 29-1 pages remain inspectable before a fresh attempt.', 'Chapter 29-1 の原本四ページは、もう一度試す前にも確認できます。'),
        world: world('lab'),
        dialogue: dialogue(
            turn('jenny', 'need', 'Each source prompt shows a result, but its completed report stays covered until you choose or type it.', '原本の各問題には結果が見えますが、完成した報告文は選ぶか入力するまで伏せておきます。'),
            turn('angel', 'model', 'Name the thing with が, use the intransitive て-form plus います, then keep any next action after から.', '物を「が」で示し、自動詞の「て形＋います」を使い、「から」のあとに次の行動を残しましょう。'),
            turn('jenny', 'transfer', 'That preserves Sensei\'s exact prompts while separating a continuing state from someone doing the action.', 'そうすれば、先生の原問を保ったまま、続いている状態と、だれかがする動作を分けられます。'),
        ),
        journal: journal('l2-l14', 'l3-2-l03'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l15', classWeekId: 'l3-2-l04', hostId: 'alex', supportingIds: ['jodi'],
        location: place('classroom-completion-repair-desk', 'Classroom completion and regret desk', '教室の完了と残念のデスク'),
        setup: line('In the classroom, Alex opens Sensei\'s exact five Chapter 29-2 pages while Jodi keeps completed action, finish-first intention, and regrettable result distinct.', '教室で、アレックスさんは先生の Chapter 29-2 の原本五ページを開きます。ジョディさんは、完了したこと、先に終える意志、残念な結果を分けて保ちます。'),
        handoff: line('All eight selected source prompts now preserve the intended completion or regret reading, with every Yomu-derived answer covered until an attempt.', '選んだ原本八問が、完了または残念の意味を保ち、よむが派生した答えは試すまで伏せられています。'),
        nPlusOne: step('report the visible state left by a change with an intransitive verb', 'distinguish completion, finish-first intention, and regrettable result with 〜てしまう'),
        callback: callback('callback:l3-2-completion-regret', 'payoff', 'The same form now separates what is fully done, what will be finished first, and what ended badly.', '同じ形で、すっかり終わったこと、先に終えること、残念な結果を分けられます。', 'All five exact Chapter 29-2 pages remain inspectable before a fresh attempt.', 'Chapter 29-2 の原本五ページは、もう一度試す前にも確認できます。'),
        world: world('classroom'),
        dialogue: dialogue(
            turn('alex', 'need', 'Each source prompt needs one completion, but the derived answer stays covered until you choose or type it.', '原本の各問には一つの完成文が必要ですが、派生した答えは選ぶか入力するまで伏せておきます。'),
            turn('jodi', 'model', 'Check whether the context is already complete, intended to finish first, or regrettable, then choose しまいます or しまいました.', 'すでに完了したのか、先に終える意志なのか、残念な結果なのかを確かめ、「しまいます」か「しまいました」を選びましょう。'),
            turn('alex', 'transfer', 'That preserves Sensei\'s prompt order without exposing a Yomu-derived answer before the attempt.', 'そうすれば、試す前によむが派生した答えを見せず、先生の問題の順番を保てます。'),
        ),
        journal: journal('l2-l15', 'l3-2-l04'),
        completesThread: true,
    }),
    entry({
        packageId: 'l2-l16', classWeekId: 'l3-2-l05', hostId: 'angel', supportingIds: ['christian'],
        location: place('classroom-prepared-state-desk', 'Classroom prepared-state desk', '教室の準備状態デスク'),
        setup: line('Angel opens Sensei\'s exact Chapter 30-1 and information-gap pages while Christian keeps neutral visible states separate from things deliberately left ready.', 'エンジェルさんは先生の Chapter 30-1 と情報差の原本を開きます。クリスチャンさんは、見えるだけの状態と、だれかが準備して残した状態を分けます。'),
        handoff: line('Eight source prompts now distinguish 〜ています from purposeful 〜てあります, with every derived answer covered until an attempt.', '八つの原問で「〜ています」と、目的のある「〜てあります」を分け、派生した答えは試すまで伏せられています。'),
        nPlusOne: step('distinguish completion, intention, and regret with 〜てしまう', 'report a purposeful prepared state with a transitive て-form plus あります'),
        callback: callback('callback:l3-2-prepared-state', 'payoff', 'The classroom itself now shows which states merely exist and which were prepared for someone to use.', '教室そのものが、ただある状態と、だれかが使えるように準備された状態を示します。', 'All six exact source pages remain inspectable before another attempt.', '原本六ページは、もう一度試す前にも確認できます。'),
        world: world('classroom'),
        dialogue: dialogue(
            turn('angel', 'need', 'Read the source picture first; the completed report stays covered until you choose or type it.', 'まず原本の絵を読み、完成した報告文は選ぶか入力するまで伏せておきます。'),
            turn('christian', 'model', 'Use an intransitive verb with ています for a neutral state, and a transitive て-form with あります for deliberate preparation.', '見えるだけの状態には自動詞の「ています」、目的のある準備には他動詞のて形と「あります」を使います。'),
            turn('angel', 'transfer', 'That preserves Sensei\'s exact task while making the intention behind the remaining state inspectable.', 'そうすれば先生の原問を保ったまま、残っている状態の意図を確かめられます。'),
        ),
        journal: journal('l2-l16', 'l3-2-l05'),
        completesThread: true,
    }),
]);

function entry(value: Omit<LessonStoryCatalogEntry, 'presentation' | 'plotBoundary' | 'threadId'> & { readonly completesThread: boolean }): LessonStoryCatalogEntry {
    return Object.freeze({
        ...value,
        supportingIds: Object.freeze([...value.supportingIds]),
        location: Object.freeze({ ...value.location }),
        setup: Object.freeze({ ...value.setup }),
        handoff: Object.freeze({ ...value.handoff }),
        nPlusOne: Object.freeze({ ...value.nPlusOne }),
        callback: value.callback && Object.freeze({
            ...value.callback,
            meaningNow: Object.freeze({ ...value.callback.meaningNow }),
            fallback: Object.freeze({ ...value.callback.fallback }),
        }),
        ...(value.world ? { world: Object.freeze({ ...value.world }) } : {}),
        ...(value.dialogue ? {
            dialogue: Object.freeze(value.dialogue.map(item => Object.freeze({
                ...item,
                line: Object.freeze({ ...item.line }),
            }))),
        } : {}),
        ...(value.journal ? { journal: Object.freeze({ ...value.journal }) } : {}),
        threadId: value.callback.id,
        presentation: 'name-only' as const,
        plotBoundary: Object.freeze({
            canonicalWrites: false as const,
            completesThread: value.completesThread,
            replay: 'separate-optional' as const,
        }),
    });
}

function world(originPlaceId: WorldPlaceId): NonNullable<LessonStoryCatalogEntry['world']> {
    return Object.freeze({ originPlaceId, completionReturn: 'originating-route-frame' });
}

function dialogue(
    ...turns: readonly NonNullable<LessonStoryCatalogEntry['dialogue']>[number][]
): NonNullable<LessonStoryCatalogEntry['dialogue']> {
    return Object.freeze(turns);
}

function turn(
    speakerId: AcademyCastMemberId,
    purpose: NonNullable<LessonStoryCatalogEntry['dialogue']>[number]['purpose'],
    en: string,
    ja: string,
): NonNullable<LessonStoryCatalogEntry['dialogue']>[number] {
    return Object.freeze({ speakerId, purpose, line: line(en, ja) });
}

function journal(
    replayLessonId: LessonStoryPackageId,
    classWeekId: string,
): NonNullable<LessonStoryCatalogEntry['journal']> {
    return Object.freeze({
        encounterId: `class-week:${replayLessonId}`,
        sceneId: `scene:class-week:${classWeekId}`,
        replayLessonId,
        stateWrite: 'met-characters-and-journal',
    });
}

function place(id: string, en: string, ja: string): LessonStoryCatalogEntry['location'] {
    return Object.freeze({ id, en, ja });
}

function line(en: string, ja: string): Readonly<{ en: string; ja: string }> {
    return Object.freeze({ en, ja });
}

function step(
    carries: string,
    introduces: string,
    prerequisite?: NonNullable<LessonStoryCatalogEntry['nPlusOne']['prerequisite']>,
): LessonStoryCatalogEntry['nPlusOne'] {
    return Object.freeze({
        carries,
        introduces,
        ...(prerequisite ? { prerequisite } : {}),
    });
}

function callback(
    id: LessonStoryCallbackId,
    state: LessonStoryCallbackState,
    en: string,
    ja: string,
    fallbackEn: string,
    fallbackJa: string,
): NonNullable<LessonStoryCatalogEntry['callback']> {
    return Object.freeze({ id, state, meaningNow: line(en, ja), fallback: line(fallbackEn, fallbackJa) });
}
