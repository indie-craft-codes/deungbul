// 필드 보스: 맞서는 사람이 늘수록 체력이 늘고, 예고한 뒤에 주변을 내려친다.
// 보스도 몬스터의 하나라서 이동과 기본 공격은 monsters.ts가 맡고, 여기서는 보스만의 것을 더한다.
import { BOSS, bossHp } from '../../../shared/defs';
import { dist, ri, type Ent } from '../entity';
import type { Game } from '../game';
import { notifyLayer } from '../layers';

/** 보스 하나의 싸움 기록. 보스가 쓰러지거나 싸움이 풀려 체력이 돌아가면 지운다 */
interface Fight {
  /** 사람(엔티티 번호)별로 이 보스에게 준 피해와 마지막으로 때린 시각(게임 시계). 인원에서 빠진 사람의 것도 남겨 둔다 */
  by: Map<number, { dmg: number; at: number }>;
  /** 지금 인원으로 세고 있는 사람들 (바뀌었는지 보려고 적어 둔다) */
  who: string;
  /** 이 기록대로라면 보스의 체력이 얼마여야 하는가. 다르면 다른 곳에서 체력을 되돌린 것이다(집으로 돌아감, 쉬는 채널) */
  hp: number;
}

export class Boss {
  private fights = new Map<number, Fight>();

  constructor(private g: Game) {
    g.ticks.push((dt) => this.tick(dt));
    g.on('hit', (p, m, amount) => {
      if (!m.def?.boss) return;
      let f = this.fights.get(m.id);
      if (!f) this.fights.set(m.id, f = { by: new Map(), who: '', hp: m.hp + amount });
      const r = f.by.get(p.id);
      if (r) { r.dmg += amount; r.at = g.clock; } else f.by.set(p.id, { dmg: amount, at: g.clock });
      f.hp -= amount;
    });
    g.on('monsterKilled', (m, hitters) => {
      // 보스는 채널마다 따로라서, 쓰러뜨린 소식도 그 채널에만 알린다
      if (m.def?.boss) { this.fights.delete(m.id); notifyLayer(g, m.layer, 'bossDown', m.type, hitters.length); }
    });
  }

  /**
   * 맞서는 사람 수에 맞춰 체력을 다시 잡는다. 한 명이면 기본 체력이고, 한 명 늘 때마다 일정 비율(몫)씩 는다.
   *
   * 맞서는 사람: 같은 층에서 BOSS.countRange 안에 있고 최근(BOSS.countS)에 보스를 때린 사람. 한 대 치고 떠났거나 서 있기만 한 사람은 빠지고,
   * 빠진 사람은 처치 보상도 받지 못한다(다시 때리면 돌아온다): 인원에서 빠진 채 보상만 받을 수 있으면 혼자 몫의 보스로 여럿이 보상을 받는다.
   *
   * 체력은 '지금 인원의 최대 체력 − 인정하는 피해'로 구한다. 인정하는 피해는 맞서고 있는 사람이 준 피해 전부와,
   * 빠진 사람이 준 피해 가운데 자기 몫(기본 체력 × hpPerPlayer)을 넘는 부분이다.
   *   - 한 대 치고 떠난 사람: 들어올 때 늘린 몫이 그대로 빠져서, 남은 사람이 깎아 둔 체력이 그대로다 (보스가 회복되지도, 깎이지도 않는다).
   *   - 여럿이 깎고 흩어져 한 명이 마무리: 떠난 사람이 자기 몫만큼 깎은 것은 몫과 함께 사라지고, 그보다 더 깎은 것만 남는다.
   *     남은 한 명이 덜 치게 되는 양은 떠난 사람들이 제 몫을 넘겨 실제로 깎은 양뿐이고, 떠난 사람들은 보상을 받지 못한다.
   *   - 떠났다 돌아온 사람: 준 피해가 모두 다시 인정되고 몫도 다시 늘어난다. 나갔다 들어와도 얻는 것도 잃는 것도 없다.
   */
  private rescale(m: Ent, base: number): void {
    const g = this.g, f = this.fights.get(m.id);
    // 기록과 체력이 어긋났다: 싸움이 풀려 체력이 돌아갔다. 지난 싸움의 기록으로 셈하지 않는다
    if (f && Math.abs(f.hp - m.hp) > 0.5) { f.by.clear(); f.hp = m.hp; f.who = ''; }
    for (const id of [...m.hitters]) {
      const p = g.ents.get(id), at = f?.by.get(id)?.at ?? g.clock;
      if (!p || p.layer !== m.layer || dist(p, m) > BOSS.countRange || (id !== m.targetId && g.clock - at > BOSS.countS)) m.hitters.delete(id);
    }
    const n = Math.min(BOSS.maxScale, m.hitters.size), who = [...m.hitters].sort((a, b) => a - b).join(',');
    if (n === m.scale && (!f || who === f.who)) return;
    const max = bossHp(base, n);
    if (n === 0) { m.hp = max; this.fights.delete(m.id); } // 아무도 없으면 가득 채우고 새 싸움으로 친다
    else if (f) {
      const share = base * BOSS.hpPerPlayer;
      let dealt = 0;
      for (const [id, r] of f.by) dealt += m.hitters.has(id) ? r.dmg : Math.max(0, r.dmg - share);
      m.hp = Math.max(1, Math.min(max, Math.round(max - dealt))); // 인원이 바뀐 것만으로 쓰러지지는 않는다
      f.hp = m.hp; f.who = who;
    } else m.hp = Math.min(m.hp, max);
    if (max !== m.maxHp) g.emit(['mh', m.id, max]);
    m.maxHp = max;
    m.scale = n;
  }

  tick(dt: number): void {
    const g = this.g;
    for (const id of this.fights.keys()) if (!g.ents.has(id)) this.fights.delete(id); // 던전과 함께 사라진 보스
    for (const m of g.ents.values()) {
      const def = m.def;
      if (!def?.boss) continue;
      if (m.dead) { m.maxHp = def.hp; m.scale = 0; m.windup = 0; this.fights.delete(m.id); continue; } // 다시 나타날 때는 기본 체력으로
      this.rescale(m, def.hp);

      if (!m.targetId) { m.cast = BOSS.slamEveryS; m.windup = 0; continue; } // 싸우지 않을 때는 내려치지 않는다
      if (m.windup > 0) {
        m.windup -= dt;
        if (m.windup > 0) continue;
        // 예고가 끝났다: 그때 범위 안에 남아 있는 사람만 맞는다
        for (const p of [...g.ents.values()]) {
          if (p.kind === 'p' && p.layer === m.layer && dist(p, m) <= BOSS.slamRadius) g.combat.damage(m, p, ri(BOSS.slamDmg[0], BOSS.slamDmg[1]), true);
        }
        m.cast = BOSS.slamEveryS;
      } else {
        m.cast -= dt;
        if (m.cast <= 0) { m.windup = BOSS.slamWarnS; m.moving = false; g.emit(['s', m.id, 'slam', 0]); }
      }
    }
  }
}
