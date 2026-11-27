// 시험 도우미: 수집형의 저장 시험(saves, growthsaves)이 함께 쓰는 검사 모양.
// 깨진 저장을 다시 적어도 null이 없는가, 모듈을 끈 게임을 지난 저장이 그 칸을 지키고 다시 켠 게임이 이어서 읽는가.
import type { PlayerSave } from '../../server/store';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import type { ModuleId } from '../../shared/modules';
import { check } from '../harness';

/** 깨진 저장을 읽고 다시 적어도 null(NaN)이 없다. 있으면 그 언저리를 메시지에 적는다 */
export function resavesClean(g: Game, p: Ent): void {
  const out = JSON.stringify(g.players.export(p)), at = out.indexOf('null');
  check(at < 0, `깨진 저장을 읽고 다시 적어도 null(NaN)이 없다${at >= 0 ? ': …' + out.slice(Math.max(0, at - 40), at + 10) : ''}`);
}

/**
 * 모듈을 끈 게임(modules만 켠 것)이 읽고 다시 적어도 keys의 칸이 글자까지 그대로 남고 엔티티에는 gone의 칸이 없으며,
 * 그 저장을 다시 켠 게임(모듈 전부)이 이어서 읽는다(resumed). 검사 하나로 남기고, 틀린 것을 모두 적는다
 */
export function keepsThroughLean(o: { save: PlayerSave; name: string; pid: string; modules: ModuleId[]; keys: string[]; gone: string[]; resumed: (back: Ent) => boolean; what: string }): void {
  const lean = new Game({ plugins: [], modules: o.modules });
  const q = lean.players.spawn(o.name, false, structuredClone(o.save), o.pid);
  const kept = lean.players.export(q);
  const changed = o.keys.filter((k) => JSON.stringify(kept.ext?.[k]) !== JSON.stringify(o.save.ext?.[k])), present = o.gone.filter((k) => k in q);
  const back = new Game({ plugins: [] }).players.spawn(o.name, false, kept, o.pid);
  const resumed = o.resumed(back);
  check(!changed.length && !present.length && resumed,
    `모듈(${o.what})을 끈 게임이 읽고 다시 적어도 그 칸(${o.keys.join(', ')})이 그대로 남고(엔티티에는 칸이 없다), 다시 켠 게임은 이어서 읽는다`
    + (changed.length ? `. 바뀐 칸: ${changed.join(', ')}` : '') + (present.length ? `. 엔티티에 남은 칸: ${present.join(', ')}` : '') + (resumed ? '' : '. 다시 켠 게임이 이어 읽지 못했다'));
}
