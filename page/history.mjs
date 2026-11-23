import { computeHistoryStats, todayKey } from "../shared/timer.mjs";

const HISTORY_COPY = {
  en: {
    title: "Focus History",
    synced: "Synced via Host",
    localOnly: "Local cache",
    filters: { today: "Today", week: "7 Days", all: "All" },
    exportCsv: "Export CSV",
    clear: "Clear",
    confirmClear: "Confirm clear?",
    statToday: "Today",
    statWeek: "Last 7 Days",
    statStreak: "Streak",
    statAll: "All Time",
    roundsShort: "{n} rounds",
    minutesShort: "{m} min",
    hoursShort: "{h} h",
    daysUnit: "{d} d",
    streakActive: "Active today",
    streakPending: "Focus to keep",
    trendTitle: "7-Day Focus Trend",
    trendTotal: "{m} min in 7 days",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    todayLabel: "Today",
    yesterdayLabel: "Yesterday",
    untitled: "No task note",
    deleteRecord: "Delete record",
    showMore: "Show more ({n} left)",
    emptyToday: "No completed rounds today yet. Finish a round to log it here.",
    emptyWeek: "No completed rounds in the past 7 days.",
    emptyAll:
      "Completed focus and break rounds are saved to shared Host storage and synced across Desktop and remote Web.",
    csvHeader: "Date,Completed At,Mode,Minutes,Task Note",
  },
  zh: {
    title: "专注记录",
    synced: "Host 跨端同步",
    localOnly: "本地缓存",
    filters: { today: "今日", week: "近 7 天", all: "全部" },
    exportCsv: "导出 CSV",
    clear: "清空",
    confirmClear: "确认清空？",
    statToday: "今日专注",
    statWeek: "近 7 天",
    statStreak: "连续专注",
    statAll: "累计专注",
    roundsShort: "{n} 轮",
    minutesShort: "{m} 分钟",
    hoursShort: "{h} 小时",
    daysUnit: "{d} 天",
    streakActive: "今日已打卡",
    streakPending: "完成 1 轮延续",
    trendTitle: "近 7 天专注趋势",
    trendTotal: "近 7 天共专注 {m} 分钟",
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    todayLabel: "今天",
    yesterdayLabel: "昨天",
    untitled: "未填写任务备注",
    deleteRecord: "删除记录",
    showMore: "展开更多（剩余 {n} 条）",
    emptyToday: "今天还没有完成的记录，完成一轮番茄后会自动记录在这里。",
    emptyWeek: "近 7 天暂无完成记录。",
    emptyAll:
      "每轮完成的专注与休息都会持久化到共享 Host，本机 Desktop 与远程 Web 自动同步。",
    csvHeader: "日期,完成时间,模式,时长(分钟),任务备注",
  },
};

