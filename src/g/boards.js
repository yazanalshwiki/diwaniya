import { UIGame, rnd, PCOL } from './base.js';

const DISC = ['#e53935', '#fbc02d'];

// ---------------- ٤ بصف ----------------
export class Connect4 extends UIGame {
  constructor() { super('c4', 2); this.R = 6; this.C = 7; this.b = Array(42).fill(-1); this.turn = rnd(2); this.last = -1; this.line = []; }
  drop(b, col) { for (let r = this.R - 1; r >= 0; r--) if (b[r * 7 + col] < 0) return r * 7 + col; return -1; }
  win(b, p) {
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) for (const [dr, dc] of dirs) {
      const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
      if (cells.every(([y, x]) => y >= 0 && y < 6 && x >= 0 && x < 7 && b[y * 7 + x] === p)) return cells.map(([y, x]) => y * 7 + x);
    }
    return null;
  }
  act(seat, a) {
    this.check(seat);
    const col = (+a.i) % 7; const i = this.drop(this.b, col);
    if (i < 0) throw new Error('العمود مليان');
    this.b[i] = seat; this.last = i; this.bump();
    const w = this.win(this.b, seat);
    if (w) { this.line = w; return this.end([seat], `${this.nm(seat)} ربح! 🎉`); }
    if (this.b.every((x) => x >= 0)) return this.end([0, 1], 'تعادل 🤝');
    this.turn = 1 - seat;
  }
  score(b, p) {
    let s = 0; const lines = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cs = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]); if (!cs.every(([y, x]) => y >= 0 && y < 6 && x >= 0 && x < 7)) continue;
      const v = cs.map(([y, x]) => b[y * 7 + x]); const me = v.filter((x) => x === p).length, op = v.filter((x) => x === 1 - p).length;
      if (op === 0) s += [0, 1, 5, 40, 10000][me]; if (me === 0) s -= [0, 1, 6, 60, 9000][op];
    }
    for (let r = 0; r < 6; r++) if (b[r * 7 + 3] === p) s += 3;
    return s;
  }
  mm(b, p, me, d, al, be) {
    if (this.win(b, 1 - p)) return 1 - p === me ? 100000 + d : -100000 - d;
    if (d === 0 || b.every((x) => x >= 0)) return this.score(b, me);
    let best = p === me ? -Infinity : Infinity;
    for (const c of [3, 2, 4, 1, 5, 0, 6]) {
      const i = this.drop(b, c); if (i < 0) continue; b[i] = p;
      const v = this.mm(b, 1 - p, me, d - 1, al, be); b[i] = -1;
      if (p === me) { best = Math.max(best, v); al = Math.max(al, v); } else { best = Math.min(best, v); be = Math.min(be, v); }
      if (be <= al) break;
    }
    return best;
  }
  botAction(seat) {
    let best = -Infinity, pick = 3; const b = this.b.slice();
    for (const c of [3, 2, 4, 1, 5, 0, 6]) { const i = this.drop(b, c); if (i < 0) continue; b[i] = seat; const v = this.mm(b, 1 - seat, seat, 3, -Infinity, Infinity) + rnd(20); b[i] = -1; if (v > best) { best = v; pick = c; } }
    return { type: 'cell', i: pick };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over;
    const click = my ? [...Array(42).keys()].filter((i) => this.drop(this.b, i % 7) >= 0) : [];
    return {
      players: [0, 1].map((i) => ({ badge: `<i class="disc" style="background:${DISC[i]}"></i>` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : my ? 'دورك — اضغط على أي عمود' : `دور ${this.nm(this.turn)}`, cls: 'lead' },
        { k: 'board', r: 6, c: 7, act: 'cell', click, theme: 'c4', cells: this.b.map((v, i) => ({ disc: v >= 0 ? DISC[v] : null, cls: (i === this.last ? 'last ' : '') + (this.line.includes(i) ? 'win' : '') })) },
      ],
    };
  }
}

