# 틀과 게임 가르기: 지금의 상태

이 문서는 **지금 무엇이 끝났고, 틀과 게임이 어디서 만나고, 무엇이 남았는지**를 적는다. 맨 위 '요약'과 '0. 이어 갈 것'은 2026-11-27(문서 현행화 `feat/docs5`, 바탕 `30d6b05`)에 코드와 대조해 다시 썼다. 날짜가 붙은 절(가지마다)은 그 묶음을 끝냈을 때의 기록이다(그 안의 검사 수·게임 이름은 그때의 것). 코드를 고치면 이 문서도 함께 고친다.

함께 보는 문서 (전체 지도: [README.md](README.md)):

- [making-a-game.md](making-a-game.md): 새 게임을 만드는 차례와 틀의 접점 전체(새 게임을 만드는 사람은 이것부터).
- [genre-features.md](genre-features.md): 장르 공통 기능 조사와 고도화 묶음 여덟의 순서(5절). [platforms.md](platforms.md): PC·모바일 앱으로 낼 준비의 단계(4절).
- [framework-audit.md](framework-audit.md): 2026-11-24의 점검 보고(기록). 거기 적힌 문제들의 처리는 아래 '틀 수리의 진행'.
- [framework-plan.md](framework-plan.md): 틀을 가를 때의 계획(기록. 파일 경로와 세부는 그때의 것).
- [../games/deungbul/README.md](../games/deungbul/README.md), [economy.md](economy.md), [modes.md](modes.md), [ideas.md](ideas.md): 등불지기의 게임 설명과 경제, 보류한 장르 모드, 보류한 아이디어.

## 요약

**틀**(`engine/`)은 장르와 무관한 **핵심**과 **선택 모듈 28개**다. 게임은 내용의 `MODULES` 한 곳에서 고르고(`engine/shared/modules.ts`의 `MODULE_TABLE`이 목록과 의존, 시작할 때 `checkModules`가 빠진 의존을 오류로), 고르지 않은 모듈은 서버의 시스템·명령·틱·저장 칸·전송도, 화면의 창·탭·키도 없다. 끈 모듈의 저장 칸은 읽은 그대로 두었다가 다시 적는다(`MODULE_SAVES`). 틀이 게임에서 읽는 것은 내용 계약(`engine/shared/contract.ts`: 핵심 `MAP`·`MODULES`와 모듈마다의 선택 계약, 이름 88개)뿐이고 `engine/shared/content.ts` 한 곳에서 별칭 `@game/shared/content`로 읽는다(적지 않은 이름은 `defaults.ts`). 게임은 틀을 입구(`@engine/shared`, `@engine/server`, `@engine/client`, `@engine/client/i18n`, `@engine/client/platform`, `@engine/testing`)로만 읽는다.

| 모듈 | 한 줄 | 의존 | 묶음 | 등불지기 | 예제 | 메아리 | 들어온 절 |
|---|---|---|---|---|---|---|---|
| (핵심) | 접속·다시 접속·기기 옮기기, 이동·길찾기, 맵·시야·채널, 엔티티 종류(`g.defineKind`), 대화(전체·길드)·금칙어 정규화·서버 저장 차단·신고와 그 문맥·대화 보이기·연령과 제한 모드(`AGE`)·정해진 문장(`QUICK_CHAT`)·제재, 저장·이전·백업, 관리자 통로, 시계·원격 설정·깃발·공지·점검·상태 페이지, 설정 창·탭 숨김·오류 수집·약관·내 데이터·튜토리얼·플랫폼 접점, 지도·자동 이동 | — | 늘 있다 | ○ | ○ | ○ | 장르 중립 틀, 운영의 바탕, 웹 출시의 바탕, 플랫폼 분리 1단계, 사회와 안전 |
| `economy` | 지갑(골드·두 번째 재화·경험치)과 경제 장부 | — | RPG | ○ | ○ | ○ | 장르 중립 틀 |
| `growth` | 레벨과 경험치 | economy | RPG | ○ | ○ | ○ | 〃 |
| `classes` | 직업 고르기·바꾸기, 직업마다의 체력과 기술 | — | RPG | ○ | ○ | ○ | 〃 |
| `combat` | 체력·피해·기술 효과 여섯·몬스터·필드 보스·쓰러짐과 부활 | classes | RPG | ○ | ○ | ○ | 〃 |
| `build` | 능력치 점수와 기술 강화 | growth, combat, economy | RPG | ○ | ○ | | 〃 |
| `items` | 가방(재료·물약), 상점, 대장간 제작 | economy | RPG | ○ | ○ | ○ | 〃 |
| `gear` | 드롭 장비, 강화·재련·분해, 장비 가방 | items, economy | RPG | ○ | ○ | ○ | 〃 |
| `mail` | 보상 우편 | items, economy | RPG | ○ | ○ | ○ | 〃 |
| `daily` | 일일·주간·월간 임무와 출석 | mail | RPG | ○ | ○ | ○ | 〃, 운영의 바탕(주간·월간) |
| `idle` | 접속하지 않은 동안의 보상 | mail | RPG | ○ | ○ | ○ | 〃 |
| `party` | 파티, 함께 받는 처치 보상 | — | RPG | ○ | ○ | ○ | 〃 |
| `guild` | 길드 | economy | RPG | ○ | | | 〃 |
| `market` | 거래소 | items, gear, mail, economy | RPG | ○ | | | 〃 |
| `dungeon` | 인스턴스 던전, 하루 횟수, 열쇠, 소탕, 자동 전투 | combat, mail, daily, gear | RPG | ○ | | | 〃, 수집형·방치형 모듈 |
| `rank` | 전투력 순위 | growth | RPG | ○ | ○ | | 〃 |
| `away` | 자동 사냥과 자리 비움 사냥 | combat | RPG | ○ | ○ | ○ | 〃 |
| `teams` | 팀 고르기·점수판·팀 색 옷 | — | 그 밖 | | | | 틀의 남은 한계 메우기 |
| `roster` | 영웅: 레벨·별·조각·기술 레벨·각성 | economy | 수집형 | | | ○ | 수집형·방치형 모듈, 영웅의 성장 |
| `gacha` | 뽑기: 배너·천장·10번 보장·픽업·선택권·공개 확률표 | roster, economy | 수집형 | | | ○ | 〃, 소탕·오프라인 진행·픽업 배너 |
| `squad` | 편성: 영웅이 함께 싸운다, 진형·시너지 | roster, combat | 수집형 | | | ○ | 〃 |
| `stages` | 장·단계·물결·우두머리, 오프라인 단계 진행, 소탕 | combat | 수집형 | | | ○ | 〃 |
| `herogear` | 영웅 장비: 세트·강화·분해 | roster, items, economy | 수집형 | | | | 영웅의 성장 |
| `rooms` | 판: 대기실·짝짓기·컴퓨터 상대, 차례와 기한, 셋 이상의 판·등수·자리 수 범위, 판의 저장 | — | 그 밖 | | | | 턴제의 빈 곳 메우기, 판 모듈의 빈 곳 메우기 |
| `chars` | 캐릭터 정의: 검증해 두고(바꿔 끼우는 저장소) 화면에 보낸다. `roster`와 함께면 영웅 | — | 그 밖 | | ○ | ○ | 캐릭터 정의와 변신 |
| `morph` | 변신: 가진 정의의 겉모습(남에게도)과 보정 | chars | 그 밖 | | ○ | ○ | 〃 |
| `chat` | 대화 채널: 귓말·근처·파티, 채널 탭과 거르기, 도배 막기(`CHAT_RULES`). 고르지 않으면 전체와 길드뿐 | — | 그 밖 | | ○ | ○ | 사회와 안전 |
| `friends` | 친구: 요청·수락·삭제, 목록(접속·있는 곳), 상한(`FRIENDS`) | — | 그 밖 | | ○ | ○ | 〃 |
| `support` | 문의·제재 이의: 티켓(열림·답변·닫힘), 관리자의 답(알림·우편), 말 막기·차단의 사유·기간·이의 | — | 그 밖 | ○ | ○ | | 운영 도구와 고객지원 |

'RPG' 열여섯이 `RPG_MODULES`(등불지기는 `MODULES = RPG_MODULES`), '수집형'의 앞 넷이 `COLLECT_MODULES`다. 수집형·`teams`·`rooms`·`chars`·`morph`·`chat`·`friends`는 `RPG_MODULES`에 들지 않는다(그 목록을 쓰는 게임에 저절로 생기지 않게).

- **게임**: 셋. 등불지기(`games/deungbul/`, 운영, 포트 3001), 예제(`games/sample/` "모닥불 사냥터", 3002), 두 장르를 합친 예제(`games/echopact/` "메아리 계약", 3003: 들판의 MMORPG + 뽑기·편성·단계의 수집형, 같은 캐릭터 정의가 동료와 변신으로. [proof-echopact.md](proof-echopact.md)). 방향은 게임 → 틀 하나다. **2026-11-27에 시제품·증명 게임 일곱(`cave`·`starmine`·`bastion`·`rollball`·`dalmuri`·`stepstone`·`pond`)을 지웠다**: 코드는 커밋 `7e347c9`에 남아 있고(`git checkout 7e347c9 -- games/<이름>`), 운영 데이터는 `data/backup/retired-<시각>/`로 옮겼다. 증명 기록([proof-rollball.md](proof-rollball.md), [proof-dalmuri.md](proof-dalmuri.md), [proof-stepstone.md](proof-stepstone.md), [proof-pond.md](proof-pond.md))은 틀을 검증한 기록으로 남긴다. 그 게임들이 쓰던 틀의 기능은 그대로이고 틀의 시험(`engine/test/core`의 공 마당·별 줍기, `engine/test/collect`의 영웅 들판)이 지킨다.
- **확인**(2026-11-27, 두 장르를 합친 예제를 더한 `feat/hybrid`, 바탕 `07e496e`): `npm run typecheck`(`scripts/typecheck.mjs`: 틀의 설정 다섯과 게임마다의 설정 둘씩, 모두 10개) 오류 0, `npm test`(틀의 경계 검사 `boundary`, 틀의 시험 `fx`, 핵심만 `core`, 수집형 `collect`, 게임 셋) **검사 2435개**(바탕 2393 + 메아리 계약 42) 모두 통과, `npm run build:all` 통과. 틀의 시험은 게임 없이 돈다(시험용 내용 위에서. `games/`를 지운 복사본에서도 통과: 2026-11-25에 확인).
- **등불지기**: 플레이와 저장 형식은 틀을 가르고 다시 짜는 동안 바뀌지 않았다(묶음마다 '황금 실행': 정해진 시뮬레이션의 줄 위 바이트 7,489,205바이트가 같다). 프로토콜은 3, SQLite 스키마는 5(1 처음의 표 → 2 원격 설정 → 3 웹: 동의·삭제 요청·화면 오류 → 4 사회: 차단·친구·사회 설정 → 5 운영 도구: 분석 사건·문의·롤백 보관. 다른 가지의 단계와 합치면 끝 단계의 번호는 바뀔 수 있다).

**최근 묶음** (2026-11-27, 아래 날짜가 붙은 절에 자세히):

| 묶음 | 가지 | 무엇 | 검사 |
|---|---|---|---|
| 게임 정리 | 커밋 `6743dd8` | 시제품·증명 게임 일곱을 지움 | 2495 → 2070 |
| 판 모듈의 빈 곳 메우기 | `feat/roomfix` | 선 돌리기, 셋 이상의 빠진 자리, 등수, 자리 수의 범위, 막대 자리·기권 확인, 컴퓨터 이름, 타입의 입구 | → 2106 |
| 캐릭터 정의와 변신 | `feat/chardef` | 겉모습 부품, 정의와 검증기, 모듈 `chars`·`morph`(스물넷째·다섯째) | → 2174 (둘 합침) |
| 장르 공통 기능 조사 | (문서) | [genre-features.md](genre-features.md): 기능 238개, 묶음 여덟 | |
| 웹 전용 부분 분리 설계 | (문서) | [platforms.md](platforms.md): 웹 의존 52곳, 접점 모양, 단계 넷 | |
| 운영의 바탕 (묶음 1) | `feat/ops2` | 시계·초기화, 주간·월간 임무, 원격 설정, 기능 깃발, 공지, 점검, 상태 페이지 | → 2249 |
| 웹 출시의 바탕 (묶음 2) | `feat/web2` | 플랫폼 접점, 설정 창, 탭 숨김, 로딩 예산, 오류 수집, 약관·내 데이터, 튜토리얼, 인증·광고 접점, 손님 진행 보호 | 묶음 1과 합쳐 2308 |
| 사회와 안전 (묶음 3) | `feat/social3` | 서버 저장 차단, 금칙어 정규화(`engine/shared/textfilter.ts`), 신고의 문맥, 대화 보이기, 모듈 `chat`·`friends`(스물여섯째·일곱째), 정해진 문장, 연령·제한 모드 | 2308 → 2362, 플랫폼 1단계와 합쳐 2393 |
| 플랫폼 분리 1단계 | `feat/plat1` | 브라우저 직접 호출을 `engine/client/platform/` 뒤로, 버전 범위, 서버의 정적 파일 끄기·Origin, 길게 누르기 툴팁, 경계 시험 | → 2339 |
| 문서 현행화 | `feat/docs5` | 뿌리 README를 틀 + 게임의 안내로, 등불지기 설명을 [../games/deungbul/README.md](../games/deungbul/README.md)로, 문서 지도 [README.md](README.md), 이 요약 | 2393 (묶음 3과 합친 뒤) |
| 두 장르를 합친 예제 | `feat/hybrid` | 새 예제 `games/echopact` "메아리 계약"(3003): 들판의 MMORPG + 뽑기·편성·단계, 캐릭터 정의 하나가 단계의 동료이자 들판의 변신. 틀은 고치지 않았다. 틀의 빈 곳 열은 [proof-echopact.md](proof-echopact.md) | 2393 → 2435 |
| 운영 도구와 고객지원 (묶음 5) | `feat/ops5` | 분석 사건 `g.track`·집계(D1/D7/D30·일별 활성·퍼널), 웹 관리 화면과 역할 셋, 모듈 `support`(스물여덟째: 문의·제재 이의), 계정 단위 롤백, 봇 의심 점수, 경보(웹훅), 운영 보상 우편. 사고 리허설 시험 | 2435 → 2513 |

그 전(2026-11-24~26)의 묶음은 아래 '0. 이어 갈 것' 끝의 '요약에서 내린 줄'에 한 줄씩 있다. 다음 후보와 사용자가 정할 것도 '0. 이어 갈 것'에 모았다.
## 두 장르를 합친 예제 (2026-11-27, 가지 `feat/hybrid`)

사용자 아이디어([ideas.md](ideas.md) 3절: 뽑기·수집형 RPG와 MMORPG의 변신을 잇기)를 틀 위의 새 예제 **"메아리 계약"**(`games/echopact`)으로 보였다. 등불지기와 무관한 별도 게임이고 틀(`engine/`)은 고치지 않았다. 만든 것·잇는 방법·수치 표·틀의 빈 곳·평가는 [proof-echopact.md](proof-echopact.md).

| 무엇 | 어떻게 |
|---|---|
| 모듈 | 들판: `economy`·`growth`·`classes`·`combat`·`items`·`gear`·`mail`·`daily`·`idle`·`party`·`away`·`chat`·`friends`, 수집형: `roster`·`gacha`·`squad`·`stages`, 다리: `chars`·`morph` (열아홉) |
| 메아리 = 캐릭터 정의 | 내용의 영웅은 비우고, 손으로 쓴 정의 열(일반 넷·희귀 넷·전설 둘, 부품이 모두 다름, 모자 부품 '울림 고리'를 더함)을 서버가 켜질 때 `g.chars.add`로 검증해 더한다. 배너의 판은 정의의 id. AI 생성은 하지 않는다 |
| 한 소유 | 영웅의 소유가 원본, 변신의 소유는 사건 `heroChanged`와 접속 때 맞춘다(`server/pact.ts`) |
| 키운 만큼의 변신 | 별·레벨로 주는 피해 덤(상한 6%, `g.mods`) |
| 재화 | 뽑기 재화(울림 조각)는 들판의 사냥과 단계가 반씩. 처음 30분 시뮬레이션(`games/echopact/scripts/flow.ts`): 첫 뽑기 2분, 첫 10번 뽑기 18~21분, 천장(40번)은 83분 |
| 운영·웹 | 일일·주간 임무(사냥·단계·뽑기·변신), 출석, 원격 설정 셋, 공지(관리자 명령으로 띄워 봄), 설정 칸 하나, 튜토리얼 여섯 단계, 손님 진행 보호 25분 |
| 등록 | 포트 3003(vite 5175), `dist-echopact/`(`.gitignore`), `deploy.json`, 부하 도구의 표(`scripts/load/server.ts`) |

확인:
- `npm run typecheck` 설정 10개 오류 0. `npm test` 두 번과 `TZ=UTC npm test` 한 번 모두 통과(검사 2393 → 2435개: 메아리 계약 42), `npm run build:all` 통과(첫 묶음 약 0.94MB).
- 황금 실행(바탕 `07e496e`과 이 가지, `turnfw-tools/golden.mts`와 같은 도구): 등불지기(sim) 7,489,205바이트·sample 3,431,368바이트 모두 바이트까지 같다.
- 게임의 시험: 정의와 공개 확률표·천장, 뽑기 → 편성 동료로 단계에서 실제로 때리고 깸 → 들판에서 같은 메아리로 변신(다른 접속자에게 겉모습) → SQLite로 껐다 켜도 소유·편성·변신이 이어지고 다시 변신, 재화 흐름(같은 씨앗이면 같은 흐름).
- 화면(임시 서버 3015, PC·폰 × 한국어·영어, 헤드리스 Chrome GPU): 튜토리얼, 들판(울림 샘 둘레의 석상, 변신한 다른 접속자), 뽑기 창과 확률표, 10번 뽑기 결과, 메아리·편성 탭, 단계 전투, 변신 탭과 변신한 모습, 일일·주간 임무, 설정, 공지, 서버를 강제로 끄고 다시 켠 뒤의 변신·편성. 콘솔 오류 없음.

## 판 모듈의 빈 곳 메우기 (2026-11-27, 가지 `feat/roomfix`)

문서만 보고 만든 넷의 판 게임 반딧불 연못의 증명 기록 [proof-pond.md](proof-pond.md)(평가 4.0/5)의 '문서의 빈 곳'·'꼼수'·'틀 수리 제안'을 판 모듈 `rooms`에서 메웠다. 항목마다의 표(틀의 칸·호환·연못에서 지운 꼼수)는 그 기록의 '메운 것', 쓰는 법은 [making-a-game.md](making-a-game.md) 14절(새 절 '셋 이상의 판', '자리 수의 범위', 화면의 막대 자리, '판 게임을 만들 때 걸리는 작은 것들').

| 무엇 | 틀의 칸 | 선택인가 |
|---|---|---|
| 바퀴마다 선 돌리기 | `RoomDef.rotateFirst`, `roundEnd(room)`, `skip(room, i)` (`pass`가 '이번 바퀴의 다음 자리' → '바퀴의 끝'으로) | 주지 않으면 차례·바퀴의 셈이 예전과 같다 |
| 셋 이상의 판에서 빠진 자리 | `RoomDef.outEnds`(판 끝내기), `out(room, i, why)`. 기본은 남은 사람끼리 잇기(예전 동작, 이제 문서에) | 기본이 예전 |
| 등수로 끝내기 | `g.rooms.finish(room, 등수 배열, 까닭, 점수?)`, `room.ranks`·`scores`, `RoomView.ranks`·`scores`, `g.rooms.rankOf`, `roomResult`의 셋째~다섯째 값, 결과 창의 등수 줄, 문장 `fmt.roomRankTitle`·`roomRankRow`·`roomScore` | 이긴 자리를 주는 `finish`는 그대로 |
| 자리 수의 범위 | `RoomDef.seats: { min, max }`, `startAfterS`, `cpuFill`, 명령 `room a:'start'`('지금 시작'), 안내문 `roomFewer`, `RoomView.min`, `RoomLobby.startAfterS` | `seats`가 수면 예전과 같다 |
| 좁은 화면의 막대 자리, 기권 확인 | `setRoomLook({ barAt: 'top' })`, css 변수 `--room-bar-bottom`·`--room-bar-top`, 기권은 3초 안에 두 번(`ui.roomResignSure`) | 막대 자리는 선택. 기권 확인은 모든 판 |
| 컴퓨터의 이름 | `RoomDef.cpuName`, `setRoomLook({ seatName })`, 컴퓨터가 둘 이상이면 틀이 번호(`fmt.roomCpuN`) | 하나면 예전처럼 `roomCpu` |
| 안내문 `roomStart` | 셋째 값 '자리 수': 셋 이상이면 'n명이 둡니다' | 앞 둘은 그대로 |
| 이름표가 실려 온 값을 쓰기 | `KindLook.label(e, vals)` (`engine/client/kinds.ts`, `entities.ts`: 값이 바뀌고 글이 바뀔 때만 쓴다) | `label(e)`는 그대로 |
| 타입의 입구 | `@engine/shared`·`@engine/client`가 `RoomView`, `RoomLobby`, `RoomRow`, `RoomSeatView`, `RoomPhase`를 `export type` | 새 내보내기 |
| 작은 문서의 빈 곳 | 5절(카메라 yaw 0의 방향, `forInput`), 8절(`spawn`의 `pid`와 `players.leave`, 게임의 시계 `game: { now }`), 11절(`onFrame`의 `(now ms, dt 초)`, 판의 본보기 파일), 12절(`label(e, vals)`), 14절(`Room.cpuAt`, 부하 도구의 `PLUGINS` 표) | |
| 본보기 | 틀의 시험의 '별 줍기'(셋~넷, `engine/test/core/server/stars.ts`, 화면 `client/stars.ts`): 14절의 조각이 지운 징검돌 대신 여기서 따온다(문서 견본 시험이 확인) | |

확인:
- `npm run typecheck` 설정 8개 오류 0. `npm test` 두 번 모두 통과(검사 2070 → 2106개: 판 모듈의 틀 시험 `core/rooms` 60 → 95개). 등불지기의 문장 견본(`games/deungbul/test/fixtures/locale-*.json`)은 틀의 새 문장 7개와 바뀐 3개(`roomWaiting`, `roomResult`, `roomStart`)만 새로 떴다. `npm run build:all` 통과.
- 황금 실행(`turnfw-tools/golden.mts`, 바탕 `a517a06`과 이 가지): 등불지기(sim) 7,489,205바이트·sample 3,364,852바이트 모두 바이트까지 같다. 두 게임은 판 모듈을 쓰지 않는다.
- 되살린 연못·징검돌(이 가지의 복사본에서만 `git checkout 7e347c9 -- …`, 확인 뒤 지움: 커밋하지 않았다): 연못의 꼼수 넷(선 돌리기, 등수의 결과 글, 폰 막대 css, 컴퓨터 이름)과 타입 끌어내기를 새 칸으로 바꾸고 셋으로 시작을 더해 시험 115 → 124개 통과, 징검돌은 고치지 않고 87개 통과. 화면(PC·폰 × 한국어·영어): 넷의 판의 등수 결과 창, 사람 셋이 '지금 시작'으로 셋의 판, 폰 막대가 위·기권 확인, 컴퓨터 이름(게임의 '컴퓨터(파랑)'과 틀의 '컴퓨터 1·2·3'), 징검돌은 예전 그대로. 자세히는 [proof-pond.md](proof-pond.md) '메운 것'.
- 부하(30초, 바탕과 번갈아 두 번씩): 사람끼리 판 100개 틱 평균 0.19·0.20 → 0.18·0.21ms, 컴퓨터와 둔 넷의 판 100개 0.87·0.81 → 0.83·0.77ms. 느려지지 않았다.

## 턴제의 빈 곳 메우기 (2026-11-26, 가지 `feat/turnfw`)

문서만 보고 만든 징검돌 전술의 증명 기록 [proof-stepstone.md](proof-stepstone.md)(평가 3.5/5)의 '틀의 빈 곳'을 메우고 징검돌을 그 칸으로 옮겼다. 항목마다의 표와 균형·판 저장의 까닭은 그 기록의 '메운 것', 쓰는 법은 [making-a-game.md](making-a-game.md) 14절.

| 무엇 | 틀의 칸 | 선택인가 |
|---|---|---|
| 판·방 나누기, 대기실·짝짓기, 차례와 기한, 끊긴 사람, 판의 저장 | 스물셋째 모듈 **`rooms`**(`engine/server/game/systems/rooms.ts`, `engine/client/hud/rooms.ts`, `engine/shared/defs/rooms.ts`): `g.rooms.define(RoomDef)`, 명령 `room`, 개인 상태 `room`, 공유 상태 `rooms`, 안내문 `room…` 13가지, 월드 저장 `rooms`(게임이 `save`/`load`를 줄 때만). 의존 없음. `RPG_MODULES`에 들지 않는다. 규칙 플러그인보다 먼저 만든다(`teams`처럼) | 모듈 (고르지 않으면 시스템·명령·상태·화면이 없다) |
| 땅 누르기를 게임이 받기 | `setTapHandler` (`actions.ts`) | 부르지 않으면 예전과 같다 |
| 연출 사건 | `g.effect` → 사건 `['fx', id, name, …vals]` → `onEffect` | 부르지 않으면 사건이 없다 |
| 카메라 돌리기, 폰 세로에서 한가운데 | `setCameraYaw`/`cameraYaw`(`view.yaw`), `CameraAim.center`(`view.offsetMeters`, `rightDir`) | 0·없음이면 예전의 셈 그대로 |
| 대화창에 남기지 않는 안내문, 틀의 모듈이 기본 분류·소리를 줄 때 게임의 것을 이기지 않게 | `addNotices({ quiet })`, `addNotices(…, keep)`, `addMsgSounds(…, keep)` | 적지 않으면 예전과 같다 |
| 순간 이동 | `g.movement.teleport(e, x, z, face?)` | 새 함수 |
| 자리 css의 세기 | `#rightcol .panel:not(.free)`, `#topmid .panel:not(.free)`: `class="panel free"`인 창만 자리의 쌓기를 받지 않는다 | `free`를 주지 않으면 같다 (게임 css의 `#rightcol`·`#topmid` 규칙은 모두 아이디 둘이라 세기 다툼이 바뀌지 않는다) |
| 판에 다시 앉은 사람을 채널이 들판에 세우지 않기 | `channels.ts`의 `playerJoined`에 `g.rooms.holds(p)` 한 줄 | `rooms`를 고른 게임에서만 |
| 부하 도구 | `scripts/load.mjs`에 `stepstone`, 접속자의 방식 `room`(둘씩 빠른 대국)·`roomcpu`(컴퓨터와) | |
| 문서 | 6절 요약표(끊긴 사람·`pid`·`REJOIN_KEEP_S`, 순간 이동, `g.remove`, 연출), 6절 (1)의 명령 칸 `t`, 6절 (4)의 자리 css·`#stick`, 5절 카메라(폰 세로·돌리기·`face`), 8절 피어의 `sys`, 11절 일람표, 4절 포트 표(3008·3009), 14절 | |

징검돌: 대국판 여섯 자리 → 하나(판마다 층), 대기실·판의 막대·결과 창·초읽기·끊김·기권·다시 하기·걷기 멈춤·누르기 가로채기·`fx` 개인 상태·폰 화면 밀림 셈·아이디 둘 css를 지우고 틀의 칸으로. 기다리다 30초면 컴퓨터가 앉는다(`cpuAfterS`). 균형: 첫 바퀴에 나중 편의 피해 1 덜함(먼저 두는 편 승률 11% → 52.6%, 컴퓨터끼리 2000판). 판 저장: 이어 가기(다시 켠 서버로 같은 브라우저가 들어와 그 판·말의 칸으로 돌아오는 것을 실제 서버로 확인).

