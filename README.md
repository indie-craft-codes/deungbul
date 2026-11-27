# 쿼터뷰 멀티플레이 게임 틀과 게임들

이 저장소는 **다시 쓰는 게임 틀**(`engine/`)과 그 위에 만든 **게임 둘**(`games/`)이다.

- **틀**: 브라우저에서 도는, 여럿이 함께 접속하는 쿼터뷰(비스듬히 내려다보는) 3D 월드 게임의 서버·화면·저장·운영. 서버가 위치와 결과를 정하고(서버 권위), 화면은 하고 싶은 것만 보낸다. **장르와 무관한 핵심**(접속·이동·지도·대화·채널·저장·운영)에 **선택 모듈 25개**(전투, 아이템, 장비, 길드, 던전, 영웅 뽑기, 판, 변신 …)를 골라 얹는다. 고르지 않은 모듈은 서버의 명령·저장 칸도 화면의 창·키도 없다.
- **게임**: 운영 중인 MMORPG **등불지기**(`games/deungbul`, RPG 모듈 전부)와 새 게임의 출발점인 작은 **예제** "모닥불 사냥터"(`games/sample`).

TypeScript, Node(서버: `ws`, SQLite), three.js(화면), Vite(빌드). 화면 문장은 모두 언어 파일(한국어·영어)을 거친다.

## 빠른 시작

```
npm install
npm run dev                    # 등불지기 개발: 서버(3001) + 화면(5173). 파일을 고치면 바로 반영
npm run dev:sample             # 예제 개발: 서버(3002) + 화면(5174)
npm run build && npm start     # 등불지기 빌드본을 한 포트로: http://localhost:3001
npm run build:sample && npm run start:sample   # 예제: http://localhost:3002
npm run games                  # 이 저장소의 게임 목록 (games/ 아래에서 스스로 찾는다)

npm test                       # 모든 시험: 틀의 경계 검사·틀의 시험(fx, core, collect) → 게임마다의 시험. 검사 2339개(2026-11-27)
npm run typecheck              # 타입 검사: 틀의 설정 다섯 + 게임마다의 설정, 모두 8개
npm run build:all              # 모든 게임을 빌드
npx tsx test/all.ts boundary fx/shop deungbul/quests sample/docs   # 고른 시험만
```

명령은 모두 저장소 뿌리에서 실행한다. 어느 게임을 돌리는가는 `scripts/game.mjs` 한곳이 고른다(인자나 환경 변수 `GAME`, 기본 `deungbul`): `node scripts/game.mjs <start|watch|client|build|test|list> [게임]`. 포트·저장 파일·빌드 폴더는 게임마다 `games/<게임>/deploy.json`에 있다.

## 틀의 모듈

게임은 내용의 `MODULES` 한 곳에서 쓸 모듈을 고른다(`engine/shared/modules.ts`의 `MODULE_TABLE`이 목록과 의존을 갖고, 빠진 의존은 시작할 때 오류). 자세히는 [docs/making-a-game.md](docs/making-a-game.md) 1절.

