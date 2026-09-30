#!/usr/bin/env node
// Built-app behavior fixture, not visual or live-provider acceptance.
import path from "node:path";
import {
  existsSync,
  statSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  addGmStorageBridgeInitScript,
  assert,
  createSmokePaths,
  jsonHttpResponse,
  launchSmokeBrowser,
  serveFile,
  startLoopbackServer,
  YOMU_SETTINGS_KEY,
} from "./lib/smoke-harness.mjs";

const paths = createSmokePaths(import.meta.dirname);
const app = readFileSync(path.join(paths.newTabDir, "app.js"));
assert(
  app.includes(Buffer.from("yomu-practice-sessions-v1")),
  "Rebuild Study before running this contract.",
);
const cards = [
  {
    vid: 501,
    spelling: "図鑑",
    reading: "ずかん",
    meaning: "pictorial book",
    sentence: "この図鑑は面白い。",
  },
  {
    vid: 502,
    spelling: "本",
    reading: "ほん",
    meaning: "book",
    sentence: "本を読む。",
  },
].map((card, index) => ({
  ...card,
  sid: 1,
  rid: 0,
  frequencyRank: 1500 + index,
  partOfSpeech: ["n"],
  meanings: [{ glosses: [card.meaning], partOfSpeech: ["n"] }],
  cardState: ["due"],
  pitchAccent: [],
  wordWithReading: null,
  source: "jpdb",
  reviewSource: "jpdb-api",
}));
const commit = "study-fixture-current-settings";
const settings = {
  __yomuSettingsPersistenceCommitV1: commit,
  onboardingSeen: true,
  learningTargetChosen: true,
  interfaceLanguage: "en",
  apiKey: "fixture-key",
  jitenApiKey: "",
  jpdbMiningEnabled: true,
  enableReviews: true,
  newTabSource: "jpdb",
  newTabJpdbReviewMode: "api-vocabulary",
  newTabAnkiEnabled: false,
  newTabParsingEnabled: false,
  newTabFrontSentenceEnabled: false,
  audioEnabled: false,
  autoPlayAudio: false,
  immersionKitEnabled: false,
  localDictionariesEnabled: false,
  studyTranslationEnabled: false,
  studyGrammarEnabled: false,
};
const requests = [];
const fixtureErrors = [];
let offline = false;
function requestFixture(request) {
  const endpoint =
    String(request?.url ?? "")
      .split("/api/v1/")[1]
      ?.split("?")[0] ?? "";
  const data = request.data ? JSON.parse(request.data) : {};
  requests.push({
    endpoint,
    url: request.url,
    method: request.method,
    offline,
    data,
  });
  if (offline)
    return { status: 0, responseText: "", error: "Fixture is offline." };
  if (endpoint === "list-user-decks")
    return jsonHttpResponse({ decks: [[7, "Fixture words", 2, 0]] });
  if (endpoint === "deck/list-vocabulary")
    return jsonHttpResponse({
      vocabulary: cards.map((card) => [card.vid, card.sid]),
    });
  if (endpoint === "lookup-vocabulary") {
    assert(
      Array.isArray(data.list) && Array.isArray(data.fields),
      "Unexpected JPDB lookup shape.",
    );
    return jsonHttpResponse({
      vocabulary_info: data.list.map(([vid, sid]) => {
        const card = cards.find(
          (candidate) => candidate.vid === vid && candidate.sid === sid,
        );
        assert(card, "Unexpected vocabulary identity.", { vid, sid });
        const values = {
          vid,
          sid,
          rid: card.rid,
          spelling: card.spelling,
          reading: card.reading,
          frequency_rank: card.frequencyRank,
          part_of_speech: card.partOfSpeech,
          meanings_chunks: card.meanings.map((item) => item.glosses),
          meanings_part_of_speech: card.meanings.map(
            (item) => item.partOfSpeech,
          ),
          card_state: card.cardState,
          pitch_accent: card.pitchAccent,
          due_at: null,
        };
        return data.fields.map((field) => {
          assert(
            Object.hasOwn(values, field),
            "Unexpected JPDB lookup field.",
            { field },
          );
          return values[field];
        });
      }),
    });
  }
  if (endpoint === "review") return jsonHttpResponse({});
  return { status: 404, responseText: "{}", contentType: "application/json" };
}

