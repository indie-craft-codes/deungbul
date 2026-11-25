// 화면 속 엔티티: 내 캐릭터(예측과 보정), 다른 엔티티(보간), 화면에만 서 있는 사람(상인, 게임이 세우는 NPC), 서버 사건의 연출.
import { BOSS, MONSTERS, SHOPS, classOf, isMonsterId, isSkillId, monsterDef, skillDef } from '../shared/defs';
import type { EnterInfo, Ev, ServerMsg } from '../shared/protocol';
import { walk } from '../shared/nav';
import { nav, view, world } from './app';
import { mixerEvery } from './assets';
import { ARROW_S, arrow, burst, hit, puff, recoilOf, shake } from './fx';
import { floatText, makeTag, placeTag, setTagHp, setTagName, settleTags, type Tag } from './hud/tags';
import { L, t } from './i18n';
import { rules } from './rules';
import { sfx } from './sound';
import { animate, cueAnim, makeHumanoid, makeMonster, setArmor, setBlade, setFlash, type Model } from './scene/models';
import { S, newMe, type Me, type Remote } from './state';

const INTERP_MS = 150; // 다른 엔티티는 이만큼 과거 시점을 그려서 스냅샷 사이를 부드럽게 잇는다
const SWING_S = 0.3;
const DIE_S = 0.3;
/** 쓰러지는 클립이 있는 모델은 클립을 다 틀고 이만큼 누워 있다가 사라진다 (길어도 DIE_MAX_S까지) */
const DIE_REST_S = 0.5, DIE_MAX_S = 2.5;
const CLOTH = [0x3f7fbf, 0x8a5ac0, 0x4c9a6a, 0xd08a2e, 0x4a6a8a, 0xc05a8a, 0x6a6ad0, 0x9a7a3a, 0x3fa0a0, 0xa04a4a];
const MY_CLOTH = 0xc9463d;
/** 직업에 맞는 손 장비: 궁수는 활, 마법사는 지팡이, 나머지는 검 */
/** 직업의 손 모양 (ClassDef.hand: 'sword', 'bow', 'staff' 또는 게임이 registerHand로 등록한 것) */
const gearOf = (cls: string): string => classOf(cls).hand;

type At = { x: number; z: number };
/** 화면에만 서 있는 사람들 (서버 엔티티가 아니다): 상인과, 게임이 세운 NPC */
const npcs: { x: number; z: number; tag: Tag; name: () => string }[] = [];

/**
 * 화면에만 서 있는 사람을 세운다. 이름은 언어가 바뀌면 다시 읽으므로 함수로 받고, look을 주면 그쪽을 바라본다.
 * 게임의 모듈이 자기 NPC(이 게임은 돌아온 주민)를 세울 때 부른다.
 */
export function addNpc(x: number, z: number, model: Model, name: () => string, look?: At): void {
  model.root.position.set(x, 0, z);
  if (look) model.root.rotation.y = Math.atan2(look.x - x, look.z - z);
  view.scene.add(model.root);
  npcs.push({ x, z, tag: makeTag(name(), 'npc', false), name });
}

/** 상점 자리에 세울 상인의 모습. 빈 칸은 틀의 기본(갈색 옷의 사람, 이름 ui.shop, 앞을 본다)을 쓴다 */
export interface MerchantLook { model?: Model; name?: () => string; look?: At }
/** 상점 자리마다 상인을 어떻게 세우는가. null을 돌려주면 그 자리에는 아무도 세우지 않는다 (가판대나 게시판인 게임) */
let merchantOf: (shop: At, i: number) => MerchantLook | null = () => ({});
/** 게임이 상인의 모델·이름·바라볼 곳을 정한다. 시작할 때(접속 전) 한 번 부른다 */
export function setMerchant(fn: (shop: At, i: number) => MerchantLook | null): void { merchantOf = fn; }

/** 상인들: 늘 제자리(SHOPS)에 서 있다 */
export function spawnMerchant(): void {
  SHOPS.forEach((s, i) => {
    const m = merchantOf(s, i);
    if (m) addNpc(s.x, s.z, m.model ?? makeHumanoid(0xb5863c, false), m.name ?? (() => L().ui.shop), m.look);
  });
}

/** 이름표에 적는 글: 길드가 있으면 이름 뒤에 붙인다 */
const withGuild = (id: number, name: string): string => { const g = S.gtags.get(id); return g ? `${name} 〈${g}〉` : name; };
/** 누군가의 길드 이름이 바뀌었다: 이름표를 다시 적는다 */
export function setGuildTag(id: number, guild: string): void {
  if (guild) S.gtags.set(id, guild); else S.gtags.delete(id);
  const me = S.me;
  if (me && id === me.id) { setTagName(me.tag, withGuild(id, me.name)); return; }
  const r = S.others.get(id);
  if (r && r.kind === 'p') setTagName(r.tag, withGuild(id, r.name));
}