| 묶음 | 모듈 | 한 줄 |
|---|---|---|
| 핵심 (늘 있다) | — | 접속·기기 토큰·다시 접속, 이동·길찾기, 맵·시야·채널, 게임이 등록하는 엔티티 종류, 대화·금칙어·차단·신고, 저장(SQLite)·백업·이전, 관리자 통로·제재, 시계·원격 설정·기능 깃발·공지·점검·상태 페이지, 설정 창·탭 숨김·오류 수집·약관·내 데이터·플랫폼 접점, 미니맵·전체 지도·자동 이동 |
| RPG (`RPG_MODULES`, 등불지기는 이 열여섯 전부) | `economy` | 재화 지갑(골드·두 번째 재화)과 경제 장부 |
| | `growth` | 레벨과 경험치 |
| | `classes` | 직업 고르기·바꾸기, 직업마다의 체력과 기술 |
| | `combat` | 체력·피해·기술 효과 여섯·몬스터·필드 보스·쓰러짐과 부활 |
| | `build` | 능력치 점수와 기술 강화 |
| | `items` | 가방(재료·물약), 상점, 대장간 제작 |
| | `gear` | 드롭 장비, 강화·재련·분해, 장비 가방 |
| | `mail` | 보상 우편 |
| | `daily` | 일일·주간·월간 임무와 출석 |
| | `idle` | 접속하지 않은 동안의 보상 |
| | `party` | 파티와 함께 받는 처치 보상 |
| | `guild` | 길드: 초대·기부·공지·길드 대화 |
| | `market` | 거래소 |
| | `dungeon` | 인스턴스 던전, 하루 횟수, 열쇠, 소탕 |
| | `rank` | 전투력 순위 |
| | `away` | 자동 사냥과 자리 비움 사냥 |
| 수집형·방치형 | `roster` | 영웅: 레벨·별·조각·기술·각성 |
| | `gacha` | 뽑기: 배너·천장·픽업·공개 확률표(게임 안의 재화만) |
| | `squad` | 편성: 영웅이 함께 싸운다, 진형·시너지 |
| | `stages` | 장·단계·물결·우두머리, 오프라인 단계 진행 |
| | `herogear` | 영웅 장비: 세트·강화·분해 |
| 그 밖의 장르 | `teams` | 팀 고르기·점수판·팀 색 |
| | `rooms` | 판: 대기실·짝짓기·컴퓨터 상대, 차례와 기한, 셋 이상의 판과 등수 |
| | `chars` | 캐릭터 정의: 검증해 두고 화면에 보낸다(겉모습 부품) |
| | `morph` | 변신: 가진 캐릭터 정의의 겉모습·보정으로 |

## 게임

| 게임 | 무엇 | 모듈 | 포트 | 문서 |
|---|---|---|---|---|
| 등불지기 `games/deungbul` | 운영 중인 쿼터뷰 로우폴리 MMORPG 검증판(영어 이름 Lampkeeper). 등탑에 불씨를 바치는 서버 공동 목표, 세 구역·던전·필드 보스·습격, 직업 셋, 파티·길드·거래소 | RPG 열여섯 | 3001 | [games/deungbul/README.md](games/deungbul/README.md) (게임 설명, 실행·환경 변수, 파일럿 배포, 도감, 경제 장부), [docs/economy.md](docs/economy.md) |
| 예제 `games/sample` "모닥불 사냥터" | 같은 틀로 만든 아주 작은 두 번째 게임. 새 게임을 만들 때 베끼는 출발점이고, 문서의 코드 조각이 이 파일들과 같은지 시험이 본다 | RPG 일부 + `chars`·`morph` | 3002 | 아래 '예제 게임', [docs/making-a-game.md](docs/making-a-game.md) |

2026-11-27에 시제품·증명 게임 일곱(버섯 동굴, 별가루 광산, 돌담 마을, 굴림공, 달무리 원정대, 징검돌 전술, 반딧불 연못)을 지웠다. 코드는 커밋 `7e347c9`에 있다(`git checkout 7e347c9 -- games/<이름>`). 그 게임들이 쓰던 틀의 기능은 그대로이고 틀의 시험(`engine/test/core`, `engine/test/collect`)이 지킨다. 증명 기록은 `docs/proof-*.md`.

## 문서 지도

전체 목록(목적·대상·상태·현행화 날짜)은 [docs/README.md](docs/README.md).

| 하고 싶은 것 | 읽을 것 |
|---|---|
| 이 틀로 새 게임을 만든다 | [docs/making-a-game.md](docs/making-a-game.md) (차례, 모듈, 접점 일람표, 장르별 본보기) |
| 틀이 지금 어디까지 왔고 무엇이 남았나 | [docs/framework-status.md](docs/framework-status.md) (맨 위 요약과 '0. 이어 갈 것') |
| 다음에 무엇을 채울까 (장르 공통 기능) | [docs/genre-features.md](docs/genre-features.md) 5절 |
| PC·모바일 앱으로도 낼 준비 | [docs/platforms.md](docs/platforms.md) 4절 |
| 서버 사양, 부하, 운영 절차 | [docs/infra.md](docs/infra.md) |
| 등불지기의 게임과 경제 | [games/deungbul/README.md](games/deungbul/README.md), [docs/economy.md](docs/economy.md) |

## 폴더

