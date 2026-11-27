// 게임 안의 모드의 화면 (modes 모듈): '게임 바꾸기' 단추, 모드마다 메뉴의 탭·감출 틀 요소, 들판의 대역(엔티티 종류 stand)의 겉모습.
// 서버의 짝은 engine/server/game/systems/modes.ts. 모드의 규칙은 내용의 MODE_RULES (engine/shared/defs/modes.ts).
// 지금 모드는 문서의 body에 적힌다: data-mode="<모드 id>", data-mode-kind="field|stage". 게임의 스타일이 이것으로 모드마다 다른 겉모습을 준다.
// 게임이 더 할 수 있는 것: 모드가 바뀔 때 듣기(onModeChange: 장면의 분위기, 게임의 창), 다른 쪽의 상황 듣기(onModeSide: 보이지 않는 쪽의 작은 표시),
// 바꾸기(switchMode), 읽기(myMode, myModeSide). 다른 쪽의 위험(대역의 쓰러짐·물러남·멈춤, 단계의 멈춤)은 틀의 가운데 알림(banner)으로 뜬다.
import { classOf, modeDef, otherMode, startMode, type ModeDef, type ModeMe, type ModeSideMe } from '../../shared/defs';
import { decodeLook } from '../../shared/defs/look';
import { hiddenHudIds } from '../../shared/defs/hud';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { uiText } from '../i18n/names';
import { registerKind } from '../kinds';
import { send } from '../net';
import { makeHumanoid, setArmor, setBlade } from '../scene/models';
import { S } from '../state';
import { setMenuTabs } from './menu';
import { redraw } from './menu/parts';
import { addNotices } from './notify';
import { mountPanel } from './shell';

let mode: ModeMe = { id: '', cd: 0 };
let side: ModeSideMe = { field: null, stage: null };
const modeFns: ((def: ModeDef, from: string) => void)[] = [];
const sideFns: ((s: Readonly<ModeSideMe>) => void)[] = [];

/** 지금 모드 (서버가 알려 주기 전이면 처음 모드) */
export const myMode = (): ModeDef | undefined => modeDef(mode.id || startMode());
/** 보고 있지 않은 쪽의 상황 (들판의 대역, 뒤에서 잇는 단계) */
export const myModeSide = (): Readonly<ModeSideMe> => side;
/** 모드가 바뀔 때 (처음 받을 때도: from이 '') */
export function onModeChange(fn: (def: ModeDef, from: string) => void): void { modeFns.push(fn); }
/** 다른 쪽의 상황이 바뀔 때 */
export function onModeSide(fn: (s: Readonly<ModeSideMe>) => void): void { sideFns.push(fn); }
/** 그 모드로 바꾼다 (주지 않으면 다음 모드) */
export function switchMode(id?: string): void { const to = id ?? otherMode(mode.id || startMode())?.id; if (to) send({ t: 'mode', id: to }); }

/** 게임이 내용의 HUD.hide로 늘 감춘 요소 (모드가 바뀌어도 그대로 감춘다) */
const always = new Set(hiddenHudIds());

function apply(def: ModeDef, from: string): void {
  document.body.dataset.mode = def.id;
  document.body.dataset.modeKind = def.kind;
  // 감출 요소: 이 모드의 hide (게임이 늘 감춘 것은 건드리지 않는다)
  const off = new Set(hiddenHudIds({ hide: def.hide ?? [] }));
  for (const el of document.querySelectorAll<HTMLElement>('.modeOff')) if (!off.has(el.id)) el.classList.remove('modeOff');
  for (const id of off) if (!always.has(id)) ($(id) as HTMLElement | null)?.classList.add('modeOff');
  if (def.tabs) setMenuTabs(def.tabs);
  label();
  for (const fn of modeFns) fn(def, from);
  redraw(true);
}

/** 단추의 글: 건너갈 모드의 이름 */
function label(): void {
  const btn = $('modeBtn') as HTMLElement | null;
  if (!btn) return;
  const to = otherMode(mode.id || startMode());
  btn.hidden = !to || !S.me;
  if (to) { btn.textContent = L().fmt.modeTo(uiText.get(to.name)); btn.title = t('modeBtn'); btn.setAttribute('aria-label', `${t('modeBtn')}: ${uiText.get(to.name)}`); }
}

export function initModes(): void {
  mountPanel('hud', '<button type="button" id="modeBtn" class="modeBtn" hidden></button>');
  $('modeBtn').addEventListener('click', (e) => { switchMode(); (e.currentTarget as HTMLElement).blur(); });
  onMsg('me', (m) => {
    if (m.k === 'mode') {
      const next = m.s as ModeMe, from = mode.id;
      mode = next;
      const def = modeDef(next.id);
      if (def && (from !== next.id || document.body.dataset.mode !== def.id)) apply(def, from);
      else label();
    } else if (m.k === 'modeSide') {
      side = m.s as ModeSideMe;
      for (const fn of sideFns) fn(side);
    }
  });
  onMsg('welcome', () => label());
  onLangChange(label);
  // 다른 쪽의 위험은 가운데 알림으로 (게임이 같은 안내문을 다시 분류하면 게임의 것이 이긴다: keep)
  addNotices({ banner: { modeStandDown: 'bad', stageBgStop: 'bad', autoRetreat: 'bad', autoNoPotion: 'bad', autoDied: 'bad', modeStandEnd: 'bad' }, feed: ['modeOn', 'modeWait', 'modeStandOn'] }, true);
  // 들판의 대역: 그 사람의 직업·무기·갑옷·겉모습으로 그린 사람 (type = '직업|무기|갑옷', 이름은 그 사람의 이름)
  registerKind('stand', {
    model: (e) => {
      const [cls = '', weapon = '', armor = ''] = e.type.split('|');
      const m = makeHumanoid(0x5a7a9a, classOf(cls).hand, undefined, cls, undefined, e.look ? decodeLook(e.look) ?? undefined : undefined);
      setBlade(m, weapon); setArmor(m, armor);
      return m;
    },
    label: (e) => e.name,
    animate: true,
    hp: true,
    h: 2.5,
    dot: '#7fc0ff',
    shot: (e) => classOf(e.type.split('|')[0] ?? '').shot,
  });
}
