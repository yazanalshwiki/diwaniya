import { makeCommunity } from './community.js';
import { SQL } from 'bun';
import { createGame, GAME_NAMES, seatCount } from './engine.js';

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
  await sql`alter table users add column if not exists favs jsonb not null default '[]'`;
  await sql`alter table users add column if not exists banned_until timestamptz`;
  await sql`alter table users add column if not exists ban_reason text`;
  await sql`alter table users add column if not exists last_ip text`;
  await sql`alter table users add column if not exists last_device text`;
  await sql`alter table users add column if not exists last_seen timestamptz`;
  await sql`create table if not exists admins (id serial primary key, username text not null unique, pass text not null, role text not null default 'mod', created_at timestamptz not null default now())`;
  await sql`alter table admins add column if not exists player_id int`;
  await sql`create table if not exists friends (a int not null, b int not null, status text not null default 'pending', created_at timestamptz not null default now(), primary key (a, b))`;
  await sql`create table if not exists bans (id serial primary key, kind text not null, value text not null, reason text, until timestamptz, created_at timestamptz not null default now())`;
  console.log('Postgres connected');
} else console.log('No DATABASE_URL — using in-memory store');

const pub = (u, self) => u && { id: u.id, username: u.username, points: u.points, games: u.games, wins: u.wins, avatar: u.avatar || null, ph: +u.ph || 0,
  ...(self ? { email: u.email || '', favs: u.favs || [], items: u.items || [], equip: u.equip || {}, catalog: CATALOG, dailyReady: !u.last_daily || String(u.last_daily instanceof Date ? u.last_daily.toISOString() : u.last_daily).slice(0, 10) !== new Date().toISOString().slice(0, 10) } : {}) };
async function patchUser(id, f) {
  if (sql) {
    if ('email' in f) await sql`update users set email = ${f.email} where id = ${id}`;
    if ('username' in f) await sql`update users set username = ${f.username}, uname_key = ${keyOf(f.username)} where id = ${id}`;
    if ('pass' in f) await sql`update users set pass = ${f.pass} where id = ${id}`;
    if ('photo' in f) await sql`update users set photo = ${f.photo}, ph = ${f.ph} where id = ${id}`;
    if ('items' in f) await sql`update users set items = ${JSON.stringify(f.items)}::jsonb where id = ${id}`;
    if ('equip' in f) await sql`update users set equip = ${JSON.stringify(f.equip)}::jsonb where id = ${id}`;
    if ('favs' in f) await sql`update users set favs = ${JSON.stringify(f.favs)}::jsonb where id = ${id}`;
    if ('points' in f) await sql`update users set points = ${f.points} where id = ${id}`;
    if ('last_daily' in f) await sql`update users set last_daily = ${f.last_daily} where id = ${id}`;
    if ('banned_until' in f) await sql`update users set banned_until = ${f.banned_until}, ban_reason = ${f.ban_reason || null} where id = ${id}`;
    if ('last_ip' in f) await sql`update users set last_ip = ${f.last_ip}, last_device = ${f.last_device || null}, last_seen = now() where id = ${id}`;
    return getUser(id);
  }
  const u = mem.users.get(id); if (!u) return null;
  if ('username' in f) u.uname_key = keyOf(f.username);
  if ('last_ip' in f) u.last_seen = new Date();
  Object.assign(u, f); return u;
}
const keyOf = (n) => n.trim().toLowerCase();

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
async function findByEmail(e) {
  e = String(e).trim().toLowerCase(); if (!e) return null;
  if (sql) return (await sql`select * from users where lower(email) = ${e} order by id limit 1`)[0];
  return [...mem.users.values()].find((u) => (u.email || '').toLowerCase() === e);
}
async function findUser(name) {
  if (String(name).includes('@')) return findByEmail(name);
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

// ================== Friends ==================
const memFriends = []; // {a,b,status}
async function frRows(uid) { if (sql) return await sql`select a, b, status from friends where a = ${uid} or b = ${uid}`; return memFriends.filter((f) => f.a === uid || f.b === uid); }
async function frGet(x, y) { if (sql) return (await sql`select a, b, status from friends where (a = ${x} and b = ${y}) or (a = ${y} and b = ${x})`)[0]; return memFriends.find((f) => (f.a === x && f.b === y) || (f.a === y && f.b === x)); }
async function frSet(a, b, status) { if (sql) await sql`insert into friends (a, b, status) values (${a}, ${b}, ${status}) on conflict (a, b) do update set status = ${status}`; else { const f = memFriends.find((r) => r.a === a && r.b === b); if (f) f.status = status; else memFriends.push({ a, b, status }); } }
async function frDel(x, y) { if (sql) await sql`delete from friends where (a = ${x} and b = ${y}) or (a = ${y} and b = ${x})`; else for (let i = memFriends.length - 1; i >= 0; i--) { const f = memFriends[i]; if ((f.a === x && f.b === y) || (f.a === y && f.b === x)) memFriends.splice(i, 1); } }
async function friendsOf(uid) {
  const rows = await frRows(uid), out = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const other = r.a === uid ? r.b : r.a; const u = await getUser(other); if (!u) continue;
    const code = userRoom.get(other), room = code && rooms.get(code);
    const card = { id: u.id, username: u.username, av: u.avatar || null, ph: +u.ph || 0, level: undefined, online: clients.has(other), room: room ? { code, game: GAME_NAMES[room.game] || room.game, status: room.status, priv: room.priv } : null };
    if (r.status === 'accepted') out.friends.push(card); else if (r.b === uid) out.incoming.push(card); else out.outgoing.push(card);
  }
  out.friends.sort((x, y) => (y.online ? 1 : 0) - (x.online ? 1 : 0) || x.username.localeCompare(y.username, 'ar'));
  return out;
}
const pokeFriends = (uid) => { const c = clients.get(uid); if (c) send(c, { t: 'friends' }); };

