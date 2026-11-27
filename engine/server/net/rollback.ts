// 계정 단위 롤백 (운영 도구, docs/genre-features.md 5.5): 자동 백업(store/backup.ts) 파일에서 한 저장 키의 캐릭터 저장만 읽어, 그 사람만 그 시점으로 되돌린다.
// 관리자 명령 rollback (관리자 통로 net/admin.ts의 명령표 끝에 더해진다). 차례: 미리보기 → 확인 → 실행.
//   rollback list 이름                    백업 파일마다 그 사람의 저장(레벨·재화·가방) 한 줄. 최근 것부터
//   rollback preview 이름 백업            지금과 그 백업의 차이, 장부(통로 밖의 변화: 그 사람 것과 서버 전체의 other·tick 줄)로 그 사이의 변화, 그리고 확인 코드
//   rollback apply 이름 백업 확인코드      실행: 접속 중이면 먼저 끊고(그때 저장된다), 지금 상태를 따로 보관(player_stash)한 뒤 백업의 저장을 적는다.
//                                          재화의 차이는 장부에 원인 rollback으로 적는다 (재화 흐름이 맞게). 마지막 저장 시각(seen)은 지금으로 둔다(쉬는 동안의 보상이 백업 뒤의 시간만큼 생기지 않게)
//   rollback stash 이름                   따로 보관한 것 (되돌리기 전의 상태)
//   rollback undo 이름 보관번호 확인코드    보관한 것으로 다시 되돌린다 (같은 차례: 지금 상태를 또 보관한다)
// 백업은 파일 이름(auto-…db, 앞부분만 적어도 된다)이나 'latest'(가장 최근)로 가리킨다. 확인 코드는 미리보기가 준다: 그 사람·그 백업을 본 뒤에만 실행할 수 있게.
// 되돌리지 않는 것 (한 사람의 저장 밖에 있는 것): 월드에 맡아 둔 우편, 거래소에 올린 물건, 길드 창고, 다른 사람에게 건너간 것. 미리보기가 그 수를 알린다.
import fs from 'node:fs';
import path from 'node:path';
import { ECON_UNKNOWN } from '../../shared/defs';
import type { MsgArg, MsgKey } from '../../shared/messages';
import type { Game } from '../game/game';
import { dayOf } from '../game/entity';
import { personalData } from '../game/personal';
import { AUTO_NAME } from '../store/backup';
import { readBackupPlayer } from '../store/sqlite';
import { hasEcon, hasOps, type EconRow, type PlayerSave, type Store } from '../store';
import { CURS } from '../game/systems/wallet';

export interface RollbackHost {
  game: Game; store: Store;
  /** 백업 폴더 (없으면 롤백을 할 수 없다) */
  dir(): string | null;
  /** 이름으로 저장 키를 찾는다 (접속 중이면 그 사람) */
  find(name: string): { key: string | null; name: string; online: boolean } | null;
  /** 그 저장 키의 연결을 끊는다 (저장한 뒤). 끊은 수 */
  drop(key: string, k: MsgKey, ...a: MsgArg[]): number;
  /** 지금 접속 중인 그 사람의 저장 값 (접속 중이 아니면 null) */
  live(key: string): PlayerSave | null;
}
type Out = string | { out: string; data: unknown };

const when = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
/** 한 줄 요약에 쓰는 칸 */
interface Brief { lv: number; gold: number; sparks: number; exp: number; items: number; gear: number; seen: number }
export function brief(s: PlayerSave): Brief {
  const ext = (s.ext ?? {}) as Record<string, unknown>, gear = ext.gear as { list?: unknown[] } | undefined;
  return {
    lv: s.lv ?? 1, gold: s.gold ?? 0, sparks: s.sparks ?? 0, exp: s.exp ?? 0,
    items: Object.values(s.items ?? {}).reduce((a, b) => a + (Number(b) || 0), 0), gear: Array.isArray(gear?.list) ? gear.list.length : 0, seen: s.seen ?? 0,
  };
}
/** 한 줄: 레벨, 재화마다(id와 수), 재료 수, 장비 수 */
const briefText = (b: Brief): string => `Lv${b.lv} ${CURS.map((c) => `${c} ${b[c]}`).join(' ')} 재료 ${b.items} 장비 ${b.gear}`;
/** 미리보기의 확인 코드: 그 저장 키와 그 백업(파일 이름과 그 저장의 시각) */
export function confirmCode(key: string, file: string, at: number): string {
  // FNV-1a 두 벌 (비밀이 아니다: 미리보기를 본 뒤에만 실행하게 하는 표일 뿐)
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (const ch of `${key}|${path.basename(file)}|${at}`) { const c = ch.charCodeAt(0); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x01000193) >>> 0; }
  return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).slice(4, 12);
}

