// 자동 사냥 설정 창 (묶음 E: docs/screens.md 3.1·3.2의 상용 모바일 MMORPG식). 메뉴의 '자동 사냥' 탭(묶음 '활동')과 자동 사냥 단추 곁의 톱니 단추.
//   사냥 범위(제자리·현재 지역) · 대상 우선순위(가까운 것·퀘스트 대상·약한 것) · 잡지 않을 몬스터 · 물약 자동 사용 % · 기술 자동 사용
//   귀환·정지 조건: 안전장치가 없는 게임은 설정의 체력 %·물약 없음, 게임이 안전장치(g.away.safety)를 켰으면 그 넷(보이지 않을 때) · 가방이 가득 차면 멈춤
//   줍기·분해(자동 줍기는 늘 켜짐: 처치하면 바로 가방으로, 자동 분해는 장비 탭과 같은 칸) · 절전 화면(지금 절전, 입력이 없으면 저절로)
// 값은 서버가 저장한다(명령·메시지 autoPrefs: engine/client/auto.ts). 기본값은 예전의 동작과 같다. 절전의 '저절로'만 기기에 둔다.
import { AUTO, AWAY, POTIONS } from '../../shared/auto';
import { $ } from '../app';
import { MONSTERS, RARITIES, SALVAGE, autoSalvageChoices, isItemId, monsterDef, type MonsterId } from '../../shared/defs';
import { autoPrefs, autoPrefsBase, autoGoalOk, autoSafety, onAutoPrefs, resetAutoPrefs, setAutoPrefs, setAutoSafety, toggleAuto } from '../auto';
import { onMsg } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { hasModule } from '../mods';
import { send } from '../net';
import { S } from '../state';
import { addMenuTab, openMenu, renderMenu } from './menu';
import { button, chips, el, row, select } from './menu/parts';
import { addNotices } from './notify';
import { POWER_SAVE_AFTER, openPowerSave, powerSaveAfter, powerSaveButton, setPowerSaveAfter } from './powersave';
import { onOff, slider } from './settings';
import { uiIcon } from './uiicons';

const pct = (v: number): number => Math.round(v * 100);