/** 몬스터의 이름. 몰려온 적은 게임의 말(fmt.swarmFoe)로 꾸며 평소의 몬스터와 구별한다 */
const monsterName = (type: string, swarm = false): string => {
  const name = isMonsterId(type) ? L().monsters[type] : type;
  return swarm ? L().fmt.swarmFoe(name) : name;
};

// ---------- 만들고 지우기 ----------
export function spawnMe(id: number, name: string, x: number, z: number): Me {
  const model = makeHumanoid(MY_CLOTH);
  view.scene.add(model.root);
  S.me = newMe(id, name, x, z, model, makeTag(name, 'me', false));
  return S.me;
}

function addRemote(e: EnterInfo): void {
  const old = S.others.get(e.id);
  if (old) { if (!old.gone) return; dropRemote(old); }
  const monster = e.kind === 'm';
  const model = monster ? makeMonster(e.type) : makeHumanoid(CLOTH[e.id % CLOTH.length], gearOf(e.c), undefined, e.c);
  model.root.position.set(e.x, 0, e.z);
  model.root.rotation.y = e.face;
  view.scene.add(model.root);
  const name = monster ? monsterName(e.type, e.r === 1) : e.name;
  const boss = monster && isMonsterId(e.type) && !!monsterDef(e.type).boss;
  if (!monster && e.g) S.gtags.set(e.id, e.g);
  const tag = makeTag(monster ? name : withGuild(e.id, name), monster ? (boss ? 'mon boss' : e.r === 1 ? 'mon swarm' : 'mon') : '', monster);
  setTagHp(tag, e.hp, e.maxHp);
  if (!monster) { setBlade(model, e.w); setArmor(model, e.a ?? ''); tag.el.classList.toggle('ally', S.party.some((m) => m.id === e.id)); }
  S.others.set(e.id, {
    id: e.id, kind: e.kind, type: e.type, name, model, tag, h: monster && isMonsterId(e.type) ? MONSTERS[e.type].h : 2.5,
    buf: [{ t: performance.now(), x: e.x, z: e.z, face: e.face, moving: false }], x: e.x, z: e.z, face: e.face, walking: false, phase: Math.random() * 6,
    hp: e.hp, maxHp: e.maxHp, swing: 0, weapon: e.w, armor: e.a ?? '', cls: e.c, swarm: e.r === 1, dying: 0, gone: false,
  });
}

function dropRemote(r: Remote): void {
  view.scene.remove(r.model.root);
  r.tag.el.remove();
  S.others.delete(r.id);
}

/** 연결이 끊겼을 때: 서버가 알려 준 것을 모두 지운다 (돌아온 주민은 공유 상태가 다시 오면 맞춰진다). */
export function clearEntities(): void {
  for (const r of [...S.others.values()]) dropRemote(r);
  if (S.me) { view.scene.remove(S.me.model.root); S.me.tag.el.remove(); S.me = null; }
  view.targetRing.visible = false;
}

/** 언어가 바뀌면 몬스터와 NPC의 이름표를 다시 쓴다. */
export function relabel(): void {
  for (const r of S.others.values()) if (r.kind === 'm') { r.name = monsterName(r.type, r.swarm); setTagName(r.tag, r.name); }
  for (const n of npcs) setTagName(n.tag, n.name());
}

/** 직업이 바뀌면 모델을 새로 만든다 (검을 든 모습과 활을 든 모습이 다르다). */
function rebuild(holder: { model: Model }, cloth: number, cls: string): void {
  const old = holder.model.root;
  const model = makeHumanoid(cloth, gearOf(cls), undefined, cls);
  model.root.position.copy(old.position);
  model.root.rotation.y = old.rotation.y;
  view.scene.remove(old);
  view.scene.add(model.root);
  holder.model = model;
}

/** 누군가 무기나 직업을 바꿨다: 모습을 맞춘다. */
export function setGear(id: number, weapon: string, cls: string, armor: string): void {
  const me = S.me;
  if (me && id === me.id) {
    if (cls !== me.cls) rebuild(me, MY_CLOTH, cls);
    me.weapon = weapon; me.cls = cls; me.armor = armor;
    setBlade(me.model, weapon);
    setArmor(me.model, armor);
    return;
  }
  const r = S.others.get(id);
  if (!r || r.kind !== 'p') return;
  if (cls !== r.cls) rebuild(r, CLOTH[r.id % CLOTH.length], cls);
  r.weapon = weapon; r.cls = cls; r.armor = armor;
  setBlade(r.model, weapon);
  setArmor(r.model, armor);
}

