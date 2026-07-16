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
import { N1_CONTRAST_INFERENCE_PROVENANCE } from "./source";
import {
  N1_CONTRAST_INFERENCE_ACTIVITY_KIND,
  type N1ContrastInferenceModel,
  type N1ContrastInferenceQuestion,
  type N1ContrastInferenceResponse,
} from "./types";

export const n1ContrastInferencePlugin: ActivityPlugin<
  N1ContrastInferenceModel,
  N1ContrastInferenceResponse
> = {
  kind: N1_CONTRAST_INFERENCE_ACTIVITY_KIND,
  validate: validateN1ContrastInference,
  render: renderN1ContrastInference,
  grade: gradeN1ContrastInference,
  toReviewSeeds: n1ContrastInferenceReviewSeeds,
};

export function createN1ContrastInferenceRuntime() {
  return createActivityRuntime([n1ContrastInferencePlugin]);
}

export function validateN1ContrastInference(
  model: N1ContrastInferenceModel,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (model.answerSupport?.id !== ACADEMY_ASSESSED_ANSWER_SUPPORT.id)
    issues.push({
      path: "answerSupport",
      message: "The assessed answer-support contract is required.",
    });
  if (!sameObject(model.provenance, N1_CONTRAST_INFERENCE_PROVENANCE))
    issues.push({
      path: "provenance",
      message:
        "The exact permitted-library N1 source locus, rights, and media state are required.",
    });
  if (
    model.payload.transfer.authorship !== "original-yomu-n1-transfer" ||
    model.payload.transfer.paragraphs.length !== 2 ||
    model.payload.transfer.paragraphs.some((paragraph) => !text(paragraph)) ||
    model.payload.transfer.playbackText !==
      model.payload.transfer.paragraphs.join(" ")
  ) {
    issues.push({
      path: "payload.transfer",
      message: "The complete original two-paragraph N1 transfer is required.",
    });
  }
  if (
    model.payload.production.authorship !== "learner-authored-ungraded" ||
    !text(model.payload.production.prompt.ja) ||
    !text(model.payload.production.prompt.en) ||
    !text(model.payload.production.guidance.ja) ||
    !text(model.payload.production.guidance.en)
  ) {
    issues.push({
      path: "payload.production",
      message:
        "An explicit ungraded learner-authored production prompt is required.",
    });
  }
  if (
    model.payload.teaching.length !== 3 ||
    model.payload.teaching.some(
      (item) =>
        !text(item.title.ja) || !text(item.title.en) || !text(item.example),
    )
  ) {
    issues.push({
      path: "payload.teaching",
      message: "Three bilingual contrast teaching points are required.",
    });
  }
  validateQuestions(model, issues);
  validatePassScore(model.payload.passScore, issues);
  validateFeedback(model.payload.feedback, issues);
  if (
    model.payload.reviewTargets.length !== 4 ||
    model.payload.reviewTargets.some(
      (target) =>
        !text(target.expression) ||
        !text(target.sentence) ||
        !target.meanings.length ||
        !target.repairFor.length,
    )
  ) {
    issues.push({
      path: "payload.reviewTargets",
      message: "Four complete N1 contrast review targets are required.",
    });
  }
  return issues;
}

export function gradeN1ContrastInference(
  model: N1ContrastInferenceModel,
  response: N1ContrastInferenceResponse,
): GradeResult {
  const answers = parseResponse(model, response);
  const missed = model.payload.questions.filter(
    (question) => answers.get(question.id) !== question.correctOptionId,
  );
  return gradeFromScore(
    (model.payload.questions.length - missed.length) /
      model.payload.questions.length,
    model.payload.passScore,
    missed.map((question) => question.errorTag),
    model.payload.feedback,
  );
}

export function n1ContrastInferenceReviewSeeds(
  model: N1ContrastInferenceModel,
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
      meanings: [...target.meanings],
      sentence: target.sentence,
    },
  }));
}

