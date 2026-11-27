// 별 겨루기의 화면 (서버는 ../server/duel.ts): 그루터기 곁에서만 보이는 대기실(랭크 대전 = 큐), 판 막대의 무더기 줄, 내 차례의 줍기 단추 셋, 리플레이 그리기.
// 랭크·순위표·큐 띠·결과 창의 레이팅 변화·리플레이 재생기는 틀이 그린다 (engine/client/hud/compete.ts·replay.ts·rooms.ts).
import { $, addMapPlaces, addPlace, mountPanel, myRoom, myRoomTurn, onMsg, onRoomChange, S, send, setReplayLook, setRoomLook } from '@engine/client';
import { L, onLangChange, t } from '@engine/client/i18n';
import type { DuelFrame, DuelView } from '../server/duel';

/** 그루터기 자리 (서버의 SEATS 가운데)와 대기실이 보이는 거리 */
export const STUMPS = { x: 0, z: -9, reach: 7 };
const near = (): boolean => !!S.me && Math.hypot(S.me.x - STUMPS.x, S.me.z - STUMPS.z) <= STUMPS.reach;

export function mountDuel(): void {
  mountPanel('hud', `
    <div class="panel" id="duelPad" role="group" hidden>
      <div class="note" id="duelPadNote"></div>
      <div class="btns"><button type="button" class="go" data-n="1"></button><button type="button" class="go" data-n="2"></button><button type="button" class="go" data-n="3"></button></div>
    </div>`);
}

export function initDuel(): void {
  let mine: DuelView | null = null;
  const pad = $('duelPad'), note = $('duelPadNote');
  onMsg('me', (m) => { if (m.k === 'duel') { mine = m.s as DuelView | null; draw(); } });
  onRoomChange(() => draw());
  setRoomLook({
    defName: (id) => (id === 'duel' ? t('duelName') : id),
    note: () => (mine && myRoom()?.st === 'play' ? L().fmt.duelNote(mine.pile, mine.got, mine.secret) : ''),
    // 들판의 게임: 대기실은 그루터기 곁에서만
    lobbyWhen: near,
  });
  addPlace('duel', [STUMPS]);
  addMapPlaces(() => [{ x: STUMPS.x, z: STUMPS.z, name: t('duelName'), kind: 'other', info: t('duelInfo') }]);
  pad.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-n]');
    if (!b || b.disabled) return;
    send({ t: 'duel', n: Number(b.dataset.n) });
  });
  const label = () => {
    pad.setAttribute('aria-label', t('duelName'));
    for (const b of pad.querySelectorAll<HTMLButtonElement>('[data-n]')) { const n = Number(b.dataset.n); b.textContent = L().fmt.duelTake(n); }
    draw();
  };
  onLangChange(label);
  label();

  function draw(): void {
    const r = myRoom(), on = !!r && r.def === 'duel' && r.st === 'play' && !r.watch && !!mine;
    pad.hidden = !on;
    if (!on || !mine) return;
    const turn = myRoomTurn();
    note.textContent = L().fmt.duelPad(mine.pile, mine.secret, turn);
    for (const b of pad.querySelectorAll<HTMLButtonElement>('[data-n]')) b.disabled = !turn || Number(b.dataset.n) > mine.pile;
  }

  // 리플레이: 솔방울 줄, 자리마다 주운 수와 비밀 솔방울(끝난 뒤라 둘 다 보인다), 마지막으로 주운 수
  setReplayLook({
    draw: (v, names, box) => {
      const f = v as DuelFrame | undefined;
      if (!f) return;
      const loc = L();
      const pile = document.createElement('div');
      pile.className = 'duelPile';
      pile.textContent = '●'.repeat(Math.max(0, f.pile)) || '—';
      pile.setAttribute('aria-label', loc.fmt.duelLeft(f.pile));
      box.append(pile);
      names.forEach((name, i) => {
        const row = document.createElement('div');
        row.className = `duelSeat${f.turn === i ? ' now' : ''}`;
        row.textContent = loc.fmt.duelSeat(name, f.got[i] ?? 0, f.last[i] ?? 0, f.secret[i] ?? 0);
        box.append(row);
      });
    },
  });
}
