import { UIGame, rnd, shuffle } from './base.js';

// ---------------- مين الجاسوس ----------------
const PLACES = ['✈️ المطار', '🏥 المستشفى', '🏫 المدرسة', '🍽️ المطعم', '🏦 البنك', '🏟️ الملعب', '🏖️ الشاطئ', '🎬 السينما', '🛒 السوبرماركت', '🎓 الجامعة',
  '🏨 الفندق', '🥖 المخبز', '🚉 محطة القطار', '🌳 الحديقة', '💍 حفلة عرس', '🛍️ المول', '💊 الصيدلية', '🔧 ورشة السيارات', '🚢 السفينة', '🐄 المزرعة',
  '💈 صالون الحلاقة', '🏋️ النادي الرياضي', '📚 المكتبة', '⛺ رحلة بر'];
export class Spy extends UIGame {
  constructor() { super('spy', 4); this.turn = -1; this.rounds = 3; this.round = 0; this.phase = 'roles'; this.endsAt = Date.now() + 99999; }
  init() { this.newRound(); }
  get pending() { if (this.over) return null; let t = this.endsAt; for (const p of this.plan || []) if (p && !this.done(p.s)) t = Math.min(t, p.at); return { delay: Math.max(30, t - Date.now()) }; }
  set pending(v) {}
  newRound() {
    this.round++; this.spy = rnd(4); this.place = PLACES[rnd(PLACES.length)]; this.votes = [null, null, null, null]; this.guess = null; this.res = null;
    this.phase = 'roles'; this.endsAt = Date.now() + 7000; this.plan = []; this.bump();
  }
  done(s) { return this.votes[s] !== null || (s === this.spy && this.guess !== null); }
  act(seat, a) {
    if (this.over || seat < 0) throw new Error('استنى');
    if (a.type === 'skip' && this.phase === 'talk') { this.ready = (this.ready || new Set()).add(seat); if ([0, 1, 2, 3].every((i) => this.ready.has(i) || this.bot(i))) this.endsAt = Date.now(); return; }
    if (this.phase !== 'vote') throw new Error('التصويت لسا ما بلّش');
    if (this.done(seat)) throw new Error('صوّتت');
    if (a.type === 'vote') { const t = +a.t; if (!(t >= 0 && t < 4) || t === seat) throw new Error('اختار حدا غيرك'); this.votes[seat] = t; }
    else if (a.type === 'guess') { if (seat !== this.spy) throw new Error('بس الجاسوس'); const g = +a.g; if (!PLACES[g]) throw new Error('مكان غلط'); this.guess = g; }
    else throw new Error('حركة غلط');
    if ([0, 1, 2, 3].every((s) => this.done(s))) this.endsAt = Date.now();
  }
  tick() {
    const now = Date.now();
    if (this.phase === 'roles' && now >= this.endsAt) { this.phase = 'talk'; this.ready = new Set(); this.endsAt = now + 90000; this.bump(); return; }
    if (this.phase === 'talk' && now >= this.endsAt) {
      this.phase = 'vote'; this.endsAt = now + 25000; this.bump();
      this.plan = [0, 1, 2, 3].map((s) => (this.bot(s) ? { s, at: now + 2000 + rnd(12000) } : null)); return;
    }
    if (this.phase === 'vote') {
      for (const p of this.plan) if (p && !this.done(p.s) && now >= p.at) {
        if (p.s === this.spy) { if (Math.random() < 0.3) this.guess = Math.random() < 0.35 ? PLACES.indexOf(this.place) : rnd(PLACES.length); else this.votes[p.s] = [0, 1, 2, 3].filter((x) => x !== p.s)[rnd(3)]; }
        else this.votes[p.s] = Math.random() < 0.45 && this.spy !== p.s ? this.spy : [0, 1, 2, 3].filter((x) => x !== p.s)[rnd(3)];
      }
      if (now >= this.endsAt || [0, 1, 2, 3].every((s) => this.done(s))) this.result(); return;
    }
    if (this.phase === 'result' && now >= this.endsAt) { if (this.round >= this.rounds) return this.endByScore('خلصت الجولات'); this.newRound(); }
  }
  result() {
    const cnt = [0, 0, 0, 0]; this.votes.forEach((v) => v !== null && cnt[v]++);
    const top = Math.max(...cnt); const accused = cnt.filter((x) => x === top).length === 1 ? cnt.indexOf(top) : -1;
    let txt;
    if (this.guess !== null && PLACES[this.guess] === this.place) { this.scores[this.spy] += 40; txt = `🕵️ الجاسوس ${this.nm(this.spy)} عرف المكان! +40`; }
    else if (accused === this.spy) { [0, 1, 2, 3].forEach((i) => i !== this.spy && (this.scores[i] += 20)); txt = `🎯 مسكتوا الجاسوس ${this.nm(this.spy)}! كل الباقيين +20`; }
    else { this.scores[this.spy] += 40; txt = `😎 الجاسوس ${this.nm(this.spy)} فلت${accused >= 0 ? ` واتهمتوا ${this.nm(accused)}` : ''} +40`; }
    this.res = { txt, cnt }; this.phase = 'result'; this.endsAt = Date.now() + 7000; this.bump();
  }
  botAction() { return { type: 'noop' }; }
  ui(seat) {
    const isSpy = seat === this.spy, blocks = [];
    blocks.push({ k: 'text', t: `جولة ${this.round} من ${this.rounds}`, cls: 'hint' });
    if (seat >= 0 && this.phase !== 'result') blocks.push({ k: 'role', t: isSpy ? '🕵️ إنت الجاسوس!' : this.place, sub: isSpy ? 'ما بتعرف المكان — اسمع منيح وحاول تكتشفه بدون ما يكشفوك' : 'كلكن بنفس المكان إلا الجاسوس — اكشفوه بدون ما تفضحوا المكان' });
    if (this.phase === 'roles') blocks.push({ k: 'text', t: 'احفظ دورك…', cls: 'lead' });
    if (this.phase === 'talk') {
      blocks.push({ k: 'text', t: '💬 اسألوا بعض أسئلة بالشات عن المكان (مثلاً: «شو لابس هون؟» «كم بتضل هون؟»)', cls: 'lead' });
      blocks.push({ k: 'chips', items: PLACES, label: 'الأماكن الممكنة' });
      blocks.push({ k: 'btns', b: [{ t: '✅ جاهز للتصويت', a: { type: 'skip' }, cls: 'ghost', dis: this.ready && this.ready.has(seat) }] });
    }
    if (this.phase === 'vote') {
      if (seat >= 0 && !this.done(seat)) {
        blocks.push({ k: 'text', t: 'مين الجاسوس برأيك؟', cls: 'lead' });
        blocks.push({ k: 'btns', b: [0, 1, 2, 3].filter((i) => i !== seat).map((i) => ({ t: `🫵 ${this.nm(i)}`, a: { type: 'vote', t: i }, cls: 'ghost big' })) });
        if (isSpy) { blocks.push({ k: 'text', t: '…أو خمّن المكان وإذا صح بتربح +40', cls: 'hint' }); blocks.push({ k: 'btns', cls: 'bids', b: PLACES.map((p, g) => ({ t: p, a: { type: 'guess', g }, cls: 'ghost' })) }); }
      } else blocks.push({ k: 'text', t: 'استنى الباقيين يصوّتوا…', cls: 'lead' });
    }
    if (this.phase === 'result') { blocks.push({ k: 'role', t: this.place, sub: `الجاسوس كان: ${this.nm(this.spy)}` }); blocks.push({ k: 'text', t: this.res.txt, cls: 'lead' }); }
    if (this.phase !== 'result') blocks.push({ k: 'timer', ms: this.phase === 'talk' ? 90000 : this.phase === 'vote' ? 25000 : 7000 });
    return { players: [0, 1, 2, 3].map((i) => ({ badge: `⭐ ${this.scores[i]}`, sub: this.phase === 'vote' ? (this.done(i) ? '✅' : '🤔') : this.phase === 'result' ? `👎 ${this.res.cnt[i]}` : '' })), blocks };
  }
}

