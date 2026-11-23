// 파티: 초대와 수락, 탈퇴, 파티원끼리의 보상 나눔, 파티원 상태 알림.
// 파티는 접속해 있는 동안만 이어진다 (저장하지 않는다).
import { PARTY } from '../../../shared/defs';
import type { PartyMember } from '../../../shared/protocol';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

interface Group { id: number; members: number[] }

export class Party {
  private groups = new Map<number, Group>();
  /** 플레이어 id → 속한 파티 */
  private of = new Map<number, Group>();
  /** 받은 초대: 받은 사람 id → 보낸 사람 id와 만료 시각(게임 시계) */
  private invites = new Map<number, { from: number; until: number }>();
  /** 나간 사람의 이름을 알리려고 기억해 둔다 */
  private names = new Map<number, string>();
  private nextId = 1;
  private t = 0;

  constructor(private g: Game) {
    g.ticks.push((dt) => this.tick(dt));
    g.commands.set('party', (p, m) => {
      if (m.a === 'invite' && typeof m.id === 'number') this.invite(p, m.id);
      else if (m.a === 'accept') this.accept(p);
      else if (m.a === 'decline') this.decline(p);
      else if (m.a === 'leave') this.leave(p.id);
    });
    g.on('playerLeft', (id) => { this.invites.delete(id); this.leave(id); });
  }

  /** 그 사람의 파티원 id들 (자신 포함). 파티가 없으면 빈 배열 */
  membersOf(id: number): readonly number[] { return this.of.get(id)?.members ?? []; }

  private invite(p: Ent, id: number): void {
    const g = this.g, t = g.ents.get(id);
    if (!t || t.kind !== 'p' || t === p || t.layer !== p.layer || dist(p, t) > PARTY.inviteRange) return; // 층(채널)이 다르면 보이지 않는 상대다
    const mine = this.of.get(p.id);
    if (mine && mine.members.length >= PARTY.max) { g.notify(p, 'partyFull'); return; }
    const pending = this.invites.get(t.id);
    // 봇, 이미 파티가 있는 사람, 다른 초대를 받고 있는 사람은 초대할 수 없다
    if (t.bot || this.of.has(t.id) || (pending && pending.until > g.clock && pending.from !== p.id)) { g.notify(p, 'partyBusy', t.name); return; }
    this.invites.set(t.id, { from: p.id, until: g.clock + PARTY.inviteS });
    g.notify(p, 'partyInvited', t.name);
    g.partyOut.push({ id: t.id, msg: { t: 'pinv', id: p.id, name: p.name, s: PARTY.inviteS } });
  }

  private accept(p: Ent): void {
    const g = this.g, inv = this.invites.get(p.id);
    this.invites.delete(p.id);
    const from = inv && inv.until > g.clock ? g.ents.get(inv.from) : undefined;
    if (!from || this.of.has(p.id)) { g.notify(p, 'partyGone'); return; }
    let group = this.of.get(from.id);
    if (group && group.members.length >= PARTY.max) { g.notify(p, 'partyFull'); return; }
    if (!group) {
      group = { id: this.nextId++, members: [from.id] };
      this.groups.set(group.id, group);
      this.of.set(from.id, group);
    }
    group.members.push(p.id);
    this.of.set(p.id, group);
    for (const m of this.ents(group)) g.notify(m, 'partyJoined', p.name);
    this.sync(group);
  }

  private decline(p: Ent): void {
    const inv = this.invites.get(p.id);
    this.invites.delete(p.id);
    const from = inv && this.g.ents.get(inv.from);
    if (from) this.g.notify(from, 'partyDeclined', p.name);
  }

  /** 파티에서 나간다 (접속이 끊겨도 불린다). 혼자 남으면 파티가 풀린다. */
  private leave(id: number): void {
    const g = this.g, group = this.of.get(id);
    if (!group) return;
    const name = g.ents.get(id)?.name ?? this.names.get(id) ?? '';
    group.members = group.members.filter((m) => m !== id);
    this.of.delete(id); this.names.delete(id);
    const me = g.ents.get(id);
    if (me) { g.notify(me, 'partyYouLeft'); g.partyOut.push({ id, msg: { t: 'party', m: [] } }); }
    const rest = this.ents(group);
    for (const m of rest) g.notify(m, 'partyLeft', name);
    if (group.members.length < 2) {
      for (const m of rest) { g.notify(m, 'partyEnded'); g.partyOut.push({ id: m.id, msg: { t: 'party', m: [] } }); }
      for (const m of group.members) { this.of.delete(m); this.names.delete(m); }
      this.groups.delete(group.id);
    } else this.sync(group);
  }

  private ents(group: Group): Ent[] {
    const out: Ent[] = [];
    for (const id of group.members) { const e = this.g.ents.get(id); if (e) out.push(e); }
    return out;
  }

  /** 같은 파티의 다른 사람들 (파티가 없으면 빈 목록) */
  mates(p: Ent): Ent[] { const group = this.of.get(p.id); return group ? this.ents(group).filter((e) => e !== p) : []; }

  /** 다시 접속한 사람에게 파티 상태를 다시 보낸다. */
  resend(id: number): void { const group = this.of.get(id); if (group) this.sync(group); }

  /** 파티원 모두에게 서로의 상태를 보낸다. */
  private sync(group: Group): void {
    const list = this.ents(group);
    const m: PartyMember[] = list.map((e) => ({ id: e.id, name: e.name, lv: e.lv, cls: e.cls, hp: Math.ceil(e.hp), maxHp: e.maxHp, x: Math.round(e.x), z: Math.round(e.z), ch: this.g.channels.of(e) }));
    for (const e of list) { this.names.set(e.id, e.name); this.g.partyOut.push({ id: e.id, msg: { t: 'party', m } }); }
  }

  /**
   * 몬스터를 잡은 사람들에, 곁에 있던 그들의 파티원을 더한다.
   * 보상과 퀘스트 진행은 이 목록의 모두가 받는다.
   */
  share(hitters: Ent[], at: { x: number; z: number; layer: number }): Ent[] {
    if (!this.groups.size) return hitters;
    const out = new Set(hitters);
    for (const h of hitters) {
      for (const id of this.membersOf(h.id)) {
        const e = this.g.ents.get(id);
        // 같은 자리여도 층(채널, 인스턴스)이 다르면 곁에 있는 것이 아니다
        if (e && e.layer === at.layer && dist(e, at) <= PARTY.shareRange) out.add(e);
      }
    }
    return [...out];
  }

  tick(dt: number): void {
    this.t += dt;
    if (this.t < PARTY.syncS) return;
    this.t = 0;
    for (const group of this.groups.values()) this.sync(group);
  }
}
