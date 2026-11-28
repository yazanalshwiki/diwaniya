import { UIGame, rnd, shuffle, PCOL } from './base.js';

const d6 = () => 1 + rnd(6);
const TOK = (s) => `<i class="tok" style="background:${PCOL[s]}"></i>`;

// ---------------- سلم وثعبان ----------------
const JUMPS = { 3: 22, 8: 30, 28: 84, 21: 42, 50: 67, 71: 92, 80: 99, 17: 4, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79 };
export class Snakes extends UIGame {
  constructor() { super('snakes', 4); this.pos = [0, 0, 0, 0]; this.turn = rnd(4); this.die = 0; this.rollId = 0; }
  act(seat, a) {
    this.check(seat); if (a.type !== 'roll') throw new Error('ارمي الزهر');
    const d = d6(); this.die = d; this.rollId++; this.bump();
    let p = this.pos[seat] + d; let note = `${this.nm(seat)} جاب ${d}`;
    if (p > 100) { p = this.pos[seat]; note += ' — بدّه رقم مضبوط ليوصل 100'; }
    const j = JUMPS[p]; if (j) { note += j > p ? ` 🪜 طلع لـ${j}` : ` 🐍 نزل لـ${j}`; p = j; }
    this.pos[seat] = p; this.msg = note; this.scores = this.pos.slice();
    if (p === 100) return this.end([seat], `🏆 ${this.nm(seat)} وصل للـ100!`);
    if (d === 6) { this.msg += ' — ٦! بيلعب كمان'; return; }
    this.wait(600, () => { this.turn = this.next(seat); });
  }
  botAction() { return { type: 'roll' }; }
  ui(seat) {
    const my = seat === this.turn && !this.over;
    const cells = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
      const row = 9 - r, n = row * 10 + (row % 2 ? 10 - c : c + 1);
      const here = this.pos.map((p, s) => (p === n ? s : -1)).filter((s) => s >= 0);
      const j = JUMPS[n];
      cells.push({ t: `<small>${n}</small>${j ? `<em>${j > n ? '🪜' : '🐍'}${j}</em>` : ''}${here.map(TOK).join('')}`, cls: (j ? (j > n ? 'lad' : 'snk') : '') + ((r + c) % 2 ? ' alt' : '') });
    }
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `${TOK(i)} ${this.pos[i]}` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : this.msg || 'أول واحد بيوصل 100 بيربح', cls: 'lead' },
        { k: 'board', r: 10, c: 10, theme: 'snakes', cells, html: true },
        { k: 'row', items: [{ k: 'dice', d: [this.die || 1], roll: this.rollId }, my ? { k: 'btns', b: [{ t: '🎲 ارمي الزهر', a: { type: 'roll' }, cls: 'gold big' }] } : { k: 'text', t: `دور ${this.nm(this.turn)}` }] },
      ],
    };
  }
}

// ---------------- الطمّاع ----------------
export class Pig extends UIGame {
  constructor() { super('pig', 4); this.turn = rnd(4); this.pot = 0; this.die = 0; this.rollId = 0; this.target = 100; }
  act(seat, a) {
    this.check(seat);
    if (a.type === 'roll') {
      const d = d6(); this.die = d; this.rollId++; this.bump();
      if (d === 1) { this.msg = `💥 ${this.nm(seat)} جاب ١ وخسر ${this.pot}`; this.pot = 0; return this.wait(900, () => { this.turn = this.next(seat); }); }
      this.pot += d; this.msg = `${this.nm(seat)} جاب ${d} — المجموع ${this.pot}`; return;
    }
    if (a.type === 'hold') {
      if (!this.pot) throw new Error('ارمي أول');
      this.scores[seat] += this.pot; this.msg = `✅ ${this.nm(seat)} خبّى ${this.pot}`; this.pot = 0; this.bump();
      if (this.scores[seat] >= this.target) return this.end([seat], `🏆 ${this.nm(seat)} وصل ${this.target}!`);
      return this.wait(500, () => { this.turn = this.next(seat); });
    }
    throw new Error('حركة غلط');
  }
  botAction(seat) {
    const need = this.target - this.scores[seat]; const lead = Math.max(...this.scores) - this.scores[seat];
    const stopAt = need <= this.pot ? 0 : lead > 30 ? 25 : 20;
    return this.pot >= stopAt && this.pot > 0 ? { type: 'hold' } : { type: 'roll' };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over;
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `⭐ ${this.scores[i]}`, sub: i === this.turn && this.pot ? `+${this.pot}` : '' })),
      blocks: [
        { k: 'text', t: `أول واحد بيجمع ${this.target} بيربح — ارمي قد ما بدك، بس إذا طلع ١ بتخسر اللي جمعته بهالدور`, cls: 'hint' },
        { k: 'dice', d: [this.die || 6], roll: this.rollId, big: true },
        { k: 'text', t: this.over ? this.msg : this.msg || `دور ${this.nm(this.turn)}`, cls: 'lead' },
        { k: 'text', t: `بهالدور: <b>${this.pot}</b>`, cls: 'big' },
        my ? { k: 'btns', b: [{ t: '🎲 ارمي', a: { type: 'roll' }, cls: 'gold big' }, { t: `💰 خبّي ${this.pot}`, a: { type: 'hold' }, cls: 'green big', dis: !this.pot }] } : null,
      ],
    };
  }
}

