// 길드: 만들고, 초대하고, 함께 대화하고, 골드를 기부해 길드를 키운다. 길드 레벨만큼 길드원의 경험치가 늘어난다.
// 길드원은 접속해 있지 않아도 길드에 남으므로, 사람을 엔티티 번호가 아니라 저장 키(Ent.pid)로 가리킨다.
// 손님(저장 키가 없는 접속)은 가입할 수 없다. 규칙의 수치는 games/deungbul/shared/content/social.ts의 GUILD에 있다.
import { GUILD, PARTY, guildLevel, type GuildMember, type GuildView } from '../../../shared/defs';
import { CHAT_MAX, NAME_MAX } from '../../../shared/world';
import { isClean, mask, tidy } from '../../text';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { WHY } from './wallet';

interface Member { pid: string; name: string; lv: number; cls: string; gave: number }
interface GuildRec { id: number; name: string; leader: string; exp: number; notice: string; members: Member[] }

// 눈에 보이지 않는 글자도 지운다: 보이기에 같은 이름의 길드를 만들지 못하게
const text = (v: unknown, max: number): string => (typeof v === 'string' ? tidy(v.replace(/[\u0000-\u001f\u007f]/g, '')).trim().slice(0, max) : '');

export class Guild {
  private guilds = new Map<number, GuildRec>();
  /** 저장 키 → 길드 */
  private of = new Map<string, GuildRec>();
  /** 받은 초대: 초대받은 사람의 엔티티 번호 → 길드와 초대한 사람 */
  private invites = new Map<number, { guild: number; from: string; until: number; pair: string }>();
  /** 다시 초대할 수 있는 시각(게임 시계): '초대한 사람>받은 사람'(저장 키)별 */
  private again = new Map<string, number>();
  private nextId = 1;
  private lastChat = new Map<number, number>();
  private lastNotice = new Map<number, number>();

  constructor(private g: Game) {
    g.commands.set('guild', (p, m) => {
      switch (m.a) {
        case 'create': this.create(p, text(m.name, GUILD.nameMax)); break;
        case 'invite': if (typeof m.id === 'number') this.invite(p, m.id); break;
        case 'accept': this.accept(p); break;
        case 'decline': { const inv = this.invites.get(p.id); if (inv) this.again.set(inv.pair, g.clock + GUILD.reinviteS); this.invites.delete(p.id); this.tell(p); break; }
        case 'leave': this.leave(p); break;
        case 'kick': if (typeof m.pid === 'string') this.kick(p, m.pid); break;
        case 'give': if (typeof m.n === 'number') this.give(p, m.n); break;
        case 'notice': this.notice(p, text(m.text, GUILD.noticeMax)); break;
      }
    });
    g.commands.set('gchat', (p, m) => this.chat(p, text(m.text, CHAT_MAX)));

    g.on('playerJoined', (p) => { p.guild = this.nameOf(p); this.touch(p); this.tell(p); const rec = this.of.get(p.pid); if (rec) this.sync(rec); });
    g.on('playerLeft', (id) => { this.invites.delete(id); this.lastChat.delete(id); });
    g.ticks.push(() => { for (const [k, until] of this.again) if (until <= g.clock) this.again.delete(k); for (const [id, inv] of this.invites) if (inv.until < g.clock) { this.invites.delete(id); const p = g.ents.get(id); if (p) this.tell(p); } });
    // 길드 레벨만큼 경험치를 더 받는다
    g.mods.provide('exp', (p) => { const rec = p && this.of.get(p.pid); return rec ? this.level(rec) * GUILD.expPerLevel : 0; });
    g.worldSaves.push({ name: 'guilds', save: () => ({ next: this.nextId, list: [...this.guilds.values()] }), load: (d) => this.load(d) });
  }