// ---------------- خمسة بصف ----------------
export class Gomoku extends UIGame {
  constructor() { super('gomoku', 2); this.N = 13; this.b = Array(169).fill(-1); this.turn = rnd(2); this.last = -1; this.line = []; }
  five(i, p) {
    const N = this.N, r0 = Math.floor(i / N), c0 = i % N;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [i];
      for (const s of [1, -1]) for (let k = 1; k < 5; k++) { const r = r0 + dr * k * s, c = c0 + dc * k * s; if (r < 0 || r >= N || c < 0 || c >= N || this.b[r * N + c] !== p) break; cells.push(r * N + c); }
      if (cells.length >= 5) return cells;
    }
    return null;
  }
  act(seat, a) {
    this.check(seat); const i = +a.i;
    if (!(i >= 0 && i < 169) || this.b[i] >= 0) throw new Error('خانة مشغولة');
    this.b[i] = seat; this.last = i; this.bump();
    const w = this.five(i, seat);
    if (w) { this.line = w; return this.end([seat], `${this.nm(seat)} صفّ خمسة! 🎉`); }
    if (this.b.every((x) => x >= 0)) return this.end([0, 1], 'تعادل');
    this.turn = 1 - seat;
  }
  evalCell(i, p) {
    const N = this.N, r0 = Math.floor(i / N), c0 = i % N; let s = 0;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let cnt = 1, open = 0;
      for (const sg of [1, -1]) { let k = 1; for (; k < 5; k++) { const r = r0 + dr * k * sg, c = c0 + dc * k * sg; if (r < 0 || r >= N || c < 0 || c >= N) break; const v = this.b[r * N + c]; if (v === p) cnt++; else { if (v < 0) open++; break; } } }
      s += cnt >= 5 ? 100000 : [0, 1, 12, 120, 2500][cnt] * (open === 2 ? 2 : open === 1 ? 1 : 0.2);
    }
    return s;
  }
  botAction(seat) {
    let best = -1, pick = 84;
    if (this.b.every((x) => x < 0)) return { type: 'cell', i: 84 };
    for (let i = 0; i < 169; i++) {
      if (this.b[i] >= 0) continue;
      const near = [-14, -13, -12, -1, 1, 12, 13, 14, -28, -26, 26, 28].some((d) => this.b[i + d] >= 0 && Math.abs(((i + d) % 13) - (i % 13)) <= 2);
      if (!near) continue;
      const v = this.evalCell(i, seat) * 1.1 + this.evalCell(i, 1 - seat) + Math.random() * 5;
      if (v > best) { best = v; pick = i; }
    }
    return { type: 'cell', i: pick };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over;
    return {
      players: [0, 1].map((i) => ({ badge: `<i class="stone s${i}"></i>` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : my ? 'دورك — أول واحد يصفّ ٥ يربح' : `دور ${this.nm(this.turn)}`, cls: 'lead' },
        { k: 'board', r: 13, c: 13, act: 'cell', theme: 'go', click: my ? this.b.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0) : [], cells: this.b.map((v, i) => ({ stone: v, cls: (i === this.last ? 'last ' : '') + (this.line.includes(i) ? 'win' : '') })) },
      ],
    };
  }
}

