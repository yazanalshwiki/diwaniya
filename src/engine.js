import { Mono } from './mono.js';
// ================== Card helpers ==================
export const SUITS = ['S', 'H', 'D', 'C'];
export const suit = (c) => c[0];
export const rank = (c) => +c.slice(1);
const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function sortHand(h) {
  return h.sort((a, b) => SUIT_ORDER[suit(a)] - SUIT_ORDER[suit(b)] || rank(b) - rank(a));
}
export function dealHands() {
  const d = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push(s + r);
  shuffle(d);
  return [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 13, i * 13 + 13)));
}
export function trickWinner(trick, trump) {
  let best = trick[0];
  for (const t of trick.slice(1)) {
    const s = suit(t.card), bs = suit(best.card);
    if (s === bs) { if (rank(t.card) > rank(best.card)) best = t; }
    else if (trump && s === trump) best = t;
  }
  return best.seat;
}
const next = (s) => (s + 1) % 4;
const bySuit = (hand, s) => hand.filter((c) => suit(c) === s);
const lowest = (cards) => cards.reduce((a, b) => (rank(b) < rank(a) ? b : a));
const highest = (cards) => cards.reduce((a, b) => (rank(b) > rank(a) ? b : a));

export const SUIT_NAMES = { S: 'البستوني ♠', H: 'الكبة ♥', D: 'الديناري ♦', C: 'السباتي ♣' };

// ================== Base trick-taking game ==================
class TrickGame {
  constructor() {
    this.pending = null; // {delay, fn}
    this.over = false;
    this.winners = [];
    this.history = [];
    this.msg = '';
    this.dealer = Math.floor(Math.random() * 4);
    this.trump = null;
  }
  resetHand() {
    this.hands = dealHands();
    this.trick = [];
    this.lastTrick = null;
    this.tricksWon = [0, 0, 0, 0];
    this.trickCount = 0;
  }
  tick() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this[p.fn]();
  }
  followLegal(hand) {
    if (!this.trick.length) return hand.slice();
    const led = suit(this.trick[0].card);
    const f = bySuit(hand, led);
    return f.length ? f : hand.slice();
  }
  playCard(seat, card) {
    const legal = this.legalCards(seat);
    if (!legal.includes(card)) throw new Error('هذي الورقة ما ينفع تنلعب الحين');
    const h = this.hands[seat];
    h.splice(h.indexOf(card), 1);
    this.trick.push({ seat, card });
    if (this.trick.length === 4) {
      this.turn = -1;
      this.pending = { delay: 1300, fn: 'endTrick' };
    } else this.turn = next(seat);
  }
  endTrick() {
    const w = trickWinner(this.trick, this.trump);
    this.lastTrick = { cards: this.trick, winner: w };
    this.tricksWon[w]++;
    this.trickCount++;
    const t = this.trick;
    this.trick = [];
    this.turn = w;
    this.onTrickEnd(w, t);
  }
  check(seat) {
    if (this.over) throw new Error('اللعبة انتهت');
    if (this.pending) throw new Error('انتظر لحظة');
    if (seat !== this.turn) throw new Error('مو دورك');
  }
  baseView(seat) {
    return {
      type: this.type,
      phase: this.phase,
      turn: this.turn,
      dealer: this.dealer,
      hand: seat >= 0 && this.hands ? this.hands[seat] : [],
      handCounts: this.hands ? this.hands.map((h) => h.length) : [0, 0, 0, 0],
      trick: this.trick || [],
      lastTrick: this.lastTrick,
      tricksWon: this.tricksWon,
      trump: this.trump,
      msg: this.msg,
      history: this.history.slice(-30),
      over: this.over,
      winners: this.winners,
      legal: seat >= 0 && seat === this.turn && !this.pending && !this.over ? this.legalCards(seat) : [],
    };
  }
  // ---- generic bot for "win tricks" games ----
  botPlayToWin(seat) {
    const legal = this.legalCards(seat);
    const trump = this.trump;
    if (!this.trick.length) {
      const nonTrump = legal.filter((c) => suit(c) !== trump);
      const aces = nonTrump.filter((c) => rank(c) === 14);
      if (aces.length) return aces[0];
      if (nonTrump.length) {
        // lead low from longest side suit
        const groups = {};
        for (const c of nonTrump) (groups[suit(c)] ||= []).push(c);
        const longest = Object.values(groups).sort((a, b) => b.length - a.length)[0];
        return lowest(longest);
      }
      return highest(legal);
    }
    const curW = trickWinner(this.trick, trump);
    const partnerWinning = curW === (seat + 2) % 4;
    const winCard = this.trick.find((t) => t.seat === curW).card;
    const beats = (c) => {
      const test = [...this.trick, { seat: -9, card: c }];
      return trickWinner(test, trump) === -9;
    };
    const last = this.trick.length === 3;
    if (partnerWinning && (last || rank(winCard) >= 13 || suit(winCard) === trump)) {
      const nt = legal.filter((c) => suit(c) !== trump);
      return lowest(nt.length ? nt : legal);
    }
    const winners = legal.filter(beats);
    if (winners.length) {
      // cheapest winner; prefer non-trump
      const nt = winners.filter((c) => suit(c) !== trump);
      if (last || nt.length) return lowest(nt.length ? nt : winners);
      return lowest(winners);
    }
    const nt = legal.filter((c) => suit(c) !== trump);
    return lowest(nt.length ? nt : legal);
  }
}

