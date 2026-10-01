/** Copy owned by where a grade goes: the preferred grading service and review targets. */
export const GRADING_SERVICE_COPY = {
    en: {
        switchReviewTarget: 'Switch review target',
        switchGradingProvider: 'Switch grading provider',
        apiGradingProvider: 'Preferred grading service',
        apiGradingProviderHelp: 'Where grades go when both Jiten and JPDB are connected; Automatic parsing follows it too. Study review cards grade to the service they came from, and the ⇄ toggle next to the grade buttons switches only that word.',
        gradingServiceWordNotFound: 'Not graded: this word was not found in your preferred grading service.',
    },
    ja: {
        switchReviewTarget: '採点先を切り替える',
        switchGradingProvider: '採点サービスを切り替える',
        apiGradingProvider: '優先採点サービス',
        apiGradingProviderHelp: 'JitenとJPDBの両方を接続しているときの採点先です。解析ソースが「自動」の場合も、この設定に従います。Studyの復習カードは取得元のサービスで採点され、採点ボタン横の⇄はその単語だけを切り替えます。',
        gradingServiceWordNotFound: '優先採点サービスでこの単語が見つからなかったため、採点していません。',
    },
} as const;