// ---------------- أوثيلو ----------------
const OD = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const OW = [100, -20, 10, 5, 5, 10, -20, 100, -20, -50, -2, -2, -2, -2, -50, -20, 10, -2, 1, 1, 1, 1, -2, 10, 5, -2, 1, 0, 0, 1, -2, 5, 5, -2, 1, 0, 0, 1, -2, 5, 10, -2, 1, 1, 1, 1, -2, 10, -20, -50, -2, -2, -2, -2, -50, -20, 100, -20, 10, 5, 5, 10, -20, 100];
export class Othello extends UIGame {
  constructor() { super('othello', 2); this.b = Array(64).fill(-1); this.b[27] = this.b[36] = 1; this.b[28] = this.b[35] = 0; this.turn = 0; this.last = -1; }
  flips(b, i, p) {
    if (b[i] >= 0) return []; const r0 = Math.floor(i / 8), c0 = i % 8, out = [];
    for (const [dr, dc] of OD) { const line = []; let r = r0 + dr, c = c0 + dc; while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === 1 - p) { line.push(r * 8 + c); r += dr; c += dc; } if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === p) out.push(...line); }
    return out;
  }
  moves(p) { return [...Array(64).keys()].filter((i) => this.flips(this.b, i, p).length); }
  count(p) { return this.b.filter((x) => x === p).length; }
  act(seat, a) {
    this.check(seat); const i = +a.i; const f = this.flips(this.b, i, seat);
    if (!f.length) throw new Error('حركة غير مسموحة');
    this.b[i] = seat; f.forEach((k) => (this.b[k] = seat)); this.last = i; this.bump();
    this.scores = [this.count(0), this.count(1)];
    if (this.moves(1 - seat).length) this.turn = 1 - seat;
    else if (this.moves(seat).length) { this.msg = `${this.nm(1 - seat)} ما عنده حركة — كمّل`; }
    else return this.endByScore('خلصت اللعبة');
  }
  botAction(seat) {
    const ms = this.moves(seat); let best = -1e9, pick = ms[0];
    for (const i of ms) { const v = OW[i] + this.flips(this.b, i, seat).length * 2 + Math.random() * 3; if (v > best) { best = v; pick = i; } }
    return { type: 'cell', i: pick };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const ms = my ? this.moves(seat) : [];
    this.scores = [this.count(0), this.count(1)];
    return {
      players: [0, 1].map((i) => ({ badge: `<i class="stone s${i}"></i> ${this.count(i)}` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : my ? 'دورك — ضع حجر يقلب أحجار الخصم' : `دور ${this.nm(this.turn)}`, cls: 'lead' },
        { k: 'board', r: 8, c: 8, act: 'cell', theme: 'oth', click: ms, hl: ms, cells: this.b.map((v, i) => ({ stone: v, cls: i === this.last ? 'last' : '' })) },
      ],
    };
  }
}

