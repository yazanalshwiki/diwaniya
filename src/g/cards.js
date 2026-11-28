import { UIGame, rnd, shuffle, deck52, rank, suit } from './base.js';

const RN = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const cname = (c) => (RN[rank(c)] || rank(c)) + { S: '♠', H: '♥', D: '♦', C: '♣' }[suit(c)];

// ---------------- الشايب ----------------
export class Shayeb extends UIGame {
  constructor() {
    super('shayeb', 4);
    const d = shuffle(deck52().filter((c) => c !== 'C13'));
    this.hands = [[], [], [], []]; d.forEach((c, i) => this.hands[i % 4].push(c));
    this.hands = this.hands.map((h) => this.strip(h)); this.out = []; this.turn = rnd(4); this.drew = null; this.skipOut();
  }
  strip(h) { const by = {}; for (const c of h) (by[rank(c)] ||= []).push(c); const keep = []; for (const r in by) { const g = by[r]; if (g.length % 2) keep.push(g[0]); } return shuffle(keep); }
  active() { return [0, 1, 2, 3].filter((i) => this.hands[i].length); }
  target(s) { return this.next(s, (i) => !this.hands[i].length); }
  skipOut() { if (!this.hands[this.turn].length) this.turn = this.target(this.turn); }
  act(seat, a) {
    this.check(seat); const tg = this.target(seat); const i = +a.i;
    if (!(i >= 0 && i < this.hands[tg].length)) throw new Error('اختار ورقة');
    const c = this.hands[tg].splice(i, 1)[0];
    const pair = this.hands[seat].findIndex((x) => rank(x) === rank(c));
    if (pair >= 0) { this.hands[seat].splice(pair, 1); this.msg = `${this.nm(seat)} سحب ورقة وطلعت جوز 👌`; } else { this.hands[seat].push(c); shuffle(this.hands[seat]); this.msg = `${this.nm(seat)} سحب ورقة من ${this.nm(tg)}`; }
    this.drew = { seat, c: seat === seat ? c : null }; this.bump();
    for (const s of [seat, tg]) if (!this.hands[s].length && !this.out.includes(s)) this.out.push(s);
    const act = this.active();
    if (act.length === 1) { const loser = act[0]; this.scores = [0, 1, 2, 3].map((x) => (x === loser ? 0 : 1)); return this.end([0, 1, 2, 3].filter((x) => x !== loser), `👴 ${this.nm(loser)} علق معه الشايب!`); }
    this.wait(700, () => { this.turn = this.next(seat, (x) => !this.hands[x].length); });
  }
  botAction(seat) { return { type: 'card', i: rnd(this.hands[this.target(seat)].length) }; }
  scoreLabel(i) { return this.over ? (this.winners.includes(i) ? 'نجا ✅' : 'الشايب 👴') : this.hands[i].length; }
  ui(seat) {
    const my = seat === this.turn && !this.over; const tg = my ? this.target(seat) : -1;
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: this.hands[i].length ? `🂠 ${this.hands[i].length}` : '✅ خلّص' })),
      blocks: [
        { k: 'text', t: 'كل جوز بيطلع لحاله. اسحب ورقة من اللي بعدك — واللي بيضل معه الشايب (الشيخ الوحيد) بيخسر', cls: 'hint' },
        { k: 'text', t: this.over ? this.msg : my ? `اسحب ورقة من ${this.nm(tg)}` : this.msg || `دور ${this.nm(this.turn)}`, cls: 'lead' },
        my ? { k: 'cards', cards: this.hands[tg].map(() => 'X'), click: this.hands[tg].map((_, i) => i), act: 'card', label: `ورق ${this.nm(tg)}`, fan: true } : null,
        seat >= 0 ? { k: 'cards', cards: this.hands[seat].slice().sort((a, b) => rank(a) - rank(b)), label: 'ورقك', fan: true } : null,
      ],
    };
  }
}

