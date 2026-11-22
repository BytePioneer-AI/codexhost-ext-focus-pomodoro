import { createTimer, formatClock, MODES, PRESETS } from "../shared/timer.mjs";

export function mount(root, api) {
  root.innerHTML = `
    <div class="fp-root" data-fp-host="${api.hostTarget}">
      <div class="fp-header">
        <div class="fp-modes" role="group">${MODES.map((mode) => `<button type="button" class="fp-mode-btn" data-mode="${mode}"></button>`).join("")}</div>
        <span class="fp-badge" data-fp-badge></span>
      </div>
      <div class="fp-grid">
        <div class="fp-main">
          <div class="fp-dial-wrap">
            <svg class="fp-ring" viewBox="0 0 200 200" aria-hidden="true">
              <circle class="fp-ring-track" cx="100" cy="100" r="88" />
              <circle class="fp-ring-progress" cx="100" cy="100" r="88" pathLength="100" stroke-dasharray="100" />
            </svg>
            <div class="fp-dial-center"><span class="fp-state-pill" data-fp-state></span><div class="fp-time" role="timer" data-fp-time></div></div>
          </div>
          <div class="fp-controls">
            <button type="button" class="fp-btn fp-btn-primary" data-fp-toggle></button>
            <button type="button" class="fp-btn fp-btn-ghost" data-fp-reset></button>
            <button type="button" class="fp-btn fp-btn-ghost" data-fp-complete></button>
          </div>
        </div>
        <div class="fp-side">
          <div class="fp-stat-box"><span class="fp-stat-label"></span><strong class="fp-stat-value" data-fp-completed></strong></div>
          <label class="fp-field"><span class="fp-field-label"></span><input class="fp-input" type="text" data-fp-note /></label>
          <form class="fp-presets">
            <div class="fp-field-label"></div>
            <div class="fp-presets-grid">${MODES.map((mode) => `<label class="fp-preset-cell"><span class="fp-preset-name"></span><input data-fp-preset-${mode} type="number" min="1" max="${PRESETS[mode].max}" required class="fp-input fp-num" /></label>`).join("")}</div>
            <div class="fp-presets-footer"><button class="fp-btn fp-btn-ghost fp-btn-sm" type="submit" data-fp-save-presets></button><span class="fp-preset-status" role="status"></span></div>
          </form>
        </div>
      </div>
    </div>`;
  const find = (selector) => root.querySelector(selector);
  const view = find(".fp-root");
  const time = find("[data-fp-time]");
  const note = find("[data-fp-note]");
  const toggle = find("[data-fp-toggle]");
  const reset = find("[data-fp-reset]");
  const complete = find("[data-fp-complete]");
  const count = find("[data-fp-completed]");
  const status = find("[data-fp-state]");
  const badge = find("[data-fp-badge]");
  const ring = find(".fp-ring-progress");
  const noteLabel = find(".fp-field .fp-field-label");
  const countLabel = find(".fp-stat-label");
  const presetTitle = find(".fp-presets > .fp-field-label");
  const save = find("[data-fp-save-presets]");
  const presetStatus = find(".fp-preset-status");
  const fields = MODES.map((mode) => ({
    mode,
    button: find(`[data-mode="${mode}"]`),
    input: find(`[data-fp-preset-${mode}]`),
  }));
  let lastPresets;
  let feedback;
  const timer = createTimer(root.ownerDocument.defaultView, api, (state) => {
    const { t, mode, remainingMs, totalMs, presets, running } = state;
    view.dataset.mode = mode;
    view.dataset.running = String(running);
    for (const field of fields) {
      const selected = field.mode === mode;
      field.button.textContent = `${t.modes[field.mode]} (${presets[field.mode]}m)`;
      field.button.setAttribute("aria-pressed", String(selected));
      field.button.classList.toggle("fp-mode-active", selected);
      field.input.previousElementSibling.textContent = t.modes[field.mode];
      if (presets[field.mode] !== lastPresets?.[field.mode])
        field.input.value = presets[field.mode];
    }
    lastPresets = presets;
    if (note.value !== state.note) note.value = state.note;
    time.textContent = formatClock(remainingMs);
    time.dataset.remainingMs = remainingMs;
    ring.setAttribute(
      "stroke-dashoffset",
      String(100 * (1 - Math.min(1, remainingMs / totalMs))),
    );
    status.textContent = t[state.status];
    complete.disabled = state.status === "ready" || state.status === "done";
    badge.textContent = t.pureFrontendBadge;
    toggle.textContent = running ? t.pause : t.start;
    reset.textContent = t.reset;
    complete.textContent = t.complete;
    count.textContent = state.completedToday;
    countLabel.textContent = t.completedToday;
    noteLabel.textContent = t.noteLabel;
    note.placeholder = t.notePlaceholder;
    presetTitle.textContent = t.presetsTitle;
    save.textContent = t.savePresets;
    presetStatus.textContent = feedback ? t[feedback] : "";
  });
  const { signal } = timer;
  for (const { mode, button } of fields)
    button.addEventListener("click", () => timer.setMode(mode), { signal });
  toggle.addEventListener("click", timer.toggle, { signal });
  reset.addEventListener("click", timer.reset, { signal });
  complete.addEventListener("click", timer.complete, { signal });
  note.addEventListener("input", () => timer.setNote(note.value), { signal });
  find("form").addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await timer.savePresets(
          Object.fromEntries(
            fields.map(({ mode, input }) => [mode, input.value]),
          ),
        );
        feedback = "presetsSaved";
      } catch {
        feedback = "presetsFailed";
      } finally {
        if (!signal.aborted) {
          save.disabled = false;
          timer.update();
        }
      }
    },
    { signal },
  );
  return () => {
    timer.dispose();
    root.replaceChildren();
  };
}