// ---------------- خمسات (يتزي) ----------------
const YC = [['ones', 'الواحدات'], ['twos', 'التنينات'], ['threes', 'التلاتات'], ['fours', 'الأربعات'], ['fives', 'الخمسات'], ['sixes', 'الستات'],
  ['k3', 'تلاتة متل بعض'], ['k4', 'أربعة متل بعض'], ['fh', 'فل هاوس (٣+٢)'], ['ss', 'سلسلة صغيرة (٤)'], ['ls', 'سلسلة كبيرة (٥)'], ['yz', 'خمسات! (٥ متل بعض)'], ['ch', 'مجموع حر']];
function yscore(cat, d) {
  const cnt = [0, 0, 0, 0, 0, 0, 0]; d.forEach((x) => cnt[x]++); const sum = d.reduce((a, b) => a + b, 0); const m = Math.max(...cnt);
  const has = (seq) => seq.every((x) => cnt[x]);
  switch (cat) {
    case 'ones': return cnt[1]; case 'twos': return cnt[2] * 2; case 'threes': return cnt[3] * 3; case 'fours': return cnt[4] * 4; case 'fives': return cnt[5] * 5; case 'sixes': return cnt[6] * 6;
    case 'k3': return m >= 3 ? sum : 0; case 'k4': return m >= 4 ? sum : 0; case 'fh': return cnt.includes(3) && cnt.includes(2) ? 25 : 0;
    case 'ss': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0; case 'ls': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 40 : 0;
    case 'yz': return m === 5 ? 50 : 0; case 'ch': return sum;
  }
  return 0;
}
export class Yatzy extends UIGame {
  constructor() { super('yatzy', 4); this.sheet = [0, 1, 2, 3].map(() => ({})); this.turn = rnd(4); this.newTurn(); }
  newTurn() { this.dice = [1, 1, 1, 1, 1]; this.held = [false, false, false, false, false]; this.rolls = 0; this.rollId = (this.rollId || 0) + 1; }
  total(s) { const sh = this.sheet[s]; let t = 0, up = 0; for (const [k] of YC) if (sh[k] !== undefined) { t += sh[k]; if (YC.findIndex((x) => x[0] === k) < 6) up += sh[k]; } return t + (up >= 63 ? 35 : 0); }
  act(seat, a) {
    this.check(seat);
    if (a.type === 'roll') { if (this.rolls >= 3) throw new Error('خلصت رمياتك — اختار خانة'); this.dice = this.dice.map((x, i) => (this.held[i] && this.rolls ? x : d6())); this.rolls++; this.rollId++; this.bump(); return; }
    if (a.type === 'hold') { if (!this.rolls) throw new Error('ارمي أول'); const i = +a.i; this.held[i] = !this.held[i]; return; }
    if (a.type === 'cat') {
      if (!this.rolls) throw new Error('ارمي أول'); const k = a.c; if (!YC.some((x) => x[0] === k) || this.sheet[seat][k] !== undefined) throw new Error('خانة مستعملة');
      this.sheet[seat][k] = yscore(k, this.dice); this.msg = `${this.nm(seat)} سجّل ${this.sheet[seat][k]} بـ«${YC.find((x) => x[0] === k)[1]}»`; this.bump();
      this.scores = [0, 1, 2, 3].map((i) => this.total(i));
      if (this.sheet.every((sh, i) => this.out(i) || Object.keys(sh).length === YC.length)) return this.endByScore('خلصت الورقة');
      return this.wait(700, () => { this.turn = this.next(seat); this.newTurn(); });
    }
    throw new Error('حركة غلط');
  }
  botAction(seat) {
    if (!this.rolls) return { type: 'roll' };
    const free = YC.map((x) => x[0]).filter((k) => this.sheet[seat][k] === undefined);
    const best = free.map((k) => [k, yscore(k, this.dice) + (['yz', 'ls', 'fh', 'ss'].includes(k) ? 5 : 0) - (k === 'ch' ? 8 : 0)]).sort((a, b) => b[1] - a[1])[0];
    if (this.rolls < 3 && best[1] < 25) {
      const cnt = [0, 0, 0, 0, 0, 0, 0]; this.dice.forEach((x) => cnt[x]++); const f = cnt.indexOf(Math.max(...cnt.slice(1)));
      const want = this.dice.map((x) => x === f);
      const diff = want.findIndex((w, i) => w !== this.held[i]); if (diff >= 0) return { type: 'hold', i: diff };
      return { type: 'roll' };
    }
    return { type: 'cat', c: best[0] };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const sh = this.sheet[seat >= 0 ? seat : 0];
    const rows = YC.map(([k, n]) => { const done = sh[k] !== undefined; const pot = my && this.rolls && !done ? yscore(k, this.dice) : null; return { c: [n, done ? String(sh[k]) : pot !== null ? `<b class="pot">${pot}</b>` : '—'], a: my && this.rolls && !done ? { type: 'cat', c: k } : null, cls: done ? 'done' : '' }; });
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `⭐ ${this.total(i)}` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : my ? (this.rolls ? `رمية ${this.rolls} من ٣ — اكبس على الزهر لتثبّته، أو اختار خانة` : 'دورك — ارمي الزهر') : this.msg || `دور ${this.nm(this.turn)}`, cls: 'lead' },
        { k: 'dice', d: this.dice, held: this.held, act: my && this.rolls ? 'hold' : null, roll: this.rollId },
        my ? { k: 'btns', b: [{ t: `🎲 ارمي (${3 - this.rolls})`, a: { type: 'roll' }, cls: 'gold', dis: this.rolls >= 3 }] } : null,
        { k: 'table', rows, cls: 'ysheet' },
      ],
    };
  }
}

