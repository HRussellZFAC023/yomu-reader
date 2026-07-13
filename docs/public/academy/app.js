(function() {
  "use strict";
  class AccessError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
      this.name = "AccessError";
    }
  }
  function createAccessGateway(location2 = window.location) {
    const remote = new HttpAccessGateway("/academy/api/session");
    return localQaHost(location2.hostname) ? new LocalQaFallbackGateway(remote, new LocalQaAccessGateway()) : remote;
  }
  class HttpAccessGateway {
    constructor(endpoint, request2 = fetch) {
      this.endpoint = endpoint;
      this.request = request2;
    }
    async exchange(code, signal) {
      const normalized = normalizeCode(code);
      let response;
      try {
        response = await this.request(this.endpoint, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: normalized }),
          signal
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new AccessError("unavailable", "Invitation service unavailable.");
      }
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        throw new AccessError("invalid", "Invitation was not accepted.");
      }
      if (!response.ok) throw new AccessError("unavailable", `Invitation service returned ${response.status}.`);
      return normalizeSession(await response.json(), "cloudflare");
    }
  }
  class LocalQaAccessGateway {
    async exchange(code) {
      if (normalizeCode(code) !== "UCL2026") throw new AccessError("invalid", "Invitation was not accepted.");
      const now = Date.now();
      return {
        sessionId: `local-qa-${crypto.randomUUID()}`,
        expiresAt: now + 8 * 60 * 6e4,
        offlineResumeUntil: now + 30 * 24 * 60 * 6e4,
        source: "local-qa"
      };
    }
  }
  function sessionCanResume(session, now, online) {
    return online ? session.expiresAt > now : session.offlineResumeUntil > now;
  }
  class LocalQaFallbackGateway {
    constructor(remote, local) {
      this.remote = remote;
      this.local = local;
    }
    async exchange(code, signal) {
      try {
        return await this.remote.exchange(code, signal);
      } catch (error) {
        if (error instanceof AccessError && error.code === "unavailable") return this.local.exchange(code, signal);
        throw error;
      }
    }
  }
  function normalizeCode(code) {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,64}$/.test(normalized)) throw new AccessError("invalid", "Invitation code is malformed.");
    return normalized;
  }
  function normalizeSession(value, source) {
    if (!isRecord$1(value)) throw new AccessError("malformed", "Invitation response is malformed.");
    const sessionId = typeof value.sessionId === "string" ? value.sessionId.trim() : "";
    const expiresAt = readTimestamp(value.expiresAt);
    const offlineResumeUntil = readTimestamp(value.offlineResumeUntil);
    if (!sessionId || expiresAt <= Date.now() || offlineResumeUntil < expiresAt) {
      throw new AccessError("malformed", "Invitation response is incomplete.");
    }
    return { sessionId, expiresAt, offlineResumeUntil, source };
  }
  function readTimestamp(value) {
    if (typeof value === "number" && Number.isSafeInteger(value)) return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
    return 0;
  }
  function localQaHost(hostname) {
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  }
  function isRecord$1(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  class BrowserMediaBus {
    media;
    operation = 0;
    currentTrackId = null;
    targetVolume = 0;
    disposed = false;
    constructor(createMedia = () => new Audio()) {
      this.media = createMedia();
      this.media.preload = "metadata";
      this.media.crossOrigin = "anonymous";
    }
    async play(track, volume2, fadeMs) {
      this.assertActive();
      const operation = ++this.operation;
      const nextVolume = clamp$3(volume2);
      if (this.currentTrackId === track.id) {
        this.media.loop = track.loop;
        this.targetVolume = nextVolume;
        await this.media.play();
        if (operation === this.operation) await this.rampTo(nextVolume, fadeMs, operation);
        return;
      }
      if (this.currentTrackId) await this.rampTo(0, Math.floor(fadeMs / 2), operation);
      if (operation !== this.operation || this.disposed) return;
      this.media.pause();
      this.media.src = track.url;
      this.media.loop = track.loop;
      this.media.currentTime = 0;
      this.media.volume = 0;
      this.media.load();
      this.currentTrackId = track.id;
      this.targetVolume = nextVolume;
      await this.media.play();
      if (operation === this.operation) await this.rampTo(nextVolume, Math.ceil(fadeMs / 2), operation);
    }
    stop(fadeMs) {
      if (this.disposed) return;
      const operation = ++this.operation;
      void this.rampTo(0, fadeMs, operation).finally(() => {
        if (operation !== this.operation || this.disposed) return;
        this.media.pause();
        this.media.removeAttribute("src");
        this.media.load();
        this.currentTrackId = null;
        this.targetVolume = 0;
      });
    }
    setVolume(volume2) {
      if (this.disposed) return;
      this.targetVolume = clamp$3(volume2);
      this.media.volume = this.targetVolume;
    }
    pause() {
      if (!this.disposed) this.media.pause();
    }
    async resume() {
      if (this.disposed || !this.currentTrackId) return;
      await this.media.play();
      this.media.volume = this.targetVolume;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.operation += 1;
      this.media.pause();
      this.media.removeAttribute("src");
      this.media.load();
      this.currentTrackId = null;
    }
    async rampTo(target, durationMs, operation) {
      const start = this.media.volume;
      const end = clamp$3(target);
      if (durationMs <= 0 || start === end) {
        if (operation === this.operation && !this.disposed) this.media.volume = end;
        return;
      }
      const startedAt = performance.now();
      await new Promise((resolve) => {
        const step = (now) => {
          if (operation !== this.operation || this.disposed) {
            resolve();
            return;
          }
          const progress = Math.min(1, (now - startedAt) / durationMs);
          this.media.volume = start + (end - start) * progress;
          if (progress >= 1) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }
    assertActive() {
      if (this.disposed) throw new Error("Audio bus has been disposed.");
    }
  }
  class SilentSfxPlayback {
    unlock() {
    }
    play(_cue, _volume) {
    }
    dispose() {
    }
  }
  function clamp$3(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }
  class BrowserSpeechPronunciationService {
    constructor(director) {
      this.director = director;
    }
    async play(term, reading) {
      if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
        throw new Error("Japanese browser speech is unavailable.");
      }
      await this.director.unlock();
      const releaseDuck = this.director.beginExternalLesson();
      let disposed = false;
      const utterance = new SpeechSynthesisUtterance(reading?.trim() || term.trim());
      utterance.lang = "ja-JP";
      utterance.rate = 0.84;
      utterance.volume = this.director.settings.muted ? 0 : this.director.settings.volumes.lesson;
      const release = () => {
        if (disposed) return;
        disposed = true;
        releaseDuck();
      };
      utterance.addEventListener("end", release, { once: true });
      utterance.addEventListener("error", release, { once: true });
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
      return {
        dispose() {
          if (!disposed) speechSynthesis.cancel();
          release();
        }
      };
    }
  }
  const SLOT_SETTINGS = {
    silence: { crossfadeMs: 600, lessonDuck: 0.3 },
    "opening.invitation": { crossfadeMs: 1200, lessonDuck: 0.28 },
    "campus.evening": { crossfadeMs: 1200, lessonDuck: 0.3 },
    "classroom.focus": { crossfadeMs: 900, lessonDuck: 0.25 },
    "library.quiet": { crossfadeMs: 900, lessonDuck: 0.2 },
    "lab.listening": { crossfadeMs: 700, lessonDuck: 0.18 },
    "cafe.social": { crossfadeMs: 1e3, lessonDuck: 0.28 },
    "bond.quiet": { crossfadeMs: 1300, lessonDuck: 0.24 },
    "mystery.page": { crossfadeMs: 1e3, lessonDuck: 0.2 },
    "challenge.kanji": { crossfadeMs: 450, lessonDuck: 0.35 },
    "challenge.major": { crossfadeMs: 450, lessonDuck: 0.35 },
    "unlock.world": { crossfadeMs: 800, lessonDuck: 0.3 },
    "support.kindness": { crossfadeMs: 1200, lessonDuck: 0.22 },
    "resolve.late": { crossfadeMs: 1e3, lessonDuck: 0.28 },
    "ending.reflective": { crossfadeMs: 1500, lessonDuck: 0.2 }
  };
  const SILENT_AUDIO_CATALOG = createAudioCatalog();
  function createAudioCatalog(overrides = {}) {
    return Object.freeze(Object.fromEntries(Object.entries(SLOT_SETTINGS).map(([key, settings]) => {
      const slot = key;
      const override = overrides[slot] ?? {};
      const definition = {
        slot,
        crossfadeMs: finiteDuration(override.crossfadeMs, settings.crossfadeMs),
        lessonDuck: volume$1(override.lessonDuck, settings.lessonDuck),
        ...override.music ? { music: validateTrack(override.music) } : {},
        ...override.ambience ? { ambience: validateTrack(override.ambience) } : {}
      };
      return [slot, Object.freeze(definition)];
    })));
  }
  function trackCanPlay(track, releaseMode) {
    const rights = track.rights;
    if (!rights.reviewed || !rights.owner.trim() || !rights.licence.trim() || !rights.source.trim()) return false;
    if (releaseMode && rights.scope !== "release") return false;
    try {
      const url = new URL(track.url, globalThis.location?.origin ?? "https://yomureader.com");
      return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "blob:";
    } catch {
      return false;
    }
  }
  function validateTrack(track) {
    if (!track.id.trim() || !track.title.trim() || !track.url.trim()) throw new TypeError("Audio tracks need id, title, and URL.");
    if (!Number.isFinite(track.gain) || track.gain < 0 || track.gain > 1) throw new TypeError(`Audio track ${track.id} has invalid gain.`);
    return structuredClone(track);
  }
  function finiteDuration(value, fallback) {
    return value === void 0 ? fallback : Number.isFinite(value) ? Math.max(0, value) : fallback;
  }
  function volume$1(value, fallback) {
    return value === void 0 ? fallback : Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
  }
  const ACADEMY_AUDIO_SETTINGS_KEY = "yomu:academy:audio:v1";
  const DEFAULT_AUDIO_SETTINGS = Object.freeze({
    muted: false,
    volumes: Object.freeze({ music: 0.7, ambience: 0.65, lesson: 1, sfx: 0.8 })
  });
  function loadAudioSettings(storage) {
    if (!storage) return cloneDefaults();
    try {
      const value = JSON.parse(storage.getItem(ACADEMY_AUDIO_SETTINGS_KEY) ?? "null");
      if (!isRecord(value) || !isRecord(value.volumes)) return cloneDefaults();
      return {
        muted: typeof value.muted === "boolean" ? value.muted : false,
        volumes: {
          music: volume(value.volumes.music, DEFAULT_AUDIO_SETTINGS.volumes.music),
          ambience: volume(value.volumes.ambience, DEFAULT_AUDIO_SETTINGS.volumes.ambience),
          lesson: volume(value.volumes.lesson, DEFAULT_AUDIO_SETTINGS.volumes.lesson),
          sfx: volume(value.volumes.sfx, DEFAULT_AUDIO_SETTINGS.volumes.sfx)
        }
      };
    } catch {
      return cloneDefaults();
    }
  }
  function saveAudioSettings(storage, settings) {
    try {
      storage?.setItem(ACADEMY_AUDIO_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
    }
  }
  function withAudioVolume(settings, bus, value) {
    return { ...settings, volumes: { ...settings.volumes, [bus]: clampVolume(value) } };
  }
  function clampVolume(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }
  function volume(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? clampVolume(value) : fallback;
  }
  function cloneDefaults() {
    return { muted: DEFAULT_AUDIO_SETTINGS.muted, volumes: { ...DEFAULT_AUDIO_SETTINGS.volumes } };
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  class AudioDirector {
    catalog;
    buses;
    sfx;
    storage;
    releaseMode;
    listeners = /* @__PURE__ */ new Set();
    currentTracks = {
      music: null,
      ambience: null,
      lesson: null
    };
    settingsValue;
    stateValue = "locked";
    requestedTheme = "silence";
    transition = 0;
    ownedLessonDuck = 1;
    externalLessonDucks = /* @__PURE__ */ new Map();
    nextExternalLessonId = 0;
    duckActive = false;
    suspendedFrom = null;
    constructor(options) {
      this.catalog = options.catalog;
      this.buses = { music: options.music, ambience: options.ambience, lesson: options.lesson };
      this.sfx = options.sfx;
      this.storage = options.storage ?? null;
      this.releaseMode = options.releaseMode ?? true;
      this.settingsValue = loadAudioSettings(this.storage);
    }
    get state() {
      return this.stateValue;
    }
    get theme() {
      return this.requestedTheme;
    }
    get settings() {
      return { ...this.settingsValue, volumes: { ...this.settingsValue.volumes } };
    }
    onEvent(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    async unlock() {
      this.assertActive();
      if (this.stateValue !== "locked") return;
      this.sfx.unlock();
      this.setState("ready");
      await this.applyTheme();
    }
    async setTheme(slot) {
      this.assertActive();
      if (!this.catalog[slot]) throw new RangeError(`Unknown audio theme: ${slot}`);
      this.requestedTheme = slot;
      this.emit({ type: "theme", slot });
      if (this.stateValue !== "locked" && this.stateValue !== "suspended") await this.applyTheme();
    }
    async startLesson(playback) {
      this.assertReady("Lesson audio");
      if (!trackCanPlay(playback.track, this.releaseMode)) return false;
      const definition = this.catalog[this.requestedTheme];
      this.ownedLessonDuck = clamp$2(playback.duck ?? definition.lessonDuck);
      this.syncDuck(true);
      try {
        await this.buses.lesson.play(playback.track, this.trackVolume("lesson", playback.track), 120);
        this.setTrack("lesson", playback.track);
        this.syncDuck();
        this.refreshPlaybackState();
        return true;
      } catch (error) {
        this.setTrack("lesson", null);
        this.ownedLessonDuck = 1;
        this.syncDuck();
        this.emit({ type: "error", operation: "start-lesson", error });
        return false;
      }
    }
    finishLesson() {
      if (this.stateValue === "disposed") return;
      this.buses.lesson.stop(120);
      this.setTrack("lesson", null);
      this.ownedLessonDuck = 1;
      this.syncDuck();
      this.refreshPlaybackState();
    }
    /** Duck the owned music bus while browser speech or recording plays. */
    beginExternalLesson(duck = this.catalog[this.requestedTheme].lessonDuck) {
      this.assertReady("External lesson audio");
      const lessonId = ++this.nextExternalLessonId;
      this.externalLessonDucks.set(lessonId, clamp$2(duck));
      this.syncDuck();
      this.setState("playing");
      let released = false;
      return () => {
        if (released || this.stateValue === "disposed") return;
        released = true;
        this.externalLessonDucks.delete(lessonId);
        this.syncDuck();
        this.refreshPlaybackState();
      };
    }
    playSfx(cue) {
      if (!this.canPlay()) return;
      this.sfx.play(cue, this.effectiveVolume("sfx"));
      this.emit({ type: "sfx", cue });
    }
    setMuted(muted) {
      this.updateSettings({ ...this.settingsValue, muted });
    }
    setVolume(bus, value) {
      this.updateSettings(withAudioVolume(this.settingsValue, bus, value));
    }
    async handleVisibility(hidden) {
      this.assertActive();
      if (hidden) {
        if (this.stateValue === "suspended" || this.stateValue === "locked") return;
        this.suspendedFrom = this.stateValue;
        Object.values(this.buses).forEach((bus) => bus.pause());
        this.setState("suspended");
        return;
      }
      if (this.stateValue !== "suspended") return;
      try {
        await Promise.all(Object.values(this.buses).map((bus) => bus.resume()));
        this.setState(this.suspendedFrom ?? "ready");
        this.refreshPlaybackState();
      } catch (error) {
        this.emit({ type: "error", operation: "resume", error });
        this.setState("silent");
      } finally {
        this.suspendedFrom = null;
      }
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      this.transition += 1;
      Object.values(this.buses).forEach((bus) => bus.dispose());
      this.sfx.dispose();
      this.listeners.clear();
      this.stateValue = "disposed";
    }
    async applyTheme() {
      const transition = ++this.transition;
      const definition = this.catalog[this.requestedTheme];
      const pairs = [
        ["music", definition.music],
        ["ambience", definition.ambience]
      ];
      await Promise.all(pairs.map(async ([busName, track]) => {
        const bus = this.buses[busName];
        if (!track || !trackCanPlay(track, this.releaseMode)) {
          bus.stop(definition.crossfadeMs);
          this.setTrack(busName, null);
          return;
        }
        try {
          const duck = busName === "music" ? this.currentDuckFactor() : 1;
          await bus.play(track, this.trackVolume(busName, track) * duck, definition.crossfadeMs);
          if (transition === this.transition) this.setTrack(busName, track);
        } catch (error) {
          if (transition !== this.transition) return;
          this.setTrack(busName, null);
          this.emit({ type: "error", operation: `theme-${busName}`, error });
        }
      }));
      if (transition === this.transition) this.refreshPlaybackState();
    }
    syncDuck(pendingOwnedLesson = false) {
      const factors = [...this.externalLessonDucks.values()];
      if (pendingOwnedLesson || this.currentTracks.lesson) factors.push(this.ownedLessonDuck);
      const active = factors.length > 0;
      const factor = active ? Math.min(...factors) : 1;
      this.buses.music.setVolume(this.currentMusicVolume(factor));
      if (active !== this.duckActive) this.emit({ type: "duck", active });
      this.duckActive = active;
    }
    updateSettings(settings) {
      this.settingsValue = { ...settings, volumes: { ...settings.volumes } };
      saveAudioSettings(this.storage, this.settingsValue);
      this.buses.music.setVolume(this.currentMusicVolume(this.currentDuckFactor()));
      this.buses.ambience.setVolume(this.currentTrackVolume("ambience"));
      this.buses.lesson.setVolume(this.currentTrackVolume("lesson"));
      this.emit({ type: "settings", settings: this.settings });
    }
    currentMusicVolume(duckFactor) {
      const track = this.catalog[this.requestedTheme].music;
      return track ? this.trackVolume("music", track) * duckFactor : 0;
    }
    currentDuckFactor() {
      const factors = [...this.externalLessonDucks.values()];
      if (this.currentTracks.lesson) factors.push(this.ownedLessonDuck);
      return factors.length ? Math.min(...factors) : 1;
    }
    currentTrackVolume(bus) {
      const track = this.currentTracks[bus];
      return track ? this.trackVolume(bus, track) : this.effectiveVolume(bus);
    }
    trackVolume(bus, track) {
      return clamp$2(this.effectiveVolume(bus) * track.gain);
    }
    effectiveVolume(bus) {
      return this.settingsValue.muted ? 0 : this.settingsValue.volumes[bus];
    }
    setTrack(bus, track) {
      if (this.currentTracks[bus]?.id === track?.id) return;
      this.currentTracks[bus] = track;
      this.emit({ type: "track", bus, trackId: track?.id ?? null });
    }
    refreshPlaybackState() {
      if (this.stateValue === "locked" || this.stateValue === "suspended" || this.stateValue === "disposed") return;
      const audible = Object.values(this.currentTracks).some(Boolean);
      this.setState(audible ? "playing" : "silent");
    }
    canPlay() {
      return this.stateValue !== "locked" && this.stateValue !== "suspended" && this.stateValue !== "disposed";
    }
    assertReady(operation) {
      this.assertActive();
      if (!this.canPlay()) throw new Error(`${operation} requires an unlocked, visible audio director.`);
    }
    assertActive() {
      if (this.stateValue === "disposed") throw new Error("Audio director has been disposed.");
    }
    setState(state) {
      if (this.stateValue === state) return;
      this.stateValue = state;
      this.emit({ type: "state", state });
    }
    emit(event) {
      for (const listener of this.listeners) listener(event);
    }
  }
  function clamp$2(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }
  const AAKASH_RAINY_DIRECTIONS_SCENE_ID = "scene:aakash-rainy-directions";
  function createAakashDirectionsActivity() {
    return {
      id: "activity:aakash-rainy-directions",
      kind: "choice",
      conceptIds: ["concept:directions-straight-right"],
      responseKind: "choice",
      prompt: {
        en: "Aakash asks: 「カフェはどこですか。」 The cafe is straight ahead, then right. What do you say?",
        ja: "アーカーシュさんが「カフェはどこですか」と聞きました。カフェはまっすぐ行って、右です。何と言いますか。"
      },
      payload: {
        reviewSeedId: "review:aakash-rainy-directions",
        reviewContent: {
          expression: "まっすぐ行って、右です。",
          reading: "まっすぐいって、みぎです",
          meanings: ["Go straight, then it is on the right."],
          sentence: "この道をまっすぐ行って、右です。"
        },
        options: [
          {
            id: "straight-right",
            label: {
              en: "Go straight along this road; it is on the right.",
              ja: "この道をまっすぐ行って、右です。"
            },
            correct: true,
            explanation: {
              en: "Exactly: まっすぐ gives the path, and 右 gives the final side.",
              ja: "そのとおりです。「まっすぐ」で道順を示し、「右」で最後の位置を示します。"
            }
          },
          {
            id: "straight-left",
            label: {
              en: "Go straight along this road; it is on the left.",
              ja: "この道をまっすぐ行って、左です。"
            },
            correct: false,
            errorTag: "direction-side-confusion",
            explanation: {
              en: "The route is straight, but the cafe is on the right, not the left.",
              ja: "まっすぐ行くところは合っていますが、カフェは左ではなく右です。"
            },
            repairPrompt: {
              en: "Keep まっすぐ and replace 左 with 右.",
              ja: "「まっすぐ」は残して、「左」を「右」に変えてください。"
            },
            nearbyExample: {
              en: "駅は右です means “The station is on the right.”",
              ja: "「駅は右です」は、駅が右側にあるという意味です。"
            }
          },
          {
            id: "turn-back",
            label: {
              en: "Turn back; it is behind you.",
              ja: "戻って、後ろです。"
            },
            correct: false,
            errorTag: "direction-path-confusion",
            explanation: {
              en: "Aakash should continue ahead rather than turn back.",
              ja: "アーカーシュさんは戻らず、前へ進みます。"
            },
            repairPrompt: {
              en: "Start with the forward path: まっすぐ行って…",
              ja: "前へ進む「まっすぐ行って」から始めてください。"
            },
            nearbyExample: {
              en: "まっすぐ行ってください means “Please go straight.”",
              ja: "「まっすぐ行ってください」は、前へ直進するよう頼む表現です。"
            }
          }
        ]
      }
    };
  }
  const choiceActivityPlugin = {
    kind: "choice",
    validate: validateChoice,
    render: renderChoice,
    grade(model, response) {
      const option = model.payload.options.find((candidate) => candidate.id === response);
      if (!option) throw new TypeError(`Unknown choice response: ${String(response)}`);
      return {
        outcome: option.correct ? "pass" : "lapse",
        score: option.correct ? 1 : 0,
        errorTags: option.errorTag ? [option.errorTag] : [],
        feedback: {
          explanation: option.explanation,
          ...option.repairPrompt ? { repairPrompt: option.repairPrompt } : {},
          ...option.nearbyExample ? { nearbyExample: option.nearbyExample } : {}
        }
      };
    },
    toReviewSeeds(model, result) {
      return model.conceptIds.map((conceptId) => ({
        id: `${model.payload.reviewSeedId}:${conceptId}`,
        conceptId,
        reason: result.outcome === "lapse" ? "repair" : "new-learning",
        ...model.sourceQuestionId ? { sourceQuestionId: model.sourceQuestionId } : {},
        content: model.payload.reviewContent
      }));
    }
  };
  function validateChoice(model) {
    const issues = [];
    if (!Array.isArray(model.payload?.options) || model.payload.options.length < 2) {
      issues.push({ path: "payload.options", message: "At least two choices are required." });
      return issues;
    }
    const ids = /* @__PURE__ */ new Set();
    let correct2 = 0;
    for (const [index, option] of model.payload.options.entries()) {
      if (!option.id.trim()) issues.push({ path: `payload.options.${index}.id`, message: "A stable id is required." });
      if (ids.has(option.id)) issues.push({ path: `payload.options.${index}.id`, message: "Choice ids must be unique." });
      ids.add(option.id);
      if (option.correct) correct2 += 1;
      if (!option.label.en.trim() || !option.label.ja.trim()) {
        issues.push({ path: `payload.options.${index}.label`, message: "English and Japanese labels are required." });
      }
      if (!option.explanation.en.trim() || !option.explanation.ja.trim()) {
        issues.push({ path: `payload.options.${index}.explanation`, message: "Bilingual feedback is required." });
      }
      if (!option.correct && (!option.repairPrompt?.en.trim() || !option.repairPrompt.ja.trim() || !option.nearbyExample?.en.trim() || !option.nearbyExample.ja.trim())) {
        issues.push({ path: `payload.options.${index}`, message: "Wrong choices need a bilingual repair and nearby example." });
      }
    }
    if (correct2 !== 1) issues.push({ path: "payload.options", message: "Exactly one choice must be correct." });
    if (!model.payload.reviewSeedId?.trim()) issues.push({ path: "payload.reviewSeedId", message: "A review seed id is required." });
    if (!model.payload.reviewContent?.expression.trim() || !model.payload.reviewContent.meanings.length) {
      issues.push({ path: "payload.reviewContent", message: "Reviewable expression and meaning are required." });
    }
    return issues;
  }
  function renderChoice(model, host2, submit) {
    const lifecycle = new AbortController();
    const root = document.createElement("section");
    root.className = "academy-activity academy-choice-activity";
    root.dataset.activityId = model.id;
    const heading = document.createElement("h2");
    heading.tabIndex = -1;
    heading.append(japanese(model.prompt.ja), support(model.prompt.en));
    const choices = document.createElement("div");
    choices.className = "academy-choice-options";
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-labelledby", `${model.id}-prompt`);
    heading.id = `${model.id}-prompt`;
    const feedback = document.createElement("div");
    feedback.className = "academy-activity-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    for (const option of model.payload.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "academy-choice-option";
      button.dataset.choiceId = option.id;
      button.append(japanese(option.label.ja), support(option.label.en));
      button.addEventListener("click", async () => {
        setDisabled(choices, true);
        try {
          const evaluation = await submit(option.id);
          root.dataset.outcome = evaluation.result.outcome;
          feedback.removeAttribute("aria-label");
          showFeedback(feedback, evaluation);
          host2.announce([
            evaluation.result.feedback.explanation.ja,
            evaluation.result.feedback.explanation.en
          ].join(" / "));
          if (evaluation.result.outcome === "lapse") setDisabled(choices, false);
        } catch (error) {
          setDisabled(choices, false);
          host2.announce(error instanceof Error ? error.message : String(error));
        }
      }, { signal: lifecycle.signal });
      choices.append(button);
    }
    root.append(heading, choices, feedback);
    host2.replace(root);
    return {
      focus() {
        heading.focus();
      },
      dispose() {
        lifecycle.abort();
        root.remove();
      }
    };
  }
  function showFeedback(root, evaluation) {
    const { feedback } = evaluation.result;
    root.replaceChildren(localizedParagraph(feedback.explanation, "academy-feedback-explanation"));
    if (feedback.repairPrompt) root.append(localizedParagraph(feedback.repairPrompt, "academy-feedback-repair"));
    if (feedback.nearbyExample) root.append(localizedParagraph(feedback.nearbyExample, "academy-feedback-example"));
  }
  function localizedParagraph(value, className) {
    const paragraph = document.createElement("p");
    paragraph.className = className;
    paragraph.append(japanese(value.ja), support(value.en));
    return paragraph;
  }
  function japanese(value) {
    const span = document.createElement("span");
    span.className = "academy-japanese";
    span.lang = "ja";
    span.textContent = value;
    return span;
  }
  function support(value) {
    const span = document.createElement("span");
    span.className = "academy-support";
    span.lang = "en";
    span.textContent = value;
    return span;
  }
  function setDisabled(root, disabled) {
    root.querySelectorAll("button").forEach((button) => {
      button.disabled = disabled;
    });
  }
  function createActivityRuntime(plugins) {
    const registry = /* @__PURE__ */ new Map();
    for (const plugin of plugins) {
      const kind = requireText$2(plugin.kind, "plugin.kind");
      if (registry.has(kind)) throw new Error(`Duplicate activity plugin: ${kind}`);
      registry.set(kind, plugin);
    }
    const pluginFor = (model) => {
      const issues = validateBaseModel(model);
      if (issues.length) throw new ActivityValidationError(model?.id ?? "(unknown)", issues);
      const plugin = registry.get(model.kind);
      if (!plugin) throw new Error(`No activity plugin registered for ${model.kind}.`);
      return plugin;
    };
    const evaluate = (model, response) => {
      const plugin = pluginFor(model);
      const issues = plugin.validate(model);
      if (issues.length) throw new ActivityValidationError(model.id, issues);
      const result = normalizeGrade(plugin.grade(model, response));
      const reviewSeeds = plugin.toReviewSeeds(model, result).map((seed) => normalizeReviewSeed(seed, model));
      return {
        result,
        attempt: {
          kind: "attempt-recorded",
          activityId: model.id,
          ...model.sourceQuestionId ? { sourceQuestionId: model.sourceQuestionId } : {},
          conceptIds: unique$1(model.conceptIds),
          responseKind: model.responseKind,
          outcome: result.outcome,
          score: result.score,
          errorTags: result.errorTags
        },
        reviewSeeds
      };
    };
    return {
      validate(model) {
        const issues = validateBaseModel(model);
        if (issues.length) return issues;
        const plugin = registry.get(model.kind);
        return plugin ? plugin.validate(model) : [{ path: "kind", message: `No activity plugin registered for ${model.kind}.` }];
      },
      evaluate,
      mount(model, host2, onEvaluation) {
        const plugin = pluginFor(model);
        const issues = plugin.validate(model);
        if (issues.length) throw new ActivityValidationError(model.id, issues);
        return plugin.render(model, host2, async (response) => {
          const evaluation = evaluate(model, response);
          await onEvaluation(evaluation);
          return evaluation;
        });
      }
    };
  }
  class ActivityValidationError extends Error {
    constructor(activityId, issues) {
      super(`Activity ${activityId} is invalid: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
      this.activityId = activityId;
      this.issues = issues;
      this.name = "ActivityValidationError";
    }
  }
  function validateBaseModel(model) {
    const issues = [];
    if (!model || typeof model !== "object") return [{ path: "", message: "Activity model is required." }];
    if (!text(model.id)) issues.push({ path: "id", message: "A stable id is required." });
    if (!text(model.kind)) issues.push({ path: "kind", message: "A plugin kind is required." });
    if (!text(model.responseKind)) issues.push({ path: "responseKind", message: "A response kind is required." });
    if (!Array.isArray(model.conceptIds) || !model.conceptIds.length) {
      issues.push({ path: "conceptIds", message: "At least one Concept is required." });
    }
    if (!text(model.prompt?.en) || !text(model.prompt?.ja)) {
      issues.push({ path: "prompt", message: "English and Japanese prompt text are required." });
    }
    return issues;
  }
  function normalizeGrade(result) {
    if (result.outcome !== "pass" && result.outcome !== "lapse") throw new TypeError("Invalid grade outcome.");
    if (!Number.isFinite(result.score) || result.score < 0 || result.score > 1) {
      throw new TypeError("Grade score must be between 0 and 1.");
    }
    const feedback = result.feedback;
    if (!text(feedback?.explanation?.en) || !text(feedback?.explanation?.ja)) {
      throw new TypeError("Grade feedback needs an English and Japanese explanation.");
    }
    if (result.outcome === "lapse" && (!text(feedback.repairPrompt?.en) || !text(feedback.repairPrompt?.ja) || !text(feedback.nearbyExample?.en) || !text(feedback.nearbyExample?.ja))) {
      throw new TypeError("A lapse must include a bilingual repair prompt and nearby example.");
    }
    return {
      ...result,
      errorTags: unique$1(result.errorTags),
      feedback: structuredClone(feedback)
    };
  }
  function normalizeReviewSeed(seed, model) {
    const conceptId = requireText$2(seed.conceptId, "reviewSeed.conceptId");
    if (!model.conceptIds.includes(conceptId)) throw new TypeError(`Review seed uses unrelated Concept ${conceptId}.`);
    if (seed.reason !== "new-learning" && seed.reason !== "repair") throw new TypeError("Invalid review seed reason.");
    return {
      id: requireText$2(seed.id, "reviewSeed.id"),
      conceptId,
      reason: seed.reason,
      ...seed.sourceQuestionId ? { sourceQuestionId: requireText$2(seed.sourceQuestionId, "sourceQuestionId") } : {},
      content: {
        expression: requireText$2(seed.content.expression, "reviewSeed.content.expression"),
        ...seed.content.reading ? { reading: requireText$2(seed.content.reading, "reviewSeed.content.reading") } : {},
        meanings: unique$1(seed.content.meanings),
        ...seed.content.sentence ? { sentence: requireText$2(seed.content.sentence, "reviewSeed.content.sentence") } : {}
      }
    };
  }
  function requireText$2(value, label) {
    const normalized = text(value);
    if (!normalized) throw new TypeError(`${label} must be non-empty.`);
    return normalized;
  }
  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function unique$1(values) {
    return [...new Set(values.map((value) => requireText$2(value, "id")))].sort();
  }
  function createSourceLibrary(data) {
    const documents = indexById(data.documents, validateDocument, "document");
    const occurrences = indexById(data.occurrences, validateOccurrence, "occurrence");
    const questions = indexById(data.questions, validateQuestion, "question");
    const media = indexById(data.media, validateMedia, "media");
    for (const occurrence of occurrences.values()) {
      if (!documents.has(occurrence.documentId)) missing("document", occurrence.documentId, `occurrence ${occurrence.id}`);
    }
    for (const question of questions.values()) {
      if (!documents.has(question.documentId)) missing("document", question.documentId, `question ${question.id}`);
      for (const occurrenceId of question.occurrenceIds) {
        const occurrence = occurrences.get(occurrenceId);
        if (!occurrence) missing("occurrence", occurrenceId, `question ${question.id}`);
        if (occurrence.documentId !== question.documentId) {
          throw new Error(`Question ${question.id} crosses source documents through occurrence ${occurrenceId}.`);
        }
      }
      for (const mediaId of question.mediaIds) {
        const item = media.get(mediaId);
        if (!item) missing("media", mediaId, `question ${question.id}`);
        if (item.documentId !== question.documentId) {
          throw new Error(`Question ${question.id} references media ${mediaId} from another document.`);
        }
      }
    }
    return {
      async getDocument(id) {
        return clone$1(required(documents, id, "document"));
      },
      async getQuestion(id) {
        return clone$1(required(questions, id, "question"));
      },
      async *questionsForOccurrence(id) {
        required(occurrences, id, "occurrence");
        const matching = [...questions.values()].filter((question) => question.occurrenceIds.includes(id)).sort(compareQuestions);
        for (const question of matching) yield clone$1(question);
      },
      async mediaForQuestion(id) {
        const question = required(questions, id, "question");
        return question.mediaIds.map((mediaId) => clone$1(required(media, mediaId, "media")));
      }
    };
  }
  function validateDocument(value) {
    requireId(value.id, "document.id");
    if (!/^[a-f0-9]{64}$/iu.test(value.sha256)) throw new TypeError(`Document ${value.id} has an invalid SHA-256.`);
    requireText$1(value.mediaType, "document.mediaType");
    requireText$1(value.originalName, "document.originalName");
    requireText$1(value.extractionRevision, "document.extractionRevision");
    return clone$1(value);
  }
  function validateOccurrence(value) {
    requireId(value.id, "occurrence.id");
    requireId(value.documentId, "occurrence.documentId");
    requireId(value.courseId, "occurrence.courseId");
    requireId(value.sectionId, "occurrence.sectionId");
    if (value.weekId !== void 0) requireId(value.weekId, "occurrence.weekId");
    requireText$1(value.sourcePath, "occurrence.sourcePath");
    return clone$1(value);
  }
  function validateQuestion(value) {
    requireId(value.id, "question.id");
    requireId(value.documentId, "question.documentId");
    requireNonEmptyIds(value.occurrenceIds, "question.occurrenceIds");
    validateLocus(value.locus, `question ${value.id}`);
    validateLocalizedText(value.instructions, `question ${value.id} instructions`);
    validateLocalizedText(value.prompt, `question ${value.id} prompt`);
    requireText$1(value.responseKind, "question.responseKind");
    uniqueIds(value.mediaIds, "question.mediaIds");
    requireText$1(value.extractionRevision, "question.extractionRevision");
    return clone$1(value);
  }
  function validateMedia(value) {
    requireId(value.id, "media.id");
    requireId(value.documentId, "media.documentId");
    validateLocus(value.locus, `media ${value.id}`);
    requireText$1(value.role, "media.role");
    requireText$1(value.mediaType, "media.mediaType");
    if (!/^[a-f0-9]{64}$/iu.test(value.sha256)) throw new TypeError(`Media ${value.id} has an invalid SHA-256.`);
    validateLocalizedText(value.alt, `media ${value.id} alt`);
    return clone$1(value);
  }
  function validateLocus(value, label) {
    if (!Number.isSafeInteger(value.page) || value.page < 1) throw new TypeError(`${label} must use a one-based page.`);
    if (value.bbox) {
      const coordinates = [value.bbox.x, value.bbox.y, value.bbox.width, value.bbox.height];
      if (coordinates.some((coordinate) => !Number.isFinite(coordinate)) || value.bbox.width <= 0 || value.bbox.height <= 0) {
        throw new TypeError(`${label} has an invalid bounding box.`);
      }
    }
  }
  function validateLocalizedText(value, label) {
    requireText$1(value.en, `${label}.en`);
    requireText$1(value.ja, `${label}.ja`);
  }
  function indexById(values, validate, label) {
    if (!Array.isArray(values)) throw new TypeError(`${label}s must be an array.`);
    const index = /* @__PURE__ */ new Map();
    for (const candidate of values) {
      const value = validate(candidate);
      if (index.has(value.id)) throw new Error(`Duplicate ${label} id: ${value.id}`);
      index.set(value.id, value);
    }
    return index;
  }
  function required(values, id, label) {
    const normalized = requireId(id, label);
    const value = values.get(normalized);
    if (!value) throw new Error(`Unknown ${label}: ${normalized}`);
    return value;
  }
  function missing(kind, id, owner) {
    throw new Error(`Unknown ${kind} ${id} referenced by ${owner}.`);
  }
  function compareQuestions(left, right) {
    return left.locus.page - right.locus.page || (left.locus.printedNumber ?? "").localeCompare(right.locus.printedNumber ?? "") || left.id.localeCompare(right.id);
  }
  function requireNonEmptyIds(values, label) {
    if (!values.length) throw new TypeError(`${label} must not be empty.`);
    uniqueIds(values, label);
  }
  function uniqueIds(values, label) {
    const ids = values.map((value) => requireId(value, label));
    if (new Set(ids).size !== ids.length) throw new TypeError(`${label} contains duplicates.`);
  }
  function requireId(value, label) {
    const normalized = requireText$1(value, label);
    if (!/^[a-z0-9][a-z0-9._:-]*$/iu.test(normalized)) throw new TypeError(`${label} contains unsupported characters.`);
    return normalized;
  }
  function requireText$1(value, label) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be non-empty.`);
    return value.trim();
  }
  function clone$1(value) {
    return structuredClone(value);
  }
  let defaultLoad = null;
  function loadVerticalSliceContent(fetcher = fetch) {
    if (fetcher !== fetch) return load(fetcher);
    defaultLoad ??= load(fetcher).catch((error) => {
      defaultLoad = null;
      throw error;
    });
    return defaultLoad;
  }
  async function load(fetcher) {
    const [sourceData, augmentationData] = await Promise.all([
      fetchJson(fetcher, "/academy/content/vertical-slice/source-library.v1.json"),
      fetchJson(fetcher, "/academy/content/vertical-slice/augmentation.v1.json")
    ]);
    const sourceLibrary = createSourceLibrary(sourceData);
    const record = augmentationData;
    const augmentation = structuredClone(record.augmentation);
    const activity = structuredClone(record.activity);
    const issues = createActivityRuntime([choiceActivityPlugin]).validate(activity);
    if (issues.length) {
      throw new Error(`Vertical-slice source activity is invalid: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
    }
    if (augmentation.sourceQuestionId !== activity.sourceQuestionId) {
      throw new Error("Vertical-slice source and augmentation ids do not match.");
    }
    return { sourceLibrary, augmentation, activity };
  }
  async function fetchJson(fetcher, url) {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`Could not load Academy content shard: ${url} (${response.status})`);
    return response.json();
  }
  function createLearnerRecord(options = {}) {
    const repository = options.repository ?? createMemoryLearnerEventRepository();
    const now = options.now ?? Date.now;
    const createEventId = options.createEventId ?? defaultEventId;
    let pending = Promise.resolve();
    const recordMany = (inputs) => {
      const operation = pending.then(async () => {
        const events = inputs.map((input) => normalizeEvent(input, now, createEventId));
        await repository.append(events);
        return clone(events);
      });
      pending = operation.then(() => void 0, () => void 0);
      return operation;
    };
    const history = async () => {
      await pending;
      return clone(await repository.readAll());
    };
    return {
      async record(input) {
        const [event] = await recordMany([input]);
        return event;
      },
      recordMany,
      history,
      async snapshot() {
        return projectLearnerRecord(await history());
      }
    };
  }
  function createMemoryLearnerEventRepository(initial = []) {
    const events = initial.map(validateEvent);
    return {
      async readAll() {
        return clone(events);
      },
      async append(candidates) {
        for (const candidate of candidates.map(validateEvent)) {
          const previous = events.find((event) => event.eventId === candidate.eventId);
          if (!previous) events.push(clone(candidate));
          else if (!learnerEventsAreEquivalent(previous, candidate)) {
            throw new Error(`Conflicting learner event id: ${candidate.eventId}`);
          }
        }
      }
    };
  }
  function learnerEventsAreEquivalent(left, right) {
    const { at: _leftAt, ...leftPayload } = left;
    const { at: _rightAt, ...rightPayload } = right;
    return JSON.stringify(leftPayload) === JSON.stringify(rightPayload);
  }
  function projectLearnerRecord(events) {
    const activities = {};
    const reviewRatings = {};
    const grammarKnowledge = {};
    const completedScenes = /* @__PURE__ */ new Set();
    const bonds = {};
    const unlockedAssets = /* @__PURE__ */ new Set();
    let profile = null;
    let latestPlacement = null;
    let curriculumEntry = null;
    const scheduledReviews = {};
    let lastEventAt = null;
    for (const event of events.map(validateEvent)) {
      lastEventAt = lastEventAt === null ? event.at : Math.max(lastEventAt, event.at);
      switch (event.kind) {
        case "attempt-recorded": {
          const previous = activities[event.activityId];
          activities[event.activityId] = {
            activityId: event.activityId,
            attemptCount: (previous?.attemptCount ?? 0) + 1,
            lapseCount: (previous?.lapseCount ?? 0) + (event.outcome === "lapse" ? 1 : 0),
            lastOutcome: event.outcome,
            lastAttemptAt: event.at,
            ...event.sourceQuestionId ? { sourceQuestionId: event.sourceQuestionId } : {},
            conceptIds: unique(event.conceptIds)
          };
          break;
        }
        case "review-rated":
          reviewRatings[event.reviewItemId] = event.rating;
          break;
        case "grammar-known-changed":
          grammarKnowledge[event.conceptId] = event.knowledge;
          break;
        case "scene-completed":
          completedScenes.add(event.sceneId);
          break;
        case "bond-changed":
          bonds[event.characterId] = Math.max(0, (bonds[event.characterId] ?? 0) + event.delta);
          break;
        case "asset-unlocked":
          unlockedAssets.add(event.assetId);
          break;
        case "profile-changed":
          profile = clone(event.profile);
          break;
        case "placement-assessed":
          latestPlacement = clone(event);
          break;
        case "curriculum-entry-chosen":
          curriculumEntry = clone(event);
          break;
        case "review-scheduled":
          scheduledReviews[event.reviewItemId] = clone(event);
          break;
      }
    }
    return {
      eventCount: events.length,
      lastEventAt,
      activities,
      reviewRatings,
      grammarKnowledge,
      completedScenes: [...completedScenes].sort(),
      bonds,
      unlockedAssets: [...unlockedAssets].sort(),
      profile,
      latestPlacement,
      curriculumEntry,
      scheduledReviews
    };
  }
  function normalizeEvent(input, now, createEventId) {
    return validateEvent({
      ...input,
      schemaVersion: 1,
      eventId: input.eventId ?? createEventId(),
      at: input.at ?? now()
    });
  }
  function validateEvent(event) {
    validateEventEnvelope(event);
    validateEventPayload(event);
    return clone(event);
  }
  function validateEventEnvelope(event) {
    if (!event || event.schemaVersion !== 1) throw new TypeError("Learner event schemaVersion must be 1.");
    requireText(event.eventId, "eventId");
    if (!Number.isSafeInteger(event.at) || event.at < 0) throw new TypeError("Event timestamp must be a non-negative integer.");
  }
  function validateEventPayload(event) {
    switch (event.kind) {
      case "attempt-recorded":
        validateAttemptRecorded(event);
        break;
      case "review-rated":
        validateReviewRated(event);
        break;
      case "grammar-known-changed":
        validateGrammarKnownChanged(event);
        break;
      case "scene-completed":
        requireText(event.sceneId, "sceneId");
        break;
      case "bond-changed":
        requireText(event.characterId, "characterId");
        if (!Number.isSafeInteger(event.delta)) throw new TypeError("Bond delta must be an integer.");
        break;
      case "asset-unlocked":
        requireText(event.assetId, "assetId");
        break;
      case "profile-changed":
        validateProfileChanged(event);
        break;
      case "placement-assessed":
        validatePlacementAssessed(event);
        break;
      case "curriculum-entry-chosen":
        validateCurriculumEntryChosen(event);
        break;
      case "review-scheduled":
        validateReviewScheduled(event);
        break;
      default:
        throw new TypeError("Unknown learner event kind.");
    }
  }
  function validateAttemptRecorded(event) {
    requireText(event.activityId, "activityId");
    requireText(event.responseKind, "responseKind");
    unique(event.conceptIds.map((id) => requireText(id, "conceptId")));
    if (event.outcome !== "pass" && event.outcome !== "lapse") throw new TypeError("Invalid attempt outcome.");
    if (event.score !== void 0 && (!Number.isFinite(event.score) || event.score < 0 || event.score > 1)) {
      throw new TypeError("Attempt score must be between 0 and 1.");
    }
  }
  function validateReviewRated(event) {
    requireText(event.reviewItemId, "reviewItemId");
    if (!["again", "hard", "good", "easy"].includes(event.rating)) throw new TypeError("Invalid review rating.");
  }
  function validateGrammarKnownChanged(event) {
    requireText(event.conceptId, "conceptId");
    if (!["unknown", "learning", "known", "mastered"].includes(event.knowledge)) throw new TypeError("Invalid grammar knowledge.");
  }
  function validateProfileChanged(event) {
    requireText(event.profile.displayName, "profile.displayName");
    requireText(event.profile.learningReason, "profile.learningReason");
    requireText(event.profile.portraitId, "profile.portraitId");
  }
  function validatePlacementAssessed(event) {
    requireText(event.assessmentId, "assessmentId");
    requireJlptBand(event.targetBand, "targetBand");
    requireJlptBand(event.recommendedBand, "recommendedBand");
    if (!event.itemIds.length) throw new TypeError("Placement assessment needs item ids.");
    unique(event.itemIds.map((id) => requireText(id, "placement.itemId")));
    for (const skill of ["language-knowledge", "reading", "listening", "speaking-confidence", "writing-confidence"]) {
      const score = event.scores[skill];
      if (!Number.isFinite(score) || score < 0 || score > 1) throw new TypeError(`Invalid placement score for ${skill}.`);
    }
    if (event.calibration !== "vertical-slice" && event.calibration !== "validated") throw new TypeError("Invalid placement calibration.");
  }
  function validateCurriculumEntryChosen(event) {
    if (!["lesson-zero", "manual-band", "placement-mock"].includes(event.route)) throw new TypeError("Invalid curriculum entry route.");
    if (event.route === "lesson-zero" && event.band !== void 0) throw new TypeError("Lesson 0 entry cannot carry a JLPT band.");
    if (event.route !== "lesson-zero" && !event.band) throw new TypeError("Band entry requires a JLPT band.");
    if (event.band) requireJlptBand(event.band, "curriculumEntry.band");
  }
  function validateReviewScheduled(event) {
    requireText(event.reviewItemId, "reviewItemId");
    requireText(event.conceptId, "conceptId");
    if (!Number.isSafeInteger(event.dueAt) || event.dueAt < 0) throw new TypeError("Review dueAt must be a non-negative integer.");
    Object.entries(event.provenance).forEach(([key, value]) => {
      requireText(key, "provenance key");
      requireText(value, `provenance.${key}`);
    });
  }
  function defaultEventId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `academy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function requireJlptBand(value, label) {
    if (!["n5", "n4", "n3", "n2", "n1"].includes(value)) throw new TypeError(`${label} must be a JLPT band.`);
    return value;
  }
  function requireText(value, label) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
    return value;
  }
  function unique(values) {
    return [...new Set(values)].sort();
  }
  function clone(value) {
    return structuredClone(value);
  }
  function createLearnerEvidence(repository, review) {
    return new DefaultLearnerEvidence(createLearnerRecord({ repository }), review);
  }
  class DefaultLearnerEvidence {
    constructor(record, review) {
      this.record = record;
      this.review = review;
    }
    projectionValue = null;
    pending = Promise.resolve();
    get projection() {
      if (!this.projectionValue) throw new Error("Learner evidence has not been initialized.");
      return this.projectionValue;
    }
    initialize() {
      return this.refresh();
    }
    refresh() {
      return this.enqueue(async () => {
        this.projectionValue = await this.record.snapshot();
        return this.projectionValue;
      });
    }
    saveProfile(profile) {
      return this.enqueue(async () => {
        const firstIntroduction = !this.projection.unlockedAssets.includes("character:rie");
        await this.record.recordMany([
          { kind: "profile-changed", profile },
          ...firstIntroduction ? [
            { kind: "asset-unlocked", eventId: "milestone:rie-introduction:asset", assetId: "character:rie" },
            { kind: "bond-changed", eventId: "milestone:rie-introduction:bond", characterId: "rie", delta: 1 },
            { kind: "scene-completed", eventId: "milestone:rie-introduction:scene", sceneId: "scene:opening-rie-introduction" }
          ] : []
        ]);
        await this.refreshNow();
        return { firstIntroduction };
      });
    }
    chooseCurriculumEntry(choice) {
      return this.enqueue(async () => {
        await this.record.record({ kind: "curriculum-entry-chosen", ...choice });
        await this.refreshNow();
      });
    }
    savePlacement(result) {
      return this.enqueue(async () => {
        await this.record.record({ kind: "placement-assessed", ...result });
        await this.refreshNow();
      });
    }
    recordActivity(evaluation, milestone) {
      return this.enqueue(async () => {
        await this.record.record(evaluation.attempt);
        await this.review.ingest(evaluation.reviewSeeds);
        const unscheduled = evaluation.reviewSeeds.filter((seed) => !this.projection.scheduledReviews[`yomu-local:${seed.id}`]);
        await this.record.recordMany(unscheduled.map((seed) => ({
          kind: "review-scheduled",
          eventId: `review-scheduled:yomu-local:${seed.id}`,
          reviewItemId: `yomu-local:${seed.id}`,
          conceptId: seed.conceptId,
          dueAt: Date.now(),
          provenance: {
            activity: evaluation.attempt.activityId,
            ...seed.sourceQuestionId ? { sourceQuestion: seed.sourceQuestionId } : {}
          }
        })));
        await this.refreshNow();
        if (!milestone || evaluation.result.outcome !== "pass") return;
        if (milestone.requiredErrorTag && !evaluation.result.errorTags.includes(milestone.requiredErrorTag)) return;
        if (this.projection.completedScenes.includes(milestone.sceneId)) return;
        await this.record.recordMany([
          ...milestone.unlock ? [
            { kind: "asset-unlocked", eventId: `milestone:${milestone.id}:asset`, assetId: milestone.unlock.assetId },
            { kind: "bond-changed", eventId: `milestone:${milestone.id}:bond`, characterId: milestone.unlock.characterId, delta: milestone.unlock.bondDelta }
          ] : [],
          { kind: "scene-completed", eventId: `milestone:${milestone.id}:scene`, sceneId: milestone.sceneId }
        ]);
        await this.refreshNow();
      });
    }
    recordShadowing() {
      return this.enqueue(async () => {
        const existing = this.projection.activities["activity:language-lab-repeat-shadowing"];
        if (existing?.lastOutcome === "pass") return;
        await this.record.record({
          kind: "attempt-recorded",
          eventId: "milestone:language-lab-repeat-shadowing:attempt",
          activityId: "activity:language-lab-repeat-shadowing",
          sourceQuestionId: "source-question:classroom-phrase-09",
          conceptIds: ["concept:classroom-repair-repeat"],
          responseKind: "speaking-self-assessment",
          outcome: "pass",
          score: 1
        });
        await this.refreshNow();
      });
    }
    dueReviews(limit) {
      return this.review.due(limit);
    }
    rateReview(itemId, rating) {
      return this.enqueue(async () => {
        await this.review.rate(itemId, rating);
        await this.record.record({ kind: "review-rated", reviewItemId: itemId, rating });
        await this.refreshNow();
      });
    }
    async refreshNow() {
      this.projectionValue = await this.record.snapshot();
    }
    enqueue(operation) {
      const result = this.pending.then(operation);
      this.pending = result.then(() => void 0, () => void 0);
      return result;
    }
  }
  const MANAGED_STORAGE_KEY_PREFIXES = [
    "yomu-",
    "yomu:",
    "yomu.",
    // Yomu-internal redirect handoff keys use a leading double underscore.
    // Factory reset clears hosted web storage by managed prefix, so include it.
    "__yomu",
    "jpdb-reader-",
    "jpdb-popup-reader-"
  ];
  function isManagedStorageKey(key) {
    return MANAGED_STORAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
  }
  const APP_NAME = "よむ";
  const DOCS_ORIGIN = "https://yomureader.com";
  const DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
  const YOMU_HOSTED_AUDIO_URL = "https://audio.yomureader.com/?term={term}&reading={reading}";
  const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}newtab/`;
  const SUPPORT_COPY = "よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.";
  const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
  function bridgeEventDetail(detail) {
    if (detail === void 0) return void 0;
    const json = bridgeEventJsonDetail(detail);
    return json ?? detail;
  }
  function bridgeEventJsonDetail(detail) {
    let unsupported = false;
    try {
      const json = JSON.stringify(detail, (_key, value) => {
        if (isUnsupportedBridgeJsonValue(value)) {
          unsupported = true;
          return void 0;
        }
        return value;
      });
      return unsupported || typeof json !== "string" ? void 0 : json;
    } catch {
      return void 0;
    }
  }
  function isUnsupportedBridgeJsonValue(value) {
    return isUnsupportedPrimitiveBridgeJsonValue(value) || isArrayBufferBridgeJsonValue(value) || isBlobBridgeJsonValue(value) || isFormDataBridgeJsonValue(value);
  }
  function isUnsupportedPrimitiveBridgeJsonValue(value) {
    return typeof value === "function" || typeof value === "symbol";
  }
  function isArrayBufferBridgeJsonValue(value) {
    if (typeof ArrayBuffer === "undefined") return false;
    return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
  }
  function isBlobBridgeJsonValue(value) {
    return typeof Blob !== "undefined" && value instanceof Blob;
  }
  function isFormDataBridgeJsonValue(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
  }
  const initialWindowDispatchEvent = initialWindowMethod("dispatchEvent");
  const initialWindowAddEventListener = initialWindowMethod("addEventListener");
  const initialWindowRemoveEventListener = initialWindowMethod("removeEventListener");
  function createWindowCustomEvent(type, detail, init = {}) {
    const eventInit = { ...init, detail: cloneCustomEventDetail(detail) };
    const documentEvent = createDocumentCustomEvent(type, eventInit);
    if (documentEvent) return documentEvent;
    const CustomEventConstructor = eventConstructor(window, "CustomEvent") ?? eventConstructor(globalThis, "CustomEvent");
    if (CustomEventConstructor) {
      try {
        return new CustomEventConstructor(type, eventInit);
      } catch {
      }
    }
    throw new Error(`Unable to create window custom event: ${type}`);
  }
  function cloneCustomEventDetail(detail) {
    if (detail === void 0 || typeof window === "undefined") return detail;
    const cloneInto = readMethod(globalThis, "cloneInto");
    if (!cloneInto) return detail;
    try {
      return cloneInto(detail, window, { cloneFunctions: false, wrapReflectors: true });
    } catch {
      try {
        return JSON.stringify(detail);
      } catch {
        return void 0;
      }
    }
  }
  function dispatchWindowEvent(event) {
    const target = window;
    const directDispatch = readMethod(target, "dispatchEvent");
    const directResult = callEventTargetMethod(directDispatch, target, event);
    if (directResult.called) return directResult.result;
    const initialResult = initialWindowDispatchEvent === directDispatch ? { called: false } : callEventTargetMethod(initialWindowDispatchEvent, target, event);
    if (initialResult.called) return initialResult.result;
    const prototypeResult = dispatchWithPrototypeMethod(target, directDispatch, event);
    if (prototypeResult.called) return prototypeResult.result;
    const unshadowedResult = callWithUnshadowedWindowDispatch(event);
    if (unshadowedResult.called) return unshadowedResult.result;
    return false;
  }
  function addWindowEventListener(type, listener, options) {
    const target = window;
    const directAdd = readMethod(target, "addEventListener");
    const directResult = callAddEventListener$1(directAdd, target, type, listener, options);
    if (directResult.called) return true;
    const initialResult = initialWindowAddEventListener === directAdd ? { called: false } : callAddEventListener$1(initialWindowAddEventListener, target, type, listener, options);
    if (initialResult.called) return true;
    const prototypeResult = addListenerWithPrototypeMethod(target, directAdd, type, listener, options);
    if (prototypeResult.called) return true;
    const unshadowedResult = callWithUnshadowedWindowAddEventListener(type, listener, options);
    if (unshadowedResult.called) return true;
    return false;
  }
  function removeWindowEventListener(type, listener, options) {
    const target = window;
    const directRemove = readMethod(target, "removeEventListener");
    const directResult = callRemoveEventListener$1(directRemove, target, type, listener, options);
    if (directResult.called) return true;
    const initialResult = initialWindowRemoveEventListener === directRemove ? { called: false } : callRemoveEventListener$1(initialWindowRemoveEventListener, target, type, listener, options);
    if (initialResult.called) return true;
    const prototypeResult = removeListenerWithPrototypeMethod(target, directRemove, type, listener, options);
    if (prototypeResult.called) return true;
    const unshadowedResult = callWithUnshadowedWindowRemoveEventListener(type, listener, options);
    if (unshadowedResult.called) return true;
    return false;
  }
  function initialWindowMethod(key) {
    if (typeof window === "undefined") return void 0;
    return readMethod(window, key);
  }
  function dispatchWithPrototypeMethod(target, directDispatch, event) {
    for (const prototypeDispatch of eventTargetPrototypeMethods(target, "dispatchEvent")) {
      if (prototypeDispatch === directDispatch) continue;
      const result = callEventTargetMethod(prototypeDispatch, target, event);
      if (result.called) return result;
    }
    return { called: false };
  }
  function addListenerWithPrototypeMethod(target, directAdd, type, listener, options) {
    for (const prototypeAdd of eventTargetPrototypeMethods(target, "addEventListener")) {
      if (prototypeAdd === directAdd) continue;
      const result = callAddEventListener$1(prototypeAdd, target, type, listener, options);
      if (result.called) return result;
    }
    return { called: false };
  }
  function removeListenerWithPrototypeMethod(target, directRemove, type, listener, options) {
    for (const prototypeRemove of eventTargetPrototypeMethods(target, "removeEventListener")) {
      if (prototypeRemove === directRemove) continue;
      const result = callRemoveEventListener$1(prototypeRemove, target, type, listener, options);
      if (result.called) return result;
    }
    return { called: false };
  }
  function eventConstructor(source, key) {
    const value = readProperty(source, key);
    return typeof value === "function" ? value : void 0;
  }
  function createDocumentCustomEvent(type, init) {
    if (typeof document === "undefined" || typeof document.createEvent !== "function") return void 0;
    try {
      const event = document.createEvent("CustomEvent");
      event.initCustomEvent(type, Boolean(init.bubbles), Boolean(init.cancelable), init.detail);
      return event;
    } catch {
      return void 0;
    }
  }
  function eventTargetPrototypeMethods(target, key) {
    const methods = [];
    const add = (method) => {
      if (method && !methods.includes(method)) methods.push(method);
    };
    let prototype = Object.getPrototypeOf(target);
    while (prototype) {
      add(readOwnMethod(prototype, key));
      prototype = Object.getPrototypeOf(prototype);
    }
    const WindowEventTarget = readProperty(window, "EventTarget");
    add(readMethod(WindowEventTarget?.prototype, key));
    if (typeof EventTarget !== "undefined") add(readMethod(EventTarget.prototype, key));
    return methods;
  }
  function readMethod(source, key) {
    const value = readProperty(source, key);
    return typeof value === "function" ? value : void 0;
  }
  function readOwnMethod(source, key) {
    if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
    if (!Object.prototype.hasOwnProperty.call(source, key)) return void 0;
    return readMethod(source, key);
  }
  function readProperty(source, key) {
    if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
    try {
      return source[key];
    } catch {
      return void 0;
    }
  }
  function callEventTargetMethod(method, target, event) {
    if (!method) return { called: false };
    try {
      return { called: true, result: method.call(target, event) };
    } catch (error) {
      return { called: false, error };
    }
  }
  function callAddEventListener$1(method, target, type, listener, options) {
    if (!method) return { called: false };
    try {
      method.call(target, type, listener, options);
      return { called: true };
    } catch (error) {
      return { called: false, error };
    }
  }
  function callRemoveEventListener$1(method, target, type, listener, options) {
    if (!method) return { called: false };
    try {
      method.call(target, type, listener, options);
      return { called: true };
    } catch (error) {
      return { called: false, error };
    }
  }
  function callWithUnshadowedWindowDispatch(event) {
    const target = window.wrappedJSObject || window;
    const descriptor = safeWindowPropertyDescriptor("dispatchEvent");
    if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
    try {
      if (!Reflect.deleteProperty(target, "dispatchEvent")) return { called: false };
      return callEventTargetMethod(readMethod(window, "dispatchEvent"), window, event);
    } catch (error) {
      return { called: false, error };
    } finally {
      restoreWindowProperty("dispatchEvent", descriptor);
    }
  }
  function callWithUnshadowedWindowAddEventListener(type, listener, options) {
    const target = window.wrappedJSObject || window;
    const descriptor = safeWindowPropertyDescriptor("addEventListener");
    if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
    try {
      if (!Reflect.deleteProperty(target, "addEventListener")) return { called: false };
      return callAddEventListener$1(readMethod(window, "addEventListener"), window, type, listener, options);
    } catch (error) {
      return { called: false, error };
    } finally {
      restoreWindowProperty("addEventListener", descriptor);
    }
  }
  function callWithUnshadowedWindowRemoveEventListener(type, listener, options) {
    const target = window.wrappedJSObject || window;
    const descriptor = safeWindowPropertyDescriptor("removeEventListener");
    if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
    try {
      if (!Reflect.deleteProperty(target, "removeEventListener")) return { called: false };
      return callRemoveEventListener$1(readMethod(window, "removeEventListener"), window, type, listener, options);
    } catch (error) {
      return { called: false, error };
    } finally {
      restoreWindowProperty("removeEventListener", descriptor);
    }
  }
  function restoreWindowProperty(key, descriptor) {
    try {
      const target = window.wrappedJSObject || window;
      Object.defineProperty(target, key, pageCompartmentDescriptor(normalizedPropertyDescriptor(descriptor), target));
    } catch {
    }
  }
  function pageCompartmentDescriptor(descriptor, _target) {
    return pageCompartmentValue(descriptor, { cloneFunctions: true, wrapReflectors: true });
  }
  function pageCompartmentValue(value, options = {}) {
    const cloneInto = readMethod(globalThis, "cloneInto");
    if (!cloneInto || typeof window === "undefined") return value;
    try {
      return cloneInto(value, window, options);
    } catch {
      return value;
    }
  }
  function safeWindowPropertyDescriptor(key) {
    try {
      const target = window.wrappedJSObject || window;
      return Object.getOwnPropertyDescriptor(target, key);
    } catch {
      return void 0;
    }
  }
  function shouldTemporarilyUnshadowWindowProperty(descriptor) {
    if (!descriptor) return false;
    try {
      return typeof descriptor.value !== "function";
    } catch {
      return false;
    }
  }
  function normalizedPropertyDescriptor(descriptor) {
    const hasDataShape = Object.prototype.hasOwnProperty.call(descriptor, "value") || Object.prototype.hasOwnProperty.call(descriptor, "writable");
    const hasAccessorShape = Object.prototype.hasOwnProperty.call(descriptor, "get") || Object.prototype.hasOwnProperty.call(descriptor, "set");
    if (!hasDataShape || !hasAccessorShape) return descriptor;
    try {
      return {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        value: descriptor.value,
        writable: descriptor.writable
      };
    } catch {
      return {
        configurable: true,
        value: void 0,
        writable: true
      };
    }
  }
  const BRIDGE_REQUEST_EVENT = "yomu-userscript-storage-request";
  const BRIDGE_RESPONSE_EVENT = "yomu-userscript-storage-response";
  const BRIDGE_MARKER = "yomuUserscriptStorageBridge";
  const BRIDGE_TIMEOUT_MS = 1e4;
  function getUserscriptGmStorage() {
    if (typeof window === "undefined" || typeof document === "undefined") return void 0;
    if (bridgeMarkerDataset()?.[BRIDGE_MARKER] !== "true") return void 0;
    return {
      getValue: (key, fallback) => storageBridgeRequest({ op: "get", key }).then((detail) => detail.found ? detail.value : fallback),
      setValue: (key, value) => storageBridgeRequest({ op: "set", key, value }).then(() => void 0),
      deleteValue: (key) => storageBridgeRequest({ op: "delete", key }).then(() => void 0),
      listValues: () => storageBridgeRequest({ op: "list" }).then((detail) => detail.keys ?? [])
    };
  }
  function storageBridgeRequest(request2) {
    return new Promise((resolve, reject) => {
      const id = `yomu-store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Storage bridge request timed out."));
      }, BRIDGE_TIMEOUT_MS);
      let cleanupResponseListener = noop;
      const cleanup = () => {
        window.clearTimeout(timeout);
        cleanupResponseListener();
      };
      const onResponse = (event) => {
        const detail = storageBridgeResponseDetail(event);
        if (!detail || detail.id !== id) return;
        cleanup();
        if (detail.ok) resolve(detail);
        else reject(new Error(detail.message || "Storage bridge request failed."));
      };
      cleanupResponseListener = addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
      dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, { id, ...request2 });
    });
  }
  function storageBridgeResponseDetail(event) {
    const detail = normalizedBridgeEventDetail(event);
    if (!detail || typeof detail !== "object") return void 0;
    const record = detail;
    if (typeof record.id !== "string" || typeof record.ok !== "boolean") return void 0;
    return {
      id: record.id,
      ok: record.ok,
      found: typeof record.found === "boolean" ? record.found : void 0,
      value: record.value,
      keys: Array.isArray(record.keys) ? record.keys.filter((key) => typeof key === "string") : void 0,
      message: typeof record.message === "string" ? record.message : void 0
    };
  }
  function normalizedBridgeEventDetail(event) {
    let detail;
    try {
      detail = event.detail;
    } catch {
      return void 0;
    }
    if (typeof detail !== "string") return detail;
    try {
      return JSON.parse(detail);
    } catch {
      return detail;
    }
  }
  function addBridgeEventListener(type, listener) {
    const cleanups = [];
    if (addWindowEventListener(type, listener)) {
      cleanups.push(() => removeWindowEventListener(type, listener));
    }
    const documentTarget = bridgeDocumentTarget();
    if (documentTarget && callAddEventListener(documentTarget, type, listener)) {
      cleanups.push(() => callRemoveEventListener(documentTarget, type, listener));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }
  function dispatchBridgeEvent(type, detail) {
    const eventDetail = bridgeEventDetail(detail);
    let dispatched = dispatchWindowEvent(createWindowCustomEvent(type, eventDetail));
    const documentTarget = bridgeDocumentTarget();
    if (documentTarget) {
      dispatched = callDispatchEvent(documentTarget, createWindowCustomEvent(type, eventDetail)) || dispatched;
    }
    return dispatched;
  }
  function bridgeDocumentTarget() {
    if (typeof document === "undefined") return void 0;
    return document.documentElement instanceof HTMLElement ? document.documentElement : void 0;
  }
  function bridgeMarkerDataset() {
    if (typeof document === "undefined") return void 0;
    const root = document.documentElement;
    return root?.dataset;
  }
  function callAddEventListener(target, type, listener) {
    try {
      target.addEventListener(type, listener);
      return true;
    } catch {
      return false;
    }
  }
  function callRemoveEventListener(target, type, listener) {
    try {
      target.removeEventListener(type, listener);
    } catch {
    }
  }
  function callDispatchEvent(target, event) {
    try {
      return target.dispatchEvent(event);
    } catch {
      return false;
    }
  }
  function noop() {
  }
  const registeredKeys = /* @__PURE__ */ new Set();
  function registerManagedState(entry) {
    const identity = managedStateIdentity(entry);
    if (registeredKeys.has(identity)) return;
    registeredKeys.add(identity);
  }
  function registerManagedStates(list) {
    for (const entry of list) registerManagedState(entry);
  }
  function managedStateIdentity(entry) {
    return `${entry.kind}:${entry.key ?? ""}:${entry.prefix ?? ""}`;
  }
  const MANAGED_STATE_MANIFEST = [
    // Settings (also legacy migration keys). The bunpro token / pill selections /
    // colours all live inside these settings objects.
    { owner: "settings", kind: "gm", key: "jpdb-popup-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "jpdb-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "yomu-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "yomu-settings" },
    // Cloud settings sync handoff written before an OAuth redirect.
    { owner: "settings/dialog-controller", kind: "gm", key: "__yomu_cloud_settings_sync_pending_action" },
    // App-level signals / flags / caches.
    { owner: "app/storage", kind: "gm", key: "yomu:factory-reset-signal" },
    { owner: "app/card-state-signal", kind: "gm", key: "yomu:card-state-signal" },
    { owner: "app/logger", kind: "gm", key: "yomu:enable-logs" },
    { owner: "app/main", kind: "gm", key: "yomu:jpdb-review-examples-visible:v1" },
    { owner: "app/preferred-site-language", kind: "gm", key: "yomu:prefer-japanese-site-language" },
    { owner: "app/preferred-site-language", kind: "session", key: "yomu:jps" },
    { owner: "app/preferred-site-language", kind: "session", key: "yomu:jps:hosts" },
    // Local no-account SRS deck.
    { owner: "app/storage", kind: "gm", key: "yomu:srs-local:v1" },
    // Anki status index (GM leases + IndexedDB store).
    { owner: "anki/status-index", kind: "gm", key: "yomu:anki-status-index:v1" },
    { owner: "anki/status-index", kind: "gm", key: "yomu:anki-status-index-rebuild:v1" },
    { owner: "anki/status-index", kind: "idb", key: "yomu-anki-status-index" },
    // Bunpro vocab SRS-state index for page word colouring.
    { owner: "bunpro/word-states", kind: "gm", key: "yomu:bunpro-word-states:v1" },
    // Public lookup caches.
    { owner: "jpdb/jpdb-public-cache", kind: "gm", key: "yomu:jpdb-cache:v1" },
    { owner: "dictionaries/jiten-public-cache", kind: "gm", key: "yomu:jiten-public-cache:v1" },
    { owner: "dictionaries/jiten-stats-cache", kind: "gm", key: "jpdb-reader-jiten-daily-stats" },
    // Dictionary database (Yomitan/Jitendex terms). Cleared by the dictionary
    // store's own deleteDatabase during reset; registered so the invariant test
    // asserts it and the reset sweep nets it as a fallback.
    { owner: "dictionaries/yomitan", kind: "idb", key: "jpdb-popup-reader-yomitan" },
    // OCR result cache.
    { owner: "ocr/ocr-cache-store", kind: "local", key: "yomu-ocr-cache-v1" },
    { owner: "ocr/ocr-cache-store", kind: "local", key: "yomu-ocr-cache-v2" },
    { owner: "ocr/canvas-mirror", kind: "session", key: "yomu:bw:mirror-loadguard" },
    // Reader CSS cache (version-suffixed → prefix family).
    { owner: "styles/index", kind: "gm", prefix: "yomu:reader-css-cache:v2:" },
    // Study / grammar / mining stores.
    { owner: "study/tools-impl", kind: "gm", key: "yomu.grammarPreferences.v1" },
    { owner: "study/mining-context", kind: "gm", prefix: "yomu-mining-context:" },
    { owner: "dictionaries/uchisen-carousel", kind: "gm", prefix: "yomu-jpdb-uchisen-index:" },
    // Popup / drawer geometry.
    { owner: "popup/shell", kind: "gm", key: "jpdb-reader-sheet-height-ratio" },
    { owner: "popup/shell", kind: "gm", key: "jpdb-reader-settings-drawer-height-ratio" },
    // Sources open/closed state.
    { owner: "sources/state", kind: "gm", key: "jpdb-reader-source-open-state" },
    // Subtitle layout geometry.
    { owner: "subtitles/subtitle-layout", kind: "gm", key: "jpdb-reader-transcript-panel-size" },
    { owner: "subtitles/subtitle-layout", kind: "gm", key: "jpdb-reader-subtitle-drag-offset" },
    { owner: "subtitles/subtitle-layout", kind: "gm", key: "jpdb-reader-subtitle-control-rail-position" },
    // YouTube subscription snapshot + oembed title cache.
    { owner: "subtitles/youtube", kind: "gm", key: "yomu:youtube-all-subscribed:v1" },
    { owner: "subtitles/youtube", kind: "session", prefix: "yomu:youtube-oembed-title:v1:" },
    { owner: "subtitles/controller", kind: "session", prefix: "yomu:subtitle-parse:v3:" },
    // New Tab study surface stores.
    { owner: "newtab/state", kind: "gm", key: "jpdb-reader-newtab-ui" },
    { owner: "newtab/cache", kind: "gm", key: "jpdb-reader-newtab-card-cache" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-grade-queue" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-current-word" },
    { owner: "newtab/controller-config", kind: "session", key: "jpdb-reader-newtab-current-word" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-jpdb-stats-history" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-disabled-anki-decks" },
    { owner: "newtab/session-progress", kind: "local", key: "jpdb-reader-newtab-daily-study-time" },
    { owner: "newtab/controller", kind: "gm", key: "yomu-newtab-support-banner-dismissed" },
    // Local pitch-accent SRS (debounced writer — the canonical reset escapee).
    { owner: "newtab/pitch-srs", kind: "gm", key: "yomu-pitch-items:v1" },
    { owner: "newtab/pitch-srs", kind: "gm", key: "yomu-pitch-history:v1" }
  ];
  let manifestRegistered = false;
  function registerManagedStateManifest() {
    if (manifestRegistered) return;
    manifestRegistered = true;
    registerManagedStates(MANAGED_STATE_MANIFEST);
  }
  registerManagedStateManifest();
  const MISSING = { __yomuStorageValueMissing: true };
  function isMissingSentinel(value) {
    if (value === MISSING) return true;
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.__yomuStorageValueMissing === true);
  }
  async function gmStorageGet(key, fallback) {
    const getValue = asyncGmGetValue();
    if (getValue) {
      try {
        const value = await getValue(key, MISSING);
        if (!isMissingSentinel(value)) return value;
        const migrated = localStorageGet(key, MISSING);
        if (!isMissingSentinel(migrated)) {
          await gmStorageSet(key, migrated);
          return migrated;
        }
        return fallback;
      } catch (error) {
        debugStorageError("GM storage read failed", key, error);
      }
    }
    return localStorageGet(key, fallback);
  }
  function gmStorageGetSync(key, fallback) {
    const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
    if (getValue) {
      const read = gmStorageSyncRead(key, getValue);
      if (read.kind === "found") return read.value;
    }
    return localStorageGet(key, fallback);
  }
  function gmStorageSyncRead(key, getValue) {
    try {
      const value = getValue(key, MISSING);
      if (isPromiseLike(value)) return { kind: "fallback" };
      if (!isMissingSentinel(value)) return { kind: "found", value };
      return migratedLocalStorageSyncValue(key);
    } catch (error) {
      debugStorageError("GM storage sync read failed", key, error);
      return { kind: "fallback" };
    }
  }
  function migratedLocalStorageSyncValue(key) {
    const migrated = localStorageGet(key, MISSING);
    if (isMissingSentinel(migrated)) return { kind: "fallback" };
    void gmStorageSet(key, migrated);
    return { kind: "found", value: migrated };
  }
  async function gmStorageSet(key, value) {
    const setValue = asyncGmSetValue();
    if (setValue) {
      try {
        await setValue(key, value);
        mirrorManagedValueToHostedStorage(key, value);
        return;
      } catch (error) {
        debugStorageError("GM storage write failed", key, error);
      }
    }
    localStorageSet(key, value);
  }
  function gmStorageSetSync(key, value) {
    if (typeof GM_setValue === "function") {
      try {
        const result = GM_setValue(key, value);
        if (!isPromiseLike(result)) {
          mirrorManagedValueToHostedStorage(key, value);
          return;
        }
        result.catch((error) => debugStorageError("GM storage async write failed", key, error));
      } catch (error) {
        debugStorageError("GM storage sync write failed", key, error);
      }
    }
    localStorageSet(key, value);
  }
  function gmStorageDeleteSync(key) {
    if (typeof GM_deleteValue === "function") {
      try {
        const result = GM_deleteValue(key);
        if (isPromiseLike(result)) result.catch((error) => debugStorageError("GM storage async delete failed", key, error));
      } catch (error) {
        debugStorageError("GM storage sync delete failed", key, error);
      }
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
  }
  function localStorageGet(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  function localStorageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
  }
  function removeLocalStorageKey(key) {
    try {
      localStorage.removeItem(key);
    } catch {
    }
  }
  function removeSessionStorageKey(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
    }
  }
  function mirrorManagedValueToHostedStorage(key, value) {
    if (!shouldMirrorManagedValueToHostedStorage(key)) return;
    localStorageSet(key, value);
  }
  function shouldMirrorManagedValueToHostedStorage(key) {
    return isManagedStorageKey(key) && isHostedYomuOrigin();
  }
  function isHostedYomuOrigin() {
    try {
      const host2 = location.hostname;
      const path = location.pathname;
      if (location.origin === DOCS_ORIGIN) return true;
      if (host2 === "hrussellzfac023.github.io") return path.startsWith("/yomu-reader/");
      return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(host2) && path.includes("/newtab/");
    } catch {
      return false;
    }
  }
  function isPromiseLike(value) {
    return Boolean(value) && typeof value.then === "function";
  }
  function asyncGmGetValue() {
    if (typeof GM_getValue === "function") return GM_getValue;
    const modern = globalThis.GM?.getValue;
    if (typeof modern === "function") return modern.bind(globalThis.GM);
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, fallback) => bridge.getValue(key, fallback) : null;
  }
  function asyncGmSetValue() {
    if (typeof GM_setValue === "function") return GM_setValue;
    const modern = globalThis.GM?.setValue;
    if (typeof modern === "function") return modern.bind(globalThis.GM);
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, value) => bridge.setValue(key, value) : null;
  }
  function debugStorageError(message, key, error) {
    if (typeof console !== "undefined") console.debug("[Yomu] Storage", message, { key, error });
  }
  const YOMU_LOCAL_SRS_STORAGE_KEY = "yomu:srs-local:v1";
  const EMPTY_DECK = { version: 1, cards: {} };
  class LocalYomuSrsRepository {
    constructor(now = () => Date.now()) {
      this.now = now;
    }
    async importBatch(batch) {
      const deck = await this.readDeck();
      let imported = 0;
      let skipped = 0;
      for (const item of batch.items) {
        const card = this.cardFromImportItem(item, batch.importedAt);
        if (!card) {
          skipped++;
          continue;
        }
        const existing = deck.cards[card.id];
        if (existing) {
          deck.cards[card.id] = {
            ...existing,
            meanings: uniqueStrings([...existing.meanings, ...card.meanings]),
            sentence: existing.sentence || card.sentence,
            sourceUrl: existing.sourceUrl || card.sourceUrl,
            tags: uniqueStrings([...existing.tags ?? [], ...card.tags ?? []]),
            updatedAt: batch.importedAt
          };
          skipped++;
        } else {
          deck.cards[card.id] = card;
          imported++;
        }
      }
      await this.writeDeck(deck);
      return { imported, skipped };
    }
    // fallow-ignore-next-line unused-class-member
    async queue(limit = 50) {
      const now = this.now();
      const cards = Object.values((await this.readDeck()).cards);
      const cap = Math.max(0, Math.floor(limit));
      const byDue = (a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt;
      const due = cards.filter((card) => card.dueAt <= now).sort(byDue);
      const ahead = cards.filter((card) => card.dueAt > now).sort(byDue);
      const queue = [...due, ...ahead].slice(0, cap).map((card) => this.toReviewable(card, now));
      return {
        providerId: "yomu-local",
        fetchedAt: now,
        cards: queue,
        dueCount: cards.filter((card) => card.dueAt <= now && card.reviews > 0).length,
        newCount: cards.filter((card) => card.reviews === 0).length,
        reviewCount: Math.min(due.length, cap)
      };
    }
    // fallow-ignore-next-line unused-class-member
    async stats() {
      const now = this.now();
      const cards = Object.values((await this.readDeck()).cards);
      const today = startOfLocalDay(now);
      return {
        providerId: "yomu-local",
        fetchedAt: now,
        reviewsDue: cards.filter((card) => card.dueAt <= now).length,
        reviewsToday: cards.filter((card) => (card.lastReviewAt ?? 0) >= today).length,
        newToday: cards.filter((card) => card.createdAt >= today).length,
        levelCounts: {
          new: cards.filter((card) => card.reviews === 0).length,
          learning: cards.filter((card) => card.reviews > 0 && card.intervalDays < 21).length,
          known: cards.filter((card) => card.intervalDays >= 21).length
        }
      };
    }
    // fallow-ignore-next-line unused-class-member
    async review(request2) {
      const deck = await this.readDeck();
      const id = request2.card.providerCardId || localCardId(request2.card.expression, request2.card.reading);
      const existing = deck.cards[id] ?? this.cardFromReviewable(request2.card, this.now());
      const updated = scheduleReviewedCard(existing, request2.grade, this.now());
      deck.cards[id] = updated;
      await this.writeDeck(deck);
      return { card: this.toReviewable(updated, this.now()), raw: updated };
    }
    // fallow-ignore-next-line unused-class-member
    async mine(request2) {
      const now = this.now();
      const card = reviewableFromMiningRequest(request2, now);
      const raw = await this.importBatch({
        source: "manual-mining",
        importedAt: now,
        items: [{
          expression: card.expression,
          reading: card.reading,
          meanings: card.meanings.flatMap((meaning) => meaning.glosses),
          sentence: request2.sentence,
          sourceUrl: request2.sourceUrl
        }]
      });
      return { card, raw };
    }
    async readDeck() {
      const stored = await gmStorageGet(YOMU_LOCAL_SRS_STORAGE_KEY, null).catch(() => null);
      if (!stored || stored.version !== 1 || !stored.cards || typeof stored.cards !== "object") return { ...EMPTY_DECK, cards: {} };
      return { version: 1, cards: normalizeStoredCards(stored.cards) };
    }
    writeDeck(deck) {
      return gmStorageSet(YOMU_LOCAL_SRS_STORAGE_KEY, deck);
    }
    cardFromImportItem(item, now) {
      const expression = item.expression.trim();
      if (!expression) return null;
      const reading = item.reading?.trim() || expression;
      return {
        id: item.sourceProviderId && item.sourceCardId ? `${item.sourceProviderId}:${item.sourceCardId}` : localCardId(expression, reading),
        expression,
        reading,
        meanings: uniqueStrings(item.meanings ?? []),
        sentence: item.sentence?.trim() || void 0,
        sourceProviderId: item.sourceProviderId,
        sourceCardId: item.sourceCardId,
        sourceUrl: item.sourceUrl,
        tags: uniqueStrings(item.tags ?? []),
        dueAt: item.dueAt ?? now,
        lastReviewAt: null,
        createdAt: now,
        updatedAt: now,
        reviews: 0,
        lapses: 0,
        intervalDays: 0,
        ease: 2.5
      };
    }
    cardFromReviewable(card, now) {
      return {
        id: card.providerCardId || localCardId(card.expression, card.reading),
        expression: card.expression,
        reading: card.reading || card.expression,
        meanings: card.meanings.flatMap((meaning) => meaning.glosses),
        sourceProviderId: card.providerId,
        sourceCardId: card.providerCardId,
        sourceUrl: card.sourceUrl,
        dueAt: card.dueAt ?? now,
        lastReviewAt: card.lastReviewAt ?? null,
        createdAt: now,
        updatedAt: now,
        reviews: 0,
        lapses: 0,
        intervalDays: 0,
        ease: 2.5
      };
    }
    toReviewable(card, now) {
      return {
        providerId: "yomu-local",
        providerCardId: card.id,
        providerReviewId: card.id,
        kind: "vocabulary",
        expression: card.expression,
        reading: card.reading,
        meanings: meaningsFromGlosses(card.meanings),
        state: localCardState(card, now),
        srsLevel: localSrsLevel(card),
        dueAt: card.dueAt,
        lastReviewAt: card.lastReviewAt,
        sourceUrl: card.sourceUrl,
        raw: card
      };
    }
  }
  function scheduleReviewedCard(card, grade2, now) {
    const failed = grade2 === "nothing" || grade2 === "something" || grade2 === "fail" || grade2 === "again";
    const intervalDays = failed ? 0 : nextIntervalDays(card, grade2);
    return {
      ...card,
      reviews: card.reviews + 1,
      lapses: card.lapses + (failed ? 1 : 0),
      intervalDays,
      ease: Math.min(3.2, Math.max(1.3, card.ease + easeDelta(grade2))),
      dueAt: now + (failed ? 10 * 6e4 : intervalDays * 864e5),
      lastReviewAt: now,
      updatedAt: now
    };
  }
  function nextIntervalDays(card, grade2) {
    if (card.reviews <= 0) return grade2 === "easy" ? 4 : grade2 === "hard" ? 1 : 2;
    const multiplier = grade2 === "easy" ? card.ease + 0.7 : grade2 === "hard" ? 1.2 : card.ease;
    return Math.max(1, Math.round(Math.max(1, card.intervalDays) * multiplier));
  }
  function easeDelta(grade2) {
    if (grade2 === "easy") return 0.15;
    if (grade2 === "hard") return -0.15;
    if (grade2 === "nothing" || grade2 === "something" || grade2 === "fail" || grade2 === "again") return -0.25;
    return 0;
  }
  function reviewableFromMiningRequest(request2, now) {
    const expression = request2.expression.trim();
    const reading = request2.reading?.trim() || expression;
    return {
      providerId: "yomu-local",
      providerCardId: localCardId(expression, reading),
      providerReviewId: localCardId(expression, reading),
      kind: request2.kind ?? "vocabulary",
      expression,
      reading,
      meanings: request2.meaning ? meaningsFromGlosses([request2.meaning]) : [],
      state: ["new"],
      dueAt: now,
      lastReviewAt: null,
      sourceUrl: request2.sourceUrl
    };
  }
  function normalizeStoredCards(cards) {
    return Object.fromEntries(Object.entries(cards).filter(([, card]) => Boolean(card?.id && card.expression)));
  }
  function localCardId(expression, reading) {
    return `${expression.trim()}\0${reading.trim() || expression.trim()}`;
  }
  function meaningsFromGlosses(glosses) {
    const normalized = uniqueStrings(glosses.map((gloss) => gloss.trim()).filter(Boolean));
    return normalized.length ? [{ glosses: normalized, partOfSpeech: [] }] : [];
  }
  function localCardState(card, now) {
    if (card.reviews === 0) return ["new"];
    if (card.dueAt <= now) return ["due"];
    if (card.intervalDays >= 21) return ["known"];
    return ["learning"];
  }
  function localSrsLevel(card) {
    if (card.reviews === 0) return "New";
    if (card.intervalDays >= 21) return "Known";
    if (card.intervalDays >= 7) return "Young";
    return "Learning";
  }
  function startOfLocalDay(now) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
  function uniqueStrings(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }
  function createYomuLocalReviewService(repository = new LocalYomuSrsRepository(), now = Date.now) {
    const cards = /* @__PURE__ */ new Map();
    return {
      async due(limit) {
        const snapshot = await repository.queue(Math.max(50, Math.floor(limit)));
        const due = snapshot.cards.filter((card) => (card.dueAt ?? 0) <= now()).slice(0, Math.max(0, Math.floor(limit)));
        due.forEach((card) => cards.set(card.providerCardId, card));
        return due.map(toQueueItem);
      },
      async ingest(seeds) {
        if (!seeds.length) return;
        await repository.importBatch({
          source: "academy-activity-runtime:v1",
          importedAt: now(),
          items: seeds.map(toImportItem)
        });
      },
      async rate(itemId, rating) {
        let card = cards.get(itemId);
        if (!card) {
          const queue = await repository.queue(500);
          card = queue.cards.find((candidate) => candidate.providerCardId === itemId);
        }
        if (!card) throw new Error(`Unknown Yomu review item: ${itemId}`);
        await repository.review({ card, grade: grade(rating) });
      }
    };
  }
  function toImportItem(seed) {
    return {
      expression: seed.content.expression,
      reading: seed.content.reading,
      meanings: [...seed.content.meanings],
      sentence: seed.content.sentence,
      sourceProviderId: "yomu-local",
      sourceCardId: seed.id,
      tags: [
        "academy",
        `academy:concept:${seed.conceptId}`,
        `academy:reason:${seed.reason}`,
        ...seed.sourceQuestionId ? [`academy:source-question:${seed.sourceQuestionId}`] : []
      ]
    };
  }
  function toQueueItem(card) {
    return {
      id: card.providerCardId,
      expression: card.expression,
      ...card.reading ? { reading: card.reading } : {},
      ...card.meanings[0]?.glosses[0] ? { meaning: card.meanings[0].glosses[0] } : {},
      dueAt: card.dueAt ?? 0,
      provenance: { provider: card.providerId }
    };
  }
  function grade(rating) {
    return rating;
  }
  const CORE_COLOR_TOKENS = {
    white: "#ffffff"
  };
  const BRAND_COLOR_TOKENS = {
    accent: "#5ea780",
    consoleAccent: "#247a58"
  };
  const OVERLAY_COLOR_TOKENS = {
    text: CORE_COLOR_TOKENS.white
  };
  const DOODLE_COLOR_TOKENS = {
    ink: "#141820"
  };
  const LOGGER_COLOR_TOKENS = {
    debug: "#6b7280",
    warn: "#a15c00",
    error: "#b91c1c"
  };
  const selectorPairs = (names, attributes = ["class", "id"]) => names.split(",").flatMap((name) => attributes.map((attribute) => `[${attribute}*="${name}" i]`)).join(",");
  const roleSelectors = (names) => names.split(",").map((name) => `[role="${name}"]`).join(",");
  `a[href],button,summary,label,${roleSelectors("button,link,menuitem,option,tab,checkbox,radio,switch")},[aria-controls],[aria-expanded],[slot="more-button"],.more-button,#more,#less`;
  `[onclick],[tabindex]:not([tabindex="-1"]),${selectorPairs("audio,button,control,play,sound,speaker,toggle", ["class"])}`;
  `time,[datetime],[aria-label*="author" i],[aria-label*="username" i],${selectorPairs("author,byline,display-name,handle,header,meta,nickname,screen-name,user-name,username", ["class"])}`;
  `button,label,summary,${roleSelectors("button,tab,menuitem,option,checkbox,radio,switch")}`;
  `header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"],[role="dialog"],[role="listbox"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[aria-modal="true"],${selectorPairs("account,chooser,dialog,dropdown,login,menu,modal,panel,picker,profile,signin,toolbar")}`;
  `[role="alert"],[role="status"],[role="region"],[aria-live],${selectorPairs("alert,banner,notice,notification,snackbar,toast", ["class"])},${selectorPairs("assistant,prompt,question", ["class", "id"])}`;
  `button,summary,label,${roleSelectors("button,tab,menuitem,menuitemcheckbox,menuitemradio,option,switch,checkbox,radio")},[slot="more-button"],.more-button,#more,#less`;
  roleSelectors("menu,menubar,toolbar,tablist");
  let trustedHtmlPolicy;
  function parseXmlDocument(source, mimeType = "text/xml") {
    try {
      return new DOMParser().parseFromString(trustedHtml(source), mimeType);
    } catch {
      return document.implementation.createDocument(null, "");
    }
  }
  function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trustedHtml(value) {
    try {
      const factory = trustedTypesFactory();
      if (!factory) return value;
      if (trustedHtmlPolicy === void 0) trustedHtmlPolicy = createTrustedHtmlPolicy(factory);
      return trustedHtmlPolicy && typeof trustedHtmlPolicy.createHTML === "function" ? trustedHtmlPolicy.createHTML(value) : value;
    } catch {
      trustedHtmlPolicy = null;
      return value;
    }
  }
  function trustedTypesFactory() {
    const root = globalThis;
    return [
      root.trustedTypes,
      typeof window === "undefined" ? void 0 : window.trustedTypes,
      root.unsafeWindow?.trustedTypes
    ].find((factory) => Boolean(factory));
  }
  function createTrustedHtmlPolicy(factory) {
    try {
      const existing = factory.getPolicy?.("yomu-reader");
      if (existing && typeof existing.createHTML === "function") return existing;
      const options = { createHTML: (html) => html };
      return createTrustedHtmlPolicyWithOptions(factory, pageCompartmentValue(options, { cloneFunctions: true, wrapReflectors: true })) ?? createTrustedHtmlPolicyWithOptions(factory, options);
    } catch {
      return null;
    }
  }
  function createTrustedHtmlPolicyWithOptions(factory, options) {
    try {
      return factory.createPolicy?.("yomu-reader", options) ?? null;
    } catch {
      return null;
    }
  }
  const __vite_import_meta_env__ = { "DEV": false };
  const LOG_PREFIX = "[Yomu]";
  const LOG_STYLE = `background: ${BRAND_COLOR_TOKENS.consoleAccent}; color: ${CORE_COLOR_TOKENS.white}; border-radius: 3px; padding: 2px 5px; font-weight: 700;`;
  const SCOPE_STYLE = `color: ${BRAND_COLOR_TOKENS.consoleAccent}; font-weight: 700;`;
  const DEBUG_STYLE = `color: ${LOGGER_COLOR_TOKENS.debug};`;
  const WARN_STYLE = `color: ${LOGGER_COLOR_TOKENS.warn}; font-weight: 700;`;
  const ERROR_STYLE = `color: ${LOGGER_COLOR_TOKENS.error}; font-weight: 700;`;
  const RUNTIME_LOG_KEY = "yomu:enable-logs";
  const REDACTED = "[redacted]";
  const OPTIONAL_CORS_BRIDGE_MESSAGE = "No configured proxy.";
  const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie)/i;
  const env = __vite_import_meta_env__;
  const BUILD_IS_DEV_MODE = Boolean(env?.DEV);
  const BUILD_LOGGING_ENABLED = BUILD_IS_DEV_MODE;
  class ScopedLogger {
    constructor(parent, scopeName) {
      this.parent = parent;
      this.scopeName = scopeName;
    }
    debug(message, ...args) {
      this.parent.write(this.scopeName, message, args, writeDebugToConsole, DEBUG_STYLE);
    }
    info(message, ...args) {
      this.parent.write(this.scopeName, message, args, console.info, "");
    }
    warn(message, ...args) {
      const optional = args.some(isOptionalCorsBridgeError);
      this.parent.write(this.scopeName, message, args, optional ? writeDebugToConsole : console.warn, optional ? DEBUG_STYLE : WARN_STYLE);
    }
    error(message, ...args) {
      this.parent.write(this.scopeName, message, args, console.error, ERROR_STYLE);
    }
    warnOnce(key, message, ...args) {
      this.parent.warnOnce(`${this.scopeName}:${key}`, this.scopeName, message, args);
    }
    time(label, ...args) {
      if (!this.parent.isEnabled()) return () => void 0;
      const start = nowMs();
      this.debug(`${label} started`, ...args);
      return () => this.debug(`${label} finished`, { durationMs: Math.round((nowMs() - start) * 10) / 10 });
    }
  }
  class LoggerImpl {
    settingsProvider;
    forceEnabled = false;
    onceKeys = /* @__PURE__ */ new Set();
    configure(options) {
      this.settingsProvider = options.settingsProvider ?? this.settingsProvider;
      this.forceEnabled = options.forceEnabled ?? this.forceEnabled;
    }
    scope(scopeName) {
      return new ScopedLogger(this, scopeName);
    }
    isEnabled() {
      if (BUILD_LOGGING_ENABLED) return true;
      if (this.forceEnabled || getRuntimeLoggingOverride()) return true;
      try {
        return this.settingsProvider?.().enableLogging === true;
      } catch {
        return false;
      }
    }
    isDevMode() {
      return isDevMode();
    }
    enable(persist = false) {
      this.forceEnabled = true;
      if (persist) setRuntimeLoggingOverride(true);
      this.scope("Logger").info("Runtime logging enabled.", { persisted: persist });
    }
    disable(persist = false) {
      this.scope("Logger").info("Runtime logging disabled.", { persisted: persist });
      this.forceEnabled = false;
      if (persist) setRuntimeLoggingOverride(false);
    }
    reset() {
      this.onceKeys.clear();
    }
    warnOnce(key, scope, message, args) {
      if (this.onceKeys.has(key)) return;
      this.onceKeys.add(key);
      this.write(scope, message, args, console.warn, WARN_STYLE);
    }
    write(scope, message, args, writer, levelStyle) {
      if (!this.isEnabled()) return;
      writer(`%c${LOG_PREFIX}%c [${scope}]%c ${message}`, LOG_STYLE, SCOPE_STYLE, levelStyle, ...args.map(sanitizeForConsole));
    }
  }
  const Logger = new LoggerImpl();
  function isDevMode() {
    return BUILD_IS_DEV_MODE;
  }
  function writeDebugToConsole(...args) {
    if (isDevMode()) console.log(...args);
    else console.debug(...args);
  }
  function isOptionalCorsBridgeError(value) {
    return value instanceof Error && value.message === OPTIONAL_CORS_BRIDGE_MESSAGE;
  }
  function getRuntimeLoggingOverride() {
    try {
      return gmStorageGetSync(RUNTIME_LOG_KEY, false) === true;
    } catch {
      return false;
    }
  }
  function setRuntimeLoggingOverride(enabled) {
    try {
      if (enabled) gmStorageSetSync(RUNTIME_LOG_KEY, true);
      else gmStorageDeleteSync(RUNTIME_LOG_KEY);
    } catch {
    }
  }
  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }
  function sanitizeForConsole(value) {
    if (typeof value === "string") return redactString(value);
    if (value === null || value === void 0 || typeof value !== "object") return value;
    const sanitized = sanitizeSpecialConsoleValue(value);
    if (sanitized.handled) return sanitized.value;
    if (Array.isArray(value)) return value.map(sanitizeForConsole);
    return sanitizeRecordForConsole(value);
  }
  function sanitizeSpecialConsoleValue(value) {
    for (const sanitizer of CONSOLE_VALUE_SANITIZERS) {
      const sanitized = sanitizer(value);
      if (sanitized.handled) return sanitized;
    }
    return { handled: false };
  }
  const CONSOLE_VALUE_SANITIZERS = [
    (value) => value instanceof Error ? { handled: true, value: { name: value.name, message: value.message, stack: value.stack } } : { handled: false },
    (value) => typeof URL !== "undefined" && value instanceof URL ? { handled: true, value: value.href } : { handled: false },
    (value) => typeof Blob !== "undefined" && value instanceof Blob ? { handled: true, value: { type: value.type, size: value.size } } : { handled: false },
    (value) => typeof Event !== "undefined" && value instanceof Event ? { handled: true, value: { type: value.type } } : { handled: false }
  ];
  function sanitizeRecordForConsole(record) {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [
      key,
      shouldRedactEntry(key, value) ? REDACTED : sanitizeFlatValue(value)
    ]));
  }
  function sanitizeFlatValue(value) {
    if (typeof value === "string") return redactString(value);
    if (value instanceof Error) return { name: value.name, message: value.message };
    return value;
  }
  function shouldRedactEntry(key, value) {
    if (!SECRET_KEY_PATTERN.test(key)) return false;
    if (typeof value === "number" && /tokens?/i.test(key)) return false;
    return true;
  }
  function redactString(value) {
    return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`).replace(/(["']?(?:api[-_]?key|token|password|secret|authorization)["']?\s*[:=]\s*["'])[^"']+(["'])/gi, `$1${REDACTED}$2`);
  }
  if (typeof window !== "undefined") {
    window.__YOMU_LOGGER__ = Logger;
    window.YomuLogger = Logger;
  }
  const JPDB_LOOKUP_LINK = {
    id: "jpdb",
    label: "JPDB",
    urlTemplate: "https://jpdb.io/search?q={query}",
    enabled: true
  };
  const JITEN_LIVE_FREQUENCY_PILL = {
    id: "jiten-frequency",
    label: "Jiten",
    urlTemplate: "",
    enabled: true,
    action: "frequency-live"
  };
  const JPDB_LIVE_FREQUENCY_PILL = {
    id: "jpdb-frequency",
    label: "JPDB",
    urlTemplate: "",
    enabled: true,
    action: "frequency-live"
  };
  const JISHO_LOOKUP_LINK = {
    id: "jisho",
    label: "Jisho",
    urlTemplate: "https://jisho.org/search/{query}",
    enabled: false
  };
  const YOMU_LOOKUP_LINK = {
    id: "yomu-search",
    label: "Yomu",
    urlTemplate: `${NEW_TAB_PAGE_URL}index.html?q={query}`,
    enabled: true
  };
  const JITEN_LOOKUP_LINK = {
    id: "jiten",
    label: "Jiten",
    urlTemplate: "https://jiten.moe/parse?text={query}",
    enabled: true
  };
  const BUNPRO_LOOKUP_LINK = {
    id: "bunpro",
    label: "Bunpro",
    urlTemplate: "https://bunpro.jp/search?query={query}",
    enabled: true
  };
  const WEBLIO_LOOKUP_LINK = {
    id: "weblio",
    label: "Weblio",
    urlTemplate: "https://www.weblio.jp/content/{query}",
    enabled: false
  };
  const REMOVED_GOO_LOOKUP_LINK_ID = "goo";
  const KOTOBANK_LOOKUP_LINK = {
    id: "kotobank",
    label: "Kotobank",
    urlTemplate: "https://kotobank.jp/search?q={query}",
    enabled: false
  };
  const TAKOBOTO_LOOKUP_LINK = {
    id: "takoboto",
    label: "Takoboto",
    urlTemplate: "https://takoboto.jp/?q={query}",
    enabled: false
  };
  const WIKTIONARY_LOOKUP_LINK = {
    id: "wiktionary-ja",
    label: "Wiktionary",
    urlTemplate: "https://ja.wiktionary.org/wiki/{query}",
    enabled: false
  };
  const IMMERSION_KIT_LOOKUP_LINK = {
    id: "immersion-kit",
    label: "Immersion Kit",
    urlTemplate: "https://www.immersionkit.com/dictionary?keyword={query}&sort=sentence_length:asc&page=1",
    enabled: false
  };
  const UCHISEN_LOOKUP_LINK = {
    id: "uchisen",
    label: "Uchisen",
    urlTemplate: "https://uchisen.com/kanji/{query}",
    enabled: false
  };
  const COPY_LOOKUP_LINK = {
    id: "copy",
    label: "Copy",
    urlTemplate: "",
    enabled: true,
    action: "copy"
  };
  const DEFAULT_DICTIONARY_LOOKUP_LINKS = [
    YOMU_LOOKUP_LINK,
    JITEN_LOOKUP_LINK,
    JITEN_LIVE_FREQUENCY_PILL,
    JPDB_LOOKUP_LINK,
    JPDB_LIVE_FREQUENCY_PILL,
    BUNPRO_LOOKUP_LINK,
    JISHO_LOOKUP_LINK,
    WEBLIO_LOOKUP_LINK,
    KOTOBANK_LOOKUP_LINK,
    TAKOBOTO_LOOKUP_LINK,
    WIKTIONARY_LOOKUP_LINK,
    IMMERSION_KIT_LOOKUP_LINK,
    UCHISEN_LOOKUP_LINK,
    COPY_LOOKUP_LINK
  ];
  [
    { ...JPDB_LOOKUP_LINK, enabled: false },
    { ...JISHO_LOOKUP_LINK, enabled: true },
    COPY_LOOKUP_LINK
  ];
  [[
    // The jiten-first default that shipped before Yomu was promoted to the front
    // of the pill row. Users who never re-ordered their pills are migrated to the
    // current Yomu-first default order instead of being pinned to the old layout.
    JITEN_LOOKUP_LINK.id,
    JITEN_LIVE_FREQUENCY_PILL.id,
    JPDB_LOOKUP_LINK.id,
    JPDB_LIVE_FREQUENCY_PILL.id,
    YOMU_LOOKUP_LINK.id,
    BUNPRO_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id
  ], [
    YOMU_LOOKUP_LINK.id,
    JITEN_LOOKUP_LINK.id,
    JPDB_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    REMOVED_GOO_LOOKUP_LINK_ID,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id
  ], [
    JITEN_LOOKUP_LINK.id,
    JPDB_LOOKUP_LINK.id,
    YOMU_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    REMOVED_GOO_LOOKUP_LINK_ID,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id
  ], [
    JPDB_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id,
    YOMU_LOOKUP_LINK.id,
    JITEN_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    REMOVED_GOO_LOOKUP_LINK_ID,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id
  ]];
  const FALLBACK_HEX_COLOR = "#000000";
  function normalizeHexColor(color) {
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : FALLBACK_HEX_COLOR;
  }
  function sharedContrastRatio(a, b, normalizeColor = normalizeHexColor) {
    const l1 = relativeLuminance(a, normalizeColor);
    const l2 = relativeLuminance(b, normalizeColor);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
  }
  function relativeLuminance(color, normalizeColor = normalizeHexColor) {
    const [red, green, blue] = sharedHexToRgb(color, normalizeColor).map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }
  function sharedMixHex(from, to, amount, normalizeColor = normalizeHexColor) {
    const a = sharedHexToRgb(from, normalizeColor);
    const b = sharedHexToRgb(to, normalizeColor);
    return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
  }
  function sharedHexToRgb(color, normalizeColor = normalizeHexColor) {
    const safe = normalizeHexColor(normalizeColor(color));
    return [
      parseInt(safe.slice(1, 3), 16),
      parseInt(safe.slice(3, 5), 16),
      parseInt(safe.slice(5, 7), 16)
    ];
  }
  Logger.scope("Settings");
  const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
  const OCR_BACKGROUND_MIN_TEXT_CONTRAST = 4.5;
  const OCR_BACKGROUND_MIN_RENDERED_OPACITY = 0.56;
  const DEFAULT_OCR_BACKGROUND_OPACITY = 0.68;
  const DEFAULT_OCR_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
  accessibleOcrBackgroundColor(DEFAULT_ACCENT_COLOR, DEFAULT_OCR_BACKGROUND_OPACITY);
  const AUDIO_SOURCE_TYPE_VALUES = [
    "jpod101",
    "language-pod-101",
    "jisho",
    "lingua-libre",
    "wiktionary",
    "jiten-tts",
    "jpdb-tts",
    "text-to-speech",
    "text-to-speech-reading",
    "custom",
    "custom-json"
  ];
  const DEFAULT_AUDIO_SOURCES = [
    { type: "custom-json", url: YOMU_HOSTED_AUDIO_URL, voice: "", enabled: true },
    { type: "jpod101", url: "", voice: "", enabled: false },
    { type: "language-pod-101", url: "", voice: "", enabled: false },
    { type: "jisho", url: "", voice: "", enabled: false },
    { type: "jiten-tts", url: "", voice: "", enabled: false },
    { type: "jpdb-tts", url: "", voice: "", enabled: false },
    { type: "text-to-speech", url: "", voice: "", enabled: false }
  ];
  new Set(AUDIO_SOURCE_TYPE_VALUES);
  new Set(
    DEFAULT_AUDIO_SOURCES.filter((source) => source.type !== "custom-json" || source.url !== YOMU_HOSTED_AUDIO_URL).map((source) => source.type)
  );
  const DEFAULT_NEW_TAB_STUDY_STEP_ORDER = [
    "kanji-doodle",
    "word",
    "recall-cloze",
    "listen-pitch",
    "speaking",
    "type-word"
  ];
  new Set(DEFAULT_NEW_TAB_STUDY_STEP_ORDER);
  ({
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link) => ({ ...link }))
  });
  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }
  function sanitizeAccentColor(value, fallback = DEFAULT_ACCENT_COLOR) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (!shortHex) return fallback;
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
  }
  function accessibleOcrBackgroundOpacity(opacity) {
    return Math.max(
      OCR_BACKGROUND_MIN_RENDERED_OPACITY,
      clampNumber(opacity, 0, 1, DEFAULT_OCR_BACKGROUND_OPACITY)
    );
  }
  function accessibleOcrBackgroundColor(accentColor, opacity = DEFAULT_OCR_BACKGROUND_OPACITY) {
    const accent = sanitizeAccentColor(accentColor);
    const renderedOpacity = accessibleOcrBackgroundOpacity(opacity);
    if (ocrRenderedBackgroundContrast(accent, renderedOpacity) >= OCR_BACKGROUND_MIN_TEXT_CONTRAST) {
      return accent;
    }
    for (let amount = 0.08; amount <= 1; amount += 0.04) {
      const candidate = sharedMixHex(accent, "#000000", amount, sanitizeAccentColor);
      if (ocrRenderedBackgroundContrast(candidate, renderedOpacity) >= OCR_BACKGROUND_MIN_TEXT_CONTRAST) {
        return candidate;
      }
    }
    return "#000000";
  }
  function ocrRenderedBackgroundContrast(color, opacity) {
    const renderedOnWhite = sharedMixHex("#ffffff", color, opacity, sanitizeAccentColor);
    return sharedContrastRatio(renderedOnWhite, DEFAULT_OCR_TEXT_COLOR, sanitizeAccentColor);
  }
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,DD,DETAILS,DIALOG,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  new Set(
    "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
  );
  selectorPairs("control,toggle,player", ["class"]);
  new Set("heiban,atamadaka,nakadaka,odaka,kifuku".split(","));
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  const SVG_PATH_TOKEN = /[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi;
  const CURVE_STEPS = 10;
  const PATH_COMMAND_READERS = {
    M: (sampler, relative) => sampler.readMove(relative),
    L: (sampler, relative) => sampler.readLines(relative),
    H: (sampler, relative) => sampler.readHorizontalLines(relative),
    V: (sampler, relative) => sampler.readVerticalLines(relative),
    C: (sampler, relative) => sampler.readCubics(relative),
    S: (sampler, relative) => sampler.readSmoothCubics(relative),
    Q: (sampler, relative) => sampler.readQuadratics(relative),
    T: (sampler, relative) => sampler.readSmoothQuadratics(relative),
    A: (sampler, relative) => sampler.readArcs(relative),
    Z: (sampler) => sampler.closePath()
  };
  function parseSvgPathPoints(pathData) {
    return new SvgPathSampler(pathData).parse();
  }
  class SvgPathSampler {
    tokens;
    index = 0;
    command = "";
    current = { x: 0, y: 0 };
    start = { x: 0, y: 0 };
    lastCubicControl = null;
    lastQuadraticControl = null;
    points = [];
    constructor(pathData) {
      this.tokens = pathData.match(SVG_PATH_TOKEN) ?? [];
    }
    parse() {
      while (this.index < this.tokens.length) {
        if (isPathCommand(this.tokens[this.index])) this.command = this.tokens[this.index++] ?? "";
        if (!this.command) break;
        const before = this.index;
        const reader = PATH_COMMAND_READERS[this.command.toUpperCase()];
        if (!reader?.(this, this.command === this.command.toLowerCase())) return this.points;
        if (this.index === before && !isPathCommand(this.tokens[this.index])) return this.points;
      }
      return this.points;
    }
    readMove(relative) {
      if (!this.hasNumbers(2)) return false;
      this.current = this.absolute(this.read(), this.read(), relative);
      this.start = this.current;
      this.push(this.current);
      this.command = relative ? "l" : "L";
      this.clearControls();
      return true;
    }
    readLines(relative) {
      while (this.hasNumbers(2)) this.lineTo(this.absolute(this.read(), this.read(), relative));
      return true;
    }
    readHorizontalLines(relative) {
      while (this.hasNumbers(1)) {
        const x = this.read();
        this.lineTo({ x: relative ? this.current.x + x : x, y: this.current.y });
      }
      return true;
    }
    readVerticalLines(relative) {
      while (this.hasNumbers(1)) {
        const y = this.read();
        this.lineTo({ x: this.current.x, y: relative ? this.current.y + y : y });
      }
      return true;
    }
    readCubics(relative) {
      return this.readCurve(6, () => {
        this.sampleCubicTo(
          this.readAbsolutePoint(relative),
          this.readAbsolutePoint(relative),
          this.readAbsolutePoint(relative)
        );
      });
    }
    readSmoothCubics(relative) {
      return this.readCurve(4, () => {
        const c1 = this.lastCubicControl ? reflect(this.current, this.lastCubicControl) : this.current;
        this.sampleCubicTo(c1, this.readAbsolutePoint(relative), this.readAbsolutePoint(relative));
      });
    }
    readQuadratics(relative) {
      return this.readCurve(4, () => {
        this.sampleQuadraticTo(this.readAbsolutePoint(relative), this.readAbsolutePoint(relative));
      });
    }
    readSmoothQuadratics(relative) {
      return this.readCurve(2, () => {
        const control = this.lastQuadraticControl ? reflect(this.current, this.lastQuadraticControl) : { ...this.current };
        this.sampleQuadraticTo(control, this.readAbsolutePoint(relative));
      });
    }
    readCurve(numberCount, readSegment) {
      while (this.hasNumbers(numberCount)) readSegment();
      return true;
    }
    setCubicControl(control) {
      this.lastCubicControl = control;
      this.lastQuadraticControl = null;
    }
    setQuadraticControl(control) {
      this.lastQuadraticControl = control;
      this.lastCubicControl = null;
    }
    readAbsolutePoint(relative) {
      return this.absolute(this.read(), this.read(), relative);
    }
    sampleCubicTo(c1, c2, end) {
      sampleCubic(this.current, c1, c2, end, (point) => this.push(point));
      this.current = end;
      this.setCubicControl(c2);
    }
    sampleQuadraticTo(control, end) {
      sampleQuadratic(this.current, control, end, (point) => this.push(point));
      this.current = end;
      this.setQuadraticControl(control);
    }
    readArcs(relative) {
      while (this.hasNumbers(7)) {
        this.read();
        this.read();
        this.read();
        this.read();
        this.read();
        this.lineTo(this.absolute(this.read(), this.read(), relative));
      }
      return true;
    }
    closePath() {
      this.lineTo(this.start);
      this.command = "";
      return true;
    }
    push(point) {
      const previous = this.points.at(-1);
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 1e-3) this.points.push(point);
    }
    hasNumbers(count) {
      return this.index + count <= this.tokens.length && this.tokens.slice(this.index, this.index + count).every((token) => !isPathCommand(token));
    }
    read() {
      return Number(this.tokens[this.index++]);
    }
    absolute(x, y, relative) {
      return relative ? { x: this.current.x + x, y: this.current.y + y } : { x, y };
    }
    lineTo(point) {
      this.current = point;
      this.push(this.current);
      this.clearControls();
    }
    clearControls() {
      this.lastCubicControl = null;
      this.lastQuadraticControl = null;
    }
  }
  function isPathCommand(token) {
    return Boolean(token && /^[A-Za-z]$/.test(token));
  }
  function reflect(origin, control) {
    return {
      x: origin.x * 2 - control.x,
      y: origin.y * 2 - control.y
    };
  }
  function sampleCubic(from, c1, c2, to, push) {
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS;
      const mt = 1 - t;
      push({
        x: mt ** 3 * from.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * to.x,
        y: mt ** 3 * from.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * to.y
      });
    }
  }
  function sampleQuadratic(from, c, to, push) {
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS;
      const mt = 1 - t;
      push({
        x: mt ** 2 * from.x + 2 * mt * t * c.x + t ** 2 * to.x,
        y: mt ** 2 * from.y + 2 * mt * t * c.y + t ** 2 * to.y
      });
    }
  }
  const KANJIVG_POSITION_THRESHOLD = 0.12;
  const KANJIVG_HORIZONTAL_DOMINANCE = 1.12;
  const KANJIVG_SAFE_PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa0-9,.\-\s]+$/;
  const KANJIVG_STROKE_LABEL = /^[\d]+$/;
  const KANJIVG_TEXT_TRANSFORM = /^matrix\([0-9,.\-\s]+\)$/;
  Logger.scope("KanjiVG");
  const KANJIVG_AXIS_POSITIONS = {
    x: { negative: "left", positive: "right" },
    y: { negative: "top", positive: "bottom" }
  };
  function parseKanjiVGSvg(svgText, kanji) {
    const doc = parseXmlDocument(svgText, "image/svg+xml");
    const sourceSvg = doc.querySelector("svg");
    if (!sourceSvg) return null;
    const viewBox = sourceSvg.getAttribute("viewBox") || "0 0 109 109";
    const componentPositions = readKanjiVGComponentPositions(sourceSvg, kanji);
    const parsedPaths = readKanjiVGPaths(sourceSvg, viewBox);
    const paths = parsedPaths.map((path) => path.svg);
    if (!paths.length) return null;
    const strokeShapes = parsedPaths.map((path) => path.shape);
    const numbers = readKanjiVGStrokeNumbers(sourceSvg);
    const svg = `<svg class="jpdb-reader-kanjivg-svg" viewBox="${escapeHtml(viewBox)}" role="img" aria-label="Stroke order for ${escapeHtml(kanji)}">
        <g class="jpdb-reader-kanjivg-strokes">${paths.join("")}</g>
        <g class="jpdb-reader-kanjivg-numbers">${numbers.join("")}</g>
    </svg>`;
    return {
      kanji,
      svg,
      strokeCount: paths.length,
      strokeShapes: strokeShapes.every(Boolean) ? strokeShapes : void 0,
      componentPositions
    };
  }
  function readKanjiVGPaths(sourceSvg, viewBox) {
    return Array.from(sourceSvg.querySelectorAll("path")).map((path, index) => readKanjiVGPath(path, index, viewBox)).filter((path) => Boolean(path));
  }
  function readKanjiVGPath(path, index, viewBox) {
    const d = path.getAttribute("d");
    if (!isSafeKanjiVGPathData(d)) return null;
    return {
      svg: renderKanjiVGPath(d, index),
      shape: readKanjiVGStrokeShape(d, viewBox)
    };
  }
  function isSafeKanjiVGPathData(pathData) {
    return Boolean(pathData && KANJIVG_SAFE_PATH_DATA.test(pathData));
  }
  function renderKanjiVGPath(pathData, index) {
    return `<path d="${escapeHtml(pathData)}" style="--stroke-index:${index}" />`;
  }
  function readKanjiVGStrokeNumbers(sourceSvg) {
    return Array.from(sourceSvg.querySelectorAll("text")).map(readKanjiVGStrokeNumber).filter(Boolean);
  }
  function readKanjiVGStrokeNumber(text2) {
    const transform = text2.getAttribute("transform") ?? "";
    const label = (text2.textContent ?? "").trim();
    if (!isSafeKanjiVGStrokeNumber(label, transform)) return "";
    return renderKanjiVGStrokeNumber(transform, label);
  }
  function isSafeKanjiVGStrokeNumber(label, transform) {
    return KANJIVG_STROKE_LABEL.test(label) && KANJIVG_TEXT_TRANSFORM.test(transform);
  }
  function renderKanjiVGStrokeNumber(transform, label) {
    return `<text transform="${escapeHtml(transform)}">${escapeHtml(label)}</text>`;
  }
  function readKanjiVGStrokeShape(pathData, viewBox) {
    const box = parseViewBox(viewBox);
    const points = parseSvgPathPoints(pathData).map((point) => ({
      x: (point.x - box.x) / box.width,
      y: (point.y - box.y) / box.height
    })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    return points.length > 1 ? points : null;
  }
  function parseViewBox(viewBox) {
    const values = viewBox.trim().split(/[\s,]+/).map(Number);
    const [x, y, width, height] = values;
    if (values.length === 4 && values.every(Number.isFinite) && width > 0 && height > 0) {
      return { x, y, width, height };
    }
    return { x: 0, y: 0, width: 109, height: 109 };
  }
  function readKanjiVGComponentPositions(sourceSvg, kanji) {
    const root = Array.from(sourceSvg.querySelectorAll("g")).find((group) => group.getAttribute("kvg:element") === kanji);
    const viewBox = parseViewBox(sourceSvg.getAttribute("viewBox") || "0 0 109 109");
    const context = { kanji, root, viewBox };
    const positions = /* @__PURE__ */ new Map();
    for (const group of sourceSvg.querySelectorAll("g")) {
      for (const entry of readKanjiVGComponentPositionEntries(group, context)) {
        addKanjiVGComponentPosition(positions, entry);
      }
    }
    return Array.from(positions.values());
  }
  function readKanjiVGComponentPositionEntries(group, context) {
    const component = cleanComponent(group.getAttribute("kvg:element") ?? "");
    if (!isNestedKanjiVGComponent(component, context.kanji)) return [];
    const entry = readKanjiVGComponentPositionEntry(group, component, context);
    return entry ? expandKanjiVGOriginalComponent(entry) : [];
  }
  function isNestedKanjiVGComponent(component, kanji) {
    return Boolean(component && component !== kanji);
  }
  function readKanjiVGComponentPositionEntry(group, component, context) {
    const parentGroup = nearestKanjiVGComponentParent(group, context.root);
    const position = readKanjiVGPosition(group, parentGroup, context);
    if (!position) return null;
    const original = cleanComponent(group.getAttribute("kvg:original") ?? "");
    const direct = Boolean(context.root && parentGroup === context.root);
    return {
      component,
      original: original || void 0,
      ...readKanjiVGParent(parentGroup),
      position,
      direct,
      depth: kanjiVGComponentDepth(group, context.root),
      ...readKanjiVGVariant(group),
      ...readKanjiVGComponentGeometry(group, context.viewBox)
    };
  }
  function readKanjiVGPosition(group, parentGroup, context) {
    return cleanComponent(group.getAttribute("kvg:position") ?? geometricKanjiVGPosition(group, parentGroup, context.viewBox) ?? inheritedKanjiVGPosition(group, context.root));
  }
  function readKanjiVGParent(parentGroup) {
    const parent = cleanComponent(parentGroup?.getAttribute("kvg:element") ?? "");
    if (!parent) return {};
    return {
      parent,
      parentOriginal: cleanComponent(parentGroup?.getAttribute("kvg:original") ?? "") || void 0
    };
  }
  function readKanjiVGVariant(group) {
    return group.getAttribute("kvg:variant") === "true" ? { variant: true } : {};
  }
  function readKanjiVGComponentGeometry(group, viewBox) {
    const bounds = normalizedKanjiVGElementBounds(group, viewBox);
    if (!bounds) return {};
    return {
      bounds,
      center: {
        x: roundKanjiVGGeometry(bounds.x + bounds.width / 2),
        y: roundKanjiVGGeometry(bounds.y + bounds.height / 2)
      }
    };
  }
  function expandKanjiVGOriginalComponent(entry) {
    if (!entry.original || entry.original === entry.component) return [entry];
    return [
      entry,
      {
        ...entry,
        component: entry.original,
        original: entry.component
      }
    ];
  }
  function addKanjiVGComponentPosition(positions, entry) {
    const key = kanjiVGComponentPositionKey(entry);
    const existing = positions.get(key);
    if (shouldReplaceKanjiVGComponentPosition(existing, entry)) positions.set(key, entry);
  }
  function kanjiVGComponentPositionKey(entry) {
    return `${entry.component}\0${entry.original ?? ""}\0${entry.parent ?? ""}\0${entry.position}`;
  }
  function shouldReplaceKanjiVGComponentPosition(existing, entry) {
    if (!existing) return true;
    if (!existing.direct && entry.direct) return true;
    return Boolean(existing.variant && !entry.variant);
  }
  function nearestKanjiVGComponentParent(group, root) {
    let parent = group.parentElement;
    while (parent) {
      if (parent === root || cleanComponent(parent.getAttribute("kvg:element") ?? "")) return parent;
      parent = parent.parentElement;
    }
    return void 0;
  }
  function kanjiVGComponentDepth(group, root) {
    let depth = 0;
    let parent = group.parentElement;
    while (parent && parent !== root) {
      if (cleanComponent(parent.getAttribute("kvg:element") ?? "")) depth += 1;
      parent = parent.parentElement;
    }
    return depth + 1;
  }
  function geometricKanjiVGPosition(group, parent, viewBox) {
    const offset = relativeKanjiVGCenterOffset(group, parent, viewBox);
    return offset ? kanjiVGOffsetPosition(offset) : "";
  }
  function relativeKanjiVGCenterOffset(group, parent, viewBox) {
    if (!parent) return null;
    const groupBox = positiveKanjiVGElementBox(group, viewBox);
    const parentBox = positiveKanjiVGElementBox(parent, viewBox);
    if (!groupBox || !parentBox) return null;
    return {
      x: (boxCenterX(groupBox) - boxCenterX(parentBox)) / parentBox.width,
      y: (boxCenterY(groupBox) - boxCenterY(parentBox)) / parentBox.height
    };
  }
  function positiveKanjiVGElementBox(element2, viewBox) {
    const box = kanjiVGElementBox(element2, viewBox);
    return box && hasPositiveArea(box) ? box : null;
  }
  function hasPositiveArea(box) {
    return box.width > 0 && box.height > 0;
  }
  function boxCenterX(box) {
    return box.x + box.width / 2;
  }
  function boxCenterY(box) {
    return box.y + box.height / 2;
  }
  function kanjiVGOffsetPosition(offset) {
    const axis = dominantKanjiVGOffsetAxis(offset);
    if (axis === "center") return axis;
    return KANJIVG_AXIS_POSITIONS[axis][kanjiVGOffsetDirection(offset[axis])];
  }
  function kanjiVGOffsetDirection(value) {
    return value < 0 ? "negative" : "positive";
  }
  function dominantKanjiVGOffsetAxis(offset) {
    const absX = Math.abs(offset.x);
    const absY = Math.abs(offset.y);
    if (absX > absY * KANJIVG_HORIZONTAL_DOMINANCE && absX > KANJIVG_POSITION_THRESHOLD) return "x";
    if (absY > KANJIVG_POSITION_THRESHOLD) return "y";
    return "center";
  }
  function kanjiVGElementBox(element2, viewBox) {
    const points = readKanjiVGElementPoints(element2, viewBox);
    if (!points.length) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  function readKanjiVGElementPoints(element2, viewBox) {
    return Array.from(element2.querySelectorAll("path")).flatMap((path) => readKanjiVGElementPathPoints(path, viewBox));
  }
  function readKanjiVGElementPathPoints(path, viewBox) {
    return parseSvgPathPoints(path.getAttribute("d") ?? "").filter((point) => isKanjiVGGeometryPoint(point, viewBox));
  }
  function isKanjiVGGeometryPoint(point, viewBox) {
    return point.x >= viewBox.x - viewBox.width && point.y >= viewBox.y - viewBox.height;
  }
  function normalizedKanjiVGElementBounds(element2, viewBox) {
    const box = positiveKanjiVGElementBox(element2, viewBox);
    if (!box) return null;
    const edges = normalizedKanjiVGBoxEdges(box, viewBox);
    return edges ? roundedKanjiVGBounds(edges) : null;
  }
  function normalizedKanjiVGBoxEdges(box, viewBox) {
    const left = clampUnit((box.x - viewBox.x) / viewBox.width);
    const top = clampUnit((box.y - viewBox.y) / viewBox.height);
    const right = clampUnit((box.x + box.width - viewBox.x) / viewBox.width);
    const bottom = clampUnit((box.y + box.height - viewBox.y) / viewBox.height);
    if (right <= left || bottom <= top) return null;
    return { left, top, right, bottom };
  }
  function roundedKanjiVGBounds(edges) {
    return {
      x: roundKanjiVGGeometry(edges.left),
      y: roundKanjiVGGeometry(edges.top),
      width: roundKanjiVGGeometry(edges.right - edges.left),
      height: roundKanjiVGGeometry(edges.bottom - edges.top)
    };
  }
  function clampUnit(value) {
    return Math.max(0, Math.min(1, value));
  }
  function roundKanjiVGGeometry(value) {
    return Number(value.toFixed(4));
  }
  function inheritedKanjiVGPosition(group, root) {
    let parent = group.parentElement;
    while (parent && parent !== root) {
      const position = parent.getAttribute("kvg:position");
      if (position) return position;
      parent = parent.parentElement;
    }
    return "";
  }
  function cleanComponent(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  const OFFLINE_TRACES = {
    "一": "/academy/vendor/kanjivg/04e00.svg"
  };
  function createCanonicalKanjiWritingService(options = {}) {
    const fetcher = options.fetcher ?? fetch;
    const cache = /* @__PURE__ */ new Map();
    return {
      lookup(character) {
        const normalized = Array.from(character.trim())[0] ?? "";
        if (!normalized || !OFFLINE_TRACES[normalized]) return Promise.resolve(null);
        let pending = cache.get(normalized);
        if (!pending) {
          pending = fetcher(OFFLINE_TRACES[normalized]).then((response) => response.ok ? response.text() : "").then((svg) => svg ? parseKanjiVGSvg(svg, normalized) : null).then((info) => info ? {
            character: info.kanji,
            svg: info.svg,
            strokeCount: info.strokeCount,
            strokeShapes: info.strokeShapes ?? [],
            source: {
              name: "KanjiVG",
              url: "https://kanjivg.tagaini.net/",
              licence: "CC BY-SA 3.0",
              revision: "eab57831f1e418016a029266c4b17bf824b9af68"
            }
          } : null).catch(() => null);
          cache.set(normalized, pending);
        }
        return pending;
      }
    };
  }
  const DEFAULT_DB_NAME = "yomu-academy-v1";
  const DB_VERSION = 1;
  const EVENT_STORE = "learner-events";
  const META_STORE = "meta";
  const CHECKPOINT_ID = "active-checkpoint";
  async function openAcademyPersistence(factory = indexedDB, databaseName = DEFAULT_DB_NAME) {
    const database = await openDatabase(factory, databaseName ?? DEFAULT_DB_NAME);
    return {
      events: {
        readAll: () => readAllEvents(database),
        append: (events) => appendEvents(database, events)
      },
      checkpoint: {
        async load() {
          const record = await request(database.transaction(META_STORE).objectStore(META_STORE).get(CHECKPOINT_ID));
          return record?.value ? structuredClone(record.value) : null;
        },
        async save(checkpoint) {
          validateCheckpoint(checkpoint);
          const transaction = database.transaction(META_STORE, "readwrite");
          transaction.objectStore(META_STORE).put({ id: CHECKPOINT_ID, value: structuredClone(checkpoint) });
          await transactionComplete(transaction);
        }
      },
      close() {
        database.close();
      }
    };
  }
  function createMemoryAcademyPersistence() {
    const events = [];
    let checkpoint = null;
    return {
      events: {
        async readAll() {
          return structuredClone(events);
        },
        async append(candidates) {
          for (const candidate of candidates) {
            const previous = events.find((event) => event.eventId === candidate.eventId);
            if (!previous) events.push(structuredClone(candidate));
            else if (!learnerEventsAreEquivalent(previous, candidate)) throw new Error(`Conflicting learner event id: ${candidate.eventId}`);
          }
        }
      },
      checkpoint: {
        async load() {
          return checkpoint ? structuredClone(checkpoint) : null;
        },
        async save(value) {
          validateCheckpoint(value);
          checkpoint = structuredClone(value);
        }
      },
      close() {
      }
    };
  }
  function openDatabase(factory, name) {
    return new Promise((resolve, reject) => {
      const pending = factory.open(name, DB_VERSION);
      pending.onupgradeneeded = () => {
        const database = pending.result;
        if (!database.objectStoreNames.contains(EVENT_STORE)) database.createObjectStore(EVENT_STORE, { keyPath: "eventId" });
        if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: "id" });
      };
      pending.onsuccess = () => resolve(pending.result);
      pending.onerror = () => reject(pending.error ?? new Error("Could not open Academy storage."));
      pending.onblocked = () => reject(new Error("Academy storage upgrade is blocked by another tab."));
    });
  }
  async function readAllEvents(database) {
    const values = await request(database.transaction(EVENT_STORE).objectStore(EVENT_STORE).getAll());
    return values.map((value) => structuredClone(value)).sort((left, right) => left.at - right.at || left.eventId.localeCompare(right.eventId));
  }
  function appendEvents(database, candidates) {
    return new Promise((resolve, reject) => {
      let events;
      try {
        events = uniqueEvents(candidates);
      } catch (error) {
        reject(error);
        return;
      }
      if (!events.length) {
        resolve();
        return;
      }
      const transaction = database.transaction(EVENT_STORE, "readwrite");
      const store = transaction.objectStore(EVENT_STORE);
      let conflict = null;
      events.forEach((event) => {
        const read = store.get(event.eventId);
        read.onsuccess = () => {
          const previous = read.result;
          if (previous && !learnerEventsAreEquivalent(previous, event)) {
            conflict = new Error(`Conflicting learner event id: ${event.eventId}`);
            transaction.abort();
            return;
          }
          if (!previous) store.add(structuredClone(event));
        };
        read.onerror = () => {
          conflict = read.error ?? new Error("Could not read learner event.");
          transaction.abort();
        };
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
      };
      transaction.onabort = () => reject(conflict ?? transaction.error ?? new Error("Could not store learner event batch."));
    });
  }
  function uniqueEvents(candidates) {
    const events = /* @__PURE__ */ new Map();
    for (const candidate of candidates) {
      const event = structuredClone(candidate);
      const previous = events.get(event.eventId);
      if (previous && !learnerEventsAreEquivalent(previous, event)) {
        throw new Error(`Conflicting learner event id: ${event.eventId}`);
      }
      events.set(event.eventId, event);
    }
    return [...events.values()];
  }
  function validateCheckpoint(value) {
    if (value.schemaVersion !== 1) throw new TypeError("Academy checkpoint schemaVersion must be 1.");
    if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) throw new TypeError("Academy checkpoint needs a valid timestamp.");
    if (![
      "access",
      "profile",
      "rie-unlock",
      "start",
      "manual-band",
      "placement-mock",
      "placement-result",
      "arrival-bridge",
      "band-entry",
      "lesson-fork",
      "source-activity",
      "aakash-meet",
      "writing-practice",
      "campus",
      "lab",
      "review",
      "journal"
    ].includes(value.route)) throw new TypeError("Academy checkpoint has an invalid route.");
  }
  function request(pending) {
    return new Promise((resolve, reject) => {
      pending.onsuccess = () => resolve(pending.result);
      pending.onerror = () => reject(pending.error ?? new Error("IndexedDB request failed."));
    });
  }
  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    });
  }
  function normalizeResumeCheckpoint(checkpoint, projection, now, online) {
    const session = checkpoint.session;
    if (!session || !sessionCanResume(session, now, online)) {
      return { schemaVersion: 1, route: "access", updatedAt: now };
    }
    let normalized = checkpoint;
    if (!projection.profile) normalized = { ...normalized, route: "profile" };
    else if (normalized.route === "access" || normalized.route === "profile") normalized = { ...normalized, route: "start" };
    if (normalized.route === "rie-unlock" && !projection.profile) normalized = { ...normalized, route: "profile" };
    if (normalized.route === "placement-result" && !projection.latestPlacement) normalized = { ...normalized, route: "placement-mock" };
    if (normalized.route === "arrival-bridge" && !normalized.selectedBand) normalized = { ...normalized, route: "start" };
    if (normalized.route === "band-entry" && !normalized.selectedBand) {
      normalized = projection.curriculumEntry?.band ? { ...normalized, selectedBand: projection.curriculumEntry.band } : { ...normalized, route: "start" };
    }
    if (normalized.route === "source-activity" && projection.completedScenes.includes("scene:lesson-zero-first-repair")) {
      normalized = { ...normalized, route: "aakash-meet" };
    }
    if (normalized.route === "writing-practice" && projection.completedScenes.includes("scene:lesson-zero-writing-desk")) {
      normalized = { ...normalized, route: "campus" };
    }
    return normalized;
  }
  function navigationForRoute(route) {
    if (route === "lab") return "campus";
    if (route === "campus" || route === "review" || route === "journal") return route;
    return void 0;
  }
  function themeForRoute(route) {
    if (route === "access" || route === "profile" || route === "rie-unlock" || route === "start") return "opening.invitation";
    if (route === "placement-mock" || route === "placement-result") return "silence";
    if (route === "writing-practice") return "challenge.kanji";
    if (route === "campus") return "campus.evening";
    if (route === "lab") return "lab.listening";
    if (route === "review") return "library.quiet";
    if (route === "journal") return "bond.quiet";
    return "classroom.focus";
  }
  const BAND_ENTRY_DEFINITIONS = {
    n5: {
      conceptId: "concept:n5-time-reading",
      prompt: {
        en: "Rie says: 「授業は七時半に始まります。」 When does class begin?",
        ja: "りえ先生が「授業は七時半に始まります」と言いました。授業は何時に始まりますか。"
      },
      reviewContent: {
        expression: "七時半に始まります。",
        reading: "しちじはんにはじまります",
        meanings: ["It begins at 7:30."]
      },
      options: [
        correct("seven-thirty", "7:30", "七時半", "七時半 means half past seven.", "「七時半」は、七時から三十分後です。"),
        wrong(
          "seven",
          "7:00",
          "七時",
          ["The sentence includes 半, so it is later than seven.", "文には「半」があるので、七時より三十分後です。"],
          ["Focus on 半: it adds thirty minutes.", "「半」は三十分です。"],
          ["七時半 is 7:30.", "七時半は7:30です。"],
          "half-hour-missed"
        ),
        wrong(
          "eight-thirty",
          "8:30",
          "八時半",
          ["The hour is 七, not 八.", "時刻の数字は「八」ではなく「七」です。"],
          ["Focus on the first number, 七.", "最初の数字「七」に注目してください。"],
          ["八時半 would mean 8:30.", "八時半なら8:30です。"],
          "hour-confusion"
        )
      ]
    },
    n4: {
      conceptId: "concept:n4-conditional-plan",
      prompt: {
        en: "Rie says: 「雨が降ったら、カフェで待っていてください。」 What should you do if it rains?",
        ja: "りえ先生が「雨が降ったら、カフェで待っていてください」と言いました。雨が降ったとき、どうしますか。"
      },
      reviewContent: {
        expression: "雨が降ったら、カフェで待っていてください。",
        reading: "あめがふったら、かふぇでまっていてください",
        meanings: ["If it rains, please wait at the cafe."]
      },
      options: [
        correct("wait-cafe", "Wait at the cafe.", "カフェで待ちます。", "The たら-clause sets the rain condition; the requested action is waiting at the cafe.", "「たら」は条件を示し、頼まれた行動はカフェで待つことです。"),
        wrong(
          "go-library",
          "Go to the library.",
          "図書館へ行きます。",
          ["The sentence names the cafe, not the library.", "文に出てくる場所は、図書館ではなくカフェです。"],
          ["Focus on カフェで, the location of the action.", "場所を表す「カフェで」に注目してください。"],
          ["図書館で待ってください would mean “Please wait at the library.”", "図書館なら「図書館で待ってください」と言います。"],
          "location-confusion"
        ),
        wrong(
          "leave-cafe",
          "Leave the cafe.",
          "カフェを出ます。",
          ["待っていて asks you to remain and wait.", "「待っていて」は、その場所で待ち続けるよう頼む表現です。"],
          ["Choose the action expressed by 待つ.", "「待つ」の行動を選んでください。"],
          ["ここで待っていてください means “Please wait here.”", "「ここで待っていてください」は、ここで待つよう頼む表現です。"],
          "action-confusion"
        )
      ]
    },
    n3: {
      conceptId: "concept:n3-hearsay-inference",
      prompt: {
        en: "You hear: 「アレックスさんは来ると言っていましたが、電車が止まったらしいです。」 What is supported by the message?",
        ja: "「アレックスさんは来ると言っていましたが、電車が止まったらしいです。」この文から分かることは何ですか。"
      },
      reviewContent: {
        expression: "電車が止まったらしいです。",
        reading: "でんしゃがとまったらしいです",
        meanings: ["It seems / I heard that the train stopped."]
      },
      options: [
        correct("train-report", "There is a report that Alex’s train stopped.", "アレックスさんの電車が止まったという情報があります。", "らしい marks reported or indirect information; the message does not claim direct observation.", "「らしい」は、聞いた情報や間接的な根拠を示します。"),
        wrong(
          "alex-cancelled",
          "Alex definitely decided not to come.",
          "アレックスさんは絶対に来ないと決めました。",
          ["The message reports a stopped train, not a definite decision by Alex.", "文が伝えているのは電車の停止で、アレックスさんの決定ではありません。"],
          ["Separate what the sentence reports from what you might infer.", "文が伝える情報と、そこから推測できることを分けてください。"],
          ["The sentence never says 「来ないと決めた」.", "「来ないと決めた」とは書かれていません。"],
          "inference-overreach"
        ),
        wrong(
          "speaker-saw",
          "The speaker personally saw the train stop.",
          "話し手が電車の停止を直接見ました。",
          ["らしい does not establish direct observation.", "「らしい」だけでは、話し手が直接見たとは言えません。"],
          ["Consider what kind of information source らしい signals.", "「らしい」が示す情報源を考えてください。"],
          ["Direct observation could be 「電車が止まるのを見ました」.", "直接見たなら「電車が止まるのを見ました」と言えます。"],
          "evidence-source-confusion"
        )
      ]
    },
    n2: {
      conceptId: "concept:n2-qualified-stance",
      prompt: {
        en: "Read: 「計画に問題がないとは言えないが、今すぐ中止する必要はない。」 Which stance is closest?",
        ja: "「計画に問題がないとは言えないが、今すぐ中止する必要はない。」筆者の立場に最も近いものを選んでください。"
      },
      reviewContent: {
        expression: "問題がないとは言えない",
        reading: "もんだいがないとはいえない",
        meanings: ["It cannot be said that there are no problems."]
      },
      options: [
        correct("qualified-continue", "There are concerns, but immediate cancellation is not justified.", "懸念はあるが、すぐに中止すべきだとは考えていません。", "The writer concedes possible problems, then rejects the need for immediate cancellation.", "問題の可能性を認めた上で、即時中止の必要性は否定しています。"),
        wrong(
          "no-problems",
          "The plan has no problems.",
          "計画には問題がありません。",
          ["ないとは言えない leaves open the possibility of problems.", "「ないとは言えない」は、問題がある可能性を残します。"],
          ["Focus on the scoped double negative ないとは言えない.", "二重否定の「ないとは言えない」に注目してください。"],
          ["安全だとは言えない means “We cannot say it is safe.”", "「安全だとは言えない」は、安全だと断定できないという意味です。"],
          "negation-scope"
        ),
        wrong(
          "cancel-now",
          "The plan must be cancelled immediately.",
          "計画は今すぐ中止しなければなりません。",
          ["The second clause explicitly says immediate cancellation is unnecessary.", "後半は、今すぐ中止する必要を明確に否定しています。"],
          ["Check what 必要はない negates.", "「必要はない」が何を否定しているか確認してください。"],
          ["急ぐ必要はない means “There is no need to hurry.”", "「急ぐ必要はない」は、急がなくてもよいという意味です。"],
          "concession-missed"
        )
      ]
    },
    n1: {
      conceptId: "concept:n1-implicit-motive",
      prompt: {
        en: "Read: 「彼が返事をしなかったのは、同意したからというより、反論するほどの確信がなかったからだ。」 What does the writer infer?",
        ja: "「彼が返事をしなかったのは、同意したからというより、反論するほどの確信がなかったからだ。」筆者は何を推測していますか。"
      },
      reviewContent: {
        expression: "同意したからというより",
        reading: "どういしたからというより",
        meanings: ["Rather than because he agreed…"]
      },
      options: [
        correct("uncertain-silence", "His silence reflected insufficient confidence to object, not clear agreement.", "沈黙は明確な同意ではなく、反論する確信の不足を示していました。", "というより rejects agreement as the main explanation and replaces it with uncertainty.", "「というより」は前の説明を退け、より適切な説明を示します。"),
        wrong(
          "clear-agreement",
          "His silence proved complete agreement.",
          "沈黙は全面的な同意を証明しました。",
          ["The sentence treats agreement as the less fitting explanation.", "文は、同意をより適切でない説明として退けています。"],
          ["Read the explanation after 同意したからというより.", "「同意したからというより」の後にある説明を読んでください。"],
          ["賛成というより、反対する理由がなかった means “Rather than support, there was no reason to oppose.”", "「賛成というより、反対する理由がなかった」も、最初の説明を言い換える表現です。"],
          "implicit-meaning-reversed"
        ),
        wrong(
          "certain-objection",
          "He was certain the other person was wrong.",
          "彼は相手が間違っていると確信していました。",
          ["The sentence says he lacked enough confidence to object.", "文は、反論するほどの確信がなかったと述べています。"],
          ["Check the negation in 確信がなかった.", "「確信がなかった」の否定を確認してください。"],
          ["自信がなかったので、何も言えませんでした means “I lacked confidence, so I could not say anything.”", "「自信がなかったので、何も言えませんでした」も、不確かさが沈黙につながる例です。"],
          "negation-missed"
        )
      ]
    }
  };
  function createBandEntryActivity(band) {
    const definition = BAND_ENTRY_DEFINITIONS[band];
    return {
      id: `activity:band-entry:${band}`,
      kind: "choice",
      conceptIds: [definition.conceptId],
      responseKind: "choice",
      prompt: definition.prompt,
      payload: {
        options: definition.options,
        reviewSeedId: `review:band-entry:${band}`,
        reviewContent: definition.reviewContent
      }
    };
  }
  function bandEntrySceneId(band) {
    return `scene:band-entry:${band}`;
  }
  function correct(id, en, ja, explanationEn, explanationJa) {
    return {
      id,
      label: { en, ja },
      correct: true,
      explanation: { en: explanationEn, ja: explanationJa }
    };
  }
  function wrong(id, en, ja, explanation, repair, example, errorTag) {
    return {
      id,
      label: { en, ja },
      correct: false,
      errorTag,
      explanation: { en: explanation[0], ja: explanation[1] },
      repairPrompt: { en: repair[0], ja: repair[1] },
      nearbyExample: { en: example[0], ja: example[1] }
    };
  }
  const EN = {
    academyName: "よむ Academy",
    languageToggle: "日本語",
    loading: "Opening the academy…",
    retry: "Try again",
    continue: "Continue",
    back: "Back",
    accessEyebrow: "A rainy London evening",
    accessTitle: "The academy doors are open.",
    accessBody: "Enter your class or invitation code. Your learning record will be available offline on this device.",
    accessCodeLabel: "Class code",
    accessCodePlaceholder: "Enter code",
    accessSubmit: "Open the doors",
    accessChecking: "Checking your invitation…",
    accessInvalid: "That invitation is not valid. Check the code and try again.",
    accessUnavailable: "The invitation service is unavailable. A previously opened session still works offline.",
    localQaSession: "Local QA session",
    rieGreeting: "こんばんは。雨の中、来てくれてありがとうございます。",
    rieGreetingSupport: "Good evening. Thank you for coming through the rain.",
    fictionNote: "Before we begin: this is an AI-created fictional story. Its plot and dialogue are invented and do not describe real events or make claims about real people. Now then—what should I call you, and why are you learning Japanese?",
    profileNameLabel: "What should Rie call you?",
    profileNamePlaceholder: "Your name",
    profileReasonLabel: "Why are you learning Japanese?",
    profileReasonPlaceholder: "A private note for your journal",
    profilePortraitLegend: "Choose how you appear in the story",
    portraitCamera: "A learner carrying a camera and folded map",
    portraitPlanner: "A learner carrying a planner and study cards",
    portraitCards: "A learner offering a card",
    portraitNotebook: "A learner with a pencil and notebook",
    profileSubmit: "Tell Rie",
    rieUnlockEyebrow: "Character unlocked",
    rieUnlockTitle: "Rie-sensei",
    rieUnlockBody: "“One open chair is enough. We can begin.” Her first page is now replayable in the class journal.",
    rieUnlockContinue: "Choose where to begin",
    bondFirstStar: "Bond ★☆☆",
    startEyebrow: "Choose your first door",
    startTitle: "Where should we begin?",
    startBody: "This is a starting point, not a permanent track. Lesson 0 and every earlier memory stay available.",
    startLessonZero: "Begin with Lesson 0",
    startLessonZeroBody: "Start from the first sounds, classroom phrases, and kana.",
    startManual: "Choose a JLPT band",
    startManualBody: "Pick a provisional N5–N1 entry and adjust it whenever you like.",
    startMock: "Take a short placement mock",
    startMockBody: "Get separate language, reading, and listening evidence before choosing.",
    manualTitle: "Choose a provisional band",
    manualBody: "You can begin earlier, change route later, or return to Lesson 0 at any time.",
    bandN5: "N5 · first useful Japanese",
    bandN4: "N4 · plans and connected sentences",
    bandN3: "N3 · everyday native input and nuance",
    bandN2: "N2 · evidence, stance, and formal language",
    bandN1: "N1 · ambiguity, synthesis, and adaptation",
    mockTitle: "A short orientation mock",
    mockBody: "This vertical-slice form demonstrates the evidence model; it is not a calibrated JLPT score.",
    mockTargetLegend: "Target band",
    mockPlayAudio: "Play the listening line",
    mockAudioUnavailable: "Japanese speech is unavailable in this browser. Choose another route or try a supported browser.",
    mockSpeakingConfidence: "How confident are you speaking without a script?",
    mockWritingConfidence: "How confident are you writing a short message?",
    mockSubmit: "See my evidence",
    mockIncomplete: "Answer each item before continuing.",
    mockResultTitle: "Rie’s recommendation",
    mockKnowledge: "Language knowledge",
    mockReading: "Reading",
    mockListening: "Listening",
    mockProduction: "Speaking and writing confidence",
    mockRecommendation: "Recommended entry",
    mockUseRecommendation: "Use this recommendation",
    mockChooseMyself: "Choose another band",
    bridgeEyebrow: "A playable arrival bridge",
    bridgeTitle: "The chair is still yours.",
    bridgeBody: "Rie introduces the present term and opens the journal to earlier memories. Curriculum placement changes what you study first; it does not pretend you lived scenes you have not played.",
    bridgeContinue: "Enter the classroom",
    bandEntryEyebrow: "Transfer lesson · selected curriculum",
    bandEntryTitle: "Start where your Japanese is now.",
    bandEntryBody: "This is an original, level-matched transfer task. It records learning evidence without marking earlier story scenes as experienced.",
    bandEntryComplete: "Your transfer task is recorded. Earlier memories remain unplayed and replayable in chronological order.",
    bandEntryContinue: "Open the campus",
    lessonForkEyebrow: "Lesson 0 · the first repair",
    lessonForkTitle: "What should Rie show first?",
    lessonForkBody: "All three paths teach the same opening concept in a different order.",
    forkSound: "Sound",
    forkSoundBody: "Hear, identify, shadow, then reveal the text.",
    forkText: "Text",
    forkTextBody: "Read, inspect, reconstruct, then hear the line.",
    forkSpeaking: "Speaking",
    forkSpeakingBody: "Rehearse, compare, then read the model in context.",
    sourceEyebrow: "Source activity · Week 1",
    sourceTitle: "Ask for one more try",
    sourceBody: "Rie has spoken too quickly. Choose the classroom phrase that asks her to repeat it.",
    sourceRecordSummary: "View the immutable source record",
    sourceRecordLine: "2023/24 Level 1 · Lesson 1 · classroom-phrases payload · page 2 · printed item 9",
    sourceComplete: "The phrase is now in your Yomu review queue.",
    sourceContinue: "Meet Aakash outside",
    aakashMeetEyebrow: "Rainy directions · first bond beat",
    aakashMeetTitle: "A better photo spot.",
    aakashMeetBody: "Aakash has found the light. The cafe is less cooperative. Help him confirm the last turn.",
    aakashUnlockEyebrow: "Classmate unlocked",
    aakashUnlockTitle: "アーカーシュ · Aakash",
    aakashUnlockLine: "“Straight ahead, then right. Great—before the rain changes its mind.”",
    aakashContinue: "Go to the writing desk",
    aakashMemoryTitle: "The better photo spot",
    aakashMemoryBody: "Rain on the map. A red umbrella. Aakash waits until you finish the direction, then points out the perfect light.",
    aakashMemoryReturn: "Close the memory",
    kanjiDeskEyebrow: "Writing Studio · two-way practice",
    kanjiDeskTitle: "See it. Then make it.",
    kanjiDeskBody: "Recognition and production are separate evidence. First identify 一; then write it with Yomu’s shared Doodle and a KanjiVG trace.",
    kanjiDeskComplete: "Recognition and handwriting evidence are saved. KanjiVG trace: Ulrich Apel, CC BY-SA 3.0.",
    kanjiDeskContinue: "Open the campus",
    campusTitle: "Evening campus",
    campusObjective: "Next: visit the Library for your first review.",
    campusObjectiveComplete: "Your evening is open: continue class, listen in the Lab, or meet someone at the Cafe.",
    locationClassroom: "Classroom",
    locationClassroomBody: "Continue the class week and source activities.",
    locationLibrary: "Library",
    locationLibraryBody: "Review due language and saved lines.",
    locationLab: "Language Lab",
    locationLabBody: "Listening, shadowing, pitch, and transcripts.",
    locationCafe: "Cafe",
    locationCafeBody: "Conversation, bonds, and transfer missions.",
    locationOpen: "Enter",
    locationUnavailable: "Opens after the first review",
    locationReturn: "Return to the campus",
    labEyebrow: "Language Lab · listening pair",
    labTitle: "Hear it before you see it.",
    labBody: "Audio, one committed answer, transcript reveal, and shadowing stay together as one learning record.",
    labPlay: "Play / replay the line",
    labTimecode: "00:00–00:02 · browser Japanese voice",
    labTranscriptTitle: "Transcript after commitment",
    labShadowTitle: "Shadow the line",
    labShadowPrompt: "Replay it, repeat aloud once, then compare your timing. This is self-assessment, not a fake pronunciation score.",
    labShadowDone: "I repeated and compared it",
    labListeningComplete: "Listening answer committed. The transcript and shadowing step are now open.",
    navCampus: "Campus",
    navReview: "Review",
    navJournal: "Class journal",
    navAudioMuted: "Sound off",
    navAudioOn: "Sound on",
    reviewTitle: "Library review",
    reviewEmpty: "Nothing is due right now. Your next return will bring scheduled work here.",
    reviewReveal: "Reveal meaning",
    reviewPrompt: "Do you remember this phrase?",
    reviewAgain: "Again",
    reviewHard: "Hard",
    reviewGood: "Good",
    reviewEasy: "Easy",
    reviewComplete: "Review recorded in Yomu.",
    reviewReturn: "Return to the campus",
    journalTitle: "Class journal",
    journalRie: "Rie-sensei",
    journalRieLine: "“One open chair is enough. We can begin.”",
    journalAakash: "Aakash",
    journalAakashLine: "“Straight ahead, then right. Great.”",
    journalBond: "Bond",
    journalReplay: "Replay the opening memory",
    journalReplayAakash: "Replay rainy directions",
    journalReason: "Reason for learning",
    memoryTitle: "The open chair",
    memoryBody: "Rain on the windows. Rie balancing tea and a stack of papers. One chair left open for you.",
    memoryReturn: "Close the memory",
    journalLocked: "Meet someone in the story to unlock their page.",
    offlineReady: "Ready offline",
    offlineNow: "Offline · progress will sync later",
    onlineNow: "Online"
  };
  const JA = {
    academyName: "よむアカデミー",
    languageToggle: "English",
    loading: "アカデミーの扉を開いています…",
    retry: "もう一度",
    continue: "続ける",
    back: "戻る",
    accessEyebrow: "雨のロンドン、夜の教室",
    accessTitle: "アカデミーの扉が開いています。",
    accessBody: "クラスコードまたは招待コードを入力してください。この端末では学習記録をオフラインでも利用できます。",
    accessCodeLabel: "クラスコード",
    accessCodePlaceholder: "コードを入力",
    accessSubmit: "扉を開く",
    accessChecking: "招待を確認しています…",
    accessInvalid: "この招待は有効ではありません。コードを確認して、もう一度お試しください。",
    accessUnavailable: "招待サービスを利用できません。以前に開いたセッションはオフラインでも続けられます。",
    localQaSession: "ローカルQAセッション",
    rieGreeting: "こんばんは。雨の中、来てくれてありがとうございます。",
    rieGreetingSupport: "こんばんは。雨の中を来てくださって、ありがとうございます。",
    fictionNote: "始める前に：これはAIが作ったフィクションです。物語と会話は創作であり、実際の出来事を描写したり、実在の人物について主張したりするものではありません。では、あなたのお名前と、日本語を学ぶ理由を教えてください。",
    profileNameLabel: "りえ先生になんと呼んでほしいですか。",
    profileNamePlaceholder: "お名前",
    profileReasonLabel: "なぜ日本語を勉強していますか。",
    profileReasonPlaceholder: "日記に残す自分だけのメモ",
    profilePortraitLegend: "物語の中の姿を選んでください",
    portraitCamera: "カメラと折りたたみ地図を持つ学習者",
    portraitPlanner: "手帳と学習カードを持つ学習者",
    portraitCards: "カードを差し出す学習者",
    portraitNotebook: "鉛筆とノートを持つ学習者",
    profileSubmit: "りえ先生に伝える",
    rieUnlockEyebrow: "キャラクター解放",
    rieUnlockTitle: "りえ先生",
    rieUnlockBody: "「椅子が一つ空いていれば十分。始めましょう。」最初のページをクラス日記から再生できるようになりました。",
    rieUnlockContinue: "始める場所を選ぶ",
    bondFirstStar: "絆 ★☆☆",
    startEyebrow: "最初の扉を選ぶ",
    startTitle: "どこから始めましょうか。",
    startBody: "これは出発点で、固定されたコースではありません。レッスン0と以前の思い出はいつでも開けます。",
    startLessonZero: "レッスン0から始める",
    startLessonZeroBody: "最初の音、教室表現、かなから始めます。",
    startManual: "JLPTレベルを選ぶ",
    startManualBody: "N5〜N1の仮の出発点を選び、いつでも調整できます。",
    startMock: "短いプレイスメント模試を受ける",
    startMockBody: "言語知識・読解・聴解の根拠を別々に確認してから選びます。",
    manualTitle: "仮のレベルを選んでください",
    manualBody: "いつでも前の内容から始めたり、ルートを変えたり、レッスン0に戻ったりできます。",
    bandN5: "N5・最初の役立つ日本語",
    bandN4: "N4・計画とつながった文",
    bandN3: "N3・日常の生きた日本語とニュアンス",
    bandN2: "N2・根拠、立場、フォーマルな表現",
    bandN1: "N1・曖昧さ、統合、適応",
    mockTitle: "短いオリエンテーション模試",
    mockBody: "この縦切り版は根拠モデルの実演です。校正済みのJLPTスコアではありません。",
    mockTargetLegend: "目標レベル",
    mockPlayAudio: "聴解の文を再生",
    mockAudioUnavailable: "このブラウザでは日本語音声を再生できません。別のルートを選ぶか、対応ブラウザでお試しください。",
    mockSpeakingConfidence: "台本なしで話す自信はどのくらいありますか。",
    mockWritingConfidence: "短いメッセージを書く自信はどのくらいありますか。",
    mockSubmit: "結果を見る",
    mockIncomplete: "続ける前に、すべての問題に答えてください。",
    mockResultTitle: "りえ先生のおすすめ",
    mockKnowledge: "言語知識",
    mockReading: "読解",
    mockListening: "聴解",
    mockProduction: "会話・作文の自信",
    mockRecommendation: "おすすめの出発点",
    mockUseRecommendation: "このおすすめを使う",
    mockChooseMyself: "別のレベルを選ぶ",
    bridgeEyebrow: "遊べる途中参加エピソード",
    bridgeTitle: "あなたの椅子は、まだ空いています。",
    bridgeBody: "りえ先生が今学期を紹介し、日記から以前の思い出を開けるようにします。プレイスメントで最初の学習内容は変わりますが、未体験の物語を体験済みにはしません。",
    bridgeContinue: "教室に入る",
    bandEntryEyebrow: "途中参加レッスン・選んだカリキュラム",
    bandEntryTitle: "今の日本語力から始めましょう。",
    bandEntryBody: "選んだレベルに合わせた、よむオリジナルの途中参加課題です。学習の根拠を記録しても、以前の物語を体験済みにはしません。",
    bandEntryComplete: "途中参加課題を記録しました。以前の思い出は未体験のまま、日記から時系列で再生できます。",
    bandEntryContinue: "キャンパスを開く",
    lessonForkEyebrow: "レッスン0・最初の聞き返し",
    lessonForkTitle: "りえ先生に、まず何を見せてもらいますか。",
    lessonForkBody: "三つのルートは、同じ最初の概念を違う順番で学びます。",
    forkSound: "音",
    forkSoundBody: "聞く、意味を選ぶ、シャドーイングする、文字を見る。",
    forkText: "文字",
    forkTextBody: "読む、言葉を調べる、文を組み立てる、音を聞く。",
    forkSpeaking: "話す",
    forkSpeakingBody: "練習する、比べる、場面の中で例文を読む。",
    sourceEyebrow: "原資料アクティビティ・第1週",
    sourceTitle: "もう一度お願いする",
    sourceBody: "りえ先生の話す速さが少し速すぎました。繰り返しを頼む教室表現を選んでください。",
    sourceRecordSummary: "変更されない原資料レコードを見る",
    sourceRecordLine: "2023/24 レベル1・レッスン1・教室表現ペイロード・2ページ・印刷番号9",
    sourceComplete: "この表現をよむの復習キューに追加しました。",
    sourceContinue: "外でアーカーシュに会う",
    aakashMeetEyebrow: "雨の道案内・最初の絆エピソード",
    aakashMeetTitle: "もっといい撮影場所",
    aakashMeetBody: "アーカーシュはいい光を見つけました。でも、カフェまでの最後の曲がり角が分かりません。道順を確かめるのを手伝ってください。",
    aakashUnlockEyebrow: "クラスメート解放",
    aakashUnlockTitle: "アーカーシュ・Aakash",
    aakashUnlockLine: "「まっすぐ行って、右。よし、雨の気が変わる前に行こう。」",
    aakashContinue: "書く練習の机へ行く",
    aakashMemoryTitle: "もっといい撮影場所",
    aakashMemoryBody: "地図に落ちる雨。赤い傘。あなたが道順を言い終わるまで待ってから、完璧な光を指すアーカーシュ。",
    aakashMemoryReturn: "思い出を閉じる",
    kanjiDeskEyebrow: "ライティングスタジオ・双方向練習",
    kanjiDeskTitle: "見分けて、書く。",
    kanjiDeskBody: "認識と産出は別々の学習記録になります。まず「一」を見分け、よむ共通のDoodleとKanjiVGの見本で書きましょう。",
    kanjiDeskComplete: "認識と手書きの学習記録を保存しました。KanjiVG見本：Ulrich Apel、CC BY-SA 3.0。",
    kanjiDeskContinue: "キャンパスを開く",
    campusTitle: "夜のキャンパス",
    campusObjective: "次：図書館で最初の復習をしましょう。",
    campusObjectiveComplete: "今夜は自由です。授業を続ける、ラボで聞く、カフェで誰かに会う。",
    locationClassroom: "教室",
    locationClassroomBody: "授業週と原資料アクティビティを続けます。",
    locationLibrary: "図書館",
    locationLibraryBody: "期限の来た表現と保存した文を復習します。",
    locationLab: "ランゲージラボ",
    locationLabBody: "聴解、シャドーイング、ピッチ、文字起こし。",
    locationCafe: "カフェ",
    locationCafeBody: "会話、絆、応用ミッション。",
    locationOpen: "入る",
    locationUnavailable: "最初の復習後に開きます",
    locationReturn: "キャンパスに戻る",
    labEyebrow: "ランゲージラボ・聴解ペア",
    labTitle: "見る前に、聞く。",
    labBody: "音声、回答、回答後の文字起こし、シャドーイングを一つの学習記録として扱います。",
    labPlay: "音声を再生・もう一度再生",
    labTimecode: "00:00〜00:02・ブラウザの日本語音声",
    labTranscriptTitle: "回答後の文字起こし",
    labShadowTitle: "文をシャドーイングする",
    labShadowPrompt: "もう一度再生し、一回声に出して、タイミングを比べてください。これは自己評価で、発音を装った点数にはしません。",
    labShadowDone: "繰り返して比べました",
    labListeningComplete: "聴解の回答を記録しました。文字起こしとシャドーイングを開きました。",
    navCampus: "キャンパス",
    navReview: "復習",
    navJournal: "クラス日記",
    navAudioMuted: "音声オフ",
    navAudioOn: "音声オン",
    reviewTitle: "図書館の復習",
    reviewEmpty: "今、期限の来た項目はありません。次に戻るとき、予定された復習がここに届きます。",
    reviewReveal: "意味を見る",
    reviewPrompt: "この表現を覚えていますか。",
    reviewAgain: "もう一度",
    reviewHard: "難しい",
    reviewGood: "できた",
    reviewEasy: "簡単",
    reviewComplete: "よむに復習を記録しました。",
    reviewReturn: "キャンパスに戻る",
    journalTitle: "クラス日記",
    journalRie: "りえ先生",
    journalRieLine: "「椅子が一つ空いていれば十分。始めましょう。」",
    journalAakash: "アーカーシュ",
    journalAakashLine: "「まっすぐ行って、右。よし。」",
    journalBond: "絆",
    journalReplay: "最初の思い出をもう一度見る",
    journalReplayAakash: "雨の道案内をもう一度見る",
    journalReason: "日本語を学ぶ理由",
    memoryTitle: "空いていた椅子",
    memoryBody: "窓をたたく雨。お茶とプリントの山を抱えるりえ先生。あなたのために空いた椅子が一つ。",
    memoryReturn: "思い出を閉じる",
    journalLocked: "物語で誰かに会うと、その人のページが開きます。",
    offlineReady: "オフライン準備完了",
    offlineNow: "オフライン・進捗はあとで同期します",
    onlineNow: "オンライン"
  };
  function academyText(language, key) {
    return language === "ja" ? JA[key] : EN[key];
  }
  const ACADEMY_ASSETS = {
    rie: "/academy/art/characters/rie/rie__neutral__halfbody__v001.png",
    portraits: {
      "quality-2": "/academy/art/protagonists/quality-2__picker__v001.png",
      "quality-3": "/academy/art/protagonists/quality-3__picker__v001.png",
      "quality-4": "/academy/art/protagonists/quality-4__picker__v001.png",
      "quality-5": "/academy/art/protagonists/quality-5__picker__v001.png"
    },
    events: {
      rainyDirections: "/academy/art/events/rainy-directions__rie-aakash__v001.png"
    },
    locations: {
      entrance: {
        wide: "/academy/art/locations/wide/campus-entrance__blue-hour-arrival--wide.webp",
        mobile: "/academy/art/locations/mobile/campus-entrance__blue-hour-arrival--mobile.webp"
      },
      classroom: {
        wide: "/academy/art/locations/wide/classroom__evening-lamplit--wide.webp",
        mobile: "/academy/art/locations/mobile/classroom__evening-lamplit--mobile.webp"
      },
      library: {
        wide: "/academy/art/locations/wide/library__rain-evening--wide.webp",
        mobile: "/academy/art/locations/mobile/library__rain-evening--mobile.webp"
      },
      cafe: {
        wide: "/academy/art/locations/wide/cafe__night-rain--wide.webp",
        mobile: "/academy/art/locations/mobile/cafe__night-rain--mobile.webp"
      },
      languageLab: {
        wide: "/academy/art/locations/wide/language-lab__evening-listening--wide.webp",
        mobile: "/academy/art/locations/mobile/language-lab__evening-listening--mobile.webp"
      },
      writingStudio: {
        wide: "/academy/art/locations/wide/writing-studio__rain-night--wide.webp",
        mobile: "/academy/art/locations/mobile/writing-studio__rain-night--mobile.webp"
      },
      rainyDirections: {
        wide: "/academy/art/events/rainy-directions__rie-aakash__v001.png",
        mobile: "/academy/art/events/rainy-directions__rie-aakash__v001.png"
      }
    }
  };
  function screenFrame(options) {
    const screen = element("section", `academy-screen ${options.className}`);
    screen.dataset.screen = options.className;
    if (options.plate) screen.prepend(backgroundPicture(options.plate));
    const veil = element("div", "academy-screen-veil");
    const panel = element("div", "academy-panel");
    const content = element("div", "academy-panel-content");
    if (options.eyebrow) content.append(copyElement("p", "academy-eyebrow", options.language, options.eyebrow));
    content.append(copyElement("h1", "academy-title", options.language, options.title));
    if (options.body) content.append(copyElement("p", "academy-lede", options.language, options.body));
    panel.append(content);
    veil.append(panel);
    screen.append(veil);
    return { screen, panel, content };
  }
  function copyElement(tag, className, language, key) {
    const node = element(tag, className);
    node.textContent = academyText(language, key);
    node.lang = language;
    node.dataset.jpdbReaderSurfaceIgnore = "";
    return node;
  }
  function localizedElement(tag, className, language, value) {
    const node = element(tag, className);
    node.textContent = value[language];
    node.lang = language;
    return node;
  }
  function copyButton(language, key, className = "academy-button") {
    const button = element("button", className);
    button.type = "button";
    button.textContent = academyText(language, key);
    button.lang = language;
    button.dataset.jpdbReaderSurfaceIgnore = "";
    return button;
  }
  function element(tag, className = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }
  function setBusy(button, busy, label) {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = label;
  }
  function fieldError(message) {
    const error = element("p", "academy-field-error");
    error.setAttribute("role", "alert");
    error.textContent = message;
    return error;
  }
  function backgroundPicture(plateId) {
    const plate = ACADEMY_ASSETS.locations[plateId];
    const picture = element("picture", "academy-background");
    picture.setAttribute("aria-hidden", "true");
    const source = document.createElement("source");
    source.media = "(max-width: 700px)";
    source.srcset = plate.mobile;
    const image = document.createElement("img");
    image.src = plate.wide;
    image.alt = "";
    image.decoding = "async";
    picture.append(source, image);
    return picture;
  }
  function renderAccessScreen(options) {
    const { screen, content } = screenFrame({
      language: options.language,
      className: "academy-access-screen",
      plate: "entrance",
      eyebrow: "accessEyebrow",
      title: "accessTitle",
      body: "accessBody"
    });
    const form = element("form", "academy-form academy-access-form");
    const label = copyElement("label", "academy-label", options.language, "accessCodeLabel");
    const input = element("input", "academy-input");
    input.name = "code";
    input.autocomplete = "one-time-code";
    input.inputMode = "text";
    input.maxLength = 64;
    input.required = true;
    input.placeholder = academyText(options.language, "accessCodePlaceholder");
    label.append(input);
    const submit = copyButton(options.language, "accessSubmit", "academy-button academy-button-primary");
    submit.type = "submit";
    const feedback = element("div", "academy-form-feedback");
    form.append(label, submit, feedback);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      feedback.replaceChildren();
      setBusy(submit, true, academyText(options.language, "accessChecking"));
      void options.onSubmit(input.value).catch((error) => {
        const unavailable = error instanceof Error && "code" in error && error.code === "unavailable";
        feedback.replaceChildren(fieldError(academyText(options.language, unavailable ? "accessUnavailable" : "accessInvalid")));
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
        submit.textContent = academyText(options.language, "accessSubmit");
        input.focus();
      });
    });
    content.append(form);
    return screen;
  }
  function renderBandEntryScreen(options) {
    const { screen, content } = screenFrame({
      language: options.language,
      className: "academy-band-entry-screen",
      plate: "classroom",
      eyebrow: "bandEntryEyebrow",
      title: "bandEntryTitle",
      body: "bandEntryBody"
    });
    const band = element("strong", "academy-band-badge");
    band.textContent = options.band.toUpperCase();
    const activityHost = element("div", "academy-activity-host");
    const completion = element("div", "academy-source-completion");
    content.append(band, activityHost, completion);
    if (options.completed) {
      showCompletion(options.language, activityHost, completion, options.onContinue);
      return screen;
    }
    const runtime = createActivityRuntime([choiceActivityPlugin]);
    const controller = runtime.mount(options.activity, {
      replace(view) {
        activityHost.replaceChildren(view);
      },
      announce(message) {
        const live = activityHost.querySelector('[role="status"]');
        if (live) live.setAttribute("aria-label", message);
      }
    }, async (evaluation) => {
      await options.onEvaluation(evaluation);
      if (evaluation.result.outcome === "pass") {
        showCompletion(options.language, activityHost, completion, options.onContinue);
      }
    });
    screen.addEventListener("academy:dispose", () => controller.dispose(), { once: true });
    return screen;
  }
  function showCompletion(language, activityHost, completion, onContinue) {
    activityHost.replaceChildren();
    const note = copyElement("p", "academy-success-note", language, "bandEntryComplete");
    const next = copyButton(language, "bandEntryContinue", "academy-button academy-button-primary");
    next.addEventListener("click", onContinue);
    completion.replaceChildren(note, next);
  }
  function renderRieUnlockScreen(language, onContinue) {
    const { screen, panel, content } = screenFrame({
      language,
      className: "academy-character-unlock-screen academy-rie-unlock-screen",
      plate: "classroom",
      eyebrow: "rieUnlockEyebrow",
      title: "rieUnlockTitle",
      body: "rieUnlockBody"
    });
    panel.classList.add("academy-panel-with-character", "academy-character-unlock-panel");
    const rie = element("img", "academy-character academy-character-rie");
    rie.src = ACADEMY_ASSETS.rie;
    rie.alt = language === "ja" ? "りえ先生" : "Rie-sensei";
    const bond = copyElement("p", "academy-bond-stars academy-unlock-star", language, "bondFirstStar");
    const next = copyButton(language, "rieUnlockContinue", "academy-button academy-button-primary");
    next.addEventListener("click", onContinue);
    content.append(bond, next);
    panel.prepend(rie);
    return screen;
  }
  function renderAakashMeetScreen(options) {
    const { screen, panel, content } = screenFrame({
      language: options.language,
      className: "academy-aakash-screen",
      plate: "rainyDirections",
      eyebrow: "aakashMeetEyebrow",
      title: "aakashMeetTitle",
      body: "aakashMeetBody"
    });
    panel.classList.add("academy-aakash-panel");
    const cast = element("img", "academy-aakash-cg");
    cast.src = ACADEMY_ASSETS.events.rainyDirections;
    cast.alt = options.language === "ja" ? "赤い傘の下のりえ先生とアーカーシュ" : "Rie-sensei and Aakash under a red umbrella";
    const activityHost = element("div", "academy-activity-host");
    const completion = element("div", "academy-source-completion");
    content.append(cast, activityHost, completion);
    if (options.completed) {
      showAakashUnlock(options.language, activityHost, completion, options.onContinue);
      return screen;
    }
    const runtime = createActivityRuntime([choiceActivityPlugin]);
    const controller = runtime.mount(options.activity, {
      replace(view) {
        activityHost.replaceChildren(view);
      },
      announce(message) {
        const live = activityHost.querySelector('[role="status"]');
        if (live) live.setAttribute("aria-label", message);
      }
    }, async (evaluation) => {
      await options.onEvaluation(evaluation);
      if (evaluation.result.outcome === "pass") {
        showAakashUnlock(options.language, activityHost, completion, options.onContinue);
      }
    });
    screen.addEventListener("academy:dispose", () => controller.dispose(), { once: true });
    return screen;
  }
  function renderAakashMemory(language, onReturn) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-aakash-memory-screen",
      plate: "rainyDirections",
      eyebrow: "aakashMeetEyebrow",
      title: "aakashMemoryTitle",
      body: "aakashMemoryBody"
    });
    const cast = element("img", "academy-aakash-cg");
    cast.src = ACADEMY_ASSETS.events.rainyDirections;
    cast.alt = language === "ja" ? "赤い傘の下のりえ先生とアーカーシュ" : "Rie-sensei and Aakash under a red umbrella";
    const line = element("blockquote", "academy-memory-line academy-memory-line-japanese");
    line.lang = "ja";
    line.dataset.yomuRuntimeSurface = "aakash-memory-line";
    line.textContent = "この道をまっすぐ行って、右です。";
    const close = copyButton(language, "aakashMemoryReturn", "academy-button academy-button-primary");
    close.addEventListener("click", onReturn);
    content.append(cast, line, close);
    return screen;
  }
  function showAakashUnlock(language, activityHost, completion, onContinue) {
    activityHost.replaceChildren();
    const card = element("section", "academy-character-unlock-card");
    card.append(
      copyElement("p", "academy-eyebrow", language, "aakashUnlockEyebrow"),
      copyElement("h2", "academy-unlock-name", language, "aakashUnlockTitle"),
      copyElement("blockquote", "academy-unlock-line", language, "aakashUnlockLine"),
      copyElement("p", "academy-bond-stars academy-unlock-star", language, "bondFirstStar")
    );
    const next = copyButton(language, "aakashContinue", "academy-button academy-button-primary");
    next.addEventListener("click", onContinue);
    completion.replaceChildren(card, next);
  }
  const COPY = {
    en: {
      settingsTitle: `${APP_NAME} Settings`,
      welcomeLabel: `${APP_NAME} welcome`,
      onboardingEyebrow: "Japanese, wherever it appears",
      onboardingCopy: "Make Japanese text, subtitles, and images tappable.",
      onboardingLanguage: "Settings language",
      onboardingAccentColor: "Accent color",
      customAccentColor: "Custom color",
      onboardingImmersionOptions: "Immersion defaults",
      onboardingInstallOfflineDictionaries: "Download offline dictionaries (Jitendex + pitch accents)",
      onboardingHoverShortcut: "Lookup hover modifier",
      manualPageScanShortcut: "Manual page scan shortcut",
      onboardingAddApiKey: "Add API key",
      onboardingAddLocalDictionaries: "Add local dictionaries",
      onboardingUseWithoutApiKey: "Use without API key",
      closeOnboarding: "Close welcome",
      featureText: "Text",
      featureTextBody: "Hover or tap scanned Japanese.",
      featureImages: "Images",
      featureImagesBody: "Read any image by tapping it.",
      featureVideo: "Video",
      featureVideoBody: "Make subtitle words tappable.",
      featureControl: "Control",
      featureControlBody: "Tune features, shortcuts, and color.",
      featureStudy: "Study",
      featureStudyBody: "Review words and kanji on the study page.",
      featureGame: "Game",
      featureGameBody: "Install the Yomu app to use in games or anywhere on the PC.",
      scanPage: "Scan page",
      noUnscannedJapaneseText: "No unscanned Japanese text found.",
      jpdbScanFailed: "Page scan failed.",
      pageCoverageSummary: "{percent}% known · {known}/{total} · {unknown} new · {iPlusOne} i+1",
      settings: "Settings",
      settingsSaved: "Settings saved.",
      settingsSaveFailed: "Settings save failed.",
      settingsSections: "Settings sections",
      settingsSearch: "Search settings",
      settingsSearchPlaceholder: "Search settings",
      settingsSearchNoResults: "No matches.",
      selectOptions: "Options",
      save: "Save",
      cancel: "Cancel",
      show: "Show",
      hide: "Hide",
      appearance: "Appearance",
      reading: "Reading",
      dictionaries: "Dictionaries",
      sources: "Sources",
      backupSync: "Backup & sync",
      backupSyncHelp: "Save or move your Yomu setup: export and import settings as plain JSON, back up dictionaries, or sync through Google Drive.",
      backupMovedHelp: "Backup, sync, and settings/dictionary import-export live in the Backup & sync section.",
      media: "Media",
      mining: "Mining",
      shortcuts: "Shortcuts",
      help: "Help",
      interface: "Interface",
      reader: "Reader",
      kanji: "Kanji",
      audio: "Audio",
      images: "Image text (OCR)",
      video: "Video",
      youTube: "YouTube",
      anki: "Anki",
      jpdb: "JPDB",
      api: "API",
      apiCredential: "API key",
      apiCredentialJpdb: "JPDB API key",
      apiCredentialJiten: "Jiten API key",
      apiCredentialBunpro: "Bunpro frontend API token",
      apiCredentialBunproLegacy: "Bunpro API key",
      apiKey: "API key",
      jitenApiKey: "Jiten API key",
      apiAccess: "API access",
      apiAccessHelp: "Add each service credential here. Bunpro only needs the frontend token: import it from Bunpro settings, treat it like a password, and note that it is saved before it is verified. Local Yomu SRS works without an account.",
      jpdbSettings: "JPDB settings",
      jitenSettings: "Jiten settings",
      bunproSettings: "Bunpro settings",
      jpdbApiKeyConfigured: "JPDB key set.",
      jpdbAndJitenApiKeysConfigured: "Jiten and JPDB keys are set.",
      jpdbApiKeyMissing: "No JPDB key.",
      jpdbConnected: "Connected to JPDB.",
      jpdbAndJitenConnected: "Connected to Jiten and JPDB.",
      jpdbConnectionFailed: "JPDB did not accept the key (network or invalid key).",
      jitenApiKeyConfigured: "Jiten key set.",
      jitenApiKeyMissing: "No Jiten key.",
      statusEnabled: "enabled",
      statusDisabled: "disabled",
      statusReady: "Ready",
      statusAttention: "Needs setup",
      statusError: "Error",
      disabledControlDescription: "Controlled by another setting.",
      jpdbMiningEnabled: "Allow API review/deck changes",
      bunproMiningEnabled: "Allow Bunpro review/mining",
      yomuLocalSrsEnabled: "Enable local Yomu SRS",
      addToForq: "Also copy JPDB adds to forq",
      enableReviews: "Show review buttons",
      reviewRatingScale: "Review rating scale",
      gradeTargetSelector: "Grade target",
      gradeTargetBoth: "Both",
      gradeTargetJpdb: "Grades JPDB",
      gradeTargetJiten: "Grades Jiten",
      gradeTargetBunpro: "Grades Bunpro",
      gradeTargetYomuLocal: "Grades Yomu",
      gradeTargetAnki: "Grades Anki card: {target}",
      gradeTargetJpdbAndAnki: "Grades JPDB + Anki card: {target}",
      gradeTargetJitenAndAnki: "Grades Jiten + Anki card: {target}",
      gradeTargetBunproAndAnki: "Grades Bunpro + Anki card: {target}",
      gradeTargetYomuLocalAndAnki: "Grades Yomu + Anki card: {target}",
      missingAnkiCardId: "Missing Anki card id.",
      jpdbPageEnhancements: "Dictionary site enhancements",
      jpdbPageEnhancementsEnabled: "Enhance dictionary pages",
      jpdbPageWordEnhancementsEnabled: "Add sources to word/search pages",
      jpdbPageKanjiEnhancementsEnabled: "Add sources to kanji pages",
      jpdbPageEnhancementsHelp: "",
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
      switchToDarkTheme: "Switch to dark theme",
      switchToLightTheme: "Switch to light theme",
      popupMode: "Popup mode",
      hoverPopupMode: "Hover popup mode",
      bottomSheet: "Bottom sheet",
      popover: "Popover",
      stickyBottomSheet: "Keep sheet open after lookup",
      popoverBackdropEnabled: "Dim page behind popover",
      popoverWidth: "Popover width (px)",
      popoverHeight: "Popover height (px)",
      popoverHeightMode: "Popover height behavior",
      popoverHeightAvailable: "Grow to available space",
      popoverHeightFixed: "Use height setting",
      readerFontFamily: "Reader interface font",
      popupFontFamily: "Popup Japanese font",
      fontPresetYomuDefault: "Built-in font",
      fontPresetJapaneseSans: "Japanese sans",
      fontPresetHiraginoYuGothic: "Hiragino / Yu Gothic",
      fontPresetJapaneseRounded: "Japanese rounded",
      fontPresetJapaneseSerif: "Japanese serif",
      fontPresetSystemUi: "System UI",
      fontPresetCustom: "Custom...",
      customFontFamily: "Custom font stack",
      popupFontWeight: "Popup Japanese weight",
      enableLogging: "Enable diagnostic logging",
      diagnostics: "Diagnostics",
      diagnosticsHelp: "Print diagnostics to the console.",
      accentColor: "Accent color",
      newTab: "Study",
      newTabEnabled: "Set Study as the new tab",
      newTabAnkiEnabled: "Use Anki cards in Study",
      newTabAnkiReviewDecks: "Anki review decks",
      newTabAnkiReviewDecksHelp: "Uncheck decks to skip.",
      newTabSource: "Study review source",
      newTabAuto: "Auto: Yomu, accounts, then study words",
      newTabApiSrs: "API SRS (Jiten / JPDB)",
      newTabBunpro: "Bunpro",
      newTabYomuLocal: "Yomu local SRS",
      dictionaryFallback: "Dictionary fallback",
      newTabJpdbReviewMode: "API review mode",
      newTabJpdbReviewAuto: "Auto: live kanji + API vocabulary",
      newTabLiveReview: "Live JPDB review session",
      newTabApiVocabulary: "API vocabulary only",
      corsProxyUrl: "Cross-origin proxy URL",
      newTabKanjiKeywordSource: "Kanji keyword source",
      newTabKanjiKeywordAuto: "Auto: RTK, then {service} kanji facts, then local",
      newTabKanjiKeywordRtk: "RTK / Heisig",
      newTabKanjiKeywordApiFacts: "{service} kanji facts (Jiten / JPDB)",
      newTabKanjiKeywordLocal: "Local card meaning",
      newTabParsingEnabled: "Enable sentence parsing on Study",
      newTabFrontSentenceEnabled: "Show sentence on word fronts",
      newTabKanjiAutogradeEnabled: "Auto-grade kanji drawing",
      newTabKanjiAutoSubmit: "Auto-submit kanji grade",
      newTabOfflineEnabled: "Cache Study for offline use",
      newTabOfflineLimit: "Offline review cache limit",
      newTabDailyGoalMinutes: "Daily study goal (minutes, 0 = off)",
      newTabKanjiUnlockEnabled: "Study kanji before unlocking words",
      newTabStopAtBatchEnd: "Stop at the end of each batch",
      newTabSwipeReviews: "Swipe cards to grade (left = fail, right = pass)",
      newTabShortcutHintsEnabled: "Show Study keyboard shortcut hints",
      newTabUrl: "Study address",
      newTabOfflineHelp: "Caches due cards and queued grades.",
      newTabAddressHelp: "Use as a start page or iPad shortcut.",
      newTabJpdbDeck: "Study JPDB deck",
      newTabStudySteps: "Study steps",
      newTabStudyStepsHelp: "Drag to reorder. Turn off steps for faster reviews; Reveal and grading always stay at the end.",
      newTabStudyStepHeader: "Step",
      newTabStudyStepKanji: "Kanji drawing",
      newTabStudyStepWord: "Word meaning",
      newTabStudyStepRecall: "Write in sentence",
      newTabStudyStepListen: "Pitch listening",
      newTabStudyStepSpeaking: "Speaking",
      newTabStudyStepType: "Type the word",
      newTabStudyStepKanjiHelp: "Draw each kanji before the word answer is shown. Carries the word meaning so the blank is never ambiguous; tap Hint for the kanji keyword.",
      newTabStudyStepWordHelp: "Japanese front, meaning and reading on reveal.",
      newTabStudyStepRecallHelp: "Type the missing word in the example sentence. Tap Hint for the first kana, then length. Shown only when a card has an example sentence.",
      newTabStudyStepListenHelp: "Hear the word and choose its pitch pattern from the contour options; correctness stays hidden until the final reveal. Shown only when pitch-accent data is available.",
      newTabStudyStepSpeakingHelp: "Shadow the word aloud — your pitch contour is scored against the model on this device. Shown only when audio is available.",
      newTabStudyStepTypeHelp: "Produce the word after hearing and speaking it: type it, or write it kanji by kanji. Skippable in-session.",
      openNewTabPage: "Open Study",
      copyAddress: "Copy address",
      wordColors: "Word colors",
      wordColorNew: "New and in deck",
      wordColorLearning: "Learning",
      wordColorKnown: "Known and never forget",
      wordColorDue: "Due",
      wordColorFailed: "Failed",
      wordColorIgnored: "Ignored, suspended, and blacklisted",
      pitchAccentColors: "Pitch accent colors",
      pitchColorHeiban: "Heiban (flat)",
      pitchColorAtamadaka: "Atamadaka (head-high)",
      pitchColorNakadaka: "Nakadaka (middle-high)",
      pitchColorOdaka: "Odaka (tail-high)",
      pitchColorKifuku: "Kifuku (variable)",
      pitchColorUnknown: "Unknown / inherited",
      colorChannels: "Color channels",
      wordHighlightColorSource: "Word highlight color",
      wordUnderlineColorSource: "Word underline color",
      wordTextColorSource: "Word text color",
      subtitleHighlightColorSource: "Subtitle highlight color",
      subtitleUnderlineColorSource: "Subtitle underline color",
      subtitleTextColorSource: "Subtitle text color",
      colorSourceStatus: "JPDB + Anki status",
      colorSourceJpdb: "JPDB status",
      colorSourceAnki: "Anki status",
      colorSourcePitch: "Pitch accent",
      colorSourceNone: "None",
      colorChannelsHelp: "",
      interfaceHelp: "",
      popupLookup: "Popup lookup",
      popupLookupEnabled: "Show Yomu lookup popup",
      popupLookupHelp: "Off for another reader's popups. Yomu tools stay on.",
      lookupOnClick: "Look up on tap or click",
      lookupOnHover: "Look up on hover",
      lookupOnMiddleMouse: "Look up with middle-mouse hold",
      showFloatingButton: "Show settings puck",
      pageScanMode: "Page scanning",
      pageScanModeOff: "Off",
      pageScanModeAuto: "Auto",
      pageScanModeManual: "Manual",
      manualScanEnabled: "Manual page scanning",
      ocrInteractionMode: "Image OCR scanning",
      ocrInteractionModeAuto: "Auto",
      ocrInteractionModeManual: "Tap or hover",
      ocrInteractionModeOff: "Off",
      puckMenuLabel: `${APP_NAME} menu`,
      puckStudyPage: "Study page",
      puckPauseAnnotations: "Pause annotations",
      puckResumeAnnotations: "Resume annotations",
      puckOcrAuto: "OCR: Auto",
      puckOcrManual: "OCR: Tap/Hover",
      puckOcrOff: "OCR: Off",
      annotationsPausedToast: "Annotations paused.",
      annotationsResumedToast: "Annotations resumed.",
      puckMuteAudio: "Mute auto-play audio",
      puckUnmuteAudio: "Unmute auto-play audio",
      autoplayAudioOnToast: "Auto-play audio on.",
      autoplayAudioOffToast: "Auto-play audio muted.",
      puckHideFurigana: "Hide furigana",
      furiganaOffToast: "Furigana off. Lookups stay active.",
      showFurigana: "Enable furigana annotations",
      furiganaMode: "Furigana",
      wordColorStates: "Color words",
      appearancePresetCustom: "Keep current custom settings",
      appearancePresetBalanced: "Balanced reading",
      appearancePresetNoColors: "Plain text",
      appearancePresetNewOnly: "Focus on new words",
      appearancePresetUnderlineNew: "Minimal highlights",
      wordColorStatesAll: "Use all learning states",
      wordColorStatesNewOnly: "Only new / not-in-deck words",
      hideFuriganaFor: "Hide furigana for",
      hideColorFor: "Hide color for",
      furiganaDifficultKanji: "Hard kanji only",
      furiganaHideKnown: "Hide familiar words",
      furiganaHoverOnly: "Show on hover",
      furiganaAllParsed: "Show on every parsed word",
      clampedRowReadings: "Readings on clamped rows",
      clampedRowReadingsShow: "Show (row grows)",
      clampedRowReadingsHover: "Hover only",
      showPitchAccent: "Show pitch accent",
      showLookupPillFrequency: "Show site frequency in pills",
      suppressRedundantWordUi: "Hide JPDB-redundant styling",
      sheetCloseButtonOnLeft: "Sheet close button on left",
      hideKnownFurigana: "Hide furigana for known cards only",
      readerHelp: "Set a hover key. Blank means plain hover.",
      hoverLookupSettings: "Hover lookup",
      kanjiOriginKanjiMapEnabled: "Show kanji facts and component graph",
      kanjiOriginGraphEnabled: "Show component graph",
      kanjiOriginRadicalImagesEnabled: "Show radical images",
      similarKanjiWordLimit: "Similar word limit",
      loadingSimilarWords: "Loading words...",
      openToLoadSimilarWords: "Open to load words.",
      noSimilarWords: "No additional words found.",
      kanjiHelp: "",
      audioEnabled: "Enable term audio",
      autoPlayAudio: "Auto-play term audio",
      suppressAutoAudioOnVideo: "Disable lookup audio on video pages",
      audioAutoPlayMode: "Auto-play trigger",
      audioEnableDefaultSources: "Enable built-in audio sources",
      audioFallbackChimeEnabled: "Enable fallback chime",
      audioSelectionMode: "When several sources or clips exist",
      audioPlayback: "Audio playback",
      firstAudio: "First audio",
      randomAudio: "Shuffle audio",
      audioTtsMode: "Text-to-speech handling",
      audioTtsFallback: "Fallback after recorded audio",
      audioTtsSourceOrder: "Follow source order / shuffle",
      audioTimeoutMs: "Audio timeout (ms)",
      previewAudio: "Preview audio",
      audioHelp: "URL tokens: {term}, {reading}, {language}.",
      audioSource: "Audio source",
      urlVoice: "URL / voice",
      addAudioSource: "Add audio source",
      audioAutoPlayAll: "Hover and tap/click",
      audioAutoPlayHover: "Hover only",
      audioAutoPlayTap: "Tap/click only",
      automaticBrowserVoice: "Automatic browser voice",
      savedVoice: "Saved voice",
      savedVoiceLabel: "Saved voice: {voice}",
      audioSourceOrder: "Audio source order",
      audioSourceNumber: "Audio source {number}",
      enableAudioSourceNumber: "Enable audio source {number}",
      enableLookupPillName: "Enable lookup pill: {name}",
      enableSourceName: "Enable source: {name}",
      textToSpeechVoiceNumber: "Text-to-speech voice {number}",
      audioSourceJpod101: "JapanesePod101",
      audioSourceLanguagePod101: "LanguagePod101",
      audioSourceJisho: "Jisho.org",
      audioSourceLinguaLibre: "(Commons) Lingua Libre",
      audioSourceWiktionary: "(Commons) Wiktionary",
      audioSourceJitenTts: "Jiten text-to-speech",
      audioSourceJpdbTts: "JPDB text-to-speech",
      audioSourceTextToSpeech: "Text-to-speech",
      audioSourceTextToSpeechReading: "Text-to-speech (Kana reading)",
      audioSourceCustom: "Custom direct audio file URL",
      audioSourceCustomJson: "Custom URL",
      audioCustomJsonPlaceholder: "Yomitan or Ultimate audio source URL",
      audioCustomUrlPlaceholder: "Direct audio file URL",
      audioBuiltInPlaceholder: "Built-in source, no URL needed",
      defaultVoiceSuffix: "default",
      audioGuideLinkLabel: "Yomitan audio guide",
      audioProxyGuideSummary: "Make your own Cloudflare proxy",
      audioProxyGuideIntro: "Use a Worker when you want a private proxy.",
      audioProxyGuideCloudflare: "Open Cloudflare.",
      audioProxyGuideWorkers: "Open Workers & Pages, then Create.",
      audioProxyGuideCreateWorker: "Choose Worker, name it, deploy.",
      audioProxyGuideEditCode: "Paste the Yomu Worker source.",
      audioProxyGuideDeploy: "Deploy.",
      audioProxyGuideCopyUrl: "Copy the Worker URL.",
      audioProxyGuidePasteUrl: "Paste it into Cross-origin proxy URL.",
      audioProxyGuideTest: "Save, then test lookup/import/audio.",
      audioProxyGuideNote: "Limit hosts before sharing.",
      audioProxyWorkerSource: "Worker source",
      audioProxyDeployGuide: "Deploy guide",
      immersionKit: "Immersion Kit",
      immersionKitEnabled: "Show Immersion Kit examples",
      immersionKitExampleSource: "Example provider",
      immersionKitAndNadeshiko: "Immersion Kit + Nadeshiko",
      nadeshikoApiKey: "Nadeshiko API key",
      getNadeshikoKey: "Get a key",
      immersionKitShowTranslation: "Show example translations",
      immersionKitRevealTranslationOnClick: "Blur example translations until clicked",
      immersionKitShowImages: "Show example thumbnails",
      immersionKitAutoPlayAudio: "Play example audio after reveal or next/previous",
      immersionKitPlayOnHover: "Play example audio when hovering thumbnails",
      immersionKitPlayOnImageClick: "Play example audio when clicking thumbnails",
      immersionKitCategory: "Immersion Kit category",
      immersionKitSort: "Example order",
      immersionKitLimitEnabled: "Examples per word limit",
      allExamples: "All examples",
      limitExamples: "Limit examples",
      immersionKitLimit: "Examples per word",
      immersionKitMinLength: "Minimum sentence length",
      immersionKitMaxLength: "Maximum sentence length",
      immersionKitPlaybackRate: "Example audio speed",
      immersionKitExactMatch: "Prefer exact matches",
      immersionKitHelp: "Examples appear in popups. Nadeshiko needs a key.",
      loadingExamples: "Loading examples...",
      noImmersionExamples: "No Immersion Kit examples found.",
      noImmersionExamplesCompact: "No examples",
      immersionKitRateLimited: "Immersion Kit rate-limited; retrying later.",
      immersionKitRequest: "Immersion Kit request",
      immersionKitRequestFailed: "Immersion Kit request failed.",
      immersionKitRequestFailedWithStatus: "Immersion Kit request failed ({status}).",
      immersionKitRequestTimedOut: "Immersion Kit request timed out.",
      immersionKitSearchBlocked: "Immersion Kit blocked. Configure CORS.",
      immersionKitMediaRequest: "Media request",
      immersionKitMediaRequestFailed: "Media request failed.",
      immersionKitMediaRequestFailedWithStatus: "Media request failed ({status}).",
      immersionKitMediaRequestTimedOut: "Media request timed out.",
      immersionKitMediaRequestReturnedNonMedia: "Media request returned an error page.",
      immersionKitNoMediaCandidate: "No Immersion Kit media loaded.",
      nadeshikoRequest: "Nadeshiko request",
      nadeshikoRequestFailed: "Nadeshiko request failed.",
      nadeshikoRequestFailedWithStatus: "Nadeshiko request failed ({status}).",
      nadeshikoRequestTimedOut: "Nadeshiko request timed out.",
      previousExample: "Previous example",
      nextExample: "Next example",
      playExampleAudio: "Play example audio",
      allCategories: "All",
      anime: "Anime",
      drama: "Drama",
      games: "Games",
      shortestFirst: "Shortest first",
      longestFirst: "Longest first",
      randomOrder: "Random",
      ocrEnabled: "Read text in images",
      ocrAutoScanImages: "Read images automatically",
      ocrShowTextOverlay: "Show recognized text areas",
      ocrVideoPauseFrames: "Auto-read paused video frames",
      ocrInvertDarkPanels: "Read light text on dark panels",
      ocrProvider: "Image reading",
      ocrOverlayTheme: "OCR overlay theme",
      ocrOverlayThemeAuto: "Match app theme",
      ocrOverlayThemeLight: "Light overlay",
      ocrOverlayThemeDark: "Dark overlay",
      googleLens: "Google Lens (free, recommended)",
      cloudVision: "Google Cloud Vision (API key)",
      localOcr: "Local OCR server",
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
      ocrBackgroundOpacity: "Image highlight opacity",
      ocrFontScale: "Image text scale",
      ocrEndpointUrl: "Local OCR server URL",
      ocrCustomLocalServer: "Local OCR server URL",
      ocrEngine: "Local OCR engine",
      ocrEngineMangaOcr: "MangaOCR (best for manga)",
      ocrEngineAppleVision: "Apple Vision (macOS)",
      cloudVisionApiKey: "Google Cloud Vision API key",
      ocrHelp: "Reads nearby images. Google Lens needs no setup.",
      ocrCloudHelp: "Paste a Google Cloud Vision API key.",
      ocrLocalHelp: "Run MangaOCR/Apple Vision locally and enter its URL.",
      subtitlePlayerEnabled: "Enable video subtitle player",
      subtitleAutoDetect: "Auto-detect page subtitles",
      subtitleOverlayVisible: "Show subtitle overlay",
      subtitleSecondaryVisible: "Show native subtitles",
      subtitleNativeBlurred: "Blur native subtitles until hover",
      subtitleKaraokeMode: "Karaoke word timing",
      subtitleTranscriptVisible: "Open transcript panel by default",
      subtitlePausePanel: "Open side panel when paused",
      subtitleShadowAutoPause: "Auto-pause after each shadow line",
      subtitleTranscriptPlacement: "Transcript panel position",
      subtitleTranscriptAutoScroll: "Scroll transcript with playback",
      subtitleTranscriptAutoScrollResumeSeconds: "Resume auto-scroll delay (s)",
      subtitleAutoCopyLine: "Auto-copy subtitle lines",
      subtitleMiningPause: "Pause video on subtitle click",
      subtitleHoverPause: "Pause video on subtitle hover",
      subtitleControlsMode: "Subtitle controls",
      right: "Right",
      left: "Left",
      bottom: "Below",
      showWhenNeeded: "Compact controls",
      hideControls: "Hide controls",
      alwaysVisible: "Always visible",
      subtitleFontSize: "Subtitle font size (px)",
      subtitleBottomOffset: "Subtitle bottom offset (%)",
      subtitleTextColor: "Subtitle color",
      subtitleOutlineColor: "Subtitle outline",
      subtitleBackgroundColor: "Subtitle background",
      subtitleBackgroundOpacity: "Subtitle background opacity",
      subtitleFontFamily: "Subtitle font family",
      subtitleFontWeight: "Subtitle font weight",
      subtitleSeekPadding: "Subtitle seek padding (s)",
      subtitlePreview: "Live subtitle preview",
      preview: "Preview",
      youtubeImmersionEnabled: "Japanese YouTube only",
      preferJapaneseSiteLanguage: "Prefer Japanese site language and location",
      youtubeShowChannelRecommendations: "Show Japanese channel suggestions",
      youtubeShowFilterNotice: "Show hidden-video notice",
      youtubeHelp: "Prefer Japanese UI and Japan-local content.",
      youtubeFilterOn: "YouTube filter on",
      youtubeFilterOff: "YouTube filter off",
      youtubeShowHiddenVideos: "Show hidden videos",
      youtubeHideHiddenVideos: "Hide hidden videos",
      youtubeHideNotice: "Hide notice",
      youtubeFilterShowing: "{appName} shows {count} hidden item{plural}",
      youtubeFilterHid: "{appName} hid {count} non-Japanese item{plural}",
      youtubeFilterVisible: "{count} Japanese items stayed visible.",
      youtubeToggleToastOn: "YouTube immersion filter enabled.",
      youtubeToggleToastOff: "YouTube immersion filter disabled.",
      ankiEnabled: "Enable Anki mining",
      ankiMineWithJpdb: "Also add to Anki when adding via API",
      ankiCaptureScreenshot: "Attach context image when possible",
      ankiConnectUrl: "AnkiConnect URL",
      ankiDeck: "Anki deck",
      ankiModel: "Anki note type",
      mobileAnkiHandoff: "Mobile Anki add-note fallback",
      ankiTemplateMode: "Anki card template",
      ankiFrontReading: "Show reading on word-first front",
      ankiFrontSentence: "Show sentence on word-first front",
      ankiFrontImage: "Show image on front",
      wordFirst: "Word first",
      sentenceFirst: "Sentence first",
      ankiTags: "Tags",
      sentenceFirstPreset: "Sentence first preset",
      wordFirstPreset: "Word first preset",
      front: "Front",
      back: "Back",
      imageAbovePrompt: "Image appears above the prompt when available.",
      recallHighlightedWord: "Recall the highlighted word from context.",
      imageOnFront: "Image appears on the front when available.",
      recallMeaning: "Recall the meaning first.",
      ankiBackIncludes: "Includes dictionary, kanji, pitch, source, image.",
      exampleMeaning: "to read",
      scanAnkiFirst: "Connect Anki first",
      notMapped: "Not mapped",
      noScannedFields: "",
      mappingForNoteType: "Mapping for {model}",
      currentNoteType: "current note type",
      ankiFieldMappingSelect: "{role} field",
      ankiRoleExpression: "Expression",
      ankiRoleReading: "Reading",
      ankiRoleMeaning: "Meaning",
      ankiRoleSentence: "Sentence",
      ankiRoleAudio: "Audio",
      ankiRoleImage: "Image",
      testAnki: "Check AnkiConnect",
      prepareAnki: "Create Yomu note type",
      ankiCheckingConnection: "Checking AnkiConnect at {url}.",
      ankiMiningDisabledStatus: "Anki mining disabled.",
      ankiTesting: "Checking AnkiConnect...",
      ankiPreparing: "Creating Yomu deck/note type...",
      ankiScanning: "Reading decks, note types, fields...",
      ankiScanSummary: "Decks {decks}, types {models}. Best: {model}. {fields}",
      ankiScanNoModels: "Found {decks} decks. Note types unavailable.",
      ankiScanFieldSummary: "Fields: {fields}",
      ankiUnreachable: "Open desktop Anki and check again.",
      ankiCorsBlocked: 'Add "{origin}" to webCorsOriginList; restart Anki.',
      ankiSettingsUnreachable: "AnkiConnect not reached.",
      ankiHostedBridgeMissing: `Enable ${APP_NAME}, refresh, then check again.`,
      ankiStatusOpenDesktop: "Open desktop Anki",
      ankiStatusInstallAddon: "Install/enable AnkiConnect",
      ankiStatusMobileDocs: "Mobile setup docs",
      ankiStatusUseDesktopUrl: "Use the LAN/Tailscale URL on mobile",
      ankiStatusEnableUserscript: `Enable installed ${APP_NAME}`,
      ankiStatusRefreshAndCheck: "Refresh and check",
      ankiHostedCorsHint: "Add {origin} to webCorsOriginList.",
      ankiLibraryAdapter: "Existing library adapter",
      ankiLibraryAdapterStatus: "Scans decks/types and suggests mappings.",
      ankiLibraryChoices: "Deck and note type",
      ankiLibraryChoicesHelp: "Pick where mining saves notes.",
      ankiTemplateSettings: "Yomu card template",
      ankiTemplateSettingsHelp: "For Yomu note types. Templates stay in Anki.",
      ankiMappingConfidenceHelp: "Based on fields/samples. Edit weak mappings.",
      ankiMappingHighConfidence: "High",
      ankiMappingMediumConfidence: "Medium",
      ankiMappingLowConfidence: "Low",
      ankiHelp: "Install AnkiConnect and keep desktop Anki open. If CORS appears, add this site to webCorsOriginList. Mobile handoff creates notes only.",
      jpdbDefinitionsEnabled: "Show JPDB definitions",
      localDictionariesEnabled: "Show imported dictionary definitions",
      dictionarySourcesInitiallyExpanded: "Open sources by default",
      localDictionaryMaxResults: "Dictionary result limit",
      cloudSettingsSync: "Google Drive settings sync",
      cloudSettingsSyncHelp: "Stores your Yomu settings and local SRS progress in Google Drive app data. Dictionaries stay local.",
      importSettings: "Import settings JSON",
      exportSettings: "Export settings JSON",
      importDictionaries: "Import dictionaries",
      exportDictionaries: "Export dictionaries",
      dictionaryImportHelp: "Import a Yomitan ZIP, settings export, or backup. Term, pitch, and frequency dictionaries add definitions, accents, and badges.",
      lookupPills: "Lookup pills",
      lookupPillsHelp: "External links and frequency badges in one order. Local frequency dictionaries replace matching live Jiten/JPDB badges. Tokens: {query}, {word}, {reading}.",
      parserProvider: "Parsing source",
      parserProviderLocal: "Local dictionaries (offline)",
      parserProviderJiten: "Jiten API",
      parserProviderJpdb: "JPDB API",
      parserProviderAuto: "Automatic (Jiten/JPDB)",
      parserProviderHelp: "Local parses with imported dictionaries, offline. Jiten and JPDB always use that API when its key is set. Automatic prefers Jiten, then JPDB.",
      offlineDictionarySetupComplete: "Offline dictionaries installed.",
      offlineDictionarySetupFailed: "Offline dictionary setup failed. Retry from Settings → Sources.",
      copiesCurrentWord: "Copies the current word",
      lookupPillLabel: "Lookup pill label",
      lookupPillLabelNumber: "Lookup pill {number} label",
      lookupUrlTemplate: "Lookup URL template",
      lookupUrlTemplateNumber: "Pill {number} URL",
      lookupPillOrder: "Lookup pill order",
      builtInAction: "Built-in action",
      recommendedDownloads: "Dictionaries",
      termDictionaries: "Term dictionaries",
      kanjiDictionaries: "Kanji dictionaries",
      pitchDictionaries: "Pitch dictionaries",
      frequencyDictionaries: "Frequency dictionaries",
      install: "Install",
      installing: "Installing",
      queued: "Queued",
      dictionaryGuide: "Guide",
      saveAfterInstall: "Save after install",
      download: "Download",
      downloadAndImport: "Download and import",
      update: "Update",
      noLocalDictionaries: "No term dictionary imported yet. Install JMdict, Jitendex, or WTY for definitions; pitch/frequency dictionaries only add accents or badges.",
      checkingDictionaries: "Checking imported dictionaries...",
      dictionaryOnlyJpdb: "Only JPDB is enabled. Import JMdict, Jitendex, WTY, or another term dictionary for local definitions.",
      dictionaryDownloading: "Downloading",
      dictionaryReadingZip: "Reading dictionary ZIP...",
      dictionaryCheckingIndex: "Checking index...",
      dictionaryBanksFound: "{count} bank{plural} found.",
      dictionaryRemovingExisting: "removing old entries",
      dictionaryReadingBank: "Reading",
      dictionaryParsingBank: "Parsing",
      dictionarySavingBank: "Saving",
      dictionaryImporting: "Importing",
      importingBundledDictionaries: "Importing bundled dictionaries...",
      dictionaryImported: "Imported",
      dictionaryPreparingImport: "Preparing import",
      dictionaryRecords: "dictionary records",
      dictionaryEntries: "entries",
      dictionaryTotal: "total",
      dictionaryDownloadProgress: "Downloading",
      dictionaryStatusSummary: "Dicts {dictionaries}, terms {terms}, kanji {kanji}, meta {metadata}",
      dictionaryStatusUnavailable: "Unavailable.",
      noLocalDictionariesImported: "No dictionaries imported yet. Start with a term dictionary for definitions.",
      dictionaryDownloadFailed: "Dictionary download failed.",
      dictionaryDownloadTimedOut: "Dictionary download timed out.",
      dictionaryDownloadNotZip: "Download was not a ZIP.",
      dictionaryDownloadNeedsBridge: "Download needs bridge; else import ZIP.",
      dictionaryDownloadBlocked: "Download blocked. Import the ZIP.",
      dictionaryManualDownloadHint: "Enable userscript or import the ZIP.",
      dictionaryInstallQueueHelp: "Install a term dictionary first for definitions. Pitch and frequency dictionaries add accents and badges, not normal definition text.",
      dictionaryInstallQueued: "{dictionary} queued.",
      dictionaryInstallSaveBlocked: "Import running. Save unlocks when done.",
      dictionaryImportQueueStatus: "{count} install{plural} running.",
      dictionaryRemoveConfirm: 'Remove "{dictionary}"?',
      dictionaryRemoving: "Removing {dictionary}...",
      dictionaryRemoved: "Removed {dictionary}.",
      dictionaryImportComplete: "Imported {records} from {sources} source{plural}.",
      dictionaryRecordsImported: "{dictionary}: {records} records.",
      settingsImported: "Settings imported.",
      settingsImportedWithDetails: "Settings imported; {details}.",
      settingsExported: "Settings exported.",
      restoredStoredChoices: "restored {count} stored choice{plural}",
      importedDictionaryRecordCount: "imported {count} dictionary record{plural}",
      dictionaryNoSupportedBanks: "No supported banks found.",
      dictionaryUnsupportedJson: "Use Dexie, ZIP, or export.",
      dictionaryZipMissingIndex: "ZIP missing index.json.",
      yomitanSettingsInvalid: "Not a Yomitan settings export.",
      localDictionaryText: "Dictionary text",
      localSenseSingular: "meaning",
      localSensePlural: "meanings",
      localWordSingular: "entry",
      localWordPlural: "entries",
      decksLoaded: "Decks are loaded from your JPDB account.",
      decksUnavailable: "Could not load decks; saved IDs kept.",
      addApiKeyChooseDecks: "Add your JPDB API key to choose decks.",
      miningDeck: "Mining deck",
      neverForgetDeck: "Never forget deck",
      blacklistDeck: "Blacklist deck",
      allStudyDecks: "All study decks",
      savedValue: "Saved: {value}",
      holdWhileHovering: "Hold while hovering",
      hoverOpenDelayMs: "Hover open delay (ms)",
      hoverCloseDelayMs: "Hover close delay (ms)",
      pressKeys: "Press keys",
      blankPlainHover: "Blank = hover, no key",
      openSettings: "Open settings",
      resizeSettings: "Resize settings",
      playAudio: "Play audio",
      playingAudioPreview: `Playing ${APP_NAME}...`,
      audioPreviewFailed: "Audio preview failed.",
      audioPlaybackDisabled: "Audio playback is disabled",
      audioPlaybackDisabledToast: "Audio playback is disabled.",
      audioPlaybackFailed: "Audio playback failed.",
      noSentenceToRead: "No sentence to read aloud.",
      noTextToRead: "No text to read aloud.",
      jpdbExampleAudioUnavailable: "No JPDB audio is available for this example.",
      jpdbAudioPlayableFileMissing: "JPDB audio returned no playable file.",
      jpdbAudioResponseNotPlayable: "JPDB audio was not playable.",
      audioSourceReturnedNoAudio: "Audio source did not return audio.",
      audioJsonMissingPlayableUrl: "Audio JSON had no playable URL.",
      textToSpeechUnavailable: "Text-to-speech is unavailable.",
      textToSpeechFailed: "Text-to-speech failed.",
      audioRequest: "Audio request",
      audioRequestTimedOut: "Audio request timed out.",
      audioRequestReturnedNonAudio: "Audio request returned non-audio",
      audioRequestReturnedNonAudioWithType: "Audio request returned non-audio: {type}.",
      audioUnknownContentType: "an unknown content type",
      japanesePod101NoAudio: "JapanesePod101 has no audio for this term.",
      invalidJpdbAudioId: "Invalid JPDB audio id.",
      couldNotReadAudio: "Could not read audio.",
      couldNotReadAudioBlob: "Could not read audio blob.",
      closeDrawer: "Close drawer",
      closePopup: "Close popup",
      previousLookupWord: "Previous word",
      nextLookupWord: "Next word",
      previousSubtitle: "Previous subtitle",
      nextSubtitle: "Next subtitle",
      jumpToCurrentSubtitle: "Jump to current subtitle",
      playVideo: "Play video",
      pauseVideo: "Pause video",
      readVideoFrame: "Read video frame (OCR)",
      readVideoFrameStop: "Stop reading video frames (OCR)",
      copySubtitle: "Copy subtitle",
      subtitleFallbackLabel: "Subtitle",
      subtitlesTitle: "Subtitles",
      openSubtitlePanel: "Open subtitle panel",
      closeSubtitlePanel: "Close subtitle panel",
      subtitleStyle: "Subtitle style",
      subtitleResetDefaults: "Reset defaults",
      closeSubtitleDrawer: "Close subtitle drawer",
      enableSubtitleAutoHide: "Auto-hide panel while playing",
      disableSubtitleAutoHide: "Keep panel open while playing",
      subtitlePanelOptions: "Panel options",
      loadJapaneseSubtitles: "Load Japanese subtitles",
      loadPrimarySubtitles: "Load primary subtitles",
      loadNativeSubtitles: "Load native subtitles",
      searchAnimeSubtitles: "Search anime subtitles",
      toggleNativeSubtitleBlur: "Toggle native subtitle blur",
      subtitleTrackDetectedSingular: "1 subtitle track detected",
      subtitleTracksDetected: "subtitle tracks detected",
      noSubtitleTracksDetected: "No subtitle tracks detected yet.",
      resizeTranscriptPanel: "Resize transcript panel",
      resizeSubtitleTracksPanel: "Resize subtitle tracks panel",
      subtitlePanelMode: "Mode",
      subtitleLines: "Lines",
      shadow: "Shadow",
      subtitleTracks: "Tracks",
      batchMiningNoDestination: "Enable JPDB/Jiten API mining or Anki mining first.",
      subtitleTrackTiming: "Subtitle timing",
      subtitleOffsetPrevious: "Align previous subtitle to current time",
      subtitleOffsetNext: "Align next subtitle to current time",
      subtitleOffsetPreviousShort: "Prev",
      subtitleOffsetNextShort: "Next",
      subtitleOffsetEarlier: "Show subtitles 100 ms earlier",
      subtitleOffsetLater: "Show subtitles 100 ms later",
      resetSubtitleOffset: "Reset subtitle timing",
      copySubtitleLine: "Copy subtitle line",
      subtitleCopyIncludeTranslation: "Copy line translation too",
      peekSubtitleTranslation: "Show translation",
      hideSubtitleTranslation: "Hide translation",
      loadingSubtitleLines: "Loading subtitle lines",
      waitingForCaptionLines: "Waiting for caption lines",
      subtitleCurrentLineWillAppear: "Current line appears when captions load.",
      seekSubtitleLine: "Seek subtitle line",
      subtitleTracksHint: "Choose a primary track. Use Lines to jump.",
      noAutoDetectedSubtitleTracks: "",
      autoDetectedTracksWillAppear: "Subtitle tracks appear here.",
      autoDetectedOptionSingular: "1 subtitle option",
      autoDetectedOptions: "subtitle options",
      detected: "Detected",
      japaneseOverlay: "Japanese overlay",
      primaryOverlay: "primary overlay",
      nativeOverlay: "native overlay",
      unsetJapaneseSubtitles: "Unset Japanese",
      unsetPrimarySubtitles: "Unset primary",
      japaneseSubtitles: "Japanese",
      primarySubtitles: "Primary",
      unsetNativeSubtitles: "Unset native",
      nativeSubtitles: "Native",
      chooseJapaneseSubtitles: "Choose Japanese subtitles",
      choosePrimarySubtitles: "Choose primary subtitles",
      transcript: "Transcript",
      subtitleOptionSingular: "option",
      subtitleOptionPlural: "options",
      subtitleLineSingular: "line",
      subtitleLinePlural: "lines",
      trackKindPageTrack: "page track",
      trackKindPageFile: "page file",
      trackKindYouTubeCaptions: "YouTube captions",
      youTubeSubtitles: "YouTube subtitles",
      autoGeneratedSubtitle: "auto-generated",
      trackKindLoadedFile: "loaded file",
      trackStatusLoading: "loading",
      trackStatusWaiting: "waiting for captions",
      trackStatusFailed: "failed",
      moveSubtitles: "Move subtitles",
      moveSubtitlesAccessible: "Move subtitles. Drag, or use the arrow and Page Up/Page Down keys. Press Home or 0 to reset.",
      moveSubtitleControls: "Move subtitle controls. Drag, or use the arrow keys. Press Home or 0 to reset.",
      pinSubtitleControls: "Keep subtitle controls expanded",
      unpinSubtitleControls: "Collapse subtitle controls when idle",
      toggleImageReading: "Toggle image reading",
      toggleSubtitleOverlay: "Toggle subtitle overlay",
      toggleYoutubeImmersion: "Toggle YouTube filter",
      readImagesNow: "Read images now",
      massReviewVisible: "Mass review visible words (Jiten)",
      studyReveal: "Study: reveal card",
      studyRevealAlternate: "Study: reveal card (alternate)",
      studyUndo: "Study: undo last review",
      studyPrevious: "Study: previous card",
      studyPreviousAlternate: "Study: previous card (alternate)",
      studyNext: "Study: next card",
      studyNextAlternate: "Study: next card (alternate)",
      massReviewNoWords: "No due Jiten words on screen.",
      massReviewNoKey: "Add a Jiten API key to mass review.",
      massReviewDone: "Reviewed {count} words as Good.",
      massReviewFailed: "Mass review failed.",
      adapterStateDisabled: "Off",
      adapterStateProbing: "Probing",
      adapterStateUnreachable: "Unreachable",
      adapterStateConnected: "Connected",
      adapterStateScanning: "Scanning",
      adapterStateSuggested: "Mapped",
      adapterStateStale: "Needs review",
      adapterStateReady: "Ready",
      ankiMappingConfidenceHigh: "high match",
      ankiMappingConfidenceMedium: "fuzzy match",
      ankiMappingConfidenceLow: "unmapped",
      ankiMappingStaleField: "saved field missing",
      ocrEnabledToast: "Image reading enabled.",
      ocrHiddenToast: "Image reading hidden.",
      ocrPlayVideo: "Play video",
      ocrResumeVideo: "Resume video",
      ocrPausedFrameScanning: "Scanning...",
      ocrPausedFrameReady: "Text ready",
      ocrPausedFrameNoText: "No text found",
      ocrPausedFrameFailed: "Could not read text",
      ocrRetryScan: "Scan again",
      ocrNoReadableImages: "No readable images nearby.",
      gradeNothing: "Grade NOTHING",
      gradeSomething: "Grade SOMETHING",
      gradeHard: "Grade HARD",
      gradeOkay: "Grade OKAY",
      gradeEasy: "Grade EASY",
      gradeFail: "Pass/fail: FAIL",
      gradePass: "Pass/fail: PASS",
      helpLinksTitle: "Useful pages",
      helpLinksCopy: "Open reader tools and docs from here.",
      versionAndUpdates: "Version",
      currentYomuVersion: "Yomu",
      updateStatusIdle: "Current {current}. Latest check pending.",
      updateStatusChecking: "Current {current}. Checking latest...",
      updateStatusCurrent: "Current {current}. Latest {latest}. Up to date.",
      updateStatusAvailable: "Current {current}. Latest {latest}. Update available.",
      updateStatusUnknown: "Current {current}. Latest check failed; reinstall if needed.",
      updateStatusIncomparable: "Current {current}. Latest {latest}. Cannot compare versions; use Update if this install is old.",
      updateHelpNotesManager: 'Keep one Yomu script enabled. Update opens your userscript manager’s install screen. If the browser shows a blocked-install banner instead, open your extensions page, open the manager’s details, and turn on "Allow user scripts" (or Developer mode), then retry.',
      updateHelpNotesExternalManager: "Keep one Yomu script enabled. Update opens the script source; your userscript app reads it from the open tab to update. If updates stall on iPhone/iPad, open this link in Safari and leave the tab open.",
      updateHelpNotesNoManager: "No userscript manager was detected here, and browsers block direct script installs — Update opens the install guide with per-browser steps.",
      updateUserscript: "Update",
      duplicateStatusSingle: "One Yomu runtime active ({kind}).",
      duplicateStatusUnknown: "Duplicate check unavailable. If Yomu appears twice, disable the older script.",
      ankiConnectSetupTitle: "AnkiConnect setup",
      ankiConnectSetupCopy: "Keep desktop Anki open with AnkiConnect enabled. Hosted Study needs AnkiConnect to allow the Yomu origin.",
      ankiConnectSetupConfig: "Add these origins to AnkiConnect's webCorsOriginList, keeping any existing entries:",
      ankiConnectSetupMobile: "For phone or iPad, use the desktop computer's LAN or Tailscale URL; localhost on a phone means the phone itself.",
      ankiConnectSetupBrave: "In Brave, disable Shields for the Study page if local Anki checks are blocked.",
      helpSupportTitle: "Support よむ",
      helpSupportCopy: SUPPORT_COPY,
      helpSupportCopyExtra: SUPPORT_COPY_EXTRA,
      videoPlayer: "Video Player",
      pdfReader: "PDF Reader",
      newTabPage: "Study",
      localAudio: "Local Audio",
      changelog: "Changelog",
      support: "Support",
      github: "GitHub",
      word: "Word",
      search: "Search",
      statsImportJpdbHistory: "Import JPDB review history",
      openYomuSettings: `Open ${APP_NAME} settings`,
      newTabAddressCopied: "Study address copied.",
      loading: "Loading...",
      refreshing: "Refreshing...",
      reveal: "Reveal",
      revealTranslation: "Reveal translation",
      immersionExampleControls: "Immersion Kit example controls",
      loadingKanjiDetails: "Loading kanji details...",
      loadingMnemonicImages: "Loading mnemonic images...",
      lookupDialog: `${APP_NAME} lookup`,
      resizeLookupSheet: "Drag to resize lookup sheet, or tap to close",
      showMiningActions: "Show mining actions",
      hideMiningActions: "Hide mining actions",
      switchReviewTarget: "Switch review target",
      switchGradingProvider: "Switch grading provider",
      apiGradingProvider: "Preferred grading service",
      apiGradingProviderHelp: "Which service the popover grades when a word exists in both Jiten and JPDB. Bunpro cards grade to Bunpro; the ⇄ toggle next to the grade buttons switches per word.",
      jpdbKanjiUpdated: "JPDB kanji updated.",
      jpdbKanjiUpdateFailedRuntime: "Could not update JPDB kanji. Check kanji reviews.",
      apiSrsActionsDisabled: "API mining actions are disabled in settings.",
      addJpdbApiKeyReview: "Add a JPDB API key to review JPDB cards.",
      addJitenApiKeyReview: "Add a Jiten API key to review Jiten cards.",
      addBunproApiKeyReview: "Add a Bunpro frontend API token to review Bunpro cards.",
      actionFailed: "Action failed.",
      dictionary: "Dictionary",
      dictionariesExported: "Dictionaries exported.",
      local: "Local",
      dict: "dict",
      filterStudy: "Study",
      filterAll: "All",
      sourceAuto: "Auto",
      sortRandom: "Random",
      sortFrequency: "Frequency",
      sortState: "State",
      stateNew: "New",
      stateLearning: "Learning",
      stateYoung: "Young",
      stateMature: "Mature",
      stateDue: "Due",
      stateFailed: "Failed",
      stateKnown: "Known",
      stateMastered: "Mastered",
      stateNeverForget: "Never forget",
      stateSuspended: "Suspended",
      stateLocked: "Locked",
      stateBlacklisted: "Blacklisted",
      stateRedundant: "Redundant",
      stateFrequent: "Frequent",
      stateUnparsed: "Unparsed",
      stateInDeck: "In deck",
      stateNotInDeck: "Not in deck",
      ankiReviewSingular: "review",
      ankiReviewPlural: "reviews",
      ankiLapseSingular: "lapse",
      ankiLapsePlural: "lapses",
      gradeNothingLabel: "Nothing",
      gradeSomethingLabel: "Something",
      gradeHardLabel: "Hard",
      bunproGradeAgainLabel: "Again",
      bunproGradeHardLabel: "Hard",
      bunproGradeGoodLabel: "Good",
      bunproGradeEasyLabel: "Easy",
      gradeOkayLabel: "Okay",
      gradeEasyLabel: "Easy",
      gradeFailLabel: "Fail",
      gradePassLabel: "Pass",
      factKeyword: "Keyword",
      factType: "Type",
      factFrequency: "Frequency",
      factMeaning: "Meaning",
      factGrade: "Grade",
      factOldForms: "Old forms",
      docs: "Docs",
      factoryReset: "Factory Reset",
      factoryResetConfirm: "Reset all {appName} data?\n\nDeletes settings, keys, cache, dicts.",
      factoryResetFailed: "Reset failed.",
      factoryResetDictionaryWarning: "Settings reset. Close other tabs.",
      factoryResetOtherTabReloading: "よむ reset elsewhere. Reloading...",
      factoryResetDeleteSettingsFailed: "Could not delete settings.",
      issues: "Issues",
      donate: "Donate",
      discord: "Discord",
      documentation: "Documentation",
      openOnJpdb: "Open on JPDB",
      openOnLookup: "Open on {label}",
      copyWord: "Copy",
      copyWordTitle: "Copy word",
      copiedWord: "Copied word.",
      backToWord: "Back to word",
      backToKanji: "Back to kanji",
      previousKanji: "Previous kanji",
      nextKanji: "Next kanji",
      openKanjiOnJpdb: "Open kanji on JPDB",
      strokePractice: "Stroke order + practice",
      practiceDrawing: "Practice drawing",
      strokes: "strokes",
      textTrace: "text trace",
      hideTrace: "Hide trace",
      showTrace: "Show trace",
      clear: "Clear",
      originStructure: "Component graph",
      originMapLabel: "2D kanji origin and component map",
      originShowSubcomponents: "Subcomponents",
      originShowOutbound: "Outbounds",
      kanjiMapData: "Kanji Map data",
      kanjiAlive: "Kanji Alive",
      wiktionary: "Wiktionary",
      radical: "Radical",
      readingsComponents: "Readings and components",
      showKanji: "Show kanji",
      jpdbMnemonic: "JPDB mnemonic",
      rtkComponentKeywords: "RTK component keywords",
      onReading: "On",
      kunReading: "Kun",
      heisigStory: "Heisig story",
      heisigComment: "Heisig comment",
      koohiiStories: "Koohii stories",
      add: "Add",
      addToMining: "Add to deck",
      addToMiningHint: "Add to selected API SRS deck.",
      addToDeck: "Add to deck",
      addToDeckHint: "Add without grading.",
      deck: "Deck",
      deckActions: "Deck actions",
      reviewAddsToDeck: "Reviewing will add new words to",
      reviewBlockedBlacklisted: "Blacklisted. Unlist before reviewing.",
      reviewBlockedNeverForget: "Never-forget. Remove before reviewing.",
      reviewBlockedLocked: "Locked. Unlock before reviewing.",
      reviewBlockedRedundant: "JPDB marks this redundant.",
      ankiCardsSuspended: "Suspended in Anki (works like a blacklist).",
      ankiCardsUnsuspended: "Unsuspended in Anki.",
      ankiNeverForgetTagAdded: "Tagged yomu-never-forget.",
      ankiNeverForgetTagRemoved: "Removed yomu-never-forget.",
      forget: "Forget",
      never: "Never forget",
      neverHint: "Move to never-forget and count as known.",
      forgetHint: "Remove from never-forget to mine/review.",
      unlist: "Unlist",
      unlistHint: "Remove from blacklist to mine/review.",
      blacklist: "Blacklist",
      blacklistHint: "Ignore this exact word.",
      vocabularyStatusUpdated: "Vocabulary status updated.",
      addToAnki: "Add to Anki",
      checkingAnki: "Checking Anki...",
      sendToMobileAnki: "Send to {app}",
      mobileAnkiActionHint: "Opens mobile Anki for a new note.",
      ankiAudioFileNotFound: "Anki audio file not found.",
      ankiAudioPlaybackUnavailable: "Anki audio playback is not available here.",
      ankiAudioUnavailablePreview: "Audio not available in preview",
      ankiAudioFilenameLabel: "Anki audio {filename}",
      ankiStoredFields: "Stored fields",
      ankiCardDetailsPending: "Matched in Anki. Loading details...",
      ankiCardDetailsUnavailable: "Matched in Anki. showing cached status.",
      ankiNewCard: "New card",
      ankiMatches: "Anki matches",
      gradeAnkiCardTarget: "Grades Anki card: {target}",
      gradeJpdbCardTarget: "Grades API SRS card",
      ankiMergeNeedsDesktop: "Merging needs desktop AnkiConnect.",
      ankiNoteNotFound: "Anki note not found.",
      mergeYomu: "Merge Yomu",
      mergeYomuTitle: "Update matching fields and add Yomu media to this note",
      editInAnki: "Edit in Anki",
      keepBothAudio: "Keep both",
      keepAnkiAudio: "Keep Anki",
      useYomuAudio: "Use Yomu",
      lastSeen: "Last seen",
      unavailable: "Unavailable",
      openedInAnki: "Opened in Anki.",
      addedToDeckAndReviewed: "Added to deck and reviewed.",
      sentToAnki: "Sent to Anki.",
      openedMobileAnkiHandoff: "Opened Anki handoff. Continue in Anki.",
      alreadyInAnki: "Already in Anki. Use Edit in Anki instead.",
      removedFromDeck: "Removed from deck.",
      addedToDeckToast: "Added to deck.",
      apiDeckMediaNotSupported: "Media stays in Yomu; no media API.",
      sentToAnkiWithContextImageAndAudio: "Sent to Anki with image and audio.",
      sentToAnkiWithContextImage: "Sent to Anki with image.",
      sentToAnkiWithAudio: "Sent to Anki with audio.",
      ankiMergeNoNewData: "Anki note already has the Yomu data.",
      ankiMergeFieldSingular: "field",
      ankiMergeFieldPlural: "fields",
      ankiMergeAudio: "audio",
      ankiMergeImage: "image",
      ankiMergeComplete: "Merged Yomu data into Anki ({parts}).",
      ankiHandoffCancelled: "Anki handoff cancelled.",
      ankiConnectActionFailed: "AnkiConnect action failed.",
      ankiConnectRequestFailed: "AnkiConnect request failed.",
      ankiConnectTimedOut: "AnkiConnect timed out.",
      ankiConnectNeedsBridge: "AnkiConnect needs the userscript bridge.",
      mobileAnkiReady: "Anki offline. Handoff can create notes.",
      ankiConnectionReady: "Connected. AnkiConnect is reachable.",
      ankiConnectedReady: 'Connected. "{deck}" / "{model}" ready.',
      ankiPromptRecallWord: "Recall the highlighted word.",
      ankiMeaningHeading: "Meaning",
      ankiPitchHeading: "Pitch",
      ankiPartOfSpeechHeading: "Part of speech",
      ankiLinksHeading: "Links",
      ankiSourceHeading: "Source",
      ankiTemplateContext: "Context",
      ankiTemplateRecognition: "Recognition",
      ankiLocalDictionaryStatus: "local dictionary",
      parsedFrom: "Parsed from",
      composedOf: "Composed of",
      imageReadingEnabled: "Image reading enabled.",
      imageReadingHidden: "Image reading hidden.",
      ocrModeAutoToast: "Image OCR automatic.",
      ocrModeManualToast: "Image OCR on tap or hover.",
      ocrModeOffToast: "Image OCR off.",
      subtitleOverlayEnabled: "Subtitle overlay enabled.",
      subtitleOverlayHidden: "Subtitle overlay hidden.",
      reviewFailed: "Review failed.",
      reviewActionsDisabled: "Review actions are disabled in settings.",
      jpdbLookupFailed: "JPDB lookup failed.",
      jpdbDeckStateApiKeyRequired: "Add a JPDB API key to change JPDB deck state.",
      jpdbAddApiKeyRequired: "Add a JPDB API key, or use Add to Anki.",
      addedToJpdb: "Added to JPDB.",
      jitenDeckStateApiKeyRequired: "Add a Jiten API key to change Jiten vocabulary state.",
      jitenAddApiKeyRequired: "Add a Jiten API key, or use Add to Anki.",
      bunproAddApiKeyRequired: "Add a Bunpro frontend API token, or use Add to Anki.",
      yomuLocalSrsDisabled: "Enable local Yomu SRS in Settings first.",
      chooseJitenStudyDeck: "Choose a Jiten study deck first.",
      addedToJiten: "Added to Jiten.",
      addedToBunpro: "Added to Bunpro.",
      addedToYomuLocal: "Added to Yomu.",
      kanjiDetailsUnavailable: "Kanji details are not available yet.",
      loadingDictionaryDetails: "Loading dictionary details...",
      sourceSingular: "source",
      sourcePlural: "sources",
      jitenCompositeWords: "Composite words",
      usedInVocabulary: "Used in vocabulary",
      exampleSentences: "Example sentences",
      playJpdbExampleAudio: "Play JPDB example audio",
      wordsUsingKanji: "Words using {kanji}",
      contextVideo: "Video",
      contextImage: "Image",
      contextCurrentPage: "Current page",
      jpdbKanjiActionMine: "Add",
      jpdbKanjiActionKnown: "Known",
      jpdbKanjiActionNeverForget: "Never forget",
      jpdbKanjiActionForget: "Forget",
      jpdbKanjiActionBlacklist: "Blacklist",
      jpdbKanjiActionReview: "Review",
      noDefinitions: "No enabled definition source returned results.",
      enabledHeader: "On",
      labelHeader: "Label",
      detailsHeader: "Details",
      displayName: "Display name",
      orderHeader: "Order",
      removeHeader: "Remove",
      definitionSource: "Definition source",
      kanjiSection: "Kanji section",
      dictionaryDisplayName: "Dictionary display name",
      sourcePriority: "{source} priority",
      dragToReorder: "Drag to reorder",
      moveUp: "Move up",
      moveDown: "Move down",
      remove: "Remove",
      removeImportedDictionary: "Remove imported dictionary",
      customAdvanced: "{label} (advanced)",
      importLocalDefinitionsHelp: "Import Yomitan for local definitions.",
      frequencyMetadataHelp: "Frequency, pitch, and kanji metadata for badges.",
      sourceHelpJpdb: "JPDB meanings from the current card.",
      sourceHelpJiten: "Jiten meanings, examples, and related words.",
      sourceHelpBunpro: "Bunpro vocabulary and grammar meanings, nuance, and accepted answers.",
      sourceHelpAnki: "Matching Anki card content and status.",
      sourceHelpTranslation: "Sentence translation.",
      sourceHelpGrammar: "Local grammar hints.",
      sourceHelpImmersionKit: "Example sentences, images, and audio.",
      sourceNameImmersionKit: "Immersion Kit",
      sourceNameAnki: "Anki",
      sourceNameTranslation: "Translation",
      sourceNameGrammar: "Grammar",
      sourceNameStrokePractice: "Stroke practice",
      sourceNameImportedKanjiDictionaries: "Imported kanji dictionaries",
      sourceNameWordsUsingKanji: "Related vocabulary",
      sourceNameJitenKanjiFacts: "Jiten kanji facts",
      sourceHelpImportedKanjiDictionary: "Imported Yomitan kanji dictionary.",
      sourceHelpStrokePractice: "Stroke order preview and drawing pad.",
      sourceHelpReadingsComponents: "JPDB readings, components, and mnemonic.",
      sourceHelpJitenKanjiFacts: "Jiten kanji facts, frequency, readings, words.",
      sourceHelpRtk: "RTK keywords, elements, and stories.",
      sourceHelpUchisen: "Uchisen mnemonic image carousel.",
      uchisenMnemonicImages: "Uchisen mnemonic images",
      uchisenMnemonicFor: "Uchisen mnemonic for {kanji}",
      noUchisenImagesYet: "No Uchisen images yet.",
      generateUchisenImage: "Generate image",
      generateUchisenImageToggle: "Generate image +",
      uchisenMnemonicStory: "Mnemonic story",
      uchisenImagePrompt: "Image prompt",
      uchisenGenerateHint: "Edit story/prompt, then publish a Uchisen image.",
      uchisenGeneratingImage: "Generating image...",
      uchisenPublishingMnemonic: "Publishing mnemonic...",
      uchisenGeneratedImage: "Uchisen image published.",
      uchisenGenerateFailed: "Could not generate Uchisen image.",
      uchisenLoginRequired: "Log in to Uchisen to generate images.",
      noStoryAvailable: "No story available",
      sourceHelpImportedKanjiDictionaries: "Imported Yomitan kanji entries.",
      sourceHelpWordsUsingKanji: "Related vocabulary.",
      sourceHelpComponentGraph: "Kanji facts, components, radical images.",
      recommendedJitendex: "Term definitions with examples.",
      recommendedJmdict: "Core term definitions.",
      recommendedJmnedict: "Proper names.",
      recommendedWtyJapaneseJapanese: "Japanese-to-Japanese term definitions.",
      recommendedPixivLight: "Pixiv terms.",
      recommendedKanjidic: "Kanji facts.",
      recommendedJpdbKanji: "JPDB kanji.",
      recommendedKanjiumPitch: "Pitch accents only; add a term dictionary for definitions.",
      recommendedJpdbv2Kana: "Recommended frequency badges from JPDB.",
      recommendedBccwj: "Frequency badges from BCCWJ.",
      recommendedJiten: "Frequency badges from Jiten.",
      recommendedMarvncMonolingual: "Monolingual collection.",
      fallbackSetupTitle: "Public lookup",
      fallbackSetupCopy: "Search without a JPDB key. Add dictionaries offline.",
      fallbackSetupDictionaries: "Add dictionaries",
      fallbackSetupJpdb: "Add JPDB key",
      getApp: `Get ${APP_NAME}`,
      offlineCacheGradesDisabled: "Offline cache. Grades sync on reconnect.",
      recognizing: "Recognizing...",
      noHandwritingMatch: "No match yet. Type or paste kanji.",
      yourKanjiDrawing: "Your kanji drawing",
      jpdbKanjiActions: "JPDB kanji actions",
      couldNotSearchLocalDictionaries: "Could not search local dictionaries.",
      subtitlePanel: "Subtitles",
      lines: "Lines",
      tracks: "Tracks",
      currentLineWillAppear: "The current line appears when captions are available.",
      native: "Native",
      unsetJapanese: "Unset Japanese",
      unsetNative: "Unset native",
      options: "options",
      option: "option",
      line: "line",
      subtitleTrackDetected: "subtitle track detected",
      translation: "Translation",
      grammar: "Grammar",
      meaning: "Meaning",
      japaneseLabel: "Japanese",
      readSentenceAloud: "Read sentence aloud",
      openSectionToTranslate: "Open this section to translate.",
      translationUnavailable: "Translation unavailable.",
      translating: "Translating...",
      findingGrammar: "Finding grammar...",
      grammarKnown: "Known",
      grammarReview: "Review",
      grammarDetails: "Details",
      grammarFoundIn: "Found in",
      grammarExample: "Example",
      grammarGuide: "Guide",
      grammarHideKnown: "Hide known",
      grammarShowKnown: "Show known",
      allDetectedGrammarKnown: "All detected grammar is marked known.",
      grammarShown: "shown",
      grammarKnownHidden: "known hidden",
      grammarGenericShort: "Grammar point: {name}",
      grammarGenericDetail: "Uses {name} in 「{match}」.",
      grammarKindHanabira: "Hanabira grammar",
      grammarLevelCore: "Core"
    }
  };
  function parseUiCopyTable(rows) {
    const copy = {};
    rows.trim().split("\n").forEach((row) => {
      const tab = row.indexOf("	");
      if (tab < 0) {
        const key = row.trim();
        if (key) copy[key] = "";
        return;
      }
      if (tab === 0) return;
      copy[row.slice(0, tab)] = row.slice(tab + 1).replaceAll("{APP_NAME}", APP_NAME);
    });
    return copy;
  }
  const JA_COPY = parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
welcomeLabel	{APP_NAME} ようこそ
onboardingEyebrow	日本語がある場所ならどこでも
onboardingCopy	本文、字幕、画像の日本語をタップ可能にします。
onboardingLanguage	表示言語
onboardingAccentColor	アクセントカラー
customAccentColor	カスタムカラー
onboardingImmersionOptions	没入設定の初期値
onboardingInstallOfflineDictionaries	オフライン辞書をダウンロード（Jitendex＋ピッチアクセント）
offlineDictionarySetupComplete	オフライン辞書をインストールしました。
offlineDictionarySetupFailed	オフライン辞書のセットアップに失敗しました。設定→ソースから再試行してください。
onboardingHoverShortcut	ホバー検索の修飾キー
onboardingAddApiKey	APIキーを追加
onboardingAddLocalDictionaries	ローカル辞書を追加
onboardingUseWithoutApiKey	APIキーなしで使う
closeOnboarding	ようこそ画面を閉じる
featureText	テキスト
featureTextBody	日本語をホバー/タップできます。
featureImages	画像
featureImagesBody	画像をタップして読み取れます。
featureVideo	動画
featureVideoBody	字幕内の語もタップできます。
featureControl	調整
featureControlBody	機能、キー、色を調整できます。
featureStudy	学習
featureStudyBody	学習ページで単語と漢字を復習。
featureGame	ゲーム
featureGameBody	Yomuアプリをインストールすると、ゲームやPC上のどこでも使えます。
automatic	自動
english	英語
japanese	日本語
settings	設定
settingsSaved	設定を保存しました。
settingsSaveFailed	設定を保存できませんでした。
dictionaries	辞書
sources	ソース
localWordSingular	項目
localWordPlural	項目
kanji	漢字
audio	音声
front	表面
back	裏面
newTabPage	学習
word	単語
search	検索
statsImportJpdbHistory	JPDB復習履歴を読み込む
switchToLightTheme	ライトテーマに切り替え
switchToDarkTheme	ダークテーマに切り替え
openYomuSettings	{APP_NAME}の設定を開く
newTabAddressCopied	学習ページのアドレスをコピーしました。
getApp	{APP_NAME}を入手
loading	読み込み中...
refreshing	更新中...
reveal	表示
revealTranslation	翻訳を表示
immersionExampleControls	イマージョンキット例文の操作
loadingKanjiDetails	漢字情報を読み込み中...
loadingMnemonicImages	覚え方画像を読み込み中...
lookupDialog	{APP_NAME}検索
resizeLookupSheet	検索シートをリサイズ。タップで閉じる
showMiningActions	マイニング操作を表示
hideMiningActions	マイニング操作を隠す
switchReviewTarget	採点先を切り替える
switchGradingProvider	採点サービスを切り替える
apiGradingProvider	優先採点サービス
apiGradingProviderHelp	JitenとJPDBの両方にある単語をどちらで採点するかの設定です。BunproのカードはBunproで採点されます。採点ボタン横の⇄で単語ごとに切り替えできます。
closeDrawer	ドロワーを閉じる
copiedWord	単語をコピーしました。
jpdbKanjiUpdated	JPDB漢字を更新しました。
jpdbKanjiUpdateFailedRuntime	JPDB漢字を更新できません。
apiSrsActionsDisabled	設定でAPI採掘操作が無効です。
addJpdbApiKeyReview	JPDBレビューにはAPIキーが必要です。
addJitenApiKeyReview	JitenレビューにはAPIキーが必要です。
addBunproApiKeyReview	Bunproレビューにはfrontend_api_tokenが必要です。
actionFailed	操作に失敗しました。
noDefinitions	有効な定義ソースから結果が返りませんでした。
dictionary	辞書
dictionariesExported	辞書をエクスポートしました。
saveAfterInstall	インストール後に保存
dictionaryDownloading	ダウンロード中
dictionaryReadingZip	辞書ZIPを読み取り中...
dictionaryCheckingIndex	インデックス確認中...
dictionaryBanksFound	{count}件のバンクを検出
dictionaryRemovingExisting	既存項目を削除中
dictionaryReadingBank	読み取り中
dictionaryParsingBank	解析中
dictionarySavingBank	保存中
dictionaryImporting	インポート中
importingBundledDictionaries	同梱辞書をインポート中...
dictionaryImported	インポート済み
dictionaryPreparingImport	インポート準備中
dictionaryRecords	辞書レコード
dictionaryEntries	件
dictionaryTotal	合計
dictionaryDownloadProgress	辞書をダウンロード中
dictionaryStatusSummary	辞書{dictionaries}、語{terms}、漢字{kanji}、メタ{metadata}
dictionaryStatusUnavailable	辞書状態を取得不可。
noLocalDictionariesImported	辞書は未追加です。まず定義用の語句辞書を追加してください。
dictionaryDownloadFailed	辞書のダウンロードに失敗しました。
dictionaryDownloadTimedOut	辞書のダウンロードがタイムアウトしました。
dictionaryDownloadNotZip	ダウンロード結果がZIPではありません。
dictionaryDownloadNeedsBridge	ブリッジが必要です。失敗時はZIPを追加。
dictionaryDownloadBlocked	ダウンロード不可。ZIPを追加。
dictionaryManualDownloadHint	ユーザースクリプト有効化かZIP追加。
dictionaryInstallQueueHelp	まず定義用の語句辞書をインストールしてください。ピッチ/頻度辞書はアクセントやバッジを追加しますが、通常の定義文は追加しません。
dictionaryInstallQueued	{dictionary}待機中。
dictionaryInstallSaveBlocked	インポート中。完了後に保存できます。
dictionaryImportQueueStatus	{count}件インストール中。完了後に保存。
dictionaryRemoveConfirm	「{dictionary}」を削除？
dictionaryRemoving	{dictionary}を削除中...
dictionaryRemoved	{dictionary}を削除しました。
dictionaryImportComplete	{sources}から{records}件インポートしました。
dictionaryRecordsImported	{dictionary}: {records}件
settingsImported	設定をインポートしました。
settingsImportedWithDetails	設定をインポートしました。{details}
settingsExported	設定をエクスポートしました。
restoredStoredChoices	保存済み選択肢を{count}件復元
importedDictionaryRecordCount	辞書レコードを{count}件インポート
dictionaryNoSupportedBanks	対応辞書バンクがありません。
dictionaryUnsupportedJson	Dexie、ZIP、出力を使ってください。
dictionaryZipMissingIndex	ZIPにindex.jsonがありません。
yomitanSettingsInvalid	Yomitan設定ではありません。
local	ローカル
dict	辞書
scanPage	ページをスキャン
noUnscannedJapaneseText	未スキャンの日本語テキストはありません。
jpdbScanFailed	ページスキャンに失敗しました。
pageCoverageSummary	{percent}%・{known}/{total}・新{unknown}・i+1 {iPlusOne}
noImmersionExamples	イマージョンキットの例文が見つかりません。
noImmersionExamplesCompact	例文なし
noLocalDictionaries	語句辞書は未追加です。定義にはJMdict、Jitendex、WTYなどを追加してください。ピッチ/頻度辞書だけでは定義文は増えません。
kanjiMapData	漢字マップデータ
kanjiAlive	カンジアライブ
wiktionary	ウィクショナリー
fallbackSetupTitle	辞書から始める
fallbackSetupCopy	JPDBキーなしで検索。辞書でオフライン対応。
fallbackSetupDictionaries	辞書を追加
fallbackSetupJpdb	JPDBキーを追加
offlineCacheGradesDisabled	オフラインです。採点は再接続時に同期されます。
recognizing	認識中...
noHandwritingMatch	候補なし。漢字を入力/貼り付け。
yourKanjiDrawing	あなたの手書き
jpdbKanjiActions	JPDB漢字操作
couldNotSearchLocalDictionaries	ローカル辞書を検索できませんでした。
subtitlePanel	字幕
lines	行
tracks	トラック
currentLineWillAppear	字幕が来ると現在行を表示。
native	母語
unsetJapanese	日本語を解除
unsetNative	母語字幕を解除
options	件
option	件
line	行
subtitleTrackDetected	字幕トラックを検出
filterStudy	学習
filterAll	すべて
sourceAuto	自動
sortRandom	ランダム
sortFrequency	頻度
sortState	状態
stateNew	新規
stateLearning	学習中
stateYoung	若い
stateMature	成熟
stateDue	復習予定
stateFailed	失敗
stateKnown	既知
stateMastered	習得済み
stateNeverForget	忘れない
jpdbAndJitenApiKeysConfigured	JitenとJPDBキーあり。
stateSuspended	停止中
stateLocked	ロック中
stateBlacklisted	ブラックリスト
stateRedundant	重複
stateFrequent	頻出
stateUnparsed	未解析
stateInDeck	デッキ内
stateNotInDeck	デッキ外
gradeAnkiCardTarget	Ankiカードを採点: {target}
gradeJpdbCardTarget	API SRSカードを採点
ankiReviewSingular	回復習
ankiReviewPlural	回復習
ankiLapseSingular	回失敗
ankiLapsePlural	回失敗
gradeNothingLabel	全然
gradeSomethingLabel	少し
gradeHardLabel	難しい
bunproGradeAgainLabel	もう一度
bunproGradeHardLabel	難しい
bunproGradeGoodLabel	良い
bunproGradeEasyLabel	簡単
gradeOkayLabel	OK
gradeEasyLabel	簡単
gradeFailLabel	失敗
gradePassLabel	合格
gradeNothing	採点: 全然
gradeSomething	採点: 少し
gradeHard	採点: 難しい
gradeOkay	採点: OK
gradeEasy	採点: 簡単
gradeFail	合否: 失敗
gradePass	合否: 合格
studyReveal	学習: カードを表示
studyRevealAlternate	学習: カードを表示（代替）
studyUndo	学習: 直前のレビューを取り消す
studyPrevious	学習: 前のカード
studyPreviousAlternate	学習: 前のカード（代替）
studyNext	学習: 次のカード
studyNextAlternate	学習: 次のカード（代替）
factKeyword	キーワード
factType	種類
factFrequency	頻度
factMeaning	意味
factGrade	学年
factOldForms	旧字体
loadingSimilarWords	単語を読み込み中...
openToLoadSimilarWords	開くと単語を読み込みます。
noSimilarWords	追加の単語は見つかりませんでした。
loadingExamples	例文を読み込み中...
immersionKitRateLimited	Immersion Kit制限中。あとで再試行。
immersionKitRequest	Immersion Kitリクエスト
immersionKitRequestFailed	Immersion Kitリクエストに失敗しました。
immersionKitRequestFailedWithStatus	Immersion Kitリクエストに失敗しました（{status}）。
immersionKitRequestTimedOut	Immersion Kitリクエストがタイムアウトしました。
immersionKitSearchBlocked	Immersion Kit検索がブロック中です。CORSを設定してください。
immersionKitMediaRequest	メディアリクエスト
immersionKitMediaRequestFailed	メディアリクエストに失敗しました。
immersionKitMediaRequestFailedWithStatus	メディアリクエストに失敗しました（{status}）。
immersionKitMediaRequestTimedOut	メディアリクエストがタイムアウトしました。
immersionKitMediaRequestReturnedNonMedia	メディアリクエストがエラードキュメントを返しました。
immersionKitNoMediaCandidate	読み込めるメディア候補なし。
nadeshikoRequest	Nadeshikoリクエスト
nadeshikoRequestFailed	Nadeshikoリクエストに失敗しました。
nadeshikoRequestFailedWithStatus	Nadeshikoリクエストに失敗しました（{status}）。
nadeshikoRequestTimedOut	Nadeshikoリクエストがタイムアウトしました。
previousExample	前の例文
nextExample	次の例文
playExampleAudio	例文音声を再生
openOnJpdb	JPDBで開く
openOnLookup	{label}で開く
copyWord	コピー
copyWordTitle	単語をコピー
backToWord	単語に戻る
backToKanji	漢字に戻る
previousKanji	前の漢字
nextKanji	次の漢字
openKanjiOnJpdb	JPDBで漢字を開く
playAudio	音声を再生
audioPlaybackDisabled	音声再生は無効です
audioPlaybackDisabledToast	音声再生は無効です。
audioPlaybackFailed	音声の再生に失敗しました。
noSentenceToRead	読み上げる例文がありません。
noTextToRead	読み上げるテキストがありません。
jpdbExampleAudioUnavailable	この例文にJPDB音声なし。
jpdbAudioPlayableFileMissing	JPDB音声に再生ファイルなし。
jpdbAudioResponseNotPlayable	JPDB音声は再生不可。
audioSourceReturnedNoAudio	音声ソースに音声なし。
audioJsonMissingPlayableUrl	音声JSONに再生URLなし。
textToSpeechUnavailable	読み上げを利用できません。
textToSpeechFailed	読み上げに失敗しました。
audioRequest	音声リクエスト
audioRequestTimedOut	音声リクエストがタイムアウトしました。
audioRequestReturnedNonAudio	音声ではない応答です
audioRequestReturnedNonAudioWithType	音声ではない応答です: {type}。
audioUnknownContentType	不明なコンテンツ種別
japanesePod101NoAudio	JapanesePod101に音声なし。
invalidJpdbAudioId	JPDB音声IDが無効です。
couldNotReadAudio	音声を読み取れませんでした。
couldNotReadAudioBlob	音声データを読み取れませんでした。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
jumpToCurrentSubtitle	現在の字幕へ移動
playVideo	動画を再生
pauseVideo	動画を一時停止
readVideoFrame	動画フレームを読み取る（OCR）
readVideoFrameStop	動画フレームの読み取りを停止（OCR）
copySubtitle	字幕をコピー
subtitleFallbackLabel	字幕
subtitlesTitle	字幕
openSubtitlePanel	字幕パネルを開く
closeSubtitlePanel	字幕パネルを閉じる
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
closeSubtitleDrawer	字幕ドロワーを閉じる
enableSubtitleAutoHide	再生中はパネルを自動で隠す
disableSubtitleAutoHide	再生中もパネルを開いたままにする
subtitlePanelOptions	パネル設定
loadJapaneseSubtitles	日本語字幕を読み込む
loadPrimarySubtitles	主字幕を読み込む
loadNativeSubtitles	母語字幕を読み込む
searchAnimeSubtitles	アニメ字幕を検索
toggleNativeSubtitleBlur	母語字幕のぼかしを切り替え
subtitleTrackDetectedSingular	字幕トラックを1件検出
subtitleTracksDetected	件の字幕トラックを検出
noSubtitleTracksDetected	字幕トラックは未検出です。
resizeTranscriptPanel	文字起こしパネルのサイズ変更
resizeSubtitleTracksPanel	字幕トラックパネルのサイズ変更
subtitlePanelMode	表示
subtitleLines	行
shadow	シャドー
subtitleTracks	トラック
batchMiningNoDestination	JPDB/Jiten API採掘またはAnki採掘を有効にしてください。
subtitleTrackTiming	字幕タイミング
subtitleOffsetPrevious	前の字幕を現在時刻に合わせる
subtitleOffsetNext	次の字幕を現在時刻に合わせる
subtitleOffsetPreviousShort	前
subtitleOffsetNextShort	次
subtitleOffsetEarlier	字幕を100ミリ秒早く表示
subtitleOffsetLater	字幕を100ミリ秒遅く表示
resetSubtitleOffset	字幕タイミングをリセット
copySubtitleLine	字幕行をコピー
subtitleCopyIncludeTranslation	行コピー時に翻訳も含める
peekSubtitleTranslation	翻訳を表示
hideSubtitleTranslation	翻訳を隠す
loadingSubtitleLines	字幕行を読み込み中
waitingForCaptionLines	字幕行を待機中
subtitleCurrentLineWillAppear	字幕が来ると現在行を表示します。
seekSubtitleLine	字幕行へ移動
subtitleTracksHint	主字幕を選び、「行」で移動。
noAutoDetectedSubtitleTracks	自動検出字幕はありません。
autoDetectedTracksWillAppear	字幕トラックはここに出ます。
autoDetectedOptionSingular	字幕オプション1件
autoDetectedOptions	件の字幕オプション
detected	検出済み
japaneseOverlay	日本語オーバーレイ
primaryOverlay	主字幕オーバーレイ
nativeOverlay	母語オーバーレイ
unsetJapaneseSubtitles	日本語を解除
unsetPrimarySubtitles	主字幕を解除
japaneseSubtitles	日本語
primarySubtitles	主字幕
unsetNativeSubtitles	母語を解除
nativeSubtitles	母語
chooseJapaneseSubtitles	日本語字幕を選択
choosePrimarySubtitles	主字幕を選択
transcript	文字起こし
subtitleOptionSingular	件
subtitleOptionPlural	件
subtitleLineSingular	行
subtitleLinePlural	行
trackKindPageTrack	ページ内トラック
trackKindPageFile	ページ内ファイル
trackKindYouTubeCaptions	YouTube字幕
youTubeSubtitles	YouTube字幕
autoGeneratedSubtitle	自動生成
trackKindLoadedFile	読み込んだファイル
trackStatusLoading	読み込み中
trackStatusWaiting	字幕待機中
trackStatusFailed	失敗
ocrEnabledToast	画像読み取りを有効にしました。
ocrHiddenToast	画像読み取りを非表示にしました。
ocrPlayVideo	動画を再生
ocrResumeVideo	動画を再開
ocrPausedFrameScanning	スキャン中...
ocrPausedFrameReady	テキスト準備完了
ocrPausedFrameNoText	テキストが見つかりません
ocrPausedFrameFailed	テキストを読み取れませんでした
ocrRetryScan	再スキャン
ocrNoReadableImages	近くに読み取れる画像がありません。
showKanji	漢字を表示
strokePractice	筆順と練習
practiceDrawing	手書き練習
strokes	画
textTrace	筆順ガイド
hideTrace	ガイドを隠す
showTrace	ガイドを表示
clear	クリア
originStructure	部品グラフ
originMapLabel	2D漢字由来・部品マップ
originShowSubcomponents	下位部品
originShowOutbound	派生先
radical	部首
readingsComponents	読みと部品
jpdbMnemonic	JPDBの覚え方
rtkComponentKeywords	RTK部品キーワード
onReading	音
kunReading	訓
heisigStory	Heisigストーリー
heisigComment	Heisigコメント
koohiiStories	Koohiiストーリー
add	追加
addToDeck	デッキに追加
addToDeckHint	採点せずに追加します。
deck	デッキ
deckActions	デッキ操作
reviewAddsToDeck	レビューすると新しい単語を追加します:
reviewBlockedBlacklisted	ブラックリスト入りです。解除するとレビューできます。
reviewBlockedNeverForget	「忘れない」設定です。解除するとレビューできます。
reviewBlockedLocked	JPDBでロック中です。解除するとレビューできます。
reviewBlockedRedundant	JPDBで冗長のためレビューできません。
ankiCardsSuspended	Ankiで保留にしました。
ankiCardsUnsuspended	Ankiの保留を解除しました。
ankiNeverForgetTagAdded	Ankiにyomu-never-forgetタグを付けました。
ankiNeverForgetTagRemoved	Ankiのyomu-never-forgetタグを外しました。
forget	忘れる
never	忘れない
neverHint	忘れないデッキへ移動します。
forgetHint	忘れないデッキから外します。
unlist	解除
unlistHint	ブラックリストから外します。
blacklist	ブラックリスト
blacklistHint	この単語を無視します。
vocabularyStatusUpdated	語彙状態を更新しました。
addToAnki	Ankiに追加
checkingAnki	Ankiを確認中...
sendToMobileAnki	{app}へ送る
mobileAnkiActionHint	モバイルAnkiで新規ノートを作成します。
ankiAudioFileNotFound	Anki音声ファイルが見つかりません。
ankiAudioPlaybackUnavailable	ここではAnki音声を再生できません。
ankiAudioUnavailablePreview	プレビューで音声を利用できません
ankiAudioFilenameLabel	Anki 音声 {filename}
ankiStoredFields	保存フィールド
ankiCardDetailsPending	Ankiで一致。カード詳細を読み込み中...
ankiCardDetailsUnavailable	Ankiで一致。キャッシュ状態を表示します。
ankiNewCard	新規カード
ankiMatches	Ankiの一致
ankiMergeNeedsDesktop	ノート統合にはデスクトップAnkiConnectが必要です。
ankiNoteNotFound	Ankiノートが見つかりません。
ankiHandoffCancelled	Ankiへの受け渡しがキャンセルされました。
ankiConnectActionFailed	AnkiConnectの操作に失敗しました。
ankiConnectRequestFailed	AnkiConnectリクエストに失敗しました。
ankiConnectTimedOut	AnkiConnectがタイムアウトしました。
ankiConnectNeedsBridge	AnkiConnectにはブリッジが必要です。
ankiHostedCorsHint	webCorsOriginListに{origin}を追加してください。
mobileAnkiReady	Anki未接続。受け渡しでカード作成できます。
ankiConnectionReady	接続しました。AnkiConnectに到達できます。
ankiConnectedReady	接続済み。「{deck}」/「{model}」準備完了。
ankiPromptRecallWord	ハイライトされた単語を思い出してください。
ankiMeaningHeading	意味
ankiPitchHeading	ピッチ
ankiPartOfSpeechHeading	品詞
ankiLinksHeading	リンク
ankiSourceHeading	出典
ankiTemplateContext	文脈
ankiTemplateRecognition	認識
ankiLocalDictionaryStatus	ローカル辞書
mergeYomu	Yomuを統合
mergeYomuTitle	一致フィールドを更新し、Yomuメディアを追加
editInAnki	Ankiで編集
keepBothAudio	両方残す
keepAnkiAudio	Ankiを残す
useYomuAudio	Yomuを使う
lastSeen	最後に見た場所
unavailable	利用不可
openedInAnki	Ankiで開きました。
addedToDeckAndReviewed	デッキに追加してレビューしました。
sentToAnki	Ankiに送信しました。
openedMobileAnkiHandoff	モバイルAnki受け渡しを開きました。
alreadyInAnki	すでにAnkiにあります。
removedFromDeck	デッキから削除しました。
addedToDeckToast	デッキに追加しました。
apiDeckMediaNotSupported	メディアはYomuに残ります。
sentToAnkiWithContextImageAndAudio	画像と音声付きでAnkiに送信しました。
sentToAnkiWithContextImage	画像付きでAnkiに送信しました。
sentToAnkiWithAudio	音声付きでAnkiに送信しました。
ankiMergeNoNewData	Yomuデータは反映済みです。
ankiMergeFieldSingular	フィールド
ankiMergeFieldPlural	フィールド
ankiMergeAudio	音声
ankiMergeImage	画像
ankiMergeComplete	YomuデータをAnkiに統合しました ({parts})。
parsedFrom	解析元
composedOf	構成語
imageReadingEnabled	画像読み取りを有効にしました。
imageReadingHidden	画像読み取りを非表示にしました。
ocrModeAutoToast	画像OCRを自動にしました。
ocrModeManualToast	画像OCRをタップ/ホバーにしました。
ocrModeOffToast	画像OCRをオフにしました。
subtitleOverlayEnabled	字幕オーバーレイを有効にしました。
subtitleOverlayHidden	字幕オーバーレイを非表示にしました。
reviewFailed	レビューに失敗しました。
reviewActionsDisabled	設定でレビュー操作が無効です。
jpdbLookupFailed	JPDB検索に失敗しました。
jpdbDeckStateApiKeyRequired	JPDBデッキ変更にはAPIキーが必要です。
jpdbAddApiKeyRequired	JPDB APIキーかAnki追加が必要です。
addedToJpdb	JPDBに追加しました。
jitenDeckStateApiKeyRequired	Jiten状態変更にはAPIキーが必要です。
jitenAddApiKeyRequired	Jiten APIキーかAnki追加が必要です。
bunproAddApiKeyRequired	Bunproのfrontend_api_tokenかAnki追加が必要です。
yomuLocalSrsDisabled	先に設定でローカルよむSRSを有効にしてください。
chooseJitenStudyDeck	先にJiten学習デッキを選択してください。
addedToJiten	Jitenに追加しました。
addedToBunpro	Bunproに追加しました。
addedToYomuLocal	よむに追加しました。
kanjiDetailsUnavailable	漢字情報はまだ利用できません。
loadingDictionaryDetails	辞書詳細を読み込み中...
sourceSingular	ソース
sourcePlural	ソース
jitenCompositeWords	複合語
usedInVocabulary	使われる単語
exampleSentences	例文
playJpdbExampleAudio	JPDB例文音声を再生
wordsUsingKanji	{kanji}を使う単語
kanjiDictionaries	漢字辞書
sourceNameWordsUsingKanji	関連語彙
contextVideo	動画
contextImage	画像
contextCurrentPage	現在のページ
jpdbKanjiActionMine	追加
jpdbKanjiActionKnown	既知
jpdbKanjiActionNeverForget	忘れない
jpdbKanjiActionForget	忘れる
jpdbKanjiActionBlacklist	ブラックリスト
jpdbKanjiActionReview	レビュー
immersionKit	イマージョンキット
translation	翻訳
grammar	文法
meaning	意味
japaneseLabel	日本語
readSentenceAloud	文を読み上げ
openSectionToTranslate	開くと翻訳します。
translationUnavailable	翻訳を利用できません。
translating	翻訳中...
findingGrammar	文法を検索中...
grammarKnown	既知
grammarReview	復習
grammarDetails	詳細
grammarFoundIn	検出箇所
grammarExample	例
grammarGuide	ガイド
grammarHideKnown	既知を隠す
grammarShowKnown	既知を表示
allDetectedGrammarKnown	検出文法はすべて既知です。
grammarShown	件表示
grammarKnownHidden	件の既知を非表示
grammarGenericShort	文法項目: {name}
grammarGenericDetail	「{match}」に「{name}」。
grammarKindHanabira	Hanabira文法
grammarLevelCore	基本
`);
  const JA_SETTINGS_COPY = parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
settingsSections	設定セクション
settingsSearch	設定を検索
settingsSearchPlaceholder	設定を検索
settingsSearchNoResults	一致なし。
selectOptions	選択肢
save	保存
cancel	キャンセル
show	表示
hide	隠す
appearance	外観
reading	読解
sources	ソース
backupSync	バックアップと同期
backupSyncHelp	Yomuの設定を保存・移行できます。設定をJSONでエクスポート/インポート、辞書のバックアップ、Google Drive同期に対応しています。
backupMovedHelp	バックアップ・同期・設定/辞書のインポートとエクスポートは「バックアップと同期」セクションにあります。
media	メディア
mining	採掘
shortcuts	ショートカット
help	ヘルプ
interface	インターフェイス
interfaceHelp	インターフェイス設定です。
reader	リーダー
images	画像テキスト (OCR)
video	動画
youTube	YouTube
anki	Anki
jpdb	JPDB
api	API
apiCredential	APIキー
apiCredentialJpdb	JPDB APIキー
apiCredentialJiten	Jiten APIキー
apiCredentialBunpro	Bunpro frontend API token
apiCredentialBunproLegacy	Bunpro APIキー
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
apiAccessHelp	各サービスの認証情報を設定します。Bunproに必要なのはフロントエンドトークンだけです。Bunpro設定から取り込み、パスワードと同様に扱ってください。保存時点では未確認です。ローカルよむSRSはアカウントなしで使えます。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
bunproSettings	Bunpro設定
jpdbApiKeyConfigured	JPDBキーあり。
jpdbApiKeyMissing	JPDBキーなし。
jpdbConnected	JPDBに接続しました。
jpdbAndJitenConnected	JitenとJPDBに接続しました。
jpdbConnectionFailed	JPDBキーが無効か接続不可です。
jitenApiKeyConfigured	Jitenキーあり。
jitenApiKeyMissing	Jitenキーなし。
statusEnabled	有効
statusDisabled	無効
statusReady	準備完了
statusAttention	設定が必要
statusError	エラー
disabledControlDescription	別設定で制御中。
jpdbMiningEnabled	APIの復習・デッキ変更を許可
bunproMiningEnabled	Bunproの復習・採掘を許可
yomuLocalSrsEnabled	ローカルよむSRSを有効化
addToForq	JPDB追加時にforqにもコピー
enableReviews	復習ボタンを表示
reviewRatingScale	復習評価の段階
gradeTargetSelector	採点先
gradeTargetBoth	両方
gradeTargetJpdb	JPDBを採点
gradeTargetJiten	Jitenを採点
gradeTargetBunpro	Bunproを採点
gradeTargetYomuLocal	よむを採点
gradeTargetAnki	Ankiカードを採点: {target}
gradeTargetJpdbAndAnki	JPDB + Ankiカードを採点: {target}
gradeTargetJitenAndAnki	Jiten + Ankiカードを採点: {target}
gradeTargetBunproAndAnki	Bunpro + Ankiカードを採点: {target}
gradeTargetYomuLocalAndAnki	よむ + Ankiカードを採点: {target}
missingAnkiCardId	AnkiカードIDがありません。
jpdbPageEnhancements	辞書サイト拡張
jpdbPageEnhancementsEnabled	辞書ページを拡張
jpdbPageWordEnhancementsEnabled	単語・検索ページにソースを追加
jpdbPageKanjiEnhancementsEnabled	漢字ページにソースを追加
jpdbPageEnhancementsHelp	
fivePoint	5段階: 全然から簡単まで
twoPoint	2段階: 失敗 / 合格
settingsLanguage	設定の表示言語
theme	テーマ
auto	自動
dark	ダーク
light	ライト
popupMode	ポップアップ表示
hoverPopupMode	ホバー時の表示
bottomSheet	下部シート
popover	ポップオーバー
stickyBottomSheet	検索後も開く
popoverBackdropEnabled	背後を暗くする
popoverWidth	ポップオーバー幅 (px)
popoverHeight	ポップオーバー高さ (px)
popoverHeightMode	ポップオーバー高さの動作
popoverHeightAvailable	空き領域まで
popoverHeightFixed	高さ設定を使う
readerFontFamily	リーダーUIフォント
popupFontFamily	ポップアップの日本語フォント
fontPresetYomuDefault	内蔵フォント
fontPresetJapaneseSans	日本語サンセリフ
fontPresetHiraginoYuGothic	ヒラギノ / 游ゴシック
fontPresetJapaneseRounded	日本語丸ゴシック
fontPresetJapaneseSerif	日本語明朝
fontPresetSystemUi	システムUI
fontPresetCustom	カスタム...
customFontFamily	カスタムフォント
popupFontWeight	ポップアップの日本語の太さ
enableLogging	診断ログを有効にする
diagnostics	診断
diagnosticsHelp	診断をコンソールへ出力します。
accentColor	アクセントカラー
newTab	学習
newTabEnabled	学習を新しいタブに設定
newTabAnkiEnabled	学習でAnkiカードを使う
newTabAnkiReviewDecks	Anki復習デッキ
newTabAnkiReviewDecksHelp	不要なデッキを外します。
newTabSource	学習の復習ソース
newTabAuto	自動: よむ・アカウント後に学習語
newTabApiSrs	API SRS（Jiten / JPDB）
newTabBunpro	Bunpro
newTabYomuLocal	ローカルよむSRS
dictionaryFallback	辞書フォールバック
newTabJpdbReviewMode	API復習モード
newTabJpdbReviewAuto	自動: ライブ漢字+API語彙
newTabLiveReview	ライブJPDB復習セッション
newTabApiVocabulary	API語彙のみ（デッキ順）
corsProxyUrl	クロスオリジンプロキシURL
newTabKanjiKeywordSource	漢字キーワードのソース
newTabKanjiKeywordAuto	自動: RTK、{service}、ローカル
newTabKanjiKeywordRtk	RTK / Heisig
newTabKanjiKeywordApiFacts	{service}漢字情報（Jiten / JPDB）
newTabKanjiKeywordLocal	ローカルカードの意味
newTabParsingEnabled	学習の文解析を有効にする
newTabFrontSentenceEnabled	単語カード表面に文を表示
newTabKanjiAutogradeEnabled	漢字書き取りを自動採点
newTabKanjiAutoSubmit	漢字評価を自動送信
newTabOfflineEnabled	学習をオフライン用にキャッシュ
newTabOfflineLimit	オフライン復習キャッシュ上限
newTabDailyGoalMinutes	1日の学習目標（分・0で無効）
newTabKanjiUnlockEnabled	漢字後に単語を解放
newTabStopAtBatchEnd	バッチの終わりで停止
newTabSwipeReviews	スワイプ採点（左=失敗、右=合格）
newTabShortcutHintsEnabled	学習のキーボードショートカットヒントを表示
newTabUrl	学習ページのアドレス
newTabOfflineHelp	カードと未送信採点を保存。
newTabAddressHelp	新規タブやiPadホーム画面用。
newTabJpdbDeck	学習のJPDBデッキ
newTabStudySteps	学習ステップ
newTabStudyStepsHelp	ドラッグで並べ替え。速く復習したいステップはオフにできます。表示と採点は常に最後です。
newTabStudyStepHeader	ステップ
newTabStudyStepKanji	漢字書き取り
newTabStudyStepWord	単語の意味
newTabStudyStepRecall	文で書く
newTabStudyStepListen	ピッチ聞き取り
newTabStudyStepSpeaking	発音
newTabStudyStepType	単語を書く
newTabStudyStepKanjiHelp	答えが出る前に各漢字を書きます。単語の意味を表示するので空欄が曖昧になりません。ヒントで漢字キーワードを出せます。
newTabStudyStepWordHelp	表は日本語、表示後に意味と読み。
newTabStudyStepRecallHelp	例文の空欄に単語を入力します。ヒントで最初の音、次に長さを表示。例文があるカードのみ表示。
newTabStudyStepListenHelp	音声を聞き、型の候補からピッチ型を選びます。正誤は最後の答え合わせまで表示しません。ピッチアクセント情報がある時のみ表示。
newTabStudyStepSpeakingHelp	単語をシャドーイングします。ピッチの高低をこの端末でお手本と比較して採点します。音声がある時のみ表示。
newTabStudyStepTypeHelp	聞いて発音した単語を書き出します。入力または漢字ごとの手書きで解答できます。セッション中はスキップ可能。
openNewTabPage	学習を開く
copyAddress	アドレスをコピー
wordColors	単語の色
wordColorNew	新規・デッキ内
wordColorLearning	学習中
wordColorKnown	既知・忘れない
wordColorDue	期限到来
wordColorFailed	失敗
wordColorIgnored	無視・保留・ブラックリスト中
pitchAccentColors	ピッチアクセントの色
pitchColorHeiban	平板
pitchColorAtamadaka	頭高
pitchColorNakadaka	中高
pitchColorOdaka	尾高
pitchColorKifuku	起伏
pitchColorUnknown	不明 / 継承
colorChannels	色チャンネル
wordHighlightColorSource	単語ハイライトの色
wordUnderlineColorSource	単語下線の色
wordTextColorSource	単語テキストの色
subtitleHighlightColorSource	字幕ハイライトの色
subtitleUnderlineColorSource	字幕下線の色
subtitleTextColorSource	字幕テキストの色
colorSourceStatus	JPDB + Ankiの状態
colorSourceJpdb	JPDBの状態
colorSourceAnki	Ankiの状態
colorSourcePitch	ピッチアクセント
colorSourceNone	なし
colorChannelsHelp	
interfaceHelp	インターフェイス設定です。
popupLookup	ポップアップ検索
popupLookupEnabled	よむの検索ポップアップを表示
popupLookupHelp	他リーダーのポップアップ用。オフでも他機能は有効。
lookupOnClick	タップまたはクリックで検索
lookupOnHover	ホバーで検索
lookupOnMiddleMouse	中央ボタン長押しで検索
showFloatingButton	設定ボタンを表示
pageScanMode	ページスキャン
pageScanModeOff	オフ
pageScanModeAuto	自動
pageScanModeManual	手動
manualPageScanShortcut	手動ページスキャンのショートカット
manualScanEnabled	手動ページスキャン
ocrInteractionMode	画像OCRスキャン
ocrInteractionModeAuto	自動
ocrInteractionModeManual	タップ/ホバー
ocrInteractionModeOff	オフ
puckMenuLabel	よむ メニュー
puckStudyPage	学習ページ
puckPauseAnnotations	注釈を一時停止
puckResumeAnnotations	注釈を再開
puckOcrAuto	OCR: 自動
puckOcrManual	OCR: タップ/ホバー
puckOcrOff	OCR: オフ
annotationsPausedToast	注釈を一時停止しました。
annotationsResumedToast	注釈を再開しました。
puckMuteAudio	音声の自動再生をミュート
puckUnmuteAudio	音声の自動再生のミュートを解除
puckHideFurigana	ふりがなを隠す
furiganaOffToast	ふりがなを非表示にしました。単語の検索は引き続き使えます。
autoplayAudioOnToast	音声の自動再生をオンにしました。
autoplayAudioOffToast	音声の自動再生をミュートしました。
showFurigana	ふりがな注釈を有効にする
furiganaMode	ふりがな
wordColorStates	色を付ける単語
appearancePresetCustom	現在のカスタム設定を保持
appearancePresetBalanced	読みやすいバランス
appearancePresetNoColors	プレーンテキスト
appearancePresetNewOnly	新規単語に集中
appearancePresetUnderlineNew	控えめなハイライト
wordColorStatesAll	すべての学習状態
wordColorStatesNewOnly	新規・未追加のみ
hideFuriganaFor	ふりがなを隠す対象
hideColorFor	色を隠す対象
furiganaDifficultKanji	難しい漢字のみ
furiganaHideKnown	なじみのある語を非表示
furiganaHoverOnly	ホバー時に表示
furiganaAllParsed	解析済みの全単語に表示
clampedRowReadings	省略行のふりがな
clampedRowReadingsShow	表示（行が広がる）
clampedRowReadingsHover	ホバー時のみ
showPitchAccent	ピッチアクセントを表示
showLookupPillFrequency	サイトの頻度をピルに表示
suppressRedundantWordUi	JPDBの冗長語のスタイルを非表示
sheetCloseButtonOnLeft	閉じるボタンを左に
hideKnownFurigana	既知カードのふりがなを非表示
readerHelp	ホバーキーを設定。空欄なら通常ホバー。
hoverLookupSettings	ホバー検索
kanjiOriginKanjiMapEnabled	漢字情報と部品グラフを表示
kanjiOriginGraphEnabled	部品グラフを表示
kanjiOriginRadicalImagesEnabled	部首画像を表示
similarKanjiWordLimit	類似語の上限
kanjiHelp	
audioEnabled	語句の音声を有効にする
autoPlayAudio	語句の音声を自動再生
suppressAutoAudioOnVideo	動画では検索音声オフ
audioAutoPlayMode	自動再生のきっかけ
audioEnableDefaultSources	内蔵音声ソースを有効
audioFallbackChimeEnabled	フォールバック音を有効
audioSelectionMode	複数音声があるとき
audioPlayback	音声再生
firstAudio	最初の音声
randomAudio	シャッフル音声
audioTtsMode	読み上げの扱い
audioTtsFallback	録音音声の後のフォールバック
audioTtsSourceOrder	ソース順/シャッフルに含める
audioTimeoutMs	音声タイムアウト (ms)
previewAudio	音声を試聴
audioHelp	URL: {term}、{reading}、{language}。
audioSource	音声ソース
urlVoice	URL / 音声
addAudioSource	音声ソースを追加
audioAutoPlayAll	ホバーとタップ/クリック
audioAutoPlayHover	ホバーのみ
audioAutoPlayTap	タップ/クリックのみ
automaticBrowserVoice	ブラウザの自動音声
savedVoice	保存済み音声
savedVoiceLabel	保存済み音声: {voice}
audioSourceOrder	音声ソースの順序
audioSourceNumber	音声ソース {number}
enableAudioSourceNumber	音声ソース {number} を有効にする
enableLookupPillName	検索ピル「{name}」を有効にする
enableSourceName	ソース「{name}」を有効にする
textToSpeechVoiceNumber	読み上げ音声 {number}
audioSourceJpod101	JapanesePod101
audioSourceLanguagePod101	LanguagePod101
audioSourceJisho	Jisho.org
audioSourceLinguaLibre	(Commons) Lingua Libre
audioSourceWiktionary	(Commons) Wiktionary
audioSourceJitenTts	Jiten読み上げ
audioSourceJpdbTts	JPDB読み上げ
audioSourceTextToSpeech	ブラウザ読み上げ
audioSourceTextToSpeechReading	ブラウザ読み上げ (かな読み)
audioSourceCustom	直接音声ファイルURL
audioSourceCustomJson	カスタムURL
audioCustomJsonPlaceholder	Yomitan/Ultimate音声URL
audioCustomUrlPlaceholder	直接音声ファイルURL
audioBuiltInPlaceholder	内蔵ソースはURL不要
defaultVoiceSuffix	標準
audioGuideLinkLabel	Yomitan音声ガイド
audioProxyGuideSummary	Cloudflareプロキシ
audioProxyGuideIntro	専用プロキシにはWorkerを使います。
audioProxyGuideCloudflare	Cloudflareを開きます。
audioProxyGuideWorkers	Workers & PagesでCreateします。
audioProxyGuideCreateWorker	Workerを選び、名前を付けてDeploy。
audioProxyGuideEditCode	Yomu Workerソースを貼ります。
audioProxyGuideDeploy	Deployします。
audioProxyGuideCopyUrl	Worker URLをコピーします。
audioProxyGuidePasteUrl	Cross-origin proxy URLに貼ります。
audioProxyGuideTest	保存後、検索・インポート・音声で確認。
audioProxyGuideNote	共有前にホストを絞ります。
audioProxyWorkerSource	Workerソース
audioProxyDeployGuide	デプロイガイド
immersionKitEnabled	イマージョンキット例文を表示
immersionKitExampleSource	例文プロバイダー
immersionKitAndNadeshiko	イマージョンキット + なでしこ
nadeshikoApiKey	なでしこAPIキー
getNadeshikoKey	キーを取得
immersionKitShowTranslation	例文の翻訳を表示
immersionKitRevealTranslationOnClick	クリックまで翻訳をぼかす
immersionKitShowImages	例文サムネイルを表示
immersionKitAutoPlayAudio	表示後や移動時に音声再生
immersionKitPlayOnHover	ホバーで例文音声を再生
immersionKitPlayOnImageClick	クリックで例文音声を再生
immersionKitCategory	例文ソース
immersionKitSort	例文の並び順
immersionKitLimitEnabled	単語ごとの例文数制限
allExamples	すべての例文
limitExamples	例文数を制限
immersionKitLimit	単語ごとの例文数
immersionKitMinLength	最小文長
immersionKitMaxLength	最大文長
immersionKitPlaybackRate	例文音声速度
immersionKitExactMatch	完全一致を優先
immersionKitHelp	例文を表示。Nadeshikoはキー必須。
allCategories	すべて
anime	アニメ
drama	ドラマ
games	ゲーム
shortestFirst	短い順
longestFirst	長い順
randomOrder	ランダム
ocrEnabled	画像内テキストを読む
ocrAutoScanImages	画像を自動で読む
ocrShowTextOverlay	認識した画像テキスト領域を表示
ocrVideoPauseFrames	一時停止した動画フレームを自動で読む
ocrInvertDarkPanels	暗いコマの白い文字を読む
ocrProvider	画像読み取り
ocrOverlayTheme	OCRオーバーレイテーマ
ocrOverlayThemeAuto	アプリのテーマに合わせる
ocrOverlayThemeLight	ライトオーバーレイ
ocrOverlayThemeDark	ダークオーバーレイ
googleLens	Google Lens — 無料・設定不要（おすすめ）
cloudVision	Google Cloud Vision — APIキーが必要
localOcr	ローカルOCRサーバー — 上級者向け
off	オフ
ocrMaxImagesPerPage	ページごとに読む画像数
ocrMinImageArea	読む画像の最小サイズ
ocrMaxImagePixels	画像の精細さ
lightWork	軽め
normal	標準
more	多め
largeOnly	大きい画像のみ
includeSmall	小さい画像も含める
faster	高速
balanced	バランス
sharper	高精細
ocrTextColor	画像テキストの色
ocrOutlineColor	画像テキストの縁取り
ocrBackgroundOpacity	画像ハイライト不透明度
ocrFontScale	画像テキスト倍率
ocrEndpointUrl	ローカルOCRサーバーURL
ocrCustomLocalServer	ローカルOCRサーバーURL
ocrEngine	ローカルOCRエンジン
ocrEngineMangaOcr	MangaOCR（マンガに最適）
ocrEngineAppleVision	Apple Vision（macOS）
cloudVisionApiKey	Google Cloud Vision APIキー
ocrHelp	近くの画像を読み取ります。Google Lensは設定不要です。
ocrCloudHelp	Google Cloud Vision APIキーを貼ります。
ocrLocalHelp	MangaOCR/Apple VisionのローカルURLを入力します。
subtitlePlayerEnabled	動画字幕プレイヤーを有効にする
subtitleAutoDetect	ページの字幕を自動検出
subtitleOverlayVisible	字幕オーバーレイを表示
subtitleSecondaryVisible	利用可能ならネイティブ字幕を表示
subtitleNativeBlurred	ホバーするまでネイティブ字幕をぼかす
subtitleKaraokeMode	カラオケ風の単語タイミング
subtitleTranscriptVisible	文字起こしパネルを標準で開く
subtitlePausePanel	一時停止時にサイドパネルを開く
subtitleShadowAutoPause	シャドー中は各行の後で一時停止
subtitleTranscriptPlacement	文字起こしパネル位置
subtitleTranscriptAutoScroll	再生に合わせて文字起こしをスクロール
subtitleTranscriptAutoScrollResumeSeconds	手動スクロール後の再開 (秒)
subtitleAutoCopyLine	各字幕行を再生時に自動コピー
subtitleMiningPause	字幕クリック時に動画を一時停止
subtitleHoverPause	字幕ホバー時に動画を一時停止
subtitleControlsMode	字幕コントロール
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
moveSubtitles	字幕を移動
moveSubtitlesAccessible	字幕を移動します。ドラッグするか、矢印キーまたはPage Up/Page Downキーを使います。Homeまたは0でリセットします。
moveSubtitleControls	字幕コントロールを移動します。ドラッグするか矢印キーを使います。Homeまたは0でリセットします。
pinSubtitleControls	字幕コントロールを展開したままにする
unpinSubtitleControls	操作していないとき字幕コントロールを折りたたむ
right	右
left	左
bottom	下
showWhenNeeded	コンパクト表示
hideControls	コントロールを隠す
alwaysVisible	常に表示
subtitleFontSize	字幕フォントサイズ (px)
subtitleBottomOffset	字幕下端オフセット (%)
subtitleTextColor	字幕の色
subtitleOutlineColor	字幕の縁取り
subtitleBackgroundColor	字幕背景
subtitleBackgroundOpacity	字幕背景の不透明度
subtitleFontFamily	字幕フォントファミリー
subtitleFontWeight	字幕フォントの太さ
subtitleSeekPadding	字幕シーク余白 (s)
subtitlePreview	字幕ライブプレビュー
preview	プレビュー
youtubeImmersionEnabled	日本語YouTubeのみ
preferJapaneseSiteLanguage	サイトの言語と地域を日本優先にする
youtubeShowChannelRecommendations	日本語チャンネル候補を表示
youtubeShowFilterNotice	非表示動画の通知を表示
youtubeHelp	日本語UIと日本向け内容を優先します。
youtubeFilterOn	YouTubeフィルター: オン
youtubeFilterOff	YouTubeフィルター: オフ
youtubeShowHiddenVideos	非表示動画を表示
youtubeHideHiddenVideos	非表示動画を隠す
youtubeHideNotice	通知を隠す
youtubeFilterShowing	{appName}は非表示のYouTube項目{count}件を表示中
youtubeFilterHid	{appName}は日本語らしくないYouTube項目{count}件を非表示
youtubeFilterVisible	日本語らしい項目{count}件は表示したままです。
youtubeToggleToastOn	YouTube没入フィルターをオンにしました。
youtubeToggleToastOff	YouTube没入フィルターをオフにしました。
ankiEnabled	Anki採掘を有効にする
ankiMineWithJpdb	API経由で追加するときAnkiにも追加
ankiCaptureScreenshot	可能なら文脈画像を添付
ankiConnectUrl	AnkiConnect URL
ankiDeck	Ankiデッキ
ankiModel	Ankiノートタイプ
mobileAnkiHandoff	モバイルAnki新規ノート作成
ankiTemplateMode	Ankiカードテンプレート
ankiFrontReading	単語優先の表面に読みを表示
ankiFrontSentence	単語優先の表面に文を表示
ankiFrontImage	表面に画像を表示
wordFirst	単語を先に表示
sentenceFirst	文を先に表示
ankiTags	タグ
sentenceFirstPreset	文を先に表示するプリセット
wordFirstPreset	単語を先に表示するプリセット
imageAbovePrompt	画像があれば問題文の上に表示します。
recallHighlightedWord	文脈からハイライト語を思い出します。
imageOnFront	利用可能な場合、画像は表面に表示されます。
recallMeaning	まず意味を思い出します。
ankiBackIncludes	辞書、漢字、ピッチ、頻度、出典、画像を含みます。
exampleMeaning	読む
scanAnkiFirst	先にAnkiConnectに接続
notMapped	対応付けなし
noScannedFields	
mappingForNoteType	{model} の対応付け
currentNoteType	現在のノートタイプ
ankiFieldMappingSelect	{role}フィールド
ankiRoleExpression	表記
ankiRoleReading	読み
ankiRoleMeaning	意味
ankiRoleSentence	文
ankiRoleAudio	音声
ankiRoleImage	画像
testAnki	AnkiConnectを確認
prepareAnki	よむノートタイプを作成
ankiCheckingConnection	{url} のAnkiConnectを確認中。
ankiMiningDisabledStatus	Ankiマイニングは無効です。
ankiTesting	AnkiConnectを確認中...
ankiPreparing	よむデッキとノートタイプを作成または更新中...
ankiScanning	Ankiデッキ、ノートタイプ、フィールドを読み込み中...
ankiScanSummary	デッキ{decks}、ノート{models}。候補: {model}。{fields}
ankiScanNoModels	デッキ{decks}件を検出。ノートタイプは未取得です。
ankiScanFieldSummary	フィールド: {fields}
ankiUnreachable	デスクトップAnkiとAnkiConnectを確認してください。
ankiCorsBlocked	webCorsOriginListに「{origin}」を追加し再起動してください。
ankiSettingsUnreachable	AnkiConnectに接続できません。
ankiHostedBridgeMissing	よむを有効化し、更新してください。
ankiStatusOpenDesktop	デスクトップAnkiを開く
ankiStatusInstallAddon	AnkiConnectをインストール/有効化
ankiStatusMobileDocs	モバイル設定ドキュメント
ankiStatusUseDesktopUrl	モバイルではLAN/Tailscale URLを使う
ankiStatusEnableUserscript	よむを有効化
ankiStatusRefreshAndCheck	更新して再確認
ankiLibraryAdapter	既存ライブラリアダプター
ankiLibraryAdapterStatus	既存デッキから対応付けを提案します。
ankiLibraryChoices	デッキとノートタイプ
ankiLibraryChoicesHelp	作成・更新先を選びます。
ankiTemplateSettings	よむカードテンプレート
ankiTemplateSettingsHelp	よむノートタイプ用。テンプレートはAnkiに残ります。
ankiMappingConfidenceHelp	フィールド名とサンプルで判断します。
ankiMappingHighConfidence	高
ankiMappingMediumConfidence	中
ankiMappingLowConfidence	低
ankiHelp	AnkiConnectを入れてデスクトップ版Ankiを開きます。CORS表示が出る場合はこのサイトをwebCorsOriginListに追加してください。モバイル受け渡しは新規ノート作成のみです。
jpdbDefinitionsEnabled	JPDB定義を表示
localDictionariesEnabled	インポート済み辞書の定義を表示
dictionarySourcesInitiallyExpanded	ポップアップのソースを標準で開く
localDictionaryMaxResults	辞書結果の上限
cloudSettingsSync	Google Drive設定同期
cloudSettingsSyncHelp	Yomuの設定をGoogle Driveのアプリデータに保存します。辞書は端末内に残ります。
importSettings	設定JSONをインポート
exportSettings	設定JSONをエクスポート
importDictionaries	辞書をインポート
exportDictionaries	辞書をエクスポート
dictionaryImportHelp	Yomitan ZIP、設定エクスポート、バックアップを読み込みます。語句/ピッチ/頻度辞書で定義、アクセント、バッジを追加します。
lookupPills	検索ピル
parserProvider	解析ソース
parserProviderLocal	ローカル辞書（オフライン）
parserProviderJiten	Jiten API
parserProviderJpdb	JPDB API
parserProviderAuto	自動（Jiten/JPDB）
parserProviderHelp	ローカルはインポート済み辞書でオフライン解析します。JitenとJPDBはキー設定時に必ずそのAPIを使います。自動はJiten、次にJPDBを優先します。
lookupPillsHelp	外部リンクと頻度バッジを同じ順序で表示します。ローカル頻度辞書は一致するJiten/JPDBライブバッジを置き換えます。トークン: {query}、{word}、{reading}。
copiesCurrentWord	現在の単語をコピーします
lookupPillLabel	検索ピルのラベル
lookupPillLabelNumber	検索ピル{number}のラベル
lookupUrlTemplate	検索URLテンプレート
lookupUrlTemplateNumber	ピル{number} URL
lookupPillOrder	検索ピルの順序
builtInAction	内蔵アクション
recommendedDownloads	辞書
termDictionaries	語句辞書
kanjiDictionaries	漢字辞書
pitchDictionaries	ピッチ辞書
frequencyDictionaries	頻度辞書
install	インストール
installing	インストール中
queued	待機中
dictionaryGuide	ガイド
download	ダウンロード
downloadAndImport	ダウンロードしてよむにインポート
update	更新
checkingDictionaries	インポート済み辞書を確認中...
dictionaryOnlyJpdb	JPDBのみです。JMdict、Jitendex、WTYなどの語句辞書でローカル定義を追加してください。
localDictionaryText	辞書テキスト
localSenseSingular	意味
localSensePlural	意味
decksLoaded	JPDBアカウントからデッキを読み込みました。
decksUnavailable	デッキを読み込めません。保存IDは保持します。
addApiKeyChooseDecks	デッキを選ぶにはJPDB APIキーを追加してください。
miningDeck	採掘デッキ
neverForgetDeck	忘れないデッキ
blacklistDeck	ブラックリストデッキ
allStudyDecks	すべての学習デッキ
savedValue	保存済み: {value}
holdWhileHovering	ホバー中に押すキー
hoverOpenDelayMs	ホバーで開く遅延 (ms)
hoverCloseDelayMs	ホバーを閉じる遅延 (ms)
pressKeys	キーを押してください
blankPlainHover	空欄ならキーなしホバー
openSettings	設定を開く
resizeSettings	設定パネルのサイズ変更
closePopup	ポップアップを閉じる
previousLookupWord	前の単語
nextLookupWord	次の単語
playingAudioPreview	{APP_NAME}を再生中...
audioPreviewFailed	音声プレビューに失敗しました。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
playVideo	動画を再生
pauseVideo	動画を一時停止
readVideoFrame	動画フレームを読み取る（OCR）
readVideoFrameStop	動画フレームの読み取りを停止（OCR）
copySubtitle	字幕をコピー
toggleImageReading	画像読み取りを切り替え
toggleSubtitleOverlay	字幕オーバーレイを切り替え
toggleYoutubeImmersion	YouTubeフィルターを切り替え
readImagesNow	今すぐ画像を読む
massReviewVisible	画面内の単語を一括レビュー（Jiten）
massReviewNoWords	画面内に復習対象のJiten単語がありません。
massReviewNoKey	一括レビューにはJiten APIキーが必要です。
massReviewDone	{count}語を「Good」でレビューしました。
massReviewFailed	一括レビューに失敗しました。
adapterStateDisabled	オフ
adapterStateProbing	接続確認中
adapterStateUnreachable	接続不可
adapterStateConnected	接続済み
adapterStateScanning	スキャン中
adapterStateSuggested	対応付け済み
adapterStateStale	要確認
adapterStateReady	準備完了
ankiMappingConfidenceHigh	完全一致
ankiMappingConfidenceMedium	曖昧一致
ankiMappingConfidenceLow	未対応
ankiMappingStaleField	保存済みフィールドなし
helpLinksTitle	便利なページ
helpLinksCopy	リーダーツールとドキュメントをここから開けます。
versionAndUpdates	バージョン
currentYomuVersion	Yomu
updateStatusIdle	現在 {current}。確認待ち。
updateStatusChecking	現在 {current}。確認中...
updateStatusCurrent	現在 {current}。最新 {latest}。最新です。
updateStatusAvailable	現在 {current}。最新 {latest}。更新できます。
updateStatusUnknown	現在 {current}。確認できません。必要なら再インストールしてください。
updateStatusIncomparable	現在 {current}。最新 {latest}。バージョンを比較できません。古い場合は「更新」を使ってください。
updateHelpNotesManager	よむスクリプトは1つだけ有効にしてください。「更新」でユーザースクリプトマネージャーのインストール画面が開きます。ブラウザにインストールブロックの警告が出る場合は、拡張機能ページでマネージャーの詳細を開き、「ユーザースクリプトを許可」（または開発者モード）を有効にしてから再試行してください。
updateHelpNotesExternalManager	よむスクリプトは1つだけ有効にしてください。「更新」でスクリプトのソースが開き、ユーザースクリプトアプリが開いたタブから読み取って更新します。iPhone/iPadで更新が止まる場合は、このリンクをSafariで開いてタブを開いたままにしてください。
updateHelpNotesNoManager	この環境ではユーザースクリプトマネージャーが検出されませんでした。ブラウザはスクリプトの直接インストールをブロックするため、「更新」ではブラウザ別の手順があるインストールガイドを開きます。
updateUserscript	更新
duplicateStatusSingle	有効なYomuランタイムは1つです（{kind}）。
duplicateStatusUnknown	重複確認はできません。よむが2つ表示される場合は古いスクリプトを無効にしてください。
ankiConnectSetupTitle	AnkiConnect設定
ankiConnectSetupCopy	デスクトップAnkiを開き、AnkiConnectを有効にしてください。ホスト版StudyではAnkiConnect側でYomuのオリジンを許可する必要があります。
ankiConnectSetupConfig	AnkiConnectのwebCorsOriginListに次のオリジンを追加してください。既存の項目は残します:
ankiConnectSetupMobile	スマホやiPadでは、デスクトップPCのLANまたはTailscale URLを使います。スマホ上のlocalhostはPCではなくスマホ自身を指します。
ankiConnectSetupBrave	BraveでローカルAnki確認がブロックされる場合は、StudyページのShieldsをオフにしてください。
helpSupportTitle	よむをサポート
helpSupportCopy	よむは検索、OCR、字幕、辞書、学習、Ankiをまとめた無料ユーザースクリプトです。
helpSupportCopyExtra	寄付は開発とサービス費用を支えます。
videoPlayer	動画プレイヤー
pdfReader	PDFリーダー
newTabPage	学習
localAudio	ローカル音声
changelog	変更履歴
support	サポート
github	GitHub
docs	ドキュメント
factoryReset	初期状態に戻す
factoryResetConfirm	{appName}の全データをリセットしますか？\n\n設定、キー、キャッシュ、辞書を削除。
factoryResetFailed	リセットに失敗しました。
factoryResetDictionaryWarning	設定をリセットしました。他のタブを閉じてください。
factoryResetOtherTabReloading	別タブでリセット。再読み込み...
factoryResetDeleteSettingsFailed	設定を削除できません。他のタブを閉じてください。
issues	Issue
donate	寄付
discord	Discord
documentation	ドキュメント
addToMining	デッキに追加
addToMiningHint	選択中のAPI SRSデッキに追加します。
enabledHeader	有効
labelHeader	ラベル
detailsHeader	詳細
displayName	表示名
orderHeader	順序
removeHeader	削除
definitionSource	定義ソース
kanjiSection	漢字セクション
dictionaryDisplayName	辞書表示名
sourcePriority	{source}の優先度
dragToReorder	ドラッグして並べ替え
moveUp	上へ移動
moveDown	下へ移動
remove	削除
removeImportedDictionary	インポート済み辞書を削除
customAdvanced	{label} (詳細)
importLocalDefinitionsHelp	ローカル定義にはYomitan辞書を使います。
frequencyMetadataHelp	頻度、ピッチ、漢字メタデータをバッジや漢字データに表示。
sourceHelpJpdb	現在のカードのJPDB定義です。
sourceHelpJiten	Jiten定義、例文、関連語です。
sourceHelpBunpro	Bunproの語彙・文法の意味、ニュアンス、正解として認められる答えです。
sourceHelpAnki	一致するAnkiカード内容と状態です。
sourceHelpTranslation	文の自動翻訳です。
sourceHelpGrammar	ローカル文法ヒントです。
sourceHelpImmersionKit	例文、画像、音声です。
sourceNameImmersionKit	イマージョンキット
sourceNameAnki	Anki
sourceNameTranslation	翻訳
sourceNameGrammar	文法
sourceNameStrokePractice	筆順練習
sourceNameImportedKanjiDictionaries	インポート済み漢字辞書
sourceNameWordsUsingKanji	相关词汇
sourceNameJitenKanjiFacts	Jiten漢字情報
sourceHelpImportedKanjiDictionary	インポート済みYomitan漢字辞書です。
sourceHelpStrokePractice	筆順プレビューと書き取りパッドです。
sourceHelpReadingsComponents	JPDBの読み、部品、語呂合わせです。
sourceHelpJitenKanjiFacts	Jitenの漢字情報、頻度、読み、使用語です。
sourceHelpRtk	RTKキーワード、要素、ストーリーです。
sourceHelpUchisen	Uchisen語呂合わせ画像カルーセルです。
uchisenMnemonicImages	Uchisen語呂合わせ画像
uchisenMnemonicFor	{kanji}のUchisen語呂合わせ
noUchisenImagesYet	Uchisen画像はまだありません。
generateUchisenImage	画像を生成
generateUchisenImageToggle	画像を生成 +
uchisenMnemonicStory	語呂合わせストーリー
uchisenImagePrompt	画像プロンプト
uchisenGenerateHint	ストーリーとプロンプトを編集し、Uchisen画像を公開します。
uchisenGeneratingImage	画像を生成中...
uchisenPublishingMnemonic	語呂合わせを公開中...
uchisenGeneratedImage	Uchisen画像を公開しました。
uchisenGenerateFailed	Uchisen画像を生成できませんでした。
uchisenLoginRequired	画像生成にはUchisenへのログインが必要です。
noStoryAvailable	ストーリーはありません
sourceHelpImportedKanjiDictionaries	インポート済み漢字項目です。
sourceHelpWordsUsingKanji	関連語彙です。
sourceHelpComponentGraph	漢字情報、部品、部首画像です。
recommendedJitendex	例文付きの語句定義です。
recommendedJmdict	基本語句定義です。
recommendedJmnedict	固有名詞辞書です。
recommendedWtyJapaneseJapanese	日本語で読む語句定義です。
recommendedPixivLight	Pixiv用語辞書です。
recommendedKanjidic	漢字情報です。
recommendedMarvncMonolingual	日本語辞書集です。
recommendedJpdbKanji	JPDB漢字情報です。
recommendedKanjiumPitch	ピッチアクセント専用です。定義には語句辞書も追加してください。
recommendedJpdbv2Kana	JPDB由来のおすすめ頻度バッジです。
recommendedBccwj	BCCWJ由来の頻度バッジです。
recommendedJiten	Jiten由来の頻度バッジです。
`);
  function resolveUiLanguage(language) {
    if (language === "ja" || language === "en") return language;
    return browserPrefersJapanese() ? "ja" : "en";
  }
  function browserPrefersJapanese() {
    const navigatorLanguages = typeof navigator === "undefined" ? [] : [
      ...Array.isArray(navigator.languages) ? navigator.languages : [],
      navigator.language
    ];
    return navigatorLanguages.some(isJapaneseLocale);
  }
  function isJapaneseLocale(value) {
    return typeof value === "string" && value.toLowerCase().startsWith("ja");
  }
  function uiText(language, key) {
    return resolveUiLanguage(language) === "ja" ? JA_SETTINGS_COPY[key] ?? JA_COPY[key] ?? "未翻訳" : COPY.en[key];
  }
  const log = Logger.scope("KanjiDoodle");
  const PEN_MIN_DISTANCE = 8e-4;
  const POINTER_MIN_DISTANCE = 16e-4;
  const GHOST_VIEWBOX_UNITS = 109;
  const GHOST_STROKE_UNITS = 3;
  const GHOST_FALLBACK_RATIO = 0.82;
  const GHOST_FALLBACK_MAX_PX = 220;
  const ACTIVE_DOODLE_CLASS = "jpdb-reader-doodle-active";
  const NATIVE_GESTURE_SUPPRESS_MS = 900;
  const KANJI_DOODLE_CLEAR_EVENT = "yomu:kanji-doodle-clear";
  function installKanjiDoodle(popover, getLanguage, options = {}) {
    const root = popover;
    root.__yomuKanjiDoodleCleanup?.();
    delete root.__yomuKanjiDoodleCleanup;
    const elements = kanjiDoodleElements(popover);
    const clear = popover.querySelector("[data-doodle-clear]");
    const trace = popover.querySelector("[data-doodle-trace]");
    if (!elements) return;
    const { stage, canvas, ghost } = elements;
    let context = null;
    try {
      context = canvas.getContext("2d");
    } catch (error) {
      log.warn("Kanji doodle install failed", { reason: "2d-context-error" }, error);
      return;
    }
    if (!context) {
      log.warn("Kanji doodle install failed", { reason: "missing-2d-context" });
      return;
    }
    let dpr = 1;
    let drawing = false;
    let pointerId = -1;
    let pointerType = "";
    let traceVisible = !ghost.hidden && !stage.classList.contains("trace-hidden");
    let points = [];
    let strokes = [];
    let canvasRect = canvas.getBoundingClientRect();
    let suppressNativeGestureUntil = 0;
    let activeClassRemovalTimer = 0;
    const controller = new AbortController();
    const signal = controller.signal;
    const keepDoodleInteractionActive = (durationMs = NATIVE_GESTURE_SUPPRESS_MS) => {
      suppressNativeGestureUntil = Math.max(suppressNativeGestureUntil, Date.now() + durationMs);
      document.documentElement.classList.add(ACTIVE_DOODLE_CLASS);
      if (activeClassRemovalTimer) {
        window.clearTimeout(activeClassRemovalTimer);
        activeClassRemovalTimer = 0;
      }
    };
    const shouldSuppressNativeGesture = () => drawing || Date.now() < suppressNativeGestureUntil;
    const releaseDoodleInteractionSoon = () => {
      if (activeClassRemovalTimer) window.clearTimeout(activeClassRemovalTimer);
      activeClassRemovalTimer = window.setTimeout(() => {
        activeClassRemovalTimer = 0;
        if (shouldSuppressNativeGesture()) {
          releaseDoodleInteractionSoon();
          return;
        }
        document.documentElement.classList.remove(ACTIVE_DOODLE_CLASS);
      }, NATIVE_GESTURE_SUPPRESS_MS);
    };
    const suppressNativeGestureIfActive = (event) => {
      if (!shouldSuppressNativeGesture()) return;
      suppressNativeCanvasGesture(event);
    };
    const resize = () => {
      const rect = stage.getBoundingClientRect();
      dpr = Math.max(window.devicePixelRatio || 1, 1);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      canvasRect = canvas.getBoundingClientRect();
      measureGhost();
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        redraw();
      }
    };
    const toPoint = (event) => {
      return {
        x: Math.max(0, Math.min(1, (event.clientX - canvasRect.left) / Math.max(canvasRect.width, 1))),
        y: Math.max(0, Math.min(1, (event.clientY - canvasRect.top) / Math.max(canvasRect.height, 1))),
        pressure: Math.max(0.12, Math.min(1, event.pressure || 0.55))
      };
    };
    let measuredGhostSize = 0;
    const measureGhost = () => {
      const svg = ghost.querySelector("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      if (size > 0) measuredGhostSize = size;
    };
    const ghostDisplaySize = () => {
      if (measuredGhostSize > 0) return measuredGhostSize;
      const stageSize = Math.min(canvasRect.width, canvasRect.height);
      return Math.min(stageSize * GHOST_FALLBACK_RATIO, GHOST_FALLBACK_MAX_PX);
    };
    const strokeWidth = (point) => {
      const base = Math.max(2.4, GHOST_STROKE_UNITS / GHOST_VIEWBOX_UNITS * ghostDisplaySize() * dpr);
      return base * (0.78 + (point?.pressure ?? 0.5) * 0.44);
    };
    const setupStroke = (point) => {
      context.strokeStyle = resolvedDoodleInk(stage);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = strokeWidth(point);
    };
    const drawStroke = (stroke) => {
      if (!stroke.length) return;
      if (stroke.length === 1) {
        drawPoint(stroke[0]);
        return;
      }
      if (typeof context.quadraticCurveTo === "function") {
        drawSmoothedStroke(stroke);
        return;
      }
      for (let index = 1; index < stroke.length; index += 1) {
        drawSegment(stroke[index - 1], stroke[index]);
      }
    };
    const drawSmoothedStroke = (stroke) => {
      context.save();
      setupStroke(averagePressurePoint(stroke));
      context.beginPath();
      context.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
      for (let index = 1; index < stroke.length - 1; index += 1) {
        const control = stroke[index];
        const next = stroke[index + 1];
        context.quadraticCurveTo(
          control.x * canvas.width,
          control.y * canvas.height,
          (control.x + next.x) / 2 * canvas.width,
          (control.y + next.y) / 2 * canvas.height
        );
      }
      const last = stroke[stroke.length - 1];
      context.lineTo(last.x * canvas.width, last.y * canvas.height);
      context.stroke();
      context.restore();
    };
    const drawPoint = (point) => {
      context.save();
      setupStroke(point);
      context.beginPath();
      if (typeof context.arc === "function" && typeof context.fill === "function") {
        context.fillStyle = context.strokeStyle;
        context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(1.2, context.lineWidth / 2), 0, Math.PI * 2);
        context.fill();
      } else {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        context.moveTo(x, y);
        context.lineTo(x + Math.max(1, context.lineWidth / 2), y);
        context.stroke();
      }
      context.restore();
    };
    const drawSegment = (from, to) => {
      context.save();
      setupStroke(to);
      context.beginPath();
      context.moveTo(from.x * canvas.width, from.y * canvas.height);
      context.lineTo(to.x * canvas.width, to.y * canvas.height);
      context.stroke();
      context.restore();
    };
    const redraw = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const stroke of strokes) drawStroke(stroke);
      drawStroke(points);
    };
    const appendPoint = (point) => {
      const last = points.at(-1);
      const minDistance = pointerType === "pen" ? PEN_MIN_DISTANCE : POINTER_MIN_DISTANCE;
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < minDistance) return;
      points.push(point);
      if (typeof context.quadraticCurveTo === "function") redraw();
      else if (last) drawSegment(last, point);
      else drawPoint(point);
    };
    const applyPointerSamples = (event) => {
      for (const sample of pointerSamples(event)) appendPoint(toPoint(sample));
    };
    const start = (event) => {
      const computedCanvas = getComputedStyle(canvas);
      if (computedCanvas.pointerEvents === "none" || computedCanvas.visibility === "hidden") return;
      if (drawing) {
        if (event.pointerId === pointerId) return;
        finishStroke(false);
      }
      event.preventDefault();
      event.stopPropagation();
      drawing = true;
      pointerId = event.pointerId;
      pointerType = event.pointerType;
      keepDoodleInteractionActive();
      clearSelection();
      canvasRect = canvas.getBoundingClientRect();
      points = [];
      appendPoint(toPoint(event));
      setDoodlePointerCapture(canvas, event.pointerId);
    };
    const move = (event) => {
      if (!drawing || event.pointerId !== pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      keepDoodleInteractionActive();
      applyPointerSamples(event);
    };
    const end = (event) => {
      if (!drawing || event.pointerId !== pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      applyPointerSamples(event);
      finishStroke();
    };
    const finishAfterLostCapture = (event) => {
      if (!drawing || event.pointerId !== pointerId) return;
      keepDoodleInteractionActive();
    };
    const clearActiveSelection = () => {
      if (shouldSuppressNativeGesture()) clearSelection();
    };
    const finishStroke = (releaseCapture = true) => {
      if (points.length) strokes = [...strokes, points];
      points = [];
      drawing = false;
      const activePointerId = pointerId;
      pointerId = -1;
      pointerType = "";
      if (releaseCapture) releaseDoodlePointerCapture(canvas, activePointerId);
      keepDoodleInteractionActive();
      releaseDoodleInteractionSoon();
      clearSelection();
      options.onChange?.(strokes.map((stroke) => [...stroke]));
    };
    const clearDoodle = () => {
      strokes = [];
      points = [];
      redraw();
      options.onClear?.();
      options.onChange?.([]);
    };
    canvas.addEventListener("pointerdown", start, { passive: false, signal });
    canvas.addEventListener("lostpointercapture", finishAfterLostCapture, { signal });
    document.addEventListener("pointermove", move, { passive: false, signal });
    document.addEventListener("pointerup", end, { passive: false, signal });
    document.addEventListener("pointercancel", end, { passive: false, signal });
    window.addEventListener("pointermove", move, { passive: false, signal });
    window.addEventListener("pointerup", end, { passive: false, signal });
    window.addEventListener("pointercancel", end, { passive: false, signal });
    document.addEventListener("selectionchange", clearActiveSelection, { signal });
    document.addEventListener("contextmenu", suppressNativeGestureIfActive, { capture: true, signal });
    document.addEventListener("selectstart", suppressNativeGestureIfActive, { capture: true, signal });
    document.addEventListener("dragstart", suppressNativeGestureIfActive, { capture: true, signal });
    window.addEventListener("contextmenu", suppressNativeGestureIfActive, { capture: true, signal });
    window.addEventListener("selectstart", suppressNativeGestureIfActive, { capture: true, signal });
    window.addEventListener("dragstart", suppressNativeGestureIfActive, { capture: true, signal });
    popover.addEventListener(KANJI_DOODLE_CLEAR_EVENT, clearDoodle, { signal });
    for (const target of [stage, canvas, clear, trace]) {
      if (!target) continue;
      target.addEventListener("contextmenu", suppressNativeCanvasGesture, { signal });
      target.addEventListener("selectstart", suppressNativeCanvasGesture, { signal });
      target.addEventListener("dragstart", suppressNativeCanvasGesture, { signal });
    }
    clear?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearDoodle();
    }, { signal });
    trace?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      traceVisible = !traceVisible;
      ghost.hidden = !traceVisible;
      stage.classList.toggle("trace-hidden", !traceVisible);
      trace.textContent = uiText(getLanguage(), traceVisible ? "hideTrace" : "showTrace");
      if (traceVisible) {
        measureGhost();
        redraw();
      }
    }, { signal });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    root.__yomuKanjiDoodleCleanup = () => {
      controller.abort();
      resizeObserver.disconnect();
      if (activeClassRemovalTimer) window.clearTimeout(activeClassRemovalTimer);
      document.documentElement.classList.remove(ACTIVE_DOODLE_CLASS);
      clearSelection();
      if (root.__yomuKanjiDoodleCleanup) delete root.__yomuKanjiDoodleCleanup;
    };
    const disconnectWhenDetached = () => {
      if (!popover.isConnected) {
        root.__yomuKanjiDoodleCleanup?.();
        return;
      }
      requestAnimationFrame(disconnectWhenDetached);
    };
    requestAnimationFrame(resize);
    requestAnimationFrame(disconnectWhenDetached);
  }
  function suppressNativeCanvasGesture(event) {
    event.preventDefault();
    event.stopPropagation();
    clearSelection();
  }
  function averagePressurePoint(stroke) {
    const pressure = stroke.reduce((sum, point) => sum + point.pressure, 0) / stroke.length;
    return { ...stroke[stroke.length - 1], pressure };
  }
  function pointerSamples(event) {
    const coalesced = safeCoalescedPointerEvents(event);
    if (!coalesced.length) return [event];
    const last = coalesced.at(-1);
    return last && samePointerPosition(last, event) ? coalesced : [...coalesced, event];
  }
  function safeCoalescedPointerEvents(event) {
    try {
      return typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    } catch {
      return [];
    }
  }
  function samePointerPosition(a, b) {
    return a.clientX === b.clientX && a.clientY === b.clientY && a.pressure === b.pressure;
  }
  function setDoodlePointerCapture(canvas, activePointerId) {
    try {
      canvas.setPointerCapture?.(activePointerId);
    } catch {
    }
  }
  function releaseDoodlePointerCapture(canvas, activePointerId) {
    try {
      canvas.releasePointerCapture?.(activePointerId);
    } catch {
    }
  }
  function clearSelection() {
    const selection = document.getSelection?.();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  }
  function resolvedDoodleInk(stage) {
    const ink = getComputedStyle(stage).getPropertyValue("--jpdb-reader-doodle-ink").trim();
    return ink && !ink.startsWith("var(") ? ink : DOODLE_COLOR_TOKENS.ink;
  }
  function kanjiDoodleElements(popover) {
    const stage = popover.querySelector(".jpdb-reader-doodle-stage");
    const canvas = popover.querySelector(".jpdb-reader-doodle-canvas");
    const ghost = popover.querySelector(".jpdb-reader-doodle-ghost");
    if (stage && canvas && ghost) return { stage, canvas, ghost };
    return null;
  }
  const FEATURE_INTERVAL = 20;
  const NORMALIZED_SIZE = 256;
  const SHAPE_PASS_SCORE = 0.5;
  const TOTAL_PASS_SCORE = 62;
  function assessKanjiStrokes(strokes, expectedStrokes, referenceStrokes) {
    const validStrokes = strokes.filter((stroke) => stroke.length > 1);
    const actualStrokes = validStrokes.length;
    const expected = Math.max(1, Math.round(expectedStrokes || actualStrokes || 1));
    const strokeScore = Math.max(0, 1 - Math.abs(actualStrokes - expected) / Math.max(expected, 1));
    const coverageScore = Math.min(1, totalDistance(strokes) / Math.max(expected * 0.28, 0.28));
    const directionScore = averageForwardMotion(strokes);
    const shapeScore = assessStrokeShape(validStrokes, referenceStrokes, expected);
    const score = Math.round((shapeScore == null ? strokeScore * 0.62 + coverageScore * 0.24 + directionScore * 0.14 : strokeScore * 0.18 + coverageScore * 0.06 + directionScore * 0.04 + shapeScore * 0.72) * 100);
    const shapePassed = shapeScore == null || shapeScore >= SHAPE_PASS_SCORE;
    const passed = actualStrokes === expected && score >= TOTAL_PASS_SCORE && shapePassed;
    const message = assessmentMessage(passed, actualStrokes, expected, shapeScore);
    return { passed, score, expectedStrokes: expected, actualStrokes, shapeScore: shapeScore ?? void 0, message };
  }
  function totalDistance(strokes) {
    return strokes.reduce((sum, stroke) => {
      let distance = 0;
      for (let index = 1; index < stroke.length; index += 1) {
        const previous = stroke[index - 1];
        const current = stroke[index];
        distance += Math.hypot(current.x - previous.x, current.y - previous.y);
      }
      return sum + distance;
    }, 0);
  }
  function averageForwardMotion(strokes) {
    const scored = strokes.filter((stroke) => stroke.length > 1).map((stroke) => {
      const first = stroke[0];
      const last = stroke[stroke.length - 1];
      const horizontal = Math.abs(last.x - first.x);
      const vertical = Math.abs(last.y - first.y);
      if (horizontal >= vertical) return last.x >= first.x ? 1 : 0.45;
      return last.y >= first.y ? 1 : 0.45;
    });
    return scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : 0;
  }
  function assessmentMessage(passed, actualStrokes, expectedStrokes, shapeScore) {
    if (passed) return `Looks right: ${actualStrokes}/${expectedStrokes} strokes`;
    if (actualStrokes !== expectedStrokes) return `Check stroke count: ${actualStrokes}/${expectedStrokes} strokes`;
    if (shapeScore != null && shapeScore < SHAPE_PASS_SCORE) return `Check stroke shape/order: ${actualStrokes}/${expectedStrokes} strokes`;
    return `Check stroke count/order: ${actualStrokes}/${expectedStrokes} strokes`;
  }
  function assessStrokeShape(strokes, referenceStrokes, expectedStrokes) {
    if (!referenceStrokes || strokes.length !== expectedStrokes || referenceStrokes.length !== expectedStrokes) return null;
    const written = extractFeatures(momentNormalize(toPattern(strokes)), FEATURE_INTERVAL);
    const reference = extractFeatures(momentNormalize(toPattern(referenceStrokes)), FEATURE_INTERVAL);
    if (written.length !== reference.length || written.some((stroke, index) => stroke.length < 2 || reference[index].length < 2)) return null;
    const scores = written.map((stroke, index) => strokeCorrespondenceScore(stroke, reference[index]));
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const worst = Math.min(...scores);
    return average * 0.8 + worst * 0.2;
  }
  function toPattern(strokes) {
    return strokes.map((stroke) => stroke.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).map((point) => ({
      x: Math.max(0, Math.min(1, point.x)) * NORMALIZED_SIZE,
      y: Math.max(0, Math.min(1, point.y)) * NORMALIZED_SIZE
    }))).filter((stroke) => stroke.length > 1);
  }
  function momentNormalize(pattern) {
    const points = pattern.flat();
    if (!points.length) return pattern;
    const width = NORMALIZED_SIZE;
    const height = NORMALIZED_SIZE;
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const oldWidth = Math.max(maxX - minX, 1e-3);
    const oldHeight = Math.max(maxY - minY, 1e-3);
    const aspectScale = aspectPreservingScale(oldWidth, oldHeight);
    const targetWidth = oldHeight > oldWidth ? aspectScale * width : width;
    const targetHeight = oldHeight > oldWidth ? height : aspectScale * height;
    const offsetX = (width - targetWidth) / 2;
    const offsetY = (height - targetHeight) / 2;
    const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const varianceX = points.reduce((sum, point) => sum + (point.x - centerX) ** 2, 0) / points.length;
    const varianceY = points.reduce((sum, point) => sum + (point.y - centerY) ** 2, 0) / points.length;
    const scaleX = finiteScale(targetWidth / (4 * Math.sqrt(varianceX)));
    const scaleY = finiteScale(targetHeight / (4 * Math.sqrt(varianceY)));
    return pattern.map((stroke) => stroke.map((point) => ({
      x: clamp$1(scaleX * (point.x - centerX) + targetWidth / 2 + offsetX, 0, NORMALIZED_SIZE),
      y: clamp$1(scaleY * (point.y - centerY) + targetHeight / 2 + offsetY, 0, NORMALIZED_SIZE)
    })));
  }
  function aspectPreservingScale(width, height) {
    const ratio = height > width ? width / height : height / width;
    return Math.sqrt(Math.sin(Math.PI / 2 * ratio));
  }
  function finiteScale(value) {
    return Number.isFinite(value) ? value : 0;
  }
  function extractFeatures(pattern, interval) {
    return pattern.map((stroke) => {
      const extracted = [];
      let distance = 0;
      for (let index = 0; index < stroke.length; index += 1) {
        if (index === 0) extracted.push(stroke[0]);
        if (index > 0) distance += euclid(stroke[index - 1], stroke[index]);
        if (distance >= interval && index > 1) {
          distance -= interval;
          extracted.push(stroke[index]);
        }
      }
      if (extracted.length === 1) extracted.push(stroke[stroke.length - 1]);
      else if (distance > interval * 0.75) extracted.push(stroke[stroke.length - 1]);
      return extracted;
    });
  }
  function strokeCorrespondenceScore(stroke, reference) {
    const whole = wholeWholeDistance(stroke, reference);
    const endpoints = endPointDistance(stroke, reference) / 2;
    const direction = directionDistance(stroke, reference) * 128;
    const distance = whole * 0.58 + endpoints * 0.32 + direction * 0.1;
    return clamp$1(1 - distance / 96, 0, 1);
  }
  function wholeWholeDistance(pattern1, pattern2) {
    const [larger, smaller] = pattern1.length >= pattern2.length ? [pattern1, pattern2] : [pattern2, pattern1];
    if (!larger.length || !smaller.length) return NORMALIZED_SIZE;
    let distance = 0;
    for (let index = 0; index < smaller.length; index += 1) {
      const largerIndex = Math.min(larger.length - 1, Math.floor(larger.length / smaller.length * index));
      distance += manhattan(larger[largerIndex], smaller[index]);
    }
    return distance / smaller.length;
  }
  function endPointDistance(pattern1, pattern2) {
    if (!pattern1.length || !pattern2.length) return NORMALIZED_SIZE;
    return manhattan(pattern1[0], pattern2[0]) + manhattan(pattern1[pattern1.length - 1], pattern2[pattern2.length - 1]);
  }
  function directionDistance(pattern1, pattern2) {
    const vector1 = strokeVector(pattern1);
    const vector2 = strokeVector(pattern2);
    const length1 = Math.hypot(vector1.x, vector1.y);
    const length2 = Math.hypot(vector2.x, vector2.y);
    if (!length1 || !length2) return 1;
    const dot = (vector1.x * vector2.x + vector1.y * vector2.y) / (length1 * length2);
    return (1 - clamp$1(dot, -1, 1)) / 2;
  }
  function strokeVector(stroke) {
    return {
      x: stroke[stroke.length - 1].x - stroke[0].x,
      y: stroke[stroke.length - 1].y - stroke[0].y
    };
  }
  function euclid(point1, point2) {
    return Math.hypot(point1.x - point2.x, point1.y - point2.y);
  }
  function manhattan(point1, point2) {
    return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
  }
  function clamp$1(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function createOpeningKanjiActivity(trace, language = "en") {
    return {
      id: "activity:lesson-zero-kanji-one",
      kind: "kanji-writing",
      responseKind: "recognition-or-doodle",
      conceptIds: ["concept:kanji-one"],
      prompt: {
        en: "Recognise 一, then write it from left to right.",
        ja: "「一」を見分けてから、左から右へ書きましょう。"
      },
      payload: {
        trace,
        language,
        reading: "いち",
        meaning: { en: "one", ja: "ひとつ" },
        recognitionOptions: [
          { character: "一", label: { en: "一 · one", ja: "一・ひとつ" } },
          { character: "二", label: { en: "二 · two", ja: "二・ふたつ" } },
          { character: "口", label: { en: "口 · mouth", ja: "口・くち" } }
        ]
      }
    };
  }
  const kanjiWritingActivityPlugin = {
    kind: "kanji-writing",
    validate(model) {
      const issues = [];
      if (!model.payload?.trace?.svg) issues.push({ path: "payload.trace.svg", message: "A KanjiVG trace is required." });
      if (model.payload?.trace?.strokeCount < 1) issues.push({ path: "payload.trace.strokeCount", message: "A stroke count is required." });
      if (!model.payload?.recognitionOptions?.some((option) => option.character === model.payload.trace.character)) {
        issues.push({ path: "payload.recognitionOptions", message: "The target character must be an option." });
      }
      return issues;
    },
    render(model, host2, submit) {
      return renderKanjiWritingActivity(model, host2, submit);
    },
    grade(model, response) {
      if (response.phase === "recognition") return gradeRecognition(model, response.character);
      return gradeWriting(response.assessment, response.inputMode);
    },
    toReviewSeeds(model, result) {
      if (result.outcome !== "pass" || !result.errorTags.includes("kanji-writing-complete")) return [];
      return [openingKanjiReviewSeed(model)];
    }
  };
  function renderKanjiWritingActivity(model, host2, submit) {
    const language = model.payload.language;
    const root = element("section", "academy-kanji-activity");
    root.dataset.yomuRuntimeSurface = "kanji-writing";
    const prompt = localizedElement("p", "academy-kanji-prompt", language, model.prompt);
    const recognition = element("div", "academy-kanji-recognition");
    const recognitionQuestion = localizedElement("h2", "", language, {
      en: "Which character means “one”?",
      ja: "「ひとつ」という意味の漢字はどれですか。"
    });
    const recognitionOptions = element("div", "academy-kanji-options");
    const status = element("p", "academy-activity-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    recognition.append(recognitionQuestion, recognitionOptions, status);
    const writing = element("div", "academy-kanji-writing");
    writing.hidden = true;
    const writingPrompt = localizedElement("h2", "", language, {
      en: "Now write 一 from left to right.",
      ja: "では、「一」を左から右へ書いてください。"
    });
    const practice = renderDoodleShell(model, language);
    const keyboard = renderKeyboardWritingAlternative(language);
    const keyboardButton = keyboard.querySelector("[data-keyboard-stroke]");
    const keyboardStatus = keyboard.querySelector('[role="status"]');
    const writingStatus = practice.querySelector("[data-newtab-doodle-result]");
    writing.append(writingPrompt, practice, keyboard);
    root.append(prompt, recognition, writing);
    host2.replace(root);
    let disposed = false;
    let writingComplete = false;
    let submittingWriting = false;
    model.payload.recognitionOptions.forEach((option) => {
      const button = localizedElement("button", "academy-button academy-button-secondary academy-kanji-option", language, option.label);
      button.type = "button";
      button.dataset.character = option.character;
      button.addEventListener("click", () => {
        recognitionOptions.querySelectorAll("button").forEach((candidate) => {
          candidate.disabled = true;
        });
        void submit({ phase: "recognition", character: option.character }).then((evaluation) => {
          if (disposed) return;
          status.textContent = localizedFeedback(evaluation, language);
          if (evaluation.result.outcome === "pass") {
            recognition.classList.add("academy-kanji-recognition-complete");
            writing.hidden = false;
            requestAnimationFrame(() => keyboardButton.focus());
            return;
          }
          recognitionOptions.querySelectorAll("button").forEach((candidate) => {
            candidate.disabled = false;
          });
        });
      });
      recognitionOptions.append(button);
    });
    const submitWriting = (assessment, inputMode) => {
      if (disposed || writingComplete || submittingWriting) return;
      submittingWriting = true;
      void submit({ phase: "writing", assessment, inputMode }).then((evaluation) => {
        if (disposed) return;
        const targetStatus = inputMode === "keyboard" ? keyboardStatus : writingStatus;
        targetStatus.textContent = localizedFeedback(evaluation, language);
        practice.classList.toggle("academy-doodle-pass", evaluation.result.outcome === "pass");
        practice.classList.toggle("academy-doodle-lapse", evaluation.result.outcome === "lapse");
        if (evaluation.result.outcome === "pass") {
          writingComplete = true;
          const canvas = practice.querySelector("canvas");
          if (canvas) canvas.style.pointerEvents = "none";
          writing.querySelectorAll("button").forEach((button) => {
            button.disabled = true;
          });
        }
      }).finally(() => {
        submittingWriting = false;
      });
    };
    installKanjiDoodle(practice, () => language, {
      onChange(strokes) {
        if (!strokes.some((stroke) => stroke.length > 1)) return;
        submitWriting(assessWriting(model.payload.trace, strokes), "doodle");
      },
      onClear() {
        writingStatus.textContent = "";
        practice.classList.remove("academy-doodle-pass", "academy-doodle-lapse");
      }
    });
    let keyboardSteps = 0;
    const advanceKeyboardStroke = () => {
      if (disposed || writingComplete || submittingWriting) return;
      keyboardSteps += 1;
      keyboardStatus.textContent = language === "ja" ? `右向きの動き ${keyboardSteps}/3` : `Rightward movement ${keyboardSteps}/3`;
      if (keyboardSteps < 3) return;
      keyboardButton.disabled = true;
      submitWriting({
        passed: true,
        score: 100,
        expectedStrokes: 1,
        actualStrokes: 1,
        shapeScore: 1,
        message: "Keyboard trace: one left-to-right stroke"
      }, "keyboard");
    };
    keyboardButton.addEventListener("click", advanceKeyboardStroke);
    keyboardButton.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      event.preventDefault();
      advanceKeyboardStroke();
    });
    return {
      focus() {
        recognitionOptions.querySelector("button")?.focus();
      },
      dispose() {
        disposed = true;
        practice.__yomuKanjiDoodleCleanup?.();
        root.remove();
      }
    };
  }
  function renderKeyboardWritingAlternative(language) {
    const root = element("section", "academy-keyboard-writing");
    const heading = localizedElement("h3", "", language, {
      en: "Keyboard alternative",
      ja: "キーボードで書く代替方法"
    });
    const instructions = localizedElement("p", "", language, {
      en: "Focus the button and press Enter or Space three times to trace one stroke from left to right.",
      ja: "ボタンにフォーカスし、Enterまたはスペースを3回押して、左から右への一画をたどってください。"
    });
    const button = localizedElement("button", "academy-button academy-button-secondary", language, {
      en: "Trace one step to the right",
      ja: "右へ一段階たどる"
    });
    button.type = "button";
    button.dataset.keyboardStroke = "";
    button.dataset.jpdbReaderSurfaceIgnore = "";
    const status = element("p", "academy-activity-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    root.append(heading, instructions, button, status);
    return root;
  }
  function renderDoodleShell(model, language) {
    const root = element("div", "academy-doodle jpdb-reader-kanjivg");
    const stage = element("div", "jpdb-reader-doodle-stage");
    stage.dataset.kanji = model.payload.trace.character;
    const ghost = element("div", "jpdb-reader-doodle-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.innerHTML = model.payload.trace.svg;
    const canvas = element("canvas", "jpdb-reader-doodle-canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", language === "ja" ? "「一」を書くキャンバス" : "Canvas for writing 一");
    stage.append(ghost, canvas);
    const tools = element("div", "jpdb-reader-doodle-tools");
    const help = element("span", "jpdb-reader-help");
    help.textContent = language === "ja" ? "1画・左から右" : "1 stroke · left to right";
    const trace = element("button", "academy-button academy-button-quiet jpdb-reader-doodle-control");
    trace.type = "button";
    trace.dataset.doodleTrace = "";
    trace.dataset.jpdbReaderSurfaceIgnore = "";
    trace.textContent = language === "ja" ? "見本を隠す" : "Hide trace";
    const clear = element("button", "academy-button academy-button-quiet jpdb-reader-doodle-control");
    clear.type = "button";
    clear.dataset.doodleClear = "";
    clear.dataset.jpdbReaderSurfaceIgnore = "";
    clear.textContent = language === "ja" ? "消す" : "Clear";
    tools.append(help, trace, clear);
    const result = element("div", "academy-doodle-result");
    result.dataset.newtabDoodleResult = "";
    result.setAttribute("role", "status");
    root.append(stage, tools, result);
    return root;
  }
  function assessWriting(trace, strokes) {
    return assessKanjiStrokes(
      strokes,
      trace.strokeCount,
      trace.strokeShapes
    );
  }
  function gradeRecognition(model, character) {
    const passed = character === model.payload.trace.character;
    return passed ? {
      outcome: "pass",
      score: 1,
      errorTags: ["kanji-recognition-complete"],
      feedback: { explanation: { en: "Yes—一 means “one”.", ja: "はい。「一」は「ひとつ」です。" } }
    } : {
      outcome: "lapse",
      score: 0,
      errorTags: ["kanji-recognition-confusion"],
      feedback: {
        explanation: { en: "That is a different character.", ja: "それは別の漢字です。" },
        repairPrompt: { en: "Look for one horizontal line.", ja: "横線が一本の漢字を探してください。" },
        nearbyExample: { en: "一人 means “one person”.", ja: "「一人」は「ひとり」です。" }
      }
    };
  }
  function gradeWriting(assessment, inputMode) {
    return assessment.passed ? {
      outcome: "pass",
      score: assessment.score / 100,
      errorTags: ["kanji-writing-complete", `kanji-writing-${inputMode}`],
      feedback: { explanation: { en: "One clean stroke, left to right.", ja: "左から右へ、きれいな一画です。" } }
    } : {
      outcome: "lapse",
      score: assessment.score / 100,
      errorTags: [assessment.actualStrokes === assessment.expectedStrokes ? "stroke-shape-or-direction" : "stroke-count"],
      feedback: {
        explanation: { en: assessment.message, ja: "画数・形・書く方向をもう一度確認しましょう。" },
        repairPrompt: { en: "Clear the desk, then draw one long line from left to right.", ja: "消してから、左から右へ長い線を一本書いてください。" },
        nearbyExample: { en: "The KanjiVG ghost shows the exact path and direction.", ja: "KanjiVGの見本で、線の形と方向を確認できます。" }
      }
    };
  }
  function openingKanjiReviewSeed(model) {
    return {
      id: "review:kanji-one",
      conceptId: "concept:kanji-one",
      reason: "new-learning",
      content: {
        expression: model.payload.trace.character,
        reading: model.payload.reading,
        meanings: [model.payload.meaning.en]
      }
    };
  }
  function localizedFeedback(evaluation, language) {
    const feedback = evaluation.result.feedback;
    const text2 = language === "ja" ? feedback.explanation.ja : feedback.explanation.en;
    const repair = evaluation.result.outcome === "lapse" ? language === "ja" ? feedback.repairPrompt?.ja : feedback.repairPrompt?.en : "";
    return [text2, repair].filter(Boolean).join(" ");
  }
  function renderArrivalBridge(language, band, onContinue) {
    const { screen, panel, content } = screenFrame({
      language,
      className: "academy-bridge-screen",
      plate: "classroom",
      eyebrow: "bridgeEyebrow",
      title: "bridgeTitle",
      body: "bridgeBody"
    });
    panel.classList.add("academy-panel-with-character");
    const rie = characterImage(language);
    const bandBadge = element("strong", "academy-band-badge");
    bandBadge.textContent = band.toUpperCase();
    const button = copyButton(language, "bridgeContinue", "academy-button academy-button-primary");
    button.addEventListener("click", onContinue);
    content.append(bandBadge, button);
    panel.prepend(rie);
    return screen;
  }
  function renderLessonFork(language, selected, onChoose) {
    const { screen, panel, content } = screenFrame({
      language,
      className: "academy-lesson-fork-screen",
      plate: "classroom",
      eyebrow: "lessonForkEyebrow",
      title: "lessonForkTitle",
      body: "lessonForkBody"
    });
    panel.classList.add("academy-panel-with-character");
    panel.prepend(characterImage(language));
    const choices = element("div", "academy-fork-grid");
    const forks = [
      ["sound", "forkSound", "forkSoundBody"],
      ["text", "forkText", "forkTextBody"],
      ["speaking", "forkSpeaking", "forkSpeakingBody"]
    ];
    forks.forEach(([fork, title, body]) => {
      const button = copyButton(language, title, "academy-route-choice academy-fork-choice");
      button.dataset.fork = fork;
      button.toggleAttribute("aria-pressed", selected === fork);
      button.append(copyElement("span", "academy-route-description", language, body));
      button.addEventListener("click", () => onChoose(fork));
      choices.append(button);
    });
    content.append(choices);
    return screen;
  }
  function renderSourceActivityScreen(language, sourceContent, onEvaluation, onContinue) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-source-screen",
      plate: "classroom",
      eyebrow: "sourceEyebrow",
      title: "sourceTitle",
      body: "sourceBody"
    });
    const activityHost = element("div", "academy-activity-host");
    const completion = element("div", "academy-source-completion");
    const runtime = createActivityRuntime([choiceActivityPlugin]);
    const controller = runtime.mount(sourceContent.activity, {
      replace(view) {
        activityHost.replaceChildren(view);
      },
      announce(message) {
        const live = activityHost.querySelector('[role="status"]');
        if (live) live.setAttribute("aria-label", message);
      }
    }, async (evaluation) => {
      await onEvaluation(evaluation);
      if (evaluation.result.outcome !== "pass") return;
      const note = copyElement("p", "academy-success-note", language, "sourceComplete");
      const next = copyButton(language, "sourceContinue", "academy-button academy-button-primary");
      next.addEventListener("click", onContinue);
      completion.replaceChildren(note, next);
    });
    const source = element("details", "academy-source-record");
    source.append(copyElement("summary", "", language, "sourceRecordSummary"));
    const line = copyElement("p", "", language, "sourceRecordLine");
    const sourceText = element("blockquote", "academy-source-quote");
    void sourceContent.sourceLibrary.getQuestion("source-question:classroom-phrase-09").then((question) => {
      sourceText.textContent = language === "ja" ? question.prompt.ja : `${question.prompt.ja} — ${question.prompt.en}`;
      sourceText.lang = language === "ja" ? "ja" : "";
    });
    source.append(line, sourceText);
    content.append(activityHost, completion, source);
    screen.addEventListener("academy:dispose", () => controller.dispose(), { once: true });
    return screen;
  }
  function renderKanjiDeskScreen(language, trace, onEvaluation, onContinue) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-kanji-desk-screen",
      plate: "writingStudio",
      eyebrow: "kanjiDeskEyebrow",
      title: "kanjiDeskTitle",
      body: "kanjiDeskBody"
    });
    const activityHost = element("div", "academy-activity-host");
    const completion = element("div", "academy-source-completion");
    const runtime = createActivityRuntime([kanjiWritingActivityPlugin]);
    const controller = runtime.mount(createOpeningKanjiActivity(trace, language), {
      replace(view) {
        activityHost.replaceChildren(view);
      },
      announce(message) {
        const live = activityHost.querySelector('[role="status"]');
        if (live) live.setAttribute("aria-label", message);
      }
    }, async (evaluation) => {
      await onEvaluation(evaluation);
      if (!evaluation.result.errorTags.includes("kanji-writing-complete")) return;
      const note = copyElement("p", "academy-success-note", language, "kanjiDeskComplete");
      const next = copyButton(language, "kanjiDeskContinue", "academy-button academy-button-primary");
      next.addEventListener("click", onContinue);
      completion.replaceChildren(note, next);
    });
    content.append(activityHost, completion);
    screen.addEventListener("academy:dispose", () => controller.dispose(), { once: true });
    return screen;
  }
  function renderOpeningMemory(language, onClose) {
    const { screen, panel, content } = screenFrame({
      language,
      className: "academy-memory-screen",
      plate: "classroom",
      title: "memoryTitle",
      body: "memoryBody"
    });
    panel.classList.add("academy-panel-with-character");
    panel.prepend(characterImage(language));
    const line = element("blockquote", "academy-memory-line");
    line.lang = "ja";
    line.textContent = "「こんばんは。ここ、空いていますよ。」";
    const support2 = element("p", "academy-support");
    support2.lang = "en";
    support2.textContent = "“Good evening. This seat is free.”";
    const close = copyButton(language, "memoryReturn", "academy-button academy-button-primary");
    close.addEventListener("click", onClose);
    content.append(line, support2, close);
    return screen;
  }
  function characterImage(language) {
    const image = element("img", "academy-character academy-character-rie");
    image.src = ACADEMY_ASSETS.rie;
    image.alt = language === "ja" ? "りえ先生" : "Rie-sensei";
    return image;
  }
  const ORIENTATION_MOCK_ITEMS = [
    {
      id: "orientation:knowledge:reason",
      skill: "language-knowledge",
      prompt: {
        en: "Choose the form that naturally completes the sentence: 昨日は雨＿＿、出かけませんでした。",
        ja: "自然な文になる形を選んでください：昨日は雨＿＿、出かけませんでした。"
      },
      options: [
        { id: "because", label: { en: "だったので", ja: "だったので" }, correct: true },
        { id: "although", label: { en: "なのに", ja: "なのに" }, correct: false },
        { id: "while", label: { en: "ながら", ja: "ながら" }, correct: false }
      ]
    },
    {
      id: "orientation:reading:change",
      skill: "reading",
      passage: {
        en: "The meeting was going to begin at six, but Alex’s train stopped, so everyone changed it to half past six.",
        ja: "会議は六時に始まる予定でしたが、アレックスさんの電車が止まったので、みんなで六時半に変えました。"
      },
      prompt: { en: "When will the meeting begin?", ja: "会議は何時に始まりますか。" },
      options: [
        { id: "six", label: { en: "6:00", ja: "六時" }, correct: false },
        { id: "six-thirty", label: { en: "6:30", ja: "六時半" }, correct: true },
        { id: "cancelled", label: { en: "It was cancelled", ja: "中止になりました" }, correct: false }
      ]
    },
    {
      id: "orientation:listening:library",
      skill: "listening",
      spokenJapanese: "図書館は七時に閉まります。六時五十分までに本を返してください。",
      prompt: { en: "Listen: when does the library close?", ja: "聞いてください：図書館は何時に閉まりますか。" },
      options: [
        { id: "six-fifty", label: { en: "6:50", ja: "六時五十分" }, correct: false },
        { id: "seven", label: { en: "7:00", ja: "七時" }, correct: true },
        { id: "seven-ten", label: { en: "7:10", ja: "七時十分" }, correct: false }
      ]
    }
  ];
  function scoreOrientationMock(targetBand, responses, confidence) {
    const scoreFor = (skill) => {
      const items = ORIENTATION_MOCK_ITEMS.filter((item) => item.skill === skill);
      const correct2 = items.filter((item) => item.options.some((option) => option.id === responses[item.id] && option.correct)).length;
      return items.length ? correct2 / items.length : 0;
    };
    const scores = {
      "language-knowledge": scoreFor("language-knowledge"),
      reading: scoreFor("reading"),
      listening: scoreFor("listening"),
      "speaking-confidence": clamp(confidence.speaking),
      "writing-confidence": clamp(confidence.writing)
    };
    const receptive = (scores["language-knowledge"] + scores.reading + scores.listening) / 3;
    const retreat = receptive >= 2 / 3 ? 0 : receptive >= 1 / 3 ? 1 : 2;
    return {
      assessmentId: "academy-orientation-mock:v1",
      targetBand,
      itemIds: ORIENTATION_MOCK_ITEMS.map((item) => item.id),
      scores,
      recommendedBand: lowerBand(targetBand, retreat),
      calibration: "vertical-slice"
    };
  }
  function lowerBand(target, steps) {
    const bands = ["n5", "n4", "n3", "n2", "n1"];
    return bands[Math.max(0, bands.indexOf(target) - steps)];
  }
  function clamp(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }
  const STARTS = [
    ["lesson-zero", "startLessonZero", "startLessonZeroBody"],
    ["manual-band", "startManual", "startManualBody"],
    ["placement-mock", "startMock", "startMockBody"]
  ];
  const BANDS = [
    ["n5", "bandN5"],
    ["n4", "bandN4"],
    ["n3", "bandN3"],
    ["n2", "bandN2"],
    ["n1", "bandN1"]
  ];
  function renderStartScreen(language, onChoose) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-start-screen",
      plate: "classroom",
      eyebrow: "startEyebrow",
      title: "startTitle",
      body: "startBody"
    });
    const choices = element("div", "academy-route-choices");
    STARTS.forEach(([route, title, body]) => {
      const button = copyButton(language, title, "academy-route-choice");
      button.dataset.startRoute = route;
      button.append(copyElement("span", "academy-route-description", language, body));
      button.addEventListener("click", () => onChoose(route));
      choices.append(button);
    });
    content.append(choices);
    return screen;
  }
  function renderManualBandScreen(language, onChoose, onBack) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-band-screen",
      plate: "classroom",
      title: "manualTitle",
      body: "manualBody"
    });
    const choices = element("div", "academy-band-choices");
    BANDS.forEach(([band, label]) => {
      const button = copyButton(language, label, "academy-band-choice");
      button.dataset.band = band;
      button.addEventListener("click", () => onChoose(band));
      choices.append(button);
    });
    const back = copyButton(language, "back", "academy-button academy-button-quiet");
    back.addEventListener("click", onBack);
    content.append(choices, back);
    return screen;
  }
  function renderPlacementMockScreen(options) {
    const { screen, content } = screenFrame({
      language: options.language,
      className: "academy-placement-screen",
      plate: "classroom",
      title: "mockTitle",
      body: "mockBody"
    });
    const form = element("form", "academy-form academy-placement-form");
    let playback = null;
    let playbackRequest = 0;
    let disposed = false;
    const target = bandSelect(options.language);
    form.append(target.fieldset);
    ORIENTATION_MOCK_ITEMS.forEach((item) => {
      const fieldset = element("fieldset", "academy-mock-item");
      fieldset.dataset.mockItem = item.id;
      const legend = localizedElement("legend", "academy-mock-prompt", options.language, item.prompt);
      fieldset.append(legend);
      if (item.passage) fieldset.append(localizedElement("p", "academy-mock-passage", options.language, item.passage));
      if (item.spokenJapanese) {
        const play = copyButton(options.language, "mockPlayAudio", "academy-button academy-button-secondary");
        const audioError = element("span", "academy-field-error");
        play.addEventListener("click", () => {
          const request2 = ++playbackRequest;
          playback?.dispose();
          playback = null;
          audioError.textContent = "";
          play.disabled = true;
          void options.pronunciation.play(item.spokenJapanese).then((active) => {
            if (disposed || request2 !== playbackRequest) {
              active.dispose();
              return;
            }
            playback = active;
          }).catch(() => {
            if (!disposed && request2 === playbackRequest) {
              audioError.textContent = academyText(options.language, "mockAudioUnavailable");
            }
          }).finally(() => {
            if (!disposed && request2 === playbackRequest) play.disabled = false;
          });
        });
        fieldset.append(play, audioError);
      }
      const choices = element("div", "academy-mock-options");
      item.options.forEach((option) => {
        const label = element("label", "academy-mock-option");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = item.id;
        input.value = option.id;
        input.required = true;
        label.append(input, localizedElement("span", "academy-mock-option-copy", options.language, option.label));
        choices.append(label);
      });
      fieldset.append(choices);
      form.append(fieldset);
    });
    const confidence = element("div", "academy-confidence-grid");
    const speaking = confidenceSelect(options.language, "mockSpeakingConfidence", "speaking");
    const writing = confidenceSelect(options.language, "mockWritingConfidence", "writing");
    confidence.append(speaking.label, writing.label);
    const feedback = element("div", "academy-form-feedback");
    const submit = copyButton(options.language, "mockSubmit", "academy-button academy-button-primary");
    submit.type = "submit";
    const back = copyButton(options.language, "back", "academy-button academy-button-quiet");
    back.addEventListener("click", options.onBack);
    form.append(confidence, feedback, submit, back);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) {
        feedback.replaceChildren(fieldError(academyText(options.language, "mockIncomplete")));
        return;
      }
      const values = new FormData(form);
      const responses = Object.fromEntries(ORIENTATION_MOCK_ITEMS.map((item) => [item.id, String(values.get(item.id) ?? "")]));
      options.onResult(scoreOrientationMock(
        target.select.value,
        responses,
        { speaking: Number(speaking.select.value), writing: Number(writing.select.value) }
      ));
    });
    content.append(form);
    screen.addEventListener("academy:dispose", () => {
      disposed = true;
      playbackRequest += 1;
      playback?.dispose();
    }, { once: true });
    return screen;
  }
  function renderPlacementResultScreen(options) {
    const { screen, content } = screenFrame({
      language: options.language,
      className: "academy-placement-result-screen",
      plate: "classroom",
      title: "mockResultTitle",
      body: "mockBody"
    });
    const scores = element("dl", "academy-score-grid");
    const rows = [
      ["mockKnowledge", options.result.scores["language-knowledge"]],
      ["mockReading", options.result.scores.reading],
      ["mockListening", options.result.scores.listening],
      ["mockProduction", (options.result.scores["speaking-confidence"] + options.result.scores["writing-confidence"]) / 2]
    ];
    rows.forEach(([key, value]) => {
      scores.append(copyElement("dt", "", options.language, key), scoreBar(value, options.language));
    });
    const recommendation = element("div", "academy-recommendation");
    recommendation.append(
      copyElement("span", "academy-eyebrow", options.language, "mockRecommendation"),
      element("strong", "academy-recommendation-band")
    );
    const band = recommendation.querySelector("strong");
    if (band) band.textContent = options.result.recommendedBand.toUpperCase();
    const accept = copyButton(options.language, "mockUseRecommendation", "academy-button academy-button-primary");
    accept.addEventListener("click", options.onAccept);
    const choose = copyButton(options.language, "mockChooseMyself", "academy-button academy-button-secondary");
    choose.addEventListener("click", options.onChoose);
    content.append(scores, recommendation, accept, choose);
    return screen;
  }
  function bandSelect(language) {
    const fieldset = element("fieldset", "academy-target-band");
    fieldset.append(copyElement("legend", "academy-label", language, "mockTargetLegend"));
    const select = element("select", "academy-input");
    BANDS.forEach(([value, key]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = academyText(language, key);
      if (value === "n4") option.selected = true;
      select.append(option);
    });
    fieldset.append(select);
    return { fieldset, select };
  }
  function confidenceSelect(language, key, name) {
    const label = copyElement("label", "academy-label", language, key);
    const select = element("select", "academy-input");
    select.name = name;
    for (let index = 0; index <= 4; index += 1) {
      const option = document.createElement("option");
      option.value = String(index / 4);
      option.textContent = `${index} / 4`;
      if (index === 2) option.selected = true;
      select.append(option);
    }
    label.append(select);
    return { label, select };
  }
  function scoreBar(value, language) {
    const row = element("dd", "academy-score");
    const meter = element("span", "academy-score-meter");
    meter.style.setProperty("--academy-score", String(value));
    const copy = element("span", "academy-score-value");
    copy.textContent = new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 }).format(value);
    row.append(meter, copy);
    return row;
  }
  const PORTRAITS = [
    ["quality-2", "portraitCamera"],
    ["quality-3", "portraitPlanner"],
    ["quality-4", "portraitCards"],
    ["quality-5", "portraitNotebook"]
  ];
  function renderProfileScreen(options) {
    const { screen, panel, content } = screenFrame({
      language: options.language,
      className: "academy-profile-screen",
      plate: "classroom",
      title: "academyName"
    });
    panel.classList.add("academy-panel-with-character");
    const rie = element("img", "academy-character academy-character-rie");
    rie.src = ACADEMY_ASSETS.rie;
    rie.alt = options.language === "ja" ? "りえ先生" : "Rie-sensei";
    panel.prepend(rie);
    const greeting = copyElement("p", "academy-rie-greeting", options.language, "rieGreeting");
    greeting.lang = "ja";
    delete greeting.dataset.jpdbReaderSurfaceIgnore;
    greeting.dataset.yomuRuntimeSurface = "opening-greeting";
    const greetingSupport = copyElement("p", "academy-rie-greeting-support", options.language, "rieGreetingSupport");
    const note = copyElement("p", "academy-fiction-note", options.language, "fictionNote");
    const form = element("form", "academy-form academy-profile-form");
    form.id = "academy-profile-form";
    const nameLabel = copyElement("label", "academy-label", options.language, "profileNameLabel");
    const name = element("input", "academy-input");
    name.name = "displayName";
    name.required = true;
    name.maxLength = 60;
    name.autocomplete = "name";
    name.placeholder = academyText(options.language, "profileNamePlaceholder");
    name.value = options.profile?.displayName ?? "";
    nameLabel.append(name);
    const reasonLabel = copyElement("label", "academy-label", options.language, "profileReasonLabel");
    const reason = element("textarea", "academy-input academy-textarea");
    reason.name = "learningReason";
    reason.required = true;
    reason.maxLength = 500;
    reason.placeholder = academyText(options.language, "profileReasonPlaceholder");
    reason.value = options.profile?.learningReason ?? "";
    reasonLabel.append(reason);
    const portraits = element("fieldset", "academy-portrait-fieldset");
    const legend = copyElement("legend", "academy-label", options.language, "profilePortraitLegend");
    portraits.append(legend);
    const grid = element("div", "academy-portrait-grid");
    PORTRAITS.forEach(([id, labelKey], index) => {
      const label = element("label", "academy-portrait-option");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "portrait";
      input.value = id;
      input.required = true;
      input.checked = options.profile?.portraitId === id || !options.profile && index === 0;
      const image = element("img", "academy-portrait-image");
      image.src = ACADEMY_ASSETS.portraits[id];
      image.alt = academyText(options.language, labelKey);
      const caption = copyElement("span", "academy-portrait-caption", options.language, labelKey);
      label.append(input, image, caption);
      grid.append(label);
    });
    portraits.append(grid);
    const submit = copyButton(options.language, "profileSubmit", "academy-button academy-button-primary");
    submit.type = "submit";
    submit.setAttribute("form", form.id);
    const actions = element("div", "academy-profile-actions");
    actions.append(submit);
    form.append(nameLabel, reasonLabel, portraits);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const selected = new FormData(form).get("portrait");
      if (!selected) return;
      submit.disabled = true;
      void Promise.resolve(options.onSubmit({
        displayName: name.value.trim(),
        learningReason: reason.value.trim(),
        portraitId: selected
      })).catch(() => {
        submit.disabled = false;
      });
    });
    content.replaceChildren(greeting, greetingSupport, note, form);
    panel.append(actions);
    return screen;
  }
  function createEnrollmentFlow(options) {
    return new EnrollmentFlow(options);
  }
  class EnrollmentFlow {
    constructor(options) {
      this.options = options;
    }
    async render(route, context) {
      switch (route) {
        case "access":
          context.shell.replace(renderAccessScreen({
            language: context.language,
            onSubmit: (code) => this.openSession(code, context)
          }));
          return true;
        case "profile":
          context.shell.replace(renderProfileScreen({
            language: context.language,
            profile: context.projection.profile,
            onSubmit: (profile) => this.saveProfile(profile, context)
          }));
          return true;
        case "rie-unlock":
          context.shell.replace(renderRieUnlockScreen(context.language, () => void context.go("start")));
          return true;
        case "start":
          context.shell.replace(renderStartScreen(context.language, (choice) => void this.chooseStart(choice, context)));
          return true;
        case "manual-band":
          context.shell.replace(renderManualBandScreen(
            context.language,
            (band) => void this.chooseBand(band, context),
            () => void context.go("start", { placementOverride: false })
          ));
          return true;
        case "placement-mock":
          context.shell.replace(renderPlacementMockScreen({
            language: context.language,
            pronunciation: this.options.pronunciation,
            onResult: (result) => void this.savePlacement(result, context),
            onBack: () => void context.go("start")
          }));
          return true;
        case "placement-result":
          this.renderPlacementResult(context);
          return true;
        case "arrival-bridge":
          context.shell.replace(renderArrivalBridge(
            context.language,
            requiredBand(context),
            () => void context.go("band-entry")
          ));
          return true;
        case "band-entry":
          this.renderBandEntry(context);
          return true;
        default:
          return false;
      }
    }
    async openSession(code, context) {
      const session = await this.options.access.exchange(code);
      await context.go(context.projection.profile ? "start" : "profile", { session });
    }
    async saveProfile(profile, context) {
      const { firstIntroduction } = await this.options.evidence.saveProfile(profile);
      await context.go(firstIntroduction ? "rie-unlock" : "start");
    }
    async chooseStart(route, context) {
      if (route === "manual-band") return context.go("manual-band", { placementOverride: false });
      if (route === "placement-mock") return context.go("placement-mock", { placementOverride: false });
      await this.options.evidence.chooseCurriculumEntry({ route: "lesson-zero" });
      await context.go("lesson-fork", { selectedBand: void 0 });
    }
    async chooseBand(band, context) {
      const fromPlacement = context.checkpoint.placementOverride === true;
      await this.options.evidence.chooseCurriculumEntry({
        route: fromPlacement ? "placement-mock" : "manual-band",
        band,
        ...fromPlacement ? { recommendationAccepted: false } : {}
      });
      await context.go("arrival-bridge", { selectedBand: band, placementOverride: false });
    }
    async savePlacement(result, context) {
      await this.options.evidence.savePlacement(result);
      await context.go("placement-result", { selectedBand: result.recommendedBand });
    }
    renderPlacementResult(context) {
      const placement = context.projection.latestPlacement;
      if (!placement) {
        void context.go("placement-mock");
        return;
      }
      const result = {
        assessmentId: "academy-orientation-mock:v1",
        targetBand: placement.targetBand,
        itemIds: placement.itemIds,
        scores: placement.scores,
        recommendedBand: placement.recommendedBand,
        calibration: "vertical-slice"
      };
      context.shell.replace(renderPlacementResultScreen({
        language: context.language,
        result,
        onAccept: () => void this.acceptPlacement(result, context),
        onChoose: () => void context.go("manual-band", { placementOverride: true })
      }));
    }
    async acceptPlacement(result, context) {
      await this.options.evidence.chooseCurriculumEntry({
        route: "placement-mock",
        band: result.recommendedBand,
        recommendationAccepted: true
      });
      await context.go("arrival-bridge", { selectedBand: result.recommendedBand, placementOverride: false });
    }
    renderBandEntry(context) {
      const band = requiredBand(context);
      context.shell.replace(renderBandEntryScreen({
        language: context.language,
        band,
        activity: createBandEntryActivity(band),
        completed: context.projection.completedScenes.includes(bandEntrySceneId(band)),
        onEvaluation: (evaluation) => this.recordBandEntryActivity(band, evaluation),
        onContinue: () => void context.go("campus")
      }));
    }
    recordBandEntryActivity(band, evaluation) {
      return this.options.evidence.recordActivity(evaluation, {
        id: `band-entry:${band}`,
        sceneId: bandEntrySceneId(band)
      });
    }
  }
  function requiredBand(context) {
    const band = context.checkpoint.selectedBand;
    if (!band) throw new Error("Arrival bridge requires a selected JLPT band.");
    return band;
  }
  function renderLoadingScreen(language, online) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-loading-screen",
      plate: "entrance",
      title: "loading"
    });
    content.append(copyElement("p", "academy-lede", language, online ? "onlineNow" : "offlineNow"));
    return screen;
  }
  const LOCATIONS = [
    ["classroom", "locationClassroom", "locationClassroomBody"],
    ["library", "locationLibrary", "locationLibraryBody"],
    ["lab", "locationLab", "locationLabBody"],
    ["cafe", "locationCafe", "locationCafeBody"]
  ];
  function renderCampusScreen(language, reviewComplete, onEnter) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-campus-screen",
      plate: "entrance",
      title: "campusTitle"
    });
    content.append(copyElement("p", "academy-objective", language, reviewComplete ? "campusObjectiveComplete" : "campusObjective"));
    const map = element("div", "academy-place-map");
    LOCATIONS.forEach(([location2, title, body]) => {
      const locked = !reviewComplete && (location2 === "lab" || location2 === "cafe");
      const button = copyButton(language, title, `academy-location academy-location-${location2}`);
      button.dataset.location = location2;
      button.disabled = locked;
      button.append(copyElement("span", "academy-location-purpose", language, locked ? "locationUnavailable" : body));
      button.addEventListener("click", () => onEnter(location2));
      map.append(button);
    });
    content.append(map);
    return screen;
  }
  function renderLocationScreen(language, location2, onBack) {
    const definition = LOCATIONS.find(([id]) => id === location2);
    if (!definition) throw new Error(`Unknown campus location: ${location2}`);
    const [, title, body] = definition;
    const plate = location2 === "cafe" ? "cafe" : "classroom";
    const { screen, content } = screenFrame({ language, className: `academy-location-screen academy-${location2}-screen`, plate, title, body });
    const back = copyButton(language, "locationReturn", "academy-button academy-button-primary");
    back.addEventListener("click", onBack);
    content.append(back);
    return screen;
  }
  const LAB_LINE = "もう一度お願いします。";
  function renderLanguageLabScreen(language, pronunciation, state, onEvaluation, onShadowed, onBack) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-location-screen academy-lab-screen",
      plate: "languageLab",
      eyebrow: "labEyebrow",
      title: "labTitle",
      body: "labBody"
    });
    const audioRow = element("div", "academy-lab-audio");
    const play = copyButton(language, "labPlay", "academy-button academy-button-secondary");
    const timecode = copyElement("span", "academy-lab-timecode", language, "labTimecode");
    const audioStatus = element("span", "academy-field-error");
    audioStatus.setAttribute("role", "status");
    audioRow.append(play, timecode, audioStatus);
    const activityHost = element("div", "academy-activity-host");
    const transcript = element("section", "academy-lab-transcript");
    transcript.append(copyElement("h2", "", language, "labTranscriptTitle"));
    const transcriptLine = element("p");
    transcriptLine.lang = "ja";
    transcriptLine.dataset.yomuRuntimeSurface = "listening-transcript";
    transcriptLine.dataset.yomuFuriganaMode = "all";
    transcriptLine.textContent = LAB_LINE;
    transcript.append(transcriptLine);
    const shadow = element("section", "academy-lab-shadow");
    shadow.append(copyElement("h2", "", language, "labShadowTitle"), copyElement("p", "", language, "labShadowPrompt"));
    const shadowDone = copyButton(language, "labShadowDone", "academy-button academy-button-primary");
    const shadowStatus = element("p", "academy-success-note");
    shadowDone.disabled = state.shadowed;
    if (state.shadowed) shadowStatus.textContent = language === "ja" ? "シャドーイングを記録しました。" : "Shadowing evidence recorded.";
    shadowDone.addEventListener("click", () => {
      shadowDone.disabled = true;
      void Promise.resolve(onShadowed()).then(() => {
        shadowStatus.textContent = language === "ja" ? "シャドーイングを記録しました。" : "Shadowing evidence recorded.";
      });
    });
    shadow.append(shadowDone, shadowStatus);
    const back = copyButton(language, "locationReturn", "academy-button academy-button-quiet");
    back.addEventListener("click", onBack);
    content.append(audioRow);
    if (state.transcriptRevealed) content.append(transcript);
    content.append(activityHost);
    if (state.listeningPassed) content.append(shadow);
    content.append(back);
    let playback = null;
    let playbackRequest = 0;
    let disposed = false;
    play.addEventListener("click", () => {
      const request2 = ++playbackRequest;
      playback?.dispose();
      playback = null;
      play.disabled = true;
      audioStatus.textContent = "";
      void pronunciation.play(LAB_LINE).then((active) => {
        if (disposed || request2 !== playbackRequest) {
          active.dispose();
          return;
        }
        playback = active;
      }).catch(() => {
        if (!disposed && request2 === playbackRequest) {
          audioStatus.textContent = language === "ja" ? "このブラウザでは日本語音声を再生できません。" : "Japanese browser speech is unavailable.";
        }
      }).finally(() => {
        if (!disposed && request2 === playbackRequest) play.disabled = false;
      });
    });
    const runtime = createActivityRuntime([choiceActivityPlugin]);
    const controller = state.listeningPassed ? null : runtime.mount(languageLabActivity(), {
      replace(view) {
        activityHost.replaceChildren(view);
      },
      announce(message) {
        audioStatus.setAttribute("aria-label", message);
      }
    }, onEvaluation);
    if (state.listeningPassed) activityHost.append(copyElement("p", "academy-success-note", language, "labListeningComplete"));
    screen.addEventListener("academy:dispose", () => {
      disposed = true;
      playbackRequest += 1;
      playback?.dispose();
      controller?.dispose();
    }, { once: true });
    return screen;
  }
  function languageLabActivity() {
    return {
      id: "activity:language-lab-repeat-listening",
      kind: "choice",
      sourceQuestionId: "source-question:classroom-phrase-09",
      conceptIds: ["concept:classroom-repair-repeat"],
      responseKind: "choice",
      prompt: {
        en: "Listen before opening the transcript. What does the line ask for?",
        ja: "答える前に音声を聞いてください。何をお願いしていますか。"
      },
      payload: {
        reviewSeedId: "review:language-lab-repeat",
        reviewContent: {
          expression: LAB_LINE,
          reading: "もういちどおねがいします",
          meanings: ["Please say it again."]
        },
        options: [
          {
            id: "repeat",
            label: { en: "Please say it again.", ja: "もう一度言ってください。" },
            correct: true,
            explanation: { en: "Correct: もう一度 asks for one more repetition.", ja: "正解です。「もう一度」は、もう一回繰り返すよう頼みます。" }
          },
          {
            id: "write",
            label: { en: "Please write it.", ja: "書いてください。" },
            correct: false,
            errorTag: "listening-action-confusion",
            explanation: { en: "No writing action appears in the line.", ja: "この文には「書く」という動作はありません。" },
            repairPrompt: { en: "Listen for もう一度: “one more time”.", ja: "「もう一度」（one more time）を聞き取ってください。" },
            nearbyExample: { en: "もう一度言ってください also asks someone to say it again.", ja: "「もう一度言ってください」も、繰り返しを頼む表現です。" }
          },
          {
            id: "wait",
            label: { en: "Please wait.", ja: "待ってください。" },
            correct: false,
            errorTag: "listening-action-confusion",
            explanation: { en: "The line asks for repetition, not waiting.", ja: "待つのではなく、繰り返しを頼んでいます。" },
            repairPrompt: { en: "Listen for もう一度: “one more time”.", ja: "「もう一度」（one more time）を聞き取ってください。" },
            nearbyExample: { en: "ちょっと待ってください means “Please wait a moment.”", ja: "「ちょっと待ってください」は「少し待ってください」という意味です。" }
          }
        ]
      }
    };
  }
  function renderReviewScreen(language, items, onRate, onReturn) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-review-screen",
      plate: "library",
      title: "reviewTitle"
    });
    const cardHost = element("div", "academy-review-host");
    let index = 0;
    const show = () => {
      const item = items[index];
      if (!item) {
        const empty = copyElement("p", "academy-lede", language, items.length ? "reviewComplete" : "reviewEmpty");
        const back = copyButton(language, "reviewReturn", "academy-button academy-button-primary");
        back.addEventListener("click", onReturn);
        cardHost.replaceChildren(empty, back);
        return;
      }
      const prompt = copyElement("p", "academy-eyebrow", language, "reviewPrompt");
      const expression = element("p", "academy-review-expression");
      expression.lang = "ja";
      expression.textContent = item.expression;
      const answer = element("div", "academy-review-answer");
      answer.hidden = true;
      const reading = element("p", "academy-review-reading");
      reading.lang = "ja";
      reading.textContent = item.reading ?? item.expression;
      const meaning = element("p", "academy-review-meaning");
      meaning.textContent = item.meaning ?? "";
      const ratings = element("div", "academy-review-ratings");
      [["again", "reviewAgain"], ["hard", "reviewHard"], ["good", "reviewGood"], ["easy", "reviewEasy"]].forEach(([rating, key]) => {
        const button = copyButton(language, key, "academy-rating-button");
        button.dataset.rating = rating;
        button.addEventListener("click", () => {
          ratings.querySelectorAll("button").forEach((candidate) => {
            candidate.disabled = true;
          });
          void onRate(item, rating).then(() => {
            index += 1;
            show();
          });
        });
        ratings.append(button);
      });
      answer.append(reading, meaning, ratings);
      const reveal = copyButton(language, "reviewReveal", "academy-button academy-button-secondary");
      reveal.addEventListener("click", () => {
        answer.hidden = false;
        reveal.remove();
      });
      cardHost.replaceChildren(prompt, expression, reveal, answer);
    };
    show();
    content.append(cardHost);
    return screen;
  }
  function renderJournalScreen(language, profile, state, callbacks) {
    const { screen, content } = screenFrame({
      language,
      className: "academy-journal-screen",
      plate: "classroom",
      title: "journalTitle"
    });
    const profileCard = element("article", "academy-journal-profile academy-player-profile");
    const portrait = element("img", "academy-journal-portrait");
    portrait.src = ACADEMY_ASSETS.portraits[profile.portraitId] ?? ACADEMY_ASSETS.portraits["quality-2"];
    portrait.alt = profile.displayName;
    const profileCopy = element("div", "academy-journal-copy");
    const name = element("h2");
    name.textContent = profile.displayName;
    const reasonLabel = copyElement("span", "academy-eyebrow", language, "journalReason");
    const reason = element("p");
    reason.textContent = profile.learningReason;
    profileCopy.append(name, reasonLabel, reason);
    profileCard.append(portrait, profileCopy);
    const rieCard = element("article", "academy-journal-profile");
    const rie = element("img", "academy-journal-portrait");
    rie.src = ACADEMY_ASSETS.rie;
    rie.alt = language === "ja" ? "りえ先生" : "Rie-sensei";
    const rieCopy = element("div", "academy-journal-copy");
    rieCopy.append(
      copyElement("h2", "", language, "journalRie"),
      bondStars(language, state.rieBond),
      copyElement("blockquote", "", language, "journalRieLine")
    );
    const replay = copyButton(language, "journalReplay", "academy-button academy-button-secondary");
    replay.addEventListener("click", callbacks.onReplayRie);
    rieCopy.append(replay);
    rieCard.append(rie, rieCopy);
    content.append(profileCard, rieCard);
    if (state.aakashUnlocked) {
      const aakashCard = element("article", "academy-journal-profile academy-journal-aakash");
      aakashCard.dataset.character = "aakash";
      const aakash = element("img", "academy-journal-portrait academy-journal-event-portrait");
      aakash.src = ACADEMY_ASSETS.events.rainyDirections;
      aakash.alt = language === "ja" ? "アーカーシュ" : "Aakash";
      const aakashCopy = element("div", "academy-journal-copy");
      aakashCopy.append(
        copyElement("h2", "", language, "journalAakash"),
        bondStars(language, state.aakashBond),
        copyElement("blockquote", "", language, "journalAakashLine")
      );
      const replayAakash = copyButton(language, "journalReplayAakash", "academy-button academy-button-secondary");
      replayAakash.addEventListener("click", callbacks.onReplayAakash);
      aakashCopy.append(replayAakash);
      aakashCard.append(aakash, aakashCopy);
      content.append(aakashCard);
    } else {
      content.append(copyElement("p", "academy-journal-locked", language, "journalLocked"));
    }
    return screen;
  }
  function bondStars(language, bond) {
    const value = element("p", "academy-bond-stars");
    const rank = Math.max(0, Math.min(3, Math.trunc(bond)));
    value.textContent = `${language === "ja" ? "絆" : "Bond"} ${"★".repeat(rank)}${"☆".repeat(3 - rank)}`;
    value.dataset.jpdbReaderSurfaceIgnore = "";
    return value;
  }
  function createWorldFlow(options) {
    return new WorldFlow(options);
  }
  class WorldFlow {
    constructor(options) {
      this.options = options;
    }
    async render(route, context) {
      switch (route) {
        case "campus":
          context.shell.replace(renderCampusScreen(
            context.language,
            Object.keys(context.projection.reviewRatings).length > 0,
            (location2) => void this.enterLocation(location2, context)
          ));
          return true;
        case "lab":
          this.renderLanguageLab(context);
          return true;
        case "review":
          await this.renderReview(context);
          return true;
        case "journal":
          await this.renderJournal(context);
          return true;
        default:
          return false;
      }
    }
    async enterLocation(location2, context) {
      if (location2 === "library") return context.go("review");
      if (location2 === "classroom") {
        return context.projection.curriculumEntry?.band ? context.go("band-entry", { selectedBand: context.projection.curriculumEntry.band }) : context.go("source-activity");
      }
      if (location2 === "lab") return context.go("lab");
      await this.options.audio.setTheme("cafe.social");
      context.shell.setNavigation(true, "campus");
      context.shell.replace(renderLocationScreen(context.language, location2, () => void context.go("campus")));
    }
    renderLanguageLab(context) {
      const listening = context.projection.activities["activity:language-lab-repeat-listening"];
      const shadowing = context.projection.activities["activity:language-lab-repeat-shadowing"];
      context.shell.replace(renderLanguageLabScreen(
        context.language,
        this.options.pronunciation,
        {
          transcriptRevealed: Boolean(listening?.attemptCount),
          listeningPassed: context.projection.completedScenes.includes("scene:language-lab-repeat-listening"),
          shadowed: shadowing?.lastOutcome === "pass"
        },
        (evaluation) => this.recordLabEvaluation(evaluation, context),
        () => this.recordShadowing(context),
        () => void context.go("campus")
      ));
    }
    async recordLabEvaluation(evaluation, context) {
      await this.options.evidence.recordActivity(evaluation, {
        id: "language-lab-repeat-listening",
        sceneId: "scene:language-lab-repeat-listening"
      });
      await context.go("lab");
    }
    async recordShadowing(context) {
      await this.options.evidence.recordShadowing();
      await context.go("lab");
    }
    async renderReview(context) {
      context.shell.replace(renderLoadingScreen(context.language, navigator.onLine));
      const items = await this.options.evidence.dueReviews(10);
      context.shell.replace(renderReviewScreen(
        context.language,
        items,
        (item, rating) => this.rateReview(item.id, rating),
        () => void this.refreshAndGo(context, "campus")
      ));
    }
    rateReview(itemId, rating) {
      return this.options.evidence.rateReview(itemId, rating);
    }
    async renderJournal(context) {
      const profile = context.projection.profile;
      if (!profile) {
        await context.go("profile");
        return;
      }
      context.shell.replace(renderJournalScreen(
        context.language,
        profile,
        {
          rieBond: context.projection.bonds.rie ?? 0,
          aakashBond: context.projection.bonds.aakash ?? 0,
          aakashUnlocked: context.projection.unlockedAssets.includes("character:aakash")
        },
        {
          onReplayRie: () => this.replayOpening(context),
          onReplayAakash: () => this.replayAakash(context)
        }
      ));
    }
    replayOpening(context) {
      context.shell.setNavigation(false);
      context.shell.replace(renderOpeningMemory(context.language, () => void context.go("journal")));
    }
    replayAakash(context) {
      context.shell.setNavigation(false);
      context.shell.replace(renderAakashMemory(context.language, () => void context.go("journal")));
    }
    async refreshAndGo(context, route) {
      await this.options.evidence.refresh();
      await context.go(route);
    }
  }
  function createAcademyShell(host2, options) {
    const lifecycle = new AbortController();
    const root = element("div", "academy-root");
    const header = element("header", "academy-header");
    const brand = element("span", "academy-brand");
    const network = element("span", "academy-network-state");
    const actions = element("div", "academy-header-actions");
    const languageButton = copyButton(options.language, "languageToggle", "academy-chrome-button");
    const audioButton = copyButton(options.language, "navAudioOn", "academy-chrome-button");
    actions.append(network, audioButton, languageButton);
    header.append(brand, actions);
    const screen = element("main", "academy-screen-host");
    screen.id = "academy-screen";
    screen.tabIndex = -1;
    const navigation = element("nav", "academy-navigation");
    navigation.setAttribute("aria-label", "Academy");
    const navButtons = /* @__PURE__ */ new Map();
    [["campus", "navCampus"], ["review", "navReview"], ["journal", "navJournal"]].forEach(([route, key]) => {
      const button = copyButton(options.language, key, "academy-nav-button");
      button.dataset.route = route;
      button.addEventListener("click", () => options.onNavigate(route), { signal: lifecycle.signal });
      navigation.append(button);
      navButtons.set(route, button);
    });
    const live = element("div", "academy-sr-only");
    live.setAttribute("aria-live", "polite");
    root.append(header, screen, navigation, live);
    host2.replaceChildren(root);
    let language = options.language;
    let muted = false;
    let online = navigator.onLine;
    const refreshCopy = () => {
      brand.textContent = academyText(language, "academyName");
      brand.lang = "ja";
      languageButton.textContent = academyText(language, "languageToggle");
      audioButton.textContent = academyText(language, muted ? "navAudioMuted" : "navAudioOn");
      network.textContent = academyText(language, online ? "onlineNow" : "offlineNow");
      [["campus", "navCampus"], ["review", "navReview"], ["journal", "navJournal"]].forEach(([route, key]) => {
        const button = navButtons.get(route);
        if (button) button.textContent = academyText(language, key);
      });
    };
    languageButton.addEventListener("click", options.onLanguage, { signal: lifecycle.signal });
    audioButton.addEventListener("click", options.onMute, { signal: lifecycle.signal });
    refreshCopy();
    return {
      screen,
      replace(view) {
        Array.from(screen.children).forEach((child) => child.dispatchEvent(new CustomEvent("academy:dispose")));
        screen.replaceChildren(view);
        requestAnimationFrame(() => screen.focus({ preventScroll: true }));
      },
      setLanguage(next) {
        language = next;
        refreshCopy();
      },
      setNavigation(visible, active) {
        navigation.hidden = !visible;
        navButtons.forEach((button, route) => {
          if (route === active) button.setAttribute("aria-current", "page");
          else button.removeAttribute("aria-current");
        });
      },
      setNetwork(next) {
        online = next;
        refreshCopy();
      },
      setMuted(next) {
        muted = next;
        refreshCopy();
      },
      announce(message) {
        live.textContent = "";
        requestAnimationFrame(() => {
          live.textContent = message;
        });
      },
      dispose() {
        lifecycle.abort();
        root.remove();
      }
    };
  }
  const LANGUAGE_KEY = "yomu:academy:language:v1";
  class AcademyApp {
    access;
    suppliedPersistence;
    review;
    kanjiWriting;
    pronunciation;
    databaseName;
    audio;
    lifecycle = new AbortController();
    language = loadLanguage();
    shell;
    persistence;
    evidence;
    enrollment;
    world;
    checkpoint = { schemaVersion: 1, route: "access", updatedAt: Date.now() };
    get projection() {
      return this.evidence.projection;
    }
    constructor(host2, options = {}) {
      this.access = options.access ?? createAccessGateway();
      this.suppliedPersistence = options.persistence;
      this.review = options.review ?? createYomuLocalReviewService();
      this.kanjiWriting = options.kanjiWriting ?? createCanonicalKanjiWritingService();
      this.databaseName = options.databaseName;
      this.audio = new AudioDirector({
        catalog: SILENT_AUDIO_CATALOG,
        music: new BrowserMediaBus(),
        ambience: new BrowserMediaBus(),
        lesson: new BrowserMediaBus(),
        sfx: new SilentSfxPlayback(),
        storage: safeLocalStorage(),
        releaseMode: true
      });
      this.pronunciation = options.pronunciation ?? new BrowserSpeechPronunciationService(this.audio);
      this.shell = createAcademyShell(host2, {
        language: this.language,
        onLanguage: () => this.toggleLanguage(),
        onMute: () => this.toggleMuted(),
        onNavigate: (route) => void this.go(route)
      });
      this.shell.setNavigation(false);
      this.shell.setMuted(this.audio.settings.muted);
    }
    async start() {
      this.shell.replace(renderLoadingScreen(this.language, navigator.onLine));
      this.persistence = this.suppliedPersistence ?? await openAcademyPersistence(indexedDB, this.databaseName).catch(() => createMemoryAcademyPersistence());
      this.evidence = createLearnerEvidence(this.persistence.events, this.review);
      await this.evidence.initialize();
      this.enrollment = createEnrollmentFlow({
        access: this.access,
        evidence: this.evidence,
        pronunciation: this.pronunciation
      });
      this.world = createWorldFlow({
        evidence: this.evidence,
        pronunciation: this.pronunciation,
        audio: this.audio
      });
      this.checkpoint = await this.persistence.checkpoint.load() ?? this.checkpoint;
      this.normalizeResumeRoute();
      this.bindLifecycle();
      await this.render();
    }
    dispose() {
      this.lifecycle.abort();
      this.audio.dispose();
      this.persistence?.close();
      this.shell.dispose();
    }
    bindLifecycle() {
      const unlock = () => {
        void this.audio.unlock();
      };
      window.addEventListener("pointerdown", unlock, { once: true, capture: true, signal: this.lifecycle.signal });
      window.addEventListener("keydown", unlock, { once: true, capture: true, signal: this.lifecycle.signal });
      window.addEventListener("online", () => this.shell.setNetwork(true), { signal: this.lifecycle.signal });
      window.addEventListener("offline", () => this.shell.setNetwork(false), { signal: this.lifecycle.signal });
      document.addEventListener("visibilitychange", () => void this.audio.handleVisibility(document.hidden), { signal: this.lifecycle.signal });
      this.shell.setNetwork(navigator.onLine);
    }
    normalizeResumeRoute() {
      this.checkpoint = normalizeResumeCheckpoint(this.checkpoint, this.projection, Date.now(), navigator.onLine);
    }
    async render() {
      const route = this.checkpoint.route;
      await this.audio.setTheme(themeForRoute(route));
      const navigation = navigationForRoute(route);
      this.shell.setNavigation(Boolean(navigation), navigation);
      const context = {
        language: this.language,
        checkpoint: this.checkpoint,
        projection: this.projection,
        shell: this.shell,
        go: (next, update) => this.go(next, update)
      };
      if (await this.enrollment.render(route, context)) return;
      if (await this.world.render(route, context)) return;
      switch (route) {
        case "lesson-fork":
          this.shell.replace(renderLessonFork(this.language, this.checkpoint.selectedFork, (fork) => void this.go("source-activity", { selectedFork: fork })));
          break;
        case "source-activity":
          await this.renderSourceActivity();
          break;
        case "aakash-meet":
          this.renderAakashMeet();
          break;
        case "writing-practice":
          await this.renderWritingPractice();
          break;
      }
    }
    async renderSourceActivity() {
      this.shell.replace(renderLoadingScreen(this.language, navigator.onLine));
      const content = await loadVerticalSliceContent();
      this.shell.replace(renderSourceActivityScreen(
        this.language,
        content,
        (evaluation) => this.recordSourceActivity(evaluation),
        () => void this.go("aakash-meet")
      ));
    }
    async recordSourceActivity(evaluation) {
      await this.evidence.recordActivity(evaluation, {
        id: "lesson-zero-first-repair",
        sceneId: "scene:lesson-zero-first-repair"
      });
    }
    renderAakashMeet() {
      this.shell.replace(renderAakashMeetScreen({
        language: this.language,
        activity: createAakashDirectionsActivity(),
        completed: this.projection.completedScenes.includes(AAKASH_RAINY_DIRECTIONS_SCENE_ID),
        onEvaluation: (evaluation) => this.recordAakashActivity(evaluation),
        onContinue: () => void this.go("writing-practice")
      }));
    }
    async recordAakashActivity(evaluation) {
      await this.evidence.recordActivity(evaluation, {
        id: "aakash-rainy-directions",
        sceneId: AAKASH_RAINY_DIRECTIONS_SCENE_ID,
        unlock: { assetId: "character:aakash", characterId: "aakash", bondDelta: 1 }
      });
    }
    async renderWritingPractice() {
      this.shell.replace(renderLoadingScreen(this.language, navigator.onLine));
      const trace = await this.kanjiWriting.lookup("一");
      if (!trace) throw new Error("The pinned KanjiVG writing trace is unavailable.");
      this.shell.replace(renderKanjiDeskScreen(
        this.language,
        trace,
        (evaluation) => this.recordWritingActivity(evaluation),
        () => void this.go("campus")
      ));
    }
    async recordWritingActivity(evaluation) {
      await this.evidence.recordActivity(evaluation, {
        id: "lesson-zero-writing-desk",
        sceneId: "scene:lesson-zero-writing-desk",
        requiredErrorTag: "kanji-writing-complete"
      });
    }
    async go(route, update = {}) {
      this.checkpoint = { ...this.checkpoint, ...update, schemaVersion: 1, route, updatedAt: Date.now() };
      await this.persistence.checkpoint.save(this.checkpoint);
      await this.render();
    }
    toggleLanguage() {
      this.language = this.language === "en" ? "ja" : "en";
      try {
        localStorage.setItem(LANGUAGE_KEY, this.language);
      } catch {
      }
      this.shell.setLanguage(this.language);
      void this.render();
    }
    toggleMuted() {
      this.audio.setMuted(!this.audio.settings.muted);
      this.shell.setMuted(this.audio.settings.muted);
    }
  }
  function loadLanguage() {
    try {
      const stored = localStorage.getItem(LANGUAGE_KEY);
      if (stored === "en" || stored === "ja") return stored;
    } catch {
    }
    return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
  }
  function safeLocalStorage() {
    try {
      return localStorage;
    } catch {
      return null;
    }
  }
  const RUNTIME_MARKER_ID = "jpdb-reader-runtime-owner";
  const CORE_SCRIPT_ID = "yomu-hosted-academy-runtime";
  const CSS_ATTRIBUTE = "data-yomu-hosted-academy-css";
  const SCRIPT_ATTRIBUTE = "data-yomu-hosted-academy-script";
  const COMPANION_ATTRIBUTE = "data-yomu-hosted-academy-settings";
  const SETTINGS_COMPANION = "greasyfork/yomu-settings-surface.user.js";
  const JAPANESE_SURFACE_SELECTOR = '[lang="ja"], [data-yomu-runtime-surface]';
  const SETTINGS_KEY = "jpdb-popup-reader-settings";
  const RUNTIME_READY_TIMEOUT_MS = 6e3;
  const SURFACE_WAIT_TIMEOUT_MS = 15e3;
  let bootPromise = null;
  function initYomuReaderRuntime() {
    if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
    bootPromise ??= bootWhenJapaneseAppears().catch(() => false);
    return bootPromise;
  }
  function academyRuntimeAssetCandidates(fileName, href = window.location.href) {
    const current = new URL(href);
    const urls = [
      new URL(`../${fileName}`, current),
      new URL(`./${fileName}`, current),
      new URL(`/${fileName}`, current.origin),
      new URL(`/yomu-reader/${fileName}`, current.origin)
    ];
    return [...new Set(urls.map((url) => url.href))];
  }
  async function bootWhenJapaneseAppears() {
    if (hasYomuRuntime()) return true;
    await waitForJapaneseSurface();
    if (hasYomuRuntime()) return true;
    seedAcademyReaderDefaults();
    await loadStylesheet();
    await loadSettingsCompanion();
    const loaded = await loadCoreRuntime();
    return loaded && waitForRuntimeReady();
  }
  function hasYomuRuntime() {
    const runtimeWindow = window;
    return Boolean(runtimeWindow.__yomuReaderAppInitialized || document.getElementById(RUNTIME_MARKER_ID));
  }
  function waitForJapaneseSurface() {
    if (document.querySelector(JAPANESE_SURFACE_SELECTOR)) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        observer?.disconnect();
        window.clearTimeout(timer);
        resolve();
      };
      const observer = typeof MutationObserver === "undefined" ? void 0 : new MutationObserver(() => {
        if (document.querySelector(JAPANESE_SURFACE_SELECTOR)) finish();
      });
      observer?.observe(document.documentElement, { childList: true, subtree: true });
      const timer = window.setTimeout(finish, SURFACE_WAIT_TIMEOUT_MS);
    });
  }
  function seedAcademyReaderDefaults() {
    try {
      if (localStorage.getItem(SETTINGS_KEY) !== null) return;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        showFurigana: true,
        furiganaMode: "all",
        showPitchAccent: true
      }));
    } catch {
    }
  }
  function loadStylesheet() {
    if (document.querySelector(`link[${CSS_ATTRIBUTE}], link[href$="/yomu.css"], link[href*="/yomu.css?"]`)) {
      return Promise.resolve(true);
    }
    return loadLinkChain(academyRuntimeAssetCandidates("yomu.css"));
  }
  function loadCoreRuntime() {
    if (hasYomuRuntime()) return Promise.resolve(true);
    if (document.getElementById(CORE_SCRIPT_ID) || document.querySelector(`script[${SCRIPT_ATTRIBUTE}]`)) {
      return waitForRuntimeReady();
    }
    return loadScriptChain(academyRuntimeAssetCandidates("yomu.user.js"));
  }
  function loadSettingsCompanion() {
    if (document.querySelector(`script[${COMPANION_ATTRIBUTE}]`)) return Promise.resolve(true);
    return loadPlainScriptChain(academyRuntimeAssetCandidates(SETTINGS_COMPANION));
  }
  function loadPlainScriptChain(candidates, index = 0) {
    if (index >= candidates.length) return Promise.resolve(false);
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = candidates[index];
      script.setAttribute(COMPANION_ATTRIBUTE, "true");
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener("error", () => {
        script.remove();
        void loadPlainScriptChain(candidates, index + 1).then(resolve);
      }, { once: true });
      (document.head ?? document.documentElement).append(script);
    });
  }
  function loadScriptChain(candidates, index = 0) {
    if (index >= candidates.length) return Promise.resolve(false);
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.id = CORE_SCRIPT_ID;
      script.async = false;
      script.src = candidates[index];
      script.setAttribute(SCRIPT_ATTRIBUTE, "true");
      const tryNext = () => {
        script.remove();
        void loadScriptChain(candidates, index + 1).then(resolve);
      };
      script.addEventListener("load", () => {
        void waitForRuntimeReady().then((ready) => ready ? resolve(true) : tryNext());
      }, { once: true });
      script.addEventListener("error", tryNext, { once: true });
      (document.head ?? document.documentElement).append(script);
    });
  }
  function loadLinkChain(candidates, index = 0) {
    if (index >= candidates.length) return Promise.resolve(false);
    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = candidates[index];
      link.setAttribute(CSS_ATTRIBUTE, "true");
      link.addEventListener("load", () => resolve(true), { once: true });
      link.addEventListener("error", () => {
        link.remove();
        void loadLinkChain(candidates, index + 1).then(resolve);
      }, { once: true });
      (document.head ?? document.documentElement).append(link);
    });
  }
  function waitForRuntimeReady(timeoutMs = RUNTIME_READY_TIMEOUT_MS) {
    if (hasYomuRuntime()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const check = () => {
        if (hasYomuRuntime()) return resolve(true);
        if (performance.now() - startedAt >= timeoutMs) return resolve(false);
        window.setTimeout(check, 60);
      };
      check();
    });
  }
  const host = document.getElementById("yomu-academy");
  if (host) {
    const app = new AcademyApp(host, { databaseName: localQaDatabaseName() });
    window.__yomuAcademy = app;
    void app.start().catch((error) => {
      host.dataset.bootError = "true";
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent = error instanceof Error ? error.message : String(error);
      host.replaceChildren(message);
    });
    void initYomuReaderRuntime();
  }
  function localQaDatabaseName() {
    if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost" && location.hostname !== "::1") return void 0;
    const run = new URL(location.href).searchParams.get("qa-run")?.trim();
    return run && /^[a-z0-9-]{1,40}$/i.test(run) ? `yomu-academy-qa-${run}` : void 0;
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/academy/sw.js", { scope: "/academy/" });
    }, { once: true });
  }
})();
