import type { ActivityModel } from '../../../src/academy/domain/activity-runtime';

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value as Row;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const first = (value: unknown): unknown => Array.isArray(value) ? value[0] : undefined;

/** Encode the response formats shared by the registered lesson models. */
export function passingGradingResponse(model: ActivityModel): unknown {
    const p = row(model.payload);
    if (model.kind === 'choice') return rows(p.options).find(option => option.correct)?.id;
    if (model.kind === 'academy-typed-response') {
        return first(p.acceptedAnswers) ?? (p.requiredGroups as string[][]).map(group => group[0]).join(' ');
    }
    if (model.kind === 'academy-source-vocabulary-sheet') {
        return row(row(model).provenance).locus && (row(row(row(model).provenance).locus).row as number) % 2 === 1
            ? row(p.support).meaning : row(p.support).words;
    }
    if (model.kind === 'kanji-writing') {
        return { phase: 'writing', inputMode: 'doodle', assessment: { passed: true, score: 100,
            expectedStrokes: row(p.trace).strokeCount, actualStrokes: row(p.trace).strokeCount, message: 'Complete' } };
    }
    const rounds = rows(p.rounds);
    const prompts = rows(p.prompts);
    const questions = rows(p.questions);
    const tasks = rows(p.tasks);
    const tracks = rows(p.tracks);
    const items = rows(p.items);
    const answers: Row[] = rounds.length ? rounds.map(roundAnswer)
        : questions.length ? questions.map(question => ({ questionId: question.id, kind: question.kind, optionId: question.correctOptionId, value: first(question.acceptedAnswers), order: question.correctOrder }))
        : prompts.length ? prompts.map(prompt => ({ promptId: prompt.id, optionId: prompt.correctOptionId ?? first(prompt.acceptedOptionIds) }))
        : tasks.length ? tasks.map(taskAnswer)
        : tracks.flatMap(track => rows(track.prompts).map(prompt => ({ promptId: prompt.id, optionId: prompt.correctOptionId ?? first(prompt.acceptedOptionIds) })));
    if (items.some(item => item.correctOptionId)) answers.push(...items.map(item => ({ itemId: item.id, optionId: item.correctOptionId })));
    if (rows(p.pins).length) answers.push(...rows(p.pins).map(pin => ({ pinId: pin.id, speakerId: pin.correctSpeakerId })));
    if (rows(p.turns).length) answers.push(...rows(p.turns).filter(turn => turn.kind !== 'classmate').map(turn => ({ turnId: turn.id, value: first(turn.acceptedOptionIds) ?? first(turn.acceptedAnswers) ?? (turn.requiredGroups as string[][] | undefined)?.map(group => group[0]).join(' ') })));
    const values: Row[] = [...tracks.flatMap(track => rows(track.tasks)), ...tasks].flatMap(task =>
        rows(task.fields).map(field => ({ taskId: task.id, fieldId: field.id, value: field.answer })));
    values.push(...rows(p.fields).map(field => ({ fieldId: field.id, value: field.answer })));
    return {
        answers,
        placements: rounds.length ? rounds.map(roundAnswer) : items.map(item => ({ itemId: item.id, zoneId: item.correctZoneId })),
        pairs: rounds.map(round => ({ questionId: round.id, answerId: round.correctAnswerId })),
        phrases: rounds.map(round => ({ roundId: round.id, a: round.correctA, b: round.correctB })),
        signals: rounds.map(round => ({ roundId: round.id, optionId: round.correctOptionId, rising: true, particle: round.correctParticle })),
        thresholds: rounds.map(round => ({ roundId: round.id, timing: round.correctTiming })),
        routes: rounds.map(round => ({ roundId: round.id, mode: round.correctMode })),
        selections: items.length ? items.map(item => ({ roundId: item.id, kanaId: item.id }))
            : rounds.map(round => ({ roundId: round.id, cardId: round.correctCardId })),
        values,
        choice: p.choice ? row(p.choice).answer : undefined,
        order: p.correctOrder,
        masteredIds: items.map(item => item.id),
        actionOrder: p.actionSequence ? row(p.actionSequence).correctOrder : p.actionPlan ? row(p.actionPlan).correctOrder : undefined,
        ...(p.production ? { production: row(p.production).modelAnswer ?? '聞こえ方と根拠のメモ。' } : {}),
    };
}