확인:
- `npm run typecheck` 설정 20개 오류 0. `npm test` 두 번 모두 통과(검사 2323개: 바탕 2256개 + 판 모듈의 틀 시험 `core/rooms` 60개 + 징검돌 80 → 87개), `npm run build:all` 통과.
- 황금 실행(`idleflow-tools/golden.mts`를 바탕 `aad43d0` 복제본과 이 가지에서): 등불지기(sim)·sample·cave·starmine·bastion·rollball·dalmuri 일곱 모두 바이트까지 같다. 징검돌은 판 모듈로 옮겨 줄 위의 글자가 바뀌는 것이 맞아 견주지 않았다(그 대신 시험 87개).
- 부하(`npm run load:game -- stepstone …`, 30초, 같은 PC): 걷는 200명(판 없음) 틱 평균 0.23ms / 99% 0.53ms, 사람끼리 판 100개(200명) 0.21 / 0.37ms, 컴퓨터와 둔 판 100개 0.46 / 1.03ms, 컴퓨터와 둔 판 200개(400명 가운데 `max` 200까지) 0.80 / 1.62ms. 판이 많아도 틱은 1ms 안팎이다(틱 50ms).
- 화면(임시 서버 3017, 헤드리스 Chrome GPU): PC·폰 × 한국어(컴퓨터 상대: 대기실 → 기다림과 컴퓨터가 앉기까지의 초 → 시작 → 고르기·걷기·치기의 연출 → 결과)·영어(소켓 접속자가 판을 열고 브라우저가 목록에서 들어가 오른쪽 자리: 카메라가 돌아 내 진영이 왼쪽, 상대의 시간 넘김, 끝까지). 초읽기는 프레임마다 줄어든다(30초 0.976 → 29초 0.966 …). 콘솔 오류 없음. 화면: `%TEMP%\dg-work\turnfw-shots\`.

## 장르 중립 틀 (2026-11-26, 가지 `feat/neutral`)

독립 검토의 결론("쿼터뷰 탭 타깃 RPG 전용 틀")을 받아, 틀을 핵심과 선택 모듈로 나눴다. 새 게임을 만드는 법은 [making-a-game.md](making-a-game.md) 1절(핵심과 모듈), 3절(내용), 12절(전투 없는 게임의 짧은 예시).

| 무엇 | 틀 쪽 | 지키는 것 |
|---|---|---|
| 모듈의 표 | `engine/shared/modules.ts`: economy, growth, classes, combat, build, items, gear, mail, daily, idle, party, guild, market, dungeon, rank, away와 의존(`MODULE_TABLE`), `checkModules`(모르는 이름·빠진 의존을 오류로), `RPG_MODULES` | `core/core` |
| 계약 쪼개기 | `contract.ts`: `CoreContent`(MAP, MODULES)는 반드시, `CoreTuning`·`CombatContent`·`ItemsContent`·`GearContent`·`GrowthContent`·`MailContent`·`DungeonContent`·`SocialContent`·`EconomyContent`는 선택. `content.ts`가 게임이 적지 않은 이름을 `defaults.ts`(빈 표 포함)로 채운다: 게임은 `export *`로 받지 않는다. 몬스터 0, 직업 0, 아이템 0도 컴파일된다 | 최소 내용 `engine/test/core`의 타입 검사·시험 |
| 서버의 모듈 | `Game`이 고른 모듈의 시스템만 만든다. 고르지 않은 칸은 건드리면 무엇을 고르라는지 던지는 자리표(`off`). `g.has(모듈)`, `GameOptions.modules`. 사람의 틱은 전투가 없으면 `Movement.step`. stat·meta는 `systems/status.ts`가 고른 모듈의 칸만(`g.perFlush`). 저장의 최상위 칸도 모듈마다(칸의 차례는 그대로) | `core/core`(명령 20가지가 웹소켓에서 거절), `fx/modules`(모듈을 줄인 서버는 뺀 모듈의 명령을 거절, 대조군은 응답) |
| 끈 모듈의 저장 | `MODULE_SAVES`: 고르지 않은 모듈의 저장 칸(캐릭터의 ext·최상위, 월드)은 읽은 그대로 두었다가 다시 적는다(`Ent.kept`, `keptWorld`) | `fx/modules` |
| 엔티티 종류 | 서버 `g.defineKind(id, { tick, sync, save, load })`, `g.place`, `Ent.data`. 화면 `registerKind(id, { model, update, label, snap, animate, h, dot })`, `makeBox`·`makeBall`. 상태 줄 `[id, x, z, 방향, 이동, 체력, …값]`. 저장은 월드의 `kind.<종류>` | `core/core` |
| 주기와 시야 | 내용의 `NET`(tickMs, snapEvery, aoi, aoiLeave). 기본은 예전 값(50ms, 2틱, 32m, 36m) | `core/core`(시야 20m) |
| 화면의 모듈 | 뼈대의 `data-mod`(붙일 때 고르지 않은 모듈의 요소를 뺀다), 틀의 화면 모듈은 고른 것만 init(`client/modules.ts`), 메뉴 탭마다 모듈, 키는 모듈이 `bindKey`로(숫자·Tab 전투, Q·B 아이템, R 자동 사냥, M·N·H 핵심), 기본 조작 안내도 고른 모듈의 키만, `hasModule`, `withIdNames` | `core/core`(뼈대의 표시), 화면(공 마당과 등불지기 전후) |
| 저장소 | `Store`(핵심)와 `EconStore`(경제 장부)를 나눔. 서버는 economy와 `hasEcon(store)`일 때만 장부를 적는다 | `fx/ledger`, `fx/ops` |
| 게임 등록 자동화 | `scripts/deploy.mjs`의 `listGames`(deploy.json이나 server/main.ts가 있는 폴더), `scripts/typecheck.mjs`, `node scripts/game.mjs list`·`build all`. `package.json`을 고치지 않아도 새 게임이 타입 검사·시험·빌드에 들어간다 | `npm run typecheck`, `npm test`, `npm run build:all` |

게임 다섯이 고른 모듈: 등불지기·버섯 동굴은 전부. 모닥불 사냥터·별가루 광산·돌담 마을은 거래소·길드(메뉴에서 감추기만 하던 것)와 던전(없는 게임)을 뺐다.

아직 RPG에 묶인 것(장르 중립 틀의 남은 한계):

- 모듈의 엔티티 칸은 2026-11-26부터 그 모듈을 고른 게임의 엔티티에만 있다(아래 '엔티티의 모듈 몫'). 다만 타입(`Ent`)에는 늘 보인다: 고르지 않을 수 있는 모듈의 칸을 묻지 않고 쓰는 것은 컴파일러가 아니라 시험(`fx/parts`)이 잡는다.
- 서버의 바깥 통(`cdAcks`, `itemCds`, `gears`, `partyOut`)과 본인의 `you`의 체력 칸은 틀에 남았다(모듈을 고르지 않으면 비어 있거나 0). 상태 줄의 체력 칸과 `EnterInfo`의 무기·직업·체력 칸은 2026-11-26부터 그 모듈을 고른 게임에만 있다(아래 '빈틈 메우기').
- '쓰러짐'에서 온 `rules.respawn`, 채널의 '바쁜 때'(`tellBusyS`)는 이름이 RPG에서 왔다. 핵심의 '집으로'(H, `goToTown`)는 2026-11-26부터 내용의 `HOME_KEY = false`로 끌 수 있다.
- 엔티티끼리의 물리는 틀에 없다(게임이 만든다). 팀과 점수판은 2026-11-26부터 `teams` 모듈. 역할처럼 사람마다 남이 보는 다른 값은 `g.playerSync`로 싣는다.

## 수집형·방치형 모듈 (2026-11-26, 가지 `feat/collect`)

"○○ 키우기"류(영웅을 뽑아 모으고 키워 편성하고, 자동으로 단계를 깨고, 접속하지 않은 동안에도 보상)를 틀로 만들 수 있게 선택 모듈 넷과 던전의 열쇠를 더했다. 새 게임 쪽의 쓰는 법은 [making-a-game.md](making-a-game.md) 13절(모듈마다의 내용 모양·명령·사건·화면, 본보기).

| 무엇 | 틀 쪽 | 지키는 것 |
|---|---|---|
| 모듈의 표 | `modules.ts`: `roster`(economy), `gacha`(roster, economy), `squad`(roster, combat), `stages`(combat). `COLLECT_MODULES`. `RPG_MODULES`에서 빠진다(등불지기·버섯 동굴에 저절로 생기지 않게). 표의 맨 뒤라 다른 모듈의 만드는 차례·엔티티 칸의 차례가 그대로다. `MODULE_SAVES.player`에 `roster`, `gacha`, `squad`, `stages`, `keys`(던전) | `collect/rules`(의존), `fx/modules`, `fx/parts`(모듈마다 띄워도 고르지 않은 칸이 생기지 않는다. 칸 다섯 `heroes`·`pity`·`pulls`·`squad`·`stage`) |
| 계약 | `contract.ts`의 `CollectContent`: `HEROES`, `HERO_RARITIES`, `HERO_ROLES`, `HERO_RULES`, `BANNERS`, `GACHA_RULES`, `SQUAD_RULES`, `CHAPTERS`, `STAGE_RULES`(기본값은 `defaults.ts`: 빈 표와 등급 셋). 타입과 도우미는 `engine/shared/defs/collect.ts`(능력치·전투력, 확률표 `poolOdds`·`pickOdds`·`rateTable`, `seededRng`, `STAGES`). `DungeonDef.key`·`gear`(선택), `IDLE.reward`의 셋째 인자 `IdleCtx`(깬 단계의 수: 두 인자 식도 그대로) | 타입 검사 설정 `engine/test/collect/tsconfig.json`(넷째 틀 설정), 경계 검사 |
| 영웅 | `systems/roster.ts`(`g.roster`): 얻기(`grant`: 처음이면 등급의 처음 별, 또 얻으면 조각), 레벨 업(지갑, `cmd:hero:level`, 별마다 레벨 상한), 별 올리기(조각), 사건 `heroChanged`, 개인 상태 `heroes`, 저장 `ext.roster` | `collect/rules`, `collect/saves` |
| 뽑기 | `systems/gacha.ts`(`g.gacha`): 1·10번, 값은 지갑(`cmd:gacha`, 게임 안의 재화만: 결제·구매 훅 없음), 영웅마다의 무게로만 정하는 확률, 천장(배너마다·사람마다 저장), 10번 보장, 기록(최근 `GACHA_RULES.history`), 메시지 `gacha`, 바꿔 끼우는 난수 `rng` | `collect/rules`(정해진 난수로 30,000번: 영웅마다 4시그마 안, 천장 50번째, 10번 보장, 값, 같은 씨앗이면 같은 결과), `collect/client`(공개 확률표의 합, 서버 셈과 같음) |
| 편성 | `systems/squad.ts`(`g.squad`): 엔티티 종류 `hero`(주인을 따라다님, 대상 고르기, 기본 공격·기술, 쓰러졌다 일어나기, 층 따라가기, 주인이 나가면 사라짐), 자동으로 채우기, 개인 상태 `squad`, 저장 `ext.squad`. 전투에 `registerAlly(종류, { owner, down, skillScale })`: 사람 편 종류의 피해는 주인의 것(처치 보상·`hit`), 몬스터가 노리고, 체력 0이면 `down`. 아군 회복·강화도 닿는다(등록한 것이 없는 게임의 셈은 그대로) | `collect/rules`(영웅이 몬스터를 잡고 보상은 주인에게, 쓰러짐·일어남, 층), `collect/net` |
| 단계 | `systems/stages.ts`(`g.stages`): 사람마다의 인스턴스 층(던전과 함께 쓰는 층 번호의 줄 `layers.ts`의 `instanceLayer`), 물결·우두머리(정의를 복사해 `scale`), 깸(보상은 지갑·가방으로 바로, 원인 `stage`, 처음 깸, 사건 `stageCleared`), 자동 진행, 실패(쓰러짐·시간 → 깬 단계로, 자동 진행 끔, 파밍), 잠김, 사람도 대신 싸움(`leaderAuto`), 접속하면 바로 들어가기(`enterOnJoin`), 방치 보상의 깬 단계(`g.idle.stageOf`), 개인 상태 `stage`, 저장 `ext.stages` | `collect/rules`(1-1 깸 → 1-2, 실패 둘, 잠김, 1-5 우두머리 → 2-1, 방치 보상), `collect/net` |
| 던전의 열쇠 | `systems/dungeon.ts`: `DungeonDef.key`(`refill`, `cap`, `buy`)가 있는 던전만 열쇠(날마다 채움·상한·사기 `dungeonKey`·하루 한도, `giveKeys`, `keyCount`, 개인 상태 `keys`, 저장 `ext.keys`). `gear: false`면 장비 없이. 열쇠 던전이 없는 게임에는 저장 칸·개인 상태·명령이 생기지 않는다(하루 횟수의 길은 한 글자도 바뀌지 않았다). 함께 고친 것: 던전이 파티 모듈 없이 돌면 죽던 것(`g.party.mates`를 묻지 않고 불렀다) | `collect/rules`(채우기·상한·사기·하루 한도·저장), `fx/modules`(열쇠 던전이 없으면 칸 없음), 등불지기 황금 실행 |
| 화면 | `hud/collect.ts`(메뉴의 '영웅'·'뽑기'·'편성' 탭을 `addMenuTab`으로, 뽑기 결과 창, 공개 확률표, 영웅의 겉모습 `registerKind('hero')`), `hud/stagebar.ts`(가운데 위 단계 막대, '단계' 탭), `hud/dungeon.ts`(열쇠 줄), 셈 `hud/collectcalc.ts`(화면 요소를 읽지 않는다). `registerKind`에 `hp`(이름표의 체력 막대), `shot`(날아가는 것). 화면 모듈 목록의 맨 뒤라 고르지 않은 게임의 init 차례가 그대로. 문장은 한국어·영어(틀의 키 81개). 레벨 업 안내문은 능력치 모듈이 있을 때만 '능력치 점수'를 말한다(없는 게임의 거짓 안내였다) | `collect/client`, 화면(영웅 들판 PC 1280×720·폰 390×844, 한국어·영어) |
| 본보기 | `engine/test/collect/`("영웅 들판": 영웅 여섯·역할 넷·배너 하나·장 둘 × 단계 다섯·금광 열쇠 던전, 플러그인 `server/heath.ts`, 화면 `client/main.ts`, `vite.config.ts` → `dist-collect/`). `test/all.ts`의 `collect` 묶음, `scripts/typecheck.mjs`의 틀 설정 | `npm test`의 `collect/rules`·`saves`·`client`·`net` |

등불지기가 바뀌지 않았다는 증거(바탕 커밋 `c00c159`의 작업 트리와 이 가지를 같은 도구로 돌려 바이트를 견줬다. 도구는 `$TEMP/dg-work/collect-tools/golden.mts`: 엔티티 칸의 가지 `entcore`의 황금 실행에 던전을 더한 것):

- 황금 실행: 시계와 난수를 고정하고 새 사람 9·봇 6을 4분(4,800틱) 돌렸다. 엔트코어 때의 명령 전부에 더해 **던전**: 셋이 레벨을 올려 지하묘에 하루 다섯 번 들어가려 하고(셋은 들어가고 둘은 `dungeonNoRuns`), 날을 넘겨 다시 들어간다(들어감 12, 거절 6). 전송마다의 스냅샷·`stat`·`meta`·개인 상태·사건·안내문·바깥 통·공유 상태, 끝의 캐릭터 저장·엔티티 전부·월드 저장: 27,240줄 5,214,110바이트가 같다(sha256 `dbf60fd7…`).
- 다른 게임(같은 실행을 새 사람 9·봇 6으로 2분): 모닥불 사냥터·버섯 동굴·별가루 광산·돌담 마을·굴림공 모두 바이트까지 같다.
- 시험: `fx/wire`(예전 스냅샷과 글자 비교), `deungbul/saves`(옛 견본과 운영 DB 견본의 읽기 결과), 문장 견본(`games/deungbul/test/fixtures/locale-*.json`: 틀의 새 키만 더해졌고 달라진 문장 0).
- 화면: 바탕과 이 가지의 등불지기 서버(3016, 3015)를 같은 자리(`DEV_SPAWN`)에서 띄워 PC 1280×720·폰 390×844에서 접속 → 직업 고르기 → 메뉴를 열고, 모든 id 요소의 숨김·class를 견줬다: 같다(무작위 이름만 다르다). 빌드(`dist/`)는 다르다: 화면 모듈 목록에 수집형의 화면 코드와 css가 더해졌다(고르지 않아 init되지 않는다).

남은 것과 주의: [making-a-game.md](making-a-game.md) 13절 '남은 것'(영웅의 장비·시너지·진형은 뒤의 '영웅의 성장'에서 더했다, 영웅만 싸우는 모드, 픽업·선택권, 파티 단계, 소탕권 없음). 단계의 몬스터는 몰려온 적(`swarm`)이라 게임의 `g.rules.siege`가 있으면 그곳으로 가려 한다(단계의 대상 고르기가 먼저 대상을 준다). 단계 안의 사람은 서버가 움직이므로 화면의 예측과 잠깐 어긋날 수 있다(위치 보정으로 따라간다).

## 영웅의 성장 (2026-11-26, 가지 `feat/herogrow`)

수집형 모듈 위에 "키우기"의 깊이를 더했다: 영웅 장비, 기술 레벨, 각성, 시너지, 진형(앞줄·뒷줄), 그리고 그것을 모두 넣은 한 가지 전투력. **모두 내용이 적어야 켜진다**(새 모듈 `herogear`와 `HERO_RULES.skill`·`awaken`·`gear`·`power`, `HeroDef.tag`, `SQUAD_RULES.synergy`·`rows`): 적지 않은 게임은 저장·줄 위의 글자·싸움이 예전과 같다. 쓰는 법은 [making-a-game.md](making-a-game.md) 13절 '영웅의 성장'.

| 무엇 | 틀 쪽 | 지키는 것 |
|---|---|---|
| 셈 | `engine/shared/defs/herogrow.ts`(서버와 화면이 함께): `heroFull`(최종 공격·체력·덤·전투력), `squadView`(시너지까지, 편성의 전투력), `setBonuses`, `synergyOf`, `arrangeRows`, `gearStats`, `defaultPower`. 덤은 한 모양 `HeroBonus`, 값은 `HeroCost`. 게임의 내용은 자기 타입 그대로 오므로 선택 칸은 틀의 타입(`HeroRules`, `SquadRules`)으로 넓혀 읽는다(옛 게임의 좁은 타입도 컴파일된다) | `collect/growth`(성장이 없으면 `heroStats`·`heroPower`와 같다, 세트 2·4, 각성, 시너지의 단, 진형) |
| 영웅 장비 | 모듈 `herogear`(의존 roster, items, economy: `COLLECT_MODULES`·`RPG_MODULES` 어디에도 들지 않는다), `systems/herogear.ts`(`g.herogear`): 칸, 끼기·바꾸기·옮기기·빼기, 강화(지갑·가방, `cmd:hgear:enhance`, 확률, 상한), 분해(`cmd:hgear:salvage`), 세트, 단계·던전에서 떨어짐(사건 `stageCleared`·`dungeonCleared`를 들을 뿐 두 시스템은 고치지 않았다), 가득 참. 엔티티 칸 `hgear`·`hgSeq`, 개인 상태 `hgear`, 저장 `ext.herogear`, 명령 `hgear` | `collect/growth`, `collect/growthsaves`, `collect/growthnet` |
| 기술 레벨·각성 | `systems/roster.ts`의 선택 칸: 명령 `hero`의 `a: 'skill' \| 'awaken'`, 값은 `systems/herocost.ts`의 `payCost`(재화·재료를 모두 보고 치른다: `costShort`·`itemShort`), 원인 `cmd:hero:skill`·`cmd:hero:awaken`. 기술 레벨은 전투의 `skillScale`에 곱한다. 저장 `ext.roster`의 줄은 오른 영웅만 다섯 칸(나머지는 예전의 셋: 이전 없음) | `collect/growth`, `collect/growthsaves`(성장 전의 저장이 글자까지 같게 다시 적힌다) |
| 시너지·진형 | `systems/squad.ts`의 선택 칸: 앞줄은 주인 앞, 뒷줄은 뒤. 앞줄 영웅이 둘레에서 주인·뒷줄을 노리는 몬스터를 자기에게 돌린다(몬스터 시스템과 단계는 고치지 않았다). 줄의 덤과 받는 피해는 전투의 새 접점 `registerAlly`의 `guard?`(등록한 것이 없거나 1이면 셈이 그대로). 엔티티 칸 `squadBack`, 저장 `ext.formation`, 개인 상태 `squad`의 `back`·`syn`, 명령 `squad`의 `back` | `collect/growth`(단계의 싸움에서 앞줄이 먼저 맞는다, 앞줄은 40을 30만 받는다, 도발), `collect/growthnet` |
| 전투력 | `HERO_RULES.power?`(없으면 `defaultPower`). `g.roster.power`, `g.squad.power`, 개인 상태 `squad.power`가 이 셈이고, 화면(영웅 탭·상세·편성·단계 탭의 '내 편성')이 같은 셈을 쓴다. 단계의 권장 전투력과 견주는 화면은 `squad.power`를 그대로 읽으므로 단계 모듈은 고치지 않았다 | `collect/growth`·`collect/growthnet`(서버 = 개인 상태 = 화면의 셈) |
| 화면 | `hud/herogrow.ts`(영웅 상세: 레벨·별·각성·기술·장비 탭, 메뉴의 '영웅 장비' 탭과 강화 창, 편성 탭의 앞줄·뒷줄과 시너지), 셈 `hud/herogrowcalc.ts`. `hud/collect.ts`에는 걸쇠만(상세 열기, 진형 그리기). 화면 모듈 목록의 맨 뒤에 `initHeroGear`. 문장은 한국어·영어(새 키 65: 등불지기의 문장 견본은 새 키만 더해졌고 달라진 문장 0) | `collect/growthclient`, `collect/client`, 화면(PC·폰, 한국어·영어) |
| 본보기 | 영웅 들판에 재료 셋(기술서·각성석·강화석: 단계의 보상), 영웅 장비 열셋(칸 넷, 세트 둘), 기술 레벨, 각성 세 단계(패시브 둘), 진영 셋, 앞줄·뒷줄 둘씩 | `npm test`의 `collect/growth`·`growthsaves`·`growthnet`·`growthclient` |

바뀌지 않았다는 증거(바탕 커밋 `2dc943b`의 작업 트리와 이 가지를 같은 도구로 돌려 바이트를 견줬다. 도구는 `$TEMP/dg-work/herogrow-tools/golden.mts`(앞 가지의 것 그대로)와 `golden2.mts`):

- 등불지기 황금 실행(시계·난수 고정, 새 사람 9·봇 6, 4분, 던전 포함): 27,240줄 5,214,110바이트가 같다. 시제품 다섯(모닥불 사냥터·버섯 동굴·별가루 광산·돌담 마을·굴림공)도 바이트까지 같다.
- **이 기능 전의 수집형 게임**: 바탕의 영웅 들판 내용(성장을 적지 않은 것)을 두 틀에서 같은 실행(뽑기·레벨 업·별·편성 바꾸기·단계 나오기·다시 들어가기·고르기를 더한 2분)으로 돌렸다: 스냅샷·개인 상태·안내문·저장 16,378줄이 같고, 엔티티를 통째로 적은 줄에 빈 칸 `squadBack: []`이 더해진 것만 다르다(그 칸을 지우면 바이트까지 같다). 지금의 API로 만들고 있는 게임은 이 기능을 적지 않는 한 그대로다.
- 시험: `fx/wire`, `deungbul/saves`, 문장 견본(새 키만), `fx/parts`(칸 셋 `squadBack`·`hgear`·`hgSeq`는 그 모듈을 고른 게임에만).

남은 것과 주의: 전용 무기·장비의 무작위 옵션·장비 뽑기 없음, 영웅 장비는 거래소에 올릴 수 없다(장부에는 재화·재료만), 진형의 도발은 앞줄 영웅의 둘레(`taunt`) 안만 본다(멀리서 쏘는 몬스터는 거리가 멀면 그대로 주인을 노릴 수 있다). 시너지·줄의 덤과 각성의 패시브는 공격·체력·주는 피해·받는 피해만 다룬다(치명타·속도 같은 덤은 없다).
남은 것과 주의: [making-a-game.md](making-a-game.md) 13절 '남은 것'(영웅의 장비·시너지·진형, 영웅만 싸우는 모드, 파티 단계. 픽업·선택권·소탕·오프라인 진행은 뒤의 가지 `feat/sweep`이 더했다). 단계의 몬스터는 몰려온 적(`swarm`)이라 게임의 `g.rules.siege`가 있으면 그곳으로 가려 한다(단계의 대상 고르기가 먼저 대상을 준다). 단계 안의 사람은 서버가 움직이므로 화면의 예측과 잠깐 어긋날 수 있다(위치 보정으로 따라간다).

## 소탕·오프라인 진행·픽업 배너 (2026-11-26, 가지 `feat/sweep`)

상용 '키우기'·수집형 RPG가 흔히 갖춘 셋을 수집형 모듈에 더했다(장르의 관례만 따르고 특정 게임의 이름·내용은 쓰지 않았다). 모두 **더하기만** 한 선택 칸이다: 내용에 적지 않으면 명령·개인 상태의 칸·저장의 칸이 생기지 않거나 예전과 같은 모양이다. 쓰는 법은 [making-a-game.md](making-a-game.md) 13절.

| 무엇 | 어디 | 시험 |
|---|---|---|
| 소탕 | 내용 `STAGE_RULES.sweep`·`StageDef.sweep`·`DungeonDef.sweep`(`SweepRule`: 값은 소탕권 아이템이나 재화, 한 번의 상한). 서버 `stages.ts`의 `sweep`(명령 `{ t: 'stage', a: 'sweep', id, n }`), `dungeon.ts`의 `sweep`(명령 `dungeonSweep`, 열쇠 n개, 끝낸 적 `won`: 열쇠 저장의 넷째 칸 `1`, 개인 상태 `keys`의 `won`), 도우미 `systems/sweep.ts`. 값은 `g.bag`/`g.wallet`(원인 `cmd:stage:sweep`, `cmd:dungeonSweep`), 보상은 바로(원인 `sweep`), 메시지 `sweep`, 사건 `swept`. 화면 `hud/sweep.ts`(결과 창, 단추), '단계' 탭의 단추와 던전 소탕의 줄, 던전 창의 소탕 줄 | `collect/sweep`(소탕권·보상·장부, 잠김, 상한, 모자람, 진행 중인 회차, 열쇠 던전, 재화 값, 저장), `collect/client`(`sweepView`), `collect/sweepnet` |
| 오프라인 진행 | 내용 `STAGE_RULES.offline`(`OfflineRules`). 셈 `offlinePlan`·`idleSegments`(`shared/defs/collect.ts`). 서버 `stages.ts`의 `offline`(가장 멀리 깬 단계·지금 단계를 옮기고 처음 깬 보상과 보통 보상을 바로, 원인 `stageAway`, 사건 `stageCleared`, 안내문 `stageAway`), `idle.ts`의 `advance`(방치 보상을 깬 단계의 토막마다 셈하고 우편 제목 값에 진행). 서버 시계(`g.now`)만 쓴다 | `collect/offline`(표 13줄: 권장 이상·미만, 짧은 틈, 다음 단계부터, 마지막 단계, `maxStages`, `maxH`, `need`, 자동 진행 끔, 거꾸로 간 시계, 1970년·아주 큰 틈. 셈의 NaN·무한대, 토막, 보상, 같은 입력 같은 결과, 끈 게임은 예전과 같음, idle 없는 게임), `collect/sweepnet` |
| 픽업·기간 한정 배너, 선택권 | 내용 `BannerDef.pickup`·`fiftyFifty`·`pityGroup`·`start`·`end`, `GACHA_RULES.select`. 한 확률 함수 `pullOdds`(서버의 뽑기와 공개 확률표), 실효 확률 `effectiveOdds`(천장·확정을 상태로 한 사슬의 정상 분포), `pityKey`·`bannerOpen`. 서버 `gacha.ts`(닫힌 배너 `bannerClosed`, 확정은 시스템이 맡는다: 엔티티 칸을 늘리지 않았다, 선택권 `{ t: 'gacha', a: 'select', item, hero }`). 개인 상태 `gacha`의 `open`·`sure`(그런 배너가 있는 게임만), 저장 `ext.gacha.sure`(있을 때만), 무리에 든 배너의 옛 셈은 읽을 때 무리로. 화면 `hud/collect.ts`(픽업·남은 기간·확정·천장 공유, 확률표의 픽업과 반반·확정·실효, 선택권의 줄) | `collect/pickup`(몫, 정해진 난수 12만 번과 실효 확률, 반반, 천장 무리, 기간, 같은 씨앗, 선택권), `collect/client`(화면의 표가 `pullOdds`와 같다, 소스에서 같은 함수), `collect/saves`(왕복, 옛 셈의 옮김, 깨진 값) |

함께 고친 것: 시험용 내용(영웅 들판)에 소탕권·선택권·한정 배너 둘·오프라인 진행·금광 소탕을 더했다. 틀의 문장(한국어·영어) 31개, 경계 검사의 틀 낱말에 `sweep`(소탕의 명령·원인 이름: 몇몇 게임의 기술 id와 글자만 같다). 엔티티의 칸·모듈의 표·저장 칸의 이름은 그대로다(`roster`·`squad` 시스템은 건드리지 않았다).

등불지기가 바뀌지 않았다는 증거(바탕 커밋 `2dc943b`의 복제본과 이 가지를 같은 도구로 돌려 바이트를 견줬다. 도구는 `$TEMP/dg-work/sweep-tools/golden.mts`: `feat/collect`의 황금 실행에 돌아온 사람 둘(세 시간 비운 사람과 마지막 접속이 앞날인 사람: 방치 우편의 셈)을 더한 것):

- 황금 실행(시계·난수 고정, 새 사람 9·돌아온 사람 2·봇 6, 4분 4,800틱, 던전 출입 포함): 7,489,205바이트(sha256 `ba83af30…`)가 같다. 시제품 다섯(모닥불 사냥터·버섯 동굴·별가루 광산·돌담 마을·굴림공, 2분)도 모두 바이트까지 같다.
- 시험: `fx/wire`, `deungbul/saves`, 문장 견본(`games/deungbul/test/fixtures/locale-*.json`: 틀의 새 키 31개만 더해졌고 달라진 문장 0).

남은 것: 하루 소탕 횟수의 한도, 천장에서 고르는 교환 상점, 오프라인 진행의 실제 싸움 흉내(전투력 비교만 한다)는 없다. 소탕으로 받은 아이템이 가방 한도를 넘으면 넘는 몫은 받지 않는다(단계의 보상과 같다).

## 달무리 옮기기 (2026-11-26, 가지 `feat/dalmig`)

달무리 원정대(`games/dalmuri`)는 아래 '단계 밖' 칸이 생기기 전에 문서만 보고 만든 게임이라 꼼수가 남아 있었다. 그것을 지우고 틀의 칸으로 옮겼고, 그 뒤에 생긴 수집형의 칸도 쓰게 했다. 지운 꼼수와 쓴 칸, 정한 수치와 그 이유는 [proof-dalmuri.md](proof-dalmuri.md) 끝의 '옮긴 것'. 게임의 서버 코드는 처음 온 대장의 준비와 일일 임무의 셈만 남았다(113줄 → 32줄, 공용 선언 파일은 지웠다).

| 무엇 | 달무리 | 시험 |
|---|---|---|
| 지운 꼼수 → 칸 | `keyrun` → `DungeonDef.fromMenu`·`auto`·명령 `dungeonGo`·`STAGE_RULES.returnAfterDungeon`, `essence` → `HERO_RULES.trade`, `idleGain` → `IDLE.popup`, 옷 색 → 등급 → `setHeroModel`, css `#bagBtn`·`#tabBtn` → `HUD.hide`, 손수 만든 줄 → `menuRow`·`menuButton`·`menuEl`·`closeMenu`·`myKeys`, `CAMPS`·`as ItemDef['kind']` → 적지 않음 | `dalmuri/net`(메뉴 → 던전 자동 전투 → 단계로, 교환), `dalmuri/content` |
| 새로 쓴 칸 | 단계·던전 소탕(소탕권), 오프라인 진행(15분에 한 단계), 기간 한정 픽업 '월식 소환' 셋(반반, 천장 공유), 전설 선택권, 모듈 `herogear`(칸 셋, 세트 둘, 전설 하나), 기술 레벨, 각성 셋, 진영 셋의 시너지, 앞줄·뒷줄 | `dalmuri/content`(표·출처·확률), `dalmuri/net`(소탕, 픽업 천장과 반반, 장비 끼기·강화, 기술, 별 6과 각성, 돌아왔을 때의 창 하나만), `dalmuri/pacing`(처음 30분) |

틀에서 고친 것 (둘 다 `IDLE.popup`을 켠 게임에만 바뀐다. 켜지 않은 게임은 예전과 같다):

| 무엇 | 고친 곳 | 시험 |
|---|---|---|
| 돌아왔을 때의 창이 폰에서 뒤의 글자가 비쳐 보였다 | `engine/client/style.css`의 `#idleBackPop` 바탕 `rgba(var(--ink-rgb), .97)` → 메뉴·가방·지도와 같은 `var(--ink)` | `collect/idleflow`(창의 바탕이 메뉴와 같은 토큰), 화면(폰에서 계산된 바탕 `rgb(27, 34, 56)`) |
| 오프라인 진행을 안내문 `stageAway`와 창에 두 번 알렸다 | `stages.ts`의 `offline(p, ms, quiet)`: 방치 모듈이 부를 때 `IDLE.popup`이면 안내문을 내지 않는다. `idle.ts`의 `awayNote`: 창이 뜨지 않았으면(`minMin`보다 짧게 비움, 우편이 없음) 그때만 안내문 | `collect/offline`(창을 쓰면 창 하나·안내문 0, 짧게 비우면 안내문 하나, 봇, 창을 끈 표 13줄은 예전 그대로), `collect/sweepnet`(실제 접속: 창 하나, 안내문 없음), `dalmuri/net` |

바뀌지 않았다는 증거(바탕 커밋 `aad43d0`의 복제본과 이 가지를 같은 도구로 돌려 바이트를 견줬다. 도구는 `$TEMP/dg-work/dalmig-tools/golden.mts`·`golden.sh`: `idleflow-tools`의 것에 징검돌 전술을 더했다):

- 등불지기 황금 실행 7,489,205바이트(sha256 `ba83af30…`, 앞 가지들과 같은 값), 모닥불 사냥터 3,364,852, 버섯 동굴 3,622,342, 별가루 광산 3,617,591, 돌담 마을 3,633,219, 굴림공 4,812,906, 징검돌 전술 1,849,536바이트가 모두 같다.
- 달무리는 달라졌다(2,415,106 → 2,401,635바이트): 도구가 보내는 옛 게임 명령 `keyrun`·`essence`가 없어져 무시되고, 영웅 장비가 떨어지고(`hgear`·`hgDrop`), 시너지·진형의 칸이 편성 상태에 붙고, 열린 배너·소탕권이 개인 상태에 생겼기 때문이다(의도한 변화).
- 옛 저장: 바탕 커밋의 달무리로 임시 DB에 플레이 기록(영웅 여섯, 열쇠 던전 한 번, 별정수, 천장의 셈)을 만들고 이 가지로 열었다. 영웅의 레벨·별·조각, 편성, 별정수, 열쇠와 '끝낸 적', 천장의 셈이 그대로이고, 세 시간 뒤라 돌아왔을 때의 창이 한 번(진행 1-2 → 1-7) 뜨고 안내문 `stageAway`는 없었다. 옛 캐릭터로 교환·소탕도 된다(도구 `dalmig-tools/compat.mts`).
- 화면: 3015에 띄워 PC 1280×720·폰 390×844 × 한국어·영어로 단계, 영웅 탭의 교환 단추, 영웅 상세의 장비·각성, 영웅 장비 탭, 편성의 진형·시너지, 픽업 배너와 확률표, 단계 탭의 소탕과 결과 창, 던전 줄, 원정 탭, 메뉴에서 들어간 던전의 자동 전투, 시계를 세 시간 앞으로 해 다시 켠 뒤 돌아왔을 때의 창과 받기를 찍었다(`$TEMP/dg-work/dalmig-shots/`, 콘솔 오류 없음, 가방·대상 공격 단추는 `display: none`, 창의 바탕은 불투명, 창 밖에 '자리를 비운 동안' 글이 없다).
- 시험: `npm test` 두 번 모두 통과(검사 2313개, 바탕 2256개), `npm run typecheck` 오류 0(설정 20개), `npm run build:all` 통과.

