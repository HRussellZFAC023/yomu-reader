import {
  ACADEMY_ASSESSED_ANSWER_SUPPORT,
  createActivityRuntime,
  type ActivityController,
  type ActivityEvaluation,
  type ActivityHost,
  type ActivityPlugin,
  type GradeResult,
  type ReviewSeed,
  type ValidationIssue,
} from "../../domain/activity-runtime";
import {
  assessedJapanese,
  gradeFromScore,
  japanese,
  localized,
  localizedNodes,
  setPending,
  showEvaluation,
  statusRegion,
  text,
  validateFeedback,
  validatePassScore,
} from "../../minigames/activity-kit/shared";
import {
  N3_SOURCE_OPENING_ECO_READING,
  N3_SOURCE_OPENING_SOURCE_CATALOG,
  N3_SOURCE_OPENING_STAGE_PROVENANCE,
  N3_SOURCE_OPENING_TOBIRA_EVIDENCE,
  N3_SOURCE_OPENING_TOWN_FLOW_ITEMS,
} from "./source";
import {
  N3_SOURCE_OPENING_ACTIVITY_KIND,
  type N3SourceOpeningActivityMode,
  type N3SourceOpeningModel,
  type N3SourceOpeningQuestion,
  type N3SourceOpeningResponse,
  type N3SourceOpeningReviewTarget,
  type N3SourceOpeningStage,
} from "./types";

export const n3SourceOpeningPlugin: ActivityPlugin<
  N3SourceOpeningModel,
  N3SourceOpeningResponse
> = {
  kind: N3_SOURCE_OPENING_ACTIVITY_KIND,
  validate: validateN3SourceOpening,
  render: renderN3SourceOpening,
  grade: gradeN3SourceOpening,
  toReviewSeeds: n3SourceOpeningReviewSeeds,
};

export function createN3SourceOpeningRuntime() {
  return createActivityRuntime([n3SourceOpeningPlugin]);
}

export function validateN3SourceOpening(
  model: N3SourceOpeningModel,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const expectedProvenance =
    N3_SOURCE_OPENING_STAGE_PROVENANCE[model.payload?.stage];
  if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id) {
    issues.push({
      path: "answerSupport",
      message: "The assessed answer-support contract is required.",
    });
  }
  if (
    !expectedProvenance ||
    !sameObject(model.provenance, expectedProvenance)
  ) {
    issues.push({
      path: "provenance",
      message: "The exact hash-pinned N3 stage provenance is required.",
    });
  } else {
    const catalogIds = new Set(
      N3_SOURCE_OPENING_SOURCE_CATALOG.map((source) => source.id),
    );
    if (model.provenance.sourceRefs.some((id) => !catalogIds.has(id))) {
      issues.push({
        path: "provenance.sourceRefs",
        message: "Every stage source must resolve in the N3 source catalog.",
      });
    }
  }
  if (
    !Array.isArray(model.payload?.teaching) ||
    model.payload.teaching.length !== 3 ||
    model.payload.teaching.some(
      (item) =>
        !text(item.title.ja) ||
        !text(item.title.en) ||
        !text(item.example) ||
        !text(item.explanation.ja) ||
        !text(item.explanation.en),
    )
  ) {
    issues.push({
      path: "payload.teaching",
      message: "Three bilingual teaching cues are required before assessment.",
    });
  }
  validateStimulus(model, issues);
  validateQuestions(model, issues);
  validateProduction(model, issues);
  validatePassScore(model.payload?.passScore, issues);
  validateFeedback(model.payload?.feedback, issues);
  validateReviewTargets(model, issues);
  return issues;
}

function gradeN3SourceOpening(
  model: N3SourceOpeningModel,
  response: N3SourceOpeningResponse,
): GradeResult {
  const parsed = parseResponse(model, response);
  const missed = model.payload.questions.filter(
    (question) => parsed.answers.get(question.id) !== question.correctOptionId,
  );
  const productionErrors = model.payload.production
    ? productionErrorTags(model, parsed.production)
    : [];
  const totalUnits =
    model.payload.questions.length + (model.payload.production ? 1 : 0);
  const correctUnits =
    model.payload.questions.length -
    missed.length +
    (model.payload.production && productionErrors.length === 0 ? 1 : 0);
  return gradeFromScore(
    correctUnits / totalUnits,
    model.payload.passScore,
    [...missed.map((question) => question.errorTag), ...productionErrors],
    model.payload.feedback,
  );
}

