import { createTimer, formatClock, MODES } from "../shared/timer.mjs";

const icon = (path) =>
  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const tomato = icon(
  '<path d="M10 7c-4.5-2-7 .5-7 4.1 0 3.6 3.2 5.9 7 5.9s7-2.3 7-5.9C17 7.5 14.5 5 10 7Z"/><path d="M10 8V4m0 3L7.5 5m2.5 2 2.5-2"/>',
);
const play = icon(
  '<path d="m7 4.5 8 5.5-8 5.5z" fill="currentColor" stroke="none"/>',
);
const pause = icon('<path d="M7 5.5v9m6-9v9" stroke-width="2.5"/>');
const chevron = icon('<path d="m6 12 4-4 4 4"/>');

export function mount(root, api) {
  root.innerHTML = `
    <div class="fp-widget" data-fp-widget>
      <section class="fp-widget-panel" id="fp-timer-panel" hidden>
        <header><strong data-title></strong><span data-status></span></header>
        <div class="fp-widget-modes" role="group">${MODES.map((mode) => `<button type="button" data-mode="${mode}"></button>`).join("")}</div>
        <label><span data-note-label></span><input type="text" data-fp-note /></label>
        <div class="fp-widget-actions">
          <button type="button" data-panel-toggle></button>
          <button type="button" data-reset></button>
          <button type="button" data-complete></button>
        </div>
        <div class="fp-widget-count"><span data-count-label></span><strong data-count></strong></div>
      </section>
      <div class="fp-widget-capsule">
        <span class="fp-tomato">${tomato}</span>
        <span class="fp-widget-time" role="timer" data-fp-time></span>
        <button class="fp-widget-toggle" type="button" data-fp-toggle></button>
        <button class="fp-widget-expand" type="button" aria-controls="fp-timer-panel" aria-expanded="false">${chevron}</button>
      </div>
    </div>`;
  const find = (selector) => root.querySelector(selector);
  const view = find(".fp-widget");
  const panel = find(".fp-widget-panel");
  const expand = find(".fp-widget-expand");
  const toggle = find("[data-fp-toggle]");
  const panelToggle = find("[data-panel-toggle]");
  const time = find("[data-fp-time]");
  const reset = find("[data-reset]");
  const complete = find("[data-complete]");
  const note = find("[data-fp-note]");
  const title = find("[data-title]");
  const status = find("[data-status]");
  const noteLabel = find("[data-note-label]");
  const count = find("[data-count]");
  const countLabel = find("[data-count-label]");
  const modes = MODES.map((mode) => [mode, find(`[data-mode="${mode}"]`)]);
  let lastRunning;
  const timer = createTimer(root.ownerDocument.defaultView, api, (state) => {
    const { t, running, remainingMs } = state;
    view.dataset.running = String(running);
    if (running !== lastRunning) toggle.innerHTML = running ? pause : play;
    lastRunning = running;
    time.textContent = formatClock(remainingMs);
    time.dataset.remainingMs = remainingMs;
    const action = running ? t.pause : t.start;
    toggle.setAttribute("aria-label", action);
    toggle.title = action;
    panelToggle.textContent = action;
    const disclosure = panel.hidden ? t.expand : t.collapse;
    expand.setAttribute("aria-label", disclosure);
    expand.title = disclosure;
    title.textContent = t.title;
    status.textContent = t[state.status];
    noteLabel.textContent = t.noteLabel;
    note.placeholder = t.notePlaceholder;
    if (note.value !== state.note) note.value = state.note;
    reset.textContent = t.reset;
    complete.textContent = t.complete;
    complete.disabled = state.status === "ready" || state.status === "done";
    count.textContent = state.completedToday;
    countLabel.textContent = t.completedToday;
    for (const [mode, button] of modes) {
      button.textContent = t.modes[mode];
      button.setAttribute("aria-pressed", String(mode === state.mode));
    }
  });
  const { signal } = timer;
  function setExpanded(open) {
    panel.hidden = !open;
    expand.setAttribute("aria-expanded", String(open));
    timer.update();
  }
  expand.addEventListener("click", () => setExpanded(panel.hidden), { signal });
  view.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || panel.hidden) return;
      setExpanded(false);
      expand.focus();
    },
    { signal },
  );
  for (const [mode, button] of modes)
    button.addEventListener("click", () => timer.setMode(mode), { signal });
  toggle.addEventListener("click", timer.toggle, { signal });
  panelToggle.addEventListener("click", timer.toggle, { signal });
  reset.addEventListener("click", timer.reset, { signal });
  complete.addEventListener("click", timer.complete, { signal });
  note.addEventListener("input", () => timer.setNote(note.value), { signal });
  return () => {
    timer.dispose();
    root.replaceChildren();
  };
}