남은 것: 소탕 결과 창(`#sweepPop`)의 바탕도 합칠 때 같은 불투명 `--ink`로 고쳤다. 월식 소환은 2027-01-22에 셋이 끝난다(그 뒤의 픽업 배너는 내용에 더해 배포해야 한다). 처음 30분이 조금 빨라졌다(위 proof의 표).

## 단계 밖과 달무리의 빈 곳 메우기 (2026-11-26, 가지 `feat/idleflow`)

문서만 보고 만든 수집형 게임 달무리 원정대의 증명 기록([proof-dalmuri.md](proof-dalmuri.md))이 찾은 빈 곳을 틀에서 메웠다. 항목마다의 대응은 그 기록 끝의 '메운 것'. 쓰는 법은 [making-a-game.md](making-a-game.md) 13절 '단계 밖'. **모두 더하기만 한 선택 칸**이다: 내용에 적지 않은 게임은 명령·메시지·저장·화면이 예전과 같다(달무리도 고치지 않았고 그대로 돈다: 옮기는 것은 다음 작업).

| 무엇 | 내용 칸 | 서버 | 줄 위·장부 | 화면 | 시험 |
|---|---|---|---|---|---|
| 던전 안의 자동 전투 | `DungeonDef.auto` | `dungeon.ts`의 `autoFight`: 회차마다 0.3초에 한 번, 안의 사람(봇 말고)에게 `leaderFight`. 단계의 `leaderAuto`가 쓰던 셈을 `systems/leader.ts`로 옮겨 둘이 함께 쓴다(단계의 셈은 글자 그대로 옮겼다: 황금 실행이 같다). 입구 `@engine/server`에 `leaderFight` | 없음 | 없음 | `collect/idleflow`(대상, 체력이 준다, 손으로 움직인 1.5초, 끄면 예전), `collect/idleflownet`(스냅샷의 대상) |
| 던전 뒤 단계로 | `STAGE_RULES.returnAfterDungeon`(초) | 던전이 나갈 때 새 사건 `dungeonExited(p, id, 'self' \| 'end' \| 'drop')`을 낸다(`leave`의 셋째 인자, 기본은 예전의 뜻). 단계가 그것을 듣고 끊긴 것(drop)이 아니면 기다렸다가 `start`. `g.stages.returnIn(p)` | 없음 | 없음 | `collect/idleflow`(끝남·스스로·끊김, 그사이 단계에 들어감, 끄면 문 앞), `collect/idleflownet` |
| 메뉴에서 던전 | `DungeonDef.fromMenu` | 명령 `{ t: 'dungeonGo', id }`(그런 던전이 있는 게임만), `g.dungeon.go`: 입장 조건을 먼저 보고(새 `allowed`: 문의 `enter`가 하던 확인을 그대로 옮김. 차례와 안내문이 같다) 단계에서 나와 문 앞을 거쳐 `enter` | 안내문은 문에서와 같다 | '단계' 탭 끝의 '던전' 줄(열쇠·횟수·레벨·들어가기·소탕), 셈 `dungeonGoView`. 그 던전은 '던전 소탕' 줄에서 빠진다(한 줄에 함께) | `collect/idleflow`(단계 안·들판, 열쇠 없음·레벨·fromMenu 아님·던전 안·봇), `collect/idleflownet` |
| 돌아왔을 때의 창 | `IDLE.popup`(타입 `IdleRules`, 넓게 읽는 `IDLE_VIEW`) | `idle.ts`가 방치 우편을 보낸 뒤 메시지 `idleBack`(`IdleBack`: 우편 id, 분, 보상, 진행이 있으면 `from`·`to`·`n`) | 받기는 우편(`mailClaim`): 원인 `mail:idle` 그대로. 새 원인 없음 | `hud/idleback.ts`(가운데 창: 받기·나중에), `onIdleBack`, 셈 `idleBackLines`. 화면 모듈 목록의 맨 뒤(`idle`: 켜지 않은 게임은 init이 곧 돌아간다) | `collect/idleflow`(우편과 같은 값, 진행, 짧게 비움, 봇, 끄면 우편만, 받기의 장부), `collect/idleflownet` |
| 재료로 영웅 키우기 | `HERO_RULES.trade`(아이템 id → `HeroTrade { cost(등급), shards?(등급) }`), 넓게 읽는 `HERO_RULE_VIEW`, `heroTrades()` | `g.roster.trade`, 명령 `{ t: 'hero', a: 'trade', id, item, n? }`(1~99, 가진 영웅만). 아이템 모듈·`ITEMS`의 id가 아니면 서버를 띄울 때 멈춘다 | 원인 `cmd:hero:trade`(가방의 아이템), 안내문 `heroTraded`, 모자라면 `itemShort`. 저장은 영웅의 조각 그대로 | '영웅' 탭 위의 가진 재료, 줄마다 교환 단추, 셈 `tradeViews` | `collect/idleflow`(값, n번, 장부, 모자람, 틀린 입력, 저장, 화면, 끄면 없음), `collect/idleflownet` |
| 영웅 모델에 id·등급 | (화면) | 없음 | 없음 | `HumanoidLook.hero`·`rarity`(영웅일 때만: `setHumanoidBody`가 받는다), `setHeroModel(({ id, rarity, look }) => 모델 \| null)`. `makeHumanoid`의 다섯째 인자(선택) | 타입 검사, 화면 |
| 딸려 온 화면 감추기 | `HUD.hide`(`HudRules`, 이름 표 `HUD_PARTS`: bag, attackNearest, auto, worldMap, minimap, hint, skills, channel). 새 계약 이름 `HUD`(핵심의 수치 `CoreTuning`) | 없음 | 없음 | `hud/shell.ts`의 `mountShell`이 요소에 class `hudOff`(감출 뿐: 기능과 단축키 그대로) | `collect/idleflow`(이름 → id, 모르는 이름, id가 뼈대에 있다), 화면 |
| 메뉴 줄 도우미의 입구 | | | | `@engine/client`에 `menuRow`, `menuButton`, `menuEl`, `menuSpan`, `menuChips`, `redrawMenu`, `closeMenu`, `myKeys` | 타입 검사 |
| 틀 안의 타입 오류 둘 | (내용) | `monsters.ts`(무리의 종류를 몬스터 id로), `gear.ts`·`shop.ts`(아이템의 종류를 넓혀 읽음): 실행은 그대로 | | | `collect/idleflow`(그렇게 바꾼 시험용 내용으로 틀을 타입 검사: 고치기 전 틀에서는 오류 셋을 확인) |

함께 고친 것: 시험용 내용(영웅 들판)에 위의 칸을 모두 켰다(금광 `auto`·`fromMenu`, 금광의 보상에 별가루, 별가루 → 조각, 2초 뒤 단계로, 돌아왔을 때의 창, 가방·대상 공격 단추 감춤). 틀의 문장(한국어·영어) 11개와 안내문 하나(`heroTraded`). 문서 13절 '단계 밖', 본보기의 새 게임용 import 줄, 1절 `idle`의 화면 칸과 '딸려 온 모듈의 화면 감추기', 10절의 타입 오류 두 경우, 11절.

바뀌지 않았다는 증거(바탕 커밋 `49e015d`의 복제본과 이 가지를 같은 도구로 돌려 바이트를 견줬다. 도구는 `$TEMP/dg-work/idleflow-tools/golden.mts`·`golden.sh`: `feat/sweep`의 황금 실행에 달무리와 그 명령(뽑기, 단계 나오기·들어가기, 자동 진행 끄기, 게임 명령 `keyrun`·`essence`, 영웅 레벨, 편성)을 더한 것):

- 등불지기 황금 실행(시계·난수 고정, 새 사람 9·돌아온 사람 2·봇 6, 4분, 던전 출입 포함): 7,489,205바이트(sha256 `ba83af30…`, 앞 가지와 같은 값)가 같다. 시제품 다섯(모닥불 사냥터·버섯 동굴·별가루 광산·돌담 마을·굴림공)과 **달무리**(2분, 18,080줄 2,415,106바이트, sha256 `c9867afc…`)도 바이트까지 같다.
- 화면: 영웅 들판을 3015에 띄워 PC 1280×720·폰 390×844 × 한국어·영어로 영웅 탭의 재료 단추, 단계 탭의 '던전' 줄, 메뉴에서 들어간 금광의 자동 전투, 돌아왔을 때의 창(진행 있음·없음)과 받기를 찍었다(`$TEMP/dg-work/idleflow-shots/`, 콘솔 오류 없음, 가방·대상 공격 단추는 `display: none`).
- 문장 견본(`games/deungbul/test/fixtures/locale-*.json`): 틀의 새 키 12개(한국어·영어 저마다)만 더해졌고 달라진 문장 0.
- 시험: `npm test` 두 번 모두 통과(검사 2159개, 바탕 2101개에서 collect/idleflow·idleflownet과 경계 검사 몫), `npm run typecheck` 오류 0(설정 18개), `npm run build:all` 통과.

남은 것: (끝) 달무리를 새 칸으로 옮기기는 위 '달무리 옮기기'. 재료로 영웅의 레벨·경험치를 올리는 길은 없다(조각만). 감춘 요소의 단축키(B, Tab)는 그대로다.

## 부하와 장시간 (2026-11-26, 가지 `feat/loadtest`)

틀에서 아직 확인하지 못했던 셋을 쟀다. 잰 조건·수치 표·한계 인원의 추정·고치지 않은 것(제안)은 [infra.md](infra.md) '부하와 장시간'.

| 무엇 | 찾은 것 | 고친 것 | 지키는 것 |
|---|---|---|---|
| 영웅이 많은 편성 (`squad`·`stages`, 영웅 들판·달무리, 10~200명 × 영웅 4·8) | 단계는 사람마다 다른 층이지만 같은 좌표라 스냅샷이 남의 단계까지 훑었다. 영웅이 0.25초마다 엔티티 전부를 훑었다(대상·도발). 걷는 엔티티마다 장애물 전부를 훑었다(등불지기 538개) | `net/snapshot.ts`(층마다의 격자, 상태 글자 다시 쓰기, 시야의 제곱 판정), `g.monstersIn(층)`(편성·전투의 범위 기술), `shared/sim.ts`의 장애물 칸 색인, 전송 동안 소켓 cork. 틱: 등불지기 200명 8.1 → 2.4ms, 영웅 들판 200 × 4 단계 5.5 → 3.4ms, 달무리 200 × 8 단계 7.8 → 4.7ms | `collect/load`(영웅 52의 틱·전송 상한, 예전 셈과 같은 답), `fx/hotpath`, 황금 실행 |
| 장시간 (등불지기·달무리, 실제 35분 × 가상 시계 96배 = 가상 56시간, 날 두 번) | 게임과 시스템의 목록·엔티티·타이머는 쌓이지 않는다. 저장 실패 0. 일일 초기화·출석·열쇠 채움이 지나간다. **서버의 측정 구간 값(`m.tick`·`m.flush`·`m.lag`)이 `METRICS` 없이 운영하면 하루 35~50MB씩 쌓였다** | `ops.ts`의 `pushCapped`(약 1시간 치까지) | `fx/hotpath` |
| 팀 셋·넷의 화면 (`teams`, 굴림공을 팀 넷·셋으로 고친 임시 복사본, 팀마다 3명, PC 1280×720·폰 390×844, 한국어·영어) | 폰의 고르기 창에서 넷째 단추의 '사람이 더 많음'이 단추 밖으로 넘쳤다(틀의 `.btns button`의 nowrap). 폰 점수판에서 긴 팀 이름('Twilight Wanderers')이 사람 수를 둘로 쪼개 따로 된 단처럼 보였다 | 팀이 셋 이상이면 고르기 단추 안에서 줄바꿈, 넷 이상이면 2×2. 폰의 팀마다 한 줄 점수판은 이름과 사람 수를 글처럼 잇고 사람 수는 쪼개지 않는다. 팀 둘(굴림공)의 모양은 그대로 | 화면(`$TEMP/dg-work/loadtest-shots/`) |

새 도구: `scripts/load.mjs`(`npm run load:game`), `scripts/load/server.ts`·`clients.mjs`·`bench.ts`. 무거운 측정은 `npm test`에 넣지 않았다.

## 틀의 남은 한계 메우기 (2026-11-26, 가지 `feat/limits`)

| 무엇 | 틀 쪽 | 게임이 하는 일 | 지키는 것 |
|---|---|---|---|
| 기기 옮기기 코드가 재시작에도 | `net/handoff.ts`: 살아 있는 코드를 월드 저장 `handoff` 칸의 `codes`에 **코드의 해시만**(`hashCode`) 적는다. 코드를 줄 때 곧바로 저장. 코드가 없으면 칸의 모양은 예전과 같다(더하기만 한 칸: 이전 없음, 옛 서버는 무시) | 없음 | `fx/handoff`(실제 서버 프로세스를 강제로 죽였다 같은 DB로 다시 켜서 한 번만 쓰임, DB에 코드 글자가 없음, 11분 뒤 시계로는 거절) |
| 파일 모델의 사람에 갑옷 | `HumanoidAsset.armor`: `tint`(메시·노드·재질 이름을 갑옷 색으로), `attach`(틀의 덧대기를 그 뼈에). `paint`의 이름은 목록도. 없으면 예전처럼 아무것도 | 예제: 야영꾼의 몸통 재질 `torso`, 둘째 갑옷 '쇠비늘 조끼' | `fx/assets`, 화면(예제 PC·폰) |
| 팀 모듈 `teams` | 서버 `systems/teams.ts`(`g.teams`: 고르기·옮기기·균형, 팀과 사람의 점수, 점수판 공유 상태 `teams`, 개인 상태 `team`, `g.playerSync`의 팀 번호, `persist`면 캐릭터 `ext.teams`·월드 `teams`), 화면 `hud/teams.ts`(점수판, 고르기 창, 내 팀 줄, 팀 색 옷·고리)와 셈 `hud/teamboard.ts`, 내용 `TEAMS`·`TEAM_RULES`, 명령 `{ t: 'team', team }`, 안내문 `teamJoined`·`teamFull`·`teamStay`. `RPG_MODULES`에 들지 않는다. 문서 [making-a-game.md](making-a-game.md) 6절 '팀과 점수판' | 굴림공: 손으로 짠 팀·점수·점수판·고르기 창·팀 색 옷을 지우고 모듈로(판·골·공은 그대로) | `fx/teams`(규칙, 점수, 저장, 실제 접속 둘), `fx/client`(점수판·고르기 단추·팀 바꾸기의 셈), `fx/modules`, `rollball/rules`, 화면(굴림공 PC·폰, 한국어·영어) |

등불지기: 고르지 않은 모듈이라 서버의 시스템·명령·저장 칸·전송도, 화면의 요소도 없다. 틀의 문장에 팀의 키 11개가 더해져 등불지기의 문장 견본(`games/deungbul/test/fixtures/locale-*.json`)에 그 키만 더했다(달라진 문장 0).

## 엔티티의 모듈 몫 (2026-11-26, 가지 `feat/entcore`)

장르 중립 틀의 남은 한계 '엔티티에 RPG 칸이 늘 있다'를 메웠다. 새 게임 쪽의 쓰는 법은 [making-a-game.md](making-a-game.md) 6절 '엔티티의 칸'.

| 무엇 | 틀 쪽 | 지키는 것 |
|---|---|---|
| 핵심 엔티티 | `engine/server/game/entity.ts`의 `Ent`에는 핵심의 칸만 적는다(위치·이동·길·층·방향·이름·`data`·`dead`·`wait`·`bot`·`pid`·표시 `dirty`/`unsaved`/`metaDirty`·`offMs`, 27개). `CoreEnt`(모듈과 게임의 칸을 뺀 것)를 `Game.create`가 채운다: 모듈의 칸을 거기 적으면 컴파일 오류 | `fx/parts`(핵심만의 게임의 사람·봇은 그 27개만 갖는다) |
| 모듈의 몫 | `engine/server/game/parts.ts`: 모듈마다 `EconomyPart`, `GrowthPart`, `ClassesPart`, `CombatPart`(체력, 대상, 쿨다운, 물약 대기, 몬스터의 칸), `ItemsPart`, `GearPart`, `MailPart`, `DailyPart`, `BuildPart`, `AwayPart`(`auto` 포함), `GuildPart`. `EntParts`로 묶어 `Ent`가 이어받는다(선언 병합은 쓰지 않는다: 그것은 게임의 확장 지점의 것이다). 처음 값은 `PARTS[모듈].init`(전투의 집 `hx`·`hz`는 자리를 맞춘 뒤 `placed`). `Game.create`가 고른 모듈의 것만 모듈 표의 차례로 부른 뒤 게임의 `g.entInit`을 부른다 | `fx/parts`(모듈의 칸과 핵심의 칸을 합치면 예전의 71개와 같다, 칸마다 모듈 하나, 처음 값이 예전과 같다) |
| 다른 모듈의 칸을 읽는 곳 | `g.field(e, 칸)`: 골랐으면 엔티티의 값, 아니면 처음 값(레벨 1, 직업 `''`, 체력 0, 빈 가방 …). 핵심과 모듈의 코드에서 의존하지 않는 모듈의 칸을 읽던 곳(길드·순위·장부·거래소·던전·방치·파티·대장간·상점·자리 비움·관리자 `who`·서버의 '손대지 않은 캐릭터')이 이것을 쓴다. 쓰는 곳은 `g.has`로 막았다(이동·멈춤·채널이 대상 지우기, 직업이 쿨다운, 캐릭터 읽기의 레벨·무기·쿨다운·자동 사냥, 레벨 업의 체력, 끊기의 자동 사냥) | `fx/parts`(모듈 16개를 하나씩 의존과 함께 띄워 저장을 읽고 봇과 돌고 명령 16가지를 보내도 고르지 않은 모듈의 칸이 생기지 않고 저장에 NaN이 없다. 가드를 하나 되돌리면 실패하는 것을 확인했다) |
| 전투가 없는 게임의 `you` | 체력과 노리는 대상의 칸은 0(예전에는 쓰이지 않는 체력 100이 갔다) | `fx/parts`, `core/core` |

함께 고친 것: 재화만 고른 게임(`economy`에 `items` 없음)이 만들 때 죽던 것(장부가 없는 가방에 귀를 달았다), 성장 없이 경제만 있는 게임의 경험치는 받지 않는다(칸이 없다: `Wallet.amount`가 0).

등불지기가 바뀌지 않았다는 증거(모두 바탕 커밋 `30218c6`과 이 가지를 같은 도구로 돌려 바이트를 견줬다. 도구는 `$TEMP/dg-work/entcore-tools/golden.mts`):

- 황금 실행: 시계와 난수를 고정하고 운영 DB 복사본의 캐릭터 6·새 사람 3·봇 6을 4분(4,800틱) 돌렸다. 명령(직업, 공격, 기술, 물약, 우편, 강화, 끼기, 능력치, 순위, 거래소, 이동, 자동 사냥, 자리 비움 사냥, 채널, 파티, 분해, 사기, 대화, 나가기). 전송마다 사람마다의 스냅샷·`stat`·`meta`·개인 상태·사건·안내문·바깥 통·공유 상태, 끝의 캐릭터 저장·엔티티 전부·월드 저장: 27,008줄 5,419,413바이트가 같다(sha256 `3d101b10…`).
- 운영 DB 복사본(`data/backup/game.db.20261126-115738`과 -wal·-shm을 따로 복사해 읽기만): 캐릭터 59명을 하나씩 새 게임에서 읽어 엔티티, 첫 전송, 2초 뒤의 전송, 다시 저장한 값, 그리고 월드를 읽어 다시 저장한 값: 1,064줄 380,412바이트가 같다(sha256 `11cf09c1…`).
- 진짜 서버로: 같은 복사본을 `SqliteStore`로 열어 등불지기 서버를 띄우고(자리 비움 사냥 1명이 되살아난다) 곧 끈 뒤 DB의 캐릭터 59명·월드: 61줄이 같다.
- 시험: `fx/wire`(예전 스냅샷과 글자 비교), `saves`(v0 견본과 운영 DB 견본), `npm test` 검사 1624개 통과.
- 화면: 등불지기의 빌드(`dist/`)는 빌드 시각 한 줄 말고 같다(틀의 화면은 고치지 않았다). PC 1280×720·폰 390×844의 전후 화면이 같다.

다른 게임(같은 황금 실행을 새 사람 9·봇 6으로 2분): 버섯 동굴은 전부 같다. 모닥불 사냥터·별가루 광산·돌담 마을은 줄 위·저장·사건이 같고, 엔티티에서 고르지 않은 길드의 칸(`guild`)만 빠졌다. 굴림공(모듈 0개)은 엔티티에서 모듈의 칸 44개가 빠졌고, 줄 위에서는 `you`의 체력 칸이 100에서 0으로 바뀐 것 말고 같다.

이 가지에서 일부러 바꾼 동작(지금의 게임 가운데 해당하는 것은 굴림공의 `you` 하나): 모듈 없이 쓰이지 않던 값이 처음 값으로 보인다. 전투가 없는 게임의 `you` 체력 0, 파티만 있고 전투가 없는 게임의 파티원 체력 0, 성장 없이 전투만 있는 게임의 최대 체력은 레벨 1로 셈(전에는 저장에 남은 레벨을 읽었다), 성장 없이 경제만 있는 게임의 경험치는 받지 않음.

## 빈틈 메우기 (2026-11-26, 가지 `feat/gaps`)

독립 에이전트가 문서만 보고 만든 굴림공(`games/rollball`, 팀 공놀이, 모듈 0개)의 증명 기록 [proof-rollball.md](proof-rollball.md)의 빈틈을 메웠다. 항목마다 무엇을 고쳤는지는 그 기록의 '→ 고침'.

| 무엇 | 틀 쪽 | 게임이 하는 일 | 지키는 것 |
|---|---|---|---|
| 카메라 | 내용의 `CAMERA`(`dist`, `zoom`, `zoomMin`, `zoomMax`, `gate`. 기본값은 예전 값 46·1·0.6·1.15·1.05), `engine/client/camera.ts`의 `setCameraAim((me, now) => { x, z, zoom? } \| null)`와 `fitZoom(네모, margin)`(`View.fitZoom`: 지금 카메라의 복사본으로 나눠 찾는다). `view.follow`는 배율 대신 거리를 받는다 | 굴림공: 넓은 배율, 경기장 전체(팀 고르기 전, V), 나와 공 사이 따라가기 | 등불지기 전후 화면(PC·폰, 한국어·영어), 굴림공 화면 |
| 사람마다의 값과 겉모습 | 서버 `g.playerSync(fn)`(상태 줄의 끝, 본인은 `you`의 끝), 화면 `setPlayerLook({ cloth, update })`(옷 색이 바뀌면 모델을 새로 만든다), `Me.vals`·`Remote.vals`·`cloth` | 굴림공: 팀 색 옷과 고리 | `fx/wire`, `rollball/rules`(실제 접속 둘) |
| '집으로' 끄기 | 내용의 `HOME_KEY`(기본 true). false면 H를 달지 않고(`input.ts`, `keys.ts`의 표) 기본 조작 안내에도 없다. 틀의 기본 조작 안내에 'H: 처음 자리로'를 더했다(H를 다는 게임) | 굴림공은 H를 '우리 진영으로'로 쓴다(`rules.home`) | `fx/client` |
| 고르지 않은 모듈의 줄 칸 | `snapshot.ts`의 `Fields`: 전투가 없으면 상태 줄의 체력 칸과 `EnterInfo.hp/maxHp`, 아이템이 없으면 `w`, 직업이 없으면 `c`를 뺀다. 화면은 같은 `MODULES`로 읽는다(`entities.ts`의 `HP_SLOT`). 프로토콜 번호는 그대로(3): 전투·아이템·직업을 고른 게임(등불지기와 RPG 시제품 넷)의 바이트는 같고, 바뀐 것은 운영하지 않는 전투 없는 게임(굴림공, 공 마당)의 줄뿐이다 | 없음 | `fx/wire`(들이기 전의 만들기를 옮겨 와 글자까지 견준다), `core/core`(칸이 없다) |
| `mapLegend`의 기본 문장 | 틀이 찍는 점만(나, 사람, 전투면 몬스터, 파티면 파티원) | 표식을 찍는 게임은 덮어쓴다 | `deungbul/guide`(덮어쓴 키 목록) |
| `npm test`의 끝 줄 | `test/all.ts`: 따로 된 프로세스마다 검사의 수를 파일로 받는다(`harness.ts`의 `TEST_REPORT`, 손자 프로세스에 물려주지 않게 읽자마자 지운다). 끝 줄은 `모두 통과 (검사 N개: …)` 또는 `실패 N건 (검사 M개. …)`, 검사 밖에서 죽은 프로세스도 한 건 | 없음 | 일부러 실패시켜 끝 줄과 종료 코드 확인 |
| 폰의 메뉴 탭 줄 | 폭 720px 아래, 탭이 다섯 이상인 메뉴의 탭은 6em보다 늘어나지 않는다(글이 길면 글의 너비). 영어 폰의 홀로 남은 '기기'가 한 줄을 다 차지하던 것 | 없음 | 화면(한국어 폰은 탭의 자리·너비가 소수 둘째 자리까지 같다) |
| 굴림공의 폰 점수판 | (게임의 css) 폭 720px 아래에서 점수판의 폭을 대화창의 왼쪽까지로 | | 화면(390×844, 대화가 있을 때) |
| 문서 | `making-a-game.md`: 8절의 낡은 `package.json` 항목, 사람 고르기(`kind === 'p'`), 들어오고 나가는 사건, 한 틱의 차례, 5절 '카메라'·'단축키', 뼈대의 글 키 표, 자리 아홉의 표(`actionsEnd`), `S`의 모양, 시야 상자, 포트 표, 가짜 클라이언트의 명령 차례, 줄의 모양(체력 칸) | | `sample/docs` |

남은 것: 본인의 `you`에는 체력 칸이 늘 있다(모양이 고정된 묶음이라 두었다). 버섯 동굴·별가루 광산의 vite 개발 서버가 붙는 포트(3017)를 자기 서버의 포트로 고쳤다(운영에는 영향 없음).

## 0. 이어 갈 것

2026-11-27에 정리했다: 다음 후보를 위에, 사용자가 정할 것을 한곳에, 끝난 것을 아래에. 틀이 최우선이다(사용자 결정). **2026-11-24 결정: 등불지기는 전통 MMORPG로 두고 새 장르 모드는 만들지 않는다.** 2026-11-25부터 승인된 게임 내용·경제와 별도 장르 시제품은 다시 한다.

### 다음 후보 (위가 먼저)

1. **두 장르를 잇는 틀의 칸** ([proof-echopact.md](proof-echopact.md) '틀의 빈 곳과 우회', 예제 `games/echopact`이 게임 안에서 우회한 것): ① 캐릭터 정의의 언어마다의 이름·소개(`CharDef`의 선택 칸이나 화면의 고리) ② 변신 탭이 역할 id를 그대로 보이는 것(한 줄) ③ 영웅의 소유와 변신의 소유를 잇는 칸(`MORPH_RULES.fromRoster`) ④ 변신 보정이 그 사람의 성장(레벨·별)을 받기 ⑤ 뽑기의 사건 `pulled` ⑥ 정의에 진영(`tag`) ⑦ 배너 판의 id를 정의를 읽은 뒤 검사 ⑧ 정의가 화면에 오기 전에 그려진 영웅 이름표를 다시 쓰기(`relabel`) ⑨ 부하 도구의 `squad=N`이 실행 중에 더한 영웅도 보기. 칸을 넣으면 예제의 우회(`server/pact.ts`, `client/echoes.ts`)를 지운다. 그 뒤 AI 생성기·계정 공용 저장소·두 서버의 싱크는 사용자 결정([ideas.md](ideas.md) 3절).
2. **플랫폼 분리 2단계: 데스크톱 시제품** ([platforms.md](platforms.md) 4절): `apps/desktop/`(Electron main·preload, 사용자 정의 프로토콜 `app://`로 dist-sample, `autoplayPolicy`, F11 전체 화면, 바깥 링크는 `shell.openExternal`), `platform/desktop.ts`(preload의 storage·openUrl·copy·saveFile·version), 게임패드 이동·기술, 단축키를 `input.keyName`(ev.code)으로, 실제 Origin 머리말 기록. 비용 0(서명·Steam 없이). 그 뒤 3단계 모바일 시제품(Capacitor, Android 먼저).
3. **웹 출시의 바탕(묶음 2)의 남은 것**: ② 정적 서버의 캐시 머리말(이름에 해시가 든 빌드 파일은 오래 캐시: 지금은 매번 다시 받는다) ③ 판 모듈이 `Platform.invite`를 부르기(묶음 7과 함께) ④ 캐주얼·.io 증명 게임으로 포털 요건을 다시 확인 ⑤ 실제 크롬의 숨김 탭(헤드리스가 아닌 창)에서 5분 ⑥ 약한 기기에서 품질 단계의 값 ⑦ 내보내기에 게임의 개인 데이터 칸(등불지기의 월드에 둔 몫이 있으면 `personalData`에) ⑧ 새 외부 요청이 생기지 않는지 보는 빌드 검사. (① 옛 브라우저 직접 호출을 접점으로 옮기기는 플랫폼 분리 1단계에서 끝났다.)
4. **판 모듈(묶음 7과 겹침)**: 판 구경(앉지 않고 보기), 대기실의 판 목록 넘기기, 자리 수를 판을 열 때 고르기, 3D 월드를 쓰지 않는 화면(카드 탁자), 좁은 화면에서 자리가 다섯 이상인 막대. 문서(14절)만 보고 셋 이상의 다른 판 게임(카드)을 만드는 검증(별도 에이전트)에 방 코드·관전·여러 규칙을 함께.
5. **고도화 묶음 4·6~8** ([genre-features.md](genre-features.md) 5절): 4 확률과 재화의 투명성 → 6 라이브 콘텐츠 → 7 판의 공통화 → 8 경쟁. (5 운영 도구와 고객지원은 끝: 아래 '운영 도구와 고객지원'. 그 남은 것은 [making-a-game.md](making-a-game.md) 19절 '남은 것')
6. **운영의 바탕(묶음 1)의 남은 것**: 확률표의 공개·사전 공지(묶음 4), 패치 노트, A/B, 사람마다 다른 깃발, 상태 페이지를 다른 호스팅으로. 작은 수집형 증명 게임으로 16절 문서 검증. 폰에서 점검 띠가 내 정보 창의 이름 줄을 조금 덮는 것.
7. **사회와 안전(묶음 3)의 남은 것**: 파티 저장·파티 찾기, 프로필 카드 칸, 핑·이모트, 판·채널(층)·거래 채널, 관리자 `allow`(허용 낱말) 명령, 영문 자판 + 띄어쓰기를 겹친 금칙어 우회, 같은 주소의 손님끼리 한 사람으로 묶이는 것(아래 '사회와 안전').
8. **작은 것**: 부하의 제안(한 전송의 메시지를 한 프레임으로, 남의 영웅을 좁은 시야·낮은 빈도로), 캐릭터 정의가 수천일 때(오래 안 쓴 구운 겉모습 버리기, 필요한 정의만 묻기), 달무리에서 본 월식 소환 뒤의 배너, 떠는 시험 `collect/growth`의 '앞줄을 먼저 친다'(가끔 실패), 아래 '3. 남은 일'.

### 사용자가 정할 것 (한곳에 모음)

