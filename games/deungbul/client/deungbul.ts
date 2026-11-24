// 이 게임(등불지기)의 클라이언트 모듈: 틀의 화면 코드가 묻는 규칙(rules)을 채우고, 돌아온 주민을 세우고, 이 게임의 단축키를 등록하고,
// 서버가 알려 주는 공유 상태(등탑, 주민, 습격)와 내 진행(개인 상태: 퀘스트, 기여, 기여 단계, 휴식 보너스)을 받아 이 게임의 상태(./state.ts의 GS, G)에 넣는다.
// 서버의 games/deungbul/server/deungbul.ts(installDeungbul)와 짝이다. 틀의 파일은 이 파일을 import하지 않는다 (이 게임의 진입점 ./main.ts의 목록만 안다).
// 등탑이 정하는 것: 이동 속도(환한 구역에서 빨라진다)와, 주민이 돌아와야 풀리는 것(상점 물건, 대장간).
import { RESIDENTS, SHOPS, speedFor } from '../shared/defs';
import type { MeState } from '../shared/deungbul';
import { TOWER, TOWERS, TOWN } from '../shared/world';
import { goToTown } from '@engine/client/actions';
import { $ } from '@engine/client/app';
import { onKey, onMsg } from '@engine/client/bus';
import { addNpc, setMerchantLook } from '@engine/client/entities';
import { hudSlow } from '@engine/client/hud/me';
import { goToQuest, renderQuest } from './hud/quest';
import { initWords } from './words';
import { L } from '@engine/client/i18n';
import { rules } from '@engine/client/rules';
import { makeHumanoid } from '@engine/client/scene/models';
import { S } from '@engine/client/state';
import { raidSlow } from './hud/raid';
import { renderWorld, towerSlow } from './hud/tower';
import { zoneSlow } from './hud/zone';
import { G, GS, stage } from './state';

const NPC_CLOTH = [0x7a5a3a, 0x4c9a6a, 0x8a6aa0];
/** 이미 마을에 세운 주민 (RESIDENTS의 번호) */
const standing = new Set<number>();

const residentIndex = (id: string): number => RESIDENTS.findIndex((r) => r.id === id);
/** 그 주민이 돌아왔는가. 서버의 Tower.returned와 같은 판정 */
const returned = (i: number): boolean => GS.world.tower.residents[i] >= RESIDENTS[i].need;

/** 공유 상태에 맞춰 돌아온 주민을 마을에 세운다 (서버 엔티티가 아니라 화면에만 세워 둔다). */
function syncNpcs(): void {
  RESIDENTS.forEach((def, i) => {
    if (!returned(i) || standing.has(i)) return;
    standing.add(i);
    addNpc(def.x, def.z, makeHumanoid(NPC_CLOTH[i % NPC_CLOTH.length], false), () => L().residents[def.id].name, { x: TOWER.x, z: TOWER.z + 6 });
  });
}

/** 퀘스트 진행을 받았다: 적어 두고 퀘스트 창을 다시 쓴다 */
function setQuest(q: MeState['quest']): void {
  G.quest = { c: q.c, s: q.s, n: q.n };
  renderQuest();
}

/** 이 게임의 숫자와 창을 느린 주기를 기다리지 않고 지금 다시 쓴다: 습격 알림, 구역, 내 정보 창의 이 게임 줄과 등탑 창 (가르기 전의 hudSlow가 쓰던 차례다) */
function gameHud(now: number): void { raidSlow(now); zoneSlow(); towerSlow(); }
/** 틀의 내 정보 창(hud/me.ts)까지 함께 지금 다시 쓴다 */
function hudNow(now: number): void { hudSlow(now); gameHud(now); }

/**
 * 개인 상태를 받는 길. 퀘스트 창은 받는 즉시 다시 쓴다. 수치(기여, 기여 단계, 휴식 보너스)는 내 정보 창의 이 게임 줄(hud/tower.ts의 towerSlow)이 느린 주기마다 읽어 쓴다.
 * 다만 접속한 뒤 처음 받은 수치는 바로 쓴다: 옮기기 전에는 이 수치가 stat에 실려 왔고, 접속 뒤 첫 stat은 직업 글자를 다시 쓰면서(main.ts) 내 정보 창도 함께 썼다.
 * 그렇게 하지 않으면 다시 접속할 때마다 퀘스트 창은 제 값인데 기여가 0으로 보이는 순간(다음 주기까지 최대 0.25초)이 생긴다.
 * 서버는 한 번 내보낼 때 stat, meta를 먼저 보내고 개인 상태를 그 뒤에 보낸다: 퀘스트 창이 다시 쓰일 때 불씨 수(S.me.sparks)는 이미 새 값이다.
 */
