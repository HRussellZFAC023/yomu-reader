// ==UserScript==
// @name         よむ
// @namespace    https://github.com/HRussellZFAC023/kotoba-reader
// @version      0.1.0
// @author       Henry
// @description  JPDB/Yomitan popup reader with audio, manga OCR, and video subtitle mining for Japanese on any website.
// @license      MIT
// @icon         https://images2.imgbox.com/c8/21/h1DhlGPW_o.png
// @homepage     https://github.com/HRussellZFAC023/kotoba-reader#readme
// @homepageURL  https://github.com/HRussellZFAC023/kotoba-reader
// @source       https://github.com/HRussellZFAC023/kotoba-reader.git
// @supportURL   https://github.com/HRussellZFAC023/kotoba-reader/issues
// @downloadURL  https://raw.githubusercontent.com/HRussellZFAC023/kotoba-reader/main/dist/yomu.user.js
// @updateURL    https://raw.githubusercontent.com/HRussellZFAC023/kotoba-reader/main/dist/yomu.user.js
// @match        *://*/*
// @exclude      https://jpdb.io/*
// @exclude      https://*.jpdb.io/*
// @connect      jpdb.io
// @connect      lensfrontend-pa.googleapis.com
// @connect      lens.google.com
// @connect      vision.googleapis.com
// @connect      raw.githubusercontent.com
// @connect      localhost
// @connect      127.0.0.1
// @connect      *.ts.net
// @connect      *
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  const REQUIRED_JA_AUDIO_SOURCES = ["jpod101", "language-pod-101", "jisho"];
  const JAPANESE_POD_101_UNAVAILABLE_SIZE = 52288;
  const JAPANESE_POD_101_UNAVAILABLE_SHA256 = "ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906";
  class AudioPlayer {
    constructor(getSettings) {
      __publicField(this, "current");
      __publicField(this, "utterance");
      __publicField(this, "lastBlobUrl");
      __publicField(this, "playRequestId", 0);
      this.getSettings = getSettings;
    }
    async play(card) {
      const requestId = ++this.playRequestId;
      const settings = this.getSettings();
      if (!settings.audioEnabled) throw new Error("Audio playback is disabled.");
      const sources = getOrderedAudioSources(settings);
      if (!sources.length) throw new Error("No audio sources configured.");
      this.stopCurrent();
      const errors = [];
      for (const source of sources) {
        if (requestId !== this.playRequestId) return;
        try {
          if (await this.playFromSource(source, card, settings, requestId)) return;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      throw new Error(errors.length ? `No playable audio found. ${errors[0]}` : "No playable audio found.");
    }
    stop() {
      this.playRequestId++;
      this.stopCurrent();
    }
    stopCurrent() {
      var _a;
      (_a = this.current) == null ? void 0 : _a.pause();
      this.current = void 0;
      if (this.utterance) {
        speechSynthesis.cancel();
        this.utterance = void 0;
      }
      if (this.lastBlobUrl) {
        URL.revokeObjectURL(this.lastBlobUrl);
        this.lastBlobUrl = void 0;
      }
    }
    async playFromSource(source, card, settings, requestId) {
      if (source.type === "text-to-speech" || source.type === "text-to-speech-reading") {
        if (requestId !== this.playRequestId) return true;
        await this.playTextToSpeech(source.type === "text-to-speech-reading" ? card.reading : card.spelling, source.voice);
        return true;
      }
      const candidates = pickCandidates(await getAudioCandidates(source, card, settings.audioTimeoutMs), settings.audioSelectionMode);
      for (const candidate of candidates) {
        try {
          const audioUrl = settings.audioViaBlob || isJapanesePod101Url(candidate.sourceUrl) ? await this.fetchAudioAsBlobUrl(candidate.url, candidate.sourceUrl, settings.audioTimeoutMs, settings.audioSelectionMode) : await this.resolveAudioUrl(candidate.url, candidate.sourceUrl, settings.audioTimeoutMs, settings.audioSelectionMode);
          if (requestId !== this.playRequestId) return true;
          const audio = new Audio(audioUrl);
          audio.preload = "auto";
          this.current = audio;
          await audio.play();
          if (requestId !== this.playRequestId) audio.pause();
          return true;
        } catch {
        }
      }
      return false;
    }
    async fetchAudioAsBlobUrl(url, sourceUrl, timeoutMs, mode) {
      const response = await requestUrl(url, "blob", timeoutMs);
      if (response instanceof Blob && response.type.includes("json")) {
        const json = JSON.parse(await response.text());
        const nestedUrl = findAudioUrl(json, sourceUrl, mode);
        if (!nestedUrl) throw new Error("Audio JSON did not include a playable URL.");
        return this.fetchAudioAsBlobUrl(nestedUrl, sourceUrl, timeoutMs, mode);
      }
      if (!(response instanceof Blob)) throw new Error("Audio source did not return audio.");
      if (isJapanesePod101Url(sourceUrl) && await isUnavailableJapanesePod101Audio(response)) {
        throw new Error("JapanesePod101 has no audio for this term.");
      }
      this.lastBlobUrl = URL.createObjectURL(response);
      return this.lastBlobUrl;
    }
    async resolveAudioUrl(url, sourceUrl, timeoutMs, mode) {
      const response = await requestUrl(url, "text", timeoutMs);
      if (typeof response !== "string") return url;
      try {
        return findAudioUrl(JSON.parse(response), sourceUrl, mode) ?? url;
      } catch {
        return url;
      }
    }
    playTextToSpeech(text, voiceName) {
      if (!("speechSynthesis" in window)) throw new Error("Text-to-speech is not available in this browser.");
      return new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "ja-JP";
        utterance.voice = speechSynthesis.getVoices().find(
          (voice) => voice.name === voiceName || voice.lang.toLowerCase().startsWith("ja")
        ) ?? null;
        utterance.onend = () => resolve();
        utterance.onerror = () => reject(new Error("Text-to-speech failed."));
        this.utterance = utterance;
        speechSynthesis.speak(utterance);
      });
    }
  }
  function formatAudioUrl(template, card) {
    const replacements = {
      term: card.spelling,
      reading: card.reading,
      language: "ja"
    };
    return template.replace(
      /\{(term|reading|language)\}/g,
      (_, key) => encodeURIComponent(replacements[key] ?? "")
    );
  }
  function findAudioUrl(value, sourceUrl, mode = "first") {
    const urls = findAudioUrls(value, sourceUrl);
    if (!urls.length) return null;
    return mode === "random" ? urls[Math.floor(Math.random() * urls.length)] : urls[0];
  }
  function findAudioUrls(value, sourceUrl) {
    if (!value) return [];
    if (typeof value === "string") {
      if (value.startsWith("data:audio/")) return [value];
      if (/^https?:\/\//.test(value)) return [normalizeAudioUrl(value, sourceUrl)];
      return [];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => findAudioUrls(item, sourceUrl));
    }
    if (typeof value === "object") {
      const record = value;
      const direct = ["url", "audio", "audioUrl", "src", "source"].flatMap((key) => findAudioUrls(record[key], sourceUrl));
      if (direct.length) return direct;
      return Object.values(record).flatMap((nested) => findAudioUrls(nested, sourceUrl));
    }
    return [];
  }
  async function isUnavailableJapanesePod101Audio(blob) {
    if (blob.size !== JAPANESE_POD_101_UNAVAILABLE_SIZE) return false;
    try {
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      return hash === JAPANESE_POD_101_UNAVAILABLE_SHA256;
    } catch {
      return true;
    }
  }
  function getOrderedAudioSources(settings) {
    const sources = settings.audioSources.filter((source) => source.enabled);
    if (!settings.audioEnableDefaultSources) return sources;
    const configuredTypes = new Set(settings.audioSources.map((source) => source.type));
    return [
      ...sources,
      ...REQUIRED_JA_AUDIO_SOURCES.filter((type) => !configuredTypes.has(type)).map((type) => ({ type, url: "", voice: "", enabled: true }))
    ];
  }
  async function getAudioCandidates(source, card, timeoutMs) {
    switch (source.type) {
      case "custom":
        if (!source.url.trim()) return [];
        return [{ url: formatAudioUrl(source.url, card), sourceUrl: formatAudioUrl(source.url, card) }];
      case "custom-json": {
        if (!source.url.trim()) return [];
        const sourceUrl = formatAudioUrl(source.url, card);
        const response = await requestUrl(sourceUrl, "text", timeoutMs);
        const urls = typeof response === "string" ? findAudioUrls(JSON.parse(response), sourceUrl) : [];
        return urls.map((url) => ({ url, sourceUrl }));
      }
      case "jpod101":
      case "language-pod-101":
        return [{ url: getJapanesePod101Url(card), sourceUrl: getJapanesePod101Url(card) }];
      case "jisho":
        return (await getJishoAudioUrls(card, timeoutMs)).map((url) => ({ url, sourceUrl: url }));
      case "lingua-libre":
        return (await getCommonsAudioUrls(card.spelling, "lingua-libre", timeoutMs)).map((url) => ({ url, sourceUrl: url }));
      case "wiktionary":
        return (await getCommonsAudioUrls(card.spelling, "wiktionary", timeoutMs)).map((url) => ({ url, sourceUrl: url }));
      default:
        return [];
    }
  }
  function pickCandidates(candidates, mode) {
    if (mode !== "random" || candidates.length < 2) return candidates;
    return [...candidates].sort(() => Math.random() - 0.5);
  }
  function getJapanesePod101Url(card) {
    const params = new URLSearchParams();
    if (card.spelling !== card.reading) params.set("kanji", card.spelling);
    params.set("kana", card.reading);
    return `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?${params.toString()}`;
  }
  function isJapanesePod101Url(value) {
    try {
      const url = new URL(value);
      return url.hostname === "assets.languagepod101.com" && url.pathname.endsWith("/audiomp3.php");
    } catch {
      return false;
    }
  }
  async function getJishoAudioUrls(card, timeoutMs) {
    var _a;
    const url = `https://jisho.org/search/${encodeURIComponent(card.spelling)}`;
    const response = await requestUrl(url, "text", timeoutMs);
    if (typeof response !== "string") return [];
    const doc = new DOMParser().parseFromString(response, "text/html");
    const audio = doc.getElementById(`audio_${card.spelling}:${card.reading}`) ?? doc.querySelector("audio");
    const source = (_a = audio == null ? void 0 : audio.querySelector("source")) == null ? void 0 : _a.getAttribute("src");
    return source ? [new URL(source, url).href] : [];
  }
  async function getCommonsAudioUrls(term, source, timeoutMs) {
    var _a, _b, _c, _d;
    const search = source === "lingua-libre" ? `intitle:/-(${escapeRegExp$1(term)}).wav/i incategory:"Lingua_Libre_pronunciation-jpn"` : `intitle:/ja(-[a-zA-Z]{2})?-${escapeRegExp$1(term)}[0123456789]*.ogg/i`;
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&origin=*&srsearch=${encodeURIComponent(search)}`;
    const response = await requestUrl(apiUrl, "text", timeoutMs);
    if (typeof response !== "string") return [];
    const pages = ((_a = JSON.parse(response).query) == null ? void 0 : _a.search) ?? [];
    const urls = [];
    for (const page of pages.slice(0, 6)) {
      if (!page.title) continue;
      const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&origin=*&titles=${encodeURIComponent(page.title)}`;
      const info = await requestUrl(infoUrl, "text", timeoutMs).catch(() => null);
      if (typeof info !== "string") continue;
      const filePages = ((_b = JSON.parse(info).query) == null ? void 0 : _b.pages) ?? {};
      for (const filePage of Object.values(filePages)) {
        const fileUrl = (_d = (_c = filePage.imageinfo) == null ? void 0 : _c[0]) == null ? void 0 : _d.url;
        if (fileUrl) urls.push(fileUrl);
      }
    }
    return urls;
  }
  function requestUrl(responseUrl, responseType, timeoutMs) {
    const url = getProxyUrl(responseUrl);
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType,
          timeout: timeoutMs,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response.response ?? response.responseText ?? "");
            } else {
              reject(new Error(`Audio request failed (${response.status}).`));
            }
          },
          onerror: reject,
          ontimeout: () => reject(new Error("Audio request timed out."))
        });
      });
    }
    return fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).then(async (response) => {
      if (!response.ok) throw new Error(`Audio request failed (${response.status}).`);
      return responseType === "blob" ? await response.blob() : await response.text();
    });
  }
  function normalizeAudioUrl(value, sourceUrl) {
    try {
      const nested = new URL(value);
      if (!sourceUrl) return nested.href.replace(/\\/g, "/");
      const source = new URL(sourceUrl);
      const nestedIsLoopback = ["localhost", "127.0.0.1", "::1"].includes(nested.hostname);
      const sourceIsLoopback = ["localhost", "127.0.0.1", "::1"].includes(source.hostname);
      if (nestedIsLoopback && !sourceIsLoopback && nested.port === source.port) {
        nested.protocol = source.protocol;
        nested.hostname = source.hostname;
      }
      return nested.href.replace(/\\/g, "/");
    } catch {
      return value.replace(/\\/g, "/");
    }
  }
  function getProxyUrl(url) {
    if (typeof GM_xmlhttpRequest === "function") return url;
    if (!["localhost", "127.0.0.1"].includes(location.hostname)) return url;
    if (!/^https?:\/\//.test(url)) return url;
    return `/__jpdb-reader-audio-proxy?url=${encodeURIComponent(url)}`;
  }
  function escapeRegExp$1(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
  let trustedHtmlPolicy;
  const SKIP_SELECTOR = [
    "script",
    "style",
    "noscript",
    "form",
    "label",
    "fieldset",
    "legend",
    "nav",
    "header",
    "footer",
    "textarea",
    "input",
    "select",
    "button",
    "option",
    "summary",
    "ruby",
    "rt",
    "rp",
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[aria-hidden="true"]',
    "[data-jpdb-reader-root]",
    ".jpdb-reader-word"
  ].join(",");
  const UI_CLASS_RE = /(^|[-_\s])(btn|button|badge|chip|tag|label|required|pill|tab|nav|menu)([-_\s]|$)/i;
  const DISPLAY_HEADING_RE = /^H[1-6]$/;
  const PROSE_TAGS = /* @__PURE__ */ new Set(["P", "LI", "DD", "DT", "TD", "TH", "BLOCKQUOTE", "FIGCAPTION"]);
  function setInnerHtml(element2, html) {
    element2.innerHTML = trustedHtml(html);
  }
  function getSelectionText() {
    const selection = window.getSelection();
    return (selection == null ? void 0 : selection.toString().replace(/\s+/g, " ").trim()) ?? "";
  }
  function getSelectionSentence() {
    var _a, _b;
    const selection = window.getSelection();
    if (!(selection == null ? void 0 : selection.rangeCount)) return getSelectionText();
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const host = (_a = container.nodeType === Node.TEXT_NODE ? container.parentElement : container) == null ? void 0 : _a.closest("p, li, blockquote, td, th, div, article, section");
    const fullText = (_b = host == null ? void 0 : host.textContent) == null ? void 0 : _b.replace(/\s+/g, " ").trim();
    const selected = getSelectionText();
    if (!fullText || !selected) return selected;
    const index = fullText.indexOf(selected);
    if (index === -1) return selected;
    const before = fullText.slice(0, index);
    const after = fullText.slice(index + selected.length);
    const start = Math.max(
      before.lastIndexOf("。"),
      before.lastIndexOf("！"),
      before.lastIndexOf("？"),
      before.lastIndexOf("\n")
    ) + 1;
    const endCandidates = ["。", "！", "？", "\n"].map((mark) => after.indexOf(mark)).filter((pos) => pos >= 0);
    const end = endCandidates.length ? index + selected.length + Math.min(...endCandidates) + 1 : fullText.length;
    return fullText.slice(start, end).trim() || selected;
  }
  function collectVisibleTextTargets(limit = 40) {
    return collectTextTargetsIn(document.body, limit, true);
  }
  function collectTextTargetsIn(root, limit = 40, visibleOnly = true) {
    var _a;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node2) {
        var _a2;
        const text = ((_a2 = node2.textContent) == null ? void 0 : _a2.trim()) ?? "";
        if (text.length < 2 || !HAS_JAPANESE.test(text)) return NodeFilter.FILTER_REJECT;
        const parent = node2.parentElement;
        if (!parent || parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (visibleOnly && !isVisible(parent)) return NodeFilter.FILTER_REJECT;
        if (isFragileUiText(parent, text)) return NodeFilter.FILTER_REJECT;
        if (parent.childNodes.length > 6) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const targets = [];
    let node;
    while ((node = walker.nextNode()) && targets.length < limit) {
      const text = ((_a = node.textContent) == null ? void 0 : _a.trim()) ?? "";
      const parent = node.parentElement;
      if (parent) targets.push({ node, text, parent });
    }
    return targets;
  }
  function applyTokensToTextNode(target, tokens, settings) {
    if (!tokens.length || !target.node.parentElement) return;
    const text = target.text;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    if (!safeTokens.length) return;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const token of safeTokens) {
      if (token.start > offset) {
        fragment.append(document.createTextNode(text.slice(offset, token.start)));
      }
      fragment.append(renderToken(text.slice(token.start, token.end), token, settings));
      offset = token.end;
    }
    if (offset < text.length) {
      fragment.append(document.createTextNode(text.slice(offset)));
    }
    target.node.replaceWith(fragment);
  }
  function renderTokensToHtml(text, tokens, settings) {
    if (!tokens.length) return escapeHtml$1(text);
    let html = "";
    let offset = 0;
    const safeTokens = nonOverlappingTokens(tokens, text.length);
    for (const token of safeTokens) {
      if (token.start > offset) html += escapeHtml$1(text.slice(offset, token.start));
      html += renderTokenHtml(text.slice(token.start, token.end), token, settings);
      offset = token.end;
    }
    if (offset < text.length) html += escapeHtml$1(text.slice(offset));
    return html;
  }
  function nonOverlappingTokens(tokens, textLength) {
    const safe = [];
    let offset = 0;
    for (const token of tokens) {
      if (token.start < offset || token.start < 0 || token.end <= token.start || token.end > textLength) continue;
      safe.push(token);
      offset = token.end;
    }
    return safe;
  }
  function renderToken(surface, token, settings) {
    const span = document.createElement("span");
    const state = token.card.cardState[0] ?? "not-in-deck";
    span.className = `jpdb-reader-word jpdb-${state}`;
    span.dataset.vid = String(token.card.vid);
    span.dataset.sid = String(token.card.sid);
    span.dataset.sentence = token.sentence ?? "";
    span.tabIndex = 0;
    if (settings.showFurigana && token.rubies.length) {
      setInnerHtml(span, renderRuby(surface, token));
    } else {
      span.textContent = surface;
    }
    return span;
  }
  function renderTokenHtml(surface, token, settings) {
    const state = token.card.cardState[0] ?? "not-in-deck";
    const content = settings.showFurigana && token.rubies.length ? renderRuby(surface, token) : escapeHtml$1(surface);
    return `<span class="jpdb-reader-word jpdb-${state}" data-vid="${token.card.vid}" data-sid="${token.card.sid}" data-sentence="${escapeHtml$1(token.sentence ?? "")}" tabindex="0">${content}</span>`;
  }
  function renderRuby(surface, token) {
    let html = "";
    let localOffset = 0;
    for (const ruby of token.rubies) {
      const start = ruby.start - token.start;
      const end = ruby.end - token.start;
      html += escapeHtml$1(surface.slice(localOffset, start));
      html += `<ruby>${escapeHtml$1(surface.slice(start, end))}<rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml$1(ruby.text)}</rt><rp>)</rp></ruby>`;
      localOffset = end;
    }
    html += escapeHtml$1(surface.slice(localOffset));
    return html;
  }
  function escapeHtml$1(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trustedHtml(value) {
    var _a, _b;
    const factory = globalThis.trustedTypes;
    if (!factory) return value;
    if (trustedHtmlPolicy === void 0) {
      trustedHtmlPolicy = ((_a = factory.getPolicy) == null ? void 0 : _a.call(factory, "yomu-reader")) ?? null;
      if (!trustedHtmlPolicy) {
        try {
          trustedHtmlPolicy = ((_b = factory.createPolicy) == null ? void 0 : _b.call(factory, "yomu-reader", { createHTML: (html) => html })) ?? null;
        } catch {
          trustedHtmlPolicy = null;
        }
      }
    }
    return trustedHtmlPolicy ? trustedHtmlPolicy.createHTML(value) : value;
  }
  function isVisible(element2) {
    const rect = element2.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(element2);
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
  }
  function isFragileUiText(element2, text) {
    if (UI_CLASS_RE.test(element2.className || "")) return true;
    if (text.length <= 4 && ancestorClassLooksLikeUi(element2)) return true;
    const style = getComputedStyle(element2);
    const display = style.display;
    const rect = element2.getBoundingClientRect();
    const compactLength = Array.from(text.replace(/\s+/g, "")).length;
    const fontSize = cssPixels(style.fontSize);
    const lineHeight = cssPixels(style.lineHeight) || fontSize * 1.25;
    const centered = style.textAlign === "center";
    const heading = DISPLAY_HEADING_RE.test(element2.tagName);
    const prose = isLikelyProseElement(element2);
    if (heading && compactLength <= 40 && (centered || fontSize >= 18 || lineHeight <= fontSize * 1.35)) return true;
    if (!prose && centered && compactLength <= 30 && (fontSize >= 17 || Number(style.fontWeight) >= 600)) return true;
    if (rect.width > 0 && text.length <= 12 && rect.width < 180 && (style.textAlign === "center" || style.whiteSpace !== "normal")) return true;
    const hasUiBox = style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.borderTopStyle !== "none" || Number(style.borderTopWidth.replace("px", "")) > 0 || Number(style.borderBottomWidth.replace("px", "")) > 0 || Number.parseFloat(style.borderRadius) > 0;
    const inlineControlShape = display === "inline-flex" || display === "inline-grid" || display === "inline-block" || display === "flex";
    return text.length <= 6 && hasUiBox && inlineControlShape && rect.width < 180;
  }
  function isLikelyProseElement(element2) {
    if (PROSE_TAGS.has(element2.tagName)) return true;
    return /(^|[-_\s])(body|content|copy|description|lead|paragraph|prose|text|txt)([-_\s]|$)/i.test(element2.className || "");
  }
  function cssPixels(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function ancestorClassLooksLikeUi(element2) {
    let current = element2;
    while (current && current !== document.body) {
      if (UI_CLASS_RE.test(current.className || "")) return true;
      current = current.parentElement;
    }
    return false;
  }
  const POS_LABELS = {
    adj: "adjective",
    adv: "adverb",
    aux: "auxiliary",
    conj: "conjunction",
    cop: "copula",
    ctr: "counter",
    exp: "expression",
    int: "interjection",
    n: "noun",
    num: "number",
    pn: "pronoun",
    pref: "prefix",
    prt: "particle",
    suf: "suffix",
    unc: "unclassified",
    vi: "intransitive verb",
    vt: "transitive verb",
    v1: "ichidan verb",
    v5: "godan verb",
    v5aru: "aru ending",
    v5b: "bu ending",
    v5g: "gu ending",
    v5k: "ku ending",
    v5m: "mu ending",
    v5n: "nu ending",
    v5r: "ru ending",
    v5s: "su ending",
    v5t: "tsu ending",
    v5u: "u ending",
    vk: "kuru verb",
    vs: "suru verb",
    vz: "zuru verb"
  };
  function formatPartOfSpeech(tags = []) {
    const labels = tags.map((tag) => POS_LABELS[tag.toLowerCase()] ?? tag).filter(Boolean);
    return [...new Set(labels)].join(", ");
  }
  function formatPartOfSpeechDetails(tags = []) {
    return tags.length ? tags.join(", ").toUpperCase() : "";
  }
  var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
  function getDefaultExportFromCjs(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
  }
  function commonjsRequire(path) {
    throw new Error('Could not dynamically require "' + path + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
  }
  var jszip_min = { exports: {} };
  /*!

  JSZip v3.10.1 - A JavaScript class for generating and reading zip files
  <http://stuartk.com/jszip>

  (c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
  Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

  JSZip uses the library pako released under the MIT license :
  https://github.com/nodeca/pako/blob/main/LICENSE
  */
  (function(module, exports) {
    !function(e) {
      module.exports = e();
    }(function() {
      return function s(a, o, h) {
        function u(r, e2) {
          if (!o[r]) {
            if (!a[r]) {
              var t = "function" == typeof commonjsRequire && commonjsRequire;
              if (!e2 && t) return t(r, true);
              if (l) return l(r, true);
              var n = new Error("Cannot find module '" + r + "'");
              throw n.code = "MODULE_NOT_FOUND", n;
            }
            var i = o[r] = { exports: {} };
            a[r][0].call(i.exports, function(e3) {
              var t2 = a[r][1][e3];
              return u(t2 || e3);
            }, i, i.exports, s, a, o, h);
          }
          return o[r].exports;
        }
        for (var l = "function" == typeof commonjsRequire && commonjsRequire, e = 0; e < h.length; e++) u(h[e]);
        return u;
      }({ 1: [function(e, t, r) {
        var d = e("./utils"), c = e("./support"), p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        r.encode = function(e2) {
          for (var t2, r2, n, i, s, a, o, h = [], u = 0, l = e2.length, f = l, c2 = "string" !== d.getTypeOf(e2); u < e2.length; ) f = l - u, n = c2 ? (t2 = e2[u++], r2 = u < l ? e2[u++] : 0, u < l ? e2[u++] : 0) : (t2 = e2.charCodeAt(u++), r2 = u < l ? e2.charCodeAt(u++) : 0, u < l ? e2.charCodeAt(u++) : 0), i = t2 >> 2, s = (3 & t2) << 4 | r2 >> 4, a = 1 < f ? (15 & r2) << 2 | n >> 6 : 64, o = 2 < f ? 63 & n : 64, h.push(p.charAt(i) + p.charAt(s) + p.charAt(a) + p.charAt(o));
          return h.join("");
        }, r.decode = function(e2) {
          var t2, r2, n, i, s, a, o = 0, h = 0, u = "data:";
          if (e2.substr(0, u.length) === u) throw new Error("Invalid base64 input, it looks like a data url.");
          var l, f = 3 * (e2 = e2.replace(/[^A-Za-z0-9+/=]/g, "")).length / 4;
          if (e2.charAt(e2.length - 1) === p.charAt(64) && f--, e2.charAt(e2.length - 2) === p.charAt(64) && f--, f % 1 != 0) throw new Error("Invalid base64 input, bad content length.");
          for (l = c.uint8array ? new Uint8Array(0 | f) : new Array(0 | f); o < e2.length; ) t2 = p.indexOf(e2.charAt(o++)) << 2 | (i = p.indexOf(e2.charAt(o++))) >> 4, r2 = (15 & i) << 4 | (s = p.indexOf(e2.charAt(o++))) >> 2, n = (3 & s) << 6 | (a = p.indexOf(e2.charAt(o++))), l[h++] = t2, 64 !== s && (l[h++] = r2), 64 !== a && (l[h++] = n);
          return l;
        };
      }, { "./support": 30, "./utils": 32 }], 2: [function(e, t, r) {
        var n = e("./external"), i = e("./stream/DataWorker"), s = e("./stream/Crc32Probe"), a = e("./stream/DataLengthProbe");
        function o(e2, t2, r2, n2, i2) {
          this.compressedSize = e2, this.uncompressedSize = t2, this.crc32 = r2, this.compression = n2, this.compressedContent = i2;
        }
        o.prototype = { getContentWorker: function() {
          var e2 = new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")), t2 = this;
          return e2.on("end", function() {
            if (this.streamInfo.data_length !== t2.uncompressedSize) throw new Error("Bug : uncompressed data size mismatch");
          }), e2;
        }, getCompressedWorker: function() {
          return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
        } }, o.createWorkerFrom = function(e2, t2, r2) {
          return e2.pipe(new s()).pipe(new a("uncompressedSize")).pipe(t2.compressWorker(r2)).pipe(new a("compressedSize")).withStreamInfo("compression", t2);
        }, t.exports = o;
      }, { "./external": 6, "./stream/Crc32Probe": 25, "./stream/DataLengthProbe": 26, "./stream/DataWorker": 27 }], 3: [function(e, t, r) {
        var n = e("./stream/GenericWorker");
        r.STORE = { magic: "\0\0", compressWorker: function() {
          return new n("STORE compression");
        }, uncompressWorker: function() {
          return new n("STORE decompression");
        } }, r.DEFLATE = e("./flate");
      }, { "./flate": 7, "./stream/GenericWorker": 28 }], 4: [function(e, t, r) {
        var n = e("./utils");
        var o = function() {
          for (var e2, t2 = [], r2 = 0; r2 < 256; r2++) {
            e2 = r2;
            for (var n2 = 0; n2 < 8; n2++) e2 = 1 & e2 ? 3988292384 ^ e2 >>> 1 : e2 >>> 1;
            t2[r2] = e2;
          }
          return t2;
        }();
        t.exports = function(e2, t2) {
          return void 0 !== e2 && e2.length ? "string" !== n.getTypeOf(e2) ? function(e3, t3, r2, n2) {
            var i = o, s = n2 + r2;
            e3 ^= -1;
            for (var a = n2; a < s; a++) e3 = e3 >>> 8 ^ i[255 & (e3 ^ t3[a])];
            return -1 ^ e3;
          }(0 | t2, e2, e2.length, 0) : function(e3, t3, r2, n2) {
            var i = o, s = n2 + r2;
            e3 ^= -1;
            for (var a = n2; a < s; a++) e3 = e3 >>> 8 ^ i[255 & (e3 ^ t3.charCodeAt(a))];
            return -1 ^ e3;
          }(0 | t2, e2, e2.length, 0) : 0;
        };
      }, { "./utils": 32 }], 5: [function(e, t, r) {
        r.base64 = false, r.binary = false, r.dir = false, r.createFolders = true, r.date = null, r.compression = null, r.compressionOptions = null, r.comment = null, r.unixPermissions = null, r.dosPermissions = null;
      }, {}], 6: [function(e, t, r) {
        var n = null;
        n = "undefined" != typeof Promise ? Promise : e("lie"), t.exports = { Promise: n };
      }, { lie: 37 }], 7: [function(e, t, r) {
        var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Uint32Array, i = e("pako"), s = e("./utils"), a = e("./stream/GenericWorker"), o = n ? "uint8array" : "array";
        function h(e2, t2) {
          a.call(this, "FlateWorker/" + e2), this._pako = null, this._pakoAction = e2, this._pakoOptions = t2, this.meta = {};
        }
        r.magic = "\b\0", s.inherits(h, a), h.prototype.processChunk = function(e2) {
          this.meta = e2.meta, null === this._pako && this._createPako(), this._pako.push(s.transformTo(o, e2.data), false);
        }, h.prototype.flush = function() {
          a.prototype.flush.call(this), null === this._pako && this._createPako(), this._pako.push([], true);
        }, h.prototype.cleanUp = function() {
          a.prototype.cleanUp.call(this), this._pako = null;
        }, h.prototype._createPako = function() {
          this._pako = new i[this._pakoAction]({ raw: true, level: this._pakoOptions.level || -1 });
          var t2 = this;
          this._pako.onData = function(e2) {
            t2.push({ data: e2, meta: t2.meta });
          };
        }, r.compressWorker = function(e2) {
          return new h("Deflate", e2);
        }, r.uncompressWorker = function() {
          return new h("Inflate", {});
        };
      }, { "./stream/GenericWorker": 28, "./utils": 32, pako: 38 }], 8: [function(e, t, r) {
        function A(e2, t2) {
          var r2, n2 = "";
          for (r2 = 0; r2 < t2; r2++) n2 += String.fromCharCode(255 & e2), e2 >>>= 8;
          return n2;
        }
        function n(e2, t2, r2, n2, i2, s2) {
          var a, o, h = e2.file, u = e2.compression, l = s2 !== O.utf8encode, f = I.transformTo("string", s2(h.name)), c = I.transformTo("string", O.utf8encode(h.name)), d = h.comment, p = I.transformTo("string", s2(d)), m = I.transformTo("string", O.utf8encode(d)), _ = c.length !== h.name.length, g = m.length !== d.length, b = "", v = "", y = "", w = h.dir, k = h.date, x = { crc32: 0, compressedSize: 0, uncompressedSize: 0 };
          t2 && !r2 || (x.crc32 = e2.crc32, x.compressedSize = e2.compressedSize, x.uncompressedSize = e2.uncompressedSize);
          var S = 0;
          t2 && (S |= 8), l || !_ && !g || (S |= 2048);
          var z = 0, C = 0;
          w && (z |= 16), "UNIX" === i2 ? (C = 798, z |= function(e3, t3) {
            var r3 = e3;
            return e3 || (r3 = t3 ? 16893 : 33204), (65535 & r3) << 16;
          }(h.unixPermissions, w)) : (C = 20, z |= function(e3) {
            return 63 & (e3 || 0);
          }(h.dosPermissions)), a = k.getUTCHours(), a <<= 6, a |= k.getUTCMinutes(), a <<= 5, a |= k.getUTCSeconds() / 2, o = k.getUTCFullYear() - 1980, o <<= 4, o |= k.getUTCMonth() + 1, o <<= 5, o |= k.getUTCDate(), _ && (v = A(1, 1) + A(B(f), 4) + c, b += "up" + A(v.length, 2) + v), g && (y = A(1, 1) + A(B(p), 4) + m, b += "uc" + A(y.length, 2) + y);
          var E = "";
          return E += "\n\0", E += A(S, 2), E += u.magic, E += A(a, 2), E += A(o, 2), E += A(x.crc32, 4), E += A(x.compressedSize, 4), E += A(x.uncompressedSize, 4), E += A(f.length, 2), E += A(b.length, 2), { fileRecord: R.LOCAL_FILE_HEADER + E + f + b, dirRecord: R.CENTRAL_FILE_HEADER + A(C, 2) + E + A(p.length, 2) + "\0\0\0\0" + A(z, 4) + A(n2, 4) + f + b + p };
        }
        var I = e("../utils"), i = e("../stream/GenericWorker"), O = e("../utf8"), B = e("../crc32"), R = e("../signature");
        function s(e2, t2, r2, n2) {
          i.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = t2, this.zipPlatform = r2, this.encodeFileName = n2, this.streamFiles = e2, this.accumulate = false, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
        }
        I.inherits(s, i), s.prototype.push = function(e2) {
          var t2 = e2.meta.percent || 0, r2 = this.entriesCount, n2 = this._sources.length;
          this.accumulate ? this.contentBuffer.push(e2) : (this.bytesWritten += e2.data.length, i.prototype.push.call(this, { data: e2.data, meta: { currentFile: this.currentFile, percent: r2 ? (t2 + 100 * (r2 - n2 - 1)) / r2 : 100 } }));
        }, s.prototype.openedSource = function(e2) {
          this.currentSourceOffset = this.bytesWritten, this.currentFile = e2.file.name;
          var t2 = this.streamFiles && !e2.file.dir;
          if (t2) {
            var r2 = n(e2, t2, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
            this.push({ data: r2.fileRecord, meta: { percent: 0 } });
          } else this.accumulate = true;
        }, s.prototype.closedSource = function(e2) {
          this.accumulate = false;
          var t2 = this.streamFiles && !e2.file.dir, r2 = n(e2, t2, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
          if (this.dirRecords.push(r2.dirRecord), t2) this.push({ data: function(e3) {
            return R.DATA_DESCRIPTOR + A(e3.crc32, 4) + A(e3.compressedSize, 4) + A(e3.uncompressedSize, 4);
          }(e2), meta: { percent: 100 } });
          else for (this.push({ data: r2.fileRecord, meta: { percent: 0 } }); this.contentBuffer.length; ) this.push(this.contentBuffer.shift());
          this.currentFile = null;
        }, s.prototype.flush = function() {
          for (var e2 = this.bytesWritten, t2 = 0; t2 < this.dirRecords.length; t2++) this.push({ data: this.dirRecords[t2], meta: { percent: 100 } });
          var r2 = this.bytesWritten - e2, n2 = function(e3, t3, r3, n3, i2) {
            var s2 = I.transformTo("string", i2(n3));
            return R.CENTRAL_DIRECTORY_END + "\0\0\0\0" + A(e3, 2) + A(e3, 2) + A(t3, 4) + A(r3, 4) + A(s2.length, 2) + s2;
          }(this.dirRecords.length, r2, e2, this.zipComment, this.encodeFileName);
          this.push({ data: n2, meta: { percent: 100 } });
        }, s.prototype.prepareNextSource = function() {
          this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
        }, s.prototype.registerPrevious = function(e2) {
          this._sources.push(e2);
          var t2 = this;
          return e2.on("data", function(e3) {
            t2.processChunk(e3);
          }), e2.on("end", function() {
            t2.closedSource(t2.previous.streamInfo), t2._sources.length ? t2.prepareNextSource() : t2.end();
          }), e2.on("error", function(e3) {
            t2.error(e3);
          }), this;
        }, s.prototype.resume = function() {
          return !!i.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), true) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), true));
        }, s.prototype.error = function(e2) {
          var t2 = this._sources;
          if (!i.prototype.error.call(this, e2)) return false;
          for (var r2 = 0; r2 < t2.length; r2++) try {
            t2[r2].error(e2);
          } catch (e3) {
          }
          return true;
        }, s.prototype.lock = function() {
          i.prototype.lock.call(this);
          for (var e2 = this._sources, t2 = 0; t2 < e2.length; t2++) e2[t2].lock();
        }, t.exports = s;
      }, { "../crc32": 4, "../signature": 23, "../stream/GenericWorker": 28, "../utf8": 31, "../utils": 32 }], 9: [function(e, t, r) {
        var u = e("../compressions"), n = e("./ZipFileWorker");
        r.generateWorker = function(e2, a, t2) {
          var o = new n(a.streamFiles, t2, a.platform, a.encodeFileName), h = 0;
          try {
            e2.forEach(function(e3, t3) {
              h++;
              var r2 = function(e4, t4) {
                var r3 = e4 || t4, n3 = u[r3];
                if (!n3) throw new Error(r3 + " is not a valid compression method !");
                return n3;
              }(t3.options.compression, a.compression), n2 = t3.options.compressionOptions || a.compressionOptions || {}, i = t3.dir, s = t3.date;
              t3._compressWorker(r2, n2).withStreamInfo("file", { name: e3, dir: i, date: s, comment: t3.comment || "", unixPermissions: t3.unixPermissions, dosPermissions: t3.dosPermissions }).pipe(o);
            }), o.entriesCount = h;
          } catch (e3) {
            o.error(e3);
          }
          return o;
        };
      }, { "../compressions": 3, "./ZipFileWorker": 8 }], 10: [function(e, t, r) {
        function n() {
          if (!(this instanceof n)) return new n();
          if (arguments.length) throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
          this.files = /* @__PURE__ */ Object.create(null), this.comment = null, this.root = "", this.clone = function() {
            var e2 = new n();
            for (var t2 in this) "function" != typeof this[t2] && (e2[t2] = this[t2]);
            return e2;
          };
        }
        (n.prototype = e("./object")).loadAsync = e("./load"), n.support = e("./support"), n.defaults = e("./defaults"), n.version = "3.10.1", n.loadAsync = function(e2, t2) {
          return new n().loadAsync(e2, t2);
        }, n.external = e("./external"), t.exports = n;
      }, { "./defaults": 5, "./external": 6, "./load": 11, "./object": 15, "./support": 30 }], 11: [function(e, t, r) {
        var u = e("./utils"), i = e("./external"), n = e("./utf8"), s = e("./zipEntries"), a = e("./stream/Crc32Probe"), l = e("./nodejsUtils");
        function f(n2) {
          return new i.Promise(function(e2, t2) {
            var r2 = n2.decompressed.getContentWorker().pipe(new a());
            r2.on("error", function(e3) {
              t2(e3);
            }).on("end", function() {
              r2.streamInfo.crc32 !== n2.decompressed.crc32 ? t2(new Error("Corrupted zip : CRC32 mismatch")) : e2();
            }).resume();
          });
        }
        t.exports = function(e2, o) {
          var h = this;
          return o = u.extend(o || {}, { base64: false, checkCRC32: false, optimizedBinaryString: false, createFolders: false, decodeFileName: n.utf8decode }), l.isNode && l.isStream(e2) ? i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")) : u.prepareContent("the loaded zip file", e2, true, o.optimizedBinaryString, o.base64).then(function(e3) {
            var t2 = new s(o);
            return t2.load(e3), t2;
          }).then(function(e3) {
            var t2 = [i.Promise.resolve(e3)], r2 = e3.files;
            if (o.checkCRC32) for (var n2 = 0; n2 < r2.length; n2++) t2.push(f(r2[n2]));
            return i.Promise.all(t2);
          }).then(function(e3) {
            for (var t2 = e3.shift(), r2 = t2.files, n2 = 0; n2 < r2.length; n2++) {
              var i2 = r2[n2], s2 = i2.fileNameStr, a2 = u.resolve(i2.fileNameStr);
              h.file(a2, i2.decompressed, { binary: true, optimizedBinaryString: true, date: i2.date, dir: i2.dir, comment: i2.fileCommentStr.length ? i2.fileCommentStr : null, unixPermissions: i2.unixPermissions, dosPermissions: i2.dosPermissions, createFolders: o.createFolders }), i2.dir || (h.file(a2).unsafeOriginalName = s2);
            }
            return t2.zipComment.length && (h.comment = t2.zipComment), h;
          });
        };
      }, { "./external": 6, "./nodejsUtils": 14, "./stream/Crc32Probe": 25, "./utf8": 31, "./utils": 32, "./zipEntries": 33 }], 12: [function(e, t, r) {
        var n = e("../utils"), i = e("../stream/GenericWorker");
        function s(e2, t2) {
          i.call(this, "Nodejs stream input adapter for " + e2), this._upstreamEnded = false, this._bindStream(t2);
        }
        n.inherits(s, i), s.prototype._bindStream = function(e2) {
          var t2 = this;
          (this._stream = e2).pause(), e2.on("data", function(e3) {
            t2.push({ data: e3, meta: { percent: 0 } });
          }).on("error", function(e3) {
            t2.isPaused ? this.generatedError = e3 : t2.error(e3);
          }).on("end", function() {
            t2.isPaused ? t2._upstreamEnded = true : t2.end();
          });
        }, s.prototype.pause = function() {
          return !!i.prototype.pause.call(this) && (this._stream.pause(), true);
        }, s.prototype.resume = function() {
          return !!i.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), true);
        }, t.exports = s;
      }, { "../stream/GenericWorker": 28, "../utils": 32 }], 13: [function(e, t, r) {
        var i = e("readable-stream").Readable;
        function n(e2, t2, r2) {
          i.call(this, t2), this._helper = e2;
          var n2 = this;
          e2.on("data", function(e3, t3) {
            n2.push(e3) || n2._helper.pause(), r2 && r2(t3);
          }).on("error", function(e3) {
            n2.emit("error", e3);
          }).on("end", function() {
            n2.push(null);
          });
        }
        e("../utils").inherits(n, i), n.prototype._read = function() {
          this._helper.resume();
        }, t.exports = n;
      }, { "../utils": 32, "readable-stream": 16 }], 14: [function(e, t, r) {
        t.exports = { isNode: "undefined" != typeof Buffer, newBufferFrom: function(e2, t2) {
          if (Buffer.from && Buffer.from !== Uint8Array.from) return Buffer.from(e2, t2);
          if ("number" == typeof e2) throw new Error('The "data" argument must not be a number');
          return new Buffer(e2, t2);
        }, allocBuffer: function(e2) {
          if (Buffer.alloc) return Buffer.alloc(e2);
          var t2 = new Buffer(e2);
          return t2.fill(0), t2;
        }, isBuffer: function(e2) {
          return Buffer.isBuffer(e2);
        }, isStream: function(e2) {
          return e2 && "function" == typeof e2.on && "function" == typeof e2.pause && "function" == typeof e2.resume;
        } };
      }, {}], 15: [function(e, t, r) {
        function s(e2, t2, r2) {
          var n2, i2 = u.getTypeOf(t2), s2 = u.extend(r2 || {}, f);
          s2.date = s2.date || /* @__PURE__ */ new Date(), null !== s2.compression && (s2.compression = s2.compression.toUpperCase()), "string" == typeof s2.unixPermissions && (s2.unixPermissions = parseInt(s2.unixPermissions, 8)), s2.unixPermissions && 16384 & s2.unixPermissions && (s2.dir = true), s2.dosPermissions && 16 & s2.dosPermissions && (s2.dir = true), s2.dir && (e2 = g(e2)), s2.createFolders && (n2 = _(e2)) && b.call(this, n2, true);
          var a2 = "string" === i2 && false === s2.binary && false === s2.base64;
          r2 && void 0 !== r2.binary || (s2.binary = !a2), (t2 instanceof c && 0 === t2.uncompressedSize || s2.dir || !t2 || 0 === t2.length) && (s2.base64 = false, s2.binary = true, t2 = "", s2.compression = "STORE", i2 = "string");
          var o2 = null;
          o2 = t2 instanceof c || t2 instanceof l ? t2 : p.isNode && p.isStream(t2) ? new m(e2, t2) : u.prepareContent(e2, t2, s2.binary, s2.optimizedBinaryString, s2.base64);
          var h2 = new d(e2, o2, s2);
          this.files[e2] = h2;
        }
        var i = e("./utf8"), u = e("./utils"), l = e("./stream/GenericWorker"), a = e("./stream/StreamHelper"), f = e("./defaults"), c = e("./compressedObject"), d = e("./zipObject"), o = e("./generate"), p = e("./nodejsUtils"), m = e("./nodejs/NodejsStreamInputAdapter"), _ = function(e2) {
          "/" === e2.slice(-1) && (e2 = e2.substring(0, e2.length - 1));
          var t2 = e2.lastIndexOf("/");
          return 0 < t2 ? e2.substring(0, t2) : "";
        }, g = function(e2) {
          return "/" !== e2.slice(-1) && (e2 += "/"), e2;
        }, b = function(e2, t2) {
          return t2 = void 0 !== t2 ? t2 : f.createFolders, e2 = g(e2), this.files[e2] || s.call(this, e2, null, { dir: true, createFolders: t2 }), this.files[e2];
        };
        function h(e2) {
          return "[object RegExp]" === Object.prototype.toString.call(e2);
        }
        var n = { load: function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, forEach: function(e2) {
          var t2, r2, n2;
          for (t2 in this.files) n2 = this.files[t2], (r2 = t2.slice(this.root.length, t2.length)) && t2.slice(0, this.root.length) === this.root && e2(r2, n2);
        }, filter: function(r2) {
          var n2 = [];
          return this.forEach(function(e2, t2) {
            r2(e2, t2) && n2.push(t2);
          }), n2;
        }, file: function(e2, t2, r2) {
          if (1 !== arguments.length) return e2 = this.root + e2, s.call(this, e2, t2, r2), this;
          if (h(e2)) {
            var n2 = e2;
            return this.filter(function(e3, t3) {
              return !t3.dir && n2.test(e3);
            });
          }
          var i2 = this.files[this.root + e2];
          return i2 && !i2.dir ? i2 : null;
        }, folder: function(r2) {
          if (!r2) return this;
          if (h(r2)) return this.filter(function(e3, t3) {
            return t3.dir && r2.test(e3);
          });
          var e2 = this.root + r2, t2 = b.call(this, e2), n2 = this.clone();
          return n2.root = t2.name, n2;
        }, remove: function(r2) {
          r2 = this.root + r2;
          var e2 = this.files[r2];
          if (e2 || ("/" !== r2.slice(-1) && (r2 += "/"), e2 = this.files[r2]), e2 && !e2.dir) delete this.files[r2];
          else for (var t2 = this.filter(function(e3, t3) {
            return t3.name.slice(0, r2.length) === r2;
          }), n2 = 0; n2 < t2.length; n2++) delete this.files[t2[n2].name];
          return this;
        }, generate: function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, generateInternalStream: function(e2) {
          var t2, r2 = {};
          try {
            if ((r2 = u.extend(e2 || {}, { streamFiles: false, compression: "STORE", compressionOptions: null, type: "", platform: "DOS", comment: null, mimeType: "application/zip", encodeFileName: i.utf8encode })).type = r2.type.toLowerCase(), r2.compression = r2.compression.toUpperCase(), "binarystring" === r2.type && (r2.type = "string"), !r2.type) throw new Error("No output type specified.");
            u.checkSupport(r2.type), "darwin" !== r2.platform && "freebsd" !== r2.platform && "linux" !== r2.platform && "sunos" !== r2.platform || (r2.platform = "UNIX"), "win32" === r2.platform && (r2.platform = "DOS");
            var n2 = r2.comment || this.comment || "";
            t2 = o.generateWorker(this, r2, n2);
          } catch (e3) {
            (t2 = new l("error")).error(e3);
          }
          return new a(t2, r2.type || "string", r2.mimeType);
        }, generateAsync: function(e2, t2) {
          return this.generateInternalStream(e2).accumulate(t2);
        }, generateNodeStream: function(e2, t2) {
          return (e2 = e2 || {}).type || (e2.type = "nodebuffer"), this.generateInternalStream(e2).toNodejsStream(t2);
        } };
        t.exports = n;
      }, { "./compressedObject": 2, "./defaults": 5, "./generate": 9, "./nodejs/NodejsStreamInputAdapter": 12, "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31, "./utils": 32, "./zipObject": 35 }], 16: [function(e, t, r) {
        t.exports = e("stream");
      }, { stream: void 0 }], 17: [function(e, t, r) {
        var n = e("./DataReader");
        function i(e2) {
          n.call(this, e2);
          for (var t2 = 0; t2 < this.data.length; t2++) e2[t2] = 255 & e2[t2];
        }
        e("../utils").inherits(i, n), i.prototype.byteAt = function(e2) {
          return this.data[this.zero + e2];
        }, i.prototype.lastIndexOfSignature = function(e2) {
          for (var t2 = e2.charCodeAt(0), r2 = e2.charCodeAt(1), n2 = e2.charCodeAt(2), i2 = e2.charCodeAt(3), s = this.length - 4; 0 <= s; --s) if (this.data[s] === t2 && this.data[s + 1] === r2 && this.data[s + 2] === n2 && this.data[s + 3] === i2) return s - this.zero;
          return -1;
        }, i.prototype.readAndCheckSignature = function(e2) {
          var t2 = e2.charCodeAt(0), r2 = e2.charCodeAt(1), n2 = e2.charCodeAt(2), i2 = e2.charCodeAt(3), s = this.readData(4);
          return t2 === s[0] && r2 === s[1] && n2 === s[2] && i2 === s[3];
        }, i.prototype.readData = function(e2) {
          if (this.checkOffset(e2), 0 === e2) return [];
          var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
          return this.index += e2, t2;
        }, t.exports = i;
      }, { "../utils": 32, "./DataReader": 18 }], 18: [function(e, t, r) {
        var n = e("../utils");
        function i(e2) {
          this.data = e2, this.length = e2.length, this.index = 0, this.zero = 0;
        }
        i.prototype = { checkOffset: function(e2) {
          this.checkIndex(this.index + e2);
        }, checkIndex: function(e2) {
          if (this.length < this.zero + e2 || e2 < 0) throw new Error("End of data reached (data length = " + this.length + ", asked index = " + e2 + "). Corrupted zip ?");
        }, setIndex: function(e2) {
          this.checkIndex(e2), this.index = e2;
        }, skip: function(e2) {
          this.setIndex(this.index + e2);
        }, byteAt: function() {
        }, readInt: function(e2) {
          var t2, r2 = 0;
          for (this.checkOffset(e2), t2 = this.index + e2 - 1; t2 >= this.index; t2--) r2 = (r2 << 8) + this.byteAt(t2);
          return this.index += e2, r2;
        }, readString: function(e2) {
          return n.transformTo("string", this.readData(e2));
        }, readData: function() {
        }, lastIndexOfSignature: function() {
        }, readAndCheckSignature: function() {
        }, readDate: function() {
          var e2 = this.readInt(4);
          return new Date(Date.UTC(1980 + (e2 >> 25 & 127), (e2 >> 21 & 15) - 1, e2 >> 16 & 31, e2 >> 11 & 31, e2 >> 5 & 63, (31 & e2) << 1));
        } }, t.exports = i;
      }, { "../utils": 32 }], 19: [function(e, t, r) {
        var n = e("./Uint8ArrayReader");
        function i(e2) {
          n.call(this, e2);
        }
        e("../utils").inherits(i, n), i.prototype.readData = function(e2) {
          this.checkOffset(e2);
          var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
          return this.index += e2, t2;
        }, t.exports = i;
      }, { "../utils": 32, "./Uint8ArrayReader": 21 }], 20: [function(e, t, r) {
        var n = e("./DataReader");
        function i(e2) {
          n.call(this, e2);
        }
        e("../utils").inherits(i, n), i.prototype.byteAt = function(e2) {
          return this.data.charCodeAt(this.zero + e2);
        }, i.prototype.lastIndexOfSignature = function(e2) {
          return this.data.lastIndexOf(e2) - this.zero;
        }, i.prototype.readAndCheckSignature = function(e2) {
          return e2 === this.readData(4);
        }, i.prototype.readData = function(e2) {
          this.checkOffset(e2);
          var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
          return this.index += e2, t2;
        }, t.exports = i;
      }, { "../utils": 32, "./DataReader": 18 }], 21: [function(e, t, r) {
        var n = e("./ArrayReader");
        function i(e2) {
          n.call(this, e2);
        }
        e("../utils").inherits(i, n), i.prototype.readData = function(e2) {
          if (this.checkOffset(e2), 0 === e2) return new Uint8Array(0);
          var t2 = this.data.subarray(this.zero + this.index, this.zero + this.index + e2);
          return this.index += e2, t2;
        }, t.exports = i;
      }, { "../utils": 32, "./ArrayReader": 17 }], 22: [function(e, t, r) {
        var n = e("../utils"), i = e("../support"), s = e("./ArrayReader"), a = e("./StringReader"), o = e("./NodeBufferReader"), h = e("./Uint8ArrayReader");
        t.exports = function(e2) {
          var t2 = n.getTypeOf(e2);
          return n.checkSupport(t2), "string" !== t2 || i.uint8array ? "nodebuffer" === t2 ? new o(e2) : i.uint8array ? new h(n.transformTo("uint8array", e2)) : new s(n.transformTo("array", e2)) : new a(e2);
        };
      }, { "../support": 30, "../utils": 32, "./ArrayReader": 17, "./NodeBufferReader": 19, "./StringReader": 20, "./Uint8ArrayReader": 21 }], 23: [function(e, t, r) {
        r.LOCAL_FILE_HEADER = "PK", r.CENTRAL_FILE_HEADER = "PK", r.CENTRAL_DIRECTORY_END = "PK", r.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", r.ZIP64_CENTRAL_DIRECTORY_END = "PK", r.DATA_DESCRIPTOR = "PK\x07\b";
      }, {}], 24: [function(e, t, r) {
        var n = e("./GenericWorker"), i = e("../utils");
        function s(e2) {
          n.call(this, "ConvertWorker to " + e2), this.destType = e2;
        }
        i.inherits(s, n), s.prototype.processChunk = function(e2) {
          this.push({ data: i.transformTo(this.destType, e2.data), meta: e2.meta });
        }, t.exports = s;
      }, { "../utils": 32, "./GenericWorker": 28 }], 25: [function(e, t, r) {
        var n = e("./GenericWorker"), i = e("../crc32");
        function s() {
          n.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
        }
        e("../utils").inherits(s, n), s.prototype.processChunk = function(e2) {
          this.streamInfo.crc32 = i(e2.data, this.streamInfo.crc32 || 0), this.push(e2);
        }, t.exports = s;
      }, { "../crc32": 4, "../utils": 32, "./GenericWorker": 28 }], 26: [function(e, t, r) {
        var n = e("../utils"), i = e("./GenericWorker");
        function s(e2) {
          i.call(this, "DataLengthProbe for " + e2), this.propName = e2, this.withStreamInfo(e2, 0);
        }
        n.inherits(s, i), s.prototype.processChunk = function(e2) {
          if (e2) {
            var t2 = this.streamInfo[this.propName] || 0;
            this.streamInfo[this.propName] = t2 + e2.data.length;
          }
          i.prototype.processChunk.call(this, e2);
        }, t.exports = s;
      }, { "../utils": 32, "./GenericWorker": 28 }], 27: [function(e, t, r) {
        var n = e("../utils"), i = e("./GenericWorker");
        function s(e2) {
          i.call(this, "DataWorker");
          var t2 = this;
          this.dataIsReady = false, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = false, e2.then(function(e3) {
            t2.dataIsReady = true, t2.data = e3, t2.max = e3 && e3.length || 0, t2.type = n.getTypeOf(e3), t2.isPaused || t2._tickAndRepeat();
          }, function(e3) {
            t2.error(e3);
          });
        }
        n.inherits(s, i), s.prototype.cleanUp = function() {
          i.prototype.cleanUp.call(this), this.data = null;
        }, s.prototype.resume = function() {
          return !!i.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = true, n.delay(this._tickAndRepeat, [], this)), true);
        }, s.prototype._tickAndRepeat = function() {
          this._tickScheduled = false, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (n.delay(this._tickAndRepeat, [], this), this._tickScheduled = true));
        }, s.prototype._tick = function() {
          if (this.isPaused || this.isFinished) return false;
          var e2 = null, t2 = Math.min(this.max, this.index + 16384);
          if (this.index >= this.max) return this.end();
          switch (this.type) {
            case "string":
              e2 = this.data.substring(this.index, t2);
              break;
            case "uint8array":
              e2 = this.data.subarray(this.index, t2);
              break;
            case "array":
            case "nodebuffer":
              e2 = this.data.slice(this.index, t2);
          }
          return this.index = t2, this.push({ data: e2, meta: { percent: this.max ? this.index / this.max * 100 : 0 } });
        }, t.exports = s;
      }, { "../utils": 32, "./GenericWorker": 28 }], 28: [function(e, t, r) {
        function n(e2) {
          this.name = e2 || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = true, this.isFinished = false, this.isLocked = false, this._listeners = { data: [], end: [], error: [] }, this.previous = null;
        }
        n.prototype = { push: function(e2) {
          this.emit("data", e2);
        }, end: function() {
          if (this.isFinished) return false;
          this.flush();
          try {
            this.emit("end"), this.cleanUp(), this.isFinished = true;
          } catch (e2) {
            this.emit("error", e2);
          }
          return true;
        }, error: function(e2) {
          return !this.isFinished && (this.isPaused ? this.generatedError = e2 : (this.isFinished = true, this.emit("error", e2), this.previous && this.previous.error(e2), this.cleanUp()), true);
        }, on: function(e2, t2) {
          return this._listeners[e2].push(t2), this;
        }, cleanUp: function() {
          this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
        }, emit: function(e2, t2) {
          if (this._listeners[e2]) for (var r2 = 0; r2 < this._listeners[e2].length; r2++) this._listeners[e2][r2].call(this, t2);
        }, pipe: function(e2) {
          return e2.registerPrevious(this);
        }, registerPrevious: function(e2) {
          if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
          this.streamInfo = e2.streamInfo, this.mergeStreamInfo(), this.previous = e2;
          var t2 = this;
          return e2.on("data", function(e3) {
            t2.processChunk(e3);
          }), e2.on("end", function() {
            t2.end();
          }), e2.on("error", function(e3) {
            t2.error(e3);
          }), this;
        }, pause: function() {
          return !this.isPaused && !this.isFinished && (this.isPaused = true, this.previous && this.previous.pause(), true);
        }, resume: function() {
          if (!this.isPaused || this.isFinished) return false;
          var e2 = this.isPaused = false;
          return this.generatedError && (this.error(this.generatedError), e2 = true), this.previous && this.previous.resume(), !e2;
        }, flush: function() {
        }, processChunk: function(e2) {
          this.push(e2);
        }, withStreamInfo: function(e2, t2) {
          return this.extraStreamInfo[e2] = t2, this.mergeStreamInfo(), this;
        }, mergeStreamInfo: function() {
          for (var e2 in this.extraStreamInfo) Object.prototype.hasOwnProperty.call(this.extraStreamInfo, e2) && (this.streamInfo[e2] = this.extraStreamInfo[e2]);
        }, lock: function() {
          if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
          this.isLocked = true, this.previous && this.previous.lock();
        }, toString: function() {
          var e2 = "Worker " + this.name;
          return this.previous ? this.previous + " -> " + e2 : e2;
        } }, t.exports = n;
      }, {}], 29: [function(e, t, r) {
        var h = e("../utils"), i = e("./ConvertWorker"), s = e("./GenericWorker"), u = e("../base64"), n = e("../support"), a = e("../external"), o = null;
        if (n.nodestream) try {
          o = e("../nodejs/NodejsStreamOutputAdapter");
        } catch (e2) {
        }
        function l(e2, o2) {
          return new a.Promise(function(t2, r2) {
            var n2 = [], i2 = e2._internalType, s2 = e2._outputType, a2 = e2._mimeType;
            e2.on("data", function(e3, t3) {
              n2.push(e3), o2 && o2(t3);
            }).on("error", function(e3) {
              n2 = [], r2(e3);
            }).on("end", function() {
              try {
                var e3 = function(e4, t3, r3) {
                  switch (e4) {
                    case "blob":
                      return h.newBlob(h.transformTo("arraybuffer", t3), r3);
                    case "base64":
                      return u.encode(t3);
                    default:
                      return h.transformTo(e4, t3);
                  }
                }(s2, function(e4, t3) {
                  var r3, n3 = 0, i3 = null, s3 = 0;
                  for (r3 = 0; r3 < t3.length; r3++) s3 += t3[r3].length;
                  switch (e4) {
                    case "string":
                      return t3.join("");
                    case "array":
                      return Array.prototype.concat.apply([], t3);
                    case "uint8array":
                      for (i3 = new Uint8Array(s3), r3 = 0; r3 < t3.length; r3++) i3.set(t3[r3], n3), n3 += t3[r3].length;
                      return i3;
                    case "nodebuffer":
                      return Buffer.concat(t3);
                    default:
                      throw new Error("concat : unsupported type '" + e4 + "'");
                  }
                }(i2, n2), a2);
                t2(e3);
              } catch (e4) {
                r2(e4);
              }
              n2 = [];
            }).resume();
          });
        }
        function f(e2, t2, r2) {
          var n2 = t2;
          switch (t2) {
            case "blob":
            case "arraybuffer":
              n2 = "uint8array";
              break;
            case "base64":
              n2 = "string";
          }
          try {
            this._internalType = n2, this._outputType = t2, this._mimeType = r2, h.checkSupport(n2), this._worker = e2.pipe(new i(n2)), e2.lock();
          } catch (e3) {
            this._worker = new s("error"), this._worker.error(e3);
          }
        }
        f.prototype = { accumulate: function(e2) {
          return l(this, e2);
        }, on: function(e2, t2) {
          var r2 = this;
          return "data" === e2 ? this._worker.on(e2, function(e3) {
            t2.call(r2, e3.data, e3.meta);
          }) : this._worker.on(e2, function() {
            h.delay(t2, arguments, r2);
          }), this;
        }, resume: function() {
          return h.delay(this._worker.resume, [], this._worker), this;
        }, pause: function() {
          return this._worker.pause(), this;
        }, toNodejsStream: function(e2) {
          if (h.checkSupport("nodestream"), "nodebuffer" !== this._outputType) throw new Error(this._outputType + " is not supported by this method");
          return new o(this, { objectMode: "nodebuffer" !== this._outputType }, e2);
        } }, t.exports = f;
      }, { "../base64": 1, "../external": 6, "../nodejs/NodejsStreamOutputAdapter": 13, "../support": 30, "../utils": 32, "./ConvertWorker": 24, "./GenericWorker": 28 }], 30: [function(e, t, r) {
        if (r.base64 = true, r.array = true, r.string = true, r.arraybuffer = "undefined" != typeof ArrayBuffer && "undefined" != typeof Uint8Array, r.nodebuffer = "undefined" != typeof Buffer, r.uint8array = "undefined" != typeof Uint8Array, "undefined" == typeof ArrayBuffer) r.blob = false;
        else {
          var n = new ArrayBuffer(0);
          try {
            r.blob = 0 === new Blob([n], { type: "application/zip" }).size;
          } catch (e2) {
            try {
              var i = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
              i.append(n), r.blob = 0 === i.getBlob("application/zip").size;
            } catch (e3) {
              r.blob = false;
            }
          }
        }
        try {
          r.nodestream = !!e("readable-stream").Readable;
        } catch (e2) {
          r.nodestream = false;
        }
      }, { "readable-stream": 16 }], 31: [function(e, t, s) {
        for (var o = e("./utils"), h = e("./support"), r = e("./nodejsUtils"), n = e("./stream/GenericWorker"), u = new Array(256), i = 0; i < 256; i++) u[i] = 252 <= i ? 6 : 248 <= i ? 5 : 240 <= i ? 4 : 224 <= i ? 3 : 192 <= i ? 2 : 1;
        u[254] = u[254] = 1;
        function a() {
          n.call(this, "utf-8 decode"), this.leftOver = null;
        }
        function l() {
          n.call(this, "utf-8 encode");
        }
        s.utf8encode = function(e2) {
          return h.nodebuffer ? r.newBufferFrom(e2, "utf-8") : function(e3) {
            var t2, r2, n2, i2, s2, a2 = e3.length, o2 = 0;
            for (i2 = 0; i2 < a2; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o2 += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
            for (t2 = h.uint8array ? new Uint8Array(o2) : new Array(o2), i2 = s2 = 0; s2 < o2; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t2[s2++] = r2 : (r2 < 2048 ? t2[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t2[s2++] = 224 | r2 >>> 12 : (t2[s2++] = 240 | r2 >>> 18, t2[s2++] = 128 | r2 >>> 12 & 63), t2[s2++] = 128 | r2 >>> 6 & 63), t2[s2++] = 128 | 63 & r2);
            return t2;
          }(e2);
        }, s.utf8decode = function(e2) {
          return h.nodebuffer ? o.transformTo("nodebuffer", e2).toString("utf-8") : function(e3) {
            var t2, r2, n2, i2, s2 = e3.length, a2 = new Array(2 * s2);
            for (t2 = r2 = 0; t2 < s2; ) if ((n2 = e3[t2++]) < 128) a2[r2++] = n2;
            else if (4 < (i2 = u[n2])) a2[r2++] = 65533, t2 += i2 - 1;
            else {
              for (n2 &= 2 === i2 ? 31 : 3 === i2 ? 15 : 7; 1 < i2 && t2 < s2; ) n2 = n2 << 6 | 63 & e3[t2++], i2--;
              1 < i2 ? a2[r2++] = 65533 : n2 < 65536 ? a2[r2++] = n2 : (n2 -= 65536, a2[r2++] = 55296 | n2 >> 10 & 1023, a2[r2++] = 56320 | 1023 & n2);
            }
            return a2.length !== r2 && (a2.subarray ? a2 = a2.subarray(0, r2) : a2.length = r2), o.applyFromCharCode(a2);
          }(e2 = o.transformTo(h.uint8array ? "uint8array" : "array", e2));
        }, o.inherits(a, n), a.prototype.processChunk = function(e2) {
          var t2 = o.transformTo(h.uint8array ? "uint8array" : "array", e2.data);
          if (this.leftOver && this.leftOver.length) {
            if (h.uint8array) {
              var r2 = t2;
              (t2 = new Uint8Array(r2.length + this.leftOver.length)).set(this.leftOver, 0), t2.set(r2, this.leftOver.length);
            } else t2 = this.leftOver.concat(t2);
            this.leftOver = null;
          }
          var n2 = function(e3, t3) {
            var r3;
            for ((t3 = t3 || e3.length) > e3.length && (t3 = e3.length), r3 = t3 - 1; 0 <= r3 && 128 == (192 & e3[r3]); ) r3--;
            return r3 < 0 ? t3 : 0 === r3 ? t3 : r3 + u[e3[r3]] > t3 ? r3 : t3;
          }(t2), i2 = t2;
          n2 !== t2.length && (h.uint8array ? (i2 = t2.subarray(0, n2), this.leftOver = t2.subarray(n2, t2.length)) : (i2 = t2.slice(0, n2), this.leftOver = t2.slice(n2, t2.length))), this.push({ data: s.utf8decode(i2), meta: e2.meta });
        }, a.prototype.flush = function() {
          this.leftOver && this.leftOver.length && (this.push({ data: s.utf8decode(this.leftOver), meta: {} }), this.leftOver = null);
        }, s.Utf8DecodeWorker = a, o.inherits(l, n), l.prototype.processChunk = function(e2) {
          this.push({ data: s.utf8encode(e2.data), meta: e2.meta });
        }, s.Utf8EncodeWorker = l;
      }, { "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./support": 30, "./utils": 32 }], 32: [function(e, t, a) {
        var o = e("./support"), h = e("./base64"), r = e("./nodejsUtils"), u = e("./external");
        function n(e2) {
          return e2;
        }
        function l(e2, t2) {
          for (var r2 = 0; r2 < e2.length; ++r2) t2[r2] = 255 & e2.charCodeAt(r2);
          return t2;
        }
        e("setimmediate"), a.newBlob = function(t2, r2) {
          a.checkSupport("blob");
          try {
            return new Blob([t2], { type: r2 });
          } catch (e2) {
            try {
              var n2 = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
              return n2.append(t2), n2.getBlob(r2);
            } catch (e3) {
              throw new Error("Bug : can't construct the Blob.");
            }
          }
        };
        var i = { stringifyByChunk: function(e2, t2, r2) {
          var n2 = [], i2 = 0, s2 = e2.length;
          if (s2 <= r2) return String.fromCharCode.apply(null, e2);
          for (; i2 < s2; ) "array" === t2 || "nodebuffer" === t2 ? n2.push(String.fromCharCode.apply(null, e2.slice(i2, Math.min(i2 + r2, s2)))) : n2.push(String.fromCharCode.apply(null, e2.subarray(i2, Math.min(i2 + r2, s2)))), i2 += r2;
          return n2.join("");
        }, stringifyByChar: function(e2) {
          for (var t2 = "", r2 = 0; r2 < e2.length; r2++) t2 += String.fromCharCode(e2[r2]);
          return t2;
        }, applyCanBeUsed: { uint8array: function() {
          try {
            return o.uint8array && 1 === String.fromCharCode.apply(null, new Uint8Array(1)).length;
          } catch (e2) {
            return false;
          }
        }(), nodebuffer: function() {
          try {
            return o.nodebuffer && 1 === String.fromCharCode.apply(null, r.allocBuffer(1)).length;
          } catch (e2) {
            return false;
          }
        }() } };
        function s(e2) {
          var t2 = 65536, r2 = a.getTypeOf(e2), n2 = true;
          if ("uint8array" === r2 ? n2 = i.applyCanBeUsed.uint8array : "nodebuffer" === r2 && (n2 = i.applyCanBeUsed.nodebuffer), n2) for (; 1 < t2; ) try {
            return i.stringifyByChunk(e2, r2, t2);
          } catch (e3) {
            t2 = Math.floor(t2 / 2);
          }
          return i.stringifyByChar(e2);
        }
        function f(e2, t2) {
          for (var r2 = 0; r2 < e2.length; r2++) t2[r2] = e2[r2];
          return t2;
        }
        a.applyFromCharCode = s;
        var c = {};
        c.string = { string: n, array: function(e2) {
          return l(e2, new Array(e2.length));
        }, arraybuffer: function(e2) {
          return c.string.uint8array(e2).buffer;
        }, uint8array: function(e2) {
          return l(e2, new Uint8Array(e2.length));
        }, nodebuffer: function(e2) {
          return l(e2, r.allocBuffer(e2.length));
        } }, c.array = { string: s, array: n, arraybuffer: function(e2) {
          return new Uint8Array(e2).buffer;
        }, uint8array: function(e2) {
          return new Uint8Array(e2);
        }, nodebuffer: function(e2) {
          return r.newBufferFrom(e2);
        } }, c.arraybuffer = { string: function(e2) {
          return s(new Uint8Array(e2));
        }, array: function(e2) {
          return f(new Uint8Array(e2), new Array(e2.byteLength));
        }, arraybuffer: n, uint8array: function(e2) {
          return new Uint8Array(e2);
        }, nodebuffer: function(e2) {
          return r.newBufferFrom(new Uint8Array(e2));
        } }, c.uint8array = { string: s, array: function(e2) {
          return f(e2, new Array(e2.length));
        }, arraybuffer: function(e2) {
          return e2.buffer;
        }, uint8array: n, nodebuffer: function(e2) {
          return r.newBufferFrom(e2);
        } }, c.nodebuffer = { string: s, array: function(e2) {
          return f(e2, new Array(e2.length));
        }, arraybuffer: function(e2) {
          return c.nodebuffer.uint8array(e2).buffer;
        }, uint8array: function(e2) {
          return f(e2, new Uint8Array(e2.length));
        }, nodebuffer: n }, a.transformTo = function(e2, t2) {
          if (t2 = t2 || "", !e2) return t2;
          a.checkSupport(e2);
          var r2 = a.getTypeOf(t2);
          return c[r2][e2](t2);
        }, a.resolve = function(e2) {
          for (var t2 = e2.split("/"), r2 = [], n2 = 0; n2 < t2.length; n2++) {
            var i2 = t2[n2];
            "." === i2 || "" === i2 && 0 !== n2 && n2 !== t2.length - 1 || (".." === i2 ? r2.pop() : r2.push(i2));
          }
          return r2.join("/");
        }, a.getTypeOf = function(e2) {
          return "string" == typeof e2 ? "string" : "[object Array]" === Object.prototype.toString.call(e2) ? "array" : o.nodebuffer && r.isBuffer(e2) ? "nodebuffer" : o.uint8array && e2 instanceof Uint8Array ? "uint8array" : o.arraybuffer && e2 instanceof ArrayBuffer ? "arraybuffer" : void 0;
        }, a.checkSupport = function(e2) {
          if (!o[e2.toLowerCase()]) throw new Error(e2 + " is not supported by this platform");
        }, a.MAX_VALUE_16BITS = 65535, a.MAX_VALUE_32BITS = -1, a.pretty = function(e2) {
          var t2, r2, n2 = "";
          for (r2 = 0; r2 < (e2 || "").length; r2++) n2 += "\\x" + ((t2 = e2.charCodeAt(r2)) < 16 ? "0" : "") + t2.toString(16).toUpperCase();
          return n2;
        }, a.delay = function(e2, t2, r2) {
          setImmediate(function() {
            e2.apply(r2 || null, t2 || []);
          });
        }, a.inherits = function(e2, t2) {
          function r2() {
          }
          r2.prototype = t2.prototype, e2.prototype = new r2();
        }, a.extend = function() {
          var e2, t2, r2 = {};
          for (e2 = 0; e2 < arguments.length; e2++) for (t2 in arguments[e2]) Object.prototype.hasOwnProperty.call(arguments[e2], t2) && void 0 === r2[t2] && (r2[t2] = arguments[e2][t2]);
          return r2;
        }, a.prepareContent = function(r2, e2, n2, i2, s2) {
          return u.Promise.resolve(e2).then(function(n3) {
            return o.blob && (n3 instanceof Blob || -1 !== ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(n3))) && "undefined" != typeof FileReader ? new u.Promise(function(t2, r3) {
              var e3 = new FileReader();
              e3.onload = function(e4) {
                t2(e4.target.result);
              }, e3.onerror = function(e4) {
                r3(e4.target.error);
              }, e3.readAsArrayBuffer(n3);
            }) : n3;
          }).then(function(e3) {
            var t2 = a.getTypeOf(e3);
            return t2 ? ("arraybuffer" === t2 ? e3 = a.transformTo("uint8array", e3) : "string" === t2 && (s2 ? e3 = h.decode(e3) : n2 && true !== i2 && (e3 = function(e4) {
              return l(e4, o.uint8array ? new Uint8Array(e4.length) : new Array(e4.length));
            }(e3))), e3) : u.Promise.reject(new Error("Can't read the data of '" + r2 + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
          });
        };
      }, { "./base64": 1, "./external": 6, "./nodejsUtils": 14, "./support": 30, setimmediate: 54 }], 33: [function(e, t, r) {
        var n = e("./reader/readerFor"), i = e("./utils"), s = e("./signature"), a = e("./zipEntry"), o = e("./support");
        function h(e2) {
          this.files = [], this.loadOptions = e2;
        }
        h.prototype = { checkSignature: function(e2) {
          if (!this.reader.readAndCheckSignature(e2)) {
            this.reader.index -= 4;
            var t2 = this.reader.readString(4);
            throw new Error("Corrupted zip or bug: unexpected signature (" + i.pretty(t2) + ", expected " + i.pretty(e2) + ")");
          }
        }, isSignature: function(e2, t2) {
          var r2 = this.reader.index;
          this.reader.setIndex(e2);
          var n2 = this.reader.readString(4) === t2;
          return this.reader.setIndex(r2), n2;
        }, readBlockEndOfCentral: function() {
          this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
          var e2 = this.reader.readData(this.zipCommentLength), t2 = o.uint8array ? "uint8array" : "array", r2 = i.transformTo(t2, e2);
          this.zipComment = this.loadOptions.decodeFileName(r2);
        }, readBlockZip64EndOfCentral: function() {
          this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
          for (var e2, t2, r2, n2 = this.zip64EndOfCentralSize - 44; 0 < n2; ) e2 = this.reader.readInt(2), t2 = this.reader.readInt(4), r2 = this.reader.readData(t2), this.zip64ExtensibleData[e2] = { id: e2, length: t2, value: r2 };
        }, readBlockZip64EndOfCentralLocator: function() {
          if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw new Error("Multi-volumes zip are not supported");
        }, readLocalFiles: function() {
          var e2, t2;
          for (e2 = 0; e2 < this.files.length; e2++) t2 = this.files[e2], this.reader.setIndex(t2.localHeaderOffset), this.checkSignature(s.LOCAL_FILE_HEADER), t2.readLocalPart(this.reader), t2.handleUTF8(), t2.processAttributes();
        }, readCentralDir: function() {
          var e2;
          for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER); ) (e2 = new a({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(e2);
          if (this.centralDirRecords !== this.files.length && 0 !== this.centralDirRecords && 0 === this.files.length) throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
        }, readEndOfCentral: function() {
          var e2 = this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);
          if (e2 < 0) throw !this.isSignature(0, s.LOCAL_FILE_HEADER) ? new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html") : new Error("Corrupted zip: can't find end of central directory");
          this.reader.setIndex(e2);
          var t2 = e2;
          if (this.checkSignature(s.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === i.MAX_VALUE_16BITS || this.diskWithCentralDirStart === i.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === i.MAX_VALUE_16BITS || this.centralDirRecords === i.MAX_VALUE_16BITS || this.centralDirSize === i.MAX_VALUE_32BITS || this.centralDirOffset === i.MAX_VALUE_32BITS) {
            if (this.zip64 = true, (e2 = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
            if (this.reader.setIndex(e2), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, s.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
            this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
          }
          var r2 = this.centralDirOffset + this.centralDirSize;
          this.zip64 && (r2 += 20, r2 += 12 + this.zip64EndOfCentralSize);
          var n2 = t2 - r2;
          if (0 < n2) this.isSignature(t2, s.CENTRAL_FILE_HEADER) || (this.reader.zero = n2);
          else if (n2 < 0) throw new Error("Corrupted zip: missing " + Math.abs(n2) + " bytes.");
        }, prepareReader: function(e2) {
          this.reader = n(e2);
        }, load: function(e2) {
          this.prepareReader(e2), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
        } }, t.exports = h;
      }, { "./reader/readerFor": 22, "./signature": 23, "./support": 30, "./utils": 32, "./zipEntry": 34 }], 34: [function(e, t, r) {
        var n = e("./reader/readerFor"), s = e("./utils"), i = e("./compressedObject"), a = e("./crc32"), o = e("./utf8"), h = e("./compressions"), u = e("./support");
        function l(e2, t2) {
          this.options = e2, this.loadOptions = t2;
        }
        l.prototype = { isEncrypted: function() {
          return 1 == (1 & this.bitFlag);
        }, useUTF8: function() {
          return 2048 == (2048 & this.bitFlag);
        }, readLocalPart: function(e2) {
          var t2, r2;
          if (e2.skip(22), this.fileNameLength = e2.readInt(2), r2 = e2.readInt(2), this.fileName = e2.readData(this.fileNameLength), e2.skip(r2), -1 === this.compressedSize || -1 === this.uncompressedSize) throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
          if (null === (t2 = function(e3) {
            for (var t3 in h) if (Object.prototype.hasOwnProperty.call(h, t3) && h[t3].magic === e3) return h[t3];
            return null;
          }(this.compressionMethod))) throw new Error("Corrupted zip : compression " + s.pretty(this.compressionMethod) + " unknown (inner file : " + s.transformTo("string", this.fileName) + ")");
          this.decompressed = new i(this.compressedSize, this.uncompressedSize, this.crc32, t2, e2.readData(this.compressedSize));
        }, readCentralPart: function(e2) {
          this.versionMadeBy = e2.readInt(2), e2.skip(2), this.bitFlag = e2.readInt(2), this.compressionMethod = e2.readString(2), this.date = e2.readDate(), this.crc32 = e2.readInt(4), this.compressedSize = e2.readInt(4), this.uncompressedSize = e2.readInt(4);
          var t2 = e2.readInt(2);
          if (this.extraFieldsLength = e2.readInt(2), this.fileCommentLength = e2.readInt(2), this.diskNumberStart = e2.readInt(2), this.internalFileAttributes = e2.readInt(2), this.externalFileAttributes = e2.readInt(4), this.localHeaderOffset = e2.readInt(4), this.isEncrypted()) throw new Error("Encrypted zip are not supported");
          e2.skip(t2), this.readExtraFields(e2), this.parseZIP64ExtraField(e2), this.fileComment = e2.readData(this.fileCommentLength);
        }, processAttributes: function() {
          this.unixPermissions = null, this.dosPermissions = null;
          var e2 = this.versionMadeBy >> 8;
          this.dir = !!(16 & this.externalFileAttributes), 0 == e2 && (this.dosPermissions = 63 & this.externalFileAttributes), 3 == e2 && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || "/" !== this.fileNameStr.slice(-1) || (this.dir = true);
        }, parseZIP64ExtraField: function() {
          if (this.extraFields[1]) {
            var e2 = n(this.extraFields[1].value);
            this.uncompressedSize === s.MAX_VALUE_32BITS && (this.uncompressedSize = e2.readInt(8)), this.compressedSize === s.MAX_VALUE_32BITS && (this.compressedSize = e2.readInt(8)), this.localHeaderOffset === s.MAX_VALUE_32BITS && (this.localHeaderOffset = e2.readInt(8)), this.diskNumberStart === s.MAX_VALUE_32BITS && (this.diskNumberStart = e2.readInt(4));
          }
        }, readExtraFields: function(e2) {
          var t2, r2, n2, i2 = e2.index + this.extraFieldsLength;
          for (this.extraFields || (this.extraFields = {}); e2.index + 4 < i2; ) t2 = e2.readInt(2), r2 = e2.readInt(2), n2 = e2.readData(r2), this.extraFields[t2] = { id: t2, length: r2, value: n2 };
          e2.setIndex(i2);
        }, handleUTF8: function() {
          var e2 = u.uint8array ? "uint8array" : "array";
          if (this.useUTF8()) this.fileNameStr = o.utf8decode(this.fileName), this.fileCommentStr = o.utf8decode(this.fileComment);
          else {
            var t2 = this.findExtraFieldUnicodePath();
            if (null !== t2) this.fileNameStr = t2;
            else {
              var r2 = s.transformTo(e2, this.fileName);
              this.fileNameStr = this.loadOptions.decodeFileName(r2);
            }
            var n2 = this.findExtraFieldUnicodeComment();
            if (null !== n2) this.fileCommentStr = n2;
            else {
              var i2 = s.transformTo(e2, this.fileComment);
              this.fileCommentStr = this.loadOptions.decodeFileName(i2);
            }
          }
        }, findExtraFieldUnicodePath: function() {
          var e2 = this.extraFields[28789];
          if (e2) {
            var t2 = n(e2.value);
            return 1 !== t2.readInt(1) ? null : a(this.fileName) !== t2.readInt(4) ? null : o.utf8decode(t2.readData(e2.length - 5));
          }
          return null;
        }, findExtraFieldUnicodeComment: function() {
          var e2 = this.extraFields[25461];
          if (e2) {
            var t2 = n(e2.value);
            return 1 !== t2.readInt(1) ? null : a(this.fileComment) !== t2.readInt(4) ? null : o.utf8decode(t2.readData(e2.length - 5));
          }
          return null;
        } }, t.exports = l;
      }, { "./compressedObject": 2, "./compressions": 3, "./crc32": 4, "./reader/readerFor": 22, "./support": 30, "./utf8": 31, "./utils": 32 }], 35: [function(e, t, r) {
        function n(e2, t2, r2) {
          this.name = e2, this.dir = r2.dir, this.date = r2.date, this.comment = r2.comment, this.unixPermissions = r2.unixPermissions, this.dosPermissions = r2.dosPermissions, this._data = t2, this._dataBinary = r2.binary, this.options = { compression: r2.compression, compressionOptions: r2.compressionOptions };
        }
        var s = e("./stream/StreamHelper"), i = e("./stream/DataWorker"), a = e("./utf8"), o = e("./compressedObject"), h = e("./stream/GenericWorker");
        n.prototype = { internalStream: function(e2) {
          var t2 = null, r2 = "string";
          try {
            if (!e2) throw new Error("No output type specified.");
            var n2 = "string" === (r2 = e2.toLowerCase()) || "text" === r2;
            "binarystring" !== r2 && "text" !== r2 || (r2 = "string"), t2 = this._decompressWorker();
            var i2 = !this._dataBinary;
            i2 && !n2 && (t2 = t2.pipe(new a.Utf8EncodeWorker())), !i2 && n2 && (t2 = t2.pipe(new a.Utf8DecodeWorker()));
          } catch (e3) {
            (t2 = new h("error")).error(e3);
          }
          return new s(t2, r2, "");
        }, async: function(e2, t2) {
          return this.internalStream(e2).accumulate(t2);
        }, nodeStream: function(e2, t2) {
          return this.internalStream(e2 || "nodebuffer").toNodejsStream(t2);
        }, _compressWorker: function(e2, t2) {
          if (this._data instanceof o && this._data.compression.magic === e2.magic) return this._data.getCompressedWorker();
          var r2 = this._decompressWorker();
          return this._dataBinary || (r2 = r2.pipe(new a.Utf8EncodeWorker())), o.createWorkerFrom(r2, e2, t2);
        }, _decompressWorker: function() {
          return this._data instanceof o ? this._data.getContentWorker() : this._data instanceof h ? this._data : new i(this._data);
        } };
        for (var u = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"], l = function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, f = 0; f < u.length; f++) n.prototype[u[f]] = l;
        t.exports = n;
      }, { "./compressedObject": 2, "./stream/DataWorker": 27, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31 }], 36: [function(e, l, t) {
        (function(t2) {
          var r, n, e2 = t2.MutationObserver || t2.WebKitMutationObserver;
          if (e2) {
            var i = 0, s = new e2(u), a = t2.document.createTextNode("");
            s.observe(a, { characterData: true }), r = function() {
              a.data = i = ++i % 2;
            };
          } else if (t2.setImmediate || void 0 === t2.MessageChannel) r = "document" in t2 && "onreadystatechange" in t2.document.createElement("script") ? function() {
            var e3 = t2.document.createElement("script");
            e3.onreadystatechange = function() {
              u(), e3.onreadystatechange = null, e3.parentNode.removeChild(e3), e3 = null;
            }, t2.document.documentElement.appendChild(e3);
          } : function() {
            setTimeout(u, 0);
          };
          else {
            var o = new t2.MessageChannel();
            o.port1.onmessage = u, r = function() {
              o.port2.postMessage(0);
            };
          }
          var h = [];
          function u() {
            var e3, t3;
            n = true;
            for (var r2 = h.length; r2; ) {
              for (t3 = h, h = [], e3 = -1; ++e3 < r2; ) t3[e3]();
              r2 = h.length;
            }
            n = false;
          }
          l.exports = function(e3) {
            1 !== h.push(e3) || n || r();
          };
        }).call(this, "undefined" != typeof commonjsGlobal ? commonjsGlobal : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
      }, {}], 37: [function(e, t, r) {
        var i = e("immediate");
        function u() {
        }
        var l = {}, s = ["REJECTED"], a = ["FULFILLED"], n = ["PENDING"];
        function o(e2) {
          if ("function" != typeof e2) throw new TypeError("resolver must be a function");
          this.state = n, this.queue = [], this.outcome = void 0, e2 !== u && d(this, e2);
        }
        function h(e2, t2, r2) {
          this.promise = e2, "function" == typeof t2 && (this.onFulfilled = t2, this.callFulfilled = this.otherCallFulfilled), "function" == typeof r2 && (this.onRejected = r2, this.callRejected = this.otherCallRejected);
        }
        function f(t2, r2, n2) {
          i(function() {
            var e2;
            try {
              e2 = r2(n2);
            } catch (e3) {
              return l.reject(t2, e3);
            }
            e2 === t2 ? l.reject(t2, new TypeError("Cannot resolve promise with itself")) : l.resolve(t2, e2);
          });
        }
        function c(e2) {
          var t2 = e2 && e2.then;
          if (e2 && ("object" == typeof e2 || "function" == typeof e2) && "function" == typeof t2) return function() {
            t2.apply(e2, arguments);
          };
        }
        function d(t2, e2) {
          var r2 = false;
          function n2(e3) {
            r2 || (r2 = true, l.reject(t2, e3));
          }
          function i2(e3) {
            r2 || (r2 = true, l.resolve(t2, e3));
          }
          var s2 = p(function() {
            e2(i2, n2);
          });
          "error" === s2.status && n2(s2.value);
        }
        function p(e2, t2) {
          var r2 = {};
          try {
            r2.value = e2(t2), r2.status = "success";
          } catch (e3) {
            r2.status = "error", r2.value = e3;
          }
          return r2;
        }
        (t.exports = o).prototype.finally = function(t2) {
          if ("function" != typeof t2) return this;
          var r2 = this.constructor;
          return this.then(function(e2) {
            return r2.resolve(t2()).then(function() {
              return e2;
            });
          }, function(e2) {
            return r2.resolve(t2()).then(function() {
              throw e2;
            });
          });
        }, o.prototype.catch = function(e2) {
          return this.then(null, e2);
        }, o.prototype.then = function(e2, t2) {
          if ("function" != typeof e2 && this.state === a || "function" != typeof t2 && this.state === s) return this;
          var r2 = new this.constructor(u);
          this.state !== n ? f(r2, this.state === a ? e2 : t2, this.outcome) : this.queue.push(new h(r2, e2, t2));
          return r2;
        }, h.prototype.callFulfilled = function(e2) {
          l.resolve(this.promise, e2);
        }, h.prototype.otherCallFulfilled = function(e2) {
          f(this.promise, this.onFulfilled, e2);
        }, h.prototype.callRejected = function(e2) {
          l.reject(this.promise, e2);
        }, h.prototype.otherCallRejected = function(e2) {
          f(this.promise, this.onRejected, e2);
        }, l.resolve = function(e2, t2) {
          var r2 = p(c, t2);
          if ("error" === r2.status) return l.reject(e2, r2.value);
          var n2 = r2.value;
          if (n2) d(e2, n2);
          else {
            e2.state = a, e2.outcome = t2;
            for (var i2 = -1, s2 = e2.queue.length; ++i2 < s2; ) e2.queue[i2].callFulfilled(t2);
          }
          return e2;
        }, l.reject = function(e2, t2) {
          e2.state = s, e2.outcome = t2;
          for (var r2 = -1, n2 = e2.queue.length; ++r2 < n2; ) e2.queue[r2].callRejected(t2);
          return e2;
        }, o.resolve = function(e2) {
          if (e2 instanceof this) return e2;
          return l.resolve(new this(u), e2);
        }, o.reject = function(e2) {
          var t2 = new this(u);
          return l.reject(t2, e2);
        }, o.all = function(e2) {
          var r2 = this;
          if ("[object Array]" !== Object.prototype.toString.call(e2)) return this.reject(new TypeError("must be an array"));
          var n2 = e2.length, i2 = false;
          if (!n2) return this.resolve([]);
          var s2 = new Array(n2), a2 = 0, t2 = -1, o2 = new this(u);
          for (; ++t2 < n2; ) h2(e2[t2], t2);
          return o2;
          function h2(e3, t3) {
            r2.resolve(e3).then(function(e4) {
              s2[t3] = e4, ++a2 !== n2 || i2 || (i2 = true, l.resolve(o2, s2));
            }, function(e4) {
              i2 || (i2 = true, l.reject(o2, e4));
            });
          }
        }, o.race = function(e2) {
          var t2 = this;
          if ("[object Array]" !== Object.prototype.toString.call(e2)) return this.reject(new TypeError("must be an array"));
          var r2 = e2.length, n2 = false;
          if (!r2) return this.resolve([]);
          var i2 = -1, s2 = new this(u);
          for (; ++i2 < r2; ) a2 = e2[i2], t2.resolve(a2).then(function(e3) {
            n2 || (n2 = true, l.resolve(s2, e3));
          }, function(e3) {
            n2 || (n2 = true, l.reject(s2, e3));
          });
          var a2;
          return s2;
        };
      }, { immediate: 36 }], 38: [function(e, t, r) {
        var n = {};
        (0, e("./lib/utils/common").assign)(n, e("./lib/deflate"), e("./lib/inflate"), e("./lib/zlib/constants")), t.exports = n;
      }, { "./lib/deflate": 39, "./lib/inflate": 40, "./lib/utils/common": 41, "./lib/zlib/constants": 44 }], 39: [function(e, t, r) {
        var a = e("./zlib/deflate"), o = e("./utils/common"), h = e("./utils/strings"), i = e("./zlib/messages"), s = e("./zlib/zstream"), u = Object.prototype.toString, l = 0, f = -1, c = 0, d = 8;
        function p(e2) {
          if (!(this instanceof p)) return new p(e2);
          this.options = o.assign({ level: f, method: d, chunkSize: 16384, windowBits: 15, memLevel: 8, strategy: c, to: "" }, e2 || {});
          var t2 = this.options;
          t2.raw && 0 < t2.windowBits ? t2.windowBits = -t2.windowBits : t2.gzip && 0 < t2.windowBits && t2.windowBits < 16 && (t2.windowBits += 16), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new s(), this.strm.avail_out = 0;
          var r2 = a.deflateInit2(this.strm, t2.level, t2.method, t2.windowBits, t2.memLevel, t2.strategy);
          if (r2 !== l) throw new Error(i[r2]);
          if (t2.header && a.deflateSetHeader(this.strm, t2.header), t2.dictionary) {
            var n2;
            if (n2 = "string" == typeof t2.dictionary ? h.string2buf(t2.dictionary) : "[object ArrayBuffer]" === u.call(t2.dictionary) ? new Uint8Array(t2.dictionary) : t2.dictionary, (r2 = a.deflateSetDictionary(this.strm, n2)) !== l) throw new Error(i[r2]);
            this._dict_set = true;
          }
        }
        function n(e2, t2) {
          var r2 = new p(t2);
          if (r2.push(e2, true), r2.err) throw r2.msg || i[r2.err];
          return r2.result;
        }
        p.prototype.push = function(e2, t2) {
          var r2, n2, i2 = this.strm, s2 = this.options.chunkSize;
          if (this.ended) return false;
          n2 = t2 === ~~t2 ? t2 : true === t2 ? 4 : 0, "string" == typeof e2 ? i2.input = h.string2buf(e2) : "[object ArrayBuffer]" === u.call(e2) ? i2.input = new Uint8Array(e2) : i2.input = e2, i2.next_in = 0, i2.avail_in = i2.input.length;
          do {
            if (0 === i2.avail_out && (i2.output = new o.Buf8(s2), i2.next_out = 0, i2.avail_out = s2), 1 !== (r2 = a.deflate(i2, n2)) && r2 !== l) return this.onEnd(r2), !(this.ended = true);
            0 !== i2.avail_out && (0 !== i2.avail_in || 4 !== n2 && 2 !== n2) || ("string" === this.options.to ? this.onData(h.buf2binstring(o.shrinkBuf(i2.output, i2.next_out))) : this.onData(o.shrinkBuf(i2.output, i2.next_out)));
          } while ((0 < i2.avail_in || 0 === i2.avail_out) && 1 !== r2);
          return 4 === n2 ? (r2 = a.deflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === l) : 2 !== n2 || (this.onEnd(l), !(i2.avail_out = 0));
        }, p.prototype.onData = function(e2) {
          this.chunks.push(e2);
        }, p.prototype.onEnd = function(e2) {
          e2 === l && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = o.flattenChunks(this.chunks)), this.chunks = [], this.err = e2, this.msg = this.strm.msg;
        }, r.Deflate = p, r.deflate = n, r.deflateRaw = function(e2, t2) {
          return (t2 = t2 || {}).raw = true, n(e2, t2);
        }, r.gzip = function(e2, t2) {
          return (t2 = t2 || {}).gzip = true, n(e2, t2);
        };
      }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/deflate": 46, "./zlib/messages": 51, "./zlib/zstream": 53 }], 40: [function(e, t, r) {
        var c = e("./zlib/inflate"), d = e("./utils/common"), p = e("./utils/strings"), m = e("./zlib/constants"), n = e("./zlib/messages"), i = e("./zlib/zstream"), s = e("./zlib/gzheader"), _ = Object.prototype.toString;
        function a(e2) {
          if (!(this instanceof a)) return new a(e2);
          this.options = d.assign({ chunkSize: 16384, windowBits: 0, to: "" }, e2 || {});
          var t2 = this.options;
          t2.raw && 0 <= t2.windowBits && t2.windowBits < 16 && (t2.windowBits = -t2.windowBits, 0 === t2.windowBits && (t2.windowBits = -15)), !(0 <= t2.windowBits && t2.windowBits < 16) || e2 && e2.windowBits || (t2.windowBits += 32), 15 < t2.windowBits && t2.windowBits < 48 && 0 == (15 & t2.windowBits) && (t2.windowBits |= 15), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new i(), this.strm.avail_out = 0;
          var r2 = c.inflateInit2(this.strm, t2.windowBits);
          if (r2 !== m.Z_OK) throw new Error(n[r2]);
          this.header = new s(), c.inflateGetHeader(this.strm, this.header);
        }
        function o(e2, t2) {
          var r2 = new a(t2);
          if (r2.push(e2, true), r2.err) throw r2.msg || n[r2.err];
          return r2.result;
        }
        a.prototype.push = function(e2, t2) {
          var r2, n2, i2, s2, a2, o2, h = this.strm, u = this.options.chunkSize, l = this.options.dictionary, f = false;
          if (this.ended) return false;
          n2 = t2 === ~~t2 ? t2 : true === t2 ? m.Z_FINISH : m.Z_NO_FLUSH, "string" == typeof e2 ? h.input = p.binstring2buf(e2) : "[object ArrayBuffer]" === _.call(e2) ? h.input = new Uint8Array(e2) : h.input = e2, h.next_in = 0, h.avail_in = h.input.length;
          do {
            if (0 === h.avail_out && (h.output = new d.Buf8(u), h.next_out = 0, h.avail_out = u), (r2 = c.inflate(h, m.Z_NO_FLUSH)) === m.Z_NEED_DICT && l && (o2 = "string" == typeof l ? p.string2buf(l) : "[object ArrayBuffer]" === _.call(l) ? new Uint8Array(l) : l, r2 = c.inflateSetDictionary(this.strm, o2)), r2 === m.Z_BUF_ERROR && true === f && (r2 = m.Z_OK, f = false), r2 !== m.Z_STREAM_END && r2 !== m.Z_OK) return this.onEnd(r2), !(this.ended = true);
            h.next_out && (0 !== h.avail_out && r2 !== m.Z_STREAM_END && (0 !== h.avail_in || n2 !== m.Z_FINISH && n2 !== m.Z_SYNC_FLUSH) || ("string" === this.options.to ? (i2 = p.utf8border(h.output, h.next_out), s2 = h.next_out - i2, a2 = p.buf2string(h.output, i2), h.next_out = s2, h.avail_out = u - s2, s2 && d.arraySet(h.output, h.output, i2, s2, 0), this.onData(a2)) : this.onData(d.shrinkBuf(h.output, h.next_out)))), 0 === h.avail_in && 0 === h.avail_out && (f = true);
          } while ((0 < h.avail_in || 0 === h.avail_out) && r2 !== m.Z_STREAM_END);
          return r2 === m.Z_STREAM_END && (n2 = m.Z_FINISH), n2 === m.Z_FINISH ? (r2 = c.inflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === m.Z_OK) : n2 !== m.Z_SYNC_FLUSH || (this.onEnd(m.Z_OK), !(h.avail_out = 0));
        }, a.prototype.onData = function(e2) {
          this.chunks.push(e2);
        }, a.prototype.onEnd = function(e2) {
          e2 === m.Z_OK && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = d.flattenChunks(this.chunks)), this.chunks = [], this.err = e2, this.msg = this.strm.msg;
        }, r.Inflate = a, r.inflate = o, r.inflateRaw = function(e2, t2) {
          return (t2 = t2 || {}).raw = true, o(e2, t2);
        }, r.ungzip = o;
      }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/constants": 44, "./zlib/gzheader": 47, "./zlib/inflate": 49, "./zlib/messages": 51, "./zlib/zstream": 53 }], 41: [function(e, t, r) {
        var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Int32Array;
        r.assign = function(e2) {
          for (var t2 = Array.prototype.slice.call(arguments, 1); t2.length; ) {
            var r2 = t2.shift();
            if (r2) {
              if ("object" != typeof r2) throw new TypeError(r2 + "must be non-object");
              for (var n2 in r2) r2.hasOwnProperty(n2) && (e2[n2] = r2[n2]);
            }
          }
          return e2;
        }, r.shrinkBuf = function(e2, t2) {
          return e2.length === t2 ? e2 : e2.subarray ? e2.subarray(0, t2) : (e2.length = t2, e2);
        };
        var i = { arraySet: function(e2, t2, r2, n2, i2) {
          if (t2.subarray && e2.subarray) e2.set(t2.subarray(r2, r2 + n2), i2);
          else for (var s2 = 0; s2 < n2; s2++) e2[i2 + s2] = t2[r2 + s2];
        }, flattenChunks: function(e2) {
          var t2, r2, n2, i2, s2, a;
          for (t2 = n2 = 0, r2 = e2.length; t2 < r2; t2++) n2 += e2[t2].length;
          for (a = new Uint8Array(n2), t2 = i2 = 0, r2 = e2.length; t2 < r2; t2++) s2 = e2[t2], a.set(s2, i2), i2 += s2.length;
          return a;
        } }, s = { arraySet: function(e2, t2, r2, n2, i2) {
          for (var s2 = 0; s2 < n2; s2++) e2[i2 + s2] = t2[r2 + s2];
        }, flattenChunks: function(e2) {
          return [].concat.apply([], e2);
        } };
        r.setTyped = function(e2) {
          e2 ? (r.Buf8 = Uint8Array, r.Buf16 = Uint16Array, r.Buf32 = Int32Array, r.assign(r, i)) : (r.Buf8 = Array, r.Buf16 = Array, r.Buf32 = Array, r.assign(r, s));
        }, r.setTyped(n);
      }, {}], 42: [function(e, t, r) {
        var h = e("./common"), i = true, s = true;
        try {
          String.fromCharCode.apply(null, [0]);
        } catch (e2) {
          i = false;
        }
        try {
          String.fromCharCode.apply(null, new Uint8Array(1));
        } catch (e2) {
          s = false;
        }
        for (var u = new h.Buf8(256), n = 0; n < 256; n++) u[n] = 252 <= n ? 6 : 248 <= n ? 5 : 240 <= n ? 4 : 224 <= n ? 3 : 192 <= n ? 2 : 1;
        function l(e2, t2) {
          if (t2 < 65537 && (e2.subarray && s || !e2.subarray && i)) return String.fromCharCode.apply(null, h.shrinkBuf(e2, t2));
          for (var r2 = "", n2 = 0; n2 < t2; n2++) r2 += String.fromCharCode(e2[n2]);
          return r2;
        }
        u[254] = u[254] = 1, r.string2buf = function(e2) {
          var t2, r2, n2, i2, s2, a = e2.length, o = 0;
          for (i2 = 0; i2 < a; i2++) 55296 == (64512 & (r2 = e2.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e2.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
          for (t2 = new h.Buf8(o), i2 = s2 = 0; s2 < o; i2++) 55296 == (64512 & (r2 = e2.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e2.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t2[s2++] = r2 : (r2 < 2048 ? t2[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t2[s2++] = 224 | r2 >>> 12 : (t2[s2++] = 240 | r2 >>> 18, t2[s2++] = 128 | r2 >>> 12 & 63), t2[s2++] = 128 | r2 >>> 6 & 63), t2[s2++] = 128 | 63 & r2);
          return t2;
        }, r.buf2binstring = function(e2) {
          return l(e2, e2.length);
        }, r.binstring2buf = function(e2) {
          for (var t2 = new h.Buf8(e2.length), r2 = 0, n2 = t2.length; r2 < n2; r2++) t2[r2] = e2.charCodeAt(r2);
          return t2;
        }, r.buf2string = function(e2, t2) {
          var r2, n2, i2, s2, a = t2 || e2.length, o = new Array(2 * a);
          for (r2 = n2 = 0; r2 < a; ) if ((i2 = e2[r2++]) < 128) o[n2++] = i2;
          else if (4 < (s2 = u[i2])) o[n2++] = 65533, r2 += s2 - 1;
          else {
            for (i2 &= 2 === s2 ? 31 : 3 === s2 ? 15 : 7; 1 < s2 && r2 < a; ) i2 = i2 << 6 | 63 & e2[r2++], s2--;
            1 < s2 ? o[n2++] = 65533 : i2 < 65536 ? o[n2++] = i2 : (i2 -= 65536, o[n2++] = 55296 | i2 >> 10 & 1023, o[n2++] = 56320 | 1023 & i2);
          }
          return l(o, n2);
        }, r.utf8border = function(e2, t2) {
          var r2;
          for ((t2 = t2 || e2.length) > e2.length && (t2 = e2.length), r2 = t2 - 1; 0 <= r2 && 128 == (192 & e2[r2]); ) r2--;
          return r2 < 0 ? t2 : 0 === r2 ? t2 : r2 + u[e2[r2]] > t2 ? r2 : t2;
        };
      }, { "./common": 41 }], 43: [function(e, t, r) {
        t.exports = function(e2, t2, r2, n) {
          for (var i = 65535 & e2 | 0, s = e2 >>> 16 & 65535 | 0, a = 0; 0 !== r2; ) {
            for (r2 -= a = 2e3 < r2 ? 2e3 : r2; s = s + (i = i + t2[n++] | 0) | 0, --a; ) ;
            i %= 65521, s %= 65521;
          }
          return i | s << 16 | 0;
        };
      }, {}], 44: [function(e, t, r) {
        t.exports = { Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5, Z_TREES: 6, Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_BUF_ERROR: -5, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0, Z_BINARY: 0, Z_TEXT: 1, Z_UNKNOWN: 2, Z_DEFLATED: 8 };
      }, {}], 45: [function(e, t, r) {
        var o = function() {
          for (var e2, t2 = [], r2 = 0; r2 < 256; r2++) {
            e2 = r2;
            for (var n = 0; n < 8; n++) e2 = 1 & e2 ? 3988292384 ^ e2 >>> 1 : e2 >>> 1;
            t2[r2] = e2;
          }
          return t2;
        }();
        t.exports = function(e2, t2, r2, n) {
          var i = o, s = n + r2;
          e2 ^= -1;
          for (var a = n; a < s; a++) e2 = e2 >>> 8 ^ i[255 & (e2 ^ t2[a])];
          return -1 ^ e2;
        };
      }, {}], 46: [function(e, t, r) {
        var h, c = e("../utils/common"), u = e("./trees"), d = e("./adler32"), p = e("./crc32"), n = e("./messages"), l = 0, f = 4, m = 0, _ = -2, g = -1, b = 4, i = 2, v = 8, y = 9, s = 286, a = 30, o = 19, w = 2 * s + 1, k = 15, x = 3, S = 258, z = S + x + 1, C = 42, E = 113, A = 1, I = 2, O = 3, B = 4;
        function R(e2, t2) {
          return e2.msg = n[t2], t2;
        }
        function T(e2) {
          return (e2 << 1) - (4 < e2 ? 9 : 0);
        }
        function D(e2) {
          for (var t2 = e2.length; 0 <= --t2; ) e2[t2] = 0;
        }
        function F(e2) {
          var t2 = e2.state, r2 = t2.pending;
          r2 > e2.avail_out && (r2 = e2.avail_out), 0 !== r2 && (c.arraySet(e2.output, t2.pending_buf, t2.pending_out, r2, e2.next_out), e2.next_out += r2, t2.pending_out += r2, e2.total_out += r2, e2.avail_out -= r2, t2.pending -= r2, 0 === t2.pending && (t2.pending_out = 0));
        }
        function N(e2, t2) {
          u._tr_flush_block(e2, 0 <= e2.block_start ? e2.block_start : -1, e2.strstart - e2.block_start, t2), e2.block_start = e2.strstart, F(e2.strm);
        }
        function U(e2, t2) {
          e2.pending_buf[e2.pending++] = t2;
        }
        function P(e2, t2) {
          e2.pending_buf[e2.pending++] = t2 >>> 8 & 255, e2.pending_buf[e2.pending++] = 255 & t2;
        }
        function L(e2, t2) {
          var r2, n2, i2 = e2.max_chain_length, s2 = e2.strstart, a2 = e2.prev_length, o2 = e2.nice_match, h2 = e2.strstart > e2.w_size - z ? e2.strstart - (e2.w_size - z) : 0, u2 = e2.window, l2 = e2.w_mask, f2 = e2.prev, c2 = e2.strstart + S, d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
          e2.prev_length >= e2.good_match && (i2 >>= 2), o2 > e2.lookahead && (o2 = e2.lookahead);
          do {
            if (u2[(r2 = t2) + a2] === p2 && u2[r2 + a2 - 1] === d2 && u2[r2] === u2[s2] && u2[++r2] === u2[s2 + 1]) {
              s2 += 2, r2++;
              do {
              } while (u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && s2 < c2);
              if (n2 = S - (c2 - s2), s2 = c2 - S, a2 < n2) {
                if (e2.match_start = t2, o2 <= (a2 = n2)) break;
                d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
              }
            }
          } while ((t2 = f2[t2 & l2]) > h2 && 0 != --i2);
          return a2 <= e2.lookahead ? a2 : e2.lookahead;
        }
        function j(e2) {
          var t2, r2, n2, i2, s2, a2, o2, h2, u2, l2, f2 = e2.w_size;
          do {
            if (i2 = e2.window_size - e2.lookahead - e2.strstart, e2.strstart >= f2 + (f2 - z)) {
              for (c.arraySet(e2.window, e2.window, f2, f2, 0), e2.match_start -= f2, e2.strstart -= f2, e2.block_start -= f2, t2 = r2 = e2.hash_size; n2 = e2.head[--t2], e2.head[t2] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
              for (t2 = r2 = f2; n2 = e2.prev[--t2], e2.prev[t2] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
              i2 += f2;
            }
            if (0 === e2.strm.avail_in) break;
            if (a2 = e2.strm, o2 = e2.window, h2 = e2.strstart + e2.lookahead, u2 = i2, l2 = void 0, l2 = a2.avail_in, u2 < l2 && (l2 = u2), r2 = 0 === l2 ? 0 : (a2.avail_in -= l2, c.arraySet(o2, a2.input, a2.next_in, l2, h2), 1 === a2.state.wrap ? a2.adler = d(a2.adler, o2, l2, h2) : 2 === a2.state.wrap && (a2.adler = p(a2.adler, o2, l2, h2)), a2.next_in += l2, a2.total_in += l2, l2), e2.lookahead += r2, e2.lookahead + e2.insert >= x) for (s2 = e2.strstart - e2.insert, e2.ins_h = e2.window[s2], e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[s2 + 1]) & e2.hash_mask; e2.insert && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[s2 + x - 1]) & e2.hash_mask, e2.prev[s2 & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = s2, s2++, e2.insert--, !(e2.lookahead + e2.insert < x)); ) ;
          } while (e2.lookahead < z && 0 !== e2.strm.avail_in);
        }
        function Z(e2, t2) {
          for (var r2, n2; ; ) {
            if (e2.lookahead < z) {
              if (j(e2), e2.lookahead < z && t2 === l) return A;
              if (0 === e2.lookahead) break;
            }
            if (r2 = 0, e2.lookahead >= x && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), 0 !== r2 && e2.strstart - r2 <= e2.w_size - z && (e2.match_length = L(e2, r2)), e2.match_length >= x) if (n2 = u._tr_tally(e2, e2.strstart - e2.match_start, e2.match_length - x), e2.lookahead -= e2.match_length, e2.match_length <= e2.max_lazy_match && e2.lookahead >= x) {
              for (e2.match_length--; e2.strstart++, e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart, 0 != --e2.match_length; ) ;
              e2.strstart++;
            } else e2.strstart += e2.match_length, e2.match_length = 0, e2.ins_h = e2.window[e2.strstart], e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + 1]) & e2.hash_mask;
            else n2 = u._tr_tally(e2, 0, e2.window[e2.strstart]), e2.lookahead--, e2.strstart++;
            if (n2 && (N(e2, false), 0 === e2.strm.avail_out)) return A;
          }
          return e2.insert = e2.strstart < x - 1 ? e2.strstart : x - 1, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : e2.last_lit && (N(e2, false), 0 === e2.strm.avail_out) ? A : I;
        }
        function W(e2, t2) {
          for (var r2, n2, i2; ; ) {
            if (e2.lookahead < z) {
              if (j(e2), e2.lookahead < z && t2 === l) return A;
              if (0 === e2.lookahead) break;
            }
            if (r2 = 0, e2.lookahead >= x && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), e2.prev_length = e2.match_length, e2.prev_match = e2.match_start, e2.match_length = x - 1, 0 !== r2 && e2.prev_length < e2.max_lazy_match && e2.strstart - r2 <= e2.w_size - z && (e2.match_length = L(e2, r2), e2.match_length <= 5 && (1 === e2.strategy || e2.match_length === x && 4096 < e2.strstart - e2.match_start) && (e2.match_length = x - 1)), e2.prev_length >= x && e2.match_length <= e2.prev_length) {
              for (i2 = e2.strstart + e2.lookahead - x, n2 = u._tr_tally(e2, e2.strstart - 1 - e2.prev_match, e2.prev_length - x), e2.lookahead -= e2.prev_length - 1, e2.prev_length -= 2; ++e2.strstart <= i2 && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), 0 != --e2.prev_length; ) ;
              if (e2.match_available = 0, e2.match_length = x - 1, e2.strstart++, n2 && (N(e2, false), 0 === e2.strm.avail_out)) return A;
            } else if (e2.match_available) {
              if ((n2 = u._tr_tally(e2, 0, e2.window[e2.strstart - 1])) && N(e2, false), e2.strstart++, e2.lookahead--, 0 === e2.strm.avail_out) return A;
            } else e2.match_available = 1, e2.strstart++, e2.lookahead--;
          }
          return e2.match_available && (n2 = u._tr_tally(e2, 0, e2.window[e2.strstart - 1]), e2.match_available = 0), e2.insert = e2.strstart < x - 1 ? e2.strstart : x - 1, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : e2.last_lit && (N(e2, false), 0 === e2.strm.avail_out) ? A : I;
        }
        function M(e2, t2, r2, n2, i2) {
          this.good_length = e2, this.max_lazy = t2, this.nice_length = r2, this.max_chain = n2, this.func = i2;
        }
        function H() {
          this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = v, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new c.Buf16(2 * w), this.dyn_dtree = new c.Buf16(2 * (2 * a + 1)), this.bl_tree = new c.Buf16(2 * (2 * o + 1)), D(this.dyn_ltree), D(this.dyn_dtree), D(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new c.Buf16(k + 1), this.heap = new c.Buf16(2 * s + 1), D(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new c.Buf16(2 * s + 1), D(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
        }
        function G(e2) {
          var t2;
          return e2 && e2.state ? (e2.total_in = e2.total_out = 0, e2.data_type = i, (t2 = e2.state).pending = 0, t2.pending_out = 0, t2.wrap < 0 && (t2.wrap = -t2.wrap), t2.status = t2.wrap ? C : E, e2.adler = 2 === t2.wrap ? 0 : 1, t2.last_flush = l, u._tr_init(t2), m) : R(e2, _);
        }
        function K(e2) {
          var t2 = G(e2);
          return t2 === m && function(e3) {
            e3.window_size = 2 * e3.w_size, D(e3.head), e3.max_lazy_match = h[e3.level].max_lazy, e3.good_match = h[e3.level].good_length, e3.nice_match = h[e3.level].nice_length, e3.max_chain_length = h[e3.level].max_chain, e3.strstart = 0, e3.block_start = 0, e3.lookahead = 0, e3.insert = 0, e3.match_length = e3.prev_length = x - 1, e3.match_available = 0, e3.ins_h = 0;
          }(e2.state), t2;
        }
        function Y(e2, t2, r2, n2, i2, s2) {
          if (!e2) return _;
          var a2 = 1;
          if (t2 === g && (t2 = 6), n2 < 0 ? (a2 = 0, n2 = -n2) : 15 < n2 && (a2 = 2, n2 -= 16), i2 < 1 || y < i2 || r2 !== v || n2 < 8 || 15 < n2 || t2 < 0 || 9 < t2 || s2 < 0 || b < s2) return R(e2, _);
          8 === n2 && (n2 = 9);
          var o2 = new H();
          return (e2.state = o2).strm = e2, o2.wrap = a2, o2.gzhead = null, o2.w_bits = n2, o2.w_size = 1 << o2.w_bits, o2.w_mask = o2.w_size - 1, o2.hash_bits = i2 + 7, o2.hash_size = 1 << o2.hash_bits, o2.hash_mask = o2.hash_size - 1, o2.hash_shift = ~~((o2.hash_bits + x - 1) / x), o2.window = new c.Buf8(2 * o2.w_size), o2.head = new c.Buf16(o2.hash_size), o2.prev = new c.Buf16(o2.w_size), o2.lit_bufsize = 1 << i2 + 6, o2.pending_buf_size = 4 * o2.lit_bufsize, o2.pending_buf = new c.Buf8(o2.pending_buf_size), o2.d_buf = 1 * o2.lit_bufsize, o2.l_buf = 3 * o2.lit_bufsize, o2.level = t2, o2.strategy = s2, o2.method = r2, K(e2);
        }
        h = [new M(0, 0, 0, 0, function(e2, t2) {
          var r2 = 65535;
          for (r2 > e2.pending_buf_size - 5 && (r2 = e2.pending_buf_size - 5); ; ) {
            if (e2.lookahead <= 1) {
              if (j(e2), 0 === e2.lookahead && t2 === l) return A;
              if (0 === e2.lookahead) break;
            }
            e2.strstart += e2.lookahead, e2.lookahead = 0;
            var n2 = e2.block_start + r2;
            if ((0 === e2.strstart || e2.strstart >= n2) && (e2.lookahead = e2.strstart - n2, e2.strstart = n2, N(e2, false), 0 === e2.strm.avail_out)) return A;
            if (e2.strstart - e2.block_start >= e2.w_size - z && (N(e2, false), 0 === e2.strm.avail_out)) return A;
          }
          return e2.insert = 0, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : (e2.strstart > e2.block_start && (N(e2, false), e2.strm.avail_out), A);
        }), new M(4, 4, 8, 4, Z), new M(4, 5, 16, 8, Z), new M(4, 6, 32, 32, Z), new M(4, 4, 16, 16, W), new M(8, 16, 32, 32, W), new M(8, 16, 128, 128, W), new M(8, 32, 128, 256, W), new M(32, 128, 258, 1024, W), new M(32, 258, 258, 4096, W)], r.deflateInit = function(e2, t2) {
          return Y(e2, t2, v, 15, 8, 0);
        }, r.deflateInit2 = Y, r.deflateReset = K, r.deflateResetKeep = G, r.deflateSetHeader = function(e2, t2) {
          return e2 && e2.state ? 2 !== e2.state.wrap ? _ : (e2.state.gzhead = t2, m) : _;
        }, r.deflate = function(e2, t2) {
          var r2, n2, i2, s2;
          if (!e2 || !e2.state || 5 < t2 || t2 < 0) return e2 ? R(e2, _) : _;
          if (n2 = e2.state, !e2.output || !e2.input && 0 !== e2.avail_in || 666 === n2.status && t2 !== f) return R(e2, 0 === e2.avail_out ? -5 : _);
          if (n2.strm = e2, r2 = n2.last_flush, n2.last_flush = t2, n2.status === C) if (2 === n2.wrap) e2.adler = 0, U(n2, 31), U(n2, 139), U(n2, 8), n2.gzhead ? (U(n2, (n2.gzhead.text ? 1 : 0) + (n2.gzhead.hcrc ? 2 : 0) + (n2.gzhead.extra ? 4 : 0) + (n2.gzhead.name ? 8 : 0) + (n2.gzhead.comment ? 16 : 0)), U(n2, 255 & n2.gzhead.time), U(n2, n2.gzhead.time >> 8 & 255), U(n2, n2.gzhead.time >> 16 & 255), U(n2, n2.gzhead.time >> 24 & 255), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 255 & n2.gzhead.os), n2.gzhead.extra && n2.gzhead.extra.length && (U(n2, 255 & n2.gzhead.extra.length), U(n2, n2.gzhead.extra.length >> 8 & 255)), n2.gzhead.hcrc && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending, 0)), n2.gzindex = 0, n2.status = 69) : (U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 3), n2.status = E);
          else {
            var a2 = v + (n2.w_bits - 8 << 4) << 8;
            a2 |= (2 <= n2.strategy || n2.level < 2 ? 0 : n2.level < 6 ? 1 : 6 === n2.level ? 2 : 3) << 6, 0 !== n2.strstart && (a2 |= 32), a2 += 31 - a2 % 31, n2.status = E, P(n2, a2), 0 !== n2.strstart && (P(n2, e2.adler >>> 16), P(n2, 65535 & e2.adler)), e2.adler = 1;
          }
          if (69 === n2.status) if (n2.gzhead.extra) {
            for (i2 = n2.pending; n2.gzindex < (65535 & n2.gzhead.extra.length) && (n2.pending !== n2.pending_buf_size || (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending !== n2.pending_buf_size)); ) U(n2, 255 & n2.gzhead.extra[n2.gzindex]), n2.gzindex++;
            n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), n2.gzindex === n2.gzhead.extra.length && (n2.gzindex = 0, n2.status = 73);
          } else n2.status = 73;
          if (73 === n2.status) if (n2.gzhead.name) {
            i2 = n2.pending;
            do {
              if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                s2 = 1;
                break;
              }
              s2 = n2.gzindex < n2.gzhead.name.length ? 255 & n2.gzhead.name.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
            } while (0 !== s2);
            n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.gzindex = 0, n2.status = 91);
          } else n2.status = 91;
          if (91 === n2.status) if (n2.gzhead.comment) {
            i2 = n2.pending;
            do {
              if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                s2 = 1;
                break;
              }
              s2 = n2.gzindex < n2.gzhead.comment.length ? 255 & n2.gzhead.comment.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
            } while (0 !== s2);
            n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.status = 103);
          } else n2.status = 103;
          if (103 === n2.status && (n2.gzhead.hcrc ? (n2.pending + 2 > n2.pending_buf_size && F(e2), n2.pending + 2 <= n2.pending_buf_size && (U(n2, 255 & e2.adler), U(n2, e2.adler >> 8 & 255), e2.adler = 0, n2.status = E)) : n2.status = E), 0 !== n2.pending) {
            if (F(e2), 0 === e2.avail_out) return n2.last_flush = -1, m;
          } else if (0 === e2.avail_in && T(t2) <= T(r2) && t2 !== f) return R(e2, -5);
          if (666 === n2.status && 0 !== e2.avail_in) return R(e2, -5);
          if (0 !== e2.avail_in || 0 !== n2.lookahead || t2 !== l && 666 !== n2.status) {
            var o2 = 2 === n2.strategy ? function(e3, t3) {
              for (var r3; ; ) {
                if (0 === e3.lookahead && (j(e3), 0 === e3.lookahead)) {
                  if (t3 === l) return A;
                  break;
                }
                if (e3.match_length = 0, r3 = u._tr_tally(e3, 0, e3.window[e3.strstart]), e3.lookahead--, e3.strstart++, r3 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
              }
              return e3.insert = 0, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
            }(n2, t2) : 3 === n2.strategy ? function(e3, t3) {
              for (var r3, n3, i3, s3, a3 = e3.window; ; ) {
                if (e3.lookahead <= S) {
                  if (j(e3), e3.lookahead <= S && t3 === l) return A;
                  if (0 === e3.lookahead) break;
                }
                if (e3.match_length = 0, e3.lookahead >= x && 0 < e3.strstart && (n3 = a3[i3 = e3.strstart - 1]) === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3]) {
                  s3 = e3.strstart + S;
                  do {
                  } while (n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && i3 < s3);
                  e3.match_length = S - (s3 - i3), e3.match_length > e3.lookahead && (e3.match_length = e3.lookahead);
                }
                if (e3.match_length >= x ? (r3 = u._tr_tally(e3, 1, e3.match_length - x), e3.lookahead -= e3.match_length, e3.strstart += e3.match_length, e3.match_length = 0) : (r3 = u._tr_tally(e3, 0, e3.window[e3.strstart]), e3.lookahead--, e3.strstart++), r3 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
              }
              return e3.insert = 0, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
            }(n2, t2) : h[n2.level].func(n2, t2);
            if (o2 !== O && o2 !== B || (n2.status = 666), o2 === A || o2 === O) return 0 === e2.avail_out && (n2.last_flush = -1), m;
            if (o2 === I && (1 === t2 ? u._tr_align(n2) : 5 !== t2 && (u._tr_stored_block(n2, 0, 0, false), 3 === t2 && (D(n2.head), 0 === n2.lookahead && (n2.strstart = 0, n2.block_start = 0, n2.insert = 0))), F(e2), 0 === e2.avail_out)) return n2.last_flush = -1, m;
          }
          return t2 !== f ? m : n2.wrap <= 0 ? 1 : (2 === n2.wrap ? (U(n2, 255 & e2.adler), U(n2, e2.adler >> 8 & 255), U(n2, e2.adler >> 16 & 255), U(n2, e2.adler >> 24 & 255), U(n2, 255 & e2.total_in), U(n2, e2.total_in >> 8 & 255), U(n2, e2.total_in >> 16 & 255), U(n2, e2.total_in >> 24 & 255)) : (P(n2, e2.adler >>> 16), P(n2, 65535 & e2.adler)), F(e2), 0 < n2.wrap && (n2.wrap = -n2.wrap), 0 !== n2.pending ? m : 1);
        }, r.deflateEnd = function(e2) {
          var t2;
          return e2 && e2.state ? (t2 = e2.state.status) !== C && 69 !== t2 && 73 !== t2 && 91 !== t2 && 103 !== t2 && t2 !== E && 666 !== t2 ? R(e2, _) : (e2.state = null, t2 === E ? R(e2, -3) : m) : _;
        }, r.deflateSetDictionary = function(e2, t2) {
          var r2, n2, i2, s2, a2, o2, h2, u2, l2 = t2.length;
          if (!e2 || !e2.state) return _;
          if (2 === (s2 = (r2 = e2.state).wrap) || 1 === s2 && r2.status !== C || r2.lookahead) return _;
          for (1 === s2 && (e2.adler = d(e2.adler, t2, l2, 0)), r2.wrap = 0, l2 >= r2.w_size && (0 === s2 && (D(r2.head), r2.strstart = 0, r2.block_start = 0, r2.insert = 0), u2 = new c.Buf8(r2.w_size), c.arraySet(u2, t2, l2 - r2.w_size, r2.w_size, 0), t2 = u2, l2 = r2.w_size), a2 = e2.avail_in, o2 = e2.next_in, h2 = e2.input, e2.avail_in = l2, e2.next_in = 0, e2.input = t2, j(r2); r2.lookahead >= x; ) {
            for (n2 = r2.strstart, i2 = r2.lookahead - (x - 1); r2.ins_h = (r2.ins_h << r2.hash_shift ^ r2.window[n2 + x - 1]) & r2.hash_mask, r2.prev[n2 & r2.w_mask] = r2.head[r2.ins_h], r2.head[r2.ins_h] = n2, n2++, --i2; ) ;
            r2.strstart = n2, r2.lookahead = x - 1, j(r2);
          }
          return r2.strstart += r2.lookahead, r2.block_start = r2.strstart, r2.insert = r2.lookahead, r2.lookahead = 0, r2.match_length = r2.prev_length = x - 1, r2.match_available = 0, e2.next_in = o2, e2.input = h2, e2.avail_in = a2, r2.wrap = s2, m;
        }, r.deflateInfo = "pako deflate (from Nodeca project)";
      }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./messages": 51, "./trees": 52 }], 47: [function(e, t, r) {
        t.exports = function() {
          this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = false;
        };
      }, {}], 48: [function(e, t, r) {
        t.exports = function(e2, t2) {
          var r2, n, i, s, a, o, h, u, l, f, c, d, p, m, _, g, b, v, y, w, k, x, S, z, C;
          r2 = e2.state, n = e2.next_in, z = e2.input, i = n + (e2.avail_in - 5), s = e2.next_out, C = e2.output, a = s - (t2 - e2.avail_out), o = s + (e2.avail_out - 257), h = r2.dmax, u = r2.wsize, l = r2.whave, f = r2.wnext, c = r2.window, d = r2.hold, p = r2.bits, m = r2.lencode, _ = r2.distcode, g = (1 << r2.lenbits) - 1, b = (1 << r2.distbits) - 1;
          e: do {
            p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = m[d & g];
            t: for (; ; ) {
              if (d >>>= y = v >>> 24, p -= y, 0 === (y = v >>> 16 & 255)) C[s++] = 65535 & v;
              else {
                if (!(16 & y)) {
                  if (0 == (64 & y)) {
                    v = m[(65535 & v) + (d & (1 << y) - 1)];
                    continue t;
                  }
                  if (32 & y) {
                    r2.mode = 12;
                    break e;
                  }
                  e2.msg = "invalid literal/length code", r2.mode = 30;
                  break e;
                }
                w = 65535 & v, (y &= 15) && (p < y && (d += z[n++] << p, p += 8), w += d & (1 << y) - 1, d >>>= y, p -= y), p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = _[d & b];
                r: for (; ; ) {
                  if (d >>>= y = v >>> 24, p -= y, !(16 & (y = v >>> 16 & 255))) {
                    if (0 == (64 & y)) {
                      v = _[(65535 & v) + (d & (1 << y) - 1)];
                      continue r;
                    }
                    e2.msg = "invalid distance code", r2.mode = 30;
                    break e;
                  }
                  if (k = 65535 & v, p < (y &= 15) && (d += z[n++] << p, (p += 8) < y && (d += z[n++] << p, p += 8)), h < (k += d & (1 << y) - 1)) {
                    e2.msg = "invalid distance too far back", r2.mode = 30;
                    break e;
                  }
                  if (d >>>= y, p -= y, (y = s - a) < k) {
                    if (l < (y = k - y) && r2.sane) {
                      e2.msg = "invalid distance too far back", r2.mode = 30;
                      break e;
                    }
                    if (S = c, (x = 0) === f) {
                      if (x += u - y, y < w) {
                        for (w -= y; C[s++] = c[x++], --y; ) ;
                        x = s - k, S = C;
                      }
                    } else if (f < y) {
                      if (x += u + f - y, (y -= f) < w) {
                        for (w -= y; C[s++] = c[x++], --y; ) ;
                        if (x = 0, f < w) {
                          for (w -= y = f; C[s++] = c[x++], --y; ) ;
                          x = s - k, S = C;
                        }
                      }
                    } else if (x += f - y, y < w) {
                      for (w -= y; C[s++] = c[x++], --y; ) ;
                      x = s - k, S = C;
                    }
                    for (; 2 < w; ) C[s++] = S[x++], C[s++] = S[x++], C[s++] = S[x++], w -= 3;
                    w && (C[s++] = S[x++], 1 < w && (C[s++] = S[x++]));
                  } else {
                    for (x = s - k; C[s++] = C[x++], C[s++] = C[x++], C[s++] = C[x++], 2 < (w -= 3); ) ;
                    w && (C[s++] = C[x++], 1 < w && (C[s++] = C[x++]));
                  }
                  break;
                }
              }
              break;
            }
          } while (n < i && s < o);
          n -= w = p >> 3, d &= (1 << (p -= w << 3)) - 1, e2.next_in = n, e2.next_out = s, e2.avail_in = n < i ? i - n + 5 : 5 - (n - i), e2.avail_out = s < o ? o - s + 257 : 257 - (s - o), r2.hold = d, r2.bits = p;
        };
      }, {}], 49: [function(e, t, r) {
        var I = e("../utils/common"), O = e("./adler32"), B = e("./crc32"), R = e("./inffast"), T = e("./inftrees"), D = 1, F = 2, N = 0, U = -2, P = 1, n = 852, i = 592;
        function L(e2) {
          return (e2 >>> 24 & 255) + (e2 >>> 8 & 65280) + ((65280 & e2) << 8) + ((255 & e2) << 24);
        }
        function s() {
          this.mode = 0, this.last = false, this.wrap = 0, this.havedict = false, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new I.Buf16(320), this.work = new I.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
        }
        function a(e2) {
          var t2;
          return e2 && e2.state ? (t2 = e2.state, e2.total_in = e2.total_out = t2.total = 0, e2.msg = "", t2.wrap && (e2.adler = 1 & t2.wrap), t2.mode = P, t2.last = 0, t2.havedict = 0, t2.dmax = 32768, t2.head = null, t2.hold = 0, t2.bits = 0, t2.lencode = t2.lendyn = new I.Buf32(n), t2.distcode = t2.distdyn = new I.Buf32(i), t2.sane = 1, t2.back = -1, N) : U;
        }
        function o(e2) {
          var t2;
          return e2 && e2.state ? ((t2 = e2.state).wsize = 0, t2.whave = 0, t2.wnext = 0, a(e2)) : U;
        }
        function h(e2, t2) {
          var r2, n2;
          return e2 && e2.state ? (n2 = e2.state, t2 < 0 ? (r2 = 0, t2 = -t2) : (r2 = 1 + (t2 >> 4), t2 < 48 && (t2 &= 15)), t2 && (t2 < 8 || 15 < t2) ? U : (null !== n2.window && n2.wbits !== t2 && (n2.window = null), n2.wrap = r2, n2.wbits = t2, o(e2))) : U;
        }
        function u(e2, t2) {
          var r2, n2;
          return e2 ? (n2 = new s(), (e2.state = n2).window = null, (r2 = h(e2, t2)) !== N && (e2.state = null), r2) : U;
        }
        var l, f, c = true;
        function j(e2) {
          if (c) {
            var t2;
            for (l = new I.Buf32(512), f = new I.Buf32(32), t2 = 0; t2 < 144; ) e2.lens[t2++] = 8;
            for (; t2 < 256; ) e2.lens[t2++] = 9;
            for (; t2 < 280; ) e2.lens[t2++] = 7;
            for (; t2 < 288; ) e2.lens[t2++] = 8;
            for (T(D, e2.lens, 0, 288, l, 0, e2.work, { bits: 9 }), t2 = 0; t2 < 32; ) e2.lens[t2++] = 5;
            T(F, e2.lens, 0, 32, f, 0, e2.work, { bits: 5 }), c = false;
          }
          e2.lencode = l, e2.lenbits = 9, e2.distcode = f, e2.distbits = 5;
        }
        function Z(e2, t2, r2, n2) {
          var i2, s2 = e2.state;
          return null === s2.window && (s2.wsize = 1 << s2.wbits, s2.wnext = 0, s2.whave = 0, s2.window = new I.Buf8(s2.wsize)), n2 >= s2.wsize ? (I.arraySet(s2.window, t2, r2 - s2.wsize, s2.wsize, 0), s2.wnext = 0, s2.whave = s2.wsize) : (n2 < (i2 = s2.wsize - s2.wnext) && (i2 = n2), I.arraySet(s2.window, t2, r2 - n2, i2, s2.wnext), (n2 -= i2) ? (I.arraySet(s2.window, t2, r2 - n2, n2, 0), s2.wnext = n2, s2.whave = s2.wsize) : (s2.wnext += i2, s2.wnext === s2.wsize && (s2.wnext = 0), s2.whave < s2.wsize && (s2.whave += i2))), 0;
        }
        r.inflateReset = o, r.inflateReset2 = h, r.inflateResetKeep = a, r.inflateInit = function(e2) {
          return u(e2, 15);
        }, r.inflateInit2 = u, r.inflate = function(e2, t2) {
          var r2, n2, i2, s2, a2, o2, h2, u2, l2, f2, c2, d, p, m, _, g, b, v, y, w, k, x, S, z, C = 0, E = new I.Buf8(4), A = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
          if (!e2 || !e2.state || !e2.output || !e2.input && 0 !== e2.avail_in) return U;
          12 === (r2 = e2.state).mode && (r2.mode = 13), a2 = e2.next_out, i2 = e2.output, h2 = e2.avail_out, s2 = e2.next_in, n2 = e2.input, o2 = e2.avail_in, u2 = r2.hold, l2 = r2.bits, f2 = o2, c2 = h2, x = N;
          e: for (; ; ) switch (r2.mode) {
            case P:
              if (0 === r2.wrap) {
                r2.mode = 13;
                break;
              }
              for (; l2 < 16; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (2 & r2.wrap && 35615 === u2) {
                E[r2.check = 0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0), l2 = u2 = 0, r2.mode = 2;
                break;
              }
              if (r2.flags = 0, r2.head && (r2.head.done = false), !(1 & r2.wrap) || (((255 & u2) << 8) + (u2 >> 8)) % 31) {
                e2.msg = "incorrect header check", r2.mode = 30;
                break;
              }
              if (8 != (15 & u2)) {
                e2.msg = "unknown compression method", r2.mode = 30;
                break;
              }
              if (l2 -= 4, k = 8 + (15 & (u2 >>>= 4)), 0 === r2.wbits) r2.wbits = k;
              else if (k > r2.wbits) {
                e2.msg = "invalid window size", r2.mode = 30;
                break;
              }
              r2.dmax = 1 << k, e2.adler = r2.check = 1, r2.mode = 512 & u2 ? 10 : 12, l2 = u2 = 0;
              break;
            case 2:
              for (; l2 < 16; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (r2.flags = u2, 8 != (255 & r2.flags)) {
                e2.msg = "unknown compression method", r2.mode = 30;
                break;
              }
              if (57344 & r2.flags) {
                e2.msg = "unknown header flags set", r2.mode = 30;
                break;
              }
              r2.head && (r2.head.text = u2 >> 8 & 1), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 3;
            case 3:
              for (; l2 < 32; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              r2.head && (r2.head.time = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, E[2] = u2 >>> 16 & 255, E[3] = u2 >>> 24 & 255, r2.check = B(r2.check, E, 4, 0)), l2 = u2 = 0, r2.mode = 4;
            case 4:
              for (; l2 < 16; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              r2.head && (r2.head.xflags = 255 & u2, r2.head.os = u2 >> 8), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 5;
            case 5:
              if (1024 & r2.flags) {
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.length = u2, r2.head && (r2.head.extra_len = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0;
              } else r2.head && (r2.head.extra = null);
              r2.mode = 6;
            case 6:
              if (1024 & r2.flags && (o2 < (d = r2.length) && (d = o2), d && (r2.head && (k = r2.head.extra_len - r2.length, r2.head.extra || (r2.head.extra = new Array(r2.head.extra_len)), I.arraySet(r2.head.extra, n2, s2, d, k)), 512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, r2.length -= d), r2.length)) break e;
              r2.length = 0, r2.mode = 7;
            case 7:
              if (2048 & r2.flags) {
                if (0 === o2) break e;
                for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.name += String.fromCharCode(k)), k && d < o2; ) ;
                if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
              } else r2.head && (r2.head.name = null);
              r2.length = 0, r2.mode = 8;
            case 8:
              if (4096 & r2.flags) {
                if (0 === o2) break e;
                for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.comment += String.fromCharCode(k)), k && d < o2; ) ;
                if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
              } else r2.head && (r2.head.comment = null);
              r2.mode = 9;
            case 9:
              if (512 & r2.flags) {
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (u2 !== (65535 & r2.check)) {
                  e2.msg = "header crc mismatch", r2.mode = 30;
                  break;
                }
                l2 = u2 = 0;
              }
              r2.head && (r2.head.hcrc = r2.flags >> 9 & 1, r2.head.done = true), e2.adler = r2.check = 0, r2.mode = 12;
              break;
            case 10:
              for (; l2 < 32; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              e2.adler = r2.check = L(u2), l2 = u2 = 0, r2.mode = 11;
            case 11:
              if (0 === r2.havedict) return e2.next_out = a2, e2.avail_out = h2, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, 2;
              e2.adler = r2.check = 1, r2.mode = 12;
            case 12:
              if (5 === t2 || 6 === t2) break e;
            case 13:
              if (r2.last) {
                u2 >>>= 7 & l2, l2 -= 7 & l2, r2.mode = 27;
                break;
              }
              for (; l2 < 3; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              switch (r2.last = 1 & u2, l2 -= 1, 3 & (u2 >>>= 1)) {
                case 0:
                  r2.mode = 14;
                  break;
                case 1:
                  if (j(r2), r2.mode = 20, 6 !== t2) break;
                  u2 >>>= 2, l2 -= 2;
                  break e;
                case 2:
                  r2.mode = 17;
                  break;
                case 3:
                  e2.msg = "invalid block type", r2.mode = 30;
              }
              u2 >>>= 2, l2 -= 2;
              break;
            case 14:
              for (u2 >>>= 7 & l2, l2 -= 7 & l2; l2 < 32; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if ((65535 & u2) != (u2 >>> 16 ^ 65535)) {
                e2.msg = "invalid stored block lengths", r2.mode = 30;
                break;
              }
              if (r2.length = 65535 & u2, l2 = u2 = 0, r2.mode = 15, 6 === t2) break e;
            case 15:
              r2.mode = 16;
            case 16:
              if (d = r2.length) {
                if (o2 < d && (d = o2), h2 < d && (d = h2), 0 === d) break e;
                I.arraySet(i2, n2, s2, d, a2), o2 -= d, s2 += d, h2 -= d, a2 += d, r2.length -= d;
                break;
              }
              r2.mode = 12;
              break;
            case 17:
              for (; l2 < 14; ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (r2.nlen = 257 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ndist = 1 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ncode = 4 + (15 & u2), u2 >>>= 4, l2 -= 4, 286 < r2.nlen || 30 < r2.ndist) {
                e2.msg = "too many length or distance symbols", r2.mode = 30;
                break;
              }
              r2.have = 0, r2.mode = 18;
            case 18:
              for (; r2.have < r2.ncode; ) {
                for (; l2 < 3; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.lens[A[r2.have++]] = 7 & u2, u2 >>>= 3, l2 -= 3;
              }
              for (; r2.have < 19; ) r2.lens[A[r2.have++]] = 0;
              if (r2.lencode = r2.lendyn, r2.lenbits = 7, S = { bits: r2.lenbits }, x = T(0, r2.lens, 0, 19, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                e2.msg = "invalid code lengths set", r2.mode = 30;
                break;
              }
              r2.have = 0, r2.mode = 19;
            case 19:
              for (; r2.have < r2.nlen + r2.ndist; ) {
                for (; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (b < 16) u2 >>>= _, l2 -= _, r2.lens[r2.have++] = b;
                else {
                  if (16 === b) {
                    for (z = _ + 2; l2 < z; ) {
                      if (0 === o2) break e;
                      o2--, u2 += n2[s2++] << l2, l2 += 8;
                    }
                    if (u2 >>>= _, l2 -= _, 0 === r2.have) {
                      e2.msg = "invalid bit length repeat", r2.mode = 30;
                      break;
                    }
                    k = r2.lens[r2.have - 1], d = 3 + (3 & u2), u2 >>>= 2, l2 -= 2;
                  } else if (17 === b) {
                    for (z = _ + 3; l2 < z; ) {
                      if (0 === o2) break e;
                      o2--, u2 += n2[s2++] << l2, l2 += 8;
                    }
                    l2 -= _, k = 0, d = 3 + (7 & (u2 >>>= _)), u2 >>>= 3, l2 -= 3;
                  } else {
                    for (z = _ + 7; l2 < z; ) {
                      if (0 === o2) break e;
                      o2--, u2 += n2[s2++] << l2, l2 += 8;
                    }
                    l2 -= _, k = 0, d = 11 + (127 & (u2 >>>= _)), u2 >>>= 7, l2 -= 7;
                  }
                  if (r2.have + d > r2.nlen + r2.ndist) {
                    e2.msg = "invalid bit length repeat", r2.mode = 30;
                    break;
                  }
                  for (; d--; ) r2.lens[r2.have++] = k;
                }
              }
              if (30 === r2.mode) break;
              if (0 === r2.lens[256]) {
                e2.msg = "invalid code -- missing end-of-block", r2.mode = 30;
                break;
              }
              if (r2.lenbits = 9, S = { bits: r2.lenbits }, x = T(D, r2.lens, 0, r2.nlen, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                e2.msg = "invalid literal/lengths set", r2.mode = 30;
                break;
              }
              if (r2.distbits = 6, r2.distcode = r2.distdyn, S = { bits: r2.distbits }, x = T(F, r2.lens, r2.nlen, r2.ndist, r2.distcode, 0, r2.work, S), r2.distbits = S.bits, x) {
                e2.msg = "invalid distances set", r2.mode = 30;
                break;
              }
              if (r2.mode = 20, 6 === t2) break e;
            case 20:
              r2.mode = 21;
            case 21:
              if (6 <= o2 && 258 <= h2) {
                e2.next_out = a2, e2.avail_out = h2, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, R(e2, c2), a2 = e2.next_out, i2 = e2.output, h2 = e2.avail_out, s2 = e2.next_in, n2 = e2.input, o2 = e2.avail_in, u2 = r2.hold, l2 = r2.bits, 12 === r2.mode && (r2.back = -1);
                break;
              }
              for (r2.back = 0; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (g && 0 == (240 & g)) {
                for (v = _, y = g, w = b; g = (C = r2.lencode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                u2 >>>= v, l2 -= v, r2.back += v;
              }
              if (u2 >>>= _, l2 -= _, r2.back += _, r2.length = b, 0 === g) {
                r2.mode = 26;
                break;
              }
              if (32 & g) {
                r2.back = -1, r2.mode = 12;
                break;
              }
              if (64 & g) {
                e2.msg = "invalid literal/length code", r2.mode = 30;
                break;
              }
              r2.extra = 15 & g, r2.mode = 22;
            case 22:
              if (r2.extra) {
                for (z = r2.extra; l2 < z; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.length += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
              }
              r2.was = r2.length, r2.mode = 23;
            case 23:
              for (; g = (C = r2.distcode[u2 & (1 << r2.distbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                if (0 === o2) break e;
                o2--, u2 += n2[s2++] << l2, l2 += 8;
              }
              if (0 == (240 & g)) {
                for (v = _, y = g, w = b; g = (C = r2.distcode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                u2 >>>= v, l2 -= v, r2.back += v;
              }
              if (u2 >>>= _, l2 -= _, r2.back += _, 64 & g) {
                e2.msg = "invalid distance code", r2.mode = 30;
                break;
              }
              r2.offset = b, r2.extra = 15 & g, r2.mode = 24;
            case 24:
              if (r2.extra) {
                for (z = r2.extra; l2 < z; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.offset += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
              }
              if (r2.offset > r2.dmax) {
                e2.msg = "invalid distance too far back", r2.mode = 30;
                break;
              }
              r2.mode = 25;
            case 25:
              if (0 === h2) break e;
              if (d = c2 - h2, r2.offset > d) {
                if ((d = r2.offset - d) > r2.whave && r2.sane) {
                  e2.msg = "invalid distance too far back", r2.mode = 30;
                  break;
                }
                p = d > r2.wnext ? (d -= r2.wnext, r2.wsize - d) : r2.wnext - d, d > r2.length && (d = r2.length), m = r2.window;
              } else m = i2, p = a2 - r2.offset, d = r2.length;
              for (h2 < d && (d = h2), h2 -= d, r2.length -= d; i2[a2++] = m[p++], --d; ) ;
              0 === r2.length && (r2.mode = 21);
              break;
            case 26:
              if (0 === h2) break e;
              i2[a2++] = r2.length, h2--, r2.mode = 21;
              break;
            case 27:
              if (r2.wrap) {
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 |= n2[s2++] << l2, l2 += 8;
                }
                if (c2 -= h2, e2.total_out += c2, r2.total += c2, c2 && (e2.adler = r2.check = r2.flags ? B(r2.check, i2, c2, a2 - c2) : O(r2.check, i2, c2, a2 - c2)), c2 = h2, (r2.flags ? u2 : L(u2)) !== r2.check) {
                  e2.msg = "incorrect data check", r2.mode = 30;
                  break;
                }
                l2 = u2 = 0;
              }
              r2.mode = 28;
            case 28:
              if (r2.wrap && r2.flags) {
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (u2 !== (4294967295 & r2.total)) {
                  e2.msg = "incorrect length check", r2.mode = 30;
                  break;
                }
                l2 = u2 = 0;
              }
              r2.mode = 29;
            case 29:
              x = 1;
              break e;
            case 30:
              x = -3;
              break e;
            case 31:
              return -4;
            case 32:
            default:
              return U;
          }
          return e2.next_out = a2, e2.avail_out = h2, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, (r2.wsize || c2 !== e2.avail_out && r2.mode < 30 && (r2.mode < 27 || 4 !== t2)) && Z(e2, e2.output, e2.next_out, c2 - e2.avail_out) ? (r2.mode = 31, -4) : (f2 -= e2.avail_in, c2 -= e2.avail_out, e2.total_in += f2, e2.total_out += c2, r2.total += c2, r2.wrap && c2 && (e2.adler = r2.check = r2.flags ? B(r2.check, i2, c2, e2.next_out - c2) : O(r2.check, i2, c2, e2.next_out - c2)), e2.data_type = r2.bits + (r2.last ? 64 : 0) + (12 === r2.mode ? 128 : 0) + (20 === r2.mode || 15 === r2.mode ? 256 : 0), (0 == f2 && 0 === c2 || 4 === t2) && x === N && (x = -5), x);
        }, r.inflateEnd = function(e2) {
          if (!e2 || !e2.state) return U;
          var t2 = e2.state;
          return t2.window && (t2.window = null), e2.state = null, N;
        }, r.inflateGetHeader = function(e2, t2) {
          var r2;
          return e2 && e2.state ? 0 == (2 & (r2 = e2.state).wrap) ? U : ((r2.head = t2).done = false, N) : U;
        }, r.inflateSetDictionary = function(e2, t2) {
          var r2, n2 = t2.length;
          return e2 && e2.state ? 0 !== (r2 = e2.state).wrap && 11 !== r2.mode ? U : 11 === r2.mode && O(1, t2, n2, 0) !== r2.check ? -3 : Z(e2, t2, n2, n2) ? (r2.mode = 31, -4) : (r2.havedict = 1, N) : U;
        }, r.inflateInfo = "pako inflate (from Nodeca project)";
      }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./inffast": 48, "./inftrees": 50 }], 50: [function(e, t, r) {
        var D = e("../utils/common"), F = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0], N = [16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78], U = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0], P = [16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64];
        t.exports = function(e2, t2, r2, n, i, s, a, o) {
          var h, u, l, f, c, d, p, m, _, g = o.bits, b = 0, v = 0, y = 0, w = 0, k = 0, x = 0, S = 0, z = 0, C = 0, E = 0, A = null, I = 0, O = new D.Buf16(16), B = new D.Buf16(16), R = null, T = 0;
          for (b = 0; b <= 15; b++) O[b] = 0;
          for (v = 0; v < n; v++) O[t2[r2 + v]]++;
          for (k = g, w = 15; 1 <= w && 0 === O[w]; w--) ;
          if (w < k && (k = w), 0 === w) return i[s++] = 20971520, i[s++] = 20971520, o.bits = 1, 0;
          for (y = 1; y < w && 0 === O[y]; y++) ;
          for (k < y && (k = y), b = z = 1; b <= 15; b++) if (z <<= 1, (z -= O[b]) < 0) return -1;
          if (0 < z && (0 === e2 || 1 !== w)) return -1;
          for (B[1] = 0, b = 1; b < 15; b++) B[b + 1] = B[b] + O[b];
          for (v = 0; v < n; v++) 0 !== t2[r2 + v] && (a[B[t2[r2 + v]]++] = v);
          if (d = 0 === e2 ? (A = R = a, 19) : 1 === e2 ? (A = F, I -= 257, R = N, T -= 257, 256) : (A = U, R = P, -1), b = y, c = s, S = v = E = 0, l = -1, f = (C = 1 << (x = k)) - 1, 1 === e2 && 852 < C || 2 === e2 && 592 < C) return 1;
          for (; ; ) {
            for (p = b - S, _ = a[v] < d ? (m = 0, a[v]) : a[v] > d ? (m = R[T + a[v]], A[I + a[v]]) : (m = 96, 0), h = 1 << b - S, y = u = 1 << x; i[c + (E >> S) + (u -= h)] = p << 24 | m << 16 | _ | 0, 0 !== u; ) ;
            for (h = 1 << b - 1; E & h; ) h >>= 1;
            if (0 !== h ? (E &= h - 1, E += h) : E = 0, v++, 0 == --O[b]) {
              if (b === w) break;
              b = t2[r2 + a[v]];
            }
            if (k < b && (E & f) !== l) {
              for (0 === S && (S = k), c += y, z = 1 << (x = b - S); x + S < w && !((z -= O[x + S]) <= 0); ) x++, z <<= 1;
              if (C += 1 << x, 1 === e2 && 852 < C || 2 === e2 && 592 < C) return 1;
              i[l = E & f] = k << 24 | x << 16 | c - s | 0;
            }
          }
          return 0 !== E && (i[c + E] = b - S << 24 | 64 << 16 | 0), o.bits = k, 0;
        };
      }, { "../utils/common": 41 }], 51: [function(e, t, r) {
        t.exports = { 2: "need dictionary", 1: "stream end", 0: "", "-1": "file error", "-2": "stream error", "-3": "data error", "-4": "insufficient memory", "-5": "buffer error", "-6": "incompatible version" };
      }, {}], 52: [function(e, t, r) {
        var i = e("../utils/common"), o = 0, h = 1;
        function n(e2) {
          for (var t2 = e2.length; 0 <= --t2; ) e2[t2] = 0;
        }
        var s = 0, a = 29, u = 256, l = u + 1 + a, f = 30, c = 19, _ = 2 * l + 1, g = 15, d = 16, p = 7, m = 256, b = 16, v = 17, y = 18, w = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0], k = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13], x = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7], S = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], z = new Array(2 * (l + 2));
        n(z);
        var C = new Array(2 * f);
        n(C);
        var E = new Array(512);
        n(E);
        var A = new Array(256);
        n(A);
        var I = new Array(a);
        n(I);
        var O, B, R, T = new Array(f);
        function D(e2, t2, r2, n2, i2) {
          this.static_tree = e2, this.extra_bits = t2, this.extra_base = r2, this.elems = n2, this.max_length = i2, this.has_stree = e2 && e2.length;
        }
        function F(e2, t2) {
          this.dyn_tree = e2, this.max_code = 0, this.stat_desc = t2;
        }
        function N(e2) {
          return e2 < 256 ? E[e2] : E[256 + (e2 >>> 7)];
        }
        function U(e2, t2) {
          e2.pending_buf[e2.pending++] = 255 & t2, e2.pending_buf[e2.pending++] = t2 >>> 8 & 255;
        }
        function P(e2, t2, r2) {
          e2.bi_valid > d - r2 ? (e2.bi_buf |= t2 << e2.bi_valid & 65535, U(e2, e2.bi_buf), e2.bi_buf = t2 >> d - e2.bi_valid, e2.bi_valid += r2 - d) : (e2.bi_buf |= t2 << e2.bi_valid & 65535, e2.bi_valid += r2);
        }
        function L(e2, t2, r2) {
          P(e2, r2[2 * t2], r2[2 * t2 + 1]);
        }
        function j(e2, t2) {
          for (var r2 = 0; r2 |= 1 & e2, e2 >>>= 1, r2 <<= 1, 0 < --t2; ) ;
          return r2 >>> 1;
        }
        function Z(e2, t2, r2) {
          var n2, i2, s2 = new Array(g + 1), a2 = 0;
          for (n2 = 1; n2 <= g; n2++) s2[n2] = a2 = a2 + r2[n2 - 1] << 1;
          for (i2 = 0; i2 <= t2; i2++) {
            var o2 = e2[2 * i2 + 1];
            0 !== o2 && (e2[2 * i2] = j(s2[o2]++, o2));
          }
        }
        function W(e2) {
          var t2;
          for (t2 = 0; t2 < l; t2++) e2.dyn_ltree[2 * t2] = 0;
          for (t2 = 0; t2 < f; t2++) e2.dyn_dtree[2 * t2] = 0;
          for (t2 = 0; t2 < c; t2++) e2.bl_tree[2 * t2] = 0;
          e2.dyn_ltree[2 * m] = 1, e2.opt_len = e2.static_len = 0, e2.last_lit = e2.matches = 0;
        }
        function M(e2) {
          8 < e2.bi_valid ? U(e2, e2.bi_buf) : 0 < e2.bi_valid && (e2.pending_buf[e2.pending++] = e2.bi_buf), e2.bi_buf = 0, e2.bi_valid = 0;
        }
        function H(e2, t2, r2, n2) {
          var i2 = 2 * t2, s2 = 2 * r2;
          return e2[i2] < e2[s2] || e2[i2] === e2[s2] && n2[t2] <= n2[r2];
        }
        function G(e2, t2, r2) {
          for (var n2 = e2.heap[r2], i2 = r2 << 1; i2 <= e2.heap_len && (i2 < e2.heap_len && H(t2, e2.heap[i2 + 1], e2.heap[i2], e2.depth) && i2++, !H(t2, n2, e2.heap[i2], e2.depth)); ) e2.heap[r2] = e2.heap[i2], r2 = i2, i2 <<= 1;
          e2.heap[r2] = n2;
        }
        function K(e2, t2, r2) {
          var n2, i2, s2, a2, o2 = 0;
          if (0 !== e2.last_lit) for (; n2 = e2.pending_buf[e2.d_buf + 2 * o2] << 8 | e2.pending_buf[e2.d_buf + 2 * o2 + 1], i2 = e2.pending_buf[e2.l_buf + o2], o2++, 0 === n2 ? L(e2, i2, t2) : (L(e2, (s2 = A[i2]) + u + 1, t2), 0 !== (a2 = w[s2]) && P(e2, i2 -= I[s2], a2), L(e2, s2 = N(--n2), r2), 0 !== (a2 = k[s2]) && P(e2, n2 -= T[s2], a2)), o2 < e2.last_lit; ) ;
          L(e2, m, t2);
        }
        function Y(e2, t2) {
          var r2, n2, i2, s2 = t2.dyn_tree, a2 = t2.stat_desc.static_tree, o2 = t2.stat_desc.has_stree, h2 = t2.stat_desc.elems, u2 = -1;
          for (e2.heap_len = 0, e2.heap_max = _, r2 = 0; r2 < h2; r2++) 0 !== s2[2 * r2] ? (e2.heap[++e2.heap_len] = u2 = r2, e2.depth[r2] = 0) : s2[2 * r2 + 1] = 0;
          for (; e2.heap_len < 2; ) s2[2 * (i2 = e2.heap[++e2.heap_len] = u2 < 2 ? ++u2 : 0)] = 1, e2.depth[i2] = 0, e2.opt_len--, o2 && (e2.static_len -= a2[2 * i2 + 1]);
          for (t2.max_code = u2, r2 = e2.heap_len >> 1; 1 <= r2; r2--) G(e2, s2, r2);
          for (i2 = h2; r2 = e2.heap[1], e2.heap[1] = e2.heap[e2.heap_len--], G(e2, s2, 1), n2 = e2.heap[1], e2.heap[--e2.heap_max] = r2, e2.heap[--e2.heap_max] = n2, s2[2 * i2] = s2[2 * r2] + s2[2 * n2], e2.depth[i2] = (e2.depth[r2] >= e2.depth[n2] ? e2.depth[r2] : e2.depth[n2]) + 1, s2[2 * r2 + 1] = s2[2 * n2 + 1] = i2, e2.heap[1] = i2++, G(e2, s2, 1), 2 <= e2.heap_len; ) ;
          e2.heap[--e2.heap_max] = e2.heap[1], function(e3, t3) {
            var r3, n3, i3, s3, a3, o3, h3 = t3.dyn_tree, u3 = t3.max_code, l2 = t3.stat_desc.static_tree, f2 = t3.stat_desc.has_stree, c2 = t3.stat_desc.extra_bits, d2 = t3.stat_desc.extra_base, p2 = t3.stat_desc.max_length, m2 = 0;
            for (s3 = 0; s3 <= g; s3++) e3.bl_count[s3] = 0;
            for (h3[2 * e3.heap[e3.heap_max] + 1] = 0, r3 = e3.heap_max + 1; r3 < _; r3++) p2 < (s3 = h3[2 * h3[2 * (n3 = e3.heap[r3]) + 1] + 1] + 1) && (s3 = p2, m2++), h3[2 * n3 + 1] = s3, u3 < n3 || (e3.bl_count[s3]++, a3 = 0, d2 <= n3 && (a3 = c2[n3 - d2]), o3 = h3[2 * n3], e3.opt_len += o3 * (s3 + a3), f2 && (e3.static_len += o3 * (l2[2 * n3 + 1] + a3)));
            if (0 !== m2) {
              do {
                for (s3 = p2 - 1; 0 === e3.bl_count[s3]; ) s3--;
                e3.bl_count[s3]--, e3.bl_count[s3 + 1] += 2, e3.bl_count[p2]--, m2 -= 2;
              } while (0 < m2);
              for (s3 = p2; 0 !== s3; s3--) for (n3 = e3.bl_count[s3]; 0 !== n3; ) u3 < (i3 = e3.heap[--r3]) || (h3[2 * i3 + 1] !== s3 && (e3.opt_len += (s3 - h3[2 * i3 + 1]) * h3[2 * i3], h3[2 * i3 + 1] = s3), n3--);
            }
          }(e2, t2), Z(s2, u2, e2.bl_count);
        }
        function X(e2, t2, r2) {
          var n2, i2, s2 = -1, a2 = t2[1], o2 = 0, h2 = 7, u2 = 4;
          for (0 === a2 && (h2 = 138, u2 = 3), t2[2 * (r2 + 1) + 1] = 65535, n2 = 0; n2 <= r2; n2++) i2 = a2, a2 = t2[2 * (n2 + 1) + 1], ++o2 < h2 && i2 === a2 || (o2 < u2 ? e2.bl_tree[2 * i2] += o2 : 0 !== i2 ? (i2 !== s2 && e2.bl_tree[2 * i2]++, e2.bl_tree[2 * b]++) : o2 <= 10 ? e2.bl_tree[2 * v]++ : e2.bl_tree[2 * y]++, s2 = i2, u2 = (o2 = 0) === a2 ? (h2 = 138, 3) : i2 === a2 ? (h2 = 6, 3) : (h2 = 7, 4));
        }
        function V(e2, t2, r2) {
          var n2, i2, s2 = -1, a2 = t2[1], o2 = 0, h2 = 7, u2 = 4;
          for (0 === a2 && (h2 = 138, u2 = 3), n2 = 0; n2 <= r2; n2++) if (i2 = a2, a2 = t2[2 * (n2 + 1) + 1], !(++o2 < h2 && i2 === a2)) {
            if (o2 < u2) for (; L(e2, i2, e2.bl_tree), 0 != --o2; ) ;
            else 0 !== i2 ? (i2 !== s2 && (L(e2, i2, e2.bl_tree), o2--), L(e2, b, e2.bl_tree), P(e2, o2 - 3, 2)) : o2 <= 10 ? (L(e2, v, e2.bl_tree), P(e2, o2 - 3, 3)) : (L(e2, y, e2.bl_tree), P(e2, o2 - 11, 7));
            s2 = i2, u2 = (o2 = 0) === a2 ? (h2 = 138, 3) : i2 === a2 ? (h2 = 6, 3) : (h2 = 7, 4);
          }
        }
        n(T);
        var q = false;
        function J(e2, t2, r2, n2) {
          P(e2, (s << 1) + (n2 ? 1 : 0), 3), function(e3, t3, r3, n3) {
            M(e3), U(e3, r3), U(e3, ~r3), i.arraySet(e3.pending_buf, e3.window, t3, r3, e3.pending), e3.pending += r3;
          }(e2, t2, r2);
        }
        r._tr_init = function(e2) {
          q || (function() {
            var e3, t2, r2, n2, i2, s2 = new Array(g + 1);
            for (n2 = r2 = 0; n2 < a - 1; n2++) for (I[n2] = r2, e3 = 0; e3 < 1 << w[n2]; e3++) A[r2++] = n2;
            for (A[r2 - 1] = n2, n2 = i2 = 0; n2 < 16; n2++) for (T[n2] = i2, e3 = 0; e3 < 1 << k[n2]; e3++) E[i2++] = n2;
            for (i2 >>= 7; n2 < f; n2++) for (T[n2] = i2 << 7, e3 = 0; e3 < 1 << k[n2] - 7; e3++) E[256 + i2++] = n2;
            for (t2 = 0; t2 <= g; t2++) s2[t2] = 0;
            for (e3 = 0; e3 <= 143; ) z[2 * e3 + 1] = 8, e3++, s2[8]++;
            for (; e3 <= 255; ) z[2 * e3 + 1] = 9, e3++, s2[9]++;
            for (; e3 <= 279; ) z[2 * e3 + 1] = 7, e3++, s2[7]++;
            for (; e3 <= 287; ) z[2 * e3 + 1] = 8, e3++, s2[8]++;
            for (Z(z, l + 1, s2), e3 = 0; e3 < f; e3++) C[2 * e3 + 1] = 5, C[2 * e3] = j(e3, 5);
            O = new D(z, w, u + 1, l, g), B = new D(C, k, 0, f, g), R = new D(new Array(0), x, 0, c, p);
          }(), q = true), e2.l_desc = new F(e2.dyn_ltree, O), e2.d_desc = new F(e2.dyn_dtree, B), e2.bl_desc = new F(e2.bl_tree, R), e2.bi_buf = 0, e2.bi_valid = 0, W(e2);
        }, r._tr_stored_block = J, r._tr_flush_block = function(e2, t2, r2, n2) {
          var i2, s2, a2 = 0;
          0 < e2.level ? (2 === e2.strm.data_type && (e2.strm.data_type = function(e3) {
            var t3, r3 = 4093624447;
            for (t3 = 0; t3 <= 31; t3++, r3 >>>= 1) if (1 & r3 && 0 !== e3.dyn_ltree[2 * t3]) return o;
            if (0 !== e3.dyn_ltree[18] || 0 !== e3.dyn_ltree[20] || 0 !== e3.dyn_ltree[26]) return h;
            for (t3 = 32; t3 < u; t3++) if (0 !== e3.dyn_ltree[2 * t3]) return h;
            return o;
          }(e2)), Y(e2, e2.l_desc), Y(e2, e2.d_desc), a2 = function(e3) {
            var t3;
            for (X(e3, e3.dyn_ltree, e3.l_desc.max_code), X(e3, e3.dyn_dtree, e3.d_desc.max_code), Y(e3, e3.bl_desc), t3 = c - 1; 3 <= t3 && 0 === e3.bl_tree[2 * S[t3] + 1]; t3--) ;
            return e3.opt_len += 3 * (t3 + 1) + 5 + 5 + 4, t3;
          }(e2), i2 = e2.opt_len + 3 + 7 >>> 3, (s2 = e2.static_len + 3 + 7 >>> 3) <= i2 && (i2 = s2)) : i2 = s2 = r2 + 5, r2 + 4 <= i2 && -1 !== t2 ? J(e2, t2, r2, n2) : 4 === e2.strategy || s2 === i2 ? (P(e2, 2 + (n2 ? 1 : 0), 3), K(e2, z, C)) : (P(e2, 4 + (n2 ? 1 : 0), 3), function(e3, t3, r3, n3) {
            var i3;
            for (P(e3, t3 - 257, 5), P(e3, r3 - 1, 5), P(e3, n3 - 4, 4), i3 = 0; i3 < n3; i3++) P(e3, e3.bl_tree[2 * S[i3] + 1], 3);
            V(e3, e3.dyn_ltree, t3 - 1), V(e3, e3.dyn_dtree, r3 - 1);
          }(e2, e2.l_desc.max_code + 1, e2.d_desc.max_code + 1, a2 + 1), K(e2, e2.dyn_ltree, e2.dyn_dtree)), W(e2), n2 && M(e2);
        }, r._tr_tally = function(e2, t2, r2) {
          return e2.pending_buf[e2.d_buf + 2 * e2.last_lit] = t2 >>> 8 & 255, e2.pending_buf[e2.d_buf + 2 * e2.last_lit + 1] = 255 & t2, e2.pending_buf[e2.l_buf + e2.last_lit] = 255 & r2, e2.last_lit++, 0 === t2 ? e2.dyn_ltree[2 * r2]++ : (e2.matches++, t2--, e2.dyn_ltree[2 * (A[r2] + u + 1)]++, e2.dyn_dtree[2 * N(t2)]++), e2.last_lit === e2.lit_bufsize - 1;
        }, r._tr_align = function(e2) {
          P(e2, 2, 3), L(e2, m, z), function(e3) {
            16 === e3.bi_valid ? (U(e3, e3.bi_buf), e3.bi_buf = 0, e3.bi_valid = 0) : 8 <= e3.bi_valid && (e3.pending_buf[e3.pending++] = 255 & e3.bi_buf, e3.bi_buf >>= 8, e3.bi_valid -= 8);
          }(e2);
        };
      }, { "../utils/common": 41 }], 53: [function(e, t, r) {
        t.exports = function() {
          this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
        };
      }, {}], 54: [function(e, t, r) {
        (function(e2) {
          !function(r2, n) {
            if (!r2.setImmediate) {
              var i, s, t2, a, o = 1, h = {}, u = false, l = r2.document, e3 = Object.getPrototypeOf && Object.getPrototypeOf(r2);
              e3 = e3 && e3.setTimeout ? e3 : r2, i = "[object process]" === {}.toString.call(r2.process) ? function(e4) {
                process.nextTick(function() {
                  c(e4);
                });
              } : function() {
                if (r2.postMessage && !r2.importScripts) {
                  var e4 = true, t3 = r2.onmessage;
                  return r2.onmessage = function() {
                    e4 = false;
                  }, r2.postMessage("", "*"), r2.onmessage = t3, e4;
                }
              }() ? (a = "setImmediate$" + Math.random() + "$", r2.addEventListener ? r2.addEventListener("message", d, false) : r2.attachEvent("onmessage", d), function(e4) {
                r2.postMessage(a + e4, "*");
              }) : r2.MessageChannel ? ((t2 = new MessageChannel()).port1.onmessage = function(e4) {
                c(e4.data);
              }, function(e4) {
                t2.port2.postMessage(e4);
              }) : l && "onreadystatechange" in l.createElement("script") ? (s = l.documentElement, function(e4) {
                var t3 = l.createElement("script");
                t3.onreadystatechange = function() {
                  c(e4), t3.onreadystatechange = null, s.removeChild(t3), t3 = null;
                }, s.appendChild(t3);
              }) : function(e4) {
                setTimeout(c, 0, e4);
              }, e3.setImmediate = function(e4) {
                "function" != typeof e4 && (e4 = new Function("" + e4));
                for (var t3 = new Array(arguments.length - 1), r3 = 0; r3 < t3.length; r3++) t3[r3] = arguments[r3 + 1];
                var n2 = { callback: e4, args: t3 };
                return h[o] = n2, i(o), o++;
              }, e3.clearImmediate = f;
            }
            function f(e4) {
              delete h[e4];
            }
            function c(e4) {
              if (u) setTimeout(c, 0, e4);
              else {
                var t3 = h[e4];
                if (t3) {
                  u = true;
                  try {
                    !function(e5) {
                      var t4 = e5.callback, r3 = e5.args;
                      switch (r3.length) {
                        case 0:
                          t4();
                          break;
                        case 1:
                          t4(r3[0]);
                          break;
                        case 2:
                          t4(r3[0], r3[1]);
                          break;
                        case 3:
                          t4(r3[0], r3[1], r3[2]);
                          break;
                        default:
                          t4.apply(n, r3);
                      }
                    }(t3);
                  } finally {
                    f(e4), u = false;
                  }
                }
              }
            }
            function d(e4) {
              e4.source === r2 && "string" == typeof e4.data && 0 === e4.data.indexOf(a) && c(+e4.data.slice(a.length));
            }
          }("undefined" == typeof self ? void 0 === e2 ? this : e2 : self);
        }).call(this, "undefined" != typeof commonjsGlobal ? commonjsGlobal : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
      }, {}] }, {}, [10])(10);
    });
  })(jszip_min);
  var jszip_minExports = jszip_min.exports;
  const JSZip = /* @__PURE__ */ getDefaultExportFromCjs(jszip_minExports);
  const STORAGE_KEY = "jpdb-popup-reader-settings";
  const DEFAULT_AUDIO_URL = "http://localhost:9090/?term={term}&reading={reading}";
  const DEFAULT_ACCENT_COLOR = "#5ea780";
  const AUDIO_GUIDE_URL = "https://yomitan.wiki/advanced/#audio";
  const AUDIO_SOURCE_LABELS = {
    jpod101: "JapanesePod101",
    "language-pod-101": "LanguagePod101",
    jisho: "Jisho.org",
    "lingua-libre": "(Commons) Lingua Libre",
    wiktionary: "(Commons) Wiktionary",
    "text-to-speech": "Text-to-speech",
    "text-to-speech-reading": "Text-to-speech (Kana reading)",
    custom: "Custom URL",
    "custom-json": "Custom URL (audio list)"
  };
  const AUDIO_SOURCE_OPTIONS = Object.entries(AUDIO_SOURCE_LABELS);
  const DEFAULT_AUDIO_SOURCES = [
    { type: "jpod101", url: "", voice: "", enabled: true },
    { type: "language-pod-101", url: "", voice: "", enabled: true },
    { type: "jisho", url: "", voice: "", enabled: true }
  ];
  const AUDIO_SOURCE_TYPES = new Set(AUDIO_SOURCE_OPTIONS.map(([value]) => value));
  const DEFAULT_SETTINGS = {
    apiKey: "",
    onboardingSeen: false,
    interfaceLanguage: "auto",
    accentColor: DEFAULT_ACCENT_COLOR,
    jpdbDefinitionsEnabled: true,
    jpdbDefinitionsPriority: 0,
    rtkEnabled: true,
    kanjivgEnabled: true,
    kanjiOriginsEnabled: true,
    similarKanjiWords: true,
    similarKanjiWordLimit: 8,
    audioEnabled: true,
    autoPlayAudio: true,
    audioSources: DEFAULT_AUDIO_SOURCES,
    audioEnableDefaultSources: true,
    audioSourceUrl: DEFAULT_AUDIO_URL,
    audioViaBlob: true,
    audioTimeoutMs: 6e3,
    audioSelectionMode: "random",
    parseSelection: true,
    lookupOnClick: true,
    lookupOnHover: true,
    popupActivationMode: "hover",
    scanModifierKey: "shift",
    autoScanJapanese: true,
    scanVisiblePage: true,
    showFloatingButton: true,
    showFurigana: true,
    showPitchAccent: true,
    hideKnownFurigana: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrShowTextOverlay: false,
    ocrProvider: "google-lens",
    ocrEndpointUrl: "",
    ocrEngine: "auto",
    ocrCloudVisionApiKey: "",
    ocrLanguage: "ja-JP",
    ocrMaxImagePixels: 12e5,
    ocrMinImageArea: 45e3,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    ocrTextColor: "#ffffff",
    ocrOutlineColor: "#000000",
    ocrBackgroundColor: "#181b20",
    ocrBackgroundOpacity: 0.36,
    ocrFontScale: 1,
    localDictionariesEnabled: true,
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    dictionaryPreferences: [],
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleSecondaryVisible: true,
    subtitleControlsMode: "auto",
    subtitleFontSize: 32,
    subtitleBottomOffset: 12,
    subtitleTextColor: "#ffffff",
    subtitleOutlineColor: "#000000",
    subtitleBackgroundColor: "#181b20",
    subtitleBackgroundOpacity: 0.32,
    subtitleFontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    subtitleFontWeight: 850,
    subtitleMiningPause: true,
    subtitleSeekPadding: 0.08,
    youtubeImmersionEnabled: false,
    youtubeShowFilterNotice: true,
    ankiEnabled: false,
    ankiConnectUrl: "http://127.0.0.1:8765",
    ankiDeck: "よむ",
    ankiModel: "よむ Japanese",
    ankiTags: "yomu",
    ankiMineWithJpdb: false,
    ankiCaptureScreenshot: true,
    theme: "auto",
    popupMode: "auto",
    miningDeck: "forq",
    neverForgetDeck: "never-forget",
    blacklistDeck: "blacklist",
    addToForq: false,
    enableReviews: true,
    twoButtonReviews: false,
    shortcuts: {
      scanPage: "Alt+J",
      hoverLookup: "",
      openSettings: "Alt+Shift+J",
      playAudio: "A",
      closePopup: "Escape",
      previousSubtitle: "Alt+ArrowLeft",
      nextSubtitle: "Alt+ArrowRight",
      copySubtitle: "Alt+C",
      toggleOcr: "Alt+O",
      toggleYoutubeImmersion: "Alt+Y",
      scanImages: "Alt+I",
      gradeNothing: "1",
      gradeSomething: "2",
      gradeHard: "3",
      gradeOkay: "4",
      gradeEasy: "5",
      gradeFail: "1",
      gradePass: "2"
    }
  };
  function mergeSettings(value) {
    var _a;
    const hasSavedAudioSources = value && Object.prototype.hasOwnProperty.call(value, "audioSources");
    const audioSources = hasSavedAudioSources || (value == null ? void 0 : value.audioSourceUrl) ? normalizeAudioSources(value == null ? void 0 : value.audioSources, value == null ? void 0 : value.audioSourceUrl) : DEFAULT_AUDIO_SOURCES.map((source) => ({ ...source }));
    const shortcuts = {
      ...DEFAULT_SETTINGS.shortcuts,
      ...(value == null ? void 0 : value.shortcuts) ?? {}
    };
    if (value && value.shortcuts && !Object.prototype.hasOwnProperty.call(value.shortcuts, "hoverLookup")) {
      shortcuts.hoverLookup = value.popupActivationMode === "modifier" ? shortcutFromLegacyModifier(value.scanModifierKey) : "";
    }
    return {
      ...DEFAULT_SETTINGS,
      ...value ?? {},
      interfaceLanguage: normalizeInterfaceLanguage(value == null ? void 0 : value.interfaceLanguage),
      jpdbDefinitionsPriority: clampNumber(value == null ? void 0 : value.jpdbDefinitionsPriority, 0, 999, DEFAULT_SETTINGS.jpdbDefinitionsPriority),
      lookupOnClick: typeof (value == null ? void 0 : value.lookupOnClick) === "boolean" ? value.lookupOnClick : true,
      lookupOnHover: typeof (value == null ? void 0 : value.lookupOnHover) === "boolean" ? value.lookupOnHover : (value == null ? void 0 : value.popupActivationMode) !== "click",
      accentColor: sanitizeAccentColor(value == null ? void 0 : value.accentColor),
      audioSources,
      audioSourceUrl: ((_a = audioSources.find((source) => source.url)) == null ? void 0 : _a.url) ?? (value == null ? void 0 : value.audioSourceUrl) ?? DEFAULT_AUDIO_URL,
      ocrProvider: normalizeOcrProvider(value == null ? void 0 : value.ocrProvider),
      ocrEngine: normalizeOcrEngine(value == null ? void 0 : value.ocrEngine),
      ocrTextColor: sanitizeAccentColor(value == null ? void 0 : value.ocrTextColor, DEFAULT_SETTINGS.ocrTextColor),
      ocrOutlineColor: sanitizeAccentColor(value == null ? void 0 : value.ocrOutlineColor, DEFAULT_SETTINGS.ocrOutlineColor),
      ocrBackgroundColor: sanitizeAccentColor(value == null ? void 0 : value.ocrBackgroundColor, DEFAULT_SETTINGS.ocrBackgroundColor),
      ocrBackgroundOpacity: clampNumber(value == null ? void 0 : value.ocrBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.ocrBackgroundOpacity),
      ocrFontScale: clampNumber(value == null ? void 0 : value.ocrFontScale, 0.7, 1.8, DEFAULT_SETTINGS.ocrFontScale),
      subtitleControlsMode: normalizeSubtitleControlsMode(value == null ? void 0 : value.subtitleControlsMode),
      subtitleTextColor: sanitizeAccentColor(value == null ? void 0 : value.subtitleTextColor, DEFAULT_SETTINGS.subtitleTextColor),
      subtitleOutlineColor: sanitizeAccentColor(value == null ? void 0 : value.subtitleOutlineColor, DEFAULT_SETTINGS.subtitleOutlineColor),
      subtitleBackgroundColor: sanitizeAccentColor(value == null ? void 0 : value.subtitleBackgroundColor, DEFAULT_SETTINGS.subtitleBackgroundColor),
      subtitleBackgroundOpacity: clampNumber(value == null ? void 0 : value.subtitleBackgroundOpacity, 0, 1, DEFAULT_SETTINGS.subtitleBackgroundOpacity),
      subtitleFontFamily: typeof (value == null ? void 0 : value.subtitleFontFamily) === "string" && value.subtitleFontFamily.trim() ? value.subtitleFontFamily.trim() : DEFAULT_SETTINGS.subtitleFontFamily,
      subtitleFontWeight: clampNumber(value == null ? void 0 : value.subtitleFontWeight, 100, 900, DEFAULT_SETTINGS.subtitleFontWeight),
      similarKanjiWordLimit: clampNumber(value == null ? void 0 : value.similarKanjiWordLimit, 2, 24, DEFAULT_SETTINGS.similarKanjiWordLimit),
      ankiConnectUrl: normalizeUrl(value == null ? void 0 : value.ankiConnectUrl, DEFAULT_SETTINGS.ankiConnectUrl),
      ankiDeck: normalizeAnkiName(value == null ? void 0 : value.ankiDeck, DEFAULT_SETTINGS.ankiDeck, "Yomu"),
      ankiModel: normalizeAnkiName(value == null ? void 0 : value.ankiModel, DEFAULT_SETTINGS.ankiModel, "Yomu Japanese"),
      ankiTags: typeof (value == null ? void 0 : value.ankiTags) === "string" ? value.ankiTags.trim() : DEFAULT_SETTINGS.ankiTags,
      dictionaryPreferences: normalizeDictionaryPreferences(value == null ? void 0 : value.dictionaryPreferences),
      shortcuts
    };
  }
  function normalizeAnkiName(value, fallback, oldDefault) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed === oldDefault) return fallback;
    return trimmed;
  }
  function normalizeInterfaceLanguage(value) {
    return value === "en" || value === "ja" || value === "auto" ? value : DEFAULT_SETTINGS.interfaceLanguage;
  }
  function normalizeUrl(value, fallback) {
    if (typeof value !== "string" || !value.trim()) return fallback;
    try {
      return new URL(value.trim()).toString().replace(/\/$/, "");
    } catch {
      return fallback;
    }
  }
  function shortcutFromLegacyModifier(value) {
    if (value === "alt") return "Alt";
    if (value === "ctrl") return "Ctrl";
    if (value === "meta") return "Meta";
    return value === "shift" ? "Shift" : "";
  }
  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }
  function normalizeSubtitleControlsMode(value) {
    return value === "always" || value === "hidden" || value === "auto" ? value : DEFAULT_SETTINGS.subtitleControlsMode;
  }
  function sanitizeAccentColor(value, fallback = DEFAULT_ACCENT_COLOR) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (!shortHex) return fallback;
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
  }
  function accentToRgba(color, alpha) {
    const safe = sanitizeAccentColor(color);
    const red = parseInt(safe.slice(1, 3), 16);
    const green = parseInt(safe.slice(3, 5), 16);
    const blue = parseInt(safe.slice(5, 7), 16);
    return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
  }
  function normalizeOcrProvider(value) {
    if (value === "auto") return "google-lens";
    if (value === "fast") return "google-lens";
    if (value === "page-text") return "google-lens";
    if (value === "custom-json") return "local-service";
    if (value === "google-lens" || value === "cloud-vision" || value === "local-service" || value === "off") return value;
    return DEFAULT_SETTINGS.ocrProvider;
  }
  function normalizeOcrEngine(value) {
    if (typeof value !== "string" || !value.trim()) return DEFAULT_SETTINGS.ocrEngine;
    const normalized = value.trim();
    if (normalized === "MangaOcrAdapter") return "MangaOCR";
    if (normalized === "PpOcrAdapter") return "PaddleOCR";
    if (normalized === "AppleVisionAdapter") return "AppleVision";
    if (normalized === "Google Lens") return "auto";
    return normalized;
  }
  async function loadSettings() {
    if (typeof GM_getValue === "function") {
      return mergeSettings(await GM_getValue(STORAGE_KEY, null));
    }
    try {
      return mergeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch {
      return mergeSettings(null);
    }
  }
  async function saveSettings(settings) {
    if (typeof GM_setValue === "function") {
      await GM_setValue(STORAGE_KEY, settings);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }
  function matchesShortcut(event, shortcut) {
    var _a;
    if (!shortcut) return false;
    const parts = parseShortcut(shortcut);
    const key = (_a = parts.key) == null ? void 0 : _a.toLowerCase();
    if (!key) return false;
    const eventKey = normalizeEventKey(event.key).toLowerCase();
    return eventKey === key && event.altKey === parts.modifiers.has("alt") && event.ctrlKey === parts.modifiers.has("ctrl") && event.metaKey === parts.modifiers.has("meta") && event.shiftKey === parts.modifiers.has("shift");
  }
  function formatShortcutEvent(event) {
    const parts = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    const key = normalizeEventKey(event.key);
    if (!isModifierKey(key) || parts.length === 0) {
      if (!isModifierKey(key)) parts.push(key);
    }
    return dedupeShortcutParts(parts).join("+");
  }
  function shortcutIsPressed(shortcut, event, pressedKeys = /* @__PURE__ */ new Set()) {
    if (!shortcut.trim()) return true;
    const parts = parseShortcut(shortcut);
    if (parts.modifiers.has("alt") !== event.altKey) return false;
    if (parts.modifiers.has("ctrl") !== event.ctrlKey) return false;
    if (parts.modifiers.has("meta") !== event.metaKey) return false;
    if (parts.modifiers.has("shift") !== event.shiftKey) return false;
    if (!parts.key) return parts.modifiers.size > 0;
    return pressedKeys.has(parts.key.toLowerCase()) || "key" in event && normalizeEventKey(event.key).toLowerCase() === parts.key.toLowerCase();
  }
  function parseShortcut(shortcut) {
    const parts = shortcut.split("+").map((part) => normalizeShortcutPart(part)).filter(Boolean);
    const modifiers = new Set(parts.filter(isModifierKey).map((part) => part.toLowerCase()));
    const key = [...parts].reverse().find((part) => !isModifierKey(part)) ?? "";
    return { key: key.toLowerCase(), modifiers };
  }
  function normalizeShortcutPart(part) {
    var _a;
    const value = part.trim();
    if (!value) return "";
    const lower = value.toLowerCase();
    if (lower === "control") return "Ctrl";
    if (lower === "cmd" || lower === "command" || lower === "win" || lower === "windows") return "Meta";
    if (lower === "option") return "Alt";
    if (lower === "esc") return "Escape";
    if (lower === "spacebar" || lower === " ") return "Space";
    if (value.length === 1) return value.toUpperCase();
    return ((_a = value[0]) == null ? void 0 : _a.toUpperCase()) + value.slice(1);
  }
  function normalizeEventKey(key) {
    if (key === " ") return "Space";
    return normalizeShortcutPart(key);
  }
  function isModifierKey(key) {
    return key === "Alt" || key === "Ctrl" || key === "Meta" || key === "Shift";
  }
  function dedupeShortcutParts(parts) {
    return parts.filter((part, index) => parts.indexOf(part) === index);
  }
  function isAudioSourceType(value) {
    return typeof value === "string" && AUDIO_SOURCE_TYPES.has(value);
  }
  function normalizeAudioSource(value) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    if (!isAudioSourceType(record.type)) return null;
    return {
      type: record.type,
      url: typeof record.url === "string" ? record.url : "",
      voice: typeof record.voice === "string" ? record.voice : "",
      enabled: typeof record.enabled === "boolean" ? record.enabled : true
    };
  }
  function normalizeAudioSources(value, legacyUrl) {
    const sources = Array.isArray(value) ? value.map(normalizeAudioSource).filter((source) => source !== null) : [];
    if (Array.isArray(value)) return sources;
    if (typeof legacyUrl === "string" && legacyUrl.trim()) {
      return [{ type: "custom-json", url: legacyUrl.trim(), voice: "", enabled: true }];
    }
    return DEFAULT_AUDIO_SOURCES.map((source) => ({ ...source }));
  }
  function normalizeDictionaryPreferences(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item;
      if (typeof record.name !== "string" || !record.name.trim()) return null;
      return {
        name: record.name,
        alias: typeof record.alias === "string" && record.alias.trim() ? record.alias : record.name,
        enabled: typeof record.enabled === "boolean" ? record.enabled : true,
        priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : index,
        allowSecondarySearches: typeof record.allowSecondarySearches === "boolean" ? record.allowSecondarySearches : false
      };
    }).filter((item) => item !== null).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }
  function mergeDictionaryPreferences(current, names) {
    const merged = new Map(current.map((item) => [item.name, item]));
    for (const name of names) {
      if (!merged.has(name)) {
        merged.set(name, {
          name,
          alias: name,
          enabled: true,
          priority: merged.size,
          allowSecondarySearches: false
        });
      }
    }
    return normalizeDictionaryPreferences([...merged.values()]);
  }
  const DB_NAME = "jpdb-popup-reader-yomitan";
  const DB_VERSION = 2;
  class YomitanDictionaryStore {
    constructor() {
      __publicField(this, "dbPromise");
    }
    async lookup(expression, reading, limit, preferences = []) {
      const db = await this.db();
      const entries = await this.getByIndex(db, "terms", "expression", expression, Math.max(limit * 40, 500));
      if (reading && reading !== expression) {
        const byReading = await this.getByIndex(db, "terms", "reading", reading, Math.max(limit * 20, 250));
        entries.push(...byReading);
      }
      const rank = dictionaryRank(preferences);
      const seen = /* @__PURE__ */ new Set();
      return entries.filter((entry) => dictionaryEnabled(entry.dictionary, rank)).sort(
        (a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || Number(b.reading === reading) - Number(a.reading === reading) || (b.score ?? 0) - (a.score ?? 0)
      ).filter((entry) => {
        const key = `${entry.dictionary}
${entry.expression}
${entry.reading}
${JSON.stringify(entry.glossary).slice(0, 120)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, limit);
    }
    async lookupKanji(text, limit, preferences = []) {
      const db = await this.db();
      const rank = dictionaryRank(preferences);
      const characters = [...new Set(Array.from(text).filter(isKanji))];
      const entries = [];
      for (const character of characters) {
        entries.push(...await this.getByIndex(db, "kanji", "character", character, limit));
      }
      return entries.filter((entry) => dictionaryEnabled(entry.dictionary, rank)).sort((a, b) => dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank)).slice(0, limit);
    }
    async lookupTermMeta(expression, limit, preferences = []) {
      const db = await this.db();
      const rank = dictionaryRank(preferences);
      return (await this.getByIndex(db, "termMeta", "expression", expression, Math.max(limit * 8, 80))).filter((entry) => dictionaryEnabled(entry.dictionary, rank)).sort((a, b) => compareMetaEntries(a, b, rank)).slice(0, limit);
    }
    async lookupSimilarTermsByKanji(character, limit, preferences = []) {
      const db = await this.db();
      const rank = dictionaryRank(preferences);
      const entries = [];
      const seen = /* @__PURE__ */ new Set();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("terms", "readonly");
        const request = tx.objectStore("terms").openCursor();
        request.onerror = () => reject(request.error ?? new Error("Could not search local dictionaries."));
        request.onsuccess = () => {
          var _a;
          const cursor = request.result;
          if (!cursor || entries.length >= Math.max(limit * 8, 80)) {
            resolve();
            return;
          }
          const entry = cursor.value;
          if (((_a = entry.expression) == null ? void 0 : _a.includes(character)) && dictionaryEnabled(entry.dictionary, rank)) {
            const key = `${entry.expression}
${entry.reading}`;
            if (!seen.has(key)) {
              seen.add(key);
              entries.push(entry);
            }
          }
          cursor.continue();
        };
      });
      const annotated = await Promise.all(entries.map(async (entry) => ({
        ...entry,
        jpdbFrequency: await this.frequencyForExpression(entry.expression, preferences)
      })));
      return annotated.sort(
        (a, b) => compareFrequency(a.jpdbFrequency, b.jpdbFrequency) || dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || (b.score ?? 0) - (a.score ?? 0) || a.expression.length - b.expression.length
      ).slice(0, limit);
    }
    async summary() {
      const db = await this.db();
      const [dictionaries, terms, kanji, termMeta, kanjiMeta] = await Promise.all([
        this.getAllDictionaryInfo(db),
        this.countStore(db, "terms"),
        this.countStore(db, "kanji"),
        this.countStore(db, "termMeta"),
        this.countStore(db, "kanjiMeta")
      ]);
      return { dictionaries, terms, kanji, termMeta, kanjiMeta };
    }
    async countEntries() {
      const summary = await this.summary();
      return summary.terms + summary.kanji + summary.termMeta + summary.kanjiMeta;
    }
    async frequencyForExpression(expression, preferences) {
      const metas = await this.lookupTermMeta(expression, 12, preferences).catch(() => []);
      for (const meta of metas) {
        if (meta.mode !== "freq") continue;
        const frequency = extractFrequency(meta.data);
        if (frequency !== void 0) return frequency;
      }
      return void 0;
    }
    async importFile(file, onProgress, sourceUrl = "") {
      if (/\.zip$/i.test(file.name)) return this.importZip(file, onProgress, sourceUrl);
      return this.importJson(file, onProgress);
    }
    async importFromUrl(url, filename = filenameFromUrl(url), onProgress) {
      onProgress == null ? void 0 : onProgress(`Downloading ${filename}...`);
      const blob = await requestBlob$1(url, onProgress);
      const file = new File([blob], filename, { type: blob.type || "application/zip" });
      return this.importFile(file, onProgress, url);
    }
    async importZip(file, onProgress, sourceUrl = "") {
      var _a;
      onProgress == null ? void 0 : onProgress("Reading dictionary ZIP...");
      const zip = await JSZip.loadAsync(file);
      const indexFile = zip.file("index.json");
      if (!indexFile) throw new Error("Yomitan dictionary ZIP is missing index.json.");
      const index = JSON.parse(await indexFile.async("string"));
      const dictionary = ((_a = index.title) == null ? void 0 : _a.trim()) || file.name.replace(/\.zip$/i, "");
      const version = index.format ?? index.version ?? 3;
      await this.deleteDictionary(dictionary);
      await this.putDictionaryInfo({
        title: dictionary,
        alias: dictionary,
        enabled: true,
        priority: 0,
        revision: typeof index.revision === "string" ? index.revision : void 0,
        downloadUrl: sourceUrl || void 0,
        importDate: Date.now()
      });
      const summary = { dictionaries: [dictionary], entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
      const importBank = async (pattern, label, store, normalize) => {
        const files = Object.values(zip.files).filter((entry) => pattern.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true }));
        for (const bankFile of files) {
          onProgress == null ? void 0 : onProgress(`Importing ${dictionary}: ${bankFile.name}`);
          const rows = JSON.parse(await bankFile.async("string"));
          const entries = rows.map(normalize).filter(Boolean);
          await this.addToStore(store, entries);
          summary[label] += entries.length;
          summary.entries += entries.length;
        }
      };
      await importBank(/^term_bank_\d+\.json$/i, "terms", "terms", (row) => normalizeZipTermRow(row, dictionary));
      await importBank(/^kanji_bank_\d+\.json$/i, "kanji", "kanji", (row) => normalizeZipKanjiRow(row, dictionary, version));
      await importBank(/^term_meta_bank_\d+\.json$/i, "termMeta", "termMeta", (row) => normalizeZipTermMetaRow(row, dictionary));
      await importBank(/^kanji_meta_bank_\d+\.json$/i, "kanjiMeta", "kanjiMeta", (row) => normalizeZipKanjiMetaRow(row, dictionary));
      if (summary.entries === 0) throw new Error("No supported Yomitan dictionary banks found.");
      return summary;
    }
    async importJson(file, onProgress) {
      var _a;
      const head = await readBlobText(file.slice(0, 4096));
      if (head.includes('"formatName":"dexie"') || head.includes('"formatName": "dexie"')) {
        return this.importDexieJson(file, onProgress);
      }
      const json = JSON.parse(await readBlobText(file));
      if (isReaderDictionaryExport(json)) {
        await this.clear();
        await Promise.all([
          this.addToStore("dictionaryInfo", json.dictionaries ?? [], true),
          this.addToStore("terms", json.terms ?? json.entries ?? []),
          this.addToStore("kanji", json.kanji ?? []),
          this.addToStore("termMeta", json.termMeta ?? []),
          this.addToStore("kanjiMeta", json.kanjiMeta ?? [])
        ]);
        const dictionaryNames = ((_a = json.dictionaries) == null ? void 0 : _a.map((item) => item.title)) ?? [...new Set((json.terms ?? json.entries ?? []).map((entry) => entry.dictionary))];
        return {
          dictionaries: dictionaryNames,
          entries: (json.terms ?? json.entries ?? []).length + (json.kanji ?? []).length + (json.termMeta ?? []).length + (json.kanjiMeta ?? []).length,
          terms: (json.terms ?? json.entries ?? []).length,
          kanji: (json.kanji ?? []).length,
          termMeta: (json.termMeta ?? []).length,
          kanjiMeta: (json.kanjiMeta ?? []).length
        };
      }
      throw new Error("Unsupported dictionary JSON. Import a Yomitan Dexie export, a Yomitan dictionary ZIP, or this reader export.");
    }
    async importDexieJson(file, onProgress) {
      onProgress == null ? void 0 : onProgress("Streaming Yomitan dictionary export...");
      await this.clear();
      const dictionaries = /* @__PURE__ */ new Set();
      const summary = { dictionaries: [], entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
      const batches = { terms: [], kanji: [], termMeta: [], kanjiMeta: [] };
      const flush = async (store) => {
        const batch = batches[store];
        if (!batch.length) return;
        await this.addToStore(store, batch);
        batches[store] = [];
      };
      const addBatch = async (store, entry, label) => {
        batches[store].push(entry);
        summary[label]++;
        summary.entries++;
        const dictionary = entry.dictionary;
        if (typeof dictionary === "string") dictionaries.add(dictionary);
        if (batches[store].length >= 1e3) {
          await flush(store);
          if (summary.entries % 25e3 === 0) onProgress == null ? void 0 : onProgress(`Imported ${summary.entries.toLocaleString()} dictionary records...`);
        }
      };
      await streamDexieTables(file, {
        dictionaries: async (row) => {
          const info = normalizeDexieDictionaryRow(row);
          if (!info) return;
          dictionaries.add(info.title);
          await this.putDictionaryInfo(info);
        },
        terms: async (row) => {
          const entry = normalizeDexieTermRow(row);
          if (entry) await addBatch("terms", entry, "terms");
        },
        kanji: async (row) => {
          const entry = normalizeDexieKanjiRow(row);
          if (entry) await addBatch("kanji", entry, "kanji");
        },
        termMeta: async (row) => {
          const entry = normalizeDexieTermMetaRow(row);
          if (entry) await addBatch("termMeta", entry, "termMeta");
        },
        kanjiMeta: async (row) => {
          const entry = normalizeDexieKanjiMetaRow(row);
          if (entry) await addBatch("kanjiMeta", entry, "kanjiMeta");
        }
      }, (table) => onProgress == null ? void 0 : onProgress(`Importing Yomitan ${table}...`));
      await Promise.all([flush("terms"), flush("kanji"), flush("termMeta"), flush("kanjiMeta")]);
      summary.dictionaries = [...dictionaries];
      return summary;
    }
    async exportJson() {
      const db = await this.db();
      const [dictionaries, terms, kanji, termMeta, kanjiMeta] = await Promise.all([
        this.getAllFromStore(db, "dictionaryInfo"),
        this.getAllFromStore(db, "terms"),
        this.getAllFromStore(db, "kanji"),
        this.getAllFromStore(db, "termMeta"),
        this.getAllFromStore(db, "kanjiMeta")
      ]);
      return new Blob([JSON.stringify({
        formatName: "yomu-yomitan-dictionaries",
        formatVersion: 2,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        dictionaries,
        terms,
        kanji,
        termMeta,
        kanjiMeta
      })], { type: "application/json" });
    }
    async clear() {
      const db = await this.db();
      await new Promise((resolve, reject) => {
        const stores = existingStores(db, ["terms", "kanji", "termMeta", "kanjiMeta", "dictionaryInfo"]);
        const tx = db.transaction(stores, "readwrite");
        for (const store of stores) tx.objectStore(store).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    async deleteDictionary(dictionary) {
      const db = await this.db();
      const stores = existingStores(db, ["terms", "kanji", "termMeta", "kanjiMeta"]);
      await Promise.all(stores.map((store) => deleteByDictionary(db, store, dictionary)));
      await new Promise((resolve, reject) => {
        const tx = db.transaction("dictionaryInfo", "readwrite");
        tx.objectStore("dictionaryInfo").delete(dictionary);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    async putDictionaryInfo(info) {
      await this.addToStore("dictionaryInfo", [info], true);
    }
    async addToStore(storeName, entries, put = false) {
      if (!entries.length) return;
      const db = await this.db();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        for (const entry of entries) put ? store.put(entry) : store.add(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    async getByIndex(db, storeName, indexName, value, limit) {
      return new Promise((resolve, reject) => {
        const results = [];
        const request = db.transaction(storeName, "readonly").objectStore(storeName).index(indexName).openCursor(IDBKeyRange.only(value));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || results.length >= limit) {
            resolve(results);
            return;
          }
          results.push(cursor.value);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    }
    async getAllDictionaryInfo(db) {
      return (await this.getAllFromStore(db, "dictionaryInfo")).sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
    }
    async getAllFromStore(db, storeName) {
      return new Promise((resolve, reject) => {
        const results = [];
        const request = db.transaction(storeName, "readonly").objectStore(storeName).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(results);
            return;
          }
          results.push(cursor.value);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    }
    countStore(db, storeName) {
      return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(storeName)) {
          resolve(0);
          return;
        }
        const request = db.transaction(storeName, "readonly").objectStore(storeName).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    db() {
      this.dbPromise ?? (this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          const tx = request.transaction;
          const terms = ensureStore(db, tx, "terms");
          ensureIndex(terms, "expression", "expression");
          ensureIndex(terms, "reading", "reading");
          ensureIndex(terms, "dictionary", "dictionary");
          const kanji = ensureStore(db, tx, "kanji");
          ensureIndex(kanji, "character", "character");
          ensureIndex(kanji, "dictionary", "dictionary");
          const termMeta = ensureStore(db, tx, "termMeta");
          ensureIndex(termMeta, "expression", "expression");
          ensureIndex(termMeta, "dictionary", "dictionary");
          const kanjiMeta = ensureStore(db, tx, "kanjiMeta");
          ensureIndex(kanjiMeta, "character", "character");
          ensureIndex(kanjiMeta, "dictionary", "dictionary");
          if (!db.objectStoreNames.contains("dictionaryInfo")) {
            db.createObjectStore("dictionaryInfo", { keyPath: "title" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }));
      return this.dbPromise;
    }
  }
  function parseYomitanSettingsExport(value) {
    var _a, _b;
    const profileOptions = getYomitanProfileOptions(value);
    if (!profileOptions) throw new Error("This does not look like a Yomitan settings export.");
    const settings = {};
    const audio = profileOptions.audio;
    const general = profileOptions.general;
    const scanning = profileOptions.scanning;
    const inputs = profileOptions.inputs;
    if (typeof (audio == null ? void 0 : audio.enabled) === "boolean") settings.audioEnabled = audio.enabled;
    if (typeof (audio == null ? void 0 : audio.autoPlay) === "boolean") settings.autoPlayAudio = audio.autoPlay;
    if (typeof (audio == null ? void 0 : audio.enableDefaultAudioSources) === "boolean") settings.audioEnableDefaultSources = audio.enableDefaultAudioSources;
    if (Array.isArray(audio == null ? void 0 : audio.sources)) {
      settings.audioSources = audio.sources.map(normalizeAudioSource).filter((source) => source !== null);
      settings.audioSourceUrl = (_a = settings.audioSources.find((source) => source.url)) == null ? void 0 : _a.url;
    }
    if ((general == null ? void 0 : general.popupTheme) === "dark" || (general == null ? void 0 : general.popupTheme) === "light") settings.theme = general.popupTheme;
    if (typeof (general == null ? void 0 : general.popupHeight) === "number" && general.popupHeight > 0) {
      settings.subtitleBottomOffset = Math.max(6, Math.min(24, Math.round(general.popupVerticalOffset || 12)));
    }
    if (typeof (scanning == null ? void 0 : scanning.selectText) === "boolean") settings.parseSelection = scanning.selectText;
    if (typeof (scanning == null ? void 0 : scanning.scanWithoutMousemove) === "boolean") settings.autoScanJapanese = scanning.scanWithoutMousemove;
    const scanInput = Array.isArray(scanning == null ? void 0 : scanning.inputs) ? scanning.inputs.find((input2) => input2 && typeof input2 === "object") : null;
    if (scanInput) {
      const include = String(scanInput.include ?? "").toLowerCase();
      const modifier = ["shift", "alt", "ctrl", "meta"].find((key) => include.includes(key));
      if (modifier) {
        settings.lookupOnHover = true;
        settings.shortcuts = { ...settings.shortcuts, hoverLookup: capitalize(modifier) };
      } else {
        const options = scanInput.options;
        if ((options == null ? void 0 : options.scanOnPenHover) === true || (options == null ? void 0 : options.scanOnTouchTap) === true || include === "") {
          settings.lookupOnHover = true;
          settings.shortcuts = { ...settings.shortcuts, hoverLookup: "" };
        }
      }
    }
    if (typeof (general == null ? void 0 : general.maxResults) === "number") settings.localDictionaryMaxResults = Math.max(1, Math.min(64, general.maxResults));
    settings.yomitanSettingsBackup = value;
    const playAudio = (_b = inputs == null ? void 0 : inputs.hotkeys) == null ? void 0 : _b.find((hotkey) => hotkey.action === "playAudio" && hotkey.enabled !== false);
    if (playAudio) {
      const key = String(playAudio.key || "").replace(/^Key/, "");
      const modifiers = Array.isArray(playAudio.modifiers) ? playAudio.modifiers.map((v) => String(v)) : [];
      settings.shortcuts = { ...settings.shortcuts, playAudio: [...modifiers.map(capitalize), key].filter(Boolean).join("+") };
    }
    const dictionaryPreferences = Array.isArray(profileOptions.dictionaries) ? profileOptions.dictionaries.map((item, index) => {
      const record = item;
      if (typeof (record == null ? void 0 : record.name) !== "string") return null;
      return {
        name: record.name,
        alias: typeof record.alias === "string" && record.alias ? record.alias : record.name,
        enabled: record.enabled !== false,
        priority: index,
        allowSecondarySearches: record.allowSecondarySearches === true
      };
    }).filter((item) => item !== null) : [];
    settings.dictionaryPreferences = normalizeDictionaryPreferences(dictionaryPreferences);
    return {
      settings,
      dictionaryNames: settings.dictionaryPreferences.filter((item) => item.enabled).map((item) => item.name)
    };
  }
  function glossaryToText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(glossaryToText).filter(Boolean).join(" ");
    if (typeof value === "object") {
      const record = value;
      if (typeof record.text === "string") return record.text;
      if ("content" in record) return glossaryToText(record.content);
      if ("path" in record) return String(record.description || record.alt || "[media]");
      return Object.values(record).map(glossaryToText).filter(Boolean).join(" ");
    }
    return "";
  }
  function glossaryToHtml(value) {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return escapeHtml(String(value));
    if (Array.isArray(value)) return value.map(glossaryToHtml).filter(Boolean).join(" ");
    if (typeof value !== "object") return "";
    const record = value;
    if (typeof record.text === "string") return escapeHtml(record.text);
    if ("path" in record) return `<span class="jpdb-reader-media-note">${escapeHtml(String(record.description || record.alt || "[media]"))}</span>`;
    const tag = typeof record.tag === "string" ? record.tag.toLowerCase() : "span";
    const content = glossaryToHtml(record.content);
    const attrs = renderStructuredAttributes(record);
    if (["div", "span", "ol", "ul", "li", "table", "tbody", "thead", "tr", "td", "th", "ruby", "rt", "rp", "br"].includes(tag)) {
      return tag === "br" ? "<br>" : `<${tag}${attrs}>${content}</${tag}>`;
    }
    return content || escapeHtml(glossaryToText(value));
  }
  async function streamDexieTables(file, handlers, onTable) {
    if (typeof file.stream !== "function" || typeof TextDecoderStream === "undefined") {
      await streamDexieTablesFromText(await readBlobText(file), handlers, onTable);
      return;
    }
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let state = "seek-table";
    let tableName = "";
    let rowStart = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let progress = true;
      while (progress) {
        progress = false;
        if (state === "seek-table") {
          const tableIndex = buffer.indexOf('"tableName"');
          if (tableIndex < 0) {
            buffer = buffer.slice(-32);
            break;
          }
          const colon = buffer.indexOf(":", tableIndex);
          const quote = colon >= 0 ? buffer.indexOf('"', colon) : -1;
          const end = quote >= 0 ? findJsonStringEnd(buffer, quote) : -1;
          if (end < 0) break;
          tableName = JSON.parse(buffer.slice(quote, end + 1));
          buffer = buffer.slice(end + 1);
          state = "seek-rows";
          progress = true;
        }
        if (state === "seek-rows") {
          const rowsIndex = buffer.indexOf('"rows"');
          if (rowsIndex < 0) {
            buffer = buffer.slice(-32);
            break;
          }
          const arrayIndex = buffer.indexOf("[", rowsIndex);
          if (arrayIndex < 0) break;
          buffer = buffer.slice(arrayIndex + 1);
          state = "rows";
          rowStart = -1;
          depth = 0;
          inString = false;
          escaped = false;
          onTable == null ? void 0 : onTable(tableName);
          progress = true;
        }
        if (state === "rows") {
          const handler = handlers[tableName];
          for (let index = 0; index < buffer.length; index++) {
            const char = buffer[index];
            if (inString) {
              if (escaped) escaped = false;
              else if (char === "\\") escaped = true;
              else if (char === '"') inString = false;
              continue;
            }
            if (char === '"') {
              inString = true;
              continue;
            }
            if (char === "{") {
              if (depth === 0) rowStart = index;
              depth++;
              continue;
            }
            if (char === "}") {
              depth--;
              if (depth === 0 && rowStart >= 0) {
                if (handler) await handler(JSON.parse(buffer.slice(rowStart, index + 1)));
                buffer = buffer.slice(index + 1);
                index = -1;
                rowStart = -1;
                progress = true;
              }
              continue;
            }
            if (depth === 0 && char === "]") {
              buffer = buffer.slice(index + 1);
              state = "seek-table";
              tableName = "";
              progress = true;
              break;
            }
          }
          if (!progress) {
            if (rowStart > 0) {
              buffer = buffer.slice(rowStart);
              rowStart = 0;
            } else if (depth === 0 && buffer.length > 4096) {
              buffer = buffer.slice(-4096);
            }
          }
        }
      }
    }
  }
  async function streamDexieTablesFromText(text, handlers, onTable) {
    let offset = 0;
    while (true) {
      const tableIndex = text.indexOf('"tableName"', offset);
      if (tableIndex < 0) return;
      const colon = text.indexOf(":", tableIndex);
      const quote = colon >= 0 ? text.indexOf('"', colon) : -1;
      const end = quote >= 0 ? findJsonStringEnd(text, quote) : -1;
      if (end < 0) return;
      const tableName = JSON.parse(text.slice(quote, end + 1));
      const rowsIndex = text.indexOf('"rows"', end);
      const arrayStart = rowsIndex >= 0 ? text.indexOf("[", rowsIndex) : -1;
      if (arrayStart < 0) return;
      onTable == null ? void 0 : onTable(tableName);
      const handler = handlers[tableName];
      let depth = 0;
      let rowStart = -1;
      let inString = false;
      let escaped = false;
      for (let index = arrayStart + 1; index < text.length; index++) {
        const char = text[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') {
          inString = true;
          continue;
        }
        if (char === "{") {
          if (depth === 0) rowStart = index;
          depth++;
          continue;
        }
        if (char === "}") {
          depth--;
          if (depth === 0 && rowStart >= 0 && handler) {
            await handler(JSON.parse(text.slice(rowStart, index + 1)));
          }
          continue;
        }
        if (depth === 0 && char === "]") {
          offset = index + 1;
          break;
        }
      }
    }
  }
  function normalizeZipTermRow(row, dictionary) {
    if (!Array.isArray(row)) return null;
    const [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = row;
    if (typeof expression !== "string") return null;
    return {
      expression,
      reading: typeof reading === "string" && reading ? reading : expression,
      definitionTags: typeof definitionTags === "string" ? definitionTags : "",
      rules: typeof rules === "string" ? rules : "",
      score: typeof score === "number" ? score : 0,
      glossary: Array.isArray(glossary) ? glossary : [],
      sequence: typeof sequence === "number" ? sequence : void 0,
      termTags: typeof termTags === "string" ? termTags : "",
      dictionary
    };
  }
  function normalizeZipKanjiRow(row, dictionary, version) {
    if (!Array.isArray(row)) return null;
    const [character, onyomi, kunyomi, tags, meaningsOrFirst, stats] = row;
    if (typeof character !== "string") return null;
    const meanings = version === 1 ? row.slice(4) : meaningsOrFirst;
    return {
      character,
      onyomi: splitTags(onyomi),
      kunyomi: splitTags(kunyomi),
      tags: splitTags(tags),
      meanings: Array.isArray(meanings) ? meanings.map(String) : [],
      stats,
      dictionary
    };
  }
  function normalizeZipTermMetaRow(row, dictionary) {
    if (!Array.isArray(row)) return null;
    const [expression, mode, data] = row;
    return typeof expression === "string" && typeof mode === "string" ? { expression, mode, data, dictionary } : null;
  }
  function normalizeZipKanjiMetaRow(row, dictionary) {
    if (!Array.isArray(row)) return null;
    const [character, mode, data] = row;
    return typeof character === "string" && typeof mode === "string" ? { character, mode, data, dictionary } : null;
  }
  function normalizeDexieTermRow(row) {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate;
    if (typeof record.expression !== "string" || typeof record.dictionary !== "string") return null;
    return {
      expression: record.expression,
      reading: typeof record.reading === "string" && record.reading ? record.reading : record.expression,
      definitionTags: typeof record.definitionTags === "string" ? record.definitionTags : "",
      rules: typeof record.rules === "string" ? record.rules : "",
      score: typeof record.score === "number" ? record.score : 0,
      glossary: Array.isArray(record.glossary) ? record.glossary : [],
      sequence: typeof record.sequence === "number" ? record.sequence : void 0,
      termTags: typeof record.termTags === "string" ? record.termTags : "",
      dictionary: record.dictionary
    };
  }
  function normalizeDexieKanjiRow(row) {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate;
    if (typeof record.character !== "string" || typeof record.dictionary !== "string") return null;
    return {
      character: record.character,
      onyomi: Array.isArray(record.onyomi) ? record.onyomi.map(String) : splitTags(record.onyomi),
      kunyomi: Array.isArray(record.kunyomi) ? record.kunyomi.map(String) : splitTags(record.kunyomi),
      tags: Array.isArray(record.tags) ? record.tags.map(String) : splitTags(record.tags),
      meanings: Array.isArray(record.meanings) ? record.meanings.map(String) : [],
      stats: record.stats,
      dictionary: record.dictionary
    };
  }
  function normalizeDexieTermMetaRow(row) {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate;
    return typeof record.expression === "string" && typeof record.mode === "string" && typeof record.dictionary === "string" ? { expression: record.expression, mode: record.mode, data: record.data, dictionary: record.dictionary } : null;
  }
  function normalizeDexieKanjiMetaRow(row) {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate;
    return typeof record.character === "string" && typeof record.mode === "string" && typeof record.dictionary === "string" ? { character: record.character, mode: record.mode, data: record.data, dictionary: record.dictionary } : null;
  }
  function normalizeDexieDictionaryRow(row) {
    const candidate = unwrapDexieRow(row);
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate;
    if (typeof record.title !== "string") return null;
    return {
      title: record.title,
      alias: typeof record.alias === "string" && record.alias ? record.alias : record.title,
      enabled: typeof record.enabled === "boolean" ? record.enabled : true,
      priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : 0,
      counts: record.counts,
      styles: typeof record.styles === "string" ? record.styles : "",
      revision: typeof record.revision === "string" ? record.revision : void 0,
      downloadUrl: typeof record.downloadUrl === "string" ? record.downloadUrl : void 0,
      importDate: typeof record.importDate === "number" ? record.importDate : void 0
    };
  }
  function unwrapDexieRow(row) {
    if (row && typeof row === "object" && "$" in row) {
      const value = row.$;
      return Array.isArray(value) ? value.find((item) => item && typeof item === "object" && !Array.isArray(item)) : value;
    }
    return row;
  }
  function isReaderDictionaryExport(value) {
    return !!value && typeof value === "object" && ["yomu-yomitan-dictionaries", "kotoba-yomitan-dictionaries", "jpdb-reader-yomitan-dictionaries"].includes(value.formatName ?? "") && (Array.isArray(value.entries) || Array.isArray(value.terms) || Array.isArray(value.kanji));
  }
  function getYomitanProfileOptions(value) {
    var _a, _b;
    if (!value || typeof value !== "object") return null;
    const options = value.options;
    return ((_b = (_a = options == null ? void 0 : options.profiles) == null ? void 0 : _a[0]) == null ? void 0 : _b.options) ?? null;
  }
  function renderStructuredAttributes(record) {
    const attrs = [];
    for (const key of ["data", "class", "title", "lang"]) {
      const value = record[key];
      if (typeof value === "string") attrs.push(` ${key === "class" ? "class" : key}="${escapeHtml(value)}"`);
    }
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith("data-") && typeof value === "string") attrs.push(` ${key}="${escapeHtml(value)}"`);
    }
    return attrs.join("");
  }
  function dictionaryRank(preferences) {
    return new Map(normalizeDictionaryPreferences(preferences).map((item) => [item.name, item]));
  }
  function dictionaryEnabled(dictionary, rank) {
    var _a;
    return ((_a = rank.get(dictionary)) == null ? void 0 : _a.enabled) ?? true;
  }
  function dictionaryPriority(dictionary, rank) {
    var _a;
    return ((_a = rank.get(dictionary)) == null ? void 0 : _a.priority) ?? 9999;
  }
  function compareMetaEntries(a, b, rank) {
    if (a.mode === "freq" && b.mode !== "freq") return -1;
    if (a.mode !== "freq" && b.mode === "freq") return 1;
    if (a.mode === "freq" && b.mode === "freq") {
      const aJpdb = isJpdbFrequencyDictionary(a.dictionary) ? 0 : 1;
      const bJpdb = isJpdbFrequencyDictionary(b.dictionary) ? 0 : 1;
      return aJpdb - bJpdb || dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || frequencyRank(a.data) - frequencyRank(b.data) || a.dictionary.localeCompare(b.dictionary);
    }
    return dictionaryPriority(a.dictionary, rank) - dictionaryPriority(b.dictionary, rank) || a.dictionary.localeCompare(b.dictionary);
  }
  function isJpdbFrequencyDictionary(dictionary) {
    return /jpdb/i.test(dictionary);
  }
  function frequencyRank(value) {
    if (typeof value === "number") return value;
    if (typeof value === "string") return Number(value.replace(/[^\d.]/g, "")) || Number.POSITIVE_INFINITY;
    if (!value || typeof value !== "object") return Number.POSITIVE_INFINITY;
    const record = value;
    return frequencyRank(record.frequency ?? record.value ?? record.displayValue);
  }
  function extractFrequency(value) {
    const rank = frequencyRank(value);
    return Number.isFinite(rank) ? rank : void 0;
  }
  function compareFrequency(a, b) {
    if (a === void 0 && b === void 0) return 0;
    if (a === void 0) return 1;
    if (b === void 0) return -1;
    return a - b;
  }
  function filenameFromUrl(url) {
    try {
      const parsed = new URL(url);
      const pathName = parsed.pathname.split("/").filter(Boolean).pop();
      return pathName && /\.zip$/i.test(pathName) ? decodeURIComponent(pathName) : "dictionary.zip";
    } catch {
      return "dictionary.zip";
    }
  }
  async function requestBlob$1(url, onProgress) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: { accept: "application/zip,application/octet-stream,*/*" },
          responseType: "blob",
          timeout: 12e4,
          onprogress: (event) => {
            if (event.lengthComputable && event.total > 0) {
              onProgress == null ? void 0 : onProgress(`Downloading dictionary ${Math.round(event.loaded / event.total * 100)}%...`);
            }
          },
          onload: (response2) => {
            if (response2.response instanceof Blob && (response2.status === 0 || response2.status >= 200 && response2.status < 300)) {
              resolve(response2.response);
              return;
            }
            if (response2.status < 200 || response2.status >= 300) {
              reject(new Error(`Dictionary download failed (${response2.status}).`));
              return;
            }
            reject(new Error("Dictionary download did not return a ZIP file."));
          },
          onerror: () => reject(new Error("Dictionary download failed.")),
          ontimeout: () => reject(new Error("Dictionary download timed out."))
        });
      });
    }
    const response = await fetch(url, { credentials: "omit", redirect: "follow", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`Dictionary download failed (${response.status}).`);
    return response.blob();
  }
  function splitTags(value) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
  }
  function isKanji(value) {
    const code = value.codePointAt(0) ?? 0;
    return code >= 13312 && code <= 40959;
  }
  function ensureStore(db, tx, name) {
    return db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
  }
  function ensureIndex(store, name, keyPath) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
  }
  function existingStores(db, names) {
    return names.filter((name) => db.objectStoreNames.contains(name));
  }
  function deleteByDictionary(db, storeName, dictionary) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const index = tx.objectStore(storeName).index("dictionary");
      const request = index.openCursor(IDBKeyRange.only(dictionary));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  function findJsonStringEnd(value, quoteIndex) {
    let escaped = false;
    for (let index = quoteIndex + 1; index < value.length; index++) {
      const char = value[index];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') return index;
    }
    return -1;
  }
  function readBlobText(blob) {
    if (typeof blob.text === "function") return blob.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }
  function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }
  const ANKI_VERSION = 6;
  const YOMU_MODEL_FIELDS = [
    "Expression",
    "Reading",
    "Meaning",
    "Sentence",
    "Url",
    "Frequency",
    "PartOfSpeech",
    "Image",
    "JPDB",
    "Status",
    "Pitch",
    "DictionaryDefinitions",
    "Kanji",
    "Source"
  ];
  class AnkiConnectClient {
    constructor(getSettings) {
      this.getSettings = getSettings;
    }
    async isConnected() {
      try {
        await this.invoke("version");
        return true;
      } catch {
        return false;
      }
    }
    async deckNames() {
      return this.invoke("deckNames");
    }
    async modelNames() {
      return this.invoke("modelNames");
    }
    async addCard(card, sentence = "", options = {}) {
      const settings = this.getSettings();
      if (!settings.ankiEnabled) return null;
      await this.ensureDeckAndModel();
      const note = {
        deckName: settings.ankiDeck || "よむ",
        modelName: settings.ankiModel || "よむ Japanese",
        fields: buildYomuAnkiFields(card, sentence, {
          ...options,
          sourceUrl: options.sourceUrl ?? safeLocationHref(),
          sourceTitle: options.sourceTitle ?? safeDocumentTitle(),
          dictionaryPreferences: options.dictionaryPreferences ?? settings.dictionaryPreferences
        }),
        tags: tagsFromString(settings.ankiTags),
        options: {
          allowDuplicate: false,
          duplicateScope: "deck"
        }
      };
      const image = options.imageDataUrl ? imageFromDataUrl(options.imageDataUrl, card) : null;
      if (image) note.picture = [image];
      return this.invoke("addNote", { note });
    }
    async ensureDeckAndModel() {
      const settings = this.getSettings();
      const deckName = settings.ankiDeck || "よむ";
      const modelName = settings.ankiModel || "よむ Japanese";
      await this.invoke("createDeck", { deck: deckName }).catch(() => null);
      const modelNames = await this.modelNames().catch(() => []);
      if (modelNames.includes(modelName)) {
        await this.ensureModelFields(modelName);
        await this.invoke("updateModelTemplates", { model: { name: modelName, templates: yomuCardTemplates() } });
        await this.invoke("updateModelStyling", { model: { name: modelName, css: yomuCardCss() } });
        return;
      }
      await this.invoke("createModel", {
        modelName,
        inOrderFields: YOMU_MODEL_FIELDS,
        css: yomuCardCss(),
        cardTemplates: Object.entries(yomuCardTemplates()).map(([Name, template]) => ({ Name, ...template }))
      });
    }
    async ensureModelFields(modelName) {
      const fieldNames = await this.invoke("modelFieldNames", { modelName }).catch(() => []);
      const existing = new Set(fieldNames);
      for (const fieldName of YOMU_MODEL_FIELDS) {
        if (!existing.has(fieldName)) await this.invoke("modelFieldAdd", { modelName, fieldName });
      }
    }
    async invoke(action, params = {}) {
      const settings = this.getSettings();
      const url = settings.ankiConnectUrl || "http://127.0.0.1:8765";
      const body = JSON.stringify({ action, version: ANKI_VERSION, params });
      const response = await postJson$1(url, body);
      if (response.error) throw new Error(response.error);
      return response.result;
    }
  }
  function captureActiveVideoFrame() {
    const video = Array.from(document.querySelectorAll("video")).filter((item) => item.readyState >= 2 && item.videoWidth > 0 && item.videoHeight > 0).sort((a, b) => visibleArea(b) - visibleArea(a))[0];
    if (!video) return void 0;
    try {
      const canvas = document.createElement("canvas");
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return void 0;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.84);
    } catch {
      return void 0;
    }
  }
  function postJson$1(url, body) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url,
          headers: { "Content-Type": "application/json" },
          data: body,
          responseType: "json",
          timeout: 5e3,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) resolve(response.response);
            else reject(new Error(`AnkiConnect request failed (${response.status}).`));
          },
          onerror: reject,
          ontimeout: () => reject(new Error("AnkiConnect timed out."))
        });
      });
    }
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    }).then(async (response) => {
      if (!response.ok) throw new Error(`AnkiConnect request failed (${response.status}).`);
      return response.json();
    });
  }
  function buildYomuAnkiFields(card, sentence = "", context = {}) {
    const dictionaryPreferences = context.dictionaryPreferences ?? [];
    const jpdbUrl = `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
    const sourceUrl = context.sourceUrl ?? "";
    const sourceTitle = context.sourceTitle ?? "";
    return {
      Expression: escapeHtml$1(card.spelling),
      Reading: card.reading && card.reading !== card.spelling ? escapeHtml$1(card.reading) : "",
      Meaning: renderJpdbMeanings(card),
      Sentence: renderSentence(sentence, card.spelling),
      Url: escapeHtml$1(sourceUrl),
      Frequency: renderFrequency(card, context.metaEntries ?? [], dictionaryPreferences),
      PartOfSpeech: escapeHtml$1(formatPartOfSpeech(card.partOfSpeech) || formatPartOfSpeechDetails(card.partOfSpeech)),
      Image: "",
      JPDB: `<a href="${jpdbUrl}">Open on JPDB</a>`,
      Status: card.cardState.map((state) => `<span class="yomu-chip">${escapeHtml$1(state)}</span>`).join(" "),
      Pitch: renderPitchField(card, context.metaEntries ?? [], dictionaryPreferences),
      DictionaryDefinitions: renderDictionaryDefinitions(context.localEntries ?? [], dictionaryPreferences),
      Kanji: renderKanjiDefinitions(context.kanjiEntries ?? [], dictionaryPreferences),
      Source: renderSource(sourceUrl, sourceTitle)
    };
  }
  function tagsFromString(value) {
    return value.split(/[,\s]+/).map((tag) => tag.trim()).filter(Boolean);
  }
  function imageFromDataUrl(dataUrl, card) {
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(dataUrl);
    if (!match) return null;
    const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    const safeName = card.spelling.replace(/[^\p{L}\p{N}-]+/gu, "_").slice(0, 24) || "yomu";
    return {
      filename: `yomu_${safeName}_${Date.now()}.${extension}`,
      data: match[2],
      fields: ["Image"]
    };
  }
  function visibleArea(element2) {
    const rect = element2.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return width * height;
  }
  function yomuCardTemplates() {
    return {
      Recognition: {
        Front: `
<main class="yomu-card yomu-front">
    <div class="yomu-expression">{{Expression}}</div>
    {{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}
    {{#Sentence}}<div class="yomu-sentence">{{Sentence}}</div>{{/Sentence}}
    {{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}
</main>`,
        Back: `
{{FrontSide}}
<main class="yomu-card yomu-back">
    {{#Meaning}}<section class="yomu-section"><h2>JPDB</h2><div class="yomu-meaning">{{Meaning}}</div></section>{{/Meaning}}
    {{#DictionaryDefinitions}}<section class="yomu-section"><h2>Dictionaries</h2>{{DictionaryDefinitions}}</section>{{/DictionaryDefinitions}}
    {{#Kanji}}<section class="yomu-section"><h2>Kanji</h2>{{Kanji}}</section>{{/Kanji}}
    <section class="yomu-section yomu-meta">
        {{#Frequency}}<div><strong>Frequency</strong>{{Frequency}}</div>{{/Frequency}}
        {{#Pitch}}<div><strong>Pitch</strong>{{Pitch}}</div>{{/Pitch}}
        {{#PartOfSpeech}}<div><strong>Part of speech</strong><span>{{PartOfSpeech}}</span></div>{{/PartOfSpeech}}
        {{#Status}}<div><strong>Status</strong><span>{{Status}}</span></div>{{/Status}}
        {{#JPDB}}<div><strong>Links</strong><span>{{JPDB}}</span></div>{{/JPDB}}
        {{#Source}}<div><strong>Source</strong><span>{{Source}}</span></div>{{/Source}}
    </section>
</main>`
      }
    };
  }
  function yomuCardCss() {
    return `
.card {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif;
    font-size: 20px;
    line-height: 1.45;
    text-align: left;
    color: #f4f7fb;
    background: #15181e;
}
.yomu-card { max-width: 760px; margin: 0 auto; padding: 22px; }
.yomu-expression { font-size: 44px; font-weight: 850; letter-spacing: 0; line-height: 1.1; }
.yomu-reading { margin-top: 6px; color: #bac3d0; font-size: 24px; }
.yomu-sentence {
    margin-top: 18px;
    padding: 14px 16px;
    border: 1px solid #323843;
    border-radius: 12px;
    background: #1e232b;
    color: #d8dee8;
}
.yomu-highlight { color: #7ad119; font-weight: 800; }
.yomu-image img, .yomu-image { max-width: 100%; border-radius: 10px; margin-top: 16px; }
.yomu-section {
    margin-top: 16px;
    padding: 14px 16px;
    border: 1px solid #303641;
    border-radius: 12px;
    background: #1b2028;
}
.yomu-section h2 {
    margin: 0 0 10px;
    color: #c2cad7;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
}
.yomu-definition, .yomu-dict-entry, .yomu-kanji-entry { margin-top: 12px; }
.yomu-definition:first-child, .yomu-dict-entry:first-child, .yomu-kanji-entry:first-child { margin-top: 0; }
.yomu-pos, .yomu-dict-label, .yomu-tags {
    display: inline-block;
    margin: 0 8px 6px 0;
    color: #92a0b3;
    font-size: 14px;
    font-style: italic;
}
.yomu-glossary div { margin-top: 4px; }
.yomu-dict-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.yomu-dict-expression, .yomu-kanji-char { color: #fff; font-size: 24px; font-weight: 800; }
.yomu-dict-reading, .yomu-kanji-reading { color: #aab4c2; }
.yomu-kanji-char { font-size: 34px; }
.yomu-chip {
    display: inline-block;
    margin: 2px 6px 2px 0;
    padding: 2px 8px;
    border: 1px solid #4b5565;
    border-radius: 999px;
    color: #cdd5e1;
    font-size: 14px;
}
.yomu-meta > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.yomu-meta > div:first-child { margin-top: 0; }
.yomu-meta strong { min-width: 112px; color: #8f9aaa; }
a { color: #7ad119; text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { margin: 6px 0 0 22px; padding: 0; }
table { max-width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #353c47; padding: 4px 6px; }
`;
  }
  function renderJpdbMeanings(card) {
    return card.meanings.slice(0, 8).map((meaning) => {
      const pos = formatPartOfSpeech(meaning.partOfSpeech);
      return `<div class="yomu-definition">
            ${pos ? `<span class="yomu-pos">${escapeHtml$1(pos)}</span>` : ""}
            <div>${escapeHtml$1(meaning.glosses.join("; "))}</div>
        </div>`;
    }).join("");
  }
  function renderSentence(sentence, expression) {
    if (!sentence) return "";
    if (!expression || !sentence.includes(expression)) return escapeHtml$1(sentence);
    return sentence.split(expression).map((part) => escapeHtml$1(part)).join(`<span class="yomu-highlight">${escapeHtml$1(expression)}</span>`);
  }
  function renderDictionaryDefinitions(entries, preferences) {
    const groups = groupTermEntriesByDictionary$1(entries).slice(0, 6);
    return groups.map(([dictionary, items]) => `
        <div class="yomu-dict-group">
            <h3 class="yomu-dict-label">${escapeHtml$1(dictionaryLabel(dictionary, preferences))}</h3>
            ${items.slice(0, 6).map((entry) => `
                <div class="yomu-dict-entry">
                    <div class="yomu-dict-head">
                        <span class="yomu-dict-expression">${escapeHtml$1(entry.expression)}</span>
                        ${entry.reading && entry.reading !== entry.expression ? `<span class="yomu-dict-reading">${escapeHtml$1(entry.reading)}</span>` : ""}
                        ${entry.definitionTags || entry.rules || entry.termTags ? `<span class="yomu-tags">${escapeHtml$1([entry.definitionTags, entry.rules, entry.termTags].filter(Boolean).join(" · "))}</span>` : ""}
                    </div>
                    <div class="yomu-glossary">${entry.glossary.slice(0, 5).map((item) => `<div>${safeGlossaryHtml(item)}</div>`).join("")}</div>
                </div>
            `).join("")}
        </div>
    `).join("");
  }
  function renderKanjiDefinitions(entries, preferences) {
    const byCharacter = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const group = byCharacter.get(entry.character) ?? [];
      group.push(entry);
      byCharacter.set(entry.character, group);
    }
    return Array.from(byCharacter.entries()).slice(0, 8).map(([character, items]) => `
        <div class="yomu-kanji-entry">
            <div class="yomu-dict-head">
                <span class="yomu-kanji-char">${escapeHtml$1(character)}</span>
                <span class="yomu-dict-label">${escapeHtml$1(items.map((item) => dictionaryLabel(item.dictionary, preferences)).filter(unique).slice(0, 3).join(" · "))}</span>
            </div>
            ${items.slice(0, 3).map((item) => `
                <div>
                    ${item.onyomi.length ? `<span class="yomu-kanji-reading">On ${escapeHtml$1(item.onyomi.join("、"))}</span>` : ""}
                    ${item.kunyomi.length ? `<span class="yomu-kanji-reading"> Kun ${escapeHtml$1(item.kunyomi.join("、"))}</span>` : ""}
                    <div>${item.meanings.slice(0, 8).map((meaning) => escapeHtml$1(meaning)).join("; ")}</div>
                    ${item.tags.length ? `<span class="yomu-tags">${escapeHtml$1(item.tags.join(" · "))}</span>` : ""}
                </div>
            `).join("")}
        </div>
    `).join("");
  }
  function renderFrequency(card, entries, preferences) {
    const chips = [];
    if (card.frequencyRank) chips.push(`<span class="yomu-chip">JPDB #${card.frequencyRank}</span>`);
    for (const entry of entries) {
      if (entry.mode !== "freq") continue;
      const value = formatMetaFrequency$1(entry.data);
      if (value) chips.push(`<span class="yomu-chip">${escapeHtml$1(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml$1(value)}</span>`);
      if (chips.length >= 8) break;
    }
    return chips.filter(unique).join(" ");
  }
  function renderPitchField(card, entries, preferences) {
    const chips = card.pitchAccent.slice(0, 4).map((pitch) => `<span class="yomu-chip">JPDB ${escapeHtml$1(pitch)}</span>`);
    for (const entry of entries) {
      if (entry.mode !== "pitch") continue;
      const value = formatMetaPitch$1(entry.data);
      if (value) chips.push(`<span class="yomu-chip">${escapeHtml$1(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml$1(value)}</span>`);
      if (chips.length >= 8) break;
    }
    return chips.filter(unique).join(" ");
  }
  function renderSource(sourceUrl, sourceTitle) {
    if (!sourceUrl && !sourceTitle) return "";
    if (!sourceUrl) return escapeHtml$1(sourceTitle);
    const label = sourceTitle || sourceUrl;
    return `<a href="${escapeHtml$1(sourceUrl)}">${escapeHtml$1(label)}</a>`;
  }
  function groupTermEntriesByDictionary$1(entries) {
    const grouped = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const group = grouped.get(entry.dictionary) ?? [];
      group.push(entry);
      grouped.set(entry.dictionary, group);
    }
    return Array.from(grouped.entries());
  }
  function dictionaryLabel(name, preferences) {
    var _a;
    return ((_a = preferences.find((item) => item.name === name)) == null ? void 0 : _a.alias) || name;
  }
  function safeGlossaryHtml(value) {
    const html = glossaryToHtml(value);
    return html || escapeHtml$1(glossaryToText(value));
  }
  function formatMetaFrequency$1(value) {
    if (typeof value === "number" || typeof value === "string") return `#${value}`;
    if (!value || typeof value !== "object") return "";
    const record = value;
    const display = record.displayValue ?? record.frequency ?? record.value;
    return display == null ? "" : `#${String(display)}`;
  }
  function formatMetaPitch$1(value) {
    if (!value || typeof value !== "object") return "";
    const record = value;
    const positions = Array.isArray(record.pitches) ? record.pitches : Array.isArray(record.positions) ? record.positions : [];
    if (positions.length) return positions.slice(0, 4).map(String).join(", ");
    if (typeof record.position === "number") return String(record.position);
    return "";
  }
  function unique(value, index, array) {
    return array.indexOf(value) === index;
  }
  function safeLocationHref() {
    return typeof location === "undefined" ? "" : location.href;
  }
  function safeDocumentTitle() {
    return typeof document === "undefined" ? "" : document.title;
  }
  const APP_NAME = "よむ";
  const APP_PUCK = "よむ";
  const SETTINGS_TITLE = `${APP_NAME} Settings`;
  const SUPPORT_LINKS = {
    discordUsername: "henry281199",
    github: "https://github.com/HRussellZFAC023/kotoba-reader",
    issues: "https://github.com/HRussellZFAC023/kotoba-reader/issues",
    paypal: "https://paypal.me/HenryRussell163",
    migakuPricing: "https://migaku.com/pricing"
  };
  const API_BASE = "https://jpdb.io/api/v1";
  const TOKEN_FIELDS = ["vocabulary_index", "position", "length", "furigana"];
  const VOCABULARY_FIELDS = [
    "vid",
    "sid",
    "rid",
    "spelling",
    "reading",
    "frequency_rank",
    "part_of_speech",
    "meanings_chunks",
    "meanings_part_of_speech",
    "card_state",
    "pitch_accent"
  ];
  const DECK_FIELDS = ["id", "name"];
  const SMALL_KANA = new Set("ゃゅょァィゥェォッャュョ");
  class LruCache {
    constructor(maxSize) {
      __publicField(this, "map", /* @__PURE__ */ new Map());
      this.maxSize = maxSize;
    }
    get(key) {
      const value = this.map.get(key);
      if (value !== void 0) {
        this.map.delete(key);
        this.map.set(key, value);
      }
      return value;
    }
    set(key, value) {
      this.map.delete(key);
      this.map.set(key, value);
      if (this.map.size > this.maxSize) {
        const oldest = this.map.keys().next().value;
        if (oldest !== void 0) this.map.delete(oldest);
      }
    }
    clear() {
      this.map.clear();
    }
  }
  class JpdbClient {
    constructor(getApiKey) {
      __publicField(this, "cardCache", /* @__PURE__ */ new Map());
      __publicField(this, "parseCache", new LruCache(250));
      __publicField(this, "retryAfter", 0);
      this.getApiKey = getApiKey;
    }
    async parse(paragraphs) {
      const text = paragraphs.map((p) => p.trim()).filter(Boolean);
      if (!text.length) return [];
      const cacheKey = text.join("\n");
      const cached = this.parseCache.get(cacheKey);
      if (cached) return cached;
      const raw = await this.request("parse", {
        text,
        position_length_encoding: "utf16",
        token_fields: TOKEN_FIELDS,
        vocabulary_fields: VOCABULARY_FIELDS
      });
      const cards = this.vocabToCards(raw.vocabulary);
      const tokens = this.parseTokens(raw.tokens, cards);
      this.addSentenceInfo(text, tokens);
      for (const card of cards) {
        this.cardCache.set(this.cardKey(card.vid, card.sid), card);
      }
      this.parseCache.set(cacheKey, tokens);
      return tokens;
    }
    async reviewCard(card, grade) {
      await this.request("review", { vid: card.vid, sid: card.sid, grade });
      await this.refreshCard(card);
    }
    async addToDeck(deckId, card, sentence) {
      if (deckId === "forq") {
        await this.requestByUrl("https://jpdb.io/prioritize", {
          v: card.vid,
          s: card.sid,
          origin: "/"
        });
      } else {
        await this.request("deck/add-vocabulary", {
          id: deckId,
          vocabulary: [[card.vid, card.sid]]
        });
      }
      if (sentence) {
        await this.request("set-card-sentence", {
          vid: card.vid,
          sid: card.sid,
          sentence
        }).catch(() => void 0);
      }
      await this.refreshCard(card);
    }
    async listDecks() {
      const response = await this.request("list-user-decks", { fields: DECK_FIELDS });
      return Array.isArray(response.decks) ? response.decks.map(normalizeDeck).filter((deck) => deck !== null) : [];
    }
    async removeFromDeck(deckId, card) {
      await this.request("deck/remove-vocabulary", {
        id: deckId,
        vocabulary: [[card.vid, card.sid]]
      });
      await this.refreshCard(card);
    }
    getCard(vid, sid) {
      return this.cardCache.get(this.cardKey(vid, sid));
    }
    clear() {
      this.cardCache.clear();
      this.parseCache.clear();
    }
    async refreshCard(card) {
      var _a;
      const parsed = await this.parse([card.spelling]);
      const fresh = (_a = parsed.flat().find((token) => token.card.vid === card.vid && token.card.sid === card.sid)) == null ? void 0 : _a.card;
      if (!fresh) return;
      this.cardCache.set(this.cardKey(card.vid, card.sid), fresh);
      card.cardState = fresh.cardState;
    }
    async request(endpoint, body) {
      return this.requestByUrl(`${API_BASE}/${endpoint}`, body);
    }
    async requestByUrl(url, body) {
      const token = this.getApiKey();
      if (!token) throw new Error("JPDB API key is not set.");
      if (Date.now() < this.retryAfter) throw new Error("JPDB is rate limited. Try again in a moment.");
      const response = await postJson(url, token, body);
      if (response.status === 429) {
        this.retryAfter = Date.now() + 3e4;
        throw new Error("JPDB rate limit reached.");
      }
      if (response.status === 403) throw new Error("JPDB rejected the API key.");
      if (!response.ok) throw new Error(`JPDB request failed (${response.status}).`);
      const text = response.text;
      if (!text) return void 0;
      const json = JSON.parse(text);
      if (json && typeof json === "object" && "error_message" in json && json.error_message) {
        throw new Error(json.error_message);
      }
      return json;
    }
    vocabToCards(vocabulary2) {
      return vocabulary2.map(([
        vid,
        sid,
        rid,
        spelling,
        reading,
        frequencyRank2,
        partOfSpeech,
        meaningsChunks,
        meaningsPartOfSpeech,
        cardState,
        pitchAccent
      ]) => ({
        vid,
        sid,
        rid,
        spelling,
        reading,
        frequencyRank: frequencyRank2,
        partOfSpeech,
        meanings: meaningsChunks.map((glosses, index) => ({
          glosses,
          partOfSpeech: meaningsPartOfSpeech[index] ?? []
        })),
        cardState: (cardState == null ? void 0 : cardState.length) ? cardState : ["not-in-deck"],
        pitchAccent: pitchAccent ?? [],
        wordWithReading: null
      }));
    }
    parseTokens(rawTokens, cards) {
      return rawTokens.map((innerTokens) => {
        let lastPitchClass = "";
        return innerTokens.map(([vocabularyIndex, position, length, furigana]) => {
          const card = cards[vocabularyIndex];
          let offset = position;
          const rubies = furigana === null ? [] : furigana.flatMap((part) => {
            if (typeof part === "string") {
              offset += part.length;
              return [];
            }
            const [base, ruby] = part;
            const start = offset;
            const end = offset = start + base.length;
            return [{ text: ruby, start, end, length: base.length }];
          });
          const isParticle = card.partOfSpeech.includes("prt");
          const pitchClass = isParticle ? "" : getPitchClass(card.pitchAccent, card.reading);
          lastPitchClass = pitchClass || lastPitchClass;
          const token = {
            card,
            start: position,
            end: position + length,
            length,
            rubies,
            pitchClass: lastPitchClass
          };
          assignWordWithReading(token);
          return token;
        });
      });
    }
    addSentenceInfo(paragraphs, tokens) {
      paragraphs.forEach((paragraph, index) => {
        const tokenData = tokens[index] ?? [];
        const sentences = splitJapaneseSentences(paragraph);
        if (sentences.length === 1) {
          tokenData.forEach((token) => {
            token.sentence = sentences[0];
          });
          return;
        }
        let offset = 0;
        for (const sentence of sentences) {
          const compare = sentence.replace(/(^[「『])|([。！？」』]$)/g, "");
          const relativeStart = paragraph.slice(offset).indexOf(compare);
          if (relativeStart === -1) {
            offset += sentence.length;
            continue;
          }
          const start = offset + relativeStart;
          const end = start + sentence.length;
          for (const token of tokenData) {
            if (token.start >= start && token.end <= end) token.sentence = sentence;
          }
          offset += sentence.length;
        }
      });
    }
    cardKey(vid, sid) {
      return `${vid}/${sid}`;
    }
  }
  function normalizeDeck(value) {
    if (Array.isArray(value)) {
      const [id, name] = value;
      if ((typeof id === "number" || typeof id === "string") && typeof name === "string") {
        return { id: String(id), name };
      }
    }
    if (value && typeof value === "object") {
      const record = value;
      const id = record.id;
      const name = record.name ?? record.title;
      if ((typeof id === "number" || typeof id === "string") && typeof name === "string") {
        return { id: String(id), name };
      }
    }
    return null;
  }
  function postJson(url, token, body) {
    const data = body ? JSON.stringify(body) : void 0;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    };
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url,
          headers,
          data,
          responseType: "text",
          timeout: 3e4,
          onload: (response) => resolve({
            status: response.status,
            ok: response.status >= 200 && response.status < 300,
            text: String(response.responseText ?? response.response ?? "")
          }),
          onerror: reject,
          ontimeout: () => reject(new Error("JPDB request timed out."))
        });
      });
    }
    return fetch(url, {
      method: "POST",
      headers,
      body: data
    }).then(async (response) => ({
      status: response.status,
      ok: response.ok,
      text: await response.text()
    }));
  }
  function splitJapaneseSentences(text) {
    const sentences = [];
    let start = 0;
    let quote = null;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === "「") quote = "」";
      if (char === "『") quote = "』";
      if (quote) {
        if (char === quote) {
          const next = text[index + 1];
          quote = null;
          if (!next || /\s/.test(next) || !/[、，]/.test(next)) {
            sentences.push(text.slice(start, index + 1).trim());
            start = index + 1;
          }
        }
        continue;
      }
      if ("。！？".includes(char)) {
        const next = text[index + 1];
        const end = next === "」" || next === "』" ? index + 2 : index + 1;
        sentences.push(text.slice(start, end).trim());
        start = end;
        if (next === "」" || next === "』") index++;
      }
    }
    const tail = text.slice(start).trim();
    if (tail) sentences.push(tail);
    return sentences.filter(Boolean).length ? sentences.filter(Boolean) : [text];
  }
  function getPitchClass(pitchAccent, reading) {
    if (!pitchAccent.length) return "";
    const [pitch] = pitchAccent;
    const parts = pitch.split("");
    const first2 = parts.shift();
    const last = parts.pop();
    if (!first2 || !last) return "";
    if (reading.length > 1 && SMALL_KANA.has(reading.charAt(1)) && first2 === parts[0]) {
      parts.shift();
    }
    const rises = (pitch.match(/LH/g) ?? []).length;
    const drops = (pitch.match(/HL/g) ?? []).length;
    const startsLow = first2 === "L";
    const startsHigh = !startsLow;
    const endsLow = last === "L";
    const endsHigh = !endsLow;
    const allHigh = !parts.includes("L");
    if (reading.length === 1 && pitch === "HL") return "odaka";
    if (startsHigh && drops === 1 && parts[0] === "L") return "atamadaka";
    if (startsLow && endsLow && rises === 1) return "nakadaka";
    if (startsLow && rises === 1 && (endsLow || parts.length === 1)) return "odaka";
    if (startsLow && allHigh && endsHigh) return "heiban";
    if (rises > 1 || drops > 1) return "kifuku";
    return "";
  }
  function assignWordWithReading(token) {
    const { card, rubies, start: offset } = token;
    if (!rubies.length) return;
    const word = Array.from(card.spelling);
    for (let i = rubies.length - 1; i >= 0; i--) {
      const { text, start, length } = rubies[i];
      word.splice(start - offset + length, 0, `[${text}]`);
    }
    card.wordWithReading = word.join("");
  }
  const JPDB_KANJI_BASE_URL = "https://jpdb.io/kanji";
  const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
  class JpdbKanjiClient {
    constructor() {
      __publicField(this, "cache", /* @__PURE__ */ new Map());
    }
    lookup(kanji) {
      const key = Array.from(kanji)[0] ?? kanji;
      if (!key) return Promise.resolve(null);
      let promise = this.cache.get(key);
      if (!promise) {
        promise = this.fetchInfo(key);
        this.cache.set(key, promise);
      }
      return promise;
    }
    async fetchInfo(kanji) {
      const html = await requestText$3(`${JPDB_KANJI_BASE_URL}/${encodeURIComponent(kanji)}`).catch(() => "");
      return html ? parseJpdbKanjiHtml(html, kanji) : null;
    }
  }
  function parseJpdbKanjiHtml(html, kanji) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const keyword = sectionText(doc, "Keyword") || metaKeyword(doc, kanji);
    if (!keyword) return null;
    const infoRows = infoTableRows(doc);
    return {
      kanji,
      keyword,
      frequency: infoRows.get("Frequency") ?? "",
      type: [infoRows.get("Type"), infoRows.get("")].filter(Boolean).join(", "),
      kanken: infoRows.get("Kanken") ?? "",
      heisig: infoRows.get("Heisig") ?? "",
      oldForms: oldForms(doc),
      readings: readings(doc),
      components: components(doc),
      mnemonic: sectionText(doc, "Mnemonic"),
      vocabulary: vocabulary(doc).slice(0, 8)
    };
  }
  function sectionText(doc, label) {
    var _a;
    const heading = Array.from(doc.querySelectorAll(".subsection-label")).find((element2) => cleanText$1(element2.textContent ?? "") === label);
    const section = (_a = heading == null ? void 0 : heading.parentElement) == null ? void 0 : _a.querySelector(".subsection");
    return cleanText$1((section == null ? void 0 : section.textContent) ?? "");
  }
  function infoTableRows(doc) {
    const rows = /* @__PURE__ */ new Map();
    doc.querySelectorAll(".cross-table tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 2) return;
      const key = cleanText$1(cells[0].textContent ?? "");
      const value = cleanText$1(cells[1].textContent ?? "");
      if (value) rows.set(key, value);
    });
    return rows;
  }
  function oldForms(doc) {
    const row = Array.from(doc.querySelectorAll(".cross-table tr")).find((item) => {
      var _a;
      return cleanText$1(((_a = item.querySelector("td")) == null ? void 0 : _a.textContent) ?? "") === "Old form";
    });
    return Array.from((row == null ? void 0 : row.querySelectorAll('a[href^="/kanji/"]')) ?? []).map((link) => cleanText$1(link.textContent ?? "")).filter(Boolean);
  }
  function readings(doc) {
    const seen = /* @__PURE__ */ new Set();
    const entries = [];
    doc.querySelectorAll(".kanji-reading-list-common > div, .kanji-reading-list > div").forEach((row) => {
      const link = row.querySelector("a");
      const reading = cleanText$1((link == null ? void 0 : link.textContent) ?? "");
      if (!reading || seen.has(reading)) return;
      seen.add(reading);
      entries.push({
        reading,
        share: cleanText$1(row.textContent ?? "").replace(reading, "").trim(),
        common: row.closest(".kanji-reading-list-common") !== null
      });
    });
    return entries;
  }
  function components(doc) {
    return Array.from(doc.querySelectorAll(".subsection-composed-of-kanji .subsection > div")).map((element2) => {
      var _a, _b;
      return {
        kanji: cleanText$1(((_a = element2.querySelector(".spelling")) == null ? void 0 : _a.textContent) ?? ""),
        keyword: cleanText$1(((_b = element2.querySelector(".description")) == null ? void 0 : _b.textContent) ?? "")
      };
    }).filter((component) => component.kanji && component.keyword);
  }
  function vocabulary(doc) {
    const entries = [];
    doc.querySelectorAll(".subsection-used-in .used-in").forEach((element2) => {
      var _a;
      const link = element2.querySelector('.jp a[href^="/vocabulary/"]');
      if (!link) return;
      const { expression, reading } = vocabularyFromHref(link.getAttribute("href") ?? "");
      const fallbackExpression = expression || textWithoutRuby(link);
      const meaning = cleanText$1(((_a = element2.querySelector(".en")) == null ? void 0 : _a.textContent) ?? "");
      if (!JAPANESE_RE.test(fallbackExpression) || !meaning) return;
      entries.push({
        expression: fallbackExpression,
        reading,
        meaning,
        url: new URL(link.getAttribute("href") ?? "", "https://jpdb.io").toString()
      });
    });
    return entries;
  }
  function vocabularyFromHref(href) {
    const path = href.split("#")[0] ?? href;
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "vocabulary") return { expression: "", reading: "" };
    return {
      expression: decodePathPart(parts[2] ?? ""),
      reading: decodePathPart(parts[3] ?? "")
    };
  }
  function decodePathPart(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  function textWithoutRuby(element2) {
    const clone = element2.cloneNode(true);
    clone.querySelectorAll("rt, rp").forEach((node) => node.remove());
    return cleanText$1(clone.textContent ?? "");
  }
  function metaKeyword(doc, kanji) {
    var _a;
    const description = ((_a = doc.querySelector('meta[name="description"]')) == null ? void 0 : _a.content) ?? "";
    const match = new RegExp(`${escapeRegExp(kanji)}[^—-]*[—-]\\s*([^\\n]+)`).exec(description);
    return cleanText$1((match == null ? void 0 : match[1]) ?? "");
  }
  function cleanText$1(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function requestText$3(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          timeout: 8e3,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) resolve(String(response.responseText ?? ""));
            else reject(new Error(`JPDB kanji request failed (${response.status}).`));
          },
          onerror: reject,
          ontimeout: () => reject(new Error("JPDB kanji request timed out."))
        });
      });
    }
    return fetch(url).then((response) => {
      if (!response.ok) throw new Error(`JPDB kanji request failed (${response.status}).`);
      return response.text();
    });
  }
  function buildKanjiFacts(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, entries) {
    const facts = /* @__PURE__ */ new Map();
    const add = (label, value, source) => {
      const normalized = value == null ? void 0 : value.trim();
      if (!normalized || facts.has(label)) return;
      facts.set(label, { label, value: normalized, source: source || "source unknown" });
    };
    const local = extractLocalKanjiFacts(entries);
    add("Type", normalizeKanjiType(jpdbInfo == null ? void 0 : jpdbInfo.type) ?? local.type, (jpdbInfo == null ? void 0 : jpdbInfo.type) ? "JPDB" : local.typeSource);
    add("JLPT", local.jlpt, local.jlptSource);
    add("Grade", local.grade, local.gradeSource);
    add("Strokes", (kanjiVGInfo == null ? void 0 : kanjiVGInfo.strokeCount) ? String(kanjiVGInfo.strokeCount) : local.strokes, (kanjiVGInfo == null ? void 0 : kanjiVGInfo.strokeCount) ? "stroke trace" : local.strokesSource);
    add("Frequency", (jpdbInfo == null ? void 0 : jpdbInfo.frequency) || local.frequency, (jpdbInfo == null ? void 0 : jpdbInfo.frequency) ? "JPDB" : local.frequencySource);
    add("Kanken", jpdbInfo == null ? void 0 : jpdbInfo.kanken, "JPDB");
    add("RTK frame", rtkInfo == null ? void 0 : rtkInfo.frameNumber, "RTK");
    add("Old forms", jpdbInfo == null ? void 0 : jpdbInfo.oldForms.join("、"), "JPDB");
    if (!facts.has("Character")) add("Character", kanji, "current lookup");
    return Array.from(facts.values()).slice(0, 10);
  }
  function buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, entries) {
    const nodes = /* @__PURE__ */ new Map();
    const edges = [];
    const meanings = entries.flatMap((entry) => entry.meanings).filter(Boolean);
    nodes.set(kanji, {
      id: kanji,
      label: kanji,
      kind: "current",
      detail: first([jpdbInfo == null ? void 0 : jpdbInfo.keyword, rtkInfo == null ? void 0 : rtkInfo.keyword, meanings[0]]) ?? "current kanji"
    });
    const addComponent = (id, detail, label) => {
      if (!id || id === kanji) return;
      const existing = nodes.get(id);
      if (!existing) {
        nodes.set(id, { id, label: id, kind: "component", detail });
      } else if (!existing.detail && detail) {
        existing.detail = detail;
      }
      if (!edges.some((edge) => edge.from === id && edge.to === kanji && edge.label === label)) {
        edges.push({ from: id, to: kanji, label });
      }
    };
    jpdbInfo == null ? void 0 : jpdbInfo.components.forEach((component) => addComponent(component.kanji, component.keyword, "JPDB component"));
    rtkInfo == null ? void 0 : rtkInfo.componentKanji.forEach((component) => addComponent(component, "RTK element", "RTK element"));
    splitRtkElements$1((rtkInfo == null ? void 0 : rtkInfo.elements) ?? "").filter((element2) => !Array.from(element2).some((character) => character === kanji)).slice(0, 6).forEach((element2, index) => {
      const id = `rtk:${index}:${element2}`;
      nodes.set(id, { id, label: element2, kind: "related", detail: "RTK keyword" });
      edges.push({ from: id, to: kanji, label: "memory cue" });
    });
    return { nodes: Array.from(nodes.values()).slice(0, 12), edges: edges.slice(0, 16) };
  }
  function extractLocalKanjiFacts(entries) {
    const facts = {};
    for (const entry of entries) {
      const source = entry.dictionary || "local dictionary";
      for (const tag of entry.tags) {
        readTagFact(tag, facts, source);
      }
      readStatsFacts(entry.stats, facts, source);
    }
    return facts;
  }
  function readTagFact(tag, facts, source) {
    const value = tag.trim();
    const normalized = value.toLowerCase().replace(/[＿_]/g, " ");
    if (!facts.type && /\b(jōyō|jouyou|joyo)\b/.test(normalized)) setFact(facts, "type", "Jōyō kanji", source);
    if (!facts.type && /\b(jinmeiyō|jinmeiyou|jinmeiyo)\b/.test(normalized)) setFact(facts, "type", "Jinmeiyō kanji", source);
    if (!facts.type && /\b(hyōgai|hyougai|hyogai|outside|neither)\b/.test(normalized)) setFact(facts, "type", "Outside jōyō/jinmeiyō", source);
    const jlpt = normalized.match(/\b(?:jlpt\s*)?n?([1-5])\b/);
    if (!facts.jlpt && jlpt && /jlpt|^n[1-5]$/.test(normalized)) setFact(facts, "jlpt", `N${jlpt[1]}`, source);
    const grade = normalized.match(/\b(?:grade|gakunen|school)\s*([1-6])\b/);
    if (!facts.grade && grade) setFact(facts, "grade", `Grade ${grade[1]}`, source);
    const strokes = normalized.match(/\b(?:strokes?|画数)\s*:?\s*(\d{1,2})\b/) ?? normalized.match(/\b(\d{1,2})\s*strokes?\b/);
    if (!facts.strokes && strokes) setFact(facts, "strokes", strokes[1], source);
    const frequency = normalized.match(/\b(?:freq|frequency)\s*:?\s*(\d{1,5})\b/);
    if (!facts.frequency && frequency) setFact(facts, "frequency", `#${frequency[1]}`, source);
  }
  function readStatsFacts(stats, facts, source) {
    if (!stats || typeof stats !== "object") return;
    const values = flattenStats(stats);
    setFact(facts, "jlpt", normalizeJlpt(firstValue(values, ["jlpt", "jlptLevel", "jlpt_level"])), source);
    setFact(facts, "grade", normalizeGrade(firstValue(values, ["grade", "schoolGrade", "gradeLevel", "jouyouGrade"])), source);
    setFact(facts, "strokes", normalizeNumber(firstValue(values, ["strokes", "strokeCount", "stroke_count"])), source);
    setFact(facts, "frequency", normalizeFrequency(firstValue(values, ["frequency", "freq", "frequencyRank"])), source);
  }
  function setFact(facts, key, value, source) {
    if (!value || facts[key]) return;
    facts[key] = value;
    facts[`${key}Source`] = source;
  }
  function flattenStats(stats, prefix = "") {
    const values = /* @__PURE__ */ new Map();
    if (!stats || typeof stats !== "object") return values;
    for (const [key, value] of Object.entries(stats)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      values.set(key, value);
      values.set(fullKey, value);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        flattenStats(value, fullKey).forEach((nestedValue, nestedKey) => values.set(nestedKey, nestedValue));
      }
    }
    return values;
  }
  function firstValue(values, keys) {
    for (const key of keys) {
      if (values.has(key)) return values.get(key);
    }
    return void 0;
  }
  function normalizeKanjiType(value) {
    if (!value) return void 0;
    if (/jinmeiy/i.test(value)) return "Jinmeiyō kanji";
    if (/j[oō]y[oō]|grade/i.test(value)) return "Jōyō kanji";
    return value;
  }
  function normalizeJlpt(value) {
    if (value === void 0 || value === null || value === "") return void 0;
    const match = String(value).match(/[nN]?([1-5])/);
    return match ? `N${match[1]}` : void 0;
  }
  function normalizeGrade(value) {
    if (value === void 0 || value === null || value === "") return void 0;
    const match = String(value).match(/([1-6])/);
    return match ? `Grade ${match[1]}` : void 0;
  }
  function normalizeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    const match = String(value ?? "").match(/\d{1,5}/);
    return match == null ? void 0 : match[0];
  }
  function normalizeFrequency(value) {
    const number = normalizeNumber(value);
    return number ? `#${number}` : void 0;
  }
  function splitRtkElements$1(value) {
    return [...new Set(value.split(/[、,;＋+]/).map((item) => item.trim()).filter(Boolean))].slice(0, 16);
  }
  function first(values) {
    var _a;
    return (_a = values.find((value) => value == null ? void 0 : value.trim())) == null ? void 0 : _a.trim();
  }
  const KANJIVG_RAW_BASE = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji";
  class KanjiVGClient {
    constructor() {
      __publicField(this, "cache", /* @__PURE__ */ new Map());
    }
    lookup(kanji) {
      const character = Array.from(kanji)[0] ?? "";
      if (!character) return Promise.resolve(null);
      let promise = this.cache.get(character);
      if (!promise) {
        promise = this.fetchSvg(character);
        this.cache.set(character, promise);
      }
      return promise;
    }
    async fetchSvg(kanji) {
      const url = kanjiVGUrl(kanji);
      const svgText = await requestText$2(url).catch(() => "");
      if (!svgText) return null;
      return parseKanjiVGSvg(svgText, kanji);
    }
  }
  function kanjiVGUrl(kanji) {
    const codePoint = kanji.codePointAt(0) ?? 0;
    return `${KANJIVG_RAW_BASE}/${codePoint.toString(16).padStart(5, "0")}.svg`;
  }
  function parseKanjiVGSvg(svgText, kanji) {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const sourceSvg = doc.querySelector("svg");
    if (!sourceSvg) return null;
    const viewBox = sourceSvg.getAttribute("viewBox") || "0 0 109 109";
    const paths = Array.from(sourceSvg.querySelectorAll("path")).map((path, index) => {
      const d = path.getAttribute("d");
      if (!d || !/^[MmZzLlHhVvCcSsQqTtAa0-9,.\-\s]+$/.test(d)) return "";
      return `<path d="${escapeHtml$1(d)}" style="--stroke-index:${index}" />`;
    }).filter(Boolean);
    if (!paths.length) return null;
    const numbers = Array.from(sourceSvg.querySelectorAll("text")).map((text) => {
      const transform = text.getAttribute("transform") ?? "";
      const label = (text.textContent ?? "").trim();
      if (!/^[\d]+$/.test(label) || !/^matrix\([0-9,.\-\s]+\)$/.test(transform)) return "";
      return `<text transform="${escapeHtml$1(transform)}">${escapeHtml$1(label)}</text>`;
    }).filter(Boolean);
    const svg = `<svg class="jpdb-reader-kanjivg-svg" viewBox="${escapeHtml$1(viewBox)}" role="img" aria-label="Stroke order for ${escapeHtml$1(kanji)}">
        <g class="jpdb-reader-kanjivg-strokes">${paths.join("")}</g>
        <g class="jpdb-reader-kanjivg-numbers">${numbers.join("")}</g>
    </svg>`;
    return { kanji, svg, strokeCount: paths.length };
  }
  function requestText$2(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          timeout: 8e3,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) resolve(String(response.responseText ?? ""));
            else reject(new Error(`Stroke-order request failed (${response.status}).`));
          },
          onerror: reject,
          ontimeout: () => reject(new Error("Stroke-order request timed out."))
        });
      });
    }
    return fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Stroke-order request failed (${response.status}).`);
      return response.text();
    });
  }
  const COPY = {
    en: {
      settingsTitle: `${APP_NAME} Settings`,
      welcomeLabel: `${APP_NAME} welcome`,
      onboardingEyebrow: "Japanese, wherever it appears",
      onboardingCopy: "Turn Japanese text, subtitles, and image text into tappable dictionary cards. Mine useful words, play audio, and keep the page readable while you study.",
      onboardingLanguage: "Settings language",
      onboardingAddApiKey: "Add API key",
      onboardingUseWithoutApiKey: "Use without API key",
      onboardingNote: "YouTube immersion filtering is included, but starts off. Enable it only when you want a stricter Japanese-only YouTube session.",
      featureText: "Text",
      featureTextBody: "Hover or tap Japanese words once a page is scanned.",
      featureImages: "Images",
      featureImagesBody: "Readable image text can be detected quietly near the viewport.",
      featureVideo: "Video",
      featureVideoBody: "Subtitle words become tappable when subtitles are available.",
      featureControl: "Control",
      featureControlBody: "Open Settings any time to turn features off, change shortcuts, or tune the accent color.",
      quickDescription: "Select Japanese text, tap subtitle words, or read text in images.",
      scanPage: "Scan page",
      scanImages: "Scan images",
      settings: "Settings",
      save: "Save",
      cancel: "Cancel",
      basics: "Basics",
      dictionaries: "Dictionaries",
      media: "Media",
      mining: "Mining",
      shortcuts: "Shortcuts",
      help: "Help",
      interface: "Interface",
      reader: "Reader",
      kanji: "Kanji",
      audio: "Audio",
      images: "Images",
      video: "Video",
      youtube: "YouTube",
      anki: "Anki",
      support: "Support",
      apiKey: "API key",
      jpdbSettings: "JPDB settings",
      addToForq: "Also add mined cards to forq",
      enableReviews: "Enable review actions",
      reviewRatingScale: "Review rating scale",
      fivePoint: "Five point: NOTHING to EASY",
      twoPoint: "Two point: FAIL / PASS",
      settingsLanguage: "Settings language",
      automatic: "Automatic",
      english: "English",
      japanese: "日本語",
      theme: "Theme",
      auto: "Auto",
      dark: "Dark",
      light: "Light",
      popupMode: "Popup mode",
      bottomSheet: "Bottom sheet",
      popover: "Popover",
      accentColor: "Accent color",
      interfaceHelp: "よむ can be used with JPDB first, imported dictionaries first, or local dictionaries only for definitions. Configure source order in Dictionaries.",
      parseSelection: "Lookup selected text",
      lookupOnClick: "Tap or click scanned words",
      lookupOnHover: "Hover scanned words",
      autoScanJapanese: "Auto-scan when Japanese is detected",
      scanVisiblePage: "Scan visible page on load",
      showFloatingButton: "Show floating puck on pages",
      showFurigana: "Enable furigana annotations",
      showPitchAccent: "Show pitch accent",
      hideKnownFurigana: "Hide furigana for known cards only",
      readerHelp: "Hover lookup uses the shortcut below. Leave it blank for plain hover; keep click enabled if you also want tap lookup.",
      kanjivgEnabled: "Show stroke order and drawing pad",
      kanjiOriginsEnabled: "Show kanji facts and origins map",
      rtkEnabled: "Show RTK information",
      similarKanjiWords: "Show words using the same kanji",
      similarKanjiWordLimit: "Similar word limit",
      kanjiHelp: "Click a kanji inside the popup word to see RTK, local kanji dictionary meanings, component keywords, and related words.",
      audioEnabled: "Enable audio playback for terms",
      autoPlayAudio: "Auto-play search result audio",
      audioEnableDefaultSources: "Use built-in audio sources",
      audioSelectionMode: "When a source has several clips",
      firstAudio: "First audio",
      randomAudio: "Random audio",
      audioViaBlob: "Fetch as blob for iOS Tampermonkey",
      audioTimeoutMs: "Audio timeout (ms)",
      audioHelp: "Supports {term}, {reading}, and {language}. See the Yomitan audio guide.",
      audioSource: "Audio source",
      urlVoice: "URL / voice",
      addAudioSource: "Add audio source",
      ocrEnabled: "Read text in images",
      ocrAutoScanImages: "Read images automatically",
      ocrShowTextOverlay: "Show recognized text on images",
      ocrProvider: "Image reading",
      googleLens: "Google Lens (recommended)",
      localOcr: "Local OCR app",
      cloudVision: "Google Cloud Vision",
      off: "Off",
      ocrMaxImagesPerPage: "Images to read per page",
      ocrMinImageArea: "Smallest image to read",
      ocrMaxImagePixels: "Image detail",
      lightWork: "Light",
      normal: "Normal",
      more: "More",
      largeOnly: "Large images only",
      includeSmall: "Include small images",
      faster: "Faster",
      balanced: "Balanced",
      sharper: "Sharper",
      ocrTextColor: "Image text color",
      ocrOutlineColor: "Image text outline",
      ocrBackgroundColor: "Image highlight background",
      ocrBackgroundOpacity: "Image highlight opacity",
      ocrFontScale: "Image text scale",
      ocrEndpointUrl: "Local OCR app URL",
      ocrEngine: "Local OCR engine",
      cloudVisionApiKey: "Cloud Vision API key",
      ocrHelp: "Images are read quietly near the viewport. Google Lens handles normal images by default; embedded OCR metadata is instant. Recognized areas stay transparent until you tap or hover.",
      subtitlePlayerEnabled: "Enable video subtitle player",
      subtitleAutoDetect: "Auto-detect page subtitles",
      subtitleOverlayVisible: "Show subtitle overlay",
      subtitleSecondaryVisible: "Show native subtitles when available",
      subtitleMiningPause: "Pause video when mining subtitle",
      subtitleControlsMode: "Subtitle controls",
      showWhenNeeded: "Show when needed",
      hideControls: "Hide controls",
      alwaysVisible: "Always visible",
      subtitleFontSize: "Subtitle font size",
      subtitleBottomOffset: "Subtitle bottom offset (%)",
      subtitleTextColor: "Subtitle color",
      subtitleOutlineColor: "Subtitle outline",
      subtitleBackgroundColor: "Subtitle background",
      subtitleBackgroundOpacity: "Subtitle background opacity",
      subtitleFontFamily: "Subtitle font family",
      subtitleFontWeight: "Subtitle font weight",
      subtitleSeekPadding: "Subtitle seek padding (seconds)",
      youtubeImmersionEnabled: "Only show Japanese-looking YouTube videos",
      youtubeShowFilterNotice: "Show reveal control for hidden videos",
      youtubeHelp: "Off by default. Turn it on when you want YouTube recommendations, search, and sidebars to stay focused on Japanese-looking video cards.",
      youtubeFilterOn: "YouTube filter on",
      youtubeFilterOff: "YouTube filter off",
      youtubeShowAnyway: "Show anyway",
      youtubeFilterAgain: "Filter again",
      youtubeTurnOff: "Turn off",
      youtubeToggleToastOn: "YouTube immersion filter enabled.",
      youtubeToggleToastOff: "YouTube immersion filter disabled.",
      ankiEnabled: "Enable Anki mining",
      ankiMineWithJpdb: "Also add to Anki when adding to JPDB",
      ankiCaptureScreenshot: "Attach video screenshot when possible",
      ankiConnectUrl: "AnkiConnect URL",
      ankiDeck: "Anki deck",
      ankiModel: "Anki note type",
      ankiTags: "Tags",
      testAnki: "Test Anki",
      ankiHelp: "Anki uses AnkiConnect. The よむ note type includes JPDB meaning/status, imported dictionary entries, kanji cards, pitch/frequency data, source links, and optional video images.",
      jpdbDefinitionsEnabled: "Show JPDB definitions",
      localDictionariesEnabled: "Show imported dictionary definitions",
      localDictionaryShowKanji: "Show kanji dictionary cards",
      localDictionaryMaxResults: "Dictionary result limit",
      importSettings: "Import settings JSON",
      exportSettings: "Export settings JSON",
      importDictionaries: "Import dictionaries",
      exportDictionaries: "Export dictionaries",
      dictionaryImportHelp: "Import Yomitan settings exports, Yomitan dictionary ZIPs, or exported dictionary backups.",
      recommendedDownloads: "Recommended dictionary downloads",
      downloadMissingRecommended: "Download missing recommended",
      refreshInstalledList: "Refresh installed list",
      homepage: "Homepage",
      download: "Download",
      update: "Update",
      noLocalDictionaries: "No local dictionaries imported yet.",
      checkingDictionaries: "Checking imported dictionaries...",
      dictionaryOnlyJpdb: "JPDB is the only definition source. Import Yomitan dictionaries to add local or native-language definitions.",
      decksLoaded: "Decks are loaded from your JPDB account.",
      decksUnavailable: "Could not load decks yet; saved deck IDs will be kept.",
      addApiKeyChooseDecks: "Add your JPDB API key to choose decks.",
      holdWhileHovering: "Hold while hovering",
      pressKeys: "Press keys",
      blankPlainHover: "Blank means hover without a key",
      openSettings: "Open settings",
      playAudio: "Play audio",
      closePopup: "Close popup",
      previousSubtitle: "Previous subtitle",
      nextSubtitle: "Next subtitle",
      copySubtitle: "Copy subtitle",
      toggleImageReading: "Toggle image reading",
      toggleYoutubeImmersion: "Toggle YouTube filter",
      readImagesNow: "Read images now",
      gradeNothing: "Grade NOTHING",
      gradeSomething: "Grade SOMETHING",
      gradeHard: "Grade HARD",
      gradeOkay: "Grade OKAY",
      gradeEasy: "Grade EASY",
      gradeFail: "Pass/fail: FAIL",
      gradePass: "Pass/fail: PASS",
      supportTitle: "Free Japanese reading and mining tools",
      supportCopy: "よむ brings popup lookup, JPDB mining, imported dictionaries, subtitles, image reading, and Anki export into one free userscript. Comparable study suites such as Migaku currently advertise paid plans from $10/month; よむ offers the same core reading-and-mining workflow for free.",
      supportDonation: "Donations are optional. They help cover the time, testing devices, services, and maintenance that keep the reader polished.",
      donate: "Donate",
      reportIssue: "Report issue",
      github: "GitHub",
      copyDiscord: "Copy Discord",
      openOnJpdb: "Open on JPDB",
      add: "Add",
      forget: "Forget",
      never: "Never",
      unlist: "Unlist",
      blacklist: "Blacklist",
      addToAnki: "Add to Anki",
      noDefinitions: "No enabled definition source returned results."
    },
    ja: {
      settingsTitle: `${APP_NAME} 設定`,
      welcomeLabel: `${APP_NAME} へようこそ`,
      onboardingEyebrow: "日本語がある場所ならどこでも",
      onboardingCopy: "ページの文章、字幕、画像内の日本語をタップできる辞書カードにします。音声を聞き、単語を採掘し、読みやすさを保ったまま学習できます。",
      onboardingLanguage: "表示言語",
      onboardingAddApiKey: "APIキーを追加",
      onboardingUseWithoutApiKey: "APIキーなしで使う",
      onboardingNote: "YouTube没入フィルターも入っていますが、最初はオフです。日本語動画だけに集中したい時にオンにしてください。",
      featureText: "文章",
      featureTextBody: "ページを読み取ると、日本語の単語をホバーまたはタップできます。",
      featureImages: "画像",
      featureImagesBody: "画面付近の読みやすい画像内テキストを静かに検出します。",
      featureVideo: "動画",
      featureVideoBody: "字幕が見つかると、字幕内の単語もタップできます。",
      featureControl: "調整",
      featureControlBody: "設定から機能のオンオフ、ショートカット、アクセント色をいつでも変更できます。",
      quickDescription: "日本語テキストを選択、字幕の単語をタップ、または画像内テキストを読み取ります。",
      scanPage: "ページを読む",
      scanImages: "画像を読む",
      settings: "設定",
      save: "保存",
      cancel: "キャンセル",
      basics: "基本",
      dictionaries: "辞書",
      media: "メディア",
      mining: "採掘",
      shortcuts: "ショートカット",
      help: "ヘルプ",
      interface: "表示",
      reader: "リーダー",
      kanji: "漢字",
      audio: "音声",
      images: "画像",
      video: "動画",
      youtube: "YouTube",
      anki: "Anki",
      support: "サポート",
      apiKey: "APIキー",
      jpdbSettings: "JPDB設定",
      addToForq: "採掘したカードをforqにも追加",
      enableReviews: "復習ボタンを表示",
      reviewRatingScale: "復習評価",
      fivePoint: "5段階: NOTHINGからEASY",
      twoPoint: "2段階: FAIL / PASS",
      settingsLanguage: "表示言語",
      automatic: "自動",
      english: "English",
      japanese: "日本語",
      theme: "テーマ",
      auto: "自動",
      dark: "ダーク",
      light: "ライト",
      popupMode: "ポップアップ表示",
      bottomSheet: "下シート",
      popover: "ポップオーバー",
      accentColor: "アクセント色",
      interfaceHelp: "よむはJPDB優先、インポート辞書優先、またはローカル辞書のみでも使えます。辞書タブで表示順を調整できます。",
      parseSelection: "選択したテキストを調べる",
      lookupOnClick: "読み取り済み単語をタップ/クリック",
      lookupOnHover: "読み取り済み単語をホバー",
      autoScanJapanese: "日本語を検出したら自動で読む",
      scanVisiblePage: "読み込み時に見える範囲を読む",
      showFloatingButton: "ページに浮動ボタンを表示",
      showFurigana: "ふりがなを表示",
      showPitchAccent: "ピッチアクセントを表示",
      hideKnownFurigana: "既知カードだけふりがなを隠す",
      readerHelp: "ホバー検索は下のショートカットを使います。空欄なら通常ホバー、クリックも使いたい場合はタップ/クリックをオンにしてください。",
      kanjivgEnabled: "筆順と手書き練習を表示",
      kanjiOriginsEnabled: "漢字の基本情報と成り立ちマップを表示",
      rtkEnabled: "RTK情報を表示",
      similarKanjiWords: "同じ漢字を使う単語を表示",
      similarKanjiWordLimit: "関連単語の上限",
      kanjiHelp: "ポップアップ内の漢字をクリックすると、RTK、漢字辞書、構成要素、関連単語を確認できます。",
      audioEnabled: "単語音声を有効化",
      autoPlayAudio: "検索結果の音声を自動再生",
      audioEnableDefaultSources: "内蔵音声ソースを使う",
      audioSelectionMode: "複数音声がある時",
      firstAudio: "最初の音声",
      randomAudio: "ランダム音声",
      audioViaBlob: "iOS Tampermonkey用にblobで取得",
      audioTimeoutMs: "音声タイムアウト (ms)",
      audioHelp: "{term}、{reading}、{language} に対応。Yomitan音声ガイドも参照できます。",
      audioSource: "音声ソース",
      urlVoice: "URL / 声",
      addAudioSource: "音声ソースを追加",
      ocrEnabled: "画像内テキストを読む",
      ocrAutoScanImages: "画像を自動で読む",
      ocrShowTextOverlay: "認識テキストを画像に表示",
      ocrProvider: "画像の読み取り",
      googleLens: "Google Lens (推奨)",
      localOcr: "ローカルOCRアプリ",
      cloudVision: "Google Cloud Vision",
      off: "オフ",
      ocrMaxImagesPerPage: "1ページで読む画像数",
      ocrMinImageArea: "読む最小画像サイズ",
      ocrMaxImagePixels: "画像精細度",
      lightWork: "軽め",
      normal: "標準",
      more: "多め",
      largeOnly: "大きい画像のみ",
      includeSmall: "小さい画像も含める",
      faster: "高速",
      balanced: "バランス",
      sharper: "高精細",
      ocrTextColor: "画像テキスト色",
      ocrOutlineColor: "画像テキストの縁取り",
      ocrBackgroundColor: "画像ハイライト背景",
      ocrBackgroundOpacity: "画像ハイライト濃度",
      ocrFontScale: "画像テキスト倍率",
      ocrEndpointUrl: "ローカルOCRアプリURL",
      ocrEngine: "ローカルOCRエンジン",
      cloudVisionApiKey: "Cloud Vision APIキー",
      ocrHelp: "画像は画面付近で静かに読み取ります。通常画像はGoogle Lensが既定です。認識範囲はタップまたはホバーするまで透明のままです。",
      subtitlePlayerEnabled: "動画字幕プレイヤーを有効化",
      subtitleAutoDetect: "ページ字幕を自動検出",
      subtitleOverlayVisible: "字幕オーバーレイを表示",
      subtitleSecondaryVisible: "利用可能なら母語字幕も表示",
      subtitleMiningPause: "字幕から採掘する時に一時停止",
      subtitleControlsMode: "字幕コントロール",
      showWhenNeeded: "必要な時だけ表示",
      hideControls: "隠す",
      alwaysVisible: "常に表示",
      subtitleFontSize: "字幕サイズ",
      subtitleBottomOffset: "字幕の下位置 (%)",
      subtitleTextColor: "字幕色",
      subtitleOutlineColor: "字幕の縁取り",
      subtitleBackgroundColor: "字幕背景",
      subtitleBackgroundOpacity: "字幕背景の濃度",
      subtitleFontFamily: "字幕フォント",
      subtitleFontWeight: "字幕の太さ",
      subtitleSeekPadding: "字幕移動の余白 (秒)",
      youtubeImmersionEnabled: "日本語らしいYouTube動画だけ表示",
      youtubeShowFilterNotice: "非表示動画の表示ボタンを出す",
      youtubeHelp: "既定ではオフです。YouTubeのおすすめ、検索、サイドバーを日本語らしい動画に集中させたい時にオンにしてください。",
      youtubeFilterOn: "YouTubeフィルター: オン",
      youtubeFilterOff: "YouTubeフィルター: オフ",
      youtubeShowAnyway: "それでも表示",
      youtubeFilterAgain: "もう一度隠す",
      youtubeTurnOff: "オフにする",
      youtubeToggleToastOn: "YouTube没入フィルターをオンにしました。",
      youtubeToggleToastOff: "YouTube没入フィルターをオフにしました。",
      ankiEnabled: "Anki採掘を有効化",
      ankiMineWithJpdb: "JPDB追加時にAnkiにも追加",
      ankiCaptureScreenshot: "可能なら動画スクリーンショットを添付",
      ankiConnectUrl: "AnkiConnect URL",
      ankiDeck: "Ankiデッキ",
      ankiModel: "Ankiノートタイプ",
      ankiTags: "タグ",
      testAnki: "Ankiをテスト",
      ankiHelp: "AnkiConnectを使います。よむノートタイプにはJPDBの意味・状態、インポート辞書、漢字カード、ピッチ・頻度、出典リンク、可能なら動画画像を入れます。",
      jpdbDefinitionsEnabled: "JPDB定義を表示",
      localDictionariesEnabled: "インポート辞書の定義を表示",
      localDictionaryShowKanji: "漢字辞書カードを表示",
      localDictionaryMaxResults: "辞書結果の上限",
      importSettings: "設定JSONをインポート",
      exportSettings: "設定JSONをエクスポート",
      importDictionaries: "辞書をインポート",
      exportDictionaries: "辞書をエクスポート",
      dictionaryImportHelp: "Yomitan設定JSON、Yomitan辞書ZIP、またはエクスポートした辞書バックアップに対応しています。",
      recommendedDownloads: "おすすめ辞書のダウンロード",
      downloadMissingRecommended: "未導入のおすすめをダウンロード",
      refreshInstalledList: "導入済み一覧を更新",
      homepage: "ホームページ",
      download: "ダウンロード",
      update: "更新",
      noLocalDictionaries: "ローカル辞書はまだインポートされていません。",
      checkingDictionaries: "インポート済み辞書を確認中...",
      dictionaryOnlyJpdb: "現在の定義ソースはJPDBのみです。Yomitan辞書をインポートすると、ローカル辞書や母語辞書の定義を追加できます。",
      decksLoaded: "デッキはJPDBアカウントから読み込みました。",
      decksUnavailable: "まだデッキを読み込めません。保存済みのデッキIDは維持されます。",
      addApiKeyChooseDecks: "JPDB APIキーを追加するとデッキを選べます。",
      holdWhileHovering: "ホバー中に押すキー",
      pressKeys: "キーを押してください",
      blankPlainHover: "空欄ならキーなしホバー",
      openSettings: "設定を開く",
      playAudio: "音声を再生",
      closePopup: "ポップアップを閉じる",
      previousSubtitle: "前の字幕",
      nextSubtitle: "次の字幕",
      copySubtitle: "字幕をコピー",
      toggleImageReading: "画像読み取りを切替",
      toggleYoutubeImmersion: "YouTubeフィルターを切替",
      readImagesNow: "今すぐ画像を読む",
      gradeNothing: "NOTHING評価",
      gradeSomething: "SOMETHING評価",
      gradeHard: "HARD評価",
      gradeOkay: "OKAY評価",
      gradeEasy: "EASY評価",
      gradeFail: "FAIL評価",
      gradePass: "PASS評価",
      supportTitle: "無料の日本語リーダー・採掘ツール",
      supportCopy: "よむはポップアップ辞書、JPDB採掘、インポート辞書、字幕、画像読み取り、Anki出力を1つの無料ユーザースクリプトにまとめます。Migakuのような学習スイートは月$10からの有料プランを案内していますが、よむは同じ中心的な読解・採掘ワークフローを無料で提供します。",
      supportDonation: "寄付は任意です。テスト端末、サービス、メンテナンス、磨き込みの時間を支える助けになります。",
      donate: "寄付",
      reportIssue: "不具合報告",
      github: "GitHub",
      copyDiscord: "Discordをコピー",
      openOnJpdb: "JPDBで開く",
      add: "追加",
      forget: "解除",
      never: "Never",
      unlist: "解除",
      blacklist: "ブラックリスト",
      addToAnki: "Ankiに追加",
      noDefinitions: "有効な辞書ソースから定義が見つかりませんでした。"
    }
  };
  function resolveUiLanguage(language) {
    if (language === "ja") return "ja";
    if (language === "en") return "en";
    return typeof navigator !== "undefined" && /^ja\b/i.test(navigator.language) ? "ja" : "en";
  }
  function uiText(language, key) {
    return COPY[resolveUiLanguage(language)][key] ?? COPY.en[key];
  }
  class OnboardingController {
    constructor(options) {
      __publicField(this, "panel");
      __publicField(this, "backdrop");
      __publicField(this, "languageSelect");
      this.options = options;
    }
    async showIfNeeded() {
      if (this.options.getSettings().onboardingSeen) return false;
      this.show();
      return true;
    }
    show() {
      this.close();
      this.backdrop = document.createElement("div");
      this.backdrop.className = "jpdb-reader-backdrop jpdb-reader-onboarding-backdrop";
      this.backdrop.dataset.jpdbReaderRoot = "true";
      this.panel = document.createElement("section");
      this.panel.className = "jpdb-reader-onboarding";
      this.panel.dataset.jpdbReaderRoot = "true";
      this.panel.setAttribute("role", "dialog");
      this.panel.setAttribute("aria-modal", "true");
      this.panel.setAttribute("aria-label", uiText(this.options.getSettings().interfaceLanguage, "welcomeLabel"));
      this.panel.tabIndex = -1;
      const eyebrow = element("div", "jpdb-reader-onboarding-eyebrow", uiText(this.options.getSettings().interfaceLanguage, "onboardingEyebrow"));
      const title = element("h2", "", APP_NAME);
      const copy = element(
        "p",
        "",
        uiText(this.options.getSettings().interfaceLanguage, "onboardingCopy")
      );
      const featureGrid = document.createElement("div");
      featureGrid.className = "jpdb-reader-onboarding-grid";
      const featureKeys = [
        ["featureText", "featureTextBody"],
        ["featureImages", "featureImagesBody"],
        ["featureVideo", "featureVideoBody"],
        ["featureControl", "featureControlBody"]
      ];
      featureKeys.forEach(([headingKey, textKey]) => {
        const card = document.createElement("div");
        card.append(
          element("strong", "", uiText(this.options.getSettings().interfaceLanguage, headingKey)),
          element("span", "", uiText(this.options.getSettings().interfaceLanguage, textKey))
        );
        featureGrid.append(card);
      });
      const language = document.createElement("label");
      language.className = "jpdb-reader-onboarding-language";
      const languageText = element("span", "", uiText(this.options.getSettings().interfaceLanguage, "onboardingLanguage"));
      this.languageSelect = document.createElement("select");
      this.languageSelect.name = "interfaceLanguage";
      [
        ["auto", uiText(this.options.getSettings().interfaceLanguage, "automatic")],
        ["en", uiText(this.options.getSettings().interfaceLanguage, "english")],
        ["ja", uiText(this.options.getSettings().interfaceLanguage, "japanese")]
      ].forEach(([value, text]) => {
        var _a;
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        option.selected = value === this.options.getSettings().interfaceLanguage;
        (_a = this.languageSelect) == null ? void 0 : _a.append(option);
      });
      language.append(languageText, this.languageSelect);
      const actions = document.createElement("div");
      actions.className = "jpdb-reader-onboarding-actions";
      const setup = button(uiText(this.options.getSettings().interfaceLanguage, "onboardingAddApiKey"));
      setup.className = "jpdb-reader-btn add";
      setup.addEventListener("click", () => void this.complete(true));
      const browse = button(uiText(this.options.getSettings().interfaceLanguage, "onboardingUseWithoutApiKey"));
      browse.className = "jpdb-reader-btn";
      browse.addEventListener("click", () => void this.complete(false));
      actions.append(setup, browse);
      this.languageSelect.addEventListener("change", () => {
        var _a;
        const language2 = normalizeLanguage((_a = this.languageSelect) == null ? void 0 : _a.value, this.options.getSettings().interfaceLanguage);
        this.options.setSettings({ ...this.options.getSettings(), interfaceLanguage: language2 });
        this.localize(language2);
      });
      const note = element("p", "jpdb-reader-onboarding-note", uiText(this.options.getSettings().interfaceLanguage, "onboardingNote"));
      this.panel.append(eyebrow, title, copy, language, actions, featureGrid, note);
      document.body.append(this.backdrop, this.panel);
      this.panel.focus();
    }
    localize(language) {
      var _a, _b, _c, _d, _e;
      const panel = this.panel;
      if (!panel) return;
      panel.setAttribute("aria-label", uiText(language, "welcomeLabel"));
      (_a = panel.querySelector(".jpdb-reader-onboarding-eyebrow")) == null ? void 0 : _a.replaceChildren(uiText(language, "onboardingEyebrow"));
      const copy = panel.querySelector("p:not(.jpdb-reader-onboarding-note)");
      copy == null ? void 0 : copy.replaceChildren(uiText(language, "onboardingCopy"));
      (_b = panel.querySelector(".jpdb-reader-onboarding-language span")) == null ? void 0 : _b.replaceChildren(uiText(language, "onboardingLanguage"));
      const options = [
        ["auto", uiText(language, "automatic")],
        ["en", uiText(language, "english")],
        ["ja", uiText(language, "japanese")]
      ];
      options.forEach(([value, text]) => {
        var _a2;
        const option = (_a2 = this.languageSelect) == null ? void 0 : _a2.querySelector(`option[value="${value}"]`);
        if (option) option.textContent = text;
      });
      const cards = Array.from(panel.querySelectorAll(".jpdb-reader-onboarding-grid > div"));
      const cardKeys = [
        ["featureText", "featureTextBody"],
        ["featureImages", "featureImagesBody"],
        ["featureVideo", "featureVideoBody"],
        ["featureControl", "featureControlBody"]
      ];
      cards.forEach((card, index) => {
        var _a2, _b2;
        const [headingKey, bodyKey] = cardKeys[index] ?? cardKeys[0];
        (_a2 = card.querySelector("strong")) == null ? void 0 : _a2.replaceChildren(uiText(language, headingKey));
        (_b2 = card.querySelector("span")) == null ? void 0 : _b2.replaceChildren(uiText(language, bodyKey));
      });
      (_c = panel.querySelector(".jpdb-reader-onboarding-actions .jpdb-reader-btn.add")) == null ? void 0 : _c.replaceChildren(uiText(language, "onboardingAddApiKey"));
      (_d = panel.querySelector(".jpdb-reader-onboarding-actions .jpdb-reader-btn:not(.add)")) == null ? void 0 : _d.replaceChildren(uiText(language, "onboardingUseWithoutApiKey"));
      (_e = panel.querySelector(".jpdb-reader-onboarding-note")) == null ? void 0 : _e.replaceChildren(uiText(language, "onboardingNote"));
    }
    async complete(openSettings) {
      var _a;
      const language = (_a = this.languageSelect) == null ? void 0 : _a.value;
      const settings = {
        ...this.options.getSettings(),
        onboardingSeen: true,
        interfaceLanguage: language === "en" || language === "ja" || language === "auto" ? language : this.options.getSettings().interfaceLanguage
      };
      this.options.setSettings(settings);
      await saveSettings(settings);
      this.close();
      if (openSettings) this.options.showSettings();
    }
    close() {
      var _a, _b;
      (_a = this.panel) == null ? void 0 : _a.remove();
      (_b = this.backdrop) == null ? void 0 : _b.remove();
      this.panel = void 0;
      this.backdrop = void 0;
      this.languageSelect = void 0;
    }
  }
  function normalizeLanguage(value, fallback) {
    return value === "en" || value === "ja" || value === "auto" ? value : fallback;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }
  function button(text) {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = text;
    return node;
  }
  const MAX_CACHE_ITEMS = 36;
  const GOOGLE_LENS_ENDPOINT = "https://lensfrontend-pa.googleapis.com/v1/crupload";
  const GOOGLE_LENS_API_KEY = "AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY";
  const LENS_PLATFORM_WEB = 3;
  const LENS_SURFACE_CHROMIUM = 4;
  const LENS_AUTO_FILTER = 7;
  const LENS_WRITING_TOP_TO_BOTTOM = 2;
  class ImageOcrController {
    constructor(options) {
      __publicField(this, "states", /* @__PURE__ */ new Map());
      __publicField(this, "cache", /* @__PURE__ */ new Map());
      __publicField(this, "observer");
      __publicField(this, "observerMargin", "");
      __publicField(this, "mutationObserver");
      __publicField(this, "queue", []);
      __publicField(this, "busy", false);
      __publicField(this, "positionFrame", 0);
      __publicField(this, "refreshTimer", 0);
      this.options = options;
    }
    init() {
      this.refresh();
      window.addEventListener("scroll", () => {
        this.schedulePosition();
        this.scheduleRefresh(240);
      }, { passive: true });
      window.addEventListener("resize", () => {
        this.schedulePosition();
        this.scheduleRefresh(300);
      }, { passive: true });
      this.mutationObserver = new MutationObserver((mutations) => {
        if (mutations.some((mutation) => [...mutation.addedNodes].some(nodeContainsImage))) this.refresh();
      });
      this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
    refresh() {
      var _a;
      const settings = this.options.getSettings();
      if (!settings.ocrEnabled) {
        this.clear();
        return;
      }
      this.pruneDisconnectedStates();
      this.ensureObserver(settings);
      const images = Array.from(document.images).filter((image) => isCandidateImage(image, settings) && shouldObserveImage(image, settings)).sort((a, b) => imageViewportDistance(a) - imageViewportDistance(b)).slice(0, settings.ocrMaxImagesPerPage);
      for (const image of images) {
        this.ensureState(image);
        (_a = this.observer) == null ? void 0 : _a.observe(image);
      }
      this.schedulePosition();
    }
    toggle() {
      const settings = this.options.getSettings();
      settings.ocrEnabled = !settings.ocrEnabled;
      this.options.onToast(settings.ocrEnabled ? "Image reading enabled." : "Image reading hidden.");
      this.refresh();
    }
    async scanVisible() {
      this.refresh();
      const images = [...this.states.keys()].filter((image) => isNearViewport(image, 120));
      if (!images.length) {
        this.options.onToast("No readable images nearby.");
        return;
      }
      images.forEach((image) => this.enqueue(image, true));
    }
    ensureObserver(settings) {
      var _a;
      const rootMargin = `${settings.ocrPrefetchMargin}px 0px`;
      if (this.observer && this.observerMargin === rootMargin) return;
      (_a = this.observer) == null ? void 0 : _a.disconnect();
      this.observerMargin = rootMargin;
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const image = entry.target;
          this.positionState(image);
          const current = this.options.getSettings();
          if (current.ocrAutoScanImages && shouldObserveImage(image, current)) this.enqueue(image);
        }
      }, { rootMargin });
    }
    ensureState(image) {
      const existing = this.states.get(image);
      if (existing) return existing;
      const overlay = document.createElement("div");
      overlay.className = "jpdb-ocr-layer";
      overlay.dataset.jpdbReaderRoot = "true";
      const status = document.createElement("div");
      status.className = "jpdb-ocr-status";
      status.hidden = true;
      overlay.append(status);
      document.body.append(overlay);
      const state = { image, overlay, status, key: imageCacheKey(image), loading: false, overlayRequested: false, manualRequested: false, autoSkipped: false };
      image.addEventListener("load", () => {
        this.resetStateIfImageChanged(state);
        this.schedulePosition();
        this.scheduleRefresh(80);
      });
      this.states.set(image, state);
      return state;
    }
    enqueue(image, userRequested = false) {
      const state = this.states.get(image) ?? this.ensureState(image);
      if (state.autoSkipped && !userRequested) return;
      state.overlayRequested || (state.overlayRequested = userRequested || Boolean(readFallbackOcrResult(image, false)));
      state.manualRequested || (state.manualRequested = userRequested);
      if (userRequested) state.autoSkipped = false;
      if (state.result) {
        if (userRequested) void this.renderResult(state, state.result, true);
        return;
      }
      if (state.loading) return;
      if (!this.queue.includes(image)) this.queue.push(image);
      if (userRequested) {
        state.status.hidden = false;
        state.status.textContent = "Reading image...";
      }
      this.drainQueue();
    }
    drainQueue() {
      var _a;
      if (this.busy) return;
      const image = this.queue.shift();
      if (!image) return;
      this.busy = true;
      const hasFastText = Boolean(readFallbackOcrResult(image, false));
      const delay = ((_a = this.states.get(image)) == null ? void 0 : _a.overlayRequested) || hasFastText ? 0 : 900;
      void waitForIdle(delay).then(() => this.scanImage(image)).finally(() => {
        this.busy = false;
        this.drainQueue();
      });
    }
    async scanImage(image) {
      const state = this.states.get(image) ?? this.ensureState(image);
      const settings = this.options.getSettings();
      const key = imageCacheKey(image);
      const manualRequested = state.manualRequested;
      this.resetStateIfImageChanged(state);
      const cached = this.cache.get(key);
      if (cached) {
        await this.renderResult(state, cached);
        state.manualRequested = false;
        return;
      }
      state.loading = true;
      state.status.hidden = !state.overlayRequested;
      const canUseLocalService = settings.ocrProvider === "local-service" && settings.ocrEndpointUrl.trim();
      const canUseCloudVision = settings.ocrProvider === "cloud-vision" && settings.ocrCloudVisionApiKey.trim();
      const canUseGoogleLens = settings.ocrProvider === "google-lens";
      state.status.textContent = "Reading image...";
      try {
        const inlineFallback = readFallbackOcrResult(image, false);
        const providerResult = inlineFallback ? null : canUseLocalService ? await recognizeViaLocalService(image, settings) : canUseCloudVision ? await recognizeViaCloudVision(image, settings) : canUseGoogleLens ? await recognizeViaGoogleLens(image, settings) : null;
        const result = inlineFallback ?? providerResult;
        if (!(result == null ? void 0 : result.lines.length)) {
          state.autoSkipped = !manualRequested;
          state.status.textContent = "No Japanese text found";
          state.status.hidden = !state.overlayRequested || state.autoSkipped;
          return;
        }
        this.remember(key, result);
        state.key = key;
        await this.renderResult(state, result);
      } catch (error) {
        const fallback = readFallbackOcrResult(image, false);
        if (fallback == null ? void 0 : fallback.lines.length) {
          await this.renderResult(state, fallback);
        } else {
          state.status.textContent = error instanceof Error ? error.message : "OCR failed";
          state.autoSkipped = !manualRequested;
          state.status.hidden = !state.overlayRequested || state.autoSkipped;
        }
      } finally {
        state.loading = false;
        state.manualRequested = false;
      }
    }
    async renderResult(state, result, forceOverlay = false) {
      var _a;
      state.result = result;
      state.status.hidden = true;
      state.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
      const settings = this.options.getSettings();
      const showText = settings.ocrShowTextOverlay || forceOverlay;
      const sentence = result.lines.map((line) => line.text).join("\n");
      const parsed = settings.apiKey.trim() ? await Promise.all(result.lines.map((line) => this.options.parseJapanese(line.text).catch(() => []))) : result.lines.map(() => []);
      state.overlay.style.setProperty("--jpdb-ocr-text-color", settings.ocrTextColor);
      state.overlay.style.setProperty("--jpdb-ocr-outline-color", settings.ocrOutlineColor);
      state.overlay.style.setProperty("--jpdb-ocr-background-rgba", accentToRgba(settings.ocrBackgroundColor, settings.ocrBackgroundOpacity));
      state.overlay.style.setProperty("--jpdb-ocr-background-active-rgba", accentToRgba(settings.ocrBackgroundColor, Math.min(1, settings.ocrBackgroundOpacity + 0.12)));
      for (const [index, line] of result.lines.entries()) {
        const element2 = document.createElement("div");
        element2.className = "jpdb-ocr-line";
        if (showText) element2.classList.add("jpdb-ocr-line-visible");
        element2.dataset.ocrText = line.text;
        element2.dataset.vertical = String(line.vertical);
        element2.dataset.boxWidth = String(line.box.width / result.width);
        element2.dataset.boxHeight = String(line.box.height / result.height);
        element2.dataset.sentence = sentence;
        element2.title = line.text;
        element2.tabIndex = 0;
        element2.style.left = `${100 * line.box.left / result.width}%`;
        element2.style.top = `${100 * line.box.top / result.height}%`;
        element2.style.width = `${100 * line.box.width / result.width}%`;
        element2.style.height = `${100 * line.box.height / result.height}%`;
        element2.style.writingMode = line.vertical ? "vertical-rl" : "horizontal-tb";
        element2.setAttribute("aria-label", line.text);
        setInnerHtml(element2, ((_a = parsed[index]) == null ? void 0 : _a.length) ? renderTokensToHtml(line.text, parsed[index], settings) : escapeHtml$1(line.text));
        element2.addEventListener("click", (event) => {
          if (event.target.closest(".jpdb-reader-word")) return;
          event.preventDefault();
          event.stopPropagation();
          state.overlay.classList.toggle("jpdb-ocr-layer-expanded");
        });
        state.overlay.append(element2);
      }
      this.positionState(state.image);
    }
    resetStateIfImageChanged(state) {
      const key = imageCacheKey(state.image);
      if (key === state.key) return;
      state.key = key;
      state.result = void 0;
      state.loading = false;
      state.overlayRequested = false;
      state.manualRequested = false;
      state.autoSkipped = false;
      state.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
      state.status.hidden = true;
    }
    remember(key, result) {
      this.cache.set(key, result);
      while (this.cache.size > MAX_CACHE_ITEMS) {
        const oldest = this.cache.keys().next().value;
        if (!oldest) break;
        this.cache.delete(oldest);
      }
    }
    schedulePosition() {
      if (this.positionFrame) return;
      this.positionFrame = requestAnimationFrame(() => {
        this.positionFrame = 0;
        for (const image of this.states.keys()) this.positionState(image);
      });
    }
    scheduleRefresh(delay) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.refresh(), delay);
    }
    positionState(image) {
      const state = this.states.get(image);
      if (!state) return;
      const rect = image.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
      state.overlay.hidden = !visible;
      if (!visible) return;
      state.overlay.style.left = `${rect.left}px`;
      state.overlay.style.top = `${rect.top}px`;
      state.overlay.style.width = `${rect.width}px`;
      state.overlay.style.height = `${rect.height}px`;
      this.fitLineFonts(state, rect.width, rect.height);
    }
    fitLineFonts(state, imageWidth, imageHeight) {
      const scale = this.options.getSettings().ocrFontScale;
      state.overlay.querySelectorAll(".jpdb-ocr-line").forEach((element2) => {
        const boxWidth = Number(element2.dataset.boxWidth) * imageWidth;
        const boxHeight = Number(element2.dataset.boxHeight) * imageHeight;
        if (!Number.isFinite(boxWidth) || !Number.isFinite(boxHeight) || boxWidth <= 0 || boxHeight <= 0) return;
        const text = element2.dataset.ocrText ?? "";
        const vertical = element2.dataset.vertical === "true";
        element2.style.fontSize = `${ocrFontPx(text, boxWidth, boxHeight, vertical, scale)}px`;
      });
    }
    clear() {
      var _a;
      (_a = this.observer) == null ? void 0 : _a.disconnect();
      this.observer = void 0;
      this.observerMargin = "";
      window.clearTimeout(this.refreshTimer);
      this.queue = [];
      for (const state of this.states.values()) state.overlay.remove();
      this.states.clear();
    }
    pruneDisconnectedStates() {
      var _a;
      for (const [image, state] of this.states) {
        if (image.isConnected) continue;
        (_a = this.observer) == null ? void 0 : _a.unobserve(image);
        state.overlay.remove();
        this.states.delete(image);
      }
    }
  }
  function normalizeOcrResult(value, fallbackWidth = 1, fallbackHeight = 1) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const cloudVision = normalizeCloudVisionResponse(record, fallbackWidth, fallbackHeight);
    if (cloudVision) return cloudVision;
    const resolution = record.context_resolution;
    const width = numberFrom(record.width) || numberFrom(resolution == null ? void 0 : resolution.width) || fallbackWidth;
    const height = numberFrom(record.height) || numberFrom(resolution == null ? void 0 : resolution.height) || fallbackHeight;
    const rawLines = Array.isArray(record.lines) ? record.lines : Array.isArray(record.regions) ? record.regions : void 0;
    const lines = [];
    if (rawLines) {
      for (const item of rawLines) {
        const line = normalizeSimpleLine(item, width, height);
        if (line) lines.push(line);
      }
    }
    if (Array.isArray(record.results)) {
      for (const item of record.results) {
        lines.push(...normalizeStructuredOcrResult(item, width, height));
      }
    }
    if (Array.isArray(record.ocr_regions)) {
      for (const region of record.ocr_regions) {
        const regionRecord = region;
        const regionBox = normalizeOcrRegion(regionRecord, width, height);
        const scaleWidth = (regionBox == null ? void 0 : regionBox.width) ?? width;
        const scaleHeight = (regionBox == null ? void 0 : regionBox.height) ?? height;
        if (Array.isArray(regionRecord.results)) {
          for (const item of regionRecord.results) {
            const regionLines = normalizeStructuredOcrResult(item, scaleWidth, scaleHeight);
            lines.push(...regionBox ? regionLines.map((line) => offsetLineToRegion(line, regionBox, width, height)).filter((line) => Boolean(line)) : regionLines);
          }
        }
      }
    }
    const japaneseLines = lines.filter((line) => line.text.length > 0 && HAS_JAPANESE.test(line.text));
    return japaneseLines.length ? { width, height, lines: japaneseLines } : null;
  }
  function readFallbackOcrResult(image, _includeAccessibleText = false) {
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const data = image.dataset.ocrLines;
    if (data) {
      try {
        const parsed = normalizeOcrResult({ width, height, lines: JSON.parse(data) }, width, height);
        if (parsed) return parsed;
      } catch {
      }
    }
    return null;
  }
  function ocrFontPx(text, boxWidth, boxHeight, vertical, scale) {
    const safeScale = Math.max(0.7, Math.min(1.8, scale));
    const length = Math.max(1, visualTextLength(text));
    const byBoxThickness = vertical ? boxWidth * 0.72 : boxHeight * 0.58;
    const byBoxLength = vertical ? boxHeight / length * 1.12 : boxWidth / length * 1.08;
    const fitted = Math.min(byBoxThickness, byBoxLength) * safeScale;
    return Math.max(11, Math.min(38, fitted));
  }
  function visualTextLength(text) {
    return [...text.trim()].reduce((total, char) => {
      if (/\s/.test(char)) return total + 0.35;
      if (/[\u0000-\u00ff]/.test(char)) return total + 0.62;
      return total + 1;
    }, 0);
  }
  async function recognizeViaLocalService(image, settings) {
    const canvas = await imageToCanvas(image, settings.ocrMaxImagePixels);
    const payload = await canvasToBase64Payload(canvas);
    const engine = settings.ocrEngine === "auto" ? "" : settings.ocrEngine;
    const body = JSON.stringify({
      id: imageCacheKey(image),
      language_code: settings.ocrLanguage || "ja-JP",
      language: {
        bcp47_tag: settings.ocrLanguage || "ja-JP",
        two_letter_code: (settings.ocrLanguage || "ja").slice(0, 2)
      },
      base64_image: payload.base64,
      image: payload.base64,
      image_bytes: payload.base64,
      ocr_engine: engine,
      ocr_adapter_name: engine,
      detection_only: false
    });
    const response = await requestJson(settings.ocrEndpointUrl.trim(), body, settings.audioTimeoutMs);
    return normalizeOcrResult(response, payload.width, payload.height);
  }
  async function recognizeViaCloudVision(image, settings) {
    const canvas = await imageToCanvas(image, settings.ocrMaxImagePixels);
    const payload = await canvasToBase64Payload(canvas);
    const body = JSON.stringify({
      requests: [{
        image: { content: payload.base64 },
        features: [{ type: "TEXT_DETECTION", maxResults: 50, model: "builtin/latest" }],
        imageContext: { languageHints: ["ja"] }
      }]
    });
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(settings.ocrCloudVisionApiKey.trim())}`;
    const response = await requestJson(url, body, settings.audioTimeoutMs);
    return normalizeOcrResult(response, payload.width, payload.height);
  }
  async function recognizeViaGoogleLens(image, settings) {
    const canvas = await imageToCanvas(image, settings.ocrMaxImagePixels);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.88);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const body = createGoogleLensRequest(bytes, canvas.width, canvas.height, settings.ocrLanguage);
    try {
      const response = await requestArrayBuffer(GOOGLE_LENS_ENDPOINT, body, settings.audioTimeoutMs);
      return parseGoogleLensResponse(new Uint8Array(response), canvas.width, canvas.height);
    } catch {
      return recognizeViaGoogleLensUpload(blob, canvas.width, canvas.height, settings.audioTimeoutMs);
    }
  }
  async function recognizeViaGoogleLensUpload(blob, width, height, timeout) {
    const data = new FormData();
    data.append("encoded_image", blob, "image.jpg");
    const response = await requestTextForm("https://lens.google.com/v3/upload?stcs=" + Date.now().toString().slice(0, 10), data, timeout);
    return parseGoogleLensUploadHtml(response, width, height);
  }
  async function imageToCanvas(image, maxPixels) {
    try {
      return drawImageToCanvas(image, maxPixels);
    } catch {
      const url = image.currentSrc || image.src;
      if (!url || url.startsWith("data:")) throw new Error("Image cannot be read by OCR.");
      const blob = await requestBlob(url);
      const objectUrl = URL.createObjectURL(blob);
      try {
        const loaded = await loadImage(objectUrl);
        return drawImageToCanvas(loaded, maxPixels);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }
  function drawImageToCanvas(image, maxPixels) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("Image is not loaded yet.");
    const scale = Math.min(1, Math.sqrt(Math.max(16e4, maxPixels) / (width * height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  async function canvasToBase64Payload(canvas) {
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.86);
    return { base64: (await blobToDataUrl(blob)).split(",")[1] ?? "", width: canvas.width, height: canvas.height };
  }
  function createGoogleLensRequest(imageBytes, width, height, locale) {
    const [language = "ja", region = "US"] = (locale || "ja-JP").split(/[-_]/);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const requestId = protoMessage(
      protoVarintField(1, BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1e6))),
      protoVarintField(2, 1),
      protoVarintField(3, 1),
      protoBytesField(4, randomBytes(16))
    );
    const localeContext = protoMessage(
      protoStringField(1, language || "ja"),
      protoStringField(2, region || "US"),
      protoStringField(3, timeZone)
    );
    const clientFilters = protoMessage(protoMessageField(1, protoMessage(protoVarintField(1, LENS_AUTO_FILTER))));
    const clientContext = protoMessage(
      protoVarintField(1, LENS_PLATFORM_WEB),
      protoVarintField(2, LENS_SURFACE_CHROMIUM),
      protoMessageField(4, localeContext),
      protoMessageField(17, clientFilters)
    );
    const requestContext = protoMessage(
      protoMessageField(3, requestId),
      protoMessageField(4, clientContext)
    );
    const imageData = protoMessage(
      protoMessageField(1, protoMessage(protoBytesField(1, imageBytes))),
      protoMessageField(3, protoMessage(protoVarintField(1, width), protoVarintField(2, height)))
    );
    return protoMessage(protoMessageField(1, protoMessage(
      protoMessageField(1, requestContext),
      protoMessageField(3, imageData)
    )));
  }
  function parseGoogleLensResponse(bytes, width, height) {
    const root = decodeProtoMessage(bytes);
    const objectsResponse = protoFirstMessage(root, 2);
    const text = objectsResponse ? protoFirstMessage(objectsResponse, 3) : null;
    const layout = text ? protoFirstMessage(text, 1) : null;
    if (!layout) return null;
    const lines = [];
    for (const paragraph of protoMessages(layout, 1)) {
      const paragraphVertical = protoNumber(paragraph, 4) === LENS_WRITING_TOP_TO_BOTTOM;
      const paragraphBox = protoBox(protoFirstMessage(paragraph, 3), width, height);
      for (const line of protoMessages(paragraph, 2)) {
        const lineBox = protoBox(protoFirstMessage(line, 2), width, height);
        const words = protoMessages(line, 1).map((word) => ({
          text: protoString(word, 2),
          separator: protoString(word, 3),
          box: protoBox(protoFirstMessage(word, 4), width, height)
        })).filter((word) => word.text);
        const orderedWords = paragraphVertical ? words : [...words].sort((a, b) => {
          var _a, _b;
          return (((_a = a.box) == null ? void 0 : _a.left) ?? 0) - (((_b = b.box) == null ? void 0 : _b.left) ?? 0);
        });
        const rawText = orderedWords.map((word, index) => word.text + (word.separator || (index < orderedWords.length - 1 ? " " : ""))).join("");
        const textValue = cleanOcrText(rawText);
        if (!textValue || !HAS_JAPANESE.test(textValue)) continue;
        const box = lineBox ?? unionBoxes(words.map((word) => word.box).filter((item) => Boolean(item))) ?? paragraphBox;
        if (!box) continue;
        lines.push({
          text: textValue,
          box,
          vertical: paragraphVertical || box.height > box.width * 1.25 && textValue.length > 1
        });
      }
    }
    return lines.length ? { width, height, lines } : null;
  }
  function parseGoogleLensUploadHtml(html, width, height) {
    var _a, _b, _c, _d, _e, _f;
    const match = html.match(/AF_initDataCallback\((\{key:\s*['"]ds:1['"][\s\S]*?\})\);/);
    if (!match) return null;
    try {
      const callback = Function(`"use strict";return (${match[1]});`)();
      const blocks = ((_c = (_b = (_a = callback.data) == null ? void 0 : _a[2]) == null ? void 0 : _b[3]) == null ? void 0 : _c[0]) ?? [];
      const lines = [];
      for (const block of blocks) {
        const blockData = block;
        const rawLines = (_f = (_e = (_d = blockData[2]) == null ? void 0 : _d[0]) == null ? void 0 : _e[5]) == null ? void 0 : _f[3];
        const lineItems = rawLines == null ? void 0 : rawLines[0];
        if (!Array.isArray(lineItems)) continue;
        for (const item of lineItems) {
          const lineData = item;
          const words = Array.isArray(lineData[0]) ? lineData[0] : [];
          const boxData = Array.isArray(lineData[1]) ? lineData[1] : [];
          const text = cleanOcrText(words.map((word) => {
            const wordData = word;
            return `${wordData[0] ?? ""}${wordData[3] ?? ""}`;
          }).join(""));
          const box = boxData.length >= 4 ? clampBox({
            top: Number(boxData[0]) * height,
            left: Number(boxData[1]) * width,
            width: Number(boxData[2]) * width,
            height: Number(boxData[3]) * height
          }, width, height) : null;
          if (text && box && HAS_JAPANESE.test(text)) {
            lines.push({ text, box, vertical: box.height > box.width * 1.25 && text.length > 1 });
          }
        }
      }
      return lines.length ? { width, height, lines } : null;
    } catch {
      return null;
    }
  }
  function normalizeSimpleLine(value, width, height) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const text = stringFrom(record.text) || stringFrom(record.content) || stringFrom(record.sentence);
    const box = normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: Boolean(record.vertical ?? record.is_vertical) };
  }
  function normalizeCloudVisionResponse(record, fallbackWidth, fallbackHeight) {
    var _a;
    const responses = Array.isArray(record.responses) ? record.responses : "fullTextAnnotation" in record ? [record] : [];
    const lines = [];
    let width = fallbackWidth;
    let height = fallbackHeight;
    for (const response of responses) {
      const annotation = response == null ? void 0 : response.fullTextAnnotation;
      const pages = Array.isArray(annotation == null ? void 0 : annotation.pages) ? annotation.pages : [];
      for (const page of pages) {
        const pageRecord = page;
        width = numberFrom(pageRecord.width) || width;
        height = numberFrom(pageRecord.height) || height;
        const blocks = Array.isArray(pageRecord.blocks) ? pageRecord.blocks : [];
        for (const block of blocks) {
          const paragraphs = Array.isArray(block.paragraphs) ? block.paragraphs : [];
          for (const paragraph of paragraphs) {
            pushCloudVisionParagraphLines(paragraph, lines, width, height);
          }
        }
      }
      const annotations = Array.isArray(response == null ? void 0 : response.textAnnotations) ? response.textAnnotations : [];
      if (!lines.length && annotations.length > 1) {
        for (const annotationItem of annotations.slice(1)) {
          const item = annotationItem;
          const text = cleanOcrText(item.description);
          const box = normalizeCloudVisionVertices((_a = item.boundingPoly) == null ? void 0 : _a.vertices, width, height);
          if (text && box && HAS_JAPANESE.test(text)) lines.push({ text, box, vertical: box.height > box.width * 1.25 && text.length > 1 });
        }
      }
    }
    return lines.length ? { width, height, lines } : null;
  }
  function pushCloudVisionParagraphLines(paragraph, lines, width, height) {
    var _a, _b, _c;
    const words = Array.isArray(paragraph.words) ? paragraph.words : [];
    let text = "";
    let boxes = [];
    const pushLine = () => {
      const value = cleanOcrText(text);
      const box = unionBoxes(boxes);
      if (value && box && HAS_JAPANESE.test(value)) {
        lines.push({ text: value, box, vertical: box.height > box.width * 1.25 && value.length > 1 });
      }
      text = "";
      boxes = [];
    };
    for (const word of words) {
      const symbols = Array.isArray(word.symbols) ? word.symbols : [];
      for (const symbol of symbols) {
        const symbolRecord = symbol;
        text += String(symbolRecord.text ?? "");
        const box = normalizeCloudVisionVertices((_a = symbolRecord.boundingBox) == null ? void 0 : _a.vertices, width, height);
        if (box) boxes.push(box);
        const breakType = (_c = (_b = symbolRecord.property) == null ? void 0 : _b.detectedBreak) == null ? void 0 : _c.type;
        if (breakType === "SPACE" || breakType === "SURE_SPACE" || breakType === "UNKNOWN") text += " ";
        if (breakType === "LINE_BREAK" || breakType === "EOL_SURE_SPACE" || breakType === "HYPHEN") pushLine();
      }
    }
    pushLine();
  }
  function normalizeCloudVisionVertices(value, width, height) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const xs = value.map((vertex) => numberFrom(vertex == null ? void 0 : vertex.x) ?? 0);
    const ys = value.map((vertex) => numberFrom(vertex == null ? void 0 : vertex.y) ?? 0);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return clampBox({ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }, width, height);
  }
  function normalizeStructuredOcrResult(value, width, height) {
    var _a;
    if (!value || typeof value !== "object") return [];
    const record = value;
    const textLines = Array.isArray(record.text_lines) ? record.text_lines : Array.isArray(record.text) ? record.text : [];
    const vertical = Boolean(record.is_vertical ?? ((_a = record.box) == null ? void 0 : _a.isVertical));
    const lines = textLines.map((item) => {
      var _a2;
      const lineRecord = item;
      const text2 = stringFrom((lineRecord == null ? void 0 : lineRecord.content) ?? (lineRecord == null ? void 0 : lineRecord.text) ?? (lineRecord == null ? void 0 : lineRecord.word));
      const box2 = normalizeBox(lineRecord.box ?? lineRecord.boundingBox ?? lineRecord, width, height);
      return text2 && box2 ? { text: text2, box: box2, vertical: Boolean(lineRecord.is_vertical ?? ((_a2 = lineRecord.box) == null ? void 0 : _a2.isVertical) ?? vertical) } : null;
    }).filter((line) => line !== null);
    if (lines.length) return lines;
    const text = textLines.map((item) => stringFrom(item == null ? void 0 : item.content)).filter(Boolean).join("");
    const box = normalizeBox(record.box, width, height);
    return text && box ? [{ text, box, vertical }] : [];
  }
  function normalizeOcrRegion(record, width, height) {
    const position = record.position;
    const size = record.size;
    if (!position || !size) return null;
    const left = numberFrom(position.left);
    const top = numberFrom(position.top);
    const regionWidth = numberFrom(size.width);
    const regionHeight = numberFrom(size.height);
    if (left === null || top === null || regionWidth === null || regionHeight === null) return null;
    const fractional = Math.max(left, top, regionWidth, regionHeight) <= 1;
    const box = clampBox({
      left: (fractional ? left : left / 100) * width,
      top: (fractional ? top : top / 100) * height,
      width: (fractional ? regionWidth : regionWidth / 100) * width,
      height: (fractional ? regionHeight : regionHeight / 100) * height
    }, width, height);
    if (!box) return null;
    const isFullImage = box.left <= 1 && box.top <= 1 && box.width >= width - 2 && box.height >= height - 2;
    return isFullImage ? null : box;
  }
  function offsetLineToRegion(line, region, width, height) {
    const box = clampBox({
      left: region.left + line.box.left,
      top: region.top + line.box.top,
      width: line.box.width,
      height: line.box.height
    }, width, height);
    return box ? { ...line, box } : null;
  }
  function normalizeBox(value, width, height) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const position = record.position;
    const dimensions = record.dimensions;
    if (position && dimensions) {
      const left2 = numberFrom(position.left);
      const top2 = numberFrom(position.top);
      const boxWidth = numberFrom(dimensions.width);
      const boxHeight = numberFrom(dimensions.height);
      if (left2 !== null && top2 !== null && boxWidth !== null && boxHeight !== null) {
        return clampBox({
          left: left2 / 100 * width,
          top: top2 / 100 * height,
          width: boxWidth / 100 * width,
          height: boxHeight / 100 * height
        }, width, height);
      }
    }
    const directLeft = numberFrom(record.left ?? record.x);
    const directTop = numberFrom(record.top ?? record.y);
    const directWidth = numberFrom(record.width ?? record.w);
    const directHeight = numberFrom(record.height ?? record.h);
    if (directLeft !== null && directTop !== null && directWidth !== null && directHeight !== null) {
      const percent2 = directLeft <= 1 && directTop <= 1 && directWidth <= 1 && directHeight <= 1;
      return clampBox({
        left: percent2 ? directLeft * width : directLeft,
        top: percent2 ? directTop * height : directTop,
        width: percent2 ? directWidth * width : directWidth,
        height: percent2 ? directHeight * height : directHeight
      }, width, height);
    }
    const points = ["top_left", "top_right", "bottom_right", "bottom_left"].map((key) => record[key]).filter(Boolean);
    if (points.length < 2) return null;
    const xs = points.map((point) => numberFrom(point == null ? void 0 : point.x)).filter((item) => item !== null);
    const ys = points.map((point) => numberFrom(point == null ? void 0 : point.y)).filter((item) => item !== null);
    if (!xs.length || !ys.length) return null;
    const percent = xs.every((value2) => value2 >= 0 && value2 <= 1) && ys.every((value2) => value2 >= 0 && value2 <= 1);
    const scaledXs = percent ? xs.map((value2) => value2 * width) : xs;
    const scaledYs = percent ? ys.map((value2) => value2 * height) : ys;
    const left = Math.min(...scaledXs);
    const top = Math.min(...scaledYs);
    return clampBox({ left, top, width: Math.max(...scaledXs) - left, height: Math.max(...scaledYs) - top }, width, height);
  }
  function clampBox(box, width, height) {
    const left = Math.max(0, Math.min(width, box.left));
    const top = Math.max(0, Math.min(height, box.top));
    const right = Math.max(left, Math.min(width, box.left + Math.max(0, box.width)));
    const bottom = Math.max(top, Math.min(height, box.top + Math.max(0, box.height)));
    if (right - left < 2 || bottom - top < 2) return null;
    return { left, top, width: right - left, height: bottom - top };
  }
  function unionBoxes(boxes) {
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.left + box.width));
    const bottom = Math.max(...boxes.map((box) => box.top + box.height));
    return { left, top, width: right - left, height: bottom - top };
  }
  function cleanOcrText(value) {
    const text = typeof value === "string" ? value : String(value ?? "");
    const normalized = text.replace(/[ \t\r\n]+/g, HAS_JAPANESE.test(text) ? "" : " ").trim();
    return normalized.replaceAll("．．．", "…");
  }
  function isCandidateImage(image, settings) {
    if (image.closest("[data-jpdb-reader-root]")) return false;
    const rect = image.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area < settings.ocrMinImageArea) return false;
    if (!isNearViewport(image, settings.ocrPrefetchMargin)) return false;
    const style = getComputedStyle(image);
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
  }
  function shouldObserveImage(image, settings) {
    if (settings.ocrProvider === "off") return false;
    if (readFallbackOcrResult(image, false)) return true;
    if (settings.ocrProvider === "local-service") return Boolean(settings.ocrEndpointUrl.trim());
    if (settings.ocrProvider === "cloud-vision") return Boolean(settings.ocrCloudVisionApiKey.trim());
    return settings.ocrProvider === "google-lens";
  }
  function isNearViewport(element2, margin) {
    const rect = element2.getBoundingClientRect();
    return rect.bottom >= -margin && rect.top <= window.innerHeight + margin && rect.right >= -margin && rect.left <= window.innerWidth + margin;
  }
  function imageViewportDistance(image) {
    const rect = image.getBoundingClientRect();
    if (rect.bottom < 0) return -rect.bottom;
    if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
    if (rect.right < 0) return -rect.right;
    if (rect.left > window.innerWidth) return rect.left - window.innerWidth;
    return 0;
  }
  function nodeContainsImage(node) {
    return node instanceof HTMLImageElement || node instanceof Element && Boolean(node.querySelector("img"));
  }
  function imageCacheKey(image) {
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
  }
  function protoMessage(...parts) {
    return concatBytes(parts);
  }
  function protoMessageField(field, value) {
    return concatBytes([protoTag(field, 2), encodeVarint(value.length), value]);
  }
  function protoBytesField(field, value) {
    return protoMessageField(field, value);
  }
  function protoStringField(field, value) {
    return protoBytesField(field, new TextEncoder().encode(value));
  }
  function protoVarintField(field, value) {
    return concatBytes([protoTag(field, 0), encodeVarint(value)]);
  }
  function protoTag(field, wire) {
    return encodeVarint(field << 3 | wire);
  }
  function encodeVarint(value) {
    let item = BigInt(value);
    const bytes = [];
    do {
      let byte = Number(item & 0x7fn);
      item >>= 7n;
      if (item) byte |= 128;
      bytes.push(byte);
    } while (item);
    return new Uint8Array(bytes);
  }
  function decodeProtoMessage(bytes) {
    const fields = [];
    let offset = 0;
    while (offset < bytes.length) {
      const [tag, nextOffset] = readVarint(bytes, offset);
      offset = nextOffset;
      const field = Number(tag >> 3n);
      const wire = Number(tag & 7n);
      if (!field) break;
      if (wire === 0) {
        const [value, afterValue] = readVarint(bytes, offset);
        offset = afterValue;
        fields.push({ field, wire, value });
      } else if (wire === 1) {
        fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true) });
        offset += 8;
      } else if (wire === 2) {
        const [length, afterLength] = readVarint(bytes, offset);
        offset = afterLength;
        const end = offset + Number(length);
        fields.push({ field, wire, value: bytes.slice(offset, end) });
        offset = end;
      } else if (wire === 5) {
        fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true) });
        offset += 4;
      } else {
        break;
      }
    }
    return fields;
  }
  function readVarint(bytes, offset) {
    let shift = 0n;
    let result = 0n;
    while (offset < bytes.length) {
      const byte = bytes[offset++];
      result |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return [result, offset];
      shift += 7n;
    }
    return [result, offset];
  }
  function protoMessages(fields, field) {
    return fields.filter((item) => item.field === field && item.wire === 2 && item.value instanceof Uint8Array).map((item) => decodeProtoMessage(item.value));
  }
  function protoFirstMessage(fields, field) {
    return protoMessages(fields, field)[0] ?? null;
  }
  function protoString(fields, field) {
    const item = fields.find((value) => value.field === field && value.wire === 2 && value.value instanceof Uint8Array);
    return item ? new TextDecoder().decode(item.value) : "";
  }
  function protoNumber(fields, field) {
    const item = fields.find((value) => value.field === field);
    if (!item) return 0;
    return typeof item.value === "bigint" ? Number(item.value) : typeof item.value === "number" ? item.value : 0;
  }
  function protoBox(geometry, width, height) {
    const box = geometry ? protoFirstMessage(geometry, 1) : null;
    if (!box) return null;
    const centerX = protoNumber(box, 1);
    const centerY = protoNumber(box, 2);
    const boxWidth = protoNumber(box, 3);
    const boxHeight = protoNumber(box, 4);
    if (!boxWidth || !boxHeight) return null;
    const normalized = centerX <= 2 && centerY <= 2 && boxWidth <= 2 && boxHeight <= 2;
    return clampBox({
      left: (normalized ? centerX * width : centerX) - (normalized ? boxWidth * width : boxWidth) / 2,
      top: (normalized ? centerY * height : centerY) - (normalized ? boxHeight * height : boxHeight) / 2,
      width: normalized ? boxWidth * width : boxWidth,
      height: normalized ? boxHeight * height : boxHeight
    }, width, height);
  }
  function concatBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
  function requestJson(url, data, timeout) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url,
          headers: { "content-type": "application/json" },
          data,
          responseType: "json",
          timeout,
          onload: (response) => response.status >= 200 && response.status < 300 ? resolve(response.response ?? (response.responseText ? JSON.parse(response.responseText) : null)) : reject(new Error(`OCR endpoint returned ${response.status}.`)),
          onerror: reject,
          ontimeout: () => reject(new Error("OCR timed out."))
        });
      });
    }
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: data }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`OCR endpoint returned ${response.status}.`)));
  }
  function requestArrayBuffer(url, data, timeout) {
    const body = new Uint8Array(data);
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url,
          headers: {
            "content-type": "application/x-protobuf",
            "x-goog-api-key": GOOGLE_LENS_API_KEY,
            accept: "*/*",
            "accept-language": "ja,en-US;q=0.9,en;q=0.8"
          },
          data: body.buffer,
          responseType: "arraybuffer",
          timeout,
          onload: (response) => response.status >= 200 && response.status < 300 ? resolve(response.response) : reject(new Error(`Google Lens returned ${response.status}.`)),
          onerror: reject,
          ontimeout: () => reject(new Error("Google Lens timed out."))
        });
      });
    }
    return fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-protobuf",
        "x-goog-api-key": GOOGLE_LENS_API_KEY,
        accept: "*/*",
        "accept-language": "ja,en-US;q=0.9,en;q=0.8"
      },
      body: body.buffer
    }).then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Google Lens returned ${response.status}.`)));
  }
  function requestTextForm(url, data, timeout) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url,
          data,
          responseType: "text",
          timeout,
          onload: (response) => response.status >= 200 && response.status < 300 ? resolve(String(response.responseText ?? response.response ?? "")) : reject(new Error(`Google Lens upload returned ${response.status}.`)),
          onerror: reject,
          ontimeout: () => reject(new Error("Google Lens upload timed out."))
        });
      });
    }
    return fetch(url, { method: "POST", body: data }).then((response) => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
  }
  function requestBlob(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "blob",
          onload: (response) => response.status >= 200 && response.status < 300 ? resolve(response.response) : reject(new Error(`Image fetch returned ${response.status}.`)),
          onerror: reject
        });
      });
    }
    return fetch(url).then((response) => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
  }
  function waitForIdle(timeout) {
    if (!timeout) return Promise.resolve();
    return new Promise((resolve) => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => resolve(), { timeout });
      } else {
        globalThis.setTimeout(resolve, timeout);
      }
    });
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image decode failed."));
      image.src = url;
    });
  }
  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Image encoding failed.")), type, quality);
    });
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Blob read failed."));
      reader.readAsDataURL(blob);
    });
  }
  function stringFrom(value) {
    return typeof value === "string" ? value.replace(/\s+/g, "").trim() : "";
  }
  function numberFrom(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  const RECOMMENDED_JAPANESE_DICTIONARIES = [
    {
      id: "jitendex",
      category: "terms",
      name: "Jitendex",
      description: "Japanese to English dictionary with examples, usage notes, etymology, cross references, and definition notes.",
      homepage: "https://jitendex.org",
      downloadUrl: "https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip"
    },
    {
      id: "jmnedict",
      category: "terms",
      name: "JMnedict",
      description: "Japanese proper names maintained by the Electronic Dictionary Research and Development Group.",
      homepage: "https://github.com/yomidevs/jmdict-yomitan?tab=readme-ov-file#jmnedict-for-yomitan",
      downloadUrl: "https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip"
    },
    {
      id: "kanjidic",
      category: "kanji",
      name: "KANJIDIC",
      description: "Kanji readings, meanings, stroke data, grade level, JLPT level, and frequency.",
      homepage: "https://github.com/yomidevs/jmdict-yomitan?tab=readme-ov-file#kanjidic-for-yomitan",
      downloadUrl: "https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip"
    },
    {
      id: "jpdbv2-kana",
      category: "frequency",
      name: "JPDBv2㋕",
      description: "Frequency data based on the JPDB corpus. よむ shows this first when sorting local frequency chips.",
      homepage: "https://github.com/Kuuuube/yomitan-dictionaries?tab=readme-ov-file#jpdb-v22-frequency",
      downloadUrl: "https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip"
    },
    {
      id: "bccwj",
      category: "frequency",
      name: "BCCWJ",
      description: "Frequency data from the Balanced Corpus of Contemporary Written Japanese.",
      homepage: "https://github.com/Kuuuube/yomitan-dictionaries?tab=readme-ov-file#bccwj-suw-luw-combined",
      downloadUrl: "https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/BCCWJ_SUW_LUW_combined.zip"
    },
    {
      id: "jiten",
      category: "frequency",
      name: "Jiten",
      description: "Frequency data from the media stats database at jiten.moe.",
      homepage: "https://jiten.moe/other",
      downloadUrl: "https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan"
    }
  ];
  function findRecommendedDictionary(id) {
    return RECOMMENDED_JAPANESE_DICTIONARIES.find((dictionary) => dictionary.id === id);
  }
  const RTK_BASE_URL = "https://hrussellzfac023.github.io/rtk";
  const KANJI_RE = /[\u3400-\u9fff]/u;
  class RtkClient {
    constructor() {
      __publicField(this, "cache", /* @__PURE__ */ new Map());
    }
    lookup(kanji) {
      if (!KANJI_RE.test(kanji)) return Promise.resolve(null);
      const key = Array.from(kanji)[0] ?? kanji;
      let promise = this.cache.get(key);
      if (!promise) {
        promise = this.fetchInfo(key);
        this.cache.set(key, promise);
      }
      return promise;
    }
    async fetchInfo(kanji) {
      const html = await requestText$1(`${RTK_BASE_URL}/${encodeURIComponent(kanji)}/index.html`).catch(() => "");
      if (!html) return null;
      return parseRtkHtml(html, kanji);
    }
  }
  function parseRtkHtml(html, kanji) {
    var _a, _b, _c, _d, _e, _f, _g;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const keywordElement = doc.querySelector("h2 code");
    const keyword = ((_a = keywordElement == null ? void 0 : keywordElement.textContent) == null ? void 0 : _a.trim()) ?? "";
    if (!keyword) return null;
    const yomiText = ((_b = doc.querySelector("h3")) == null ? void 0 : _b.textContent) ?? "";
    const onYomi = ((_d = (_c = yomiText.match(/On-Yomi:\s*([^—]+)/)) == null ? void 0 : _c[1]) == null ? void 0 : _d.trim()) ?? "";
    const kunYomi = ((_f = (_e = yomiText.match(/Kun-Yomi:\s*(.+)/)) == null ? void 0 : _e[1]) == null ? void 0 : _f.trim()) ?? "";
    const elements = textAfterHeading(doc, "Elements:");
    const heisigStory = textAfterHeading(doc, "Heisig story:");
    const heisigComment = textAfterHeading(doc, "Heisig comment:");
    const koohiiStories = paragraphsAfterHeading(doc, "Koohii stories:").slice(0, 3);
    return {
      kanji,
      keyword,
      frameNumber: ((_g = keywordElement == null ? void 0 : keywordElement.getAttribute("title")) == null ? void 0 : _g.trim()) ?? "",
      onYomi,
      kunYomi,
      elements,
      componentKanji: [...new Set(Array.from(elements).filter((character) => KANJI_RE.test(character) && character !== kanji))],
      heisigStory,
      heisigComment,
      koohiiStories
    };
  }
  function textAfterHeading(doc, label) {
    const heading = Array.from(doc.querySelectorAll("h2")).find((element2) => {
      var _a;
      return (_a = element2.textContent) == null ? void 0 : _a.includes(label);
    });
    const next = heading == null ? void 0 : heading.nextElementSibling;
    return (next == null ? void 0 : next.tagName) === "P" ? cleanText(next.textContent ?? "") : "";
  }
  function paragraphsAfterHeading(doc, label) {
    const heading = Array.from(doc.querySelectorAll("h2")).find((element2) => {
      var _a;
      return (_a = element2.textContent) == null ? void 0 : _a.includes(label);
    });
    const paragraphs = [];
    let next = heading == null ? void 0 : heading.nextElementSibling;
    while ((next == null ? void 0 : next.tagName) === "P") {
      const text = cleanText(next.textContent ?? "");
      if (text) paragraphs.push(text);
      next = next.nextElementSibling;
    }
    return paragraphs;
  }
  function cleanText(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function requestText$1(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          timeout: 8e3,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) resolve(String(response.responseText ?? ""));
            else reject(new Error(`RTK request failed (${response.status}).`));
          },
          onerror: reject,
          ontimeout: () => reject(new Error("RTK request timed out."))
        });
      });
    }
    return fetch(url).then((response) => {
      if (!response.ok) throw new Error(`RTK request failed (${response.status}).`);
      return response.text();
    });
  }
  const READER_CSS = `
:root {
  --jpdb-reader-bg: #181b20;
  --jpdb-reader-surface: #20242b;
  --jpdb-reader-surface-2: #282e37;
  --jpdb-reader-text: #f2f4f8;
  --jpdb-reader-muted: #aab2c0;
  --jpdb-reader-faint: #6f7a89;
  --jpdb-reader-border: rgba(255,255,255,.12);
  --jpdb-reader-accent: #5ea780;
  --jpdb-reader-accent-soft: rgba(94,167,128,.18);
  --jpdb-reader-hover: rgba(255,255,255,.08);
}

@media (prefers-color-scheme: light) {
  :root {
    --jpdb-reader-bg: #ffffff;
    --jpdb-reader-surface: #f7f8fa;
    --jpdb-reader-surface-2: #eef1f4;
    --jpdb-reader-text: #171a1f;
    --jpdb-reader-muted: #596272;
    --jpdb-reader-faint: #7b8493;
    --jpdb-reader-border: rgba(20,30,45,.16);
    --jpdb-reader-hover: rgba(20,30,45,.07);
  }
}

.jpdb-reader-theme-dark {
  --jpdb-reader-bg: #181b20;
  --jpdb-reader-surface: #20242b;
  --jpdb-reader-surface-2: #282e37;
  --jpdb-reader-text: #f2f4f8;
  --jpdb-reader-muted: #aab2c0;
  --jpdb-reader-faint: #6f7a89;
  --jpdb-reader-border: rgba(255,255,255,.12);
  --jpdb-reader-hover: rgba(255,255,255,.08);
}

.jpdb-reader-theme-light {
  --jpdb-reader-bg: #ffffff;
  --jpdb-reader-surface: #f7f8fa;
  --jpdb-reader-surface-2: #eef1f4;
  --jpdb-reader-text: #171a1f;
  --jpdb-reader-muted: #596272;
  --jpdb-reader-faint: #7b8493;
  --jpdb-reader-border: rgba(20,30,45,.16);
  --jpdb-reader-hover: rgba(20,30,45,.07);
}

.jpdb-reader-word {
  position: relative;
  border-radius: 3px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  text-decoration-line: underline;
  text-decoration-style: solid;
  text-decoration-color: transparent;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  transition: background .12s ease, text-decoration-color .12s ease;
}

.jpdb-reader-word:hover,
.jpdb-reader-word:focus {
  background: var(--jpdb-reader-hover);
  outline: none;
}

.jpdb-reader-word.jpdb-new { background: rgba(75,141,255,.14); text-decoration-color: #4b8dff; }
.jpdb-reader-word.jpdb-learning { background: rgba(94,167,128,.14); text-decoration-color: #5ea780; }
.jpdb-reader-word.jpdb-known { background: transparent; text-decoration-color: #70c000; }
.jpdb-reader-word.jpdb-due { background: rgba(255,165,0,.14); text-decoration-color: #ffa500; }
.jpdb-reader-word.jpdb-failed { background: rgba(255,69,0,.14); text-decoration-color: #ff4500; }
.jpdb-reader-word.jpdb-locked { opacity: .72; text-decoration-color: #777; }
.jpdb-reader-word.jpdb-never-forget { background: rgba(94,167,128,.12); text-decoration-color: #70c000; }
.jpdb-reader-word.jpdb-blacklisted { opacity: .45; text-decoration-color: #555; }
.jpdb-reader-word.jpdb-suspended { opacity: .58; text-decoration-color: #999; }
.jpdb-reader-word.jpdb-redundant { text-decoration-color: #70c000; }
.jpdb-reader-word.jpdb-not-in-deck { text-decoration-color: rgba(127,137,152,.55); }
.jpdb-reader-furi { font-size: .55em; color: var(--jpdb-reader-muted); line-height: 1; user-select: none; }
.jpdb-reader-word ruby {
  position: relative;
  display: inline-block;
  line-height: inherit;
}
.jpdb-reader-word rp { display: none; }
.jpdb-reader-word rt.jpdb-reader-furi {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  white-space: nowrap;
  pointer-events: none;
}
.jpdb-reader-hide-known .jpdb-reader-word:is(.jpdb-known,.jpdb-due,.jpdb-never-forget) .jpdb-reader-furi { display: none; }

.jpdb-ocr-layer {
  position: fixed;
  z-index: 2147483643;
  pointer-events: none;
  box-sizing: border-box;
  contain: layout style;
}
.jpdb-ocr-status,
.jpdb-ocr-line {
  pointer-events: auto;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-ocr-status {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(24,27,32,.82);
  color: rgba(255,255,255,.88);
  box-shadow: 0 8px 22px rgba(0,0,0,.24);
  font-size: 12px;
  font-weight: 700;
}
.jpdb-ocr-line {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  min-width: 32px;
  min-height: 32px;
  padding: .44em .3em .18em;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--jpdb-ocr-text-color, #fff);
  text-shadow:
    0 2px 2px var(--jpdb-ocr-outline-color, #000),
    0 0 3px var(--jpdb-ocr-outline-color, #000),
    0 0 10px var(--jpdb-ocr-outline-color, #000);
  font-weight: 800;
  line-height: 1.08;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: none;
  opacity: .02;
  user-select: text;
  cursor: text;
  transition: opacity .12s ease, background .12s ease, border-color .12s ease;
}
.jpdb-ocr-line-visible {
  border-color: rgba(255,255,255,.24);
  background: var(--jpdb-ocr-background-rgba, rgba(24,27,32,.36));
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.14);
  opacity: 1;
}
.jpdb-ocr-line[data-vertical="true"] {
  align-items: center;
  letter-spacing: 0;
}
.jpdb-ocr-line:hover,
.jpdb-ocr-line:focus,
.jpdb-ocr-layer-expanded .jpdb-ocr-line {
  opacity: 1;
  background: var(--jpdb-ocr-background-active-rgba, rgba(24,27,32,.48));
  border-color: rgba(94,167,128,.9);
  outline: none;
}
.jpdb-ocr-line .jpdb-reader-word {
  background: transparent !important;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  line-height: 1.08;
}
.jpdb-ocr-line .jpdb-reader-word ruby {
  line-height: 1;
}
.jpdb-ocr-line .jpdb-reader-word.jpdb-new,
.jpdb-ocr-line .jpdb-reader-word.jpdb-not-in-deck { color: #9bbcff; }
.jpdb-ocr-line .jpdb-reader-word.jpdb-learning { color: #82d6a6; }
.jpdb-ocr-line .jpdb-reader-word.jpdb-known,
.jpdb-ocr-line .jpdb-reader-word.jpdb-never-forget,
.jpdb-ocr-line .jpdb-reader-word.jpdb-redundant { color: #8ee04a; }
.jpdb-ocr-line .jpdb-reader-word.jpdb-due { color: #ffb84d; }
.jpdb-ocr-line .jpdb-reader-word.jpdb-failed { color: #ff6b4a; }
.jpdb-ocr-line .jpdb-reader-word rt.jpdb-reader-furi {
  bottom: calc(100% + 1px);
  color: currentColor;
  font-size: .46em;
  opacity: .9;
  text-shadow:
    0 1px 1px var(--jpdb-ocr-outline-color, #000),
    0 0 5px var(--jpdb-ocr-outline-color, #000);
}

.asbplayer-subtitles-container-bottom { z-index: 2147483644 !important; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word {
  background: transparent !important;
  text-decoration: none;
}
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-new { color: #6da3ff; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-not-in-deck { color: #9bbcff; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-learning { color: #82d6a6; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-known,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-never-forget,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-redundant { color: #8ee04a; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-due { color: #ffb84d; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-failed { color: #ff6b4a; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-blacklisted,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-suspended,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-locked { color: rgba(255,255,255,.48); }

.jpdb-reader-fab {
  position: fixed;
  right: max(14px, env(safe-area-inset-right));
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 2147483645;
  min-width: 52px;
  width: auto;
  height: 52px;
  padding: 0 13px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 50%;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  box-shadow: 0 10px 28px rgba(0,0,0,.25);
  font: 700 14px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
}
.jpdb-reader-fab:hover,
.jpdb-reader-fab:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  outline: none;
}

.jpdb-reader-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  background: rgba(0,0,0,.38);
}

.jpdb-reader-popover,
.jpdb-reader-settings {
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  background: var(--jpdb-reader-bg);
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0,0,0,.34);
  color: var(--jpdb-reader-text);
  color-scheme: dark;
  font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.jpdb-reader-popover {
  width: min(430px, calc(100vw - 16px));
  max-height: min(540px, calc(100vh - 16px));
  overflow: auto;
  padding: 14px;
}

.jpdb-reader-sheet-handle {
  display: none;
  width: 72px;
  height: 28px;
  border-radius: 999px;
  background: transparent;
  margin: -4px auto 6px;
  cursor: grab;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-reader-sheet-handle::before {
  content: "";
  display: block;
  width: 42px;
  height: 5px;
  border-radius: 999px;
  margin: 11px auto 0;
  background: var(--jpdb-reader-faint);
}
.jpdb-reader-sheet-handle:active {
  cursor: grabbing;
}
.jpdb-reader-sheet-handle:focus-visible::before {
  background: var(--jpdb-reader-accent);
}

.jpdb-reader-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.jpdb-reader-heading {
  min-width: 0;
  flex: 1 1 auto;
}
.jpdb-reader-card-tools {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-left: auto;
}
.jpdb-reader-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 50%;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-reader-icon-btn:hover,
.jpdb-reader-icon-btn:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  outline: none;
}

.jpdb-reader-onboarding {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  box-sizing: border-box;
  width: min(760px, calc(100vw - 24px));
  max-height: min(760px, calc(100vh - 24px));
  overflow: auto;
  padding: 32px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 16px;
  background:
    radial-gradient(circle at 18% 0%, var(--jpdb-reader-accent-soft), transparent 34%),
    var(--jpdb-reader-bg);
  color: var(--jpdb-reader-text);
  box-shadow: 0 26px 70px rgba(0,0,0,.4);
  color-scheme: dark;
  font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-onboarding h2 {
  margin: 4px 0 10px;
  color: var(--jpdb-reader-text);
  font-size: clamp(38px, 8vw, 72px);
  line-height: .95;
  letter-spacing: 0;
}
.jpdb-reader-onboarding p {
  max-width: 620px;
  margin: 0;
  color: var(--jpdb-reader-muted);
}
.jpdb-reader-onboarding-eyebrow {
  color: var(--jpdb-reader-accent);
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.jpdb-reader-onboarding-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 24px 0;
}
.jpdb-reader-onboarding-grid div {
  display: grid;
  gap: 5px;
  min-height: 96px;
  padding: 14px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
}
.jpdb-reader-onboarding-grid strong {
  color: var(--jpdb-reader-text);
  font-size: 16px;
}
.jpdb-reader-onboarding-grid span,
.jpdb-reader-onboarding-note {
  color: var(--jpdb-reader-muted);
  font-size: 13px;
}
.jpdb-reader-onboarding-language {
  display: grid;
  gap: 6px;
  max-width: 280px;
  margin: 0 0 16px;
  color: var(--jpdb-reader-muted);
  font-weight: 750;
  font-size: 13px;
}
.jpdb-reader-onboarding-language select {
  width: 100%;
  box-sizing: border-box;
  min-height: 42px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  padding: 8px 10px;
  font: 750 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-onboarding-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.jpdb-reader-onboarding-actions .jpdb-reader-btn {
  min-width: 150px;
  min-height: 46px;
}
.jpdb-reader-icon-btn svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.jpdb-reader-spelling {
  color: var(--jpdb-reader-text);
  font-size: 24px;
  font-weight: 750;
  line-height: 1.16;
  text-decoration: none;
  word-break: keep-all;
}
.jpdb-reader-title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.jpdb-reader-kanji-inline {
  display: inline;
  margin: 0;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: inherit;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-reader-kanji-inline:hover,
.jpdb-reader-kanji-inline:focus-visible {
  border-bottom-color: currentColor;
  outline: none;
}
.jpdb-reader-jpdb-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 1px 7px;
  border: 1px solid currentColor;
  border-radius: 999px;
  color: var(--jpdb-reader-accent) !important;
  background: var(--jpdb-reader-accent-soft);
  font-size: 10px;
  font-weight: 850;
  line-height: 1.2;
  text-decoration: none;
}
.jpdb-reader-jpdb-pill:hover,
.jpdb-reader-jpdb-pill:focus-visible {
  background: var(--jpdb-reader-hover);
  outline: 2px solid var(--jpdb-reader-accent-soft);
}
.jpdb-reader-jpdb-pill svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.jpdb-reader-reading,
.jpdb-reader-pos,
.jpdb-reader-meta,
.jpdb-reader-help {
  color: var(--jpdb-reader-muted);
}

.jpdb-reader-reading { margin-top: 2px; font-size: 15px; }
.jpdb-reader-pos { margin-top: 7px; font-size: 12px; line-height: 1.35; }
.jpdb-reader-meanings { margin: 9px 0; display: grid; gap: 5px; }
.jpdb-reader-meaning { color: var(--jpdb-reader-text); line-height: 1.35; }
.jpdb-reader-meaning-pos { color: var(--jpdb-reader-faint); font-size: 11px; margin-right: 5px; font-style: italic; text-transform: none; }
.jpdb-reader-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12px; }
.jpdb-reader-inline-link { color: var(--jpdb-reader-accent); font-weight: 800; text-decoration: none; }
.jpdb-reader-state-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--jpdb-reader-faint); margin-right: 4px; }
.jpdb-reader-state-dot.jpdb-new { background: #4b8dff; }
.jpdb-reader-state-dot.jpdb-learning, .jpdb-reader-state-dot.jpdb-never-forget { background: #5ea780; }
.jpdb-reader-state-dot.jpdb-known, .jpdb-reader-state-dot.jpdb-redundant { background: #70c000; }
.jpdb-reader-state-dot.jpdb-due { background: #ffa500; }
.jpdb-reader-state-dot.jpdb-failed { background: #ff4500; }
.jpdb-reader-state-dot.jpdb-blacklisted { background: #555; }

.jpdb-reader-local {
  border-top: 1px solid var(--jpdb-reader-border);
  margin-top: 12px;
  padding-top: 12px;
  display: grid;
  gap: 8px;
}
.jpdb-reader-definition-stack {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.jpdb-reader-definition-stack .jpdb-reader-local {
  margin-top: 0;
}
.jpdb-reader-source-card .jpdb-reader-meanings {
  margin: 0;
}
.jpdb-reader-local-title {
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.jpdb-reader-local-entry {
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 8px;
}
.jpdb-reader-local-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-weight: 700;
}
.jpdb-reader-local-reading,
.jpdb-reader-local-dict {
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  font-weight: 500;
}
.jpdb-reader-local-dict {
  margin-left: auto;
}
.jpdb-reader-local-glossary {
  margin-top: 6px;
  color: var(--jpdb-reader-text);
  font-size: 13px;
  white-space: pre-wrap;
  display: grid;
  gap: 4px;
}
.jpdb-reader-local-glossary ul,
.jpdb-reader-local-glossary ol {
  margin: 4px 0 4px 18px;
  padding: 0;
}
.jpdb-reader-local-glossary table {
  border-collapse: collapse;
  width: 100%;
  white-space: normal;
}
.jpdb-reader-local-glossary td,
.jpdb-reader-local-glossary th {
  border: 1px solid var(--jpdb-reader-border);
  padding: 4px 6px;
}
.jpdb-reader-media-note { color: var(--jpdb-reader-muted); font-style: italic; }
.jpdb-reader-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-muted);
  font-weight: 700;
}
.jpdb-reader-dict-meta { margin: 8px 0 0; gap: 6px; }
.jpdb-reader-kanji-char { font-size: 20px; }
.jpdb-reader-kanji-readings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  margin-top: 6px;
}
.jpdb-reader-kanji-nav {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  font-weight: 750;
}
.jpdb-reader-kanji-nav span {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-reader-kanji-display {
  color: var(--jpdb-reader-text);
  font-size: 42px;
  font-weight: 850;
  line-height: 1;
}
.jpdb-reader-kanji-title-row {
  align-items: center;
  gap: 9px;
}
.jpdb-reader-kanji-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.jpdb-reader-kanji-keyword {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--jpdb-reader-accent) 50%, var(--jpdb-reader-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--jpdb-reader-accent) 13%, transparent);
  color: var(--jpdb-reader-text);
  font-size: 12px;
  font-weight: 800;
}
.jpdb-reader-kanji-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
  gap: 6px;
}
.jpdb-reader-kanji-facts span {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-text);
  font-size: 12px;
  font-weight: 750;
}
.jpdb-reader-kanji-facts strong {
  color: var(--jpdb-reader-muted);
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
}
.jpdb-reader-origin-map {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.jpdb-reader-origin-node {
  display: grid;
  place-items: center;
  gap: 2px;
  min-height: 58px;
  padding: 7px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--jpdb-reader-accent) 12%, transparent), var(--jpdb-reader-surface-2));
  color: var(--jpdb-reader-text);
  text-align: center;
}
.jpdb-reader-origin-node.current {
  border-color: color-mix(in srgb, var(--jpdb-reader-accent) 64%, var(--jpdb-reader-border));
  background: color-mix(in srgb, var(--jpdb-reader-accent) 18%, var(--jpdb-reader-surface-2));
}
.jpdb-reader-origin-node.related {
  border-style: dashed;
}
.jpdb-reader-origin-node strong {
  font-size: 20px;
  line-height: 1;
}
.jpdb-reader-origin-node small,
.jpdb-reader-origin-edges small {
  color: var(--jpdb-reader-muted);
  font-size: 10px;
  line-height: 1.2;
}
.jpdb-reader-origin-edges {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.jpdb-reader-origin-edges span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-muted);
  font-size: 11px;
}
.jpdb-reader-rtk-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--jpdb-reader-text);
}
.jpdb-reader-rtk-head span {
  color: var(--jpdb-reader-muted);
  font-size: 12px;
}
.jpdb-reader-rtk details,
.jpdb-reader-jpdb-kanji details {
  margin-top: 8px;
  color: var(--jpdb-reader-muted);
}
.jpdb-reader-rtk summary,
.jpdb-reader-jpdb-kanji summary {
  cursor: pointer;
  color: var(--jpdb-reader-text);
  font-weight: 750;
}
.jpdb-reader-rtk p,
.jpdb-reader-jpdb-kanji p {
  margin: 6px 0 0;
  color: var(--jpdb-reader-muted);
  line-height: 1.45;
}
.jpdb-reader-rtk-elements {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.jpdb-reader-rtk-elements span,
.jpdb-reader-rtk-elements button {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 750;
}
.jpdb-reader-rtk-elements button {
  cursor: pointer;
}
.jpdb-reader-rtk-elements button:hover,
.jpdb-reader-rtk-elements button:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-text);
  outline: none;
}
.jpdb-reader-rtk-elements span + span::before,
.jpdb-reader-rtk-elements span + button::before,
.jpdb-reader-rtk-elements button + span::before,
.jpdb-reader-rtk-elements button + button::before {
  content: "+";
  margin-right: 6px;
  color: color-mix(in srgb, var(--jpdb-reader-accent) 72%, var(--jpdb-reader-muted));
}
.jpdb-reader-component-grid,
.jpdb-reader-similar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.jpdb-reader-component-card,
.jpdb-reader-similar-word {
  min-width: 0;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-text);
  padding: 7px;
}
.jpdb-reader-component-card {
  display: grid;
  gap: 2px;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.jpdb-reader-component-card strong {
  font-size: 18px;
}
.jpdb-reader-component-card span,
.jpdb-reader-component-card small,
.jpdb-reader-similar-word small,
.jpdb-reader-similar-word em {
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  font-style: normal;
}
.jpdb-reader-similar-word {
  display: grid;
  gap: 2px;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.jpdb-reader-similar-word:hover,
.jpdb-reader-similar-word:focus-visible,
.jpdb-reader-component-card:hover,
.jpdb-reader-component-card:focus-visible {
  border-color: var(--jpdb-reader-accent);
  outline: none;
}
.jpdb-reader-doodle-stage {
  position: relative;
  width: min(100%, 240px);
  aspect-ratio: 1 / 1;
  margin: 8px auto 0;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(0,0,0,.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(0,0,0,.08) 1px, transparent 1px),
    #f8f9fb;
  background-size: 27.25px 27.25px;
  touch-action: none;
}
.jpdb-reader-doodle-ghost,
.jpdb-reader-doodle-canvas {
  position: absolute;
  inset: 0;
}
.jpdb-reader-doodle-ghost {
  display: grid;
  place-items: center;
  opacity: .3;
  pointer-events: none;
}
.jpdb-reader-doodle-canvas {
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}
.jpdb-reader-kanjivg-svg {
  width: 90%;
  max-height: 90%;
}
.jpdb-reader-kanjivg-strokes path {
  fill: none;
  stroke: #141820;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.jpdb-reader-kanjivg-numbers {
  fill: #6b7280;
  font-size: 8px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-kanjivg .jpdb-reader-help {
  color: #3d4654;
}
.jpdb-reader-doodle-text-ghost {
  color: #141820;
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
  font-size: 180px;
  font-weight: 500;
  line-height: 1;
}
.jpdb-reader-doodle-tools {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 7px;
}
.jpdb-reader-mini-btn {
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 7px;
  background: transparent;
  color: var(--jpdb-reader-text);
  cursor: pointer;
  font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-mini-btn:hover,
.jpdb-reader-mini-btn:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  outline: none;
}

.jpdb-reader-actions {
  border-top: 1px solid var(--jpdb-reader-border);
  margin-top: 12px;
  padding-top: 12px;
  display: grid;
  gap: 8px;
}

.jpdb-reader-row { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 6px; }
.jpdb-reader-grades .jpdb-reader-btn {
  min-width: 0;
  min-height: 40px;
  padding-inline: 3px;
  font-size: 9.5px;
  letter-spacing: 0;
  line-height: 1.1;
  white-space: nowrap;
  overflow-wrap: normal;
}
.jpdb-reader-btn {
  min-height: 36px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: transparent;
  color: var(--jpdb-reader-text);
  cursor: pointer;
  font: 600 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-btn:hover { background: var(--jpdb-reader-hover); }
.jpdb-reader-btn:disabled { opacity: .45; cursor: progress; }
.jpdb-reader-btn.add { color: var(--jpdb-reader-accent); border-color: var(--jpdb-reader-accent); }
.jpdb-reader-btn.nf { color: var(--jpdb-reader-accent); border-color: var(--jpdb-reader-accent); }
.jpdb-reader-btn.blacklist { color: #777; border-color: #777; }
.jpdb-reader-btn.anki { color: #88a6ff; border-color: #88a6ff; }
.jpdb-reader-btn.nothing, .jpdb-reader-btn.fail { color: #e74c3c; border-color: #e74c3c; }
.jpdb-reader-btn.something { color: #f39c12; border-color: #f39c12; }
.jpdb-reader-btn.hard { color: #f1c40f; border-color: #f1c40f; }
.jpdb-reader-btn.okay, .jpdb-reader-btn.pass { color: #2ecc71; border-color: #2ecc71; }
.jpdb-reader-btn.easy { color: #3498db; border-color: #3498db; }

.jpdb-reader-pitch svg { display: block; height: 42px; max-width: 128px; }
.jpdb-reader-pitch text { fill: var(--jpdb-reader-text); font-size: 12px; }
.jpdb-reader-pitch polyline { fill: none; stroke: currentColor; stroke-width: 2; }
.jpdb-reader-pitch circle { fill: currentColor; }
.jpdb-reader-pitch .heiban { color: #359eff; }
.jpdb-reader-pitch .atamadaka { color: #fe4b74; }
.jpdb-reader-pitch .nakadaka { color: #fba840; }
.jpdb-reader-pitch .odaka { color: #57ccb7; }
.jpdb-reader-pitch .kifuku { color: #9050f6; }

.jpdb-reader-toast {
  position: fixed;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 2147483647;
  max-width: min(520px, calc(100vw - 24px));
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  border: 1px solid var(--jpdb-reader-border);
  box-shadow: 0 10px 28px rgba(0,0,0,.25);
  font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.jpdb-reader-settings {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(640px, calc(100vw - 20px));
  max-height: min(760px, calc(100vh - 20px));
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.jpdb-reader-settings-head {
  flex: 0 0 auto;
  padding: 18px 18px 0;
}
.jpdb-reader-settings-tabs {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  overflow: visible;
  padding: 0 18px 8px;
}
.jpdb-reader-settings-tab {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 999px;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-muted);
  font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
  white-space: nowrap;
}
.jpdb-reader-settings-tab[aria-selected="true"] {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  background: var(--jpdb-reader-accent-soft);
}
.jpdb-reader-settings-scroll {
  min-height: 0;
  overflow: auto;
  padding: 0 18px 96px;
  -webkit-overflow-scrolling: touch;
}
.jpdb-reader-settings h2 { margin: 0 0 12px; font-size: 20px; color: var(--jpdb-reader-text) !important; }
.jpdb-reader-settings fieldset { border: 1px solid var(--jpdb-reader-border); border-radius: 8px; margin: 12px 0; padding: 12px; }
.jpdb-reader-settings legend { color: var(--jpdb-reader-muted); padding: 0 6px; }
.jpdb-reader-settings label { display: grid; gap: 5px; margin: 10px 0; color: var(--jpdb-reader-muted) !important; font-size: 12px; }
.jpdb-reader-settings input,
.jpdb-reader-settings select {
  width: 100%;
  box-sizing: border-box;
  min-height: 38px;
  border-radius: 7px;
  border: 1px solid var(--jpdb-reader-border);
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  padding: 8px;
}
.jpdb-reader-settings input[type="color"] {
  padding: 3px;
  cursor: pointer;
}
.jpdb-reader-settings input[type="checkbox"],
.jpdb-reader-settings input[type="radio"] {
  appearance: none;
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  display: grid;
  place-content: center;
  margin: 0;
  padding: 0;
  border: 1.5px solid var(--jpdb-reader-border);
  background: var(--jpdb-reader-surface-2);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.06);
}
.jpdb-reader-settings input[type="checkbox"] { border-radius: 7px; }
.jpdb-reader-settings input[type="radio"] { border-radius: 999px; }
.jpdb-reader-settings input[type="checkbox"]:checked,
.jpdb-reader-settings input[type="radio"]:checked {
  border-color: var(--jpdb-reader-accent);
  background: var(--jpdb-reader-accent);
  box-shadow: 0 0 0 3px var(--jpdb-reader-accent-soft);
}
.jpdb-reader-settings input[type="checkbox"]:checked::after {
  content: "";
  width: 12px;
  height: 7px;
  border-left: 2.5px solid #11161d;
  border-bottom: 2.5px solid #11161d;
  transform: rotate(-45deg) translate(1px, -1px);
}
.jpdb-reader-settings input[type="radio"]:checked::after {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #11161d;
}
.jpdb-reader-settings input[type="checkbox"]:focus-visible,
.jpdb-reader-settings input[type="radio"]:focus-visible {
  outline: 2px solid var(--jpdb-reader-accent);
  outline-offset: 3px;
}
.jpdb-reader-settings input[type="file"][data-file] {
  display: none !important;
}
.jpdb-reader-settings [hidden] {
  display: none !important;
}
.jpdb-reader-settings .inline { display: flex; align-items: center; gap: 12px; min-height: 32px; }
.jpdb-reader-settings .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.jpdb-reader-shortcut-group { display: contents; }
.jpdb-reader-settings .footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 0;
  background: var(--jpdb-reader-bg);
  border-top: 1px solid var(--jpdb-reader-border);
  padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
  box-shadow: 0 -10px 24px rgba(0,0,0,.18);
}
.jpdb-reader-settings .footer .jpdb-reader-btn {
  min-width: 92px;
  padding-inline: 18px;
  font-size: 13px;
}
.jpdb-reader-settings a { color: var(--jpdb-reader-accent) !important; text-decoration: underline; text-underline-offset: 3px; }
.jpdb-reader-settings-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0; }
.jpdb-reader-support-card {
  display: grid;
  gap: 12px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 14px;
}
.jpdb-reader-support-title {
  color: var(--jpdb-reader-text);
  font-size: 15px;
  font-weight: 850;
}
.jpdb-reader-support-card p {
  margin: 8px 0 0;
  color: var(--jpdb-reader-muted);
  font-size: 13px;
  line-height: 1.45;
}
.jpdb-reader-support-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.jpdb-reader-support-actions .jpdb-reader-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  text-align: center;
  text-decoration: none !important;
}
.jpdb-reader-dictionary-status {
  margin: 10px 0;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
}
.jpdb-reader-dictionary-priorities { display: grid; gap: 7px; margin: 10px 0; }
.jpdb-reader-recommended-dictionaries {
  display: grid;
  gap: 10px;
  margin: 12px 0;
}
.jpdb-reader-recommended-title {
  color: var(--jpdb-reader-text);
  font-weight: 800;
  font-size: 13px;
}
.jpdb-reader-recommended-group {
  display: grid;
  gap: 7px;
}
.jpdb-reader-recommended-group-title {
  color: var(--jpdb-reader-faint);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .02em;
}
.jpdb-reader-recommended-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 10px;
}
.jpdb-reader-recommended-name {
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
  color: var(--jpdb-reader-text);
  font-weight: 800;
  font-size: 13px;
}
.jpdb-reader-recommended-name a {
  font-size: 12px;
  font-weight: 700;
}
.jpdb-reader-dictionary-head,
.jpdb-reader-dictionary-row {
  display: grid;
  grid-template-columns: 48px minmax(130px, 1fr) minmax(120px, .8fr) 74px;
  gap: 8px;
  align-items: center;
}
.jpdb-reader-dictionary-head {
  color: var(--jpdb-reader-faint);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.jpdb-reader-dictionary-row {
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 8px;
  cursor: grab;
}
.jpdb-reader-dictionary-row.jpdb-reader-dragging {
  opacity: .58;
  border-color: var(--jpdb-reader-accent);
}
.jpdb-reader-dictionary-row-help {
  grid-column: 2 / -1;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  line-height: 1.35;
}
.jpdb-reader-settings .jpdb-reader-dictionary-toggle { margin: 0; justify-content: center; color: var(--jpdb-reader-text); }
.jpdb-reader-audio-sources { display: grid; gap: 7px; margin: 12px 0; }
.jpdb-reader-audio-source-head,
.jpdb-reader-audio-source-row {
  display: grid;
  grid-template-columns: 44px minmax(150px, .8fr) minmax(0, 1.2fr) 96px;
  gap: 8px;
  align-items: start;
}
.jpdb-reader-audio-source-head { color: var(--jpdb-reader-faint); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.jpdb-reader-audio-source-row {
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 8px;
}
.jpdb-reader-settings .jpdb-reader-audio-index { margin: 0; min-height: 38px; justify-content: center; color: var(--jpdb-reader-text); }
.jpdb-reader-audio-source-fields { display: grid; gap: 6px; }
.jpdb-reader-row-tools {
  display: flex;
  gap: 5px;
  justify-content: flex-end;
}
.jpdb-reader-icon-mini {
  width: 28px;
  height: 28px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 7px;
  background: transparent;
  color: var(--jpdb-reader-text);
  cursor: pointer;
  font: 800 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-icon-mini:hover,
.jpdb-reader-icon-mini:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  outline: none;
}

.jpdb-subtitle-player {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 2147483644;
  pointer-events: none;
  --subtitle-font-size: 28px;
  --subtitle-bottom: 12%;
  --subtitle-color: #fff;
  --subtitle-outline: #000;
  --subtitle-background-rgba: rgba(24,27,32,.32);
  --subtitle-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --subtitle-weight: 850;
}
.jpdb-subtitle-text {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: var(--subtitle-bottom);
  color: var(--subtitle-color);
  text-align: center;
  font: var(--subtitle-weight) var(--subtitle-font-size)/1.26 var(--subtitle-family);
  text-shadow:
    0 2px 2px var(--subtitle-outline),
    0 0 2px var(--subtitle-outline),
    0 0 10px rgba(0,0,0,.96),
    0 0 18px rgba(0,0,0,.78);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-subtitle-primary {
  display: inline;
  padding: .08em .34em .17em;
  border-radius: 7px;
  background: linear-gradient(90deg, transparent, var(--subtitle-background-rgba) 10%, var(--subtitle-background-rgba) 90%, transparent);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  -webkit-text-stroke: .028em color-mix(in srgb, var(--subtitle-outline) 72%, transparent);
  paint-order: stroke fill;
}
.jpdb-subtitle-secondary {
  display: block;
  margin-top: 8px;
  color: rgba(255,255,255,.82);
  font-size: .62em;
  font-weight: 650;
  line-height: 1.25;
  text-shadow: 0 2px 2px #000, 0 0 7px rgba(0,0,0,.86);
}
.jpdb-subtitle-primary .jpdb-reader-word {
  background: transparent !important;
  color: var(--subtitle-color);
  text-decoration: none;
  text-shadow:
    0 2px 2px var(--subtitle-outline),
    0 0 2px var(--subtitle-outline),
    0 0 10px rgba(0,0,0,.96),
    0 0 18px rgba(0,0,0,.78);
  -webkit-text-stroke: .028em color-mix(in srgb, var(--subtitle-outline) 72%, transparent);
  paint-order: stroke fill;
}
.jpdb-subtitle-primary .jpdb-reader-word:hover,
.jpdb-subtitle-primary .jpdb-reader-word:focus {
  background: rgba(255,255,255,.14) !important;
}
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-new { color: #6da3ff; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-not-in-deck { color: #9bbcff; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-learning { color: #82d6a6; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-known,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-never-forget,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-redundant { color: #8ee04a; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-due { color: #ffb84d; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-failed { color: #ff6b4a; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-blacklisted,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-suspended,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-locked { color: rgba(255,255,255,.48); }
.jpdb-subtitle-primary .jpdb-reader-furi { color: currentColor; opacity: .8; }
.jpdb-subtitle-rail {
  position: absolute;
  right: max(10px, env(safe-area-inset-right));
  top: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
  opacity: .72;
  transition: opacity .14s ease;
}
.jpdb-subtitle-controls-hidden .jpdb-subtitle-rail,
.jpdb-subtitle-controls-hidden .jpdb-subtitle-menu,
.jpdb-subtitle-controls-hidden .jpdb-subtitle-list {
  display: none !important;
}
.jpdb-subtitle-controls-auto .jpdb-subtitle-rail:not(:hover) {
  opacity: .42;
}
.jpdb-subtitle-controls-always .jpdb-subtitle-rail {
  opacity: 1;
}
.jpdb-subtitle-rail:hover,
.jpdb-subtitle-menu-open .jpdb-subtitle-rail {
  opacity: 1;
}
.jpdb-subtitle-rail button,
.jpdb-subtitle-menu button,
.jpdb-subtitle-list button {
  border: 1px solid rgba(255,255,255,.22);
  border-radius: 8px;
  background: rgba(24,27,32,.78);
  color: #fff;
  box-shadow: 0 8px 20px rgba(0,0,0,.28);
  font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  pointer-events: auto;
}
.jpdb-subtitle-rail button {
  min-width: 34px;
  min-height: 32px;
  padding: 0 9px;
}
.jpdb-subtitle-status {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 9px;
  border-radius: 8px;
  background: rgba(24,27,32,.62);
  color: rgba(255,255,255,.78);
  border: 1px solid rgba(255,255,255,.16);
  box-shadow: 0 8px 20px rgba(0,0,0,.18);
  font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-subtitle-menu {
  position: absolute;
  right: max(10px, env(safe-area-inset-right));
  top: 50px;
  display: grid;
  gap: 6px;
  width: min(230px, calc(100vw - 24px));
  padding: 8px;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 10px;
  background: rgba(24,27,32,.88);
  box-shadow: 0 14px 34px rgba(0,0,0,.32);
  pointer-events: auto;
}
.jpdb-subtitle-menu[hidden],
.jpdb-subtitle-list[hidden] { display: none; }
.jpdb-subtitle-menu button {
  min-height: 36px;
  text-align: left;
  padding: 0 10px;
  box-shadow: none;
}
.jpdb-subtitle-list {
  position: absolute;
  right: max(10px, env(safe-area-inset-right));
  top: 50px;
  width: min(460px, calc(100vw - 24px));
  max-height: min(62vh, 520px);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 10px;
  background: rgba(24,27,32,.92);
  color: #fff;
  box-shadow: 0 14px 34px rgba(0,0,0,.32);
  pointer-events: auto;
}
.jpdb-subtitle-list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border-bottom: 1px solid rgba(255,255,255,.12);
  color: rgba(255,255,255,.78);
  font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-subtitle-list-scroll {
  overflow: auto;
  display: grid;
  gap: 2px;
  padding: 6px;
}
.jpdb-subtitle-list-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-height: 38px;
  padding: 8px;
  text-align: left;
  box-shadow: none;
}
.jpdb-subtitle-list-row.active {
  border-color: rgba(94,167,128,.88);
  background: rgba(94,167,128,.2);
}
.jpdb-subtitle-list-row span {
  color: rgba(255,255,255,.55);
  font-size: 11px;
}
.jpdb-subtitle-list-row strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 700;
  line-height: 1.35;
}
.jpdb-subtitle-track-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 7px;
  padding: 9px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 8px;
  background: rgba(255,255,255,.05);
}
.jpdb-subtitle-track-row.active {
  border-color: rgba(94,167,128,.82);
  background: rgba(94,167,128,.18);
}
.jpdb-subtitle-track-row strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.jpdb-subtitle-track-row span {
  color: rgba(255,255,255,.62);
  font-size: 11px;
  font-weight: 700;
}
.jpdb-subtitle-track-row div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.jpdb-subtitle-list-empty {
  padding: 12px;
  color: rgba(255,255,255,.72);
  font: 700 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-subtitle-hidden .jpdb-subtitle-text { display: none; }

.jpdb-youtube-filtered {
  display: none !important;
}
.jpdb-youtube-filter-bar {
  position: fixed;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 2147483645;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(560px, calc(100vw - 24px));
  padding: 8px 10px 8px 12px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 999px;
  background: var(--jpdb-reader-bg);
  color: var(--jpdb-reader-muted);
  box-shadow: 0 12px 34px rgba(0,0,0,.28);
  font: 750 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-youtube-filter-bar span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-youtube-filter-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.jpdb-youtube-filter-bar button {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--jpdb-reader-accent);
  border-radius: 999px;
  background: transparent;
  color: var(--jpdb-reader-accent);
  font: inherit;
  cursor: pointer;
}
.jpdb-youtube-filter-bar [data-action="turn-off"] {
  border-color: var(--jpdb-reader-border);
  color: var(--jpdb-reader-muted);
}

@media (max-width: 768px), (pointer: coarse) {
  .jpdb-reader-popover.jpdb-reader-sheet {
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    bottom: 0 !important;
    width: 100%;
    max-height: min(70vh, 620px);
    border-radius: 16px 16px 0 0;
    padding: 14px 16px calc(18px + env(safe-area-inset-bottom));
  }
  .jpdb-reader-popover.jpdb-reader-sheet.jpdb-reader-sheet-expanded {
    max-height: min(92vh, 840px);
    max-height: min(92svh, 840px);
  }
  .jpdb-reader-sheet .jpdb-reader-sheet-handle { display: block; }
  .jpdb-reader-btn { min-height: 44px; font-size: 13px; }
  .jpdb-reader-settings { inset: auto 0 0 0; transform: none; width: 100%; max-height: 88vh; max-height: 88svh; border-radius: 16px 16px 0 0; }
  .jpdb-reader-settings-head { padding: 18px 20px 0; }
  .jpdb-reader-settings-scroll { padding: 0 20px 106px; }
  .jpdb-reader-settings .footer {
    justify-content: stretch;
    gap: 12px;
    padding: 12px 20px calc(14px + env(safe-area-inset-bottom));
  }
  .jpdb-reader-settings .footer .jpdb-reader-btn {
    flex: 1 1 0;
    min-width: 0;
  }
  .jpdb-reader-settings .grid { grid-template-columns: 1fr; }
  .jpdb-reader-settings-actions { grid-template-columns: 1fr; }
  .jpdb-reader-support-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .jpdb-reader-recommended-item { grid-template-columns: 1fr; }
  .jpdb-reader-onboarding {
    inset: auto 0 0 0;
    transform: none;
    width: 100%;
    max-height: 88vh;
    max-height: 88svh;
    border-radius: 16px 16px 0 0;
    padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
  }
  .jpdb-reader-onboarding-grid { grid-template-columns: 1fr; }
  .jpdb-reader-onboarding-actions { display: grid; grid-template-columns: 1fr; }
  .jpdb-youtube-filter-bar {
    bottom: max(76px, calc(60px + env(safe-area-inset-bottom)));
    border-radius: 12px;
  }
  .jpdb-reader-dictionary-head { display: none; }
  .jpdb-reader-dictionary-row { grid-template-columns: 52px 1fr; }
  .jpdb-reader-dictionary-row input[name$=".alias"],
  .jpdb-reader-dictionary-row .jpdb-reader-row-tools,
  .jpdb-reader-dictionary-row-help { grid-column: 2; }
  .jpdb-reader-dictionary-row .jpdb-reader-row-tools { justify-content: flex-start; }
  .jpdb-reader-audio-source-head { display: none; }
  .jpdb-reader-audio-source-row { grid-template-columns: 52px 1fr; }
  .jpdb-reader-audio-source-row > select { grid-column: 2; }
  .jpdb-reader-audio-source-fields { grid-column: 1 / -1; }
  .jpdb-reader-audio-source-row .jpdb-reader-row-tools {
    grid-column: 2;
    justify-content: flex-start;
  }
  .jpdb-reader-icon-mini {
    width: 34px;
    height: 34px;
  }
  .jpdb-ocr-line { min-width: 38px; min-height: 38px; border-radius: 8px; }
  .jpdb-subtitle-text { left: 8px; right: 8px; font-size: min(var(--subtitle-font-size), 8vw); }
  .jpdb-subtitle-rail {
    top: auto;
    right: max(8px, env(safe-area-inset-right));
    bottom: max(8px, env(safe-area-inset-bottom));
  }
  .jpdb-subtitle-rail button { min-height: 40px; min-width: 42px; }
  .jpdb-subtitle-menu,
  .jpdb-subtitle-list {
    top: auto;
    right: 8px;
    bottom: calc(58px + env(safe-area-inset-bottom));
  }
}
`;
  const CAPTION_SELECTOR_LIST = [
    ".ytp-caption-segment",
    ".caption-visual-line",
    ".captions-text span",
    '[data-purpose="captions-text"]',
    ".asbplayer-subtitles-container-bottom span",
    ".asbplayer-subtitle",
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[data-testid*="subtitle"]'
  ];
  const CAPTION_SELECTORS = CAPTION_SELECTOR_LIST.join(",");
  class SubtitlePlayerController {
    constructor(options) {
      __publicField(this, "root");
      __publicField(this, "subtitleEl");
      __publicField(this, "menuEl");
      __publicField(this, "statusEl");
      __publicField(this, "transcriptPanel");
      __publicField(this, "primaryFileInput");
      __publicField(this, "secondaryFileInput");
      __publicField(this, "video");
      __publicField(this, "cues", []);
      __publicField(this, "secondaryCues", []);
      __publicField(this, "tracks", []);
      __publicField(this, "currentCue");
      __publicField(this, "secondaryCue");
      __publicField(this, "observer");
      __publicField(this, "discoverTimer");
      __publicField(this, "selectedTrackId", "");
      __publicField(this, "secondaryTrackId", "");
      __publicField(this, "youtubeVideoId", "");
      __publicField(this, "lastDomCaption", "");
      __publicField(this, "parsedHtmlCache", /* @__PURE__ */ new Map());
      __publicField(this, "renderSerial", 0);
      __publicField(this, "panelMode", "lines");
      this.options = options;
    }
    init() {
      this.install();
      this.observer = new MutationObserver((mutations) => {
        if (mutations.every(mutationInsideReaderRoot$2)) return;
        this.scheduleDiscoverVideo();
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("keydown", (event) => this.handleKeydown(event));
      this.discoverVideo();
      this.tick();
    }
    refresh() {
      if (!this.root) return;
      const settings = this.options.getSettings();
      this.root.hidden = !settings.subtitlePlayerEnabled || !this.video && !this.cues.length;
      this.root.classList.toggle("jpdb-subtitle-hidden", !settings.subtitleOverlayVisible);
      this.root.classList.toggle("jpdb-subtitle-controls-auto", settings.subtitleControlsMode === "auto");
      this.root.classList.toggle("jpdb-subtitle-controls-hidden", settings.subtitleControlsMode === "hidden");
      this.root.classList.toggle("jpdb-subtitle-controls-always", settings.subtitleControlsMode === "always");
      this.root.style.setProperty("--subtitle-font-size", `${settings.subtitleFontSize}px`);
      this.root.style.setProperty("--subtitle-bottom", `${settings.subtitleBottomOffset}%`);
      this.root.style.setProperty("--subtitle-color", settings.subtitleTextColor);
      this.root.style.setProperty("--subtitle-outline", settings.subtitleOutlineColor);
      this.root.style.setProperty("--subtitle-background-rgba", accentToRgba(settings.subtitleBackgroundColor, settings.subtitleBackgroundOpacity));
      this.root.style.setProperty("--subtitle-family", settings.subtitleFontFamily);
      this.root.style.setProperty("--subtitle-weight", String(settings.subtitleFontWeight));
      this.syncControls();
      this.render();
    }
    install() {
      if (this.root) return;
      const root = document.createElement("div");
      root.className = "jpdb-subtitle-player";
      root.dataset.jpdbReaderRoot = "true";
      setInnerHtml(root, `
            <div class="jpdb-subtitle-text" aria-live="polite"></div>
            <div class="jpdb-subtitle-rail">
                <button type="button" data-action="previous" title="Previous subtitle" aria-label="Previous subtitle">‹</button>
                <button type="button" data-action="list" title="Subtitle list">Lines</button>
                <span class="jpdb-subtitle-status" data-role="status">No subtitles</span>
                <button type="button" data-action="next" title="Next subtitle" aria-label="Next subtitle">›</button>
                <button type="button" data-action="menu" title="Subtitle options" aria-label="Subtitle options">...</button>
            </div>
            <div class="jpdb-subtitle-menu" hidden>
                <button type="button" data-action="tracks">Choose subtitle tracks</button>
                <button type="button" data-action="load">Load Japanese subtitles</button>
                <button type="button" data-action="load-secondary">Load native subtitles</button>
                <button type="button" data-action="copy">Copy current line</button>
                <button type="button" data-action="toggle-secondary">Native subtitles on</button>
                <button type="button" data-action="toggle">Hide subtitles</button>
            </div>
            <div class="jpdb-subtitle-list" hidden></div>
            <input hidden type="file" data-file="primary" accept=".srt,.vtt,text/vtt">
            <input hidden type="file" data-file="secondary" accept=".srt,.vtt,text/vtt">
        `);
      root.addEventListener("click", (event) => this.handleClick(event));
      this.subtitleEl = root.querySelector(".jpdb-subtitle-text");
      this.menuEl = root.querySelector(".jpdb-subtitle-menu");
      this.statusEl = root.querySelector('[data-role="status"]');
      this.transcriptPanel = root.querySelector(".jpdb-subtitle-list");
      this.primaryFileInput = root.querySelector('input[data-file="primary"]');
      this.secondaryFileInput = root.querySelector('input[data-file="secondary"]');
      this.primaryFileInput.addEventListener("change", () => void this.loadSubtitleFile("primary"));
      this.secondaryFileInput.addEventListener("change", () => void this.loadSubtitleFile("secondary"));
      document.body.appendChild(root);
      this.root = root;
      this.refresh();
    }
    scheduleDiscoverVideo() {
      window.clearTimeout(this.discoverTimer);
      this.discoverTimer = window.setTimeout(() => this.discoverVideo(), 120);
    }
    discoverVideo() {
      const settings = this.options.getSettings();
      if (!settings.subtitlePlayerEnabled || !settings.subtitleAutoDetect) {
        this.refresh();
        return;
      }
      const candidate = [...document.querySelectorAll("video")].map((video) => video).filter((video) => video.readyState >= 1 || video.clientWidth > 120 || video.getBoundingClientRect().width > 120).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
      if (candidate && candidate !== this.video) {
        this.video = candidate;
        this.attachTextTracks(candidate);
      }
      void this.discoverYouTubeTracks();
      this.refresh();
    }
    attachTextTracks(video) {
      var _a, _b;
      for (const track of Array.from(video.textTracks)) this.addNativeTrack(track);
      (_b = (_a = video.textTracks).addEventListener) == null ? void 0 : _b.call(_a, "addtrack", (event) => {
        const track = event.track;
        if (track) this.addNativeTrack(track);
      });
    }
    addNativeTrack(track) {
      if (this.tracks.some((item) => item.track === track)) return;
      const id = `native-${this.tracks.length}`;
      const label = track.label || track.language || `Subtitle ${this.tracks.length + 1}`;
      this.tracks.push({ id, label, kind: "native", track });
      track.addEventListener("cuechange", () => this.updateFromNativeTrack(track));
      window.setTimeout(() => {
        if (!this.selectedTrackId && (isJapaneseTrack(label, track.language) || this.tracks.length === 1)) void this.selectTrack(id);
        if (this.options.getSettings().subtitleSecondaryVisible && !this.secondaryTrackId && !isJapaneseTrack(label, track.language)) void this.selectSecondaryTrack(id);
        this.setNativeTrackModes();
        this.syncControls();
      }, 0);
      this.syncControls();
    }
    updateFromNativeTrack(track) {
      var _a;
      const primary = this.tracks.find((item) => item.id === this.selectedTrackId);
      const secondary = this.tracks.find((item) => item.id === this.secondaryTrackId);
      const active = (_a = track.activeCues) == null ? void 0 : _a[0];
      if (!active) return;
      if ((primary == null ? void 0 : primary.track) === track) {
        this.currentCue = { start: active.startTime, end: active.endTime, text: getCueText(active) };
        if (!this.cues.length) this.cues = readTrackCues(track);
      }
      if ((secondary == null ? void 0 : secondary.track) === track) {
        this.secondaryCue = { start: active.startTime, end: active.endTime, text: getCueText(active) };
        if (!this.secondaryCues.length) this.secondaryCues = readTrackCues(track);
      }
      this.render();
      this.syncControls();
    }
    tick() {
      const settings = this.options.getSettings();
      if (settings.subtitlePlayerEnabled) {
        this.alignToVideo();
        this.refreshNativeCueLists();
        this.updateFromLoadedCues();
        this.updateFromDomCaptions();
      }
      window.setTimeout(() => this.tick(), 250);
    }
    refreshNativeCueLists() {
      const primary = this.tracks.find((item) => item.id === this.selectedTrackId);
      const secondary = this.tracks.find((item) => item.id === this.secondaryTrackId);
      if (primary == null ? void 0 : primary.track) {
        const cues = readTrackCues(primary.track);
        if (cues.length && cues.length !== this.cues.length) this.cues = cues;
      }
      if (secondary == null ? void 0 : secondary.track) {
        const cues = readTrackCues(secondary.track);
        if (cues.length && cues.length !== this.secondaryCues.length) this.secondaryCues = cues;
      }
    }
    alignToVideo() {
      if (!this.root || !this.video) return;
      const rect = this.video.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 80) {
        this.root.style.left = "0";
        this.root.style.top = "0";
        this.root.style.width = "100%";
        this.root.style.height = "100%";
        return;
      }
      this.root.style.left = `${Math.max(0, rect.left)}px`;
      this.root.style.top = `${Math.max(0, rect.top)}px`;
      this.root.style.width = `${Math.max(260, rect.width)}px`;
      this.root.style.height = `${Math.max(160, rect.height)}px`;
    }
    updateFromLoadedCues() {
      if (!this.video) return;
      const time = this.video.currentTime;
      const cue = this.cues.find((item) => time >= item.start && time <= item.end);
      const secondary = this.secondaryCues.find((item) => time >= item.start && time <= item.end);
      let changed = false;
      if (cue && cue !== this.currentCue) {
        this.currentCue = cue;
        changed = true;
      }
      if (secondary !== this.secondaryCue) {
        this.secondaryCue = secondary;
        changed = true;
      }
      if (changed) {
        this.render();
        this.syncControls();
      }
    }
    updateFromDomCaptions() {
      var _a;
      if (this.cues.length || this.selectedTrackId) return;
      const text = readPageCaptionText(this.video, this.root);
      if (!text || text === this.lastDomCaption) return;
      this.lastDomCaption = text;
      const now = ((_a = this.video) == null ? void 0 : _a.currentTime) ?? 0;
      this.currentCue = { start: now, end: now + 4, text };
      this.render();
      this.syncControls();
    }
    render() {
      var _a, _b, _c;
      if (!this.subtitleEl) return;
      const text = ((_a = this.currentCue) == null ? void 0 : _a.text.trim()) ?? "";
      if (!text) {
        setInnerHtml(this.subtitleEl, ((_b = this.secondaryCue) == null ? void 0 : _b.text) ? `<div class="jpdb-subtitle-secondary">${escapeWithBreaks(this.secondaryCue.text)}</div>` : "");
        return;
      }
      const secondary = this.options.getSettings().subtitleSecondaryVisible && ((_c = this.secondaryCue) == null ? void 0 : _c.text) ? `<div class="jpdb-subtitle-secondary">${escapeWithBreaks(this.secondaryCue.text)}</div>` : "";
      setInnerHtml(this.subtitleEl, `<div class="jpdb-subtitle-primary">${escapeWithBreaks(text)}</div>${secondary}`);
      if (this.options.getSettings().apiKey) void this.renderParsedPrimary(text);
    }
    async renderParsedPrimary(text) {
      const settings = this.options.getSettings();
      const key = `${settings.showFurigana}:${settings.hideKnownFurigana}:${text}`;
      const serial = ++this.renderSerial;
      const cached = this.parsedHtmlCache.get(key);
      if (cached) {
        this.replacePrimaryHtml(cached, serial);
        return;
      }
      try {
        const tokens = await this.options.parseJapanese(text);
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        this.parsedHtmlCache.set(key, html);
        if (this.parsedHtmlCache.size > 80) this.parsedHtmlCache.delete(this.parsedHtmlCache.keys().next().value ?? "");
        this.replacePrimaryHtml(html, serial);
      } catch {
      }
    }
    replacePrimaryHtml(html, serial) {
      var _a;
      if (serial !== this.renderSerial) return;
      const primary = (_a = this.subtitleEl) == null ? void 0 : _a.querySelector(".jpdb-subtitle-primary");
      if (primary) setInnerHtml(primary, html);
    }
    handleClick(event) {
      var _a, _b, _c, _d, _e, _f;
      const action = (_a = event.target.closest("[data-action]")) == null ? void 0 : _a.dataset.action;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "cue") this.seekToCue(Number((_b = event.target.closest("[data-index]")) == null ? void 0 : _b.dataset.index));
      if (action === "previous") this.seekSubtitle(-1);
      if (action === "next") this.seekSubtitle(1);
      if (action === "copy") void this.copySubtitle();
      if (action === "load") (_c = this.primaryFileInput) == null ? void 0 : _c.click();
      if (action === "load-secondary") (_d = this.secondaryFileInput) == null ? void 0 : _d.click();
      if (action === "list") this.toggleTranscriptPanel();
      if (action === "tracks") this.toggleTrackPanel();
      if (action === "primary-track") void this.choosePrimaryTrack((_e = event.target.closest("[data-track-id]")) == null ? void 0 : _e.dataset.trackId);
      if (action === "secondary-track") void this.chooseSecondaryTrack((_f = event.target.closest("[data-track-id]")) == null ? void 0 : _f.dataset.trackId);
      if (action === "menu") this.toggleMenu();
      if (action === "toggle") this.toggleSubtitles();
      if (action === "toggle-secondary") this.toggleSecondarySubtitles();
      this.syncControls();
    }
    handleKeydown(event) {
      const settings = this.options.getSettings();
      if (!settings.subtitlePlayerEnabled) return;
      if (matchesShortcut(event, settings.shortcuts.previousSubtitle)) {
        event.preventDefault();
        this.seekSubtitle(-1);
      } else if (matchesShortcut(event, settings.shortcuts.nextSubtitle)) {
        event.preventDefault();
        this.seekSubtitle(1);
      } else if (matchesShortcut(event, settings.shortcuts.copySubtitle)) {
        event.preventDefault();
        void this.copySubtitle();
      }
    }
    seekSubtitle(direction) {
      if (!this.video) return;
      if (!this.cues.length) {
        this.video.currentTime = Math.max(0, this.video.currentTime + direction * 5);
        return;
      }
      const time = this.video.currentTime;
      const activeIndex = this.cues.findIndex((cue) => time >= cue.start && time <= cue.end);
      const nextFuture = this.cues.findIndex((cue) => cue.start > time);
      const baseIndex = activeIndex >= 0 ? activeIndex : Math.max(0, nextFuture);
      const index = Math.max(0, Math.min(this.cues.length - 1, baseIndex + direction));
      this.seekToCue(index);
    }
    seekToCue(index) {
      const cue = Number.isFinite(index) ? this.cues[index] : void 0;
      if (!cue) return;
      if (this.video) this.video.currentTime = Math.max(0, cue.start + this.options.getSettings().subtitleSeekPadding);
      this.currentCue = cue;
      this.secondaryCue = this.secondaryCues.find((item) => cue.start >= item.start - 0.35 && cue.start <= item.end + 0.35);
      this.render();
      this.syncControls();
      this.renderTranscriptPanel();
    }
    async copySubtitle() {
      var _a, _b, _c;
      const text = [(_a = this.currentCue) == null ? void 0 : _a.text.trim(), (_b = this.secondaryCue) == null ? void 0 : _b.text.trim()].filter(Boolean).join("\n");
      if (!text) {
        this.options.onToast("No active subtitle to copy.");
        return;
      }
      await ((_c = navigator.clipboard) == null ? void 0 : _c.writeText(text).catch(() => void 0));
      this.options.onToast("Subtitle copied.");
    }
    async loadSubtitleFile(kind) {
      var _a;
      const input2 = kind === "primary" ? this.primaryFileInput : this.secondaryFileInput;
      const file = (_a = input2 == null ? void 0 : input2.files) == null ? void 0 : _a[0];
      if (!file) return;
      const text = await file.text();
      const cues = parseSubtitleText(text);
      const track = {
        id: `file-${kind}-${Date.now()}`,
        label: file.name.replace(/\.(srt|vtt)$/i, ""),
        kind: "file",
        cues
      };
      this.tracks.push(track);
      if (kind === "primary") await this.selectTrack(track.id);
      else await this.selectSecondaryTrack(track.id);
      this.options.onToast(`Loaded ${cues.length} ${kind === "primary" ? "Japanese" : "native"} subtitles.`);
      if (input2) input2.value = "";
      this.updateFromLoadedCues();
    }
    async selectTrack(id) {
      this.selectedTrackId = id;
      if (this.secondaryTrackId === id) this.secondaryTrackId = "";
      this.cues = [];
      this.currentCue = void 0;
      const selected = this.tracks.find((option) => option.id === id);
      if (selected == null ? void 0 : selected.cues) this.cues = selected.cues;
      if (selected == null ? void 0 : selected.track) this.cues = readTrackCues(selected.track);
      if ((selected == null ? void 0 : selected.kind) === "youtube" && selected.url) {
        const text = await requestText(withYouTubeVttFormat(selected.url));
        this.cues = parseSubtitleText(text);
        selected.cues = this.cues;
        this.options.onToast(`Loaded ${this.cues.length} YouTube subtitles.`);
      }
      this.setNativeTrackModes();
      this.updateFromLoadedCues();
      this.render();
      this.renderTranscriptPanel();
      this.renderTrackPanel();
    }
    async selectSecondaryTrack(id) {
      if (this.selectedTrackId === id) return;
      this.secondaryTrackId = id;
      this.secondaryCues = [];
      this.secondaryCue = void 0;
      const selected = this.tracks.find((option) => option.id === id);
      if (selected == null ? void 0 : selected.cues) this.secondaryCues = selected.cues;
      if (selected == null ? void 0 : selected.track) this.secondaryCues = readTrackCues(selected.track);
      if ((selected == null ? void 0 : selected.kind) === "youtube" && selected.url) {
        const text = await requestText(withYouTubeVttFormat(selected.url));
        this.secondaryCues = parseSubtitleText(text);
        selected.cues = this.secondaryCues;
      }
      this.setNativeTrackModes();
      this.updateFromLoadedCues();
      this.render();
      this.renderTrackPanel();
    }
    setNativeTrackModes() {
      for (const option of this.tracks) {
        if (option.track) option.track.mode = option.id === this.selectedTrackId || option.id === this.secondaryTrackId ? "hidden" : "disabled";
      }
    }
    async discoverYouTubeTracks() {
      if (!location.hostname.includes("youtube.com")) return;
      const videoId = getYouTubeVideoId();
      if (!videoId || videoId === this.youtubeVideoId) return;
      const tracks = getYouTubeCaptionTracks();
      if (!tracks.length) return;
      this.youtubeVideoId = videoId;
      for (const track of tracks) {
        if (this.tracks.some((existing) => existing.kind === "youtube" && existing.url === track.url)) continue;
        this.tracks.push({ id: `youtube-${this.tracks.length}`, label: track.label, kind: "youtube", url: track.url });
      }
      const primary = this.tracks.find((track) => track.kind === "youtube" && isJapaneseTrack(track.label)) ?? this.tracks.find((track) => track.kind === "youtube");
      const secondary = this.tracks.find((track) => track.kind === "youtube" && !isJapaneseTrack(track.label));
      if (primary && !this.selectedTrackId) await this.selectTrack(primary.id);
      if (secondary && this.options.getSettings().subtitleSecondaryVisible && !this.secondaryTrackId) await this.selectSecondaryTrack(secondary.id);
      this.syncControls();
    }
    syncControls() {
      var _a, _b, _c, _d, _e;
      const settings = this.options.getSettings();
      (_b = this.root) == null ? void 0 : _b.classList.toggle("jpdb-subtitle-menu-open", !((_a = this.menuEl) == null ? void 0 : _a.hidden));
      const secondaryToggle = (_c = this.menuEl) == null ? void 0 : _c.querySelector('[data-action="toggle-secondary"]');
      if (secondaryToggle) secondaryToggle.textContent = settings.subtitleSecondaryVisible ? "Native subtitles on" : "Native subtitles off";
      const subtitleToggle = (_d = this.menuEl) == null ? void 0 : _d.querySelector('[data-action="toggle"]');
      if (subtitleToggle) subtitleToggle.textContent = settings.subtitleOverlayVisible ? "Hide subtitles" : "Show subtitles";
      if (!this.statusEl) return;
      if (this.cues.length) {
        const index = this.currentCue ? this.cues.findIndex((cue) => cue === this.currentCue) + 1 : 0;
        this.statusEl.textContent = `${index > 0 ? `${index}/` : ""}${this.cues.length}`;
      } else if ((_e = this.currentCue) == null ? void 0 : _e.text) {
        this.statusEl.textContent = "Page captions";
      } else if (this.tracks.length) {
        this.statusEl.textContent = `${this.tracks.length} tracks`;
      } else {
        this.statusEl.textContent = "No subs";
      }
    }
    toggleMenu() {
      if (!this.menuEl) return;
      this.menuEl.hidden = !this.menuEl.hidden;
    }
    toggleSubtitles() {
      const settings = this.options.getSettings();
      settings.subtitleOverlayVisible = !settings.subtitleOverlayVisible;
      this.options.onSettingsChange();
      this.refresh();
    }
    toggleSecondarySubtitles() {
      const settings = this.options.getSettings();
      settings.subtitleSecondaryVisible = !settings.subtitleSecondaryVisible;
      if (!settings.subtitleSecondaryVisible) this.secondaryCue = void 0;
      this.options.onSettingsChange();
      this.render();
    }
    toggleTranscriptPanel() {
      if (!this.transcriptPanel) return;
      const shouldOpen = this.transcriptPanel.hidden || this.panelMode !== "lines";
      this.panelMode = "lines";
      this.transcriptPanel.hidden = !shouldOpen;
      this.renderTranscriptPanel();
    }
    toggleTrackPanel() {
      if (!this.transcriptPanel) return;
      const shouldOpen = this.transcriptPanel.hidden || this.panelMode !== "tracks";
      this.panelMode = "tracks";
      this.transcriptPanel.hidden = !shouldOpen;
      if (this.menuEl) this.menuEl.hidden = true;
      this.renderTrackPanel();
    }
    renderTranscriptPanel() {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.panelMode !== "lines") return;
      if (!this.cues.length) {
        setInnerHtml(this.transcriptPanel, '<div class="jpdb-subtitle-list-empty">No loaded Japanese subtitle lines.</div>');
        return;
      }
      const currentIndex = this.currentCue ? this.cues.findIndex((cue) => cue === this.currentCue) : -1;
      const start = Math.max(0, currentIndex - 12);
      const visible = this.cues.slice(start, start + 28);
      setInnerHtml(this.transcriptPanel, `
            <div class="jpdb-subtitle-list-head">
                <span>${this.cues.length} lines</span>
                <button type="button" data-action="list">Close</button>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                ${visible.map((cue, offset) => {
      const index = start + offset;
      return `
                        <button class="jpdb-subtitle-list-row ${index === currentIndex ? "active" : ""}" type="button" data-action="cue" data-index="${index}">
                            <span>${formatSubtitleTime(cue.start)}</span>
                            <strong>${escapeHtml$1(cue.text)}</strong>
                        </button>
                    `;
    }).join("")}
            </div>
        `);
    }
    renderTrackPanel() {
      if (!this.transcriptPanel || this.transcriptPanel.hidden || this.panelMode !== "tracks") return;
      const tracks = this.tracks;
      setInnerHtml(this.transcriptPanel, `
            <div class="jpdb-subtitle-list-head">
                <span>${tracks.length ? `${tracks.length} detected tracks` : "No detected tracks"}</span>
                <button type="button" data-action="tracks">Close</button>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                ${tracks.length ? tracks.map((track) => `
                    <div class="jpdb-subtitle-track-row ${track.id === this.selectedTrackId || track.id === this.secondaryTrackId ? "active" : ""}" data-track-id="${escapeHtml$1(track.id)}">
                        <strong>${escapeHtml$1(track.label)}</strong>
                        <span>${formatTrackKind(track.kind)}${track.id === this.selectedTrackId ? " · Japanese" : ""}${track.id === this.secondaryTrackId ? " · native language" : ""}</span>
                        <div>
                            <button type="button" data-action="primary-track">Japanese</button>
                            <button type="button" data-action="secondary-track">Native</button>
                        </div>
                    </div>
                `).join("") : '<div class="jpdb-subtitle-list-empty">Load SRT/VTT files or enable page captions, then choose tracks here.</div>'}
            </div>
        `);
    }
    async choosePrimaryTrack(id) {
      if (!id) return;
      await this.selectTrack(id);
      this.options.onToast("Japanese subtitle track selected.");
    }
    async chooseSecondaryTrack(id) {
      if (!id) return;
      await this.selectSecondaryTrack(id);
      this.options.onToast("Native subtitle track selected.");
    }
  }
  function formatTrackKind(kind) {
    if (kind === "native") return "page track";
    if (kind === "youtube") return "YouTube captions";
    return "loaded file";
  }
  function getCueText(cue) {
    if ("text" in cue && typeof cue.text === "string") return cue.text;
    return "";
  }
  function readTrackCues(track) {
    return Array.from(track.cues ?? []).map((cue) => ({ start: cue.startTime, end: cue.endTime, text: getCueText(cue).trim() })).filter((cue) => cue.text).sort((a, b) => a.start - b.start);
  }
  function parseSubtitleText(text) {
    const blocks = text.replace(/\r/g, "").replace(/^WEBVTT.*?\n\n/s, "").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split("\n").filter(Boolean);
      const timeIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeIndex < 0) continue;
      const [startRaw, endRaw] = lines[timeIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
      const start = parseSubtitleTime(startRaw);
      const end = parseSubtitleTime(endRaw);
      const cueText = lines.slice(timeIndex + 1).join("\n").replace(/<[^>]+>/g, "").trim();
      if (Number.isFinite(start) && Number.isFinite(end) && cueText) cues.push({ start, end, text: cueText });
    }
    return cues.sort((a, b) => a.start - b.start);
  }
  function readPageCaptionText(video, readerRoot) {
    const direct = collectCaptionTexts(
      [...document.querySelectorAll(CAPTION_SELECTORS)],
      video,
      readerRoot,
      false
    );
    if (direct) return direct;
    if (!video) return "";
    return collectCaptionTexts(
      [...document.body.querySelectorAll("div, span, p")],
      video,
      readerRoot,
      true
    );
  }
  function parseSubtitleTime(value) {
    const match = value.match(/(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) return Number.NaN;
    const [, hours = "0", minutes, seconds, millis] = match;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1e3;
  }
  function formatSubtitleTime(value) {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
  function isJapaneseTrack(label = "", language = "") {
    return /(^|\b)(ja|jpn|japanese|日本語)(\b|$)/i.test(`${label} ${language}`);
  }
  function collectCaptionTexts(elements, video, readerRoot, nearVideoOnly = false) {
    const lines = [];
    const seen = /* @__PURE__ */ new Set();
    for (const element2 of elements) {
      if (!isLikelyCaptionElement(element2, video, readerRoot, nearVideoOnly)) continue;
      const text = normalizeCaptionText(element2.innerText || element2.textContent || "");
      if (!text || seen.has(text)) continue;
      seen.add(text);
      lines.push(text);
      if (lines.length >= 3) break;
    }
    return lines.join("\n").trim();
  }
  function isLikelyCaptionElement(element2, video, readerRoot, nearVideoOnly = false) {
    if (!element2.isConnected) return false;
    if (readerRoot && (element2 === readerRoot || readerRoot.contains(element2))) return false;
    if (element2.closest("[data-jpdb-reader-root], script, style, noscript, textarea, input, select, button")) return false;
    const text = normalizeCaptionText(element2.innerText || element2.textContent || "");
    if (text.length < 2 || text.length > 180 || !/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) return false;
    if (text.split("\n").length > 4) return false;
    if ([...element2.children].some((child) => /[\u3040-\u30ff\u3400-\u9fff]/.test(child.textContent ?? ""))) return false;
    const rect = element2.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 10 || rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(element2);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") <= 0) return false;
    if (!video) return !nearVideoOnly;
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width < 120 || videoRect.height < 80) return !nearVideoOnly;
    const horizontalOverlap = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left));
    const overlapRatio = horizontalOverlap / Math.max(1, Math.min(rect.width, videoRect.width));
    const overlapsVideo = rect.bottom >= videoRect.top && rect.top <= videoRect.bottom && overlapRatio > 0.25;
    const belowVideo = rect.top >= videoRect.bottom && rect.top <= videoRect.bottom + 90 && overlapRatio > 0.25;
    const tooLarge = rect.width * rect.height > videoRect.width * videoRect.height * 0.45;
    return !tooLarge && (overlapsVideo || belowVideo);
  }
  function normalizeCaptionText(value) {
    return value.replace(/\u00a0/g, " ").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  }
  function escapeWithBreaks(value) {
    return withBreaks(escapeHtml$1(value));
  }
  function withBreaks(value) {
    return value.replace(/\n/g, "<br>");
  }
  function getYouTubeVideoId() {
    var _a;
    const url = new URL(location.href);
    return url.searchParams.get("v") ?? ((_a = url.pathname.match(/\/shorts\/([^/?]+)/)) == null ? void 0 : _a[1]) ?? "";
  }
  function getYouTubeCaptionTracks() {
    var _a, _b;
    const response = getYouTubePlayerResponse();
    const rawTracks = (_b = (_a = response == null ? void 0 : response.captions) == null ? void 0 : _a.playerCaptionsTracklistRenderer) == null ? void 0 : _b.captionTracks;
    if (!Array.isArray(rawTracks)) return [];
    return rawTracks.map((track) => {
      var _a2, _b2, _c;
      const record = track;
      const label = ((_a2 = record.name) == null ? void 0 : _a2.simpleText) ?? ((_c = (_b2 = record.name) == null ? void 0 : _b2.runs) == null ? void 0 : _c.map((run) => run.text ?? "").join("")) ?? record.languageCode ?? "YouTube subtitles";
      return typeof record.baseUrl === "string" ? { label: `${label} ${record.languageCode ?? ""}`.trim(), url: record.baseUrl } : null;
    }).filter((track) => track !== null);
  }
  function getYouTubePlayerResponse() {
    const fromWindow = window.ytInitialPlayerResponse;
    if (fromWindow && typeof fromWindow === "object") return fromWindow;
    for (const script of Array.from(document.scripts)) {
      const text = script.textContent ?? "";
      const marker = "ytInitialPlayerResponse = ";
      const start = text.indexOf(marker);
      if (start < 0) continue;
      const raw = extractJsonObject(text, start + marker.length);
      if (!raw) continue;
      try {
        return JSON.parse(raw);
      } catch {
        continue;
      }
    }
    return null;
  }
  function extractJsonObject(text, start) {
    const objectStart = text.indexOf("{", start);
    if (objectStart < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = objectStart; index < text.length; index++) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) return text.slice(objectStart, index + 1);
      }
    }
    return null;
  }
  function withYouTubeVttFormat(url) {
    const parsed = new URL(url);
    parsed.searchParams.set("fmt", "vtt");
    return parsed.href;
  }
  function requestText(url) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "text",
          timeout: 8e3,
          onload: (response) => response.status >= 200 && response.status < 300 ? resolve(String(response.responseText ?? response.response ?? "")) : reject(new Error(`Subtitle request failed (${response.status}).`)),
          onerror: reject,
          ontimeout: () => reject(new Error("Subtitle request timed out."))
        });
      });
    }
    return fetch(url, { signal: AbortSignal.timeout(8e3) }).then((response) => {
      if (!response.ok) throw new Error(`Subtitle request failed (${response.status}).`);
      return response.text();
    });
  }
  function mutationInsideReaderRoot$2(mutation) {
    const nodes = [
      mutation.target,
      ...Array.from(mutation.addedNodes),
      ...Array.from(mutation.removedNodes)
    ];
    return nodes.every((node) => {
      var _a;
      const element2 = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return Boolean((_a = element2 == null ? void 0 : element2.closest) == null ? void 0 : _a.call(element2, "[data-jpdb-reader-root]"));
    });
  }
  const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/i;
  const VIDEO_CARD_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-reel-item-renderer",
    "ytm-rich-item-renderer",
    "ytm-compact-video-renderer",
    "ytm-video-card-renderer"
  ].join(",");
  const TITLE_SELECTOR = [
    "#video-title",
    "a#video-title",
    "yt-formatted-string#video-title",
    "h3 a",
    "h3",
    ".yt-lockup-metadata-view-model-wiz__title",
    ".media-item-headline",
    'a[href*="/watch"]',
    'a[href*="/shorts"]'
  ].join(",");
  const JAPANESE_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff]/g;
  const KANA_RE = /[\u3040-\u30ff]/g;
  const LATIN_WORD_RE = /[a-z]{3,}/gi;
  function isYouTubeHost(hostname = location.hostname) {
    return YOUTUBE_HOST_RE.test(hostname);
  }
  function isProbablyJapaneseYouTubeText(text) {
    var _a, _b, _c;
    const compact = text.replace(/\s+/g, " ").trim();
    if (!HAS_JAPANESE.test(compact)) return false;
    const japaneseChars = ((_a = compact.match(JAPANESE_CHAR_RE)) == null ? void 0 : _a.length) ?? 0;
    const kanaChars = ((_b = compact.match(KANA_RE)) == null ? void 0 : _b.length) ?? 0;
    const latinWords = ((_c = compact.match(LATIN_WORD_RE)) == null ? void 0 : _c.length) ?? 0;
    if (kanaChars >= 2) return true;
    if (japaneseChars >= 4) return true;
    return japaneseChars >= 2 && latinWords <= 2;
  }
  function collectYouTubeVideoCards(root = document) {
    return Array.from(root.querySelectorAll(VIDEO_CARD_SELECTOR)).filter((card) => !card.closest("[data-jpdb-reader-root]"));
  }
  function readYouTubeCardText(card) {
    var _a;
    const title = card.querySelector(TITLE_SELECTOR);
    const titleText = [
      title == null ? void 0 : title.getAttribute("title"),
      title == null ? void 0 : title.getAttribute("aria-label"),
      title == null ? void 0 : title.textContent
    ].find((value) => value == null ? void 0 : value.trim()) ?? "";
    return titleText.trim() || ((_a = card.textContent) == null ? void 0 : _a.trim()) || "";
  }
  class YoutubeImmersionFilter {
    constructor(options) {
      __publicField(this, "observer");
      __publicField(this, "timer");
      __publicField(this, "bar");
      __publicField(this, "revealed", false);
      this.options = options;
    }
    init() {
      var _a;
      if (!isYouTubeHost()) return;
      (_a = this.observer) == null ? void 0 : _a.disconnect();
      this.observer = new MutationObserver((mutations) => {
        if (mutations.some(mutationInsideReaderRoot$1)) return;
        this.schedule(350);
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
      window.addEventListener("yt-navigate-finish", () => this.schedule(120));
      window.addEventListener("popstate", () => this.schedule(120));
      this.schedule(300);
    }
    refresh() {
      if (!isYouTubeHost()) return;
      if (!this.options.getSettings().youtubeImmersionEnabled) {
        this.clear();
        return;
      }
      this.schedule(80);
    }
    schedule(delay) {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.scan(), delay);
    }
    scan() {
      var _a;
      const settings = this.options.getSettings();
      if (!settings.youtubeImmersionEnabled) {
        this.clear();
        return;
      }
      let filteredCount = 0;
      let shownCount = 0;
      for (const card of collectYouTubeVideoCards()) {
        const text = readYouTubeCardText(card);
        if (!text) continue;
        const isJapanese = isProbablyJapaneseYouTubeText(text);
        if (!isJapanese) filteredCount += 1;
        if (isJapanese || this.revealed) {
          this.showCard(card);
          shownCount += 1;
        } else {
          this.hideCard(card);
        }
      }
      if (settings.youtubeShowFilterNotice) this.renderNotice(filteredCount, shownCount, settings);
      else (_a = this.bar) == null ? void 0 : _a.remove();
    }
    hideCard(card) {
      card.classList.add("jpdb-youtube-filtered");
      card.dataset.yomuYoutubeFiltered = "true";
    }
    showCard(card) {
      card.classList.remove("jpdb-youtube-filtered");
      delete card.dataset.yomuYoutubeFiltered;
    }
    renderNotice(filteredCount, shownCount, settings) {
      var _a;
      if (!filteredCount) {
        (_a = this.bar) == null ? void 0 : _a.remove();
        this.bar = void 0;
        return;
      }
      if (!this.bar) {
        this.bar = document.createElement("div");
        this.bar.className = "jpdb-youtube-filter-bar";
        this.bar.dataset.jpdbReaderRoot = "true";
        const label = document.createElement("span");
        label.dataset.role = "summary";
        const actions = document.createElement("div");
        actions.className = "jpdb-youtube-filter-actions";
        const showAnyway2 = document.createElement("button");
        showAnyway2.type = "button";
        showAnyway2.dataset.action = "show-anyway";
        const turnOff2 = document.createElement("button");
        turnOff2.type = "button";
        turnOff2.dataset.action = "turn-off";
        actions.append(showAnyway2, turnOff2);
        this.bar.addEventListener("click", (event) => {
          var _a2, _b, _c;
          const action = (_a2 = event.target.closest("[data-action]")) == null ? void 0 : _a2.dataset.action;
          if (action === "show-anyway") {
            this.revealed = !this.revealed;
            this.schedule(0);
          }
          if (action === "turn-off") {
            (_c = (_b = this.options).setEnabled) == null ? void 0 : _c.call(_b, false);
            if (!this.options.setEnabled) this.clear();
          }
        });
        this.bar.append(label, actions);
        document.body.append(this.bar);
      }
      const summary = this.bar.querySelector('[data-role="summary"]');
      const showAnyway = this.bar.querySelector('[data-action="show-anyway"]');
      const turnOff = this.bar.querySelector('[data-action="turn-off"]');
      if (summary) {
        summary.textContent = this.revealed ? `${APP_NAME} is showing ${filteredCount} hidden YouTube item${filteredCount === 1 ? "" : "s"}` : `${APP_NAME} hid ${filteredCount} non-Japanese-looking YouTube item${filteredCount === 1 ? "" : "s"}`;
        summary.title = shownCount ? `${shownCount} Japanese-looking items stayed visible.` : "";
      }
      if (showAnyway) showAnyway.textContent = this.revealed ? uiText(settings.interfaceLanguage, "youtubeFilterAgain") : uiText(settings.interfaceLanguage, "youtubeShowAnyway");
      if (turnOff) turnOff.textContent = uiText(settings.interfaceLanguage, "youtubeTurnOff");
    }
    clear() {
      var _a;
      window.clearTimeout(this.timer);
      this.revealed = false;
      collectYouTubeVideoCards().forEach((card) => this.showCard(card));
      document.querySelectorAll('[data-yomu-youtube-filtered="true"]').forEach((card) => this.showCard(card));
      (_a = this.bar) == null ? void 0 : _a.remove();
      this.bar = void 0;
    }
  }
  function mutationInsideReaderRoot$1(mutation) {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes)];
    return nodes.every((node) => {
      var _a;
      const element2 = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return Boolean((_a = element2 == null ? void 0 : element2.closest) == null ? void 0 : _a.call(element2, "[data-jpdb-reader-root]"));
    });
  }
  const JPDB_SETTINGS_URL = "https://jpdb.io/settings";
  const JPDB_DEFINITION_SOURCE_ID = "__jpdb__";
  class ReaderApp {
    constructor() {
      __publicField(this, "settings", DEFAULT_SETTINGS);
      __publicField(this, "jpdb", new JpdbClient(() => this.settings.apiKey.trim()));
      __publicField(this, "jpdbKanji", new JpdbKanjiClient());
      __publicField(this, "kanjiVG", new KanjiVGClient());
      __publicField(this, "audio", new AudioPlayer(() => this.settings));
      __publicField(this, "anki", new AnkiConnectClient(() => this.settings));
      __publicField(this, "rtk", new RtkClient());
      __publicField(this, "dictionaries", new YomitanDictionaryStore());
      __publicField(this, "onboarding", new OnboardingController({
        getSettings: () => this.settings,
        setSettings: (settings) => {
          this.settings = settings;
          this.applyTheme();
        },
        showSettings: () => this.showSettings()
      }));
      __publicField(this, "subtitles", new SubtitlePlayerController({
        getSettings: () => this.settings,
        parseJapanese: async (text) => (await this.jpdb.parse([text]))[0] ?? [],
        onSettingsChange: () => void saveSettings(this.settings),
        onToast: (message) => this.toast(message)
      }));
      __publicField(this, "ocr", new ImageOcrController({
        getSettings: () => this.settings,
        parseJapanese: async (text) => (await this.jpdb.parse([text]))[0] ?? [],
        onLookup: (text, sentence) => this.lookupText(text, sentence),
        onToast: (message) => this.toast(message)
      }));
      __publicField(this, "youtube", new YoutubeImmersionFilter({
        getSettings: () => this.settings,
        setEnabled: (enabled) => void this.setYoutubeImmersionEnabled(enabled)
      }));
      __publicField(this, "activePopover");
      __publicField(this, "activeBackdrop");
      __publicField(this, "fab");
      __publicField(this, "lastCard");
      __publicField(this, "selectionTimer");
      __publicField(this, "autoScanTimer");
      __publicField(this, "autoScanDeadline", 0);
      __publicField(this, "autoScanObserver");
      __publicField(this, "asbScanTimer");
      __publicField(this, "hoverLookupTimer");
      __publicField(this, "settingsPreviewOriginalAccent");
      __publicField(this, "settingsPreviewOriginalLanguage");
      __publicField(this, "lastAutoAudioKey", "");
      __publicField(this, "lastAutoAudioAt", 0);
      __publicField(this, "cardRenderRequest", 0);
      __publicField(this, "pressedKeys", /* @__PURE__ */ new Set());
      __publicField(this, "suppressSelectionLookupUntil", 0);
    }
    async init() {
      this.settings = await loadSettings();
      this.settings = applyUrlBootstrapSettings(this.settings);
      this.installStyles();
      this.applyTheme();
      this.installFab();
      this.bindEvents();
      this.subtitles.init();
      this.ocr.init();
      this.youtube.init();
      if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand(`${APP_NAME} settings`, () => this.showSettings());
        GM_registerMenuCommand(`${APP_NAME} scan visible page`, () => this.scanVisiblePage());
        GM_registerMenuCommand(`${APP_NAME} scan nearby images`, () => this.ocr.scanVisible());
        GM_registerMenuCommand(`${APP_NAME} toggle YouTube filter`, () => void this.toggleYoutubeImmersion());
        GM_registerMenuCommand(`${APP_NAME} show puck`, () => {
          this.settings.showFloatingButton = true;
          void saveSettings(this.settings).then(() => this.installFab());
        });
      }
      this.setupAutoScan();
      const showedOnboarding = await this.onboarding.showIfNeeded();
      if (!this.settings.apiKey) {
        if (!showedOnboarding) this.showSettings();
      } else if (this.settings.scanVisiblePage || this.settings.autoScanJapanese) {
        void this.scanVisiblePage({ silent: true });
      }
    }
    installStyles() {
      if (typeof GM_addStyle === "function") GM_addStyle(READER_CSS);
      else {
        const style = document.createElement("style");
        style.textContent = READER_CSS;
        document.head.appendChild(style);
      }
    }
    applyTheme() {
      this.applyAccentColor(this.settings.accentColor);
      document.documentElement.classList.toggle("jpdb-reader-theme-dark", this.settings.theme === "dark");
      document.documentElement.classList.toggle("jpdb-reader-theme-light", this.settings.theme === "light");
      document.documentElement.classList.toggle("jpdb-reader-hide-known", this.settings.hideKnownFurigana);
    }
    applyAccentColor(color) {
      const accentColor = sanitizeAccentColor(color);
      document.documentElement.style.setProperty("--jpdb-reader-accent", accentColor);
      document.documentElement.style.setProperty("--jpdb-reader-accent-soft", accentToRgba(accentColor, 0.18));
    }
    installFab() {
      var _a;
      (_a = this.fab) == null ? void 0 : _a.remove();
      this.fab = void 0;
      document.querySelectorAll("[data-jpdb-reader-root].jpdb-reader-fab").forEach((element2) => element2.remove());
      if (!this.settings.showFloatingButton) return;
      const button2 = document.createElement("button");
      button2.className = "jpdb-reader-fab";
      button2.type = "button";
      button2.textContent = APP_PUCK;
      button2.title = APP_NAME;
      button2.dataset.jpdbReaderRoot = "true";
      button2.addEventListener("click", () => this.showQuickMenu(button2));
      document.body.appendChild(button2);
      this.fab = button2;
    }
    setupAutoScan() {
      var _a;
      (_a = this.autoScanObserver) == null ? void 0 : _a.disconnect();
      this.autoScanObserver = new MutationObserver((mutations) => {
        if (mutations.some(mutationTouchesAsbPlayer)) this.scheduleAsbPlayerScan(120);
        else if (mutations.every(mutationInsideReaderRoot)) return;
        else this.scheduleAutoScan(900);
      });
      this.autoScanObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      window.addEventListener("scroll", () => this.scheduleAutoScan(500), { passive: true });
      window.addEventListener("resize", () => this.scheduleAutoScan(700), { passive: true });
      this.scheduleAutoScan(600);
    }
    scheduleAutoScan(delay) {
      if (!this.settings.autoScanJapanese || !this.settings.apiKey.trim()) return;
      const deadline = Date.now() + delay;
      if (this.autoScanTimer && this.autoScanDeadline <= deadline) return;
      window.clearTimeout(this.autoScanTimer);
      this.autoScanDeadline = deadline;
      this.autoScanTimer = window.setTimeout(() => {
        this.autoScanTimer = void 0;
        this.autoScanDeadline = 0;
        void this.scanAsbPlayerSubtitles();
        if (collectVisibleTextTargets(1).length > 0) {
          void this.scanVisiblePage({ silent: true });
        }
      }, delay);
    }
    scheduleAsbPlayerScan(delay) {
      if (!this.settings.autoScanJapanese || !this.settings.apiKey.trim()) return;
      window.clearTimeout(this.asbScanTimer);
      this.asbScanTimer = window.setTimeout(() => void this.scanAsbPlayerSubtitles(), delay);
    }
    bindEvents() {
      document.addEventListener("click", (event) => {
        var _a, _b;
        const word = (_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, ".jpdb-reader-word");
        if (!word) return;
        if (!this.settings.lookupOnClick) return;
        event.preventDefault();
        event.stopPropagation();
        this.suppressSelectionLookupUntil = Date.now() + 350;
        if (word.closest(".jpdb-subtitle-player") && this.settings.subtitleMiningPause) pauseActiveVideo();
        void this.showWord(word);
      }, { capture: true });
      document.addEventListener("pointerover", (event) => {
        var _a, _b;
        const word = (_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, ".jpdb-reader-word");
        if (!word || event.pointerType === "touch") return;
        if (!this.shouldLookupOnHover(event)) return;
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverLookupTimer = window.setTimeout(() => {
          if (!word.isConnected || !word.matches(":hover")) return;
          if (word.closest(".jpdb-subtitle-player") && this.settings.subtitleMiningPause) pauseActiveVideo();
          void this.showWord(word);
        }, 180);
      }, { capture: true });
      document.addEventListener("pointerout", (event) => {
        var _a, _b;
        const related = event.relatedTarget;
        const word = (_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, ".jpdb-reader-word");
        if (!word || related && word.contains(related)) return;
        window.clearTimeout(this.hoverLookupTimer);
      }, { capture: true });
      document.addEventListener("keyup", () => {
        if (!this.settings.parseSelection) return;
        window.clearTimeout(this.selectionTimer);
        this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 120);
      });
      document.addEventListener("mouseup", () => {
        if (!this.settings.parseSelection) return;
        window.clearTimeout(this.selectionTimer);
        this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 140);
      });
      document.addEventListener("touchend", () => {
        if (!this.settings.parseSelection) return;
        window.clearTimeout(this.selectionTimer);
        this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 180);
      }, { passive: true });
      document.addEventListener("keydown", (event) => {
        var _a;
        this.pressedKeys.add(normalizePressedKey(event.key));
        if (isEditableTarget(event.target)) return;
        if (matchesShortcut(event, this.settings.shortcuts.closePopup) && this.hasOpenReaderDialog()) {
          event.preventDefault();
          this.dismiss();
          return;
        }
        if (matchesShortcut(event, this.settings.shortcuts.scanPage)) {
          event.preventDefault();
          void this.scanVisiblePage({ silent: true });
          return;
        }
        if (matchesShortcut(event, this.settings.shortcuts.openSettings)) {
          event.preventDefault();
          this.showSettings();
          return;
        }
        if (matchesShortcut(event, this.settings.shortcuts.toggleOcr)) {
          event.preventDefault();
          this.settings.ocrEnabled = !this.settings.ocrEnabled;
          void saveSettings(this.settings);
          this.ocr.refresh();
          this.toast(this.settings.ocrEnabled ? "Image reading enabled." : "Image reading hidden.");
          return;
        }
        if (matchesShortcut(event, this.settings.shortcuts.toggleYoutubeImmersion)) {
          event.preventDefault();
          void this.toggleYoutubeImmersion();
          return;
        }
        if (matchesShortcut(event, this.settings.shortcuts.scanImages)) {
          event.preventDefault();
          void this.ocr.scanVisible();
          return;
        }
        if (this.lastCard && this.activePopover && matchesShortcut(event, this.settings.shortcuts.playAudio)) {
          event.preventDefault();
          void this.playAudio(this.lastCard);
          return;
        }
        const grade = this.shortcutGrade(event);
        if (this.lastCard && grade && ((_a = this.activePopover) == null ? void 0 : _a.classList.contains("jpdb-reader-popover"))) {
          event.preventDefault();
          void this.jpdb.reviewCard(this.lastCard, grade).then(() => this.toast("Review sent.")).catch((error) => {
            this.toast(error instanceof Error ? error.message : "Review failed.");
          });
        }
      });
      document.addEventListener("keyup", (event) => {
        this.pressedKeys.delete(normalizePressedKey(event.key));
      });
      window.addEventListener("blur", () => this.pressedKeys.clear());
    }
    shortcutGrade(event) {
      if (!this.settings.enableReviews) return null;
      if (this.settings.twoButtonReviews) {
        if (matchesShortcut(event, this.settings.shortcuts.gradeFail)) return "fail";
        if (matchesShortcut(event, this.settings.shortcuts.gradePass)) return "pass";
        return null;
      }
      if (matchesShortcut(event, this.settings.shortcuts.gradeNothing)) return "nothing";
      if (matchesShortcut(event, this.settings.shortcuts.gradeSomething)) return "something";
      if (matchesShortcut(event, this.settings.shortcuts.gradeHard)) return "hard";
      if (matchesShortcut(event, this.settings.shortcuts.gradeOkay)) return "okay";
      if (matchesShortcut(event, this.settings.shortcuts.gradeEasy)) return "easy";
      return null;
    }
    shouldLookupOnHover(event) {
      return this.settings.lookupOnHover && shortcutIsPressed(this.settings.shortcuts.hoverLookup, event, this.pressedKeys);
    }
    async toggleYoutubeImmersion() {
      await this.setYoutubeImmersionEnabled(!this.settings.youtubeImmersionEnabled);
    }
    async setYoutubeImmersionEnabled(enabled) {
      this.settings.youtubeImmersionEnabled = enabled;
      await saveSettings(this.settings);
      this.youtube.refresh();
      this.toast(uiText(this.settings.interfaceLanguage, enabled ? "youtubeToggleToastOn" : "youtubeToggleToastOff"));
    }
    hasOpenReaderDialog() {
      return Boolean(this.activePopover || this.activeBackdrop || document.querySelector("[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop"));
    }
    async lookupSelection() {
      var _a, _b;
      if (Date.now() < this.suppressSelectionLookupUntil) return;
      const selected = getSelectionText();
      if (selected.length < 1 || selected.length > 120 || !HAS_JAPANESE.test(selected)) return;
      if ((_b = (_a = document.activeElement) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, "[data-jpdb-reader-root]")) return;
      await this.lookupText(selected, getSelectionSentence());
    }
    async lookupText(text, sentence = text) {
      const selected = text.replace(/\s+/g, " ").trim();
      if (!selected || !HAS_JAPANESE.test(selected)) return;
      try {
        const [tokens] = await this.jpdb.parse([sentence]);
        const selectedToken = pickTokenForSelection(tokens, selected);
        if (!selectedToken) {
          this.showTokenList(tokens, selected);
          return;
        }
        void this.showCard(selectedToken.card, selectedToken.sentence ?? sentence);
      } catch (error) {
        const localEntries = this.settings.localDictionariesEnabled ? await this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => []) : [];
        if (localEntries.length) this.showLocalDictionaryPopup(selected, localEntries);
        else this.toast(error instanceof Error ? error.message : "JPDB lookup failed.");
      }
    }
    async scanVisiblePage(options = {}) {
      try {
        const targets = collectVisibleTextTargets();
        if (!targets.length) {
          if (!options.silent) this.toast("No unscanned Japanese text found.");
          return;
        }
        const parsed = await this.jpdb.parse(targets.map((target) => target.text));
        targets.forEach((target, index) => applyTokensToTextNode(target, parsed[index] ?? [], this.settings));
      } catch (error) {
        if (!options.silent) this.toast(error instanceof Error ? error.message : "JPDB scan failed.");
      }
    }
    async scanAsbPlayerSubtitles() {
      const roots = Array.from(document.querySelectorAll(".asbplayer-offscreen, .asbplayer-subtitles-container-bottom"));
      if (!roots.length) return;
      const targets = roots.flatMap((root) => collectTextTargetsIn(root, 12, false)).slice(0, 12);
      if (!targets.length) return;
      try {
        const parsed = await this.jpdb.parse(targets.map((target) => target.text));
        targets.forEach((target, index) => applyTokensToTextNode(target, parsed[index] ?? [], this.settings));
      } catch {
      }
    }
    async showWord(word) {
      const vid = Number(word.dataset.vid);
      const sid = Number(word.dataset.sid);
      const card = this.jpdb.getCard(vid, sid);
      if (!card) {
        this.toast("That word is no longer in the local JPDB cache. Scan it again.");
        return;
      }
      void this.showCard(card, word.dataset.sentence || void 0, word);
    }
    showTokenList(tokens, selected) {
      if (!tokens.length) return;
      const popover = this.createPopover();
      setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-pos">Selection</div>
            <div class="jpdb-reader-meanings">
                ${tokens.map((token) => `
                    <button class="jpdb-reader-btn" data-vid="${token.card.vid}" data-sid="${token.card.sid}">
                        ${escapeHtml$1(token.card.spelling)} ${token.card.reading !== token.card.spelling ? `<span class="jpdb-reader-reading">${escapeHtml$1(token.card.reading)}</span>` : ""}
                    </button>
                `).join("")}
            </div>
            <div class="jpdb-reader-help">Parsed from: ${escapeHtml$1(selected)}</div>
        `);
      popover.addEventListener("click", (event) => {
        var _a;
        const button2 = event.target.closest("button[data-vid]");
        if (!button2) return;
        const card = this.jpdb.getCard(Number(button2.dataset.vid), Number(button2.dataset.sid));
        if (card) void this.showCard(card, (_a = tokens.find((t) => t.card === card)) == null ? void 0 : _a.sentence);
      });
      this.mountPopover(popover);
    }
    showLocalDictionaryPopup(term, entries) {
      const popover = this.createPopover();
      setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <div class="jpdb-reader-spelling">${escapeHtml$1(term)}</div>
                    <div class="jpdb-reader-reading">Yomitan dictionaries</div>
                </div>
            </div>
            <div class="jpdb-reader-definition-stack">
                ${Array.from(groupTermEntriesByDictionary(entries)).map(([dictionary, dictionaryEntries]) => this.renderLocalDefinitionSource(dictionary, dictionaryEntries)).join("")}
            </div>
        `);
      this.mountPopover(popover);
    }
    showQuickMenu(anchor) {
      const popover = this.createPopover();
      const language = this.settings.interfaceLanguage;
      const scanButton = this.settings.autoScanJapanese && this.settings.scanVisiblePage && this.settings.ocrAutoScanImages ? "" : `<button class="jpdb-reader-btn" data-action="scan">${uiText(language, "scanPage")}</button>`;
      const imageButton = this.settings.ocrAutoScanImages ? "" : `<button class="jpdb-reader-btn" data-action="ocr">${uiText(language, "scanImages")}</button>`;
      const youtubeButton = isYouTubeHost() ? `<button class="jpdb-reader-btn" data-action="youtube-filter">${uiText(language, this.settings.youtubeImmersionEnabled ? "youtubeFilterOn" : "youtubeFilterOff")}</button>` : "";
      const buttonCount = [scanButton, imageButton, youtubeButton, "settings"].filter(Boolean).length;
      setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <div class="jpdb-reader-spelling">${APP_NAME}</div>
                    <div class="jpdb-reader-reading">${uiText(language, "quickDescription")}</div>
                </div>
            </div>
            <div class="jpdb-reader-actions">
                <div class="jpdb-reader-row jpdb-reader-grades" style="--cols: ${buttonCount}">
                    ${scanButton}
                    ${imageButton}
                    ${youtubeButton}
                    <button class="jpdb-reader-btn" data-action="settings">${uiText(language, "settings")}</button>
                </div>
            </div>
        `);
      popover.addEventListener("click", (event) => {
        var _a;
        const action = (_a = event.target.closest("[data-action]")) == null ? void 0 : _a.dataset.action;
        if (action === "scan") void this.scanVisiblePage();
        if (action === "ocr") void this.ocr.scanVisible();
        if (action === "youtube-filter") void this.toggleYoutubeImmersion().then(() => this.dismiss());
        if (action === "settings") this.showSettings();
        event.stopPropagation();
      });
      this.mountPopover(popover, anchor);
    }
    async showCard(card, sentence, anchor, options = {}) {
      const requestId = ++this.cardRenderRequest;
      this.lastCard = card;
      const state = card.cardState[0] ?? "not-in-deck";
      const popover = this.createPopover();
      const localEntries = this.settings.localDictionariesEnabled ? await this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => []) : [];
      const kanjiEntries = this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji ? await this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => []) : [];
      const metaEntries = this.settings.localDictionariesEnabled ? await this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(() => []) : [];
      const jpdbUrl = `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
      const cardPos = formatPartOfSpeech(card.partOfSpeech);
      const cardPosDetails = formatPartOfSpeechDetails(card.partOfSpeech);
      const language = this.settings.interfaceLanguage;
      setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row">
                        <div class="jpdb-reader-spelling jpdb-${state}">${renderSpellingForKanjiNavigation(card.spelling)}</div>
                        <a class="jpdb-reader-jpdb-pill" href="${jpdbUrl}" target="_blank" rel="noopener" title="${uiText(language, "openOnJpdb")}" aria-label="${uiText(language, "openOnJpdb")}: ${escapeHtml$1(card.spelling)}">JPDB ${externalLinkIcon()}</a>
                    </div>
                    ${card.reading !== card.spelling ? `<div class="jpdb-reader-reading">${escapeHtml$1(card.reading)}</div>` : ""}
                </div>
                <div class="jpdb-reader-card-tools">
                    ${this.settings.showPitchAccent ? renderPitch(card) : ""}
                    <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" type="button" aria-label="${uiText(language, "playAudio")}" title="${uiText(language, "playAudio")}">${speakerIcon()}</button>
                </div>
            </div>
            ${cardPos ? `<div class="jpdb-reader-pos" title="${escapeHtml$1(cardPosDetails)}">${escapeHtml$1(cardPos)}</div>` : ""}
            ${this.renderDefinitionSources(card, localEntries)}
            <div class="jpdb-reader-meta">
                ${card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : ""}
                <span><span class="jpdb-reader-state-dot jpdb-${state}"></span>${escapeHtml$1(state)}</span>
            </div>
            ${this.renderTermMeta(metaEntries)}
            ${this.renderKanjiDefinitions(kanjiEntries)}
            <div class="jpdb-reader-actions">
                <div class="jpdb-reader-row" style="--cols: 3">
                    <button class="jpdb-reader-btn add" data-action="add">${uiText(language, "add")}</button>
                    <button class="jpdb-reader-btn nf" data-action="neverforget">${card.cardState.includes("never-forget") ? uiText(language, "forget") : uiText(language, "never")}</button>
                    <button class="jpdb-reader-btn blacklist" data-action="blacklist">${card.cardState.includes("blacklisted") ? uiText(language, "unlist") : uiText(language, "blacklist")}</button>
                </div>
                ${this.settings.ankiEnabled ? `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki">${uiText(language, "addToAnki")}</button></div>` : ""}
                ${this.settings.enableReviews ? this.renderReviewButtons() : ""}
            </div>
        `);
      if (requestId !== this.cardRenderRequest) return;
      popover.addEventListener("click", (event) => {
        const kanjiButton = event.target.closest('[data-action="kanji"]');
        if (kanjiButton) {
          event.preventDefault();
          event.stopPropagation();
          void this.showKanjiCard(card, kanjiButton.dataset.kanji ?? "", sentence, anchor);
          return;
        }
        const button2 = event.target.closest("[data-action]");
        if (!button2) return;
        event.preventDefault();
        event.stopPropagation();
        void this.handleCardAction(button2, card, sentence);
      });
      this.mountPopover(popover, anchor);
      if (options.autoPlay !== false && this.shouldAutoPlay(card)) void this.playAudio(card);
    }
    shouldAutoPlay(card) {
      if (!this.settings.autoPlayAudio) return false;
      const key = `${card.vid}:${card.sid}`;
      const now = Date.now();
      if (key === this.lastAutoAudioKey && now - this.lastAutoAudioAt < 2500) return false;
      this.lastAutoAudioKey = key;
      this.lastAutoAudioAt = now;
      return true;
    }
    async showKanjiCard(card, kanji, sentence, anchor) {
      if (!isKanjiCharacter(kanji)) return;
      const popover = this.createPopover();
      const kanjiCharacters = uniqueKanji(card.spelling);
      const index = Math.max(0, kanjiCharacters.indexOf(kanji));
      const previous = kanjiCharacters[(index - 1 + kanjiCharacters.length) % kanjiCharacters.length];
      const next = kanjiCharacters[(index + 1) % kanjiCharacters.length];
      const jpdbUrl = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;
      const [jpdbInfo, kanjiEntries, rtkInfo, kanjiVGInfo, similarTerms] = await Promise.all([
        this.jpdbKanji.lookup(kanji).catch(() => null),
        this.settings.localDictionariesEnabled ? this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => []) : Promise.resolve([]),
        this.settings.rtkEnabled ? this.rtk.lookup(kanji).catch(() => null) : Promise.resolve(null),
        this.settings.kanjivgEnabled ? this.kanjiVG.lookup(kanji).catch(() => null) : Promise.resolve(null),
        this.settings.similarKanjiWords && this.settings.localDictionariesEnabled ? this.dictionaries.lookupSimilarTermsByKanji(kanji, this.settings.similarKanjiWordLimit, this.settings.dictionaryPreferences).catch(() => []) : Promise.resolve([])
      ]);
      const componentDictionaryLimit = Math.max(4, Math.min(this.settings.localDictionaryMaxResults, 12));
      const componentSummaries = (rtkInfo == null ? void 0 : rtkInfo.componentKanji.length) ? await Promise.all(rtkInfo.componentKanji.map(async (component) => ({
        kanji: component,
        rtk: this.settings.rtkEnabled ? await this.rtk.lookup(component).catch(() => null) : null,
        dictionary: this.settings.localDictionariesEnabled ? await this.dictionaries.lookupKanji(component, componentDictionaryLimit, this.settings.dictionaryPreferences).catch(() => []) : []
      }))) : [];
      const kanjiFacts = this.settings.kanjiOriginsEnabled ? buildKanjiFacts(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries) : [];
      const originGraph = this.settings.kanjiOriginsEnabled ? buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries) : null;
      setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-kanji-nav">
                <button class="jpdb-reader-icon-mini" type="button" data-action="word-back" title="Back to ${escapeHtml$1(card.spelling)}">←</button>
                <span>${escapeHtml$1(card.spelling)}</span>
                ${kanjiCharacters.length > 1 ? `
                    <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-prev" data-kanji="${escapeHtml$1(previous)}" title="Previous kanji">‹</button>
                    <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-next" data-kanji="${escapeHtml$1(next)}" title="Next kanji">›</button>
                ` : ""}
            </div>
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                        <div class="jpdb-reader-kanji-display">${escapeHtml$1(kanji)}</div>
                        ${renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries)}
                        <a class="jpdb-reader-jpdb-pill" href="${jpdbUrl}" target="_blank" rel="noopener" title="Open kanji on JPDB">JPDB ${externalLinkIcon()}</a>
                    </div>
                </div>
            </div>
            ${this.settings.kanjiOriginsEnabled ? renderKanjiOrigins(kanjiFacts, originGraph) : ""}
            ${this.settings.kanjivgEnabled ? renderKanjiPractice(kanjiVGInfo, kanji) : ""}
            ${renderJpdbKanjiInfo(jpdbInfo)}
            ${renderRtkInfo(rtkInfo, componentSummaries)}
            ${this.renderKanjiDefinitions(kanjiEntries)}
            ${this.renderSimilarKanjiWords(similarTerms, (jpdbInfo == null ? void 0 : jpdbInfo.vocabulary) ?? [], kanji, card)}
        `);
      popover.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-action]");
        const action = actionButton == null ? void 0 : actionButton.dataset.action;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === "word-back") void this.showCard(card, sentence, anchor, { autoPlay: false });
        if (action === "kanji-prev" || action === "kanji-next") void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor);
        if (action === "kanji") void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor);
        if (action === "similar-word") void this.lookupText(actionButton.dataset.expression ?? "", actionButton.dataset.expression ?? "");
      });
      this.mountPopover(popover, anchor);
      this.installKanjiDoodle(popover);
    }
    installKanjiDoodle(popover) {
      const stage = popover.querySelector(".jpdb-reader-doodle-stage");
      const canvas = popover.querySelector(".jpdb-reader-doodle-canvas");
      const ghost = popover.querySelector(".jpdb-reader-doodle-ghost");
      const clear = popover.querySelector("[data-doodle-clear]");
      const trace = popover.querySelector("[data-doodle-trace]");
      if (!stage || !canvas || !ghost) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      let dpr = 1;
      let drawing = false;
      let pointerId = -1;
      let traceVisible = true;
      let points = [];
      let strokes = [];
      const resize = () => {
        const rect = stage.getBoundingClientRect();
        dpr = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        redraw();
      };
      const toPoint = (event) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1))),
          y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1))),
          pressure: Math.max(0.12, Math.min(1, event.pressure || 0.55))
        };
      };
      const drawStroke = (stroke) => {
        if (!stroke.length) return;
        context.save();
        context.strokeStyle = "#141820";
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        stroke.forEach((point, index) => {
          const x = point.x * canvas.width;
          const y = point.y * canvas.height;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        const lastPoint = stroke[stroke.length - 1];
        const width = Math.max(3.2, Math.min(9.5, canvas.width * 0.014)) * dpr * (0.78 + ((lastPoint == null ? void 0 : lastPoint.pressure) ?? 0.55) * 0.42);
        context.lineWidth = width;
        context.stroke();
        context.restore();
      };
      const redraw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (const stroke of strokes) drawStroke(stroke);
        drawStroke(points);
      };
      const start = (event) => {
        var _a;
        event.preventDefault();
        event.stopPropagation();
        drawing = true;
        pointerId = event.pointerId;
        points = [toPoint(event)];
        (_a = canvas.setPointerCapture) == null ? void 0 : _a.call(canvas, event.pointerId);
        redraw();
      };
      const move = (event) => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const point = toPoint(event);
        const last = points.at(-1);
        const minDistance = event.pointerType === "pen" ? 15e-4 : 35e-4;
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= minDistance) {
          points.push(point);
          redraw();
        }
      };
      const end = (event) => {
        var _a;
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        if (points.length) strokes = [...strokes, points];
        points = [];
        drawing = false;
        pointerId = -1;
        (_a = canvas.releasePointerCapture) == null ? void 0 : _a.call(canvas, event.pointerId);
        redraw();
      };
      canvas.addEventListener("pointerdown", start, { passive: false });
      canvas.addEventListener("pointermove", move, { passive: false });
      canvas.addEventListener("pointerup", end, { passive: false });
      canvas.addEventListener("pointercancel", end, { passive: false });
      clear == null ? void 0 : clear.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        strokes = [];
        points = [];
        redraw();
      });
      trace == null ? void 0 : trace.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        traceVisible = !traceVisible;
        ghost.hidden = !traceVisible;
        trace.textContent = traceVisible ? "Hide trace" : "Show trace";
      });
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
      const disconnectWhenDetached = () => {
        if (!popover.isConnected) {
          resizeObserver.disconnect();
          return;
        }
        requestAnimationFrame(disconnectWhenDetached);
      };
      requestAnimationFrame(resize);
      requestAnimationFrame(disconnectWhenDetached);
    }
    renderDefinitionSources(card, entries) {
      const grouped = groupTermEntriesByDictionary(entries);
      const sections = this.orderedDefinitionSourceIds([...grouped.keys()]).map((sourceId) => {
        if (sourceId === JPDB_DEFINITION_SOURCE_ID) return this.renderJpdbDefinitionSource(card);
        return this.renderLocalDefinitionSource(sourceId, grouped.get(sourceId) ?? []);
      }).filter(Boolean);
      return sections.length ? `<div class="jpdb-reader-definition-stack">${sections.join("")}</div>` : `<div class="jpdb-reader-help jpdb-reader-no-definitions">${uiText(this.settings.interfaceLanguage, "noDefinitions")}</div>`;
    }
    orderedDefinitionSourceIds(dictionaryNames) {
      const preferences = new Map(this.settings.dictionaryPreferences.map((item) => [item.name, item]));
      const sources = [
        {
          id: JPDB_DEFINITION_SOURCE_ID,
          enabled: this.settings.jpdbDefinitionsEnabled,
          priority: this.settings.jpdbDefinitionsPriority,
          name: "JPDB"
        },
        ...dictionaryNames.map((name, index) => {
          const preference = preferences.get(name);
          return {
            id: name,
            enabled: (preference == null ? void 0 : preference.enabled) ?? true,
            priority: (preference == null ? void 0 : preference.priority) ?? 1e3 + index,
            name
          };
        })
      ];
      return sources.filter((source) => source.enabled).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)).map((source) => source.id);
    }
    renderJpdbDefinitionSource(card) {
      const meanings = card.meanings.slice(0, 6).map((meaning) => `<div class="jpdb-reader-meaning">${escapeHtml$1(meaning.glosses.join("; "))}</div>`).join("");
      if (!meanings) return "";
      return `
            <div class="jpdb-reader-local jpdb-reader-source-card" data-source="jpdb">
                <div class="jpdb-reader-local-title">JPDB</div>
                <div class="jpdb-reader-meanings">${meanings}</div>
            </div>
        `;
    }
    renderLocalDefinitionSource(dictionary, entries) {
      if (!entries.length) return "";
      return `
            <div class="jpdb-reader-local jpdb-reader-source-card" data-source="${escapeHtml$1(dictionary)}">
                <div class="jpdb-reader-local-title">${escapeHtml$1(this.dictionaryLabel(dictionary))}</div>
                ${entries.map((entry) => `
                    <div class="jpdb-reader-local-entry">
                        <div class="jpdb-reader-local-head">
                            <span>${escapeHtml$1(entry.expression)}</span>
                            ${entry.reading && entry.reading !== entry.expression ? `<span class="jpdb-reader-local-reading">${escapeHtml$1(entry.reading)}</span>` : ""}
                            <span class="jpdb-reader-local-dict">${escapeHtml$1(entry.dictionary)}</span>
                        </div>
                        <div class="jpdb-reader-local-glossary">
                            ${entry.glossary.slice(0, 4).map((item) => `<div>${glossaryToHtml(item)}</div>`).join("")}
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    }
    renderKanjiDefinitions(entries) {
      if (!entries.length) return "";
      return `
            <div class="jpdb-reader-local jpdb-reader-kanji">
                <div class="jpdb-reader-local-title">Kanji dictionaries</div>
                ${entries.map((entry) => `
                    <div class="jpdb-reader-local-entry">
                        <div class="jpdb-reader-local-head">
                            <span class="jpdb-reader-kanji-char">${escapeHtml$1(entry.character)}</span>
                            <span class="jpdb-reader-local-dict">${escapeHtml$1(this.dictionaryLabel(entry.dictionary))}</span>
                        </div>
                        <div class="jpdb-reader-kanji-readings">
                            ${entry.onyomi.length ? `<span>On ${escapeHtml$1(entry.onyomi.join("、"))}</span>` : ""}
                            ${entry.kunyomi.length ? `<span>Kun ${escapeHtml$1(entry.kunyomi.join("、"))}</span>` : ""}
                        </div>
                        <div class="jpdb-reader-local-glossary">
                            ${entry.meanings.slice(0, 6).map((meaning) => `<div>${escapeHtml$1(meaning)}</div>`).join("")}
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    }
    renderSimilarKanjiWords(entries, jpdbVocabulary, kanji, currentCard) {
      const words = mergeSimilarKanjiWords(entries, jpdbVocabulary, currentCard, (name) => this.dictionaryLabel(name));
      if (!words.length) return "";
      return `
            <div class="jpdb-reader-local jpdb-reader-similar">
                <div class="jpdb-reader-local-title">Words using ${escapeHtml$1(kanji)}</div>
                <div class="jpdb-reader-similar-grid">
                    ${words.map((entry) => `
                        <button class="jpdb-reader-similar-word" type="button" data-action="similar-word" data-expression="${escapeHtml$1(entry.expression)}" title="${escapeHtml$1(entry.source)}${entry.meaning ? `: ${escapeHtml$1(entry.meaning)}` : ""}">
                            <span>${escapeHtml$1(entry.expression)}</span>
                            ${entry.reading && entry.reading !== entry.expression ? `<small>${escapeHtml$1(entry.reading)}</small>` : ""}
                            ${entry.meaning ? `<small>${escapeHtml$1(entry.meaning)}</small>` : ""}
                            ${entry.frequency ? `<em>#${entry.frequency}</em>` : ""}
                        </button>
                    `).join("")}
                </div>
            </div>
        `;
    }
    renderTermMeta(entries) {
      const items = entries.map((entry) => this.renderMetaEntry(entry)).filter(Boolean).slice(0, 8);
      if (!items.length) return "";
      return `<div class="jpdb-reader-meta jpdb-reader-dict-meta">${items.join("")}</div>`;
    }
    renderMetaEntry(entry) {
      const label = this.dictionaryLabel(entry.dictionary);
      if (entry.mode === "freq") {
        const value = formatMetaFrequency(entry.data);
        return value ? `<span class="jpdb-reader-chip" title="${escapeHtml$1(label)}">${escapeHtml$1(label)} ${escapeHtml$1(value)}</span>` : "";
      }
      if (entry.mode === "pitch") {
        const value = formatMetaPitch(entry.data);
        return value ? `<span class="jpdb-reader-chip" title="${escapeHtml$1(label)}">pitch ${escapeHtml$1(value)}</span>` : "";
      }
      return "";
    }
    dictionaryLabel(name) {
      var _a;
      return ((_a = this.settings.dictionaryPreferences.find((item) => item.name === name)) == null ? void 0 : _a.alias) || name;
    }
    renderReviewButtons() {
      if (this.settings.twoButtonReviews) {
        return `
                <div class="jpdb-reader-row" style="--cols: 2">
                    <button class="jpdb-reader-btn fail" data-action="grade" data-grade="fail">FAIL</button>
                    <button class="jpdb-reader-btn pass" data-action="grade" data-grade="pass">PASS</button>
                </div>
            `;
      }
      return `
            <div class="jpdb-reader-row jpdb-reader-grades" style="--cols: 5">
                <button class="jpdb-reader-btn nothing" data-action="grade" data-grade="nothing">NOTHING</button>
                <button class="jpdb-reader-btn something" data-action="grade" data-grade="something">SOMETHING</button>
                <button class="jpdb-reader-btn hard" data-action="grade" data-grade="hard">HARD</button>
                <button class="jpdb-reader-btn okay" data-action="grade" data-grade="okay">OKAY</button>
                <button class="jpdb-reader-btn easy" data-action="grade" data-grade="easy">EASY</button>
            </div>
        `;
    }
    async handleCardAction(button2, card, sentence) {
      if (button2.disabled) return;
      button2.disabled = true;
      const action = button2.dataset.action;
      try {
        if (action === "audio") await this.playAudio(card);
        if (action === "add") {
          await this.jpdb.addToDeck(this.settings.miningDeck || "forq", card, sentence);
          if (this.settings.addToForq && this.settings.miningDeck !== "forq") await this.jpdb.addToDeck("forq", card, sentence);
          if (this.settings.ankiEnabled && this.settings.ankiMineWithJpdb) await this.addToAnki(card, sentence);
          this.toast(`${uiText(this.settings.interfaceLanguage, "add")} JPDB.`);
        }
        if (action === "anki") await this.addToAnki(card, sentence);
        if (action === "neverforget") await this.toggleDeck(card, "never-forget", this.settings.neverForgetDeck);
        if (action === "blacklist") await this.toggleDeck(card, "blacklisted", this.settings.blacklistDeck);
        if (action === "grade") {
          await this.jpdb.reviewCard(card, button2.dataset.grade);
          this.toast(this.settings.interfaceLanguage === "ja" ? "復習を送信しました。" : "Review sent.");
        }
        if (action !== "audio") await this.showCard(card, sentence, void 0, { autoPlay: false });
      } catch (error) {
        this.toast(error instanceof Error ? error.message : "Action failed.");
      } finally {
        button2.disabled = false;
      }
    }
    async addToAnki(card, sentence) {
      const [localEntries, kanjiEntries, metaEntries] = await Promise.all([
        this.settings.localDictionariesEnabled ? this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => []) : Promise.resolve([]),
        this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji ? this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => []) : Promise.resolve([]),
        this.settings.localDictionariesEnabled ? this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(() => []) : Promise.resolve([])
      ]);
      const imageDataUrl = this.settings.ankiCaptureScreenshot ? captureActiveVideoFrame() : void 0;
      await this.anki.addCard(card, sentence, {
        imageDataUrl,
        localEntries,
        kanjiEntries,
        metaEntries,
        dictionaryPreferences: this.settings.dictionaryPreferences,
        sourceTitle: document.title,
        sourceUrl: location.href
      });
      this.toast(imageDataUrl ? "Added to Anki with image." : "Added to Anki.");
    }
    async toggleDeck(card, state, deck) {
      if (card.cardState.includes(state)) {
        await this.jpdb.removeFromDeck(deck, card);
        this.toast("Removed from deck.");
      } else {
        await this.jpdb.addToDeck(deck, card);
        this.toast("Added to deck.");
      }
    }
    async playAudio(card) {
      try {
        await this.audio.play(card);
      } catch (error) {
        this.toast(error instanceof Error ? error.message : "Audio playback failed.");
      }
    }
    showSettings() {
      var _a, _b, _c, _d, _e, _f, _g;
      const form = document.createElement("form");
      form.className = "jpdb-reader-settings";
      form.dataset.jpdbReaderRoot = "true";
      form.setAttribute("role", "dialog");
      form.setAttribute("aria-modal", "true");
      form.setAttribute("aria-label", SETTINGS_TITLE);
      form.tabIndex = -1;
      setInnerHtml(form, `
            <div class="jpdb-reader-settings-head">
                <h2>${SETTINGS_TITLE}</h2>
            </div>
            <div class="jpdb-reader-settings-tabs" role="tablist" aria-label="Settings sections">
                ${settingsTabButton("basics", "Basics", true)}
                ${settingsTabButton("dictionaries", "Dictionaries")}
                ${settingsTabButton("media", "Media")}
                ${settingsTabButton("mining", "Mining")}
                ${settingsTabButton("shortcuts", "Shortcuts")}
                ${settingsTabButton("help", "Help")}
            </div>
            <div class="jpdb-reader-settings-scroll">
            <fieldset data-settings-panel="basics">
                <legend>JPDB</legend>
                ${input("apiKey", `API key <a href="${JPDB_SETTINGS_URL}" target="_blank" rel="noopener">JPDB settings</a>`, this.settings.apiKey, "password")}
                <div data-jpdb-decks>
                    ${renderDeckControls(this.settings, [], Boolean(this.settings.apiKey.trim()))}
                </div>
                ${checkbox("addToForq", "Also add mined cards to forq", this.settings.addToForq)}
                ${checkbox("enableReviews", "Enable review actions", this.settings.enableReviews)}
                <div data-review-config ${this.settings.enableReviews ? "" : "hidden"}>
                    ${select("twoButtonReviews", "Review rating scale", this.settings.twoButtonReviews ? "true" : "false", [["false", "Five point: NOTHING to EASY"], ["true", "Two point: FAIL / PASS"]])}
                </div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Interface</legend>
                <div class="grid">
                    ${select("interfaceLanguage", "Settings language", this.settings.interfaceLanguage, [["auto", "Automatic"], ["en", "English"], ["ja", "日本語"]])}
                    ${select("theme", "Theme", this.settings.theme, [["auto", "Auto"], ["dark", "Dark"], ["light", "Light"]])}
                    ${select("popupMode", "Popup mode", this.settings.popupMode, [["auto", "Auto"], ["sheet", "Bottom sheet"], ["popover", "Popover"]])}
                    ${input("accentColor", "Accent color", sanitizeAccentColor(this.settings.accentColor), "color")}
                </div>
                <div class="jpdb-reader-help">よむ can be used with JPDB first, imported dictionaries first, or local dictionaries only for definitions. Configure source order in Dictionaries.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Audio</legend>
                ${checkbox("audioEnabled", "Enable audio playback for terms", this.settings.audioEnabled)}
                ${checkbox("autoPlayAudio", "Auto-play search result audio", this.settings.autoPlayAudio)}
                ${checkbox("audioEnableDefaultSources", "Use built-in audio sources", this.settings.audioEnableDefaultSources)}
                <div class="grid">
                    ${select("audioSelectionMode", "When a source has several clips", this.settings.audioSelectionMode, [["first", "First audio"], ["random", "Random audio"]])}
                    ${checkbox("audioViaBlob", "Fetch as blob for iOS Tampermonkey", this.settings.audioViaBlob)}
                    ${input("audioTimeoutMs", "Audio timeout (ms)", String(this.settings.audioTimeoutMs), "number")}
                </div>
                <div class="jpdb-reader-audio-sources">
                    ${renderAudioSourceEditor(this.settings.audioSources)}
                </div>
                <div class="jpdb-reader-help">Supports {term}, {reading}, and {language}. See the <a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">Yomitan audio guide</a>.</div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Reader</legend>
                <div class="grid">
                    ${checkbox("parseSelection", "Lookup selected text", this.settings.parseSelection)}
                    ${checkbox("lookupOnClick", "Tap or click scanned words", this.settings.lookupOnClick)}
                    ${checkbox("lookupOnHover", "Hover scanned words", this.settings.lookupOnHover)}
                    ${checkbox("autoScanJapanese", "Auto-scan when Japanese is detected", this.settings.autoScanJapanese)}
                    ${checkbox("scanVisiblePage", "Scan visible page on load", this.settings.scanVisiblePage)}
                    ${checkbox("showFloatingButton", "Show floating puck on pages", this.settings.showFloatingButton)}
                    ${checkbox("showFurigana", "Enable furigana annotations", this.settings.showFurigana)}
                    ${checkbox("showPitchAccent", "Show pitch accent", this.settings.showPitchAccent)}
                    ${checkbox("hideKnownFurigana", "Hide furigana for known cards only", this.settings.hideKnownFurigana)}
                </div>
                <div class="jpdb-reader-help">Hover lookup uses the shortcut below. Leave it blank for plain hover; keep click enabled if you also want tap lookup.</div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Kanji</legend>
                <div class="grid">
                    ${checkbox("kanjivgEnabled", "Show stroke order and drawing pad", this.settings.kanjivgEnabled)}
                    ${checkbox("kanjiOriginsEnabled", "Show kanji facts and origins map", this.settings.kanjiOriginsEnabled)}
                    ${checkbox("rtkEnabled", "Show RTK information", this.settings.rtkEnabled)}
                    ${checkbox("similarKanjiWords", "Show words using the same kanji", this.settings.similarKanjiWords)}
                    ${input("similarKanjiWordLimit", "Similar word limit", String(this.settings.similarKanjiWordLimit), "number")}
                </div>
                <div class="jpdb-reader-help">Click a kanji inside the popup word to see RTK, local kanji dictionary meanings, component keywords, and related words.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Images</legend>
                <div class="grid">
                    ${checkbox("ocrEnabled", "Read text in images", this.settings.ocrEnabled)}
                    ${checkbox("ocrAutoScanImages", "Read images automatically", this.settings.ocrAutoScanImages)}
                    ${checkbox("ocrShowTextOverlay", "Show recognized text on images", this.settings.ocrShowTextOverlay)}
                    ${select("ocrProvider", "Image reading", this.settings.ocrProvider, [["google-lens", "Google Lens (recommended)"], ["local-service", "Local OCR app"], ["cloud-vision", "Google Cloud Vision"], ["off", "Off"]])}
                    ${select("ocrMaxImagesPerPage", "Images to read per page", String(this.settings.ocrMaxImagesPerPage), [["3", "Light"], ["8", "Normal"], ["16", "More"]])}
                    ${select("ocrMinImageArea", "Smallest image to read", String(this.settings.ocrMinImageArea), [["80000", "Large images only"], ["45000", "Normal"], ["15000", "Include small images"]])}
                    ${select("ocrMaxImagePixels", "Image detail", String(this.settings.ocrMaxImagePixels), [["640000", "Faster"], ["1200000", "Balanced"], ["2000000", "Sharper"]])}
                    ${input("ocrTextColor", "Image text color", this.settings.ocrTextColor, "color")}
                    ${input("ocrOutlineColor", "Image text outline", this.settings.ocrOutlineColor, "color")}
                    ${input("ocrBackgroundColor", "Image highlight background", this.settings.ocrBackgroundColor, "color")}
                    ${input("ocrBackgroundOpacity", "Image highlight opacity", String(this.settings.ocrBackgroundOpacity), "number")}
                    ${input("ocrFontScale", "Image text scale", String(this.settings.ocrFontScale), "number")}
                    <label data-local-ocr ${this.settings.ocrProvider === "local-service" ? "" : "hidden"}>Local OCR app URL<input name="ocrEndpointUrl" type="text" value="${escapeHtml$1(this.settings.ocrEndpointUrl)}" autocomplete="off"></label>
                    <div data-local-ocr ${this.settings.ocrProvider === "local-service" ? "" : "hidden"}>${select("ocrEngine", "Local OCR engine", this.settings.ocrEngine, [["auto", "Automatic"], ["MangaOCR", "MangaOCR"], ["PaddleOCR", "PaddleOCR"], ["AppleVision", "Apple Vision"]])}</div>
                    <label data-cloud-ocr ${this.settings.ocrProvider === "cloud-vision" ? "" : "hidden"}>Cloud Vision API key<input name="ocrCloudVisionApiKey" type="password" value="${escapeHtml$1(this.settings.ocrCloudVisionApiKey)}" autocomplete="off"></label>
                    <input type="hidden" name="ocrLanguage" value="${escapeHtml$1(this.settings.ocrLanguage)}">
                    <input type="hidden" name="ocrPrefetchMargin" value="${this.settings.ocrPrefetchMargin}">
                </div>
                <div class="jpdb-reader-help">Images are read quietly near the viewport. Google Lens handles normal images by default; embedded OCR metadata is instant. Recognized areas stay transparent until you tap or hover.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Video</legend>
                <div class="grid">
                    ${checkbox("subtitlePlayerEnabled", "Enable video subtitle player", this.settings.subtitlePlayerEnabled)}
                    ${checkbox("subtitleAutoDetect", "Auto-detect page subtitles", this.settings.subtitleAutoDetect)}
                    ${checkbox("subtitleOverlayVisible", "Show subtitle overlay", this.settings.subtitleOverlayVisible)}
                    ${checkbox("subtitleSecondaryVisible", "Show native subtitles when available", this.settings.subtitleSecondaryVisible)}
                    ${checkbox("subtitleMiningPause", "Pause video when mining subtitle", this.settings.subtitleMiningPause)}
                    ${select("subtitleControlsMode", "Subtitle controls", this.settings.subtitleControlsMode, [["auto", "Show when needed"], ["hidden", "Hide controls"], ["always", "Always visible"]])}
                    ${input("subtitleFontSize", "Subtitle font size", String(this.settings.subtitleFontSize), "number")}
                    ${input("subtitleBottomOffset", "Subtitle bottom offset (%)", String(this.settings.subtitleBottomOffset), "number")}
                    ${input("subtitleTextColor", "Subtitle color", this.settings.subtitleTextColor, "color")}
                    ${input("subtitleOutlineColor", "Subtitle outline", this.settings.subtitleOutlineColor, "color")}
                    ${input("subtitleBackgroundColor", "Subtitle background", this.settings.subtitleBackgroundColor, "color")}
                    ${input("subtitleBackgroundOpacity", "Subtitle background opacity", String(this.settings.subtitleBackgroundOpacity), "number")}
                    ${input("subtitleFontFamily", "Subtitle font family", this.settings.subtitleFontFamily)}
                    ${input("subtitleFontWeight", "Subtitle font weight", String(this.settings.subtitleFontWeight), "number")}
                    ${input("subtitleSeekPadding", "Subtitle seek padding (seconds)", String(this.settings.subtitleSeekPadding), "number")}
                </div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>YouTube</legend>
                <div class="grid">
                    ${checkbox("youtubeImmersionEnabled", "Only show Japanese-looking YouTube videos", this.settings.youtubeImmersionEnabled)}
                    ${checkbox("youtubeShowFilterNotice", "Show reveal control for hidden videos", this.settings.youtubeShowFilterNotice)}
                </div>
                <div class="jpdb-reader-help">Off by default. Turn it on when you want YouTube recommendations, search, and sidebars to stay focused on Japanese-looking video cards.</div>
            </fieldset>
            <fieldset data-settings-panel="mining" hidden>
                <legend>Anki</legend>
                <div class="grid">
                    ${checkbox("ankiEnabled", "Enable Anki mining", this.settings.ankiEnabled)}
                    ${checkbox("ankiMineWithJpdb", "Also add to Anki when adding to JPDB", this.settings.ankiMineWithJpdb)}
                    ${checkbox("ankiCaptureScreenshot", "Attach video screenshot when possible", this.settings.ankiCaptureScreenshot)}
                    ${input("ankiConnectUrl", "AnkiConnect URL", this.settings.ankiConnectUrl)}
                    ${input("ankiDeck", "Anki deck", this.settings.ankiDeck)}
                    ${input("ankiModel", "Anki note type", this.settings.ankiModel)}
                    ${input("ankiTags", "Tags", this.settings.ankiTags)}
                </div>
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="test-anki">Test Anki</button>
                </div>
                <div class="jpdb-reader-help" data-anki-status>Anki uses AnkiConnect on this Mac. The default creates a small Yomu note type automatically.</div>
            </fieldset>
            <fieldset data-settings-panel="dictionaries" hidden>
                <legend>Dictionaries</legend>
                <div class="grid">
                    ${checkbox("jpdbDefinitionsEnabled", "Show JPDB definitions", this.settings.jpdbDefinitionsEnabled)}
                    ${checkbox("localDictionariesEnabled", "Show imported dictionary definitions", this.settings.localDictionariesEnabled)}
                    ${checkbox("localDictionaryShowKanji", "Show kanji dictionary cards", this.settings.localDictionaryShowKanji)}
                    ${input("localDictionaryMaxResults", "Dictionary result limit", String(this.settings.localDictionaryMaxResults), "number")}
                </div>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status>Checking imported dictionaries...</div>
                <div class="jpdb-reader-dictionary-priorities">
                    ${renderDictionarySourceRows(this.settings)}
                </div>
                <div class="jpdb-reader-recommended-dictionaries" data-recommended-dictionaries>
                    ${renderRecommendedDictionaries([])}
                </div>
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-settings">Import settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-reader-settings">Export settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-dictionary">Import dictionaries</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-yomitan-dictionary">Export dictionaries</button>
                </div>
                <input hidden type="file" data-file="settings" accept="application/json,.json">
                <input hidden type="file" data-file="dictionary" accept="application/json,.json,.zip,application/zip">
                <div class="jpdb-reader-help" data-import-status>Import Yomitan settings exports, Yomitan dictionary ZIPs, or exported dictionary backups.</div>
            </fieldset>
            <fieldset data-settings-panel="shortcuts" hidden>
                <legend>Shortcuts</legend>
                <div class="grid">
                    ${shortcutInput("shortcuts.hoverLookup", "Hold while hovering", this.settings.shortcuts.hoverLookup, "Blank means hover without a key")}
                    ${shortcutInput("shortcuts.scanPage", "Scan page", this.settings.shortcuts.scanPage)}
                    ${shortcutInput("shortcuts.openSettings", "Open settings", this.settings.shortcuts.openSettings)}
                    ${shortcutInput("shortcuts.playAudio", "Play audio", this.settings.shortcuts.playAudio)}
                    ${shortcutInput("shortcuts.closePopup", "Close popup", this.settings.shortcuts.closePopup)}
                    ${shortcutInput("shortcuts.previousSubtitle", "Previous subtitle", this.settings.shortcuts.previousSubtitle)}
                    ${shortcutInput("shortcuts.nextSubtitle", "Next subtitle", this.settings.shortcuts.nextSubtitle)}
                    ${shortcutInput("shortcuts.copySubtitle", "Copy subtitle", this.settings.shortcuts.copySubtitle)}
                    ${shortcutInput("shortcuts.toggleOcr", "Toggle image reading", this.settings.shortcuts.toggleOcr)}
                    ${shortcutInput("shortcuts.toggleYoutubeImmersion", "Toggle YouTube filter", this.settings.shortcuts.toggleYoutubeImmersion)}
                    ${shortcutInput("shortcuts.scanImages", "Read images now", this.settings.shortcuts.scanImages)}
                    ${renderReviewShortcutInputs(this.settings)}
                </div>
            </fieldset>
            <fieldset data-settings-panel="help" hidden>
                <legend>Support</legend>
                ${renderSupportPanel()}
            </fieldset>
            </div>
            <div class="footer">
                <button class="jpdb-reader-btn" type="button" data-action="cancel">Cancel</button>
                <button class="jpdb-reader-btn add" type="submit">Save</button>
            </div>
        `);
      localizeSettingsForm(form, this.settings.interfaceLanguage);
      const backdrop = this.createBackdrop();
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        this.settings = readFormSettings(data, this.settings);
        void saveSettings(this.settings).then(() => {
          this.jpdb.clear();
          this.applyTheme();
          this.installFab();
          this.subtitles.refresh();
          this.ocr.refresh();
          this.youtube.refresh();
          this.scheduleAutoScan(100);
          this.settingsPreviewOriginalAccent = void 0;
          this.settingsPreviewOriginalLanguage = void 0;
          this.dismiss();
          this.toast("Settings saved.");
        });
      });
      (_a = form.querySelector('[data-action="cancel"]')) == null ? void 0 : _a.addEventListener("click", () => this.dismiss());
      (_b = form.querySelector('input[name="accentColor"]')) == null ? void 0 : _b.addEventListener("input", (event) => {
        this.applyAccentColor(event.currentTarget.value);
      });
      (_c = form.querySelector('select[name="interfaceLanguage"]')) == null ? void 0 : _c.addEventListener("change", (event) => {
        const value = event.currentTarget.value;
        if (value === "auto" || value === "en" || value === "ja") {
          this.settings.interfaceLanguage = value;
          localizeSettingsForm(form, value);
          this.installFab();
        }
      });
      (_d = form.querySelector('select[name="ocrProvider"]')) == null ? void 0 : _d.addEventListener("change", (event) => {
        const value = event.currentTarget.value;
        form.querySelectorAll("[data-local-ocr]").forEach((node) => {
          node.hidden = value !== "local-service";
        });
        form.querySelectorAll("[data-cloud-ocr]").forEach((node) => {
          node.hidden = value !== "cloud-vision";
        });
      });
      (_e = form.querySelector('input[name="enableReviews"]')) == null ? void 0 : _e.addEventListener("change", () => syncReviewSettingsVisibility(form));
      (_f = form.querySelector('select[name="twoButtonReviews"]')) == null ? void 0 : _f.addEventListener("change", () => syncReviewSettingsVisibility(form));
      (_g = form.querySelector('input[name="apiKey"]')) == null ? void 0 : _g.addEventListener("change", () => void this.refreshDeckControls(form));
      form.addEventListener("change", (event) => {
        const sourceSelect = event.target.closest('select[name^="audioSources."][name$=".type"]');
        if (sourceSelect) syncAudioSourceRow(sourceSelect.closest("[data-audio-source-row]"), sourceSelect.value);
      });
      installShortcutCapture(form);
      installDictionarySourceDrag(form);
      form.addEventListener("click", (event) => {
        const control = event.target.closest("[data-action]");
        const action = control == null ? void 0 : control.dataset.action;
        if (!action || action === "cancel") return;
        event.preventDefault();
        event.stopPropagation();
        void this.handleSettingsAction(form, action, control);
      });
      this.dismiss();
      this.settingsPreviewOriginalAccent = this.settings.accentColor;
      this.settingsPreviewOriginalLanguage = this.settings.interfaceLanguage;
      document.body.append(backdrop, form);
      this.activeBackdrop = backdrop;
      this.activePopover = form;
      form.focus();
      void this.refreshDictionaryStatus(form);
      void this.refreshDeckControls(form);
    }
    async refreshDeckControls(form) {
      var _a;
      const container = form.querySelector("[data-jpdb-decks]");
      if (!container) return;
      const apiKey = ((_a = form.querySelector('input[name="apiKey"]')) == null ? void 0 : _a.value.trim()) ?? this.settings.apiKey.trim();
      if (!apiKey) {
        setInnerHtml(container, renderDeckControls(this.settings, [], false));
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        return;
      }
      const originalKey = this.settings.apiKey;
      this.settings.apiKey = apiKey;
      try {
        const decks = await this.jpdb.listDecks();
        setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), decks, true));
      } catch {
        setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), [], true));
      } finally {
        this.settings.apiKey = originalKey;
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
      }
    }
    async refreshDictionaryStatus(form) {
      const status = form.querySelector("[data-dictionary-status]");
      const priorities = form.querySelector(".jpdb-reader-dictionary-priorities");
      const recommended = form.querySelector("[data-recommended-dictionaries]");
      try {
        const summary = await this.dictionaries.summary();
        const names = summary.dictionaries.map((item) => item.title);
        const merged = mergeDictionaryPreferences(this.settings.dictionaryPreferences, names);
        if (merged.length !== this.settings.dictionaryPreferences.length) {
          this.settings.dictionaryPreferences = merged;
          await saveSettings(this.settings);
        }
        if (status) {
          status.textContent = summary.dictionaries.length ? `${summary.dictionaries.length} dictionaries, ${summary.terms.toLocaleString()} terms, ${summary.kanji.toLocaleString()} kanji, ${summary.termMeta.toLocaleString()} metadata rows.` : "No local dictionaries imported yet.";
        }
        if (priorities) setInnerHtml(priorities, renderDictionarySourceRows(this.settings));
        if (recommended) setInnerHtml(recommended, renderRecommendedDictionaries(summary.dictionaries));
        localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message : "Dictionary status unavailable.";
      }
    }
    async handleSettingsAction(form, action, control) {
      const status = form.querySelector("[data-import-status]");
      const setStatus = (message) => {
        if (status) status.textContent = message;
      };
      try {
        if (action === "settings-panel") {
          activateSettingsPanel(form, (control == null ? void 0 : control.dataset.panel) ?? "basics");
          return;
        }
        if (action === "dictionary-source-up" || action === "dictionary-source-down") {
          updateDictionarySourceEditor(form, action, control);
          return;
        }
        if (action === "audio-source-add" || action === "audio-source-remove" || action === "audio-source-up" || action === "audio-source-down") {
          updateAudioSourceEditor(form, action, control);
          localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
          return;
        }
        if (action === "refresh-dictionaries") {
          setStatus("Refreshing installed dictionaries...");
          await this.refreshDictionaryStatus(form);
          setStatus("Dictionary list refreshed.");
          return;
        }
        if (action === "download-starter-dictionaries") {
          const summary = await this.dictionaries.summary();
          const missing = RECOMMENDED_JAPANESE_DICTIONARIES.filter((dictionary) => !isRecommendedDictionaryInstalled(dictionary, summary.dictionaries));
          if (!missing.length) {
            setStatus("Recommended dictionaries are already installed.");
            await this.refreshDictionaryStatus(form);
            return;
          }
          control == null ? void 0 : control.setAttribute("disabled", "true");
          let importedEntries = 0;
          for (const [index, dictionary] of missing.entries()) {
            setStatus(`Downloading ${index + 1}/${missing.length}: ${dictionary.name}...`);
            const imported = await this.dictionaries.importFromUrl(dictionary.downloadUrl, recommendedDictionaryFilename(dictionary), (message) => setStatus(`${index + 1}/${missing.length} ${message}`));
            importedEntries += imported.entries;
            this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, imported.dictionaries);
            await saveSettings(this.settings);
          }
          setStatus(`Downloaded ${missing.length} dictionaries: ${importedEntries.toLocaleString()} records imported.`);
          await this.refreshDictionaryStatus(form);
          return;
        }
        if (action === "import-yomitan-settings") {
          const file = await pickFile(form, "settings");
          if (!file) return;
          const json = JSON.parse(await file.text());
          const readerSettings = getReaderSettingsExport(json);
          if (readerSettings) {
            this.settings = { ...this.settings, ...readerSettings, shortcuts: { ...this.settings.shortcuts, ...readerSettings.shortcuts } };
          } else {
            const imported = parseYomitanSettingsExport(json);
            this.settings = {
              ...this.settings,
              ...imported.settings,
              shortcuts: {
                ...this.settings.shortcuts,
                ...imported.settings.shortcuts ?? {}
              }
            };
          }
          const importedNames = (await this.dictionaries.summary().catch(() => ({ dictionaries: [] }))).dictionaries.map((item) => item.title);
          this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, importedNames);
          await saveSettings(this.settings);
          setStatus("Settings imported.");
          this.applyTheme();
          this.installFab();
          this.subtitles.refresh();
          this.youtube.refresh();
          this.settingsPreviewOriginalAccent = void 0;
          this.showSettings();
          return;
        }
        if (action === "export-reader-settings") {
          downloadBlob(new Blob([JSON.stringify({
            formatName: "yomu-reader-settings",
            formatVersion: 1,
            exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
            settings: this.settings
          }, null, 2)], { type: "application/json" }), `yomu-settings-${dateStamp()}.json`);
          setStatus("Settings exported.");
          return;
        }
        if (action === "import-yomitan-dictionary") {
          const file = await pickFile(form, "dictionary");
          if (!file) return;
          const summary = await this.dictionaries.importFile(file, (message) => setStatus(message));
          this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries);
          await saveSettings(this.settings);
          setStatus(`Imported ${summary.entries.toLocaleString()} records from ${summary.dictionaries.length} dictionary source${summary.dictionaries.length === 1 ? "" : "s"}.`);
          this.showSettings();
          return;
        }
        if (action === "download-recommended-dictionary") {
          const dictionaryId = control == null ? void 0 : control.dataset.dictionaryId;
          const dictionary = dictionaryId ? findRecommendedDictionary(dictionaryId) : void 0;
          if (!dictionary) throw new Error("Recommended dictionary not found.");
          control == null ? void 0 : control.setAttribute("disabled", "true");
          setStatus(`${(control == null ? void 0 : control.dataset.installed) === "true" ? "Updating" : "Downloading"} ${dictionary.name}...`);
          const summary = await this.dictionaries.importFromUrl(dictionary.downloadUrl, recommendedDictionaryFilename(dictionary), (message) => setStatus(message));
          this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries);
          await saveSettings(this.settings);
          setStatus(`${dictionary.name}: ${summary.entries.toLocaleString()} records imported.`);
          await this.refreshDictionaryStatus(form);
          return;
        }
        if (action === "test-anki") {
          const ankiStatus = form.querySelector("[data-anki-status]");
          const previous = this.settings;
          this.settings = readFormSettings(new FormData(form), this.settings);
          try {
            const connected = await this.anki.isConnected();
            if (!connected) throw new Error("AnkiConnect is not reachable. Open Anki and confirm the AnkiConnect add-on is enabled.");
            await this.anki.ensureDeckAndModel();
            if (ankiStatus) ankiStatus.textContent = `Connected. Deck "${this.settings.ankiDeck}" and note type "${this.settings.ankiModel}" are ready.`;
          } finally {
            this.settings = previous;
          }
          return;
        }
        if (action === "copy-discord") {
          await copyText(SUPPORT_LINKS.discordUsername);
          this.toast(`Copied Discord username: ${SUPPORT_LINKS.discordUsername}`);
          return;
        }
        if (action === "export-yomitan-dictionary") {
          const blob = await this.dictionaries.exportJson();
          downloadBlob(blob, `yomu-dictionaries-${dateStamp()}.json`);
          setStatus("Dictionaries exported.");
        }
      } catch (error) {
        if (action === "download-recommended-dictionary" || action === "download-starter-dictionaries") control == null ? void 0 : control.removeAttribute("disabled");
        setStatus(error instanceof Error ? error.message : "Import failed.");
      }
    }
    createPopover() {
      const popover = document.createElement("div");
      popover.className = "jpdb-reader-popover";
      popover.dataset.jpdbReaderRoot = "true";
      popover.setAttribute("role", "dialog");
      popover.setAttribute("aria-modal", "true");
      popover.tabIndex = -1;
      if (this.shouldUseSheet()) popover.classList.add("jpdb-reader-sheet");
      return popover;
    }
    mountPopover(popover, anchor) {
      const backdrop = this.createBackdrop();
      this.dismiss();
      document.body.append(backdrop, popover);
      this.activeBackdrop = backdrop;
      this.activePopover = popover;
      if (!popover.classList.contains("jpdb-reader-sheet")) {
        positionPopover(popover, anchor);
      } else {
        this.installSheetHandle(popover);
      }
      popover.focus();
    }
    installSheetHandle(popover) {
      const handle = popover.querySelector(".jpdb-reader-sheet-handle");
      if (!handle) return;
      handle.setAttribute("role", "button");
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("aria-label", "Drag to close, or tap to expand");
      handle.setAttribute("aria-expanded", String(popover.classList.contains("jpdb-reader-sheet-expanded")));
      let startY = 0;
      let lastY = 0;
      let pointerId = 0;
      let dragging = false;
      let moved = false;
      const reset = () => {
        popover.style.transition = "transform .16s ease";
        popover.style.transform = "";
        window.setTimeout(() => {
          popover.style.transition = "";
        }, 180);
      };
      const toggleExpanded = () => {
        const expanded = !popover.classList.contains("jpdb-reader-sheet-expanded");
        popover.classList.toggle("jpdb-reader-sheet-expanded", expanded);
        handle.setAttribute("aria-expanded", String(expanded));
      };
      const finish = () => {
        var _a;
        (_a = handle.releasePointerCapture) == null ? void 0 : _a.call(handle, pointerId);
        if (!dragging) return;
        const delta = Math.max(0, lastY - startY);
        dragging = false;
        if (delta > 90) this.dismiss();
        else reset();
      };
      handle.addEventListener("click", (event) => {
        event.preventDefault();
        if (moved) {
          moved = false;
          return;
        }
        toggleExpanded();
      });
      handle.addEventListener("pointerdown", (event) => {
        var _a;
        startY = event.clientY;
        lastY = event.clientY;
        pointerId = event.pointerId;
        dragging = true;
        moved = false;
        popover.style.transition = "";
        (_a = handle.setPointerCapture) == null ? void 0 : _a.call(handle, event.pointerId);
      });
      handle.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        lastY = event.clientY;
        const delta = Math.max(0, lastY - startY);
        if (delta > 8) moved = true;
        popover.style.transform = `translateY(${delta}px)`;
      });
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", () => {
        var _a;
        dragging = false;
        moved = false;
        (_a = handle.releasePointerCapture) == null ? void 0 : _a.call(handle, pointerId);
        reset();
      });
      handle.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleExpanded();
        }
        if (event.key === "Escape") this.dismiss();
      });
    }
    createBackdrop() {
      const backdrop = document.createElement("div");
      backdrop.className = "jpdb-reader-backdrop";
      backdrop.dataset.jpdbReaderRoot = "true";
      backdrop.addEventListener("click", () => this.dismiss());
      return backdrop;
    }
    shouldUseSheet() {
      if (this.settings.popupMode === "sheet") return true;
      if (this.settings.popupMode === "popover") return false;
      return window.innerWidth <= 768 || matchMedia("(pointer: coarse)").matches;
    }
    dismiss() {
      var _a, _b, _c, _d;
      this.cardRenderRequest++;
      if (this.settingsPreviewOriginalAccent !== void 0 && ((_a = this.activePopover) == null ? void 0 : _a.classList.contains("jpdb-reader-settings"))) {
        this.applyAccentColor(this.settingsPreviewOriginalAccent);
      }
      if (this.settingsPreviewOriginalLanguage !== void 0 && ((_b = this.activePopover) == null ? void 0 : _b.classList.contains("jpdb-reader-settings"))) {
        this.settings.interfaceLanguage = this.settingsPreviewOriginalLanguage;
      }
      this.settingsPreviewOriginalAccent = void 0;
      this.settingsPreviewOriginalLanguage = void 0;
      (_c = this.activePopover) == null ? void 0 : _c.remove();
      (_d = this.activeBackdrop) == null ? void 0 : _d.remove();
      document.querySelectorAll("[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop").forEach((element2) => element2.remove());
      this.activePopover = void 0;
      this.activeBackdrop = void 0;
    }
    toast(message) {
      const toast = document.createElement("div");
      toast.className = "jpdb-reader-toast";
      toast.dataset.jpdbReaderRoot = "true";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.textContent = message;
      document.body.appendChild(toast);
      window.setTimeout(() => toast.remove(), 3200);
    }
  }
  function pauseActiveVideo() {
    var _a;
    const videos = Array.from(document.querySelectorAll("video"));
    const playable = videos.filter((video) => video.readyState > 0).sort((a, b) => {
      const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
      const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
      return Number(a.paused) - Number(b.paused) || bArea - aArea;
    });
    (_a = playable[0]) == null ? void 0 : _a.pause();
  }
  function isEditableTarget(target) {
    const element2 = target instanceof Element ? target : null;
    return Boolean(element2 == null ? void 0 : element2.closest('input, textarea, select, [contenteditable="true"]'));
  }
  async function copyText(text) {
    var _a;
    if ((_a = navigator.clipboard) == null ? void 0 : _a.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  function normalizePressedKey(key) {
    if (key === " ") return "space";
    return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  }
  function mutationTouchesAsbPlayer(mutation) {
    const nodes = [
      mutation.target,
      ...Array.from(mutation.addedNodes)
    ];
    return nodes.some((node) => {
      var _a;
      const element2 = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return Boolean((_a = element2 == null ? void 0 : element2.closest) == null ? void 0 : _a.call(element2, ".asbplayer-offscreen, .asbplayer-subtitles-container-bottom"));
    });
  }
  function mutationInsideReaderRoot(mutation) {
    const nodes = [
      mutation.target,
      ...Array.from(mutation.addedNodes),
      ...Array.from(mutation.removedNodes)
    ];
    return nodes.every((node) => {
      var _a;
      const element2 = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return Boolean((_a = element2 == null ? void 0 : element2.closest) == null ? void 0 : _a.call(element2, "[data-jpdb-reader-root]"));
    });
  }
  function pickTokenForSelection(tokens = [], selected) {
    const exact = tokens.find((token) => token.card.spelling === selected || token.card.reading === selected);
    if (exact) return exact;
    return tokens.find((token) => selected.includes(token.card.spelling) || token.card.spelling.includes(selected));
  }
  function formatMetaFrequency(value) {
    if (typeof value === "number" || typeof value === "string") return `#${value}`;
    if (!value || typeof value !== "object") return "";
    const record = value;
    const display = record.displayValue ?? record.frequency ?? record.value;
    if (display == null) return "";
    return `#${String(display)}`;
  }
  function formatMetaPitch(value) {
    if (!value || typeof value !== "object") return "";
    const record = value;
    const positions = Array.isArray(record.pitches) ? record.pitches : Array.isArray(record.positions) ? record.positions : [];
    if (positions.length) return positions.slice(0, 4).map(String).join(", ");
    if (typeof record.position === "number") return String(record.position);
    return "";
  }
  function renderSpellingForKanjiNavigation(spelling) {
    return Array.from(spelling).map(
      (character) => isKanjiCharacter(character) ? `<button class="jpdb-reader-kanji-inline" type="button" data-action="kanji" data-kanji="${escapeHtml$1(character)}" title="Show kanji information for ${escapeHtml$1(character)}">${escapeHtml$1(character)}</button>` : `<span>${escapeHtml$1(character)}</span>`
    ).join("");
  }
  function groupTermEntriesByDictionary(entries) {
    const grouped = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const group = grouped.get(entry.dictionary) ?? [];
      group.push(entry);
      grouped.set(entry.dictionary, group);
    }
    return grouped;
  }
  function mergeSimilarKanjiWords(localEntries, jpdbVocabulary, currentCard, dictionaryLabel2) {
    const currentKeys = /* @__PURE__ */ new Set([`${currentCard.spelling}
${currentCard.reading}`, `${currentCard.spelling}
`]);
    const words = /* @__PURE__ */ new Map();
    const add = (entry) => {
      const key = `${entry.expression}
${entry.reading}`;
      if (currentKeys.has(key) || entry.expression === currentCard.spelling) return;
      const existing = words.get(key);
      if (existing) {
        existing.meaning || (existing.meaning = entry.meaning);
        existing.frequency ?? (existing.frequency = entry.frequency);
        if (!existing.source.includes(entry.source)) existing.source = `${existing.source} · ${entry.source}`;
        return;
      }
      words.set(key, entry);
    };
    jpdbVocabulary.forEach((entry) => add({
      expression: entry.expression,
      reading: entry.reading,
      meaning: entry.meaning,
      source: "JPDB used-in word"
    }));
    localEntries.forEach((entry) => add({
      expression: entry.expression,
      reading: entry.reading,
      meaning: entry.glossary.map(glossaryToText).filter(Boolean).join("; ").slice(0, 140),
      frequency: entry.jpdbFrequency,
      source: dictionaryLabel2(entry.dictionary)
    }));
    return Array.from(words.values()).sort(
      (a, b) => compareOptionalNumber(a.frequency, b.frequency) || a.expression.length - b.expression.length || a.expression.localeCompare(b.expression)
    );
  }
  function renderKanjiKeywordLine(jpdbInfo, rtkInfo, entries) {
    const keywords = /* @__PURE__ */ new Map();
    const addKeyword = (text, source) => {
      const normalized = text == null ? void 0 : text.trim();
      if (!normalized) return;
      const key = normalized.toLocaleLowerCase();
      const existing = keywords.get(key) ?? { text: normalized, sources: [] };
      if (!existing.sources.includes(source)) existing.sources.push(source);
      keywords.set(key, existing);
    };
    addKeyword(jpdbInfo == null ? void 0 : jpdbInfo.keyword, "JPDB");
    addKeyword(rtkInfo == null ? void 0 : rtkInfo.keyword, "RTK");
    entries.flatMap((entry) => entry.meanings).filter(Boolean).forEach((keyword) => addKeyword(keyword, "local dictionary"));
    const chips = Array.from(keywords.values()).slice(0, 8).map((keyword) => `<span class="jpdb-reader-kanji-keyword" title="${escapeHtml$1(keyword.sources.join(" · "))}">${escapeHtml$1(keyword.text)}</span>`).join("");
    return chips ? `<div class="jpdb-reader-kanji-keywords">${chips}</div>` : '<div class="jpdb-reader-help">Kanji details are not available yet.</div>';
  }
  function splitRtkElements(value) {
    return [...new Set(value.split(/[、,;＋+]/).map((item) => item.trim()).filter(Boolean))].slice(0, 16);
  }
  function compareOptionalNumber(a, b) {
    if (a === void 0 && b === void 0) return 0;
    if (a === void 0) return 1;
    if (b === void 0) return -1;
    return a - b;
  }
  function renderKanjiPractice(info, kanji) {
    const ghost = (info == null ? void 0 : info.svg) || `<div class="jpdb-reader-doodle-text-ghost">${escapeHtml$1(kanji)}</div>`;
    return `
        <div class="jpdb-reader-local jpdb-reader-kanjivg">
            <div class="jpdb-reader-local-title">Stroke order + practice</div>
            <div class="jpdb-reader-doodle-stage" data-kanji="${escapeHtml$1(kanji)}">
                <div class="jpdb-reader-doodle-ghost" aria-hidden="true">${ghost}</div>
                <canvas class="jpdb-reader-doodle-canvas" aria-label="Practice drawing ${escapeHtml$1(kanji)}"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <span class="jpdb-reader-help">${info ? `${info.strokeCount} strokes` : "text trace"}</span>
                <button class="jpdb-reader-mini-btn" type="button" data-doodle-trace>Hide trace</button>
                <button class="jpdb-reader-mini-btn" type="button" data-doodle-clear>Clear</button>
            </div>
        </div>
    `;
  }
  function renderKanjiOrigins(facts, graph) {
    if (!facts.length && (!graph || graph.nodes.length <= 1)) return "";
    const graphNodes = (graph == null ? void 0 : graph.nodes) ?? [];
    const edges = (graph == null ? void 0 : graph.edges) ?? [];
    return `
        <div class="jpdb-reader-local jpdb-reader-origins">
            <div class="jpdb-reader-local-title">Study facts and origins</div>
            ${facts.length ? `<div class="jpdb-reader-kanji-facts">
                ${facts.map((fact) => `<span title="${escapeHtml$1(fact.source)}"><strong>${escapeHtml$1(fact.label)}</strong>${escapeHtml$1(fact.value)}</span>`).join("")}
            </div>` : ""}
            ${graphNodes.length > 1 ? `<div class="jpdb-reader-origin-map" aria-label="2D kanji origin and component map">
                ${graphNodes.map((node, index) => `
                    <div class="jpdb-reader-origin-node ${node.kind}" style="--origin-index:${index}" title="${escapeHtml$1(node.detail)}">
                        <strong>${escapeHtml$1(node.label)}</strong>
                        ${node.detail ? `<small>${escapeHtml$1(node.detail)}</small>` : ""}
                    </div>
                `).join("")}
                ${edges.length ? `<div class="jpdb-reader-origin-edges">
                    ${edges.map((edge) => `<span>${escapeHtml$1(edge.from.replace(/^rtk:\d+:/, ""))} → ${escapeHtml$1(edge.to)} <small>${escapeHtml$1(edge.label)}</small></span>`).join("")}
                </div>` : ""}
            </div>` : ""}
        </div>
    `;
  }
  function renderSupportPanel() {
    return `
        <div class="jpdb-reader-support-card">
            <div>
                <div class="jpdb-reader-support-title">Free Japanese reading and mining tools</div>
                <p>よむ brings popup lookup, JPDB mining, imported dictionaries, subtitles, image reading, and Anki export into one free userscript. Comparable study suites such as <a href="${SUPPORT_LINKS.migakuPricing}" target="_blank" rel="noopener">Migaku</a> currently advertise paid plans from $10/month; よむ offers the same core reading-and-mining workflow for free.</p>
                <p>Donations are optional. They help cover the time, testing devices, services, and maintenance that keep the reader polished.</p>
            </div>
            <div class="jpdb-reader-support-actions">
                <a class="jpdb-reader-btn add" href="${SUPPORT_LINKS.paypal}" target="_blank" rel="noopener" data-support-link="paypal">Donate</a>
                <a class="jpdb-reader-btn" href="${SUPPORT_LINKS.issues}" target="_blank" rel="noopener" data-support-link="issues">Report issue</a>
                <a class="jpdb-reader-btn" href="${SUPPORT_LINKS.github}" target="_blank" rel="noopener" data-support-link="github">GitHub</a>
                <button class="jpdb-reader-btn" type="button" data-action="copy-discord" data-support-link="discord">Copy Discord</button>
            </div>
            <div class="jpdb-reader-help">Discord: ${SUPPORT_LINKS.discordUsername}</div>
        </div>
    `;
  }
  function renderJpdbKanjiInfo(info) {
    if (!info) return "";
    const infoChips = [
      info.type,
      info.kanken ? `Kanken ${info.kanken.replace(/^Level\s*/i, "")}` : "",
      info.oldForms.length ? `Old ${info.oldForms.join("、")}` : ""
    ].filter(Boolean).map((item) => `<span class="jpdb-reader-chip">${escapeHtml$1(item)}</span>`).join("");
    return `
        <div class="jpdb-reader-local jpdb-reader-jpdb-kanji">
            <div class="jpdb-reader-local-title">Readings and components</div>
            <div class="jpdb-reader-local-entry">
                ${infoChips ? `<div class="jpdb-reader-kanji-keywords">${infoChips}</div>` : ""}
                ${info.readings.length ? `<div class="jpdb-reader-kanji-readings">
                    ${info.readings.slice(0, 8).map((reading) => `<span>${escapeHtml$1(reading.reading)}${reading.share ? ` ${escapeHtml$1(reading.share)}` : ""}</span>`).join("")}
                </div>` : ""}
                ${info.components.length ? `<div class="jpdb-reader-component-grid">
                    ${info.components.map((component) => `<button class="jpdb-reader-component-card" type="button" data-action="kanji" data-kanji="${escapeHtml$1(component.kanji)}" title="Show ${escapeHtml$1(component.kanji)}">
                        <strong>${escapeHtml$1(component.kanji)}</strong>
                        <span>${escapeHtml$1(component.keyword)}</span>
                    </button>`).join("")}
                </div>` : ""}
                ${info.mnemonic ? `<details><summary>JPDB mnemonic</summary><p>${escapeHtml$1(info.mnemonic)}</p></details>` : ""}
            </div>
        </div>
    `;
  }
  function renderRtkInfo(info, components2) {
    if (!info) return "";
    const elementKeywords = splitRtkElements(info.elements);
    const componentByKeyword = new Map(
      components2.filter((component) => {
        var _a;
        return (_a = component.rtk) == null ? void 0 : _a.keyword;
      }).map((component) => {
        var _a;
        return [(_a = component.rtk) == null ? void 0 : _a.keyword.toLowerCase(), component.kanji];
      })
    );
    return `
        <div class="jpdb-reader-local jpdb-reader-rtk">
            <div class="jpdb-reader-local-title">RTK</div>
            <div class="jpdb-reader-local-entry">
                <div class="jpdb-reader-rtk-head">
                    <strong>${escapeHtml$1(info.keyword)}</strong>
                    ${info.frameNumber ? `<span>${escapeHtml$1(info.frameNumber)}</span>` : ""}
                </div>
                ${info.onYomi || info.kunYomi ? `<div class="jpdb-reader-kanji-readings">
                    ${info.onYomi ? `<span>On ${escapeHtml$1(info.onYomi)}</span>` : ""}
                    ${info.kunYomi ? `<span>Kun ${escapeHtml$1(info.kunYomi)}</span>` : ""}
                </div>` : ""}
                ${elementKeywords.length ? `<div class="jpdb-reader-rtk-elements" aria-label="RTK component keywords">
                    ${elementKeywords.map((keyword) => {
    const componentKanji = componentByKeyword.get(keyword.toLowerCase());
    return componentKanji ? `<button type="button" data-action="kanji" data-kanji="${escapeHtml$1(componentKanji)}" title="Show ${escapeHtml$1(componentKanji)}">${escapeHtml$1(keyword)}</button>` : `<span>${escapeHtml$1(keyword)}</span>`;
  }).join("")}
                </div>` : ""}
                ${components2.length ? `<div class="jpdb-reader-component-grid">
                    ${components2.map((component) => {
    var _a;
    const meanings = [...new Set(component.dictionary.flatMap((entry) => entry.meanings))].slice(0, 6);
    return `<button class="jpdb-reader-component-card" type="button" data-action="kanji" data-kanji="${escapeHtml$1(component.kanji)}" title="Show ${escapeHtml$1(component.kanji)}">
                            <strong>${escapeHtml$1(component.kanji)}</strong>
                            ${((_a = component.rtk) == null ? void 0 : _a.keyword) ? `<span>${escapeHtml$1(component.rtk.keyword)}</span>` : ""}
                            ${meanings.length ? `<small>${escapeHtml$1(meanings.join(", "))}</small>` : ""}
                        </button>`;
  }).join("")}
                </div>` : ""}
                ${info.heisigStory ? `<details><summary>Heisig story</summary><p>${escapeHtml$1(info.heisigStory)}</p></details>` : ""}
                ${info.heisigComment ? `<details><summary>Heisig comment</summary><p>${escapeHtml$1(info.heisigComment)}</p></details>` : ""}
                ${info.koohiiStories.length ? `<details><summary>Koohii stories</summary>${info.koohiiStories.map((story) => `<p>${escapeHtml$1(story)}</p>`).join("")}</details>` : ""}
            </div>
        </div>
    `;
  }
  function renderPitch(card) {
    const [pitch] = card.pitchAccent;
    if (!pitch) return "";
    const morae = splitMorae(card.reading);
    const highs = Array.from(pitch).filter((ch) => ch === "H" || ch === "L").slice(0, morae.length);
    if (highs.length < 2) return "";
    const width = morae.length * 24 + 18;
    const points = highs.map((level, index) => `${9 + index * 24},${level === "H" ? 10 : 29}`).join(" ");
    const cls = getPitchClassName(pitch);
    return `<div class="jpdb-reader-pitch"><svg width="${width}" height="46" viewBox="0 0 ${width} 46" aria-hidden="true">
        <polyline class="${cls}" points="${points}"></polyline>
        ${highs.map((level, index) => `<circle cx="${9 + index * 24}" cy="${level === "H" ? 10 : 29}" r="3"></circle>`).join("")}
        ${morae.map((mora, index) => `<text x="${9 + index * 24}" y="44" text-anchor="middle">${escapeHtml$1(mora)}</text>`).join("")}
    </svg></div>`;
  }
  function externalLinkIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 17 17 7"></path>
        <path d="M9 7h8v8"></path>
    </svg>`;
  }
  function speakerIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M11 5 6.8 8.4H4.5v7.2h2.3L11 19V5Z"></path>
        <path d="M15.2 8.2a5 5 0 0 1 0 7.6"></path>
        <path d="M17.8 5.7a8.4 8.4 0 0 1 0 12.6"></path>
    </svg>`;
  }
  function uniqueKanji(value) {
    return [...new Set(Array.from(value).filter(isKanjiCharacter))];
  }
  function isKanjiCharacter(value) {
    const code = value.codePointAt(0) ?? 0;
    return code >= 13312 && code <= 40959;
  }
  function splitMorae(reading) {
    const small = new Set("ゃゅょャュョァィゥェォ");
    const morae = [];
    for (const char of Array.from(reading)) {
      if (morae.length && small.has(char)) morae[morae.length - 1] += char;
      else morae.push(char);
    }
    return morae;
  }
  function getPitchClassName(pitch) {
    const drops = (pitch.match(/HL/g) ?? []).length;
    const rises = (pitch.match(/LH/g) ?? []).length;
    if (pitch.startsWith("H") && drops === 1) return "atamadaka";
    if (pitch.startsWith("L") && rises === 1 && !pitch.endsWith("L")) return "heiban";
    if (pitch.startsWith("L") && rises === 1 && pitch.endsWith("L")) return "nakadaka";
    if (rises > 1 || drops > 1) return "kifuku";
    return "odaka";
  }
  function positionPopover(popover, anchor) {
    const selection = window.getSelection();
    const rect = (anchor == null ? void 0 : anchor.getBoundingClientRect()) ?? ((selection == null ? void 0 : selection.rangeCount) ? selection.getRangeAt(0).getBoundingClientRect() : void 0);
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const fallbackLeft = (window.innerWidth - width) / 2;
    const fallbackTop = window.innerHeight * 0.18;
    const left = rect ? rect.left + (rect.width - width) / 2 : fallbackLeft;
    const top = rect && rect.top > height + 10 ? rect.top - height - 8 : rect ? rect.bottom + 8 : fallbackTop;
    popover.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
  }
  function input(name, label, value, type = "text") {
    return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml$1(value)}" autocomplete="off"></label>`;
  }
  function shortcutInput(name, label, value, placeholder = "Press keys") {
    return `<label>${label}<input data-shortcut-input name="${name}" type="text" value="${escapeHtml$1(value)}" placeholder="${escapeHtml$1(placeholder)}" autocomplete="off" inputmode="none"></label>`;
  }
  function checkbox(name, label, checked) {
    return `<label class="inline"><input name="${name}" type="checkbox" ${checked ? "checked" : ""}>${label}</label>`;
  }
  function select(name, label, value, options) {
    return `<label>${label}<select name="${name}">${options.map(
    ([optionValue, text]) => `<option value="${escapeHtml$1(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml$1(text)}</option>`
  ).join("")}</select></label>`;
  }
  function getFormInterfaceLanguage(form, fallback) {
    var _a;
    const value = (_a = getNamedControl(form, "interfaceLanguage")) == null ? void 0 : _a.value;
    return value === "auto" || value === "en" || value === "ja" ? value : fallback;
  }
  function localizeSettingsForm(form, language) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    const text = (key) => uiText(language, key);
    form.setAttribute("aria-label", text("settingsTitle"));
    (_a = form.querySelector("h2")) == null ? void 0 : _a.replaceChildren(text("settingsTitle"));
    const tabLabels = {
      basics: "basics",
      dictionaries: "dictionaries",
      media: "media",
      mining: "mining",
      shortcuts: "shortcuts",
      help: "help"
    };
    Object.entries(tabLabels).forEach(([panel, key]) => {
      var _a2;
      (_a2 = form.querySelector(`[data-action="settings-panel"][data-panel="${panel}"]`)) == null ? void 0 : _a2.replaceChildren(text(key));
    });
    [
      "JPDB",
      text("interface"),
      text("audio"),
      text("reader"),
      text("kanji"),
      text("images"),
      text("video"),
      text("youtube"),
      text("anki"),
      text("dictionaries"),
      text("shortcuts"),
      text("support")
    ].forEach((label, index) => {
      const legend = form.querySelectorAll("fieldset > legend")[index];
      legend == null ? void 0 : legend.replaceChildren(label);
    });
    const labelKeys = [
      ["apiKey", "apiKey"],
      ["addToForq", "addToForq"],
      ["enableReviews", "enableReviews"],
      ["twoButtonReviews", "reviewRatingScale"],
      ["interfaceLanguage", "settingsLanguage"],
      ["theme", "theme"],
      ["popupMode", "popupMode"],
      ["accentColor", "accentColor"],
      ["parseSelection", "parseSelection"],
      ["lookupOnClick", "lookupOnClick"],
      ["lookupOnHover", "lookupOnHover"],
      ["autoScanJapanese", "autoScanJapanese"],
      ["scanVisiblePage", "scanVisiblePage"],
      ["showFloatingButton", "showFloatingButton"],
      ["showFurigana", "showFurigana"],
      ["showPitchAccent", "showPitchAccent"],
      ["hideKnownFurigana", "hideKnownFurigana"],
      ["kanjivgEnabled", "kanjivgEnabled"],
      ["kanjiOriginsEnabled", "kanjiOriginsEnabled"],
      ["rtkEnabled", "rtkEnabled"],
      ["similarKanjiWords", "similarKanjiWords"],
      ["similarKanjiWordLimit", "similarKanjiWordLimit"],
      ["audioEnabled", "audioEnabled"],
      ["autoPlayAudio", "autoPlayAudio"],
      ["audioEnableDefaultSources", "audioEnableDefaultSources"],
      ["audioSelectionMode", "audioSelectionMode"],
      ["audioViaBlob", "audioViaBlob"],
      ["audioTimeoutMs", "audioTimeoutMs"],
      ["ocrEnabled", "ocrEnabled"],
      ["ocrAutoScanImages", "ocrAutoScanImages"],
      ["ocrShowTextOverlay", "ocrShowTextOverlay"],
      ["ocrProvider", "ocrProvider"],
      ["ocrMaxImagesPerPage", "ocrMaxImagesPerPage"],
      ["ocrMinImageArea", "ocrMinImageArea"],
      ["ocrMaxImagePixels", "ocrMaxImagePixels"],
      ["ocrTextColor", "ocrTextColor"],
      ["ocrOutlineColor", "ocrOutlineColor"],
      ["ocrBackgroundColor", "ocrBackgroundColor"],
      ["ocrBackgroundOpacity", "ocrBackgroundOpacity"],
      ["ocrFontScale", "ocrFontScale"],
      ["ocrEndpointUrl", "ocrEndpointUrl"],
      ["ocrEngine", "ocrEngine"],
      ["ocrCloudVisionApiKey", "cloudVisionApiKey"],
      ["subtitlePlayerEnabled", "subtitlePlayerEnabled"],
      ["subtitleAutoDetect", "subtitleAutoDetect"],
      ["subtitleOverlayVisible", "subtitleOverlayVisible"],
      ["subtitleSecondaryVisible", "subtitleSecondaryVisible"],
      ["subtitleMiningPause", "subtitleMiningPause"],
      ["subtitleControlsMode", "subtitleControlsMode"],
      ["subtitleFontSize", "subtitleFontSize"],
      ["subtitleBottomOffset", "subtitleBottomOffset"],
      ["subtitleTextColor", "subtitleTextColor"],
      ["subtitleOutlineColor", "subtitleOutlineColor"],
      ["subtitleBackgroundColor", "subtitleBackgroundColor"],
      ["subtitleBackgroundOpacity", "subtitleBackgroundOpacity"],
      ["subtitleFontFamily", "subtitleFontFamily"],
      ["subtitleFontWeight", "subtitleFontWeight"],
      ["subtitleSeekPadding", "subtitleSeekPadding"],
      ["youtubeImmersionEnabled", "youtubeImmersionEnabled"],
      ["youtubeShowFilterNotice", "youtubeShowFilterNotice"],
      ["ankiEnabled", "ankiEnabled"],
      ["ankiMineWithJpdb", "ankiMineWithJpdb"],
      ["ankiCaptureScreenshot", "ankiCaptureScreenshot"],
      ["ankiConnectUrl", "ankiConnectUrl"],
      ["ankiDeck", "ankiDeck"],
      ["ankiModel", "ankiModel"],
      ["ankiTags", "ankiTags"],
      ["jpdbDefinitionsEnabled", "jpdbDefinitionsEnabled"],
      ["localDictionariesEnabled", "localDictionariesEnabled"],
      ["localDictionaryShowKanji", "localDictionaryShowKanji"],
      ["localDictionaryMaxResults", "localDictionaryMaxResults"],
      ["shortcuts.hoverLookup", "holdWhileHovering"],
      ["shortcuts.scanPage", "scanPage"],
      ["shortcuts.openSettings", "openSettings"],
      ["shortcuts.playAudio", "playAudio"],
      ["shortcuts.closePopup", "closePopup"],
      ["shortcuts.previousSubtitle", "previousSubtitle"],
      ["shortcuts.nextSubtitle", "nextSubtitle"],
      ["shortcuts.copySubtitle", "copySubtitle"],
      ["shortcuts.toggleOcr", "toggleImageReading"],
      ["shortcuts.toggleYoutubeImmersion", "toggleYoutubeImmersion"],
      ["shortcuts.scanImages", "readImagesNow"],
      ["shortcuts.gradeNothing", "gradeNothing"],
      ["shortcuts.gradeSomething", "gradeSomething"],
      ["shortcuts.gradeHard", "gradeHard"],
      ["shortcuts.gradeOkay", "gradeOkay"],
      ["shortcuts.gradeEasy", "gradeEasy"],
      ["shortcuts.gradeFail", "gradeFail"],
      ["shortcuts.gradePass", "gradePass"]
    ];
    labelKeys.forEach(([name, key]) => setControlLabel(form, name, text(key)));
    const jpdbSettings = form.querySelector('label a[href*="jpdb.io/settings"]');
    if (jpdbSettings) jpdbSettings.textContent = text("jpdbSettings");
    setSelectOptionLabels(form, "interfaceLanguage", [
      ["auto", text("automatic")],
      ["en", text("english")],
      ["ja", text("japanese")]
    ]);
    setSelectOptionLabels(form, "theme", [
      ["auto", text("auto")],
      ["dark", text("dark")],
      ["light", text("light")]
    ]);
    setSelectOptionLabels(form, "popupMode", [
      ["auto", text("auto")],
      ["sheet", text("bottomSheet")],
      ["popover", text("popover")]
    ]);
    setSelectOptionLabels(form, "twoButtonReviews", [
      ["false", text("fivePoint")],
      ["true", text("twoPoint")]
    ]);
    setSelectOptionLabels(form, "audioSelectionMode", [
      ["first", text("firstAudio")],
      ["random", text("randomAudio")]
    ]);
    setSelectOptionLabels(form, "ocrProvider", [
      ["google-lens", text("googleLens")],
      ["local-service", text("localOcr")],
      ["cloud-vision", text("cloudVision")],
      ["off", text("off")]
    ]);
    setSelectOptionLabels(form, "ocrMaxImagesPerPage", [
      ["3", text("lightWork")],
      ["8", text("normal")],
      ["16", text("more")]
    ]);
    setSelectOptionLabels(form, "ocrMinImageArea", [
      ["80000", text("largeOnly")],
      ["45000", text("normal")],
      ["15000", text("includeSmall")]
    ]);
    setSelectOptionLabels(form, "ocrMaxImagePixels", [
      ["640000", text("faster")],
      ["1200000", text("balanced")],
      ["2000000", text("sharper")]
    ]);
    setSelectOptionLabels(form, "ocrEngine", [
      ["auto", text("automatic")],
      ["MangaOCR", "MangaOCR"],
      ["PaddleOCR", "PaddleOCR"],
      ["AppleVision", "Apple Vision"]
    ]);
    setSelectOptionLabels(form, "subtitleControlsMode", [
      ["auto", text("showWhenNeeded")],
      ["hidden", text("hideControls")],
      ["always", text("alwaysVisible")]
    ]);
    setShortcutPlaceholder(form, "shortcuts.hoverLookup", text("blankPlainHover"));
    form.querySelectorAll("[data-shortcut-input]").forEach((inputEl) => {
      if (inputEl.name !== "shortcuts.hoverLookup") inputEl.placeholder = text("pressKeys");
    });
    setFieldsetHelp(form, 1, text("interfaceHelp"));
    setFieldsetHelp(form, 3, text("readerHelp"));
    setFieldsetHelp(form, 4, text("kanjiHelp"));
    setFieldsetHelp(form, 5, text("ocrHelp"));
    setFieldsetHelp(form, 7, text("youtubeHelp"));
    setFieldsetHelp(form, 8, text("ankiHelp"));
    const audioHelp = getFieldsetHelp(form, 2);
    if (audioHelp) {
      setInnerHtml(audioHelp, `${escapeHtml$1(text("audioHelp").replace("Yomitan audio guide.", "").replace("Yomitan音声ガイドも参照できます。", ""))}<a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">Yomitan audio guide</a>.`);
    }
    const importStatus = form.querySelector("[data-import-status]");
    if (importStatus && /Import Yomitan|Yomitan設定/.test(importStatus.textContent ?? "")) importStatus.textContent = text("dictionaryImportHelp");
    const localOcrLabel = (_b = getNamedControl(form, "ocrEndpointUrl")) == null ? void 0 : _b.closest("label");
    if (localOcrLabel) setBlockLabelText(localOcrLabel, text("ocrEndpointUrl"));
    const cloudOcrLabel = (_c = getNamedControl(form, "ocrCloudVisionApiKey")) == null ? void 0 : _c.closest("label");
    if (cloudOcrLabel) setBlockLabelText(cloudOcrLabel, text("cloudVisionApiKey"));
    (_d = form.querySelector('[data-action="test-anki"]')) == null ? void 0 : _d.replaceChildren(text("testAnki"));
    (_e = form.querySelector('[data-action="import-yomitan-settings"]')) == null ? void 0 : _e.replaceChildren(text("importSettings"));
    (_f = form.querySelector('[data-action="export-reader-settings"]')) == null ? void 0 : _f.replaceChildren(text("exportSettings"));
    (_g = form.querySelector('[data-action="import-yomitan-dictionary"]')) == null ? void 0 : _g.replaceChildren(text("importDictionaries"));
    (_h = form.querySelector('[data-action="export-yomitan-dictionary"]')) == null ? void 0 : _h.replaceChildren(text("exportDictionaries"));
    (_i = form.querySelector('[data-action="audio-source-add"]')) == null ? void 0 : _i.replaceChildren(text("addAudioSource"));
    (_j = form.querySelector('[data-action="download-starter-dictionaries"]')) == null ? void 0 : _j.replaceChildren(text("downloadMissingRecommended"));
    (_k = form.querySelector('[data-action="refresh-dictionaries"]')) == null ? void 0 : _k.replaceChildren(text("refreshInstalledList"));
    (_l = form.querySelector('[data-action="cancel"]')) == null ? void 0 : _l.replaceChildren(text("cancel"));
    (_m = form.querySelector('button[type="submit"]')) == null ? void 0 : _m.replaceChildren(text("save"));
    const audioHead = form.querySelectorAll(".jpdb-reader-audio-source-head span");
    (_n = audioHead[1]) == null ? void 0 : _n.replaceChildren(text("audioSource"));
    (_o = audioHead[2]) == null ? void 0 : _o.replaceChildren(text("urlVoice"));
    const dictionaryTitle = form.querySelector(".jpdb-reader-recommended-title");
    dictionaryTitle == null ? void 0 : dictionaryTitle.replaceChildren(text("recommendedDownloads"));
    form.querySelectorAll(".jpdb-reader-recommended-name a").forEach((link) => {
      link.textContent = text("homepage");
    });
    form.querySelectorAll('[data-action="download-recommended-dictionary"]').forEach((button2) => {
      button2.textContent = button2.dataset.installed === "true" ? text("update") : text("download");
    });
    const dictionaryStatus = form.querySelector("[data-dictionary-status]");
    if (dictionaryStatus && /Checking imported|インポート済み辞書を確認/.test(dictionaryStatus.textContent ?? "")) {
      dictionaryStatus.textContent = text("checkingDictionaries");
    }
    localizeSupportPanel(form, language);
  }
  function getNamedControl(form, name) {
    return Array.from(form.elements).find(
      (element2) => (element2 instanceof HTMLInputElement || element2 instanceof HTMLSelectElement || element2 instanceof HTMLTextAreaElement) && element2.name === name
    ) ?? null;
  }
  function setControlLabel(form, name, label) {
    const control = getNamedControl(form, name);
    const labelElement = control == null ? void 0 : control.closest("label");
    if (!labelElement) return;
    if (labelElement.classList.contains("inline")) setInlineLabelText(labelElement, label);
    else setBlockLabelText(labelElement, label);
  }
  function setBlockLabelText(label, text) {
    const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = text;
    else label.insertBefore(document.createTextNode(text), label.firstChild);
  }
  function setInlineLabelText(label, text) {
    const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim());
    if (textNode) textNode.textContent = text;
    else label.append(document.createTextNode(text));
  }
  function setSelectOptionLabels(form, name, options) {
    const selectElement = getNamedControl(form, name);
    if (!selectElement) return;
    options.forEach(([value, label]) => {
      const option = Array.from(selectElement.options).find((item) => item.value === value);
      if (option) option.textContent = label;
    });
  }
  function setShortcutPlaceholder(form, name, placeholder) {
    const inputElement = getNamedControl(form, name);
    if (inputElement) inputElement.placeholder = placeholder;
  }
  function getFieldsetHelp(form, index) {
    const fieldset = form.querySelectorAll("fieldset")[index];
    return Array.from((fieldset == null ? void 0 : fieldset.children) ?? []).find(
      (child) => child instanceof HTMLElement && child.classList.contains("jpdb-reader-help")
    ) ?? null;
  }
  function setFieldsetHelp(form, index, text) {
    const help = getFieldsetHelp(form, index);
    if (help) help.textContent = text;
  }
  function localizeSupportPanel(form, language) {
    var _a, _b, _c, _d, _e, _f, _g;
    const support = form.querySelector(".jpdb-reader-support-card");
    if (!support) return;
    const text = (key) => uiText(language, key);
    (_a = support.querySelector(".jpdb-reader-support-title")) == null ? void 0 : _a.replaceChildren(text("supportTitle"));
    const paragraphs = support.querySelectorAll("p");
    (_b = paragraphs[0]) == null ? void 0 : _b.replaceChildren(text("supportCopy"));
    (_c = paragraphs[1]) == null ? void 0 : _c.replaceChildren(text("supportDonation"));
    (_d = support.querySelector('[data-support-link="paypal"]')) == null ? void 0 : _d.replaceChildren(text("donate"));
    (_e = support.querySelector('[data-support-link="issues"]')) == null ? void 0 : _e.replaceChildren(text("reportIssue"));
    (_f = support.querySelector('[data-support-link="github"]')) == null ? void 0 : _f.replaceChildren(text("github"));
    (_g = support.querySelector('[data-support-link="discord"]')) == null ? void 0 : _g.replaceChildren(text("copyDiscord"));
  }
  function renderReviewShortcutInputs(settings) {
    const fivePointHidden = !settings.enableReviews || settings.twoButtonReviews;
    const passFailHidden = !settings.enableReviews || !settings.twoButtonReviews;
    return `
        <div class="jpdb-reader-shortcut-group" data-review-scale="five" ${fivePointHidden ? "hidden" : ""}>
            ${shortcutInput("shortcuts.gradeNothing", "Grade NOTHING", settings.shortcuts.gradeNothing)}
            ${shortcutInput("shortcuts.gradeSomething", "Grade SOMETHING", settings.shortcuts.gradeSomething)}
            ${shortcutInput("shortcuts.gradeHard", "Grade HARD", settings.shortcuts.gradeHard)}
            ${shortcutInput("shortcuts.gradeOkay", "Grade OKAY", settings.shortcuts.gradeOkay)}
            ${shortcutInput("shortcuts.gradeEasy", "Grade EASY", settings.shortcuts.gradeEasy)}
        </div>
        <div class="jpdb-reader-shortcut-group" data-review-scale="pass-fail" ${passFailHidden ? "hidden" : ""}>
            ${shortcutInput("shortcuts.gradeFail", "Pass/fail: FAIL", settings.shortcuts.gradeFail)}
            ${shortcutInput("shortcuts.gradePass", "Pass/fail: PASS", settings.shortcuts.gradePass)}
        </div>
    `;
  }
  function activateSettingsPanel(form, panel) {
    form.querySelectorAll("[data-settings-panel]").forEach((section) => {
      section.hidden = section.dataset.settingsPanel !== panel;
    });
    form.querySelectorAll('[data-action="settings-panel"]').forEach((button2) => {
      const active = button2.dataset.panel === panel;
      button2.setAttribute("aria-selected", String(active));
    });
  }
  function renderAudioSourceEditor(sources) {
    return `
        <div class="jpdb-reader-audio-source-head">
            <span>#</span>
            <span>Audio source</span>
            <span>URL / voice</span>
            <span></span>
        </div>
        ${renderAudioSourceRows(audioSourceRowsForSettings(sources))}
        <button class="jpdb-reader-btn" type="button" data-action="audio-source-add">Add audio source</button>
    `;
  }
  function renderAudioSourceRows(rows) {
    const count = rows.length;
    return `
        <input type="hidden" name="audioSourceCount" value="${count}">
        ${rows.map((source, index) => `
            <div class="jpdb-reader-audio-source-row" data-audio-source-row data-index="${index}">
                <label class="inline jpdb-reader-audio-index">
                    <input name="audioSources.${index}.enabled" type="checkbox" ${source.enabled ? "checked" : ""}>
                    <span>${index + 1}</span>
                </label>
                <select name="audioSources.${index}.type" aria-label="Audio source ${index + 1}">
                    ${AUDIO_SOURCE_OPTIONS.map(
    ([optionValue, text]) => `<option value="${escapeHtml$1(optionValue)}" ${optionValue === source.type ? "selected" : ""}>${escapeHtml$1(text)}</option>`
  ).join("")}
                </select>
                <div class="jpdb-reader-audio-source-fields">
                    <input data-audio-url-field name="audioSources.${index}.url" type="text" value="${escapeHtml$1(source.url)}" placeholder="${audioUrlPlaceholder(source.type)}" ${audioSourceUsesUrl(source.type) ? "" : "hidden"}>
                    <input data-audio-voice-field name="audioSources.${index}.voice" type="text" value="${escapeHtml$1(source.voice)}" placeholder="${audioVoicePlaceholder(source.type)}" ${audioSourceUsesVoice(source.type) ? "" : "hidden"}>
                </div>
                <div class="jpdb-reader-row-tools" aria-label="Audio source order">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-up" title="Move up">↑</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-down" title="Move down">↓</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-remove" title="Remove">×</button>
                </div>
            </div>
        `).join("")}
    `;
  }
  function audioSourceRowsForSettings(sources) {
    const rows = sources.map((source) => ({ ...source }));
    return rows.length ? rows : DEFAULT_AUDIO_SOURCES.map((source) => ({ ...source }));
  }
  function audioUrlPlaceholder(type) {
    if (type === "custom" || type === "custom-json") return "URL for this custom source";
    return "Built-in source, no URL needed";
  }
  function audioVoicePlaceholder(type) {
    if (type === "text-to-speech" || type === "text-to-speech-reading") return "Voice name";
    return "No voice needed";
  }
  function audioSourceUsesUrl(type) {
    return type === "custom" || type === "custom-json";
  }
  function audioSourceUsesVoice(type) {
    return type === "text-to-speech" || type === "text-to-speech-reading";
  }
  function syncAudioSourceRow(row, type) {
    if (!row) return;
    row.querySelectorAll("[data-audio-url-field]").forEach((node) => {
      node.hidden = !audioSourceUsesUrl(type);
    });
    row.querySelectorAll("[data-audio-voice-field]").forEach((node) => {
      node.hidden = !audioSourceUsesVoice(type);
    });
  }
  function updateAudioSourceEditor(form, action, control) {
    const container = form.querySelector(".jpdb-reader-audio-sources");
    if (!container) return;
    const sources = audioSourceRowsForSettings(readAudioSources(new FormData(form)));
    const row = control == null ? void 0 : control.closest("[data-audio-source-row]");
    const index = row ? Array.from(container.querySelectorAll("[data-audio-source-row]")).indexOf(row) : -1;
    if (action === "audio-source-add" && sources.length < 12) {
      sources.push({ type: "custom-json", url: "", voice: "", enabled: true });
    }
    if (action === "audio-source-remove" && index >= 0 && sources.length > 1) {
      sources.splice(index, 1);
    }
    if (action === "audio-source-up" && index > 0) {
      const [source] = sources.splice(index, 1);
      sources.splice(index - 1, 0, source);
    }
    if (action === "audio-source-down" && index >= 0 && index < sources.length - 1) {
      const [source] = sources.splice(index, 1);
      sources.splice(index + 1, 0, source);
    }
    setInnerHtml(container, renderAudioSourceEditor(sources));
  }
  function updateDictionarySourceEditor(form, action, control) {
    const container = form.querySelector(".jpdb-reader-dictionary-priorities");
    const row = control == null ? void 0 : control.closest("[data-dictionary-source-row]");
    if (!container || !row) return;
    const rows = Array.from(container.querySelectorAll("[data-dictionary-source-row]"));
    const index = rows.indexOf(row);
    const targetIndex = action === "dictionary-source-up" ? index - 1 : index + 1;
    moveDictionarySourceRow(container, index, targetIndex);
  }
  function installDictionarySourceDrag(form) {
    let dragged = null;
    form.addEventListener("dragstart", (event) => {
      var _a, _b;
      const row = event.target.closest("[data-dictionary-source-row]");
      if (!row) return;
      dragged = row;
      row.classList.add("jpdb-reader-dragging");
      (_a = event.dataTransfer) == null ? void 0 : _a.setData("text/plain", row.dataset.sourceId ?? "");
      (_b = event.dataTransfer) == null ? void 0 : _b.setDragImage(row, 18, 18);
    });
    form.addEventListener("dragover", (event) => {
      if (!dragged) return;
      const row = event.target.closest("[data-dictionary-source-row]");
      if (row && row !== dragged) event.preventDefault();
    });
    form.addEventListener("drop", (event) => {
      if (!dragged) return;
      const target = event.target.closest("[data-dictionary-source-row]");
      const container = dragged.closest(".jpdb-reader-dictionary-priorities");
      if (!target || !container || target === dragged) return;
      event.preventDefault();
      const rows = Array.from(container.querySelectorAll("[data-dictionary-source-row]"));
      moveDictionarySourceRow(container, rows.indexOf(dragged), rows.indexOf(target));
    });
    form.addEventListener("dragend", () => {
      dragged == null ? void 0 : dragged.classList.remove("jpdb-reader-dragging");
      dragged = null;
    });
  }
  function moveDictionarySourceRow(container, index, targetIndex) {
    const rows = Array.from(container.querySelectorAll("[data-dictionary-source-row]"));
    if (index < 0 || targetIndex < 0 || index >= rows.length || targetIndex >= rows.length || index === targetIndex) return;
    const row = rows[index];
    const target = rows[targetIndex];
    if (targetIndex < index) container.insertBefore(row, target);
    else container.insertBefore(row, target.nextSibling);
    syncDictionarySourcePriorities(container);
  }
  function syncDictionarySourcePriorities(container) {
    const rows = Array.from(container.querySelectorAll("[data-dictionary-source-row]"));
    rows.forEach((row, index) => {
      const priority = row.querySelector('input[name$=".priority"]');
      if (priority) priority.value = String(index);
      const indexLabel = row.querySelector(".jpdb-reader-dictionary-toggle span");
      if (indexLabel) indexLabel.textContent = String(index + 1);
    });
  }
  function installShortcutCapture(root) {
    root.querySelectorAll("[data-shortcut-input]").forEach((inputEl) => {
      inputEl.addEventListener("keydown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Backspace" || event.key === "Delete") {
          inputEl.value = "";
          return;
        }
        inputEl.value = formatShortcutEvent(event);
      });
      inputEl.addEventListener("paste", (event) => event.preventDefault());
    });
  }
  function syncReviewSettingsVisibility(form) {
    var _a, _b;
    const reviewsEnabled = ((_a = form.querySelector('input[name="enableReviews"]')) == null ? void 0 : _a.checked) ?? true;
    const passFail = ((_b = form.querySelector('select[name="twoButtonReviews"]')) == null ? void 0 : _b.value) === "true";
    form.querySelectorAll("[data-review-config]").forEach((node) => {
      node.hidden = !reviewsEnabled;
    });
    form.querySelectorAll('[data-review-scale="five"]').forEach((node) => {
      node.hidden = !reviewsEnabled || passFail;
    });
    form.querySelectorAll('[data-review-scale="pass-fail"]').forEach((node) => {
      node.hidden = !reviewsEnabled || !passFail;
    });
  }
  function renderDeckControls(settings, decks, hasApiKey) {
    const disabled = !hasApiKey || !decks.length;
    const deckOptions = decks.map((deck) => [deck.id, deck.name]);
    const miningOptions = [["forq", "FORQ"], ...deckOptions];
    return `
        <div class="grid">
            ${deckSelect("miningDeck", "Mining deck", settings.miningDeck, miningOptions, disabled)}
            ${deckSelect("neverForgetDeck", "Never forget deck", settings.neverForgetDeck, deckOptions, disabled)}
            ${deckSelect("blacklistDeck", "Blacklist deck", settings.blacklistDeck, deckOptions, disabled)}
        </div>
        <div class="jpdb-reader-help">${hasApiKey ? decks.length ? "Decks are loaded from your JPDB account." : "Could not load decks yet; saved deck IDs will be kept." : "Add your JPDB API key to choose decks."}</div>
    `;
  }
  function deckSelect(name, label, value, options, disabled) {
    const hasValue = options.some(([optionValue]) => optionValue === value);
    const merged = hasValue || !value ? options : [[value, `Saved: ${value}`], ...options];
    return `<label>${label}
        <select name="${name}" ${disabled ? "disabled" : ""}>
            ${merged.map(([optionValue, text]) => `<option value="${escapeHtml$1(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml$1(text)}</option>`).join("")}
        </select>
        ${disabled ? `<input type="hidden" name="${name}" value="${escapeHtml$1(value)}">` : ""}
    </label>`;
  }
  function settingsTabButton(panel, label, active = false) {
    return `<button class="jpdb-reader-settings-tab" type="button" data-action="settings-panel" data-panel="${escapeHtml$1(panel)}" role="tab" aria-selected="${active ? "true" : "false"}">${escapeHtml$1(label)}</button>`;
  }
  function renderDictionarySourceRows(settings) {
    const preferences = settings.dictionaryPreferences;
    const rows = [
      {
        id: JPDB_DEFINITION_SOURCE_ID,
        name: "JPDB",
        alias: "JPDB",
        enabled: settings.jpdbDefinitionsEnabled,
        priority: settings.jpdbDefinitionsPriority,
        readonly: true,
        help: "Built-in JPDB meanings from the parsed card."
      },
      ...preferences.map((preference) => ({
        id: preference.name,
        name: preference.name,
        alias: preference.alias,
        enabled: preference.enabled,
        priority: preference.priority,
        readonly: false,
        help: ""
      }))
    ].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
    if (rows.length === 1) return `
        <div class="jpdb-reader-help">JPDB is the only definition source. Import Yomitan dictionaries to add local or native-language definitions.</div>
        ${renderDictionarySourceRowsList(rows)}
    `;
    return renderDictionarySourceRowsList(rows);
  }
  function renderDictionarySourceRowsList(rows) {
    return `
        <div class="jpdb-reader-dictionary-head">
            <span>On</span>
            <span>Definition source</span>
            <span>Alias</span>
            <span>Order</span>
        </div>
        <input type="hidden" name="dictionaryPreferenceCount" value="${rows.filter((row) => row.id !== JPDB_DEFINITION_SOURCE_ID).length}">
        ${rows.map((row, index) => {
    const localIndex = rows.slice(0, index).filter((item) => item.id !== JPDB_DEFINITION_SOURCE_ID).length;
    const prefix = row.id === JPDB_DEFINITION_SOURCE_ID ? "jpdbDefinitions" : `dictionaryPreferences.${localIndex}`;
    return `
            <div class="jpdb-reader-dictionary-row" draggable="true" data-dictionary-source-row data-source-id="${escapeHtml$1(row.id)}">
                <label class="inline jpdb-reader-dictionary-toggle">
                    <input name="${prefix}.enabled" type="checkbox" ${row.enabled ? "checked" : ""}>
                    <span>${index + 1}</span>
                </label>
                <input name="${prefix}.name" type="text" value="${escapeHtml$1(row.name)}" readonly aria-label="Dictionary name">
                <input name="${prefix}.alias" type="text" value="${escapeHtml$1(row.alias)}" ${row.readonly ? "readonly" : ""} aria-label="Dictionary alias">
                <div class="jpdb-reader-row-tools">
                    <input name="${prefix}.priority" type="hidden" value="${index}" aria-label="Dictionary priority">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-up" title="Move up">↑</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-down" title="Move down">↓</button>
                </div>
                ${row.help ? `<div class="jpdb-reader-dictionary-row-help">${escapeHtml$1(row.help)}</div>` : ""}
            </div>
        `;
  }).join("")}
    `;
  }
  function renderRecommendedDictionaries(installed) {
    const groups = [
      ["terms", "Term dictionaries"],
      ["kanji", "Kanji dictionaries"],
      ["frequency", "Frequency dictionaries"]
    ];
    return `
        <div class="jpdb-reader-recommended-title">Recommended dictionary downloads</div>
        <div class="jpdb-reader-settings-actions">
            <button class="jpdb-reader-btn" type="button" data-action="download-starter-dictionaries">Download missing recommended</button>
            <button class="jpdb-reader-btn" type="button" data-action="refresh-dictionaries">Refresh installed list</button>
        </div>
        ${groups.map(([category, label]) => {
    const dictionaries = RECOMMENDED_JAPANESE_DICTIONARIES.filter((dictionary) => dictionary.category === category);
    if (!dictionaries.length) return "";
    return `
                <div class="jpdb-reader-recommended-group">
                    <div class="jpdb-reader-recommended-group-title">${escapeHtml$1(label)}</div>
                    ${dictionaries.map((dictionary) => renderRecommendedDictionary(dictionary, installed)).join("")}
                </div>
            `;
  }).join("")}
    `;
  }
  function renderRecommendedDictionary(dictionary, installed) {
    const alreadyInstalled = isRecommendedDictionaryInstalled(dictionary, installed);
    return `
        <div class="jpdb-reader-recommended-item">
            <div>
                <div class="jpdb-reader-recommended-name">
                    <span>${escapeHtml$1(dictionary.name)}</span>
                    <a href="${dictionary.homepage}" target="_blank" rel="noopener">Homepage</a>
                </div>
                <div class="jpdb-reader-help">${escapeHtml$1(dictionary.description)}</div>
            </div>
            <button class="jpdb-reader-btn" type="button" data-action="download-recommended-dictionary" data-dictionary-id="${escapeHtml$1(dictionary.id)}" data-installed="${alreadyInstalled}">
                ${alreadyInstalled ? "Update" : "Download"}
            </button>
        </div>
    `;
  }
  function isRecommendedDictionaryInstalled(dictionary, installed) {
    const targetName = normalizedDictionaryName(dictionary.name);
    return installed.some((item) => item.downloadUrl === dictionary.downloadUrl || normalizedDictionaryName(item.title).includes(targetName));
  }
  function normalizedDictionaryName(value) {
    return value.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龯]/g, "");
  }
  function recommendedDictionaryFilename(dictionary) {
    try {
      const parsed = new URL(dictionary.downloadUrl);
      const lastPath = parsed.pathname.split("/").filter(Boolean).pop();
      if (lastPath && /\.zip$/i.test(lastPath)) return decodeURIComponent(lastPath);
    } catch {
    }
    return `${dictionary.id}.zip`;
  }
  function readFormSettings(data, current) {
    var _a;
    const get = (key) => String(data.get(key) ?? "");
    const has = (key) => data.has(key);
    const number = (key, fallback) => readNumber(get(key), fallback);
    const audioSources = readAudioSources(data);
    return {
      ...current,
      apiKey: get("apiKey").trim(),
      interfaceLanguage: ["auto", "en", "ja"].includes(get("interfaceLanguage")) ? get("interfaceLanguage") : current.interfaceLanguage,
      jpdbDefinitionsEnabled: has("jpdbDefinitions.enabled"),
      jpdbDefinitionsPriority: Math.max(0, Math.min(999, number("jpdbDefinitions.priority", current.jpdbDefinitionsPriority))),
      rtkEnabled: has("rtkEnabled"),
      kanjivgEnabled: has("kanjivgEnabled"),
      kanjiOriginsEnabled: has("kanjiOriginsEnabled"),
      similarKanjiWords: has("similarKanjiWords"),
      similarKanjiWordLimit: Math.max(2, Math.min(24, number("similarKanjiWordLimit", current.similarKanjiWordLimit))),
      audioEnabled: has("audioEnabled"),
      autoPlayAudio: has("autoPlayAudio"),
      audioSources,
      audioEnableDefaultSources: has("audioEnableDefaultSources"),
      audioSourceUrl: ((_a = audioSources.find((source) => source.url.trim())) == null ? void 0 : _a.url.trim()) ?? current.audioSourceUrl,
      accentColor: sanitizeAccentColor(get("accentColor"), current.accentColor),
      audioViaBlob: has("audioViaBlob"),
      audioTimeoutMs: Math.max(1e3, number("audioTimeoutMs", current.audioTimeoutMs)),
      audioSelectionMode: get("audioSelectionMode") === "random" ? "random" : "first",
      parseSelection: has("parseSelection"),
      lookupOnClick: has("lookupOnClick"),
      lookupOnHover: has("lookupOnHover"),
      popupActivationMode: current.popupActivationMode,
      scanModifierKey: current.scanModifierKey,
      autoScanJapanese: has("autoScanJapanese"),
      scanVisiblePage: has("scanVisiblePage"),
      showFloatingButton: has("showFloatingButton"),
      showFurigana: has("showFurigana"),
      showPitchAccent: has("showPitchAccent"),
      hideKnownFurigana: has("hideKnownFurigana"),
      ocrEnabled: has("ocrEnabled"),
      ocrAutoScanImages: has("ocrAutoScanImages"),
      ocrShowTextOverlay: has("ocrShowTextOverlay"),
      ocrProvider: normalizeOcrProvider(get("ocrProvider")),
      ocrEndpointUrl: get("ocrEndpointUrl").trim(),
      ocrEngine: get("ocrEngine").trim() || "auto",
      ocrCloudVisionApiKey: get("ocrCloudVisionApiKey").trim(),
      ocrLanguage: get("ocrLanguage").trim() || "ja-JP",
      ocrMaxImagePixels: Math.max(16e4, Math.min(28e5, number("ocrMaxImagePixels", current.ocrMaxImagePixels))),
      ocrMinImageArea: Math.max(1e4, Math.min(8e5, number("ocrMinImageArea", current.ocrMinImageArea))),
      ocrMaxImagesPerPage: Math.max(1, Math.min(30, number("ocrMaxImagesPerPage", current.ocrMaxImagesPerPage))),
      ocrPrefetchMargin: Math.max(0, Math.min(3e3, number("ocrPrefetchMargin", current.ocrPrefetchMargin))),
      ocrTextColor: sanitizeAccentColor(get("ocrTextColor"), current.ocrTextColor),
      ocrOutlineColor: sanitizeAccentColor(get("ocrOutlineColor"), current.ocrOutlineColor),
      ocrBackgroundColor: sanitizeAccentColor(get("ocrBackgroundColor"), current.ocrBackgroundColor),
      ocrBackgroundOpacity: Math.max(0, Math.min(1, number("ocrBackgroundOpacity", current.ocrBackgroundOpacity))),
      ocrFontScale: Math.max(0.7, Math.min(1.8, number("ocrFontScale", current.ocrFontScale))),
      localDictionariesEnabled: has("localDictionariesEnabled"),
      localDictionaryShowKanji: has("localDictionaryShowKanji"),
      localDictionaryMaxResults: Math.max(1, Math.min(64, number("localDictionaryMaxResults", current.localDictionaryMaxResults))),
      dictionaryPreferences: readDictionaryPreferences(data, current.dictionaryPreferences),
      subtitlePlayerEnabled: has("subtitlePlayerEnabled"),
      subtitleAutoDetect: has("subtitleAutoDetect"),
      subtitleOverlayVisible: has("subtitleOverlayVisible"),
      subtitleSecondaryVisible: has("subtitleSecondaryVisible"),
      subtitleControlsMode: ["auto", "always", "hidden"].includes(get("subtitleControlsMode")) ? get("subtitleControlsMode") : current.subtitleControlsMode,
      subtitleFontSize: Math.max(16, Math.min(64, number("subtitleFontSize", current.subtitleFontSize))),
      subtitleBottomOffset: Math.max(2, Math.min(40, number("subtitleBottomOffset", current.subtitleBottomOffset))),
      subtitleTextColor: sanitizeAccentColor(get("subtitleTextColor"), current.subtitleTextColor),
      subtitleOutlineColor: sanitizeAccentColor(get("subtitleOutlineColor"), current.subtitleOutlineColor),
      subtitleBackgroundColor: sanitizeAccentColor(get("subtitleBackgroundColor"), current.subtitleBackgroundColor),
      subtitleBackgroundOpacity: Math.max(0, Math.min(1, number("subtitleBackgroundOpacity", current.subtitleBackgroundOpacity))),
      subtitleFontFamily: get("subtitleFontFamily").trim() || current.subtitleFontFamily,
      subtitleFontWeight: Math.max(100, Math.min(900, number("subtitleFontWeight", current.subtitleFontWeight))),
      subtitleMiningPause: has("subtitleMiningPause"),
      subtitleSeekPadding: Math.max(-2, Math.min(2, number("subtitleSeekPadding", current.subtitleSeekPadding))),
      youtubeImmersionEnabled: has("youtubeImmersionEnabled"),
      youtubeShowFilterNotice: has("youtubeShowFilterNotice"),
      ankiEnabled: has("ankiEnabled"),
      ankiConnectUrl: get("ankiConnectUrl").trim() || current.ankiConnectUrl,
      ankiDeck: get("ankiDeck").trim() || current.ankiDeck,
      ankiModel: get("ankiModel").trim() || current.ankiModel,
      ankiTags: get("ankiTags").trim(),
      ankiMineWithJpdb: has("ankiMineWithJpdb"),
      ankiCaptureScreenshot: has("ankiCaptureScreenshot"),
      theme: get("theme"),
      popupMode: get("popupMode"),
      miningDeck: get("miningDeck").trim() || "forq",
      neverForgetDeck: get("neverForgetDeck").trim() || "never-forget",
      blacklistDeck: get("blacklistDeck").trim() || "blacklist",
      addToForq: has("addToForq"),
      enableReviews: has("enableReviews"),
      twoButtonReviews: get("twoButtonReviews") === "true",
      shortcuts: {
        scanPage: get("shortcuts.scanPage"),
        hoverLookup: get("shortcuts.hoverLookup"),
        openSettings: get("shortcuts.openSettings"),
        playAudio: get("shortcuts.playAudio"),
        closePopup: get("shortcuts.closePopup"),
        previousSubtitle: get("shortcuts.previousSubtitle"),
        nextSubtitle: get("shortcuts.nextSubtitle"),
        copySubtitle: get("shortcuts.copySubtitle"),
        toggleOcr: get("shortcuts.toggleOcr"),
        toggleYoutubeImmersion: get("shortcuts.toggleYoutubeImmersion"),
        scanImages: get("shortcuts.scanImages"),
        gradeNothing: get("shortcuts.gradeNothing"),
        gradeSomething: get("shortcuts.gradeSomething"),
        gradeHard: get("shortcuts.gradeHard"),
        gradeOkay: get("shortcuts.gradeOkay"),
        gradeEasy: get("shortcuts.gradeEasy"),
        gradeFail: get("shortcuts.gradeFail"),
        gradePass: get("shortcuts.gradePass")
      }
    };
  }
  function readNumber(value, fallback) {
    if (!value.trim()) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function applyUrlBootstrapSettings(settings) {
    var _a, _b, _c;
    const params = new URLSearchParams(location.search);
    const apiKey = (_a = params.get("apiKey")) == null ? void 0 : _a.trim();
    const audio = (_b = params.get("audio")) == null ? void 0 : _b.trim();
    const ocr = (_c = params.get("ocr")) == null ? void 0 : _c.trim();
    if (!apiKey && !audio && !ocr) return settings;
    const audioSources = audio ? [{ type: "custom-json", url: audio, voice: "", enabled: true }, ...settings.audioSources.filter((source) => source.url !== audio)] : settings.audioSources;
    return {
      ...settings,
      apiKey: apiKey || settings.apiKey,
      audioSources,
      audioSourceUrl: audio || settings.audioSourceUrl,
      ocrEndpointUrl: ocr || settings.ocrEndpointUrl
    };
  }
  function readDictionaryPreferences(data, current) {
    const get = (key) => String(data.get(key) ?? "");
    const count = Math.max(0, Number(get("dictionaryPreferenceCount")) || 0);
    if (!count) return current;
    return Array.from({ length: count }, (_, index) => ({
      name: get(`dictionaryPreferences.${index}.name`).trim(),
      alias: get(`dictionaryPreferences.${index}.alias`).trim() || get(`dictionaryPreferences.${index}.name`).trim(),
      enabled: data.has(`dictionaryPreferences.${index}.enabled`),
      priority: readNumber(get(`dictionaryPreferences.${index}.priority`), index)
    })).filter((item) => item.name).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }
  function readAudioSources(data) {
    const get = (key) => String(data.get(key) ?? "");
    const count = Math.max(0, Number(get("audioSourceCount")) || 0);
    const sources = [];
    const builtInTypes = new Set(DEFAULT_AUDIO_SOURCES.map((source) => source.type));
    for (let index = 0; index < count; index++) {
      const source = normalizeAudioSource({
        type: get(`audioSources.${index}.type`),
        url: get(`audioSources.${index}.url`).trim(),
        voice: get(`audioSources.${index}.voice`).trim(),
        enabled: data.has(`audioSources.${index}.enabled`)
      });
      if (!source) continue;
      if (!source.enabled && !source.url && !source.voice && !builtInTypes.has(source.type)) continue;
      sources.push(source);
    }
    return sources;
  }
  function getReaderSettingsExport(value) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    return (record.formatName === "yomu-reader-settings" || record.formatName === "kotoba-reader-settings" || record.formatName === "jpdb-popup-reader-settings") && record.settings && typeof record.settings === "object" ? record.settings : null;
  }
  function pickFile(root, type) {
    const inputEl = root.querySelector(`input[data-file="${type}"]`);
    if (!inputEl) return Promise.resolve(null);
    return new Promise((resolve) => {
      inputEl.onchange = () => {
        var _a;
        const file = ((_a = inputEl.files) == null ? void 0 : _a[0]) ?? null;
        inputEl.value = "";
        resolve(file);
      };
      inputEl.click();
    });
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function dateStamp() {
    return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  }
  const bootWindow = window;
  if (!bootWindow.__yomuReaderAppInitialized) {
    bootWindow.__yomuReaderAppInitialized = true;
    bootWindow.__jpdbPopupReaderInitialized = true;
    void new ReaderApp().init();
  }

})();