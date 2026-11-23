const STORAGE_KEY = "codexhost.focus-pomodoro.state.v1";
const CHANGE_EVENT = "codexhost:focus-pomodoro:change";
const sessionState = new WeakMap();
const playedChimes = new WeakMap();

export const PRESETS = {
  focus: { key: "focusMinutes", minutes: 25, max: 120 },
  short: { key: "shortBreakMinutes", minutes: 5, max: 60 },
  long: { key: "longBreakMinutes", minutes: 15, max: 90 },
};
export const MODES = Object.keys(PRESETS);

const COPY = {
  en: {
    title: "Focus Pomodoro",
    modes: { focus: "Focus", short: "Short break", long: "Long break" },
    start: "Start",
    pause: "Pause",
    reset: "Reset",
    complete: "Finish round",
    running: "Running",
    paused: "Paused",
    ready: "Ready",
    done: "Round complete",
    noteLabel: "Current task",
    notePlaceholder: "What are you focusing on?",
    completedToday: "Pomodoros today",
    pureFrontendBadge: "Pure frontend · No backend process",
    presetsTitle: "Preset durations (minutes)",
    savePresets: "Save presets",
    presetsSaved: "Presets saved",
    presetsFailed: "Could not save presets. Try again.",
    expand: "Expand timer",
    collapse: "Collapse timer",
    soundOn: "Completion chime on",
    soundOff: "Completion chime muted",
    celebrationBadge: {
      focus: "Focus Complete",
      short: "Short Break Over",
      long: "Long Break Over",
    },
    celebrationTitle: {
      focus: "Focus round complete!",
      short: "Break refreshed — ready to focus",
      long: "Well rested — ready for a fresh cycle",
    },
    celebrationSubtitle: {
      focusShort: "{min} min focused · Time for a quick recharge",
      focusLong: "{min} min focused · 4 rounds done, enjoy a long break",
      short: "{min} min break complete · Jump back into flow",
      long: "{min} min break complete · Start your next focus block",
    },
    celebrationRhythm: "{count} Pomodoro completed today",
    celebrationRhythmPlural: "{count} Pomodoros completed today",
    startNext: {
      focus: "Start Focus · {min}m",
      short: "Start Short Break · {min}m",
      long: "Start Long Break · {min}m",
    },
    nextHint: {
      focus: "Next: Focus ({min}m)",
      short: "Next: Short break ({min}m)",
      long: "Next: Long break ({min}m)",
    },
    dismiss: "Later",
    close: "Dismiss celebration",
  },
  zh: {
    title: "专注番茄钟",
    modes: { focus: "专注", short: "短休", long: "长休" },
    start: "开始",
    pause: "暂停",
    reset: "重置",
    complete: "完成本轮",
    running: "进行中",
    paused: "已暂停",
    ready: "待开始",
    done: "本轮已完成",
    noteLabel: "当前专注任务备注",
    notePlaceholder: "这一轮想完成什么？",
    completedToday: "今日完成番茄",
    pureFrontendBadge: "纯前端插件 · 无后台进程",
    presetsTitle: "预设时长（分钟）",
    savePresets: "保存预设",
    presetsSaved: "预设已保存",
    presetsFailed: "未能保存预设，请重试。",
    expand: "展开计时器",
    collapse: "收起计时器",
    soundOn: "完成提示音已开启",
    soundOff: "完成提示音已静音",
    celebrationBadge: {
      focus: "专注达成",
      short: "短休结束",
      long: "长休结束",
    },
    celebrationTitle: {
      focus: "太棒了，完成一轮专注！",
      short: "休息结束，回到专注节奏",
      long: "能量已充满，开启新一轮专注",
    },
    celebrationSubtitle: {
      focusShort: "本轮专注 {min} 分钟 · 起身伸展一下吧",
      focusLong: "本轮专注 {min} 分钟 · 已满 4 轮，奖励一次长休",
      short: "已休息 {min} 分钟 · 准备进入下一轮专注",
      long: "已休息 {min} 分钟 · 带着清晰状态继续推进",
    },
    celebrationRhythm: "今日已完成 {count} 个番茄",
    celebrationRhythmPlural: "今日已完成 {count} 个番茄",
    startNext: {
      focus: "开始下一轮专注 · {min} 分钟",
      short: "开始短休 · {min} 分钟",
      long: "开始长休 · {min} 分钟",
    },
    nextHint: {
      focus: "建议下一轮：专注 ({min}m)",
      short: "建议下一轮：短休 ({min}m)",
      long: "建议下一轮：长休 ({min}m)",
    },
    dismiss: "稍后再说",
    close: "关闭完成提示",
  },
};