export function rollbackCommands(host: RollbackHost): Record<string, (a: string[], by: string) => Out> {
  const g = host.game, store = host.store;
  const ops = hasOps(store) ? store : null;
  const files = (): string[] => {
    const dir = host.dir();
    if (!dir) return [];
    try { return fs.readdirSync(dir).filter((n) => AUTO_NAME.test(n) || /\.db$/.test(n)).sort().reverse().map((n) => path.join(dir, n)); } catch { return []; }
  };
  const pick = (raw: string | undefined): string | null => {
    const list = files();
    if (!raw || raw === 'latest') return list[0] ?? null;
    return list.find((f) => path.basename(f) === raw) ?? list.find((f) => path.basename(f).startsWith(raw)) ?? null;
  };
  /** 지금의 저장: 접속 중이면 지금 값, 아니면 저장소의 것 */
  const nowSave = (key: string): PlayerSave | null => host.live(key) ?? store.loadPlayer(key);

  /** 차이: 칸마다 [백업, 지금] */
  function diff(from: Brief, to: Brief): string[] {
    return (['lv', ...CURS, 'items', 'gear'] as const).filter((k) => from[k] !== to[k]).map((k) => `    ${k}: 지금 ${to[k]} → 백업 ${from[k]} (${from[k] - to[k] >= 0 ? '+' : ''}${from[k] - to[k]})`);
  }

  /** 백업의 저장을 그 사람에게 적는다 (apply와 undo가 함께 쓴다) */
  function restore(key: string, name: string, save: PlayerSave, by: string, note: string): string {
    const n = host.drop(key, 'rolledBack');
    const cur = store.loadPlayer(key);
    let stashId = 0;
    const now = g.now();
    const next: PlayerSave = { ...structuredClone(save), seen: now, auto: false };
    store.transaction(() => {
      if (cur && ops) stashId = ops.addStash({ key, at: now, by: by.slice(0, 40), note: note.slice(0, 200), save: cur });
      store.savePlayer(key, next);
      // 재화의 차이를 장부에 (원인 rollback): 되돌린 만큼 사라지거나 생긴 것이 재화 흐름에 남게
      if (cur && g.has('economy') && hasEcon(store)) {
        const rows: EconRow[] = [];
        for (const cur2 of CURS) {
          const d = (next[cur2] ?? 0) - (cur[cur2] ?? 0);
          if (d) rows.push({ day: dayOf(now), cur: cur2, why: 'rollback', dir: d > 0 ? '+' : '-', amount: Math.abs(d), n: 1 });
        }
        if (rows.length) store.addEcon(rows);
      }
    });
    return `${name}을(를) 되돌렸습니다 (${note})${n ? `, 연결 ${n}개를 먼저 끊음` : ''}. 되돌리기 전의 상태는 보관 #${stashId || '-'}에 있습니다 (rollback undo ${name} ${stashId || '번호'} 코드).\n  지금: ${briefText(brief(next))}`;
  }

  const rollback = (a: string[], by: string): Out => {
    const sub = a[0] ?? '';
    const use = '쓰는 법: rollback list 이름 | preview 이름 백업|latest | apply 이름 백업 확인코드 | stash 이름 | undo 이름 보관번호 확인코드';
    if (!['list', 'preview', 'apply', 'stash', 'undo'].includes(sub)) return use;
    const t = host.find(a[1] ?? '');
    if (!t) return `'${a[1] ?? ''}' 이름의 캐릭터가 없습니다.`;
    if (!t.key) return `${t.name}은(는) 손님(저장되지 않는 캐릭터)이라 되돌릴 저장이 없습니다.`;
    const key = t.key;
    if (sub === 'list') {
      const rows = files().map((f) => { const r = readBackupPlayer(f, key); return { file: path.basename(f), at: fs.statSync(f).mtimeMs, save: r ? brief(r.save) : null, saved: r?.updated ?? 0 }; });
      if (!rows.length) return '백업 파일이 없습니다 (자동 백업이 꺼져 있거나 아직 만들지 않았다).';
      const cur = nowSave(key);
      return { out: [`${t.name}  지금: ${cur ? briefText(brief(cur)) : '저장 없음'}`, ...rows.map((r) => `  ${r.file}  ${r.save ? `${briefText(r.save)}  (그때의 마지막 저장 ${r.saved ? when(r.saved) : '-'})` : '이 백업에는 이 캐릭터가 없음'}`)].join('\n'), data: { name: t.name, now: cur ? brief(cur) : null, backups: rows } };
    }
    if (sub === 'stash') {
      if (!ops) return '이 저장소는 보관을 적지 않습니다.';
      const list = ops.stashes(key, 20);
      return { out: list.length ? list.map((s) => `  #${s.id}  ${when(s.at)}  ${s.by}  ${s.note}  ${briefText(brief(s.save))}`).join('\n') : '보관한 것이 없습니다.', data: list.map((s) => ({ id: s.id, at: s.at, by: s.by, note: s.note, save: brief(s.save) })) };
    }
    if (sub === 'undo') {
      if (!ops) return '이 저장소는 보관을 적지 않습니다.';
      const id = Number(a[2]), s = ops.stashes(key, 200).find((x) => x.id === id);
      if (!s) return `보관 #${a[2] ?? ''}이(가) 없습니다 (rollback stash ${t.name}).`;
      const code = confirmCode(key, `stash-${s.id}`, s.at);
      if (a[3] !== code) return `확인 코드가 맞지 않습니다. 이 보관으로 되돌리려면: rollback undo ${t.name} ${s.id} ${code}\n  보관: ${briefText(brief(s.save))}`;
      return restore(key, t.name, s.save, by, `보관 #${s.id}로`);
    }
    const file = pick(a[2]);
    if (!file) return `백업을 찾지 못했습니다: ${a[2] ?? '(없음)'} (rollback list ${t.name})`;
    const got = readBackupPlayer(file, key);
    if (!got) return `${path.basename(file)}에는 ${t.name}의 저장이 없습니다.`;
    const code = confirmCode(key, file, got.updated);
    if (sub === 'preview') {
      const cur = nowSave(key), b = brief(got.save), c = cur ? brief(cur) : null;
      const since = got.updated || fs.statSync(file).mtimeMs;
      const strays = g.has('economy') ? g.ledger.strayList(key).filter((s) => s.at >= since) : [];
      const serverRows = g.has('economy') && hasEcon(store) ? store.econ(dayOf(since)).filter((r) => ECON_UNKNOWN.includes(r.why)) : [];
      // 월드에 있는 그 사람의 몫 (맡아 둔 우편, 거래소의 물건, 길드 …: engine/server/game/personal.ts). 롤백은 이것을 건드리지 않는다
      const world: string[] = [];
      for (const pd of personalData(g)) { try { const v = pd.get(key); if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) world.push(pd.name); } catch { /* 읽지 못한 몫은 빼고 */ } }
      const lines = [
        `${t.name}  백업 ${path.basename(file)} (그때의 마지막 저장 ${got.updated ? when(got.updated) : '-'})${t.online ? '  [접속 중: 실행하면 먼저 끊는다]' : ''}`,
        `  백업: ${briefText(b)}`, `  지금: ${c ? briefText(c) : '저장 없음'}`,
        ...(c ? (diff(b, c).length ? ['  바뀌는 것:', ...diff(b, c)] : ['  바뀌는 것: 없음 (같은 상태)']) : []),
        `  장부 (그 뒤로 이 사람에게서 난 통로 밖의 변화, 서버가 켜진 뒤의 것만): ${strays.length ? '' : '없음'}`,
        ...strays.slice(-10).map((s) => `    ${when(s.at)}  ${s.cur} ${s.d > 0 ? '+' : ''}${s.d}  (${s.why})`),
        `  장부 (서버 전체의 other·tick 줄, ${dayOf(since)}부터): ${serverRows.length ? serverRows.map((r) => `${r.day} ${r.cur} ${r.dir}${r.amount}(${r.why})`).join(', ') : '없음'}`,
        ...(world.length ? [`  되돌리지 않는 것 (월드에 있는 이 사람의 몫): ${world.join(', ')}`] : []),
        `  실행: rollback apply ${t.name} ${path.basename(file)} ${code}`,
      ];
      return { out: lines.join('\n'), data: { name: t.name, online: t.online, file: path.basename(file), backupAt: got.updated, backup: b, now: c, strays, serverRows, world, code } };
    }
    // apply
    if (a[3] !== code) return `확인 코드가 맞지 않습니다. 먼저 미리보기를 보세요: rollback preview ${t.name} ${path.basename(file)}`;
    return restore(key, t.name, got.save, by, `백업 ${path.basename(file)}로`);
  };
  return { rollback };
}
