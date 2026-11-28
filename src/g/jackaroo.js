// ---------------- جاكارو ----------------
// 4 players, partners sit opposite (0&2 vs 1&3). 76-cell square track (19 per side), 4 marbles each.
// Position per marble: -1 = base, 0..75 = progress on track from own start, 76..79 = home lane.
import { UIGame, rnd, shuffle, deck52, rank } from './base.js';

const TRACK = 76, HOME0 = 76, LAST = 79;
const startAbs = (s) => (19 * s + 9) % TRACK;
const absOf = (s, p) => (p >= 0 && p < TRACK ? (startAbs(s) + p) % TRACK : null);
const progOf = (s, abs) => (abs - startAbs(s) + TRACK) % TRACK;
const RN = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J' };
export const cardLabel = (c) => RN[rank(c)] || String(rank(c));

export class Jackaroo extends UIGame {
  constructor() {
    super('jackaroo', 4);
    this.p = [0, 1, 2, 3].map(() => [-1, -1, -1, -1]);
    this.hands = [[], [], [], []]; this.deck = []; this.dealer = rnd(4); this.round = 0;
    this.played = [null, null, null, null]; this.lastMv = null; this.mvId = 0; this.burnFx = null;
    this.deal();
  }
  deal() {
    if (this.deck.length < 16) this.deck = shuffle(deck52());
    for (let i = 0; i < 4; i++) this.hands[i] = this.deck.splice(0, 4).sort((a, b) => rank(a) - rank(b));
    this.round++; this.dealer = (this.dealer + 1) % 4; this.turn = (this.dealer + 1) % 4;
    this.played = [null, null, null, null];
  }
  team(s) { return s % 2; }
  allHome(s, P = this.p) { return P[s].every((x) => x >= HOME0); }
  controlled(s, P = this.p) { return this.allHome(s, P) ? [(s + 2) % 4] : [s]; }
  occupant(abs, P, ex) { for (let o = 0; o < 4; o++) for (let j = 0; j < 4; j++) if (!(ex && ex.s === o && ex.k === j) && absOf(o, P[o][j]) === abs) return { s: o, k: j }; return null; }
  // a marble is a "base" (can't be passed, eaten or swapped) when it sits on its own start, or it is the front of two consecutive marbles
  blockerAt(abs, P, ex) { const o = this.occupant(abs, P, ex); if (!o) return false; if (P[o.s][o.k] === 0) return true; return !!this.occupant((abs - 1 + TRACK) % TRACK, P, ex); }
  fwd(P, s, k, n) {
    const p = P[s][k]; if (p < 0) return null; const me = { s, k };
    for (let i = 1; i <= n; i++) {
      const np = p + i;
      if (np > LAST) return null;
      if (np >= HOME0) { if (P[s].some((x, j) => j !== k && x === np)) return null; continue; }
      const ab = absOf(s, np), o = this.occupant(ab, P, me);
      if (!o) continue;
      if (o.s === s) return null;
      if (this.blockerAt(ab, P, me)) return null;
    }
    const np = p + n; const Q = P.map((r) => r.slice()); const caps = [];
    if (np < HOME0) { const o = this.occupant(absOf(s, np), P, me); if (o) { Q[o.s][o.k] = -1; caps.push(o); } }
    Q[s][k] = np; return { P: Q, caps, seg: [{ s, k, from: p, to: np }] };
  }
  back(P, s, k, n) {
    const p = P[s][k]; if (p < 0 || p >= HOME0) return null; const me = { s, k };
    for (let i = 1; i <= n; i++) {
      const ab = absOf(s, (p - i + TRACK) % TRACK), o = this.occupant(ab, P, me);
      if (!o) continue; if (o.s === s) return null; if (this.blockerAt(ab, P, me)) return null;
    }
    const np = (p - n + TRACK) % TRACK; const Q = P.map((r) => r.slice()); const caps = [];
    const o = this.occupant(absOf(s, np), P, me); if (o) { Q[o.s][o.k] = -1; caps.push(o); }
    Q[s][k] = np; return { P: Q, caps, seg: [{ s, k, from: p, to: np, back: true }] };
  }
  out(P, s) {
    const k = P[s].indexOf(-1); if (k < 0) return null;
    const st = startAbs(s), o = this.occupant(st, P); if (o && (o.s === s || this.blockerAt(st, P))) return null;
    const Q = P.map((r) => r.slice()); const caps = [];
    if (o) { Q[o.s][o.k] = -1; caps.push(o); }
    Q[s][k] = 0; return { P: Q, caps, seg: [{ s, k, from: -1, to: 0 }] };
  }
  swap(P, s, k, t, j) {
    const a = P[s][k], b = P[t][j]; if (a <= 0 || a >= HOME0 || b <= 0 || b >= HOME0) return null;
    const A = absOf(s, a), B = absOf(t, b); if (this.blockerAt(A, P) || this.blockerAt(B, P)) return null;
    const Q = P.map((r) => r.slice());
    Q[s][k] = progOf(s, B); Q[t][j] = progOf(t, A);
    if (Q[s][k] === 0 || Q[t][j] === 0) return null;
    return { P: Q, caps: [], seg: [{ s, k, from: a, to: Q[s][k], jump: true }, { s: t, k: j, from: b, to: Q[t][j], jump: true }] };
  }
  // all legal moves for seat
  moves(seat, P = this.p) {
    const hand = this.hands[seat], res = [], seen = new Set();
    const add = (m, r) => { if (!r) return; const key = JSON.stringify(m); if (seen.has(key)) return; seen.add(key); res.push({ ...m, key, r }); };
    hand.forEach((card, c) => {
      const v = rank(card); const ctl = this.controlled(seat, P);
      for (const s of ctl) {
        if (v === 14 || v === 13) add({ c, kind: 'out', s }, this.out(P, s));
        if (v === 13) continue;
        const fw = v === 14 ? [1, 11] : v === 4 || v === 11 || v === 7 ? [] : [v];
        for (const n of fw) for (let k = 0; k < 4; k++) add({ c, kind: 'fwd', s, k, n }, this.fwd(P, s, k, n));
        if (v === 4) for (let k = 0; k < 4; k++) add({ c, kind: 'back', s, k, n: 4 }, this.back(P, s, k, 4));
        if (v === 11) for (let k = 0; k < 4; k++) for (let t = 0; t < 4; t++) if (t !== s) for (let j = 0; j < 4; j++) add({ c, kind: 'swap', s, k, t, j }, this.swap(P, s, k, t, j));
        if (v === 7) {
          for (let k = 0; k < 4; k++) add({ c, kind: 'fwd', s, k, n: 7 }, this.fwd(P, s, k, 7));
          for (let a = 1; a <= 6; a++) for (let k = 0; k < 4; k++) for (let k2 = 0; k2 < 4; k2++) if (k2 !== k) {
            const r1 = this.fwd(P, s, k, a); if (!r1) continue; const r2 = this.fwd(r1.P, s, k2, 7 - a); if (!r2) continue;
            add({ c, kind: 'split', s, k, n: a, k2, n2: 7 - a }, { P: r2.P, caps: [...r1.caps, ...r2.caps], seg: [...r1.seg, ...r2.seg] });
          }
        }
      }
    });
    if (!res.length) hand.forEach((card, c) => res.push({ c, kind: 'discard', key: JSON.stringify({ c, kind: 'discard' }), r: { P, caps: [], seg: [] } }));
    return res;
  }
  label(m) {
    switch (m.kind) {
      case 'out': return 'نزّل كرة للقاعدة';
      case 'fwd': return `كرة ${m.k + 1} ← ${m.n}`;
      case 'back': return `كرة ${m.k + 1} للخلف ٤`;
      case 'split': return `كرة ${m.k + 1}: ${m.n} + كرة ${m.k2 + 1}: ${m.n2}`;
      case 'swap': return `بدّل كرة ${m.k + 1} مع ${this.nm(m.t)}`;
      case 'discard': return '🔥 ارمي هالورقة';
    }
    return '';
  }
  act(seat, a) {
    this.check(seat);
    if (a.type !== 'play') throw new Error('حركة غلط');
    const ms = this.moves(seat); const m = ms.find((x) => x.key === a.key);
    if (!m) throw new Error('ما تزبط هالحركة');
    const card = this.hands[seat][m.c];
    this.hands[seat].splice(m.c, 1); this.played[seat] = card; this.bump(); (this.pile ||= []).push({ c: card, r: Math.round(Math.random() * 50 - 25), s: seat }); if (this.pile.length > 7) this.pile.shift();
    this.p = m.r.P; this.burnFx = null;
    this.lastMv = { id: ++this.mvId, seat, card, kind: m.kind, seg: m.r.seg, caps: m.r.caps };
    let note = '';
    if (m.kind === 'burn') {
      const nx = (seat + 1) % 4, h = this.hands[nx]; const bc = h.splice(rnd(h.length), 1)[0];
      this.burnFx = { id: this.mvId, s: nx, card: bc }; note = ` 🔥 حرق ورقة ${this.nm(nx)} (${cardLabel(bc)})`;
    } else if (m.kind === 'discard') note = ` حرق ${cardLabel(card)} — ما عنده حركة`;
    else if (m.kind === 'swap') note = ` 🔄 بدّل مع ${this.nm(m.t)}`;
    else if (m.kind === 'out') note = ' نزّل كرة';
    else note = ` لعب ${cardLabel(card)}`;
    if (m.r.caps.length) note += ` 💥 أكل ${m.r.caps.map((o) => this.nm(o.s)).join(' و')}`;
    this.msg = `${this.nm(seat)}${note}`;
    this.scores = [0, 1, 2, 3].map((s) => this.p[s].filter((x) => x >= HOME0).length + this.p[(s + 2) % 4].filter((x) => x >= HOME0).length);
    for (const t of [0, 1]) if (this.allHome(t) && this.allHome(t + 2)) return this.end([t, t + 2], `🏆 فريق ${this.nm(t)} و${this.nm(t + 2)} ربح!`);
    this.wait(900, () => {
      if (this.hands.every((h) => !h.length)) { this.deal(); this.msg = `توزيع جديد — دور ${this.nm(this.turn)}`; return; }
      let n = seat; for (let i = 0; i < 4; i++) { n = (n + 1) % 4; if (this.hands[n].length) break; }
      this.turn = n;
    });
  }
  val(P, s) {
    let v = 0;
    for (let o = 0; o < 4; o++) {
      const sign = this.team(o) === this.team(s) ? 1 : -1;
      for (const x of P[o]) v += sign * (x < 0 ? -15 : x >= HOME0 ? 95 + (x - HOME0) * 3 : x + (x > 60 ? 8 : 0));
    }
    return v;
  }
  botAction(seat) {
    const ms = this.moves(seat); const base = this.val(this.p, seat);
    const keep = (c) => { const v = rank(this.hands[seat][c]); return v === 14 || v === 13 ? 14 : v === 7 || v === 11 ? 10 : v === 4 ? 8 : v === 5 ? 6 : v / 2; };
    let best = ms[0], bv = -1e9;
    for (const m of ms) {
      let v = this.val(m.r.P, seat) - base + Math.random() * 2;
      if (m.kind === 'burn') v += 6; if (m.kind === 'discard') v = -keep(m.c);
      for (const o of m.r.caps) v += this.team(o.s) === this.team(seat) ? -20 : 10;
      v -= keep(m.c) * 0.4;
      if (v > bv) { bv = v; best = m; }
    }
    return { type: 'play', key: best.key };
  }
  view(seat) {
    const v = super.view(seat);
    const cur = this.turn >= 0 ? this.turn : this.turnSave;
    const my = seat === this.turn && !this.over;
    v.jk = { pile: this.pile || [], dealer: this.dealer, p: this.p, hand: seat >= 0 ? this.hands[seat] : [], counts: this.hands.map((h) => h.length), cur, played: this.played, last: this.lastMv, burn: this.burnFx, round: this.round, deck: this.deck.length,
      legal: my ? this.moves(seat).map((m) => ({ key: m.key, c: m.c, kind: m.kind, s: m.s, k: m.k, t: m.t, j: m.j, k2: m.k2, n: m.n, n2: m.n2, label: this.label(m), seg: m.r.seg, caps: m.r.caps.length })) : [] };
    return v;
  }
  ui(seat) { return { blocks: [{ k: 'text', t: this.msg || 'جاكارو', cls: 'lead' }] }; }
}
