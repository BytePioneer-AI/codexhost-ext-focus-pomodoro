const STORAGE_KEY = "codexhost.focus-pomodoro.state.v1";
const HISTORY_STORAGE_KEY = "codexhost.focus-pomodoro.history.v1";
const CHANGE_EVENT = "codexhost:focus-pomodoro:change";
const TIMER_KEY = "_timer";
const HISTORY_KEY = "_history";
const MAX_RECORDS = 500;
const NOTE_SYNC_DEBOUNCE_MS = 500;

const sessionState = new WeakMap();
const sessionHistory = new WeakMap();
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
    pureFrontendBadge: "Pure frontend · Synced via Host",
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
    pureFrontendBadge: "纯前端 · Host 跨端同步",
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

export function todayKey(ms = Date.now()) {
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

function readLocal(win, key, fallbackMap) {
  try {
    const saved = JSON.parse(win.localStorage.getItem(key));
    if (saved && typeof saved === "object") return saved;
  } catch {
    // A browser may deny persistent storage.
  }
  return fallbackMap.get(win) ?? {};
}

function writeLocal(win, key, fallbackMap, value) {
  fallbackMap.set(win, value);
  try {
    win.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Same-window events and Host storage still synchronize views.
  }
}

function normalizeCelebration(raw, fallbackCompleted) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (!MODES.includes(raw.mode) || !MODES.includes(raw.nextMode)) return null;
  const finishedAt = Number.isFinite(raw.finishedAt)
    ? raw.finishedAt
    : Date.now();
  const announcedAt = Number.isFinite(raw.announcedAt)
    ? raw.announcedAt
    : finishedAt;
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
  const mode = MODES.includes(saved?.mode) ? saved.mode : "focus";
  const endAt =
    saved?.running && Number.isFinite(saved.endAt) ? saved.endAt : null;
  const roundMs =
    Number.isFinite(saved?.roundMs) && saved.roundMs > 0
      ? saved.roundMs
      : Math.max(
          presets[mode] * 60_000,
          Number.isFinite(saved?.remainingMs) ? saved.remainingMs : 0,
        );
  let remainingMs = Number.isFinite(saved?.remainingMs)
    ? Math.max(0, saved.remainingMs)
    : null;
  // The page-only release stored its full duration even when no round had started.
  if (
    !endAt &&
    saved?.roundMs === undefined &&
    remainingMs === PRESETS[mode].minutes * 60_000
  ) {
    remainingMs = null;
  }
  const completedToday = Number.isInteger(saved?.completedToday)
    ? Math.max(0, saved.completedToday)
    : 0;
  const justFinished = saved?.justFinished === true;
  const updatedAt = Number.isFinite(saved?.updatedAt) ? saved.updatedAt : 0;
  return {
    mode,
    running: endAt !== null,
    endAt,
    remainingMs,
    roundMs: remainingMs === null && endAt === null ? null : roundMs,
    note: typeof saved?.note === "string" ? saved.note : "",
    completedDate:
      typeof saved?.completedDate === "string"
        ? saved.completedDate
        : todayKey(),
    completedToday,
    justFinished,
    celebration: justFinished
      ? normalizeCelebration(saved?.celebration, completedToday)
      : null,
    updatedAt,
  };
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (!MODES.includes(raw.mode)) return null;
  if (!Number.isFinite(raw.finishedAt)) return null;
  const minutes = Number.isFinite(raw.minutes)
    ? Math.max(1, Math.min(240, Math.round(raw.minutes)))
    : PRESETS[raw.mode].minutes;
  const date =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(raw.date)
      ? raw.date
      : todayKey(raw.finishedAt);
  const note =
    typeof raw.note === "string" ? raw.note.trim().slice(0, 160) : "";
  return {
    id: raw.id,
    mode: raw.mode,
    finishedAt: raw.finishedAt,
    date,
    minutes,
    note,
  };
}

function normalizeArchiveEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const focusCount = Number.isInteger(raw.focusCount)
    ? Math.max(0, raw.focusCount)
    : 0;
  const focusMinutes = Number.isFinite(raw.focusMinutes)
    ? Math.max(0, Math.round(raw.focusMinutes))
    : 0;
  const breakCount = Number.isInteger(raw.breakCount)
    ? Math.max(0, raw.breakCount)
    : 0;
  const breakMinutes = Number.isFinite(raw.breakMinutes)
    ? Math.max(0, Math.round(raw.breakMinutes))
    : 0;
  if (focusCount + focusMinutes + breakCount + breakMinutes === 0) return null;
  return { focusCount, focusMinutes, breakCount, breakMinutes };
}

function normalizeHistory(raw) {
  const updatedAt = Number.isFinite(raw?.updatedAt) ? raw.updatedAt : 0;
  const seen = new Set();
  const records = [];
  if (Array.isArray(raw?.records)) {
    for (const item of raw.records) {
      const rec = normalizeRecord(item);
      if (rec && !seen.has(rec.id)) {
        seen.add(rec.id);
        records.push(rec);
      }
    }
  }
  records.sort((a, b) => b.finishedAt - a.finishedAt);

  const dailyArchive = {};
  if (raw?.dailyArchive && typeof raw.dailyArchive === "object") {
    for (const [date, entry] of Object.entries(raw.dailyArchive)) {
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) continue;
      const clean = normalizeArchiveEntry(entry);
      if (clean) dailyArchive[date] = clean;
    }
  }

  return trimHistory({ records, dailyArchive, updatedAt });
}

function trimHistory(history) {
  const records = [...history.records];
  const dailyArchive = { ...history.dailyArchive };
  while (records.length > MAX_RECORDS) {
    const oldest = records.pop();
    if (!oldest) break;
    const prev = dailyArchive[oldest.date] ?? {
      focusCount: 0,
      focusMinutes: 0,
      breakCount: 0,
      breakMinutes: 0,
    };
    dailyArchive[oldest.date] =
      oldest.mode === "focus"
        ? {
            ...prev,
            focusCount: prev.focusCount + 1,
            focusMinutes: prev.focusMinutes + oldest.minutes,
          }
        : {
            ...prev,
            breakCount: prev.breakCount + 1,
            breakMinutes: prev.breakMinutes + oldest.minutes,
          };
  }
  return {
    records,
    dailyArchive,
    updatedAt: history.updatedAt,
  };
}

function appendRecord(history, record, updatedAt) {
  if (history.records.some((item) => item.id === record.id)) {
    return history;
  }
  return trimHistory({
    records: [record, ...history.records],
    dailyArchive: history.dailyArchive,
    updatedAt,
  });
}

function mergeHistories(base, incoming) {
  if (!incoming || (incoming.records.length === 0 && Object.keys(incoming.dailyArchive).length === 0)) {
    return base;
  }
  if (!base || (base.records.length === 0 && Object.keys(base.dailyArchive).length === 0)) {
    return incoming;
  }
  const byId = new Map();
  for (const rec of base.records) byId.set(rec.id, rec);
  for (const rec of incoming.records) byId.set(rec.id, rec);
  const records = [...byId.values()].sort((a, b) => b.finishedAt - a.finishedAt);

  const dailyArchive = { ...base.dailyArchive };
  for (const [date, entry] of Object.entries(incoming.dailyArchive)) {
    const existing = dailyArchive[date];
    if (!existing) {
      dailyArchive[date] = { ...entry };
    } else {
      dailyArchive[date] = {
        focusCount: Math.max(existing.focusCount, entry.focusCount),
        focusMinutes: Math.max(existing.focusMinutes, entry.focusMinutes),
        breakCount: Math.max(existing.breakCount, entry.breakCount),
        breakMinutes: Math.max(existing.breakMinutes, entry.breakMinutes),
      };
    }
  }
  return trimHistory({
    records,
    dailyArchive,
    updatedAt: Math.max(base.updatedAt, incoming.updatedAt),
  });
}