// ---------------- داما (تركية) ----------------
// pieces: {p: player, k: king}
export class Dama extends UIGame {
  constructor() {
    super('dama', 2);
    this.b = Array(64).fill(null);
    for (let c = 0; c < 8; c++) { this.b[8 + c] = this.b[16 + c] = { p: 1, k: false }; this.b[40 + c] = this.b[48 + c] = { p: 0, k: false }; }
    this.turn = 0; this.sel = -1; this.chain = -1; this.last = [];
  }
  fwd(p) { return p === 0 ? -1 : 1; }
  pieceMoves(i, capOnly) {
    const pc = this.b[i]; if (!pc) return []; const r0 = Math.floor(i / 8), c0 = i % 8; const out = [];
    const dirs = pc.k ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[this.fwd(pc.p), 0], [0, 1], [0, -1]];
    for (const [dr, dc] of dirs) {
      if (pc.k) {
        let r = r0 + dr, c = c0 + dc;
        while (r >= 0 && r < 8 && c >= 0 && c < 8 && !this.b[r * 8 + c]) { if (!capOnly) out.push({ to: r * 8 + c }); r += dr; c += dc; }
        if (r >= 0 && r < 8 && c >= 0 && c < 8 && this.b[r * 8 + c].p !== pc.p) { const cap = r * 8 + c; r += dr; c += dc; while (r >= 0 && r < 8 && c >= 0 && c < 8 && !this.b[r * 8 + c]) { out.push({ to: r * 8 + c, cap }); r += dr; c += dc; } }
      } else {
        const r = r0 + dr, c = c0 + dc; if (r < 0 || r > 7 || c < 0 || c > 7) continue;
        if (!this.b[r * 8 + c]) { if (!capOnly) out.push({ to: r * 8 + c }); }
        else if (this.b[r * 8 + c].p !== pc.p) { const r2 = r + dr, c2 = c + dc; if (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8 && !this.b[r2 * 8 + c2]) out.push({ to: r2 * 8 + c2, cap: r * 8 + c }); }
      }
    }
    return out;
  }
  allMoves(p) {
    if (this.chain >= 0) return this.pieceMoves(this.chain, true).map((m) => ({ from: this.chain, ...m }));
    const caps = [], plain = [];
    for (let i = 0; i < 64; i++) if (this.b[i] && this.b[i].p === p) for (const m of this.pieceMoves(i)) (m.cap !== undefined ? caps : plain).push({ from: i, ...m });
    return caps.length ? caps : plain;
  }
  count(p) { return this.b.filter((x) => x && x.p === p).length; }
  doMove(seat, m) {
    const pc = this.b[m.from]; this.b[m.to] = pc; this.b[m.from] = null; this.last = [m.from, m.to];
    if (m.cap !== undefined) this.b[m.cap] = null;
    const row = Math.floor(m.to / 8); let promoted = false;
    if (!pc.k && ((pc.p === 0 && row === 0) || (pc.p === 1 && row === 7))) { pc.k = true; promoted = true; }
    this.bump(); this.sel = -1;
    if (m.cap !== undefined && !promoted && this.pieceMoves(m.to, true).length) { this.chain = m.to; this.sel = m.to; return; }
    this.chain = -1;
    if (!this.count(1 - seat) || !this.allMoves(1 - seat).length) return this.end([seat], `${this.nm(seat)} ربح! 🎉`);
    this.turn = 1 - seat;
  }
  act(seat, a) {
    this.check(seat); const i = +a.i; const ms = this.allMoves(seat);
    const m = ms.find((x) => x.from === this.sel && x.to === i);
    if (m) return this.doMove(seat, m);
    if (this.chain < 0 && ms.some((x) => x.from === i)) { this.sel = i; return; }
    throw new Error(ms.some((x) => x.cap !== undefined) ? 'يجب تاكل!' : 'حركة غير مسموحة');
  }
  botAction(seat) {
    const ms = this.allMoves(seat);
    let best = -1e9, pick = ms[0];
    for (const m of ms) {
      let v = Math.random() * 2; if (m.cap !== undefined) v += 10 + (this.b[m.cap].k ? 8 : 0);
      const row = Math.floor(m.to / 8); v += seat === 0 ? (7 - row) * 0.3 : row * 0.3;
      // danger: would land next to an enemy that can jump it
      const save = [this.b[m.to], this.b[m.from], m.cap !== undefined ? this.b[m.cap] : null];
      this.b[m.to] = this.b[m.from]; this.b[m.from] = null; if (m.cap !== undefined) this.b[m.cap] = null;
      for (let i = 0; i < 64; i++) if (this.b[i] && this.b[i].p !== seat && this.pieceMoves(i, true).some((x) => x.cap === m.to)) { v -= 7; break; }
      this.b[m.from] = this.b[m.to]; this.b[m.to] = save[0]; if (m.cap !== undefined) this.b[m.cap] = save[2];
      if (v > best) { best = v; pick = m; }
    }
    if (this.sel !== pick.from) { this.sel = pick.from; }
    return { type: 'cell', i: pick.to };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const ms = my ? this.allMoves(seat) : [];
    const targets = ms.filter((m) => m.from === this.sel).map((m) => m.to);
    const froms = [...new Set(ms.map((m) => m.from))];
    return {
      players: [0, 1].map((i) => ({ badge: `<i class="stone s${i}"></i> ${this.count(i)}` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : my ? (this.chain >= 0 ? 'كمّل أكل بنفس الحجر!' : ms.some((m) => m.cap !== undefined) ? 'يجب تاكل — اختار الحجر' : 'اختار حجر ولاحقاً أين تريد تحركه') : `دور ${this.nm(this.turn)}`, cls: 'lead' },
        { k: 'board', r: 8, c: 8, act: 'cell', theme: 'dama', sel: this.sel, click: my ? [...froms, ...targets] : [], hl: targets, flip: seat === 1,
          cells: this.b.map((v, i) => ({ stone: v ? v.p : -1, king: v && v.k, cls: this.last.includes(i) ? 'last' : '' })) },
      ],
    };
  }
}

