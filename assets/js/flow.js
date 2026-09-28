// Hero: a queue in front of a bottleneck.
// Scattered input drifts toward a narrow gate, piles up behind it, and leaves in ordered lanes.
// Scrolling opens the gate; the meter shows the throughput this simulation actually measures.
// Coordinates: u runs along the flow (0 = input, 1 = output), v runs across it (-1..1).

const U_GATE = 0.5;
const GATE_LEN = 0.02;
const TAPER_FROM = 0.3;
const OUT_W = 0.62;
const LANES = 5;

export function init(fig, { reduce, meter }) {
  const canvas = fig.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  let W = 0;
  let H = 0;
  let dpr = 1;
  let vertical = false;
  let colors = {};
  let pool = [];
  let queue = [];
  let lambda = 24; // arrivals per second
  let open = 0; // 0 closed .. 1 open, eased toward target
  let target = 0;
  let tokens = 0;
  let passes = 0;
  let rate = 0;
  let rateClock = 0;
  let released = 0;
  let spawnDebt = 0;
  let running = false;
  let visible = true;
  let last = 0;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const aperture = () => 0.09 + open * 0.46;
  const capacity = () => lambda * (0.32 + open * 2.3);

  function halfWidth(u) {
    const a = aperture();
    if (u < TAPER_FROM) return 1;
    if (u < U_GATE) {
      const t = (u - TAPER_FROM) / (U_GATE - TAPER_FROM);
      const e = t * t * (3 - 2 * t);
      return 1 + (a - 1) * e;
    }
    if (u < U_GATE + GATE_LEN) return a;
    const t = Math.min(1, (u - U_GATE - GATE_LEN) / 0.1);
    return a + (OUT_W - a) * t;
  }

  // flow coordinates -> canvas pixels
  function toXY(u, v) {
    if (vertical) {
      const cx = W * 0.65;
      return [cx + v * W * 0.29, H * 0.04 + u * H * 0.92];
    }
    const x = W * (0.02 + u * 0.96);
    return [x, H * 0.56 + v * H * 0.33];
  }

  function readColors() {
    const cs = getComputedStyle(fig);
    colors = {
      fg: cs.getPropertyValue("--fg").trim() || "#121210",
      mute: cs.getPropertyValue("--mute").trim() || "#5f5d56",
      rule: cs.getPropertyValue("--rule-2").trim() || "rgba(0,0,0,.3)",
      signal: cs.getPropertyValue("--signal").trim() || "#e8430c",
    };
  }

  function makeParticle() {
    return { on: false, u: 0, v: 0, vv: 0, sp: 0, state: 0, lane: 0, hot: false };
  }

  function spawn(p) {
    p.on = true;
    p.u = -0.02 - rand() * 0.02;
    p.v = (rand() * 2 - 1) * 0.92;
    p.vv = 0;
    p.sp = 0.075 + rand() * 0.07;
    p.state = 0;
    p.hot = false;
  }

  function build() {
    const r = fig.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wasVertical = vertical;
    vertical = W < 760;
    const n = vertical ? 170 : W < 1100 ? 240 : 320;
    lambda = vertical ? 15 : W < 1100 ? 20 : 26;
    if (pool.length !== n || wasVertical !== vertical) {
      pool = Array.from({ length: n }, makeParticle);
      queue = [];
    }
    readColors();
  }

  function step(dt) {
    open += (target - open) * Math.min(1, dt * 2.4);
    tokens = Math.min(2, tokens + capacity() * dt);

    // arrivals
    spawnDebt += lambda * dt;
    while (spawnDebt >= 1) {
      spawnDebt -= 1;
      const p = pool.find((q) => !q.on);
      if (!p) {
        spawnDebt = 0;
        break;
      }
      spawn(p);
    }

    // departures through the gate, first in first out
    while (tokens >= 1 && queue.length) {
      tokens -= 1;
      const p = queue.shift();
      p.state = 2;
      p.lane = released % LANES;
      p.hot = released % 7 === 3;
      released++;
      passes++;
    }

    for (let k = 0; k < queue.length; k++) {
      // the queue compacts toward the gate; rank decides how far back a unit stands
      const p = queue[k];
      const want = U_GATE - 0.006 - Math.sqrt(k) * (vertical ? 0.02 : 0.0135);
      p.u += (want - p.u) * Math.min(1, dt * 5);
      const hw = halfWidth(p.u) * 0.9;
      p.v += (rand() - 0.5) * 0.25 * dt;
      if (p.v > hw) p.v = hw;
      if (p.v < -hw) p.v = -hw;
    }

    for (const p of pool) {
      if (!p.on || p.state === 1) continue;
      if (p.state === 0) {
        p.vv += (rand() - 0.5) * 2.2 * dt;
        p.vv *= 0.97;
        p.v += p.vv * dt;
        p.u += p.sp * dt;
        const hw = halfWidth(p.u) * 0.94;
        if (p.v > hw) {
          p.v = hw;
          p.vv = -Math.abs(p.vv);
        } else if (p.v < -hw) {
          p.v = -hw;
          p.vv = Math.abs(p.vv);
        }
        const stop = U_GATE - 0.006 - Math.sqrt(queue.length) * (vertical ? 0.02 : 0.0135);
        if (p.u >= stop) {
          p.state = 1;
          queue.push(p);
        }
      } else {
        // processed: constant speed, settle into a lane
        p.u += 0.12 * dt;
        const lv = (-0.5 + p.lane / (LANES - 1)) * (p.u > U_GATE + GATE_LEN ? 1 : aperture() / OUT_W);
        p.v += (lv - p.v) * Math.min(1, dt * 3.2);
        if (p.u > 1.02) p.on = false;
      }
    }

    rateClock += dt;
    if (rateClock >= 0.5) {
      const now = passes / rateClock;
      rate = rate ? rate * 0.6 + now * 0.4 : now;
      passes = 0;
      rateClock = 0;
      if (meter) meter.textContent = fmt.format(rate);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // funnel walls
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1;
    for (const side of [1, -1]) {
      ctx.beginPath();
      for (let u = TAPER_FROM - 0.04; u <= U_GATE + GATE_LEN + 0.1; u += 0.004) {
        const [x, y] = toXY(u, side * halfWidth(u) * 1.02);
        if (u === TAPER_FROM - 0.04) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // output lanes
    ctx.setLineDash([2, 6]);
    for (let l = 0; l < LANES; l++) {
      const v = -0.5 + l / (LANES - 1);
      const [x1, y1] = toXY(U_GATE + GATE_LEN + 0.12, v);
      const [x2, y2] = toXY(1, v);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // the gate
    ctx.strokeStyle = colors.signal;
    ctx.lineWidth = 2.5;
    for (const side of [1, -1]) {
      const a = aperture() * 1.02 * side;
      const [x1, y1] = toXY(U_GATE, a);
      const [x2, y2] = toXY(U_GATE + GATE_LEN, a);
      const [x3, y3] = toXY(U_GATE, a + side * 0.16);
      ctx.beginPath();
      ctx.moveTo(x3, y3);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // units
    const s = vertical ? 2.6 : 2.8;
    for (const p of pool) {
      if (!p.on || p.u < 0) continue;
      const [x, y] = toXY(p.u, p.v);
      if (p.state === 0) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = colors.mute;
      } else if (p.state === 1) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.fg;
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.hot ? colors.signal : colors.fg;
      }
      const size = p.hot ? s + 1.4 : s;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduce || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
  }

  function scrollTarget() {
    const r = fig.getBoundingClientRect();
    // closed at load; fully open once the band has scrolled up to the header
    target = Math.min(1, Math.max(0, 1 - (r.top - 64) / Math.max(1, fig.offsetTop - 64)));
  }

  // a static, pre-simulated frame for reduced motion
  function still() {
    target = 0;
    open = 0;
    for (let k = 0; k < 60 * 9; k++) step(1 / 60);
    draw();
  }

  build();
  if (reduce) {
    still();
    new ResizeObserver(() => {
      build();
      draw();
    }).observe(fig);
    return;
  }
  // warm up so the first frame already shows a queue
  for (let k = 0; k < 60 * 8; k++) step(1 / 60);
  scrollTarget();
  draw();
  start();

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    visible ? start() : stop();
  }).observe(fig);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  addEventListener("scroll", scrollTarget, { passive: true });
  new ResizeObserver(() => {
    build();
    if (!running) draw();
  }).observe(fig);
}
