// Shared 8-ball physics — runs identically on the server (authoritative) and in the browser (animation).
export const W = 100, H = 190, R = 3;
export const POCKETS = [
  [1.5, 1.5], [W - 1.5, 1.5], [-0.8, H / 2], [W + 0.8, H / 2], [1.5, H - 1.5], [W - 1.5, H - 1.5],
];
const POCKET_R = 5.3;
const MOUTH = 7.5; // cushion gap around a pocket
const DT = 1 / 120;
const FRICTION = 0.998; // per step velocity factor (rolling)
const DECEL = 18; // linear decel units/s^2
const MAX_SPEED = 500;
export const STEP_MS = 1000 / 120;

export function rack() {
  // cue at the bottom, rack triangle at the top, 8 in the middle of row 3
  const balls = [{ n: 0, x: W / 2, y: H * 0.75, vx: 0, vy: 0, in: false }];
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  // ensure 8 sits at the centre of the third row (index 4)
  const rows = [];
  let k = 0;
  const top = H * 0.27, d = R * 2 + 0.05;
  for (let row = 0; row < 5; row++) {
    for (let j = 0; j <= row; j++) {
      const n = order[k++];
      rows.push({ n, x: W / 2 + (j - row / 2) * d, y: top - row * d * 0.866, vx: 0, vy: 0, in: false });
    }
  }
  return balls.concat(rows);
}

const clone = (b) => b.map((x) => ({ ...x }));
const nearPocket = (x, y) => POCKETS.some(([px, py]) => Math.hypot(px - x, py - y) < MOUTH + R);

// Simulate a shot. Returns { balls, events:{first, pocketed:[n...], cushion}, steps, frames? }
export function simulate(start, angle, power, recordEvery = 0) {
  const b = clone(start);
  const cue = b.find((x) => x.n === 0);
  const sp = Math.max(0.05, Math.min(1, power)) * MAX_SPEED;
  cue.vx = Math.cos(angle) * sp; cue.vy = Math.sin(angle) * sp;
  const ev = { first: null, pocketed: [], rails: 0 };
  const frames = [];
  let steps = 0;
  for (; steps < 120 * 25; steps++) {
    let moving = false;
    for (const p of b) {
      if (p.in) continue;
      const v = Math.hypot(p.vx, p.vy);
      if (v === 0) continue;
      p.x += p.vx * DT; p.y += p.vy * DT;
      let nv = v * FRICTION - DECEL * DT;
      if (nv < 0.6) nv = 0;
      if (nv === 0) { p.vx = 0; p.vy = 0; } else { p.vx *= nv / v; p.vy *= nv / v; moving = true; }
      // pockets
      for (const [px, py] of POCKETS) if (Math.hypot(px - p.x, py - p.y) < POCKET_R) { p.in = true; p.vx = p.vy = 0; ev.pocketed.push(p.n); break; }
      if (p.in) continue;
      // cushions (open near pockets)
      if (!nearPocket(p.x, p.y)) {
        if (p.x < R) { p.x = R; p.vx = -p.vx * 0.8; ev.rails++; }
        else if (p.x > W - R) { p.x = W - R; p.vx = -p.vx * 0.8; ev.rails++; }
        if (p.y < R) { p.y = R; p.vy = -p.vy * 0.8; ev.rails++; }
        else if (p.y > H - R) { p.y = H - R; p.vy = -p.vy * 0.8; ev.rails++; }
      } else {
        // keep balls from escaping the table outside the pocket mouth
        if (p.x < -R * 2 || p.x > W + R * 2 || p.y < -R * 2 || p.y > H + R * 2) { p.in = true; p.vx = p.vy = 0; ev.pocketed.push(p.n); }
      }
    }
    // ball-ball collisions
    for (let i = 0; i < b.length; i++) {
      const a = b[i]; if (a.in) continue;
      for (let j = i + 1; j < b.length; j++) {
        const c = b[j]; if (c.in) continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const overlap = 2 * R - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2; c.x += nx * overlap / 2; c.y += ny * overlap / 2;
        const rv = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (rv <= 0) continue;
        const imp = rv * 0.96;
        a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny;
        if (ev.first === null) { if (a.n === 0) ev.first = c.n; else if (c.n === 0) ev.first = a.n; }
        moving = true;
      }
    }
    if (recordEvery && steps % recordEvery === 0) frames.push(b.map((p) => [p.x, p.y, p.in ? 1 : 0]));
    if (!moving) break;
  }
  if (recordEvery) frames.push(b.map((p) => [p.x, p.y, p.in ? 1 : 0]));
  for (const p of b) { p.vx = 0; p.vy = 0; p.x = Math.round(p.x * 1000) / 1000; p.y = Math.round(p.y * 1000) / 1000; }
  return { balls: b, events: ev, steps, frames };
}

// Put the cue ball back on the table (after a scratch) at the first free spot
export function respot(balls) {
  const cue = balls.find((x) => x.n === 0);
  cue.in = false;
  for (let k = 0; k < 40; k++) {
    const x = W / 2 + ((k % 7) - 3) * R * 2.5, y = H * 0.75 + Math.floor(k / 7) * R * 2.5;
    if (balls.every((o) => o.n === 0 || o.in || Math.hypot(o.x - x, o.y - y) > 2.2 * R)) { cue.x = x; cue.y = y; return; }
  }
  cue.x = W / 2; cue.y = H * 0.75;
}