| 무엇 | 지금 | 자세히 |
|---|---|---|
| 등불지기의 초기화 시각 | 서버 현지 자정 (예: `{ tz: 'Asia/Seoul', dayAt: 5 }`) | 아래 '운영의 바탕' |
| 등불지기에서 원격 설정으로 열 칸(`LIVE_KEYS`), 주간 임무를 둘지 | 비어 있음, 없음 | 〃 |
| 약관·처리방침의 실제 문서와 버전, 삭제 유예(기본 7일)와 신고 기록의 보관 기간 | 예제에만 예시 약관 | 아래 '웹 출시의 바탕' |
| 등불지기에 귓말·친구·채널(`chat`, `friends`)과 정해진 문장을 켤지, 연령 기준(`AGE.limit`)과 묻는 모양, 제한 모드에서 막을 명령, 보호자 동의·본인확인(비용), 금칙어 목록의 크기(외부 검열 API는 비용) | 핵심(차단·금칙어·신고 문맥·대화 보이기)만 켬 | 아래 '사회와 안전' |
| 오류 수집·손님 진행 보호 안내를 기본 켬으로 둘지, 서비스 워커를 등불지기에 켤지 | 켬, 끔 | 〃 |
| AI 캐릭터 생성기, 계정 공용 저장소(`g.chars.useStore`), 소유의 싱크·거래·수익 분배·주간 한도·신고와 회수 | 틀의 바탕만 (`chars`·`morph`). 등불지기에는 쓰지 않는다(사용자 결정) | 아래 '캐릭터 정의와 변신', [ideas.md](ideas.md) 3절 |
| 계정·로그인, 현금 결제, 광고 SDK, 본인확인, 여러 지역 서버, 음성 채팅, 외부 검열, 웹 푸시, 행정·법(게임제작업 등록, 등급분류 …) | 하지 않음 (접점만: `AuthProvider`, `Platform`) | [genre-features.md](genre-features.md) 5.9, [accounts.md](accounts.md) '정할 것' |
| 앱 출시: 고정 서버 도메인, Steam Direct, 코드 서명, Apple·Google 개발자 계정, 플랫폼 결제·로그인, iOS 개발 환경, 스토어 등급·라벨, 크로스 저장, 포털 출시 | 없음 | [platforms.md](platforms.md) 4절 4단계 |
| 운영 서버: 호스팅 업체와 사양·비용, 도메인, 백업을 둘 곳, 출시판의 서버당 인원과 채널 수 | 이 PC와 임시 터널(파일럿) | [infra.md](infra.md) '정할 것' |
| 등불지기 경제의 다음 단계: 밝은 등불(하루 몫) → 접속 보상·수수료 → 따라잡기 | 보류 (강화 규칙·재련은 끝) | [economy.md](economy.md) '구현 현황' |
| 등불지기의 자동 사냥을 출시판에 둘지 | 있음(테스트 편의로 넣었다) | [../games/deungbul/README.md](../games/deungbul/README.md) |
| 가지 `wip/rift` 안개 균열 시제품(반쯤 된 채 멈춤, 지우지 않는다), [ideas.md](ideas.md)의 아이디어(AI 채팅 루틴·정보 조회, 사용자 코스튬) | 보류: 사용자가 다시 말할 때까지 | [modes.md](modes.md), [ideas.md](ideas.md) |
| 문서 검증을 독립 에이전트에게 맡길지 직접 할지 | 지금까지는 독립 에이전트 | 아래 '끝난 것'의 문서 검증 |
| 경보를 받을 곳(웹훅 서비스: Slack·Discord 같은 것), 분석 사건의 보관 기간과 처리방침의 문구, 관리 화면을 이 PC 밖(다른 기기)에서도 열지, 운영자마다 역할 토큰을 나눌지 | 웹훅 없음(재기만), 180일, 이 PC에서만, 토큰 셋(전체·운영·보기) | 아래 '운영 도구와 고객지원' |

### 끝난 것 (최근 것부터)

- **두 장르를 합친 예제 게임: 끝(2026-11-27, 가지 `feat/hybrid`)**: 위 '두 장르를 합친 예제'. `games/echopact` "메아리 계약"(포트 3003): 들판의 사냥·장비·파티·대화와 울림 샘의 뽑기(공개 확률표·천장 40)·편성·단계(장 셋 × 다섯)를 한 캐릭터가 함께 하고, 손으로 쓴 캐릭터 정의 열이 뽑기의 메아리(영웅)이자 들판의 변신이다. 틀은 고치지 않았다. 검사 2393 → 2435개, 등불지기·sample 황금 실행 같음.
- **사회와 안전(묶음 3): 끝(2026-11-27, 가지 `feat/social3`)**: 맨 아래 '사회와 안전'. 서버 저장 차단(옛 브라우저 목록은 처음 접속 때 옮긴다), 금칙어 정규화(`engine/shared/textfilter.ts`: 이름·길드·공지·캐릭터 정의도 같은 고리), 신고의 문맥(앞뒤 줄, 관리자 `report`), 대화 보이기 설정 — 여기까지 핵심이라 등불지기에도 들었다. 선택: 모듈 `chat`(귓말·근처·파티 채널, 탭, 도배 막기), `friends`, 칸 `QUICK_CHAT`, `AGE`(연령·제한 모드) — 예제에서만 켰다. 검사 2308 → 2362개, 스키마 3 → 4, 등불지기 황금 실행 같음(운영 DB 복사본으로도). **사용자가 정할 것**: 등불지기에 귓말·친구·채널(`chat`, `friends`)과 정해진 문장을 켤지, 연령 기준(`AGE.limit`: 한국 14세, 미국 13세 …)과 묻는 모양(태어난 해/구간), 제한 모드에서 막을 명령(등불지기라면 거래소 `market`), 보호자 동의·본인확인(비용), 금칙어 목록의 크기(외부 검열 API는 비용). **남은 것**: 파티 저장·파티 찾기(b4·b5), 프로필 카드 칸(b25), 핑·이모트, 판·채널(층)·거래 채널, 1:1 거래가 없어 '거래 요청' 차단은 해당 없음, 관리자 `allow`(허용 낱말) 명령, 영문 자판 + 띄어쓰기를 겹친 우회(퍼징의 놓침 대부분), 손님(저장 키 없음)끼리 같은 주소면 한 사람으로 묶이는 것.
- **플랫폼 분리 1단계: 끝(2026-11-27, 가지 `feat/plat1`)**: 맨 아래 '플랫폼 분리 1단계'. 화면 코드의 브라우저 직접 호출(저장소·주소·navigator·새 창·생명주기·배율·화면 크기)을 `engine/client/platform/` 뒤로, 새 칸 `input`·`notify`·`purchase`·`achievements`·`cloud`, 버전 불일치를 `app.requireUpdate`로(서버 `protocolMin`·`update`·4006), 서버 `staticDir: null`·Origin 허용 목록, 터치 툴팁, 경계 시험 8절. **다음: 2단계 데스크톱 시제품**([platforms.md](platforms.md) 4절): `apps/desktop/`(Electron main·preload, 사용자 정의 프로토콜 `app://`로 dist-sample, `autoplayPolicy`, F11 전체 화면, 바깥 링크는 `shell.openExternal`), `platform/desktop.ts`(preload의 storage·openUrl·copy·saveFile·version), 게임패드 이동·기술, 단축키를 `input.keyName`(ev.code)으로, 실제 Origin 머리말 기록. 비용 0(서명·Steam 없이). 차단 목록의 `localStorage`는 묶음 3이 지운다.
- **웹 출시의 바탕(묶음 2): 끝(2026-11-27, 가지 `feat/web2`)**: 맨 아래 '웹 출시의 바탕'. 플랫폼 접점 `engine/client/platform/`(기본 web), 설정 창, 탭 숨김(자리 비움), 로딩 예산과 나중 묶음, 화면 오류 수집(관리자 `errors`), 약관·동의(`LEGAL`), 내 데이터 내보내기·삭제(관리자 `erase`), 튜토리얼, 인증 접점(손님만), 광고 지점·게임 구간(접점만), 손님 진행 보호. 남은 것(지금은 위 '다음 후보' 3): ① (끝: 플랫폼 분리 1단계) 옛 브라우저 직접 호출을 접점으로 옮기기(언어·차단 목록·소리 깨우기·도감 링크·새로고침, [platforms.md](platforms.md) 4절 1단계)와 경계 시험에 금지 낱말 검사 ② 정적 서버의 캐시 머리말(이름에 해시가 든 빌드 파일은 오래 캐시: 지금은 매번 다시 받는다) ③ 판 모듈이 `Platform.invite`를 부르기(묶음 7과 함께) ④ 캐주얼·.io 증명 게임으로 포털 요건을 다시 확인 ⑤ 실제 크롬의 숨김 탭(헤드리스가 아닌 창)에서 5분 ⑥ 약한 기기에서 품질 단계의 값 ⑦ 내보내기에 게임의 개인 데이터 칸을 더하기(등불지기의 월드에 둔 몫이 있으면 `personalData`에) ⑧ 새 외부 요청이 생기지 않는지 보는 빌드 검사. 사용자가 정할 것: 약관·처리방침의 실제 문서와 버전, 삭제 유예(기본 7일)와 신고 기록의 보관 기간, 오류 수집과 손님 보호 안내를 기본 켬으로 둘지(지금 켬), 서비스 워커를 등불지기에 켤지(지금 끔).
- **설계 끝: 웹 전용 부분 분리 (2026-11-27, [platforms.md](platforms.md). 1단계는 위 `feat/plat1`에서 끝남)**: 나중에 PC(데스크톱 앱)·모바일(앱)로도 낼 수 있게, 브라우저 기능(저장소·생명주기·서버 주소·오디오·링크 …, 웹 의존 52곳)을 `engine/client/platform/` 접점 뒤로 옮긴다. 추천 래퍼는 데스크톱 Electron, 모바일 Capacitor. 1단계(접점 만들기, 웹 동작은 그대로)는 비용 없이 할 수 있다. 고정 서버 주소·스토어 계정 비용·코드 서명·플랫폼 결제는 사용자 결정.
- **운영의 바탕(묶음 1): 끝(2026-11-27, 가지 `feat/ops2`)**: 맨 아래 '운영의 바탕'. 시계·초기화(`g.time`, `RESET`), 주간·월간 임무, 원격 설정(`g.live`, `LIVE_KEYS`), 기능 깃발(`g.flags`), 공지, 점검, 상태 페이지, 관리자 명령 `set`·`flag`·`notice`·`maint`. 검사 2174 → 2249개, 등불지기 황금 실행 같음, 운영 DB 복사본으로 점검 리허설. **사용자가 정할 것**: 등불지기의 초기화 시각(지금 서버 현지 자정, 예 `{ tz: 'Asia/Seoul', dayAt: 5 }`), 등불지기에서 원격 설정으로 열 칸, 주간 임무를 둘지. 묶음 2와는 2026-11-27에 합쳤다(위).
- **조사 끝: 장르 공통 기능의 빈 곳 (2026-11-27, [genre-features.md](genre-features.md). 묶음 1·2 끝, 3 진행 중)**: 장르 10개와 상용 서비스·법 요건을 조사해 기능 238개를 우리 틀과 견줬다(있음 62, 기초 55, 흔적 14, 없음 107). 고도화는 묶음 여덟(1 운영의 바탕 → 2 웹 출시의 바탕 → 3 사회와 안전 → 4 확률과 재화의 투명성 → 5 운영 도구 → 6 라이브 콘텐츠 → 7 판의 공통화 → 8 경쟁) 순서를 제안한다. 계정·현금 결제·비용이 드는 외부 서비스는 사용자 결정이 필요하다(5.9절).
- **판 모듈의 빈 곳 메우기: 끝(2026-11-27, 가지 `feat/roomfix`)**: 위 '판 모듈의 빈 곳 메우기'. 반딧불 연못이 찾은 빈 곳(선 돌리기 `rotateFirst`·`roundEnd`·`skip`, 셋 이상의 빠진 자리 `outEnds`·`out`, 등수 `finish(room, 등수, 까닭, 점수)`·`rankOf`, 자리 수의 범위 `seats: { min, max }`·`startAfterS`·`cpuFill`·'지금 시작', 막대 자리 `barAt`·기권 확인, 컴퓨터 이름, 타입의 입구, 작은 문서 빈 곳)을 메우고 14절의 본보기를 틀의 시험의 '별 줍기'로 바꿨다. 검사 2070 → 2106개, 등불지기·sample 황금 실행 같음. **남은 것**(위 '다음 후보' 4): 판 구경(앉지 않고 보기), 대기실의 판 목록 넘기기, 자리 수를 판을 열 때 고르기(지금은 게임마다 하나의 범위), 3D 월드를 쓰지 않는 화면(카드 탁자), 좁은 화면에서 자리가 다섯 이상인 막대. **다음**: 문서(14절)만 보고 셋 이상의 다른 판 게임(카드)을 만드는 검증(별도 에이전트).
- **캐릭터 정의와 변신: 끝(2026-11-27, 가지 `feat/chardef`)**: 맨 아래 '캐릭터 정의와 변신'. 겉모습 부품(칸 여섯, 기본 부품 34, 굽기), 캐릭터 정의와 검증기(거절 코드 26, 예산, 금칙어 고리, 퍼징 6000), 모듈 `chars`(저장소를 바꿔 끼운다, `roster`와 함께면 영웅)·`morph`(변신, 남에게도 보인다, 기본은 겉모습만), 예제의 정의 넷, 문서 15절. **다음**(사용자 결정이 필요): AI 생성기(결과는 `g.chars.add`로만), 계정 공용 저장소(`useStore`), 소유의 싱크·거래·주간 한도·신고와 회수. 같은 때 다른 가지(`roomfix`: 판 모듈)가 공용 파일(언어 파일, `messages.ts`, `modules.ts`, 문서)의 끝을 함께 고친다: 합칠 때 겹친다.
- **판 모듈의 문서 검증 (넷이 두는 판 게임): 끝(2026-11-27, 가지 `feat/boardgame`)**: 14절과 입구만 보고 `games/pond` 반딧불 연못(넷이 미끼 패를 엎어 던져 물고기를 낚는 원작 판 게임: 숨긴 손패·엎은 미끼, 바퀴마다 도는 선, 포트 3010)을 만들었다. 틀은 고치지 않았다. 평가 4.0/5. 검사 2380 → 2495개(이 게임 115), 타입 검사 설정 20 → 22, 등불지기 황금 실행 같음. 컴퓨터끼리 자리별 승률: 처음 규칙 26.5/24.1/21.2/25.5%(4000판) → '물고기는 제 크기보다 작은 미끼를 물지 않는다'를 더해 24.2/24.1/25.2/23.6%(2000판). 문서의 빈 곳 열여섯과 꼼수 여섯은 [proof-pond.md](proof-pond.md). 큰 것: 바퀴마다 선 돌리기(`room.first` + `turnStart`의 `pass`로 우회), 셋 이상의 판의 기권·몰수 동작, 등수 없는 결과, 자리 수 고정, 폰에서 판 막대와 게임의 아래 창이 겹침(기권을 잘못 누름), `RoomView` 타입을 내보내는 입구가 없음(경계 검사만 실패). **다음 후보였던 것**(위 `feat/roomfix`에서 메움): 틀 수리 — `rotateFirst`(또는 `roundEnd`·`skip`), 등수가 있는 `finish`, 자리 수의 범위, 판 막대 자리(`barAt`), 컴퓨터 자리의 이름, `KindLook.label(e, vals)`, `RoomView`의 입구. 문서 — `onFrame` 인자, yaw 0의 방향, `forInput`, `game: { now }`, `spawn`의 `pid`·`players.leave`, 부하 도구의 `PLUGINS` 표. 반딧불 연못은 그 칸으로 옮겨 확인한 뒤 게임 정리로 지웠다.
- **턴제의 빈 곳: 끝(2026-11-26, 가지 `feat/turnfw`)**: 위 '턴제의 빈 곳 메우기'. 판 모듈 `rooms`(판마다의 층, 대기실·짝짓기·컴퓨터 상대, 차례와 기한·초읽기, 끊긴 사람의 자리, 판의 저장), `setTapHandler`, `g.effect`/`onEffect`, `setCameraYaw`, `CameraAim.center`, `addNotices`의 `quiet`, `g.movement.teleport`, 자리 css의 `free`, 문서 14절. 징검돌을 옮기고 균형(첫 바퀴 보정)을 고쳤다. `feat/dalmig`와 함께 합쳤다. **다음**: 문서(14절)만 보고 다른 판 게임(카드·보드, 셋 이상)을 만드는 검증 → 위 `feat/boardgame`에서 했다.
- **달무리 원정대가 찾은 빈 곳 메우기: 끝(2026-11-26, 가지 `feat/idleflow`)**: 위 '단계 밖과 달무리의 빈 곳 메우기'. 던전 안의 자동 전투(`DungeonDef.auto`), 던전 뒤 단계로(`STAGE_RULES.returnAfterDungeon`), 메뉴에서 바로 던전(`DungeonDef.fromMenu`, 명령 `dungeonGo`), 돌아왔을 때의 창(`IDLE.popup`, 메시지 `idleBack`), 재료로 영웅 조각(`HERO_RULES.trade`), 영웅 모델에 id·등급(`setHeroModel`, `HumanoidLook.hero`), 딸려 온 화면 감추기(`HUD.hide`), 메뉴 줄 도우미의 입구(`menuRow` …), 틀 안의 타입 오류 둘, 문서. **달무리 옮기기도 끝(2026-11-26, 가지 `feat/dalmig`)**: 위 '달무리 옮기기'. 꼼수를 지우고 이 칸들로, 소탕·오프라인 진행·픽업 배너·영웅의 성장도 쓴다. 남은 것: 월식 소환 뒤의 배너(소탕 결과 창의 바탕은 합칠 때 고쳤다).
- **부하와 장시간: 끝(2026-11-26, 가지 `feat/loadtest`)**: 위 '부하와 장시간'. 남은 것(제안, 줄 위가 바뀌어 하지 않음): 한 전송의 메시지를 한 프레임으로, 남의 영웅을 좁은 시야·낮은 빈도로. 들판에 영웅을 데리고 모이는 게임은 채널로 한 층을 100명 아래로.
- **영웅의 성장: 끝(2026-11-26, 가지 `feat/herogrow`)**: 위 '영웅의 성장'. 같은 때 다른 가지(`sweep`: 소탕권·오프라인 단계 진행·픽업 배너)가 단계·뽑기·방치·던전을 고치고 있다: 합칠 때 `modules.ts`, 언어 파일, 문서의 13절이 겹친다.
- **소탕·오프라인 진행·픽업 배너: 끝(2026-11-26, 가지 `feat/sweep`)**: 위 같은 이름의 절. 영웅의 장비·각성·스킬 레벨·시너지·진형은 다른 가지(`herogrow`)가 맡는다.
- **수집형·방치형 모듈: 끝(2026-11-26, 가지 `feat/collect`)**: 위 '수집형·방치형 모듈'. 다음은 문서([making-a-game.md](making-a-game.md) 13절)만 보고 이 장르의 게임을 만드는 검증이다(별도 에이전트).
- **틀의 남은 한계 메우기: 끝(2026-11-26)**. 엔티티에서 RPG 칸 떼기(가지 `feat/entcore`: 위 '엔티티의 모듈 몫'), 기기 옮기기 코드를 재시작에도 남기기·파일 모델의 갑옷·팀 모듈 `teams`(가지 `feat/limits`: 위 '틀의 남은 한계 메우기'). 그 전에 끝남: 장르 중립 틀의 검증(굴림공 `games/rollball`, [proof-rollball.md](proof-rollball.md)).

이보다 앞의 것 (2026-11-25):

1. **문서만 보고 새 게임 만들기: 1차 끝(2026-11-25), 다시 검증이 다음 차례.** 1차: 독립 에이전트가 문서만 보고 "얼음 동굴"(먼 지역, 직업 하나·창, 기절·돌진·강화, 두 번째 재화·상점·던전·출석 없음, 장비 칸 셋)을 끝까지 만들었다(시험 1160 통과). 드러난 빈틈 13개(막힘 1: 입구 규칙이 문서에 없었다)와 틀의 문제 3개(쓰러짐 안내의 빈 장소 이름, 물약이 없어도 보이는 물약 단추, 상점·제작이 없어도 그것을 말하는 강화 안내)를 고쳤다. 그 게임은 검증용 복사본에만 있다. **2차 끝(2026-11-25)**: 새 에이전트가 고친 문서로 "사막 오아시스"(들판과 던전·우두머리, 직업 둘·새 투창 손 모양과 날아가는 것, 지속 피해·범위 지속 피해·아군 강화, 두 번째 재화, 대장간 제작, 게임의 메뉴 탭, 물약·상점 없음)를 만들었다(시험 1170 통과). 문서 때문에 막힌 곳은 없었다. 드러난 것: 경계 검사가 새 게임의 id와 같은 틀의 낱말(`hex`)을 잘못 잡았다(→ 본보기 셋의 id만 실패로, 나머지는 알림), 던전 지역에 땅이 없었다(→ 지역마다 깐다), 두 번째 재화의 보유량이 화면에 없었다(→ 내 정보 창 `#coin`), 물약이 없어도 가방에 물약 머리줄(→ 숨긴다), 문서의 헷갈림 다섯·사소함 넷(선언 파일의 `export {}`, 던전·지역·문의 관계, 선택 기능의 예, 시험의 명령, 이름표의 모양 …)을 고쳤다. 두 게임은 검증용 복사본에만 있다. 처음 맡길 때의 조건: 틀을 처음 보는 사람이 [making-a-game.md](making-a-game.md)만 보고 작은 게임을 만들 수 있는지. 검증자에게 '등불지기와 일부러 다르게'(원점에서 떨어진 지역, 직업 하나, 두 번째 재화 없음, 장비 칸 셋, 상점·던전·출석 없음, 새 기술 효과와 손 모양 하나씩)를 준다. 독립 에이전트에게 맡길지 직접 할지는 사용자가 정한다.
2. **플레이어 재검토: 끝(2026-11-25)**. 독립 에이전트가 처음 온 플레이어로 Lv 12까지(세 직업, 지도·자동 이동, 상점·대장간·강화·분해, 던전, 폰·영어) 했다. "처음 온 사람이 계속 하고 싶을 것"이라는 총평. 고친 것: 지도로 등탑에 자동 이동해도 등탑 창이 열리지 않던 것(장소를 바치는 거리 안으로), 만든 장비를 강화해도 전투력이 그대로이던 것(`plusScore`), 등탑·상점·대장간 창이 한꺼번에 열려 서로 가리던 것(어느 화면에서나 가장 가까운 것 하나), 사거리 밖 기술이 "너무 멉니다"만 하던 것(다가가서 쓴다), 우두머리 카드의 경고, 지도 이름의 가장자리 잘림, 영어 거리 줄바꿈. 뒤이어 화면 쪽을 고쳤다(같은 날): 폰 세로에서 캐릭터가 오른쪽 창들에 덮이던 것(카메라가 그리는 범위를 밀어 캐릭터가 왼쪽에 선다), 빈 대화 기록 칸(접는다), 지도 목록의 같은 이름(가장 가까운 구역 이름을 붙인다), 영어 폰의 채널 상자 잘림(닫혀 있을 때 짧게), 쿨다운 중 기술 이름이 가려지던 것, 알림이 가방의 닫기 단추를 덮던 것, 도감 단추가 열린 지도를 덮던 것, Tab이 센 몬스터(우두머리, 내 체력 이상)를 먼저 고르던 것. 이어서 게임 쪽 셋(사용자 승인): 1·2장의 마지막 단계가 등탑 창의 '보태기'로 브람·미라를 되돌리게 이끈다(그 단추가 빛난다. 서버의 주민이 다 돌아왔으면 등탑에 바쳐도 센다), 자동 사냥과 자리 비움 사냥이 물약이 없으면 쉬어 간다(체력 35% 아래면 새 대상을 잡지 않고 붙은 것만 상대, 90%까지 차면 다시: 틀의 `shouldRest`, `AUTO.restAt/restUntil/restGuard`), '마을로'는 재현되지 않았다(잿빛 숲 → 첫불 마을 20초에 닿는다. 가는 길의 잿빛 숲 등탑을 지나는 중의 화면이었다: 회귀 시험으로 남김). 틀의 다음 기능 둘(같은 날): **몬스터의 싸우는 법**(`MonsterDef.behavior`: 틀의 `ranged`(사거리 `range`에서 쏘고 붙으면 물러선다, `shot`으로 날아가는 것)과 `flee`(`fleeAt` 아래면 달아난다), 게임은 `g.monsters.addBehavior`로 등록. 예제의 토끼가 달아난다), **지역을 넘는 자동 이동**(`travelTo`에 다른 지역의 자리를 주면 들판에서는 그 던전의 문까지 데려가 멈추고, 던전 안에서는 먼저 나가라고 알린다. 들어가는 것은 사람이: 하루 횟수를 쓴다). **4차 검증(같은 날)**: 플레이어 재검토 4(1장~2장, 폰·영어)와 문서 검증 4(새 게임 "버섯 동굴": 쏘는·달아나는·등록한 싸우는 법, 던전 안 자리로의 travelTo. **막힘 0**, 1188개 통과, 틀 소스를 읽지 않았다). 고친 것: 퀘스트 문장이 등탑 창과 다른 주민을 말하던 것(특정 주민을 말하지 않는다), 쉬어 갈 때 적 사이에 서 있던 것(둘레 몬스터의 반대쪽으로 물러난다: `restSpot`), 폰에서 도감 단추가 지도를 덮던 것, 지도의 목적지 이름('퀘스트 목적지'), 비치던 가방, 메뉴 뒤의 알림 띠, 창을 덮던 길잡이 화살표, 잘린 대화 첫 줄(흐리게), 쿨다운 중 기술 이름, 폰 등탑 창의 수 쪼개짐. 문서: 싸우는 법의 인자, `registerShot`의 size, 던전 정의의 칸, 토큰 형식, 예제를 베껴 시작할 때. 작은 것 넷도 고쳤다: 능력치를 한 번에 5점까지(`stat` 명령의 `n`), 장비 수 옆에 '(낀 것 n 포함)', 비교 표시 ▲▼◆=의 설명, 터치 화면의 등탑 단추(42×38). 기록: `$TEMP/dg-work/review3-notes.md`.
   **장르별 시제품(2026-11-25)**: 독립 에이전트가 문서만 보고 하나씩 만들었다. 협동 던전 "버섯 동굴"(`games/cave`, 3003), 방치형 "별가루 광산"(`games/starmine`, 3004: 틀에 `rules.autoAtStart`를 더함, 두 번째 재화 +0 알림 없앰), 협동 마을 방어 "돌담 마을"(`games/bastion`, 3005: 틀의 몰려온 적 `g.rules.siege`·`spawn(…, true)`로 물결을 만든다. 문서에 몰려온 적, 사건 `hit`·`monsterKilled`의 인자, 인자 없는 명령을 더함, 틀의 `.btns` 비활성 단추를 회색으로). 모두 저장소에만 있고 공개하지 않았다.
   **후반부 검토의 결정 둘(2026-11-25, 사용자 승인)**: 습격을 3시간마다·뒤 물결에 센 적·레벨에 맞는 경험치로(`raidExp`), 경제 3단계(강화 +7부터 내려감·보호 부적·가루·재련·귀속). 틀에는 켜고 끄는 칸으로 들어갔다: `ENHANCE.dropFrom/charm/dust/bindPlus`, `REFORGE`, 아이템 종류 `token`, 명령 `reforge`와 `enhance`의 `charm`, 안내문 `enhanceDown/enhanceSaved/reforged/reforgeMax/marketBound`. Lv 15 이후 할 거리 B(같은 날): 어려운 던전 "지하묘 깊은 곳"(`crypt_deep`, Lv 18부터, 하루 2번, 같은 지하묘 지역의 다른 인스턴스, 무덤 사냥개·지하묘 기사·깨어난 주인, 끝내면 레벨 7 희귀 이상 장비와 보호 부적 1장. 수치는 잠정값이라 다음 플레이어 검토에서 잰다). **A 새 지역(같은 날)**: 세 번째 구역 "잿불 고원"(Lv 15~25, 잿빛 숲 동쪽, 들판 x 180 → 252, `ZONE_SPLIT2` 186, 던전 지역은 예전처럼 잿빛 숲의 구역), 꺼진 채 시작하는 세 번째 등탑과 곁의 상인, 빈터 여섯, 몬스터 넷(잿불 여우·고원 약탈자·잿불 파수꾼은 레벨 7 장비, 필드 보스 잿불 거상은 레벨 8 장비·600초), 메인 퀘스트 5장(고원 등탑에 불씨 150개를 바친다: 쌓이던 불씨의 쓸 곳. 4장까지 마친 저장은 다음 접속 때 5장이 이어진다). 틀에 더한 것 둘: `MonsterDef.gearLv`와 `gearLvOf(def)`(경험치 식의 상한을 올리지 않고 몬스터마다 장비 레벨을 정한다), `MapDef.clearAfter`(맵을 넓힐 때 예전 나무 자리를 난수의 차례를 바꾸지 않고 치운다). 예전 두 구역의 나무와 바위는 x 176 서쪽이 그대로다(맵 지문 시험의 '서쪽 지문'). 들판이 던전 지역(x 260부터)에 가까워져, 던전의 바깥 바닥은 서쪽으로 4m만 깔고 던전 안에 있을 때만 서쪽 벽 너머에 하늘빛 막을 세운다(`scenery.setInside`: 안에서 고원이 보이지 않게). 수치는 잠정값([economy.md](economy.md) '구현 현황'). 시험 `zone3.test.ts`. **검토 7(2026-11-26)**: 고원 몬스터 경험치 ×1.6·피해 ×1.3, 5장 경험치를 약 9,000으로, 바치기를 150+400개로, 거상 체력 12,000, 깊은 곳 우두머리 32,000. 화면의 자동 사냥은 켠 자리(닻)에서 `AWAY.roam` 안만 잡고 필드 보스는 스스로 고르지 않는다(자리 비움 사냥도 보스가 그 사람을 노릴 때만). 등탑의 '전부'는 퀘스트가 남긴 수만큼만. 작은 화면 손질: 가방의 붙은 닫기 단추에 바탕, 지도의 처치 목적지는 그 몬스터 이름(같은 자리 보스의 이름표를 가리던 것), 좁은 화면의 가운데 알림을 작고 짧게, 체력 숫자와 불씨가 줄바꿈되지 않게. 이어서(같은 날, 사용자 승인): 레벨 7·8 장비의 새 바탕(불꽃검·잿불 갑옷·거상의 검), 고원 몬스터의 재료(잿불 조각 포함)와 새 제작 둘, 가방을 그림 칸의 격자로(칸에 든 수, 누르면 아래에 이름·든 수·설명. 그림이 없는 게임은 이름 앞 글자), 틀의 `addIconSheet`에 filter 칸(같은 칸을 색만 바꿔 쓴다).
3. **3차 문서 검증: 끝(2026-11-25)**. 새 에이전트가 "고요한 늪"(새 손 모양 낫·날아가는 돌, 아군 강화, 사람 모델 바꾸기, 그림 시트와 골드 그림, 늪 색의 창, 메뉴 탭, 지도의 거점)을 만들고 **운영 스크립트로 띄우고 다시 켰다**(시험 통과). 막힌 곳 둘을 고쳤다: 새 게임을 처음 띄우면 저장 폴더가 없어 restart.sh가 실패하던 것(폴더를 만든다. 앞 로그는 server.log.prev로 남긴다, 끄기만 하는 stop.sh), 사람 모델을 조금만 바꿀 길이 없던 것(`defaultHumanoid`, `attachHand`, 모델의 `head`. 예제가 털모자를 얹는다). 그 밖에 `addPlace`에 없는 창 id를 주면 0.25초마다 예외가 나던 것(건너뛰고 한 번 경고), 문서의 헷갈림·사소함 여덟(그림과 publicDir, 강화의 예, Reward의 자리, cast의 대상 없음, 시야, addPlace의 id, 운영 스크립트의 로그·끄기). 1차 막힘 1 → 2차 0(검사 오탐 1) → 3차 2(둘 다 이번에 더한 운영·모델 기능의 것).
3. **아래 '3. 남은 일'**의 작은 것들. 2026-11-25에 끝낸 것: 운영 스크립트를 게임마다(`games/<게임>/deploy.json`), 등불지기의 서버 진입점도 틀의 `runServer`로, 틀 css의 박힌 색을 변수로(`--ink-rgb`, `--cover-rgb`, `--on-gold`, `--good`, `--bad`, `--ally`).

