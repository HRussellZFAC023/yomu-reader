import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const groups = [
  group('kana', [
    ['Hiragana recall', 'ひらがなの想起'], ['Katakana recall', 'カタカナの想起'], ['Kana production', '仮名の産出'],
    ['Small-kana contrasts', '小書き仮名の区別'], ['Long-vowel listening', '長音の聞き分け'], ['Kana in new words', '新しい語の仮名'],
  ], learningCriteria('kana', ['recall', 'recall', 'produce', 'recognise', 'listen', 'transfer'])),
  group('kanji', [
    ['Kanji recognition', '漢字の認識'], ['Reading retrieval', '読みの想起'], ['Meaning retrieval', '意味の想起'], ['Stroke production', '筆順の産出'],
    ['Component awareness', '部品への気づき'], ['Kanji in words', '語の中の漢字'], ['Kanji repair', '漢字の修正'], ['Mixed-context kanji', '混合文脈の漢字'],
    ['Source kanji', '教材の漢字'], ['Transferred kanji', '転移した漢字'],
  ], learningCriteria('kanji', ['recognise', 'recall', 'recall', 'write', 'explore', 'read', 'repair', 'recall', 'source-complete', 'transfer'])),
  group('vocabulary', [
    ['Word recognition', '語の認識'], ['Word recall', '語の想起'], ['Word production', '語の産出'], ['Words in sentences', '文の中の語'],
    ['Listening vocabulary', '聞いて分かる語'], ['Personal collection', '自分のコレクション'], ['Shiritori words', 'しりとりの語'], ['Vocabulary repair', '語彙の修正'],
    ['Source vocabulary', '教材の語彙'], ['Vocabulary transfer', '語彙の転移'],
  ], [
    learning('vocabulary', 'recognise'), learning('vocabulary', 'recall'), learning('vocabulary', 'produce'), learning('vocabulary', 'read'),
    learning('vocabulary', 'listen'), { source: 'collection', measure: 'active-count' }, { ...learning('vocabulary', 'produce'), modeId: 'shiritori' },
    learning('vocabulary', 'repair'), learning('vocabulary', 'source-complete', 'distinct-sources'), learning('vocabulary', 'transfer'),
  ]),
  group('grammar', [
    ['Pattern recognition', '文型の認識'], ['Grammar recall', '文法の想起'], ['Sentence building', '文作り'], ['Grammar listening', '聞き取り文法'],
    ['Grammar repair', '文法の修正'], ['Grammar in sources', '教材の文法'], ['Grammar transfer', '文法の転移'],
  ], learningCriteria('grammar', ['recognise', 'recall', 'produce', 'listen', 'repair', 'source-complete', 'transfer'])),
  group('reading', [
    ['Phrase reading', '句の読解'], ['Sentence reading', '文の読解'], ['Paragraph reading', '段落の読解'], ['Reading recall', '読解の想起'],
    ['Reading repair', '読解の修正'], ['Source reading', '教材の読解'], ['Mixed reading', '混合読解'], ['Reading transfer', '読解の転移'],
  ], learningCriteria('reading', ['read', 'read', 'read', 'recall', 'repair', 'source-complete', 'recognise', 'transfer'])),
  group('listening', [
    ['Sound recognition', '音の認識'], ['Word listening', '単語の聞き取り'], ['Sentence listening', '文の聞き取り'], ['Listening recall', '聞いた内容の想起'],
    ['Transcript repair', '字幕による修正'], ['Video listening', '動画の聞き取り'], ['Source listening', '教材の聞き取り'], ['Listening transfer', '聞き取りの転移'],
  ], learningCriteria('listening', ['listen', 'listen', 'listen', 'recall', 'repair', 'listen', 'source-complete', 'transfer'])),
  group('speaking', [
    ['First rehearsal', '最初のリハーサル'], ['Word production', '単語の発話'], ['Sentence production', '文の発話'], ['Shadowing', 'シャドーイング'],
    ['Pronunciation repair', '発音の修正'], ['Conversation response', '会話の応答'], ['Speaking transfer', '発話の転移'],
  ], learningCriteria('speaking', ['speak', 'produce', 'produce', 'speak', 'repair', 'speak', 'transfer'])),
  group('writing', [
    ['Kana writing', '仮名を書く'], ['Kanji writing', '漢字を書く'], ['Word writing', '語を書く'], ['Sentence writing', '文を書く'],
    ['Writing repair', '作文の修正'], ['Source writing', '教材に基づく作文'], ['Writing transfer', '作文の転移'],
  ], learningCriteria('writing', ['write', 'write', 'write', 'produce', 'repair', 'source-complete', 'transfer'])),
  group('repair', [
    ['Notice a lapse', '間違いに気づく'], ['Use a hint', 'ヒントを使う'], ['Contrast meanings', '意味を対比する'], ['Repair a form', '形を直す'],
    ['Repair later', '後で直す'], ['Clear a repair set', '修正セットを終える'], ['Transfer after repair', '修正後に転移する'],
  ], learningCriteria('repair', ['recognise', 'recall', 'recognise', 'produce', 'repair', 'review', 'transfer'])),
  group('review', [
    ['Begin reviewing', '復習を始める'], ['Review on new days', '別の日に復習する'], ['Good recall reviews', 'よく思い出せた復習'], ['Easy recall reviews', '楽に思い出せた復習'],
    ['Hard reviews completed', '難しい復習を完了'], ['Again becomes evidence', 'もう一度から証拠へ'], ['Long review practice', '長期の復習'],
  ], [
    { source: 'review', measure: 'count' }, { source: 'review', measure: 'distinct-days' }, { source: 'review', measure: 'count', rating: 'good' },
    { source: 'review', measure: 'count', rating: 'easy' }, { source: 'review', measure: 'count', rating: 'hard' },
    learning('repair', 'review'), learning('repair', 'review', 'duration-minutes'),
  ]),
  group('source', [
    ['Open a source', '教材を開く'], ['Complete source tasks', '教材課題を完了'], ['Use several sources', '複数教材を使う'],
    ['Listen from sources', '教材音声を聞く'], ['Repair from sources', '教材から修正する'], ['Transfer source language', '教材の言葉を転移する'],
  ], [
    learning('reading', 'read', 'distinct-sources'), learning('reading', 'source-complete', 'count'), learning('reading', 'source-complete', 'distinct-sources'),
    learning('listening', 'source-complete', 'distinct-sources'), learning('repair', 'source-complete', 'distinct-sources'), learning('transfer', 'transfer', 'distinct-sources'),
  ]),
  group('exploration', [
    ['Dictionary discovery', '辞書で発見'], ['Kanji discovery', '漢字を発見'], ['Example discovery', '用例を発見'],
    ['Random discovery', 'ランダム発見'], ['Discovery on new days', '別の日の発見'], ['Discovery becomes recall', '発見から想起へ'],
  ], [
    mode('dictionary-discovery'), mode('kanji-discovery'), mode('example-discovery'), mode('random-discovery'),
    { ...learning('vocabulary', 'explore', 'distinct-days'), independent: false }, learning('vocabulary', 'recall'),
  ]),
  group('character-bond', [
    ['Meet the ensemble', '仲間と出会う'], ['Relationship turning points', '関係の転機'], ['Open journal chapters', '関係日誌の章を開く'],
    ['Learn together often', '何度も一緒に学ぶ'], ['Shared transfer moments', '一緒に転移する'],
  ], [
    { source: 'scene', measure: 'count', sceneIdPrefix: 'scene:meet:' }, { source: 'relationship', measure: 'relationship-turns' }, { source: 'relationship', measure: 'relationship-chapters' },
    { source: 'day', measure: 'distinct-days' }, learning('transfer', 'transfer'),
  ]),
  group('transfer', [
    ['First transfer', '最初の転移'], ['Vocabulary transfer', '語彙の転移'], ['Grammar transfer', '文法の転移'],
    ['Listening transfer', '聞き取りの転移'], ['Production transfer', '産出の転移'], ['Transfer across days', '日をまたぐ転移'],
  ], [
    learning('transfer', 'transfer'), learning('vocabulary', 'transfer'), learning('grammar', 'transfer'),
    learning('listening', 'transfer'), learning('speaking', 'transfer'), learning('transfer', 'transfer', 'distinct-days'),
  ]),
];