function n3SourceOpeningReviewSeeds(
  model: N3SourceOpeningModel,
  result: GradeResult,
): readonly ReviewSeed[] {
  const targets =
    result.outcome === "pass"
      ? model.payload.reviewTargets
      : model.payload.reviewTargets.filter((target) =>
          target.repairFor.some((tag) => result.errorTags.includes(tag)),
        );
  return targets.map((target) => ({
    id: target.id,
    conceptId: target.conceptId,
    reason: result.outcome === "pass" ? "new-learning" : "repair",
    sourceQuestionId: model.sourceQuestionId,
    content: {
      expression: target.expression,
      ...(target.reading ? { reading: target.reading } : {}),
      meanings: [...target.meanings],
      sentence: target.sentence,
    },
  }));
}

function renderN3SourceOpening(
  model: N3SourceOpeningModel,
  host: ActivityHost,
  submit: (response: N3SourceOpeningResponse) => Promise<ActivityEvaluation>,
): ActivityController {
  const lifecycle = new AbortController();
  const readingDisposers: Array<() => void> = [];
  const root = document.createElement("section");
  root.className = "academy-activity academy-kit";
  root.dataset.activityId = model.id;
  root.dataset.n3SourceStage = model.payload.stage;

  const heading = document.createElement("h2");
  heading.id = `${model.id}-prompt`;
  heading.tabIndex = -1;
  heading.append(...localizedNodes(model.prompt));

  const form = document.createElement("form");
  form.setAttribute("aria-labelledby", heading.id);
  form.append(renderTeaching(model, host, readingDisposers));
  form.append(renderStimulus(model, host, readingDisposers));

  const assessment = document.createElement("section");
  assessment.dataset.lessonPhase = model.payload.production
    ? "assessed-production"
    : "assessed-recognition";
  model.payload.questions.forEach((question, index) =>
    assessment.append(renderQuestion(question, index, lifecycle.signal)),
  );
  if (model.payload.production)
    assessment.append(renderProduction(model, host));
  form.append(assessment);

  const commit = document.createElement("button");
  commit.type = "submit";
  commit.className = "academy-button academy-button-primary";
  commit.textContent =
    host.language === "ja" ? "回答を確定する" : "Commit answers";
  const status = statusRegion("academy-kit-feedback");
  form.append(commit);
  root.append(heading, form, status);
  host.replace(root);

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const response = responseFromForm(model, form);
      if (!response) {
        const message =
          host.language === "ja"
            ? "すべての活動に答えてください。"
            : "Complete every activity before committing.";
        status.textContent = message;
        host.announce(message);
        return;
      }
      setPending(form, true);
      void submit(response)
        .then((evaluation) => {
          root.dataset.outcome = evaluation.result.outcome;
          revealAnswerKey(root, model, host, readingDisposers);
          showEvaluation(status, evaluation, host);
          if (evaluation.result.outcome === "lapse") setPending(form, false);
        })
        .catch((error) => {
          setPending(form, false);
          status.textContent =
            error instanceof Error ? error.message : String(error);
        });
    },
    { signal: lifecycle.signal },
  );

  return {
    focus() {
      heading.focus();
    },
    dispose() {
      lifecycle.abort();
      readingDisposers.forEach((dispose) => dispose());
      root.remove();
    },
  };
}

function renderTeaching(
  model: N3SourceOpeningModel,
  host: ActivityHost,
  disposers: Array<() => void>,
): HTMLElement {
  const section = document.createElement("section");
  section.dataset.lessonPhase = "instruction";
  const heading = document.createElement("h3");
  heading.textContent =
    host.language === "ja"
      ? "先に使う三つの手がかり"
      : "Three cues to use first";
  const list = document.createElement("ol");
  model.payload.teaching.forEach((item, index) => {
    const row = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = localized(item.title, host);
    const example = japanese(item.example);
    example.dataset.readerSurfaceId = `teaching:${model.provenance.packageId}:${index + 1}`;
    registerSurface(host, example, disposers);
    const explanation = document.createElement("p");
    explanation.textContent = localized(item.explanation, host);
    row.append(title, example, explanation);
    list.append(row);
  });
  section.append(heading, list);
  return section;
}

