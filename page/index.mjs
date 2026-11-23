import { createTimer, formatClock, MODES, PRESETS } from "../shared/timer.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

const EXTRA_COPY = {
  en: {
    startFocus: "Start Focus",
    startBreak: "Start Break",
    resume: "Resume",
    pause: "Pause",
    reset: "Reset",
    complete: "Finish",
    cycleLabel: "Today's Rhythm",
    roundsUnit: "rounds",
    minutesUnit: "min",
    focusedApprox: "{min} min focused",
    presetsLabel: "Durations (min)",
    save: "Apply",
    saved: "Saved",
    failed: "Save failed",
    spaceHint: "Space to start / pause · Drag the floating capsule on any chat page",
  },
  zh: {
    startFocus: "开始专注",
    startBreak: "开始休息",
    resume: "继续计时",
    pause: "暂停",
    reset: "重置",
    complete: "完成本轮",
    cycleLabel: "今日节奏",
    roundsUnit: "轮",
    minutesUnit: "分钟",
    focusedApprox: "已专注约 {min} 分钟",
    presetsLabel: "预设时长（分钟）",
    save: "应用",
    saved: "已更新",
    failed: "保存失败",
    spaceHint: "按空格可快速开始 / 暂停 · 聊天页悬浮胶囊支持自由拖动与贴边收起",
  },
};

function getExtra(locale) {
  return String(locale || "").toLowerCase().startsWith("zh") ? EXTRA_COPY.zh : EXTRA_COPY.en;
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildDialSvg(doc) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "fp-ring");
  svg.setAttribute("viewBox", "0 0 260 260");
  svg.setAttribute("aria-hidden", "true");

  // 60 subtle minute ticks inside the bezel
  const ticksGroup = doc.createElementNS(SVG_NS, "g");
  ticksGroup.setAttribute("class", "fp-ticks");
  for (let i = 0; i < 60; i++) {
    const angle = (i * 6 - 90) * (Math.PI / 180);
    const isMajor = i % 5 === 0;
    const rOuter = 104;
    const rInner = isMajor ? 97 : 100;
    const line = doc.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", (130 + Math.cos(angle) * rInner).toFixed(2));
    line.setAttribute("y1", (130 + Math.sin(angle) * rInner).toFixed(2));
    line.setAttribute("x2", (130 + Math.cos(angle) * rOuter).toFixed(2));
    line.setAttribute("y2", (130 + Math.sin(angle) * rOuter).toFixed(2));
    line.setAttribute("class", isMajor ? "fp-tick fp-tick-major" : "fp-tick");
    ticksGroup.append(line);
  }

  const track = doc.createElementNS(SVG_NS, "circle");
  track.setAttribute("class", "fp-ring-track");
  track.setAttribute("cx", "130");
  track.setAttribute("cy", "130");
  track.setAttribute("r", "116");

  const progress = doc.createElementNS(SVG_NS, "circle");
  progress.setAttribute("class", "fp-ring-progress");
  progress.setAttribute("cx", "130");
  progress.setAttribute("cy", "130");
  progress.setAttribute("r", "116");
  progress.setAttribute("pathLength", "100");
  progress.setAttribute("stroke-dasharray", "100");
  progress.setAttribute("stroke-dashoffset", "0");

  svg.append(ticksGroup, track, progress);
  return { svg, progress };
}

