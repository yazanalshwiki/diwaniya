import { W, LETTERS, CATS } from './wordsdata.js';

const ROUNDS = 5, WRITE_MS = 75000, STOP_MS = 8000, SHOW_MS = 7000;
export const norm = (s) => String(s || '').trim().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ');
const firstOk = (w, L) => {
  const n = norm(w); const l = norm(L);
  if (n.length < 2) return false;
  if (n[0] === l) return true;
  return n.startsWith('ال') && n[2] === l;
};
const known = (cat, L) => (W[L] ? W[L][cat].split(' ').map(norm) : []);
const keyOf = (w) => norm(w).replace(/^ال/, '');

export class Words {
  constructor() {
    this.type = 'words';
    this.scores = [0, 0, 0, 0];
    this.round = 0;
    this.used = [];
    this.turn = -1;
    this.over = false;
    this.winners = [];
    this.history = { length: 0 };
    this.phase = 'write'; this.endsAt = Date.now() + 999999; this.ans = [[], [], [], []]; this.done = [false, false, false, false];
  }
  init() { this.nextRound(); }
  bot(i) { return this.isBot ? this.isBot(i) : true; }
  nm(i) { return (this.names && this.names[i]) || `لاعب ${i + 1}`; }
  nextRound() {
    if (this.round >= ROUNDS) return this.finish();
    this.round++;
    const free = LETTERS.filter((l) => !this.used.includes(l));
    this.L = free[Math.floor(Math.random() * free.length)]; this.used.push(this.L);
    this.phase = 'write';
    this.ans = [0, 1, 2, 3].map(() => Array(5).fill(''));
    this.done = [false, false, false, false];
    this.stopBy = -1;
    this.endsAt = Date.now() + WRITE_MS;
    this.history.length++;
    this.botPlan = [0, 1, 2, 3].map((i) => (this.bot(i) ? { at: Date.now() + 25000 + Math.random() * 40000 } : null));
  }
  get pending() {
    if (this.over) return null;
    let next = this.endsAt;
    if (this.phase === 'write') for (const [i, b] of (this.botPlan || []).entries()) if (b && !this.done[i]) next = Math.min(next, b.at);
    return { delay: Math.max(30, next - Date.now()) };
  }
  act(seat, a) {
    if (this.over) throw new Error('اللعبة انتهت');
    if (this.phase !== 'write') throw new Error('استنى الجولة الجاية');
    if (a.type === 'fill') {
      if (this.done[seat]) return;
      const w = Array.isArray(a.w) ? a.w.slice(0, 5).map((x) => String(x || '').slice(0, 24)) : [];
      for (let k = 0; k < 5; k++) this.ans[seat][k] = w[k] || '';
      if (a.stop) this.finishSeat(seat);
      return;
    }
    throw new Error('حركة غلط');
  }
  finishSeat(seat) {
    this.done[seat] = true;
    if (this.stopBy < 0) { this.stopBy = seat; this.endsAt = Math.min(this.endsAt, Date.now() + STOP_MS); }
    if (this.done.every(Boolean)) this.endsAt = Date.now();
  }
  botFill(i, prob = 0.78) {
    const L = this.L;
    this.ans[i] = CATS.map((_, k) => { const ws = W[L][k].split(' '); return Math.random() < prob ? ws[Math.floor(Math.random() * ws.length)] : ''; });
    this.finishSeat(i);
  }
  tick() {
    const now = Date.now();
    if (this.phase === 'write') {
      for (const [i, b] of this.botPlan.entries()) if (b && !this.done[i] && now >= b.at) this.botFill(i);
      if (now >= this.endsAt) this.score();
      return;
    }
    if (this.phase === 'show' && now >= this.endsAt) this.nextRound();
  }
  score() {
    const L = this.L;
    for (const [i, b] of this.botPlan.entries()) if (b && !this.done[i]) { this.ans[i] = []; this.botFill(i, 0.45); }
    this.res = [0, 1, 2, 3].map(() => Array(5).fill(null));
    for (let k = 0; k < 5; k++) {
      const kn = known(k, L);
      const keys = this.ans.map((r) => (firstOk(r[k], L) ? keyOf(r[k]) : ''));
      for (let i = 0; i < 4; i++) {
        const w = this.ans[i][k];
        if (!keys[i]) { this.res[i][k] = { w, p: 0, bad: !!norm(w) }; continue; }
        const dup = keys.filter((x) => x === keys[i]).length > 1;
        const p = dup ? 5 : 10;
        this.res[i][k] = { w, p, dup, ok: kn.includes(norm(w)) || kn.includes(keyOf(w)) };
      }
    }
    this.gain = this.res.map((r) => r.reduce((t, x) => t + x.p, 0));
    this.gain.forEach((g, i) => (this.scores[i] += g));
    this.phase = 'show'; this.endsAt = Date.now() + SHOW_MS;
  }
  finish() {
    this.over = true; this.phase = 'over';
    const m = Math.max(...this.scores);
    this.winners = [0, 1, 2, 3].filter((i) => this.scores[i] === m);
  }
  view(seat) {
    return { type: 'words', phase: this.phase, L: this.L, round: this.round, rounds: ROUNDS, cats: CATS, scores: this.scores, turn: -1,
      done: this.done, stopBy: this.stopBy, msLeft: Math.max(0, this.endsAt - Date.now()),
      mine: seat >= 0 ? this.ans[seat] : null, res: this.phase !== 'write' ? this.res : null, gain: this.phase !== 'write' ? this.gain : null,
      over: this.over, winners: this.winners, history: this.history, hand: [], handCounts: [0, 0, 0, 0], trick: [], legal: [],
      rank: [0, 1, 2, 3].map((i) => ({ seat: i, score: this.scores[i] })) };
  }
  botAction() { return { type: 'noop' }; }
}
