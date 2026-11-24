// 플레이어: 생성, 저장 값 주고받기, 성장(경험치와 불씨).
import { CLASS_IDS, LEVEL, POTION_CD, REJOIN_KEEP_S, classOf, skillDef, SKILL_SLOTS, SPAWN, START_WEAPON, isClassId, isItemId, maxHpFor, nextNeed, itemDef } from '../../../shared/defs';
import type { PlayerSave } from '../../store';
import { resolve } from '../../../shared/sim';
import { clampInto } from '../../../shared/world';
import { clamp, type Ent } from '../entity';
import type { Game } from '../game';
import { Shop } from './shop';

/**
 * 호환: 다음 배포에서 뺀다 (false로 바꾸거나, 이 상수와 Saver.legacySave를 함께 지운다).
 * 게임의 칸(퀘스트, 기여, 기여 단계, 휴식)을 ext로 옮긴 배포 한 번 동안은 옛 최상위 칸에도 함께 적는다: 코드를 이전으로 되돌려도 진행이 남는다.
 * 옛 칸을 읽는 길(Saver.legacy)은 이것과 무관하게 계속 둔다.
 */
const WRITE_OLD_CELLS = true;

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
        // 덤으로 받는 경험치 (휴식 보너스 같은 것: 그 규칙을 가진 시스템이 killBonus에 등록한다)
        const bonus = g.killBonus.reduce((sum, fn) => sum + fn(p, m), 0);
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
    p.bot = bot; p.pid = bot ? '' : pid; p.wait = Math.random() * 3; p.cds = Array.from({ length: SKILL_SLOTS }, () => 0); p.dirty = true; p.metaDirty = true; p.weapon = START_WEAPON; p.armor = '';
    if (save) {
      // 저장된 값은 믿되, 깨진 값이 섞여 있어도 서버가 죽지 않게 범위를 잡는다
      const n = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), min, max) : def);
      p.lv = n(save.lv, 1, 999, 1); p.need = n(save.need, 1, 1e9, LEVEL.firstNeed); p.exp = n(save.exp, 0, p.need, 0);
      // 시스템마다 저장해 둔 몫(장비, 우편, 일일 임무)을 읽는다. 깨진 값은 그 시스템이 걸러 낸다
      const ext = typeof save.ext === 'object' && save.ext !== null ? save.ext : {};
      this.vitals = null;
      p.offMs = typeof save.seen === 'number' ? Math.max(0, this.g.now() - save.seen) : 0; // 칸을 읽는 시스템(휴식 보너스)이 쓰므로 먼저 구한다
      // 자기 칸이 없으면 옛 형식(최상위 칸)에서 자기 몫을 찾는다. 둘 다 있으면 새 칸이 이긴다
      for (const s of this.g.saves) { try { const raw = ext[s.name] !== undefined ? ext[s.name] : s.legacy?.(save); if (raw !== undefined) s.load(p, raw); } catch { /* 읽지 못한 칸은 처음 상태로 둔다 */ } }
      // 체력은 저장된 값이 아니라 직업과 레벨로 다시 구한다
      this.g.classes.apply(p, isClassId(save.cls) ? save.cls : '');
      p.hp = p.maxHp;
      p.sparks = n(save.sparks, 0, 1e9, 0);
      p.gold = n(save.gold, 0, 1e9, 0);
      if (isItemId(save.weapon) && itemDef(save.weapon).kind === 'weapon') p.weapon = save.weapon;
      if (isItemId(save.armor) && itemDef(save.armor).kind === 'armor') p.armor = save.armor;
      p.items = Shop.readItems(save.items);
      p.auto = save.auto === true;
      // 마지막으로 있던 자리에서 시작한다 (개발용 접속 위치가 정해져 있으면 그쪽이 먼저다)
      if (!this.devSpawn && Array.isArray(save.at) && Number.isFinite(save.at[0]) && Number.isFinite(save.at[1])) {
        p.x = save.at[0]; p.z = save.at[1]; clampInto(p); p.tx = p.x; p.tz = p.z;
        resolve(p, this.g.world.obstacles);
      }
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
    const out: PlayerSave = { ext, name: p.name, lv: p.lv, exp: p.exp, need: p.need, maxHp: p.maxHp, sparks: p.sparks, seen: this.g.now(), gold: p.gold, weapon: p.weapon, armor: p.armor, items: { ...p.items }, cls: p.cls, at: [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10], auto: p.auto };
    if (WRITE_OLD_CELLS) for (const s of this.g.saves) Object.assign(out, s.legacySave?.(p));
    return out;
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
      p.exp -= p.need; p.need = nextNeed(p.need); p.lv++; this.refresh(p); p.hp = p.maxHp;
      this.g.notify(p, 'levelUp', p.lv);
      p.metaDirty = true; // 찍을 능력치 점수가 생겼다
    }
  }
}
