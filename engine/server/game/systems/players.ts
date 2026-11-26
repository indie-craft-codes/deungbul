// 플레이어: 생성, 저장 값 주고받기(핵심), 그리고 고른 모듈의 몫: 나갈 때의 몸 상태와 처치 보상[combat], 성장(경험치와 두 번째 재화)[growth].
// 저장의 최상위 칸도 모듈마다다 (export): 핵심은 이름·마지막 시각·자리, 그 밖의 칸은 그 모듈을 고른 게임에만 적힌다.
import { CLASS_IDS, ECON_HUNT, POTION_CD, REJOIN_KEEP_S, classOf, skillDef, SKILL_SLOTS, SPAWN, START_WEAPON, isClassId, isItemId, maxHpFor, needFor, nextNeed, itemDef } from '../../../shared/defs';
import type { PlayerSave } from '../../store';
import { MODULE_SAVES, type ModuleId } from '../../../shared/modules';
import { resolve } from '../../../shared/sim';
import { clampInto } from '../../../shared/world';
import { clamp, type Ent } from '../entity';
import type { Game } from '../game';
import { isField } from '../layers';
import { Shop } from './shop';

/** 저장에서 읽는 레벨의 상한: 깨진 저장을 막는 틀의 상수다. 레벨에는 따로 상한이 없고, 이보다 높이 오르는 게임은 이 값을 올린다 */
const LV_READ_MAX = 999;

export class Players {
  /** 개발용: 접속 위치를 바꾼다 (부활 위치는 그대로: g.rules.respawn). */
  devSpawn: { x: number; z: number } | null = null;

  /** 저장에서 읽은 '나갈 때의 몸 상태'. spawn이 직업과 장비를 다 입힌 뒤에 되살린다 */
  private vitals: { at: number; hp: number; cds: number[]; icd: number; hurt: number } | null = null;