// ---------------- بلاك جاك ٢١ ----------------
const bjv = (h) => { let t = 0, a = 0; for (const c of h) { const r = rank(c); if (r === 14) { a++; t += 11; } else t += r > 10 ? 10 : r; } while (t > 21 && a) { t -= 10; a--; } return t; };
export class Blackjack extends UIGame {
  constructor() { super('bj', 4); this.rounds = 8; this.round = 0; this.newRound(); }
  newRound() {
    this.round++; this.deck = shuffle([...deck52(), ...deck52()]);
    this.h = [0, 1, 2, 3].map(() => [this.deck.pop(), this.deck.pop()]); this.dealer = [this.deck.pop(), this.deck.pop()];
    this.done = [false, false, false, false]; this.res = null; this.turn = 0; this.bump();
    for (let i = 0; i < 4; i++) if (bjv(this.h[i]) === 21) this.done[i] = true;
    this.advance();
  }
  advance() {
    while (this.turn < 4 && this.done[this.turn]) this.turn++;
    if (this.turn >= 4) { this.turn = -1; this.dealerPlay(); }
  }
  dealerPlay() {
    while (bjv(this.dealer) < 17) this.dealer.push(this.deck.pop());
    const dv = bjv(this.dealer);
    this.res = this.h.map((h, i) => { const v = bjv(h); const bj = v === 21 && h.length === 2; let r = v > 21 ? -1 : dv > 21 || v > dv ? 1 : v === dv ? 0 : -1; const pts = r > 0 ? (bj ? 15 : 10) : 0; this.scores[i] += pts; return { v, r, pts, bj }; });
    this.msg = `البنك جاب ${dv > 21 ? 'فوق الـ21 💥' : dv}`; this.bump();
    if (this.round >= this.rounds) return this.endByScore('خلصت الجولات');
    this.wait(4000, () => this.newRound());
  }
  act(seat, a) {
    this.check(seat);
    if (a.type === 'hit') { this.h[seat].push(this.deck.pop()); this.bump(); const v = bjv(this.h[seat]); if (v >= 21) { this.done[seat] = true; this.msg = v > 21 ? `${this.nm(seat)} طلع فوق 21 💥` : `${this.nm(seat)} جاب 21!`; this.advance(); } return; }
    if (a.type === 'stand') { this.done[seat] = true; this.msg = `${this.nm(seat)} وقف على ${bjv(this.h[seat])}`; this.bump(); this.advance(); return; }
    throw new Error('حركة غلط');
  }
  botAction(seat) { const v = bjv(this.h[seat]); const up = Math.min(10, rank(this.dealer[0]) > 10 ? (rank(this.dealer[0]) === 14 ? 11 : 10) : rank(this.dealer[0])); return v < 12 || (v < 17 && up >= 7) ? { type: 'hit' } : { type: 'stand' }; }
  ui(seat) {
    const my = seat === this.turn && !this.over; const showD = !!this.res;
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `⭐ ${this.scores[i]}`, sub: this.res ? (this.res[i].r > 0 ? `ربح +${this.res[i].pts}` : this.res[i].r === 0 ? 'تعادل' : 'خسر') : `${bjv(this.h[i])}${this.done[i] ? ' ✋' : ''}` })),
      blocks: [
        { k: 'text', t: `جولة ${this.round} من ${this.rounds} • قرّب على 21 بدون ما تطلع فوقها، وتغلّب على البنك`, cls: 'hint' },
        { k: 'cards', cards: showD ? this.dealer : [this.dealer[0], 'X'], label: `🏦 البنك ${showD ? '— ' + bjv(this.dealer) : ''}` },
        { k: 'text', t: this.over ? this.msg : this.msg || (my ? 'دورك' : this.turn >= 0 ? `دور ${this.nm(this.turn)}` : ''), cls: 'lead' },
        seat >= 0 ? { k: 'cards', cards: this.h[seat], label: `ورقك — ${bjv(this.h[seat])}` } : null,
        my ? { k: 'btns', b: [{ t: '➕ ورقة كمان', a: { type: 'hit' }, cls: 'gold big' }, { t: '✋ بكفّي', a: { type: 'stand' }, cls: 'green big' }] } : null,
      ],
    };
  }
}

