// 자동 사냥: 가까운 몬스터를 골라 공격하고, 기술과 물약을 알아서 쓴다.
// 직접 이동하거나 멈추면 꺼진다. 서버에는 사람이 누른 것과 같은 명령만 보낸다.
import { AUTO, pickPotion, pickSkill } from '../../shared/auto';
import { attack, goToTown, monstersNear, usePotion, useSkill } from './actions';
import { $ } from './app';
import { onMsg } from './bus';
import { feed } from './hud/notify';
import { t } from './i18n';
import { send } from './net';
import { S } from './state';

const btn = $('autoBtn');
let shown = false;

export function toggleAuto(): void {
  if (!S.me) return;
  S.auto = !S.auto;
  feed(t(S.auto ? 'autoOn' : 'autoOff'));
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
  $('townBtn').addEventListener('click', (e) => { goToTown(); (e.currentTarget as HTMLElement).blur(); });
  setInterval(tick, 300);
  onMsg('welcome', (m) => syncAuto(m.auto === true));
}