export function mount(root, api) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;

  const view = el(doc, "div", "fp-root");
  view.dataset.fpHost = api.hostTarget;
  view.dataset.scheme = api.colorScheme;

  // 1. Centered Segmented Mode Bar + Sound Toggle
  const topBar = el(doc, "div", "fp-topbar");
  const modeGroup = el(doc, "div", "fp-modes");
  modeGroup.setAttribute("role", "group");
  const modeButtons = new Map();
  for (const mode of MODES) {
    const btn = el(doc, "button", "fp-mode-btn");
    btn.type = "button";
    btn.dataset.mode = mode;
    modeGroup.append(btn);
    modeButtons.set(mode, btn);
  }
  const soundBtn = el(doc, "button", "fp-sound-btn");
  soundBtn.type = "button";
  const makeSoundIcon = (d) => {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
  };
  const soundOnIcon = makeSoundIcon(
    "M3.5 8.5h3l4-3.5v10l-4-3.5h-3zm10-1.2a4 4 0 0 1 0 5.4m2.1-7.5a7 7 0 0 1 0 9.6",
  );
  const soundOffIcon = makeSoundIcon(
    "M3.5 8.5h3l4-3.5v10l-4-3.5h-3zm10 0 4 4m0-4-4 4",
  );
  topBar.append(modeGroup, soundBtn);

  // 2. Hero Zen Chronometer Stage
  const stage = el(doc, "section", "fp-stage");
  const dialWrap = el(doc, "div", "fp-dial-wrap");
  const halo = el(doc, "div", "fp-dial-halo");
  const { svg: dialSvg, progress: ringProgress } = buildDialSvg(doc);

  const dialCenter = el(doc, "div", "fp-dial-center");
  const statusRow = el(doc, "div", "fp-status-row");
  const statusDot = el(doc, "span", "fp-status-dot");
  const statusText = el(doc, "span", "fp-state-label");
  statusText.setAttribute("data-fp-state", "");
  statusRow.append(statusDot, statusText);

  const timeEl = el(doc, "div", "fp-time");
  timeEl.setAttribute("role", "timer");
  timeEl.setAttribute("data-fp-time", "");

  const dialSub = el(doc, "div", "fp-dial-sub");
  dialCenter.append(statusRow, timeEl, dialSub);
  dialWrap.append(halo, dialSvg, dialCenter);

  // Frameless intention input right below dial
  const intentWrap = el(doc, "div", "fp-intent-wrap");
  const noteInput = el(doc, "input", "fp-intent-input");
  noteInput.type = "text";
  noteInput.setAttribute("data-fp-note", "");
  intentWrap.append(noteInput);

  // Tactile pill controls
  const controls = el(doc, "div", "fp-controls");
  const resetBtn = el(doc, "button", "fp-btn fp-btn-subtle");
  resetBtn.type = "button";
  resetBtn.setAttribute("data-fp-reset", "");

  const toggleBtn = el(doc, "button", "fp-btn fp-btn-primary");
  toggleBtn.type = "button";
  toggleBtn.setAttribute("data-fp-toggle", "");

  const completeBtn = el(doc, "button", "fp-btn fp-btn-subtle");
  completeBtn.type = "button";
  completeBtn.setAttribute("data-fp-complete", "");

  controls.append(resetBtn, toggleBtn, completeBtn);

  const nextBanner = el(doc, "button", "fp-next-banner");
  nextBanner.type = "button";
  nextBanner.hidden = true;

  stage.append(dialWrap, intentWrap, controls, nextBanner);

  // 3. Quiet Bottom Bar (Today's Rhythm + Compact Inline Presets)
  const dock = el(doc, "div", "fp-dock");

  const rhythmCard = el(doc, "div", "fp-dock-card fp-rhythm");
  const rhythmHead = el(doc, "div", "fp-dock-head");
  const rhythmLabel = el(doc, "span", "fp-dock-label");
  const rhythmMeta = el(doc, "span", "fp-dock-meta");
  rhythmHead.append(rhythmLabel, rhythmMeta);

  const rhythmBody = el(doc, "div", "fp-rhythm-body");
  const countWrap = el(doc, "div", "fp-count-wrap");
  const countValue = el(doc, "strong", "fp-count-value");
  countValue.setAttribute("data-fp-completed", "");
  const countUnit = el(doc, "span", "fp-count-unit");
  countWrap.append(countValue, countUnit);

  const cycleDots = el(doc, "div", "fp-cycle-dots");
  const dotEls = [];
  for (let i = 0; i < 4; i++) {
    const dot = el(doc, "span", "fp-cycle-dot");
    cycleDots.append(dot);
    dotEls.push(dot);
  }
  rhythmBody.append(countWrap, cycleDots);
  rhythmCard.append(rhythmHead, rhythmBody);

  const presetsForm = el(doc, "form", "fp-dock-card fp-presets");
  const presetsHead = el(doc, "div", "fp-dock-head");
  const presetsTitle = el(doc, "span", "fp-dock-label");
  const presetStatus = el(doc, "span", "fp-preset-status");
  presetStatus.setAttribute("role", "status");
  presetsHead.append(presetsTitle, presetStatus);

  const presetsRow = el(doc, "div", "fp-presets-row");
  const presetInputs = new Map();
  const presetLabels = new Map();
  for (const mode of MODES) {
    const cell = el(doc, "label", "fp-preset-cell");
    const nameEl = el(doc, "span", "fp-preset-name");
    const input = el(doc, "input", "fp-preset-num");
    input.type = "number";
    input.min = "1";
    input.max = String(PRESETS[mode].max);
    input.required = true;
    input.setAttribute(`data-fp-preset-${mode}`, "");
    cell.append(nameEl, input);
    presetsRow.append(cell);
    presetInputs.set(mode, input);
    presetLabels.set(mode, nameEl);
  }

  const saveBtn = el(doc, "button", "fp-btn fp-btn-sm fp-btn-outline");
  saveBtn.type = "submit";
  saveBtn.setAttribute("data-fp-save-presets", "");
  presetsRow.append(saveBtn);
  presetsForm.append(presetsHead, presetsRow);

  dock.append(rhythmCard, presetsForm);

  const hintFooter = el(doc, "div", "fp-hint-footer");
  view.append(topBar, stage, dock, hintFooter);
  root.replaceChildren(view);

  let lastPresets;
  let lastSoundEnabled;
  let currentSoundEnabled = true;
  let currentNextMode = "short";
  let feedbackKey = "";
  let feedbackTimer;

  const timer = createTimer(win, api, (state) => {
    const {
      t,
      mode,
      remainingMs,
      totalMs,
      presets,
      running,
      status,
      completedToday,
      soundEnabled,
      nextMode,
    } = state;
    const ex = getExtra(api.locale);

    view.dataset.mode = mode;
    view.dataset.running = String(running);
    view.dataset.status = status;
    currentSoundEnabled = soundEnabled;
    currentNextMode = nextMode;

    if (soundEnabled !== lastSoundEnabled) {
      soundBtn.replaceChildren(soundEnabled ? soundOnIcon : soundOffIcon);
      soundBtn.dataset.muted = String(!soundEnabled);
      lastSoundEnabled = soundEnabled;
    }
    const soundLabel = soundEnabled ? t.soundOn : t.soundOff;
    soundBtn.setAttribute("aria-label", soundLabel);
    soundBtn.setAttribute("aria-pressed", String(soundEnabled));
    soundBtn.title = soundLabel;

    for (const m of MODES) {
      const btn = modeButtons.get(m);
      const selected = m === mode;
      btn.textContent = `${t.modes[m]} · ${presets[m]}m`;
      btn.setAttribute("aria-pressed", String(selected));
      btn.classList.toggle("fp-mode-active", selected);

      const input = presetInputs.get(m);
      presetLabels.get(m).textContent = t.modes[m];
      if (presets[m] !== lastPresets?.[m]) {
        input.value = String(presets[m]);
      }
    }
    lastPresets = presets;

    if (noteInput.value !== state.note) noteInput.value = state.note;
    noteInput.placeholder = t.notePlaceholder;

    timeEl.textContent = formatClock(remainingMs);
    timeEl.dataset.remainingMs = String(remainingMs);
    const ratio =
      status === "done"
        ? 1
        : totalMs > 0
          ? Math.min(1, Math.max(0, remainingMs / totalMs))
          : 1;
    ringProgress.setAttribute("stroke-dashoffset", String((1 - ratio) * 100));

    statusText.textContent = t[status];
    dialSub.textContent = state.note.trim() ? state.note.trim() : "";
    dialSub.hidden = !state.note.trim();

    if (running) {
      toggleBtn.textContent = ex.pause;
    } else if (status === "paused") {
      toggleBtn.textContent = ex.resume;
    } else {
      toggleBtn.textContent = mode === "focus" ? ex.startFocus : ex.startBreak;
    }

    resetBtn.textContent = ex.reset;
    completeBtn.textContent = ex.complete;
    completeBtn.disabled = status === "ready" || status === "done";

    nextBanner.hidden = status !== "done";
    if (status === "done") {
      nextBanner.textContent = `${t.nextHint[nextMode].replace("{min}", String(presets[nextMode]))} →`;
    }

    rhythmLabel.textContent = ex.cycleLabel;
    const approxMin = completedToday * presets.focus;
    rhythmMeta.textContent = ex.focusedApprox.replace("{min}", String(approxMin));
    countValue.textContent = String(completedToday);
    countUnit.textContent = ex.roundsUnit;

    const filledInCycle = completedToday === 0 ? 0 : ((completedToday - 1) % 4) + 1;
    dotEls.forEach((dot, idx) => {
      dot.classList.toggle("fp-cycle-dot-filled", idx < filledInCycle);
    });

    presetsTitle.textContent = ex.presetsLabel;
    saveBtn.textContent = ex.save;
    presetStatus.textContent = feedbackKey ? ex[feedbackKey] : "";
    hintFooter.textContent = ex.spaceHint;
  });

  const { signal } = timer;

  for (const [mode, btn] of modeButtons) {
    btn.addEventListener("click", () => timer.setMode(mode), { signal });
  }
  toggleBtn.addEventListener("click", timer.toggle, { signal });
  resetBtn.addEventListener("click", timer.reset, { signal });
  completeBtn.addEventListener("click", timer.complete, { signal });
  nextBanner.addEventListener(
    "click",
    () => timer.startNextRound(currentNextMode),
    { signal },
  );
  soundBtn.addEventListener(
    "click",
    () => void timer.setSoundEnabled(!currentSoundEnabled).catch(() => {}),
    { signal },
  );
  noteInput.addEventListener("input", () => timer.setNote(noteInput.value), { signal });

  presetsForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      saveBtn.disabled = true;
      try {
        await timer.savePresets(
          Object.fromEntries(MODES.map((m) => [m, presetInputs.get(m).value])),
        );
        feedbackKey = "saved";
      } catch {
        feedbackKey = "failed";
      } finally {
        if (!signal.aborted) {
          saveBtn.disabled = false;
          timer.update();
          if (feedbackTimer) clearTimeout(feedbackTimer);
          feedbackTimer = setTimeout(() => {
            feedbackKey = "";
            if (!signal.aborted) timer.update();
          }, 2400);
        }
      }
    },
    { signal },
  );

  // Spacebar shortcut when focus isn't inside an input field
  const onKeyDown = (event) => {
    if (event.code !== "Space" || event.metaKey || event.ctrlKey || event.altKey) return;
    const active = doc.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
      return;
    }
    if (view.contains(active) || active === doc.body) {
      event.preventDefault();
      timer.toggle();
    }
  };
  win?.addEventListener("keydown", onKeyDown, { signal });

  const unsubScheme = api.onColorSchemeChange((nextScheme) => {
    view.dataset.scheme = nextScheme;
  });

  return () => {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    unsubScheme();
    timer.dispose();
    root.replaceChildren();
  };
}