  constructor(private g: Game) {
    if (!g.has('combat')) return;
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
        // 길드 같은 보정으로 더 받는 경험치
        const extra = Math.round(def.exp * g.mods.sum('exp', p));
        const why = this.huntWhy(p, m), exp = def.exp + bonus + extra;
        // 재화가 없는 게임은 처치를 알리기만 한다
        const money = g.has('economy');
        const got = money ? g.wallet.add(p, 'gold', gold, why) : 0;
        // 안내문에는 실제로 받는 양을 넣는다 (배율이 걸려 있으면 그만큼 준다). 레벨 업 안내가 이 뒤에 오도록 경험치와 두 번째 재화는 안내문 다음에 준다
        g.notify(p, 'kill', m.type, money && g.has('growth') ? g.wallet.amount(p, 'exp', exp, why) : 0, money ? g.wallet.amount(p, 'sparks', sparks, why) : 0, got);
        if (money) this.grant(p, g.has('growth') ? exp : 0, sparks, why);
      }
    });
  }

  /** pid: 그 사람을 가리키는 저장 키 (손님과 봇은 빈 문자열) */
  spawn(name: string, bot: boolean, save: PlayerSave | null = null, pid = ''): Ent {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3;
    const at = (!bot && this.devSpawn) || SPAWN;
    const p = this.g.create('p', '', name, at.x + Math.cos(a) * r, at.z + Math.sin(a) * r, maxHpFor('', 1));
    const has = (m: ModuleId) => this.g.has(m);
    p.bot = bot; p.pid = bot ? '' : pid; p.wait = Math.random() * 3; p.dirty = true; p.metaDirty = true;
    if (has('combat')) p.cds = Array.from({ length: SKILL_SLOTS }, () => 0);
    if (has('items')) { p.weapon = START_WEAPON; p.armor = ''; }
    // 옛 버전의 저장은 먼저 지금의 모양으로 올린다 (../migrate.ts). 버전 칸이 없던 저장의 옛 최상위 칸도 여기서 ext로 옮겨진다(Saver.legacy)
    if (save) save = this.g.upgradePlayer(save);
    if (save) {
      // 저장된 값은 믿되, 깨진 값이 섞여 있어도 서버가 죽지 않게 범위를 잡는다
      const n = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), min, max) : def);
      // 다음 레벨까지의 필요 경험치는 저장된 값이 아니라 레벨에서 다시 구한다 (체력과 같다): 레벨 업이 쓰는 수열과 같은 함수라 어긋날 수 없다.
      // 전에는 저장 값을 상한 1e9로 잘라 읽어서, 필요 경험치가 그것을 넘는 레벨(57부터)에서 다시 접속하면 필요 경험치가 줄었다
      if (has('growth')) { p.lv = n(save.lv, 1, LV_READ_MAX, 1); p.need = needFor(p.lv); p.exp = n(save.exp, 0, p.need, 0); }
      // 시스템마다 저장해 둔 몫(장비, 우편, 일일 임무)을 읽는다. 깨진 값은 그 시스템이 걸러 낸다
      const ext = typeof save.ext === 'object' && save.ext !== null ? save.ext : {};
      // 이 게임이 고르지 않은 모듈의 칸은 읽은 그대로 남겨 두었다가 다시 적는다 (모듈을 껐다 켜도 이어지게)
      const off = (m: ModuleId | undefined) => !!m && !this.g.has(m);
      const whole = save as Readonly<Record<string, unknown>>;
      const top = Object.fromEntries(Object.keys(MODULE_SAVES.top).filter((k) => off(MODULE_SAVES.top[k]) && whole[k] !== undefined).map((k) => [k, whole[k]]));
      const keptExt = Object.fromEntries(Object.entries(ext).filter(([k, v]) => off(MODULE_SAVES.player[k]) && v !== undefined));
      if (Object.keys(top).length || Object.keys(keptExt).length) p.kept = { top, ext: keptExt };
      this.vitals = null;
      p.offMs = typeof save.seen === 'number' ? Math.max(0, this.g.now() - save.seen) : 0; // 칸을 읽는 시스템(휴식 보너스)이 쓰므로 먼저 구한다
      // 시스템마다 자기 칸을 읽는다 (옛 형식의 최상위 칸은 위의 이전이 이미 ext로 옮겼다)
      for (const s of this.g.saves) { try { const raw = ext[s.name]; if (raw !== undefined) s.load(p, raw); } catch { /* 읽지 못한 칸은 처음 상태로 둔다 */ } }
      // 체력은 저장된 값이 아니라 직업과 레벨로 다시 구한다
      if (has('classes')) this.g.classes.apply(p, isClassId(save.cls) ? save.cls : ''); else this.refresh(p);
      if (has('combat')) p.hp = p.maxHp;
      // 재화는 게임이 정한 상한(CURRENCIES의 max)까지 읽는다. 전에는 1e9로 박혀 있어, 상한이 더 큰 게임은 다시 접속할 때 재화가 잘렸다
      if (this.g.has('economy')) {
        p.sparks = n(save.sparks, 0, this.g.wallet.limit('sparks'), 0);
        p.gold = n(save.gold, 0, this.g.wallet.limit('gold'), 0);
      }
      if (this.g.has('items')) {
        if (isItemId(save.weapon) && itemDef(save.weapon).kind === 'weapon') p.weapon = save.weapon;
        if (isItemId(save.armor) && itemDef(save.armor).kind === 'armor') p.armor = save.armor;
        p.items = Shop.readItems(save.items);
      }
      if (has('away')) p.auto = save.auto === true;
      // 마지막으로 있던 자리에서 시작한다 (개발용 접속 위치가 정해져 있으면 그쪽이 먼저다)
      if (!this.devSpawn && Array.isArray(save.at) && Number.isFinite(save.at[0]) && Number.isFinite(save.at[1])) {
        p.x = save.at[0]; p.z = save.at[1]; clampInto(p); p.tx = p.x; p.tz = p.z;
        resolve(p, this.g.world.obstacles);
      }
    }
    // 낀 무기와 갑옷을 낱개 장비와 맞춘다 (처음 온 사람은 기본 무기를 장비로 받는다)
    if (this.g.has('gear')) this.g.gear.adopt(p);
    if (save) this.revive(p);
    // 봇은 직업을 섞는다
    if (bot) { if (has('classes') && CLASS_IDS.length) this.g.classes.apply(p, CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)]); if (has('combat')) p.hp = p.maxHp; this.g.channels.seat(p); } // 봇은 접속 사건이 없으므로 채널을 여기서 정한다
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
    const g = this.g, ext: Record<string, unknown> = {};
    for (const s of g.saves) ext[s.name] = s.save(p);
    // 시스템의 몫은 ext에만 적는다. 옛 최상위 칸은 읽기만 한다 (spawn의 이전이 Saver.legacy를 부른다): 칸을 옮긴 배포 한 번 동안 함께 적던 것은 껐다
    // 버전 칸(v, gv)을 적는다: 다음에 읽을 때 이 버전부터 올린다 (../migrate.ts)
    // 최상위 칸: 핵심은 ext·이름·시각·자리. 그 밖의 칸은 그 모듈을 고른 게임만 적는다 (칸의 차례는 예전 그대로: 모듈을 다 쓰는 게임의 저장 글자는 전과 같다)
    const out: PlayerSave = { ...g.saveVersion('player'), ext, name: p.name };
    if (g.has('growth')) { out.lv = p.lv; out.exp = p.exp; out.need = p.need; }
    if (g.has('combat')) out.maxHp = p.maxHp;
    if (g.has('economy')) out.sparks = p.sparks;
    out.seen = g.now();
    if (g.has('economy')) out.gold = p.gold;
    if (g.has('items')) { out.weapon = p.weapon; out.armor = p.armor; out.items = { ...p.items }; }
    if (g.has('classes')) out.cls = p.cls;
    out.at = [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10];
    if (g.has('away')) out.auto = p.auto;
    // 고르지 않은 모듈의 칸: 읽은 그대로 (spawn)
    if (p.kept) { Object.assign(out, p.kept.top); out.ext = { ...ext, ...p.kept.ext }; }
    return out;
  }

  rename(p: Ent, name: string): void { p.name = name; p.unsaved = true; if (this.g.has('rank')) this.g.rank.renamed(p); this.g.fire('playerRenamed', p); }

  /** 최대 체력을 다시 구한다: 직업과 레벨, 그리고 보정(장비). 장비를 바꾸거나 레벨이 오르면 부른다. 체력이 없는 게임(전투 모듈 없음)은 알릴 표시만 세운다 */
  refresh(p: Ent): void {
    const g = this.g;
    if (g.has('combat')) {
      p.maxHp = maxHpFor(p.cls, g.field(p, 'lv')) + Math.round(g.mods.sum('hp', p));
      p.hp = Math.min(p.hp, p.maxHp);
    }
    p.dirty = true;
  }

  /** 처치로 얻은 것의 원인 이름: 던전 인스턴스 안, 자리 비움 사냥 중, 접속 중. 지갑에 넘기는 이름과 장부가 처치의 앞뒤 차이(장비, 재료)에 붙이는 이름이 이것 하나다 */
  huntWhy(p: Ent, m: Ent): string { return !isField(m.layer) ? ECON_HUNT.inst : this.g.has('away') && this.g.away.active(p) ? ECON_HUNT.away : ECON_HUNT.live; }

  /**
   * 경험치와 두 번째 재화를 준다 (지갑을 거친다). 레벨이 오르면 체력이 늘고 가득 찬다.
   * why: 원인의 이름 (장부에 그 이름으로 적힌다. 이름의 체계는 systems/wallet.ts). 비워 두면 장부가 그때의 경계(명령, 사건)로 가려 적는다
   */
  grant(p: Ent, exp: number, sparks: number, why = ''): void {
    this.g.wallet.add(p, 'sparks', sparks, why); if (this.g.has('growth')) this.g.wallet.add(p, 'exp', exp, why);
    p.dirty = true; p.unsaved = true;
    this.levelUp(p); // 받은 경험치가 없어도 확인한다 (전과 같게: 저장에서 필요치를 꽉 채운 채 읽힌 캐릭터)
  }

  /** 경험치가 찼으면 레벨을 올린다. 경험치가 늘어난 뒤에 불린다 (지갑이 부른다) */
  levelUp(p: Ent): void {
    if (!this.g.has('growth')) return; // 레벨이 없는 게임
    while (p.exp >= p.need) {
      p.exp -= p.need; p.need = nextNeed(p.need); p.lv++; this.refresh(p); if (this.g.has('combat')) p.hp = p.maxHp;
      this.g.notify(p, 'levelUp', p.lv);
      p.metaDirty = true; // 찍을 능력치 점수가 생겼다
    }
  }
}