```
engine/            틀: 게임을 모른다 (games/를 import하지 않는다)
  shared/          서버와 화면이 함께 쓰는 것: 모듈 표(modules.ts), 내용 계약(contract.ts), 내용의 모양과 도우미(defs/), 이동·길찾기, 프로토콜
  server/          게임의 중심(game/game.ts), 시스템(game/systems/), 통신·관리자·상태 페이지(net/), 저장(store/), 실행(run.ts)
  client/          화면: startClient, 장면(scene/), 창(hud/), 언어(i18n/), 플랫폼 접점(platform/)
  test/            틀의 시험: 경계 검사(boundary.test.ts), 시험용 내용 위의 기능 시험(fx/), 핵심만(core/: 공 마당), 수집형(collect/: 영웅 들판)
  index.ts들       게임이 읽는 입구: @engine/shared, @engine/server, @engine/client, @engine/client/i18n, @engine/client/platform, @engine/testing
games/deungbul/    등불지기 (틀을 @engine/…으로 읽는다)
games/sample/      예제 게임
test/all.ts        모든 시험을 차례로 돌린다 (틀의 시험, 그리고 게임마다 그 게임의 test/all.ts를 따로 된 프로세스로)
scripts/           game.mjs(게임 고르기), typecheck.mjs, deploy.mjs, restart.mjs·serve.mjs(감시자), admin.mjs(관리자 CLI), load.mjs(부하), budget.mjs(빌드 크기), pilot.mjs·publish.sh(등불지기 파일럿 배포)
docs/              문서 (docs/README.md가 지도)
data/, dist/, dist-sample/   저장 파일과 빌드 결과 (git에 넣지 않는다)
```

원칙:

- 위치와 전투 결과는 서버만 정한다. 클라이언트는 하고 싶은 것만 보낸다.
- 서버는 화면에 보일 문장을 보내지 않는다. 종류와 값만 보내고 문장은 화면이 언어에 맞게 만든다.
- 게임 규칙은 통신과 저장을 모른다. `engine/server/game/`은 `net/`과 `store/`의 구현에 기대지 않는다.
- 틀은 게임을 모른다. 방향은 게임 → 틀 하나이고, 틀이 게임에서 읽는 것은 내용 계약의 이름뿐이다(`engine/test/boundary.test.ts`가 지킨다).
- 새 기능은 모듈(또는 내용의 선택 칸)로 넣고, 고르지 않거나 적지 않으면 예전과 같게 한다: 등불지기와 예제의 '황금 실행'(정해진 시뮬레이션의 줄 위 바이트)이 바뀌지 않는지 본다.

## 예제 게임

`games/sample`("모닥불 사냥터")은 틀이 다른 게임을 받는지 확인하는 본보기이고, 새 게임을 만들 때 베끼는 출발점이다. 만드는 차례는 [docs/making-a-game.md](docs/making-a-game.md)에 있다.

- 직업 둘(도끼를 든 나무꾼, 사냥꾼), 몬스터 셋, 지역 하나, 상인 하나, 이 게임만의 규칙 하나(모닥불에 장작을 넣으면 곁에 있는 동안 회복이 빨라진다). 던전, 대장간, 보스, 두 번째 재화, 거래소, 길드는 없다.
- 틀의 접점을 쓰는 본보기: 손 모양 등록(도끼), 기절을 붙인 기술(내려찍기), 모델·소리 파일, 지도의 장소(모닥불), 메뉴 탭 더하기(모닥불 탭), 손으로 쓴 캐릭터 정의 넷과 변신, 원격 설정·기능 깃발·주간·월간 임무, 약관·튜토리얼·재방문 캐시.
- 등불지기와 따로 돈다: 별칭 `@game`이 `games/sample`을 가리키는 자기 설정(`games/sample/tsconfig.json`, `vite.config.ts`), 포트 3002, 저장 `data/sample/`, 빌드 결과 `dist-sample/`.

```
npm run test:sample                  # 예제의 시험 + 문서의 코드 조각이 예제와 같은지 (npm test도 함께 돌린다)
npm run typecheck -- sample          # 예제의 설정 둘: 틀 + 예제, 틀만을 예제의 내용으로
```

틀(`engine/`)이나 내용 계약을 고치면 예제도 통과해야 한다. `npm run typecheck`가 예제까지 검사한다.