export function renameEntity(id: number, name: string): void {
  const me = S.me;
  if (me && id === me.id) { me.name = name; setTagName(me.tag, withGuild(id, name)); return; }
  const r = S.others.get(id);
  if (r) { r.name = name; setTagName(r.tag, withGuild(id, name)); }
}

export function tagOf(id: number): Tag | undefined {
  return S.me && id === S.me.id ? S.me.tag : S.others.get(id)?.tag;
}

function posOf(id: number): { x: number; z: number; h: number } | null {
  if (S.me && id === S.me.id) return { x: S.me.x, z: S.me.z, h: 2.5 };
  const r = S.others.get(id);
  return r ? { x: r.x, z: r.z, h: r.h } : null;
}

// ---------- 서버가 보낸 것 반영 ----------
function onEvent(e: Ev, me: Me): void {
  // 공격 동작: 코드 모델은 swing(1에서 0으로)으로 팔을 휘두르고, 모델 파일은 공격 클립을 처음부터 튼다 (같은 신호)
  const swing = (id: number) => {
    if (id === me.id) { me.swing = 1; cueAnim(me.model, 'attack'); return; }
    const r = S.others.get(id);
    if (r) { r.swing = 1; cueAnim(r.model, 'attack'); }
  };
  switch (e[0]) {
    case 'h': {
      const [, src, dst, dmg, crit] = e;
      const p = posOf(dst);
      if (p) floatText(dst === me.id ? `-${dmg}` : String(dmg), p.x, p.h, p.z, dst === me.id ? 'hurt' : src === me.id ? (crit ? 'crit' : '') : 'small');
      swing(src);
      // 맞은 쪽: 모델 파일의 맞음 클립 (공격 중이면 끊지 않는다). 코드 모델은 하얗게 번쩍이는 것(fx의 recoil)뿐이다
      const dstModel = dst === me.id ? me.model : S.others.get(dst)?.model;
      if (dstModel) cueAnim(dstModel, 'hit');
      // 궁수가 쏜 것이면 화살이, 마법사가 쏜 것이면 불꽃이 날아간다
      const from = posOf(src);
      // 쏘는 직업이면(ClassDef.shot) 화살이나 불꽃이 날아간다. 몬스터는 직업이 없다
      const srcR = src === me.id ? null : S.others.get(src);
      const look = src === me.id || srcR?.kind === 'p' ? classOf(src === me.id ? me.cls : srcR!.cls) : null;
      // 몬스터는 정의의 shot (떨어져서 때리는 몬스터: MonsterDef.behavior 'ranged')
      const mShot = srcR?.kind === 'm' && isMonsterId(srcR.type) ? monsterDef(srcR.type).shot : undefined;
      const shot = look?.shot ?? mShot;
      const ranged = !!shot && !!from && !!p;
      if (ranged) arrow(from!.x, from!.z, p!.x, p!.z, shot!);
      // 타격감: 내가 때리거나 맞을 때는 크게(화면도 흔들린다), 남의 싸움은 작게
      if (p) {
        const mine = src === me.id, hurt = dst === me.id;
        if (hurt) sfx.hurt(); else if (mine) sfx.hit(crit === 1);
        hit({
          id: dst, x: p.x, z: p.z, h: p.h, fromX: from?.x ?? p.x, fromZ: from?.z ?? p.z + 1,
          power: hurt ? 1.1 : mine ? (crit ? 1.6 : 1) : 0.55,
          color: hurt ? 0xff6b5e : crit ? 0xffd24a : look?.hitColor ?? 0xfff3d0,
          shake: hurt ? 0.28 : mine ? (crit ? 0.22 : 0.07) : 0,
          delay: ranged ? ARROW_S : 0,
        });
      }
      break;
    }
    case 'd': {
      const r = S.others.get(e[1]);
      if (r) {
        // 쓰러지는 클립이 있으면 그것을 다 틀고 잠깐 누워 있다가 사라진다. 없으면 틀의 연출(줄어들기)
        const clip = cueAnim(r.model, 'die') ? r.model.anim?.length('die') ?? 0 : 0;
        r.dying = clip > 0 ? Math.min(DIE_MAX_S, clip + DIE_REST_S) : DIE_S;
        r.dieS = r.dying;
        puff(r.x, r.h * 0.4, r.z, 12, 0xe8e2d0); burst(r.x, r.z, 2.4, 0xe8e2d0, 0.35);
      }
      if (me.attackId === e[1]) { me.attackId = 0; shake(0.12); sfx.kill(); }
      break;
    }
    case 'r': {
      if (e[1] === me.id) { me.moving = false; me.path = null; me.attackId = 0; me.x = me.sx; me.z = me.sz; }
      else { const r = S.others.get(e[1]); if (r) r.buf = []; } // 다음 스냅샷 위치로 바로 옮긴다
      break;
    }
    case 's': {
      swing(e[1]);
      // 보스의 내려치기 예고: 맞는 범위가 붉은 고리로 천천히 차오른다. 다 차기 전에 벗어나야 한다
      if (e[2] === 'slam') { const b = posOf(e[1]); if (b) burst(b.x, b.z, BOSS.slamRadius, 0xff5a4a, BOSS.slamWarnS); break; }
      // 범위 기술: 대상이 있으면 대상 자리에, 없으면 쓴 사람 자리에 고리가 퍼진다
      const radius = isSkillId(e[2]) ? skillDef(e[2]).radius : undefined;
      const at = posOf(e[3]) ?? posOf(e[1]);
      const def = isSkillId(e[2]) ? skillDef(e[2]) : undefined;
      const self = def?.effect.kind === 'heal' || (def?.effect.kind === 'area' && def.effect.at === 'self');
      const at2 = self ? posOf(e[1]) : at; // 치유와 내 주변 기술은 쓴 사람을 중심으로 퍼진다
      if (radius && at2) { burst(at2.x, at2.z, radius, def?.color ?? 0xf0bb55); if (e[1] === me.id && def?.effect.kind === 'area') shake(0.16); }
      // 돌진: 떠난 자리에 흙먼지, 강화: 쓴 사람 둘레에 작은 고리
      const caster = posOf(e[1]);
      if (caster && def?.effect.kind === 'dash') { puff(caster.x, 0.3, caster.z, 10, 0xd8c9a8, 5); if (e[1] === me.id) shake(0.1); }
      if (caster && def?.effect.kind === 'buff' && !radius) burst(caster.x, caster.z, 1.6, def.color ?? 0xffd24a);
      break;
    }
    case 'buff': {
      // 강화가 걸렸다: 나라면 내 정보 창에 남은 시간을 띄운다 (hud/buffs.ts)
      if (e[1] === me.id) S.buffs.set(e[2], performance.now() + e[3] * 1000);
      const p = posOf(e[1]);
      if (p) puff(p.x, p.h * 0.6, p.z, 6, 0xffe08a, 2.5);
      break;
    }
    case 'stun': {
      const p = posOf(e[1]);
      if (p) floatText(t('stunned'), p.x, p.h, p.z, 'small');
      break;
    }
    case 'mh': {
      const r = S.others.get(e[1]);
      if (r) { r.maxHp = e[2]; r.tag.hp = -1; setTagHp(r.tag, r.hp, r.maxHp); }
      break;
    }
    case 'heal': {
      const p = posOf(e[1]);
      if (p) { floatText(`+${e[2]}`, p.x, p.h, p.z, 'heal'); burst(p.x, p.z, 2.2, 0x7fd68a); }
      break;
    }
  }
}

