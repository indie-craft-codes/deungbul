// 캐릭터 정의(chars 모듈)와 변신(morph 모듈)의 화면. 서버의 짝은 engine/server/game/systems/chars.ts, morph.ts.
//   chars  개인 상태 'chars'(정의의 목록)를 받아 알고 있는 정의(engine/shared/defs/chardef.ts의 setKnownChars)를 채운다.
//          roster를 함께 고른 게임에서는 정의를 영웅의 표에도 더한다 (영웅 탭·뽑기 결과·편성의 영웅이 그 이름과 겉모습으로 보인다)
//   morph  메뉴의 '변신' 탭: 가진 캐릭터마다 얼굴 그림(부품으로 그린 작은 그림), 이름·등급·소개·능력치·보정, 변신 단추. 변신 중이면 남은 시간과 풀기 단추
// 게임이 더 할 수 있는 것: 정의가 바뀔 때 듣기(onChars), 내 변신 상태 읽기(myMorph).
import * as THREE from 'three';
import { addHeroDef, charHero, charStats, dropHeroDef, HERO_RARITIES, knownChar, morphMods, rarityDef, setKnownChars, type CharDef, type MorphMe } from '../../shared/defs';
import { teamCss } from '../../shared/defs/teams';
import { onMsg } from '../bus';
import { L, t } from '../i18n';
import { rarityName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { hasModule } from '../mods';
import { send } from '../net';
import { makeHumanoid } from '../scene/models';
import { addMenuTab } from './menu';
import { button, el, redraw, row, span } from './menu/parts';
import { addNotices } from './notify';

let defs: CharDef[] = [];
let me: MorphMe = { own: [], on: '', left: -1, cd: 0 };
const fns: ((list: readonly CharDef[]) => void)[] = [];
/** 정의의 목록이 바뀔 때 (처음 받을 때도) */
export function onChars(fn: (list: readonly CharDef[]) => void): void { fns.push(fn); }
/** 서버가 알려 준 정의 전부 */
export const charDefs = (): readonly CharDef[] => defs;
/** 내 변신 상태 (가진 캐릭터, 지금 변신한 것, 남은 시간, 다시 변신까지) */
export const myMorph = (): Readonly<MorphMe> => me;

export function initChars(): void {
  const roster = hasModule('roster');
  onMsg('me', (m) => {
    if (m.k !== 'chars') return;
    const old = defs;
    defs = Array.isArray(m.s) ? (m.s as CharDef[]) : [];
    setKnownChars(defs);
    portraits.clear();
    if (roster) { for (const d of old) dropHeroDef(d.id); for (const d of defs) addHeroDef(d.id, charHero(d)); }
    for (const fn of fns) fn(defs);
    redraw(true);
  });
}

// ---------- 얼굴 그림: 작은 그리기 하나를 두고 정의마다 한 번 그려 그림(data URL)으로 간직한다 ----------
const portraits = new Map<string, string>();
let shot: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null | undefined;
function portrait(d: CharDef): string {
  const have = portraits.get(d.id);
  if (have !== undefined) return have;
  let url = '';
  try {
    if (shot === undefined) {
      const canvas = document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setSize(96, 112, false);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(2, 4, 3);
      scene.add(sun);
      const cam = new THREE.PerspectiveCamera(32, 96 / 112, 0.1, 30);
      cam.position.set(1.8, 2.1, 5.4);
      cam.lookAt(0, 1.25, 0);
      shot = { r, scene, cam };
    }
    if (shot) {
      const m = makeHumanoid(d.look.colors.cloth ?? 0x8a8a8a, false, d.look.colors.skin ?? 0xf0c9a0, undefined, undefined, d.look);
      m.root.rotation.y = 0.35;
      shot.scene.add(m.root);
      shot.r.render(shot.scene, shot.cam);
      shot.scene.remove(m.root);
      url = shot.r.domElement.toDataURL('image/png');
    }
  } catch { shot = null; } // 그릴 수 없는 곳 (WebGL이 없다): 그림 없이 글만
  portraits.set(d.id, url);
  return url;
}

// ---------- 변신 탭 ----------
const tinted = <T extends HTMLElement>(e: T, r: number): T => { e.style.setProperty('--rc', teamCss(rarityDef(r).color)); return e; };
const statName = (k: string): string => { const s = charStats()[k]; return s?.name ? uiText.get(s.name) : k === 'atk' ? t('charAtk') : k === 'hp' ? t('charHp') : k; };

function drawMorph(list: HTMLElement): void {
  const loc = L(), owned = me.own.map((id) => knownChar(id)).filter((d): d is CharDef => !!d);
  if (me.on) {
    const d = knownChar(me.on);
    const head = el('note morphNow');
    head.append(span('mtag', t('morphNow')), ` ${d?.name ?? me.on} · ${loc.fmt.morphLeft(me.left)}`);
    list.append(row(head, '', [button(t('morphOffBtn'), () => send({ t: 'morph', a: 'off' }))], 'mrow morphHead'));
  } else if (me.cd > 0) list.append(el('note', loc.fmt.morphCd(me.cd)));
  if (!owned.length) { list.append(el('note', t('morphNone'))); return; }
  for (const d of owned) {
    const name = tinted(el('iname'), d.rarity), pic = portrait(d);
    if (pic) { const img = document.createElement('img'); img.className = 'morphPic'; img.src = pic; img.alt = ''; name.append(img); }
    name.append(span('', d.name));
    const note = el('note'), mods = loc.fmt.morphBonus(morphMods(d));
    const role = d.role ? ` · ${d.role}` : '';
    note.append(el('', `${HERO_RARITIES.length ? rarityName(d.rarity) : ''}${role}`), el('', Object.entries(d.stats).map(([k, v]) => `${statName(k)} ${v}`).join(' · ')), el('', mods || t('morphLookOnly')));
    if (d.bio) note.append(el('morphBio', d.bio));
    const on = me.on === d.id;
    list.append(row(name, note, [button(on ? t('morphNow') : t('morphOnBtn'), () => send({ t: 'morph', a: 'on', id: d.id }), on || me.cd > 0)], 'mrow morphRow' + (on ? ' on' : '')));
  }
}

export function initMorph(): void {
  addMenuTab({ id: 'morph', label: () => t('tabMorph'), draw: drawMorph, sig: () => [me, defs.length], mod: 'morph' });
  onMsg('me', (m) => { if (m.k === 'morph') { me = m.s as MorphMe; redraw(true); } });
  addNotices({ feed: ['morphOn', 'morphOff', 'morphEnd', 'morphGone', 'morphWait', 'morphFight', 'morphNone', 'charNew', 'charBad'] });
}
