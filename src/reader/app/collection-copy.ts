import { YOMU_DECK_LABEL } from './constants';

// Saving a looked-up word to a collection destination: each destination's
// confirmation, and why a save could not happen.
const EN = {
    collectNoDestination: 'None of your decks can take this word. Turn one on in Settings.',
    collectWordNotFound: 'Not saved: this word was not found in your preferred grading service.',
    // An ordinary page can read these, so they name no service, deck or Anki state (ADR-0020).
    collectAlreadySaved: 'Already in one of your decks. Open Study to edit it.',
    collectHandoffOpened: 'Opened your deck app. Finish saving there.',
    collectNotSaved: 'This word was not saved. Try again, or open Study for details.',
    collectDetailsUnavailable: 'This word was not saved. Its error details could not be stored. Check your connection and settings, then try again.',
    collectServiceUnavailable: 'The deck service did not confirm this save. Check its connection and settings before trying again.',
    collectFailureTitle: 'Last word not saved: {word}',
    collectFailureHelp: 'Check the destination in Settings, then try saving the word again.',
    collectFailureDismiss: 'Dismiss save error',
    jpdbAddApiKeyRequired: 'Add a JPDB API key, or use Add to Anki.',
    addedToJpdb: 'Added to JPDB.',
    jitenAddApiKeyRequired: 'Add a Jiten API key, or use Add to Anki.',
    // Jiten takes a single word only into a word list (StudyDeckType 2).
    jitenNeedsWordList: 'To save words to Jiten, create a word list on jiten.moe.',
    addedToJiten: 'Added to Jiten.',
    bunproAddApiKeyRequired: 'Add a Bunpro frontend API token, or use Add to Anki.',
    bunproNoMatchingWord: 'Bunpro has no entry for this word.',
    addedToBunpro: 'Added to Bunpro.',
    yomuLocalSrsDisabled: `Enable ${YOMU_DECK_LABEL} in Settings first.`,
    yomuLocalSrsStorageFailed: `Your ${YOMU_DECK_LABEL} could not be saved. Browser storage may be full. Free some site storage, then try again.`,
    yomuLocalSrsSaveInterrupted: `Your ${YOMU_DECK_LABEL} was not saved because saving was interrupted. Try again.`,
    addedToYomuLocal: `Added to your ${YOMU_DECK_LABEL}.`,
    // A よむ deck word kept without a schedule (Library, Stats and the popups).
    savedWord: 'Saved',
    deckPickerSaved: 'Saved in this deck',
    deckPickerNotSaved: 'Not saved in this deck',
    deckPickerChecking: 'Checking…',
    deckPickerUnsupported: 'Status unknown: this destination cannot check saved words',
    deckPickerUnavailable: 'Status unknown: could not check this deck',
    deckPickerStatusHelp: 'Checked when opened. Saved decks remain selectable; sentence updates depend on the destination.',
} as const;

const JA: Record<keyof typeof EN, string> = {
    collectNoDestination: 'この単語を追加できるデッキがありません。設定でデッキを有効にしてください。',
    collectWordNotFound: '優先採点サービスでこの単語が見つからなかったため、保存していません。',
    collectAlreadySaved: 'すでにデッキにあります。編集はStudyで行えます。',
    collectHandoffOpened: 'デッキのアプリを開きました。そちらで保存を完了してください。',
    collectNotSaved: 'この単語は保存されませんでした。もう一度お試しいただくか、Studyで詳細を確認してください。',
    collectDetailsUnavailable: 'この単語は保存されませんでした。エラーの詳細も保存できませんでした。接続と設定を確認して、もう一度お試しください。',
    collectServiceUnavailable: 'デッキのサービスから保存の確認が取れませんでした。接続と設定を確認してから、もう一度お試しください。',
    collectFailureTitle: '最後に保存できなかった単語：{word}',
    collectFailureHelp: '設定で保存先を確認してから、単語をもう一度保存してください。',
    collectFailureDismiss: '保存エラーを閉じる',
    jpdbAddApiKeyRequired: 'JPDB APIキーかAnki追加が必要です。',
    addedToJpdb: 'JPDBに追加しました。',
    jitenAddApiKeyRequired: 'Jiten APIキーかAnki追加が必要です。',
    jitenNeedsWordList: 'Jitenに単語を保存するには、jiten.moeで単語リストを作成してください。',
    addedToJiten: 'Jitenに追加しました。',
    bunproAddApiKeyRequired: 'Bunproのfrontend_api_tokenかAnki追加が必要です。',
    bunproNoMatchingWord: 'この単語はBunproに見つかりませんでした。',
    addedToBunpro: 'Bunproに追加しました。',
    yomuLocalSrsDisabled: '先に設定でよむデッキを有効にしてください。',
    yomuLocalSrsStorageFailed: 'よむデッキを保存できませんでした。ブラウザーの保存容量が不足している可能性があります。サイトの保存容量を空けてから、もう一度お試しください。',
    yomuLocalSrsSaveInterrupted: '保存が中断されたため、よむデッキに保存されませんでした。もう一度お試しください。',
    addedToYomuLocal: 'よむデッキに追加しました。',
    savedWord: '保存済み',
    deckPickerSaved: 'このデッキに保存済み',
    deckPickerNotSaved: 'このデッキには未保存',
    deckPickerChecking: '確認中…',
    deckPickerUnsupported: '保存状況不明：この保存先では保存済みの単語を確認できません',
    deckPickerUnavailable: '保存状況不明：このデッキを確認できませんでした',
    deckPickerStatusHelp: '開くたびに確認します。保存済みのデッキも選択できます。例文の更新は保存先の対応によります。',
};

export const COLLECTION_COPY = { en: EN, ja: JA };