function renderN1ContrastInference(
  model: N1ContrastInferenceModel,
  host: ActivityHost,
  submit: (
    response: N1ContrastInferenceResponse,
  ) => Promise<ActivityEvaluation>,
): ActivityController {
  const lifecycle = new AbortController();
  const root = document.createElement("section");
  root.className = "academy-activity academy-kit";
  root.dataset.activityId = model.id;
  const heading = document.createElement("h2");
  heading.id = `${model.id}-prompt`;
  heading.tabIndex = -1;
  heading.append(...localizedNodes(model.prompt));
  const mediaNote = document.createElement("p");
  mediaNote.className = "academy-support";
  mediaNote.textContent =
    host.language === "ja"
      ? "再生はオリジナル転移文の合成練習です。参照資料の本文、画像、原音声、対応づけ未確認の音声は配信されません。"
      : "Playback is synthesized rehearsal of original transfer text; permitted source text, images, original media, and unverified pairings are not delivered.";
  const readers: Array<() => void> = [];
  const playback: Array<{ dispose(): void }> = [];
  const form = document.createElement("form");
  form.setAttribute("aria-labelledby", heading.id);
  form.append(
    renderTeaching(model, host, readers),
    renderMap(model),
    renderTransfer(model, host, readers, playback, lifecycle.signal),
    renderProduction(model),
  );
  const commit = document.createElement("button");
  commit.type = "submit";
  commit.className = "academy-button academy-button-primary";
  commit.textContent =
    host.language === "ja"
      ? "五つの判断を確定する"
      : "Commit all five judgments";
  const status = statusRegion("academy-kit-feedback");
  form.append(commit);
  root.append(heading, mediaNote, form, status);
  host.replace(root);
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const response = responseFromForm(model, form);
      if (!response) {
        const message =
          host.language === "ja"
            ? "五つの質問すべてに答えてください。"
            : "Answer all five questions.";
        status.textContent = message;
        host.announce(message);
        return;
      }
      setPending(form, true);
      void submit(response)
        .then((evaluation) => {
          root.dataset.outcome = evaluation.result.outcome;
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
      readers.forEach((dispose) => dispose());
      playback.forEach((item) => item.dispose());
      root.remove();
    },
  };
}

function renderTeaching(
  model: N1ContrastInferenceModel,
  host: ActivityHost,
  disposers: Array<() => void>,
): HTMLElement {
  const section = document.createElement("section");
  section.dataset.lessonPhase = "instruction";
  const heading = document.createElement("h3");
  heading.textContent =
    host.language === "ja"
      ? "読む前の三つの境界"
      : "Three boundaries before reading";
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

function renderMap(model: N1ContrastInferenceModel): HTMLElement {
  const section = document.createElement("section");
  section.dataset.lessonPhase = "assessed-recognition";
  const heading = document.createElement("h3");
  heading.textContent = "Contrast map";
  const list = document.createElement("ol");
  model.payload.contrastMap.forEach((row) => {
    const item = document.createElement("li");
    item.dataset.contrastSide = row.side;
    item.textContent = row.claim;
    list.append(item);
  });
  section.append(heading, list);
  model.payload.questions
    .filter((question) => question.stage === "contrast-map")
    .forEach((question) => section.append(renderQuestion(question)));
  return section;
}

function renderTransfer(
  model: N1ContrastInferenceModel,
  host: ActivityHost,
  readers: Array<() => void>,
  playback: Array<{ dispose(): void }>,
  signal: AbortSignal,
): HTMLElement {
  const section = document.createElement("section");
  section.dataset.lessonPhase = "assessed-recognition";
  const heading = document.createElement("h3");
  heading.append(...localizedNodes(model.payload.transfer.title));
  const play = document.createElement("button");
  play.type = "button";
  play.className = "academy-button academy-button-secondary";
  play.dataset.transferPlayback = "synthesized-original-n1";
  play.textContent =
    host.language === "ja"
      ? "オリジナル N1 転移文を聞く"
      : "Play original N1 transfer";
  play.addEventListener(
    "click",
    () =>
      void playRehearsal(model.payload.transfer.playbackText, host, playback),
    { signal },
  );
  const article = document.createElement("article");
  model.payload.transfer.paragraphs.forEach((paragraph, index) => {
    const row = document.createElement("p");
    const span = japanese(paragraph);
    span.dataset.readerSurfaceId = `reader:${model.provenance.packageId}:transfer:paragraph-${index + 1}`;
    registerSurface(host, span, readers);
    row.append(span);
    article.append(row);
  });
  section.append(heading, play, article);
  model.payload.questions
    .filter((question) => question.stage === "transfer")
    .forEach((question) => section.append(renderQuestion(question)));
  return section;
}

function renderProduction(model: N1ContrastInferenceModel): HTMLElement {
  const section = document.createElement("section");
  section.dataset.lessonPhase = "assessed-production";
  const heading = document.createElement("h3");
  heading.append(...localizedNodes(model.payload.production.prompt));
  const note = document.createElement("p");
  note.className = "academy-support";
  note.textContent = model.payload.production.guidance.en;
  const label = document.createElement("label");
  label.textContent = model.payload.production.fieldLabel.en;
  const input = document.createElement("textarea");
  input.name = "production";
  input.dataset.production = "ungraded";
  input.rows = 4;
  label.append(input);
  section.append(heading, note, label);
  return section;
}

function renderQuestion(
  question: N1ContrastInferenceQuestion,
): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  fieldset.dataset.questionId = question.id;
  const legend = document.createElement("legend");
  legend.append(...localizedNodes(question.prompt));
  fieldset.append(legend);
  question.options.forEach((option) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = question.id;
    input.value = option.id;
    const copy = document.createElement("span");
    copy.append(
      assessedJapanese(option.label.ja),
      document.createTextNode(` ${option.label.en}`),
    );
    label.append(input, copy);
    fieldset.append(label);
  });
  return fieldset;
}

