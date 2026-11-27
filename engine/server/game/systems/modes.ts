// [modes] 게임 안의 모드: 한 캐릭터가 '두 게임'(들판의 MMORPG, 단계의 수집형)을 오간다. 규칙은 내용의 MODE_RULES (engine/shared/defs/modes.ts).
// 소유(영웅·재화·장비·변신)는 한 캐릭터의 것이라 저절로 하나다. 모드가 정하는 것은 그 사람이 서 있는 곳이다:
//   kind 'field'  들판 (모두가 오가는 채널의 층)
//   kind 'stage'  단계 (그 사람만의 층: 대기실 g.stages.lobby, 단계를 고르면 그 층에서 싸운다)
// 바꾸기는 싸우는 중에도 바로 된다 ({ t: 'mode', id }). 보고 있지 않은 쪽은 선택 칸에 따라 이어 간다:
//   fieldStay  들판을 떠날 때 자동 사냥이 켜져 있으면 대역(엔티티 종류 'stand')이 그 자리에 남아 사냥한다 (자리 비움 사냥과 같은 하루 한도·안전장치·판단).
//              대역의 처치 보상은 그 사람의 것이다(g.rules.bodyOn: 다른 층의 몸). 돌아오면 대역의 자리·체력을 이어받는다
//   stageStay  단계를 떠날 때 싸우는 중이면 회차가 뒤에서 이어 간다 (g.stages.detach: 영웅만으로 끝까지, 자동 진행이 켜져 있으면 다음 단계로)
// 다른 쪽의 상황은 개인 상태 'modeSide'(ModeSideMe), 위험(대역의 쓰러짐·물러남·멈춤, 단계의 멈춤)은 안내문으로 알린다 (화면이 '바로 가기'를 단다).
// 접속이 끊기면 들판의 대역은 그 사람 자신으로 돌아오고(자동 사냥이 켜져 있으면 틀의 자리 비움 사냥이 이어 간다), 뒤에서 잇던 회차는 닫힌다(단계의 오프라인 진행이 맡는다).
// 저장: 캐릭터의 ext 'mode' ({ id }: 처음 모드와 같으면 적지 않는다). 개인 상태 'mode'(ModeMe), 'modeSide'.
import { AUTO, AWAY, pickPotion, pickSkill, shouldRest } from '../../../shared/auto';
import { ATTACK_CD, COMBAT, ECON_HUNT, STAGE_RULES, classOf, isItemId, isSkillId, itemDef, MODE_RULE_VIEW, modeDef, modeList, POTION_CD, RESPAWN_S, skillDef, startMode, type FieldSide, type ModeDef, type ModeMe, type ModeSideMe, type SideGot, type StageSide } from '../../../shared/defs';
import { resolve } from '../../../shared/sim';
import { clampInto } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { isField } from '../layers';

const THINK_S = 0.3;
const ri = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const noGot = (): SideGot => ({ gold: 0, sparks: 0, exp: 0 });

/** 들판의 대역 하나 */
interface Stand { e: Ent; at: { x: number; z: number }; state: FieldSide['state']; got: SideGot; kills: number; resting: boolean }
/** 뒤에서 이어 가는 단계의 기록 */
interface StageLog { cleared: number; got: SideGot }

export class Modes {
  private readonly stands = new Map<number, Stand>();
  private readonly logs = new Map<number, StageLog>();
  private readonly fieldMode: ModeDef | undefined;
  private readonly stageMode: ModeDef | undefined;

