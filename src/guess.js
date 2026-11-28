// Quiz family engine (خمّن المشهور، مسابقة، صح ولا غلط، أعلام، عواصم، أمثال، أكلات، رتّب الحروف، رياضيات، لو خيّروك)
import { makeQuestions, QUIZ_KINDS, CELEB_CATS } from './quizdata.js';

const HINT_MS = 5000, REVEAL_MS = 3000, PICK_MS = 10000;

export class Guess {
  constructor(kind = 'guess') {
    this.type = 'guess';
    this.kind = kind;
    this.cfg = QUIZ_KINDS[kind];
    this.phase = kind === 'guess' ? 'pick' : 'wait';
    this.scores = [0, 0, 0, 0];
    this.qn = 0;
    this.turn = -1;
    this.over = false;
    this.winners = [];
    this.history = { length: 0 };
    this.t0 = Date.now();
    this.endsAt = Date.now() + (kind === 'guess' ? PICK_MS * this.sp : 1500);
  }
  get sp() { return this.speed || 1; }
  get qms() { return (this.cfg.ms || 15000) * this.sp; }
  get pending() {
    if (this.over) return null;
    let next = this.endsAt;
    if (this.phase === 'q') {
      if (this.cfg.hints) for (let k = 1; k < 3; k++) { const t = this.t0 + k * HINT_MS * this.sp; if (t > Date.now()) next = Math.min(next, t); }
      for (const b of this.botPlan || []) if (b && !this.ans[b.seat]) next = Math.min(next, b.at);
    }
    if (this.phase === 'pick' && this.chooser() < 0) next = Date.now();
    return { delay: Math.max(30, next - Date.now()) };
  }
  bot(i) { return this.isBot ? this.isBot(i) : true; }
  isOutSeat(i) { return !!(this.isOut && this.isOut(i)); }
  chooser() { for (let i = 0; i < 4; i++) if (this.isHuman && this.isHuman(i) && !this.bot(i)) return i; return -1; }
  act(seat, a) {
    if (this.over) throw new Error('اللعبة انتهت');
    if (a.type === 'cat') {
      if (this.phase !== 'pick') throw new Error('الفئة انختارت');
      if (seat !== this.chooser()) throw new Error('غيرك يختار');
      if (a.c !== 'mix' && !CELEB_CATS[a.c]) throw new Error('فئة غلط');
      this.start(a.c === 'mix' ? 'mix' : CELEB_CATS[a.c]); return;
    }
    if (a.type === 'ans') {
      if (this.phase !== 'q') throw new Error('استنى السؤال');
      if (this.ans[seat]) throw new Error('جاوبت');
      const o = +a.o;
      if (!(o >= 0 && o < this.q.opts.length)) throw new Error('جواب غلط');
      this.answer(seat, o);
      this.maybeFast();
      if (this.ans.every(Boolean)) this.reveal();
      return;
    }
    throw new Error('حركة غلط');
  }
  maybeFast() {
    // all real players answered: don't keep them waiting for the bots
    const humans = [0, 1, 2, 3].filter((i) => !this.bot(i) && !this.isOutSeat(i));
    if (humans.length && humans.every((i) => this.ans[i])) for (const b of this.botPlan || []) if (b && !this.ans[b.seat]) this.answer(b.seat, b.o);
  }
  start(cat) { this.cat = cat; this.qs = makeQuestions(this.kind, cat); this.nQ = this.qs.length; this.nextQ(); }
  stage() { return this.cfg.hints ? Math.min(2, Math.floor((Date.now() - this.t0) / (HINT_MS * this.sp))) : 0; }
  nextQ() {
    if (this.qn >= this.nQ) return this.finish();
    this.q = this.qs[this.qn++];
    this.correct = this.q.wyr ? -1 : this.q.opts.indexOf(this.q.a);
    this.ans = [0, 1, 2, 3].map((i) => (this.isOutSeat(i) ? { o: -1, ok: false, pts: 0, out: true } : null));
    this.counts = null;
    this.phase = 'q';
    this.t0 = Date.now(); this.endsAt = this.t0 + this.qms;
    this.history.length++;
    const n = this.q.opts.length;
    this.botPlan = [0, 1, 2, 3].map((i) => {
      if (!this.bot(i) || this.isOutSeat(i)) return null;
      const at = this.t0 + 1800 + Math.random() * (this.qms - 4500);
      const st = this.cfg.hints ? Math.min(2, Math.floor((at - this.t0) / (HINT_MS * this.sp))) : 1;
      const right = this.q.wyr ? Math.random() < 0.5 : Math.random() < [0.45, 0.62, 0.75][st];
      const wrong = [...Array(n).keys()].filter((k) => k !== this.correct);
      const o = this.q.wyr ? (right ? 0 : 1) : right ? this.correct : wrong[Math.floor(Math.random() * wrong.length)];
      return { seat: i, at, o };
    });
  }
  answer(seat, o) {
    const st = this.stage();
    if (this.q.wyr) { this.ans[seat] = { o, ok: null, pts: 0 }; return; }
    const ok = o === this.correct;
    const first = ok && !this.ans.some((x) => x && x.ok);
    const left = Math.max(0, this.endsAt - Date.now());
    const pts = ok ? (this.cfg.hints ? [30, 20, 10][st] : 10 + Math.ceil((left / this.qms) * 20)) + (first ? 5 : 0) : 0;
    this.ans[seat] = { o, ok, pts, st };
    this.scores[seat] += pts;
  }
  reveal() {
    if (this.q.wyr) { // the majority choice scores
      const c = [0, 0]; this.ans.forEach((x) => x && c[x.o]++);
      const maj = c[0] === c[1] ? -1 : c[0] > c[1] ? 0 : 1;
      this.ans.forEach((x, i) => { if (x) { x.ok = maj < 0 || x.o === maj; x.pts = x.ok ? 10 : 0; this.scores[i] += x.pts; } });
      this.counts = c;
    }
    this.phase = 'reveal'; this.endsAt = Date.now() + REVEAL_MS * this.sp;
  }
  tick() {
    const now = Date.now();
    if (this.phase === 'wait') { if (now >= this.endsAt) this.start('mix'); return; }
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
    const ids = [0, 1, 2, 3].filter((i) => !this.isOutSeat(i)); const m = Math.max(...ids.map((i) => this.scores[i]));
    this.winners = ids.filter((i) => this.scores[i] === m);
  }
  view(seat) {
    const v = { type: 'guess', kind: this.kind, phase: this.phase, scores: this.scores, turn: -1, over: this.over, winners: this.winners, history: this.history,
      hand: [], handCounts: [0, 0, 0, 0], trick: [], legal: [], msLeft: Math.max(0, this.endsAt - Date.now()), qms: this.qms,
      cats: { sing: CELEB_CATS.sing, act: CELEB_CATS.act, nabi: CELEB_CATS.nabi, inf: CELEB_CATS.inf, arab: CELEB_CATS.arab }, chooser: this.chooser(), qn: this.qn, nQ: this.nQ || this.cfg.n, hintMode: !!this.cfg.hints,
      rank: [0, 1, 2, 3].map((i) => ({ seat: i, score: this.scores[i] })) };
    if (this.phase === 'q' || this.phase === 'reveal') {
      const q = this.q, rv = this.phase === 'reveal';
      const st = rv ? 2 : this.stage();
      v.catName = q.cat; v.opts = q.opts; v.big = !!q.big; v.wyr = q.wyr;
      if (q.h) { v.hints = q.h.slice(0, st + 1); v.stage = st; } else { v.prompt = q.q; v.stage = 0; }
      v.answered = this.ans.map((x) => !!x);
      v.my = seat >= 0 && this.ans[seat] ? this.ans[seat] : null;
      if (v.my && !rv) v.my = { o: v.my.o };
      if (rv) { v.correct = this.correct; v.ans = this.ans; v.counts = this.counts; v.explain = q.x || null; }
    }
    return v;
  }
  botAction() { return { type: 'noop' }; }
}
