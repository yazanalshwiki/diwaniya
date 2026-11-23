// Shared helpers for the generic "UI-spec" games. Each game returns a declarative ui object the client renders.
export const rnd = (n) => Math.floor(Math.random() * n);
export const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const deck52 = () => { const d = []; for (const s of 'SHDC') for (let r = 2; r <= 14; r++) d.push(s + r); return d; };
export const rank = (c) => +c.slice(1);
export const suit = (c) => c[0];
export const PCOL = ['#ff4d4d', '#3aa0ff', '#39d353', '#ffc93a'];

export class UIGame {
  constructor(game, n = 4) {
    this.type = 'ui'; this.game = game; this.n = n;
    this.turn = 0; this.over = false; this.winners = []; this.history = { length: 0 };
    this.pending = null; this.scores = Array(n).fill(0); this.msg = '';
  }
  nm(i) { return (this.names && this.names[i]) || `لاعب ${i + 1}`; }
  bot(i) { return this.isBot ? this.isBot(i) : true; }
  check(seat) {
    if (this.over) throw new Error('اللعبة انتهت');
    if (this.pending) throw new Error('لحظة');
    if (seat !== this.turn) throw new Error('مو دورك');
  }
  bump() { this.history.length++; }
  next(from = this.turn, skip) { let n = from; for (let k = 0; k < this.n; k++) { n = (n + 1) % this.n; if (!skip || !skip(n)) return n; } return from; }
  wait(ms, fn) { this.pending = { delay: ms }; this.afterWait = fn; this.turnSave = this.turn; this.turn = -1; }
  tick() { const f = this.afterWait; this.pending = null; this.afterWait = null; if (f) f.call(this); }
  end(winners, msg) { this.over = true; this.turn = -1; this.winners = winners; if (msg) this.msg = msg; this.bump(); }
  endByScore(msg) { const m = Math.max(...this.scores); this.end([...Array(this.n).keys()].filter((i) => this.scores[i] === m), msg); }
  rankRows() { return [...Array(this.n).keys()].map((i) => ({ seat: i, score: this.scoreLabel ? this.scoreLabel(i) : this.scores[i] })); }
  view(seat) {
    return { type: 'ui', game: this.game, turn: this.turn, over: this.over, winners: this.winners, history: this.history, msg: this.msg,
      hand: [], handCounts: Array(this.n).fill(0), trick: [], legal: [], scores: this.scores, rank: this.rankRows(), ui: this.ui(seat),
      msLeft: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : null };
  }
}