if (process.argv.includes("--check-fixture")) {
  const lookup = (data) =>
    JSON.parse(
      requestFixture({
        url: "https://jpdb.io/api/v1/lookup-vocabulary",
        method: "POST",
        data: JSON.stringify(data),
      }).responseText,
    ).vocabulary_info;
  assert(
    JSON.stringify(
      lookup({ list: [[502, 1]], fields: ["vid", "spelling"] }),
    ) === JSON.stringify([[502, "本"]]),
    "Single-card lookup returned the wrong identity.",
  );
  assert(
    JSON.stringify(
      lookup({
        list: [
          [502, 1],
          [501, 1],
        ],
        fields: ["reading", "vid"],
      }),
    ) ===
      JSON.stringify([
        ["ほん", 502],
        ["ずかん", 501],
      ]),
    "Lookup order or fields changed.",
  );
  for (const data of [
    { vocabulary: [[501, 1]], fields: ["vid"] },
    { list: [[501, 99]], fields: ["vid"] },
    { list: [[501, 1]], fields: ["unknown_field"] },
  ]) {
    let rejected = false;
    try {
      lookup(data);
    } catch {
      rejected = true;
    }
    assert(rejected, "Malformed fixture lookup was accepted.", { data });
  }
  console.log("Study vocabulary fixture: five contract checks passed.");
  process.exit(0);
}

function startServer() {
  return startLoopbackServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://fixture.local")
      .pathname;
    const relative = pathname.replace(/^\//, "");
    const filename = path.resolve(
      paths.dist,
      relative === "newtab" || relative === "newtab/"
        ? "newtab/index.html"
        : relative,
    );
    if (filename === path.join(paths.newTabDir, "app.js")) {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(request.method === "HEAD" ? undefined : app);
      return;
    }
    if (
      !filename.startsWith(paths.dist + path.sep) ||
      !existsSync(filename) ||
      statSync(filename).isDirectory()
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    const type = filename.endsWith(".html")
      ? "text/html"
      : filename.endsWith(".css")
        ? "text/css"
        : filename.endsWith(".json") || filename.endsWith(".webmanifest")
          ? "application/json"
          : filename.endsWith(".svg")
            ? "image/svg+xml"
            : filename.endsWith(".png")
              ? "image/png"
              : "text/javascript";
    serveFile(response, filename, type, request.method ?? "GET");
  }, "Study contract fixture");
}
let server;
let browser;
let page;
let failure;
let serverClosed = false;
async function closeServer() {
  if (!server || serverClosed) return;
  serverClosed = true;
  await new Promise((resolve) => {
    server.server.close(resolve);
    server.server.closeAllConnections();
  });
}
const fault = process.env.YOMU_STUDY_SMOKE_FAIL_AT;
function failAt(stage) {
  if (fault === stage) throw new Error("Injected fixture failure: " + stage);
}
const result = {
  fixture: true,
  appSha256: createHash("sha256").update(app).digest("hex"),
  checks: [],
  success: false,
  stage: "boot",
  injectedFailure: fault ?? null,
};
async function assertNoNativeReview() {
  const queue = await page.evaluate(async () =>
    window.GM.getValue("jpdb-reader-newtab-grade-queue", []),
  );
  assert(
    Array.isArray(queue) && queue.length === 0,
    "Practice queued a native review.",
    { queue },
  );
  assert(
    !requests.some((request) => request.endpoint === "review"),
    "A native review was submitted before its explicit grade.",
  );
  assert(
    (await page
      .locator("[data-newtab-controls] [data-grade]:disabled")
      .count()) === 0,
    "A native grade is pending behind Practice.",
  );
}

