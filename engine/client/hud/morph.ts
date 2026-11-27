// 캐릭터 정의(chars 모듈)와 변신(morph 모듈)의 화면. 서버의 짝은 engine/server/game/systems/chars.ts, morph.ts.
//   chars  개인 상태 'chars'(정의의 목록)를 받아 알고 있는 정의(engine/shared/defs/chardef.ts의 setKnownChars)를 채운다.
//          roster를 함께 고른 게임에서는 정의를 영웅의 표에도 더한다 (영웅 탭·뽑기 결과·편성의 영웅이 그 이름과 겉모습으로 보인다)
//   morph  메뉴의 '변신' 탭: 가진 캐릭터마다 얼굴 그림(부품으로 그린 작은 그림), 이름·등급·소개·능력치·보정, 변신 단추. 변신 중이면 남은 시간과 풀기 단추
// 게임이 더 할 수 있는 것: 정의가 바뀔 때 듣기(onChars), 내 변신 상태 읽기(myMorph).
import * as THREE from 'three';
import { addHeroDef, charHero, charStats, charText, dropHeroDef, HERO_RARITIES, HERO_ROLES, knownChar, MORPH_RULE_VIEW, morphCard, morphMods, morphStats, setCharLang, setKnownChars, type CharDef, type HeroesMe, type MorphMe, type OwnedHero } from '../../shared/defs';
import { portraitArt } from '../art';
import { tintRarity } from './rarity';
import { onMsg } from '../bus';
import { relabel } from '../entities';
import { L, onLangChange, t } from '../i18n';
import { S } from '../state';
import { myHeroes } from './collect';
import { rarityName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { hasModule } from '../mods';
import { send } from '../net';
import { makeHumanoid } from '../scene/models';
import { addMenuTab } from './menu';
import { button, el, emptyState, redraw, row, span } from './menu/parts';
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

/** 화면의 언어를 캐릭터 정의의 글(CharDef.text)에 알린다: 이름·소개가 그 언어로 (없는 언어는 정의의 글) */
const syncLang = (): void => setCharLang(L().code);

export function initChars(): void {
  const roster = hasModule('roster');
  syncLang();
  onLangChange(() => { syncLang(); portraits.clear(); redraw(true); });
  onMsg('me', (m) => {
    if (m.k !== 'chars') return;
    const old = defs;
    defs = Array.isArray(m.s) ? (m.s as CharDef[]) : [];
    setKnownChars(defs);
    portraits.clear();
    if (roster) { for (const d of old) dropHeroDef(d.id); for (const d of defs) addHeroDef(d.id, charHero(d)); }
    for (const fn of fns) fn(defs);
    // 정의보다 먼저 시야에 든 영웅의 이름표가 id로 그려져 있을 수 있다: 이름표를 다시 쓴다
    relabel();
    redraw(true);
  });
}

/** 가진 영웅의 줄 (개인 상태 heroes: [레벨, 별, 조각, 기술 레벨?, 각성?])을 영웅의 상태로 */
const ownedOf = (line: HeroesMe[string] | undefined): OwnedHero | undefined => (line ? { lv: line[0], stars: line[1], shards: line[2], ...(line[3] && line[3] > 1 ? { skill: line[3] } : {}), ...(line[4] ? { awaken: line[4] } : {}) } : undefined);
/**
 * 그 캐릭터로 변신했을 때의 능력치 (능력치 대체 방식: MORPH_RULES.stats. 아니면 null). 서버의 싸움과 같은 셈(morphCard → morphStats)이다:
 * 영웅 탭의 카드와 변신 탭이 이것을 보인다
 */
export function morphStatsOf(id: string): { card: ReturnType<typeof morphCard>; s: { hp: number; atk: number } } | null {
  const d = knownChar(id);
  if (!d || !MORPH_RULE_VIEW.stats) return null;
  const card = morphCard(d, hasModule('roster') ? ownedOf(myHeroes()[id]) : undefined, { lv: S.me?.lv ?? 1 });
  const s = morphStats(card);
  return s ? { card, s } : null;
}

// ---------- 얼굴 그림: 작은 그리기 하나를 두고 정의마다 한 번 그려 그림(data URL)으로 간직한다 ----------
const portraits = new Map<string, string>();
let shot: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null | undefined;
/**
 * 캐릭터 정의의 서 있는 그림 (부품으로 그린 모습, data URL. 그릴 수 없는 곳이면 빈 글자). 크기를 주면 그 크기로 (게임의 큰 그림: 홈 화면의 대표 캐릭터).
 * 정의·크기마다 한 번 그려 간직한다. 게임이 그림 파일을 'portrait:<id>'로 등록했으면(engine/client/art.ts) 그 그림을 돌려준다 (그리지 않는다)
 */
export function charPortrait(d: CharDef, w = 96, h = 112): string { return portraitArt(d.id) ?? portrait(d, w, h); }
function portrait(d: CharDef, w = 96, h = 112): string {
  const key = w === 96 && h === 112 ? d.id : `${d.id}@${w}x${h}`;
  const have = portraits.get(key);
  if (have !== undefined) return have;
  let url = '';
  try {
    if (shot === undefined) {
      const canvas = document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setSize(w, h, false);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(2, 4, 3);
      scene.add(sun);
      const cam = new THREE.PerspectiveCamera(32, w / h, 0.1, 30);
      cam.position.set(1.8, 2.1, 5.4);
      cam.lookAt(0, 1.25, 0);
      shot = { r, scene, cam };
    }
    if (shot) {
      shot.r.setSize(w, h, false); shot.cam.aspect = w / h; shot.cam.updateProjectionMatrix();
      const m = makeHumanoid(d.look.colors.cloth ?? 0x8a8a8a, false, d.look.colors.skin ?? 0xf0c9a0, undefined, undefined, d.look);
      m.root.rotation.y = 0.35;
      shot.scene.add(m.root);
      shot.r.render(shot.scene, shot.cam);
      shot.scene.remove(m.root);
      url = shot.r.domElement.toDataURL('image/png');
    }
  } catch { shot = null; } // 그릴 수 없는 곳 (WebGL이 없다): 그림 없이 글만
  portraits.set(key, url);
  return url;
}

// ---------- 변신 탭 ----------
const tinted = tintRarity;
/** 역할의 이름 (HERO_ROLES의 이름 키. 없는 역할은 id 그대로) */
const roleName = (id: string): string => { const r = HERO_ROLES[id]; return r ? uiText.get(r.name) : id; };
const statName = (k: string): string => { const s = charStats()[k]; return s?.name ? uiText.get(s.name) : k === 'atk' ? t('charAtk') : k === 'hp' ? t('charHp') : k; };

function drawMorph(list: HTMLElement): void {
  const loc = L(), owned = me.own.map((id) => knownChar(id)).filter((d): d is CharDef => !!d);
  if (me.on) {
    const d = knownChar(me.on);
    const head = el('note morphNow');
    head.append(span('mtag', t('morphNow')), ` ${d ? charText(d).name : me.on} · ${loc.fmt.morphLeft(me.left)}`);
    list.append(row(head, '', [button(t('morphOffBtn'), () => send({ t: 'morph', a: 'off' }))], 'mrow morphHead'));
  } else if (me.cd > 0) list.append(el('note', loc.fmt.morphCd(me.cd)));
  if (!owned.length) { list.append(emptyState('morph', t('morphNone'))); return; }
  for (const d of owned) {
    const name = tinted(el('iname'), d.rarity), pic = portrait(d);
    if (pic) { const img = document.createElement('img'); img.className = 'morphPic'; img.src = pic; img.alt = ''; name.append(img); }
    const text = charText(d);
    name.append(span('', text.name));
    const h = ownedOf(myHeroes()[d.id]), note = el('note'), mods = loc.fmt.morphBonus(morphMods(d, h ? { lv: h.lv, stars: h.stars } : undefined));
    const role = d.role ? ` · ${roleName(d.role)}` : '';
    note.append(el('', `${HERO_RARITIES.length ? rarityName(d.rarity) : ''}${role}`));
    // 능력치 대체 방식: 카드(영웅 탭과 같은 수)와 변신 시 능력치. 아니면 정의의 능력치와 보정
    const ms = morphStatsOf(d.id);
    if (ms) note.append(el('', loc.fmt.morphCard(ms.card.lv, ms.card.stars, ms.card.atk, ms.card.hp)), el('mstat', loc.fmt.morphStats(ms.s.hp, ms.s.atk)));
    else note.append(el('', Object.entries(d.stats).map(([k, v]) => `${statName(k)} ${v}`).join(' · ')));
    if (mods || !ms) note.append(el('', mods || t('morphLookOnly')));
    if (text.bio) note.append(el('morphBio', text.bio));
    const on = me.on === d.id;
    list.append(row(name, note, [button(on ? t('morphNow') : t('morphOnBtn'), () => send({ t: 'morph', a: 'on', id: d.id }), on || me.cd > 0)], 'mrow morphRow' + (on ? ' on' : '')));
  }
}

export function initMorph(): void {
  addMenuTab({ id: 'morph', label: () => t('tabMorph'), draw: drawMorph, sig: () => [me, defs.length, hasModule('roster') ? myHeroes() : 0, S.me?.lv], mod: 'morph' });
  onMsg('me', (m) => { if (m.k === 'morph') { me = m.s as MorphMe; redraw(true); } });
  addNotices({ feed: ['morphOn', 'morphOff', 'morphEnd', 'morphGone', 'morphWait', 'morphFight', 'morphNone', 'charNew', 'charBad'] });
}