### 요약에서 내린 줄 (기록: 2026-11-24~26의 요약)

2026-11-27의 현행화 전에 맨 위 요약에 있던 줄이다. 검사 수와 게임 이름은 그때의 것이다.

- 틀이 게임에서 읽는 것은 내용 계약(`engine/shared/contract.ts`: 핵심 계약 `MAP`·`MODULES`와 모듈마다의 선택 계약)의 이름뿐이고, `engine/shared/content.ts` 한 곳에서 별칭 `@game/shared/content`로 읽는다(적지 않은 이름은 `defaults.ts`). 게임은 틀을 입구(`@engine/shared`, `@engine/server`, `@engine/client`, `@engine/client/i18n`, `@engine/testing`)로만 읽는다.
- 틀의 시험은 게임 없이 돈다: 시험용 내용(`engine/test/fx/`) 위에서. `games/`를 지운 복사본에서도 틀의 타입 검사와 시험이 통과한다(2026-11-25에 확인).
- 틀 수리 묶음 A~F(점검 보고의 31개 항목 가운데 문서로 남긴 것 말고 모두)가 끝났다(2026-11-25).
- 그 뒤 틀에 더한 기능(2026-11-25, '틀에 더한 기능'): 전체 지도와 자동 이동, 손 모양·날아가는 것·사람형 모델 등록, 기술 효과 여섯 가지, 메뉴 탭 고르기.
- 에셋 불러오기(2026-11-26, '에셋 불러오기'): 모델 파일(glTF/GLB)과 애니메이션 클립, 효과음 파일·배경음·음량, 접속 화면의 미리 불러오기. 등록하지 않으면 예전과 같다(등불지기는 등록하지 않는다). `npm test` 검사 1369개.
- 틀 손질 묶음(2026-11-26, 가지 `feat/stage3`, '틀 손질 묶음'): 흔들리던 시험(벽시계로 자던 기다림)을 없앰, `restart.mjs`의 `/healthz` 기다리기, 화면 파일의 형식(소리·모델), `hud/menu.ts` 나누기, 폰의 메뉴 탭 줄, 화면의 셈을 브라우저 없이 시험(`fx/client`).
- 운영 안전 묶음(2026-11-26, 가지 `feat/ops`, '운영 안전 묶음'): 저장 형식 버전과 이전, 한 묶음 저장, 자동 백업, 감시자와 Node 재시작 스크립트, `/healthz`·`/metrics`, 압축 기본 켬, 시각이 붙는 로그. `npm test` 검사 1380개.
- 빈틈 메우기(2026-11-26, 가지 `feat/gaps`, '빈틈 메우기'): 문서만 보고 만든 굴림공의 증명 기록([proof-rollball.md](proof-rollball.md))의 빈틈. 카메라(`CAMERA`, `setCameraAim`, `fitZoom`), 사람마다의 값과 겉모습(`g.playerSync`, `setPlayerLook`), '집으로' 끄기(`HOME_KEY`), 고르지 않은 모듈의 줄 칸 빼기, `npm test`의 끝 줄, 문서. `npm test` 검사 1612개.
- 엔티티의 모듈 몫(2026-11-26, 가지 `feat/entcore`, '엔티티의 모듈 몫'): 핵심 엔티티(`Ent`)에는 핵심의 칸 27개만 적고, 모듈의 칸 44개(골드, 레벨, 체력, 장비 …)는 모듈마다 `engine/server/game/parts.ts`에 두어 그 모듈을 고른 게임의 엔티티에만 만든다. 등불지기는 줄 위의 글자·저장·난수의 차례가 그대로다(황금 실행과 운영 DB 복사본 비교). `npm test` 검사 1624개.
- 틀의 남은 한계 메우기(2026-11-26, 가지 `feat/limits`, 같은 이름의 절): 기기 옮기기 코드가 서버를 다시 켜도 남는다(해시만 저장), 파일 모델의 사람에 갑옷(`armor.tint`·`attach`), 팀 모듈 `teams`(굴림공이 쓴다). `npm test` 검사 1687개.
- 수집형·방치형 모듈(2026-11-26, 가지 `feat/collect`, 같은 이름의 절): 영웅 `roster`, 뽑기 `gacha`(공개 확률표, 천장, 10번 보장, 기록, 게임 안의 재화만), 편성 `squad`(영웅이 함께 싸운다: 전투의 `registerAlly`), 단계 `stages`(장·단계·물결·우두머리, 자동 진행·실패, 방치 보상이 깬 단계로), 던전의 입장 열쇠(`DungeonDef.key`). 본보기 내용 `engine/test/collect/`(영웅 들판). 등불지기는 고르지 않았고 황금 실행이 바이트까지 같다. `npm test` 검사 1813개.
- 영웅의 성장(2026-11-26, 가지 `feat/herogrow`, 같은 이름의 절): 영웅 장비 `herogear`(세트, 강화, 단계·던전에서 떨어짐), 기술 레벨, 각성, 시너지, 진형(앞줄이 먼저 맞는다), 한 가지 전투력. 모두 내용이 적어야 켜진다: 등불지기·시제품과 이 기능 전의 수집형 내용의 황금 실행이 바탕과 같다. `npm test` 검사 1916개.
- 단계 밖과 달무리의 빈 곳(2026-11-26, 가지 `feat/idleflow`, 같은 이름의 절): 던전 안의 자동 전투, 던전 뒤 단계로, 메뉴에서 바로 던전, 돌아왔을 때의 창, 재료로 영웅 조각, 영웅 모델에 id·등급, 딸려 온 화면 감추기, 메뉴 줄 도우미의 입구, `CAMPS`를 적지 않은 게임·갑옷 없는 아이템 표의 틀 안 타입 오류. 모두 선택 칸이라 등불지기·시제품·달무리의 황금 실행이 바이트까지 같다.
- 달무리 옮기기(2026-11-26, 가지 `feat/dalmig`, 같은 이름의 절): 달무리 원정대의 꼼수(게임 명령 `keyrun`·`essence`, 메시지 `idleGain`, 옷 색 → 등급, css 감추기, 손수 만든 메뉴 줄)를 지우고 틀의 칸으로. 소탕·오프라인 진행·픽업 배너·선택권·영웅 장비·기술·각성·시너지·진형을 쓰게 했다. 틀은 돌아왔을 때의 창의 바탕(불투명)과, 창을 쓰는 게임에서 오프라인 진행을 안내문과 창에 두 번 알리던 것을 고쳤다. 등불지기·시제품 여섯의 황금 실행이 바이트까지 같다. `npm test` 검사 2313개.
- 턴제의 빈 곳(2026-11-26, 가지 `feat/turnfw`, 같은 이름의 절): 판 모듈 `rooms`(판마다의 층, 대기실·짝짓기·컴퓨터 상대, 차례와 기한·초읽기, 끊긴 사람, 판의 저장), 땅 누르기 가로채기, 연출 사건, 카메라 돌리기, 폰 세로 한가운데, 대화창에 남기지 않는 안내문, 순간 이동, 자리 css의 `free`. 모두 선택이라 등불지기·시제품·달무리의 황금 실행이 바이트까지 같다. `npm test` 검사 2323개.
- 소탕·오프라인 진행·픽업 배너(2026-11-26, 가지 `feat/sweep`, 같은 이름의 절): 단계·열쇠 던전의 소탕(소탕권·재화·열쇠, 보상은 바로), 접속하지 않은 동안의 단계 진행(편성의 전투력과 권장 전투력, 시간·단계의 상한, 방치 보상을 깬 단계로 토막 내어), 픽업·반반·천장 공유·기간 한정 배너와 영웅 선택권(공개 확률표에 실효 확률까지). 모두 내용의 선택 칸이라 적지 않은 게임은 예전과 같다. 등불지기 황금 실행이 바이트까지 같다. `npm test` 검사 1930개.
- 부하와 장시간(2026-11-26, 가지 `feat/loadtest`, 같은 이름의 절): 영웅이 많은 편성·장시간 운영·팀 셋 이상의 화면을 쟀다. 틀의 뜨거운 길 넷(층마다의 스냅샷 격자, 층마다의 몬스터 색인 `g.monstersIn`, 장애물 칸 색인, 상태 글자 다시 쓰기)과 소켓 쓰기 모으기, 운영에서 끝없이 쌓이던 측정 값을 고쳤다(게임의 결과·줄 위의 바이트는 그대로). 도구 `npm run load:game`, 수치는 [infra.md](infra.md) '부하와 장시간'.
- 등불지기의 플레이, 저장 형식은 가르는 동안 바뀌지 않았다(장르 중립 틀에서도: 옛 견본 15개와 운영 DB 복사본 캐릭터 59·월드 1을 읽은 결과가 글자까지 같다). 프로토콜은 3이다(2026-11-26: 엔티티 종류를 문자열로, 상태 줄 뒤에 게임의 값, stat·meta의 칸이 모듈마다. 옛 화면은 새로고침을 안내받는다).

## 틀에 더한 기능 (2026-11-25)

| 기능 | 틀 쪽 | 게임이 하는 일 | 지키는 것 |
|---|---|---|---|
| 전체 지도 | `engine/client/hud/worldmap.ts`: 지역 전체, 확대·끌기·두 손가락, 장소 목록과 정보 카드, 표식 위의 이름, 축척, 걸어가는 길. 상점·대장간(잠금)·던전의 문·사냥터(`CAMPS`: 몬스터와 수, 경험치·골드)·우두머리는 내용에서 스스로 모은다. 열기: N 키, 미니맵, '지도' 단추(폰 포함) | 바탕(`setMapPaint`), 큰 이름(`addMapLabels`), 자기 장소(`addMapPlaces`, 갈래 `PlaceKind`) | 화면으로 확인(PC·폰 가로세로·두 게임) |
| 자동 이동 | `travelTo(장소, hunt)`, `stopTravel`: 길을 찾아 걷고 도착을 알린다. hunt면 도착해서 자동 사냥을 켠다. 직접 움직이면 그치고, 닿지 못하면 몇 번 다시 걷다 그친다 | 목록·카드의 단추가 부른다 | 화면으로 확인(가서 자동 사냥 → 처치까지) |
| 손 모양·날아가는 것·사람형 | `registerHand(id, build)`, `registerShot(id, look)`, `setHumanoidBody(look => Model)`. 직업의 `hand`·`shot`은 문자열(틀에는 sword·bow·staff, arrow·bolt). 아이템 이름표는 손 모양 id의 칸을 읽는다(`ItemNames`) | 예제: 나무꾼의 도끼(`registerHand('axe', …)`) | 타입 검사, 화면 |
| 기술 효과 여섯 | `SkillEffect`: `hit`(slow·stun), `area`, `heal`, `buff`(damage·guard·regen·crit, allies), `dash`, `dot`(area). 서버 `g.combat.cast`, 시간은 `tickEffects`, 사건 `buff`·`stun`. 화면: 내 정보 창의 강화와 남은 시간(`hud/buffs.ts`), 기절 글자, 돌진 먼지. 자동 사냥과 도감도 종류를 안다 | 기술 표에 한 줄. 예제: 내려찍기에 `stun: 1` | `engine/test/fx/skills.test.ts`(20개) |
| 메뉴 탭 | 탭 id(`MENU_TABS`), `setMenuTabs(ids)`, `addMenuTab({ id, label, draw, dot, open, sig }, after)`, `openMenu(id)`. 일일 임무·출석이 없으면 일일 탭이 숨는다 | 예제: 거래소·길드를 감추고 모닥불 탭을 더했다 | 화면 |
| 상인 | `setMerchant((shop, i) => ({ model, name, look }) \| null)` | 등불지기: 곁의 등탑을 바라본다, 이름 '길 상인' | 화면 |
| 재화 | 저장을 읽을 때도 `CURRENCIES.max`(`g.wallet.limit`), 첫 재화의 이름은 이름표 `currency1` | 이름표 | `fx/wallet` |
| 그림 | `addIconSheet(src, 열, 행, keys, hand?)`, `itemIcon(열쇠, 직업)`, `gearIcon`: 시트의 한 칸을 가방·상점·대장간·물약 단추·메뉴의 장비와 우편·내 정보 창의 재화에 그린다. 열쇠는 아이템 id, `slot:칸`, `cur:gold`·`cur:second`, `ui:mail`. hand를 주면 그 손 모양의 직업에게만(무기). 칸 뒤의 바탕은 `--icon-bg`. 없는 것은 글자만 | 등불지기: 투명 webp 넷(소모품·재료, 검·갑옷, 활·지팡이, 장신구·재화·우편), 모두 340KB | `fx/icons`(4개), 화면(PC, 전사·궁수·마법사) |
| 운영 스크립트를 게임마다 | `games/<게임>/deploy.json`(port, db, dist, bots, pages)을 `scripts/deploy.mjs`가 읽고, `restart.sh`·`publish.sh`(`GAME=`)와 `pilot.mjs`(인자)가 그것으로 돈다. `restart.sh`의 `DRY=1`. (2026-11-26: Node로 된 `restart.mjs`·`serve.mjs`가 더해졌다: 아래 '운영 안전 묶음') | 자기 `deploy.json` | 예제로 실제 재시작(깃발로 저장하고 끄기 → 다시 띄우기) |
| 관리자 통로 (2026-11-26) | `engine/server/net/admin.ts`(`POST /admin`, 같은 PC·토큰 파일·터널/브라우저 머리 거절·끌 수 없는 기록 `admin-audit.log`), `engine/server/game/systems/sanctions.ts`(`g.sanctions`: 차단(키·주소, 기간·영구·사유), 말 막기(전체·길드), 지급·회수(`WHY.admin`, 접속하지 않은 캐릭터는 다음 접속 때), 신고 처리 표시. 월드 저장 `sanctions` 칸), CLI `npm run admin -- [게임] <명령>` (`scripts/admin.mjs`). 연결 끊기 코드: 4001 옮겨 감, 4002 내보냄, 4003 차단 | 없음(모든 게임이 갖는다) | `fx/admin` |
| 기기 옮기기 (2026-11-26) | `engine/server/net/handoff.ts`: 일회용 코드(8자, 10분, 한 번, 틀린 시도는 주소·사람별 10분에 5번), 토큰 해시 → 저장 키의 별칭과 물러난 토큰(월드 저장 `handoff` 칸). 살아 있는 코드는 그 칸의 `codes`에 **코드의 해시만**(`hashCode`) 남아 서버를 다시 켜도(강제로 죽여도) 끝날 때까지 쓰인다(2026-11-26 `feat/limits`: 코드를 줄 때 곧바로 저장한다. 코드가 없으면 칸의 모양은 예전과 같다. 더하기만 한 칸이라 이전 없음, 옛 서버는 무시한다). 다시 켠 뒤 같은 캐릭터가 코드를 다시 달라고 하면 옛 코드의 글자를 모르므로 옛 것을 지우고 새 코드를 준다. 틀린 시도의 수는 예전처럼 메모리에만. 저장 키(Ent.pid)는 바꾸지 않는다. 화면: 메뉴의 '기기' 탭(`MenuTab.always`: `setMenuTabs`를 써도 보인다), 직업 고르기 창의 '코드로 이어받기', `net.ts`의 `adoptToken`·`forgetToken` | 없음 | `fx/handoff`(실제 서버 프로세스 `fx/handoff-proc.ts`를 강제로 죽였다가 같은 DB로 다시 켜서: 받은 코드가 쓰임, 한 번만, DB에 코드 글자가 없음, 11분 뒤의 시계로는 거절), 화면 |
| 시험을 게임마다 | `test/all.ts`가 `games/<게임>/test/all.ts`를 저마다의 tsconfig로 돌린다. `node scripts/game.mjs test [게임] [이름…]` | 자기 `test/all.ts`와 `tsconfig.json` | `npm test` |

## 에셋 불러오기 (2026-11-26)

게임이 파일을 등록하면 코드 모델·합성음 대신 그것을 쓴다. 등록표와 고르는 규칙은 `engine/client/assets.ts`(three.js도 화면 요소도 읽지 않는다), 읽고 복제하고 움직이는 것은 `engine/client/scene/gltf.ts`, 바꿔 끼우기는 `scene/models.ts`, 소리는 `sound.ts`, 미리 불러오기는 `preload.ts`. 쓰는 법은 [making-a-game.md](making-a-game.md) 5절 '모델 파일과 애니메이션', '소리 파일과 배경음'.

| 기능 | 틀 쪽 | 게임이 하는 일 | 지키는 것 |
|---|---|---|---|
| 모델 파일 | `registerMonsterAsset(종류, 파일)`, `registerHumanoidAsset(파일, 직업?)`, `registerWeaponAsset(무기 id 또는 손 모양 id, 파일)`. 맞추는 값 `height`/`scale`, `lift`, `ground`, `turn`, `shadow`, 재질 색 `tint`, 사람의 `arms`(손 모양을 붙일 팔 뼈)·`paint`(옷·살갗 재질, 여럿이면 목록)·`armor`(2026-11-26 `feat/limits`: 입은 갑옷을 `tint`의 메시·노드·재질 이름에 갑옷 색으로 칠하고, `attach`의 뼈에 틀의 덧대기를 쉬는 자세의 코드 사람 자리로 붙인다. 없으면 예전처럼 아무것도 하지 않는다. 코드 사람의 덧대기는 그대로). 코드 모델을 먼저 세우고 파일이 읽히면 안을 바꿔 끼운다(같은 Model 객체). 같은 파일은 한 번 읽고 복제(뼈대는 `SkeletonUtils.clone`). 읽지 못하면 경고 한 줄, 코드 모델 그대로. 무기는 손 모양이 돌려준 칼날 자리에 놓고 칼날을 숨긴다 | 예제: 곰·멧돼지(같은 `beast.glb`를 크기·털빛만 다르게), 모든 사람(`camper.glb`, 옷·살갗을 사람마다 칠함, 도끼·활이 팔 뼈에, 갑옷은 몸통 재질 `torso`를 칠하고 덧대기를 `spine`에), 도끼(`axe.glb`). 토끼는 코드 모델 그대로. 갑옷을 보이려고 둘째 갑옷 '쇠비늘 조끼'(`scale`, 어깨받이)를 상점에 더했다 | `fx/assets`(고르는 차례, 크기·발 높이, 파일 사람의 갑옷: 칠하기·덧대기의 자리·뼈를 따라 움직임·벗기·번쩍이는 중·이름이 없을 때·코드 사람은 예전 자리), 화면(예제 PC·폰: 갑옷 없음·털가죽 옷·쇠비늘 조끼, 등불지기 전후 비교) |
| 애니메이션 | `AnimationMixer`로 상태 idle/walk/attack/hit/die → 클립(`DEFAULT_CLIPS`, `setClipNames`, 모델의 `clips`. 대소문자와 내보낸 도구가 붙인 앞머리(Armature 세로줄 이름)를 맞춘다). 서 있기·걷기 반복, 공격·맞음·쓰러짐 한 번(우선순위 쓰러짐 > 공격 > 맞음), `fade`(기본 0.2초)로 섞기, `speed`. 공격은 서버의 공격 사건(코드 모델의 `swing`과 같은 신호)에, 맞음은 `h` 사건의 대상에, 쓰러짐은 `d` 사건에(클립 길이 + 0.5초 누웠다가 사라진다, 2.5초까지). 클립이 없는 상태는 틀의 흔들기(통통·살짝 뜀·줄어듦). 믹서는 거리와 화면 안팎으로 1·2·4·8프레임마다(`mixerEvery`) | 클립 이름을 맞춘 파일 | `fx/assets`(클립 고르기, 우선순위, three의 믹서로 Animator의 넘어가기·돌아오기·쓰러짐), 화면(곰의 내리찍기, 멧돼지의 쓰러짐, 야영꾼의 걷기·도끼 휘두르기) |
| 소리 파일 | `registerSound(키, 주소, 음량?)`: 틀의 키 여덟(hit, crit, hurt, kill, skill, fanfare, pickup, bad)과 게임의 키(`playSound`). 다 읽힌 파일이 있으면 파일, 아니면 합성음(`soundSource`). 효과음과 합성음은 효과음 음량을, 배경음은 배경음 음량을 지난다 | 예제: hit, pickup을 WAV로(나머지는 합성음) | `fx/assets`(고르기), 화면에서 튼 소리의 길이로 확인(0.18초 = 파일, 0.3초 잡음 = 합성음) |
| 배경음 | `registerMusic(id, 주소, 음량?)`, `setMusicPicker(() => id)`: 0.25초마다 묻고 바뀌면 1.5초 페이드, 반복. audio 요소로 흘려 받는다. 소리를 끄면 줄어들어 멈춘다 | 예제: 모닥불 20m 안에서 `camp` | 화면(재생·끄면 멈춤·켜면 다시) |
| 음량과 자동 재생 | 메뉴 머리에 '음량' 단추와 효과음·배경음 막대(소리 파일을 등록한 게임이나 `enableVolume()`만). localStorage `soundMix`(try/catch). 첫 입력 전에는 소리 장치를 만들지 않는다 | | `fx/assets`(저장 글 읽기), 화면 |
| 미리 불러오기 | 접속 화면에 진행 막대와 '모델과 소리를 불러오는 중 n/m'(i18n `loadingAssets`). 접속이 먼저 끝나도 다 읽을 때까지(12초까지) 접속 화면을 둔다. 등록한 것이 없으면 아무것도 보이지 않는다. 배경음은 미리 받지 않는다 | | 화면(느린 회선 흉내로 0/5 → 3/5 → 들어감) |
| 번들 | 모델 파일 쪽(`scene/gltf.ts`)은 게임이 처음 등록할 때 끼워진다(`setFileTools`): 등록하지 않는 게임의 번들에는 그것과 three.js의 읽기·애니메이션 코드가 들어가지 않는다. GLTFLoader(46KB)와 SkeletonUtils(4KB)는 처음 읽을 때 따로 받는다 | | 빌드 크기: 등불지기 763KB → 769KB, 예제 784KB + 따로 50KB |

예제의 파일은 `scripts/make-sample-assets.mjs`가 만든다(인터넷에서 받지 않는다): 상자로 된 뼈대 모델 둘(36KB, 41KB, 클립 다섯), 도끼 머리(5KB), 효과음 둘(WAV 8KB, 14KB), 배경음(12초 WAV 375KB). 예제의 `vite.config.ts`에서 `publicDir: false`를 지웠다(`client/public/`).

## 운영 안전 묶음 (2026-11-26)

| 무엇 | 틀 쪽 | 게임이 하는 일 | 지키는 것 |
|---|---|---|---|
| 저장 형식의 버전과 이전 | `PlayerSave.v/gv`, 월드의 `v/gv`. `engine/server/game/migrate.ts`의 틀의 목록(`PLAYER_UP`, `WORLD_UP`)과 게임의 목록(`g.migrations`)을 읽을 때 차례로, 쓸 때 지금 버전을 적는다. v0(버전 칸 없음) → v1이 예전의 `Saver.legacy` 읽기를 그대로 한다. 앞날의 버전은 건드리지 않는다 | 모양을 바꿀 때 `g.migrations.player/world`에 한 단계 ([making-a-game.md](making-a-game.md) 7절) | `fx/ops`, `deungbul/saves`: 옛 견본 15개를 읽은 결과가 버전을 들이기 전의 코드와 **글자까지 같다**(기대값은 그 코드가 만든 것). 운영 DB 복사본(2026-11-26 06:44 백업, 캐릭터 59·월드 1)도 전후 같음을 따로 확인 |
| DB 스키마 번호 | `PRAGMA user_version`과 `SCHEMA` 목록(`store/sqlite.ts`). 1단계는 처음의 표들(IF NOT EXISTS라 번호 없는 옛 DB에 그대로 돈다) | 없음 | `fx/ops`(옛 DB, 실패한 단계는 되돌림) |
| 한 묶음 저장 | `Store.transaction(fn)`(SQLite는 SAVEPOINT, 메모리는 통째로 떠 두고 되돌림). `saveTogether`·주기 저장·끌 때 저장이 월드·접속 중·자리 비움 캐릭터·지표를 한 묶음으로. 실패하면 모두 되돌리고 `saveDirty`·`unsaved`를 남겨 1초 뒤 다시. 저장 값을 만드는 시스템의 버그는 그 캐릭터(또는 월드)만 빼고 적는다(예전과 같다). 월드에 저장할 것이 있으면 캐릭터 하나를 저장할 때도 월드와 함께 | `p.unsaved`, `g.saveDirty`만 세운다(그대로) | `fx/ops`(도중 실패 → 아무것도 안 적힘 → 다시 시도로 함께 적힘) |
| 자동 백업 | `store/backup.ts`: 켜질 때와 `BACKUP_EVERY_MIN`(360)마다 `backup/auto-YYYYMMDD-HHMMSS.db`, `BACKUP_KEEP`(20) 넘는 자동 백업만 지움. `startServer`의 `backup` 옵션, `BACKUP=0` | 없음 | `fx/ops`(사람이 만든 이름 꼴 일곱을 두고 지우지 않음) |
| 치명적 오류 | `run.ts`: `uncaughtException` → 적고 저장하고 코드 1. `unhandledRejection` → 적고 계속. `server.pid` | 없음 | `fx/ops`(따로 된 프로세스 `fx/crash.ts`: 거부 뒤에도 돌고, 예외 뒤 저장하고 코드 1) |
| 감시자와 재시작 | `scripts/serve.mjs`(다시 띄우기 1→60초, 코드 0이면 멈춤, 로그 이어 쓰기), `scripts/restart.mjs`(깃발 → 강제는 감시자 먼저, cloudflared는 이름을 보고 안 끔, 로그 돌리기, 포트 기다림, `--stop`, `--dry`). `restart.sh`·`stop.sh`는 그대로 남겼다 | 없음 | 포트 3015에서 실제로: 띄우기 → 다시 켜기 → 서버를 강제로 죽이기(1초·2초·4초 뒤 다시 뜸) → 깃발로 끄기(감시자도 멈춤) → 깃발을 무시하는 프로세스를 10초 뒤 강제로 끔 |
| 상태 확인 | `net/ops.ts`: `GET /healthz`(JSON), `GET /metrics`(텍스트). localhost에서 프록시 머리말 없이 온 요청에만 | 없음 | `fx/ops`, 3015에서 curl |
| 압축 | `startServer`의 `compress`(기본 켬, `COMPRESS=0`으로 끔), 256바이트 미만은 압축하지 않음 | 없음 | 측정: [infra.md](infra.md) '압축' |
| 로그 | `engine/server/log.ts`의 `log.info/warn/error`(시각·수준). 서버의 핵심 경로(켜기·끄기·저장·백업·치명적 오류)만 바꿨다. 나머지 `console.*`는 그대로 | `@engine/server`의 `log` | `fx/ops` |

남은 위험(이 묶음의 것): 감시자를 띄우는 중(서버가 아직 포트를 열기 전)에 `restart.mjs`를 부르면 감시자만 끄고 막 뜨던 서버가 남을 수 있다. 자동 백업은 동기로 돌아 DB가 커지면 틱을 멈춘다(지금은 수 ms). 터널을 지나온 `/healthz` 요청이 실제로 막히는지는 머리말을 흉내 내어 시험했을 뿐 실제 터널로는 보지 않았다.

## 틀 손질 묶음 (2026-11-26, 가지 `feat/stage3`)

| 무엇 | 바뀐 것 | 지키는 것 |
|---|---|---|
| 흔들리던 시험 | `npm test`가 열한 번에 한 번쯤 `fx`에서 실패하던 것. 원인 하나는 재현했다: `fx/ops`가 스키마 올리기에 실패한 `SqliteStore`의 파일을 열어 둔 채 남겨, 끝의 임시 폴더 지우기가 `EBUSY`로 죽었다(고치기 전 `fx` 18번 가운데 1번, 셋을 함께 돌려). `SqliteStore`는 열다가 실패하면 파일을 닫는다. 그 밖에 벽시계로 자고 결과를 보던 기다림을 모두 조건 기다리기로: 시험 도구 `settle(피어, 스냅샷 수)`(ping → pong, 그다음 스냅샷), `until`의 기본 기한 10초, `removeTemp`. 서버의 사람별 제한(대화·이름·신고 간격, 대화량)이 읽는 시계 `startServer(…, { now })`: 시험은 간격을 시계로 넘긴다('다시 접속하고 곧바로'가 바쁜 컴퓨터에서 0.7초를 넘던 것) | 고친 뒤 `fx` 30번과 `npm test` 10번을 다섯 줄로 함께 돌려 모두 통과 |
| 재시작의 상태 확인 | `scripts/restart.mjs`가 `/healthz`를 `ticking:true`가 될 때까지(20초) 다시 묻고 찍는다. 못 되면 마지막 답과 로그의 끝, 코드 1. `--dry`와 끄기·띄우기는 그대로 | 예제로 3017에서 띄우기·끄기, 기한을 넘기는 길 |
| 화면 파일의 형식 | `net/static.ts`의 `MIME`·`mimeOf`: 소리(wav, ogg, mp3, m4a …), 모델(glb, gltf), webp·avif, 글꼴(woff2 …), json·webmanifest 등. 확장자의 대소문자를 가리지 않는다 | `fx/static` |
| 메뉴 나누기 | `hud/menu.ts`(769줄)는 창(탭 줄, 다시 그리기, 열고 닫기, 메시지 받기)만. 탭의 그리기는 `hud/menu/`의 `gear`·`build`·`mail`·`daily`·`market`·`guild`·`rank`, 함께 쓰는 요소 `parts.ts`(다시 그리기는 `redraw`), 탭 목록의 셈 `tabs.ts`. 입구의 이름과 탭을 모듈마다 붙이는 방식은 그대로 | 등불지기 PC·폰, 한국어·영어, 탭 8개마다 `#menu`의 DOM이 나누기 전과 같다 |
| 폰의 메뉴 탭 줄 | 폭 720px 아래에서 넘치는 탭을 다음 줄로(`flex-wrap`). 390px 폰의 영어 메뉴에서 끝의 'Device'가 잘린 채 보이던 것. PC·폰 가로·한국어(한 줄에 들어간다)는 그대로 | 화면(폰 영어 두 줄, 나머지는 전과 같은 자리) |
| 화면의 셈을 시험 | 화면 요소를 읽지 않는 파일로 떼어 냄: `hud/bagcells.ts`(가방의 칸과 귀퉁이 글), `hud/menu/tabs.ts`(고른 모듈·차례·늘 보이는 탭), `keys.ts`(틀이 다는 단축키와 그 모듈). 단축키의 표는 `startClient`가 실제로 달린 키(`boundKeys`)와 견주어 다르면 콘솔에 경고한다. DOM 흉내는 쓰지 않았다(`app.ts`가 읽히는 때에 뼈대와 three.js 화면을 붙인다) | `fx/client`(소스의 `bindKey`·`modules.ts`와 표를 견준다), 화면(세 게임에서 경고 0) |

## 틀 수리의 진행 (점검 보고의 묶음 A~F: 모두 끝)