// ---------------- ذاكرة الورق ----------------
export class Memory extends UIGame {
  constructor() {
    super('memory', 4);
    const ranks = shuffle([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).slice(0, 12);
    this.cards = shuffle(ranks.flatMap((r) => [['S', 'C'][rnd(2)] + r, ['H', 'D'][rnd(2)] + r]));
    this.state = this.cards.map(() => -2); // -2 hidden, -1 flipped now, >=0 owner
    this.open = []; this.turn = rnd(4); this.seen = {};
  }
  act(seat, a) {
    this.check(seat); const i = +a.i;
    if (this.state[i] !== -2 || this.open.length >= 2) throw new Error('اختار ورقة مقلوبة');
    this.state[i] = -1; this.open.push(i); this.seen[i] = this.cards[i]; this.bump();
    if (this.open.length < 2) return;
    const [x, y] = this.open;
    if (rank(this.cards[x]) === rank(this.cards[y])) {
      this.state[x] = this.state[y] = seat; this.scores[seat]++; this.msg = `✅ ${this.nm(seat)} لقى جوز — بيلعب كمان`;
      this.wait(800, () => { this.open = []; this.turn = seat; if (this.state.every((s) => s >= 0)) this.endByScore('خلص الورق'); });
    } else { this.msg = `${this.nm(seat)} ما زبطت معه`; this.wait(1500, () => { this.state[x] = this.state[y] = -2; this.open = []; this.turn = this.next(seat); }); }
  }
  botAction(seat) {
    const hid = this.state.map((s, i) => (s === -2 ? i : -1)).filter((i) => i >= 0);
    const known = hid.filter((i) => this.seen[i] && Math.random() < 0.7);
    if (this.open.length === 1) { const r = rank(this.cards[this.open[0]]); const m = known.find((i) => rank(this.seen[i]) === r); return { type: 'card', i: m !== undefined ? m : hid[rnd(hid.length)] }; }
    for (const i of known) for (const j of known) if (i < j && rank(this.seen[i]) === rank(this.seen[j])) return { type: 'card', i };
    const unk = hid.filter((i) => !this.seen[i]); const pool = unk.length ? unk : hid; return { type: 'card', i: pool[rnd(pool.length)] };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over;
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `🃏 ${this.scores[i]}` })),
      blocks: [
        { k: 'text', t: this.over ? this.msg : my ? 'دورك — اقلب ورقتين' : this.msg || `دور ${this.nm(this.turn)}`, cls: 'lead' },
        { k: 'cards', grid: 6, cards: this.cards.map((c, i) => (this.state[i] === -2 ? 'X' : c)), dim: this.state.map((s) => s >= 0), click: my && this.open.length < 2 ? this.state.map((s, i) => (s === -2 ? i : -1)).filter((i) => i >= 0) : [], act: 'card' },
      ],
    };
  }
}

