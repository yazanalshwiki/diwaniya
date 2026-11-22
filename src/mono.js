// ================== عقارات الديوانية — an original property-trading board game ==================
// 28 squares around an 8x8 board. 4 seats (bots fill empty ones).

const P = (name, g, price) => ({ k: 'prop', name, g, price });
export const BOARD = [
  { k: 'go', name: 'انطلاق' },
  P('حي البلد', 0, 60),
  { k: 'luck', name: 'حظ' },
  P('حي الرويس', 0, 60),
  { k: 'tax', name: 'ضريبة', amt: 100 },
  { k: 'rail', name: 'محطة القطار', price: 200 },
  P('حي الشرفية', 1, 100),
  { k: 'jail', name: 'السجن' },
  P('حي الصفا', 1, 120),
  { k: 'util', name: 'الكهرباء', price: 150 },
  P('حي النسيم', 2, 140),
  P('حي الفيصلية', 2, 160),
  { k: 'rail', name: 'المطار', price: 200 },
  { k: 'luck', name: 'حظ' },
  { k: 'park', name: 'استراحة' },
  P('حي الروضة', 3, 180),
  P('حي السلامة', 3, 200),
  { k: 'luck', name: 'حظ' },
  P('حي الزهراء', 4, 220),
  { k: 'rail', name: 'الميناء', price: 200 },
  P('حي الحمراء', 4, 240),
  { k: 'gojail', name: 'روح عالسجن' },
  P('حي الخالدية', 5, 260),
  P('حي الشاطئ', 5, 280),
  { k: 'util', name: 'المياه', price: 150 },
  { k: 'tax', name: 'ضريبة رفاهية', amt: 75 },
  P('الكورنيش', 6, 350),
  P('برج الديوانية', 6, 400),
];
const N = BOARD.length;
const JAIL = 7;
const GO_PAY = 200;
const BAIL = 50;
const MAX_ROUNDS = 25;
const START_CASH = 1500;
const GROUPS = [0, 1, 2, 3, 4, 5, 6].map((g) => BOARD.map((s, i) => (s.g === g ? i : -1)).filter((i) => i >= 0));
const HOUSE_COST = [50, 50, 100, 100, 150, 150, 200];
const RENT_MULT = [0.08, 0.4, 1.1, 2.6, 3.6, 4.8]; // 0 houses .. hotel(5)

const LUCK = [
  { t: 'ربحت مسابقة الحي 🏆', cash: 150 },
  { t: 'رجعلك مبلغ من البنك 💰', cash: 100 },
  { t: 'مخالفة ساهر 📸', cash: -50 },
  { t: 'صيانة المكيفات بكل بيوتك 🛠️', repair: 25 },
  { t: 'عزيمة! كل لاعب بيدفعلك 20 🍖', each: 20 },
  { t: 'تقدّم لنقطة الانطلاق ✨', goto: 0 },
  { t: 'روح عالسجن 🚔', jail: true },
  { t: 'ارجع ٣ خانات ↩️', back: 3 },
  { t: 'روح لأقرب محطة 🚆', rail: true },
  { t: 'دفعت فاتورة الكهرباء 💡', cash: -40 },
  { t: 'ربحت سحب الجمعية 🎁', cash: 80 },
  { t: 'روح على برج الديوانية 🏙️', goto: 27 },
];

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const d6 = () => 1 + Math.floor(Math.random() * 6);