function todayKey(ms = Date.now()) {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function presetsFrom(values = {}) {
  return Object.fromEntries(
    MODES.map((mode) => {
      const { key, minutes, max } = PRESETS[mode];
      const n = Number(values[key]);
      return [
        mode,
        values[key] == null || values[key] === "" || !Number.isFinite(n)
          ? minutes
          : Math.min(max, Math.max(1, Math.round(n))),
      ];
    }),
  );
}

export function formatClock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(seconds / 60), seconds % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function read(win) {
  try {
    const saved = JSON.parse(win.localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") return saved;
  } catch {
    // A browser may deny persistent storage.
  }
  return sessionState.get(win) ?? {};
}

export function nextModeFor(mode, completedToday) {
  if (mode !== "focus") return "focus";
  return completedToday > 0 && completedToday % 4 === 0 ? "long" : "short";
}

export function playCompletionChime(win, mode, completionId) {
  if (!win) return;
  let seen = playedChimes.get(win);
  if (!seen) {
    seen = new Set();
    playedChimes.set(win, seen);
  }
  if (completionId && seen.has(completionId)) return;
  if (completionId) {
    seen.add(completionId);
    if (seen.size > 32) {
      const first = seen.values().next().value;
      seen.delete(first);
    }
  }
  const AudioCtx = win.AudioContext || win.webkitAudioContext;
  if (typeof AudioCtx !== "function") return;
  let ctx;
  try {
    ctx = new AudioCtx();
    const base = ctx.currentTime + 0.02;
    const notes =
      mode === "focus"
        ? [
            { freq: 523.25, at: 0, dur: 0.75, gain: 0.11 },
            { freq: 659.25, at: 0.11, dur: 0.85, gain: 0.1 },
            { freq: 783.99, at: 0.22, dur: 1.15, gain: 0.12 },
          ]
        : [
            { freq: 587.33, at: 0, dur: 0.7, gain: 0.1 },
            { freq: 880.0, at: 0.13, dur: 1.05, gain: 0.11 },
          ];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const overtoneGain = ctx.createGain();
      const env = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, base + note.at);
      overtone.type = "triangle";
      overtone.frequency.setValueAtTime(note.freq * 2, base + note.at);
      overtoneGain.gain.setValueAtTime(0.15, base + note.at);

      env.gain.setValueAtTime(0.0001, base + note.at);
      env.gain.linearRampToValueAtTime(note.gain, base + note.at + 0.018);
      env.gain.exponentialRampToValueAtTime(0.0001, base + note.at + note.dur);

      osc.connect(env);
      overtone.connect(overtoneGain);
      overtoneGain.connect(env);
      env.connect(ctx.destination);

      osc.start(base + note.at);
      overtone.start(base + note.at);
      osc.stop(base + note.at + note.dur + 0.04);
      overtone.stop(base + note.at + note.dur + 0.04);
    }
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    win.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 1700);
  } catch {
    void ctx?.close?.().catch(() => {});
  }
}

function normalizeCelebration(raw, fallbackCompleted) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (!MODES.includes(raw.mode) || !MODES.includes(raw.nextMode)) return null;
  const finishedAt = Number.isFinite(raw.finishedAt) ? raw.finishedAt : Date.now();
  const announcedAt = Number.isFinite(raw.announcedAt) ? raw.announcedAt : finishedAt;
  const completedToday = Number.isInteger(raw.completedToday)
    ? Math.max(0, raw.completedToday)
    : fallbackCompleted;
  const durationMinutes =
    Number.isFinite(raw.durationMinutes) && raw.durationMinutes > 0
      ? Math.round(raw.durationMinutes)
      : PRESETS[raw.mode].minutes;
  return {
    id: raw.id,
    mode: raw.mode,
    nextMode: raw.nextMode,
    completedToday,
    note: typeof raw.note === "string" ? raw.note.trim() : "",
    finishedAt,
    announcedAt,
    durationMinutes,
  };
}