| 묶음 | 상태 |
|---|---|
| A. 두 번째 내용과 게임 고르기 | **끝(2026-11-25).** 틀을 두 번째 내용(예제)으로 타입 검사하는 것과 빈 표 변형 셋(`bare`, `weaponOnly`, `otherGear`)은 예제 작업 때 들어갔다. 게임 고르기는 `scripts/game.mjs <start\|watch\|client\|build> [게임]`(인자, `GAME`, 기본 `deungbul`) 한곳으로: 뿌리의 `vite.config.ts`를 `games/deungbul/vite.config.ts`로 옮겼고 `package.json`의 서버·화면 스크립트는 전부 이것을 부른다. 시험도 게임마다: `games/<게임>/test/all.ts`가 그 게임의 목록이고(`node scripts/game.mjs test [게임] [이름…]`, `npm run test:game`·`test:sample`), 뿌리의 `test/all.ts`는 틀의 시험 뒤에 `test/all.ts`가 있는 게임을 모두 저마다의 `tsconfig.json`으로 따로 된 프로세스에서 돌린다(`npm test`가 예제의 시험도 함께 돈다). 등불지기도 자기 `games/deungbul/tsconfig.json`을 가졌다. 뿌리의 `tsconfig.json`은 편집기와 `scripts/`·`test/`를 위해 등불지기를 기본으로 두었다(저장소의 본 게임) |
| B. 장비·능력치·이름의 고정 풀기 | **끝(2026-11-24).** `STATS[id] = { base, mod }`, `BUILD_STATS[id] = { mod, per }`(전에는 id 목록과 `BUILD.pow/vit/luck`). `mod`는 틀의 효과 넷(`StatMod`: `damage`, `guard`, `crit`, `hp`)이고 서버의 보정(`modValue`, `wornMod`)과 화면의 문장은 효과로 만든다. 칸·등급·능력치의 이름은 이름표(`ContentNames`)의 `gearSlots`, `rarities`, `buildStats`로 게임에. 무기·갑옷 바탕의 기본 수치는 그 효과에 드는 첫 옵션(`statFor`)으로 보인다. 저장을 읽을 때의 옵션 수·장비 레벨 상한도 내용에서(`OPTS_MAX`) 또는 넉넉하게(999). 화면의 문장은 견본과 글자까지 같다. 안내문 `rested`는 D에서 게임으로 옮겼다. 첫 번째 재화의 이름은 이름표의 `currency1`(`{ name, unit }`, 없으면 골드)로: 틀의 문장 스물여덟 곳(한국어·영어 각각)이 그것을 쓴다(점검 26번, 2026-11-25) |
| C. 빈 표와 낱개 | **끝(2026-11-25).** `ATTEND = []`면 출석을 세지 않는다, 처음 필요 경험치는 `needFor(1)`, 접속 전 카메라는 `MAP.spawn` 둘레, 대장간 창은 닿는 곳의 잠금 풀린 대장간이면 어느 것이나(서버와 같은 규칙), 직업의 기술 수는 `SKILL_SLOTS`를 따른다(`readonly SkillId[]`). `loc.items.potion`·`'field'`·개발 포트·`itemDef().kind`는 예제 작업 때 고쳤다. 상인은 게임이 세운다(20번): `setMerchant((shop, i) => ({ model, name, look }) | null)`, 빈 칸은 틀의 기본, `null`이면 그 자리에 아무도 세우지 않는다. 틀의 상인 이름은 '상인'/'Merchant'이고 등불지기는 '길 상인'으로 덮어쓴다(`ui.shop`, `msg.shopFar`). 재화의 상한은 저장을 읽을 때도 `CURRENCIES.max`에서(24번, `g.wallet.limit`): 시험용 내용의 상한을 1e9와 다르게(5e10) 두어 시험이 이를 지킨다. 레벨(999)과 우편 한 통의 보상(1e7)은 깨진 저장을 막는 틀의 상수로 남겼다 |
| E. 경계 검사와 공개 표면 | **끝(2026-11-24, 마지막 조각은 F와 함께 2026-11-25).** 새 시험 `engine/test/boundary.test.ts`: (1) 틀의 소스가 게임의 내용 id를 문자열로 적는가(틀의 낱말 9개와 기본값 묶음은 뺀다), (2) 틀의 모든 소스의 문자열과 css에 이 게임의 낱말이 있는가(알고 남긴 것 4가지: `sparks`·`sparkBonus`(두 번째 재화의 칸), `raid`(점검 14번에서 지운다), `crypto`), (3) 타입 검사를 피하는 캐스팅이 지금(6개)보다 늘었는가, (4) 층을 넘는 import(화면 → 서버, 게임 규칙 → 저장소 구현, 공용 → 서버·화면). 지갑 검사는 `p['gold']`와 `Object.assign(p, { gold })`도 잡는다. 검사마다 스스로를 시험하고, 틀의 파일에 위반 넷을 일부러 넣어 넷 다 잡히는 것을 확인했다. 장부의 한 줄 요약은 재화를 `ECON_CURS`의 id로 찍는다(점검 10번의 반). **입구도 끝(같은 날)**: `engine/shared/index.ts`, `engine/server/index.ts`, `engine/client/index.ts`, `engine/testing.ts`가 이름을 하나씩 적어 내놓고(이것이 게임에 약속한 표면이다), 게임의 import 131줄을 입구로 옮겼다(67줄로 합쳐짐). `boundary.test.ts`의 5번이 깊은 import를 막는다: 허용은 입구, 언어 묶음(`i18n`, `i18n/ko·en·names·merge`), 내용 통로(`shared/defs`, `shared/world`), 확장 지점 셋, 그리고 내용 파일만 `shared/defs/*`의 `import type`과 `shared/defaults`. 구조 시험의 경로 풀이는 폴더의 `index.ts`를 따라간다. 두 게임을 브라우저에서 띄워 콘솔 오류 없이 도는 것을 봤다(화면 모듈의 읽히는 차례가 바뀌었기 때문). 옛 `framework.test.ts`는 F에서 셋으로 갈랐다 |
| F. 틀의 시험을 시험용 내용으로 | **끝(2026-11-25).** 틀의 시험용 내용 `engine/test/fx/shared/content`("시험 들판": 어느 게임의 것도 아니다. id와 맵은 등불지기·예제와 모두 다르고 수치는 시험의 기대값대로 등불지기를 따른다. 대장간·잠금·던전·필드 보스·두 번째 재화·분해·가방 넓히기·상인 둘을 모두 켠다)과 자기 tsconfig(`@game` → 그 폴더). 틀의 기능 시험 24개(`bare`와 옮긴 23개)가 그 위에서 따로 된 프로세스로 돈다(`engine/test/fx/all.ts`, 이름은 `fx/…`). 그 프로세스가 끝에 "게임(games/ 아래)의 파일이 하나도 로드되지 않았다"를 확인한다. 옛 `engine/test/framework.test.ts`는 셋으로 갈랐다: 틀만의 게임·서버·프로토콜 → `engine/test/fx/bare.test.ts`, 예전과 같다는 검사(맵 지문, 옮긴 수치, 저장 견본) → `games/deungbul/test/baseline.test.ts`, 이 게임과 틀의 경계(폴더·import·확장 지점·언어·화면) → `games/deungbul/test/split.test.ts`. 어느 게임에나 맞는 규칙(틀은 내용 통로 말고는 게임을 읽지 않는다, 게임의 id는 저장소의 모든 게임과 시험용 내용에서 모은다)은 `engine/test/boundary.test.ts`로. **확인: 저장소를 복사해 `games/`를 통째로 지우고도 틀의 타입 검사(`tsc -p engine/test/fx`)가 0이고 틀의 시험 704개가 모두 통과했다.** 검사 수는 1089(옮기기 전 1085 + 새 경계 검사 셋 + 매번 도는 '틀만' 검사 하나) |
| D. 서버에 남은 색 | **끝(2026-11-25).** (12) `PlayerSave`에서 이 게임의 옛 칸 넷(`contrib, quest, rested, tier`)을 뺐다: `Saver.legacy`는 옛 저장을 이름-값 묶음으로 받는다. (13) 안내문 `rested`를 이 게임의 `MsgMap`으로. (27) `addBannedWords`(`@engine/server`): 게임이 금칙어를 더한다. (10) 장부의 한 줄 요약은 `ECON_CURS`의 id로(앞서), 사람이 읽는 보고 도구는 이 게임의 것이라 `games/deungbul/scripts/econ.ts`로 옮겼다(`npm run econ` 그대로). 지갑의 세 칸(골드·두 번째 재화·경험치)을 장부가 따라가는 것은 지갑과 같은 약속이라 둔다(계획 7절). (14) 습격 몹을 중립 이름으로: `Ent.raid` → `Ent.swarm`(몰려온 적), `monsters.atTower` → `atSiege`, `TOWER_ATTACK_RANGE` → `SIEGE_REACH`, 문장 키 `fmt.raidFoe` → `fmt.swarmFoe`, 이름표 클래스 `raid` → `swarm`. 줄 위의 칸 이름(`EnterInfo.r`)은 그대로라 열려 있던 화면도 그대로 돈다. 경계 검사에 남겨 두었던 예외 `raidFoe`, `raid`가 없어졌다 |

## 1. 단계별 상태

| # | 무엇 | 상태 | 합친 커밋 |
|---|---|---|---|
| 0 | 안전망: 맵 지문, 저장 왕복 견본, 프로토콜 번호 | 끝 | `792067b` |
| 1 | 서버의 직접 결합 풀기: 규칙 플러그인(`installDeungbul`), `Channels.extraFoes`, `worldSaves`의 `legacy` | 끝 | `792067b` |
| 2 | 확장 지점: 두 `ext.ts`와 게임의 선언 병합 | 끝 | `f25e0b4` |
| 3 | 게임의 저장 칸을 저장 등록(`g.saves`, `PlayerSave.ext`)으로 **[저장]** | 끝. 옛 칸에 함께 쓰던 호환은 2026-11-24에 지웠다(읽는 길 `Saver.legacy`는 남았다) | `e99dd58` |
| 4 | 개인 상태 통로(`g.personal`, `me` 메시지) **[프로토콜]** | 끝. 옛 메시지를 함께 보내던 호환은 2026-11-24에 지웠다(`PROTOCOL` 2) | `ad69a00` |
| 5 | 내용 계약(`MapDef`, `FORGES`, `needs: string`, `contract.ts`) | 끝 | `6f468f0` |
| 6a | 클라이언트의 규칙 객체(`rules`), `addNpc`, `onKey` | 끝 | `d5eae30` |
| 6b | 화면 창 가르기(`hud/me.ts`와 게임의 창), 게임의 진입점 | 끝 | `751684d` |
| 7a | 장면의 겉모습을 게임이 넘긴다(`look`, `setMood`, 모델 등록) | 끝 | `8c8daaf` |
| 7b | 게임의 창은 게임이 붙인다(`mountPanel`, `deungbul.css`) | 끝. 뼈대는 11단계에서 올렸다 | `1049bf3` |
| 8 | 언어 파일을 틀의 문장과 게임의 문장으로(`mergeLocale`) | 끝 | `a67c46e` |
| 9 | **폴더 이동**: `engine/`, `games/deungbul/`, 별칭, 내용 파일 가르기, 틀만 타입 검사 0 | 끝 | `feat/fw9` |
| 10 | 시험 가르기, `new Game()`의 기본값을 틀만으로 | 끝 | `7c96900` |
| 11 | 예제 게임 `games/sample`과 `docs/making-a-game.md`, 뼈대 올리기, 예제의 내용으로 드러난 틀의 수리 | 끝 | `feat/fw11` |
| 12 | 공개 표면(입구 넷 + 언어, 깊은 import 금지) | 끝 (2026-11-24) | |
| 13 | 틀의 시험을 등불지기의 내용에서 떼기 | 끝 (2026-11-25, 묶음 F) | |

### 9단계에서 한 것 (기록: 그때의 사실이다. 뒤에 바뀐 것은 괄호에 적었다)

1. `git mv`로 모든 파일을 `engine/`과 `games/deungbul/`로 옮기고 import 경로와 설정을 고쳤다(내용 변화 없음: 빌드된 js·css가 바이트까지 같았다).
2. 내용 파일을 갈랐다: 모양과 도우미는 `engine/shared/defs/*.ts`, 표와 수치는 `games/deungbul/shared/content/*.ts`. 통로를 둘로 나눴다(아래 2절).
3. 틀이 계약 밖의 이름을 읽던 세 곳을 고쳤다: 대장간 창(`SMITH`·`SMITHY` → `FORGES`의 첫 대장간), 땅의 범위(`MIN_X` 등 → `MAP.areas[0]`), '마을로'의 안내문(`goingTown`: 틀에 기본 문장을 두고 게임이 덮어쓴다). 화면에 보이는 것은 그대로다.
4. 틀만 타입 검사하는 방식을 바꿨다: 게임 파일을 뺀 사본을 만드는 스크립트(`scripts/typecheck-engine.mjs`)를 없애고 `tsc -p tsconfig.engine.json`(`engine/`의 소스만 include)으로. 오류 8 → 0. `npm run typecheck`와 `npm test`가 함께 돌린다.
5. 의존 방향 검사를 폴더 기준으로 바꿨다(그때의 `engine/test/framework.test.ts`. 지금은 `engine/test/boundary.test.ts`와 `games/deungbul/test/split.test.ts`).

계획서와 다르게 한 것:

- 게임의 내용을 `games/deungbul/content/`가 아니라 `games/deungbul/shared/content/`에 두었다(옮기기 전의 `shared/content/`와 같은 모양이라 이력이 이어진다).
- `test/all.ts`는 뿌리에 남겼다: 틀의 시험과 게임마다의 시험을 함께 돌리는 저장소의 도구다(`npx tsx test/all.ts fx/growth deungbul/quests`). 게임의 시험 목록은 그 게임의 `test/all.ts`에 있고, 뿌리의 도구는 `games/` 아래를 둘러보아 찾는다.
- 수치의 기본값 묶음(`engine/shared/defaults.ts`)은 만들지 않았다. (11단계에서 만들었다.)
- 게임별 `tsconfig.json`은 두지 않았다. (예제는 11단계에서, 등불지기는 2026-11-25에 자기 것을 가졌다. 4절.)
- 화면의 뼈대는 올리지 않았다. (11단계에서 `engine/client/hud/skeleton.ts`로 올렸다.)
- 틀의 시험은 `tsconfig.engine.json`에 넣지 않았다: 아직 등불지기의 좌표와 id를 쓴다. (13단계에서 시험용 내용으로 옮겼고, 자기 설정 `engine/test/fx/tsconfig.json`으로 검사한다.)

### 11단계에서 한 것 (기록)

1. **예제 게임** `games/sample`("모닥불 사냥터"): 직업 둘, 몬스터 셋, 아이템 다섯, 지역 하나, 상인 하나, 이 게임만의 규칙 하나(모닥불). 던전·대장간·보스·두 번째 재화가 없다. 한국어와 영어. 자기 `tsconfig.json`(별칭 `@game` → `games/sample`)과 `vite.config.ts`, 시험(`npm run test:sample`)을 갖는다.
2. **문서** `docs/making-a-game.md`: 새 게임을 만드는 차례. 코드 조각은 예제에서 따왔고 `games/sample/test/docs.test.ts`가 일치를 검사한다.
3. **뼈대를 틀로 올렸다**: 틀의 창 마크업은 `engine/client/hud/skeleton.ts`에 있고 `hud/shell.ts`의 `mountShell`이 붙인다. 게임의 `index.html`은 머리와 script만 남았다. `shell.ts`는 읽히는 때에 뼈대를 붙이고, 요소를 잡는 길(`$`)이 있는 `app.ts`가 `shell.ts`를 맨 먼저 import한다: 어느 파일이 읽히는 때에 요소를 잡아도 그때는 뼈대가 있다. 붙인 뒤의 문서와 계산된 스타일은 전과 같다(여섯 화면 구성에서 다른 값 0). 스크립트가 돌기 전의 화면은 접속 화면과 같은 어둑한 바탕이다(`style.css`의 `body:not(:has(#gate))::before`).
4. **틀만 타입 검사를 예제의 내용으로도 돌린다**(그때의 `npm run typecheck:engine:sample`, 지금은 `npm run typecheck -- sample`의 한 설정: `games/sample/tsconfig.engine.json`). 여기서 드러나 고친 것:
   - 던전이 없으면(`DUNGEONS = {}`) `DungeonId`가 `never`가 되어 틀의 던전 창·자동 사냥·문장·서버가 컴파일되지 않았다 → 표를 문자열 id로 읽는 `DUNGEON_TABLE`·`dungeonDef(id: string)`(`engine/shared/defs/dungeons.ts`)과 이름표를 읽는 `dungeonLabel`(`engine/client/i18n/names.ts`).
   - 상점 창이 아이템 id `potion`의 이름을 읽었다(`hud/shop.ts`의 물약 단추) → 가장 순한 물약의 이름(`POTIONS`의 끝), 물약이 없으면 `ui.bagPotions`.
   - `GEAR.armorFor(lv)`: 게임이 인자 없는 함수로 적으면 틀의 호출이 컴파일되지 않았다 → 계약의 모양으로 부른다(`systems/gear.ts`).
   - 예제보다 더 비운 내용(`games/sample/test/empty.test.ts`가 변형을 만들어 검사한다): 일일 임무가 없으면(`DAILIES = {}`) `DAILIES[id]`가, 아이템의 종류가 한 가지뿐이면 `ITEMS[id].kind === 'potion'` 같은 비교가 컴파일되지 않았다 → 넓은 모양으로 읽는 `dailyDef(id)`, `itemDef(id).kind`로 바꿨다(`hud/bag.ts`, `hud/menu.ts`, `hud/shop.ts`, `shared/auto.ts`, `systems/daily.ts`, `systems/mail.ts`, `systems/market.ts`, `systems/players.ts`: 식은 그대로이고 읽는 길만 바꿨다). 몬스터가 하나도 없는 내용(`MONSTERS = {}`)은 지금도 컴파일되지 않는다.
5. 그 밖에 예제가 걸려서 고친 것:
   - `inDungeon()`이 지역 id `'field'`를 읽었다 → 0번 지역인가로 본다(`engine/client/state.ts`).
   - 두 번째 재화를 쓰지 않는 게임: 이름표의 `currency2`를 선택 칸으로 하고, 없으면 틀의 문장(처치, 우편, 자리 비움, 보상 글)에서 그 몫을 뺀다. 이름표 없이 띄웠을 때의 기본 이름표(`idNames`)에서도 뺐다.
   - 사람 모델의 허리춤 등불을 게임의 꾸밈으로 옮겼다(`setHumanoidDeco`, 등불지기는 `games/deungbul/client/scene/models.ts`가 등록한다). 모습은 그대로다.
   - 개발 서버의 화면이 붙는 포트(3001)를 게임의 vite 설정이 정하게 했다(`VITE_DEV_PORT`). 정하지 않으면 3001이다.
6. 새로 생긴 틀의 파일: `engine/shared/defaults.ts`(수치의 기본값 묶음: 계약의 이름 61개 가운데 게임의 id가 들지 않는 것. 등불지기는 쓰지 않는다), `engine/server/run.ts`(`runServer`: 등불지기의 `server/main.ts`가 하는 절차를 옮겨 적은 것. 2026-11-25부터 등불지기도 이것을 쓴다), `engine/client/hud/skeleton.ts`.
7. `npm run typecheck`가 넷을 차례로 돌린다: 전체, 틀만, 틀만(예제의 내용), 예제. 틀이나 계약을 고치면 예제도 함께 고쳐야 통과한다. (지금은 여섯: 등불지기의 설정과 시험용 내용이 더해졌다.)

등불지기의 플레이, 저장 형식, 프로토콜은 바뀌지 않았다.

## 2. 지금의 접점

### 폴더와 별칭

| | 틀 | 이 게임 |
|---|---|---|
| 서버 | `engine/server/` (`net/`, `store/`, `game/game.ts`, `game/systems/`, `text.ts`) | `games/deungbul/server/` (`main.ts`, `deungbul.ts`, `systems/{tower,raid,keepers,quests,rest}.ts`) |
| 공용 | `engine/shared/` (`ext, protocol, messages, sim, nav, world, auto, contract, defs.ts, defs/`) | `games/deungbul/shared/` (`deungbul.ts` 선언, `content/`, `defs.ts`·`world.ts` 통로) |
| 화면 | `engine/client/` (`main.ts`의 `startClient`, `hud/`(뼈대 `skeleton.ts` 포함), `scene/`, `i18n/`, `style.css`) | `games/deungbul/client/` (`index.html`, `main.ts`, `hud/`, `scene/`, `i18n/`, `guide/`, `public/`) |
| 시험 | `engine/test/` | `games/deungbul/test/` (`fixtures/`, `load.ts` 포함) |

- 별칭: `@engine/*` → `engine/*`, `@game/*` → 그 게임의 폴더. 게임마다 자기 `tsconfig.json`(`games/deungbul/`, `games/sample/`)이 있고, 틀의 시험은 `engine/test/fx/tsconfig.json`(시험용 내용)이다. 뿌리의 `tsconfig.json`은 편집기와 `scripts/`·`test/`를 위해 등불지기를 가리킨다.
  - `tsc`: `tsconfig.json`의 `paths` (예제: `games/sample/tsconfig.json`).
  - `tsx`(서버 실행, 시험, `games/deungbul/scripts/econ.ts`): `scripts/game.mjs`가 그 게임의 `tsconfig.json`을 `--tsconfig`로 준다(`npm start`, `npm run test:game` 등). 저장소 뿌리에서 돈다. 직접 부를 때 `--tsconfig`를 빼면 뿌리의 설정을 읽어 **등불지기의 내용으로 오류 없이 뜬다**(예제는 플러그인 파일의 맨 위에서 이것을 잡아 던지고, 틀의 시험 도구는 첫 줄에서 별칭을 확인한다).
  - `vite`: 게임 폴더의 `vite.config.ts`의 `resolve.alias` (`games/deungbul/vite.config.ts`, `games/sample/vite.config.ts`). 어느 것을 쓸지는 `scripts/game.mjs`가 고른다.
- 별칭은 폴더를 넘을 때만 쓴다. 같은 폴더 안은 상대 경로다.
- 뿌리에 남은 것: `test/all.ts`(시험을 돌리는 도구), `scripts/`(`game.mjs` 게임 고르기, 배포 스크립트), `docs/`, `tsconfig*.json`, `package.json`, 그리고 git에 넣지 않는 `data/`(저장)와 `dist/`·`dist-sample/`(빌드).

### 서버

| 접점 | 틀 쪽 | 이 게임이 채우는 곳 |
|---|---|---|
| 규칙 플러그인 | `GameOptions.plugins: ((g) => void)[]`. `new Game()`의 기본값은 틀만 | `server/deungbul.ts`의 `installDeungbul(g, { raid })`. 서버는 `server/main.ts`, 시험은 `test/game.ts`가 넘긴다 |
| 시스템 칸 | `engine/server/game/ext.ts`의 `GameSystems` | `server/deungbul.ts`의 선언 병합 (`g.tower`, `g.raid`, `g.keepers`, `g.quests`, `g.rest`) |
| 엔티티 칸 | 핵심 `Ent`(`entity.ts`), 모듈의 몫 `EntParts`(`parts.ts`, 고른 모듈의 것만 만든다), 게임의 칸 `EntExt`와 `g.entInit` | 규칙 시스템들 (`contrib`, `tier`, `rested`, `qc/qs/qn` 등). 등불지기는 모듈을 다 고르므로 모듈의 칸도 다 있다 |
| 사건 | `HooksExt`, `g.on`·`g.fire` | `offered`, `residentReturned`, `raidWon` |
| 기본 규칙 | `g.rules` (`respawn, speed, canChangeClass, unlocked, siege, touched?`)와 `RulesExt` | 등탑과 습격 시스템 |
| 수치 보정 | `g.mods`와 `ModsExt` | 등탑의 회복·속도, `sparkBonus` |
| 등록 통로 | `g.commands, g.ticks, g.saves, g.worldSaves, g.shared, g.personal, g.out, g.notify, g.announce, g.killBonus, g.ready` | 규칙 시스템의 생성자 |
| 틀의 시스템이 묻는 선택 접점 | `Channels.extraFoes`·`busy`, `worldSaves[].legacy`, `Saver.legacy`·`legacySave` | `raid.ts`, `tower.ts`, 저장을 맡은 시스템들 |
| 기술 효과 | `g.combat.cast(p, id, target)`, `tickEffects`, `Ent.buffs`·`dots`·`stunUntil`. 강화는 `g.mods`의 보정으로 들어간다 | 기술 표(`SKILL_DEFS`)만 |
| 금칙어 | `addBannedWords`(`@engine/server`) | (쓰지 않는다) |
| 실행 | `startServer(port, { bots, store, game, staticDir })`, 그 절차를 묶은 `runServer({ port, db, dist, plugins })`(`engine/server/run.ts`) | `server/main.ts`: `runServer`에 규칙 플러그인(습격 간격은 `RAID_EVERY_MIN`을 읽어 넘긴다)과 폴더를 넘긴다. 예제도 같다 |

### 공용

| 접점 | 틀 쪽 | 이 게임이 채우는 곳 |
|---|---|---|
| 내용 계약 | `engine/shared/contract.ts`: 핵심 계약 `CoreContent`(MAP, MODULES)와 모듈마다의 선택 계약(`CoreTuning`, `CombatContent` …: 모두 88개 이름, 2026-11-27. `games/deungbul/test/split.test.ts`가 센다). 틀은 `content.ts` 한 곳에서 읽고 적지 않은 이름은 `defaults.ts`로 채운다 | `shared/content/index.ts`가 그 이름들을 내보낸다(등불지기는 모두 적는다) |
| 내용의 모양과 도우미 | `engine/shared/defs/*.ts` | 게임의 내용 파일이 타입만 가져온다 |
| 수치의 기본값 | `engine/shared/defaults.ts` (아무것도 import하지 않는 값 파일). 틀이 게임이 적지 않은 이름을 이것으로 채운다 | 받지 않아도 된다. `GEAR_BASE` 같은 조각만 가져다 쓴다. 등불지기는 자기 값을 모두 적는다 |
| 틀의 내용 통로 | `engine/shared/defs.ts`: 틀의 타입·도우미 + 계약의 이름만 `@game/shared/content`에서 다시 내보낸다 | |
| 게임의 내용 통로 | | `shared/defs.ts`, `shared/world.ts`: 틀의 통로 + 이 게임에만 있는 내용. 게임의 파일은 여기서 읽는다 |
| 안내문·메시지·공유 상태 | `engine/shared/ext.ts`의 `MsgMap, ServerMsgs, ClientMsgs, WorldState` | `shared/deungbul.ts`의 선언 병합. 개인 상태의 모양 `MeState`도 여기 있다 |
| 맵 | `MapDef`, `buildWorld`가 `MAP`만 읽는다 | `shared/content/map.ts`의 `MAP`. 등탑·연못·빈터·길·구역은 게임만 읽는다 |
| 잠금 | `ItemDef.needs`, `ForgeDef.needs`: 뜻 없는 열쇠 | 주민 id (`satisfies ResidentId`) |

틀의 소스에서 `@game`을 import하는 파일은 둘이다: `engine/shared/content.ts`(내용을 꺼내 기본값을 채운다), `engine/shared/contract.ts`(컴파일할 때의 검사). 그 밖의 틀 파일은 `defs`와 `world`를 거친다.

### 화면

| 접점 | 틀 쪽 | 이 게임이 채우는 곳 |
|---|---|---|
| 진입 | `engine/client/main.ts`의 `startClient({ look, modules })` | `client/main.ts` (그 전에 `mountMarkup()`) |
| 화면 규칙 | `engine/client/rules.ts`의 `rules` (`speed, unlocked, lockNote, lockHint, home`) | `client/deungbul.ts`의 `initDeungbul` |
| 끼어드는 자리 | `bus.onMsg, onFrame, onSlow, onKey`, `onLangChange` | 게임의 모듈들 (init 안에서 등록) |
| 겉모습 | `Look`의 `ground, leaf, scenery`, `view.setMood`, `registerMonsterModel`·`registerBlade`·`registerArmor`, `registerHand`·`registerShot`, `setHumanoidDeco`·`setHumanoidBody`, `addNpc`, `setMerchant`, `addPlace`. 모델·소리 파일(`registerMonsterAsset`·`registerHumanoidAsset`·`registerWeaponAsset`, `registerSound`·`registerMusic`·`setMusicPicker`): 이 게임은 쓰지 않는다 | `client/scene/*`, `client/deungbul.ts`, `client/hud/tower.ts` |
| 지도 | `setMapPaint`, `addMarks`(미니맵과 전체 지도), `addMapLabels`, `addMapPlaces`, `travelTo` | `client/scene/paint.ts`, `client/hud/marks.ts` |
| 메뉴 | `setMenuTabs`, `addMenuTab`, `openMenu` | (틀의 탭을 그대로 쓴다: 고른 모듈의 일곱 탭과 늘 보이는 '기기'·'설정') |
| 창 | `engine/client/hud/shell.ts`의 `mountPanel(자리, html)`과 `SLOTS` | `client/markup.ts`, `client/deungbul.css` |
| 문장 | `koBase(names)`·`enBase(names)`, `mergeLocale`, `setLocales`, `LocaleExt`, `addNotices`, `addMsgSounds`. 이름표(`ContentNames`)의 `currency1`(없으면 골드)·`currency2`는 선택 칸 | `client/i18n/*`, `client/words.ts` |
| 상태 | `S` (틀의 칸만) | `client/state.ts`의 `GS`(공유), `G`(개인) |
| 뼈대 | `engine/client/hud/skeleton.ts`(마크업), `hud/shell.ts`의 `mountShell`(읽히는 때에 붙인다) | `client/index.html`의 머리와 script. body에는 script만 둔다 |
| 스타일 | `engine/client/style.css` (틀의 진입 모듈이 읽는다) | `client/deungbul.css` (틀의 것 뒤에 읽혀 덮어쓴다) |
| 빌드 | 개발 서버의 화면이 붙을 포트는 `VITE_DEV_PORT`(없으면 3001) | `games/deungbul/vite.config.ts`(`scripts/game.mjs`가 고른다): 뿌리 `games/deungbul/client`, 결과 `dist/`. 도감은 게임 빌드 뒤에 따로. 예제는 `games/sample/vite.config.ts`: 결과 `dist-sample/` |

### 시험

| | 틀 | 이 게임 |
|---|---|---|
| 자리 | `engine/test/boundary.test.ts`, `engine/test/fx/`(시험용 내용과 `all.ts`), `harness.ts` | `games/deungbul/test/이름.test.ts`, `all.ts`(목록), `game.ts`, `peer.ts`, `locale-snapshot.ts`, `fixtures/`. 예제는 `games/sample/test/`(`sample.test.ts`, `empty.test.ts`, `morph.test.ts`, `ops.test.ts`, `docs.test.ts`, `all.ts`). 게임의 시험은 그 게임의 `tsconfig.json`으로 따로 된 프로세스에서 돈다 |
| 게임 만들기 | `new Game()`, `startServer()` | `newGame()`, `startDeungbul()` |
| 명령 | `npm run test:engine`, 이름 앞에 `fx/` | `npm run test:game [-- 이름]`(`GAME`, 기본 등불지기), `npm run test:sample`, `test/all.ts`에서는 이름 앞에 `<게임>/` |
| 지키는 것 | 시험용 내용(`engine/test/fx/shared/content`) 위에서 돈다. 실행이 끝나면 `games/` 아래의 파일이 하나도 로드되지 않았는지 확인한다(`fx/틀만`) | |

방향을 지키는 검사:

- `engine/test/boundary.test.ts`(모든 게임에 맞는 규칙): 틀의 소스에 게임의 내용 id나 게임의 낱말이 문자열로 없는가, 타입 검사를 피하는 캐스팅이 늘지 않았는가, 층을 넘는 import(화면 → 서버 등)가 없는가, 게임이 틀을 입구로만 읽는가, 틀이 내용 통로 말고는 게임을 읽지 않는가.
- `games/deungbul/test/split.test.ts`(등불지기와 틀의 경계): 폴더·import의 방향, 확장 지점과 선언 병합, 틀의 언어·알림·소리 파일의 낱말, 화면 파일이 가져오는 이름, 뼈대와 스타일.
- `games/deungbul/test/baseline.test.ts`: 가르기 전과 같은가(맵 지문, 옮긴 수치, 저장 견본).
- 예제의 폴더는 예제의 시험(`games/sample/test/`)이 본다. `docs.test.ts`는 문서의 코드 조각이 예제의 파일과 같은지 본다.

## 3. 남은 일

틀 쪽에 남은 작은 일들. 급하지 않고, 실제로 걸릴 때 고친다. 새 게임을 만드는 차례와 자주 걸리는 곳은 [making-a-game.md](making-a-game.md)에 있다.

