// 플레이어: 생성, 저장 값 주고받기, 성장(경험치와 불씨).
import { CLASS_IDS, ITEMS, POTION_CD, QUESTS, REJOIN_KEEP_S, REST, classOf, skillDef, SKILL_SLOTS, SPAWN, START_WEAPON, goalCount, isClassId, isItemId, maxHpFor, restGain } from '../../../shared/defs';
import type { PlayerSave } from '../../store';
import { resolve } from '../../../shared/sim';
import { clampInto } from '../../../shared/world';
import { clamp, type Ent } from '../entity';
import type { Game } from '../game';
import { Shop } from './shop';

export class Players {
  /** 개발용: 접속 위치를 바꾼다 (부활 위치는 그대로 등탑 앞). */
  devSpawn: { x: number; z: number } | null = null;

  /** 저장에서 읽은 '나갈 때의 몸 상태'. spawn이 직업과 장비를 다 입힌 뒤에 되살린다 */
  private vitals: { at: number; hp: number; cds: number[]; icd: number; hurt: number } | null = null;

  constructor(private g: Game) {
    // 나갈 때의 몸 상태: 체력(비율), 기술 쿨다운, 물약 대기, 마지막으로 맞은 뒤 지난 시간. 예전 저장에는 이 칸이 없고, 그러면 가득 찬 채로 시작한다
    const sec = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    g.saves.push({
      name: 'vitals',
      save: (p) => ({ at: g.now(), hp: Math.round((p.hp / p.maxHp) * 1000) / 1000, cds: p.cds.map((v) => Math.round(v * 10) / 10), icd: Math.round(Math.max(0, p.itemCd) * 10) / 10, hurt: Math.round(Math.min(1e6, g.clock - p.lastHurt)) }),
      load: (_p, raw) => {
        if (typeof raw !== 'object' || raw === null) return;
        const d = raw as Record<string, unknown>;
        if (typeof d.at !== 'number' || !Number.isFinite(d.at)) return;
        this.vitals = { at: d.at, hp: typeof d.hp === 'number' && d.hp > 0 && d.hp <= 1 ? d.hp : 1, cds: Array.isArray(d.cds) ? d.cds.map(sec) : [], icd: sec(d.icd), hurt: sec(d.hurt) };
      },
    });
    // 처치 보상: 피해를 준 사람 각자가 받는다
    g.on('monsterKilled', (m, hitters) => {
      const def = m.def;
      if (!def) return;
      for (const p of hitters) {
        const roll = (r: readonly [number, number]) => r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1));
        const sparks = (def.sparks ? roll(def.sparks) : 0) + g.mods.sum('sparkBonus', p), gold = roll(def.gold);
        // 휴식 보너스가 남아 있으면 그만큼 경험치를 더 받는다 (최대 2배)
        const bonus = Math.min(def.exp, p.rested);
        p.rested -= bonus;
        p.gold += gold;
        g.notify(p, 'kill', m.type, def.exp + bonus + Math.round(def.exp * g.mods.sum('exp', p)), sparks, gold);
        // 길드 같은 보정으로 더 받는 경험치
        const extra = Math.round(def.exp * g.mods.sum('exp', p));
        this.grant(p, def.exp + bonus + extra, sparks);
      }
    });
  }

  /** pid: 그 사람을 가리키는 저장 키 (손님과 봇은 빈 문자열) */
  spawn(name: string, bot: boolean, save: PlayerSave | null = null, pid = ''): Ent {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3;
    const at = (!bot && this.devSpawn) || SPAWN;
    const p = this.g.create('p', '', name, at.x + Math.cos(a) * r, at.z + Math.sin(a) * r, maxHpFor('', 1));
    p.bot = bot; p.pid = bot ? '' : pid; p.wait = Math.random() * 3; p.cds = Array.from({ length: SKILL_SLOTS }, () => 0); p.dirty = true; p.questDirty = true; p.metaDirty = true; p.weapon = START_WEAPON; p.armor = '';
    if (save) {
      // 저장된 값은 믿되, 깨진 값이 섞여 있어도 서버가 죽지 않게 범위를 잡는다
      const n = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), min, max) : def);
      p.lv = n(save.lv, 1, 999, 1); p.need = n(save.need, 1, 1e9, 60); p.exp = n(save.exp, 0, p.need, 0);
      // 시스템마다 저장해 둔 몫(장비, 우편, 일일 임무)을 읽는다. 깨진 값은 그 시스템이 걸러 낸다
      const ext = typeof save.ext === 'object' && save.ext !== null ? save.ext : {};
      this.vitals = null;
      for (const s of this.g.saves) if (ext[s.name] !== undefined) { try { s.load(p, ext[s.name]); } catch { /* 읽지 못한 칸은 처음 상태로 둔다 */ } }
      p.offMs = typeof save.seen === 'number' ? Math.max(0, this.g.now() - save.seen) : 0;
      // 체력은 저장된 값이 아니라 직업과 레벨로 다시 구한다
      this.g.classes.apply(p, isClassId(save.cls) ? save.cls : '');
      p.hp = p.maxHp;
      p.sparks = n(save.sparks, 0, 1e9, 0); p.contrib = n(save.contrib, 0, 1e9, 0);
      p.gold = n(save.gold, 0, 1e9, 0);
      p.tier = n(save.tier, 0, 99, 0);
      if (isItemId(save.weapon) && ITEMS[save.weapon].kind === 'weapon') p.weapon = save.weapon;
      if (isItemId(save.armor) && ITEMS[save.armor].kind === 'armor') p.armor = save.armor;
      p.items = Shop.readItems(save.items);
      p.auto = save.auto === true;
      // 마지막으로 있던 자리에서 시작한다 (개발용 접속 위치가 정해져 있으면 그쪽이 먼저다)
      if (!this.devSpawn && Array.isArray(save.at) && Number.isFinite(save.at[0]) && Number.isFinite(save.at[1])) {
        p.x = save.at[0]; p.z = save.at[1]; clampInto(p); p.tx = p.x; p.tz = p.z;
        resolve(p, this.g.world.obstacles);
      }
      // 등불 맡기기: 쉰 시간만큼 휴식 보너스가 쌓인다
      const gain = typeof save.seen === 'number' ? restGain(this.g.now() - save.seen) : 0;
      p.rested = Math.min(REST.cap, n(save.rested, 0, REST.cap, 0) + gain);
      if (gain > 0) this.g.notify(p, 'rested', p.rested);
      // 퀘스트 진행: 내용이 바뀌어 없는 단계를 가리키면 그 장의 처음으로 돌린다
      const q = Array.isArray(save.quest) ? save.quest : [0, 0, 0];
      p.qc = n(q[0], 0, QUESTS.length, 0);
      const steps = QUESTS[p.qc]?.steps;
      p.qs = steps ? n(q[1], 0, steps.length - 1, 0) : 0;
      p.qn = steps ? n(q[2], 0, goalCount(steps[p.qs].goal) - 1, 0) : 0;
    }
    // 낀 무기와 갑옷을 낱개 장비와 맞춘다 (처음 온 사람은 기본 무기를 장비로 받는다)
    this.g.gear.adopt(p);
    if (save) this.revive(p);
    // 봇은 직업을 섞는다
    if (bot) { this.g.classes.apply(p, CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)]); p.hp = p.maxHp; this.g.channels.seat(p); } // 봇은 접속 사건이 없으므로 채널을 여기서 정한다
    else this.g.fire('playerJoined', p);
    return p;
  }

  /**
   * 방금 나갔다 온 사람은 나갈 때의 몸 상태로 시작한다: 재접속 한 번으로 체력이 차고 쿨다운과 물약 대기가 풀리면, 싸우다 끊고 붙는 것이 가장 좋은 회복이 된다.
   * 쿨다운과 물약 대기는 떠나 있던 시간만큼 줄여 준다(접속해 있었어도 흘렀을 시간). 체력은 그대로 두고, 맞은 지 오래됐으면 들어오자마자 평소처럼 회복된다.
   * REJOIN_KEEP_S 넘게 떠나 있었으면 쉬다 온 것이므로 가득 찬 채로 시작한다. 저장된 시각이 앞날이면(시계가 바뀜) 믿지 않는다.
   */
  private revive(p: Ent): void {
    const g = this.g, v = this.vitals;
    this.vitals = null;
    if (!v) return;
    const gone = (g.now() - v.at) / 1000;
    if (!(gone >= 0 && gone < REJOIN_KEEP_S)) return;
    p.hp = Math.max(1, Math.min(p.maxHp, v.hp * p.maxHp));
    p.lastHurt = g.clock - (v.hurt + gone);
    const skills = classOf(p.cls).skills;
    for (let i = 0; i < p.cds.length; i++) {
      p.cds[i] = clamp((v.cds[i] ?? 0) - gone, 0, skillDef(skills[i]).cd);
      if (p.cds[i] > 0) g.cdAcks.push({ id: p.id, n: i, ms: Math.round(p.cds[i] * 1000) }); // 화면의 기술 단추도 남은 시간을 보여 주게
    }
    p.itemCd = clamp(v.icd - gone, 0, POTION_CD);
    if (p.itemCd > 0) g.itemCds.push({ id: p.id, ms: Math.round(p.itemCd * 1000) });
  }

  leave(id: number): void {
    this.g.remove(id);
    this.g.fire('playerLeft', id);
  }

  export(p: Ent): PlayerSave {
    const ext: Record<string, unknown> = {};
    for (const s of this.g.saves) ext[s.name] = s.save(p);
    return { ext, name: p.name, lv: p.lv, exp: p.exp, need: p.need, maxHp: p.maxHp, sparks: p.sparks, contrib: p.contrib, seen: this.g.now(), quest: [p.qc, p.qs, p.qn], gold: p.gold, weapon: p.weapon, armor: p.armor, items: { ...p.items }, rested: p.rested, cls: p.cls, tier: p.tier, at: [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10], auto: p.auto };
  }

  rename(p: Ent, name: string): void { p.name = name; p.unsaved = true; this.g.rank.renamed(p); this.g.fire('playerRenamed', p); }

  /** 최대 체력을 다시 구한다: 직업과 레벨, 그리고 보정(장비). 장비를 바꾸거나 레벨이 오르면 부른다 */
  refresh(p: Ent): void {
    p.maxHp = maxHpFor(p.cls, p.lv) + Math.round(this.g.mods.sum('hp', p));
    p.hp = Math.min(p.hp, p.maxHp);
    p.dirty = true;
  }

  /** 경험치와 불씨를 준다. 레벨이 오르면 체력이 늘고 가득 찬다. */
  grant(p: Ent, exp: number, sparks: number): void {
    p.exp += exp; p.sparks += sparks; p.dirty = true; p.unsaved = true;
    while (p.exp >= p.need) {
      p.exp -= p.need; p.need = Math.round(p.need * 1.35); p.lv++; this.refresh(p); p.hp = p.maxHp;
      this.g.notify(p, 'levelUp', p.lv);
      p.metaDirty = true; // 찍을 능력치 점수가 생겼다
    }
  }
}
