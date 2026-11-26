// 이 게임의 창 하나: 메뉴의 '원정' 탭 (열쇠 던전의 열쇠 사기와 들어가기). 줄은 틀의 메뉴 도우미(menuRow, menuButton, menuEl)로 그린다.
// 들어가기는 틀의 명령 dungeonGo(DungeonDef.fromMenu: 단계에서 나와 문 앞을 거쳐 들어간다, 안에서는 대장도 대신 싸운다, 끝나면 단계로 돌아온다).
// '단계' 탭 끝에도 같은 던전의 줄(들어가기·소탕)이 틀에 있다. 이 탭은 거기에 없는 '열쇠 사기'를 함께 보인다.
// 별정수 → 조각은 틀의 '영웅' 탭(HERO_RULES.trade), 돌아왔을 때의 창은 틀의 hud/idleback.ts(IDLE.popup)다.
import { addMenuTab, closeMenu, menuButton, menuEl, menuRow, myKeys, S, send } from '@engine/client';
import { L, t } from '@engine/client/i18n';
import { dungeonLabel } from '@engine/client/i18n/names';
import { DUNGEONS } from '../shared/content';

const dungeonIds = Object.keys(DUNGEONS) as (keyof typeof DUNGEONS)[];

function drawExpedition(list: HTMLElement): void {
  const loc = L(), keys = myKeys() ?? {}, lv = S.me?.lv ?? 1, sparks = S.me?.sparks ?? 0, inside = !!S.dungeon.id;
  list.append(menuEl('baghead', t('expDungeons')), menuEl('note', t('expDungeonsNote')));
  for (const id of dungeonIds) {
    const d = DUNGEONS[id], k = keys[id] ?? { n: 0, bought: 0 }, buy = d.key.buy, low = lv < d.minLv;
    const note = [loc.fmt.keyLine(k.n, d.key.cap, k.bought, buy.perDay, buy.cost), low ? loc.fmt.expNeedLv(d.minLv) : '', dungeonLabel(loc, id).info].filter(Boolean).join(' · ');
    list.append(menuRow(dungeonLabel(loc, id).name, note, [
      menuButton(t('expBuy'), () => send({ t: 'dungeonKey', id }), k.bought >= buy.perDay || sparks < buy.cost),
      menuButton(t('expGo'), () => { send({ t: 'dungeonGo', id }); closeMenu(); }, k.n <= 0 || low || inside),
    ], 'dalmuri-dg'));
  }
}

export function initExpedition(): void {
  addMenuTab({
    id: 'expedition', label: () => t('tabExpedition'), draw: drawExpedition,
    sig: () => [myKeys(), S.me?.sparks, S.me?.lv, S.dungeon.id],
    dot: () => Object.entries(myKeys() ?? {}).some(([id, k]) => k.n > 0 && (S.me?.lv ?? 1) >= (DUNGEONS[id as keyof typeof DUNGEONS]?.minLv ?? 1)),
  }, 'stages');
}