const thresholds = {
  count: [5, 25, 100, 300],
  'distinct-concepts': [3, 15, 50, 150],
  'distinct-sources': [1, 3, 8, 20],
  'distinct-days': [2, 7, 30, 100],
  'duration-minutes': [15, 60, 300, 1200],
  'active-count': [10, 50, 200, 500],
  'optional-activities': [3, 15, 50, 150],
  'relationship-chapters': [1, 10, 30, 60],
  'relationship-turns': [1, 3, 9, 18],
};

const definitions = groups.flatMap(({ id: groupId, themes, criteria }) => themes.map(([en, ja], index) => {
  const id = `${groupId}-${slug(en)}`;
  const criterion = { ...criteria[index] };
  if (criterion.source === 'learning' && !criterion.conceptPrefix) criterion.conceptPrefix = `concept:${groupId}:${slug(en)}:`;
  const [bronze, silver, gold, platinum] = thresholds[criterion.measure];
  return {
    id,
    group: groupId,
    title: { en, ja },
    description: {
      en: `Build demonstrable learning evidence through ${en.toLowerCase()}; progress comes only from the recorded learning action.`,
      ja: `${ja}の学習行動を記録し、実際の証拠だけで進みます。`,
    },
    medalId: `academy:${id}`,
    criterion,
    thresholds: { bronze, silver, gold, platinum },
  };
}));

if (definitions.length !== 100) throw new Error(`Expected 100 achievements, found ${definitions.length}.`);

const output = { schemaVersion: 1, registryId: 'yomu-academy-achievements', revision: 1, definitions };
writeFileSync(resolve('public/academy/content/achievements.v1.json'), `${JSON.stringify(output, null, 2)}\n`);

function group(id, themes, criteria) {
  if (themes.length !== criteria.length) throw new Error(`${id} theme/criterion mismatch.`);
  return { id, themes, criteria };
}

function learningCriteria(skill, actions) {
  return actions.map(action => learning(skill, action));
}

function learning(skill, action, measure = 'count') {
  return { source: 'learning', measure, skill, action, outcome: 'pass', independent: true };
}

function mode(modeId) {
  return { source: 'learning', measure: 'count', action: 'explore', outcome: 'pass', independent: false, modeId };
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