  constructor(private g: Game) {
    const list = modeList();
    if (!list.length) console.warn('[modes] 모듈 modes를 골랐지만 내용의 MODE_RULES.list가 비어 있습니다: 모드가 없습니다');
    this.fieldMode = list.find((m) => m.kind === 'field');
    this.stageMode = list.find((m) => m.kind === 'stage');
    g.commands.set('mode', (p, m) => { if (typeof m.id === 'string') this.set(p, m.id); });
    g.saves.push({
      name: 'mode',
      save: (p) => (p.mode && p.mode !== startMode() ? { id: p.mode } : undefined),
      load: (p, raw) => { const id = (raw as { id?: unknown } | null)?.id; if (typeof id === 'string' && modeDef(id)) p.mode = id; },
    });
    g.personal.push({ name: 'mode', state: (p): ModeMe => ({ id: this.of(p), cd: Math.max(0, Math.ceil(p.modeCd - g.clock)) }) });
    g.personal.push({ name: 'modeSide', state: (p): ModeSideMe => this.side(p) });
    // 접속: 저장된 모드로 (들판에서 들어오므로 단계 모드면 대기실로). 끊김: 대역을 거둬 그 사람 자신이 그 자리에 선다
    g.on('playerJoined', (p) => { if (p.bot) return; p.mode = this.of(p); if (this.cur(p)?.kind === 'stage') this.enterStage(p); });
    g.on('playerDropped', (p) => {
      if (this.stands.has(p.id)) { this.collapse(p); if (this.fieldMode) p.mode = this.fieldMode.id; }
      this.logs.delete(p.id);
    });
    g.on('playerLeft', (id) => { const s = this.stands.get(id); if (s) { g.remove(s.e.id); this.stands.delete(id); } this.logs.delete(id); });

    // 들판의 대역: 사람 편의 종류 (몬스터가 노리고, 준 피해는 주인의 것)
    g.defineKind('stand', { tick: (e, dt) => this.think(e, dt) });
    g.combat.registerAlly('stand', {
      owner: (e) => this.ownerOf(e),
      down: (e) => this.down(e),
      skillScale: (e) => { const o = this.ownerOf(e); return o ? g.mods.product('damage', o) : 1; },
      guard: (e) => { const o = this.ownerOf(e); return o ? g.mods.product('guard', o) : 1; },
    });
    // 다른 층의 몸: 처치 보상이 몬스터 곁의 사람에게만 가는 규칙에서 대역·뒤에서 잇는 회차의 자리를 그 사람의 자리로 본다
    const prev = g.rules.bodyOn;
    g.rules.bodyOn = (p, layer) => {
      const s = this.stands.get(p.id);
      if (s && s.e.layer === layer) return s.e;
      const r = g.stages.runOf(p);
      if (r && r.bg && r.layer === layer) return { x: STAGE_RULES.arena.x, z: STAGE_RULES.arena.z };
      return prev?.(p, layer);
    };
    if (g.has('away')) g.away.proxied = (p) => this.stands.has(p.id);
    // 다른 쪽에서 얻은 것: 대역의 사냥(자리 비움 사냥의 원인), 뒤에서 잇는 단계(단계의 원인)
    if (g.has('economy')) g.wallet.seen.push((p, cur, d, why) => {
      if (d <= 0) return;
      const s = this.stands.get(p.id);
      if (s && why === ECON_HUNT.away) s.got[cur] += d;
      const l = this.logs.get(p.id);
      if (l && (why === 'stage' || why === ECON_HUNT.inst) && g.stages.runOf(p)?.bg) l.got[cur] += d;
    });
    g.on('stageCleared', (p) => { const l = this.logs.get(p.id); if (l && g.stages.runOf(p)?.bg) l.cleared++; });
    g.on('monsterKilled', (m, hitters) => { for (const p of hitters) { const s = this.stands.get(p.id); if (s && s.e.layer === m.layer) s.kills++; } });
    // 대역은 그 사람의 겉모습을 따른다 (단계에서 변신하거나 풀면 들판의 대역도)
    // 화면은 놓일 때의 겉모습으로 대역을 그리므로, 새 겉모습의 대역으로 바꿔 놓는다 (자리·체력·대상·쿨다운은 그대로)
    if (g.has('morph')) g.on('morphed', (p) => { const s = this.stands.get(p.id); if (s && (s.e.look ?? '') !== (p.look ?? '')) this.relook(p, s); });
    // 단계 명령을 모드에 맞춘다 (단계의 시스템이 명령을 등록한 뒤)
    g.ready.push(() => {
      this.wrapStage();
      // 사람이 없어 쉬는 층(몬스터가 싸움을 잊는다)이라도 대역이 사냥하는 층은 깨어 있다
      if (g.has('combat')) { const asleep = g.monsters.asleep; g.monsters.asleep = (layer) => asleep(layer) && ![...this.stands.values()].some((s) => s.e.layer === layer); }
    });
  }