function getCopy(locale) {
  return String(locale || "").toLowerCase().startsWith("zh")
    ? HISTORY_COPY.zh
    : HISTORY_COPY.en;
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (tag === "button") node.type = "button";
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDuration(minutes, c) {
  if (minutes >= 120) {
    const hours = (minutes / 60).toFixed(1).replace(/\.0$/u, "");
    return c.hoursShort.replace("{h}", hours);
  }
  return c.minutesShort.replace("{m}", String(minutes));
}

function formatClockTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n\r]/u.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function exportRecordsCsv(win, doc, records, c, modeLabels) {
  const lines = [c.csvHeader];
  for (const rec of records) {
    lines.push(
      [
        rec.date,
        formatClockTime(rec.finishedAt),
        modeLabels[rec.mode] ?? rec.mode,
        rec.minutes,
        rec.note,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new win.Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = win.URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = `focus-pomodoro-history-${todayKey()}.csv`;
  doc.body.append(link);
  link.click();
  link.remove();
  win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
}

export function createHistorySection(
  doc,
  win,
  { onDeleteRecord, onClearHistory, signal },
) {
  const section = el(doc, "section", "fp-history");
  section.setAttribute("data-fp-history", "");

  // Header
  const head = el(doc, "div", "fp-history-head");
  const titleGroup = el(doc, "div", "fp-history-title-group");
  const titleEl = el(doc, "h2", "fp-history-title");
  const syncBadge = el(doc, "span", "fp-sync-badge");
  const syncDot = el(doc, "span", "fp-sync-dot");
  const syncText = el(doc, "span");
  syncBadge.append(syncDot, syncText);
  titleGroup.append(titleEl, syncBadge);

  const toolbar = el(doc, "div", "fp-history-toolbar");
  const filterGroup = el(doc, "div", "fp-history-filters");
  filterGroup.setAttribute("role", "group");
  const filterButtons = new Map();
  for (const key of ["today", "week", "all"]) {
    const btn = el(doc, "button", "fp-filter-btn");
    btn.dataset.filter = key;
    filterGroup.append(btn);
    filterButtons.set(key, btn);
  }

  const exportBtn = el(doc, "button", "fp-history-action");
  const clearBtn = el(doc, "button", "fp-history-action fp-history-danger");
  toolbar.append(filterGroup, exportBtn, clearBtn);
  head.append(titleGroup, toolbar);

  // 4-Metric Summary Strip
  const statsGrid = el(doc, "div", "fp-stats-grid");
  const makeStat = (key) => {
    const card = el(doc, "div", "fp-stat-card");
    card.dataset.stat = key;
    const label = el(doc, "span", "fp-stat-label");
    const primary = el(doc, "strong", "fp-stat-value");
    const sub = el(doc, "span", "fp-stat-sub");
    card.append(label, primary, sub);
    statsGrid.append(card);
    return { label, primary, sub };
  };
  const statToday = makeStat("today");
  const statWeek = makeStat("week");
  const statStreak = makeStat("streak");
  const statAll = makeStat("all");

  // 7-Day Trend Bar Chart
  const trendCard = el(doc, "div", "fp-trend-card");
  const trendHead = el(doc, "div", "fp-dock-head");
  const trendTitle = el(doc, "span", "fp-dock-label");
  const trendMeta = el(doc, "span", "fp-dock-meta");
  trendHead.append(trendTitle, trendMeta);
  const trendBars = el(doc, "div", "fp-trend-bars");
  const barNodes = Array.from({ length: 7 }, () => {
    const col = el(doc, "div", "fp-trend-col");
    const valueEl = el(doc, "span", "fp-trend-val");
    const track = el(doc, "div", "fp-trend-track");
    const fill = el(doc, "div", "fp-trend-fill");
    track.append(fill);
    const dayEl = el(doc, "span", "fp-trend-day");
    col.append(valueEl, track, dayEl);
    trendBars.append(col);
    return { col, valueEl, fill, dayEl };
  });
  trendCard.append(trendHead, trendBars);

  // Records Timeline List
  const listWrap = el(doc, "div", "fp-records-wrap");
  const listEl = el(doc, "div", "fp-records-list");
  listEl.setAttribute("data-fp-records", "");
  const emptyEl = el(doc, "div", "fp-records-empty");
  const moreBtn = el(doc, "button", "fp-records-more");
  moreBtn.hidden = true;
  listWrap.append(listEl, emptyEl, moreBtn);

  section.append(head, statsGrid, trendCard, listWrap);

  let activeFilter = "today";
  let visibleLimit = 20;
  let confirmClear = false;
  let confirmTimer;
  let lastState = null;

  function resetConfirm() {
    confirmClear = false;
    if (confirmTimer) {
      win.clearTimeout(confirmTimer);
      confirmTimer = undefined;
    }
  }

  for (const [key, btn] of filterButtons) {
    btn.addEventListener(
      "click",
      () => {
        if (activeFilter === key) return;
        activeFilter = key;
        visibleLimit = 20;
        if (lastState) update(lastState);
      },
      { signal },
    );
  }

  moreBtn.addEventListener(
    "click",
    () => {
      visibleLimit += 20;
      if (lastState) update(lastState);
    },
    { signal },
  );

  exportBtn.addEventListener(
    "click",
    () => {
      if (!lastState || lastState.history.records.length === 0) return;
      const c = getCopy(lastState.locale);
      exportRecordsCsv(
        win,
        doc,
        lastState.history.records,
        c,
        lastState.t.modes,
      );
    },
    { signal },
  );

  clearBtn.addEventListener(
    "click",
    () => {
      if (!lastState) return;
      if (!confirmClear) {
        confirmClear = true;
        update(lastState);
        confirmTimer = win.setTimeout(() => {
          confirmClear = false;
          if (!signal.aborted && lastState) update(lastState);
        }, 3200);
      } else {
        resetConfirm();
        onClearHistory();
      }
    },
    { signal },
  );

  signal.addEventListener("abort", resetConfirm, { once: true });

  function filterRecords(records, now) {
    const today = todayKey(now);
    if (activeFilter === "today") {
      return records.filter((r) => r.date === today);
    }
    if (activeFilter === "week") {
      const cutoff = now - 7 * 86_400_000;
      return records.filter((r) => r.finishedAt >= cutoff);
    }
    return records;
  }

  function update(state) {
    lastState = state;
    const { history, hostSynced, t, locale } = state;
    const c = getCopy(locale);
    const now = Date.now();
    const stats = computeHistoryStats(history, now);

    titleEl.textContent = c.title;
    syncBadge.dataset.synced = String(Boolean(hostSynced));
    syncText.textContent = hostSynced ? c.synced : c.localOnly;

    for (const [key, btn] of filterButtons) {
      btn.textContent = c.filters[key];
      const active = key === activeFilter;
      btn.setAttribute("aria-pressed", String(active));
      btn.classList.toggle("fp-filter-active", active);
    }

    const hasAnyRecords =
      history.records.length > 0 ||
      Object.keys(history.dailyArchive).length > 0;
    exportBtn.textContent = c.exportCsv;
    exportBtn.disabled = history.records.length === 0;
    clearBtn.textContent = confirmClear ? c.confirmClear : c.clear;
    clearBtn.dataset.confirm = String(confirmClear);
    clearBtn.disabled = !hasAnyRecords;

    statToday.label.textContent = c.statToday;
    statToday.primary.textContent = c.roundsShort.replace(
      "{n}",
      String(stats.todayFocusCount),
    );
    statToday.sub.textContent = formatDuration(stats.todayFocusMinutes, c);

    statWeek.label.textContent = c.statWeek;
    statWeek.primary.textContent = c.roundsShort.replace(
      "{n}",
      String(stats.weekFocusCount),
    );
    statWeek.sub.textContent = formatDuration(stats.weekFocusMinutes, c);

    statStreak.label.textContent = c.statStreak;
    statStreak.primary.textContent = c.daysUnit.replace(
      "{d}",
      String(stats.streakDays),
    );
    statStreak.sub.textContent =
      stats.streakDays === 0
        ? "—"
        : stats.todayFocusCount > 0
          ? c.streakActive
          : c.streakPending;

    statAll.label.textContent = c.statAll;
    statAll.primary.textContent = c.roundsShort.replace(
      "{n}",
      String(stats.totalFocusCount),
    );
    statAll.sub.textContent = formatDuration(stats.totalFocusMinutes, c);

    trendTitle.textContent = c.trendTitle;
    trendMeta.textContent = c.trendTotal.replace(
      "{m}",
      String(stats.weekFocusMinutes),
    );
    const maxMin = Math.max(
      25,
      ...stats.last7Days.map((d) => d.focusMinutes),
    );
    stats.last7Days.forEach((day, idx) => {
      const node = barNodes[idx];
      node.col.dataset.today = String(day.isToday);
      node.col.dataset.active = String(day.focusMinutes > 0);
      node.col.title = `${day.date} · ${c.roundsShort.replace("{n}", String(day.focusCount))} · ${formatDuration(day.focusMinutes, c)}`;
      node.valueEl.textContent =
        day.focusMinutes > 0 ? `${day.focusMinutes}m` : "";
      const pct =
        day.focusMinutes > 0
          ? Math.max(10, Math.round((day.focusMinutes / maxMin) * 100))
          : 0;
      node.fill.style.height = `${pct}%`;
      node.dayEl.textContent = c.weekdays[day.weekday];
    });

    const filtered = filterRecords(history.records, now);
    if (filtered.length === 0) {
      listEl.replaceChildren();
      listEl.hidden = true;
      moreBtn.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent =
        activeFilter === "today"
          ? c.emptyToday
          : activeFilter === "week"
            ? c.emptyWeek
            : c.emptyAll;
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    const today = todayKey(now);
    const yesterday = todayKey(now - 86_400_000);
    const slice = filtered.slice(0, visibleLimit);
    const frag = doc.createDocumentFragment();
    let currentDate = null;

    for (const rec of slice) {
      if (rec.date !== currentDate) {
        currentDate = rec.date;
        const groupLabel =
          rec.date === today
            ? c.todayLabel
            : rec.date === yesterday
              ? c.yesterdayLabel
              : rec.date;
        frag.append(el(doc, "div", "fp-record-date", groupLabel));
      }
      const row = el(doc, "div", "fp-record-row");
      row.dataset.mode = rec.mode;
      const dot = el(doc, "span", "fp-record-dot");
      const modeTag = el(
        doc,
        "span",
        "fp-record-mode",
        t.modes[rec.mode] ?? rec.mode,
      );
      const noteEl = el(
        doc,
        "span",
        rec.note ? "fp-record-note" : "fp-record-note fp-record-note-empty",
        rec.note || c.untitled,
      );
      const durEl = el(
        doc,
        "span",
        "fp-record-dur",
        `${rec.minutes}m`,
      );
      const timeEl = el(
        doc,
        "span",
        "fp-record-time",
        formatClockTime(rec.finishedAt),
      );
      const delBtn = el(doc, "button", "fp-record-del", "×");
      delBtn.setAttribute("aria-label", c.deleteRecord);
      delBtn.title = c.deleteRecord;
      delBtn.addEventListener("click", () => onDeleteRecord(rec.id));
      row.append(dot, modeTag, noteEl, durEl, timeEl, delBtn);
      frag.append(row);
    }

    listEl.replaceChildren(frag);
    const remaining = filtered.length - slice.length;
    moreBtn.hidden = remaining <= 0;
    if (remaining > 0) {
      moreBtn.textContent = c.showMore.replace("{n}", String(remaining));
    }
  }

  return {
    element: section,
    update,
  };
}