// estimate tricks in a hand with a given trump
function estimateTricks(hand, trump) {
  let e = 0;
  for (const s of SUITS) {
    const cs = bySuit(hand, s);
    const rs = cs.map(rank);
    if (s === trump) {
      e += rs.filter((r) => r >= 12).length * 0.9;
      e += Math.max(0, cs.length - 3) * 0.9;
      if (cs.length <= 3) e += rs.filter((r) => r === 11).length * 0.3;
    } else {
      if (rs.includes(14)) e += 0.95;
      if (rs.includes(13) && cs.length >= 2) e += 0.6;
      if (rs.includes(12) && cs.length >= 3 && rs.includes(13)) e += 0.3;
      if (trump && cs.length <= 1) e += (bySuit(hand, trump).length >= 3 ? 0.6 : 0);
    }
  }
  return e;
}

// ================== Tarneeb 41 ==================
const T41_PTS = { 2: 2, 3: 3, 4: 4, 5: 10, 6: 12, 7: 14, 8: 16, 9: 18, 10: 20, 11: 22, 12: 24, 13: 26 };
export class Tarneeb41 extends TrickGame {
  constructor() {
    super();
    this.type = 't41';
    this.trump = null;
    this.scores = [0, 0, 0, 0];
    this.handNo = 0;
    this.startHand();
  }
  minTotal() { return 11; }
  startHand() {
    this.resetHand();
    this.handNo++;
    this.bids = [null, null, null, null];
    // Syrian 41: the dealer's last card is turned face up; trump is the other suit of the same colour
    const dh = this.hands[this.dealer];
    this.flipCard = dh[Math.floor(Math.random() * dh.length)];
    this.trump = { H: 'D', D: 'H', S: 'C', C: 'S' }[suit(this.flipCard)];
    this.phase = 'bidding';
    this.turn = next(this.dealer);
    this.msg = `الورقة المكشوفة ${SUIT_NAMES[suit(this.flipCard)]} — الطرنيب ${SUIT_NAMES[this.trump]}`;
  }
  legalCards(seat) { return this.phase === 'playing' ? this.followLegal(this.hands[seat]) : []; }
  act(seat, a) {
    this.check(seat);
    if (this.phase === 'bidding') {
      if (a.type !== 'bid') throw new Error('لازم تطلب');
      const v = +a.value;
      if (!(v >= 2 && v <= 13)) throw new Error('الطلب من 2 إلى 13');
      this.bids[seat] = v;
      if (this.bids.every((b) => b !== null)) {
        const sum = this.bids.reduce((x, y) => x + y, 0);
        if (sum < this.minTotal()) {
          this.msg = `مجموع الطلبات ${sum} أقل من ${this.minTotal()} — إعادة توزيع`;
          this.turn = -1;
          this.pending = { delay: 2500, fn: 'redeal' };
        } else {
          this.phase = 'playing';
          this.turn = next(this.dealer);
          this.msg = `مجموع الطلبات ${sum}`;
        }
      } else this.turn = next(seat);
      return;
    }
    if (this.phase === 'playing') {
      if (a.type !== 'play') throw new Error('العب ورقة');
      this.playCard(seat, a.card);
      return;
    }
    throw new Error('ما فيه حركة الحين');
  }
  redeal() { this.dealer = next(this.dealer); this.startHand(); }
  onTrickEnd() { if (this.trickCount === 13) this.scoreHand(); }
  scoreHand() {
    const deltas = [0, 1, 2, 3].map((i) => {
      const p = T41_PTS[this.bids[i]];
      return this.tricksWon[i] >= this.bids[i] ? p : -p;
    });
    deltas.forEach((d, i) => (this.scores[i] += d));
    this.history.push({ n: this.handNo, bids: this.bids.slice(), tricks: this.tricksWon.slice(), deltas, scores: this.scores.slice() });
    const teamOk = (a, b) => (this.scores[a] >= 41 && this.scores[b] > 0) || (this.scores[b] >= 41 && this.scores[a] > 0);
    const t0 = teamOk(0, 2), t1 = teamOk(1, 3);
    let win = null;
    if (t0 && t1) win = this.scores[0] + this.scores[2] >= this.scores[1] + this.scores[3] ? 0 : 1;
    else if (t0) win = 0; else if (t1) win = 1;
    if (win === null && this.handNo >= 40) win = this.scores[0] + this.scores[2] >= this.scores[1] + this.scores[3] ? 0 : 1;
    this.turn = -1;
    if (win !== null) {
      this.over = true; this.phase = 'gameOver';
      this.winners = win === 0 ? [0, 2] : [1, 3];
      this.msg = 'انتهت اللعبة';
    } else {
      this.phase = 'handEnd';
      this.msg = 'نهاية الجولة';
      this.pending = { delay: 5000, fn: 'redeal' };
    }
  }
  view(seat) {
    return { ...this.baseView(seat), bids: this.bids, scores: this.scores, minTotal: this.minTotal(), flipCard: this.flipCard,
      actions: seat === this.turn && this.phase === 'bidding' && !this.pending ? { bid: { min: 2, max: 13 } } : null };
  }
  botAction(seat) {
    if (this.phase === 'bidding') {
      const est = Math.round(estimateTricks(this.hands[seat], this.trump));
      let v = Math.max(2, Math.min(13, est));
      const others = this.bids.filter((b, i) => i !== seat && b !== null);
      if (others.length === 3) {
        const sum = others.reduce((x, y) => x + y, 0);
        const need = this.minTotal() - sum;
        if (v < need && need - v <= 2) v = Math.min(13, need);
      }
      return { type: 'bid', value: v };
    }
    // simple: try to win until bid reached, then dump low
    if (this.tricksWon[seat] >= this.bids[seat]) {
      const legal = this.legalCards(seat);
      const partner = (seat + 2) % 4;
      if (this.tricksWon[partner] < this.bids[partner]) return { type: 'play', card: this.botPlayToWin(seat) };
      const nt = legal.filter((c) => suit(c) !== this.trump);
      return { type: 'play', card: lowest(nt.length ? nt : legal) };
    }
    return { type: 'play', card: this.botPlayToWin(seat) };
  }
}