try {
  server = await startServer();
  failAt("launch");
  browser = await launchSmokeBrowser(chromium, "chromium", { headless: true });
  result.browserVersion = browser.version();
  failAt("context");
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === server.origin
      ? route.continue()
      : route.abort(),
  );
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(15_000);
  failAt("bridge");
  await page.exposeFunction("__yomuStudyRequest", (request) => {
    try {
      return requestFixture(request);
    } catch (error) {
      fixtureErrors.push(String(error));
      throw error;
    }
  });
  await addGmStorageBridgeInitScript(page, {
    key: YOMU_SETTINGS_KEY,
    value: settings,
    initialize: "ifMissing",
    requestBridgeName: "__yomuStudyRequest",
  });
  await page.addInitScript(
    ({ cards, commit }) => {
      if (!localStorage.getItem("yomu:settings-intent:v2"))
        localStorage.setItem(
          "yomu:settings-intent:v2",
          JSON.stringify({
            __yomuSettingsPersistenceCommitV1: commit,
            revision: 0,
            records: {},
          }),
        );
      if (!localStorage.getItem("jpdb-reader-newtab-ui"))
        localStorage.setItem(
          "jpdb-reader-newtab-ui",
          JSON.stringify({
            route: "study",
            sort: "frequency",
            filter: "study",
            source: "jpdb",
            revealAnswer: false,
            jpdbDeck: "",
            ankiDeck: "",
            keyHintsDismissed: false,
          }),
        );
      if (!localStorage.getItem("jpdb-reader-newtab-card-cache"))
        localStorage.setItem(
          "jpdb-reader-newtab-card-cache",
          JSON.stringify({
            at: Date.now(),
            sourceLabel: "JPDB",
            cards,
          }),
        );
    },
    { cards, commit },
  );

  const onlineApp = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/newtab/app.js",
  );
  await page.goto(server.origin + "/newtab/", { waitUntil: "load" });
  result.onlineAppSha256 = createHash("sha256")
    .update(await (await onlineApp).body())
    .digest("hex");
  assert(
    result.onlineAppSha256 === result.appSha256,
    "Served app bytes do not match the reported build.",
  );
  await page
    .locator('[data-newtab-controls] [data-newtab-action="reveal"]')
    .waitFor();
  assert(
    (await page.locator("[data-study-step-id]").count()) === 0,
    "Standalone review contains per-word exercise controls.",
  );
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Space");
  await page.locator('[data-newtab-controls] [data-grade="okay"]').waitFor();
  assert(
    !requests.some((request) => request.endpoint === "review"),
    "Reveal submitted a review.",
  );
  result.checks.push("native-keyboard-reveal");

  if (fault === "background-lookup") {
    const outcome = await page.evaluate(() => new Promise(resolve => {
      window.GM.xmlHttpRequest({
        url: "https://jpdb.io/api/v1/lookup-vocabulary", method: "POST",
        data: JSON.stringify({ vocabulary: [[501, 1]], fields: ["vid"] }), timeout: 2_000,
        onload: () => resolve("loaded"), onerror: () => resolve("handled-error"),
        ontimeout: () => resolve("timed-out"),
      });
    }));
    assert(outcome === "handled-error", "The malformed background request did not reach bridge error handling.");
  }

  result.stage = "prepare-practice";
  // The tab pointer lives in managed session storage, which an installed
  // Reader namespaces as yomu:web-owner:v2:<owner>:<key>.
  await page.locator('[data-newtab-action="practice-sessions"]').click();
  await page.locator("[data-practice-purpose]").selectOption("writing");
  await page.locator('[data-practice-action="start"]').click();
  await page.locator("[data-practice-input]").fill("ず");
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-practice-panel]")
        ?.getAttribute("aria-busy") === "false",
  );
  const pointer = await page.evaluate(() =>
    Object.keys(sessionStorage).filter(key => key === "yomu:practice-session-tab:v1" || key.endsWith(":yomu:practice-session-tab:v1")).map(key => sessionStorage.getItem(key))[0] ?? null,
  );
  assert(pointer, "Practice did not retain a tab-owned resume pointer.");
  const promptBeforeKey = await page
    .locator(".yomu-practice-prompt")
    .textContent();
  await page.locator("[data-practice-panel]").focus();
  await page.keyboard.press("4");
  await assertNoNativeReview();
  assert(
    (await page.locator(".yomu-practice-prompt").textContent()) ===
      promptBeforeKey,
    "A native grade shortcut advanced Practice.",
  );
  assert(
    (await page.locator("[data-practice-input]").inputValue()) === "ず",
    "A native shortcut changed the practice answer.",
  );
  result.checks.push("native-keyboard-isolated-from-practice");
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.waitForFunction(
    async () =>
      Boolean(await caches.match("./index.html")) &&
      Boolean(await caches.match("./app.js")),
  );

  result.stage = "offline-reload";
  offline = true;
  await context.setOffline(true);
  await closeServer(); // No live app server can accidentally satisfy the offline reload.
  const requestCount = requests.length;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-practice-input]").waitFor();
  assert(
    (await page.locator("[data-practice-input]").inputValue()) === "ず",
    "Offline reload lost the committed draft.",
  );
  assert(
    (await page.evaluate(() =>
      Object.keys(sessionStorage).filter(key => key === "yomu:practice-session-tab:v1" || key.endsWith(":yomu:practice-session-tab:v1")).map(key => sessionStorage.getItem(key))[0] ?? null,
    )) === pointer,
    "Reload changed the session identity.",
  );
  assert(
    requests.length === requestCount,
    "Resuming prepared practice requested provider data.",
  );
  result.offlineAppSha256 = await page.evaluate(async () => {
    const response = await fetch("./app.js");
    if (!response.ok) throw new Error("Offline app response unavailable.");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      await response.arrayBuffer(),
    );
    return [...new Uint8Array(hash)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  });
  assert(
    result.offlineAppSha256 === result.appSha256,
    "Offline app bytes differ from the tested build.",
  );
  await assertNoNativeReview();
  result.checks.push("offline-shell-and-draft-resume");

  result.stage = "complete-practice";
  for (const [index, card] of cards.entries()) {
    await page.waitForFunction(
      (meaning) =>
        document.querySelector(".yomu-practice-prompt")?.textContent ===
        meaning,
      card.meaning,
    );
    assert(
      (await page.locator("[data-practice-panel] h1").textContent()) ===
        "Write words",
      "Practice changed purpose.",
    );
    await page.locator("[data-practice-input]").fill(card.spelling);
    await page.locator('[data-practice-panel] button[type="submit"]').click();
    await page.locator("[data-practice-answer]").waitFor();
    await page.locator('[data-practice-action="next"]').click();
    if (index === cards.length - 1)
      await page.waitForFunction(
        () =>
          document.querySelector("[data-practice-panel] h2")?.textContent ===
          "Session complete",
      );
    else
      await page.waitForFunction(
        (meaning) =>
          document.querySelector(".yomu-practice-prompt")?.textContent ===
          meaning,
        cards[index + 1].meaning,
      );
    await assertNoNativeReview();
  }
  assert(
    !requests.some((request) => request.endpoint === "review"),
    "Practice submitted a native grade.",
  );
  result.checks.push("one-purpose-completion-no-provider-grade");

  result.stage = "native-grade";
  offline = false;
  await context.setOffline(false);
  await page.locator('[data-practice-action="exit"]').click();
  await page.waitForFunction(
    () =>
      !document
        .querySelector("[data-jpdb-reader-root]")
        ?.hasAttribute("data-practice-active"),
  );
  const reveal = page.locator(
    '[data-newtab-controls] [data-newtab-action="reveal"]',
  );
  if (await reveal.count()) await reveal.click();
  await page.locator('[data-newtab-controls] [data-grade="okay"]').waitFor();
  assert(
    (await page.locator("[data-newtab-prompt]").textContent()).includes(
      cards[0].spelling,
    ),
    "The expected native card was not restored.",
  );
  await assertNoNativeReview();
  const reviewCountBeforeKey = requests.filter(
    (request) => request.endpoint === "review",
  ).length;
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("4");
  await page.waitForFunction(
    (spelling) =>
      document
        .querySelector("[data-newtab-study]")
        ?.getAttribute("data-newtab-study-step") === "word" &&
      document
        .querySelector("[data-newtab-prompt]")
        ?.textContent?.includes(spelling),
    cards[1].spelling,
  );
  const grades = requests.filter((request) => request.endpoint === "review");
  assert(
    reviewCountBeforeKey === 0 &&
      grades.length === reviewCountBeforeKey + 1 &&
      grades[0].data.grade === "okay" &&
      grades[0].data.vid === cards[0].vid &&
      grades[0].data.sid === cards[0].sid,
    "Trusted grade key did not submit exactly one review for the native card.",
  );
  result.checks.push("explicit-native-keyboard-grade");
  result.success = true;
} catch (error) {
  failure = error;
  result.error = String(error);
  result.surface = page
    ? await page
        .locator("body")
        .innerText()
        .catch(() => "Unavailable")
    : "Not created";
} finally {
  const cleanup = await Promise.allSettled([browser?.close(), closeServer()]);
  result.cleanup = {
    browserClosed: !browser?.isConnected(),
    serverClosed: !server?.server.listening,
  };
  if (cleanup.some((item) => item.status === "rejected")) {
    failure ??= new Error("Fixture cleanup failed.");
    result.success = false;
  }
  if (fixtureErrors.length) {
    failure ??= new Error("Fixture request validation failed.");
    result.success = false;
    result.fixtureErrors = fixtureErrors;
  }
  let report;
  try {
    failAt("report");
    mkdirSync(paths.artifacts, { recursive: true });
    report = path.join(
      paths.artifacts,
      "study-session-" + Date.now() + ".json",
    );
    writeFileSync(report, JSON.stringify({ ...result, requests }, null, 2));
  } catch (error) {
    failure ??= error;
    result.success = false;
    result.reportError = String(error);
  }
  console.log(JSON.stringify({ ...result, surface: undefined, report }));
}
if (failure) throw failure;