// ---------------- نقاط ومربعات ----------------
export class Dots extends UIGame {
  constructor() { super('dots', 2); this.D = 5; this.S = 9; this.edges = new Set(); this.box = Array(16).fill(-1); this.turn = rnd(2); this.last = -1; }
  boxEdges(br, bc) { const S = this.S, r = br * 2 + 1, c = bc * 2 + 1; return [(r - 1) * S + c, (r + 1) * S + c, r * S + c - 1, r * S + c + 1]; }
  isEdge(i) { const r = Math.floor(i / this.S), c = i % this.S; return (r + c) % 2 === 1; }
  act(seat, a) {
    this.check(seat); const i = +a.i;
    if (!this.isEdge(i) || this.edges.has(i)) throw new Error('خط مأخوذ');
    this.edges.add(i); this.last = i; this.bump();
    let got = 0;
    for (let br = 0; br < 4; br++) for (let bc = 0; bc < 4; bc++) { const k = br * 4 + bc; if (this.box[k] < 0 && this.boxEdges(br, bc).every((e) => this.edges.has(e))) { this.box[k] = seat; this.scores[seat]++; got++; } }
    if (this.box.every((x) => x >= 0)) return this.endByScore('خلصت المربعات');
    if (!got) this.turn = 1 - seat;
  }
  free() { const out = []; for (let i = 0; i < 81; i++) if (this.isEdge(i) && !this.edges.has(i)) out.push(i); return out; }
  sidesAfter(e) { let worst = 0; for (let br = 0; br < 4; br++) for (let bc = 0; bc < 4; bc++) { const es = this.boxEdges(br, bc); if (!es.includes(e)) continue; const n = es.filter((x) => this.edges.has(x)).length + 1; worst = Math.max(worst, n); } return worst; }
  botAction() {
    const fr = this.free();
    const win = fr.find((e) => this.sidesAfter(e) === 4); if (win !== undefined) return { type: 'cell', i: win };
    const safe = fr.filter((e) => this.sidesAfter(e) < 3);
    const pool = safe.length ? safe : fr;
    return { type: 'cell', i: pool[rnd(pool.length)] };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const S = this.S;
    const cells = []; for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / S), c = i % S;
      if (r % 2 === 0 && c % 2 === 0) cells.push({ cls: 'dot' });
      else if (r % 2 === 1 && c % 2 === 1) { const o = this.box[((r - 1) / 2) * 4 + (c - 1) / 2]; cells.push({ cls: 'bx', bg: o >= 0 ? PCOL[o] + '55' : '', t: o >= 0 ? (o ? '◆' : '●') : '' }); }
      else cells.push({ cls: (r % 2 === 0 ? 'he' : 've') + (this.edges.has(i) ? ' on' : '') + (i === this.last ? ' last' : '') });
    }
    return {
      players: [0, 1].map((i) => ({ badge: `<i class="disc" style="background:${PCOL[i]}"></i> ${this.scores[i]}` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : my ? 'دورك — ارسم خط. إذا سكّرت مربع تلعب مرة ثانية' : `دور ${this.nm(this.turn)}`, cls: 'lead' },
        { k: 'board', r: 9, c: 9, act: 'cell', theme: 'dots', click: my ? this.free() : [], cells },
      ],
    };
  }
}