- **틀이나 계약을 고치면 예제도 함께 고친다.** `npm run typecheck`가 예제까지 검사하므로, 계약에 이름을 더하면 `engine/shared/defaults.ts`에 기본값을 두거나 `games/sample/shared/content/index.ts`에 그 이름을 더해야 통과한다. 문서의 코드 조각을 바꾸면 예제의 파일도 같게.
- **등불지기의 내용**도 `defaults.ts`를 받게 할 수 있다(같은 값이 두 곳에 있다). 값이 갈리기 전에 정하는 편이 낫다.
- **`vite`의 뿌리 밖 파일**: 틀의 코드가 뿌리(`games/<게임>/client`) 밖에 있어 `server.fs.allow`에 저장소 뿌리를 넣어야 하고, `index.html`의 `<link>`로는 뿌리 밖의 css를 개발 서버가 내주지 못한다(그래서 틀의 스타일은 틀의 진입 모듈이 import한다).
- **자동 이동은 지역 안에서만**: 들판에서 던전 안으로 곧장 가지 못하고 던전의 문까지 간다. 지역을 넘는 길(문을 지나 들어가기)은 아직 없다.
- **지도에 보이는 몬스터와 사람**은 서버가 보내 주는 내 둘레(시야 `AOI`)의 것뿐이다. 먼 곳은 사냥터 표식으로 대신한다.
- **강화를 쓰는 직업이 아직 없다**: 효과는 시험(`fx/skills`)으로 지키지만, 내 정보 창의 강화 표시는 실제 게임 화면에서 본 적이 없다.
- **에셋 불러오기의 한계(2026-11-26)**: 파일의 사람의 갑옷은 칠하기(`armor.tint`)와 틀의 덧대기를 뼈에 붙이기(`armor.attach`)뿐이다(갑옷마다 모델 파일을 바꿔 끼우는 접점은 없다). 내 캐릭터가 쓰러질 때는 쓰러짐 클립을 틀지 않는다(틀이 내 캐릭터의 쓰러짐 사건을 따로 그리지 않는다). 무기 모델은 손 모양이 돌려준 부분 하나만 바꾼다(도끼 자루, 화살통은 코드 모양). Draco·KTX2 압축 파일, 소리 형식 고르기(브라우저마다 ogg/mp3)는 없다. 틀의 서버는 소리·모델 파일에 형식을 붙인다(2026-11-26 `feat/stage3`부터. 그 전에는 `application/octet-stream`이었다). 효과음 파일은 풀어서 메모리에 둔다(짧은 것을 권한다). 모델이 바뀌는 순간(파일이 접속 뒤에 읽히면)은 코드 모델에서 툭 바뀐다.

### 틀에 남은 이 게임의 색

컴파일은 되지만 다른 게임에서는 어색할 수 있는 것들.

| 무엇 | 어디 | 메모 |
|---|---|---|
| 두 번째 재화 `sparks` | `Ent.sparks`, `PlayerSave`, `stat` 메시지, `MonsterDef.sparks`, `Reward.sparks`, `players.grant(p, exp, sparks)` | 계획서 7절: 일반화하지 않는다. 틀의 "두 번째 재화 한 가지"로 두고, 이름은 게임의 이름표(`currency2`)가 준다. 쓰지 않는 게임은 이름표에 적지 않으면 틀의 문장에서 빠진다 |
| 보정 이름 `sparkBonus` | `g.mods` | 이름만 |
| 장면의 하늘빛 | `engine/client/scene/view.ts`의 `SKY`(하늘과 안개의 처음 색) | css의 `--sky`는 문서의 바탕색일 뿐이고 장면의 하늘은 `view.setMood`로 바꾼다. 둘이 따로다 |
| 뼈대가 쓰는데 틀에 기본 문장이 없는 키 | `ui.intro`, `ui.classHint`, `ui.mapLegend` | 게임이 주지 않으면 빈 채로 뜬다(컴파일은 된다) |
| 개발 서버의 기본 포트 | `engine/client/platform/web.ts`의 `server()` | `VITE_DEV_PORT`가 없으면 3001(등불지기의 포트)이다 |
| css에 박힌 색 | `engine/client/style.css` | 창의 바탕(`--ink-rgb`), 덮는 막, 금빛 단추 위 글자, 좋음·나쁨·파티원의 색은 변수가 됐다(2026-11-25. 예제는 갈색 바탕). 남은 것: 장비 등급의 색과 몇몇 옅은 색(그림자의 검정 등)은 변수가 아니다 |
| '마을로' | `actions.ts`의 `goToTown`, `input.ts`의 H 키, 문장 키 `goingTown` | 틀의 문장 키 이름이 '마을'을 말한다(문장은 게임이 덮어쓴다). 목적지는 `rules.home`(없으면 `MAP.spawn`) |
| 일일 임무의 종류 | `DailyKind`는 문자열이지만 주석이 이 게임의 `'offer'`를 든다 | 주석만 |
| 채널의 '바쁜 때' | `CHANNEL.tellBusyS`, `Channels.busy`, `channels` 메시지의 `foes` 칸 | 습격에서 온 개념이 중립 이름으로 남았다 |
| 틀의 문장 속 낱말 | `engine/client/i18n/ko.ts`·`en.ts` | 낱말 검사가 등불지기의 낱말을 막지만, 상점·대장간·물약·길드·거래소 같은 낱말은 틀의 것으로 남아 있다. 게임이 같은 키로 덮어쓴다 |
| 레벨과 우편 보상의 읽기 상한 | `players.ts`의 `LV_READ_MAX`(999), `mail.ts`의 `REWARD_MAX`(1e7) | 깨진 저장을 막는 틀의 상수. 넘는 게임이 나오면 올린다 |

## 4. 설정 파일

- `tsconfig.json`(뿌리): 편집기와 `scripts/`·`test/`를 위한 기본. `@game`은 등불지기, `include: ["engine", "games/deungbul", "test", "scripts"]`, `exclude: ["engine/test/fx"]`. 게임의 선언 파일(`games/deungbul/shared/deungbul.ts`)은 아무도 import하지 않고 `include`로 컴파일에 들어간다.
- `games/deungbul/tsconfig.json`, `games/sample/tsconfig.json`: 게임마다. 뿌리의 설정을 물려받아 `@game`만 자기 폴더로 바꾸고 `include`는 틀의 소스와 자기 폴더다. 서버·시험·도구는 이것으로 돈다(`scripts/game.mjs`가 고른다). `games/sample/tsconfig.engine.json`은 `include`를 틀의 소스로 줄인 것(틀만을 예제의 내용으로).
- `engine/test/fx/tsconfig.json`: 틀의 시험. `@game` → 시험용 내용. `include`는 틀의 소스, `harness.ts`, 그 폴더.
- `tsconfig.engine.json`: 틀만(`engine/shared`, `engine/server`, `engine/client`). `@game`은 등불지기의 내용.
- `engine/test/collect/tsconfig.json`: 수집형 모듈의 시험. `@game` → 수집형 본보기 내용(영웅 들판). 화면(`vite.config.ts` → `dist-collect/`)과 실행 서버도 있다.
- `engine/test/core/tsconfig.json`: 핵심만의 시험. `@game` → 최소 내용(공 마당: 모듈 0). 그 폴더에 화면(`client/`, `vite.config.ts` → `dist-core/`)과 실행 서버(`server/main.ts`)도 있다(눈으로 보는 용도).
- `games/<게임>/vite.config.ts`: `root`는 그 게임의 `client`, 결과는 등불지기 `dist/`, 예제 `dist-sample/`. 등불지기의 도감은 게임 빌드가 끝난 뒤 같은 `dist/`에 따로 빌드한다.
- `package.json`: 서버·화면·시험의 스크립트는 `scripts/game.mjs <start|watch|client|build|test|list> [게임]`을 부른다(인자, 없으면 `GAME`, 없으면 `deungbul`). 게임의 목록은 `scripts/deploy.mjs`의 `listGames`가 폴더에서 찾는다. `typecheck`는 `scripts/typecheck.mjs`(틀의 설정 다섯 + 게임마다 `tsconfig.json`·`tsconfig.engine.json`, 넷씩 함께. 인자로 `engine`이나 게임 이름을 주면 그것만: `npm run typecheck -- sample`), `build:all`은 모든 게임을 빌드한다. 예제: `test:sample, build:sample, start:sample, dev:sample`(포트 3002, 저장 `data/sample/game.db`).

## 5. 운영 서버에 올릴 때

**장르 중립 틀(프로토콜 3)을 처음 올릴 때**: 서버와 화면을 함께 올린다(`npm run build:all` 또는 게임마다 build). 화면을 먼저 받은 사람이 옛 서버에 붙거나 그 반대면 접속 화면에서 새로고침을 안내받는다(프로토콜 2 ↔ 3). 저장 형식은 그대로다: 등불지기는 버전 칸(v1)이 그대로이고, 모듈을 뺀 게임(모닥불 사냥터 3002, 그때의 시제품 별가루 광산 3004·돌담 마을 3005: 둘은 2026-11-27에 지웠다)은 거래소·길드·던전의 저장 칸을 읽은 그대로 남긴다(지우지 않는다: 다시 켜면 이어진다). 다만 그 게임들의 화면에서 거래소·길드 탭이 사라지고, 거래소에 올려 둔 물건은 모듈을 다시 켜기 전에는 찾을 수 없다.

1. `npm run typecheck`, `npm test`(두 번), `npm run test:engine`, `npm run build`가 모두 통과한 뒤에 커밋한다.
2. 화면이 바뀌었으면 확인용 서버(`PORT=3013 DB=<임시 폴더>/check.db npm start`)를 띄워 PC·폰, 한국어·영어로 본다. 운영 서버(3001)에는 시험 캐릭터를 만들지 않는다(확인은 손님으로만).
3. 서버를 다시 켜면 관리자 토큰 파일(`admin.token`, 저장 파일 옆)이 새로 생긴다. 관리자 명령은 `npm run admin -- [게임] <명령>`(making-a-game.md 9절). `engine/server/index.ts`의 `runServer`는 `run.ts`를 감싸 저장 폴더를 관리자 통로에 알린다: `run.ts`가 `startServer`에 `admin: { dir }`을 직접 넘기게 되면 그 감싸기를 없앤다.
4. 서버 코드가 바뀌었으면 `data/game.db`를 `data/backup/`에 복사하고(사람이 만든 백업은 `game.db.<시각>`처럼 `auto-`로 시작하지 않는 이름으로: 자동 백업의 정리가 건드리지 않는다) `node scripts/restart.mjs`(저장하고 끈 뒤 감시자 아래에서 다시 띄운다. 터널은 끊지 않는다. `/healthz`가 `ticking:true`가 될 때까지 20초를 기다려 찍는다. 예전 방식은 `bash scripts/restart.sh <로그>`). 로그에서 저장 파일의 경로, `[backup]` 줄, '자리 비움 사냥을 이어 갑니다'(그때 사냥 중이던 사람이 있으면)를 보고, `curl localhost:3001/healthz`가 `"ok":true`인지 본다.
5. 화면은 `bash scripts/publish.sh`. 공개 주소 둘이 200인지 본다.
6. 서버를 끄는 깃발 `stop.flag`는 **저장 파일의 옆**에 놓인다. 확인용 서버는 DB마다 폴더를 따로 주거나 `DB=memory`로 띄우고 프로세스를 포트로 찾아 직접 끈다(운영의 3001은 건드리지 않는다).
7. 되돌리기: `git revert` 뒤 `npm run build`와 `node scripts/restart.mjs`(또는 `bash scripts/restart.sh`). 저장 형식 버전(2026-11-26)을 들인 뒤의 저장에는 `v` 칸이 붙지만 모양은 그대로라 옛 서버도 그대로 읽는다(모르는 칸은 무시). 저장 파일로 되돌리려면 서버를 끄고 `data/backup/`의 백업(자동 백업은 `auto-<시각>.db`)을 `data/game.db`로 복사하고 `game.db-wal`·`game.db-shm`을 지운다.

## 캐릭터 정의와 변신 (2026-11-27, 가지 `feat/chardef`)

[ideas.md](ideas.md) 3절 'AI로 만드는 캐릭터'의 틀 쪽 바탕. AI 호출·계정·거래·주간 한도는 하지 않았다: 틀은 정해진 형식의 정의를 믿지 않고 검증하고, 부품으로 그리고, 영웅과 변신이 함께 읽게 한다. 쓰는 법은 [making-a-game.md](making-a-game.md) 15절.

| 무엇 | 틀의 칸 | 선택인가 |
|---|---|---|
| 겉모습의 형식 | `engine/shared/defs/look.ts`: `Look`(칸 여섯 `body` `head` `hair` `hat` `face` `back`, 색 넷 `skin` `cloth` `hair` `accent`, `pattern`, `size`·`width`), 버전이 있는 짧은 글자 `encodeLook`/`decodeLook`(예 `'1;b=stout;r=bob;C=3f7fbf;z=105'`, 기본값은 적지 않는다), `checkLook`, `lookParts`·`lookPatterns`. 내용 `LOOK_RULES`(add·remove·off·patterns·size·width) | 겉모습을 적지 않은 사람형은 예전 그림 그대로 |
| 부품 그리기 | `engine/client/scene/look.ts`: 틀의 기본 부품 34가지(체형 4, 머리 4, 머리카락 7, 모자 8, 얼굴 5, 등 6)와 무늬 5. `registerLookBody`·`registerLookHead`·`registerLookPart`·`registerLookPattern`·`lookGeo`. `HumanoidLook.look`, `makeHumanoid`의 여섯째 인자, `Model.frame`(크기 배율과 갑옷 덧대기). 움직이지 않는 부품은 꼭짓점 색의 한 메시로 굽는다 | 같음 |
| 사람의 겉모습을 남에게 | 핵심: `g.setLook(e, 글자)`, 메시지 `{ t: 'look', id, l }`, `EnterInfo.l`, 화면 `setLookOf`. 저장하지 않는다 | 부르지 않으면 줄 위의 글자가 그대로 |
| 캐릭터 정의와 검증기 | `engine/shared/defs/chardef.ts`: `CharDef`(v, id, name, bio, look, role, rarity, stats, skills), `validateCharDef`(거절 코드 26가지 `CHAR_ERRS`와 자리·값, 예외 없음), `budgetFromHeroes`, `addCharFilter`·`CHAR_RULES.banned`, `charHero`, `setKnownChars`·`charName`. 내용 `CHAR_RULES`. 문장 `fmt.charErr`, 안내문 `charBad` | 함수일 뿐이다 |
| 정의를 두기 | 스물넷째 모듈 **`chars`**(`systems/chars.ts`): `g.chars.add`(유일한 길)·`remove`·`get`·`list`·`useStore`(바꿔 끼우는 저장소 `CharStore`), 월드 저장 `chars`, 개인 상태 `chars`, 사건 `charAdded`·`charRemoved`. `roster`와 함께면 영웅의 표에 더한다(`addHeroDef`·`dropHeroDef`·`heroIds()`, `HeroDef.label`·`look`·`skill`) | 모듈 (의존 없음, `RPG_MODULES`에 들지 않는다) |
| 변신 | 스물다섯째 모듈 **`morph`**(`systems/morph.ts`, `hud/morph.ts`): `grant`·`take`·`owns`·`on`·`off`·`mods`, 명령 `morph`, 저장 `morph`, 개인 상태 `morph`, 엔티티의 칸 `morph`, 사건 `morphed`, 안내문 `charNew`·`morph…` 7가지, 메뉴의 변신 탭(부품으로 그린 작은 그림). 내용 `MORPH_RULES`(기본: 겉모습만, 스스로 풀 때까지, 다시까지 10초, 맞은 지 5초 안에는 못 함, 서른까지) | 모듈 (`chars`에 기댄다, `RPG_MODULES`에 들지 않는다) |
| 예제 | `games/sample`: 손으로 쓴 정의 넷(`server/chars.ts`, 날것을 `g.chars.add`로), `CHAR_RULES`(예산의 표, 금칙어), `MORPH_RULES`(3분, 다시 15초, 보정 상한 8%·6%), `LOOK_RULES`(모자 `antlers` 더함, 등 `wings` 뺌), 모닥불 곁의 정의마다 선 사람(`client/chars.ts`) | |

확인:
- `npm run typecheck` 설정 8개 오류 0. `npm test` 두 번 모두 통과(검사 2070 → 2138개: 틀의 `collect/chardef`·`collect/morph`, 예제의 `morph`. 등불지기의 언어 견본에 틀의 새 문장 21개씩을 더했다: 빠지거나 달라진 문장은 없다). `npm run build:all` 통과.
- 퍼징(`collect/chardef`): 무작위·악의적인 정의 6000개(그 가운데 JSON 글자 858개)가 예외 없이 거절(4694)·통과(1306)했고, 거절은 모두 아는 코드, 통과한 것은 모두 등급의 예산·칸의 상한·아는 부품·배율 범위 안, 통과한 정의의 능력치를 예산 밖으로 민 것은 모두 거절됐다.
- 황금 실행(`chardef-tools/golden.sh`, 바탕 `a517a06` 복제본과 이 가지): 등불지기(sim) **바이트까지 같다**(7,489,205바이트). 예제는 다르다(맞다): 캐릭터 정의·변신을 골라 개인 상태 `chars`·`morph`, 안내문 `charNew`, 엔티티의 칸 `morph`, 월드 저장의 `chars`가 생겼다. 그것을 빼면 나머지(움직임, 싸움, 보상, 저장)는 같다.
- 등불지기의 그림: 바탕과 가지에서 등불지기의 사람형(직업마다 무기·갑옷 넷)·주민·몬스터 전부를 정해진 자리에 한 번 그린 장면을 헤드리스 Chrome(GPU)으로 찍어 견줬다: 1200×700에서 **다른 픽셀 0**.
- 그리기 비용(헤드리스 Chrome GPU, 1280×720, 그림자, 사람형 300이 걷는 장면): 틀의 네모난 사람 프레임 약 20ms(그리기 호출 4689), 부품 사람 굽기 전 약 38ms(9995) → 굽은 뒤 약 24~27ms(4662, 삼각형은 57k → 131k). 예제의 실제 화면에서 봇 300이 저마다 다른 부품 겉모습일 때 평균 32ms, 같은 봇이 예제의 사람 모델 파일(뼈대 애니메이션)일 때 79ms(이름표 300개 포함).
- 화면(임시 서버 3015, 헤드리스 Chrome GPU): PC·폰 × 한국어·영어로 모닥불 곁의 부품이 다른 캐릭터 넷, 변신 탭(작은 그림·등급·능력치·보정·소개), 내가 변신한 모습, 다른 사람(소켓 접속자)이 변신하는 것을 내 화면에서, 변신 중의 탭(남은 시간·풀기), 풀고 난 재사용 대기. 콘솔 오류 없음. 화면: `%TEMP%\dg-work\chardef-shots\`.

남은 것 (틀 밖, 사용자 결정이 필요):
- AI 생성기: 프롬프트 → `CharDef` 꼴의 JSON. 결과는 `g.chars.add`로만 넣는다(거절이면 `charBad`로 까닭을 알린다). 요청 검사는 그 앞에서.
- 계정과 계정 공용 저장소: `g.chars.useStore(CharStore)`에 꽂는다. 소유의 싱크는 `g.morph.grant`·`take`(와 영웅이면 `g.roster.grant`)를 그 저장소에 맞춘다.
- 거래와 수익 분배, 주간 한도, 신고·회수(회수는 `g.chars.remove`: 그것으로 변신한 사람이 풀리고 영웅의 표에서 빠진다).
- 겉모습의 구운 모양은 종류만큼 쌓인다(같은 겉모습은 나눠 쓴다). 정의가 수천이 되면 오래 안 쓴 것을 버리는 길이 필요하다. 정의의 목록은 사람마다 개인 상태로 한 번에 간다(바뀔 때만): 수천이 되면 필요한 것만 묻는 길로.

## 운영의 바탕 (2026-11-27, 가지 `feat/ops2`)

[genre-features.md](genre-features.md) 5.1절의 묶음 1. 쓰는 법은 [making-a-game.md](making-a-game.md) 16절, 운영 절차는 [infra.md](infra.md) '운영의 바탕'. 모두 핵심(끌 수 없다)이고, 내용에 적지 않고 운영자가 명령하지 않으면 지금과 같다.

| 무엇 | 틀의 칸 | 선택인가 |
|---|---|---|
| 시계·초기화 | 핵심 `g.time`(`engine/server/game/systems/clock.ts`), 달력 `makeCalendar`·`parseWhen`(`engine/shared/defs/live.ts`), 내용 `RESET: { tz, dayAt, weekStart }`, 사건 `dayReset`·`weekReset`·`monthReset`(새 열쇠, 옛 열쇠, 지난 수), 마지막 경계는 `live_meta`. 일일 임무·던전 하루 횟수·자리 비움 하루 몫·뽑기 배너 기간이 이 시계를 쓴다 | 기본 `{ tz: 'local', dayAt: 0, weekStart: 1 }` = 예전의 서버 현지 자정 |
| 주간·월간 임무 | `DailyDef.period`, 저장 `daily.wk`·`mo`, `meta.daily.next`, 임무 창의 기간 머리와 '초기화까지' | 주간·월간 임무가 없으면 저장·줄 위가 예전 그대로 |
| 원격 설정 | 핵심 `g.live`(`systems/live.ts`), 내용 `LIVE_KEYS`(이름 → `client`·`type`·`value`·`check`·`note`), `checkLive`·`applyLive`, `liveRange`(`defaults`), 메시지 `live`, 화면 `onLive`, SQLite 스키마 2(`live`·`live_log`·`live_meta`), 저장소 `LiveStore`·`hasLive` | 선언하지 않은 칸은 소스 그대로 |
| 기능 깃발 | `g.flags.on`, 틀의 `join`·`chat`·`market`·`mail`·`gacha`, 내용 `FLAGS`, `g.live.gate`, 안내문 `featureOff`·`joinClosed`, 닫힘 4005 | 깃발이 없으면 켜짐 |
| 공지 | `g.live.addNotice`·`delNotice`·`notices`, 메시지 `notices`, 화면의 창(`#noticePop`)과 띠(`#opsBand`) | 올리지 않으면 아무것도 없다 |
| 점검 | `planMaint`·`startMaint`·`endMaint`·`setAdmin`, 사건 `maintStarted`·`maintEnded`, 메시지 `maint`, 안내문 `maintSoon`·`maintStart`·`maintEnd`, 닫힘 4004, 우편 종류 `maint`, 저장소의 `eachPlayerKey` | 명령하지 않으면 없다 |
| 상태 페이지 | `engine/server/net/status.ts`(`status.json`·`status.html`), `Options.status`, 환경 변수 `STATUS`·`STATUS_DIR`, 문장 `koStatusPage`·`enStatusPage` | `runServer`가 빌드 폴더가 있으면 쓴다(DB=memory는 안 쓴다) |
| 관리자 명령 | `set`·`flag`·`notice`·`maint`(`engine/server/net/admin.ts`, `scripts/admin.mjs`의 도움말) | |
| 예제 | `games/sample`: `RESET`(기본과 같음), `LIVE_KEYS` 셋(`DAILIES.kill20.n` 화면에도, `MORPH_RULES.cooldownS`, 게임만의 `bonfireHeat`), 깃발 `bonfire`(장작 넣기), 주간 임무 `kill150`·월간 `feed40` | |

확인:
- `npm run typecheck` 설정 8개 오류 0. `npm test` 두 번 모두 통과(검사 2174 → 2249개: 틀의 `fx/liveops`, 예제의 `sample/ops`. 등불지기의 언어 견본에 틀의 새 문장 21개씩을 더했다: 빠지거나 달라진 문장 없음. `fx/modules`의 '틱 1개'를 핵심의 시계·원격 설정을 더한 3개로). `npm run build:all` 통과.
- 황금 실행(`ops2-tools/golden.sh`, 바탕 `2d99d9a` 복제본과 이 가지): 등불지기(sim) **바이트까지 같다**(7,489,205바이트). 예제는 다르다: 주간·월간 임무 둘을 더했기 때문이다(그 둘만 뺀 가지의 예제는 바탕과 바이트까지 같았다: `LIVE_KEYS`·`FLAGS`·`RESET`·모닥불의 `g.live.get`·`gate`는 줄 위를 바꾸지 않는다).
- 시계 시험(`fx/liveops`): 기본 달력 = 예전 `dayOf`(400개 시각), UTC 05:00·Asia/Seoul 05:00(UTC 20:00), 월·일요일 시작의 주, 1일의 달, 다음 경계, America/New_York 서머타임(23·25시간의 날, 봄에 없는 02:30은 03:00), 가을에 두 번 오는 01:30에도 사건 한 번, 가상 시계로 날→주(월요일)→달(1일), 시계 되감김에 다시 알리지 않음, 서버가 사흘 꺼졌다 켜지면 날·주·달 사건이 한 번씩(지난 수 3·1·1), 처음 켜는 서버는 알리지 않음.
- 원격 설정 시험: 모양·범위·선언하지 않은 칸·함수 칸·무한대 거절, 반영(내용의 칸이 바뀐다)과 화면에도 보냄, undo·reset, 이력(누가·언제·전·후·버전), SQLite로 다시 켜도 값·깃발·이력이 남고 다시 적용, 저장된 값이 지금의 검사를 지나지 못하면 적용하지 않음.
- 점검 리허설(운영 DB 복사본 `data/backup/auto-20261127-073656.db` → 임시 폴더, 임시 서버 3015, 헤드리스 Chrome GPU의 손님 브라우저 + 관리자 접속자 + 토큰 없는 접속 시도): 공지(창·띠) → 깃발 market·chat을 끄면 '잠시 꺼져 있습니다' → `maint plan +2m --for 30m` → 카운트다운 띠(1:59) → 2분·1분 전 안내 → 시각에 시작: 브라우저는 4004로 끊겨 점검 화면('서버 점검 중입니다 / 서버 옮기기 점검 · 예정 끝 …'), 관리자(`maint allow OpsAdmin`)는 남음(`who` 1명), `status.json`은 `maint`, 토큰 없는 새 접속은 점검 안내와 4004 → `maint end --gold 50 --item potion:2 --days 30`: 60명에게 보상 우편(관리자는 바로 받음), `status.json`은 `ok`, 브라우저는 1분 안에 저절로 다시 들어옴. 기록 `$TEMP/dg-work/ops2-tools/rehearsal.log`.
- 화면(PC 1280×720·폰 390×844 × 한국어·영어, 콘솔 오류 없음): 공지 창과 띠, 꺼진 기능 안내, 점검 카운트다운, 점검 화면, 예제의 임무 창(일일·주간·월간과 '초기화까지'). `$TEMP/dg-work/ops2-shots/`.

남은 것:
- 등불지기의 `LIVE_KEYS`는 비어 있다(무엇을 열지는 사용자 결정). 초기화 시각도 그대로(서버 현지 자정).
- 폰에서 점검 카운트다운 띠가 내 정보 창의 이름 줄을 조금 덮는다. 메뉴가 열려 있으면 꺼진 기능 안내(흘러가는 알림)가 메뉴 뒤에 가려진다(예전부터의 알림 자리).
- 화면에만 보내는 원격 설정은 끊긴 동안 소스로 돌린 칸을 다시 접속해도 돌리지 않는다(새로고침하면 맞다).
- 등불지기 언어 견본의 시각 문장(점검 예정 끝)은 이 PC의 시간대로 떠 있다: 다른 시간대의 PC에서 그 견본 시험이 달라질 수 있다.
- 웹 관리 화면, 확률표의 공개·사전 공지(묶음 4), 패치 노트, A/B, 사람마다 다른 깃발, 상태 페이지를 다른 호스팅으로 올리기. 작은 수집형 증명 게임으로 16절 문서 검증.

## 웹 출시의 바탕 (2026-11-27, 가지 `feat/web2`)

[genre-features.md](genre-features.md) 5.2절의 묶음 2. 쓰는 법은 [making-a-game.md](making-a-game.md) 17절, 운영(오류 목록·삭제 요청)은 [infra.md](infra.md) '화면 오류와 내 데이터 삭제'.

- **플랫폼 접점** `engine/client/platform/`(`types.ts` 모양, `web.ts` 기본 = 지금 동작, `memory.ts` 시험, `auth.ts` 손님 인증, `index.ts` 고르기·광고 구간·광고 지점): [platforms.md](platforms.md) 3.1의 이름(`id`, `has`, `storage`(동기 + `ready`, `secret`), `lifecycle`(hide·show·pause·resume·quit), `audio`, `display`, `openUrl`·`share`·`copy`·`saveFile`, `errors`, `auth`, `ads`·`invite`, `server()`, `app`)을 따랐다. 더한 것: `errors.listen`(오류 받기), `offlineCache`, `display.pixelRatio`, `app.page`. 아직 없는 칸: `input`, `notify`, `purchase`, `achievements`, `cloud`. **이번에 새로 쓰거나 고친 곳만 접점을 쓴다**: 기기 토큰(`net.ts` → `auth()`), 서버 주소(`platform().server()`), 소리 켜기·음량의 저장과 숨김·광고 중 멈춤(`sound.ts`), 연출(`fx.ts`의 숨김 검사), 설정·튜토리얼·약관·손님 보호·오류 수집. 옛 직접 호출(언어 고르기 `i18n/index.ts`, 차단 목록 `social.ts`, 첫 입력의 소리 깨우기, 도감 링크, `location.reload`)은 다음 작업이다.
- **설정 창**: 메뉴의 '설정' 탭(`hud/settings.ts`, 셈 `hud/settingscalc.ts`), `addSetting`, `onKey(키, 할 일, 이름)`, 키 재설정(`bus.ts`의 `setKeyMap`·`actionOf`), `View.setQuality`, `fx.setCalm`, 화면 배율(CSS `zoom`, 배율 1이면 걸지 않는다).
- **탭 숨김**: `engine/client/lifecycle.ts`(자리 비움 알림·이름표, 연출 버리기 `dropFx`, 게임 구간, 광고 지점), 서버 `vis` → `afk`, 사건 `playerVisible`.
- **로딩 예산**: `scripts/budget.mjs`(빌드 뒤 묶음별 크기, 8MB·20MB 경고, `deploy.json`의 `budget`, `offlineCache`면 `sw.js`), `preloadLater`·`startLater`(나중 묶음).
- **오류 수집**: 화면 `engine/client/errors.ts`(`reportError`), 서버 `engine/server/net/web.ts`의 `POST /client-error`(크기·속도 제한, 개인정보 빼기, 묶기), 관리자 `errors`.
- **약관·데이터 권리**: 내용 칸 `LEGAL`(기본 null)·`PRIVACY`(`eraseDays` 7), 화면 `hud/legal.ts`, 메시지 `consent`·`mydata`, 저장 `WebStore`(SQLite 스키마 2: `consents`, `erasures`, `client_errors`), 개인 데이터 칸 `engine/server/game/personal.ts`(길드·거래소·우편·기기 옮기기가 등록), 관리자 `erase`.
- **튜토리얼**(선택): `hud/tutorial.ts`(셈 `tutorialcalc.ts`), `addTutorial`·`replayTutorial`·`onTutorial`. **인증 접점**: 화면 `AuthProvider`(`guestAuth`), 서버 `ServerAuth`(`engine/server/net/auth.ts`, `startServer({ auth })`). **손님 진행 보호**: `hud/keepsafe.ts`(`setGuestReminder`, `remindGuestSave`).
- **예제**(`games/sample`): `LEGAL`(문장 키로 된 예제 약관), 튜토리얼 넷, 설정 칸 '이름표 보이기', F 키의 이름, `preloadLater('./sounds/pickup.wav')`, 재방문 캐시(`deploy.json`의 `offlineCache`, `enableOfflineCache()`), 손님 보호 20분.
- **등불지기에 새로 보이는 것**: 메뉴의 '설정' 탭, 다른 사람이 탭을 숨기면 그 이름표에 '자리 비움', 이 기기에서 30분을 논 뒤 한 번 뜨는 손님 진행 보호 안내. 약관 링크·튜토리얼은 없다(적지 않았다). 게임 내용·경제는 그대로다.
- **황금 실행**(`$TEMP/dg-work/web2-tools/golden.sh`: 등불지기 시뮬레이션과 예제, 바탕 `2d99d9a`와 가지): 둘 다 바이트까지 같다(sim 7,489,205바이트 `ba83af30d07f`, sample 3,392,635바이트 `eb62b9925800`).
- **시험**: `engine/test/fx/web.test.ts`(57개). 검사 2174 → 2232개. 경계 검사에 '숨김' 사건 이름(`hide`)과 `node:crypto`(오류의 서명)를 틀의 낱말로 더했다. 등불지기의 문장 견본(`games/deungbul/test/fixtures/locale-*.json`)에 새 문장 71개(달라진 문장 0).

