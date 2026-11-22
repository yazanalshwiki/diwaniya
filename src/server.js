import { SQL } from 'bun';
import { createGame, GAME_NAMES } from './engine.js';

// static files: page + sounds (CC0 Kenney Casino Audio + recorded voice lines)
const ROOT = new URL('..', import.meta.url).pathname;
const SND_FILES = {};
{ const fs = await import('fs'); for (const f of fs.readdirSync(ROOT + 'assets')) if (f.endsWith('.mp3')) SND_FILES[f.slice(0, -4)] = fs.readFileSync(ROOT + 'assets/' + f); }
let html = await Bun.file(ROOT + 'public/index.html').text();
const PORT = +(Bun.env.PORT || 3000);
const SECRET = Bun.env.APP_SECRET || Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
const hmac = (data) => new Bun.CryptoHasher('sha256', SECRET).update(data).digest('base64url');
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const TURN_MS = +(Bun.env.TURN_MS || 40000);      // human turn timeout -> bot plays for them
const AWAY_MS = 10000;      // disconnected grace before bot takes over
const WIN_PTS = 30, LOSS_PTS = 10, START_PTS = +(Bun.env.START_PTS || 1000), DAILY_PTS = 100;
// ================== Store catalog (prices in coins) ==================
const CATALOG = {
  'cs:classic': 0, 'cs:four': 300, 'cs:ivory': 500, 'cs:dark': 500,
  'bk:red': 0, 'bk:blue': 200, 'bk:green': 200, 'bk:gold': 800,
  'tb:sky': 0, 'tb:green': 300, 'tb:wood': 500, 'tb:black': 800, 'tb:neon': 1000,
  'tb:igreen': 300, 'tb:iblue': 300, 'tb:iblack': 400, 'tb:iwood': 500, 'tb:ired': 600, 'tb:iquilt': 600, 'tb:ipurple': 700, 'tb:imarble': 800,
  'tb:icasino': 900, 'tb:ineon': 1000, 'tb:isnow': 1000, 'tb:idesert': 1000, 'tb:iroyal': 1200, 'tb:iramadan': 1200, 'tb:iriyadh': 1500,
  'emo:lux': 600,
  'fx:laugh': 0, 'fx:burn': 0, 'fx:clap': 0, 'fx:cry': 0,
  'fx:angry': 150, 'fx:scream': 200, 'fx:kiss': 250, 'fx:party': 300,
  'vip:room': 1500,
};
// ================== Coin packs (real money via Moyasar; amounts in halalas) ==================
const PACKS = { p1: { coins: 1000, sar: 5 }, p2: { coins: 5000, sar: 19 }, p3: { coins: 15000, sar: 49 } };
const MOYASAR_PK = Bun.env.MOYASAR_PUBLISHABLE_KEY || '', MOYASAR_SK = Bun.env.MOYASAR_SECRET_KEY || '';
const memPaid = new Set();
async function creditPayment(payId) {
  if (!MOYASAR_SK) throw new Error('الدفع مو مفعّل لسا');
  const r = await fetch('https://api.moyasar.com/v1/payments/' + encodeURIComponent(payId), { headers: { authorization: 'Basic ' + Buffer.from(MOYASAR_SK + ':').toString('base64') } });
  if (!r.ok) throw new Error('ما لقينا عملية الدفع');
  const pay = await r.json();
  const md = pay.metadata || {}, pk = PACKS[md.pkg], uid = +md.uid;
  if (pay.status !== 'paid' || !pk || !uid || pay.currency !== 'SAR' || pay.amount !== pk.sar * 100) throw new Error('الدفع ما اكتمل');
  if (sql) {
    const ins = await sql`insert into payments (id, uid, pkg, amount, coins) values (${pay.id}, ${uid}, ${md.pkg}, ${pay.amount}, ${pk.coins}) on conflict (id) do nothing returning id`;
    if (!ins.length) return { uid, dup: true };
    await sql`update users set points = points + ${pk.coins} where id = ${uid}`;
  } else { if (memPaid.has(pay.id)) return { uid, dup: true }; memPaid.add(pay.id); const u = mem.users.get(uid); if (u) u.points += pk.coins; }
  return { uid, coins: pk.coins };
}
const LUX_ALL = ['heba', 'mawt', 'hubb', 'masdoum', 'cool', 'bosa', 'dahk', 'm3assab', 'tasfeeq', 'tamam', 'salam', 'quwwa', 'qalb', 'maksour', 'nar', 'malik', 'warda', 'qahwa', 'shay', 'dalla', 'hadiyye', 'kake', 'kas', 'waraq', 'almas', 'floos'];
const LUX_FREE = ['tamam', 'tasfeeq', 'nar', 'qahwa', 'warda', 'salam'];
const owns = (u, id) => CATALOG[id] === 0 || (u.items || []).includes(id);

