import { rack, simulate, respot, POCKETS, R, W, H, STEP_MS } from './poolphys.js';

const isSolid = (n) => n >= 1 && n <= 7;
const isStripe = (n) => n >= 9 && n <= 15;

export class Pool {
  constructor() {
    this.type = 'pool';
    this.balls = rack();
    this.turn = Math.floor(Math.random() * 2);
    this.group = [null, null]; // 'solid' | 'stripe'
    this.shot = null; // {id, seat, angle, power, from}
    this.shotId = 0;
    this.pending = null;
    this.over = false;
    this.winners = [];
    this.history = { length: 0 };
    this.msg = 'الكسرة — اضرب!';
    this.fouls = [0, 0];
    this.broken = false;
  }
  check(seat) {
    if (this.over) throw new Error('اللعبة انتهت');
    if (this.pending) throw new Error('انتظر الطابات توقف');
    if (seat !== this.turn) throw new Error('مو دورك');
  }
  nm(i) { return (this.names && this.names[i]) || `لاعب ${i + 1}`; }
  mine(seat) { const g = this.group[seat]; return this.balls.filter((b) => !b.in && (g === 'solid' ? isSolid(b.n) : g === 'stripe' ? isStripe(b.n) : b.n !== 0 && b.n !== 8)); }
  cleared(seat) { return this.group[seat] && this.mine(seat).length === 0; }
  act(seat, a) {
    this.check(seat);
    if (a.type !== 'shoot') throw new Error('اضرب');
    const angle = +a.angle, power = +a.power;
    if (!Number.isFinite(angle) || !Number.isFinite(power)) throw new Error('ضربة غلط');
    if (this.bih && a.cue && Number.isFinite(+a.cue.x) && Number.isFinite(+a.cue.y)) {
      const x = +a.cue.x, y = +a.cue.y;
      if (x < R || x > W - R || y < R || y > H - R) throw new Error('حط الطابة جوّا الطاولة');
      if (this.balls.some((b) => b.n !== 0 && !b.in && Math.hypot(b.x - x, b.y - y) < 2 * R)) throw new Error('الطابة فوق طابة تانية');
      const cue = this.balls.find((b) => b.n === 0); cue.x = x; cue.y = y; cue.in = false;
    }
    this.bih = false;
    this.shoot(seat, angle, Math.max(0.05, Math.min(1, power)));
  }
  shoot(seat, angle, power) {
    const from = this.balls.map((b) => ({ ...b }));
    const res = simulate(from, angle, power);
    this.shotId++;
    this.history.length++;
    this.shot = { id: this.shotId, seat, angle, power, from };
    this.balls = res.balls;
    this.lastPots = res.events.pocketed.filter((n) => n !== 0);
    this.resolve(seat, res.events);
    this.pending = { delay: Math.min(9000, res.steps * STEP_MS + 500), fn: 'settle' };
    this.nextTurn = this.turn; this.turn = -1;
  }
  resolve(seat, ev) {
    const opp = 1 - seat;
    const pots = ev.pocketed.filter((n) => n !== 0);
    const scratch = ev.pocketed.includes(0);
    const g = this.group[seat];
    let foul = null;
    if (ev.first === null) foul = 'ما لمست ولا طابة';
    else if (scratch) foul = 'الطابة البيضا وقعت';
    else if (g && ev.first === 8 && !this.cleared(seat) && !(this.mine(seat).length === 0)) foul = 'لمست الـ8 قبل وقتها';
    else if (g === 'solid' && isStripe(ev.first)) foul = 'لمست طابة الخصم أولاً';
    else if (g === 'stripe' && isSolid(ev.first)) foul = 'لمست طابة الخصم أولاً';
    const wasBreak = !this.broken; this.broken = true;
    // 8 ball
    if (pots.includes(8)) {
      const legal = g && this.mine(seat).length === 0 && !foul && !wasBreak;
      if (wasBreak && !scratch) { // 8 on the break: re-spot it
        const e = this.balls.find((b) => b.n === 8); e.in = false; e.x = W / 2; e.y = H * 0.27 - 2 * (R * 2 + 0.05) * 0.866;
      } else {
        this.over = true; this.winners = [legal ? seat : opp];
        this.msg = legal ? `🎱 ${this.nm(seat)} دخّل الـ8 وربح!` : `💥 ${this.nm(seat)} دخّل الـ8 غلط — ${this.nm(opp)} ربح`;
        this.afterTurn = opp; return;
      }
    }
    // assign groups
    if (!g && !foul && !wasBreak) {
      const firstPot = pots.find((n) => n !== 8);
      if (firstPot) { this.group[seat] = isSolid(firstPot) ? 'solid' : 'stripe'; this.group[opp] = isSolid(firstPot) ? 'stripe' : 'solid'; }
    }
    if (scratch) respot(this.balls);
    const g2 = this.group[seat];
    const ownPot = pots.some((n) => n !== 8 && (!g2 || (g2 === 'solid' ? isSolid(n) : isStripe(n))));
    if (foul) { this.fouls[seat]++; this.afterTurn = opp; this.bihNext = true; this.msg = `❌ فاول: ${foul} — ${this.nm(opp)} بيحط الطابة البيضا وين ما بدو`; }
    else if (ownPot) { this.afterTurn = seat; this.msg = `✅ ${this.nm(seat)} دخّل ${pots.filter((n) => n !== 8).length > 1 ? 'طابات' : 'طابة'} — كمّل`; }
    else { this.afterTurn = opp; this.msg = `دور ${this.nm(opp)}`; }
    if (!g && this.group[seat]) this.msg += ` • ${this.nm(seat)}: ${this.group[seat] === 'solid' ? 'السادة 🔴' : 'المخططة 🟡'}`;
  }
  tick() { const p = this.pending; if (!p) return; this.pending = null; this.settle(); }
  settle() { if (this.over) { this.turn = -1; return; } this.turn = this.afterTurn; this.bih = !!this.bihNext; this.bihNext = false; }
  view(seat) {
    return {
      type: 'pool', turn: this.turn, balls: this.balls, bih: !!this.bih, last: this.lastPots || [], shot: this.shot, group: this.group, msg: this.msg, over: this.over, winners: this.winners,
      history: this.history, hand: [], handCounts: [0, 0], trick: [], legal: [], scores: [0, 1].map((i) => 7 - (this.group[i] ? this.mine(i).length : 7)),
      left: [0, 1].map((i) => (this.group[i] ? this.mine(i).length : null)),
      rank: [0, 1].map((i) => ({ seat: i, score: this.winners.includes(i) ? '🏆' : `${7 - (this.group[i] ? this.mine(i).length : 7)} طابات` })),
    };
  }
  botAction(seat) {
    const cue = this.balls.find((b) => b.n === 0);
    let targets = this.mine(seat);
    if (this.group[seat] && !targets.length) targets = this.balls.filter((b) => b.n === 8 && !b.in);
    if (!this.broken) return { type: 'shoot', angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.04, power: 1 };
    const cands = [];
    for (const t of targets) for (const [px, py] of POCKETS) {
      const dx = px - t.x, dy = py - t.y, d = Math.hypot(dx, dy);
      const gx = t.x - (dx / d) * 2 * R, gy = t.y - (dy / d) * 2 * R; // ghost ball
      const ang = Math.atan2(gy - cue.y, gx - cue.x);
      // cut angle sanity
      const c1 = Math.atan2(dy, dx);
      let cut = Math.abs(((ang - c1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (cut > 1.2) continue;
      cands.push({ ang, score: d + Math.hypot(gx - cue.x, gy - cue.y) + cut * 40, t: t.n });
    }
    cands.sort((a, b) => a.score - b.score);
    const want = (n) => targets.some((t) => t.n === n);
    let best = null;
    for (const c of cands.slice(0, 8)) for (const pw of [0.45, 0.7, 0.95]) {
      const res = simulate(this.balls, c.ang, pw);
      const ev = res.events;
      if (ev.pocketed.includes(0)) continue;
      if (ev.first === null || !want(ev.first) && !(this.group[seat] === null && ev.first !== 8)) continue;
      if (ev.pocketed.includes(8) && !(targets.length === 1 && targets[0].n === 8)) continue;
      const good = ev.pocketed.filter((n) => want(n) || (!this.group[seat] && n !== 8 && n !== 0)).length;
      const sc = good * 10 - pw;
      if (!best || sc > best.sc) best = { sc, ang: c.ang, pw };
      if (good) break;
    }
    // human-ish inaccuracy
    if (best) return { type: 'shoot', angle: best.ang + (Math.random() - 0.5) * 0.05, power: best.pw };
    const t = targets[0] || this.balls.find((b) => !b.in && b.n !== 0);
    return { type: 'shoot', angle: Math.atan2(t.y - cue.y, t.x - cue.x), power: 0.6 };
  }
}
