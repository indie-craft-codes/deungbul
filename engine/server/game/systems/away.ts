// 자리 비움 자동 사냥: 자동 사냥을 켠 채 접속이 끊기면(창을 닫음, 폰 화면이 꺼짐) 캐릭터가 월드에 남아 계속 사냥한다.
// 다시 접속하면 그 캐릭터를 그대로 이어받는다. 판단은 클라이언트의 자동 사냥(engine/client/auto.ts)과 같고,
// 사람이 누른 것과 같은 명령(g.command)만 내므로 전투 규칙은 그대로다.
import { AUTO, AWAY, pickPotion, pickSkill, restSpot, safetyStep, shouldRest, tidySafety, type AwaySafety } from '../../../shared/auto';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

const ROAM = AWAY.roam; // 자리를 비운 곳에서 이보다 먼 몬스터는 쫓지 않는다
const THINK_S = 0.3;
/**
 * 자리를 비운 채 사냥을 이어 가는 시간의 하루 한도(초). 다 쓰면 저장하고 월드에서 나가고, 그날은 끊겨도 캐릭터가 남지 않는다.
 * 한 번 비울 때마다가 아니라 하루(자정 기준, 일일 임무와 같은 날짜)에 쓴 시간을 모아서 센다:
 * 한 번마다 세면 잠깐 다시 접속하는 것만으로 처음부터 다시 세어 끝없이 이어진다. 쓴 시간은 캐릭터와 함께 저장한다(Ent.away).
 */
export const AWAY_MAX_S = AWAY.maxS; // 값은 engine/shared/auto.ts에 있다 (화면과 도감이 같은 수를 쓴다)

/** lost, salv, dust: 그동안 가방이 가득 차 버려진 장비, 자동 분해한 장비, 그것으로 얻은 가루 */
interface Stay { x: number; z: number; at: number; sparks: number; gold: number; lv: number; lost: number; salv: number; dust: number }

export class Away {
  /**
   * 안전장치의 기본값 (게임의 규칙 플러그인이 정한다. null(기본)이면 안전장치가 없다: 예전과 같다). 사람마다 명령 autoSafe로 바꾼다 (shared/auto.ts의 AwaySafety).
   * 자리 비움 사냥과 모드(modes)의 들판 대역이 쓴다 (사람이 보고 있지 않은 사냥)
   */
  safety: AwaySafety | null = null;
  /** 다른 시스템이 대신 사냥하는 사람인가 (모드의 들판 대역: 지표가 자리 비움 사냥으로 가려 적는다) */
  proxied: (p: Ent) => boolean = () => false;
  private stays = new Map<number, Stay>();
  /** 사람마다 바꾼 안전장치 (저장 칸 'autosafe') */
  private safe = new WeakMap<Ent, Partial<AwaySafety>>();
  /** 물약이 없어 쉬는 중인 플레이어 (AUTO.restAt ~ restUntil) */
  private resting = new Set<number>();

  constructor(private g: Game) {
    // 클라이언트가 자동 사냥을 켜고 끌 때마다 알려 준다
    g.commands.set('auto', (p, m) => {
      const on = m.on === true;
      // 오늘 자리 비움 사냥 시간을 다 썼으면 켤 때 알린다: 창을 닫으면 멈춘다는 것을 모르고 끄고 나갔다가 멈춰 있었다
      if (on && !p.auto && p.cls !== '' && g.field(p, 'lv') >= AWAY.minLv && this.left(p) <= 0) g.notify(p, 'awayLimit', AWAY_MAX_S / 3600);
      p.auto = on;
    });
    g.on('playerLeft', (id) => { this.stays.delete(id); this.resting.delete(id); });
    // 안전장치: 사람마다 바꾸기 (게임이 기본값을 켰을 때만), 저장, 쓰러지면 끝내기
    g.commands.set('autoSafe', (p, m) => {
      if (!this.safety) return;
      this.safe.set(p, tidySafety({ potionAt: m.potion as number, retreatAt: m.retreat as number, stopNoPotion: m.noPotion as boolean, stopOnDeath: m.death as boolean }, this.safetyOf(p) ?? this.safety));
      p.unsaved = true;
    });
    // 저장 칸: 사람이 바꾼 안전장치가 있을 때만 적는다 (켜지 않은 게임의 저장은 예전과 같다)
    g.saves.push({
      name: 'autosafe',
      save: (p) => { const s = this.safe.get(p); return s ? { ...s } : undefined; },
      load: (p, raw) => { if (typeof raw === 'object' && raw !== null) this.safe.set(p, raw as Partial<AwaySafety>); },
    });
    // 개인 상태·사건은 게임이 안전장치를 켰을 때만 (켜지 않은 게임의 줄 위는 예전과 같다). 기본값은 플러그인이 정하므로 ready에서 본다
    g.ready.push(() => {
      if (!this.safety) return;
      g.personal.push({ name: 'autosafe', state: (p) => this.safetyOf(p) });
      g.on('playerDied', (p) => {
        const s = this.safetyOf(p);
        if (s?.stopOnDeath && this.active(p)) { p.auto = false; p.unsaved = true; g.notify(p, 'autoDied'); }
      });
    });
    g.saves.push({
      name: 'away',
      save: (p) => ({ day: p.away.day, used: Math.round(p.away.used) }),
      load: (p, raw) => {
        if (typeof raw !== 'object' || raw === null) return;
        const d = raw as { day?: unknown; used?: unknown };
        if (typeof d.day !== 'string' || typeof d.used !== 'number' || !Number.isFinite(d.used)) return;
        p.away = { day: d.day.slice(0, 10), used: Math.max(0, Math.min(AWAY_MAX_S, d.used)) };
      },
    });
  }