// ================== Tarneeb 61 (classic) ==================
export class Tarneeb61 extends TrickGame {
  constructor() {
    super();
    this.type = 't61';
    this.teamScores = [0, 0];
    this.handNo = 0;
    this.startHand();
  }
  startHand() {
    this.resetHand();
    this.handNo++;
    this.bids = [null, null, null, null];
    this.passed = [false, false, false, false];
    this.high = 0;
    this.bidder = -1;
    this.trump = null;
    this.phase = 'bidding';
    this.turn = next(this.dealer);
    this.msg = 'المزايدة من 7 إلى 13';
  }
  legalCards(seat) { return this.phase === 'playing' ? this.followLegal(this.hands[seat]) : []; }
  act(seat, a) {
    this.check(seat);
    if (this.phase === 'bidding') {
      if (a.type === 'pass') { this.passed[seat] = true; this.bids[seat] = 'pass'; }
      else if (a.type === 'bid') {
        const v = +a.value;
        if (!(v >= 7 && v <= 13 && v > this.high)) throw new Error('لازم تطلب أعلى من الطلب الحالي (7-13)');
        this.high = v; this.bidder = seat; this.bids[seat] = v;
      } else throw new Error('اطلب أو باص');
      const passCount = this.passed.filter(Boolean).length;
      if (passCount === 4) {
        this.msg = 'الكل باص — إعادة توزيع';
        this.turn = -1;
        this.pending = { delay: 2000, fn: 'redeal' };
        return;
      }
      if (this.high === 13 || (this.bidder >= 0 && passCount === 3)) {
        this.phase = 'trump';
        this.turn = this.bidder;
        this.msg = `الطلب ${this.high} — بانتظار اختيار الطرنيب`;
        return;
      }
      let n = next(seat);
      while (this.passed[n]) n = next(n);
      this.turn = n;
      return;
    }
    if (this.phase === 'trump') {
      if (a.type !== 'trump' || !SUITS.includes(a.suit)) throw new Error('اختر الطرنيب');
      this.trump = a.suit;
      this.phase = 'playing';
      this.turn = this.bidder;
      this.msg = `الطرنيب ${SUIT_NAMES[a.suit]} — الطلب ${this.high}`;
      return;
    }
    if (this.phase === 'playing') {
      if (a.type !== 'play') throw new Error('العب ورقة');
      this.playCard(seat, a.card);
      return;
    }
    throw new Error('ما فيه حركة الحين');
  }
  redeal() { this.dealer = next(this.dealer); this.startHand(); }
  onTrickEnd() {
    if (this.trickCount === 13) this.scoreHand();
  }
  scoreHand() {
    const bt = this.bidder % 2, ot = 1 - bt;
    const bTricks = this.tricksWon[bt] + this.tricksWon[bt + 2];
    const oTricks = 13 - bTricks;
    const deltas = [0, 0];
    const made = bTricks >= this.high;
    if (made) deltas[bt] = this.high === 13 ? 26 : bTricks === 13 ? 16 : bTricks;
    else { deltas[bt] = this.high === 13 ? -16 : -this.high; deltas[ot] = oTricks === 13 ? 16 : oTricks; }
    this.teamScores[0] += deltas[0]; this.teamScores[1] += deltas[1];
    this.history.push({ n: this.handNo, bidder: this.bidder, bid: this.high, trump: this.trump, made, tricks: [this.tricksWon[0] + this.tricksWon[2], this.tricksWon[1] + this.tricksWon[3]], deltas, scores: this.teamScores.slice() });
    this.turn = -1;
    const [a, b] = this.teamScores;
    let win = null;
    if (a >= 61 && b >= 61) win = bt; else if (a >= 61) win = 0; else if (b >= 61) win = 1;
    if (win === null && this.handNo >= 60) win = a >= b ? 0 : 1;
    if (win !== null) {
      this.over = true; this.phase = 'gameOver';
      this.winners = win === 0 ? [0, 2] : [1, 3];
      this.msg = 'انتهت اللعبة';
    } else {
      this.phase = 'handEnd';
      this.msg = made ? 'جاب الطلب ✅' : 'انكسر الطلب ❌';
      this.pending = { delay: 5000, fn: 'redeal' };
    }
  }
  view(seat) {
    let actions = null;
    if (seat === this.turn && !this.pending && !this.over) {
      if (this.phase === 'bidding') actions = { bid: { min: Math.max(7, this.high + 1), max: 13 }, canPass: true };
      if (this.phase === 'trump') actions = { trump: true };
    }
    return { ...this.baseView(seat), bids: this.bids, high: this.high, bidder: this.bidder, teamScores: this.teamScores, actions };
  }
  botAction(seat) {
    const hand = this.hands[seat];
    if (this.phase === 'bidding' || this.phase === 'trump') {
      let bestS = 'S', bestE = -1;
      for (const s of SUITS) { const e = estimateTricks(hand, s); if (e > bestE) { bestE = e; bestS = s; } }
      if (this.phase === 'trump') return { type: 'trump', suit: bestS };
      const partner = (seat + 2) % 4;
      let partnerBonus = 2.5;
      if (typeof this.bids[partner] === 'number') partnerBonus = 3.2;
      if (this.bidder >= 0 && this.bidder % 2 !== seat % 2) partnerBonus = 2.2;
      const team = Math.floor(bestE + partnerBonus);
      const want = Math.max(7, this.high + 1);
      if (team >= want && want <= 13 && this.bidder !== partner) return { type: 'bid', value: want };
      return { type: 'pass' };
    }
    return { type: 'play', card: this.botPlayToWin(seat) };
  }
}