// ================== Storage ==================
let sql = null;
const mem = { users: new Map(), nextId: 1 };
if (Bun.env.DATABASE_URL) {
  sql = new SQL(Bun.env.DATABASE_URL);
  await sql`create table if not exists users (
    id serial primary key,
    username text not null,
    uname_key text unique not null,
    pass text not null,
    points int not null default 1000,
    games int not null default 0,
    wins int not null default 0,
    created_at timestamptz not null default now())`;
  await sql`create table if not exists matches (
    id serial primary key, game text not null, players jsonb not null, winners jsonb not null,
    finished_at timestamptz not null default now())`;
  await sql`create table if not exists payments (
    id text primary key, uid int not null, pkg text not null, amount int not null, coins int not null,
    created_at timestamptz not null default now())`;
  await sql`alter table users add column if not exists avatar text`;
  await sql`alter table users add column if not exists email text`;
  await sql`alter table users add column if not exists photo text`;
  await sql`alter table users add column if not exists ph bigint not null default 0`;
  await sql`alter table users add column if not exists items jsonb not null default '[]'`;
  await sql`alter table users add column if not exists equip jsonb not null default '{}'`;
  await sql`alter table users add column if not exists last_daily date`;
  console.log('Postgres connected');
} else console.log('No DATABASE_URL — using in-memory store');

const pub = (u, self) => u && { id: u.id, username: u.username, points: u.points, games: u.games, wins: u.wins, avatar: u.avatar || null, ph: +u.ph || 0,
  ...(self ? { email: u.email || '', items: u.items || [], equip: u.equip || {}, catalog: CATALOG, dailyReady: !u.last_daily || String(u.last_daily instanceof Date ? u.last_daily.toISOString() : u.last_daily).slice(0, 10) !== new Date().toISOString().slice(0, 10) } : {}) };
async function patchUser(id, f) {
  if (sql) {
    if ('email' in f) await sql`update users set email = ${f.email} where id = ${id}`;
    if ('username' in f) await sql`update users set username = ${f.username}, uname_key = ${keyOf(f.username)} where id = ${id}`;
    if ('pass' in f) await sql`update users set pass = ${f.pass} where id = ${id}`;
    if ('photo' in f) await sql`update users set photo = ${f.photo}, ph = ${f.ph} where id = ${id}`;
    if ('items' in f) await sql`update users set items = ${JSON.stringify(f.items)}::jsonb where id = ${id}`;
    if ('equip' in f) await sql`update users set equip = ${JSON.stringify(f.equip)}::jsonb where id = ${id}`;
    if ('points' in f) await sql`update users set points = ${f.points} where id = ${id}`;
    if ('last_daily' in f) await sql`update users set last_daily = ${f.last_daily} where id = ${id}`;
    return getUser(id);
  }
  const u = mem.users.get(id); if (!u) return null;
  if ('username' in f) u.uname_key = keyOf(f.username);
  Object.assign(u, f); return u;
}
const keyOf = (n) => n.trim().toLowerCase();

