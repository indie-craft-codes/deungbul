// 버섯 동굴의 규칙 플러그인: 일어나는 자리, 직업 바꾸기, 그리고 게임만의 싸우는 법 'lunge'.
import type { Ent, Game, MonsterBehavior } from '@engine/server';
import { MAP as aliased } from '@engine/shared/world';
import { CAMP, MAP } from '../shared/content';

if (MAP !== aliased) throw new Error('별칭 @game이 games/cave를 가리키지 않습니다. npm run start:cave 로 실행하세요');

/** 덤벼드는 이의 수치: 이 거리를 두고 맴돌다가, 기를 모은 뒤 단숨에 붙어 때린다 */
export const LUNGE = { keep: 4, charge: 0.8, cooldown: 3, leap: 1.2 };

/** 몬스터마다 남은 기 모으기 / 다시 덤빌 때까지의 시간 */
const state = new WeakMap<Ent, { charge: number; cd: number }>();

export const lunge: MonsterBehavior = (a) => {
  const { m, t, d, dt } = a;
  let s = state.get(m);
  if (!s) { s = { charge: 0, cd: 0 }; state.set(m, s); }
  s.cd = Math.max(0, s.cd - dt);
  // 멀면 기본대로 쫓아간다
  if (d > LUNGE.keep + 3) { s.charge = 0; return false; }
  if (s.cd > 0) {
    // 덤빈 뒤에는 거리를 다시 벌린다
    if (d < LUNGE.keep) { const k = LUNGE.keep / Math.max(d, 0.01); a.walkTo(t.x + (m.x - t.x) * k, t.z + (m.z - t.z) * k); }
    return true;
  }
  s.charge += dt;
  if (s.charge < LUNGE.charge) return true; // 멈춰 서서 기를 모은다
  // 덤빈다: 대상 앞 leap 거리까지 단숨에 가서 때린다
  const k = LUNGE.leap / Math.max(d, 0.01);
  m.x = t.x + (m.x - t.x) * k; m.z = t.z + (m.z - t.z) * k;
  a.strike();
  s.charge = 0; s.cd = LUNGE.cooldown;
  return true;
};

export function installCave(g: Game): void {
  g.monsters.addBehavior('lunge', lunge);
  g.rules.respawn = () => ({ x: CAMP.x, z: CAMP.z, id: 'camp' });
  g.rules.canChangeClass = (p) => Math.hypot(p.x - CAMP.x, p.z - CAMP.z) <= 8;
}