function responseFromForm(
  model: N1ContrastInferenceModel,
  form: HTMLFormElement,
): N1ContrastInferenceResponse | undefined {
  const productionField = form.elements.namedItem("production");
  const answers = model.payload.questions.map((question) => {
    const selected = form.querySelector<HTMLInputElement>(
      `input[name="${question.id}"]:checked`,
    );
    return selected
      ? { questionId: question.id, optionId: selected.value }
      : undefined;
  });
  return answers.every((answer) => answer !== undefined)
    ? {
        answers: answers as N1ContrastInferenceResponse["answers"],
        production:
          productionField instanceof HTMLTextAreaElement ? productionField.value : "",
      }
    : undefined;
}

function parseResponse(
  model: N1ContrastInferenceModel,
  response: N1ContrastInferenceResponse,
): ReadonlyMap<string, string> {
  if (
    !Array.isArray(response?.answers) ||
    response.answers.length !== model.payload.questions.length ||
    typeof response.production !== "string"
  )
    throw new TypeError(
      "Every N1 contrast-inference question needs one answer and a production response.",
    );
  const answers = new Map<string, string>();
  for (const answer of response.answers) {
    const question = model.payload.questions.find(
      (candidate) => candidate.id === answer.questionId,
    );
    if (
      !question ||
      answers.has(answer.questionId) ||
      !question.options.some((option) => option.id === answer.optionId)
    )
      throw new TypeError(
        "N1 contrast-inference answers must address each authored question once.",
      );
    answers.set(answer.questionId, answer.optionId);
  }
  return answers;
}

function validateQuestions(
  model: N1ContrastInferenceModel,
  issues: ValidationIssue[],
): void {
  const questions = model.payload.questions;
  if (
    questions.length !== 5 ||
    questions.filter((question) => question.stage === "contrast-map").length !==
      3 ||
    questions.filter((question) => question.stage === "transfer").length !== 2
  ) {
    issues.push({
      path: "payload.questions",
      message: "Three contrast-map and two transfer judgments are required.",
    });
    return;
  }
  const ids = new Set<string>();
  questions.forEach((question, index) => {
    if (
      !text(question.id) ||
      ids.has(question.id) ||
      !text(question.prompt.ja) ||
      !text(question.prompt.en) ||
      question.options.length !== 3 ||
      !question.options.some(
        (option) => option.id === question.correctOptionId,
      ) ||
      !text(question.errorTag)
    ) {
      issues.push({
        path: `payload.questions.${index}`,
        message:
          "Questions need unique ids, bilingual prompts, three options, and a valid answer.",
      });
    }
    ids.add(question.id);
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
async function playRehearsal(
  textToPlay: string,
  host: ActivityHost,
  disposers: Array<{ dispose(): void }>,
): Promise<void> {
  const item = await host.playPronunciation?.(textToPlay);
  if (item) disposers.push(item);
}
function sameObject(left: object, right: object): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