// ---------------- ارسم وخمّن ----------------
const WORDS = ['شمس', 'قمر', 'بيت', 'سيارة', 'شجرة', 'قطة', 'سمكة', 'طيارة', 'كرة', 'تفاحة', 'موزة', 'نخلة', 'جمل', 'وردة', 'ساعة', 'نظارة', 'مفتاح', 'كتاب',
  'قلم', 'كرسي', 'طاولة', 'باب', 'جوال', 'تلفزيون', 'فنجان', 'دلة', 'خيمة', 'قارب', 'دراجة', 'قطار', 'صاروخ', 'نجمة', 'غيمة', 'مطر', 'جبل', 'فيل', 'زرافة',
  'أسد', 'عصفور', 'مظلة', 'كيكة', 'بيتزا', 'برغر', 'آيس كريم', 'بالون', 'هدية', 'قلب', 'عين', 'تاج', 'سيف', 'حصان', 'بطة', 'فراشة', 'سلحفاة', 'ثلاجة', 'مصباح', 'شنطة', 'حذاء', 'قبعة', 'برج'];
const normW = (s) => String(s || '').trim().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
export class Draw {
  constructor() { this.type = 'draw'; this.scores = [0, 0, 0, 0]; this.turn = -1; this.over = false; this.winners = []; this.history = { length: 0 }; this.order = shuffle([0, 1, 2, 3]); this.ri = -1; this.phase = 'wait'; this.endsAt = Date.now() + 1500; this.feed = []; this.strokes = []; }
  bot(i) { return this.isBot ? this.isBot(i) : true; }
  nm(i) { return (this.names && this.names[i]) || `لاعب ${i + 1}`; }
  get pending() { if (this.over) return null; let t = this.endsAt; if (this.phase === 'draw') { for (const p of this.plan) if (p && !this.got[p.s]) t = Math.min(t, p.at); if (this.bot(this.drawer)) t = Math.min(t, this.nextHint || t); } return { delay: Math.max(30, t - Date.now()) }; }
  nextRound() {
    this.ri++; if (this.ri >= 4) return this.finish();
    this.drawer = this.order[this.ri]; this.choices = shuffle(WORDS.slice()).slice(0, 3); this.word = null; this.strokes = []; this.got = [false, false, false, false]; this.feed = [];
    this.phase = 'choose'; this.endsAt = Date.now() + (this.bot(this.drawer) ? 1200 : 12000); this.history.length++;
  }
  startDraw(w) {
    this.word = w; this.phase = 'draw'; this.t0 = Date.now(); this.endsAt = this.t0 + 80000; this.reveal = [];
    this.plan = [0, 1, 2, 3].map((s) => (s !== this.drawer && this.bot(s) && Math.random() < 0.7 ? { s, at: this.t0 + 15000 + rnd(55000) } : null));
    this.nextHint = this.t0 + 20000; this.history.length++;
  }
  act(seat, a) {
    if (this.over || seat < 0) throw new Error('استنى');
    if (a.type === 'pick') { if (this.phase !== 'choose' || seat !== this.drawer) throw new Error('مو دورك'); const w = this.choices[+a.i]; if (!w) throw new Error('اختار كلمة'); return this.startDraw(w); }
    if (a.type === 'stroke') {
      if (this.phase !== 'draw' || seat !== this.drawer) throw new Error('مو دورك ترسم');
      const p = Array.isArray(a.p) ? a.p.slice(0, 400).map((x) => Math.max(0, Math.min(1000, x | 0))) : [];
      if (p.length >= 2 && this.strokes.length < 600) this.strokes.push({ p, c: (a.c | 0) % 8, w: (a.w | 0) % 3 });
      this.history.length++; return;
    }
    if (a.type === 'clear') { if (seat !== this.drawer) throw new Error('مو دورك'); this.strokes = []; this.history.length++; return; }
    if (a.type === 'undo') { if (seat !== this.drawer) throw new Error('مو دورك'); this.strokes.pop(); this.history.length++; return; }
    if (a.type === 'guess') {
      if (this.phase !== 'draw' || seat === this.drawer || this.got[seat]) throw new Error('ما بتقدر تخمّن هلق');
      const g = String(a.w || '').slice(0, 30);
      if (normW(g) === normW(this.word)) this.hit(seat);
      else { this.feed.push({ s: seat, t: g }); if (this.feed.length > 8) this.feed.shift(); }
      this.history.length++; return;
    }
    throw new Error('حركة غلط');
  }
  hit(s) {
    const left = Math.max(0, this.endsAt - Date.now());
    const pts = 10 + Math.round((left / 80000) * 30); this.scores[s] += pts; this.scores[this.drawer] += 8; this.got[s] = true;
    this.feed.push({ s, t: `✅ عرفها! +${pts}`, ok: true });
    if ([0, 1, 2, 3].every((i) => i === this.drawer || this.got[i])) this.endsAt = Date.now() + 600;
  }
  tick() {
    const now = Date.now();
    if (this.phase === 'wait') return this.nextRound();
    if (this.phase === 'choose') { if (now >= this.endsAt) this.startDraw(this.choices[rnd(3)]); return; }
    if (this.phase === 'draw') {
      for (const p of this.plan) if (p && !this.got[p.s] && now >= p.at) this.hit(p.s);
      if (now >= this.nextHint) { const idx = [...this.word].map((ch, i) => i).filter((i) => this.word[i] !== ' ' && !this.reveal.includes(i)); if (idx.length > 1) this.reveal.push(idx[rnd(idx.length)]); this.nextHint = now + 20000; this.history.length++; }
      if (now >= this.endsAt) { this.phase = 'show'; this.endsAt = now + 4000; this.history.length++; }
      return;
    }
    if (this.phase === 'show' && now >= this.endsAt) this.nextRound();
  }
  finish() { this.over = true; this.phase = 'over'; const m = Math.max(...this.scores); this.winners = [0, 1, 2, 3].filter((i) => this.scores[i] === m); this.history.length++; }
  botAction() { return { type: 'noop' }; }
  view(seat) {
    const drawer = seat === this.drawer;
    const mask = this.word ? [...this.word].map((ch, i) => (ch === ' ' ? ' ' : this.phase === 'show' || this.over || drawer || (seat >= 0 && this.got[seat]) || (this.reveal || []).includes(i) ? ch : '_')).join('') : '';
    return { type: 'draw', phase: this.phase, drawer: this.drawer, round: this.ri + 1, scores: this.scores, turn: -1, over: this.over, winners: this.winners, history: this.history,
      hand: [], handCounts: [0, 0, 0, 0], trick: [], legal: [], msLeft: Math.max(0, this.endsAt - Date.now()), strokes: this.strokes, feed: this.feed, got: this.got,
      choices: drawer && this.phase === 'choose' ? this.choices : null, mask, word: this.phase === 'show' || this.over ? this.word : null, botDrawer: this.drawer !== undefined && this.bot(this.drawer),
      rank: [0, 1, 2, 3].map((i) => ({ seat: i, score: this.scores[i] })) };
  }
}