// ---------------- كذاب الزهر ----------------
export class Liar extends UIGame {
  constructor() { super('liar', 4); this.cnt = [5, 5, 5, 5]; this.turn = rnd(4); this.newRound(); }
  alive() { return [0, 1, 2, 3].filter((i) => this.cnt[i] > 0); }
  setOut() { for (let i = 0; i < 4; i++) if (this.out(i)) this.cnt[i] = 0; this.newRound(); }
  newRound() { this.dice = this.cnt.map((n) => Array.from({ length: n }, d6)); this.bid = null; this.reveal = null; this.bump(); }
  total() { return this.cnt.reduce((a, b) => a + b, 0); }
  countFace(f) { return this.dice.flat().filter((x) => x === f || x === 1).length; } // 1 is wild
  bids() {
    const out = []; const T = this.total();
    if (!this.bid) { for (let q = 1; q <= Math.min(T, 4); q++) for (let f = 2; f <= 6; f++) out.push([q, f]); return out; }
    const [q0, f0] = this.bid;
    for (let f = f0 + 1; f <= 6; f++) out.push([q0, f]);
    for (let q = q0 + 1; q <= Math.min(T, q0 + 3); q++) for (let f = 2; f <= 6; f++) out.push([q, f]);
    return out;
  }
  act(seat, a) {
    this.check(seat);
    if (a.type === 'bid') {
      const q = +a.q, f = +a.f; if (!this.bids().some(([x, y]) => x === q && y === f)) throw new Error('مزايدة مو مسموحة');
      this.bid = [q, f, seat]; this.msg = `${this.nm(seat)}: «في ${q} × ${'⚀⚁⚂⚃⚄⚅'[f - 1]}»`; this.bump();
      this.turn = this.next(seat, (i) => !this.cnt[i]); return;
    }
    if (a.type === 'liar') {
      if (!this.bid) throw new Error('ما في مزايدة لسا');
      const [q, f, who] = this.bid; const real = this.countFace(f); const lieer = real >= q ? seat : who;
      this.cnt[lieer]--; this.reveal = { dice: this.dice.map((d) => d.slice()), q, f, real, loser: lieer, caller: seat };
      this.msg = `${this.nm(seat)} قال «كذاب!» — كان في ${real} × ${'⚀⚁⚂⚃⚄⚅'[f - 1]} — ${this.nm(lieer)} خسر زهر`; this.bump();
      if (this.alive().length === 1) return this.end(this.alive(), `🏆 ${this.nm(this.alive()[0])} آخر واحد معه زهر!`);
      return this.wait(4500, () => { this.turn = this.cnt[lieer] ? lieer : this.next(lieer, (i) => !this.cnt[i]); this.newRound(); });
    }
    throw new Error('حركة غلط');
  }
  botAction(seat) {
    const mine = this.dice[seat]; const others = this.total() - mine.length;
    const expect = (f) => mine.filter((x) => x === f || x === 1).length + others / 3;
    if (this.bid && this.bid[0] > expect(this.bid[1]) + 0.8) return { type: 'liar' };
    const opts = this.bids().filter(([q, f]) => q <= expect(f) + 0.3);
    if (!opts.length) return this.bid ? { type: 'liar' } : { type: 'bid', q: 1, f: 2 + rnd(5) };
    const [q, f] = opts.sort((x, y) => x[0] - y[0] || expect(y[1]) - expect(x[1]))[Math.min(opts.length - 1, rnd(2))];
    return { type: 'bid', q, f };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const F = '⚀⚁⚂⚃⚄⚅';
    const blocks = [];
    if (this.reveal) {
      blocks.push({ k: 'text', t: this.msg, cls: 'lead' });
      this.reveal.dice.forEach((d, i) => { if (d.length) blocks.push({ k: 'dice', d, small: true, label: this.nm(i), mark: this.reveal.f }); });
    } else {
      blocks.push({ k: 'text', t: this.bid ? `آخر مزايدة: <b>${this.bid[0]} × ${F[this.bid[1] - 1]}</b> من ${this.nm(this.bid[2])}` : 'ما حدا زايد لسا', cls: 'lead' });
      blocks.push({ k: 'text', t: `الزهر كله: ${this.total()} • الـ⚀ جوكر بتنحسب مع أي رقم`, cls: 'hint' });
      if (seat >= 0 && this.cnt[seat]) blocks.push({ k: 'dice', d: this.dice[seat], label: 'زهرك (مخبّى عن الكل)' });
      if (my) {
        blocks.push({ k: 'btns', cls: 'bids', b: this.bids().slice(0, 15).map(([q, f]) => ({ t: `${q} × ${F[f - 1]}`, a: { type: 'bid', q, f }, cls: 'ghost' })) });
        if (this.bid) blocks.push({ k: 'btns', b: [{ t: '🤥 كذاب!', a: { type: 'liar' }, cls: 'red big' }] });
      } else blocks.push({ k: 'text', t: `دور ${this.nm(this.turn)}` });
    }
    return { players: [0, 1, 2, 3].map((i) => ({ badge: this.cnt[i] ? '🎲'.repeat(Math.min(5, this.cnt[i])) : '💀 طلع' })), blocks };
  }
}