  private load(data: unknown): void {
    // 칸 전체가 깨져 있으면(null, 숫자) 처음 상태로 둔다. 길드 하나가 깨져 있으면 그 길드만 건너뛴다
    if (typeof data !== 'object' || data === null) return;
    const d = data as { next?: unknown; list?: unknown };
    if (!Array.isArray(d.list)) return;
    const count = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    for (const raw of d.list as GuildRec[]) {
      // 번호가 정수가 아니면(NaN, 소수) 다음 번호까지 깨진다
      if (typeof raw !== 'object' || raw === null || !Number.isInteger(raw.id) || raw.id < 1 || this.guilds.has(raw.id) || typeof raw.name !== 'string' || !Array.isArray(raw.members) || !raw.members.length) continue;
      const members = raw.members.filter((m) => typeof m === 'object' && m !== null && typeof m.pid === 'string' && m.pid && typeof m.name === 'string' && !this.of.has(m.pid)).slice(0, GUILD.maxMembers)
        .map((m): Member => ({ pid: m.pid, name: m.name.slice(0, NAME_MAX), lv: count(m.lv, 999) || 1, cls: typeof m.cls === 'string' ? m.cls : '', gave: count(m.gave, 1e12) }));
      if (!members.length) continue;
      const rec: GuildRec = { id: raw.id, name: raw.name.slice(0, GUILD.nameMax), leader: members.some((m) => m.pid === raw.leader) ? raw.leader : members[0].pid, exp: count(raw.exp, 1e12), notice: typeof raw.notice === 'string' ? raw.notice.slice(0, GUILD.noticeMax) : '', members };
      this.guilds.set(rec.id, rec);
      for (const m of members) this.of.set(m.pid, rec);
      this.nextId = Math.max(this.nextId, rec.id + 1);
    }
    if (Number.isInteger(d.next) && (d.next as number) > 0) this.nextId = Math.max(this.nextId, d.next as number);
  }

  /** 길드 레벨: 쌓인 기부로 정한다 */
  level(rec: GuildRec): number { return guildLevel(rec.exp); }
  /** 그 사람의 길드 이름 (없으면 빈 문자열). 이름표에 쓴다 */
  nameOf(p: Ent): string { return (p.pid && this.of.get(p.pid)?.name) || ''; }

  private online(rec: GuildRec): Ent[] {
    const out: Ent[] = [];
    for (const e of this.g.ents.values()) if (e.kind === 'p' && e.pid && this.of.get(e.pid) === rec) out.push(e);
    return out;
  }

  /** 접속한 길드원의 이름·레벨·직업을 명단에 맞춘다 */
  private touch(p: Ent): void {
    const m = p.pid ? this.of.get(p.pid)?.members.find((x) => x.pid === p.pid) : undefined;
    if (m) { m.name = p.name; m.lv = this.g.field(p, 'lv'); m.cls = this.g.field(p, 'cls'); }
  }

  private view(rec: GuildRec, me: Ent): GuildView {
    const on = new Set(this.online(rec).map((e) => e.pid));
    const members: GuildMember[] = rec.members.map((m) => ({ pid: m.pid === me.pid || rec.leader === me.pid ? m.pid : '', name: m.name, lv: m.lv, cls: m.cls, gave: m.gave, leader: m.pid === rec.leader, on: on.has(m.pid), me: m.pid === me.pid }));
    return { name: rec.name, lv: this.level(rec), exp: rec.exp % GUILD.expPerGuildLevel, need: GUILD.expPerGuildLevel, max: this.level(rec) >= GUILD.maxLevel, notice: rec.notice, leader: rec.leader === me.pid, members };
  }

  /** 한 사람에게 자기 길드(또는 받은 초대)를 알린다 */
  private tell(p: Ent): void {
    const rec = p.pid ? this.of.get(p.pid) : undefined, inv = this.invites.get(p.id);
    const from = inv ? this.guilds.get(inv.guild) : undefined;
    this.g.out.push({ id: p.id, msg: { t: 'guild', g: rec ? this.view(rec, p) : null, invite: !rec && inv && from ? { name: from.name, from: inv.from } : undefined } });
  }
  /** 길드원 모두에게 다시 알린다 */
  private sync(rec: GuildRec): void {
    for (const e of this.online(rec)) { this.touch(e); this.tell(e); }
    this.g.saveDirty = true;
  }
  /** 이름표의 길드 이름이 바뀌었다 */
  private tag(p: Ent): void { p.guild = this.nameOf(p); this.g.casts.push({ t: 'gtag', id: p.id, g: p.guild }); }