async function findUser(name) {
  if (sql) return (await sql`select * from users where uname_key = ${keyOf(name)}`)[0];
  return [...mem.users.values()].find((u) => u.uname_key === keyOf(name));
}
async function getUser(id) {
  if (sql) return (await sql`select * from users where id = ${id}`)[0];
  return mem.users.get(id);
}
async function createUser(username, pass) {
  if (sql) return (await sql`insert into users (username, uname_key, pass) values (${username}, ${keyOf(username)}, ${pass}) returning *`)[0];
  const u = { id: mem.nextId++, username, uname_key: keyOf(username), pass, points: START_PTS, games: 0, wins: 0, ph: 0, items: [], equip: {}, email: null, last_daily: null };
  mem.users.set(u.id, u);
  return u;
}
async function recordResult(uid, won) {
  if (sql) {
    await sql`update users set games = games + 1, wins = wins + ${won ? 1 : 0},
      points = greatest(0, points + ${won ? WIN_PTS : -LOSS_PTS}) where id = ${uid}`;
    return;
  }
  const u = mem.users.get(uid);
  if (u) { u.games++; if (won) u.wins++; u.points = Math.max(0, u.points + (won ? WIN_PTS : -LOSS_PTS)); }
}
async function leaderboard() {
  if (sql) return (await sql`select id, username, points, games, wins, avatar, ph from users order by points desc, wins desc limit 30`);
  return [...mem.users.values()].sort((a, b) => b.points - a.points).slice(0, 30).map(pub);
}