  // ---------- 읽기 ----------
  /** 그 사람의 지금 모드 id (처음이면 처음 모드) */
  of(p: Ent): string { return p.mode && modeDef(p.mode) ? p.mode : startMode(); }
  cur(p: Ent): ModeDef | undefined { return modeDef(this.of(p)); }
  /** 들판의 대역 (없으면 undefined) */
  standOf(p: Ent): Ent | undefined { return this.stands.get(p.id)?.e; }

  private side(p: Ent): ModeSideMe {
    const s = this.stands.get(p.id), r = this.g.stages.runOf(p), l = this.logs.get(p.id);
    const field: FieldSide | null = s ? { hp: Math.ceil(Math.max(0, s.e.hp)), max: s.e.maxHp, state: s.state, got: { ...s.got }, kills: s.kills } : null;
    const stage: StageSide | null = r && r.bg ? { id: r.id, state: r.state, cleared: l?.cleared ?? 0, got: { ...(l?.got ?? noGot()) }, auto: p.stage.auto } : null;
    return { field, stage };
  }

  // ---------- 바꾸기 ----------
  /** 그 모드로 바꾼다 (싸우는 중에도). 대기(switchCdS) 안이면 modeWait. 바꿨으면 true */
  set(p: Ent, id: string): boolean {
    const g = this.g, to = modeDef(id), from = this.cur(p);
    if (!to || !from || to.id === from.id || p.bot || p.kind !== 'p') return false;
    if (g.clock < p.modeCd) { g.notify(p, 'modeWait', Math.ceil(p.modeCd - g.clock)); return false; }
    if (from.kind !== to.kind) {
      if (from.kind === 'stage') this.leaveStage(p); else this.leaveField(p);
      if (to.kind === 'stage') this.enterStage(p); else this.enterField(p);
    }
    p.mode = to.id;
    p.modeCd = g.clock + Math.max(0, MODE_RULE_VIEW.switchCdS ?? 1);
    p.unsaved = true;
    g.notify(p, 'modeOn', to.id);
    g.fire('modeChanged', p, to.id, from.id);
    return true;
  }

