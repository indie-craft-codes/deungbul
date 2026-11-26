// 이 게임의 창 둘: 메뉴의 '원정' 탭(열쇠 던전으로 가기·열쇠 사기, 별정수 → 영웅 조각)과 다시 접속했을 때의 방치 보상 창.
// 영웅·뽑기·편성·단계의 탭과 단계 막대는 틀의 것이다 (hud/collect.ts, hud/stagebar.ts).
import { addMenuTab, addNotices, $, mountPanel, myHeroes, onMsg, S, send } from '@engine/client';
import { L, t } from '@engine/client/i18n';
import { heroName } from '@engine/client/i18n/ko';
import { dungeonLabel } from '@engine/client/i18n/names';
import { DUNGEONS, ESSENCE, HEROES } from '../shared/content';
import type { KeysMe, Reward } from '@engine/shared/defs';

let keys: KeysMe = {};
let pop: { mail: number; min: number; r: Reward } | null = null;

/** 작은 요소 (틀의 메뉴와 같은 class: mrow, what, iname, note, acts, plain) */
function el(tag: string, cls: string, text = ''): HTMLElement { const d = document.createElement(tag); d.className = cls; d.textContent = text; return d; }
function btn(text: string, on: () => void, off = false): HTMLButtonElement { const b = el('button', 'plain', text) as HTMLButtonElement; b.type = 'button'; b.disabled = off; b.addEventListener('click', on); return b; }
function row(name: string, note: string, buttons: HTMLElement[], cls = ''): HTMLElement {
  const r = el('div', 'mrow ' + cls), what = el('div', 'what');
  what.append(el('div', 'iname', name));
  if (note) what.append(el('div', 'note', note));
  const acts = el('div', 'acts');
  acts.append(...buttons);
  r.append(what, acts);
  return r;
}
const essence = (): number => S.me?.items?.[ESSENCE.item] ?? 0;

function drawExpedition(list: HTMLElement): void {
  const loc = L();
  list.append(el('div', 'baghead', t('expDungeons')), el('div', 'note', t('expDungeonsNote')));
  for (const [id, d] of Object.entries(DUNGEONS)) {
    const k = keys[id] ?? { n: 0, bought: 0 }, buy = d.key.buy;
    const name = dungeonLabel(loc, id).name;
    const low = (S.me?.lv ?? 1) < d.minLv;
    list.append(row(name, `${loc.fmt.keyLine(k.n, d.key.cap, k.bought, buy.perDay, buy.cost)}${low ? ` · ${loc.fmt.expNeedLv(d.minLv)}` : ''}`, [
      btn(t('expBuy'), () => send({ t: 'dungeonKey', id }), k.bought >= buy.perDay || (S.me?.sparks ?? 0) < buy.cost),
      btn(t('expGo'), () => { send({ t: 'keyrun', id }); closeMenu(); }, k.n <= 0 || low),
    ], 'dalmuri-dg'));
  }
  list.append(el('div', 'baghead', t('expEssence')), el('div', 'note', t('expEssenceNote')), el('div', 'note gold', loc.fmt.essenceHave(essence())));
  const own = myHeroes();
  const ids = Object.keys(own).sort((a, b) => HEROES[b].rarity - HEROES[a].rarity || heroName(a).localeCompare(heroName(b)));
  for (const id of ids) {
    const [lv, stars, shards] = own[id], need = ESSENCE.cost[HEROES[id].rarity];
    list.append(row(heroName(id), loc.fmt.essenceRow(lv, stars, shards, need), [btn(t('expUse'), () => send({ t: 'essence', id }), essence() < need)], `rar${HEROES[id].rarity}`));
  }
}
/** 메뉴를 닫는다 (던전으로 가면 화면을 비운다): 메뉴의 닫기 단추를 누른다 */
function closeMenu(): void { ($('menuClose') as HTMLButtonElement | null)?.click(); }

export function mountExpedition(): void {
  mountPanel('hud', `
    <div class="panel" id="idlePop" hidden>
      <div class="ttitle" data-i18n="idleTitle"></div>
      <div class="note" id="idleBody"></div>
      <div class="num gold" id="idleReward"></div>
      <div class="btns">
        <button type="button" class="on" id="idleClaim" data-i18n="idleClaim"></button>
        <button type="button" class="plain" id="idleLater" data-i18n="idleLater"></button>
      </div>
    </div>`);
}

export function initExpedition(): void {
  const ui = { pop: $('idlePop'), body: $('idleBody'), reward: $('idleReward') };
  const show = () => {
    ui.pop.hidden = !pop;
    if (!pop) return;
    const loc = L();
    ui.body.textContent = loc.fmt.idleBody(pop.min);
    ui.reward.textContent = loc.fmt.idleReward(pop.r.gold ?? 0, pop.r.sparks ?? 0, pop.r.items?.[ESSENCE.item] ?? 0);
  };
  onMsg('me', (m) => { if (m.k === 'keys') keys = m.s as KeysMe; });
  onMsg('idleGain', (m) => { pop = { mail: m.mail, min: m.min, r: m.r }; show(); });
  $('idleClaim').addEventListener('click', () => { if (pop) send({ t: 'mailClaim', id: pop.mail }); pop = null; show(); });
  $('idleLater').addEventListener('click', () => { pop = null; show(); });
  addNotices({ feed: ['essenceUsed', 'essenceShort', 'essenceNoHero'] });
  addMenuTab({ id: 'expedition', label: () => t('tabExpedition'), draw: drawExpedition, sig: () => [keys, myHeroes(), essence(), S.me?.sparks, S.me?.lv], dot: () => Object.entries(keys).some(([id, k]) => k.n > 0 && (S.me?.lv ?? 1) >= (DUNGEONS[id as keyof typeof DUNGEONS]?.minLv ?? 1)) }, 'stages');
}