function renderStimulus(
  model: N3SourceOpeningModel,
  host: ActivityHost,
  disposers: Array<() => void>,
): HTMLElement {
  const section = document.createElement("section");
  section.dataset.lessonPhase = "context";
  const heading = document.createElement("h3");
  heading.append(...localizedNodes(model.payload.stimulus.title));
  section.append(heading);

  switch (model.payload.stimulus.kind) {
    case "cloze-sequence": {
      const note = document.createElement("p");
      note.textContent =
        host.language === "ja"
          ? "五つの空所は一つの短い文章として続いています。"
          : "The five gaps form one continuous short text.";
      section.append(note);
      break;
    }
    case "official-audio": {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = model.payload.stimulus.audioUrl;
      audio.dataset.sourceMedia = "official-remote";
      audio.setAttribute(
        "aria-label",
        host.language === "ja"
          ? "Tobira第1課の読み物音声"
          : "Tobira Chapter 1 reading audio",
      );
      const note = document.createElement("p");
      note.dataset.transcriptPolicy = "after-attempt";
      note.textContent =
        host.language === "ja"
          ? "根拠となる資料文と英訳は回答後に開きます。"
          : "Source evidence and translations unlock after the attempt.";
      section.append(audio, note);
      break;
    }
    case "source-reading": {
      const article = document.createElement("article");
      article.dataset.sourceReading = "pre-attempt";
      model.payload.stimulus.paragraphs.forEach((paragraph, index) => {
        const row = document.createElement("p");
        const span = japanese(paragraph);
        span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:passage:paragraph-${index + 1}`;
        registerSurface(host, span, disposers);
        row.append(span);
        article.append(row);
      });
      section.append(article);
      break;
    }
  }
  return section;
}

function renderQuestion(
  question: N3SourceOpeningQuestion,
  index: number,
  signal: AbortSignal,
): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  fieldset.dataset.questionId = question.id;
  fieldset.dataset.activityMode = question.activityMode;
  const legend = document.createElement("legend");
  const ordinal = document.createElement("span");
  ordinal.className = "academy-support";
  ordinal.textContent = `${index + 1}. `;
  legend.append(ordinal, assessedJapanese(question.prompt.ja));
  fieldset.append(legend);

  if (question.activityMode === "cloze-select") {
    const select = document.createElement("select");
    select.name = question.id;
    select.dataset.activityControl = question.activityMode;
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "---";
    select.append(empty);
    question.options.forEach((option) => {
      const choice = document.createElement("option");
      choice.value = option.id;
      choice.textContent = option.label;
      select.append(choice);
    });
    fieldset.append(select);
    return fieldset;
  }

  if (question.activityMode === "map-evidence-match") {
    const value = document.createElement("input");
    value.type = "hidden";
    value.name = question.id;
    const choices = document.createElement("div");
    choices.className = "academy-segmented-control";
    choices.setAttribute("role", "group");
    choices.dataset.activityControl = question.activityMode;
    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "academy-button academy-button-secondary";
      button.dataset.optionId = option.id;
      button.setAttribute("aria-pressed", "false");
      button.append(assessedJapanese(option.label));
      button.addEventListener(
        "click",
        () => {
          value.value = option.id;
          choices
            .querySelectorAll<HTMLButtonElement>("button[data-option-id]")
            .forEach((candidate) =>
              candidate.setAttribute(
                "aria-pressed",
                String(candidate === button),
              ),
            );
        },
        { signal },
      );
      choices.append(button);
    });
    fieldset.append(value, choices);
    return fieldset;
  }

  question.options.forEach((option) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = question.id;
    input.value = option.id;
    label.append(input, assessedJapanese(option.label));
    fieldset.append(label);
  });
  return fieldset;
}

function renderProduction(
  model: N3SourceOpeningModel,
  host: ActivityHost,
): HTMLElement {
  const production = model.payload.production!;
  const fieldset = document.createElement("fieldset");
  fieldset.dataset.activityMode = "bounded-source-production";
  const legend = document.createElement("legend");
  legend.append(...localizedNodes(production.prompt));
  fieldset.append(legend);
  production.facts.forEach((fact) => {
    const row = document.createElement("p");
    row.append(assessedJapanese(fact));
    fieldset.append(row);
  });
  const label = document.createElement("label");
  label.htmlFor = `${model.id}-production`;
  label.textContent =
    host.language === "ja"
      ? "資料に基づく1〜2文"
      : "One or two source-bounded sentences";
  const textarea = document.createElement("textarea");
  textarea.id = label.htmlFor;
  textarea.name = "production";
  textarea.rows = 4;
  textarea.lang = "ja";
  textarea.dataset.productionResponse = "learner-authored";
  fieldset.append(label, textarea);
  return fieldset;
}

function revealAnswerKey(
  root: HTMLElement,
  model: N3SourceOpeningModel,
  host: ActivityHost,
  disposers: Array<() => void>,
): void {
  if (root.querySelector('[data-answer-key="after-attempt"]')) return;
  const section = document.createElement("section");
  section.dataset.answerKey = "after-attempt";
  const heading = document.createElement("h3");
  heading.textContent =
    host.language === "ja"
      ? "回答後の根拠と解説"
      : "Evidence and explanations after the attempt";
  const list = document.createElement("ol");
  model.payload.questions.forEach((question) => {
    const row = document.createElement("li");
    const answer = question.options.find(
      (option) => option.id === question.correctOptionId,
    )!;
    const answerText = japanese(answer.label);
    answerText.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:answer:${question.sourceItemId}`;
    registerSurface(host, answerText, disposers);
    const explanation = document.createElement("p");
    explanation.append(...localizedNodes(question.explanation));
    row.append(answerText, explanation);
    list.append(row);
  });
  section.append(heading, list);

  if (model.payload.stimulus.kind === "official-audio") {
    const transcript = document.createElement("section");
    transcript.dataset.sourceTranscript = "after-attempt";
    const transcriptHeading = document.createElement("h4");
    transcriptHeading.textContent =
      host.language === "ja"
        ? "使用した資料文の抜粋"
        : "Source excerpts used as evidence";
    transcript.append(transcriptHeading);
    model.payload.stimulus.evidenceExcerpts.forEach((excerpt) => {
      const row = document.createElement("p");
      const sourceText = japanese(excerpt.japanese);
      sourceText.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:evidence:${excerpt.id}`;
      registerSurface(host, sourceText, disposers);
      const translation = document.createElement("span");
      translation.lang = "en";
      translation.className = "academy-support";
      translation.textContent = excerpt.translation;
      row.append(sourceText, translation);
      transcript.append(row);
    });
    section.append(transcript);
  }

  if (model.payload.stimulus.kind === "source-reading") {
    const note = document.createElement("p");
    note.append(...localizedNodes(model.payload.stimulus.postAttemptNote));
    section.append(note);
  }

  if (model.payload.production) {
    const modelAnswer = document.createElement("section");
    modelAnswer.dataset.modelAnswer = "after-attempt";
    const modelHeading = document.createElement("h4");
    modelHeading.textContent = host.language === "ja" ? "モデル" : "Model";
    const answer = japanese(model.payload.production.modelAnswer);
    modelAnswer.append(modelHeading, answer);
    section.append(modelAnswer);
  }
  root.append(section);
}

function responseFromForm(
  model: N3SourceOpeningModel,
  form: HTMLFormElement,
): N3SourceOpeningResponse | undefined {
  const data = new FormData(form);
  const answers = model.payload.questions.map((question) => ({
    questionId: question.id,
    optionId: String(data.get(question.id) ?? ""),
  }));
  const production = String(data.get("production") ?? "").trim();
  if (
    answers.some((answer) => !answer.optionId) ||
    (model.payload.production && !production)
  )
    return undefined;
  return { answers, ...(model.payload.production ? { production } : {}) };
}

function parseResponse(
  model: N3SourceOpeningModel,
  response: N3SourceOpeningResponse,
): {
  answers: ReadonlyMap<string, string>;
  production: string;
} {
  if (
    !response ||
    !Array.isArray(response.answers) ||
    response.answers.length !== model.payload.questions.length
  ) {
    throw new TypeError("Every N3 source-opening question needs one answer.");
  }
  const answers = new Map<string, string>();
  response.answers.forEach((answer) => {
    const question = model.payload.questions.find(
      (candidate) => candidate.id === answer.questionId,
    );
    if (
      !question ||
      answers.has(answer.questionId) ||
      !question.options.some((option) => option.id === answer.optionId)
    ) {
      throw new TypeError(
        "N3 source-opening answers must address each authored question once.",
      );
    }
    answers.set(answer.questionId, answer.optionId);
  });
  const production =
    typeof response.production === "string" ? response.production.trim() : "";
  if (model.payload.production && !production)
    throw new TypeError(
      "The N3 evidence-reading transfer needs a learner-authored response.",
    );
  if (!model.payload.production && response.production !== undefined)
    throw new TypeError(
      "This N3 source-opening stage does not accept a production response.",
    );
  return { answers, production };
}

function productionErrorTags(
  model: N3SourceOpeningModel,
  production: string,
): string[] {
  const contract = model.payload.production!;
  const compact = production.normalize("NFKC").replace(/\s/gu, "");
  const errors: string[] = [];
  const hasAttribution =
    /(?:資料[AB]|(?:地域の)?調査|研究)(?:の)?によると/u.test(compact);
  const hasBoundary =
    /(?:かもしれません|とは限りません|によって違(?:います|う))/u.test(compact);
  const hasSubstance = /(?:使い捨て|カップ|洗浄|水|店)/u.test(compact);
  if (!hasAttribution) errors.push(contract.attributionErrorTag);
  if (!hasBoundary) errors.push(contract.boundaryErrorTag);
  if (!hasSubstance || [...compact].length < contract.minimumCharacters)
    errors.push(contract.substanceErrorTag);
  return errors;
}

function validateStimulus(
  model: N3SourceOpeningModel,
  issues: ValidationIssue[],
): void {
  const stimulus = model.payload?.stimulus;
  const expectedKind = {
    "town-flow": "cloze-sequence",
    "geography-listening": "official-audio",
    "evidence-reading": "source-reading",
  }[model.payload?.stage] as
    N3SourceOpeningModel["payload"]["stimulus"]["kind"] | undefined;
  if (
    !stimulus ||
    stimulus.kind !== expectedKind ||
    !text(stimulus.title.ja) ||
    !text(stimulus.title.en)
  ) {
    issues.push({
      path: "payload.stimulus",
      message: "The stage-specific source stimulus is required.",
    });
    return;
  }
  if (
    stimulus.kind === "cloze-sequence" &&
    !sameObject(
      stimulus.sourceItemIds,
      N3_SOURCE_OPENING_TOWN_FLOW_ITEMS.map((item) => item.id),
    )
  ) {
    issues.push({
      path: "payload.stimulus.sourceItemIds",
      message: "The five contiguous Soya text-grammar items are required.",
    });
  }
  if (stimulus.kind === "official-audio") {
    const official = N3_SOURCE_OPENING_SOURCE_CATALOG.find(
      (source) => source.id === "official-web:tobira-l01-reading-audio",
    );
    if (
      stimulus.audioUrl !== official?.url ||
      !sameObject(stimulus.evidenceExcerpts, N3_SOURCE_OPENING_TOBIRA_EVIDENCE)
    ) {
      issues.push({
        path: "payload.stimulus",
        message:
          "The publisher-hosted Tobira audio and reviewed Chapter 1 evidence are required.",
      });
    }
  }
  if (
    stimulus.kind === "source-reading" &&
    stimulus.paragraphs.join("\n") !== N3_SOURCE_OPENING_ECO_READING.passage
  ) {
    issues.push({
      path: "payload.stimulus.paragraphs",
      message: "The exact Soya long-reading passage is required.",
    });
  }
}

function validateQuestions(
  model: N3SourceOpeningModel,
  issues: ValidationIssue[],
): void {
  const questions = model.payload?.questions as
    readonly N3SourceOpeningQuestion[] | undefined;
  const expectedModes: Readonly<
    Record<N3SourceOpeningStage, readonly N3SourceOpeningActivityMode[]>
  > = {
    "town-flow": [
      "cloze-select",
      "cloze-select",
      "cloze-select",
      "cloze-select",
      "cloze-select",
    ],
    "geography-listening": [
      "listening-gist",
      "map-evidence-match",
      "source-status-choice",
    ],
    "evidence-reading": [
      "cause-choice",
      "source-claim-choice",
      "hygiene-evidence-choice",
      "main-claim-choice",
    ],
  };
  const modes = expectedModes[model.payload?.stage];
  if (
    !questions ||
    !modes ||
    questions.map((question) => question.activityMode).join("|") !==
      modes.join("|")
  ) {
    issues.push({
      path: "payload.questions",
      message:
        "The ordered, stage-specific gradable activity modes are required.",
    });
    return;
  }
  const ids = new Set<string>();
  questions.forEach((question, index) => {
    const optionIds = new Set(question.options.map((option) => option.id));
    if (
      !text(question.id) ||
      ids.has(question.id) ||
      !text(question.sourceItemId) ||
      !text(question.prompt.ja) ||
      !text(question.prompt.en) ||
      question.options.length < 3 ||
      optionIds.size !== question.options.length ||
      question.options.some(
        (option) => !text(option.id) || !text(option.label),
      ) ||
      !optionIds.has(question.correctOptionId) ||
      !text(question.explanation.ja) ||
      !text(question.explanation.en) ||
      !text(question.errorTag) ||
      !model.conceptIds.includes(question.conceptId)
    ) {
      issues.push({
        path: `payload.questions.${index}`,
        message:
          "Each question needs a unique source id, neutral options, one key, explanation, error tag, and Concept.",
      });
    }
    ids.add(question.id);
  });
}

function validateProduction(
  model: N3SourceOpeningModel,
  issues: ValidationIssue[],
): void {
  const production = model.payload?.production;
  if (model.payload?.stage !== "evidence-reading") {
    if (production)
      issues.push({
        path: "payload.production",
        message: "Only the evidence-reading stage accepts production.",
      });
    return;
  }
  if (
    production?.authorship !== "original-yomu-n3-source-transfer" ||
    production.facts.length !== 2 ||
    production.facts.some((fact) => !text(fact)) ||
    !text(production.prompt.ja) ||
    !text(production.prompt.en) ||
    !text(production.modelAnswer) ||
    production.minimumCharacters < 20 ||
    !text(production.attributionErrorTag) ||
    !text(production.boundaryErrorTag) ||
    !text(production.substanceErrorTag) ||
    !model.conceptIds.includes(production.conceptId)
  ) {
    issues.push({
      path: "payload.production",
      message:
        "The complete original, source-bounded transfer contract is required.",
    });
  }
}

function validateReviewTargets(
  model: N3SourceOpeningModel,
  issues: ValidationIssue[],
): void {
  const targets = model.payload?.reviewTargets as
    readonly N3SourceOpeningReviewTarget[] | undefined;
  const errorTags = new Set(
    model.payload?.questions.map((question) => question.errorTag),
  );
  if (model.payload?.production) {
    errorTags.add(model.payload.production.attributionErrorTag);
    errorTags.add(model.payload.production.boundaryErrorTag);
    errorTags.add(model.payload.production.substanceErrorTag);
  }
  if (!targets?.length) {
    issues.push({
      path: "payload.reviewTargets",
      message: "At least one Reader/SRS target is required.",
    });
    return;
  }
  const ids = new Set<string>();
  targets.forEach((target, index) => {
    if (
      !text(target.id) ||
      ids.has(target.id) ||
      !model.conceptIds.includes(target.conceptId) ||
      !text(target.expression) ||
      !target.meanings.length ||
      target.meanings.some((meaning) => !text(meaning)) ||
      !text(target.sentence) ||
      !target.repairFor.length ||
      target.repairFor.some((tag) => !errorTags.has(tag))
    ) {
      issues.push({
        path: `payload.reviewTargets.${index}`,
        message:
          "Each review target must map one Concept to an authored assessment error.",
      });
    }
    ids.add(target.id);
  });
}

function registerSurface(
  host: ActivityHost,
  surface: HTMLElement,
  disposers: Array<() => void>,
): void {
  const dispose = host.registerReadingSurface?.(surface);
  if (dispose) disposers.push(dispose);
}

function sameObject(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