function drawAutoSet(list: HTMLElement): void {
  const loc = L(), p = autoPrefs(), safe = autoSafety();
  // 켜고 끄기 (자동 사냥 단추와 같다)
  const onBtn = button(t('auto'), () => { toggleAuto(); renderMenu(); });
  onBtn.classList.add('toggle');
  onBtn.setAttribute('aria-pressed', String(S.auto));
  list.append(row(t('tabAutoSet'), t('asSaved'), [onBtn], 'asHead'));

  // 사냥 범위
  list.append(row(t('asRange'), loc.fmt.asRangeNote(AUTO.spot, AWAY.roam), [chips([
    { text: t('asRangeSpot'), on: p.range === 'spot', click: () => setAutoPrefs({ range: 'spot' }) },
    { text: t('asRangeArea'), on: p.range === 'area', click: () => setAutoPrefs({ range: 'area' }) },
  ])], 'asWide'));

  // 대상 우선순위 (퀘스트 대상은 게임이 퀘스트를 이었을 때만)
  const goalOk = autoGoalOk();
  list.append(row(t('asTarget'), goalOk && p.target === 'goal' ? t('asGoalNote') : '', [chips([
    { text: t('asTNear'), on: p.target === 'near', click: () => setAutoPrefs({ target: 'near' }) },
    ...(goalOk ? [{ text: t('asTGoal'), on: p.target === 'goal', click: () => setAutoPrefs({ target: 'goal' }) }] : []),
    { text: t('asTWeak'), on: p.target === 'weak', click: () => setAutoPrefs({ target: 'weak' }) },
  ])], 'asWide'));
  // 잡지 않을 몬스터 (우두머리는 원래 스스로 고르지 않는다)
  const mons = (Object.keys(MONSTERS) as MonsterId[]).filter((id) => !monsterDef(id).boss);
  if (mons.length) {
    const skip = new Set(p.skip);
    const c = chips(mons.map((id) => ({ text: loc.monsters[id] ?? id, on: skip.has(id), click: () => { const next = new Set(skip); if (next.has(id)) next.delete(id); else next.add(id); setAutoPrefs({ skip: [...next] }); } })));
    c.classList.add('asSkip');
    list.append(row(t('asSkip'), t('asSkipNote'), [c], 'asWide'));
  }

  // 물약·기술
  list.append(el('baghead', `${t('asPotion')} · ${t('asSkills')}`));
  if (POTIONS.length) {
    // 안전장치가 있는 게임: 같은 칸이 보이지 않을 때의 물약 %도 함께 바꾼다 (둘이 따로 놀지 않게)
    const shown = safe ? safe.potionAt : p.potionAt;
    list.append(row(t('asPotion'), loc.fmt.asPotionAt(pct(shown)), [slider(t('asPotion'), pct(shown), 10, 80, 5, () => {}, (v) => { setAutoPrefs({ potionAt: v / 100 }); if (safe) setAutoSafety({ potionAt: v / 100 }); })]));
  }
  list.append(row(t('asSkills'), '', [onOff(p.skills, (v) => setAutoPrefs({ skills: v }))]));

  // 귀환·정지 조건
  if (safe) {
    list.append(el('baghead', t('asSafe')), el('note', t('asSafeNote')));
    list.append(row(t('asSafeRetreat'), loc.fmt.asPct(pct(safe.retreatAt)), [slider(t('asSafeRetreat'), pct(safe.retreatAt), 0, 60, 5, () => {}, (v) => setAutoSafety({ retreatAt: v / 100 }))]));
    if (POTIONS.length) list.append(row(t('asSafeNoPotion'), '', [onOff(safe.stopNoPotion, (v) => setAutoSafety({ stopNoPotion: v }))]));
    list.append(row(t('asSafeDeath'), '', [onOff(safe.stopOnDeath, (v) => setAutoSafety({ stopOnDeath: v }))]));
    if (hasModule('gear')) list.append(row(t('asStopBag'), '', [onOff(p.stopBag, (v) => setAutoPrefs({ stopBag: v }))]));
  } else {
    list.append(el('baghead', t('asStop')));
    list.append(row(t('asStopHp'), loc.fmt.asPct(pct(p.stopHpAt)), [slider(t('asStopHp'), pct(p.stopHpAt), 0, 60, 5, () => {}, (v) => setAutoPrefs({ stopHpAt: v / 100 }))]));
    if (POTIONS.length) list.append(row(t('asStopNoPotion'), '', [onOff(p.stopNoPotion, (v) => setAutoPrefs({ stopNoPotion: v }))]));
    if (hasModule('gear')) list.append(row(t('asStopBag'), '', [onOff(p.stopBag, (v) => setAutoPrefs({ stopBag: v }))]));
  }

  // 줍기·분해: 자동 줍기는 늘 켜짐(처치하면 바로 가방으로), 자동 분해는 장비 탭과 같은 칸
  if (hasModule('items')) {
    list.append(el('baghead', t('asLoot')));
    list.append(row(t('asLootAuto'), t('asLootNote'), [el('num', t('on'))]));
    if (S.salvage.on && isItemId(SALVAGE.item)) {
      const rarName = (v: string): string => loc.fmt.rarAtMost(loc.gear.rarities[RARITIES[Number(v)].id]);
      const choices = autoSalvageChoices().map(String);
      list.append(row(loc.fmt.autoSalvageOpt(''), S.salvage.auto >= 0 ? loc.fmt.autoSalvageOn(rarName(String(S.salvage.auto))) : '', [select(loc.fmt.autoSalvageOpt(''), choices, String(S.salvage.auto), (v) => loc.fmt.autoSalvageOpt(v === '-1' ? t('autoSalvageOff') : rarName(v)), (v) => { send({ t: 'autoSalvage', rar: Number(v) }); })]));
    }
  }

  // 절전 화면
  list.append(el('baghead', t('asPower')));
  list.append(row(t('asPowerNow'), '', [button(t('asPowerNow'), () => openPowerSave())]));
  const after = powerSaveAfter();
  list.append(row(t('asPowerAfter'), '', [chips(POWER_SAVE_AFTER.map((m) => ({ text: loc.fmt.asAfter(m), on: after === m, click: () => { setPowerSaveAfter(m); renderMenu(); } })))], 'asWide'));

  // 기본값으로
  const b = autoPrefsBase();
  const same = JSON.stringify(p) === JSON.stringify(b);
  list.append(row('', '', [button(t('asReset'), () => resetAutoPrefs(), same)], 'asFoot'));
}

export function initAutoSet(): void {
  addMenuTab({ id: 'autoset', label: () => t('tabAutoSet'), draw: drawAutoSet, sig: () => [autoPrefs(), autoSafety(), S.auto, S.salvage, powerSaveAfter()] });
  onAutoPrefs(() => renderMenu());
  // 자동 사냥 단추 곁: 톱니(설정 창) · 절전 (사냥 중일 때만)
  const auto = $('autoBtn') as HTMLElement | null;
  if (auto) {
    const gear = document.createElement('button');
    gear.type = 'button'; gear.id = 'autoSetBtn';
    gear.append(uiIcon('settings'));
    const label = (): void => { gear.title = t('autoSetBtn'); gear.setAttribute('aria-label', t('autoSetBtn')); };
    label(); onLangChange(label);
    gear.addEventListener('click', () => { gear.blur(); openMenu('autoset'); });
    const save = powerSaveButton('psBtn');
    save.id = 'psaveBtn';
    auto.after(gear, save);
  }
  // 멈춤 조건의 안내문은 가운데 알림으로 (안전장치를 켠 게임은 모드 화면이 이미 정했다: 그것이 이긴다)
  addNotices({ banner: { autoBagFull: 'bad', autoRetreat: 'bad', autoNoPotion: 'bad' } }, true);
  onMsg('me', (m) => { if (m.k === 'salvage') renderMenu(true); });
}
