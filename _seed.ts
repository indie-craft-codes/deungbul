// 플레이 확인용 캐릭터를 임시 저장 파일에 넣는다: 기준 캐릭터(직업 × 장비 수준)를 만들어 균열의 문 앞에 세워 둔다.
//   cd <저장소> && npx tsx <이 파일> <db 파일> <토큰> <직업> <tier> [이름]
import { createHash } from 'node:crypto';
import { RIFT } from '@game/shared/content/rift';
import { SqliteStore } from '@engine/server/store';
import { newGame } from './games/deungbul/test/game';
import { hero, type Tier } from './games/deungbul/test/rift-kit';

const [db, token, cls, tier, name = 'Tester'] = process.argv.slice(2);
const store = new SqliteStore(db);
const g = newGame({ raid: { hours: [] } });
const p = hero(g, name, cls as 'warrior', tier as Tier);
p.x = RIFT.portal.x + 1.5; p.z = RIFT.portal.z + 1;
p.gold = 500;
// 퀘스트 창이 화면을 차지하지 않게 이야기를 다 마친 것으로 둔다 (판의 화면을 보려는 것이다)
p.qc = 99;
const save = g.players.export(p);
store.savePlayer(createHash('sha256').update(token).digest('hex'), save);
store.close();
console.log(`seeded ${name} ${cls} ${tier} lv${p.lv} hp${p.maxHp} dmg×${g.mods.product('damage', p).toFixed(2)} guard×${g.mods.product('guard', p).toFixed(2)}`);