export function computeHistoryStats(history, now = Date.now()) {
  const today = todayKey(now);
  const dailyMap = new Map();
  const addDay = (date, focusCount, focusMinutes, breakCount, breakMinutes) => {
    const cur = dailyMap.get(date) ?? {
      date,
      focusCount: 0,
      focusMinutes: 0,
      breakCount: 0,
      breakMinutes: 0,
    };
    cur.focusCount += focusCount;
    cur.focusMinutes += focusMinutes;
    cur.breakCount += breakCount;
    cur.breakMinutes += breakMinutes;
    dailyMap.set(date, cur);
  };

  for (const [date, entry] of Object.entries(history.dailyArchive ?? {})) {
    addDay(
      date,
      entry.focusCount,
      entry.focusMinutes,
      entry.breakCount,
      entry.breakMinutes,
    );
  }
  for (const rec of history.records ?? []) {
    if (rec.mode === "focus") addDay(rec.date, 1, rec.minutes, 0, 0);
    else addDay(rec.date, 0, 0, 1, rec.minutes);
  }

  // Build 7-day window ending today (local calendar days)
  const dayMs = 86_400_000;
  const baseDate = new Date(now);
  baseDate.setHours(12, 0, 0, 0);
  const last7Days = [];
  let weekFocusCount = 0;
  let weekFocusMinutes = 0;
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(baseDate.getTime() - offset * dayMs);
    const key = todayKey(d.getTime());
    const entry = dailyMap.get(key) ?? {
      date: key,
      focusCount: 0,
      focusMinutes: 0,
      breakCount: 0,
      breakMinutes: 0,
    };
    weekFocusCount += entry.focusCount;
    weekFocusMinutes += entry.focusMinutes;
    last7Days.push({
      ...entry,
      weekday: d.getDay(),
      isToday: key === today,
    });
  }

  let totalFocusCount = 0;
  let totalFocusMinutes = 0;
  for (const entry of dailyMap.values()) {
    totalFocusCount += entry.focusCount;
    totalFocusMinutes += entry.focusMinutes;
  }

  const todayEntry = dailyMap.get(today) ?? {
    date: today,
    focusCount: 0,
    focusMinutes: 0,
    breakCount: 0,
    breakMinutes: 0,
  };

  // Consecutive focus-day streak (counts today if >0, or starts from yesterday so streak isn't broken mid-morning)
  let streakDays = 0;
  const startOffset = todayEntry.focusCount > 0 ? 0 : 1;
  for (let offset = startOffset; offset < 3650; offset++) {
    const d = new Date(baseDate.getTime() - offset * dayMs);
    const entry = dailyMap.get(todayKey(d.getTime()));
    if (entry && entry.focusCount > 0) streakDays++;
    else break;
  }

  return {
    todayFocusCount: todayEntry.focusCount,
    todayFocusMinutes: todayEntry.focusMinutes,
    weekFocusCount,
    weekFocusMinutes,
    totalFocusCount,
    totalFocusMinutes,
    streakDays,
    last7Days,
  };
}