export function applySnapshot(m: Extract<ServerMsg, { t: 'snap' }>, now: number): void {
  const me = S.me;
  S.online = m.n;
  if (!me) return;
  me.sx = m.you[0]; me.sz = m.you[1]; me.srvMoving = m.you[2] === 1; me.hp = m.you[3]; me.srvTarget = m.you[4];
  for (const e of m.enter ?? []) addRemote(e);
  // 사건을 먼저 처리해야, 죽어서 사라지는 엔티티의 마지막 연출을 볼 수 있다
  for (const e of m.ev ?? []) onEvent(e, me);
  for (const id of m.leave ?? []) {
    const r = S.others.get(id);
    if (!r) continue;
    if (r.dying > 0) r.gone = true; else dropRemote(r);
  }
  for (const [id, x, z, face, moving, hp] of m.ents) {
    const r = S.others.get(id);
    if (!r || r.gone) continue;
    r.buf.push({ t: now, x, z, face, moving: moving === 1 });
    if (r.buf.length > 20) r.buf.shift();
    r.hp = hp;
    setTagHp(r.tag, hp, r.maxHp);
  }
}

// ---------- 매 프레임 ----------
function updateMe(m: Me, dt: number, now: number): void {
  // 공격 중: 서버와 같은 규칙으로 대상에게 다가가고, 사거리에 들면 멈춰서 바라본다
  if (m.attackId) {
    const t = S.others.get(m.attackId);
    if (!t || t.dying || t.gone || (!m.srvTarget && now - m.attackAt > 600)) m.attackId = 0; // 서버가 대상을 풀었다
    else if (Math.hypot(t.x - m.x, t.z - m.z) > classOf(m.cls).range - 0.15) { m.tx = t.x; m.tz = t.z; m.moving = true; m.lastCmd = now; }
    else { m.moving = false; m.face = Math.atan2(t.x - m.x, t.z - m.z); }
  }

  // 예측: 서버와 같은 코드로 먼저 움직인다
  if (m.moving) {
    walk(m, rules.speed(), dt, world.obstacles, nav, now / 1000); // 서버와 같은 길찾기
    m.phase += dt * 10;
    // 서버가 멈췄다고 하면 따른다 (명령이 도착할 시간은 준다)
    if (!m.srvMoving && now - m.lastCmd > 400) m.moving = false;
  }

  // 보정: 서버 위치가 정답이다. 크게 어긋나면 바로 맞추고, 아니면 조금씩 당긴다
  const ex = m.sx - m.x, ez = m.sz - m.z;
  if (Math.hypot(ex, ez) > 3) { m.x = m.sx; m.z = m.sz; m.path = null; }
  else { const k = Math.min(1, dt * (m.moving ? 1.5 : 8)); m.x += ex * k; m.z += ez * k; }

  if (m.swing > 0) m.swing = Math.max(0, m.swing - dt / SWING_S);
  const rc = recoilOf(m.id);
  setFlash(m.model, rc.flash);
  animate(m.model, m.x + rc.ox, m.z + rc.oz, m.face, m.moving, m.phase, dt, m.swing, rc.scale);
}