function normalize(saved, presets) {
  const mode = MODES.includes(saved.mode) ? saved.mode : "focus";
  const endAt =
    saved.running && Number.isFinite(saved.endAt) ? saved.endAt : null;
  const roundMs =
    Number.isFinite(saved.roundMs) && saved.roundMs > 0
      ? saved.roundMs
      : Math.max(
          presets[mode] * 60_000,
          Number.isFinite(saved.remainingMs) ? saved.remainingMs : 0,
        );
  let remainingMs = Number.isFinite(saved.remainingMs)
    ? Math.max(0, saved.remainingMs)
    : null;
  // The page-only release stored its full duration even when no round had started.
  if (
    !endAt &&
    saved.roundMs === undefined &&
    remainingMs === PRESETS[mode].minutes * 60_000
  ) {
    remainingMs = null;
  }
  const completedToday = Number.isInteger(saved.completedToday)
    ? Math.max(0, saved.completedToday)
    : 0;
  const justFinished = saved.justFinished === true;
  return {
    mode,
    running: endAt !== null,
    endAt,
    remainingMs,
    roundMs: remainingMs === null && endAt === null ? null : roundMs,
    note: typeof saved.note === "string" ? saved.note : "",
    completedDate:
      typeof saved.completedDate === "string"
        ? saved.completedDate
        : todayKey(),
    completedToday,
    justFinished,
    celebration: justFinished
      ? normalizeCelebration(saved.celebration, completedToday)
      : null,
  };
}