// ---------------- أعلى ولا أوطى ----------------
export class HiLo extends UIGame {
  constructor() { super('hilo', 4); this.turn = -1; this.deck = shuffle(deck52()); this.cur = this.deck.pop(); this.rounds = 15; this.round = 0; this.phase = 'pick'; this.pick = [null, null, null, null]; this.endsAt = Date.now() + 99999; this.plan = []; }
  init() { this.newRound(); }
  get pending() { if (this.over) return null; return { delay: Math.max(30, Math.min(this.endsAt, ...(this.plan || []).filter((p) => p && this.pick[p.s] === null).map((p) => p.at)) - Date.now()) }; }
  set pending(v) {}
  newRound() { this.round++; this.pick = [0, 1, 2, 3].map((i) => (this.out(i) ? 'x' : null)); this.phase = 'pick'; this.endsAt = Date.now() + 9000; this.bump();
    const r = rank(this.cur); this.plan = [0, 1, 2, 3].map((s) => (this.bot(s) ? { s, at: Date.now() + 1500 + rnd(5000), v: Math.random() < (r <= 7 ? 0.8 : r >= 9 ? 0.2 : 0.5) ? 'hi' : 'lo' } : null)); }
  act(seat, a) {
    if (this.over || this.phase !== 'pick') throw new Error('استنى');
    if (seat < 0 || this.pick[seat] !== null) throw new Error('اخترت'); if (a.v !== 'hi' && a.v !== 'lo') throw new Error('اختار');
    this.pick[seat] = a.v; if (this.pick.every((x) => x !== null)) this.endsAt = Date.now();
  }
  tick() {
    const now = Date.now();
    if (this.phase === 'pick') { for (const p of this.plan) if (p && this.pick[p.s] === null && now >= p.at) this.pick[p.s] = p.v; if (now >= this.endsAt || this.pick.every((x) => x !== null)) this.reveal(); return; }
    if (this.phase === 'show' && now >= this.endsAt) { this.cur = this.nextC; if (this.round >= this.rounds) return this.endByScore('خلصت الجولات'); this.newRound(); }
  }
  reveal() {
    if (this.deck.length < 2) this.deck = shuffle(deck52());
    this.nextC = this.deck.pop(); const d = rank(this.nextC) - rank(this.cur); const res = d > 0 ? 'hi' : d < 0 ? 'lo' : 'eq';
    this.gain = this.pick.map((p) => (p && p === res ? 10 : 0)); this.gain.forEach((g, i) => (this.scores[i] += g));
    this.res = res; this.phase = 'show'; this.endsAt = Date.now() + 2800; this.bump();
  }
  botAction() { return { type: 'noop' }; }
  ui(seat) {
    const showing = this.phase === 'show';
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `⭐ ${this.scores[i]}`, sub: showing ? (this.gain[i] ? '+10 ✅' : '✗') : this.pick[i] ? 'اختار ✓' : '' })),
      blocks: [
        { k: 'text', t: `جولة ${this.round} من ${this.rounds} — الورقة الجاية أعلى ولا أوطى؟`, cls: 'hint' },
        { k: 'cards', cards: showing ? [this.cur, this.nextC] : [this.cur, 'X'], big: true },
        showing ? { k: 'text', t: this.res === 'eq' ? 'متل بعض! ما حدا أخد' : this.res === 'hi' ? '⬆️ أعلى' : '⬇️ أوطى', cls: 'lead' }
        : seat >= 0 && this.pick[seat] === null ? { k: 'btns', b: [{ t: '⬆️ أعلى', a: { type: 'pick', v: 'hi' }, cls: 'green big' }, { t: '⬇️ أوطى', a: { type: 'pick', v: 'lo' }, cls: 'red big' }] }
        : { k: 'text', t: 'استنى الباقيين…', cls: 'lead' },
        { k: 'timer', ms: showing ? 2800 : 9000 },
      ],
    };
  }
}