// ================== Tokens ==================
const b64 = (s) => Buffer.from(s).toString('base64url');
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return body + '.' + hmac(body);
}
function verify(tok) {
  if (!tok || typeof tok !== 'string') return null;
  const [body, sig] = tok.split('.');
  if (!body || !sig) return null;
  if (!safeEq(hmac(body), sig)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
const issue = (u) => sign({ id: u.id, n: u.username, exp: Date.now() + 1000 * 60 * 60 * 24 * 60 });

// ================== Rooms ==================
const rooms = new Map();      // code -> room
const userRoom = new Map();   // uid -> code
const clients = new Map();    // uid -> ws
const BOT_NAMES = ['بوت أبو فهد', 'بوت أبو سالم', 'بوت أم خالد', 'بوت أبو ناصر', 'بوت سعود', 'بوت ريم'];

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const send = (ws, m) => { try { ws && ws.readyState === 1 && ws.send(JSON.stringify(m)); } catch {} };
const humanSeats = (r) => r.seats.map((s, i) => [s, i]).filter(([s]) => s && !s.bot);
const isConnected = (uid) => clients.has(uid);
const seatOf = (r, uid) => r.seats.findIndex((s) => s && !s.bot && s.uid === uid);

function botName(r) {
  const used = new Set(r.seats.filter(Boolean).map((s) => s.name));
  return BOT_NAMES.find((n) => !used.has(n)) || 'بوت';
}

function roomView(r, uid) {
  const mySeat = seatOf(r, uid);
  const eng = r.engine;
  return {
    code: r.code, game: r.game, gameName: GAME_NAMES[r.game], status: r.status, priv: r.priv,
    hostId: r.host, isHost: r.host === uid, mySeat, vip: !!r.vip, turnMs: r.turnMs || TURN_MS,
    seats: r.seats.map((s) => s && {
      name: s.name, bot: !!s.bot, uid: s.uid || null, av: s.av || null, ph: s.ph || 0,
      away: !s.bot && (s.left || !isConnected(s.uid)),
    }),
    chat: r.chat.slice(-40),
    voice: [...r.voice],
    deadline: r.deadline || null,
    engine: eng ? eng.view(mySeat) : null,
    result: r.result || null,
  };
}
function broadcast(r) {
  for (const [s] of humanSeats(r)) if (!s.left) send(clients.get(s.uid), { t: 'room', room: roomView(r, s.uid) });
  for (const uid of r.watchers) send(clients.get(uid), { t: 'room', room: roomView(r, uid) });
  lobbyDirty();
}

let lobbyTimer = null;
function lobbyDirty() {
  if (lobbyTimer) return;
  lobbyTimer = setTimeout(() => {
    lobbyTimer = null;
    const list = lobbyList();
    for (const [uid, ws] of clients) if (!userRoom.has(uid)) send(ws, { t: 'lobby', rooms: list });
  }, 300);
}
function lobbyList() {
  return [...rooms.values()].filter((r) => !r.priv && r.status !== 'finished').map((r) => ({
    code: r.code, game: r.game, gameName: GAME_NAMES[r.game], status: r.status,
    host: (r.seats.find((s) => s && s.uid === r.host) || {}).name || '',
    humans: humanSeats(r).length, free: r.seats.filter((s) => !s).length, vip: !!r.vip,
  })).slice(0, 50);
}

function controlledByBot(r, i) {
  const s = r.seats[i];
  return s.bot || s.left || !isConnected(s.uid);
}

function schedule(r) {
  clearTimeout(r.timer);
  r.timer = null;
  r.deadline = null;
  const eng = r.engine;
  if (!eng || eng.over || r.status !== 'playing') return;
  if (eng.pending) {
    r.timer = setTimeout(() => { eng.tick(); afterChange(r); }, eng.pending.delay);
    return;
  }
  const seat = eng.turn;
  if (seat < 0) return;
  const s = r.seats[seat];
  let delay;
  if (s.bot || s.left) delay = 650 + Math.random() * 600;
  else if (!isConnected(s.uid)) delay = Math.max(300, (s.awaySince || Date.now()) + AWAY_MS - Date.now());
  else { const ms = r.turnMs || TURN_MS; delay = ms; r.deadline = Date.now() + ms; }
  r.timer = setTimeout(() => {
    try { if (eng.turn === seat && !eng.pending) eng.act(seat, eng.botAction(seat)); }
    catch (e) { console.error('bot error', e); }
    afterChange(r);
  }, delay);
}

async function afterChange(r) {
  const eng = r.engine;
  if (eng && eng.over && r.status === 'playing') {
    r.status = 'finished';
    const winners = eng.winners;
    r.result = { winners, names: winners.map((i) => r.seats[i].name) };
    const humans = humanSeats(r);
    try {
      for (const [s, i] of humans) await recordResult(s.uid, winners.includes(i));
      if (sql) await sql`insert into matches (game, players, winners) values (${r.game}, ${JSON.stringify(r.seats.map((s) => s.name))}::jsonb, ${JSON.stringify(winners)}::jsonb)`;
    } catch (e) { console.error('db error', e); }
    for (const [s] of humans) {
      const u = await getUser(s.uid).catch(() => null);
      if (u) send(clients.get(s.uid), { t: 'me', user: pub(u, true) });
    }
  }
  schedule(r);
  broadcast(r);
}

function removeFromRoom(uid) {
  const code = userRoom.get(uid);
  userRoom.delete(uid);
  if (!code) return;
  const r = rooms.get(code);
  if (!r) return;
  r.watchers.delete(uid);
  r.voice.delete(uid);
  const i = seatOf(r, uid);
  if (i >= 0) {
    if (r.status === 'playing') { r.seats[i].left = true; }
    else r.seats[i] = null;
  }
  const remaining = humanSeats(r).filter(([s]) => !s.left);
  if (!remaining.length && !r.watchers.size) { clearTimeout(r.timer); rooms.delete(code); lobbyDirty(); return; }
  if (r.host === uid) r.host = remaining.length ? remaining[0][0].uid : r.host;
  schedule(r);
  broadcast(r);
}

function sysChat(r, text) { r.chat.push({ sys: true, text, ts: Date.now() }); }

async function handle(ws, m) {
  const uid = ws.data.uid, name = ws.data.name, av = ws.data.av || null, ph = ws.data.ph || 0;
  const code = userRoom.get(uid);
  const r = code && rooms.get(code);
  switch (m.t) {
    case 'lobby': send(ws, { t: 'lobby', rooms: lobbyList() }); break;
    case 'leaders': send(ws, { t: 'leaders', list: await leaderboard() }); break;
    case 'create': {
      if (!GAME_NAMES[m.game]) throw new Error('لعبة غير معروفة');
      let vip = false, turnMs = TURN_MS;
      if (m.vip) {
        const cu = await getUser(uid);
        if (!cu || !owns(cu, 'vip:room')) throw new Error('غرف VIP بدها شراء من المتجر 👑');
        vip = true; if ([20000, 40000, 60000, 90000].includes(+m.turnMs)) turnMs = +m.turnMs;
      }
      removeFromRoom(uid);
      const room = { code: newCode(), game: m.game, priv: !!m.priv, host: uid, status: 'waiting', vip, turnMs,
        seats: [{ uid, name, av, ph }, null, null, null], watchers: new Set(), voice: new Set(), chat: [], engine: null, timer: null, created: Date.now() };
      rooms.set(room.code, room);
      userRoom.set(uid, room.code);
      sysChat(room, `${name} فتح الطاولة`);
      broadcast(room);
      break;
    }
    case 'join': {
      const target = rooms.get(String(m.code || '').trim().toUpperCase());
      if (!target) throw new Error('ما لقينا طاولة بهذا الكود');
      if (code !== target.code) removeFromRoom(uid);
      userRoom.set(uid, target.code);
      const existing = seatOf(target, uid);
      if (existing >= 0) { target.seats[existing].left = false; target.seats[existing].awaySince = null; }
      else {
        const free = target.seats.findIndex((s) => !s);
        if (target.status === 'waiting' && free >= 0) { target.seats[free] = { uid, name, av, ph }; sysChat(target, `${name} دخل الطاولة`); }
        else target.watchers.add(uid);
      }
      schedule(target);
      broadcast(target);
      break;
    }
    case 'leave': removeFromRoom(uid); send(ws, { t: 'left' }); send(ws, { t: 'lobby', rooms: lobbyList() }); break;
    case 'sit': {
      if (!r || r.status !== 'waiting') throw new Error('ما تقدر تغير مكانك الحين');
      const to = +m.seat;
      if (!(to >= 0 && to < 4) || r.seats[to]) throw new Error('الكرسي مشغول');
      const from = seatOf(r, uid);
      if (from >= 0) r.seats[from] = null; else r.watchers.delete(uid);
      r.seats[to] = { uid, name, av, ph };
      broadcast(r);
      break;
    }
    case 'addBot': case 'kick': {
      if (!r || r.host !== uid || r.status !== 'waiting') throw new Error('بس صاحب الطاولة يقدر');
      const i = +m.seat;
      if (!(i >= 0 && i < 4)) throw new Error('كرسي غلط');
      if (m.t === 'addBot') { if (r.seats[i]) throw new Error('الكرسي مشغول'); r.seats[i] = { bot: true, name: botName(r) }; }
      else {
        const s = r.seats[i];
        if (!s || s.uid === uid) throw new Error('ما ينفع');
        if (!s.bot) { userRoom.delete(s.uid); send(clients.get(s.uid), { t: 'left', reason: 'صاحب الطاولة طلعك' }); }
        r.seats[i] = null;
      }
      broadcast(r);
      break;
    }
    case 'start': case 'rematch': {
      if (!r || r.host !== uid) throw new Error('بس صاحب الطاولة يقدر يبدأ');
      if (m.t === 'start' && r.status !== 'waiting') throw new Error('اللعبة بدأت');
      if (m.t === 'rematch' && r.status !== 'finished') throw new Error('اللعبة ما خلصت');
      for (let i = 0; i < 4; i++) {
        const s = r.seats[i];
        if (!s || s.left) {
          if (s && s.left) userRoom.get(s.uid) === r.code && userRoom.delete(s.uid);
          r.seats[i] = { bot: true, name: botName(r) };
        }
      }
      r.engine = createGame(r.game);
      r.status = 'playing';
      r.result = null;
      sysChat(r, 'بدأت اللعبة 🎴 بالتوفيق!');
      afterChange(r);
      break;
    }
    case 'act': {
      if (!r || !r.engine || r.status !== 'playing') throw new Error('ما فيه لعبة شغالة');
      const i = seatOf(r, uid);
      if (i < 0) throw new Error('أنت متفرج');
      r.engine.act(i, m.a || {});
      afterChange(r);
      break;
    }
    case 'voice': {
      if (!r) break;
      if (m.on) r.voice.add(uid); else r.voice.delete(uid);
      broadcast(r);
      break;
    }
    case 'rtc': {
      if (!r || !m.to) break;
      const inRoom = seatOf(r, m.to) >= 0 || r.watchers.has(m.to);
      if (inRoom && r.voice.has(m.to)) send(clients.get(m.to), { t: 'rtc', from: uid, data: m.data });
      break;
    }
    case 'react': {
      if (!r) break;
      const now = Date.now();
      if (ws.data.lastReact && now - ws.data.lastReact < 700) break;
      ws.data.lastReact = now;
      const e = String(m.e || '').slice(0, 40);
      if (!e) break;
      if (e[0] === '~') {
        const k = e.slice(1);
        if (!LUX_ALL.includes(k)) break;
        if (!LUX_FREE.includes(k)) { const ru = await getUser(uid); if (!ru || !owns(ru, 'emo:lux')) { send(ws, { t: 'error', msg: 'باقة الإيموجيات بالمتجر 🛍️' }); break; } }
      }
      if (e[0] === '!' && CATALOG['fx:' + e.slice(1)] !== undefined) {
        const ru = await getUser(uid);
        if (!ru || !owns(ru, 'fx:' + e.slice(1))) { send(ws, { t: 'error', msg: 'هالتفاعل بدك تشتريه من المتجر 🛍️' }); break; }
      }
      const seat = seatOf(r, uid);
      const msg = { t: 'react', seat, name, e };
      for (const [s2] of humanSeats(r)) if (!s2.left) send(clients.get(s2.uid), msg);
      for (const w of r.watchers) send(clients.get(w), msg);
      break;
    }
    case 'avatar': {
      const v = String(m.v || '');
      if (!/^[a-z0-9-]{1,30}$/.test(v)) throw new Error('شكل غير معروف');
      ws.data.av = v;
      if (sql) await sql`update users set avatar = ${v} where id = ${uid}`;
      else { const u = mem.users.get(uid); if (u) u.avatar = v; }
      for (const room of rooms.values()) { const i = seatOf(room, uid); if (i >= 0) { room.seats[i].av = v; broadcast(room); } }
      const u = await getUser(uid);
      send(ws, { t: 'me', user: pub(u, true) });
      break;
    }
    case 'chat': {
      if (!r) break;
      const text = String(m.text || '').slice(0, 200).trim();
      if (!text) break;
      r.chat.push({ name, text, ts: Date.now() });
      if (r.chat.length > 100) r.chat.splice(0, r.chat.length - 100);
      broadcast(r);
      break;
    }
  }
}

// cleanup idle rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const online = humanSeats(r).some(([s]) => !s.left && isConnected(s.uid)) || [...r.watchers].some(isConnected);
    if (online) r.idleSince = null;
    else if (!r.idleSince) r.idleSince = now;
    else if (now - r.idleSince > 15 * 60 * 1000) {
      clearTimeout(r.timer);
      for (const [s] of humanSeats(r)) if (userRoom.get(s.uid) === code) userRoom.delete(s.uid);
      for (const w of r.watchers) if (userRoom.get(w) === code) userRoom.delete(w);
      rooms.delete(code);
    }
  }
}, 60000);

