// Page behaviour. Everything here is enhancement: the page is complete without it.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------ process nav: active step + progress line */
const head = $("[data-head]");
const fill = $("[data-progress]");
const line = fill?.parentElement;
const links = $$("[data-nav]");
const sections = links.map((a) => document.getElementById(a.dataset.nav));

let starts = [];
let stops = []; // fraction along the nav line where each step's symbol sits
let active = -2;

function measure() {
  const y = scrollY;
  starts = sections.map((s) => s.getBoundingClientRect().top + y - innerHeight * 0.4);
  if (!line) return;
  const lr = line.getBoundingClientRect();
  stops = links.map((a) => {
    const r = a.querySelector(".sym").getBoundingClientRect();
    const c = r.left + r.width / 2 - lr.left;
    const f = lr.width ? c / lr.width : 0;
    return clamp(f);
  });
}

function update() {
  const y = scrollY;
  head?.classList.toggle("is-scrolled", y > 8);
  const atEnd = y + innerHeight >= document.documentElement.scrollHeight - 4;
  let i = -1;
  for (let k = 0; k < starts.length; k++) if (y >= starts[k]) i = k;
  if (atEnd) i = starts.length - 1;

  let p = 0;
  if (i >= 0 && stops.length) {
    const next = i + 1 < starts.length ? starts[i + 1] : null;
    const frac = next == null || atEnd ? 0 : clamp((y - starts[i]) / (next - starts[i]));
    const a = stops[i];
    const b = i + 1 < stops.length ? stops[i + 1] : a;
    p = a + (b - a) * frac;
  } else if (stops.length && starts.length) {
    // hero: grow toward the first symbol
    p = stops[0] * clamp(y / Math.max(1, starts[0]));
  }
  if (fill) fill.style.transform = `scaleX(${p.toFixed(4)})`;

  if (i !== active) {
    active = i;
    links.forEach((a, k) => {
      a.classList.toggle("is-active", k === i);
      if (k === i) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }
}

let queued = false;
const onScroll = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    update();
  });
};
measure();
update();
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", () => {
  measure();
  update();
});
addEventListener("load", () => {
  measure();
  update();
});
new ResizeObserver(() => {
  measure();
  onScroll();
}).observe(document.body);

/* ------------------------------------------------------------ reveal (only what starts below the fold) */
const revealTargets = $$(
  ".sec-tag, .sec-title, .sec-intro, .layer, .mix-data, .matrix-fig, .case-index, .case-head, .case-specs, .crow, .pchart, .principles li, .trade-intro, .trade-facts > div, .sim, .ledger-box, .creds, .contact-text, .contact-mail",
);
if (!reduce.matches && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
  );
  for (const el of revealTargets) {
    if (el.getBoundingClientRect().top > innerHeight) {
      el.classList.add("rv");
      io.observe(el);
    }
  }
}

/* ------------------------------------------------------------ diagrams animate only while visible */
const liveIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) e.target.classList.toggle("is-live", e.isIntersecting);
  },
  { threshold: 0.2 },
);
$$("[data-dg], [data-tree]").forEach((el) => liveIO.observe(el));

/* ------------------------------------------------------------ Kheirian scrubber: scroll-linked until touched */
for (const fig of $$("[data-scrub]")) {
  const input = $("[data-scrub-input]", fig);
  let manual = false;
  const set = (v) => {
    fig.style.setProperty("--s", String(v));
    input.value = String(Math.round(v * 100));
  };
  input.addEventListener("input", () => {
    manual = true;
    fig.style.setProperty("--s", String(input.value / 100));
  });
  if (reduce.matches) continue;
  const onScrub = () => {
    if (manual) return;
    const r = fig.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    // closed while entering, fully exploded by the time it reaches the upper third
    set(clamp((innerHeight * 0.85 - r.top) / (innerHeight * 0.55)));
  };
  addEventListener("scroll", () => requestAnimationFrame(onScrub), { passive: true });
  onScrub();
}

/* ------------------------------------------------------------ process chart: the zigzag line between marked symbols */
const pchart = $("[data-pchart]");
if (pchart) {
  const box = $(".pchart-box", pchart);
  const poly = $("polyline", pchart);
  const draw = () => {
    const b = box.getBoundingClientRect();
    const pts = $$(".pc-c.is-on .sym", box).map((s) => {
      const r = s.getBoundingClientRect();
      return `${(r.left + r.width / 2 - b.left + box.scrollLeft).toFixed(1)},${(r.top + r.height / 2 - b.top).toFixed(1)}`;
    });
    poly.setAttribute("points", pts.join(" "));
  };
  draw();
  new ResizeObserver(draw).observe(box);
  document.fonts?.ready.then(draw);
}

/* ------------------------------------------------------------ copy e-mail */
for (const btn of $$("[data-copy]")) {
  const label = btn.textContent;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = btn.dataset.copied;
    } catch {
      location.href = `mailto:${btn.dataset.copy}`;
      return;
    }
    setTimeout(() => (btn.textContent = label), 1800);
  });
}

/* ------------------------------------------------------------ modules loaded on demand */
const flowEl = $("[data-flow]");
// with reduced motion the gate never opens, so the hint to scroll would be a false promise
if (reduce.matches) $(".meter-hint")?.setAttribute("hidden", "");
if (flowEl) {
  import("./flow.js").then((m) => m.init(flowEl, { reduce: reduce.matches, meter: $("[data-meter]") }));
}
const simEl = $("[data-sim]");
if (simEl) {
  const load = () => import("./sim.js").then((m) => m.init(simEl, { reduce: reduce.matches }));
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        load();
      }
    },
    { rootMargin: "600px 0px" },
  );
  io.observe(simEl);
}
