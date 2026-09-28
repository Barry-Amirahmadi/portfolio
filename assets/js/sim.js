// Monte Carlo: many possible futures of one setup with a fixed 2R target and a 1R stop.
// Random numbers only - nothing here is a trade record. Seeded, so every visitor sees the same first run.

const TARGET_R = 2;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

export function init(fig, { reduce }) {
  const labels = JSON.parse(fig.dataset.labels || "{}");
  const n0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const n2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (x) => `${n0.format(x)}%`;
  const signed = (x, f) => (x > 0.0005 ? "+" : x < -0.0005 ? "−" : "") + f.format(Math.abs(x));

  const plot = fig.querySelector(".sim-plot");
  const svg = fig.querySelector("[data-sim-svg]");
  const input = fig.querySelector("[data-sim-input]");
  const outP = fig.querySelector("[data-sim-p]");
  const radios = [...fig.querySelectorAll('input[name="sim-n"]')];
  const rerun = fig.querySelector("[data-sim-rerun]");
  const outs = [...fig.querySelectorAll("[data-sim-out]")];
  const insight = fig.querySelector("[data-sim-insight]");

  let seed = 20260925;
  let result = null;

  const paths = () => (matchMedia("(max-width: 759px)").matches ? 36 : 72);

  function simulate(p, n) {
    const rnd = mulberry32(seed);
    const count = paths();
    const curves = [];
    const finals = [];
    const dds = [];
    const streaks = [];
    for (let k = 0; k < count; k++) {
      let eq = 0;
      let peak = 0;
      let dd = 0;
      let run = 0;
      let longest = 0;
      const pts = new Float32Array(n + 1);
      for (let i = 1; i <= n; i++) {
        if (rnd() < p) {
          eq += TARGET_R;
          run = 0;
        } else {
          eq -= 1;
          run++;
          if (run > longest) longest = run;
        }
        if (eq > peak) peak = eq;
        if (peak - eq > dd) dd = peak - eq;
        pts[i] = eq;
      }
      curves.push(pts);
      finals.push(eq);
      dds.push(dd);
      streaks.push(longest);
    }
    const band = { lo: new Float32Array(n + 1), mid: new Float32Array(n + 1), hi: new Float32Array(n + 1) };
    const col = new Float32Array(count);
    for (let i = 0; i <= n; i++) {
      for (let k = 0; k < count; k++) col[k] = curves[k][i];
      col.sort();
      band.lo[i] = quantile(col, 0.1);
      band.mid[i] = quantile(col, 0.5);
      band.hi[i] = quantile(col, 0.9);
    }
    return {
      p,
      n,
      curves,
      band,
      expectancy: p * TARGET_R - (1 - p),
      losing: finals.filter((x) => x < 0).length / count,
      dd: median(dds),
      streak: median(streaks),
    };
  }

  function render(animate) {
    const r = plot.getBoundingClientRect();
    const W = Math.max(280, r.width);
    const H = Math.max(200, r.height);
    const { curves, band, n } = result;
    let lo = 0;
    let hi = 0;
    for (const c of curves)
      for (const v of c) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    const pad = Math.max(4, (hi - lo) * 0.08);
    lo -= pad;
    hi += pad;
    const L = 8;
    const R = 56;
    const T = 14;
    const B = 26;
    const x = (i) => L + (i / n) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const line = (arr) => {
      let d = "";
      const stepI = Math.max(1, Math.floor(n / 240));
      for (let i = 0; i <= n; i += stepI) d += `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(arr[i]).toFixed(1)}`;
      if (n % stepI) d += `L${x(n).toFixed(1)} ${y(arr[n]).toFixed(1)}`;
      return d;
    };

    // horizontal grid at round R values
    const endY = y(band.mid[n]);
    const span = hi - lo;
    const unit = span > 240 ? 50 : span > 120 ? 25 : span > 50 ? 10 : 5;
    let grid = "";
    for (let v = Math.ceil(lo / unit) * unit; v <= hi; v += unit) {
      if (v === 0) continue;
      const label = Math.abs(y(v) - endY) < 16 ? "" : `<text x="${W - R + 8}" y="${(y(v) + 4).toFixed(1)}">${v > 0 ? "+" : "−"}${Math.abs(v)}R</text>`;
      grid += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>${label}`;
    }

    let bandPath = "";
    for (let i = 0; i <= n; i++) bandPath += `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(band.hi[i]).toFixed(1)}`;
    for (let i = n; i >= 0; i--) bandPath += `L${x(i).toFixed(1)} ${y(band.lo[i]).toFixed(1)}`;

    const end = band.mid[n];
    const zeroLabel = Math.abs(y(0) - endY) < 16 ? "" : `<text x="${W - R + 8}" y="${(y(0) + 4).toFixed(1)}">0R</text>`;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <g class="g-grid">${grid}</g>
      <line class="g-zero" x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
      ${zeroLabel}
      <g class="g-draw">
        <path class="g-band" d="${bandPath}Z"/>
        ${curves.map((c) => `<path class="g-path" d="${line(c)}"/>`).join("")}
        <path class="g-median" d="${line(band.mid)}"/>
      </g>
      <text class="g-end" x="${W - R + 8}" y="${(y(end) + 4).toFixed(1)}">${end > 0 ? "+" : end < 0 ? "−" : ""}${Math.abs(Math.round(end))}R</text>
      <text x="${L}" y="${H - 6}">0</text>
      <text x="${W - R}" y="${H - 6}" text-anchor="end">${n} ${labels.axis?.[0] ?? ""}</text>`;

    if (animate && !reduce) {
      plot.classList.remove("is-drawn");
      void plot.offsetWidth;
      requestAnimationFrame(() => plot.classList.add("is-drawn"));
    } else {
      plot.classList.add("is-drawn");
    }
  }

  function readouts(announce) {
    const { p, n, expectancy, losing, dd, streak } = result;
    outs[0].textContent = `${signed(expectancy, n2)}R`;
    outs[1].textContent = pct(losing * 100);
    outs[2].textContent = `${n1.format(dd)}R`;
    outs[3].textContent = n0.format(streak);
    if (!announce) return;
    const P = pct(p * 100);
    const E = `${signed(expectancy, n2)}R`;
    const S = n0.format(streak);
    const Lp = pct(losing * 100);
    const N = n0.format(n);
    let s = `At a ${P} win rate with a 2R target, each trade is worth ${E} on average. Over ${N} trades, half the paths still hit a losing streak of ${S} or more, and ${Lp} of them end in the red.`;
    if (expectancy < -0.005) s += " Below break-even, no amount of discipline saves it.";
    else if (expectancy < 0.05) s += " This close to break-even, luck decides almost everything.";
    else s += " A positive edge doesn't remove losing streaks; it only makes them survivable.";
    insight.textContent = s;
  }

  const state = () => ({
    p: Number(input.value) / 100,
    n: Number(radios.find((r) => r.checked)?.value || 100),
  });

  function run({ animate = false, announce = true } = {}) {
    const { p, n } = state();
    outP.textContent = pct(p * 100);
    result = simulate(p, n);
    render(animate);
    readouts(announce);
  }

  let pending = false;
  input.addEventListener("input", () => {
    outP.textContent = pct(Number(input.value));
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      run({ announce: false });
    });
  });
  input.addEventListener("change", () => run());
  radios.forEach((r) => r.addEventListener("change", () => run({ animate: true })));
  rerun.addEventListener("click", () => {
    seed = (seed * 48271) % 2147483647;
    run({ animate: true });
  });
  let size = "";
  new ResizeObserver(() => {
    const r = plot.getBoundingClientRect();
    const next = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (next === size) return;
    const first = !size;
    size = next;
    if (result && !first) render(false);
  }).observe(plot);

  run({ animate: true });
}
