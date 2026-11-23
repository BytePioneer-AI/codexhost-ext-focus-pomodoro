const SVG_NS = "http://www.w3.org/2000/svg";

const SPARKS = [
  { angle: -90, dist: 64, rot: 0, delay: 90, size: 7, kind: "pill", tone: "primary" },
  { angle: -58, dist: 72, rot: 32, delay: 130, size: 6, kind: "dot", tone: "warm" },
  { angle: -28, dist: 68, rot: 62, delay: 105, size: 8, kind: "diamond", tone: "soft" },
  { angle: 4, dist: 74, rot: 94, delay: 145, size: 6, kind: "pill", tone: "primary" },
  { angle: 34, dist: 66, rot: 124, delay: 115, size: 5, kind: "dot", tone: "warm" },
  { angle: 64, dist: 72, rot: 154, delay: 160, size: 7, kind: "diamond", tone: "primary" },
  { angle: 96, dist: 64, rot: 186, delay: 120, size: 6, kind: "pill", tone: "soft" },
  { angle: 128, dist: 72, rot: 218, delay: 150, size: 7, kind: "dot", tone: "primary" },
  { angle: 158, dist: 66, rot: 248, delay: 110, size: 8, kind: "diamond", tone: "warm" },
  { angle: 190, dist: 74, rot: 280, delay: 140, size: 6, kind: "pill", tone: "primary" },
  { angle: 222, dist: 68, rot: 312, delay: 100, size: 5, kind: "dot", tone: "soft" },
  { angle: 252, dist: 70, rot: 342, delay: 135, size: 7, kind: "diamond", tone: "warm" },
];

function el(doc, tag, className) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (tag === "button") node.type = "button";
  return node;
}

function svgEl(doc, tag, attrs = {}) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function buildEmblemSvg(doc) {
  const svg = svgEl(doc, "svg", {
    class: "fp-celebration-svg",
    viewBox: "0 0 88 88",
    "aria-hidden": "true",
  });

  const track = svgEl(doc, "circle", {
    class: "fp-celebration-circle-track",
    cx: 44,
    cy: 44,
    r: 36,
  });

  const stroke = svgEl(doc, "circle", {
    class: "fp-celebration-circle-stroke",
    cx: 44,
    cy: 44,
    r: 36,
    pathLength: 100,
  });

  const check = svgEl(doc, "path", {
    class: "fp-celebration-glyph fp-celebration-glyph-focus",
    d: "M30 45.5 39.5 54.5 59 34",
    pathLength: 100,
  });

  const spark = svgEl(doc, "path", {
    class: "fp-celebration-glyph fp-celebration-glyph-break",
    d: "M44 26v10m0 16v10M26 44h10m16 0h10m-28.7-12.7 7 7m11.4 11.4 7 7m0-25.4-7 7m-11.4 11.4-7 7",
    pathLength: 100,
  });

  svg.append(track, stroke, check, spark);
  return svg;
}

function formatText(template, values) {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.replace(`{${key}}`, String(value));
  }
  return out;
}

