// 메아리 계약의 확률 공개 (odds 모듈): 울림 샘의 표(메아리는 캐릭터 정의라 서버가 켜질 때 판에 든다)와 장비 강화의 표가 공개 JSON에 나오고,
// 뽑으면 추첨 기록에 표의 버전이 찍히고, 원격 설정으로 천장을 바꾸면 버전이 오르고 이력이 남는다. 10번 뽑기(900)는 확인 단계를 거친다(화면).
import { installEchopact } from '../server/echopact';
import { MemoryStore, oddsFile, startServer } from '@engine/server';
import { CURRENCIES, needsConfirm, seededRng } from '@engine/shared/defs';
import { check, connect, until } from '@engine/testing';

const s = await startServer(0, { store: new MemoryStore(), game: { plugins: [installEchopact] }, backup: false, status: false, odds: false });
const g = s.game;
try {
  const a = await connect(s.port, 'Oddy', 'token-echopact-odds-0001');
  await until(() => g.odds.history().length > 0);
  const f = oddsFile(g), well = f.tables.find((t) => t.id === 'banner:well');
  check(g.has('odds') && !!well && well.version === 1 && well.steps[0].outcomes.length === 10 && well.pity?.after === 40 && f.tables.some((t) => t.id === 'enhance') && f.names.ko.bannerWell === '울림 샘' && f.names.en['cur:sparks'] === 'Echo Shards',
    `울림 샘의 표(메아리 열, 천장 40번째)와 강화의 표가 공개된다 (${f.tables.map((t) => `${t.id} v${t.version}`).join(', ')})`);
  check(Math.abs(well!.steps[0].outcomes.filter((o) => o.r === 2).reduce((x, o) => x + o.p, 0) - 0.04) < 1e-12, '울림 샘의 전설 확률은 4% (내용의 무게 그대로)');
  const e = g.ents.get(a.id)!;
  g.gacha.rng = seededRng(3);
  g.wallet.add(e, 'sparks', 1000, 'admin');
  g.gacha.draw(e, 'well', 10);
  const row = g.odds.draws({ owner: e.pid, limit: 1 })[0];
  check(row?.table === 'banner:well' && row.ver === 1 && row.got.length === 10, `10번 뽑기의 추첨 기록 (${row?.got.join(', ')})`);
  const set = g.live.set('BANNERS.well.pity.after', 35, 'tester');
  g.gacha.draw(e, 'well', 1);
  check('ver' in set && g.odds.versionOf('banner:well') === 2 && g.odds.draws({ owner: e.pid, limit: 1 })[0].ver === 2 && oddsFile(g).history[0].why === 'live:BANNERS.well.pity.after', '천장을 원격 설정으로 바꾸면 v2, 이력과 다음 추첨 기록에 새 버전');
  check(needsConfirm(CURRENCIES.sparks, 900) && !needsConfirm(CURRENCIES.sparks, 100), '울림 조각 900(10번 뽑기)은 두 번 묻고, 100(1번)은 묻지 않는다');
  a.ws.close();
} finally { g.live.reset('BANNERS.well.pity.after', 'tester'); await s.close(); }
