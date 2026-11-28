const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winOf = (b) => { for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return l; return null; };
const TARGET = 3; // first to 3 rounds

export class XO {
  constructor() {
    this.type = 'xo';
    this.board = Array(9).fill(null);
    this.scores = [0, 0];
    this.round = 1;
    this.starter = Math.floor(Math.random() * 2);
    this.turn = this.starter;
    this.line = null;
    this.draws = 0;
    this.pending = null;
    this.over = false;
    this.winners = [];
    this.history = { length: 0 };
    this.msg = '';
    this.last = -1;
  }
  nm(i) { return (this.names && this.names[i]) || `لاعب ${i + 1}`; }
  act(seat, a) {
    if (this.over) throw new Error('اللعبة انتهت');
    if (this.pending) throw new Error('لحظة');
    if (seat !== this.turn) throw new Error('غير دورك');
    const i = +a.i;
    if (a.type !== 'mark' || !(i >= 0 && i < 9) || this.board[i]) throw new Error('خانة غلط');
    this.board[i] = seat === 0 ? 'X' : 'O';
    this.last = i; this.history.length++;
    const l = winOf(this.board);
    if (l) { this.line = l; this.scores[seat]++; this.msg = `${this.nm(seat)} ربح الجولة 🎉`; this.endRound(seat); return; }
    if (this.board.every(Boolean)) { this.draws++; this.msg = 'تعادل 🤝'; this.endRound(-1); return; }
    this.turn = 1 - seat;
  }
  endRound(w) {
    this.turn = -1;
    if (w >= 0 && this.scores[w] >= TARGET) { this.over = true; this.winners = [w]; this.msg = `🏆 ${this.nm(w)} ربح المباراة!`; return; }
    if (this.round >= 9) { this.over = true; const m = Math.max(...this.scores); this.winners = [0, 1].filter((i) => this.scores[i] === m); return; }
    this.pending = { delay: 1800 };
  }
  tick() {
    this.pending = null;
    this.round++; this.board = Array(9).fill(null); this.line = null; this.last = -1;
    this.starter = 1 - this.starter; this.turn = this.starter; this.msg = '';
  }
  view() {
    return { type: 'xo', board: this.board, turn: this.turn, scores: this.scores, round: this.round, target: TARGET, line: this.line, last: this.last, draws: this.draws,
      msg: this.msg, over: this.over, winners: this.winners, history: this.history, hand: [], handCounts: [0, 0], trick: [], legal: [],
      rank: [0, 1].map((i) => ({ seat: i, score: this.scores[i] })) };
  }
  botAction(seat) {
    const me = seat === 0 ? 'X' : 'O', op = me === 'X' ? 'O' : 'X';
    const b = this.board;
    const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const mm = (bd, turn, depth) => {
      const l = winOf(bd);
      if (l) return bd[l[0]] === me ? 10 - depth : depth - 10;
      if (bd.every(Boolean)) return 0;
      let best = turn === me ? -99 : 99;
      for (let i = 0; i < 9; i++) if (!bd[i]) { bd[i] = turn; const v = mm(bd, turn === me ? op : me, depth + 1); bd[i] = null; best = turn === me ? Math.max(best, v) : Math.min(best, v); }
      return best;
    };
    if (Math.random() < 0.18) return { type: 'mark', i: free[Math.floor(Math.random() * free.length)] };
    let best = -999, pick = [];
    for (const i of free) { const bd = b.slice(); bd[i] = me; const v = mm(bd, op, 1); if (v > best) { best = v; pick = [i]; } else if (v === best) pick.push(i); }
    return { type: 'mark', i: pick[Math.floor(Math.random() * pick.length)] };
  }
}