// ================== HTTP ==================
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
async function body(req) { try { return await req.json(); } catch { return {}; } }

const server = Bun.serve({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const p = verify(url.searchParams.get('token'));
      if (!p) return new Response('unauthorized', { status: 401 });
      const u = await getUser(p.id);
      if (!u) return new Response('unauthorized', { status: 401 });
      if (srv.upgrade(req, { data: { uid: u.id, name: u.username, av: u.avatar || null, ph: +u.ph || 0 } })) return;
      return new Response('upgrade failed', { status: 400 });
    }
    if (url.pathname === '/api/register' && req.method === 'POST') {
      const { username = '', password = '' } = await body(req);
      const n = String(username).trim().replace(/\s+/g, ' ');
      if (n.length < 2 || n.length > 20) return json({ error: 'الاسم لازم يكون من 2 إلى 20 حرف' }, 400);
      if (/^بوت/.test(n)) return json({ error: 'اختر اسم ثاني' }, 400);
      if (String(password).length < 4) return json({ error: 'كلمة المرور 4 أحرف على الأقل' }, 400);
      if (await findUser(n)) return json({ error: 'الاسم مستخدم، جرب اسم ثاني' }, 400);
      const u = await createUser(n, await Bun.password.hash(String(password)));
      return json({ token: issue(u), user: pub(u, true) });
    }
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { username = '', password = '' } = await body(req);
      const u = await findUser(String(username));
      if (!u || !(await Bun.password.verify(String(password), u.pass))) return json({ error: 'الاسم أو كلمة المرور غلط' }, 401);
      return json({ token: issue(u), user: pub(u, true) });
    }
    if (url.pathname === '/api/me') {
      const p = verify((req.headers.get('authorization') || '').replace('Bearer ', ''));
      const u = p && (await getUser(p.id));
      return u ? json({ user: pub(u, true) }) : json({ error: 'unauthorized' }, 401);
    }
    if (url.pathname === '/api/packs') return json({ packs: PACKS, pk: MOYASAR_PK, enabled: !!(MOYASAR_PK && MOYASAR_SK) });
    if (url.pathname === '/pay/done') {
      // Moyasar redirects here after payment: ?id=...&status=...
      let msg = 'paid';
      try { const r = await creditPayment(url.searchParams.get('id') || ''); const u = await getUser(r.uid); const ws = clients.get(r.uid); if (ws && u) send(ws, { t: 'me', user: pub(u, true) }); }
      catch (e) { msg = 'failed'; console.error('pay', e.message); }
      return new Response(null, { status: 302, headers: { location: '/?pay=' + msg } });
    }
    if (url.pathname === '/api/store' && req.method === 'POST') {
      const p = verify((req.headers.get('authorization') || '').replace('Bearer ', ''));
      let u = p && (await getUser(p.id));
      if (!u) return json({ error: 'unauthorized' }, 401);
      const b = await body(req), id = String(b.id || '');
      if (b.op === 'daily') {
        const today = new Date().toISOString().slice(0, 10);
        if (u.last_daily && String(u.last_daily instanceof Date ? u.last_daily.toISOString() : u.last_daily).slice(0, 10) === today) return json({ error: 'أخدت مكافأة اليوم، ارجع بكرا 🌙' }, 400);
        u = await patchUser(u.id, { points: u.points + DAILY_PTS, last_daily: today });
      } else if (b.op === 'buy') {
        if (CATALOG[id] === undefined) return json({ error: 'غرض مو موجود' }, 400);
        if (owns(u, id)) return json({ error: 'عندك ياه من قبل' }, 400);
        if (u.points < CATALOG[id]) return json({ error: 'نقاطك ما بتكفي 🪙' }, 400);
        u = await patchUser(u.id, { points: u.points - CATALOG[id], items: [...(u.items || []), id] });
        const [k] = id.split(':'); if (['cs', 'bk', 'tb'].includes(k)) u = await patchUser(u.id, { equip: { ...(u.equip || {}), [k]: id.split(':')[1] } });
      } else if (b.op === 'equip') {
        const [k, v] = id.split(':');
        if (!['cs', 'bk', 'tb'].includes(k) || CATALOG[id] === undefined) return json({ error: 'غرض مو موجود' }, 400);
        if (!owns(u, id)) return json({ error: 'لازم تشتريه أول' }, 400);
        u = await patchUser(u.id, { equip: { ...(u.equip || {}), [k]: v } });
      } else return json({ error: 'طلب غلط' }, 400);
      const ws = clients.get(u.id); if (ws) send(ws, { t: 'me', user: pub(u, true) });
      return json({ user: pub(u, true) });
    }
    if (url.pathname.startsWith('/p/')) {
      const u = await getUser(+url.pathname.slice(3));
      if (!u || !u.photo) return new Response('not found', { status: 404 });
      return new Response(Buffer.from(u.photo, 'base64'), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
    }
    if (url.pathname === '/api/profile' && req.method === 'POST') {
      const p = verify((req.headers.get('authorization') || '').replace('Bearer ', ''));
      let u = p && (await getUser(p.id));
      if (!u) return json({ error: 'unauthorized' }, 401);
      const b = await body(req), f = {};
      if (b.email !== undefined) {
        const e = String(b.email).trim().toLowerCase();
        if (e && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e)) return json({ error: 'الإيميل مو صحيح' }, 400);
        f.email = e || null;
      }
      if (b.username !== undefined && String(b.username).trim() !== u.username) {
        const n = String(b.username).trim().replace(/\s+/g, ' ');
        if (n.length < 2 || n.length > 20) return json({ error: 'الاسم لازم يكون من 2 إلى 20 حرف' }, 400);
        if (/^بوت/.test(n)) return json({ error: 'اختر اسم ثاني' }, 400);
        const o = await findUser(n); if (o && o.id !== u.id) return json({ error: 'الاسم مستخدم، جرب اسم ثاني' }, 400);
        if (userRoom.has(u.id)) return json({ error: 'اطلع من الطاولة أول لتغيّر اسمك' }, 400);
        f.username = n;
      }
      if (b.newPass) {
        if (!(await Bun.password.verify(String(b.oldPass || ''), u.pass))) return json({ error: 'كلمة السر القديمة غلط' }, 400);
        if (String(b.newPass).length < 4) return json({ error: 'كلمة السر 4 أحرف على الأقل' }, 400);
        f.pass = await Bun.password.hash(String(b.newPass));
      }
      if (b.photo !== undefined) {
        if (b.photo === null) { f.photo = null; f.ph = 0; }
        else {
          const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.photo));
          if (!m || m[1].length > 90000) return json({ error: 'الصورة كبيرة أو مو مدعومة' }, 400);
          f.photo = m[1]; f.ph = Date.now();
        }
      }
      u = await patchUser(u.id, f);
      const ws = clients.get(u.id);
      if (ws) { ws.data.name = u.username; ws.data.ph = +u.ph || 0; send(ws, { t: 'me', user: pub(u, true) }); }
      if ('ph' in f) for (const room of rooms.values()) { const i = seatOf(room, u.id); if (i >= 0) { room.seats[i].ph = f.ph; broadcast(room); } }
      return json({ user: pub(u, true), token: f.username ? issue(u) : undefined });
    }
    if (url.pathname === '/api/leaderboard') return json({ list: await leaderboard() });
    if (url.pathname.startsWith('/snd/')) {
      const b = SND_FILES[url.pathname.slice(5).replace(/\.mp3$/, '')];
      if (!b) return new Response('not found', { status: 404 });
      return new Response(b, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' } });
    }
    if (/^\/img\/(av|tb|emo)\/[a-z0-9]+\.webp$/.test(url.pathname)) {
      const f = Bun.file(ROOT + 'public' + url.pathname);
      if (!(await f.exists())) return new Response('not found', { status: 404 });
      return new Response(f, { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=604800' } });
    }
    if (url.pathname === '/vendor/moyasar.js' || url.pathname === '/vendor/moyasar.css') {
      const f = Bun.file(ROOT + 'public' + url.pathname);
      return new Response(f, { headers: { 'content-type': url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css', 'cache-control': 'public, max-age=86400' } });
    }
    if (url.pathname === '/health') return new Response('ok');
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
  },
  websocket: {
    idleTimeout: 120,
    sendPings: true,
    open(ws) {
      const uid = ws.data.uid;
      const old = clients.get(uid);
      if (old && old !== ws) { send(old, { t: 'left', reason: 'فتحت الحساب من جهاز ثاني' }); try { old.close(); } catch {} }
      clients.set(uid, ws);
      getUser(uid).then((u) => send(ws, { t: 'me', user: pub(u, true) }));
      const code = userRoom.get(uid);
      const r = code && rooms.get(code);
      if (r) {
        const i = seatOf(r, uid);
        if (i >= 0) { r.seats[i].awaySince = null; r.seats[i].left = false; }
        schedule(r); broadcast(r);
      } else send(ws, { t: 'lobby', rooms: lobbyList() });
    },
    async message(ws, raw) {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      try { await handle(ws, m); }
      catch (e) { send(ws, { t: 'error', msg: e.message || 'خطأ' }); }
    },
    close(ws) {
      const uid = ws.data.uid;
      if (clients.get(uid) !== ws) return;
      clients.delete(uid);
      const code = userRoom.get(uid);
      const r = code && rooms.get(code);
      if (r) {
        r.voice.delete(uid);
        const i = seatOf(r, uid);
        if (i >= 0) r.seats[i].awaySince = Date.now();
        schedule(r); broadcast(r);
      }
    },
  },
});
console.log('Listening on', server.port);
