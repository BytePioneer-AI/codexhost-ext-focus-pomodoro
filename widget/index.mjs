import { createTimer, formatClock, MODES } from "../shared/timer.mjs";

const POSITION_KEY = "codexhost.focus-pomodoro.widget-pos.v1";
const SNAP_DISTANCE = 32;
const DRAG_THRESHOLD = 5;
const TUCK_RATIO = 0.44;
const PANEL_GAP = 10;
const SVG_NS = "http://www.w3.org/2000/svg";

function el(doc, tag, className) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (tag === "button") node.type = "button";
  return node;
}

function icon(doc, path, attrs = {}) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  const shape = doc.createElementNS(SVG_NS, "path");
  for (const [key, value] of Object.entries({
    d: path,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.6",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...attrs,
  }))
    shape.setAttribute(key, value);
  svg.append(shape);
  return svg;
}

function readPosition(win) {
  try {
    const saved = JSON.parse(win.localStorage.getItem(POSITION_KEY));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
      const dock =
        saved.dock === "left" || saved.dock === "right" ? saved.dock : "";
      return { x: saved.x, y: saved.y, dock };
    }
  } catch {
    // Dragging still works if storage is unavailable.
  }
  return { x: 0, y: Infinity, dock: "right" };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positionCapsule(view, capsule, expand, panel, win, signal) {
  const doc = view.ownerDocument;
  let position = readPosition(win);
  let point;
  let bounds;
  let gesture;
  let dragged = false;
  let panelSize;
  view.style.setProperty("--fp-tuck", `${TUCK_RATIO * 100}%`);

  function measurePanel() {
    const width = panel.offsetWidth;
    const height = panel.scrollHeight + panel.offsetHeight - panel.clientHeight;
    panelSize = { width, height };
  }

  function placePanel() {
    if (panel.hidden) return;
    const { x, y } = point;
    const { width, height, w, h } = bounds;
    const { width: panelW, height: naturalH } = panelSize;
    const gap = PANEL_GAP;
    const above = y - 2 * gap;
    const below = h - y - height - 2 * gap;
    const left = x - gap - panelW;
    const right = x + width + gap;
    const fitsLeft = left >= gap;
    const fitsRight = right + panelW <= w - gap;
    const side =
      fitsLeft && (!fitsRight || x >= w - x - width)
        ? "left"
        : fitsRight
          ? "right"
          : null;
    const vertical = above >= below ? "top" : "bottom";
    const verticalSpace = Math.max(above, below);
    // A docked pill opens inward when possible, leaving the corner clear.
    const edge =
      side && ((!gesture && position.dock) || verticalSpace < naturalH)
        ? side
        : vertical;
    const sideways = edge === "left" || edge === "right";
    const maxHeight = Math.max(0, sideways ? h - 2 * gap : verticalSpace);
    const panelH = Math.min(naturalH, maxHeight);
    const panelX = sideways
      ? edge === "left"
        ? left
        : right
      : x + (width - panelW) / 2;
    const panelY = sideways
      ? y + (height - panelH) / 2
      : edge === "top"
        ? y - gap - panelH
        : y + height + gap;
    panel.dataset.side = edge;
    panel.style.setProperty("--fp-panel-max-height", `${maxHeight}px`);
    panel.style.left = `${clamp(panelX, gap, w - gap - panelW)}px`;
    panel.style.top = `${clamp(panelY, gap, h - gap - panelH)}px`;
  }

  function move(x, y) {
    point = { x, y };
    capsule.style.setProperty("--fp-x", `${x}px`);
    capsule.style.setProperty("--fp-y", `${y}px`);
    placePanel();
  }

  function restorePosition() {
    const { w, h, width, height } = bounds;
    const x =
      position.dock === "left"
        ? 0
        : position.dock === "right"
          ? w - width
          : position.x;
    const y = position.y === Infinity ? h - height - 22 : position.y;
    // On a very narrow window, leave no more margin than the capsule can afford.
    const insetX = Math.min(PANEL_GAP, (w - width) / 2);
    const insetY = Math.min(PANEL_GAP, (h - height) / 2);
    capsule.dataset.dock = position.dock;
    move(
      position.dock ? x : clamp(x, insetX, w - width - insetX),
      clamp(y, insetY, h - height - insetY),
    );
  }

  function setExpanded(open) {
    view.dataset.open = String(open);
    expand.setAttribute("aria-expanded", String(open));
    expand.setAttribute(
      "aria-label",
      open ? expand.dataset.collapseLabel : expand.dataset.expandLabel,
    );
    panel.hidden = !open;
    panel.inert = !open;
    if (open) {
      measurePanel();
      placePanel();
    }
  }

  function updateDrag(event) {
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!dragged && Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
    dragged = true;
    capsule.dataset.dragging = "true";
    // Keep the original grab point even if the pill was only partly visible.
    moveDuringDrag(gesture.x + dx, gesture.y + dy);
  }

  function moveDuringDrag(x, y) {
    const { width, height, w, h } = bounds;
    const tuck = width * TUCK_RATIO;
    move(clamp(x, -tuck, w - width + tuck), clamp(y, 0, h - height));
  }

  function endDrag(event) {
    if (gesture?.id !== event.pointerId) return;
    const released = event.type === "pointerup";
    if (released) updateDrag(event);
    gesture = undefined;
    if (released && dragged) {
      const left = point.x;
      const right = bounds.w - point.x - bounds.width;
      const dock =
        Math.min(left, right) <= SNAP_DISTANCE
          ? left <= right
            ? "left"
            : "right"
          : "";
      position = { ...point, dock };
      delete capsule.dataset.dragging;
      restorePosition();
      position = { ...point, dock };
      try {
        win.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
      } catch {
        // Keep the position in memory for this mount.
      }
    } else if (dragged) {
      delete capsule.dataset.dragging;
      restorePosition();
    }
  }

  function resize() {
    bounds = {
      w: view.clientWidth,
      h: view.clientHeight,
      width: capsule.offsetWidth,
      height: capsule.offsetHeight,
    };
    if (!panel.hidden) measurePanel();
    if (gesture && dragged) moveDuringDrag(point.x, point.y);
    else restorePosition();
  }

  resize();
  win.addEventListener("resize", resize, { signal });
  // The web host loads the widget stylesheet separately from its module.
  const observer = new win.ResizeObserver(resize);
  observer.observe(view);
  observer.observe(capsule);
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  expand.addEventListener(
    "pointerdown",
    (event) => {
      if (gesture || !event.isPrimary || event.button !== 0) return;
      const rect = capsule.getBoundingClientRect();
      const viewport = view.getBoundingClientRect();
      gesture = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: rect.left - viewport.left,
        y: rect.top - viewport.top,
      };
      dragged = false;
      expand.setPointerCapture(event.pointerId);
    },
    { signal },
  );
  expand.addEventListener(
    "pointermove",
    (event) => {
      if (gesture?.id === event.pointerId) updateDrag(event);
    },
    { signal },
  );
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    expand.addEventListener(type, endDrag, { signal });
  expand.addEventListener(
    "click",
    (event) => {
      if (dragged && event.detail !== 0) return;
      setExpanded(panel.hidden);
    },
    { signal },
  );
  doc.addEventListener(
    "pointerdown",
    (event) => {
      if (!panel.hidden && !event.composedPath().includes(view))
        setExpanded(false);
    },
    { capture: true, signal },
  );
  win.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || event.isComposing || panel.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      if (panel.matches(":focus-within")) expand.focus({ preventScroll: true });
      setExpanded(false);
    },
    { capture: true, signal },
  );
}