export function createCelebrationOverlay(doc, { onDismiss, onStartNext }) {
  const make = (tag, name) => el(doc, tag, name && `fp-celebration-${name}`);

  const root = el(doc, "div", "fp-celebration");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "false");
  root.setAttribute("aria-labelledby", "fp-celebration-title");
  root.hidden = true;
  root.inert = true;

  const scrim = make("div", "scrim");
  const card = make("div", "card");

  const closeBtn = make("button", "close");
  const closeSvg = svgEl(doc, "svg", {
    viewBox: "0 0 20 20",
    "aria-hidden": "true",
  });
  closeSvg.append(
    svgEl(doc, "path", {
      d: "M6 6l8 8M14 6l-8 8",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
    }),
  );
  closeBtn.append(closeSvg);

  const stage = make("div", "stage");
  stage.setAttribute("aria-hidden", "true");
  const ring1 = make("span", "ring fp-celebration-ring-1");
  const ring2 = make("span", "ring fp-celebration-ring-2");
  const ring3 = make("span", "ring fp-celebration-ring-3");
  const glow = make("span", "glow");

  const burst = make("div", "burst");
  for (const piece of SPARKS) {
    const spark = el(
      doc,
      "span",
      `fp-celebration-spark fp-celebration-spark-${piece.kind} fp-celebration-spark-${piece.tone}`,
    );
    const rad = (piece.angle * Math.PI) / 180;
    spark.style.setProperty("--fp-dx", `${(Math.cos(rad) * piece.dist).toFixed(1)}px`);
    spark.style.setProperty("--fp-dy", `${(Math.sin(rad) * piece.dist).toFixed(1)}px`);
    spark.style.setProperty("--fp-rot", `${piece.rot}deg`);
    spark.style.setProperty("--fp-delay", `${piece.delay}ms`);
    spark.style.setProperty("--fp-size", `${piece.size}px`);
    burst.append(spark);
  }

  const emblem = make("div", "emblem");
  emblem.append(buildEmblemSvg(doc));
  stage.append(glow, ring1, ring2, ring3, burst, emblem);

  const badge = make("span", "badge");
  const title = make("h2", "title");
  title.id = "fp-celebration-title";
  const subtitle = make("p", "subtitle");

  const notePill = make("div", "note");
  notePill.hidden = true;
  const noteCheck = make("span", "note-icon");
  noteCheck.setAttribute("aria-hidden", "true");
  noteCheck.textContent = "✓";
  const noteText = make("span", "note-text");
  notePill.append(noteCheck, noteText);

  const rhythm = make("div", "rhythm");
  const rhythmLabel = make("span", "rhythm-label");
  const dotsWrap = make("div", "dots");
  dotsWrap.setAttribute("aria-hidden", "true");
  const dots = Array.from({ length: 4 }, () => make("span", "dot"));
  dotsWrap.append(...dots);
  rhythm.append(rhythmLabel, dotsWrap);

  const actions = make("div", "actions");
  const primaryBtn = make("button", "primary");
  const secondaryBtn = make("button", "secondary");
  actions.append(primaryBtn, secondaryBtn);

  card.append(closeBtn, stage, badge, title, subtitle, notePill, rhythm, actions);
  root.append(scrim, card);

  let activeId = null;
  let activeNextMode = "short";

  scrim.addEventListener("click", () => onDismiss());
  closeBtn.addEventListener("click", () => onDismiss());
  secondaryBtn.addEventListener("click", () => onDismiss());
  primaryBtn.addEventListener("click", () => onStartNext(activeNextMode));

  const setText = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };

  function update(state) {
    const { celebration, presets, t } = state;
    if (!celebration) {
      if (!root.hidden) {
        root.hidden = true;
        root.inert = true;
        root.classList.remove("fp-celebration-play");
      }
      activeId = null;
      return;
    }

    const isNew = celebration.id !== activeId;
    activeId = celebration.id;
    activeNextMode = celebration.nextMode;

    root.dataset.completedMode = celebration.mode;
    root.dataset.kind = celebration.mode === "focus" ? "focus" : "break";

    const subtitleKey =
      celebration.mode === "focus"
        ? celebration.nextMode === "long"
          ? "focusLong"
          : "focusShort"
        : celebration.mode;

    setText(badge, t.celebrationBadge[celebration.mode]);
    setText(title, t.celebrationTitle[celebration.mode]);
    setText(
      subtitle,
      formatText(t.celebrationSubtitle[subtitleKey], {
        min: celebration.durationMinutes,
      }),
    );

    const hasNote = Boolean(celebration.note);
    notePill.hidden = !hasNote;
    if (hasNote) setText(noteText, celebration.note);

    const count = celebration.completedToday;
    const rhythmTpl = count === 1 ? t.celebrationRhythm : t.celebrationRhythmPlural;
    setText(rhythmLabel, formatText(rhythmTpl, { count }));

    const filled = count ? ((count - 1) % dots.length) + 1 : 0;
    const newestIndex = celebration.mode === "focus" && filled > 0 ? filled - 1 : -1;
    dots.forEach((dot, idx) => {
      dot.classList.toggle("filled", idx < filled);
      dot.classList.toggle("newest", idx === newestIndex);
    });

    setText(
      primaryBtn,
      formatText(t.startNext[celebration.nextMode], {
        min: presets[celebration.nextMode],
      }),
    );
    setText(secondaryBtn, t.dismiss);
    closeBtn.setAttribute("aria-label", t.close);
    closeBtn.title = t.close;

    if (root.hidden || isNew) {
      root.hidden = false;
      root.inert = false;
      root.classList.remove("fp-celebration-play");
      // Force reflow so consecutive round completions cleanly replay the entrance & burst.
      void card.offsetWidth;
      root.classList.add("fp-celebration-play");
    }
  }

  return {
    element: root,
    isOpen: () => !root.hidden,
    update,
  };
}