function roundAnswer(r: Row): Row {
    const answer: Row = { roundId: r.id, signalId: r.id, mode: r.mode };
    for (const [key, value] of Object.entries(r)) {
        if (key.startsWith('correct')) {
            const name = key.slice(7);
            answer[name[0]!.toLowerCase() + name.slice(1)] = value;
        }
    }
    Object.assign(answer, {
        value: r.answerValue ?? r.answer ?? first(r.acceptedAnswers) ?? r.answerExpression ?? r.expectedMora,
        nationalityId: r.nationality ? row(r.nationality).correctOptionId : undefined,
        occupationId: r.occupation ? row(r.occupation).correctOptionId : undefined,
        kind: r.mode === 'location-choice' ? 'location' : 'owner',
        attached: true, lens: 'frequency', particle: 'ni',
        disruptionTransportId: r.disruption ? row(r.disruption).transportId : undefined,
        disruptionDurationId: r.disruption ? row(r.disruption).durationId : undefined,
        usualTransportId: r.usual ? row(r.usual).transportId : undefined,
        usualDurationId: r.usual ? row(r.usual).durationId : undefined,
        requestId: r.request ? row(r.request).correctOptionId : undefined,
        kanaId: r.id, columnId: r.vowelColumnId, vowelColumnId: r.vowelColumnId,
        rowId: r.rowId, cellId: `${r.rowId}:${r.vowelColumnId}`, slotId: r.slotId,
        nounClass: r.nounClass, verb: r.verb, position: r.position,
    });
    return answer;
}

function taskAnswer(task: Row): Row {
    return { taskId: task.id, value: task.answer ?? first(task.acceptedAnswers),
        mark: task.correctMark, direction: task.beneficiaryDirection, phrase: task.answer };
}

/** Keep envelope identities intact; try authored alternatives before malformed input. */
export function* missedGradingResponses(model: ActivityModel, passing: unknown): Generator<unknown> {
    const alternatives = new Set<unknown>([null, 'circle', 'cross', 'incorrect', 'a', 'b', 'c', 'left', 'right', 'before', 'after',
        'affirmative', 'negative', 'frequency', 'duration', 'ni', 'none', 'を', 'が', 'hai', 'iie', 'direct', 'na', 'soshite', 'ga', 'speaker-a', 'speaker-b', '○', '×']);
    function collect(value: unknown): void {
        if (typeof value === 'string') alternatives.add(value);
        else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                if (['id', 'value', 'answer', 'answerValue'].includes(key) && typeof child === 'string') alternatives.add(child);
                else if (typeof child === 'object') collect(child);
            }
        }
    }
    collect(model.payload);
    function* variants(value: unknown): Generator<unknown> {
        if (typeof value === 'boolean') yield !value;
        else if (typeof value === 'number') yield value + 1;
        else if (typeof value === 'string') {
            for (const other of alternatives) if (other !== value) yield other;
        } else if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index += 1) {
                for (const other of variants(value[index])) yield value.map((item, at) => at === index ? other : item);
            }
            for (let index = 1; index < value.length; index += 1) {
                yield value.map((item, at) => at === 0 ? value[index] : at === index ? value[0] : item);
                if (value[0] && typeof value[0] === 'object' && value[index] && typeof value[index] === 'object') {
                    for (const key of Object.keys(value[0])) {
                        if (['roundId', 'questionId', 'promptId', 'taskId', 'itemId', 'signalId', 'fieldId', 'turnId'].includes(key)) continue;
                        yield value.map((item, at) => at === 0 ? { ...row(item), [key]: row(value[index])[key] }
                            : at === index ? { ...row(item), [key]: row(value[0])[key] } : item);
                    }
                }
            }
            yield value.slice(1);
        } else if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                if (['roundId', 'questionId', 'promptId', 'taskId', 'fieldId', 'itemId', 'pinId', 'signalId', 'turnId', 'phase', 'inputMode'].includes(key)) continue;
                for (const other of variants(child)) yield { ...value, [key]: other };
            }
        }
    }
    yield* variants(passing);
}
