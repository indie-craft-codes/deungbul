// 자동 사냥: 가까운 몬스터를 골라 공격하고, 기술과 물약을 알아서 쓴다.
// 직접 이동하거나 멈추면 꺼진다. 서버에는 사람이 누른 것과 같은 명령만 보낸다.
import { AUTO, AWAY, pickPotion, pickSkill } from '../shared/auto';
import { dungeonDef, isDungeonId } from '../shared/defs';
import { attack, autoWalk, monstersNear, usePotion, useSkill } from './actions';
import { $ } from './app';
import { onMsg } from './bus';
import { feed } from './hud/notify';
import { L, t } from './i18n';
import { send } from './net';
import { S } from './state';

const btn = $('autoBtn');
let shown = false;

export function toggleAuto(): void {
  if (!S.me) return;
  S.auto = !S.auto;
  // 창을 닫아도 이어지는 것은 직업을 고르고 조금 키운 캐릭터만이다 (서버의 조건과 같은 수: AWAY.minLv)
  const stays = S.me.cls !== '' && S.me.lv >= AWAY.minLv;
  feed(S.auto ? (stays ? t('autoOn') : L().fmt.autoOnEarly(AWAY.minLv)) : t('autoOff'));
  tick();
}

function tick(): void {
  if (shown !== S.auto) {
    shown = S.auto; btn.classList.toggle('on', shown); btn.setAttribute('aria-pressed', String(shown));
    send({ t: 'auto', on: shown }); // 켠 채 접속이 끊기면 서버가 이어서 사냥한다
  }
  const me = S.me;
  if (!S.auto || !me || !me.cls || me.hp <= 0) return;
  const now = performance.now();
  const ratio = me.hp / me.maxHp;

  if (now >= S.itemCdEnd && pickPotion(ratio, me.items)) usePotion();

  // 대상이 없거나 죽었으면 가장 가까운 몬스터로 바꾼다
  let target = S.others.get(me.attackId);
  if (!target || target.kind !== 'm' || target.dying || target.gone) {
    target = monstersNear(AUTO.seek)[0];
    if (target) attack(target.id);
    // 던전 안에서 보이는 적이 없으면 우두머리가 있는 곳으로 걸어간다 (졸개를 다 잡고 멈춰 서 있지 않게)
    else if (isDungeonId(S.dungeon.id) && !S.dungeon.cleared && !me.moving) {
      const boss = dungeonDef(S.dungeon.id).boss;
      if (Math.hypot(boss.x - me.x, boss.z - me.z) > 6) autoWalk(boss.x, boss.z);
    }
  }
  const dist = target ? Math.hypot(target.x - me.x, target.z - me.z) : Infinity;

  const n = pickSkill(me.cls, ratio, dist, (i) => now >= S.cdEnd[i]);
  if (n >= 0) useSkill(n);
}

/** 접속했을 때: 자리를 비운 동안 서버가 사냥하던 캐릭터를 이어받았으면 자동 사냥을 켠 채로 시작한다. */
export function syncAuto(kept: boolean): void {
  if (kept) S.auto = true;
  shown = S.auto; btn.classList.toggle('on', shown); btn.setAttribute('aria-pressed', String(shown));
  send({ t: 'auto', on: shown });
}

export function initAuto(): void {
  btn.addEventListener('click', () => { toggleAuto(); btn.blur(); });
  setInterval(tick, 300);
  onMsg('welcome', (m) => syncAuto(m.auto === true));
}