function initPersonal(): void {
  /** 이번 접속에서 이미 받은 수치 칸 */
  const got = new Set<string>();
  /** 수치 칸을 적는다. 이번 접속에서 처음 받은 칸이 있었으면 참 */
  const setNums = (v: Partial<Pick<MeState, 'contrib' | 'tier' | 'rested'>>): boolean => {
    let first = false;
    for (const k of ['contrib', 'tier', 'rested'] as const) {
      const n = v[k];
      if (typeof n !== 'number') continue;
      G[k] = n;
      if (!got.has(k)) { got.add(k); first = true; }
    }
    return first;
  };
  onMsg('me', (m, now) => {
    // 칸의 모양은 이 게임의 서버가 정한 것이다 (games/deungbul/shared/deungbul.ts의 MeState). 모르는 칸은 버린다
    if (m.k === 'quest') setQuest(m.s as MeState['quest']);
    else if (m.k === 'contrib' || m.k === 'tier' || m.k === 'rested') { if (setNums({ [m.k]: m.s })) hudNow(now); }
  });
  // 접속할 때마다 내 캐릭터(S.me)가 새로 만들어지듯, 수치도 처음 값에서 시작한다 (다른 캐릭터로 이어받았을 때 앞의 값이 잠깐이라도 보이지 않게).
  // 퀘스트 진행은 전부터 남겨 두었다: 다시 접속하는 동안에도 창이 처음 단계로 돌아가 보이지 않는다
  onMsg('welcome', () => { G.contrib = 0; G.tier = 0; G.rested = 0; got.clear(); });
  // 직업이 바뀐 stat(접속 뒤 첫 stat이 그렇다)에서 틀은 내 정보 창을 곧바로 다시 쓴다 (main.ts가 hud/me.ts의 renderTexts를 부른다).
  // 가르기 전에는 그때 등탑 창과 이 게임의 줄도 함께 다시 썼다. 같은 때에 다시 쓴다: 접속 직후에 틀의 숫자만 먼저 보이는 순간이 없고,
  // 등탑 창이 접속한 자리의 구역으로 맞춰져 그 구역을 구역 알림으로 알리지 않는다.
  let cls = '';
  onMsg('welcome', () => { cls = ''; });
  onMsg('stat', (m, now) => { if (!S.me || m.cls === cls) return; cls = m.cls; renderWorld(); gameHud(now); });
}

/** 돌아온 주민을 세우는 일을 등록한다. 이 게임의 창들(hud/) 뒤에 둔다: 공유 상태가 오면 창을 먼저 고치고 주민을 세우던 차례 그대로다 */
export function initResidents(): void {
  onMsg('world', syncNpcs);
}

export function initDeungbul(): void {
  initWords();
  // 서버(systems/tower.ts)가 g.rules에 채우는 것과 같은 식이어야 한다: 속도는 같은 공유 함수(speedFor)로 셈한다
  rules.speed = () => speedFor(stage());
  // 열쇠는 주민의 id다. 주민이 아닌 열쇠는 잠그지 않는다
  rules.unlocked = (key) => { const i = residentIndex(key); return i < 0 || returned(i); };
  rules.lockNote = (key) => {
    const i = residentIndex(key), loc = L();
    return i < 0 ? '' : loc.fmt.needsResident(loc.residents[RESIDENTS[i].id].name);
  };
  // 주민의 그림자를 쓰러뜨려 장을 마쳤는데 그 주민이 아직 돌아오지 않았으면, 어떻게 되돌리는지 알려 준다 (장 이름이 주민 id와 같다: bram, mira)
  rules.lockHint = (key) => {
    const i = residentIndex(key);
    if (i < 0 || returned(i)) return '';
    const loc = L();
    return loc.fmt.residentHint(loc.residents[RESIDENTS[i].id].name, RESIDENTS[i].need - GS.world.tower.residents[i]);
  };
  // 상인은 곁의 등탑을 바라본다 (SHOPS의 tower는 TOWERS의 번호)
  setMerchantLook((_s, i) => TOWERS[SHOPS[i].tower] ?? TOWER);
  // '마을로'(H 키, 단추)는 첫불 마을의 등탑 앞으로 간다. 단추는 이 게임의 것이다
  rules.home = () => TOWN;
  $('townBtn').addEventListener('click', (e) => { goToTown(); (e.currentTarget as HTMLElement).blur(); });
  // 공유 상태를 받아 둔다. 맨 먼저 등록한다: 같은 종류의 처리기는 등록한 순서대로 돌고, 뒤의 것들(이 게임의 창, 틀의 상점·대장간)이 이 값을 읽는다.
  // 가르기 전에는 공유 상태가 올 때마다 내 정보 창 전체를 다시 썼다: 틀의 숫자도 같은 때에 다시 쓴다
  onMsg('world', (m, now) => { GS.world = m.s; GS.worldAt = now; hudSlow(now); });
  initPersonal();
  // F: 퀘스트의 목적지까지 걸어간다
  onKey('f', goToQuest);
}