// ---------------- المنقلة ----------------
export class Mancala extends UIGame {
  // pits 0..5 player0 (bottom, left→right), 6 = store0, 7..12 player1 (top, right→left), 13 = store1
  constructor() { super('mancala', 2); this.p = Array(14).fill(4); this.p[6] = this.p[13] = 0; this.turn = rnd(2); this.last = -1; }
  own(seat) { return seat === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]; }
  sow(p, seat, i) {
    let n = p[i]; p[i] = 0; let k = i;
    while (n) { k = (k + 1) % 14; if (k === (seat === 0 ? 13 : 6)) continue; p[k]++; n--; }
    const store = seat === 0 ? 6 : 13; let again = k === store;
    if (!again && this.own(seat).includes(k) && p[k] === 1 && p[12 - k] > 0) { p[store] += p[12 - k] + 1; p[12 - k] = 0; p[k] = 0; }
    return { again, k };
  }
  act(seat, a) {
    this.check(seat); const i = +a.i;
    if (!this.own(seat).includes(i) || !this.p[i]) throw new Error('اختار حفرة فيها حبات');
    const r = this.sow(this.p, seat, i); this.last = r.k; this.bump();
    if (this.own(0).every((x) => !this.p[x]) || this.own(1).every((x) => !this.p[x])) {
      for (const s of [0, 1]) for (const x of this.own(s)) { this.p[s === 0 ? 6 : 13] += this.p[x]; this.p[x] = 0; }
      this.scores = [this.p[6], this.p[13]]; return this.endByScore('خلصت الحبات');
    }
    this.scores = [this.p[6], this.p[13]];
    if (!r.again) this.turn = 1 - seat; else this.msg = `${this.nm(seat)} خلّص بمخزنه — يلعب مرة ثانية`;
  }
  botAction(seat) {
    let best = -1e9, pick = null;
    for (const i of this.own(seat)) { if (!this.p[i]) continue; const p = this.p.slice(); const r = this.sow(p, seat, i); const v = p[seat === 0 ? 6 : 13] - this.p[seat === 0 ? 6 : 13] + (r.again ? 5 : 0) + Math.random(); if (v > best) { best = v; pick = i; } }
    return { type: 'cell', i: pick };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const flip = seat === 1;
    const top = flip ? [5, 4, 3, 2, 1, 0] : [12, 11, 10, 9, 8, 7], bot = flip ? [7, 8, 9, 10, 11, 12] : [0, 1, 2, 3, 4, 5];
    const myStore = flip ? 13 : 6, opStore = flip ? 6 : 13;
    const cell = (i) => ({ t: String(this.p[i]), cls: 'pit' + (i === this.last ? ' last' : ''), seeds: this.p[i], id: i });
    // 2 rows x 8 columns: [opStore, top..., (empty)] / [(empty), bottom..., myStore]
    const cells = [{ ...cell(opStore), cls: 'store' }, ...top.map(cell), { cls: 'nil' }, { cls: 'nil' }, ...bot.map(cell), { ...cell(myStore), cls: 'store mine' }];
    const idx = [opStore, ...top, -1, -1, ...bot, myStore];
    return {
      players: [0, 1].map((i) => ({ badge: `🫘 ${this.p[i === 0 ? 6 : 13]}` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : my ? 'دورك — اختار حفرة من حفرك تحت' : `دور ${this.nm(this.turn)}`, cls: 'lead' },
        { k: 'board', r: 2, c: 8, act: 'cell', theme: 'man', map: idx, click: my ? this.own(seat).filter((x) => this.p[x]) : [], cells },
        { k: 'text', t: 'الحبات تتوزع وحدة وحدة. إذا آخر حبة وقعت بمخزنك تلعب مرة ثانية، وإذا وقعت بحفرة فاضية لك تاكل اللي قبالها.', cls: 'hint' },
      ],
    };
  }
}