  /** 들판을 떠난다: 자동 사냥이 켜져 있으면 대역을 남긴다 (fieldStay) */
  private leaveField(p: Ent): void {
    const g = this.g;
    if (!MODE_RULE_VIEW.fieldStay || !g.has('away') || !p.auto || !isField(p.layer) || p.hp <= 0) return;
    if (p.cls === '' || g.field(p, 'lv') < AWAY.minLv || g.away.left(p) <= 0) return;
    const e = g.place('stand', { x: p.x, z: p.z, type: `${p.cls}|${g.field(p, 'weapon')}|${g.field(p, 'armor')}`, name: p.name, layer: p.layer, face: p.face, hp: p.maxHp });
    e.data.owner = p.id;
    e.hp = p.hp; e.maxHp = p.maxHp; e.targetId = p.targetId; e.cds = [...p.cds]; e.atkCd = 0; e.wait = 0;
    if (p.look) g.setLook(e, p.look);
    this.stands.set(p.id, { e, at: { x: p.x, z: p.z }, state: 'hunt', got: noGot(), kills: 0, resting: false });
    // 그 사람과 싸우던 몬스터는 대역과 싸운다 (사람이 층을 떠나 놓치고 집으로 돌아가며 다 회복하지 않게)
    for (const m of g.ents.values()) if (m.kind === 'm' && m.targetId === p.id) m.targetId = e.id;
    p.targetId = 0;
    g.notify(p, 'modeStandOn');
  }
  /** 대역을 그 사람의 지금 겉모습으로 다시 놓는다 */
  private relook(p: Ent, s: Stand): void {
    const g = this.g, old = s.e;
    const e = g.place('stand', { x: old.x, z: old.z, type: `${p.cls}|${g.field(p, 'weapon')}|${g.field(p, 'armor')}`, name: p.name, layer: old.layer, face: old.face, hp: old.maxHp });
    e.data.owner = p.id;
    e.hp = old.hp; e.maxHp = old.maxHp; e.targetId = old.targetId; e.cds = [...old.cds]; e.atkCd = old.atkCd; e.dead = old.dead; e.respawn = old.respawn; e.lastHurt = old.lastHurt;
    if (p.look) g.setLook(e, p.look);
    s.e = e;
    for (const m of g.ents.values()) if (m.kind === 'm' && m.targetId === old.id) m.targetId = e.id;
    g.remove(old.id);
  }
  /** 들판으로: 대역이 있으면 그 자리·체력을 이어받는다 (없으면 단계를 떠날 때 정한 자리에 이미 서 있다) */
  private enterField(p: Ent): void { this.collapse(p); }
  /** 대역을 거둔다: 그 사람이 대역의 자리·체력으로 (쓰러져 있었으면 일어나는 자리에서 가득) */
  private collapse(p: Ent): void {
    const g = this.g, s = this.stands.get(p.id);
    if (!s) return;
    this.stands.delete(p.id);
    const e = s.e, at = e.dead ? g.stages.fieldRespawn(p) : e;
    this.place(p, at.x, at.z, e.layer);
    if (g.has('combat')) {
      p.hp = e.dead ? p.maxHp : Math.max(1, Math.min(p.maxHp, Math.round(p.maxHp * (e.maxHp > 0 ? e.hp / e.maxHp : 1))));
      p.targetId = !e.dead && g.ents.get(e.targetId)?.kind === 'm' ? e.targetId : 0;
      for (const m of g.ents.values()) if (m.kind === 'm' && m.targetId === e.id) m.targetId = p.id;
    }
    g.remove(e.id);
  }
  /** 단계를 떠난다: 싸우는 중이면 회차가 뒤에서 이어 간다(stageStay), 아니면 닫는다. 그 사람은 들어오기 전의 들판 자리로 */
  private leaveStage(p: Ent): void {
    const g = this.g, r = g.stages.runOf(p);
    if (!r) return;
    const back = r.back;
    if (MODE_RULE_VIEW.stageStay && r.state !== 'lobby' && !r.bg) {
      g.stages.detach(p);
      this.logs.set(p.id, { cleared: 0, got: noGot() });
    } else g.stages.leave(p, false);
    if (g.stages.runOf(p)?.bg) {
      // 회차는 남았다: 사람만 들판으로 (대역이 있으면 enterField가 다시 옮긴다)
      const layer = isField(back.layer) ? back.layer : 0;
      this.place(p, back.x, back.z, layer);
      if (g.has('combat')) { p.targetId = 0; p.dead = false; if (p.hp <= 0) p.hp = p.maxHp; }
    }
  }
  /** 단계로: 뒤에서 잇던 회차가 있으면 그 싸움으로, 아니면 대기실 */
  private enterStage(p: Ent): void {
    const g = this.g;
    this.logs.delete(p.id);
    if (g.stages.attach(p)) return;
    if (!g.stages.runOf(p)) g.stages.lobby(p);
  }

  private place(p: Ent, x: number, z: number, layer: number): void {
    p.layer = layer; p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.path = null;
    clampInto(p); resolve(p, this.g.world.obstacles);
    this.g.emit(['r', p.id]);
  }

  /** 단계 명령을 모드에 맞춘다: 들판에서 단계를 고르면 단계 모드로 건너가고, 단계 모드의 '나가기'는 대기실로 */
  private wrapStage(): void {
    const g = this.g, inner = g.commands.get('stage');
    if (!inner || !this.stageMode) return;
    const stageId = this.stageMode.id;
    g.commands.set('stage', (p, m) => {
      const kind = this.cur(p)?.kind;
      if (kind === 'field') {
        if (m.a === 'start' || m.a === 'go') { if (!this.set(p, stageId)) return; if (m.a === 'start') { g.stages.start(p, g.stages.curIndex(p)); return; } }
        // 뒤에서 잇는 회차를 들판에서 멈춘다
        else if (m.a === 'leave') { g.stages.leave(p, false); this.logs.delete(p.id); return; }
      } else if (kind === 'stage') {
        if (m.a === 'leave') { g.stages.lobby(p); return; }
        if (m.a === 'start' && g.stages.inLobby(p)) { g.stages.start(p, g.stages.curIndex(p)); return; }
      }
      inner(p, m);
    });
  }

