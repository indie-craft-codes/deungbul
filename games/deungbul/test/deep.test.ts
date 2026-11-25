// Lv 15 이후의 할 거리 1: 어려운 던전 '지하묘 깊은 곳' (Lv 18부터, 하루 2번, 끝내면 레벨 7 장비와 보호 부적)
import { DUNGEONS, ENHANCE, PORTAL_REACH, isItemId, runKey } from '../shared/defs';
import { type Ent, type Game, isField } from '@engine/server';
import { check } from '@engine/testing';
import { newGame } from './game';

const saidOn = (g: Game) => (p: Ent) => g.notices.filter((n) => n.id === p.id).map((n) => [n.k, ...n.a].join(':'));
const def = DUNGEONS.crypt_deep, plain = DUNGEONS.crypt;
check(Math.hypot(def.portal.x - plain.portal.x, def.portal.z - plain.portal.z) > PORTAL_REACH * 2, '두 문이 문에 닿는 거리의 두 배보다 멀다 (한 자리에서 두 문에 함께 닿지 않는다)');
check(def.minLv === 18 && def.perDay === 2 && def.dropLv === 7 && def.dropRar >= 2, '깊은 곳: Lv 18부터, 하루 2번, 레벨 7의 희귀 이상 장비');

const g = newGame({ raid: { hours: [] } }), said = saidOn(g);
const at = (p: Ent, x: number, z: number) => { p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.targetId = 0; };
const run = (s: number) => { for (let i = 0, n = Math.round(s * 20); i < n; i++) g.tick(0.05); };
const p = g.players.spawn('깊은곳', false, null, 'key-deep');
g.classes.apply(p, 'warrior');

at(p, def.portal.x + 1, def.portal.z);
p.lv = 17;
g.command(p, { t: 'dungeon', id: 'crypt_deep' });
check(isField(p.layer) && said(p).includes('dungeonLevel:18'), 'Lv 17은 들어가지 못한다');

p.lv = 20;
g.command(p, { t: 'dungeon', id: 'crypt_deep' });
check(!isField(p.layer), 'Lv 20은 들어간다');
const inside = () => [...g.ents.values()].filter((m) => m.kind === 'm' && m.layer === p.layer && !m.dead);
const types = new Set(inside().map((m) => m.type));
check(types.has('grave_hound') && types.has('crypt_knight') && types.has('crypt_lord_deep') && !types.has('goblin'), `안에는 깊은 곳의 몬스터만 있다 (${[...types].join(', ')})`);
const gear0 = p.gear.length, ward0 = isItemId(ENHANCE.charm) ? p.items[ENHANCE.charm] ?? 0 : 0;
for (const m of inside().sort((x, y) => (x.type === def.boss.type ? 1 : 0) - (y.type === def.boss.type ? 1 : 0))) { at(p, m.x + 1, m.z); g.combat.damage(p, m, 1e6, false); }
const got = p.gear.slice(gear0);
check(got.some((x) => x.lv === 7 && x.rar >= 2), `끝내면 레벨 7의 희귀 이상 장비를 받는다 (${got.map((x) => `Lv ${x.lv} 등급 ${x.rar}`).join(', ')})`);
const mail = p.mail.find((m) => m.k === 'dungeon');
check(!!mail && mail.r.gold === def.reward.gold && mail.r.items?.[ENHANCE.charm] === 1, '보상 우편에 골드와 보호 부적 한 장이 있다');
g.command(p, { t: 'mailClaim', id: 0 });
check(isItemId(ENHANCE.charm) && (p.items[ENHANCE.charm] ?? 0) === ward0 + 1, '우편을 받으면 부적이 가방에 들어온다');
run(def.exitS + 1);
check(isField(p.layer), '끝낸 뒤 밖으로 나온다');

// 하루 2번: 세 번째는 막힌다 (평범한 지하묘의 횟수와는 따로 센다)
at(p, def.portal.x + 1, def.portal.z);
g.command(p, { t: 'dungeon', id: 'crypt_deep' });
check(!isField(p.layer), '두 번째로 들어간다');
g.command(p, { t: 'dungeonLeave' });
at(p, def.portal.x + 1, def.portal.z); g.notices = [];
g.command(p, { t: 'dungeon', id: 'crypt_deep' });
check(isField(p.layer) && said(p).some((k) => k.startsWith('dungeonNoRuns')) && p.daily.prog[runKey('crypt_deep')] === 2 && !p.daily.prog[runKey('crypt')], '세 번째는 막히고, 평범한 지하묘의 횟수는 쓰지 않았다');