  /** 그 사람의 안전장치 (게임이 켜지 않았으면 null) */
  safetyOf(p: Ent): AwaySafety | null { return this.safety ? tidySafety(this.safe.get(p), this.safety) : null; }

  /**
   * 안전장치의 한 판단을 몸(body: 사람 자신이거나 대역)에 낸다: 물약은 그 사람의 가방에서, 물러남은 쓰러지는 자리 쪽으로 걸어가 멈춤.
   * 멈추면(물러남·물약 없음) 그 사람의 자동 사냥을 끄고 안내문(autoRetreat·autoNoPotion)을 보낸다. 무엇을 했는지 돌려준다 (안 했으면 null)
   */
  guard(p: Ent, body: Ent, drink: (id: string) => void, home: { x: number; z: number } = this.g.rules.respawn(p)): 'potion' | 'retreat' | 'stop' | null {
    const s = this.safetyOf(p), g = this.g;
    if (!s || body.hp <= 0 || body.maxHp <= 0) return null;
    const r = safetyStep(body.hp / body.maxHp, g.field(p, 'items'), s, p.itemCd <= 0);
    if (!r) return null;
    if (r.do === 'potion') { drink(r.id); return 'potion'; }
    p.auto = false; p.unsaved = true;
    body.targetId = 0;
    if (r.do === 'retreat') { g.movement.goTo(body, home.x, home.z); g.notify(p, 'autoRetreat', Math.round((body.hp / body.maxHp) * 100)); }
    else g.notify(p, 'autoNoPotion');
    return r.do;
  }

  /** 대신 사냥하는 시간을 쓴다 (자리 비움 사냥과 같은 하루 한도). 다 썼으면 false */
  spend(p: Ent, dt: number): boolean {
    if (this.left(p) <= 0) return false;
    if (Math.floor((p.away.used + dt) / 60) !== Math.floor(p.away.used / 60)) p.unsaved = true;
    p.away.used += dt;
    return true;
  }

  /** 오늘 더 쓸 수 있는 자리 비움 사냥 시간(초). 날이 바뀌었으면 쓴 시간을 비운다 */
  left(p: Ent): number {
    const today = this.g.time.dayOf(this.g.now());
    if (p.away.day !== today) p.away = { day: today, used: 0 };
    return Math.max(0, AWAY_MAX_S - p.away.used);
  }

  /** 접속이 끊겼다: 여기서부터 서버가 대신 사냥한다. 오늘 한도를 다 썼으면 남지 않는다. */
  start(p: Ent): void {
    // 자동 사냥을 끄면 통신 계층이 다음 전송 때 저장하고 내보낸다 (시간이 다 됐을 때와 같은 길)
    if (this.left(p) <= 0) { p.auto = false; return; }
    const g = this.g, money = g.has('economy'); // 재화와 레벨은 그 모듈이 없으면 0과 1로 센다 (자리 비움 사냥은 전투만 있으면 돈다)
    this.stays.set(p.id, { x: p.x, z: p.z, at: g.now(), sparks: money ? p.sparks : 0, gold: money ? p.gold : 0, lv: g.field(p, 'lv'), lost: 0, salv: 0, dust: 0 });
    p.wait = 0;
  }

  /** 지금 서버가 대신 사냥하고 있는 캐릭터인가 (지표가 접속 중의 사냥과 가려 적는 데 쓴다) */
  active(p: Ent): boolean { return this.stays.has(p.id); }

  /** 자리를 비운 동안의 장비를 센다: 버려진 것(lost), 자동 분해한 것(salv), 얻은 가루(dust). 사냥 중이 아니면 아무것도 하지 않는다 */
  tally(p: Ent, what: 'lost' | 'salv' | 'dust', n: number): void {
    const s = this.stays.get(p.id);
    if (s) s[what] += n;
  }