// ================== Bans / admin helpers ==================
const memBans = []; let memBanId = 1;
const clientIP = (req, srv) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || (srv && srv.requestIP(req) ? srv.requestIP(req).address : '') || '';
async function listBans() {
  if (sql) return await sql`select * from bans where until is null or until > now() order by id desc`;
  return memBans.filter((b) => !b.until || new Date(b.until) > new Date());
}
async function addBan(kind, value, hours, reason) {
  const until = hours > 0 ? new Date(Date.now() + hours * 3600000) : null;
  if (sql) return (await sql`insert into bans (kind, value, reason, until) values (${kind}, ${value}, ${reason || null}, ${until}) returning *`)[0];
  const b = { id: memBanId++, kind, value, reason: reason || null, until, created_at: new Date() }; memBans.push(b); return b;
}
async function delBan(id) { if (sql) await sql`delete from bans where id = ${id}`; else { const i = memBans.findIndex((b) => b.id === id); if (i >= 0) memBans.splice(i, 1); } }
const fmtUntil = (d) => (d ? 'لحد ' + new Date(d).toLocaleString('ar', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' }) : 'بشكل دائم');
async function banCheck(u, ip, dev) {
  if (u && u.banned_until && new Date(u.banned_until) > new Date()) return `حسابك محظور ${new Date(u.banned_until).getFullYear() > 2900 ? 'بشكل دائم' : fmtUntil(u.banned_until)}${u.ban_reason ? ' — السبب: ' + u.ban_reason : ''}`;
  for (const b of await listBans()) if ((b.kind === 'ip' && ip && b.value === ip) || (b.kind === 'device' && dev && b.value === dev)) return `هالجهاز محظور ${fmtUntil(b.until)}${b.reason ? ' — السبب: ' + b.reason : ''}`;
  return null;
}
function kickUser(uid, msg) { const c = clients.get(uid); if (c) { send(c, { t: 'banned', msg }); setTimeout(() => { try { c.close(); } catch {} }, 300); } removeFromRoom(uid); }
const ADMIN_PASSWORD = Bun.env.ADMIN_PASSWORD || '';
// admin accounts (owner = full access incl. managing admins; mod = everything else)
const memAdmins = []; let memAdminId = 1;
async function admins() { return sql ? await sql`select id, username, role, created_at from admins order by id` : memAdmins.map(({ pass, ...a }) => a); }
async function adminBy(field, v) { if (sql) return (field === 'id' ? await sql`select * from admins where id = ${v}` : await sql`select * from admins where lower(username) = ${String(v).toLowerCase()}`)[0]; return memAdmins.find((a) => (field === 'id' ? a.id === v : a.username.toLowerCase() === String(v).toLowerCase())); }
async function addAdmin(username, pass, role) { const h = await Bun.password.hash(pass); if (sql) return (await sql`insert into admins (username, pass, role) values (${username}, ${h}, ${role}) returning id, username, role`)[0]; const a = { id: memAdminId++, username, pass: h, role, created_at: new Date() }; memAdmins.push(a); return a; }
async function setAdminPass(id, pass) { const h = await Bun.password.hash(pass); if (sql) await sql`update admins set pass = ${h} where id = ${id}`; else { const a = memAdmins.find((x) => x.id === id); if (a) a.pass = h; } }
async function setAdminPlayer(id, pid) { if (sql) await sql`update admins set player_id = ${pid} where id = ${id}`; else { const a = memAdmins.find((x) => x.id === id); if (a) a.player_id = pid; } }
async function isAdminPlayer(uid) { if (sql) return (await sql`select 1 from admins where player_id = ${uid} limit 1`).length > 0; return memAdmins.some((a) => a.player_id === uid); }
async function delAdmin(id) { if (sql) await sql`delete from admins where id = ${id}`; else { const i = memAdmins.findIndex((a) => a.id === id); if (i >= 0) memAdmins.splice(i, 1); } }
async function ensureOwner() { if ((await admins()).length === 0 && ADMIN_PASSWORD) await addAdmin('admin', ADMIN_PASSWORD, 'owner'); }
async function adminOk(req) { const p = verify((req.headers.get('authorization') || '').replace('Bearer ', '')); if (!p || p.admin !== true || !p.aid) return null; const a = await adminBy('id', p.aid); return a ? { id: a.id, username: a.username, role: a.role } : null; }

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
const COMM = makeCommunity({ sql, clients, send: (w, m) => send(w, m), getUser, frGet, isAdminPlayer: (u) => isAdminPlayer(u) });
await COMM.init();
const send = (ws, m) => { try { ws && ws.readyState === 1 && ws.send(JSON.stringify(m)); } catch {} };
const FLEX_GAMES = new Set(['ludo', 'snakes', 'pig', 'yatzy', 'liar', 'memory', 'hilo', 'words', 'draw', 'guess', 'trivia', 'tf', 'flags', 'capitals', 'proverbs', 'dishes', 'scramble', 'math', 'wyr']);
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
    deadline: r.deadline || (eng && eng.deadline) || null,
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
  if (!s) return false;
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
  if (!s) { try { eng.turn = eng.next ? eng.next(seat) : seat; } catch {} r.timer = setTimeout(() => afterChange(r), 50); return; }
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
    r.result = { winners, names: winners.map((i) => (r.seats[i] ? r.seats[i].name : '')) };
    const humans = humanSeats(r);
    try {
      for (const [s, i] of humans) await recordResult(s.uid, winners.includes(i));
      if (sql) await sql`insert into matches (game, players, winners) values (${r.game}, ${JSON.stringify(r.seats.map((s) => (s ? s.name : null)))}::jsonb, ${JSON.stringify(winners)}::jsonb)`;
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
  if (m.t && (m.t[0] === 'c' && m.t !== 'create' && m.t !== 'chat' || m.t.startsWith('vc')) && (await COMM.ws(ws, m, { uid, name, av, ph }))) return;
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
        seats: [{ uid, name, av, ph }, ...Array(seatCount(m.game) - 1).fill(null)], watchers: new Set(), voice: new Set(), chat: [], engine: null, timer: null, created: Date.now() };
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
      if (!(to >= 0 && to < r.seats.length) || r.seats[to]) throw new Error('الكرسي مشغول');
      const from = seatOf(r, uid);
      if (from >= 0) r.seats[from] = null; else r.watchers.delete(uid);
      r.seats[to] = { uid, name, av, ph };
      broadcast(r);
      break;
    }
    case 'addBot': case 'kick': {
      if (!r || r.host !== uid || r.status !== 'waiting') throw new Error('بس صاحب الطاولة يقدر');
      const i = +m.seat;
      if (!(i >= 0 && i < r.seats.length)) throw new Error('كرسي غلط');
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
      // games that work with 2+ players don't get forced bots: empty chairs simply sit the game out
      const seated = r.seats.filter((x) => x && !x.left).length;
      const flex = FLEX_GAMES.has(r.game) && seated >= 2;
      for (let i = 0; i < r.seats.length; i++) {
        const s = r.seats[i];
        if (!s || s.left) {
          if (s && s.left) userRoom.get(s.uid) === r.code && userRoom.delete(s.uid);
          r.seats[i] = flex ? null : { bot: true, name: botName(r) };
        }
      }
      r.engine = createGame(r.game);
      r.engine.names = r.seats.map((x) => (x ? x.name : '')); r.engine.isHuman = (i) => !!r.seats[i] && !r.seats[i].bot; r.engine.isBot = (i) => !!r.seats[i] && controlledByBot(r, i);
      r.engine.isOut = (i) => !r.seats[i];
      if (r.engine.init) r.engine.init();
      if (r.engine.setOut) r.engine.setOut();
      if (r.engine.turn >= 0 && !r.seats[r.engine.turn] && r.engine.next) r.engine.turn = r.engine.next(r.engine.turn);
      if (r.engine.type === 'mono') { r.engine.names = r.seats.map((x) => x.name); r.engine.isHuman = (i) => !r.seats[i].bot; }
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
      if (r.engine.endsAt && Date.now() >= r.engine.endsAt && r.engine.tick) r.engine.tick();
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
      const ip = clientIP(req, srv), dev = String(url.searchParams.get('d') || '').slice(0, 64);
      const ban = await banCheck(u, ip, dev);
      if (!ban) patchUser(u.id, { last_ip: ip, last_device: dev }).catch(() => {});
      if (srv.upgrade(req, { data: { uid: u.id, name: u.username, av: u.avatar || null, ph: +u.ph || 0, ban } })) return;
      return new Response('upgrade failed', { status: 400 });
    }
    if (url.pathname === '/api/register' && req.method === 'POST') {
      const { username = '', email = '', password = '', device = '' } = await body(req); const dev = String(device).slice(0, 64);
      const n = String(username).trim().replace(/\s+/g, ' '); const em = String(email).trim().toLowerCase();
      if (!EMAIL_RE.test(em)) return json({ error: 'اكتب إيميل صحيح' }, 400);
      if (n.includes('@')) return json({ error: 'الاسم ما لازم يكون فيه @' }, 400);
      if (await findByEmail(em)) return json({ error: 'هالإيميل مسجّل من قبل — جرّب تسجّل دخول' }, 400);
      if (n.length < 2 || n.length > 20) return json({ error: 'الاسم لازم يكون من 2 إلى 20 حرف' }, 400);
      if (/^بوت/.test(n)) return json({ error: 'اختر اسم ثاني' }, 400);
      if (String(password).length < 4) return json({ error: 'كلمة المرور 4 أحرف على الأقل' }, 400);
      if (await findUser(n)) return json({ error: 'الاسم مستخدم، جرب اسم ثاني' }, 400);
      { const b = await banCheck(null, clientIP(req, srv), dev); if (b) return json({ error: b }, 403); }
      const u = await createUser(n, await Bun.password.hash(String(password)));
      await patchUser(u.id, { email: em });
      await patchUser(u.id, { last_ip: clientIP(req, srv), last_device: dev });
      return json({ token: issue(u), user: pub(u, true) });
    }
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { username = '', password = '', device = '' } = await body(req); const dev = String(device).slice(0, 64);
      const u = await findUser(String(username));
      if (!u || !(await Bun.password.verify(String(password), u.pass))) return json({ error: 'الإيميل/الاسم أو كلمة المرور غلط' }, 401);
      { const b = await banCheck(u, clientIP(req, srv), dev); if (b) return json({ error: b }, 403); }
      await patchUser(u.id, { last_ip: clientIP(req, srv), last_device: dev });
      return json({ token: issue(u), user: pub(u, true) });
    }
    if (url.pathname === '/api/me') {
      const p = verify((req.headers.get('authorization') || '').replace('Bearer ', ''));
      const u = p && (await getUser(p.id));
      return u ? json({ user: { ...pub(u, true), isAdmin: await isAdminPlayer(u.id) } }) : json({ error: 'unauthorized' }, 401);
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
    if (url.pathname === '/api/community') {
      const p = verify((req.headers.get('authorization') || '').replace('Bearer ', ''));
      const me = p && (await getUser(p.id)); if (!me) return json({ error: 'unauthorized' }, 401);
      try { return json(await COMM.api(req.method === 'POST' ? await body(req) : null, me)); } catch (e) { return json({ error: e.message }, 400); }
    }
    if (url.pathname === '/api/friends') {
      const p = verify((req.headers.get('authorization') || '').replace('Bearer ', ''));
      const me = p && (await getUser(p.id)); if (!me) return json({ error: 'unauthorized' }, 401);
      if (req.method === 'GET') return json(await friendsOf(me.id));
      const a = await body(req);
      if (a.action === 'search') {
        const q = keyOf(String(a.q || '')).normalize('NFKC'); if (q.length < 2) return json({ list: [] });
        let list = sql ? await sql`select id, username, avatar, ph from users where uname_key like ${'%' + q + '%'} or lower(username) like ${'%' + q + '%'} order by (uname_key = ${q}) desc, length(username), id limit 15`
          : [...mem.users.values()].filter((u) => u.uname_key.includes(q)).slice(0, 15);
        const rel = await frRows(me.id);
        return json({ list: list.filter((u) => u.id !== me.id).map((u) => { const r = rel.find((f) => f.a === u.id || f.b === u.id); return { id: u.id, username: u.username, av: u.avatar || null, ph: +u.ph || 0, online: clients.has(u.id), rel: r ? (r.status === 'accepted' ? 'friend' : r.a === me.id ? 'sent' : 'incoming') : null }; }) });
      }
      if (a.action === 'add') {
        const t = a.id ? await getUser(+a.id) : await findUser(String(a.username || '').trim()); if (!t) return json({ error: 'ما في لاعب بهالاسم' }, 404);
        if (t.id === me.id) return json({ error: 'ما فيك تضيف حالك 😄' }, 400);
        const ex = await frGet(me.id, t.id);
        if (ex && ex.status === 'accepted') return json({ error: 'هو صديقك أصلاً' }, 400);
        if (ex && ex.a === t.id) { await frSet(t.id, me.id, 'accepted'); pokeFriends(t.id); const c = clients.get(t.id); if (c) send(c, { t: 'notice', msg: `🤝 ${me.username} قبل طلب صداقتك` }); return json({ ok: true, note: `صرتوا أصدقاء مع ${t.username} 🤝` }); }
        if ((await frRows(me.id)).length >= 200) return json({ error: 'وصلت للحد الأقصى' }, 400);
        await frSet(me.id, t.id, 'pending'); pokeFriends(t.id);
        const c = clients.get(t.id); if (c) send(c, { t: 'notice', msg: `👋 ${me.username} بعتلك طلب صداقة` });
        return json({ ok: true, note: `انبعت طلب الصداقة لـ${t.username}` });
      }
      const oid = +a.id; const ex = oid && (await frGet(me.id, oid)); if (!ex) return json({ error: 'مو موجود' }, 404);
      if (a.action === 'accept') { if (ex.b !== me.id) return json({ error: 'ما في طلب' }, 400); await frSet(ex.a, ex.b, 'accepted'); pokeFriends(oid); const c = clients.get(oid); if (c) send(c, { t: 'notice', msg: `🤝 ${me.username} قبل طلب صداقتك` }); return json({ ok: true }); }
      if (a.action === 'decline' || a.action === 'remove' || a.action === 'cancel') { await frDel(me.id, oid); pokeFriends(oid); return json({ ok: true }); }
      if (a.action === 'invite') {
        if (ex.status !== 'accepted') return json({ error: 'لازم تكونوا أصدقاء' }, 400);
        const code = userRoom.get(me.id), r = code && rooms.get(code); if (!r) return json({ error: 'افتح طاولة أول' }, 400);
        const c = clients.get(oid); if (!c) return json({ error: 'صديقك مو متصل هلق' }, 400);
        send(c, { t: 'invite', from: me.username, code, game: GAME_NAMES[r.game] || r.game }); return json({ ok: true, note: 'انبعتت الدعوة 📨' });
      }
      return json({ error: 'أمر غلط' }, 400);
    }
    if (url.pathname === '/api/favs' && req.method === 'POST') {
      const p = verify((req.headers.get('authorization') || '').replace('Bearer ', ''));
      const u = p && (await getUser(p.id)); if (!u) return json({ error: 'unauthorized' }, 401);
      const { favs = [] } = await body(req);
      const list = [...new Set((Array.isArray(favs) ? favs : []).map(String).filter((g) => GAME_NAMES[g]))].slice(0, 41);
      await patchUser(u.id, { favs: list }); return json({ favs: list });
    }
    if (url.pathname === '/api/profile' && req.method === 'POST') {
      const p = verify((req.headers.get('authorization') || '').replace('Bearer ', ''));
      let u = p && (await getUser(p.id));
      if (!u) return json({ error: 'unauthorized' }, 401);
      const b = await body(req), f = {};
      if (b.email !== undefined) {
        const e = String(b.email).trim().toLowerCase();
        if (e && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e)) return json({ error: 'الإيميل مو صحيح' }, 400);
        if (e) { const o = await findByEmail(e); if (o && o.id !== u.id) return json({ error: 'هالإيميل مستخدم بحساب تاني' }, 400); }
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
    if (/^\/img\/[a-z0-9-]+\.png$/.test(url.pathname) || url.pathname === '/favicon.ico') {
      const f = Bun.file(ROOT + 'public' + (url.pathname === '/favicon.ico' ? '/img/favicon.png' : url.pathname));
      if (!(await f.exists())) return new Response('not found', { status: 404 });
      return new Response(f, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
    }
    if (url.pathname === '/manifest.json') return Response.json({ name: 'ديوانية الورق', short_name: 'الديوانية', start_url: '/', display: 'standalone', background_color: '#0d1433', theme_color: '#0d1433', lang: 'ar', dir: 'rtl',
      icons: [{ src: '/img/icon-192.png?v=3', sizes: '192x192', type: 'image/png' }, { src: '/img/icon-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'any' }] });
    if (/^\/img\/(av|tb|emo)\/[a-z0-9]+\.webp$/.test(url.pathname)) {
      const f = Bun.file(ROOT + 'public' + url.pathname);
      if (!(await f.exists())) return new Response('not found', { status: 404 });
      return new Response(f, { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=604800' } });
    }
    if (url.pathname === '/js/poolphys.js') return new Response(Bun.file(ROOT + 'src/poolphys.js'), { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' } });
    if (url.pathname === '/vendor/moyasar.js' || url.pathname === '/vendor/moyasar.css') {
      const f = Bun.file(ROOT + 'public' + url.pathname);
      return new Response(f, { headers: { 'content-type': url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css', 'cache-control': 'public, max-age=86400' } });
    }
    if (url.pathname === '/admin') return new Response(Bun.file(ROOT + 'public/admin.html'), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
    if (url.pathname.startsWith('/admin/api/')) {
      const ap = url.pathname.slice(11);
      if (ap === 'login' && req.method === 'POST') {
        await ensureOwner();
        const { username = '', password = '' } = await body(req);
        if (!(await admins()).length) return json({ error: 'لوحة الأدمن مو مفعّلة — لازم تحط ADMIN_PASSWORD' }, 403);
        const a = await adminBy('name', String(username).trim() || 'admin');
        if (!a || !((await Bun.password.verify(String(password), a.pass)) || (String(password).trim() !== String(password) && (await Bun.password.verify(String(password).trim(), a.pass))))) { await new Promise((r) => setTimeout(r, 800)); return json({ error: 'الاسم أو كلمة السر غلط' }, 401); }
        return json({ token: sign({ admin: true, aid: a.id, exp: Date.now() + 1000 * 60 * 60 * 12 }), me: { id: a.id, username: a.username, role: a.role } });
      }
      const ADM = await adminOk(req);
      if (!ADM) return json({ error: 'unauthorized' }, 401);
      if (ap === 'play' && req.method === 'POST') {
        const a = await adminBy('id', ADM.id); const { link = '' } = await body(req);
        let u = null;
        if (link) { u = await findUser(String(link)); if (!u) return json({ error: 'ما في لاعب بهالاسم' }, 404); }
        else if (a.player_id) u = await getUser(a.player_id);
        if (!u) { let n = a.username, k = 1; while (await findUser(n)) n = a.username + (++k); u = await createUser(n, await Bun.password.hash(crypto.randomUUID())); }
        if (a.player_id !== u.id) await setAdminPlayer(a.id, u.id);
        return json({ token: issue(u), user: { id: u.id, username: u.username } });
      }
      if (ap === 'me') {
        if (req.method === 'POST') {
          const { old = '', pass = '' } = await body(req); const a = await adminBy('id', ADM.id);
          if (!(await Bun.password.verify(String(old), a.pass))) return json({ error: 'كلمة السر الحالية غلط' }, 400);
          if (String(pass).length < 6) return json({ error: 'كلمة السر الجديدة ٦ أحرف عالأقل' }, 400);
          await setAdminPass(ADM.id, String(pass)); console.log('[admin]', ADM.username, 'changed own password'); return json({ ok: true });
        }
        const a0 = await adminBy('id', ADM.id); const pu = a0.player_id ? await getUser(a0.player_id) : null;
        return json({ me: { ...ADM, player: pu ? pu.username : null } });
      }
      if (ap === 'admins') {
        if (ADM.role !== 'owner') return json({ error: 'بس المالك بيقدر يدير المشرفين' }, 403);
        if (req.method === 'POST') {
          const a = await body(req);
          if (a.action === 'add') {
            const n = String(a.username || '').trim(); if (!/^[\w\u0600-\u06FF.-]{2,20}$/.test(n)) return json({ error: 'الاسم من ٢ لـ٢٠ حرف بدون مسافات' }, 400);
            if (String(a.pass || '').length < 6) return json({ error: 'كلمة السر ٦ أحرف عالأقل' }, 400);
            if (await adminBy('name', n)) return json({ error: 'الاسم مستخدم' }, 400);
            await addAdmin(n, String(a.pass), a.role === 'owner' ? 'owner' : 'mod'); console.log('[admin]', ADM.username, 'added admin', n); return json({ ok: true });
          }
          const t = await adminBy('id', +a.id); if (!t) return json({ error: 'مو موجود' }, 404);
          if (a.action === 'del') { if (t.id === ADM.id) return json({ error: 'ما فيك تحذف حالك' }, 400); if (t.role === 'owner' && (await admins()).filter((x) => x.role === 'owner').length < 2) return json({ error: 'لازم يضل مالك واحد عالأقل' }, 400); await delAdmin(t.id); return json({ ok: true }); }
          if (a.action === 'pass') { if (String(a.pass || '').length < 6) return json({ error: 'كلمة السر ٦ أحرف عالأقل' }, 400); await setAdminPass(t.id, String(a.pass)); return json({ ok: true }); }
          return json({ error: 'أمر غلط' }, 400);
        }
        return json({ list: await admins() });
      }
      if (ap === 'newuser' && req.method === 'POST') {
        const a = await body(req); const n = String(a.username || '').trim().replace(/\s+/g, ' ');
        if (n.length < 2 || n.length > 20) return json({ error: 'الاسم من ٢ لـ٢٠ حرف' }, 400);
        if (String(a.pass || '').length < 4) return json({ error: 'كلمة السر ٤ أحرف عالأقل' }, 400);
        if (await findUser(n)) return json({ error: 'الاسم مستخدم' }, 400);
        const u = await createUser(n, await Bun.password.hash(String(a.pass)));
        if (a.coins !== undefined && a.coins !== '') await patchUser(u.id, { points: Math.max(0, Math.trunc(+a.coins || 0)) });
        console.log('[admin]', ADM.username, 'created player', n); return json({ ok: true, id: u.id });
      }
      if (ap === 'stats') {
        const online = clients.size, live = [...rooms.values()].filter((r) => r.status === 'playing').length;
        if (sql) {
          const [a] = await sql`select count(*)::int as users, coalesce(sum(points),0)::bigint as coins, count(*) filter (where created_at > now() - interval '1 day')::int as new24, count(*) filter (where last_seen > now() - interval '1 day')::int as active24, count(*) filter (where banned_until > now())::int as banned from users`;
          const [m] = await sql`select count(*)::int as games, count(*) filter (where finished_at > now() - interval '1 day')::int as games24 from matches`;
          const [p] = await sql`select count(*)::int as n, coalesce(sum(amount),0)::int as halalas from payments`;
          const top = await sql`select game, count(*)::int as n from matches where finished_at > now() - interval '7 days' group by game order by n desc limit 8`;
          return json({ online, rooms: rooms.size, live, ...a, coins: Number(a.coins), ...m, payments: p.n, revenue: p.halalas / 100, top: top.map((t) => ({ game: GAME_NAMES[t.game] || t.game, n: t.n })) });
        }
        const us = [...mem.users.values()];
        return json({ online, rooms: rooms.size, live, users: us.length, coins: us.reduce((a, u) => a + u.points, 0), new24: us.length, active24: us.length, banned: us.filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).length, games: 0, games24: 0, payments: memPaid.size, revenue: 0, top: [] });
      }
      if (ap === 'users') {
        const q = String(url.searchParams.get('q') || '').trim(), off = Math.max(0, +url.searchParams.get('o') || 0);
        let list;
        if (sql) list = q ? await sql`select id, username, points, games, wins, created_at, last_seen, last_ip, last_device, banned_until, ban_reason, email from users where uname_key like ${'%' + keyOf(q) + '%'} or lower(username) like ${'%' + keyOf(q) + '%'} or id::text = ${q} or last_ip = ${q} or email ilike ${'%' + q + '%'} order by id desc limit 50 offset ${off}`
          : await sql`select id, username, points, games, wins, created_at, last_seen, last_ip, last_device, banned_until, ban_reason, email from users order by coalesce(last_seen, created_at) desc limit 50 offset ${off}`;
        else list = [...mem.users.values()].filter((u) => !q || u.uname_key.includes(keyOf(q)) || String(u.id) === q || u.last_ip === q).reverse().slice(off, off + 50).map((u) => ({ ...u, pass: undefined, photo: undefined }));
        return json({ list: list.map((u) => ({ ...u, online: clients.has(u.id), room: userRoom.get(u.id) || null })) });
      }
      const um = ap.match(/^user\/(\d+)$/);
      if (um) {
        const id = +um[1]; const u = await getUser(id); if (!u) return json({ error: 'اللاعب مو موجود' }, 404);
        if (req.method === 'POST') {
          const a = await body(req); let note = '';
          if (a.action === 'coins') { const d = Math.trunc(+a.delta || 0); if (!d) return json({ error: 'اكتب رقم' }, 400); await patchUser(id, { points: Math.max(0, u.points + d) }); note = `${d > 0 ? 'زدنا' : 'نقصنا'} ${Math.abs(d)} 🪙`; const c = clients.get(id); if (c) { send(c, { t: 'me', user: pub(await getUser(id), true) }); if (d > 0) send(c, { t: 'notice', msg: `🎁 وصلك ${d} 🪙 من الإدارة` }); } }
          else if (a.action === 'setcoins') { const v = Math.max(0, Math.trunc(+a.value || 0)); await patchUser(id, { points: v }); note = `الرصيد صار ${v}`; const c = clients.get(id); if (c) send(c, { t: 'me', user: pub(await getUser(id), true) }); }
          else if (a.action === 'password') { const v = String(a.value || ''); if (v.length < 4) return json({ error: 'كلمة السر ٤ أحرف عالأقل' }, 400); await patchUser(id, { pass: await Bun.password.hash(v) }); note = 'تغيّرت كلمة السر'; }
          else if (a.action === 'rename') { const n = String(a.value || '').trim().replace(/\s+/g, ' '); if (n.length < 2 || n.length > 20) return json({ error: 'الاسم من ٢ لـ٢٠ حرف' }, 400); const ex = await findUser(n); if (ex && ex.id !== id) return json({ error: 'الاسم مستخدم' }, 400); await patchUser(id, { username: n }); note = 'تغيّر الاسم'; }
          else if (a.action === 'ban') { const h = +a.hours || 0; const until = h > 0 ? new Date(Date.now() + h * 3600000) : new Date('2999-01-01'); await patchUser(id, { banned_until: until, ban_reason: String(a.reason || '').slice(0, 120) }); kickUser(id, `حسابك محظور ${h > 0 ? fmtUntil(until) : 'بشكل دائم'}${a.reason ? ' — السبب: ' + a.reason : ''}`); note = 'انحظر الحساب'; }
          else if (a.action === 'unban') { await patchUser(id, { banned_until: null, ban_reason: null }); note = 'انفك الحظر'; }
          else if (a.action === 'banip' || a.action === 'bandevice') { const kind = a.action === 'banip' ? 'ip' : 'device'; const v = kind === 'ip' ? u.last_ip : u.last_device; if (!v) return json({ error: 'ما عنا ' + (kind === 'ip' ? 'IP' : 'جهاز') + ' محفوظ لهاللاعب' }, 400); await addBan(kind, v, +a.hours || 0, String(a.reason || '').slice(0, 120)); kickUser(id, 'هالجهاز محظور'); note = kind === 'ip' ? 'انحظر الـIP' : 'انحظر الجهاز'; }
          else if (a.action === 'kick') { kickUser(id, 'الإدارة طلّعتك من الطاولة'); note = 'انطرد'; }
          else return json({ error: 'أمر غلط' }, 400);
          console.log('[admin]', ADM.username, a.action, 'user', id, note);
          return json({ ok: true, note, user: { ...(await getUser(id)), pass: undefined, photo: undefined } });
        }
        const pays = sql ? await sql`select * from payments where uid = ${id} order by created_at desc limit 20` : [];
        const games = sql ? await sql`select game, winners, players, finished_at from matches where players::text like ${'%"' + u.username + '"%'} order by id desc limit 15` : [];
        return json({ user: { ...u, pass: undefined, photo: undefined, online: clients.has(id), room: userRoom.get(id) || null }, payments: pays, games });
      }
      if (ap === 'bans') {
        if (req.method === 'POST') {
          const a = await body(req);
          if (a.action === 'del') { await delBan(+a.id); return json({ ok: true }); }
          const kind = a.kind === 'device' ? 'device' : 'ip', v = String(a.value || '').trim(); if (!v) return json({ error: 'اكتب القيمة' }, 400);
          await addBan(kind, v, +a.hours || 0, String(a.reason || '').slice(0, 120));
          for (const [uid, c] of clients) getUser(uid).then((u) => { if (u && ((kind === 'ip' && u.last_ip === v) || (kind === 'device' && u.last_device === v))) kickUser(uid, 'هالجهاز محظور'); });
          return json({ ok: true });
        }
        const users = sql ? await sql`select id, username, banned_until, ban_reason from users where banned_until > now() order by banned_until desc limit 100` : [...mem.users.values()].filter((u) => u.banned_until && new Date(u.banned_until) > new Date());
        return json({ bans: await listBans(), users });
      }
      if (ap === 'rooms') {
        if (req.method === 'POST') { const a = await body(req); const r = rooms.get(String(a.code || '')); if (!r) return json({ error: 'الطاولة مو موجودة' }, 404); for (const s of r.seats) if (s && s.uid) { const c = clients.get(s.uid); userRoom.delete(s.uid); if (c) send(c, { t: 'left', reason: 'الإدارة سكّرت الطاولة' }); } clearTimeout(r.timer); rooms.delete(r.code); lobbyDirty(); return json({ ok: true }); }
        return json({ list: [...rooms.values()].map((r) => ({ code: r.code, game: GAME_NAMES[r.game] || r.game, status: r.status, priv: r.priv, created: r.created, players: r.seats.map((s) => (s ? (s.bot ? '🤖 ' + s.name : s.name) : null)).filter(Boolean) })) });
      }
      if (ap === 'broadcast' && req.method === 'POST') { const { text = '' } = await body(req); const t = String(text).trim().slice(0, 200); if (!t) return json({ error: 'اكتب رسالة' }, 400); for (const c of clients.values()) send(c, { t: 'notice', msg: '📢 ' + t, big: true }); return json({ ok: true, sent: clients.size }); }
      return json({ error: 'not found' }, 404);
    }
    if (url.pathname === '/health') return new Response('ok');
    const origin = (req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')) + '://' + (req.headers.get('x-forwarded-host') || req.headers.get('host'));
    return new Response(html.replace('content="/img/og.png?v=3"', `content="${origin}/img/og.png?v=3"`).replace('<meta property="og:type"', `<meta property="og:url" content="${origin}/">\n<meta property="og:type"`), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
  },
  websocket: {
    idleTimeout: 120,
    sendPings: true,
    open(ws) {
      if (ws.data.ban) { send(ws, { t: 'banned', msg: ws.data.ban }); setTimeout(() => { try { ws.close(); } catch {} }, 300); return; }
      const uid = ws.data.uid;
      const old = clients.get(uid);
      if (old && old !== ws) { send(old, { t: 'left', reason: 'فتحت الحساب من جهاز ثاني' }); try { old.close(); } catch {} }
      clients.set(uid, ws);
      getUser(uid).then(async (u) => send(ws, { t: 'me', user: { ...pub(u, true), isAdmin: await isAdminPlayer(uid) } }));
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
      if (ws.data.ban) return;
      const uid = ws.data.uid;
      if (clients.get(uid) !== ws) return;
      clients.delete(uid);
      COMM.onClose(uid);
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