// ---------------- باصرة ----------------
const bval = (c) => { const r = rank(c); return r === 14 ? 1 : r; };
export class Basra extends UIGame {
  constructor() { super('basra', 4); this.deck = shuffle(deck52()); this.table = []; for (let k = 0; k < 4; k++) { let c = this.deck.pop(); while (c === 'D7' || rank(c) === 11) { this.deck.unshift(c); c = this.deck.pop(); } this.table.push(c); } this.caps = [[], [], [], []]; this.lastCap = -1; this.turn = rnd(4); this.dealHands(); }
  dealHands() { this.hands = [0, 1, 2, 3].map(() => [this.deck.pop(), this.deck.pop(), this.deck.pop(), this.deck.pop()]); this.bump(); }
  capture(c) {
    const r = rank(c);
    if (r === 11 || c === 'D7') return this.table.slice();
    const out = new Set(this.table.filter((t) => rank(t) === r));
    if (r <= 10) { // add one subset of number cards that sums to the value
      const nums = this.table.filter((t) => rank(t) <= 10 || rank(t) === 14).filter((t) => !out.has(t));
      let best = [];
      const go = (k, sum, pick) => { if (sum === bval(c) && pick.length > best.length) best = pick.slice(); if (k >= nums.length || sum >= bval(c)) return; pick.push(nums[k]); go(k + 1, sum + bval(nums[k]), pick); pick.pop(); go(k + 1, sum, pick); };
      go(0, 0, []); best.forEach((x) => out.add(x));
    }
    return [...out];
  }
  act(seat, a) {
    this.check(seat); const i = +a.i; const c = this.hands[seat][i]; if (!c) throw new Error('اختار ورقة');
    this.hands[seat].splice(i, 1); const got = this.capture(c);
    if (got.length) {
      const basra = got.length === this.table.length && rank(c) !== 11 && !(c === 'D7' && false);
      this.table = this.table.filter((t) => !got.includes(t)); this.caps[seat].push(c, ...got); this.lastCap = seat;
      this.scores[seat] += got.length + 1 + (basra && this.deck.length + this.hands.flat().length > 0 ? 10 : 0);
      this.msg = basra && rank(c) !== 11 ? `🔥 باصرة! ${this.nm(seat)} نضّف الطاولة +10` : `${this.nm(seat)} أكل ${got.length} ${got.length > 1 ? 'ورقات' : 'ورقة'}`;
    } else { this.table.push(c); this.msg = `${this.nm(seat)} نزّل ${cname(c)}`; }
    this.bump();
    if (this.hands.every((h) => !h.length)) {
      if (this.deck.length >= 16) this.dealHands();
      else { if (this.lastCap >= 0) { this.scores[this.lastCap] += this.table.length; } this.table = []; return this.endByScore('خلص الورق'); }
    }
    this.wait(650, () => { this.turn = this.next(seat); });
  }
  botAction(seat) {
    let best = 0, bv = -1;
    this.hands[seat].forEach((c, i) => { const g = this.capture(c); let v = g.length * 2 + (g.length && g.length === this.table.length ? 15 : 0) - (rank(c) === 11 && g.length < 3 ? 6 : 0) + Math.random(); if (!g.length) v = -bval(c) / 20; if (v > bv) { bv = v; best = i; } });
    return { type: 'card', i: best };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over;
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `⭐ ${this.scores[i]}` })),
      blocks: [
        { k: 'text', t: 'كُل الورق اللي رقمه متل ورقتك أو مجموعه متلها. الولد بيكنس كل الطاولة، والسبعة الديناري كمان. تنضيف الطاولة = باصرة +10', cls: 'hint' },
        { k: 'cards', cards: this.table.length ? this.table : [], label: `الطاولة (${this.table.length}) • باقي بالشدة ${this.deck.length}` },
        { k: 'text', t: this.over ? this.msg : this.msg || (my ? 'دورك' : `دور ${this.nm(this.turn)}`), cls: 'lead' },
        seat >= 0 ? { k: 'cards', cards: this.hands[seat], click: my ? this.hands[seat].map((_, i) => i) : [], act: 'card', label: my ? 'دورك — اختار ورقة' : 'ورقك', fan: true } : null,
      ],
    };
  }
}

