// 라이브 콘텐츠(묶음 6)의 이름: 게임이 내용에 적은 문장 키(이벤트·임무·상품·업적·칭호·도감·시즌의 name)를 지금 언어의 글로 (uiText).
// ko.ts·en.ts의 안내문·우편 제목과 화면(engine/client/hud/live.ts)이 함께 쓴다.
import type { MsgArg } from '../../shared/messages';
import { SEASON, achieveDef, codexDef, competeRules, eventDef, goodsDef } from '../../shared/defs';
import { uiText } from './names';

const s = (v: MsgArg) => String(v);
export const evName = (id: MsgArg): string => { const e = eventDef(s(id)); return e ? uiText.get(e.name) : s(id); };
export const missionName = (ev: MsgArg, mid: MsgArg): string => { const m = eventDef(s(ev))?.missions?.[s(mid)]; return m ? uiText.get(m.name) : s(mid); };
export const goodsName = (id: MsgArg): string => { const g = goodsDef(s(id)); return g ? uiText.get(g.name) : s(id); };
export const achName = (id: MsgArg): string => { const a = achieveDef(s(id)); return a ? uiText.get(a.name) : s(id); };
export const titleName = (id: MsgArg): string => { const t = achieveDef(s(id))?.title; return t ? uiText.get(t) : ''; };
export const codexName = (id: MsgArg): string => { const c = codexDef(s(id)); return c ? uiText.get(c.name) : s(id); };
export const seasonName = (): string => (SEASON ? uiText.get(SEASON.name) : '');
/** 경쟁(묶음 8)의 등급 이름 (COMPETE.tiers의 자리: 게임의 문장 키). 없으면 빈 글 */
export const tierText = (i: MsgArg): string => { const d = competeRules()?.tiers?.[Number(i)]; return d ? uiText.get(d.name) : ''; };