  // ---------- 들판의 대역 ----------
  private ownerOf(e: Ent): Ent | undefined { const o = this.g.ents.get(Number(e.data.owner ?? 0)); return o && o.kind === 'p' && this.stands.get(o.id)?.e === e ? o : undefined; }

  /** 대역이 쓰러졌다: 쉬었다가 일어나는 자리에서 일어난다. 안전장치(stopOnDeath)가 켜져 있으면 자동 사냥을 끝낸다 */
  private down(e: Ent): void {
    const g = this.g, o = this.ownerOf(e), s = o ? this.stands.get(o.id) : undefined;
    e.dead = true; e.moving = false; e.targetId = 0; e.dots = []; e.buffs = []; e.respawn = RESPAWN_S;
    g.emit(['d', e.id]);
    for (const m of g.ents.values()) if (m.targetId === e.id) m.targetId = 0;
    if (!o || !s) return;
    s.state = 'down';
    if (g.away.safetyOf(o)?.stopOnDeath) { o.auto = false; o.unsaved = true; }
    g.notify(o, 'modeStandDown');
  }

  /** 대역 하나의 틱: 자리 비움 사냥과 같은 판단(물약·쉬기·안전장치·가장 가까운 몬스터·기술)으로 싸운다. 힘은 그 사람의 것(보정·변신)이다 */
  private think(e: Ent, dt: number): void {
    const g = this.g, o = this.ownerOf(e);
    if (!o) { g.remove(e.id); return; }
    const s = this.stands.get(o.id)!, cls = classOf(o.cls);
    if (e.dead) {
      e.respawn -= dt;
      if (e.respawn > 0) return;
      const at = g.stages.fieldRespawn(o);
      e.dead = false; e.hp = e.maxHp; e.lastHurt = -99; e.x = at.x; e.z = at.z; e.tx = e.x; e.tz = e.z; e.moving = false; e.path = null;
      resolve(e, g.world.obstacles);
      g.emit(['r', e.id]);
      s.state = o.auto ? 'hunt' : 'stop';
      return;
    }
    // 체력: 그 사람의 최대 체력을 따른다 (변신·레벨이 바뀌면 비율을 지킨다)
    if (e.maxHp !== o.maxHp && o.maxHp > 0) { const ratio = e.hp / Math.max(1, e.maxHp); e.maxHp = o.maxHp; e.hp = Math.max(1, Math.round(e.maxHp * ratio)); g.emit(['mh', e.id, e.maxHp]); }
    if (e.atkCd > 0) e.atkCd -= dt;
    for (let i = 0; i < e.cds.length; i++) if (e.cds[i] > 0) e.cds[i] = Math.max(0, e.cds[i] - dt);
    if (e.hp < e.maxHp && g.clock - e.lastHurt > COMBAT.regenAfterS) e.hp = Math.min(e.maxHp, e.hp + COMBAT.regenPerS * dt);
    if (e.moving) g.movement.walk(e, g.rules.speed(o), dt);
    // 자동 사냥이 꺼졌다 (그 사람이 끔, 안전장치가 멈춤, 오늘의 시간을 다 씀): 그 자리에 선다
    if (!o.auto) { if (s.state === 'hunt' || s.state === 'resting') s.state = 'stop'; if (!e.moving) e.targetId = 0; return; }
    if (!g.away.spend(o, dt)) { o.auto = false; s.state = 'stop'; g.notify(o, 'modeStandEnd'); return; }
    e.wait -= dt;
    if (e.wait <= 0) {
      e.wait = THINK_S;
      if (this.decide(e, o, s)) return;
    }
    this.fight(e, o, cls);
  }