export class Mono {
  constructor() {
    this.type = 'mono';
    this.players = [0, 1, 2, 3].map(() => ({ pos: 0, cash: START_CASH, jailed: 0, out: false }));
    this.owner = Array(N).fill(-1);
    this.level = Array(N).fill(0);
    this.turn = Math.floor(Math.random() * 4);
    this.first = this.turn;
    this.round = 1;
    this.phase = 'roll';
    this.dice = [0, 0];
    this.rollId = 0;
    this.dbl = 0;
    this.pending = null;
    this.over = false;
    this.winners = [];
    this.history = [];
    this.log = [];
    this.luckDeck = shuffle(LUCK.map((_, i) => i));
    this.card = null; // last luck card {t, seat, id}
    this.moveFx = null; // {seat, from, to, steps, id}
    this.msg = 'ارمي الزهر 🎲';
  }
  say(t) { this.log.push(t); if (this.log.length > 40) this.log.shift(); this.nlog = (this.nlog || 0) + 1; }
  tick() { const p = this.pending; if (!p) return; this.pending = null; this[p.fn](); }
  check(seat) {
    if (this.over) throw new Error('اللعبة انتهت');
    if (this.pending) throw new Error('انتظر لحظة');
    if (seat !== this.turn) throw new Error('مو دورك');
  }
  groupOf(i) { return BOARD[i].g; }
  hasSet(seat, g) { return GROUPS[g].every((i) => this.owner[i] === seat); }
  count(seat, k) { return BOARD.filter((s, i) => s.k === k && this.owner[i] === seat).length; }
  rent(i, roll) {
    const s = BOARD[i], o = this.owner[i];
    if (s.k === 'rail') return 25 * 2 ** (this.count(o, 'rail') - 1);
    if (s.k === 'util') return roll * (this.count(o, 'util') === 2 ? 10 : 4);
    const base = Math.round(s.price * RENT_MULT[this.level[i]] / 5) * 5 || 5;
    return this.level[i] === 0 && this.hasSet(o, s.g) ? base * 2 : base;
  }
  buildable(seat) {
    if (this.players[seat].jailed) return [];
    const out = [];
    for (let g = 0; g < GROUPS.length; g++) {
      if (!this.hasSet(seat, g)) continue;
      const lv = GROUPS[g].map((i) => this.level[i]);
      const min = Math.min(...lv);
      for (const i of GROUPS[g]) if (this.level[i] === min && min < 5 && this.players[seat].cash >= HOUSE_COST[g]) out.push(i);
    }
    return out;
  }
  worth(seat) {
    const p = this.players[seat];
    if (p.out) return -1;
    let w = p.cash;
    BOARD.forEach((s, i) => { if (this.owner[i] === seat) w += (s.price || 0) + (s.g !== undefined ? this.level[i] * HOUSE_COST[s.g] : 0); });
    return w;
  }
  alive() { return [0, 1, 2, 3].filter((i) => !this.players[i].out); }