export function createTimer(win, api, render) {
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  let presets = presetsFrom();
  let soundEnabled = true;
  let state = normalize(readLocal(win, STORAGE_KEY, sessionState), presets);
  let history = normalizeHistory(
    readLocal(win, HISTORY_STORAGE_KEY, sessionHistory),
  );
  let hostSynced = false;
  let settingsChanges = 0;
  let interval;
  let noteSyncTimer;
  let persistChain = Promise.resolve();
  let lastMutationTs = 0;
  const cleanup = [];

  function nextTs() {
    lastMutationTs = Math.max(Date.now(), lastMutationTs + 1);
    return lastMutationTs;
  }

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
      history,
      hostSynced,
      t: String(api.locale).toLowerCase().startsWith("zh") ? COPY.zh : COPY.en,
    };
  }

  function broadcastLocal() {
    writeLocal(win, STORAGE_KEY, sessionState, state);
    writeLocal(win, HISTORY_STORAGE_KEY, sessionHistory, history);
    win.dispatchEvent(
      new win.CustomEvent(CHANGE_EVENT, { detail: { state, history } }),
    );
  }

  function enqueueHostPersist(mutate) {
    persistChain = persistChain
      .catch(() => {})
      .then(async () => {
        if (signal.aborted) return;
        const current = (await api.storage.get()) ?? {};
        if (signal.aborted) return;
        const next = mutate(current);
        if (!next) return;
        const saved = await api.storage.set(next);
        if (!signal.aborted) {
          hostSynced = true;
          applySettings(saved, { fromOwnWrite: true });
        }
      })
      .catch(() => {
        // Keep local responsive even if Host RPC is momentarily unavailable.
      });
    return persistChain;
  }

  function syncTimerToHost({ includeHistory = false, replaceHistory = false } = {}) {
    if (noteSyncTimer !== undefined) {
      win.clearTimeout(noteSyncTimer);
      noteSyncTimer = undefined;
    }
    const timerSnapshot = { ...state };
    const historySnapshot = { ...history };
    return enqueueHostPersist((current) => {
      const remoteTimer = current[TIMER_KEY];
      const timerToSave =
        remoteTimer &&
        Number.isFinite(remoteTimer.updatedAt) &&
        remoteTimer.updatedAt > timerSnapshot.updatedAt
          ? remoteTimer
          : timerSnapshot;
      const next = {
        ...current,
        [TIMER_KEY]: timerToSave,
      };
      if (includeHistory) {
        if (replaceHistory) {
          next[HISTORY_KEY] = historySnapshot;
        } else {
          const remoteHistory = normalizeHistory(current[HISTORY_KEY]);
          next[HISTORY_KEY] = mergeHistories(remoteHistory, historySnapshot);
        }
      }
      return next;
    });
  }

  function scheduleNoteSync() {
    if (noteSyncTimer !== undefined) win.clearTimeout(noteSyncTimer);
    noteSyncTimer = win.setTimeout(() => {
      noteSyncTimer = undefined;
      if (!signal.aborted) void syncTimerToHost();
    }, NOTE_SYNC_DEBOUNCE_MS);
  }

  function publish(patch, options = {}) {
    const {
      sync = "immediate",
      record = null,
      nextHistory = null,
      replaceHistory = false,
    } = options;
    const ts = nextTs();
    state = { ...state, ...patch, updatedAt: ts };
    if (nextHistory) {
      history = { ...nextHistory, updatedAt: ts };
    } else if (record) {
      history = appendRecord(history, record, ts);
    }
    broadcastLocal();
    if (sync === "immediate") {
      void syncTimerToHost({
        includeHistory: Boolean(record || nextHistory),
        replaceHistory,
      });
    } else if (sync === "debounced") {
      scheduleNoteSync();
    }
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
    const id = `${now}-${state.mode}-${completedToday}`;
    const trimmedNote = state.note.trim().slice(0, 160);
    const record = {
      id,
      mode: state.mode,
      finishedAt: now,
      date: completedDate,
      minutes: durationMinutes,
      note: trimmedNote,
    };
    publish(
      {
        running: false,
        endAt: null,
        remainingMs: 0,
        justFinished: true,
        completedDate,
        completedToday,
        celebration: {
          id,
          mode: state.mode,
          nextMode,
          completedToday,
          note: trimmedNote,
          finishedAt: now,
          announcedAt,
          durationMinutes,
        },
      },
      { sync: "immediate", record },
    );
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

  function receive(detail) {
    if (detail && typeof detail === "object" && "state" in detail) {
      state = normalize(detail.state, presets);
      if (detail.history) history = normalizeHistory(detail.history);
    } else {
      state = normalize(detail, presets);
    }
    lastMutationTs = Math.max(
      lastMutationTs,
      state.updatedAt,
      history.updatedAt,
    );
    update();
  }

  function applySettings(values = {}, { initial = false, fromOwnWrite = false } = {}) {
    presets = presetsFrom(values);
    soundEnabled = values.soundEnabled !== false;
    hostSynced = true;

    let localChanged = false;
    const remoteTimerRaw = values[TIMER_KEY];
    if (remoteTimerRaw && typeof remoteTimerRaw === "object") {
      const remoteTimer = normalize(remoteTimerRaw, presets);
      if (remoteTimer.updatedAt > state.updatedAt) {
        state = remoteTimer;
        lastMutationTs = Math.max(lastMutationTs, remoteTimer.updatedAt);
        localChanged = true;
      }
    }

    const remoteHistoryRaw = values[HISTORY_KEY];
    if (remoteHistoryRaw && typeof remoteHistoryRaw === "object") {
      const remoteHistory = normalizeHistory(remoteHistoryRaw);
      if (fromOwnWrite || remoteHistory.updatedAt > history.updatedAt) {
        history = remoteHistory;
        lastMutationTs = Math.max(lastMutationTs, remoteHistory.updatedAt);
        localChanged = true;
      } else if (initial) {
        const merged = mergeHistories(history, remoteHistory);
        if (
          merged.records.length !== history.records.length ||
          Object.keys(merged.dailyArchive).length !==
            Object.keys(history.dailyArchive).length
        ) {
          history = merged;
          localChanged = true;
        }
      }
    } else if (
      initial &&
      (history.records.length > 0 || state.updatedAt > 0)
    ) {
      // One-time migration: push existing local state/history up to shared Host storage.
      void syncTimerToHost({ includeHistory: history.records.length > 0 });
    }

    if (localChanged) {
      writeLocal(win, STORAGE_KEY, sessionState, state);
      writeLocal(win, HISTORY_STORAGE_KEY, sessionHistory, history);
    }
    update();
  }

  function dispose() {
    if (signal.aborted) return;
    lifecycle.abort();
    win.clearTimeout(interval);
    if (noteSyncTimer !== undefined) win.clearTimeout(noteSyncTimer);
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
      if (
        event.key !== STORAGE_KEY &&
        event.key !== HISTORY_STORAGE_KEY &&
        event.key !== null
      )
        return;
      sessionState.delete(win);
      sessionHistory.delete(win);
      receive({
        state: readLocal(win, STORAGE_KEY, sessionState),
        history: readLocal(win, HISTORY_STORAGE_KEY, sessionHistory),
      });
    },
    { signal },
  );
  win.document.addEventListener("visibilitychange", update, { signal });
  cleanup.push(api.onLocaleChange(update));
  cleanup.push(
    api.storage.onChange((values) => {
      settingsChanges++;
      applySettings(values);
    }),
  );
  void api.storage
    .get()
    .then((values) => {
      if (!signal.aborted && settingsChanges === 0) {
        applySettings(values, { initial: true });
      }
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
        : (state.celebration?.nextMode ??
            nextModeFor(state.mode, completedToday));
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
      if (note !== state.note) publish({ note }, { sync: "debounced" });
    },
    deleteRecord(recordId) {
      const target = history.records.find((item) => item.id === recordId);
      if (!target) return;
      const nextRecords = history.records.filter((item) => item.id !== recordId);
      const today = todayKey();
      const patch =
        target.mode === "focus" &&
        target.date === today &&
        state.completedDate === today &&
        state.completedToday > 0
          ? { completedToday: state.completedToday - 1 }
          : {};
      publish(patch, {
        sync: "immediate",
        nextHistory: {
          records: nextRecords,
          dailyArchive: history.dailyArchive,
        },
        replaceHistory: true,
      });
    },
    clearHistory() {
      if (
        history.records.length === 0 &&
        Object.keys(history.dailyArchive).length === 0
      )
        return;
      publish(
        { completedToday: 0, completedDate: todayKey() },
        {
          sync: "immediate",
          nextHistory: { records: [], dailyArchive: {} },
          replaceHistory: true,
        },
      );
    },
    async setSoundEnabled(enabled) {
      const nextValue = Boolean(enabled);
      soundEnabled = nextValue;
      update();
      await enqueueHostPersist((current) => ({
        ...current,
        soundEnabled: nextValue,
      }));
    },
    async savePresets(durations) {
      const next = presetsFrom(
        Object.fromEntries(
          MODES.map((mode) => [PRESETS[mode].key, durations[mode]]),
        ),
      );
      await enqueueHostPersist((current) => ({
        ...current,
        ...Object.fromEntries(
          MODES.map((mode) => [PRESETS[mode].key, next[mode]]),
        ),
      }));
    },
  };
}
