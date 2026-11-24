// 3D 위치를 따라다니는 글자: 이름표, 말풍선, 떠오르는 숫자.
import { $, clamp, view } from '../app';

export interface Tag { el: HTMLDivElement; say: HTMLSpanElement; label: HTMLDivElement; bar: HTMLElement | null; shown: boolean; sayUntil: number; hp: number }

const root = $('tags');

export function makeTag(name: string, cls: string, withHp: boolean): Tag {
  const el = document.createElement('div');
  el.className = 'tag ' + cls;
  const say = document.createElement('span');
  say.className = 'say';
  say.hidden = true;
  const label = document.createElement('div');
  label.textContent = name;
  el.append(say, label);
  let bar: HTMLElement | null = null;
  if (withHp) {
    const wrap = document.createElement('div');
    wrap.className = 'hpw';
    bar = document.createElement('i');
    wrap.appendChild(bar);
    el.appendChild(wrap);
  }
  root.appendChild(el);
  return { el, say, label, bar, shown: true, sayUntil: 0, hp: -1 };
}

/** 이번 프레임에 놓을 이름표들. settleTags가 겹치는 것을 벌린 뒤 한꺼번에 놓는다 */
const placing: { tag: Tag; x: number; y: number }[] = [];

export function placeTag(tag: Tag, x: number, y: number, z: number, now: number, visible = true): void {
  const p = visible ? view.project(x, y, z) : null;
  const show = p !== null;
  if (p) placing.push({ tag, x: p.x, y: p.y });
  if (show !== tag.shown) { tag.shown = show; tag.el.hidden = !show; }
  if (tag.sayUntil && now > tag.sayUntil) { tag.sayUntil = 0; tag.say.hidden = true; }
}

/**
 * 모든 이름표의 자리를 정한 뒤에 부른다. 여럿이 한 점에 몰리면(보스전) 이름표가 뭉쳐 읽을 수 없으므로,
 * 화면 아래쪽(가까운 쪽) 것부터 놓고 겹치는 것은 위로 밀어 올린다.
 */
export function settleTags(): void {
  placing.sort((a, b) => b.y - a.y);
  const placed: { x: number; top: number; bottom: number; w: number }[] = [];
  for (const it of placing) {
    const h = (it.tag.bar ? 27 : 18) + (it.tag.sayUntil ? 26 : 0);
    const w = Math.max(54, it.tag.label.textContent!.length * 12);
    let y = it.y;
    for (let pass = 0; pass < 6; pass++) {
      const hit = placed.find((o) => Math.abs(o.x - it.x) < (o.w + w) / 2 && y > o.top && y - h < o.bottom);
      if (!hit) break;
      y = hit.top - 1;
    }
    placed.push({ x: it.x, top: y - h, bottom: y, w });
    it.tag.el.style.transform = `translate(${it.x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
  }
  placing.length = 0;
}

export function setTagName(tag: Tag, name: string): void { tag.label.textContent = name; }

export function setTagHp(tag: Tag, hp: number, maxHp: number): void {
  if (!tag.bar || tag.hp === hp) return;
  tag.hp = hp;
  tag.bar.style.width = `${clamp(hp / maxHp, 0, 1) * 100}%`;
}

/** 머리 위 말풍선 */
export function speak(tag: Tag, text: string): void {
  tag.say.textContent = text;
  tag.say.hidden = false;
  tag.sayUntil = performance.now() + 4500;
}

interface Float { el: HTMLDivElement; x: number; y: number; z: number; t: number; ox: number }
let floatSide = 1;
const floats: Float[] = [];

/** 떠오르는 숫자 (피해, 회복). cls로 모양을 고른다: '', 'crit', 'hurt', 'heal', 'small' */
export function floatText(text: string, x: number, y: number, z: number, cls: string): void {
  if (floats.length > 40) return;
  const el = document.createElement('div');
  el.className = 'float ' + cls;
  el.textContent = text;
  root.appendChild(el);
  // 연달아 뜨는 숫자가 한 줄로 겹치지 않게 좌우로 번갈아 벌린다
  floatSide = -floatSide;
  floats.push({ el, x: x + (Math.random() - 0.5) * 0.6, y, z, t: 0, ox: floatSide * (8 + Math.random() * 22) });
}

export function updateFloats(dt: number): void {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt; f.y += dt * 1.7;
    const p = f.t > 0.9 ? null : view.project(f.x, f.y, f.z);
    if (!p) { f.el.remove(); floats.splice(i, 1); continue; }
    f.el.style.transform = `translate(${(p.x + f.ox).toFixed(1)}px,${(p.y - 24).toFixed(1)}px) translate(-50%,-100%)`; // 이름표 위에서 뜨게 조금 올린다
    f.el.style.opacity = String(1 - Math.pow(f.t / 0.9, 3));
  }
}