  /** 주인이 돌아왔다: 그동안 얻은 것을 알려 주고 손을 뗀다. */
  stop(p: Ent): void {
    const s = this.stays.get(p.id);
    if (!s) return;
    this.stays.delete(p.id); this.resting.delete(p.id);
    const minutes = Math.max(1, Math.round((this.g.now() - s.at) / 60000));
    const g = this.g, money = g.has('economy');
    g.notify(p, 'awayBack', minutes, Math.max(0, (money ? p.sparks : 0) - s.sparks), Math.max(0, (money ? p.gold : 0) - s.gold), g.field(p, 'lv') - s.lv);
    // 버려지거나 자동으로 분해된 장비가 있었으면 이어서 알린다 (조용히 사라지면 몰라서 손해 본다)
    if (s.lost || s.salv) this.g.notify(p, 'awayGear', s.lost, s.salv, s.dust);
  }

  think(p: Ent, dt: number): void {
    const s = this.stays.get(p.id);
    if (!s) return;
    const g = this.g;
    if (this.left(p) <= 0) { p.auto = false; p.unsaved = true; return; } // 통신 계층이 저장하고 내보낸다
    // 쓴 시간이 분 단위로 넘어갈 때마다 저장할 것으로 표시한다 (서버가 갑자기 꺼져도 쓴 시간이 크게 되돌아가지 않게)
    if (Math.floor((p.away.used + dt) / 60) !== Math.floor(p.away.used / 60)) p.unsaved = true;
    p.away.used += dt;
    p.wait -= dt;
    if (p.wait > 0) return;
    p.wait = THINK_S;
    const ratio = p.hp / p.maxHp;
    if (p.hp <= 0) { this.resting.delete(p.id); return; } // 쓰러졌다: 일어나면 체력이 차 있다
    // 안전장치 (게임이 켰을 때만): 물약, 물러나 멈춤, 물약이 없어 멈춤
    if (this.safety) { const done = this.guard(p, p, (id) => g.command(p, { t: 'use', id })); if (done === 'potion') return; if (done) return; }

    const items = g.field(p, 'items'), potion = p.itemCd <= 0 ? pickPotion(ratio, items) : null;
    if (potion) g.command(p, { t: 'use', id: potion });
    // 물약이 없으면 체력이 찰 때까지 쉬어 간다 (화면의 자동 사냥과 같은 규칙)
    if (shouldRest(ratio, items, this.resting.has(p.id))) this.resting.add(p.id); else this.resting.delete(p.id);
    const resting = this.resting.has(p.id);
    // 쉬는 중: 둘레(10m)에 몬스터가 있으면 싸우지 않고 물러난다(쫓아오면 계속). 막혔을 때만 붙은 것과 싸운다 (화면의 자동 사냥과 같은 규칙)
    if (resting) {
      const foes = [...g.ents.values()].filter((m) => m.kind === 'm' && !m.dead && !m.homing && m.layer === p.layer && dist(p, m) < AUTO.restClear);
      const spot = restSpot(p, foes);
      if (spot && spot !== 'cornered') {
        p.targetId = 0;
        if (!p.moving || Math.hypot(p.tx - spot.x, p.tz - spot.z) > 6) g.command(p, { t: 'move', x: spot.x, z: spot.z });
        return;
      }
    }

    // 대상이 없거나 죽었으면 가장 가까운 몬스터로 바꾼다
    let target = g.ents.get(p.targetId);
    if (resting && target && dist(p, target) > AUTO.restGuard) target = undefined;
    if (!target || target.dead) {
      target = undefined;
      let nd = resting ? AUTO.restGuard : AUTO.seek; // 쉬는 중이면 내게 붙은 것만 상대한다
      for (const m of g.ents.values()) {
        if (m.kind !== 'm' || m.dead || m.homing || m.layer !== p.layer || dist(s, m) > ROAM) continue;
        if (m.def?.boss && m.targetId !== p.id) continue; // 필드 보스는 스스로 고르지 않는다 (자리 비움으로 보스를 되풀이해 잡던 것, 검토 7)
        const d = dist(p, m);
        if (d < nd) { nd = d; target = m; }
      }
      if (target) g.command(p, { t: 'attack', id: target.id });
      else if (resting) { /* 쉬는 중이고 둘레에 몬스터가 없다: 그 자리에서 쉰다 */ }
      // 쓰러져 다시 일어나는 곳(g.rules.respawn)에서 일어났거나 멀리 끌려갔으면 자리를 비운 곳으로 돌아간다
      else if (!p.moving && dist(p, s) > 4) g.movement.goTo(p, s.x, s.z);
    }
    const d = target ? dist(p, target) : Infinity;

    const n = pickSkill(p.cls, ratio, d, (i) => p.cds[i] <= 0);
    if (n >= 0) g.command(p, { t: 'skill', n });
  }
}