  /** 생각 한 번: 안전장치, 물약, 쉬기, 대상 고르기, 기술. 멈췄으면 true */
  private decide(e: Ent, o: Ent, s: Stand): boolean {
    const g = this.g, ratio = e.hp / Math.max(1, e.maxHp), items = g.field(o, 'items');
    const drink = (id: string) => {
      if (!isItemId(id) || o.itemCd > 0 || !g.bag.count(o, id)) return;
      const amount = Math.round(Math.min(itemDef(id).heal ?? 0, e.maxHp - e.hp));
      if (amount <= 0) return;
      g.bag.takeItem(o, id, 1, 'use');
      e.hp += amount; o.itemCd = POTION_CD;
      g.emit(['heal', e.id, amount]);
    };
    if (g.away.safety) {
      const done = g.away.guard(o, e, drink, g.stages.fieldRespawn(o));
      if (done === 'retreat') { s.state = 'retreat'; return true; }
      if (done === 'stop') { s.state = 'stop'; return true; }
      if (done === 'potion') return false;
    } else { const id = o.itemCd <= 0 ? pickPotion(ratio, items) : null; if (id) drink(id); }
    s.resting = shouldRest(ratio, items, s.resting);
    s.state = s.resting ? 'resting' : 'hunt';
    let t = g.ents.get(e.targetId);
    if (s.resting && t && dist(e, t) > AUTO.restGuard) { t = undefined; e.targetId = 0; }
    if (!t || t.dead || t.kind !== 'm' || t.layer !== e.layer) {
      t = undefined; e.targetId = 0;
      let nd = s.resting ? AUTO.restGuard : AUTO.seek;
      for (const m of g.monstersIn(e.layer)) {
        if (m.kind !== 'm' || m.dead || m.homing || m.layer !== e.layer || dist(s.at, m) > AWAY.roam) continue;
        if (m.def?.boss && m.targetId !== e.id) continue; // 필드 보스는 스스로 고르지 않는다 (자리 비움 사냥과 같다)
        const d = dist(e, m);
        if (d < nd) { nd = d; t = m; }
      }
      if (t) e.targetId = t.id;
      else if (!e.moving && dist(e, s.at) > 4) g.movement.goTo(e, s.at.x, s.at.z);
    }
    // 기술: 자리 비움 사냥과 같은 고르기 (그 사람의 직업, 대역의 쿨다운)
    const skills = classOf(o.cls).skills, d = t ? dist(e, t) : Infinity;
    const n = pickSkill(o.cls, ratio, d, (i) => (e.cds[i] ?? 0) <= 0);
    if (n >= 0 && isSkillId(skills[n])) {
      const id = skills[n], sd = skillDef(id);
      if (sd.range === undefined || (t && d <= sd.range)) {
        g.emit(['s', e.id, id, t?.id ?? 0]);
        g.combat.cast(e, id, t);
        e.cds[n] = sd.cd;
      }
    }
    return false;
  }

  /** 대상에게 다가가 기본 공격 (그 사람의 직업의 사거리·기본 공격, 주는 피해의 보정: 장비·변신) */
  private fight(e: Ent, o: Ent, cls: ReturnType<typeof classOf>): void {
    const g = this.g, t = g.ents.get(e.targetId);
    if (!t || t.dead || t.kind !== 'm' || t.layer !== e.layer) return;
    const d = dist(e, t);
    if (d > cls.range) { if (!e.moving || Math.hypot(e.tx - t.x, e.tz - t.z) > 1.5) g.movement.goTo(e, t.x, t.z); return; }
    e.moving = false;
    e.face = Math.atan2(t.x - e.x, t.z - e.z);
    if (e.atkCd > 0) return;
    e.atkCd = ATTACK_CD;
    const crit = Math.random() < COMBAT.critChance + g.mods.sum('crit', o);
    const hit = ri(cls.basic[0], cls.basic[1]) * g.mods.product('damage', o);
    g.combat.damage(e, t, Math.max(1, Math.round(crit ? hit * COMBAT.critMult : hit)), crit);
  }
}