// ---------------- دومينو ----------------
export class Domino extends UIGame {
  constructor() { super('domino', 4); this.target = 101; this.turn = rnd(4); this.deal(); }
  deal() {
    const t = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) t.push([a, b]);
    shuffle(t); this.hands = [0, 1, 2, 3].map((i) => t.slice(i * 7, i * 7 + 7)); this.chain = []; this.passes = 0; this.ends = null; this.bump();
  }
  fits(t) { if (!this.ends) return ['L']; const s = []; if (t[0] === this.ends[0] || t[1] === this.ends[0]) s.push('L'); if (t[0] === this.ends[1] || t[1] === this.ends[1]) s.push('R'); return s; }
  playable(seat) { return this.hands[seat].map((t, i) => (this.fits(t).length ? i : -1)).filter((i) => i >= 0); }
  pips(seat) { return this.hands[seat].reduce((a, t) => a + t[0] + t[1], 0); }
  place(seat, i, side) {
    const t = this.hands[seat][i];
    if (!this.ends) { this.chain.push(t); this.ends = [t[0], t[1]]; }
    else if (side === 'L') { const o = t[1] === this.ends[0] ? t : [t[1], t[0]]; this.chain.unshift(o); this.ends[0] = o[0]; }
    else { const o = t[0] === this.ends[1] ? t : [t[1], t[0]]; this.chain.push(o); this.ends[1] = o[1]; }
    this.hands[seat].splice(i, 1); this.passes = 0; this.bump();
    this.last = side;
  }
  roundEnd(winner, why) {
    const pts = [0, 1, 2, 3].filter((i) => i !== winner).reduce((a, i) => a + this.pips(i), 0);
    this.scores[winner] += pts; this.msg = `${why} — ${this.nm(winner)} أخد ${pts} نقطة`;
    if (this.scores[winner] >= this.target) return this.end([winner], `🏆 ${this.nm(winner)} وصل ${this.target}!`);
    this.wait(3500, () => { this.turn = winner; this.deal(); this.msg = 'جولة جديدة'; });
  }
  act(seat, a) {
    this.check(seat);
    if (a.type === 'pass') { if (this.playable(seat).length) throw new Error('عندك حجر بيركب'); this.passes++; this.msg = `${this.nm(seat)} دق 👊`; this.bump();
      if (this.passes >= 4) { const w = [0, 1, 2, 3].sort((x, y) => this.pips(x) - this.pips(y))[0]; return this.roundEnd(w, 'اللعبة تسكّرت'); }
      this.turn = this.next(seat); return; }
    const i = +a.i; const t = this.hands[seat][i]; if (!t) throw new Error('حجر غلط');
    const f = this.fits(t); if (!f.length) throw new Error('هالحجر ما بيركب');
    const side = a.side && f.includes(a.side) ? a.side : f[0];
    this.place(seat, i, side); this.msg = '';
    if (!this.hands[seat].length) return this.roundEnd(seat, `${this.nm(seat)} خلّص حجاره`);
    this.turn = this.next(seat);
  }
  botAction(seat) {
    const p = this.playable(seat); if (!p.length) return { type: 'pass' };
    const i = p.sort((x, y) => (this.hands[seat][y][0] + this.hands[seat][y][1]) - (this.hands[seat][x][0] + this.hands[seat][x][1]))[0];
    return { type: 'tile', i, side: this.fits(this.hands[seat][i])[0] };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const p = my ? this.playable(seat) : [];
    const both = my ? p.filter((i) => this.fits(this.hands[seat][i]).length === 2 && this.ends && this.ends[0] !== this.ends[1]) : [];
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `⭐ ${this.scores[i]}`, sub: `${this.hands[i].length} حجار` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : this.msg || (my ? 'دورك — اختار حجر' : `دور ${this.nm(this.turn)}`), cls: 'lead' },
        { k: 'dom', tiles: this.chain, label: this.ends ? `الطرفين: ${this.ends[0]} و ${this.ends[1]}` : 'الطاولة فاضية' },
        seat >= 0 ? { k: 'dom', tiles: this.hands[seat], click: p, act: 'tile', mine: true, label: both.length ? 'حجر بيركب عالطرفين: رح ينحط عالطرف الأول، أو استعمل الأزرار' : 'حجارك' } : null,
        my && both.length ? { k: 'btns', b: both.flatMap((i) => [{ t: `[${this.hands[seat][i].join('|')}] ◀ يسار`, a: { type: 'tile', i, side: 'L' }, cls: 'ghost' }, { t: `[${this.hands[seat][i].join('|')}] يمين ▶`, a: { type: 'tile', i, side: 'R' }, cls: 'ghost' }]) } : null,
        my && !p.length ? { k: 'btns', b: [{ t: '👊 دق (ما معي)', a: { type: 'pass' }, cls: 'gold big' }] } : null,
      ],
    };
  }
}