// ================== Trix ==================
export const TRIX_CONTRACTS = ['king', 'queens', 'diamonds', 'ltoosh', 'trix'];
export const TRIX_NAMES = { king: 'شيخ الكبة', queens: 'البنات', diamonds: 'الديناري', ltoosh: 'اللطوش', trix: 'التركس', complex: 'الكمبلكس' };
const TRIX_PLACES = [200, 150, 100, 50];

export class Trix extends TrickGame {
  constructor(mode, partner = false) {
    super();
    this.type = 'trix';
    this.partner = !!partner;
    this.mode = mode === 'complex' ? 'complex' : 'classic';
    this.contracts = this.mode === 'complex' ? ['complex', 'trix'] : TRIX_CONTRACTS;
    this.scores = [0, 0, 0, 0];
    this.firstOwner = Math.floor(Math.random() * 4);
    this.kingdom = 0;
    this.used = [[], [], [], []];
    this.dealNo = 0;
    this.startDeal();
  }
  get owner() { return (this.firstOwner + this.kingdom) % 4; }
  startDeal() {
    this.resetHand();
    this.dealNo++;
    this.dealer = this.owner;
    this.taken = [[], [], [], []];
    this.contract = null;
    this.board = null;
    this.finished = [];
    this.lastTrixCard = null;
    this.doubled = {};
    this.phase = 'choose';
    this.turn = this.owner;
    this.msg = 'صاحب المملكة يختار اللعبة';
  }
  teamScores() { return [this.scores[0] + this.scores[2], this.scores[1] + this.scores[3]]; }
  remaining() { return this.contracts.filter((c) => !this.used[this.owner].includes(c)); }
  trixLegal(seat) {
    const out = [];
    for (const c of this.hands[seat]) {
      const b = this.board[suit(c)], r = rank(c);
      if (!b) { if (r === 11) out.push(c); }
      else if (r === b.lo - 1 || r === b.hi + 1) out.push(c);
    }
    return out;
  }
  legalCards(seat) {
    if (this.phase === 'trix') return this.trixLegal(seat);
    if (this.phase !== 'playing') return [];
    const hand = this.hands[seat];
    if (!this.trick.length) {
      if (this.contract === 'king') {
        const nh = hand.filter((c) => suit(c) !== 'H');
        return nh.length ? nh : hand.slice();
      }
      if (this.contract === 'diamonds') {
        const nd = hand.filter((c) => suit(c) !== 'D');
        return nd.length ? nd : hand.slice();
      }
      return hand.slice();
    }
    const led = suit(this.trick[0].card);
    const f = bySuit(hand, led);
    if (f.length) {
      // King of hearts: if hearts led and a higher heart is already down, you must give the king
      if (this.contract === 'king' && led === 'H' && f.includes('H13') && this.trick.some((t) => t.card === 'H14')) return ['H13'];
      return f;
    }
    if (this.contract === 'king' && hand.includes('H13')) return ['H13'];
    return hand.slice();
  }
  act(seat, a) {
    this.check(seat);
    if (this.phase === 'choose') {
      if (a.type !== 'contract' || !this.remaining().includes(a.name)) throw new Error('اختر لعبة متاحة');
      this.contract = a.name;
      this.msg = `اللعبة: ${TRIX_NAMES[a.name]}`;
      if (a.name === 'trix') {
        this.board = { S: null, H: null, D: null, C: null };
        this.phase = 'trix';
        this.turn = this.owner;
        this.maybeAutoPass();
      } else if (a.name === 'king' || a.name === 'queens' || a.name === 'complex') {
        // doubling round: every holder of the King of hearts / a queen may double it
        this.phase = 'double';
        this.dblStep = 0;
        this.advanceDouble();
      } else {
        this.phase = 'playing';
        this.turn = this.owner;
      }
      return;
    }
    if (this.phase === 'double') {
      if (a.type === 'double') {
        if (!this.dblCandidates(seat).includes(a.card)) throw new Error('ما تقدر تدبّل هالورقة');
        this.doubled[a.card] = seat;
        if (this.dblCandidates(seat).length) return;
      } else if (a.type !== 'nodouble') throw new Error('دبّل أو كمّل');
      this.dblStep++;
      this.advanceDouble();
      return;
    }
    if (this.phase === 'playing') {
      if (a.type !== 'play') throw new Error('العب ورقة');
      this.playCard(seat, a.card);
      return;
    }
    if (this.phase === 'trix') {
      if (a.type === 'pass') {
        if (this.trixLegal(seat).length) throw new Error('عندك ورقة تنلعب');
        this.advanceTrix(seat);
        return;
      }
      if (a.type !== 'play') throw new Error('العب ورقة');
      if (!this.trixLegal(seat).includes(a.card)) throw new Error('هذي الورقة ما تنزل الحين');
      const h = this.hands[seat];
      h.splice(h.indexOf(a.card), 1);
      const s = suit(a.card), r = rank(a.card);
      const b = this.board[s];
      if (!b) this.board[s] = { lo: 11, hi: 11 };
      else if (r === b.lo - 1) b.lo = r; else b.hi = r;
      this.lastTrixCard = { seat, card: a.card };
      if (!h.length) this.finished.push(seat);
      if (this.finished.length >= 3) {
        for (let i = 0; i < 4; i++) if (!this.finished.includes(i)) this.finished.push(i);
        this.scoreDeal();
        return;
      }
      this.advanceTrix(seat);
      return;
    }
    throw new Error('ما فيه حركة الحين');
  }
  dblCandidates(seat) {
    const want = this.contract === 'king' ? ['H13'] : this.contract === 'queens' ? ['S12', 'H12', 'D12', 'C12'] : ['H13', 'S12', 'H12', 'D12', 'C12'];
    return this.hands[seat].filter((c) => want.includes(c) && this.doubled[c] === undefined);
  }
  advanceDouble() {
    while (this.dblStep < 4) {
      const s = (this.owner + this.dblStep) % 4;
      if (this.dblCandidates(s).length) { this.turn = s; return; }
      this.dblStep++;
    }
    const n = Object.keys(this.doubled).length;
    this.msg = n ? `اللعبة: ${TRIX_NAMES[this.contract]} — فيه ${n} مدبّل` : `اللعبة: ${TRIX_NAMES[this.contract]}`;
    this.phase = 'playing';
    this.turn = this.owner;
  }
  advanceTrix(seat) {
    let n = next(seat);
    while (this.finished.includes(n)) n = next(n);
    this.turn = n;
    this.maybeAutoPass();
  }
  maybeAutoPass() {
    if (this.phase === 'trix' && this.turn >= 0 && !this.trixLegal(this.turn).length) {
      this.pending = { delay: 700, fn: 'autoPass' };
    }
  }
  autoPass() { this.advanceTrix(this.turn); }
  onTrickEnd(w, t) {
    this.taken[w].push(...t.map((x) => x.card));
    const all = this.taken.flat();
    let done = this.trickCount === 13;
    if (this.contract === 'king' && all.includes('H13')) done = true;
    if (this.contract === 'queens' && all.filter((c) => rank(c) === 12).length === 4) done = true;
    if (this.contract === 'diamonds' && all.filter((c) => suit(c) === 'D').length === 13) done = true;
    if (done) this.scoreDeal();
  }
  dealDeltas() {
    const d = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const tk = this.taken[i];
      for (const c of tk) {
        const cx = this.contract === 'complex';
        if (!(((this.contract === 'king' || cx) && c === 'H13') || ((this.contract === 'queens' || cx) && rank(c) === 12))) continue;
        const base = c === 'H13' ? 75 : 25;
        const by = this.doubled[c];
        if (by === undefined) d[i] -= base;
        else if (this.partner && by % 2 === i % 2) d[i] -= base; // partner/own doubled card eaten by own team: no double, no bonus
        else { d[i] -= base * 2; if (by !== i) d[by] += base; }
      }
      if (this.contract === 'diamonds') d[i] = -10 * tk.filter((c) => suit(c) === 'D').length;
      if (this.contract === 'ltoosh') d[i] = -15 * this.tricksWon[i];
      if (this.contract === 'complex') d[i] += -10 * tk.filter((c) => suit(c) === 'D').length - 15 * this.tricksWon[i];
    }
    return d;
  }
  scoreDeal() {
    const d = this.contract === 'trix' ? [0, 0, 0, 0] : this.dealDeltas();
    if (this.contract === 'trix') this.finished.forEach((s, idx) => (d[s] = TRIX_PLACES[idx]));
    d.forEach((x, i) => (this.scores[i] += x));
    this.history.push({ n: this.dealNo, owner: this.owner, contract: this.contract, deltas: d, scores: this.scores.slice() });
    this.used[this.owner].push(this.contract);
    this.turn = -1;
    this.trick = [];
    if (this.used[this.owner].length === this.contracts.length) this.kingdom++;
    if (this.kingdom === 4) {
      this.over = true; this.phase = 'gameOver';
      if (this.partner) {
        const t = this.teamScores();
        this.winners = t[0] === t[1] ? [0, 1, 2, 3] : t[0] > t[1] ? [0, 2] : [1, 3];
      } else {
        const max = Math.max(...this.scores);
        this.winners = [0, 1, 2, 3].filter((i) => this.scores[i] === max);
      }
      this.msg = 'انتهت اللعبة';
    } else {
      this.phase = 'handEnd';
      this.msg = `انتهت ${TRIX_NAMES[this.contract]}`;
      this.pending = { delay: 5000, fn: 'startDeal' };
    }
  }
  view(seat) {
    let actions = null;
    if (seat === this.turn && !this.pending && !this.over) {
      if (this.phase === 'choose') actions = { contracts: this.remaining() };
      if (this.phase === 'double') actions = { doubles: this.dblCandidates(seat) };
      if (this.phase === 'trix' && !this.trixLegal(seat).length) actions = { pass: true };
    }
    return { ...this.baseView(seat), scores: this.scores, kingdom: this.kingdom, owner: this.owner, contract: this.contract,
      used: this.used, board: this.board, doubled: this.doubled, finished: this.finished, dealNo: this.dealNo, actions,
      takenCounts: this.taken ? this.taken.map((t) => t.length) : [0, 0, 0, 0],
      partner: this.partner, teamScores: this.partner ? this.teamScores() : null,
      partner2s: this.partner && this.contract === 'trix' && seat >= 0 && this.hands ? this.hands[(seat + 2) % 4].filter((c) => rank(c) === 2).length : null,
      live: this.taken && this.contract && this.contract !== 'trix' ? this.dealDeltas() : null,
      pen: this.taken ? this.taken.map((t) => t.filter((c) => c === 'H13' || rank(c) === 12 || suit(c) === 'D')) : [[], [], [], []] };
  }
  botAction(seat) {
    const hand = this.hands[seat];
    if (this.phase === 'choose') {
      const rem = this.remaining();
      const hs = bySuit(hand, 'H').length;
      const cost = {
        king: hand.includes('H13') ? (hs <= 3 ? 70 : 30) : (hs <= 1 ? 35 : 15),
        queens: hand.filter((c) => rank(c) === 12).reduce((s, c) => s + (bySuit(hand, suit(c)).length <= 3 ? 25 : 10), 0) + 15,
        diamonds: bySuit(hand, 'D').filter((c) => rank(c) >= 10).length * 12 + 20,
        ltoosh: hand.filter((c) => rank(c) >= 12).length * 12 + 10,
        complex: hand.filter((c) => rank(c) >= 12).length * 10 + bySuit(hand, 'D').length * 4 + (hand.includes('H13') ? 30 : 0),
        trix: 40 - hand.filter((c) => rank(c) === 11).length * 25 - hand.filter((c) => rank(c) >= 9 && rank(c) <= 13).length * 3,
      };
      rem.sort((a, b) => cost[a] - cost[b]);
      // don't leave trix as the very last if hand is great for it
      return { type: 'contract', name: rem[0] };
    }
    if (this.phase === 'double') {
      const c = this.dblCandidates(seat).find((x) => bySuit(hand, suit(x)).length >= 4 && Math.random() < 0.8);
      return c ? { type: 'double', card: c } : { type: 'nodouble' };
    }
    if (this.phase === 'trix') {
      const legal = this.trixLegal(seat);
      if (!legal.length) return { type: 'pass' };
      // prefer non-jacks that extend runs; open jacks when we hold cards of that suit
      const nonJ = legal.filter((c) => rank(c) !== 11);
      if (nonJ.length) return { type: 'play', card: nonJ[Math.floor(Math.random() * nonJ.length)] };
      const js = legal.slice().sort((a, b) => bySuit(hand, suit(b)).length - bySuit(hand, suit(a)).length);
      return { type: 'play', card: js[0] };
    }
    // avoid-taking play
    const legal = this.legalCards(seat);
    if (legal.length === 1) return { type: 'play', card: legal[0] };
    const danger = (c) => {
      if (this.contract === 'king') return c === 'H13' ? 100 : suit(c) === 'H' ? rank(c) : rank(c) / 2;
      if (this.contract === 'queens') return rank(c) === 12 ? 50 : rank(c) > 12 ? 30 + rank(c) : rank(c);
      if (this.contract === 'diamonds') return suit(c) === 'D' ? 20 + rank(c) : rank(c);
      if (this.contract === 'complex') return c === 'H13' ? 100 : rank(c) === 12 ? 60 : suit(c) === 'D' ? 20 + rank(c) : rank(c);
      return rank(c);
    };
    if (!this.trick.length) {
      return { type: 'play', card: legal.slice().sort((a, b) => rank(a) - rank(b))[0] };
    }
    const led = suit(this.trick[0].card);
    const following = legal.every((c) => suit(c) === led);
    if (following) {
      const curHigh = Math.max(...this.trick.filter((t) => suit(t.card) === led).map((t) => rank(t.card)));
      const under = legal.filter((c) => rank(c) < curHigh);
      if (under.length) return { type: 'play', card: highest(under) };
      // will win: if last to play, dump highest; otherwise play lowest
      if (this.trick.length === 3) return { type: 'play', card: highest(legal) };
      return { type: 'play', card: lowest(legal) };
    }
    // void: discard most dangerous (but never onto a partner who is winning the trick)
    if (this.partner) {
      const lw = this.trick.filter((t) => suit(t.card) === led).sort((a, b) => rank(b.card) - rank(a.card))[0];
      if (lw && lw.seat % 2 === seat % 2) return { type: 'play', card: legal.slice().sort((a, b) => danger(a) - danger(b))[0] };
    }
    return { type: 'play', card: legal.slice().sort((a, b) => danger(b) - danger(a))[0] };
  }
}

export function createGame(type) {
  if (type === 't41') return new Tarneeb41();
  if (type === 't61') return new Tarneeb61();
  if (type === 'trix') return new Trix();
  if (type === 'trixc') return new Trix('complex');
  if (type === 'mono') return new Mono();
  if (type === 'trixp') return new Trix('classic', true);
  if (type === 'trixcp') return new Trix('complex', true);
  throw new Error('لعبة غير معروفة');
}
export const GAME_NAMES = { t41: 'طرنيب ٤١', t61: 'طرنيب ٦١', trix: 'تركس', trixc: 'تركس كمبلكس', trixp: 'تركس شراكة', trixcp: 'كمبلكس شراكة', mono: 'عقارات الديوانية' };