export function mount(root, api) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const make = (tag, name) => el(doc, tag, name && `fp-widget-${name}`);
  const view = el(doc, "div", "fp-widget");
  view.dataset.scheme = api.colorScheme;

  const capsule = make("div", "capsule");
  const expand = make("button", "expand");
  expand.setAttribute("aria-controls", "fp-timer-panel");
  expand.setAttribute("aria-expanded", "false");
  const tomato = make("span", "tomato");
  tomato.append(
    icon(
      doc,
      "M10 7c-4.5-2-7 .5-7 4.1 0 3.6 3.2 5.9 7 5.9s7-2.3 7-5.9C17 7.5 14.5 5 10 7ZM10 8V4m0 3L7.5 5m2.5 2 2.5-2",
    ),
  );
  const time = make("span", "time");
  const chevron = make("span", "chevron");
  chevron.append(icon(doc, "m6 11 4-4 4 4"));
  expand.append(tomato, time, chevron);
  const toggle = make("button", "toggle");
  const toggleGlyph = make("span", "toggle-glyph");
  const play = icon(doc, "m7 4.5 8 5.5-8 5.5z", {
    fill: "currentColor",
    stroke: "none",
  });
  const pause = icon(doc, "M7 5.5v9m6-9v9", { "stroke-width": "2.5" });
  toggle.append(toggleGlyph);
  capsule.append(expand, toggle);

  const panel = make("section", "panel");
  panel.id = "fp-timer-panel";
  panel.setAttribute("aria-labelledby", "fp-timer-title");
  panel.hidden = true;
  panel.inert = true;
  const header = make("header", "header");
  const title = make("strong");
  title.id = "fp-timer-title";
  const status = make("span", "status");
  status.setAttribute("role", "status");
  header.append(title, status);
  const modeGroup = make("div", "modes");
  const modes = MODES.map((mode) => {
    const button = make("button");
    button.dataset.mode = mode;
    modeGroup.append(button);
    return [mode, button];
  });

  const face = make("div", "face");
  const panelTime = make("div", "panel-time");
  panelTime.setAttribute("role", "timer");
  const track = make("div", "track");
  track.setAttribute("aria-hidden", "true");
  const progress = make("span", "progress");
  track.append(progress);
  face.append(panelTime, track);

  const label = make("label", "note");
  const noteLabel = make("span");
  const note = make("input");
  note.type = "text";
  label.append(noteLabel, note);
  const actions = make("div", "actions");
  const panelToggle = make("button", "primary");
  const reset = make("button");
  const complete = make("button");
  actions.append(panelToggle, reset, complete);

  const footer = make("footer", "footer");
  const countGroup = make("div", "count");
  const count = make("strong");
  const countLabel = make("span");
  countGroup.append(count, countLabel);
  const dots = make("div", "dots");
  dots.setAttribute("aria-hidden", "true");
  const rounds = Array.from({ length: 4 }, () => make("span"));
  dots.append(...rounds);
  footer.append(countGroup, dots);
  panel.append(header, modeGroup, face, label, actions, footer);
  view.append(capsule, panel);
  root.replaceChildren(view);

  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };
  let lastRunning;
  const timer = createTimer(win, api, (state) => {
    const { t, mode, running, remainingMs, totalMs, completedToday } = state;
    view.dataset.mode = mode;
    view.dataset.running = String(running);
    if (running !== lastRunning)
      toggleGlyph.replaceChildren(running ? pause : play);
    lastRunning = running;
    const clock = formatClock(remainingMs);
    setText(time, clock);
    setText(panelTime, clock);
    progress.style.setProperty(
      "--fp-progress",
      clamp(remainingMs / totalMs, 0, 1),
    );
    const action = running ? t.pause : t.start;
    toggle.setAttribute("aria-label", action);
    toggle.title = action;
    setText(panelToggle, action);
    expand.dataset.expandLabel = `${t.expand} · ${clock}`;
    expand.dataset.collapseLabel = `${t.collapse} · ${clock}`;
    expand.setAttribute(
      "aria-label",
      panel.hidden ? expand.dataset.expandLabel : expand.dataset.collapseLabel,
    );
    setText(title, t.title);
    setText(status, t[state.status]);
    setText(noteLabel, t.noteLabel);
    note.placeholder = t.notePlaceholder;
    if (note.value !== state.note) note.value = state.note;
    setText(reset, t.reset);
    setText(complete, t.complete);
    complete.disabled = state.status === "ready" || state.status === "done";
    setText(count, String(completedToday));
    setText(countLabel, t.completedToday);
    const filled = completedToday
      ? ((completedToday - 1) % rounds.length) + 1
      : 0;
    rounds.forEach((dot, index) =>
      dot.classList.toggle("filled", index < filled),
    );
    for (const [value, button] of modes) {
      setText(button, t.modes[value]);
      button.setAttribute("aria-pressed", String(value === mode));
    }
  });

  const { signal } = timer;
  positionCapsule(view, capsule, expand, panel, win, signal);
  const unsubscribeScheme = api.onColorSchemeChange((scheme) => {
    view.dataset.scheme = scheme;
  });
  signal.addEventListener("abort", unsubscribeScheme, { once: true });
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