// ---------------- لودو ----------------
// 52-square track; each player starts at offset 13*s; home column of 6 (positions 52..57 => 57 is finish)
const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
export class Ludo extends UIGame {
  constructor() { super('ludo', 4); this.t = [0, 1, 2, 3].map(() => [-1, -1, -1, -1]); this.turn = rnd(4); this.die = 0; this.rolled = false; this.rollId = 0; this.sixes = 0; }
  abs(s, p) { return p < 0 || p > 50 ? null : (p + 13 * s) % 52; }
  canMove(s, k, d) { const p = this.t[s][k]; if (p === 57) return false; if (p < 0) return d === 6; return p + d <= 57; }
  movable(s) { return [0, 1, 2, 3].filter((k) => this.canMove(s, k, this.die)); }
  done(s) { return this.t[s].every((p) => p === 57); }
  act(seat, a) {
    this.check(seat);
    if (a.type === 'roll') {
      if (this.rolled) throw new Error('حرّك حجر');
      this.die = d6(); this.rolled = true; this.rollId++; this.bump();
      if (this.die === 6) this.sixes++; else this.sixes = 0;
      if (this.sixes === 3) { this.msg = `${this.nm(seat)} جاب ٣ ستات — راح دوره`; this.sixes = 0; return this.passTurn(seat); }
      const mv = this.movable(seat);
      if (!mv.length) { this.msg = `${this.nm(seat)} جاب ${this.die} وما في حركة`; return this.passTurn(seat); }
      this.msg = `${this.nm(seat)} جاب ${this.die}`;
      const same = mv.every((k) => this.t[seat][k] === this.t[seat][mv[0]]);
      if (mv.length === 1 || same) this.wait(750, () => { this.turn = seat; this.act(seat, { type: 'move', k: mv[0] }); });
      return;
    }
    if (a.type === 'move') {
      if (!this.rolled) throw new Error('ارمي أول'); const k = +a.k; if (!this.canMove(seat, k, this.die)) throw new Error('هالحجر ما بيتحرك');
      const p = this.t[seat][k]; const np = p < 0 ? 0 : p + this.die; this.t[seat][k] = np; this.bump();
      this.lastMv = { s: seat, k, from: p, to: np, id: (this.lastMv ? this.lastMv.id : 0) + 1, cap: null };
      let extra = this.die === 6; let note = '';
      const ab = this.abs(seat, np);
      if (ab !== null && !SAFE.includes(ab)) for (let o = 0; o < 4; o++) if (o !== seat) for (let j = 0; j < 4; j++) if (this.abs(o, this.t[o][j]) === ab) { this.t[o][j] = -1; extra = true; note = ` 💥 أكل حجر ${this.nm(o)}`; this.lastMv.cap = { s: o, k: j }; }
      if (np === 57) { extra = true; note = ' 🏁 وصّل حجر'; }
      this.scores = this.t.map((ts) => ts.filter((x) => x === 57).length);
      this.msg = `${this.nm(seat)} حرّك${note}`;
      if (this.done(seat)) return this.end([seat], `🏆 ${this.nm(seat)} وصّل كل حجاره!`);
      this.rolled = false;
      if (!extra) return this.passTurn(seat);
      this.msg += ' — بيلعب كمان'; return;
    }
    throw new Error('حركة غلط');
  }
  passTurn(seat) { this.rolled = false; this.sixes = 0; this.wait(700, () => { this.turn = this.next(seat); }); }
  botAction(seat) {
    if (!this.rolled) return { type: 'roll' };
    const ms = this.movable(seat); let best = ms[0], bv = -1e9;
    for (const k of ms) {
      const p = this.t[seat][k], np = p < 0 ? 0 : p + this.die, ab = this.abs(seat, np); let v = np - (p < 0 ? -20 : 0) + Math.random();
      if (ab !== null && !SAFE.includes(ab)) for (let o = 0; o < 4; o++) if (o !== seat && this.t[o].some((x) => this.abs(o, x) === ab)) v += 60;
      if (np === 57) v += 40; if (ab !== null && SAFE.includes(ab)) v += 8;
      if (v > bv) { bv = v; best = k; }
    }
    return { type: 'move', k: best };
  }
  view(seat) {
    const v = super.view(seat);
    v.ludo = { t: this.t, die: this.die, rolled: this.rolled, rollId: this.rollId, mv: seat === this.turn && this.rolled && !this.over ? this.movable(seat) : [], last: this.lastMv || null, cur: this.turn >= 0 ? this.turn : this.turnSave };
    return v;
  }
  // 15x15 board coordinates for the 52 track squares starting at red's start (bottom-left arm going up)
  static path() {
    const P = [];
    const seg = (r, c, dr, dc, n) => { for (let i = 0; i < n; i++) P.push([r + dr * i, c + dc * i]); };
    seg(13, 6, -1, 0, 5); seg(8, 5, 0, -1, 6); P.push([7, 0]); seg(6, 0, 0, 1, 6); seg(5, 6, -1, 0, 6); P.push([0, 7]); seg(0, 8, 1, 0, 6); seg(6, 9, 0, 1, 6); P.push([7, 14]); seg(8, 14, 0, -1, 6); seg(9, 8, 1, 0, 6); P.push([14, 7]); seg(14, 6, -1, 0, 1);
    return P.slice(0, 52);
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const P = Ludo.path();
    const homeCol = [[[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]], [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]], [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]], [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]]];
    const yards = [[[10, 1], [10, 3], [12, 1], [12, 3]], [[1, 1], [1, 3], [3, 1], [3, 3]], [[1, 11], [1, 13], [3, 11], [3, 13]], [[11, 11], [11, 13], [13, 11], [13, 13]]];
    const yardZone = (r, c) => (r >= 9 && c <= 5 ? 0 : r <= 5 && c <= 5 ? 1 : r <= 5 && c >= 9 ? 2 : r >= 9 && c >= 9 ? 3 : -1);
    const cells = Array.from({ length: 225 }, (_, i) => { const r = Math.floor(i / 15), c = i % 15; const y = yardZone(r, c); return { cls: y >= 0 ? 'yard' : 'off', bg: y >= 0 ? PCOL[y] + '33' : '' }; });
    P.forEach(([r, c], k) => { const i = r * 15 + c; cells[i] = { cls: 'trk' + (SAFE.includes(k) ? ' safe' : ''), bg: k % 13 === 0 ? PCOL[k / 13] + '88' : '' }; });
    homeCol.forEach((hc, s) => hc.forEach(([r, c]) => { cells[r * 15 + c] = { cls: 'trk', bg: PCOL[s] + '77' }; }));
    cells[7 * 15 + 7] = { cls: 'fin', t: '🏁' };
    const put = (r, c, s, k) => { const i = r * 15 + c; const cl = (cells[i].tok ||= []); cl.push({ s, k }); };
    this.t.forEach((ts, s) => ts.forEach((p, k) => {
      if (p < 0) put(...yards[s][k], s, k); else if (p <= 50) put(...P[(p + 13 * s) % 52], s, k); else if (p < 57) put(...homeCol[s][p - 51], s, k); else put(7, 7, s, k);
    }));
    const mv = my && this.rolled ? this.movable(seat) : [];
    cells.forEach((c) => { if (c.tok) { c.t = (c.t || '') + c.tok.map(({ s, k }) => `<i class="lt${s === seat && mv.includes(k) ? ' can' : ''}" style="background:${PCOL[s]}">${k + 1}</i>`).join(''); delete c.tok; } });
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `${TOK(i)} 🏁${this.t[i].filter((x) => x === 57).length}/4` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : this.msg || 'جيب ٦ لتطلّع حجر', cls: 'lead' },
        { k: 'board', r: 15, c: 15, theme: 'ludo', cells, html: true },
        { k: 'row', items: [{ k: 'dice', d: [this.die || 6], roll: this.rollId },
          my && !this.rolled ? { k: 'btns', b: [{ t: '🎲 ارمي', a: { type: 'roll' }, cls: 'gold big' }] }
          : my ? { k: 'btns', b: mv.map((k) => ({ t: `حرّك ${k + 1}`, a: { type: 'move', k }, cls: 'gold' })) } : { k: 'text', t: `دور ${this.nm(this.turn)}` }] },
      ],
    };
  }
}