function updateRemote(r: Remote, dt: number, now: number): void {
  if (r.dying > 0) {
    r.dying -= dt;
    if (r.dying <= 0) {
      if (r.gone) { dropRemote(r); return; }
      r.model.root.visible = false; // 서버가 시야에서 빼 줄 때까지 숨긴다
    }
  }
  const buf = r.buf;
  if (buf.length) {
    const t = now - INTERP_MS;
    let a = buf[0], b = buf[buf.length - 1];
    if (t <= a.t) b = a;
    else if (t >= b.t) a = b;
    else for (let i = buf.length - 2; i >= 0; i--) if (buf[i].t <= t) { a = buf[i]; b = buf[i + 1]; break; }
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    r.x = a.x + (b.x - a.x) * k;
    r.z = a.z + (b.z - a.z) * k;
    r.face = b.face;
    r.walking = a.moving || b.moving;
  }
  r.phase += dt * 10;
  if (r.swing > 0) r.swing = Math.max(0, r.swing - dt / SWING_S);
  const rc = recoilOf(r.id);
  setFlash(r.model, rc.flash);
  // 쓰러짐: 틀의 연출은 DIE_S 동안 줄어들기, 쓰러지는 클립이 있으면 누운 채 있다가 마지막 0.25초에 줄어든다
  const shrink = r.dying <= 0 ? 1 : (r.dieS ?? DIE_S) > DIE_S ? Math.min(1, r.dying / 0.25) : Math.max(0.01, r.dying / DIE_S);
  // 모델 파일의 믹서는 멀거나 화면 밖이면 드물게 돌린다 (내 캐릭터 둘레가 기준)
  const every = r.model.anim ? mixerEvery(S.me ? Math.hypot(r.x - S.me.x, r.z - S.me.z) : 0, view.project(r.x, r.h * 0.5, r.z) !== null) : 1;
  animate(r.model, r.x + rc.ox, r.z + rc.oz, r.face, r.walking, r.phase, dt, r.swing, Math.max(0.01, shrink) * rc.scale, every);
}

export function updateEntities(dt: number, now: number): void {
  if (S.me) updateMe(S.me, dt, now);
  for (const r of [...S.others.values()]) updateRemote(r, dt, now);
}

/** 카메라를 옮긴 뒤에 불러야 이름표가 제자리에 붙는다. */
export function placeTags(now: number): void {
  if (S.me) placeTag(S.me.tag, S.me.x, 2.5, S.me.z, now);
  for (const r of S.others.values()) placeTag(r.tag, r.x, r.h, r.z, now, r.dying <= 0 && !r.gone && r.model.root.visible);
  for (const n of npcs) placeTag(n.tag, n.x, 2.5, n.z, now);
  settleTags();
}
