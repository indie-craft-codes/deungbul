// 두 게임을 잇는 이 게임의 규칙. 두 게임(계약의 탑 = 단계, 울림골 = 들판)을 오가는 것과 소유·변신의 잇기는 틀의 칸이 맡는다:
//   게임 안의 모드(modes: MODE_RULES), 편성은 탑에서만(SQUAD_RULES.where), 가진 영웅 = 변신 목록(MORPH_RULES.fromRoster), 카드 능력치 = 변신 능력치(MORPH_RULES.stats),
//   보이지 않는 쪽 이어 가기(MODE_RULES.fieldStay·stageStay), 자동 사냥의 안전장치(g.away.safety). 이 파일은 그 위의 게임 몫만 한다:
//   1. 메아리 = 캐릭터 정의: 서버가 켜질 때 손으로 쓴 정의(./echoes.ts)를 g.chars.add로 검증해 더한다 (chars가 영웅의 표에 더한다)
//   2. 처음 온 사람: 골드·물약·처음 메아리
//   3. 임무: 뽑기·단계·변신을 일일·주간 임무로 센다 (뽑기에는 틀의 사건이 없어 g.gacha.draw를 감싸 센다: docs/proof-echopact.md 빈 곳 5)
//   4. 안전장치의 기본값 (사람마다 설정 창에서 바꾼다)
//   5. 저장 이전: 예전(모드가 없던) 저장 → 들판에서 이어지게, 변신만 가졌던 메아리는 영웅으로
import { BANNER_TABLE, isHeroId } from '@engine/shared/defs';
import type { Ent, Game } from '@engine/server';
import { MODE, PACT_KINDS, SAFETY, STARTER, STARTER_ECHO } from '../shared/content/pact';
import { ECHO_DEFS } from './echoes';

/** 처음 온 사람인가: 메아리도 뽑기 기록도 없다 */
const fresh = (p: Ent): boolean => Object.keys(p.heroes).length === 0 && p.pulls.length === 0;

/**
 * 예전 저장(게임의 버전 gv 0: 모드가 없고 동료가 들판에서도 따라다니던 때)을 올린다.
 *   - 그 사람은 들판에서 놀았다: 모드를 울림골(vale)로 둔다 (처음 온 사람의 모드는 탑이다)
 *   - 변신의 소유(ext.morph.own)가 이제 영웅의 소유에서 읽힌다: 변신으로만 가졌던 메아리가 있으면 영웅(1레벨·그 등급의 처음 별)으로 더한다 (잃지 않게)
 *   - ext.morph의 on·left·cd(지금의 변신)는 그대로 읽힌다
 */
export function upgradeSave(save: { ext?: Record<string, unknown> }): void {
  const ext = (save.ext ??= {});
  if (!ext.mode) ext.mode = { id: MODE.vale };
  const own = (ext.morph as { own?: unknown } | undefined)?.own;
  if (Array.isArray(own)) {
    const roster = (ext.roster && typeof ext.roster === 'object' ? ext.roster : (ext.roster = {})) as Record<string, unknown>;
    for (const id of own) if (typeof id === 'string' && !Object.hasOwn(roster, id)) roster[id] = [1, null, 0];
  }
}

export function installPact(g: Game): void {
  // 1. 정의를 더한다: 모든 시스템이 만들어진 뒤(ready), 사람이 들어오기 전. 같은 id는 바꾼다(고친 정의가 다음 시작에 반영된다)
  g.ready.push(() => {
    for (const raw of ECHO_DEFS) {
      const r = g.chars.add(raw, { replace: true });
      if (!r.ok) console.warn(`[echopact] 메아리 정의가 거절됐다: ${r.issues.map((x) => `${x.code}@${x.path}`).join(', ')}`);
    }
    // 뽑기 판의 id가 모두 정의로 들어왔는가 (빠지면 그 칸은 판에서 조용히 빠진다: 공개 확률표도 함께 바뀌므로 켜질 때 알린다)
    for (const [id, b] of Object.entries(BANNER_TABLE)) {
      const missing = b.pool.filter((s) => !isHeroId(s.hero)).map((s) => s.hero);
      if (missing.length) console.warn(`[echopact] 배너 ${id}의 판에 정의가 없는 메아리: ${missing.join(', ')}`);
    }
  });

  // 2. 처음 온 사람 (처음 메아리는 편성의 빈 자리에 저절로: SQUAD_RULES.autoFill. 변신 목록에도 저절로: fromRoster)
  g.on('playerJoined', (p) => {
    if (!fresh(p)) return;
    if (STARTER.gold) g.wallet.add(p, 'gold', STARTER.gold, 'start');
    for (const [id, n] of Object.entries(STARTER.items ?? {})) g.bag.putItem(p, id as Parameters<typeof g.bag.putItem>[1], n, 'start');
    g.roster.grant(p, STARTER_ECHO);
  });

  // 3. 임무: 단계를 깸, 변신함, 뽑음
  g.ready.push(() => {
    const daily = g.daily, gacha = g.gacha;
    g.on('stageCleared', (p) => daily.add(p, PACT_KINDS.stage, 1));
    g.on('morphed', (p, _id, why) => { if (why === 'on') daily.add(p, PACT_KINDS.morph, 1); });
    const draw = gacha.draw.bind(gacha);
    gacha.draw = (p, id, n) => {
      const got = draw(p, id, n);
      if (got?.length) daily.add(p, PACT_KINDS.pull, got.length);
      return got;
    };
  });

  // 4. 보이지 않을 때의 자동 사냥 안전장치 (틀은 기본으로 끈다: 이 게임이 켠다)
  g.away.safety = { ...SAFETY };

  // 5. 저장 이전 (게임의 버전 1)
  g.migrations.player.push({ to: 1, note: '모드가 생기기 전의 저장: 들판(울림골)에서 이어지게, 변신만 가진 메아리는 영웅으로', up: (s) => upgradeSave(s as { ext?: Record<string, unknown> }) });
}