// ---------------- الثمانية المجنونة ----------------
const SN = { S: '♠ بستوني', H: '♥ كبة', D: '♦ ديناري', C: '♣ سباتي' };
export class Crazy8 extends UIGame {
  constructor() { super('crazy8', 4); this.deck = shuffle(deck52()); this.hands = [0, 1, 2, 3].map(() => this.deck.splice(0, 7)); let t = this.deck.pop(); while (rank(t) === 8) { this.deck.unshift(t); t = this.deck.pop(); } this.pile = [t]; this.suit = suit(t); this.turn = rnd(4); this.drawn = false; this.choose = false; }
  top() { return this.pile[this.pile.length - 1]; }
  ok(c) { return rank(c) === 8 || suit(c) === this.suit || rank(c) === rank(this.top()); }
  act(seat, a) {
    this.check(seat);
    if (this.choose) { if (!SN[a.s]) throw new Error('اختار لون'); this.suit = a.s; this.choose = false; this.msg = `${this.nm(seat)} اختار ${SN[a.s]}`; return this.after(seat); }
    if (a.type === 'draw') { if (this.drawn) throw new Error('سحبت'); if (!this.deck.length) { this.deck = shuffle(this.pile.splice(0, this.pile.length - 1)); } const c = this.deck.pop(); if (c) this.hands[seat].push(c); this.drawn = true; this.bump(); this.msg = `${this.nm(seat)} سحب ورقة`; if (!c || !this.ok(c)) return this.after(seat); return; }
    if (a.type === 'pass') { if (!this.drawn) throw new Error('اسحب أول'); return this.after(seat); }
    const i = +a.i; const c = this.hands[seat][i]; if (!c || !this.ok(c)) throw new Error('ما بتركب');
    this.hands[seat].splice(i, 1); this.pile.push(c); this.suit = suit(c); this.bump(); this.msg = `${this.nm(seat)} نزّل ${cname(c)}`;
    if (!this.hands[seat].length) { const pts = this.hands.reduce((t, h) => t + h.length, 0); this.scores[seat] = pts; return this.end([seat], `🏆 ${this.nm(seat)} خلّص ورقه!`); }
    if (rank(c) === 8) { this.choose = true; this.msg += ' — بيختار اللون'; return; }
    this.after(seat);
  }
  after(seat) { this.drawn = false; this.wait(550, () => { this.turn = this.next(seat); }); }
  botAction(seat) {
    if (this.choose) { const cnt = {}; this.hands[seat].forEach((c) => (cnt[suit(c)] = (cnt[suit(c)] || 0) + 1)); return { type: 'suit', s: Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || 'S' }; }
    const h = this.hands[seat]; const ok = h.map((c, i) => (this.ok(c) ? i : -1)).filter((i) => i >= 0);
    if (ok.length) { const non8 = ok.filter((i) => rank(h[i]) !== 8); return { type: 'card', i: (non8.length ? non8 : ok)[0] }; }
    return this.drawn ? { type: 'pass' } : { type: 'draw' };
  }
  ui(seat) {
    const my = seat === this.turn && !this.over; const h = seat >= 0 ? this.hands[seat] : [];
    return {
      players: [0, 1, 2, 3].map((i) => ({ badge: `🂠 ${this.hands[i].length}` })),
      blocks: [
        { k: 'text', t: 'نزّل ورقة من نفس اللون أو نفس الرقم. الثمانية بتركب على أي شي وبتختار اللون. أول واحد بيخلّص ورقه بيربح', cls: 'hint' },
        { k: 'row', items: [{ k: 'cards', cards: ['X'], label: `الشدة ${this.deck.length}` }, { k: 'cards', cards: [this.top()], label: `اللون: ${SN[this.suit]}` }] },
        { k: 'text', t: this.over ? this.msg : this.msg || (my ? 'دورك' : `دور ${this.nm(this.turn)}`), cls: 'lead' },
        my && this.choose ? { k: 'btns', b: Object.entries(SN).map(([s, n]) => ({ t: n, a: { type: 'suit', s }, cls: 'ghost big' })) } : null,
        seat >= 0 ? { k: 'cards', cards: h, click: my && !this.choose ? h.map((c, i) => (this.ok(c) ? i : -1)).filter((i) => i >= 0) : [], act: 'card', fan: true, label: 'ورقك' } : null,
        my && !this.choose ? { k: 'btns', b: this.drawn ? [{ t: '⏭️ مرّر', a: { type: 'pass' }, cls: 'ghost' }] : [{ t: '🂠 اسحب ورقة', a: { type: 'draw' }, cls: 'gold' }] } : null,
      ],
    };
  }
}
