// Community: public/private text channels, DMs, and voice rooms (WebRTC mesh signalling).
export function makeCommunity({ sql, clients, send, getUser, frGet, isAdminPlayer }) {
  const chans = new Map(); // id -> {id,name,kind,priv,owner,members:[],icon,last_at,last}
  const memMsgs = new Map(); let memMsgId = 1, memChId = 1;
  const vc = new Map(); // ch -> Map(uid -> {id,name,av,ph,mute})
  const userVc = new Map(); // uid -> ch
  const lastSend = new Map();
  const SEEDS = [['text', '🌍 الساحة العامة'], ['text', '🃏 تركس وطرنيب'], ['text', '🔴 جاكارو ولودو'], ['text', '🤝 دوّر على لاعبين'], ['text', '😂 سوالف وضحك'],
    ['voice', '☕ القهوة'], ['voice', '🎧 جلسة الديوانية'], ['voice', '🎮 قبل الجيم']];

  async function init() {
    if (sql) {
      await sql`create table if not exists channels (id serial primary key, name text not null, kind text not null, priv boolean not null default false, owner int, members jsonb not null default '[]', created_at timestamptz not null default now(), last_at timestamptz not null default now())`;
      await sql`create table if not exists cmsgs (id serial primary key, ch int not null, uid int not null, name text not null, av text, ph bigint not null default 0, text text not null, at timestamptz not null default now())`;
      await sql`create index if not exists cmsgs_ch on cmsgs (ch, id desc)`;
      let rows = await sql`select * from channels`;
      if (!rows.some((r) => r.owner == null)) { for (const [k, n] of SEEDS) await sql`insert into channels (name, kind) values (${n}, ${k})`; rows = await sql`select * from channels`; }
      for (const r of rows) chans.set(r.id, { ...r, members: r.members || [], last: null });
      const lasts = await sql`select distinct on (ch) ch, name, text, at from cmsgs order by ch, id desc`;
      for (const l of lasts) { const c = chans.get(l.ch); if (c) c.last = { name: l.name, text: l.text, at: l.at }; }
    } else for (const [k, n] of SEEDS) { const id = memChId++; chans.set(id, { id, name: n, kind: k, priv: false, owner: null, members: [], last_at: new Date(), last: null }); }
  }
  const canSee = (c, uid) => c && (!c.priv && c.kind !== 'dm' || c.owner === uid || c.members.includes(uid));
  const audience = (c) => (!c.priv && c.kind !== 'dm' ? [...clients.keys()] : [...new Set([c.owner, ...c.members])].filter((x) => x != null));
  const pushAll = (c, msg) => { for (const u of audience(c)) { const w = clients.get(u); if (w) send(w, msg); } };
  async function saveMembers(c) { if (sql) await sql`update channels set members = ${JSON.stringify(c.members)}::jsonb where id = ${c.id}`; }
  async function newChan(f) {
    if (sql) { const r = (await sql`insert into channels (name, kind, priv, owner, members) values (${f.name}, ${f.kind}, ${f.priv}, ${f.owner}, ${JSON.stringify(f.members)}::jsonb) returning *`)[0]; const c = { ...r, members: r.members || [], last: null }; chans.set(c.id, c); return c; }
    const c = { id: memChId++, ...f, last_at: new Date(), last: null }; chans.set(c.id, c); return c;
  }
  async function delChan(c) { chans.delete(c.id); if (sql) { await sql`delete from channels where id = ${c.id}`; await sql`delete from cmsgs where ch = ${c.id}`; } else memMsgs.delete(c.id); }
  const vcUsers = (ch) => [...(vc.get(ch) || new Map()).values()];
  function vcBroadcast(ch) { const c = chans.get(ch); if (c) pushAll(c, { t: 'vcs', ch, users: vcUsers(ch) }); }
  function vcLeave(uid) {
    const ch = userVc.get(uid); if (ch == null) return; userVc.delete(uid);
    const m = vc.get(ch); if (m) { m.delete(uid); if (!m.size) vc.delete(ch); for (const u of m.keys()) send(clients.get(u), { t: 'vcbye', ch, uid }); }
    vcBroadcast(ch);
  }
  async function dmName(c, uid) { const o = c.members.find((x) => x !== uid); const u = o && (await getUser(o)); return u ? { name: u.username, other: { id: u.id, av: u.avatar || null, ph: +u.ph || 0 } } : { name: 'محادثة' }; }
  async function list(uid) {
    const out = [];
    for (const c of chans.values()) if (canSee(c, uid)) {
      const o = { id: c.id, name: c.name, kind: c.kind, priv: !!c.priv, mine: c.owner === uid, members: c.members.length + (c.owner != null && !c.members.includes(c.owner) ? 1 : 0), last: c.last, at: c.last ? c.last.at : c.last_at, voice: c.kind === 'voice' ? vcUsers(c.id) : undefined, seed: c.owner == null };
      if (c.kind === 'dm') Object.assign(o, await dmName(c, uid));
      out.push(o);
    }
    return out;
  }
  async function history(ch, before) {
    if (sql) return (before ? await sql`select * from cmsgs where ch = ${ch} and id < ${before} order by id desc limit 60` : await sql`select * from cmsgs where ch = ${ch} order by id desc limit 60`).reverse().map((m) => ({ id: m.id, uid: m.uid, name: m.name, av: m.av, ph: +m.ph || 0, text: m.text, at: m.at }));
    return (memMsgs.get(ch) || []).filter((m) => !before || m.id < before).slice(-60);
  }

  async function api(a, me) {
    const uid = me.id;
    if (!a || !a.action) return { channels: await list(uid) };
    const c = a.ch != null ? chans.get(+a.ch) : null;
    switch (a.action) {
      case 'history': if (!canSee(c, uid)) throw new Error('ما عندك صلاحية'); return { msgs: await history(c.id, +a.before || 0) };
      case 'create': {
        const name = String(a.name || '').trim().replace(/\s+/g, ' ').slice(0, 30); if (name.length < 2) throw new Error('اكتب اسم للغرفة (حرفين على الأقل)');
        const kind = a.kind === 'voice' ? 'voice' : 'text', priv = !!a.priv;
        const mine = [...chans.values()].filter((x) => x.owner === uid && x.kind !== 'dm');
        if (mine.length >= 10) throw new Error('عندك ١٠ غرف — احذف وحدة لتفتح جديدة');
        if (!priv && mine.filter((x) => !x.priv).length >= 2) throw new Error('تقدر تفتح غرفتين عامّتين فقط — جرّب خاصة');
        const members = [];
        for (const id of (Array.isArray(a.invite) ? a.invite : []).slice(0, 30)) { const f = await frGet(uid, +id); if (f && f.status === 'accepted') members.push(+id); }
        const c2 = await newChan({ name, kind, priv, owner: uid, members: [uid, ...members] });
        for (const m of members) { const w = clients.get(m); if (w) { send(w, { t: 'cchans' }); send(w, { t: 'notice', msg: `📨 ${me.username} ضافك على غرفة «${name}»` }); } }
        if (!priv) for (const w of clients.values()) send(w, { t: 'cchans' });
        return { ok: true, id: c2.id };
      }
      case 'dm': {
        const o = +a.uid; const f = await frGet(uid, o); if (!f || f.status !== 'accepted') throw new Error('المحادثة الخاصة مع الأصدقاء فقط');
        let d = [...chans.values()].find((x) => x.kind === 'dm' && x.members.includes(uid) && x.members.includes(o));
        if (!d) { d = await newChan({ name: '', kind: 'dm', priv: true, owner: null, members: [uid, o] }); send(clients.get(o), { t: 'cchans' }); }
        return { ok: true, id: d.id };
      }
      case 'invite': {
        if (!c || !c.priv || c.kind === 'dm' || !canSee(c, uid)) throw new Error('ما فيك تدعي هنا');
        const o = +a.uid; const f = await frGet(uid, o); if (!f || f.status !== 'accepted') throw new Error('تقدر تضيف أصدقاءك فقط');
        if (!c.members.includes(o)) { c.members.push(o); await saveMembers(c); }
        const w = clients.get(o); if (w) { send(w, { t: 'cchans' }); send(w, { t: 'notice', msg: `📨 ${me.username} ضافك على «${c.name}»` }); }
        return { ok: true };
      }
      case 'members': {
        if (!canSee(c, uid)) throw new Error('ما عندك صلاحية');
        const ids = [...new Set([c.owner, ...c.members])].filter((x) => x != null); const out = [];
        for (const id of ids) { const u = await getUser(id); if (u) out.push({ id, username: u.username, av: u.avatar || null, ph: +u.ph || 0, online: clients.has(id), owner: id === c.owner }); }
        return { members: out };
      }
      case 'kick': {
        if (!c || c.owner !== uid) throw new Error('فقط صاحب الغرفة'); const o = +a.uid; c.members = c.members.filter((x) => x !== o); await saveMembers(c);
        if (userVc.get(o) === c.id) { vcLeave(o); send(clients.get(o), { t: 'vcend' }); } send(clients.get(o), { t: 'cchans' }); return { ok: true };
      }
      case 'leave': {
        if (!c || !c.priv) throw new Error('هي غرفة عامة');
        c.members = c.members.filter((x) => x !== uid);
        if (c.owner === uid) c.owner = c.members[0] ?? null;
        if (!c.members.length) await delChan(c); else { if (sql) await sql`update channels set owner = ${c.owner} where id = ${c.id}`; await saveMembers(c); }
        vcLeave(uid); return { ok: true };
      }
      case 'del': {
        if (!c) throw new Error('غير موجودة');
        const admin = await isAdminPlayer(uid);
        if (c.owner !== uid && !admin) throw new Error('فقط صاحب الغرفة يقدر يحذفها');
        const aud = audience(c); for (const u of vc.get(c.id)?.keys() || []) { userVc.delete(u); send(clients.get(u), { t: 'vcend' }); } vc.delete(c.id);
        await delChan(c); for (const u of aud) send(clients.get(u), { t: 'cchans' }); return { ok: true };
      }
    }
    throw new Error('طلب غلط');
  }

  async function ws(w, m, me) {
    const uid = me.uid;
    switch (m.t) {
      case 'cmsg': {
        const c = chans.get(+m.ch); if (!canSee(c, uid)) throw new Error('ما عندك صلاحية');
        if (c.kind === 'dm') { const o = c.members.find((x) => x !== uid); const f = await frGet(uid, o); if (!f || f.status !== 'accepted') throw new Error('يجب تكونوا أصدقاء'); }
        const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 400); if (!text) return true;
        const now = Date.now(); if (now - (lastSend.get(uid) || 0) < 700) throw new Error('قليلاً قليلاً 😅'); lastSend.set(uid, now);
        let msg = { uid, name: me.name, av: me.av || null, ph: me.ph || 0, text, at: new Date() };
        if (sql) { const r = (await sql`insert into cmsgs (ch, uid, name, av, ph, text) values (${c.id}, ${uid}, ${msg.name}, ${msg.av}, ${msg.ph}, ${text}) returning id`)[0]; msg.id = r.id; await sql`update channels set last_at = now() where id = ${c.id}`; }
        else { msg.id = memMsgId++; const l = memMsgs.get(c.id) || []; l.push(msg); if (l.length > 300) l.shift(); memMsgs.set(c.id, l); }
        c.last = { name: msg.name, text, at: msg.at }; pushAll(c, { t: 'cmsg', ch: c.id, m: msg });
        return true;
      }
      case 'cdel': {
        const c = chans.get(+m.ch); if (!canSee(c, uid)) return true;
        let ok = c.owner === uid || (await isAdminPlayer(uid));
        if (sql) { const r = (await sql`select uid from cmsgs where id = ${+m.id} and ch = ${c.id}`)[0]; if (!r) return true; ok ||= r.uid === uid; if (ok) await sql`delete from cmsgs where id = ${+m.id}`; }
        else { const l = memMsgs.get(c.id) || []; const i = l.findIndex((x) => x.id === +m.id); if (i < 0) return true; ok ||= l[i].uid === uid; if (ok) l.splice(i, 1); }
        if (ok) pushAll(c, { t: 'cdel', ch: c.id, id: +m.id }); return true;
      }
      case 'vcjoin': {
        const c = chans.get(+m.ch); if (!c || c.kind !== 'voice' || !canSee(c, uid)) throw new Error('ما فيك تفوت هالغرفة');
        if (userVc.get(uid) === c.id) return true; vcLeave(uid);
        const room = vc.get(c.id) || new Map(); if (room.size >= 12) throw new Error('الغرفة مليانة (١٢ شخص)');
        room.set(uid, { id: uid, name: me.name, av: me.av || null, ph: me.ph || 0, mute: false }); vc.set(c.id, room); userVc.set(uid, c.id);
        send(w, { t: 'vcin', ch: c.id, peers: [...room.keys()].filter((x) => x !== uid) }); vcBroadcast(c.id); return true;
      }
      case 'vcleave': vcLeave(uid); return true;
      case 'vcmute': { const ch = userVc.get(uid); const u = ch != null && vc.get(ch)?.get(uid); if (u) { u.mute = !!m.m; vcBroadcast(ch); } return true; }
      case 'vcrtc': { const ch = userVc.get(uid); if (ch != null && userVc.get(+m.to) === ch) send(clients.get(+m.to), { t: 'vcrtc', from: uid, data: m.data }); return true; }
    }
    return false;
  }
  return { init, api, ws, onClose: vcLeave };
}