  act(seat, a) {
    this.check(seat);
    const p = this.players[seat];
    if (a.type === 'build') {
      if (this.phase !== 'roll') throw new Error('بتبني قبل ما ترمي الزهر');
      const i = +a.idx;
      if (!this.buildable(seat).includes(i)) throw new Error('ما بتقدر تبني هون');
      const g = BOARD[i].g;
      p.cash -= HOUSE_COST[g]; this.level[i]++;
      this.say(`🏗️ ${this.nm(seat)} بنى ${this.level[i] === 5 ? 'فندق' : 'بيت'} بـ${BOARD[i].name}`);
      return;
    }
    if (this.phase === 'roll') {
      if (a.type === 'bail') {
        if (!p.jailed) throw new Error('مانك بالسجن');
        this.pay(seat, BAIL, -1); p.jailed = 0;
        this.say(`🔓 ${this.nm(seat)} دفع الكفالة ${BAIL}`);
        return;
      }
      if (a.type !== 'roll') throw new Error('ارمي الزهر');
      const d = [d6(), d6()];
      this.dice = d; this.rollId++;
      const doubles = d[0] === d[1];
      if (p.jailed) {
        if (doubles) { p.jailed = 0; this.say(`🎲 ${this.nm(seat)} طلعله دبل وطلع من السجن`); this.dbl = 0; this.moveBy(seat, d[0] + d[1], false); return; }
        p.jailed++;
        if (p.jailed > 3) { this.pay(seat, BAIL, -1); p.jailed = 0; this.say(`🔓 ${this.nm(seat)} خلصت محاولاته ودفع ${BAIL}`); this.moveBy(seat, d[0] + d[1], false); return; }
        this.say(`🎲 ${this.nm(seat)} ما طلعله دبل — باقي بالسجن`);
        this.phase = 'wait'; this.turn = -1; this.pending = { delay: 1100, fn: 'endTurn' }; this.cur = seat;
        return;
      }
      if (doubles) { this.dbl++; if (this.dbl === 3) { this.say(`🚔 ${this.nm(seat)} ٣ دبل ورا بعض — عالسجن!`); this.cur = seat; this.sendJail(seat); this.phase = 'wait'; this.turn = -1; this.pending = { delay: 1200, fn: 'endTurn' }; return; } }
      else this.dbl = 0;
      this.moveBy(seat, d[0] + d[1], doubles);
      return;
    }
    if (this.phase === 'buy') {
      const i = p.pos, s = BOARD[i];
      if (a.type === 'buy') {
        if (p.cash < s.price) throw new Error('ما معك مصاري كفاية');
        p.cash -= s.price; this.owner[i] = seat;
        this.say(`🏠 ${this.nm(seat)} اشترى ${s.name} بـ${s.price}`);
      } else if (a.type === 'skip') this.say(`↪️ ${this.nm(seat)} ما اشترى ${s.name}`);
      else throw new Error('اشتري أو كمّل');
      this.afterLand(seat);
      return;
    }
    throw new Error('ما فيه حركة الحين');
  }
  nm(seat) { return (this.names && this.names[seat]) || `لاعب ${seat + 1}`; }
  moveBy(seat, steps, again) {
    const p = this.players[seat];
    const from = p.pos;
    const to = (from + steps + N) % N;
    if (steps > 0 && to < from) { p.cash += GO_PAY; this.say(`✨ ${this.nm(seat)} مرق عالانطلاق +${GO_PAY}`); }
    p.pos = to;
    this.moveFx = { seat, from, steps, id: this.rollId * 10 + (this.moveFx ? (this.moveFx.id % 10) + 1 : 0) };
    this.cur = seat; this.again = again; this.lastRoll = this.dice[0] + this.dice[1];
    this.phase = 'moving'; this.turn = -1;
    this.pending = { delay: 450 + Math.abs(steps) * 170, fn: 'land' };
  }
  land() {
    const seat = this.cur, p = this.players[seat], i = p.pos, s = BOARD[i];
    this.phase = 'landed';
    if (s.k === 'prop' || s.k === 'rail' || s.k === 'util') {
      const o = this.owner[i];
      if (o < 0) {
        if (p.cash >= s.price) { this.phase = 'buy'; this.turn = seat; this.msg = `بدك تشتري ${s.name} بـ${s.price}؟`; return; }
        this.say(`💸 ${this.nm(seat)} ما معه يشتري ${s.name}`);
      } else if (o !== seat && !this.players[o].out) {
        const r = this.rent(i, this.lastRoll);
        this.say(`🧾 ${this.nm(seat)} دفع إيجار ${r} لـ${this.nm(o)} (${s.name})`);
        this.pay(seat, r, o);
      }
    } else if (s.k === 'tax') { this.say(`🏛️ ${this.nm(seat)} دفع ${s.name} ${s.amt}`); this.pay(seat, s.amt, -1); }
    else if (s.k === 'gojail') { this.say(`🚔 ${this.nm(seat)} راح عالسجن`); this.sendJail(seat); this.again = false; }
    else if (s.k === 'luck') { this.drawLuck(seat); if (this.phase === 'moving' || this.phase === 'buy') return; }
    this.afterLand(seat);
  }
  drawLuck(seat) {
    if (!this.luckDeck.length) this.luckDeck = shuffle(LUCK.map((_, i) => i));
    const c = LUCK[this.luckDeck.pop()];
    const p = this.players[seat];
    this.card = { t: c.t, seat, id: (this.card ? this.card.id : 0) + 1 };
    this.say(`🍀 حظ ${this.nm(seat)}: ${c.t}`);
    if (c.cash > 0) p.cash += c.cash;
    else if (c.cash < 0) this.pay(seat, -c.cash, -1);
    else if (c.repair) { const n = this.level.reduce((t, l, i) => t + (this.owner[i] === seat ? l : 0), 0); if (n) this.pay(seat, n * c.repair, -1); }
    else if (c.each) { for (const o of this.alive()) if (o !== seat) this.pay(o, c.each, seat); }
    else if (c.jail) { this.sendJail(seat); this.again = false; }
    else if (c.goto !== undefined) { this.moveBy(seat, (c.goto - p.pos + N) % N || N, this.again); }
    else if (c.back) { this.moveBy(seat, -c.back, this.again); }
    else if (c.rail) { let k = 1; while (BOARD[(p.pos + k) % N].k !== 'rail') k++; this.moveBy(seat, k, this.again); }
  }
  sendJail(seat) { const p = this.players[seat]; p.pos = JAIL; p.jailed = 1; this.dbl = 0; this.moveFx = { seat, from: JAIL, steps: 0, id: (this.moveFx ? this.moveFx.id : 0) + 1, jump: true }; }
  pay(seat, amt, to) {
    const p = this.players[seat];
    if (p.cash < amt) this.liquidate(seat, amt);
    const paid = Math.min(amt, Math.max(0, p.cash));
    p.cash -= amt;
    if (to >= 0) this.players[to].cash += paid;
    if (p.cash < 0) this.bankrupt(seat, to);
  }
  liquidate(seat, need) {
    const p = this.players[seat];
    // sell houses (half price), most expensive first, then properties to the bank at half price
    const mine = BOARD.map((s, i) => i).filter((i) => this.owner[i] === seat).sort((a, b) => (BOARD[b].price || 0) - (BOARD[a].price || 0));
    for (const i of mine) while (p.cash < need && this.level[i] > 0) { this.level[i]--; p.cash += HOUSE_COST[BOARD[i].g] / 2; }
    for (const i of mine.slice().reverse()) {
      if (p.cash >= need) break;
      if (this.level[i] > 0) continue;
      p.cash += Math.floor(BOARD[i].price / 2); this.owner[i] = -1;
      this.say(`🏷️ ${this.nm(seat)} باع ${BOARD[i].name} للبنك`);
    }
  }
  bankrupt(seat, to) {
    const p = this.players[seat];
    p.out = true; p.cash = 0; p.jailed = 0;
    BOARD.forEach((s, i) => { if (this.owner[i] === seat) { this.owner[i] = to >= 0 ? to : -1; if (to < 0) this.level[i] = 0; } });
    this.say(`💀 ${this.nm(seat)} أفلس وطلع من اللعبة`);
  }
  afterLand(seat) {
    this.phase = 'wait'; this.turn = -1; this.cur = seat;
    this.pending = { delay: 700, fn: 'endTurn' };
  }
  endTurn() {
    const seat = this.cur;
    const alive = this.alive();
    if (alive.length <= 1) return this.finish();
    if (this.again && !this.players[seat].out && !this.players[seat].jailed) { this.again = false; this.phase = 'roll'; this.turn = seat; this.msg = 'دبل! ارمي كمان 🎲'; return; }
    this.again = false; this.dbl = 0;
    let n = seat;
    do { n = (n + 1) % 4; if (n === this.first) this.round++; } while (this.players[n].out);
    if (this.round > MAX_ROUNDS) return this.finish();
    this.turn = n; this.phase = 'roll'; this.msg = 'ارمي الزهر 🎲';
  }
  finish() {
    this.over = true; this.phase = 'gameOver'; this.turn = -1;
    const w = [0, 1, 2, 3].map((i) => this.worth(i));
    const max = Math.max(...w);
    this.winners = [0, 1, 2, 3].filter((i) => w[i] === max);
    this.msg = 'انتهت اللعبة';
  }
  view(seat) {
    let actions = null;
    if (seat === this.turn && !this.pending && !this.over) {
      const p = this.players[seat];
      if (this.phase === 'roll') actions = { roll: true, bail: p.jailed ? BAIL : 0, build: this.buildable(seat) };
      if (this.phase === 'buy') actions = { buy: BOARD[p.pos].price, idx: p.pos, can: p.cash >= BOARD[p.pos].price };
    }
    return {
      type: 'mono', phase: this.phase, turn: this.turn, over: this.over, winners: this.winners, msg: this.msg,
      players: this.players, owner: this.owner, level: this.level, dice: this.dice, rollId: this.rollId, round: this.round, maxRounds: MAX_ROUNDS,
      log: this.log.slice(-12), card: this.card, moveFx: this.moveFx, worth: [0, 1, 2, 3].map((i) => this.worth(i)), cur: this.cur,
      rents: BOARD.map((s, i) => (this.owner[i] >= 0 && s.k === 'prop' ? this.rent(i, 7) : 0)), houseCost: HOUSE_COST,
      actions, history: { length: this.nlog || 0 }, hand: [], handCounts: [0, 0, 0, 0], trick: [], legal: [], scores: [0, 1, 2, 3].map((i) => this.players[i].cash),
    };
  }
  botAction(seat) {
    const p = this.players[seat];
    if (this.phase === 'buy') {
      const s = BOARD[p.pos];
      const reserve = this.round < 4 ? 100 : 200;
      return p.cash - s.price >= reserve || (s.g !== undefined && GROUPS[s.g].some((i) => this.owner[i] === seat) && p.cash >= s.price) ? { type: 'buy' } : { type: 'skip' };
    }
    if (this.phase === 'roll') {
      const b = this.buildable(seat).filter((i) => p.cash - HOUSE_COST[BOARD[i].g] >= 250);
      if (b.length && !this.isHuman?.(seat)) return { type: 'build', idx: b[0] };
      if (p.jailed && p.cash > 400 && this.round > 2) return { type: 'bail' };
      return { type: 'roll' };
    }
    return { type: 'roll' };
  }
}
