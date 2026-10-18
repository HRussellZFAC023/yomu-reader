// Read Memo: DOM facts read inside one read phase are read once per element.
//
// A scan asks the same questions of the same element many times: every text
// line of an Aozora Bunko novel has the novel's one div as its parent, and the
// collection walk and the apply slice each classified that div once per line.
// Inside a phase (withReadMemo) the first answer for (fact, element) is kept
// and handed to every later asker; outside one, every read is live.
//
// A phase is only correct where the answers cannot change underneath it: a
// collection walk writes nothing, and an apply slice reads its facts before
// its first write (slice-style-facts.ts), so its writes are judged by the page
// as it was when the slice began. Nested phases share the outermost memo.

type Memo = Map<string, Map<object, unknown>>;

let memo: Memo | null = null;

export function withReadMemo<T>(run: () => T): T {
    if (memo) return run();
    memo = new Map();
    try {
        return run();
    } finally {
        memo = null;
    }
}

export function memoRead<K extends object, V>(fact: string, key: K, read: (key: K) => V): V {
    if (!memo) return read(key);
    let answers = memo.get(fact);
    if (!answers) {
        answers = new Map();
        memo.set(fact, answers);
    }
    if (answers.has(key)) return answers.get(key) as V;
    const value = read(key);
    answers.set(key, value);
    return value;
}