  create(p: Ent, name: string): void {
    const g = this.g;
    if (!p.pid) { g.notify(p, 'guildGuest'); return; }
    if (this.of.has(p.pid)) return;
    if (g.field(p, 'lv') < GUILD.createLv) { g.notify(p, 'guildNeedLv', GUILD.createLv); return; }
    if ([...name].length < GUILD.nameMin || !isClean(name)) { g.notify(p, 'guildNameBad'); return; }
    if ([...this.guilds.values()].some((x) => x.name.toLowerCase() === name.toLowerCase())) { g.notify(p, 'guildNameTaken'); return; }
    if (!g.wallet.take(p, 'gold', GUILD.createGold, WHY.guildCreate)) { g.notify(p, 'noGold'); return; }
    p.dirty = true; p.unsaved = true;
    const rec: GuildRec = { id: this.nextId++, name, leader: p.pid, exp: 0, notice: '', members: [{ pid: p.pid, name: p.name, lv: g.field(p, 'lv'), cls: g.field(p, 'cls'), gave: 0 }] };
    this.guilds.set(rec.id, rec);
    this.of.set(p.pid, rec);
    this.invites.delete(p.id);
    g.notify(p, 'guildCreated', name);
    this.tag(p);
    this.sync(rec);
  }

  invite(p: Ent, id: number): void {
    const g = this.g, rec = this.of.get(p.pid), t = g.ents.get(id);
    if (!rec || !t || t.kind !== 'p' || t.bot || t === p) return;
    if (rec.leader !== p.pid) { g.notify(p, 'guildNotLeader'); return; }
    // 파티 초대처럼 같은 층의 가까운 사람만 초대한다: 엔티티 번호만 알면 보이지도 않는 사람에게 초대 창을 띄울 수 있었다
    if (t.layer !== p.layer || dist(p, t) > PARTY.inviteRange) return;
    if (!t.pid || this.of.has(t.pid)) { g.notify(p, 'guildBusy', t.name); return; }
    if (rec.members.length >= GUILD.maxMembers) { g.notify(p, 'guildFull'); return; }
    // 살아 있는 초대가 있으면 덮어쓰지 않는다: 초대 창 도배와, 비슷한 이름의 길드로 초대를 바꿔치기하는 것을 막는다
    const old = this.invites.get(t.id);
    if (old && old.until > g.clock) { if (old.guild !== rec.id) g.notify(p, 'guildBusy', t.name); return; }
    // 거절당했거나 받지 않은 채 사라진 초대는 한동안 다시 보내지 못한다: 되풀이해 초대하면 다른 길드의 초대가 들어올 자리를 붙들게 된다
    const pair = `${p.pid}>${t.pid}`;
    if ((this.again.get(pair) ?? -Infinity) > g.clock) { g.notify(p, 'guildBusy', t.name); return; }
    this.invites.set(t.id, { guild: rec.id, from: p.name, until: g.clock + GUILD.inviteS, pair });
    this.again.set(pair, g.clock + GUILD.inviteS + GUILD.reinviteS); // 받지 않고 두면 초대가 사라진 뒤부터 센다
    g.notify(p, 'guildInvited', t.name);
    this.tell(t);
  }

