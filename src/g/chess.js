import { UIGame } from './base.js';

// board: 64 squares, index = r*8+c, r=0 is black's back rank (top). Pieces: 'wP','bK', ...
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export class Chess extends UIGame {
  constructor() {
    super('chess', 2);
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    this.b = Array(64).fill(null);
    for (let c = 0; c < 8; c++) { this.b[c] = 'b' + back[c]; this.b[8 + c] = 'bP'; this.b[48 + c] = 'wP'; this.b[56 + c] = 'w' + back[c]; }
    this.turn = 0; // seat 0 = white
    this.castle = { wK: true, wQ: true, bK: true, bQ: true }; this.ep = -1; this.sel = -1; this.last = []; this.halfmoves = 0; this.lost = [[], []];
  }
  col(s) { return s === 0 ? 'w' : 'b'; }
  attacked(b, sq, by) {
    const r0 = Math.floor(sq / 8), c0 = sq % 8, at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? b[r * 8 + c] : undefined);
    const pd = by === 'w' ? 1 : -1; for (const dc of [-1, 1]) if (at(r0 + pd, c0 + dc) === by + 'P') return true;
    for (const [dr, dc] of KN) if (at(r0 + dr, c0 + dc) === by + 'N') return true;
    for (const [dr, dc] of KG) if (at(r0 + dr, c0 + dc) === by + 'K') return true;
    for (const [dr, dc] of KG) { let r = r0 + dr, c = c0 + dc; while (r >= 0 && r < 8 && c >= 0 && c < 8) { const p = b[r * 8 + c]; if (p) { if (p[0] === by && (p[1] === 'Q' || (dr && dc ? p[1] === 'B' : p[1] === 'R'))) return true; break; } r += dr; c += dc; } }
    return false;
  }
  pseudo(b, s, ep, castle) {
    const me = this.col(s), op = me === 'w' ? 'b' : 'w', out = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p || p[0] !== me) continue; const r0 = Math.floor(i / 8), c0 = i % 8, t = p[1];
      const add = (r, c, extra) => { if (r < 0 || r > 7 || c < 0 || c > 7) return false; const q = b[r * 8 + c]; if (q && q[0] === me) return false; out.push({ f: i, t: r * 8 + c, ...extra }); return !q; };
      if (t === 'P') {
        const d = me === 'w' ? -1 : 1, start = me === 'w' ? 6 : 1, r = r0 + d;
        if (r >= 0 && r < 8 && !b[r * 8 + c0]) { out.push({ f: i, t: r * 8 + c0, promo: r === 0 || r === 7 }); if (r0 === start && !b[(r0 + 2 * d) * 8 + c0]) out.push({ f: i, t: (r0 + 2 * d) * 8 + c0, dbl: true }); }
        for (const dc of [-1, 1]) { const c = c0 + dc; if (c < 0 || c > 7 || r < 0 || r > 7) continue; const q = b[r * 8 + c]; if (q && q[0] === op) out.push({ f: i, t: r * 8 + c, promo: r === 0 || r === 7 }); if (r * 8 + c === ep) out.push({ f: i, t: ep, epc: r0 * 8 + c }); }
      } else if (t === 'N') for (const [dr, dc] of KN) add(r0 + dr, c0 + dc);
      else if (t === 'K') {
        for (const [dr, dc] of KG) add(r0 + dr, c0 + dc);
        const home = me === 'w' ? 60 : 4;
        if (i === home && !this.attacked(b, i, op)) {
          if (castle[me + 'K'] && !b[i + 1] && !b[i + 2] && b[i + 3] === me + 'R' && !this.attacked(b, i + 1, op) && !this.attacked(b, i + 2, op)) out.push({ f: i, t: i + 2, cs: 'K' });
          if (castle[me + 'Q'] && !b[i - 1] && !b[i - 2] && !b[i - 3] && b[i - 4] === me + 'R' && !this.attacked(b, i - 1, op) && !this.attacked(b, i - 2, op)) out.push({ f: i, t: i - 2, cs: 'Q' });
        }
      } else {
        const dirs = t === 'R' ? KG.filter(([a, b2]) => !a || !b2) : t === 'B' ? KG.filter(([a, b2]) => a && b2) : KG;
        for (const [dr, dc] of dirs) { let r = r0 + dr, c = c0 + dc; while (add(r, c)) { r += dr; c += dc; } }
      }
    }
    return out;
  }
  apply(b, m) {
    const nb = b.slice(); const p = nb[m.f]; nb[m.t] = m.promo ? p[0] + (m.pr || 'Q') : p; nb[m.f] = null;
    if (m.epc !== undefined) nb[m.epc] = null;
    if (m.cs === 'K') { nb[m.f + 1] = nb[m.f + 3]; nb[m.f + 3] = null; }
    if (m.cs === 'Q') { nb[m.f - 1] = nb[m.f - 4]; nb[m.f - 4] = null; }
    return nb;
  }
  legal(s, b = this.b, ep = this.ep, castle = this.castle) {
    const me = this.col(s), op = me === 'w' ? 'b' : 'w';
    return this.pseudo(b, s, ep, castle).filter((m) => { const nb = this.apply(b, m); return !this.attacked(nb, nb.indexOf(me + 'K'), op); });
  }
  doMove(s, m) {
    const me = this.col(s), cap = this.b[m.t] || (m.epc !== undefined ? this.b[m.epc] : null);
    if (cap) this.lost[1 - s].push(cap);
    const p = this.b[m.f];
    const files = 'abcdefgh', sq = (i) => files[i % 8] + (8 - Math.floor(i / 8));
    this.log = this.log || [];
    this.log.push({ s, txt: m.cs ? (m.cs === 'K' ? 'O-O' : 'O-O-O') : `${GLYPH[p[1]]}${cap ? '×' : ''}${sq(m.t)}${m.promo ? '=' + GLYPH[m.pr || 'Q'] : ''}`, cap: !!cap, cs: !!m.cs });
    this.lastMv = { f: m.f, t: m.t, cap: !!cap, cs: m.cs || null, promo: !!m.promo, id: (this.lastMv ? this.lastMv.id : 0) + 1, piece: p };
    this.b = this.apply(this.b, m); this.last = [m.f, m.t]; this.sel = -1; this.bump();
    if (p[1] === 'K') { this.castle[me + 'K'] = false; this.castle[me + 'Q'] = false; }
    for (const [sq, k] of [[63, 'wK'], [56, 'wQ'], [7, 'bK'], [0, 'bQ']]) if (m.f === sq || m.t === sq) this.castle[k] = false;
    this.ep = m.dbl ? (m.f + m.t) / 2 : -1;
    this.halfmoves = p[1] === 'P' || cap ? 0 : this.halfmoves + 1;
    const op = 1 - s, opc = this.col(op);
    const inCheck = this.attacked(this.b, this.b.indexOf(opc + 'K'), me);
    if (!this.legal(op).length) return inCheck ? this.end([s], `كش مات! ${this.nm(s)} ربح ♚`) : this.end([0, 1], 'تعادل — ما في حركات (ستيل مات)');
    if (this.halfmoves >= 100 || this.b.filter(Boolean).length === 2) return this.end([0, 1], 'تعادل');
    this.check2 = inCheck; this.turn = op;
    if (inCheck) this.log[this.log.length - 1].txt += '+';
  }
  view(seat) {
    const v = super.view(seat);
    v.chess = { b: this.b, moves: seat === this.turn && !this.over ? this.legal(seat).map((m) => [m.f, m.t]) : [], last: this.lastMv || null, check: !!this.check2 && !this.over,
      lost: this.lost, log: (this.log || []).slice(-12), mover: this.turn };
    return v;
  }
  act(seat, a) {
    this.check(seat);
    if (a.type === 'move') { let m = this.legal(seat).find((x) => x.f === +a.f && x.t === +a.t); if (!m) throw new Error('حركة مو مسموحة'); if (m.promo && ['Q', 'R', 'B', 'N'].includes(a.pr)) m = { ...m, pr: a.pr }; return this.doMove(seat, m); }
    const i = +a.i; const ms = this.legal(seat);
    const m = ms.find((x) => x.f === this.sel && x.t === i);
    if (m) return this.doMove(seat, m);
    if (ms.some((x) => x.f === i)) { this.sel = i; return; }
    throw new Error('حركة مو مسموحة');
  }
  evalB(b) { let s = 0; for (let i = 0; i < 64; i++) { const p = b[i]; if (!p) continue; let v = VAL[p[1]]; const r = Math.floor(i / 8), c = i % 8; if (p[1] === 'P') v += (p[0] === 'w' ? 6 - r : r - 1) * 8; if (p[1] === 'N' || p[1] === 'B') v += 10 - (Math.abs(3.5 - r) + Math.abs(3.5 - c)) * 3; s += p[0] === 'w' ? v : -v; } return s; }
  search(b, s, d, al, be) {
    const ms = this.legal(s, b, -1, { wK: false, wQ: false, bK: false, bQ: false });
    if (!ms.length) { const me = this.col(s); return this.attacked(b, b.indexOf(me + 'K'), me === 'w' ? 'b' : 'w') ? (s === 0 ? -99999 : 99999) : 0; }
    if (d === 0) return this.evalB(b);
    ms.sort((x, y) => (b[y.t] ? VAL[b[y.t][1]] : 0) - (b[x.t] ? VAL[b[x.t][1]] : 0));
    if (s === 0) { let v = -Infinity; for (const m of ms) { v = Math.max(v, this.search(this.apply(b, m), 1, d - 1, al, be)); al = Math.max(al, v); if (be <= al) break; } return v; }
    let v = Infinity; for (const m of ms) { v = Math.min(v, this.search(this.apply(b, m), 0, d - 1, al, be)); be = Math.min(be, v); if (be <= al) break; } return v;
  }
  botAction(seat) {
    const ms = this.legal(seat); let best = null, bv = -Infinity;
    for (const m of ms) { const v = (seat === 0 ? 1 : -1) * this.search(this.apply(this.b, m), 1 - seat, 2, -Infinity, Infinity) + Math.random() * 25; if (v > bv) { bv = v; best = m; } }
    this.sel = best.f; return { type: 'cell', i: best.t };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const ms = my ? this.legal(seat) : [];
    const targets = ms.filter((m) => m.f === this.sel).map((m) => m.t);
    const kingSq = this.check2 && !this.over ? this.b.indexOf(this.col(this.turn) + 'K') : -1;
    return {
      players: [0, 1].map((i) => ({ badge: i === 0 ? '⚪ الأبيض' : '⚫ الأسود', sub: this.lost[1 - i].map((p) => GLYPH[p[1]]).join('') })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : my ? (this.check2 ? '⚠️ كش! احمِ الملك' : 'دورك — اختار قطعة وبعدين المكان') : `دور ${this.nm(this.turn)}${this.check2 ? ' — كش!' : ''}`, cls: 'lead' },
        { k: 'board', r: 8, c: 8, act: 'cell', theme: 'chess', flip: seat === 1, sel: this.sel, hl: targets, click: my ? [...new Set(ms.map((m) => m.f)), ...targets] : [],
          cells: this.b.map((p, i) => ({ t: p ? GLYPH[p[1]] : '', fg: p ? (p[0] === 'w' ? 'w' : 'b') : '', cls: (this.last.includes(i) ? 'last ' : '') + (i === kingSq ? 'chk' : '') })) },
      ],
    };
  }
}
