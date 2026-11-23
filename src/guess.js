import { Q, CATS } from './guessdata.js';

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const N_Q = 10, HINT_MS = 6000, Q_MS = 20000, REVEAL_MS = 4000, PICK_MS = 15000;
const PTS = [30, 20, 10];

export class Guess {
  constructor() {
    this.type = 'guess';
    this.phase = 'pick';
    this.scores = [0, 0, 0, 0];
    this.qn = 0;
    this.turn = -1;
    this.over = false;
    this.winners = [];
    this.history = { length: 0 };
    this.cat = null;
    this.t0 = Date.now();
    this.endsAt = Date.now() + PICK_MS;
  }
  get deadline() { return null; }
  get pending() {
    if (this.over) return null;
    let next = this.endsAt;
    if (this.phase === 'q') {
      for (let k = 1; k < 3; k++) { const t = this.t0 + k * HINT_MS; if (t > Date.now()) next = Math.min(next, t); }
      for (const b of this.botPlan || []) if (b && !this.ans[b.seat]) next = Math.min(next, b.at);
    }
    if (this.phase === 'pick' && this.chooser() < 0) next = Date.now();
    return { delay: Math.max(30, next - Date.now()) };
  }
  bot(i) { return this.isBot ? this.isBot(i) : true; }
  chooser() { for (let i = 0; i < 4; i++) if (this.isHuman && this.isHuman(i) && !this.bot(i)) return i; return -1; }
  nm(i) { return (this.names && this.names[i]) || `لاعب ${i + 1}`; }
  act(seat, a) {
    if (this.over) throw new Error('اللعبة انتهت');
    if (a.type === 'cat') {
      if (this.phase !== 'pick') throw new Error('الفئة انختارت');
      if (seat !== this.chooser()) throw new Error('غيرك عم يختار');
      if (a.c !== 'mix' && !CATS[a.c]) throw new Error('فئة غلط');
      this.start(a.c);
      return;
    }
    if (a.type === 'ans') {
      if (this.phase !== 'q') throw new Error('استنى السؤال');
      if (this.ans[seat]) throw new Error('جاوبت');
      const o = +a.o;
      if (!(o >= 0 && o < 4)) throw new Error('جواب غلط');
      this.answer(seat, o);
      this.maybeEnd();
      return;
    }
    throw new Error('حركة غلط');
  }
  start(c) {
    this.cat = c;
    const pool = Q.filter((q) => c === 'mix' || q.c === c);
    this.qs = shuffle(pool.slice()).slice(0, N_Q);
    this.nQ = this.qs.length;
    this.nextQ();
  }
  stage() { return Math.min(2, Math.floor((Date.now() - this.t0) / HINT_MS)); }
  nextQ() {
    if (this.qn >= this.nQ) return this.finish();
    const q = this.qs[this.qn++];
    const others = shuffle(Q.filter((x) => x.c === q.c && x.a !== q.a)).slice(0, 3).map((x) => x.a);
    this.opts = shuffle([q.a, ...others]);
    this.q = q;
    this.correct = this.opts.indexOf(q.a);
    this.ans = [null, null, null, null];
    this.phase = 'q';
    this.t0 = Date.now(); this.endsAt = this.t0 + Q_MS;
    this.history.length++;
    this.botPlan = [0, 1, 2, 3].map((i) => {
      if (!this.bot(i)) return null;
      const at = this.t0 + 3000 + Math.random() * 14000;
      const st = Math.min(2, Math.floor((at - this.t0) / HINT_MS));
      const right = Math.random() < [0.45, 0.6, 0.75][st];
      const o = right ? this.correct : [0, 1, 2, 3].filter((k) => k !== this.correct)[Math.floor(Math.random() * 3)];
      return { seat: i, at, o };
    });
  }
  answer(seat, o) {
    const st = this.stage();
    const ok = o === this.correct;
    const first = ok && !this.ans.some((x) => x && x.ok);
    const pts = ok ? PTS[st] + (first ? 5 : 0) : 0;
    this.ans[seat] = { o, ok, pts, st };
    this.scores[seat] += pts;
  }
  maybeEnd() { if (this.ans.every(Boolean)) this.reveal(); }
  reveal() { this.phase = 'reveal'; this.endsAt = Date.now() + REVEAL_MS; }
  tick() {
    const now = Date.now();
    if (this.phase === 'pick') { if (this.chooser() < 0 || now >= this.endsAt) this.start('mix'); return; }
    if (this.phase === 'q') {
      for (const b of this.botPlan) if (b && !this.ans[b.seat] && now >= b.at) this.answer(b.seat, b.o);
      if (now >= this.endsAt || this.ans.every(Boolean)) this.reveal();
      return;
    }
    if (this.phase === 'reveal' && now >= this.endsAt) this.nextQ();
  }
  finish() {
    this.over = true; this.phase = 'over';
    const m = Math.max(...this.scores);
    this.winners = [0, 1, 2, 3].filter((i) => this.scores[i] === m);
  }
  view(seat) {
    const v = { type: 'guess', phase: this.phase, scores: this.scores, turn: -1, over: this.over, winners: this.winners, history: this.history,
      hand: [], handCounts: [0, 0, 0, 0], trick: [], legal: [], msLeft: Math.max(0, this.endsAt - Date.now()), cats: CATS,
      chooser: this.chooser(), cat: this.cat, qn: this.qn, nQ: this.nQ || N_Q,
      rank: [0, 1, 2, 3].map((i) => ({ seat: i, score: this.scores[i] })) };
    if (this.phase === 'q' || this.phase === 'reveal') {
      const st = this.phase === 'reveal' ? 2 : this.stage();
      v.catName = CATS[this.q.c]; v.hints = this.q.h.slice(0, st + 1); v.stage = st; v.opts = this.opts;
      v.hintMs = Math.max(0, this.t0 + (st + 1) * HINT_MS - Date.now());
      v.answered = this.ans.map((x) => !!x);
      v.my = seat >= 0 && this.ans[seat] ? this.ans[seat] : null;
      if (v.my && this.phase === 'q') v.my = { o: v.my.o };
      if (this.phase === 'reveal') { v.correct = this.correct; v.ans = this.ans; }
    }
    return v;
  }
  botAction() { return { type: 'noop' }; }
}