  accept(p: Ent): void {
    const g = this.g, inv = this.invites.get(p.id), rec = inv && this.guilds.get(inv.guild);
    this.invites.delete(p.id);
    if (inv) this.again.delete(inv.pair); // 받아들인 사이에는 간격을 두지 않는다
    if (!rec || !p.pid || this.of.has(p.pid) || inv!.until < g.clock) { this.tell(p); return; }
    if (rec.members.length >= GUILD.maxMembers) { g.notify(p, 'guildFull'); this.tell(p); return; }
    rec.members.push({ pid: p.pid, name: p.name, lv: this.g.field(p, 'lv'), cls: this.g.field(p, 'cls'), gave: 0 });
    this.of.set(p.pid, rec);
    for (const e of this.online(rec)) g.notify(e, 'guildJoined', p.name);
    this.tag(p);
    this.sync(rec);
  }

  /** 길드에서 뺀다. 마지막 사람이 나가면 길드가 사라지고, 길드장이 나가면 가장 많이 기부한 사람이 잇는다 */
  private remove(rec: GuildRec, pid: string): void {
    rec.members = rec.members.filter((m) => m.pid !== pid);
    this.of.delete(pid);
    const gone = [...this.g.ents.values()].find((e) => e.kind === 'p' && e.pid === pid);
    if (gone) { this.tag(gone); this.tell(gone); }
    if (!rec.members.length) { this.guilds.delete(rec.id); this.g.saveDirty = true; return; }
    if (rec.leader === pid) rec.leader = [...rec.members].sort((a, b) => b.gave - a.gave)[0].pid;
    this.sync(rec);
  }

  leave(p: Ent): void {
    const rec = this.of.get(p.pid);
    if (!rec) return;
    for (const e of this.online(rec)) this.g.notify(e, e === p ? 'guildYouLeft' : 'guildLeft', p.name);
    this.remove(rec, p.pid);
  }

  kick(p: Ent, pid: string): void {
    const rec = this.of.get(p.pid), m = rec?.members.find((x) => x.pid === pid);
    if (!rec || !m || pid === p.pid) return;
    if (rec.leader !== p.pid) { this.g.notify(p, 'guildNotLeader'); return; }
    for (const e of this.online(rec)) this.g.notify(e, e.pid === pid ? 'guildKicked' : 'guildLeft', m.name);
    this.remove(rec, pid);
  }

  /** 골드를 기부한다: 길드 경험치가 그만큼 오른다 */
  give(p: Ent, n: number): void {
    const g = this.g, rec = this.of.get(p.pid);
    n = Math.floor(n);
    if (!rec || !(n > 0)) return;
    if (!g.wallet.take(p, 'gold', n, WHY.guildGive)) { g.notify(p, 'noGold'); return; }
    const before = this.level(rec);
    p.dirty = true; p.unsaved = true;
    rec.exp += n;
    const m = rec.members.find((x) => x.pid === p.pid);
    if (m) m.gave += n;
    g.notify(p, 'guildGave', n);
    if (this.level(rec) > before) for (const e of this.online(rec)) g.notify(e, 'guildLevelUp', this.level(rec));
    this.sync(rec);
  }

  notice(p: Ent, s: string): void {
    const rec = this.of.get(p.pid);
    if (!rec) return;
    if (rec.leader !== p.pid) { this.g.notify(p, 'guildNotLeader'); return; }
    // 공지는 올릴 때마다 월드를 저장하므로 간격을 둔다
    if (this.g.clock - (this.lastNotice.get(rec.id) ?? -99) < GUILD.noticeGapS) return;
    this.lastNotice.set(rec.id, this.g.clock);
    rec.notice = mask(s);
    this.sync(rec);
  }

  chat(p: Ent, s: string): void {
    const g = this.g, rec = this.of.get(p.pid);
    if (!s) return;
    if (!rec) { g.notify(p, 'guildNone'); return; }
    if (g.clock - (this.lastChat.get(p.id) ?? -99) < GUILD.chatGapS) return;
    this.lastChat.set(p.id, g.clock);
    const msg = { t: 'chat' as const, id: p.id, name: p.name, text: mask(s), ch: 'g' as const };
    for (const e of this.online(rec)) g.out.push({ id: e.id, msg });
  }

  /** 길드의 수 (시험과 지표용) */
  get count(): number { return this.guilds.size; }
}
