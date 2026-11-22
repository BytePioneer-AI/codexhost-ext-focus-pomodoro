const STORAGE_KEY = "codexhost.focus-pomodoro.state.v1";
const CHANGE_EVENT = "codexhost:focus-pomodoro:change";
const sessionState = new WeakMap();

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
    completedToday: Number.isInteger(saved.completedToday)
      ? Math.max(0, saved.completedToday)
      : 0,
    justFinished: saved.justFinished === true,
  };
}

export function createTimer(win, api, render) {
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  let presets = presetsFrom();
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
    return {
      ...state,
      totalMs,
      remainingMs,
      presets,
      status,
      completedToday:
        state.completedDate === todayKey(now) ? state.completedToday : 0,
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
    publish({
      running: false,
      endAt: null,
      remainingMs: 0,
      justFinished: true,
      completedDate,
      completedToday:
        (state.completedDate === completedDate ? state.completedToday : 0) +
        Number(state.mode === "focus"),
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
  const applySettings = (values) => {
    presets = presetsFrom(values);
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
      });
    },
    complete() {
      finish(state.running ? Math.min(Date.now(), state.endAt) : Date.now());
    },
    setNote(note) {
      if (note !== state.note) publish({ note });
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