export function createTimer(win, api, render) {
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  let presets = presetsFrom();
  let soundEnabled = true;
  let state = normalize(read(win), presets);
  let settingsChanges = 0;
  let interval;
  const cleanup = [];

  function snapshot(now) {
    const totalMs = state.roundMs ?? presets[state.mode] * 60_000;
    const remainingMs = state.running
      ? Math.max(0, state.endAt - now)
      : (state.remainingMs ?? totalMs);
    const status = state.running
      ? "running"
      : state.justFinished
        ? "done"
        : state.remainingMs === null
          ? "ready"
          : "paused";
    const completedToday =
      state.completedDate === todayKey(now) ? state.completedToday : 0;
    return {
      ...state,
      totalMs,
      remainingMs,
      presets,
      soundEnabled,
      status,
      completedToday,
      nextMode: nextModeFor(state.mode, completedToday),
      t: String(api.locale).toLowerCase().startsWith("zh") ? COPY.zh : COPY.en,
    };
  }
  function publish(patch) {
    state = { ...state, ...patch };
    sessionState.set(win, state);
    try {
      win.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The same-window event still synchronizes the two views.
    }
    win.dispatchEvent(new win.CustomEvent(CHANGE_EVENT, { detail: state }));
  }
  function finish(now) {
    if (state.justFinished || (!state.running && state.remainingMs === null))
      return;
    const completedDate = todayKey(now);
    const completedToday =
      (state.completedDate === completedDate ? state.completedToday : 0) +
      Number(state.mode === "focus");
    const nextMode = nextModeFor(state.mode, completedToday);
    const totalMs = state.roundMs ?? presets[state.mode] * 60_000;
    const durationMinutes = Math.max(1, Math.round(totalMs / 60_000));
    const announcedAt = Date.now();
    publish({
      running: false,
      endAt: null,
      remainingMs: 0,
      justFinished: true,
      completedDate,
      completedToday,
      celebration: {
        id: `${now}-${state.mode}-${completedToday}`,
        mode: state.mode,
        nextMode,
        completedToday,
        note: state.note.trim(),
        finishedAt: now,
        announcedAt,
        durationMinutes,
      },
    });
  }
  function update() {
    if (signal.aborted) return;
    const now = Date.now();
    if (state.running && state.endAt <= now) {
      finish(state.endAt);
      return;
    }
    render(snapshot(now));
    if (interval !== undefined) win.clearTimeout(interval);
    interval = win.setTimeout(update, state.running ? 250 : 60_000);
  }
  function receive(saved) {
    state = normalize(saved, presets);
    update();
  }
  function dispose() {
    if (signal.aborted) return;
    lifecycle.abort();
    win.clearTimeout(interval);
    for (const stop of cleanup.splice(0)) stop();
  }

  api.signal.throwIfAborted();
  api.signal.addEventListener("abort", dispose, { once: true });
  cleanup.push(() => api.signal.removeEventListener("abort", dispose));
  win.addEventListener(CHANGE_EVENT, (event) => receive(event.detail), {
    signal,
  });
  win.addEventListener(
    "storage",
    (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      sessionState.delete(win);
      receive(read(win));
    },
    { signal },
  );
  win.document.addEventListener("visibilitychange", update, { signal });
  cleanup.push(api.onLocaleChange(update));
  const applySettings = (values = {}) => {
    presets = presetsFrom(values);
    soundEnabled = values.soundEnabled !== false;
    update();
  };
  cleanup.push(
    api.storage.onChange((values) => {
      settingsChanges++;
      applySettings(values);
    }),
  );
  void api.storage
    .get()
    .then((values) => {
      if (!signal.aborted && settingsChanges === 0) applySettings(values);
    })
    .catch(() => {});
  update();

  return {
    signal,
    dispose,
    update,
    setMode(mode) {
      if (mode === state.mode) return;
      publish({
        mode,
        running: false,
        endAt: null,
        remainingMs: null,
        roundMs: null,
        justFinished: false,
        celebration: null,
      });
    },
    toggle() {
      const now = Date.now();
      if (state.running) {
        if (now >= state.endAt) finish(state.endAt);
        else
          publish({
            running: false,
            endAt: null,
            remainingMs: state.endAt - now,
          });
      } else {
        const roundMs =
          state.justFinished || state.remainingMs === null
            ? presets[state.mode] * 60_000
            : state.roundMs;
        const remainingMs = state.justFinished
          ? roundMs
          : (state.remainingMs ?? roundMs);
        publish({
          running: true,
          endAt: now + remainingMs,
          remainingMs,
          roundMs,
          justFinished: false,
          celebration: null,
        });
      }
    },
    reset() {
      publish({
        running: false,
        endAt: null,
        remainingMs: null,
        roundMs: null,
        justFinished: false,
        celebration: null,
      });
    },
    complete() {
      finish(state.running ? Math.min(Date.now(), state.endAt) : Date.now());
    },
    dismissCelebration() {
      if (state.celebration) publish({ celebration: null });
    },
    startNextRound(targetMode) {
      const now = Date.now();
      const completedToday =
        state.completedDate === todayKey(now) ? state.completedToday : 0;
      const mode = MODES.includes(targetMode)
        ? targetMode
        : (state.celebration?.nextMode ?? nextModeFor(state.mode, completedToday));
      const roundMs = presets[mode] * 60_000;
      publish({
        mode,
        running: true,
        endAt: now + roundMs,
        remainingMs: roundMs,
        roundMs,
        justFinished: false,
        celebration: null,
      });
    },
    setNote(note) {
      if (note !== state.note) publish({ note });
    },
    async setSoundEnabled(enabled) {
      const nextValue = Boolean(enabled);
      soundEnabled = nextValue;
      update();
      const current = await api.storage.get();
      const saved = await api.storage.set({
        ...current,
        soundEnabled: nextValue,
      });
      if (!signal.aborted) applySettings(saved);
    },
    async savePresets(durations) {
      const current = await api.storage.get();
      const next = presetsFrom(
        Object.fromEntries(
          MODES.map((mode) => [PRESETS[mode].key, durations[mode]]),
        ),
      );
      const saved = await api.storage.set({
        ...current,
        ...Object.fromEntries(
          MODES.map((mode) => [PRESETS[mode].key, next[mode]]),
        ),
      });
      if (!signal.aborted) applySettings(saved);
    },
  };
}