### 실제 브라우저로 확인한 것 (헤드리스 크롬, GPU, 포트 3017 예제·3018 등불지기(임시 DB))

PC(1280×800)와 폰(390×844, 터치, DPR 2), 한국어·영어 넷씩, 두 게임 모두: 설정 창(소리·음량·품질·음영·해상도·거리·흔들림·글자 크기·전체 화면·단축키·게임 칸·도움말·약관·내 데이터), 품질 '낮음'이 저장되고 다시 '높음', 내 데이터 내려받기(파일이 실제로 받아진다: `mydata-날짜.json`, 저장 키·캐릭터 저장·동의), 삭제 요청(두 번 눌러) → '7일 뒤에 지웁니다' → 거두기, 일부러 낸 오류 둘·Promise 거절·WebGL 잃음이 관리자 `errors`에 묶여 나옴(같은 문장의 오류 둘이 한 줄 2회, 토큰은 `<hex>`). 예제만: 첫 접속의 약관 고지(그동안 M 키가 메뉴를 열지 않음), 문서 보기, 동의 뒤 사라짐, 직업 고른 뒤 튜토리얼(땅을 누르면 2단계로, 건너뛰기, 설정의 다시 보기), 키 재설정(M → K: M은 아무것도 안 하고 K가 메뉴), 글자 크기 130%, 손님 진행 보호 안내(노는 시간 20분을 채운 뒤, '기기 탭 열기'가 기기 탭을 연다). 등불지기: 약관 링크·고지·튜토리얼 없음. 콘솔 오류: 일부러 낸 것 말고 없음. 스크린샷은 `$TEMP/dg-work/web2-shots/`.

| 항목 | 결과 |
|---|---|
| 5분 숨김 | 보임 상태를 흉내(document.visibilityState 덮기 + visibilitychange)해 300초 숨김: 다른 사람(지켜보는 접속)에게 5.3초에 '자리 비움', 305.3초에 '돌아옴'. 연결이 끊기지 않았고(접속 화면 없음, 지연 1ms), 떠오르는 숫자 0개 [확인: 흉내. 실제 크롬의 타이머 제한은 헤드리스에서 일어나지 않아 보지 못했다] |
| 90초 얼림 | `Page.setWebLifecycleState frozen`(JS가 아예 멈춘 상태)으로 90초: 서버의 ping 정리(15초마다)에 끊기지 않고, 풀린 뒤 곧바로 '돌아옴' [확인] |
| 첫 다운로드(들어올 때까지, 브라우저로 잼) | 등불지기 1,148.5KB(응답 9개), 예제 1,015.7KB(10개: 줍는 소리는 나중 묶음). 빌드의 표: 등불지기 첫 묶음 968.5KB(gzip 295.2KB) + 자원 366.2KB, 나중 227.7KB, 전체 1.53MB(파일 14). 예제 957.8KB(gzip 275.8KB) + 479.2KB, 전체 1.45MB |
| 재방문 | 예제(서비스 워커 켬): 두 번째 방문의 페이지 쪽 전송 0바이트(11개 모두 서비스 워커에서). 등불지기(끔): 두 번째도 1,148.5KB — 정적 서버가 캐시 머리말을 주지 않아 매번 다시 받는다(남은 일) |
| 품질의 프레임 (1920×1080, DPR 2, 프레임 상한을 푼 크롬, 이 PC의 GPU, 8초 평균) | 등불지기: 높음 435.6 → 보통 439.2 → 낮음 546.4fps(+25%). 예제: 396.6 → 392.2 → 626.6fps(+58%). 그리는 버퍼: 높음 3840×2160, 보통 2880×1620, 낮음 1920×1080. 이 PC는 해상도보다 그림자에서 차이가 난다. 약한 기기의 값은 재지 않았다 |

### 포털 요건표 ([genre-features.md](genre-features.md) 6절)

| 요건 | 된다 / 안 된다 |
|---|---|
| 첫 다운로드 8MB(Poki), 50MB·모바일 20MB(CrazyGames) | **된다**: 1.0~1.15MB. 넘으면 빌드가 경고(`scripts/budget.mjs`) |
| 전체 250MB·파일 1,500개 | **된다**: 1.5MB·파일 14개. 넘으면 경고 |
| 10초·20초 안에 시작 | 재지 않았다(같은 PC의 서버) |
| 즉시 접속·메뉴 최소 | **된다**(손님으로 곧장 들판). 튜토리얼은 게임 안·건너뛰기 |
| 데스크톱·모바일 | **된다**: PC와 폰 세로를 이번에 봤다. 폰 가로·태블릿은 이번에 보지 않았다(앞선 검토에서 봄) |
| DPR 1·저사양 | **된다**: 설정의 해상도 상한 ×1·품질 '낮음'. 4GB급 기기의 실제 값은 재지 않았다 |
| 음소거 | **된다**: 설정·메뉴 머리의 소리 단추, 숨기면·광고 중 소리 멈춤 |
| 영어 | **된다** |
| `localStorage`는 try/catch | **된다**(새 코드는 `platform().storage`, 옛 코드도 try/catch) |
| GameplayStart/Stop, 같은 사건 두 번 금지, 첫 입력 때, 광고 중 금지 | **접점만 된다**: 틀이 규칙대로 부른다. 포털 SDK를 부르는 구현은 없다 |
| 광고(전면·보상형), 실패면 보상 없음, 광고 차단기에서도 진행 | **접점만 된다**: `adBreak`·`rewarded`(기본은 곧바로 끝남·`false`), 광고 지점 사건(판 끝·다시 일어남), 광고 중 소리 멈춤. 실제 광고 SDK는 붙이지 않았다 |
| 외부 로그인 금지 | **된다**(로그인이 없다) |
| 외부 링크 금지 | **된다**: 약관이 주소여도 `has('link.external')`이 false인 플랫폼에서는 창 안의 글로 보인다(문장 키를 쓰면 언제나 창 안). 도감 링크(등불지기)는 옛 코드라 아직 접점을 거치지 않는다 |
| 외부 서버를 쓰는 멀티의 처리방침(Poki 예외 조건) | **된다**: `LEGAL`(처리방침 화면·동의 기록). 문서의 실제 내용은 정할 것 |
| 외부 요청 기본 차단(글꼴·CDN 금지) | **된다**: 새 요청은 게임 서버 자신(`/client-error`)뿐. 새 외부 요청이 생기지 않는지 보는 빌드 검사는 없다 |
| 인앱 결제 금지(Poki) | **된다**(결제가 없다) |
| 방 정보를 포털에 넘기기·초대 단추 | **안 된다**: 접점 `invite(room)`만 있고 판 모듈이 부르지 않는다(묶음 7의 방 코드와 함께) |
| 즉시 멀티·같은 무리로 다음 판 | **안 된다**(묶음 7) |
| 대화 끄기 설정, 대화·사용자 콘텐츠 검열 | **안 된다**(묶음 3). 금칙어 가리기는 있다 |
| 등급 표시(PEGI 12 등) | **안 된다**(내용 칸 `RATING` 후보, 7절 2번) |
| 진행 저장(포털 Data 1MB 한도) | **된다**: 진행은 서버 DB. 손님 진행 보호 안내가 있다 |
| 오디오 '중단' 뒤 다시 깨우기(iOS) | **된다**(옛 동작: 누를 때마다 `resume`). 앱의 재개 사건은 `audio.onUnlock`·`lifecycle.pause`로 나중에 |

### 묶음 1과 합친 뒤 (2026-11-27)

- `main`(7877c9c, 운영의 바탕)을 이 가지에 합쳤다(merge). SQLite 스키마는 1 처음의 표 → **2 원격 설정**(live, live_log, live_meta) → **3 웹**(consents, erasures, client_errors). 1에 머문 DB는 2·3을 차례로, 2(묶음 1만의 서버)에 머문 DB는 3만 더한다(`engine/test/fx/web.test.ts`). 합치기 전의 이 가지(웹을 2로 적은 것)로 만든 DB는 운영에 없다(임시 DB만).
- 관리자 명령표는 둘 다(set·flag·notice·maint와 errors·erase), making-a-game의 절은 16 운영의 바탕, 17 웹 출시의 바탕. 닫힘 코드는 4004 점검, 4005 새 접속 막힘, 4010 데이터 지움.
- 시간대에 기대던 시험 둘을 고쳤다: 등불지기의 문장 견본(`games/deungbul/test/locale-snapshot.ts`)은 셈 동안만 UTC로 두고(점검 문장의 '예정 끝'), 옛 저장 읽기(`v0read.ts`)는 기대값을 만든 시간대(Asia/Seoul)로 두고 읽는다. 둘 다 끝나면 처음 시간대 이름으로 되돌린다. `TZ=UTC npm test`도 통과한다. 옛 저장 읽기의 실패는 합치기 전(2d99d9a)부터 있던 것이다.
- 검사 2308개. 황금 실행은 7877c9c와 같다(sim 7,489,205바이트 `ba83af30d07f`, sample 3,431,368바이트 `3e0b697f49ed`).
- 난수에 기대어 가끔 실패하는 시험 둘(합치기 전부터): `collect/idleflow`의 '그 뒤에는 다시 맡는다', `collect/growth`의 '앞줄을 먼저 친다'. 다시 돌리면 통과한다.

## 플랫폼 분리 1단계 (2026-11-27, 가지 `feat/plat1`)

설계는 [platforms.md](platforms.md)(1절 웹 의존 표, 3.1 접점 모양, 4절 단계. 4절의 '1단계 결과'가 줄마다 지금 상태), 쓰는 법은 [making-a-game.md](making-a-game.md) 17절 '플랫폼 접점'.

- **옮긴 곳**: 재접속의 숨김 기다리기(`main.ts`, `hud/ops.ts`) → `lifecycle`, 버전 불일치의 새로고침·`?auto=` → `app.requireUpdate`·`app.param`, 홈 화면 아이폰의 화면 크기 → `display.viewport`, 언어(`?lang=`·저장·브라우저 언어) → `app.param`·`storage`·`app.language`, `isTouch` → `input.primary`, 소리 깨우기 → `audio.onUnlock`(웹: 입력마다, 예전과 같은 사건), 그리기 배율(3D·미니맵·세계 지도) → `display.pixelRatio`·`pixelRatioCap`, 도감 링크(`target=_blank`) → `openUrl`, 도감 페이지(언어·주소 바꾸기·`#자리`) → `app.*`·`storage`(입구 `@engine/client/platform`을 더했다). 저장 키 이름은 그대로다(`token`·`lang`·`sound`·`soundMix`·`settings` …: `fx/platform` 시험이 소스로 고정). 남긴 곳: 차단 목록(`social.ts`의 `localStorage`, 묶음 3이 서버로 옮기며 지운다).
- **새 칸**(`platform/types.ts`): `input`(`primary`·`onChange`·`gamepad`·`keyName`(ev.code 기준, `platform/keyname.ts`)), `notify`·`purchase`·`achievements`·`cloud`(웹 기본은 `has()` false·빈 구현), `display.viewport`, `app.param`·`setParam`·`anchor`·`language`, 기능 이름 9개. 웹의 주 입력 장치는 처음에 `(pointer: coarse)`로 짐작하고(첫 화면이 예전과 같다) 그 뒤로는 실제로 쓴 장치(마우스·키보드로 바꾸는 것은 정밀한 포인터가 있는 기기만)를 따르며, 바뀌면 `[[PC|터치]]` 문장을 다시 고른다. 단축키는 아직 `ev.key`(동작 그대로): 2단계.
- **버전**: `protocolFits`(`engine/shared/protocol.ts`), 서버 옵션 `protocolMin`(기본 `PROTOCOL` = 같은 번호만: 예전과 같다. 낮추면 `welcome.min`), 앱·데스크톱만 `join.v`(웹은 싣지 않는다), 범위 밖이면 `{ t: 'update', min, max, store? }`와 닫힘 4006(`CLOSE.update`). 화면은 웹이면 예전 안내('새 버전이 나왔습니다…')와 새로고침, 앱이면 '새 버전이 필요합니다'와 `requireUpdate(스토어)`(새 문장 `staleApp`·`updateApp`).
- **서버 칸**: `staticDir: null`(`STATIC=0`: 화면 파일 없이 게임만, 모든 주소 404), `origins: { list, allowNone }`(`ORIGINS`, `ORIGIN_NONE=0`. 기본: 검사 안 함, `engine/server/net/origin.ts`), `storeUrl`(`STORE_URL`), `PROTOCOL_MIN`.
- **터치 툴팁**: `engine/client/hud/tip.ts`(`initTips`는 `startClient`가 켠다, `showTip`·`hideTip`은 입구에). title이 달린 요소를 손가락으로 0.45초 누르면 말풍선, 그 누름의 click은 삼킨다. 데스크톱은 그대로.
- **경계 시험**: `engine/test/boundary.test.ts` 8절(검사 4개). 틀 85개·게임 34개 화면 파일에서 금지 낱말 14가지(저장소, `location.`, `navigator.`, `window.open`, `'_blank'`, 생명주기, `history.*`, 전체 화면, `devicePixelRatio`, `screen.*`, `createObjectURL`, `(pointer: coarse)`, `serviceWorker`)를 찾는다. 알고 남긴 것 1곳(차단 목록), 검사의 모양 시험, 웹 구현에 옮겨 간 호출이 모였는지.
- **떠는 시험 고침**: `collect/idleflow`의 '그 뒤에는 다시 맡는다'는 동작이 아니라 시험의 문제였다. 맡는 셈은 0.3초마다 대상을 주고, 그 대상을 쓰러뜨리면 다음 셈까지 `targetId`가 0이다. 쓰러뜨리는 때가 치명타(`Math.random`)에 달려 있어서, 2.0초가 된 한 순간만 보던 시험이 약 8%(400번에 31번) 막 쓰러뜨린 직후를 봤다. 구간 동안 틱마다 보게 고쳤다(앞의 1.5초는 모든 틱이 0, 뒤의 1.5초 안에 한 번은 대상). 2000번 돌려 0번 실패. (`collect/growth`의 '앞줄을 먼저 친다'는 이번 범위 밖으로 남았다.)
- **확인**: `npm run typecheck` 0, `npm test` 두 번과 `TZ=UTC npm test` 한 번 모두 통과(검사 2308 → 2339개: 경계 +4, `fx/platform` 27), `npm run build:all`(등불지기 첫 묶음 978.9 → 984.6KB +0.6%, 예제 968.8 → 974.4KB +0.6%, 도감 페이지는 플랫폼 접점을 읽어 +9KB). 황금 실행(`$TEMP/dg-work/plat1-tools/golden.sh`: 등불지기 sim과 예제, 바탕 `ff8c836`과 가지) 둘 다 바이트까지 같다(sim 7,489,205바이트 `ba83af30d07f`, sample 3,431,368바이트 `3e0b697f49ed`).
- **실제 브라우저**(헤드리스 크롬 GPU, 포트 3015, 임시 DB, 바탕과 가지에서 같은 단계): 등불지기·예제 × PC·폰 × 한국어·영어의 들어온 화면·설정 창·새로 읽은 뒤의 설정 창이 같다(3D 장면의 몬스터 자리만 다르다). 화면이 서버로 보낸 메시지(join, auto, mydata, vis, ping, class)가 바이트까지 같다. 바탕 서버에서 만든 캐릭터를 같은 DB·같은 브라우저 저장으로 가지 서버에서 열면 같은 토큰·이름·엔티티로 이어진다(등불지기·예제). 설정(품질 낮음·소리 끔)이 새로 읽어도 남는다. 버전 불일치(welcome의 번호를 바꿔 흉내): 두 쪽 모두 같은 안내와 '새로고침' 단추, 누르면 새로 읽는다. 가지만: 호환 범위 안(`v 4, min 3`)이면 들어가고, `update` 메시지면 안내를 띄운다. `PROTOCOL_MIN=2`로 띄운 가지 서버는 `welcome`에 `"min":2`를 싣고 웹 화면은 그대로 들어간다. 길게 누르기: 폰에서 이름 단추를 0.7초 누르면 그 title이 말풍선으로 뜨고 2.5초 뒤 걷힌다(바탕은 아무것도 없다), PC의 마우스로는 뜨지 않는다. 도감 링크는 `window.open(주소, '_blank', 'noopener')`로 열리고 도감 페이지의 언어·`#자리`·언어 바꾸기가 바탕과 같다. 콘솔 오류 0.
## 사회와 안전 (2026-11-27, 가지 `feat/social3`)

[genre-features.md](genre-features.md) 5.3절의 묶음 3. 쓰는 법은 [making-a-game.md](making-a-game.md) 18절, 운영(신고 보기·금칙어·연령)은 [infra.md](infra.md) '신고 보기와 금칙어 관리'.

- **단위**: 지금은 기기 토큰 → 저장 키 하나 = 캐릭터 하나. 코드는 둘로 나눠 부른다(`engine/server/net/social.ts`의 `ownerKey`·`charKey`, 지금은 같은 값): 사람(나중에 계정) — 연령·제한 모드, 본인 설정, 차단 목록의 주인, 도배 막기 / 캐릭터 — 친구, 귓말 대상, 차단의 대상, 대화 줄을 말한 이, 신고의 대상(이름이 아니라 저장 키로). 저장도 `blocks(owner, target)`, `friends(a, b)`(캐릭터 둘), `social_prefs(owner)`.
- **서버**: `engine/server/net/social.ts`(`createSocial`: route·deliver로 대화의 받는 곳, gate로 제한 모드의 명령, pass로 길드 대화의 차단 거르기, context로 신고의 문맥, 관리자 `words`·`age`·`blocks`). `server.ts`의 대화·신고·접속·끊김·전송이 이쪽을 부른다. `g.blocks`(게임의 파티·길드 초대가 묻는다), `Party.invite(…, far)`(친구 목록에서). 관리자 `report 신고id`, `reports`에 문맥 세 줄.
- **금칙어**: `engine/shared/textfilter.ts`(`server/text.ts`는 다시 내보낸다). 자리(`chat`·`notice`·`name`·`guild`·`charName`·`charBio`)마다 느슨함/엄격함. `addBannedWords`, `addAllowedWords`, `addTextFilter`, `filterKey`. 캐릭터 정의의 검증도 이것을 지난다(예전의 `CHAR_RULES.banned`·`addCharFilter`는 그대로 더해서).
- **내용 칸·모듈**: 모듈 `chat`, `friends`(둘 다 의존 없음, `RPG_MODULES`에 들지 않는다), 칸 `CHAT_RULES`, `FRIENDS`, `QUICK_CHAT`(기본 빈 목록, `BASIC_QUICK_CHAT` 여덟), `AGE`(기본 null). 시험이 바꾸는 창 `TALK_VIEW`.
- **화면**: `engine/client/social.ts`(서버의 차단·대화 상태·친구, 옛 차단 목록 옮기기: 플랫폼 저장소의 `blocked`를 읽어 보내고 서버가 답하면 지운다), `hud/social.ts`(설정 칸 셋, 차단한 사람, 연령 창, 친구 탭), `hud/chat.ts`(채널 탭·거르기, 귓말 명령, 정해진 문장 단추, 제한 모드의 잠긴 입력, 이름을 눌러 사람 카드, 대화 끄기), `hud/party.ts`(사람 카드에 귓말·친구 요청, 줄 번호로 신고·차단), `hud/settings.ts`(`addSetting`의 `group`).
- **저장**: SQLite 스키마 4(`blocks`, `friends`, `social_prefs`). 운영 DB 복사본(`auto-20261127-093236.db`)을 새 코드로 열면 3 → 4, 캐릭터 59명과 월드 그대로. 내 데이터 내보내기에 `social`, 지우기에 그 저장 키의 줄.
- **등불지기에 들어간 것**: 서버 저장 차단(사람 카드의 '대화 차단'이 '차단'으로: 대화·초대가 서버에서 걸러진다)과 옛 목록 옮기기, 새 금칙어 정규화(대화·이름·길드), 신고의 문맥, 설정 창의 '대화 보이기'와 '차단한 사람'. 귓말·친구·채널·정해진 문장·연령은 켜지 않았다(사용자 결정). 게임 내용·경제는 그대로.
- **황금 실행**(`$TEMP/dg-work/social3-tools/golden.sh`, 바탕 `ff8c836`과 가지): 등불지기 sim 7,489,205바이트 `ba83af30d07f` 같음, sample 3,431,368바이트 `3e0b697f49ed` 같음(예제는 모듈 둘과 칸 둘을 더했지만 게임 계층에는 시스템이 없어 줄 위가 같다). 운영 DB 복사본으로 sim 13,410,157바이트 `1d032ea5635f`, prod 386,872바이트도 같음.
- **시험**: `engine/test/fx/social.test.ts`(54개: 정규화, 퍼징 2,000, 소켓 다섯으로 귓말·근처·파티·정해진 문장·도배 막기·차단(대화·귓말·친구 요청·파티 초대, 다시 접속, 이름 바꾸기)·옛 목록 옮기기·친구·받기 끄기·신고의 문맥·관리자 명령·제한 모드·SQLite 표). 검사 2308 → 2362개. 경계 검사의 `node:crypto`에 `social.ts`. 바탕에서도 가끔(8번에 1번) 실패하던 `collect/idleflow`의 '그 뒤에는 다시 맡는다'를 고쳤다(20초 싸우는 동안 적이 모두 쓰러지면 볼 적이 없었다 → 12초). 등불지기의 문장 견본에 새 문장 80개, 달라진 문장 ko 1·en 2(차단 단추의 이름).
- **퍼징**(`$TEMP/dg-work/social3-tools/fuzz.ts`): 금칙어 변형 6,000개 — 놓침 25(0.42%, 영문 자판·숫자 치환에 띄어쓰기를 겹친 것), 예외 0. 보통 문장 2,456개 — 대화로 잘못 막음 5(0.20%), 이름으로 13(0.53%).
- **실제 브라우저**(헤드리스 크롬, GPU, 3017 예제·3018 등불지기(운영 DB 복사본)): 예제 PC·폰 × 한국어·영어로 연령 창(미리 고른 값 없음, 확인 잠김), 제한 모드(잠긴 입력·정해진 문장 목록·보냄, 상대의 귓말·친구 요청이 오지 않음), 어른(채널 탭, 근처·귓말 줄, 귓말 보내기와 가리기, 사람 카드의 귓말·친구 요청·차단·신고, 친구 탭의 요청 → 수락 → 접속 중·채널), 설정의 '대화' 칸. 등불지기: 브라우저에 `blocked: ["Blockme", "없는사람"]`를 넣고 접속 → 서버로 옮겨지고(찾은 1명) 브라우저의 칸이 지워지고, 그 사람의 대화가 오지 않음. 콘솔 오류 0(처음 한 번 연령 창이 없는 게임에서 예외가 났던 것을 고쳤다). 고친 화면: 폰에서 정해진 문장 목록이 화면 위로 나가던 것(대화창 아래로), 사람 카드가 상점 창 아래에 깔리던 것. 스크린샷 `$TEMP/dg-work/social3-shots/`.

## 운영 도구와 고객지원 (2026-11-27, 가지 `feat/ops5`)

[genre-features.md](genre-features.md) 5.5절의 묶음 5. 쓰는 법과 사고 대응 순서는 [making-a-game.md](making-a-game.md) 19절, 운영 절차는 [infra.md](infra.md) '운영 도구와 고객지원'.

- **분석 사건**: 핵심 `g.track(이름, 속성, 누가)`(`engine/server/game/systems/analytics.ts`, `g.analytics`). 서버에서만 적고, 통신 계층이 저장 주기에 가져가 캐릭터·월드 저장과 같은 묶음으로 `events` 표에 얹는다. 속성은 수·참거짓·짧은 표만(자유 문장은 빼고 센다). 기본 사건 `session_start`·`session_end`(`sec`)·`first_join`(저장 키마다 한 번: 사건 표로 가린다)·`level_up`(`players.ts`의 `levelUp`). 가져가는 쪽이 없으면(시험·황금 실행) 2만 줄에서 오래된 반을 버린다. 보관 `analytics.keepDays`(180일, 한 시간마다 정리), 내 데이터 삭제가 지운다. 집계 `engine/server/net/stats.ts`(UTC 날): 관리자 `stats`, `npm run stats`(`scripts/stats.ts`: 저장 파일을 읽기 전용으로).
- **웹 관리 화면**: `net/admin.ts`에 `GET /admin/ui`(페이지 `net/admin-page.ts`: 빌드 없는 HTML 한 장, 문장은 틀의 언어 파일의 `koAdminPage`·`enAdminPage`)와 `POST /admin/api`. CLI와 같은 명령표·같은 기록·같은 권한 검사(`roleFor`). 문: 루프백 연결, 터널·프록시의 머리 없음, Host가 루프백 이름, Origin·Sec-Fetch-Site가 같은 출처, JSON 본문, CSP·frame-ancestors·X-Frame-Options. 토큰은 `#` 뒤 → 탭의 sessionStorage. 역할 셋(토큰 파일 `admin.token`·`admin-ops.token`·`admin-view.token`), 명령은 글과 값(`{ out, data }`)을 함께 돌려준다(`who`, `flag`, 운영 도구의 명령). `npm run admin -- ui [view|ops|full]`이 주소를 찍는다. `admin.web: false`로 끈다.
- **문의·제재 이의**: 선택 모듈 `support`(`MODULE_TABLE`의 끝, `RPG_MODULES`에 들지 않는다. 등불지기·예제가 골랐다). 서버 `net/support.ts`, 화면 `hud/support.ts`(설정 창의 '문의' 칸, 문의 창, 접속 화면의 사유·이의), `tickets` 표. 차단된 사람의 이의는 접속 메시지의 `appeal`(따로 된 연결 하나). 프로토콜 번호는 그대로 3(새 메시지만 더했다: 옛 화면은 모르는 메시지를 무시한다).
- **계정 단위 롤백**: `net/rollback.ts`(관리자 `rollback`), `store/sqlite.ts`의 `readBackupPlayer`(백업 파일을 읽기 전용으로), `store/backup.ts`의 `Backups.dir`, `player_stash` 표. 장부 `systems/ledger.ts`가 통로 밖의 변화를 사람과 함께 남긴다(`strayList`, 최근 500건, 서버가 켜져 있는 동안). 되돌린 재화는 장부에 `rollback`.
- **봇·매크로 의심 점수**: `net/suspect.ts`. 통신 계층이 게임 명령마다 `see`. 관리자 `suspects`. 막지 않는다.
- **경보**: `net/alerts.ts`(`startServer`의 `alerts`, `runServer`는 `ALERT_WEBHOOK`·`ALERT_REPEAT_MIN`). `net/ops.ts`의 지표를 줄 목록으로 나눠(`metricRows`, `metricValues`) 덧붙는 줄(`OpsNow.extra`)을 받는다: `game_econ_stray_total`, `game_analytics_rejected_total`, `game_tickets_open`.
- **그 밖**: 관리자 `mail`(운영 보상 우편, 우편 종류 `comp`), `ledger`, `metrics`, `whoami`. 새 안내문 10가지(`supportSent` … `rolledBack`), 우편 종류 `support`·`comp`.
- **저장**: SQLite 스키마 목록의 끝에 한 단계(`events`, `tickets`, `player_stash`). 시험은 번호를 적지 않고 목록의 길이(`SCHEMA.length`)로 본다(사회와 안전의 시험도 그렇게 고쳤다).
- **시험**: `engine/test/fx/opstools.test.ts` — 1 분석 사건(속성 검사, 서버의 기본 사건이 SQLite에, 보관·삭제), 2 집계(잔존·일별·퍼널의 셈, 부하 도구의 봇 접속자 6명 → 다음 날 3명 = D1 50%), 3 역할과 웹 관리 화면의 문(Host·Origin·Sec-Fetch-Site·터널의 머리·JSON, 끄기), 4 문의·이의(길이·빈도·금칙어·답·우편·말 막기 이의·차단된 사람의 이의·모듈이 없는 게임), 5 의심 점수, 6 경보(가짜 웹훅 수신기: 이어 넘기·되풀이 억제·아직·풀림·늘어난 양), 7 사고 리허설(아래), 8 스키마. `collect/client`의 화면 모듈 차례 검사는 사회와 안전까지를 보고 문의가 그 뒤인지를 더 본다. 검사 2435 → 2513개.
- **사고 리허설**(시험 7번, 진짜 서버·SQLite·자동 백업): 켜질 때 백업 → 지갑을 거치지 않고 골드를 늘리는 명령(복제 버그 흉내) → `ledger`가 그 사람과 `gold +5000 (other)`를 잡고 지표 `game_econ_stray_total`이 오른다(따로 된 서버에서 웹훅 경보 `econ_stray`까지) → `flag market off`·`flag mail off`(꺼진 거래소는 `featureOff`) → `rollback list` → `preview`(바뀌는 것, 그 사이의 통로 밖 변화, 확인 코드) → 틀린 코드·운영 역할은 거절 → `apply`(접속 중인 그 사람을 먼저 끊고 `rolledBack`, 골드 100으로, 5100은 보관, 다른 사람은 그대로, 장부에 `rollback −5000`) → 다시 들어오면 되돌린 상태 → `mail --all --gold 200`(받으면 장부에 `mail:comp`) → 공지 → 거래 다시 엶 → `rollback undo`로 되돌리기를 되돌림 → 모든 단계가 관리자 기록에.
- **황금 실행**(`$TEMP/dg-work/ops5-tools/golden.mts`: 앞 가지들과 같은 도구): 등불지기 sim 7,489,205바이트 sha256 `ba83af30d07f`, 예제 3,431,368바이트 `3e0b697f49ed`, 둘 다 바탕과 바이트까지 같다(분석 사건은 게임의 상태·난수·전송을 바꾸지 않는다. `support` 모듈은 게임 계층에 시스템이 없다).
- **실제 브라우저**(헤드리스 크롬 GPU, 포트 3017 등불지기(임시 DB `tmp/shot`), 사람 셋을 붙여 문의·말 막기·차단을 만든 뒤): 관리 화면 PC·폰 × 한국어·영어(개요·사람·분석·장부·문의 답 쓰기·의심 점수·롤백 미리보기·명령), 등불지기 PC·폰 × 한국어·영어(설정 창의 '문의' 칸과 걸린 말 막기, 문의 창, 이의 창), 차단된 사람의 접속 화면(사유·기간·이의 신청 → 보냄 → '이의를 냈습니다'). 콘솔 오류 0. 고친 것: 경보 표의 긴 소수, 문의 상세의 머리 줄 간격, 문의 창의 칸 간격. 스크린샷 `$TEMP/dg-work/ops5-tools/shots/`.
- **남은 것**: [making-a-game.md](making-a-game.md) 19절 '남은 것'(명령 결과 글은 한국어뿐, 롤백은 캐릭터 저장만, 통로 밖 변화의 '누구'는 켜져 있는 동안만, 의심 점수는 간단한 통계, 분석의 날은 UTC, 경보 규칙은 코드의 옵션). 사용자가 정할 것은 위 '사용자가 정할 것'의 마지막 줄.
- **합칠 때**: 공용 파일은 끝에 덧붙이기만 했다 — `SCHEMA`(끝 단계 하나), `MODULE_TABLE`(끝에 `support`)과 `RPG_MODULES`의 거르기, `scripts/admin.mjs`(도움말 끝, `ui`), `net/admin.ts`(역할·웹 길·`CmdOut`. 기존 명령 `who`·`flag`가 값을 함께 돌려준다), i18n ko·en(ui·fmt·msg의 끝, 파일 끝의 `koAdminPage`·`enAdminPage`, `mailTitle`의 두 갈래), `messages.ts`·`protocol.ts`의 끝, 문서. 다른 가지가 스키마 단계를 더했으면 순서만 맞추면 된다(시험은 길이로 본다).
