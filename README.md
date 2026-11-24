# 등불지기 (검증판)

브라우저에서 도는 쿼터뷰 로우폴리 MMORPG의 검증판. 지금 되는 것:

- 접속하면 무작위 이름으로 바로 들어가고, 화면 왼쪽 위의 이름을 눌러 바꾼다.
- 서로 보이고, 대화하고, 몬스터를 잡아 경험치와 불씨를 얻는다.
- 등탑 가까이에서 불씨를 바친다. 등탑 밝기(어스름, 보통, 환함)와 주민 되돌리기는 서버 전체가 함께 채운다.
- 월드는 두 구역이다: 서쪽의 등불 들판(첫불 마을)과 동쪽의 잿빛 숲. 구역마다 등탑이 있고, 잿빛 숲의 등탑은 꺼진 채로 시작해서 모두가 불씨를 바쳐 밝혀야 한다. 밝히면 그 숲에서 쓰러졌을 때 그곳에서 다시 일어난다.
- 잿빛 숲 깊은 곳에 필드 보스 '잿빛 트롤'이 있다. 맞서는 사람이 늘수록 체력이 늘고, 붉은 고리로 예고한 뒤 주변을 내려친다. 쓰러뜨리면 함께 싸운 모두가 보상을 받고, 5분 뒤에 다시 나타난다.
- 직업은 전사, 궁수, 마법사 세 가지다. 처음 접속하면 고르고, 등탑 가까이에서 바꿀 수 있다.
- 직업은 전사, 궁수, 마법사 셋이다. 마법사는 체력이 가장 적지만 서리로 적을 느리게 하고 치유의 빛으로 곁의 사람까지 살린다.
- 제작: 잿빛 숲의 몬스터가 재료(질긴 가죽, 쇳조각, 잿빛 핵)를 떨어뜨린다. 대장장이 브람이 돌아오면 그 곁에서 재료와 골드로 등불검을 싸게 만들거나, 제작으로만 얻는 잿불검을 만든다 (`games/deungbul/shared/content/craft.ts`, `engine/server/game/systems/craft.ts`).
- 파티: 다른 사람을 누르면 뜨는 단추로 초대한다(최대 4명). 파티원이 잡은 몬스터의 보상(경험치, 불씨, 골드, 재료, 퀘스트 진행)을 곁에 있는 파티원 모두가 받는다. 파티원의 체력이 내 정보 아래에 보이고 이름표가 하늘색으로 바뀐다 (`engine/server/game/systems/party.ts`).
- 운영 기본기: 대화의 금칙어는 별표로 가려지고, 금칙어가 든 이름은 쓸 수 없다. 다른 사람을 누르면 대화 차단(내 화면에서만)과 신고를 할 수 있다. 신고는 상대의 최근 대화와 함께 저장소에 기록만 하고, 제재는 사람이 보고 정한다 (`engine/server/net/moderation.ts`).
- 메인 퀘스트 1~4장이 처음 접속한 사람에게 할 일을 차례로 알려 준다. 3장은 잿빛 숲의 등탑을 켜고 잿빛 트롤까지 이끌고, 4장(등탑지기 할멈)은 안개 습격을 함께 막아 내는 것으로 끝난다. 목적지는 빛기둥과 화살표로 표시되고, 퀘스트 창을 누르거나 F 키를 누르면 목적지까지 걸어간다 (도착한 뒤의 전투는 직접 한다).
- 채널 (`systems/channels.ts`, 층 번호의 뜻은 `engine/server/game/layers.ts`, 수치는 `games/deungbul/shared/content/social.ts`의 `CHANNEL`): 같은 들판을 세 벌로 돌린다. 채널이 다르면 서로 보이지 않고 싸우지 않으며, 몬스터(무리와 필드 보스)도 채널마다 따로 살고 따로 되살아난다.
  - 접속하면 붐비지 않는(30명 미만) 채널 가운데 번호가 가장 낮은 곳에 선다. 사람이 적을 때는 모두 1채널에 모이고, 모든 채널이 붐비면 가장 적은 곳으로 간다. 봇은 고르게 나눈다.
  - 내 정보 창의 선택 상자("1채널 · 12명")로 채널을 옮긴다. 자리는 그대로이고 층만 바뀐다. 던전 안, 최근 5초 안에 맞거나 때렸을 때, 지난 이동에서 10초가 지나지 않았을 때, 대상 채널이 50명으로 가득 찼을 때는 옮길 수 없다.
  - 등탑의 밝기, 주민, 오늘의 등탑지기, 길드, 순위, 우편, 거래소, 대화는 모든 채널이 함께 쓴다. 던전에서 나오면 들어가기 전의 채널로 돌아오고, 자리 비움 자동 사냥 중인 캐릭터는 있던 채널에 남는다. 파티원이 다른 채널에 있으면 파티 목록에 채널이 적힌다.
  - 안개 습격: 등탑의 내구는 하나이고, 적은 등탑 근처에 사람이 있는 채널마다 그 인원에 맞게 따로 온다. 어느 채널의 적이든 같은 내구를 깎고(내구는 싸우는 채널 수만큼 크다), 모든 채널의 적을 쓰러뜨려야 막아 낸 것이다. 적이 남은 채널은 안내문과 선택 상자("2채널 · 8명 · 적 5")가 알려 준다.
  - 필드 보스는 채널마다 따로다. 체력은 그 채널에서 맞서는 사람 수만 따르고, 나타나고 쓰러진 소식은 그 채널에만 알린다.
  - 아무도 없는 채널의 몬스터는 쉰다(되살아나는 시간만 흐른다). 채널 수를 늘려도 틱 비용은 사람이 있는 채널만큼만 든다.
  - 층(`Ent.layer`)의 번호: 0부터는 들판의 채널(채널 n = 층 n-1), 1000부터는 던전 인스턴스. 코드는 숫자를 직접 비교하지 않고 `isField`, `channelOf`, `fieldLayer`를 쓴다.
- 던전 (`systems/dungeon.ts`, 내용은 `games/deungbul/shared/content/dungeons.ts`): 잿빛 숲 등탑 옆의 문에서 '잿빛 지하묘'로 들어간다. 레벨 8부터, 하루 3번, 제한 시간 10분.
  - 들어간 사람과 그 파티만의 인스턴스가 생긴다. 같은 지형을 여러 무리가 동시에 쓰지만 층(`Ent.layer`)이 달라 서로 보이지 않고 싸우지 않는다.
  - 무리 넷과 우두머리(지하묘의 주인)가 있고, 잡은 몬스터는 다시 나오지 않는다. 우두머리를 잡으면 안에 있는 모두가 우편 보상과 희귀 이상의 장비를 받고 30초 뒤 문 앞으로 나온다.
  - 안에서 쓰러지면 던전 입구에서 일어난다. 제한 시간을 넘기거나 모두 나가면 인스턴스가 사라진다. 접속이 끊기면 문 앞으로 나온 뒤에 저장된다.
  - 지역(`games/deungbul/shared/content/map.ts`의 `AREAS`)은 서로 떨어져 있어 걸어서 넘을 수 없고, 길찾기 격자는 모든 지역을 덮는다. 던전을 더하려면 `AREAS`에 네모를, `DUNGEONS`에 정의를, 언어 파일에 이름을 더한다.
- 장비는 모두 낱개다 (`systems/gear.ts`): 무기·갑옷·반지·목걸이·부적 다섯 칸. 상점에서 산 무기·갑옷은 옵션 없는 '보급형'으로 가방에 들어와 바로 끼고(강화는 +5까지), 대장간에서 만든 것은 옵션은 없지만 +10까지 강화되며, 몬스터가 떨어뜨린 것은 등급에 따라 옵션이 붙는다. 무기와 갑옷을 강화하면 단계마다 10%가 장비 옵션의 합에 더해지고, 그 합이 무기·갑옷의 기본 수치와 곱해진다(예: +75% 무기를 +5로 강화하면 1.75 × 1.375 = 2.41배). 들고 있는 무기는 빼거나 팔 수 없다(다른 무기를 끼면 바뀐다). 예전에 저장된 캐릭터는 접속할 때 들고 있던 무기와 갑옷이 기본 장비로 바뀐다.
- 거래소 (`systems/market.ts`, 수치는 `games/deungbul/shared/content/social.ts`의 `MARKET`, 메뉴의 거래소 탭): 끼고 있지 않은 장비(보급형 제외)와 제작 재료 묶음을 골드 값을 매겨 올리고, 다른 사람이 산다. 어디서나 쓸 수 있다. 올리는 순간 물건은 가방에서 빠져 거래소가 맡는다. 값은 2~1,000,000골드, 한 사람이 8개까지, 48시간 동안 올라가 있다. 올리고 사는 것은 레벨 8부터다(막 만든 캐릭터의 출석·방치 골드를 거래로 한 캐릭터에 모으지 못하게. 둘러보기는 누구나 된다). 팔리면 수수료 5%(올림, 적어도 1골드)를 뗀 금액이 판매자에게 우편으로 가고, 기간이 지나면 물건이 우편으로 돌아간다. 산 물건이나 내린 물건이 가방에 들어가지 않으면(장비 가방이 가득 참, 재료 한도 초과) 넘는 만큼은 우편으로 간다. 자기 물건은 살 수 없고, 재료 묶음은 통째로만 산다. 판매자가 접속해 있지 않아도 되도록 사람을 저장 키(`Ent.pid`)로 가리키고, 거래소는 월드와 함께 저장된다. 손님(저장되지 않는 접속)은 둘러보기만 할 수 있다. 목록은 칸 종류로 거르고 최신순·싼 순·비싼 순으로 20개씩 본다. 1:1 직접 교환은 없다.
- 우편에 물건이 붙는다 (`systems/mail.ts`): 보상(`Reward`)에 장비(`gear`)와 아이템(`items`)을 넣을 수 있다. 받을 때 가방이나 한도가 모자라면 받은 것만 빠지고 나머지는 우편에 남는다. 접속해 있지 않은 사람에게는 `g.mail.sendTo(pid, 종류, 값, 보상)`으로 보내면 월드 저장에 맡아 두었다가 그 사람이 접속할 때 우편함에 넣는다. 우편함이 30통을 넘으면 오래된 보상 우편부터 밀려나지만, 거래로 생긴 우편(물건이 붙었거나 판 값이 든 것)은 밀려나지 않는다.
- 악용 막기 (서버 허점 검토에서 재현된 것들. 재현 테스트는 `engine/test/security.test.ts`):
  - 깨진 주소의 HTTP 요청, 처리기나 틱 안의 예외로 서버가 꺼지지 않는다 (요청·메시지·틱을 각각 감싸고, 놓친 예외는 기록만 한다).
  - 같은 캐릭터로 다시 접속해 밀려난 옛 연결은 캐릭터와 끊어져, 명령을 보내거나 저장을 되돌리지 못한다.
  - 이동: 걸어서 갈 수 없는 다른 지역을 찍으면 지금 지역 안으로 맞추고, 길찾기는 한 틱에 살펴볼 칸 수에 한도가 있다. 이동 명령은 버리지 않되(빠르게 두 번 찍으면 마지막 것이 목적지다) 길을 처음부터 다시 세우는 일에만 간격을 둔다.
  - 자리 비움 사냥은 직업을 고르고 레벨 3 이상인 캐릭터만, 서버 전체 60명·한 주소 3명까지 남는다(`engine/shared/auto.ts`의 `AWAY`). 조건이 안 되면 자동 사냥을 켤 때 그렇게 안내한다. 남은 캐릭터도 접속 상한에 센다.
  - 연결: 10초 안에 접속 절차를 밟지 않으면 끊고, 한 주소에서 12개까지만 받는다 (터널 뒤에서는 `CF-Connecting-IP`로 본다). 이진 프레임도 속도 제한에 센다.
  - 직업을 바꿔도 기술 쿨다운은 남는다. 파티의 처치 나눔과 초대는 같은 층에서만 된다. 살아 있는 초대는 다시 보내지 않는다(초대 창 도배 방지).
  - 이름: 눈에 보이지 않는 글자를 지우고 전각 글자를 보통 글자로 맞춘다(한글 낱글자 자모 'ㅋㅋ', 'ㅠㅠ'는 그대로 둔다). 접속해 있든 아니든 남의 이름으로는 바꿀 수 없다(`Store.keyOfName`). 금칙어 검사도 같은 다듬기를 거치고, 낱말 사이의 공백·물음표·하이픈·숫자에 걸친 것은 가리지 않는다.
  - 아무것도 하지 않은 새 캐릭터는 저장하지 않는다 (토큰만 바꿔 접속해 저장 파일을 불리지 못하게). 이름을 지은 사람은 저장한다.
  - 습격의 인원은 등탑 곁에 서 있는 사람이 아니라 최근 30초 안에 스스로 움직인(명령을 냈거나 몬스터를 때린) 사람으로 센다. 물결마다 다시 세어 늘리기만 한다. 아무도 움직이지 않았으면 사람이 가장 많은 채널 하나에 1명 몫으로 연다.
  - 막을 적이 있는데 30초 동안 아무도 움직이지 않은 채널은 버려진 것으로 보고 끝낸다. 남은 적은 등탑을 한 번 치고 사라지며, 그 피해는 그 채널이 보탠 내구를 넘지 않는다. 모든 채널이 버려졌으면 진 것이다.
  - 필드 보스의 인원은 36m 안에서 최근 20초 안에 보스를 때린 사람이다(보스가 노리는 사람은 때리지 않아도 센다). 빠진 사람은 보상도 받지 못한다. 체력은 사람별 피해 기록으로 다시 구해서, 한 대 치고 떠나도 남이 깎아 둔 체력은 그대로다.
  - 대화·이름 바꾸기·신고의 간격과 신고에 붙는 최근 대화는 연결이 아니라 사람(저장 키, 손님은 접속 주소)에 붙는다. 대화는 한 주소에서 초당 3줄(한꺼번에 6줄), 서버 전체로 초당 20줄(한꺼번에 40줄)까지만 전한다.
  - 나갔다가 5분 안에 다시 접속하면 체력, 기술 쿨다운, 물약 대기가 이어진다(쿨다운은 떠나 있던 만큼 줄어든다). 채널 이동 대기와 싸우는 중 판정도 재접속으로 지워지지 않는다.
  - 순위와 오늘의 등탑지기는 이름이 아니라 저장 키로 사람을 구분한다. 손님은 오르지 않고, 화면에는 저장 키를 보내지 않는다.
  - 자리 비움 사냥은 하루(자정 기준) 누적 8시간이다. 다 쓴 날은 자동 사냥을 켠 채 끊겨도 캐릭터가 남지 않는다.
  - 거래소: 물건이 붙은 우편이 30통 이상이면 올리기와 사기를 막는다(내리기와 기간 만료는 된다). 전체 물건 수는 2000개까지다.
  - 길드 초대는 같은 채널의 30m 안에서만 된다. 거절당했거나 받지 않은 채 사라진 길드·파티 초대는 30초 뒤에 다시 보낼 수 있다.
  - 채널의 `hard`(50)는 옮겨 올 수 없는 인원이다. 접속하는 사람은 이 수와 무관하게 세우므로, 서버가 가득 차면 채널마다 이 수를 넘을 수 있다.
  - 깨진 저장 값: 일일 진행과 출석 일수, 장비 옵션의 범위를 맞추고, 월드 저장의 한 칸이 깨져도 서버는 뜬다. 가방 한도를 넘게 저장돼 있으면 끼고 있던 장비부터 남긴다.
- 서버를 끄고 켤 때는 `bash scripts/restart.sh`를 쓴다: `data/stop.flag` 파일을 만들어 서버가 저장하고 끄게 한 뒤 다시 띄운다. 강제 종료(`taskkill /F`)는 마지막 저장 뒤의 진행을 잃고, 거래 직후라면 물건이 복사되거나 사라질 수 있다.
- 캐릭터를 저장하는 곳(접속, 접속 끊김)에서도 월드에 저장할 것이 있으면 함께 저장하고, 월드 저장이 실패하면 다음 틱에 다시 시도한다.
- 월드가 저장될 때 바뀐 캐릭터도 함께 저장한다: 거래소에 맡긴 물건과 캐릭터의 소지품이 어긋난 채로 서버가 죽어 물건이 복사되는 일을 막는다.
- 길드 (`systems/guild.ts`, 수치는 `games/deungbul/shared/content/social.ts`, 메뉴의 길드 탭): 레벨 5·골드 500으로 만들고, 길드장이 상대를 눌러 초대한다. 탈퇴, 추방, 공지, 길드 대화(대화창에 `/g 내용`). 골드를 기부하면 길드 레벨이 오르고(2000골드마다, 최대 10) 레벨마다 길드원의 처치 경험치가 2%씩 늘어난다. 이름표에 길드 이름이 붙는다. 길드원은 접속해 있지 않아도 남으므로 사람을 저장 키(`Ent.pid`)로 가리키고, 길드는 월드와 함께 저장된다. 손님(저장되지 않는 접속)은 가입할 수 없다. 길드장이 나가면 가장 많이 기부한 사람이 잇고, 모두 나가면 사라진다.
- 성장 선택 (`systems/build.ts`, 메뉴의 성장 탭): 레벨이 오를 때마다 능력치 3점을 받아 힘(공격 피해 +1%), 체력(최대 체력 +8), 행운(치명타 +0.4%) 가운데 나눠 찍는다. 골드를 내고 모두 돌려받을 수 있다. 기술은 골드로 5단계까지 강화한다(단계마다 피해·회복 +12%, 4레벨마다 한 단계씩 풀린다). 찍을 점수가 남아 있으면 메뉴 단추가 금색이 된다.
- 성장의 틀 (메뉴 단추나 M 키. 수치는 모두 `games/deungbul/shared/content/growth.ts`의 잠정값이다):
  - 드롭 장비 (`systems/gear.ts`): 몬스터가 6% 확률로(보스는 반드시) 무기·갑옷·반지·목걸이·부적 가운데 하나를 떨어뜨린다. 등급 네 가지(옵션 1~4개), 옵션은 공격 피해·받는 피해·치명타·체력 중에서 무작위. 끼기, 빼기, 팔기, 강화(+10까지, 실패해도 골드만 든다).
  - 우편 (`systems/mail.ts`): 보상을 우편으로 보내 두면 열어서 받는다. 새 보상은 `g.mail.send()`만 부르면 된다.
  - 방치 보상 (`systems/idle.ts`): 10분 이상 접속하지 않으면 그 시간만큼(최대 8시간) 골드·경험치·불씨가 우편으로 온다. 자리 비움 자동 사냥으로 서버가 대신 사냥한 시간은 들지 않는다.
  - 일일 임무와 출석 (`systems/daily.ts`): 임무 세 가지(처치, 바치기, 강화)의 진행을 세고 채우면 보상이 우편으로 온다. 그날 첫 접속에 출석 보상(7일 주기)이 온다.
  - 순위 (`systems/rank.ts`): 전투력(레벨, 무기·갑옷 등급, 낀 드롭 장비, 기술 강화 단계)으로 줄을 세운다. 월드와 함께 저장한다.
  - 시스템이 캐릭터에 저장할 것은 `g.saves`에 등록한다 (`PlayerSave.ext`). 특정 플레이어에게만 보낼 메시지는 `g.out`에 넣는다.
- 효과음 (`engine/client/sound.ts`): 파일 없이 소리 합성으로 낸다. 타격, 치명타, 피격, 처치, 기술, 레벨 업·완료, 줍기, 나쁜 소식. 내 정보 창의 '소리 켬/끔' 단추로 끄고, 그 선택은 브라우저에 남는다.
- 끊기면 스스로 다시 접속한다 (2초에서 시작해 15초까지 간격을 늘린다. 화면이 꺼져 있으면 켜질 때 시도한다). 다른 곳에서 접속해 밀려났거나 서버가 가득 찼을 때는 혼자 다시 붙지 않는다.
- 좁은 화면(폰 세로)에서는 등탑·상점·대장간 창 가운데 가장 가까운 것 하나만 보인다 (`hud/near.ts`).
- 홈 화면 아이콘과 웹 앱 정보 (`games/deungbul/client/public/`의 `icon-*.png`, `manifest.webmanifest`).
- 타격감 (`engine/client/fx.ts`): 맞는 순간 모델이 하얗게 번쩍이고 뒤로 움찔하며, 맞은 자리에서 불티가 튄다. 내가 때리거나 맞을 때는 화면이 살짝 흔들리고(치명타는 더 크게), 남의 싸움은 작게 보인다. 화살과 마법은 날아가 닿는 순간에 터진다. 쓰러지는 몬스터는 먼지를 흩뿌린다. 기기의 '동작 줄이기' 설정이 켜져 있으면 화면은 흔들리지 않는다. 전부 화면 연출이고 서버 규칙은 그대로다.
- 다시 접속하면 마지막으로 있던 자리에서 시작한다 (자리와 자동 사냥 켬 여부를 캐릭터와 함께 저장한다). 서버를 다시 띄워 자리 비움 사냥이 끊겼어도, 돌아오면 그 자리에서 자동 사냥이 켜진 채로 이어진다. 쓰러졌을 때만 등탑 앞에서 일어난다.
- 잿빛 숲 등탑 곁에도 상인이 선다 (`games/deungbul/shared/content/items.ts`의 `SHOPS`). 파는 물건은 첫불 마을과 같다. 상인을 더하려면 `SHOPS`에 한 줄 더한다.
- 자리 비움 자동 사냥: 자동 사냥을 켠 채 접속이 끊기면(창을 닫음, 폰 화면이 꺼짐) 캐릭터가 월드에 남아 서버가 이어서 사냥한다 (`engine/server/game/systems/away.ts`). 다시 접속하면 그 캐릭터를 그대로 이어받고 자동 사냥도 켜진 채이며, 그동안 얻은 불씨와 골드를 알려 준다. 쓰러지면 등탑에서 일어나 자리를 비운 곳으로 돌아간다. 최대 8시간(`AWAY_MAX_S`)이 지나면 저장하고 나간다. 서버를 다시 띄우면 저장만 남고 사냥은 이어지지 않는다. 직접 움직여 자동 사냥이 꺼진 상태로 나가면 평소처럼 나간다.
- 자동 사냥: 기술 단추 위의 '자동 사냥' 단추나 R 키로 켜고 끈다. 가까운(40m 안) 몬스터를 골라 공격하고, 기술과 회복, 물약을 알아서 쓴다. 직접 움직이거나 멈추면 꺼진다. 클라이언트가 사람과 같은 명령을 보내는 방식이라 서버 규칙은 그대로다. 테스트 편의용으로 넣었고, 출시판에 둘지는 정하지 않았다.
- 갑옷은 받는 피해를 줄인다: 가죽 갑옷(상점 80골드, -12%), 쇠 갑옷(-24%, 브람이 돌아온 뒤 상점 240골드 또는 대장간에서 쇳조각 5·질긴 가죽 6·60골드). 사거나 만들면 바로 갈아입고, 더 낮은 등급은 살 수 없다. 입으면 겉모습도 바뀐다: 가죽 갑옷은 갈색 가슴받이와 허리띠, 쇠 갑옷은 회색 가슴받이에 어깨받이가 붙고, 다른 사람에게도 그렇게 보인다.
- 가방: 내 정보 창의 '가방' 단추나 B 키로 연다. 든 무기, 입은 갑옷, 물약, 제작 재료 수량을 어디서나 볼 수 있다.
- 작은 손질: 같은 알림 문장은 떠 있는 동안 다시 쌓이지 않는다. 신고는 한 번 더 눌러야 접수된다. 직업 바꾸기 창에 지금 직업이 표시된다. 다음 습격 안내에 내일인지와 하루 중 열리는 시간대가 함께 나온다. 장을 마쳤는데 그 주민이 아직 돌아오지 않았으면 완료 알림에 되돌리는 방법이 붙는다.
- 불씨는 1개, 5개, 전부 단위로 바치거나 보탤 수 있다 (가진 것보다 많이 고르면 가진 만큼만).
- 미니맵 (PC 전용, 오른쪽 아래): 나를 가운데에 두고 주변 70m를 화면과 같은 방향으로 그린다. 등탑(네모, 꺼져 있으면 회색), 퀘스트 목적지(고리), 파티원은 범위 밖이어도 가장자리에 붙어서 방향을 알려 준다. 폰에서는 자리가 없어 숨기고 '마을로' 단추로 대신한다.
- 전체 지도 (N 키, 미니맵을 누르거나 '지도' 단추. 폰에서도): 내가 있는 지역(들판 또는 던전) 전체를 한 장에.
  - 보이는 것: 구역 이름, 길·연못·집·나무·바위, 등탑(밝기), 퀘스트 목적지, 상인, 대장간(잠김), 던전의 문, 사냥터(몬스터와 수, 한 마리의 경험치·골드), 우두머리, 눈에 보이는 몬스터와 사람, 파티원, 내 위치와 바라보는 쪽, 걸어가는 길(점선)과 목적지(✕), 축척.
  - 다루기: 휠·+/−·두 손가락으로 확대, 끌어서 옮기기, '내 위치'. PC에서는 표식 위에 마우스를 올리면 이름이 뜬다. 빈 땅을 누르면 그곳으로 걷고, 표식을 누르면 정보 카드(설명, 거리, 걸어서 걸리는 시간)가 열린다.
  - 장소 목록: 갈래별(목적지, 거점, 던전, 우두머리, 상점, 대장간, 사냥터)로 가까운 차례. 거리가 계속 바뀐다.
  - 자동 이동: '여기로 자동 이동'은 길을 찾아 걸어가고 도착하면 알린다. 사냥터와 우두머리의 '가서 자동 사냥'은 도착하면 자동 사냥을 켠다. 가는 동안 지도 위에 '자동 이동 중'과 멈추기 단추가 있고 '지도' 단추가 금빛이 된다. 직접 움직이면 그친다.
- 이름표가 겹치면 가까운 쪽부터 놓고 나머지를 위로 밀어 올린다. 피해 숫자는 좌우로 번갈아 벌어져 뜬다 (여럿이 한 점에 몰리는 보스전에서 읽을 수 있게).
- 영어 화면 손질: 짧은 숫자 표시가 낱말 중간에서 끊기지 않게 했고, 길어서 넘치던 문구(조작 안내, 기술 이름, 습격 안내)를 줄였고, 차단·신고 안내 문장을 다듬었다.
- 등탑이 이미 가장 밝아도 불씨를 바칠 수 있다 (한 번에 5개까지). 밝기는 오르지 않지만 기여와 퀘스트에는 세어진다. 등탑이 가득 찬 서버에 새로 온 사람이 '등탑에 바치기' 단계에서 막히지 않게 하려는 것이다.
- 마을로: '마을로' 단추나 H 키를 누르면 첫불 마을 등탑 앞까지 걸어간다 (물약 보충, 불씨 바치기).
- 폰 화면: 가로에서는 대화창이 조이스틱과 기술 단추 사이 아래에 두 줄로 놓이고, 등탑·상점·대장간 창이 열려 있는 동안 퀘스트는 한 줄로 줄어 대화창 위에 남는다. 세로에서는 창의 설명 글을 빼서 퀘스트와 대화가 함께 보인다. 홈 화면에 추가하면 주소창 없이 전체 화면으로 열린다.
- 남의 입장·퇴장 소식은 대화창에 쓰지 않는다. 바칠 불씨가 없으면 퀘스트 창이 몬스터를 잡아 모으라고 알려 준다.
- 집에서 멀리 끌려 나온 몬스터는 집에 도착할 때까지 아무도 쫓지 않는다 (돌아서자마자 다시 대상을 잡아 얼어붙던 문제를 막는다).
- 몬스터를 잡으면 골드도 얻는다. 마을의 길 상인에게서 무기와 물약을 산다. 주민이 돌아오면 상점 물건이 늘어난다.
- 등탑지기 할멈이 돌아오면 등탑에 '오늘의 등탑지기' 명단이 걸리고, 지금까지 바친 불씨에 따라 기여 단계 보상(골드)을 받는다.
- 접속을 끊고 쉬면 휴식 보너스가 쌓여서, 다음에 잡는 몬스터의 경험치를 2배로 받는다 (등불 맡기기).
- 낮 12시·3시·6시와 저녁 8~11시 정각마다(하루 7번, `RAID.hours`) 안개 습격이 온다. 막으면 밝기가 오르고, 못 막으면 내려간다(-10). 등탑 근처에 사람이 없으면 열리지 않고, 적의 수는 봇을 뺀 사람 수를 따른다. 습격으로 온 적은 이름 앞에 '안개'가 붙는다.
- 알림은 세 곳으로 나뉜다: 놓치면 안 되는 소식은 가운데 알림, 방금 한 일의 결과는 잠깐 떴다 사라지는 한 줄, 대화창에는 사람들의 말과 큰 소식만 남는다 (`engine/client/hud/notify.ts`).
- 캐릭터와 등탑 상태는 `data/game.db`(SQLite)에 저장되어 서버를 다시 켜도 남는다.
- 한국어와 영어를 지원한다. 브라우저 언어를 따르고, 화면에서 바꿀 수 있다.

계정은 아직 없다. 브라우저가 간직하는 비밀 값(토큰)으로 캐릭터를 이어받으므로, 브라우저 저장소를 지우거나 다른 기기에서 들어오면 새 캐릭터가 된다.

## 실행

```
npm install
npm run dev        # 개발: 서버(3001) + 클라이언트(5173), 파일을 고치면 바로 반영
```

브라우저 창 두 개에서 http://localhost:5173 을 연다.

빌드본으로 한 포트에서 돌리려면:

```
npm run build
npm start          # http://localhost:3001
```

환경 변수 (PowerShell은 `$env:BOTS=20; npm start`):

| 변수 | 뜻 |
|---|---|
| `PORT=3001` | 포트 |
| `BOTS=20` | 돌아다니며 싸우는 봇 수 |
| `DB=경로` 또는 `DB=memory` | 저장 파일. `memory`면 저장하지 않는다 |
| `RAID_EVERY_MIN=5` | 습격을 시각표 대신 5분마다 연다 (확인용) |
| `DEV_SPAWN=-24,24` | 등탑 대신 그 좌표에서 접속한다 |
| `METRICS=10` | 10초마다 서버 지표(틱 시간, 전송 시간, 전송량)를 한 줄로 찍는다 |

- 주소 뒤에 `?lang=en`을 붙이면 그 언어로, `?auto=이름`을 붙이면 처음 접속할 때 그 이름을 쓴다.
- 진행을 초기화하려면 서버를 끄고 `data/` 폴더를 지운다.
- 서버는 Ctrl+C로 끄면 전원과 등탑 상태를 저장하고 종료한다.
- 같은 공유기의 폰에서는 `http://<이 PC의 IP>:3001` 로 접속한다. Windows 방화벽이 포트를 막으면 허용해야 한다.

## 파일럿 배포

지금 쓰는 방식: 화면은 GitHub Pages, 게임 서버는 이 PC(임시 터널).

- 화면 주소(바뀌지 않는다): https://indie-craft-codes.github.io/deungbul-play/
- 켜는 법: 게임 서버를 켜 두고(`npm start`) `npm run pilot`을 돌린다 (`scripts/pilot.mjs`).
  1. 화면을 빌드해 공개용 저장소 `indie-craft-codes/deungbul-play`(빌드 결과만 들어 있다)에 올린다. 소스 저장소 `indie-craft-codes/deungbul`은 비공개다.
  2. cloudflared로 임시 주소(`https://....trycloudflare.com`)를 받는다.
  3. 그 주소를 `server.json`에 적어 함께 올린다. 화면은 접속할 때마다 이 파일을 읽어 서버를 찾는다 (`engine/client/net.ts`).
- 터널을 켜 둔 채 화면만 다시 올리려면 `npm run build` 뒤에 `bash scripts/publish.sh`.
- `npm run pilot` 창을 닫거나 PC를 끄면 외부 접속이 끊긴다. 다시 켜면 임시 주소는 바뀌지만 화면 주소는 그대로라서 폰의 홈 화면 아이콘은 계속 쓸 수 있다. 올린 뒤 반영까지 1~2분 걸린다.
- 무료 요금제에서는 비공개 저장소로 Pages를 쓸 수 없어서 저장소를 둘로 나눴다.
- 저장은 이 PC의 `data/game.db`다.
- 계정이 없다: 브라우저에 저장된 비밀 값으로 캐릭터를 이어받는다. 홈 화면 아이콘으로 연 것과 사파리로 연 것은 저장 공간이 달라 서로 다른 캐릭터가 된다.
- 다른 곳에 올릴 때: 서버가 `dist/`를 직접 내보내므로 Node 호스팅 한 곳이면 화면까지 함께 된다. 화면만 따로 빌드하려면 `VITE_SERVER_URL=wss://서버주소 npm run build`.

## 확인

```
npm test           # 모든 테스트: 틀의 시험(engine/test/) → 게임마다의 시험(games/<게임>/test/all.ts가 있는 게임 모두: 등불지기와 예제). test/all.ts가 차례로 돌린다
npm run test:engine   # 틀만 (게임 없이 시험용 내용 위에서 돈다)
npm run test:game     # 게임 하나만 (GAME, 기본 deungbul). 뒤에 시험 이름을 주면 고른 것만: npm run test:game -- quests
npx tsx test/all.ts boundary deungbul/quests fx/shop sample/docs   # 고른 것만. 틀의 경계 검사: boundary / 틀(시험용 내용 위, 앞에 fx/): engine/test/fx/all.ts의 FX
                                                    #           게임(앞에 <게임>/): 그 게임의 test/all.ts의 목록 (등불지기: framework baseline split shop classes combat craft party keepers quests nav zone2 channel ledger harden guide server)
npm run typecheck          # 전체(틀 + 등불지기), 등불지기의 설정, 틀만, 틀(시험용 내용), 틀(예제의 내용), 예제를 차례로 타입 검사한다
npm run typecheck:engine   # 틀만: engine/의 소스가 이 게임의 선언 없이 컴파일되는가 (npm test의 framework도 같은 검사를 돌린다)
npm run load       # 부하 측정: 가짜 접속자 50~500명을 붙여 서버 지표를 표로 출력 (약 4분)
```

부하 측정 결과와 인프라 구성은 [docs/infra.md](docs/infra.md)에 있다. 요약: 서버 한 대로 동시 접속 200명까지는 여유가 있고, 먼저 막히는 것은 전송이다.

## 구조

코드는 두 덩어리다: 다른 게임에서도 그대로 쓰는 **틀**(`engine/`)과 **이 게임**(`games/deungbul/`). 둘 다 안에 `server/`, `shared/`, `client/`, `test/`를 갖는다.

```
engine/                  틀: 이 게임을 모른다 (games/를 import하지 않는다)
  shared/                서버와 클라이언트가 함께 쓰는 것
    world.ts             엔진 상수와, 맵 정의로 장애물을 만드는 코드 (같은 시드로 같은 장애물)
    sim.ts               이동과 충돌 (서버 판정 = 클라이언트 예측)
    nav.ts               길찾기: 격자와 A*, 길을 따라 걷기 (서버와 클라이언트가 같은 코드)
    auto.ts              자동 사냥의 판단 (클라이언트의 자동 사냥 = 서버의 자리 비움 사냥)
    protocol.ts          주고받는 메시지
    messages.ts          서버 안내문의 종류 (문장은 클라이언트가 만든다)
    ext.ts               확장 지점: 게임이 선언 병합으로 넓히는 빈 인터페이스
    contract.ts          내용 계약: 게임의 내용이 갖춰야 하는 이름과 모양
    defs.ts              틀의 내용 통로: 아래 defs/의 타입·도우미 + 계약이 요구하는 게임의 내용(@game/shared/content)
    defs/                내용의 모양과 도우미: combat craft dungeons economy growth items map monsters social
  server/
    net/                 접속과 세션, 시야별 스냅샷, 금칙어와 신고, 정적 파일
    game/game.ts         게임의 중심: 엔티티, 시스템 묶음, 공용 통로(아래 '넓히는 방법')
    game/ext.ts          서버 쪽 확장 지점 (시스템 칸, 엔티티 칸, 사건, 규칙, 보정)
    game/systems/        표준 시스템: movement players combat classes monsters bots away party shop craft gear mail idle daily rank
                         build channels guild market ledger boss   인스턴스: dungeon
    store/               저장 계층 (메모리, SQLite. 나중에 PostgreSQL)
    text.ts              금칙어와 글 다듬기 (통신과 게임 규칙이 함께 쓴다)
  client/                화면의 틀
    main.ts              startClient: 바탕 메시지 처리와 프레임 루프 (게임의 진입점이 부른다)
    bus.ts               모듈이 스스로 끼어드는 자리 (서버 메시지, 프레임, 느린 주기, 단축키)
    modules.ts           틀의 덧붙는 기능 모듈의 목록
    rules.ts             화면 쪽 규칙의 접점 (서버의 g.rules와 짝)
    app.ts, state.ts     3D 화면과 클라이언트 상태
    net.ts               서버 연결
    entities.ts          내 캐릭터 예측, 다른 엔티티 보간, 사건 연출
    actions.ts auto.ts fx.ts input.ts sound.ts social.ts
    scene/view.ts        렌더러, 카메라, 빛, 지형        scene/models.ts   캐릭터와 몬스터 모델의 틀 (임시 도형)
    hud/                 내 정보(me), 대화창, 이름표, 가방, 메뉴, 상점, 대장간, 던전, 미니맵, 전체 지도(worldmap.ts), 붙는 자리(shell.ts)
    i18n/                틀의 문장(ko.ts, en.ts의 koBase·enBase)과 합치는 도구
    style.css            틀의 창의 스타일
  test/                  틀의 시험: 이름.test.ts(서버 없이 규칙만) + server.test.ts(통합), harness.ts(검사 기록, 가짜 클라이언트)
games/deungbul/          이 게임 (틀을 @engine/…으로 읽는다)
  server/
    main.ts              실행 진입점 (환경 변수, 저장소, 종료 처리). 규칙 플러그인을 깔아 틀의 startServer를 부른다
    deungbul.ts          규칙 플러그인(installDeungbul)과 서버 쪽 선언 병합
    systems/             이 게임의 규칙: tower raid keepers quests rest
  shared/
    deungbul.ts          공용 선언 병합: 이 게임의 안내문, 메시지, 공유 상태
    content/             게임 내용과 수치 (다른 게임은 여기를 갈아 끼운다)
      index.ts           틀이 읽는 것(계약)의 통로
      map.ts             맵: 범위, 구역, 등탑, 빈터, 길, 나무 뿌리는 규칙
      combat.ts          직업과 기술 (효과의 종류, 겉모습)
      monsters.ts items.ts craft.ts dungeons.ts party.ts social.ts economy.ts
      growth.ts          장비, 강화, 우편, 방치 보상, 일일 임무, 순위의 수치
      quests.ts residents.ts tower.ts raid.ts     이 게임에만 있는 내용 (계약 밖)
    defs.ts, world.ts    이 게임의 통로: 틀의 통로 + 이 게임에만 있는 내용. 게임의 파일은 여기서 읽는다
  client/
    index.html           게임의 머리(제목, 아이콘, manifest)와 진입점. body의 마크업은 아직 틀의 뼈대다
    main.ts              진입점: 겉모습과 모듈 목록을 들고 틀의 startClient를 부른다
    deungbul.ts state.ts words.ts markup.ts deungbul.css
    hud/                 등탑 창, 습격·구역 알림, 퀘스트, 미니맵 표식(marks.ts), 도감 단추
    scene/               땅·잎·미니맵 바탕(paint), 분위기(scene), 건물(scenery), 모델(models)
    i18n/                이 게임의 문장과 내용의 이름
    guide.html, guide/   도감
    public/              아이콘, manifest
  test/                  이 게임의 시험(all.ts가 목록), fixtures/(저장·문장 견본), load.ts(부하 측정)
  tsconfig.json          이 게임의 별칭(@game → games/deungbul). 시험과 서버가 이것으로 돈다
test/all.ts              모든 테스트를 차례로 돌린다: 틀의 시험, 그리고 게임마다 그 게임의 test/all.ts를 따로 된 프로세스로
scripts/                 restart.sh pilot.mjs publish.sh econ.ts
tsconfig.json            전체(틀 + 등불지기). 별칭 @engine/* → engine/*, @game/* → games/deungbul/*
tsconfig.engine.json     틀만 (engine/의 소스)
scripts/game.mjs         게임 하나를 골라 서버·화면 빌드·개발 서버를 돌린다 (npm start, npm run build, npm run dev가 이것을 부른다)
data/, dist/             저장 파일과 빌드 결과 (저장소 뿌리, git에 넣지 않는다)
```

원칙:

- 위치와 전투 결과는 서버만 정한다. 클라이언트는 하고 싶은 것만 보낸다.
- 서버는 높이 없이 X·Z 좌표와 원형 충돌체로 판정한다.
- 서버는 화면에 보일 문장을 보내지 않는다. 종류와 값만 보내고 문장은 클라이언트가 언어에 맞게 만든다.
- 게임 규칙은 통신과 저장을 모른다. `engine/server/game/`은 `net/`과 `store/`의 구현에 기대지 않는다.
- 틀은 이 게임을 모른다. 방향은 게임 → 틀 하나이고, 틀이 게임에서 읽는 것은 내용 계약의 이름뿐이다.

## 다른 게임으로 가져갈 때

틀(`engine/`)과 이 게임(`games/deungbul/`)이 폴더로 나뉘어 있어서, 게임 폴더를 새로 만들어 내용과 규칙만 채우면 이동·전투·자동 사냥·대화·파티·저장·화면 틀을 그대로 쓴다. 단계별 상태와 새 게임 폴더에 채울 것의 목록은 `docs/framework-status.md`에 있다.

- 그대로 쓰는 틀: `engine/` 전부. `engine/server/net`(접속, 스냅샷, 저장 주기), `engine/server/store`, `engine/server/game/game.ts`(명령·훅·보정 통로)와 표준 시스템(`movement` `combat` `monsters` `players` `party` `shop` `craft` `classes` `bots` `away` `gear` `mail` `idle` `daily` `rank` `build` `channels` `guild` `market` `dungeon` `boss` `ledger`), `engine/shared`(`nav.ts` `sim.ts` `world.ts` `protocol.ts` `auto.ts`와 내용의 모양·도우미 `defs/`), 클라이언트의 `net` `input` `actions` `auto` `fx` `entities` `hud/*` `i18n` `scene/*`.
- 갈아 끼우는 내용: 게임 폴더의 `shared/content/*` (맵은 `map.ts`, 직업과 기술은 `combat.ts`, 장비·우편·일일 임무의 수치는 `growth.ts`, 몬스터·아이템·제작·던전·채널·길드·거래소의 수치). 틀은 이것을 별칭 `@game/shared/content`로 읽고, 갖춰야 할 이름과 모양은 `engine/shared/contract.ts`가 컴파일할 때 검사한다. 어느 게임을 돌리는가는 `scripts/game.mjs` 한곳에서 고른다(인자나 환경 변수 `GAME`, 기본 `deungbul`): 그 게임 폴더의 `vite.config.ts`와 `tsconfig.json`(있으면)이 별칭 `@game`을 정한다. 그 밖에 게임이 채우는 것: 언어 파일(`client/i18n/`), 모델과 건물(`client/scene/`), 규칙 플러그인(`server/`), 진입점 둘(`server/main.ts`, `client/main.ts`와 `index.html`).
- 직업의 겉모습도 데이터다 (`ClassDef`의 `hand`, `shot`, `hitColor`): 손에 든 것의 모양, 날아가는 화살·불꽃, 불티 색, 무기 이름(검/활/지팡이)을 코드가 직업 이름으로 가르지 않는다. 새 직업은 `CLASSES`와 언어 파일에만 더한다.
- 서버 시스템은 필요한 것을 생성자에서 스스로 등록한다: 명령(`g.commands`), 사건(`g.on`), 수치 보정(`g.mods`), 주기 처리(`g.ticks`), 캐릭터 저장(`g.saves`), 월드 저장(`g.worldSaves`), 공유 상태(`g.shared`), 개인 상태(`g.personal`), 개인 메시지(`g.out`). 틀의 시스템을 더하거나 뺄 때 `game.ts`에서 고칠 곳은 생성 한 줄뿐이고, 게임의 시스템은 게임의 플러그인이 깐다.
- 클라이언트의 덧붙는 기능은 init 함수 하나로 만들어, 틀의 것이면 `engine/client/modules.ts`에, 게임의 것이면 게임의 진입점(`games/deungbul/client/main.ts`)의 `modules` 목록에 한 줄을 더한다. 그 안에서 필요한 것을 스스로 등록한다: 서버 메시지(`bus.onMsg`), 매 프레임(`bus.onFrame`), 느린 주기(`bus.onSlow`), 단축키(`bus.onKey`), 언어 변경(`onLangChange`). 틀의 `main.ts`의 메시지 처리와 프레임 루프는 고치지 않는다. 가방, 메뉴, 미니맵, 자동 사냥이 이 방식이다.
- 자동 사냥의 판단(무슨 기술을 쓸지, 언제 물약을 마실지)은 `engine/shared/auto.ts`에 한 번만 적혀 있고, 클라이언트의 자동 사냥과 서버의 자리 비움 사냥이 함께 쓴다.
- 기술은 이름이 아니라 효과의 종류(`SkillEffect`: 한 대상 피해, 범위 피해(+느려짐), 회복)로 처리한다. 새 기술은 `SKILL_DEFS`에 한 줄 더하면 서버·자동 사냥·이펙트가 함께 따라온다.
- 이 게임에만 있는 규칙: 시스템 `tower` `raid` `keepers` `quests` `rest`와 화면의 등탑 창·퀘스트 창·습격 알림. 틀은 등탑을 직접 알지 않는다. 일어나는 자리, 이동 속도, 직업을 바꿀 수 있는 곳, 물건의 잠금, 습격 적이 향하는 곳은 `g.rules`(`engine/server/game/game.ts`의 `Rules`)를 거치고, 등탑과 습격 시스템이 그 값을 채운다. 등탑이 없는 게임은 이 플러그인을 깔지 않으면 기본 규칙(정해진 자리에서 일어남, 기본 속도, 잠금 없음)으로 돈다. 화면 쪽도 같다: 틀은 `engine/client/rules.ts`에 묻고 게임의 모듈이 채우며, 건물·땅 색·분위기·미니맵 표식·모델은 게임이 넘기거나 등록한다(아래 '틀과 이 게임의 규칙'). 필드 보스(`boss`)는 이 게임의 id를 모르는 틀의 표준 시스템이고, 잿빛 트롤이라는 내용만 게임의 것이다.
- 지역은 여럿일 수 있다(`MAP.areas`): 들판과 던전이 한 좌표계 안에 떨어져 놓이고 문으로 오간다. 인스턴스는 층(`Ent.layer`)으로 가른다. 들판은 채널(같은 들판을 여러 벌)로 나뉜다. 서버를 여러 대로 나누는 구조는 아직 없다.
- 아직 남은 것: 예제 게임과 만드는 법 문서가 없고(11단계), 화면의 뼈대(`index.html`의 body)는 게임 폴더의 파일에 들어 있으며, 틀에 이 게임의 색이 조금 남아 있다(두 번째 재화 '불씨' 등). 목록은 `docs/framework-status.md`.

## 넓히는 방법

**새 기능(서버 시스템)**: 어느 게임에나 쓸 것이면 `engine/server/game/systems/`에 파일을 만들고 `game.ts`의 생성자에 한 줄 추가한다. 이 게임에만 있는 규칙이면 `games/deungbul/server/systems/`에 만들고 플러그인(`games/deungbul/server/deungbul.ts`의 `installDeungbul`과 `GameSystems` 선언)에 한 줄씩 더한다. 시스템은 생성자에서 필요한 것을 스스로 등록하므로, 그 밖에 고칠 곳은 없다.

| 등록하는 곳 | 쓰임 |
|---|---|
| `g.commands.set('이름', 처리기)` | 플레이어 명령을 받는다. 통신 계층은 고치지 않는다 |
| `g.on('monsterKilled', ...)` | 다른 시스템의 사건에 반응한다 (사건의 목록은 `Hooks`) |
| `g.mods.provide('damage', ...)` | 수치에 보정을 건다 (피해, 받는 피해, 회복, 치명타, 체력, 불씨) |
| `g.ticks.push(fn)` | 틱마다 돈다 |
| `g.saves.push({ name, save, load })` | 캐릭터와 함께 저장한다 (`PlayerSave.ext[name]`) |
| `g.worldSaves.push({ name, save, load })` | 월드와 함께 저장한다 |
| `g.shared.push({ name, state })` | 모두에게 보내는 공유 상태의 한 칸 |
| `g.rules.respawn = ...` 등 | 틀의 기본 규칙을 바꾼다 (일어나는 자리, 속도, 잠금, 습격 적의 목표) |
| `g.notify(p, 종류, 값...)`, `g.announce(...)` | 안내문을 보낸다 |
| `g.out.push({ id, msg })` | 한 사람에게만 메시지를 보낸다 |
| `g.mail.send(p, 종류, 값, 보상)` | 보상을 우편으로 보낸다 |

틀의 우편(`engine/server/game/systems/mail.ts`)과 일일 임무(`daily.ts`), 이 게임의 휴식(`games/deungbul/server/systems/rest.ts`)이 짧은 예다.

**새 기능(클라이언트 화면)**: 파일을 만들고, 어느 게임에나 쓸 것이면 `engine/client/modules.ts`에, 이 게임의 화면이면 `games/deungbul/client/main.ts`의 `modules` 목록에 init 한 줄을 더한다. init 안에서 `bus.onMsg('종류', ...)`(서버 메시지), `bus.onFrame`, `bus.onSlow`, `onLangChange`에 등록한다. 틀의 `main.ts`는 고치지 않는다. 메뉴(`engine/client/hud/menu.ts`)와 등탑 창(`games/deungbul/client/hud/tower.ts`)이 예다. 화면에 보이는 문장은 언제나 언어 파일에 넣는다.

**화면 문장의 규칙**: 골드와 값처럼 큰 수는 언어 파일의 `num`(`fmt.num`)을 거쳐 자릿수 구분을 넣는다. 단축키처럼 PC에서만 뜻이 있는 부분은 문장 안에 `[[PC용|터치용]]`으로 적는다(터치용을 비우면 그 부분이 빠진다. 예: `'메뉴[[(M)|]]의 우편'`). 이 표시는 `t()`, `applyDom`, `notifySys`가 `forInput`으로 풀어 주므로, 표시가 든 문장은 `L().ui.x`로 직접 읽지 말고 `t('x')`로 읽는다. 조작 안내처럼 항목을 잇는 문장은 `keyHints([...])`로 만들면 줄이 항목 사이에서만 바뀐다.

**언어 파일의 틀과 게임**: 화면 문장은 틀의 몫과 이 게임의 몫으로 나뉜다. 틀의 문장은 `engine/client/i18n/ko.ts`·`en.ts`의 `koBase`·`enBase`(접속, 내 정보, 전투, 상점·제작·장비·우편·일일·순위·길드·거래소·채널·던전·자동 사냥, `engine/shared/messages.ts`의 안내문)이고, 이 게임의 문장(등탑, 바치기, 주민, 습격, 퀘스트, 등탑지기, 휴식, `games/deungbul/shared/deungbul.ts`의 안내문)과 내용의 이름(몬스터, 아이템, 직업, 기술, 던전, 일일 임무, 무작위 이름의 낱말)은 `games/deungbul/client/i18n/ko.ts`·`en.ts`에 있다. 틀의 문장이 문장 안에 넣는 이름(몬스터·아이템의 이름, 다시 일어나는 곳, 두 번째 재화 '불씨')은 게임이 넘기는 이름표(`ContentNames`)에서 읽으므로 `koBase`는 이름표를 받는 함수다. `games/deungbul/client/i18n/index.ts`가 `mergeLocale(koBase(koNames), koGame)`으로 한 묶음을 만들고(묶음별로 한 단계 합치고 같은 키는 게임이 이긴다), `games/deungbul/client/words.ts`가 모듈이 읽히는 때에 `setLocales(LOCALES)`로 틀에 등록한다. 도감과 시험은 `games/deungbul/client/i18n`에서 같은 묶음을 얻는다. `L()`·`t()`의 타입은 `EngineLocale & LocaleExt`이고, 게임이 `engine/client/i18n/ext.ts`의 `LocaleExt`를 선언 병합으로 넓힌다. 새 문장은 어느 게임에나 있을 것이면 틀의 파일에, 이 게임의 것이면 게임의 파일에 두 언어로 적는다. 틀의 문장을 이 게임의 말로 바꾸려면 게임의 파일에 같은 키로 적고 `games/deungbul/test/guide.test.ts`의 `OVERRIDES`에 더한다(목록에 없는 겹침은 실패한다). 문장을 바꾸거나 더하면 견본을 새로 뜬다: `npx tsx games/deungbul/test/locale-snapshot.ts --write`. 이 게임의 안내문을 어디에 어떤 소리로 알릴지는 `games/deungbul/client/words.ts`의 `addNotices`·`addMsgSounds`에 적는다(틀의 `engine/client/hud/notify.ts`·`sound.ts`에는 틀의 안내문만 있다). 틀의 언어·알림·소리 파일에는 이 게임의 낱말을 적지 않는다(`games/deungbul/test/split.test.ts`가 검사한다).

**메뉴 창**: 높이와 탭 줄·닫기 단추의 자리는 고정이고 내용만 스크롤한다. 탭을 더하려면 `hud/menu.ts`의 `TABS`에 더한다. 장비를 보여 줄 때는 `gearLabel`·`gearTitle`·`optsEl`을 써서 칸 이름 표, 합친 수치, 끊기지 않는 옵션 줄을 똑같이 맞춘다. 재료의 출처는 `hud/sources.ts`가 `DROPS`에서 읽어 만든다.

**틀과 이 게임의 규칙** (전체 계획: `docs/framework-plan.md`. 단계별로 끝난 것, 지금의 접점 목록, 남은 일: `docs/framework-status.md`)

*틀이 무엇이고 게임이 무엇인가*

- 코드는 폴더로 나뉜다. **틀**은 `engine/`: 서버의 `engine/server/game/game.ts`와 표준 시스템(이동, 전투, 몬스터, 상점, 장비, 우편, 일일 임무, 순위, 던전, 채널, 거래소, 길드, 필드 보스 등), 통신(`engine/server/net`)과 저장(`engine/server/store`), 공용 코드(`engine/shared`), 화면의 틀(`engine/client`), 틀의 시험(`engine/test`). **이 게임**은 `games/deungbul/`: 이 게임에만 있는 규칙(등탑, 습격, 등탑지기, 퀘스트, 휴식: `server/systems/`)과 그것을 까는 규칙 플러그인(`server/deungbul.ts`의 `installDeungbul`), 내용과 수치(`shared/content/`), 화면(`client/`), 도감(`client/guide/`), 서버와 화면의 진입점, 이 게임의 시험(`test/`).
- 방향은 게임 → 틀 하나다. 폴더를 넘는 import는 별칭으로 적는다: 게임은 틀을 `@engine/…`으로 읽고, 틀이 게임에서 읽는 것은 내용 통로 `@game/shared/content` 하나뿐이다(아래 '공용 내용과 계약'). 같은 폴더 안은 상대 경로로 읽는다. 별칭은 세 곳에서 같은 뜻이어야 한다: `tsconfig.json`의 `paths`(타입 검사), `vite.config.ts`의 `resolve.alias`(화면 빌드와 개발 서버), 그리고 서버와 시험을 돌리는 `tsx`(저장소 뿌리에서 실행하면 `tsconfig.json`의 `paths`를 따른다: `npm` 스크립트는 언제나 뿌리에서 돈다).
- **게임은 틀을 입구로만 읽는다.** 입구는 `@engine/shared`(공용: 메시지 타입, `AUTO`·`AWAY`), `@engine/server`(`Game`, `Ent`, `startServer`, `runServer`, 저장소, 층 도우미, 금칙어), `@engine/client`(`startClient`, `bus`, `rules`, `S`, `send`, 모델·미니맵·알림·소리의 등록), `@engine/client/i18n`(문장과 언어 묶음: `ko`, `en`, `names`, `merge`), `@engine/testing`(시험 도구)이다. 내용 통로 `@engine/shared/defs`·`world`와 확장 지점 셋(`ext.ts`)도 읽어도 된다. 게임의 내용 파일만 `@engine/shared/defs/*`에서 타입을, `@engine/shared/defaults`에서 기본값을 읽는다. 입구에 없는 것은 틀의 내부라 바꿔도 게임이 깨지지 않는다: 게임에 새로 내놓을 것은 입구 파일에 이름을 더한다. `engine/test/boundary.test.ts`가 깊은 import를 막고, 틀의 소스에 게임 id·게임의 낱말을 문자열로 적는 것, 타입 검사를 피하는 캐스팅이 느는 것, 층을 넘는 import(화면 → 서버 등)도 잡는다.
- `games/deungbul/test/split.test.ts`가 import 문을 읽어 이 방향을 검사한다: `engine/` 아래의 어떤 파일도 `games/`를 상대 경로로 import하지 않는다, 틀의 소스가 `@game`으로 읽는 것은 `@game/shared/content`뿐이고 읽는 자리도 틀의 내용 통로뿐이다, `games/deungbul/`은 `engine/`을 `@engine`으로만 읽는다, `engine/server/game`은 `engine/server/net`을 import하지 않는다, `declare module`은 게임의 선언 파일에만 있다. 틀의 서버 파일이 플러그인과 규칙 시스템을 import하는 예외는 없다.
- `npm run typecheck:engine`은 틀만 타입 검사한다(`tsconfig.engine.json`: `engine/shared`, `engine/server`, `engine/client`만 읽는다). 게임의 선언 파일이 들어가지 않으므로 틀의 코드가 게임의 것(`g.tower`, 이 게임의 안내문·메시지·공유 상태의 칸, 게임의 문장 키)에 기대면 여기서 컴파일되지 않는다. 오류는 0이고(9단계에서 8 → 0), `npm run typecheck`와 `npm test`(`framework`)가 함께 돌린다. 이 검사는 아직 등불지기의 내용(`@game/shared/content`) 위에서 돈다: 틀의 코드에 등불지기의 id가 박혀 있는지는 예제 게임의 내용으로 검사할 때(11단계) 드러난다.
- 금칙어와 글 다듬기는 통신과 게임 규칙이 함께 쓰므로 `engine/server/text.ts`에 있다.

*서버의 접점*

- `new Game()`과 `startServer()`는 틀만으로 만들어진다(규칙 플러그인 없음). 등불지기를 만드는 쪽이 플러그인을 적어 넘긴다: 서버는 `games/deungbul/server/main.ts`, 시험은 `games/deungbul/test/game.ts`의 `newGame(opts?)`와 `startDeungbul(port, opts?)`(습격 설정은 `raid`로 준다). 저장 파일(`data/`)과 빌드된 화면(`dist/`)은 저장소 뿌리에 있고, 화면의 자리는 `startServer`의 `staticDir`로 준다(주지 않으면 뿌리의 `dist/`).
- 어느 게임에나 쓸 기능은 `engine/server/game/systems/`에 시스템을 만들고 `Game` 생성자에 한 줄 더한다.
- 이 게임에만 있는 규칙은 `games/deungbul/server/systems/`에 시스템을 만든 뒤 `installDeungbul`과 그 위의 `interface GameSystems` 선언에 한 줄씩 더한다. 플러그인은 바탕 시스템 뒤, 상점 앞에서 불리므로 생성자에서는 등록만 한다. 뒤에 만들어지는 시스템의 접점을 채우는 일은 `g.ready.push(() => …)`에 넣는다.
- 틀의 시스템이 게임의 규칙을 알아야 할 때는 직접 부르지 않고, 틀 쪽에 선택 접점을 두고 게임이 채운다(`g.rules`, `Channels.extraFoes`·`busy`, `worldSaves`의 `legacy`). 게임의 규칙이 틀을 부르는 것은 된다(예: 등탑이 `g.daily.add(p, 'offer', n)`).
- **확장 지점**: 틀이 가진 목록(안내문 종류, 메시지 종류, 공유 상태의 칸, 사건, `Game`의 시스템 칸, 엔티티 칸, `g.rules`의 칸, 보정 이름, 언어 묶음의 모양)은 게임이 선언 병합으로 넓힌다. 넓힐 자리는 빈 인터페이스로 `engine/shared/ext.ts`(`MsgMap`, `ServerMsgs`, `ClientMsgs`, `WorldState`), `engine/server/game/ext.ts`(`GameSystems`, `EntExt`, `HooksExt`, `RulesExt`, `ModsExt`), `engine/client/i18n/ext.ts`(`LocaleExt`)에 모여 있고, 이 게임의 선언은 `games/deungbul/shared/deungbul.ts`(안내문, 메시지, 공유 상태), `games/deungbul/server/deungbul.ts`(시스템 칸, 사건), `games/deungbul/client/i18n/index.ts`(문장의 모양)에 있다. 공용 선언 파일은 아무도 import하지 않고 `tsconfig.json`의 `include`(`games/deungbul`)로 컴파일에 들어간다. 새 안내문·메시지·공유 상태 칸·사건이 이 게임의 것이면 틀의 파일(`engine/shared/messages.ts`, `protocol.ts`, `game.ts`)이 아니라 이 선언 파일들에 적는다. 선언에서 빼면 그것을 쓰는 코드가 컴파일되지 않는다. 엔티티에 칸을 더할 때는 `EntExt`에 선언하고 `g.entInit.push((e) => { … })`로 처음 값을 채운다(플러그인이 설치되는 동안 등록한다). `RulesExt`의 칸은 선택(`?`)으로 선언한다. `declare module`은 이 선언 파일들에서 세 `ext.ts`만 가리킨다(`games/deungbul/test/split.test.ts`가 검사한다).
- **캐릭터 저장의 칸**: 시스템은 `g.saves.push({ name, save, load })`로 자기 몫을 `PlayerSave.ext[name]`에 쓰고 읽는다. 이 게임의 칸은 퀘스트(`ext.quest`), 기여(`ext.tower`), 기여 단계(`ext.keepers`), 휴식 보너스(`ext.rest`)이고 각각 `quests.ts`, `tower.ts`, `keepers.ts`, `rest.ts`가 맡는다. 값이 `PlayerSave`의 최상위 칸에 있던 옛 저장은 `legacy: (whole) => …`가 찾아 읽는다(둘 다 있으면 `ext`가 이긴다). 이 읽는 길은 지우지 않는다. 쓸 때는 `ext`에만 쓴다(아래 '저장·프로토콜의 호환').
- **개인 상태**: 본인에게만 알리는 값은 시스템이 `g.personal.push({ name, state: (p) => 값 })`으로 등록하고, 통신 계층이 `{ t: 'me', k: name, s: 값 }`으로 보낸다: 접속 직후에 전부, 그 뒤로는 바뀐 칸만(모두에게 보내는 `g.shared`의 짝). `dirty`를 주지 않으면 그 연결에 마지막으로 보낸 값과 달라졌을 때 가고, `dirty: (p) => boolean`을 주면 그것이 참일 때 간 뒤 `sent(p)`가 불린다. 틀은 칸의 이름도 모양도 모른다. 이 게임의 칸은 퀘스트 진행(`quest`), 기여(`contrib`), 기여 단계(`tier`), 휴식 보너스(`rested`)이고 모양은 `games/deungbul/shared/deungbul.ts`의 `MeState`다. 불씨는 틀의 두 번째 재화라 `stat`에 남는다.
- 아무것도 하지 않은 새 캐릭터는 저장하지 않는다. 틀은 자기 칸(직업, 레벨, 경험치, 골드, 불씨)만 보고, 게임의 진행은 `g.rules.touched`가 답한다(이 게임에서는 퀘스트). 처치 경험치에 덧붙는 값은 `g.killBonus.push((p, m) => n)`으로 등록한다(휴식 보너스).

*공용 내용과 계약*

- **내용 계약** (`engine/shared/contract.ts`): 틀이 게임의 내용 정의에 요구하는 이름과 모양을 한 파일에 모았다. 맵(`MAP: MapDef`), 직업·기술·몬스터·아이템·상점, 대장간(`FORGES`), 던전, 수치 묶음(`GEAR, ENHANCE, BUILD, LEVEL, COMBAT, MONSTER_AI, POWER, GUILD, MARKET` 등), 경제 장부의 표(`ECON_*`)가 그 이름과 모양으로 게임의 `shared/content`(`index.ts`)에서 나와야 하고, 빠뜨리거나 모양이 다르면 `npm run typecheck`가 `contract.ts`에서 알려 준다. 실행 중에 내용을 주입하지 않는다: 틀이 별칭 `@game/shared/content`를 정적으로 import하고, 다른 게임은 별칭이 가리키는 폴더를 바꾼다.
- **통로가 둘이다.** 틀의 통로 `engine/shared/defs.ts`는 틀의 타입·도우미(`engine/shared/defs/*.ts`: `ItemDef, MonsterDef, ClassDef, Gear, Reward`와 `classOf, itemDef, rollOpt, needFor, powerOf, bossHp, guildLevel, marketFee` 등)와, 게임의 내용 가운데 **계약의 이름만** 다시 내보낸다(이름을 하나씩 적는다: 계약과 같은 목록인지 `framework.test.ts`가 견준다). 틀의 코드는 내용을 여기서 읽으므로 계약 밖의 것(주민, 등탑, 습격, 퀘스트의 정의, `SMITHY`·`TOWER` 같은 이 게임만의 이름)은 쓸 수 없다. 게임의 통로 `games/deungbul/shared/defs.ts`와 `world.ts`는 틀의 통로에 이 게임에만 있는 내용을 더해 내보내고, 게임의 파일(규칙, 화면, 도감, 시험)은 여기서 읽는다. 맵은 같은 방식으로 `engine/shared/world.ts`(엔진 상수, `buildWorld`, `MAP`에서 꺼낸 `AREAS·GRID·PORTALS` 등)와 게임의 `world.ts`(등탑, 연못, 빈터, 길, 구역)로 나뉜다.
- 내용 파일은 둘로 갈려 있다: 모양과 도우미는 `engine/shared/defs/`, 표와 수치는 `games/deungbul/shared/content/`. 틀의 도우미가 게임의 값을 읽으므로, 계약의 내용 파일(`content/index.ts`가 내보내는 것)은 틀에서 **타입만** 가져온다(`import type`). 값을 가져오면 초기화 순서가 꼬인다(`framework.test.ts`가 검사한다). 이 게임에만 있는 내용 파일(`tower.ts` 등)은 틀의 값을 읽어도 된다.
- 틀은 이 게임의 낱말을 직접 읽지 않는다: `buildWorld`는 `MAP`만 읽고(연못·등탑·집·기둥은 `MAP.obstacles`에 순서대로), 상점과 대장간의 잠금은 뜻 없는 열쇠(`needs: string`)를 `g.rules.unlocked`에 묻고, 자동으로 마실 물약은 `ITEMS`의 회복량에서 고르고, 대장간 창은 `FORGES`의 첫 대장간을 읽는다.
- 틀이 게임의 내용을 새로 읽어야 하면 계약에 이름과 모양을 더하고 틀의 통로의 목록에도 더한다. 어느 게임에나 있을 수치가 아니라 이 게임만의 것이면 계약에 넣지 말고 게임의 규칙이 접점(`g.rules`, 등록 함수)으로 넘긴다.

*클라이언트의 접점*

- **진입점은 게임의 것이다**: `games/deungbul/client/index.html`은 같은 폴더의 `main.ts`를 읽고, 그 파일이 지형의 겉모습(`look`: `ground`, `leaf`, `scenery`)과 이 게임의 모듈 목록(`modules`)을 들고 틀의 `startClient`(`engine/client/main.ts`)를 부른다. 아무것도 주지 않으면 틀만으로 뜬다. 이 게임의 클라이언트 파일은 `games/deungbul/client/` 한 폴더에 있다: `deungbul.ts`(규칙 채우기, 공유·개인 상태 받기), `state.ts`(`GS` 공유 상태, `G` 개인 상태, `stage`·`myZone`), `hud/`(등탑 창 `tower`, 습격 알림 `raid`, 구역 알림 `zone`, 퀘스트 `quest`, 미니맵 표식 `marks`, 도감 단추 `guidelink`), `scene/`(땅·잎·미니맵 바탕 `paint`, 분위기 `scene`, 건물 `scenery`, 모델 `models`), `i18n/`과 `words.ts`(문장), `markup.ts`와 `deungbul.css`(창). 틀의 내 정보 창은 `engine/client/hud/me.ts`다. 틀의 파일은 게임의 폴더를 import하지 않는다(`framework.test.ts`가 `engine/client/` 아래 전부를 검사한다).
- **규칙**: 틀의 화면 코드(상점, 대장간, 알림, 걸음 예측)는 주민과 등탑을 직접 읽지 않고 `engine/client/rules.ts`의 `rules`(`speed`, `unlocked`, `lockNote`, `lockHint`, `home`)에 묻고, 이 게임의 모듈 `games/deungbul/client/deungbul.ts`의 `initDeungbul`이 그 값을 채운다(게임의 모듈 목록 맨 앞에서 init). 채우지 않으면 기본 규칙(기본 속도, 잠금 없음, 맵의 처음 자리)으로 돈다. `rules.speed`는 서버의 `g.rules.speed`와 같은 공유 함수로 셈해야 걷는 동안 되감기지 않는다. 단축키는 `bus.onKey('f', fn)`으로 등록하고, 화면에만 서 있는 사람은 `entities.ts`의 `addNpc(x, z, model, () => 이름, 바라볼 곳)`으로 세운다. '마을로'(H 키)의 목적지는 `rules.home`, 그때의 안내문은 틀의 기본 문장(`goingTown`)을 게임이 덮어쓴 것이고, 직업 창을 다시 여는 것은 `openClasses()`다.
- **개인·공유 상태**: 이 게임의 모듈(`deungbul.ts`)이 `bus.onMsg('me', …)`와 `bus.onMsg('world', …)`로 받아 이 게임의 상태(`state.ts`의 `G`, `GS`)에 넣는다. 틀의 `state.ts`에는 이 칸이 없다.
- **장면**: 틀은 값을 받아 그리기만 한다. 땅과 잎의 색, 건물은 게임의 진입점이 `startClient`의 `look`으로 넘기고(`ground`, `leaf`, `scenery`), 분위기는 `view.setMood({ sky, hemi, sun, fogNear, fogFar })`, 미니맵·전체 지도의 바탕은 `setMapPaint`, 표식은 `addMarks`, 전체 지도의 이름은 `addMapLabels`, 몬스터와 장비의 생김새는 `registerMonsterModel`·`registerBlade`·`registerArmor`로 등록한다. 이 게임의 것은 `games/deungbul/client/scene/`(`paint.ts` 땅·잎·미니맵 바탕, `scene.ts` 등불 밝기·분위기·퀘스트 빛기둥, `scenery.ts` 건물, `models.ts` 몬스터·무기·갑옷)와 `hud/marks.ts`에 있다. 새 몬스터의 모양은 `scene/models.ts`의 `MONSTER_LOOKS`에 더한다(빠뜨리면 컴파일이 실패한다). 넘기거나 등록하지 않으면 기본(한 가지 풀빛, 건물 없음, 맑은 낮, 덩어리 모양 몬스터)으로 그려진다. `engine/client/scene/view.ts`·`scene/models.ts`·`hud/minimap.ts`는 이 게임의 파일과 게임에만 있는 내용 정의를 import하지 않는다.
- **등록의 차례**: 게임의 화면은 init 안에서 `bus.onMsg`, `bus.onFrame`, `bus.onSlow`, `onLangChange`에 스스로 등록한다. 같은 메시지·같은 주기 안에서는 등록한 차례대로 불리고, 차례는 내 정보 창 → 게임의 모듈(`games/deungbul/client/main.ts`의 목록 순) → 틀의 덧붙는 모듈(`engine/client/modules.ts`)이다. 내 정보 창에 덧붙는 게임의 줄(불씨, 기여, 휴식, 다음 습격)은 게임 모듈이 그린다. 가까이 가면 열리는 창은 `addPlace(요소 id, 곳들)`로 알린다(`hud/near.ts`). 요소는 모듈 최상단이 아니라 init 안에서 잡고, `view`(`app.ts`)도 init 뒤에만 쓴다.
- **화면의 뼈대와 스타일**: 뼈대(`games/deungbul/client/index.html`의 body)와 틀의 스타일(`engine/client/style.css`)에는 틀의 창(내 정보, 대화, 상점, 대장간, 던전, 가방, 메뉴, 접속 화면 등)만 있다. 이 게임의 창(등탑 창, 퀘스트 창과 길잡이 화살표, 습격 알림, 내 정보의 불씨·휴식·등탑·기여·습격 표시, '마을로' 단추)은 `games/deungbul/client/markup.ts`가 `engine/client/hud/shell.ts`의 `mountPanel(자리, html)`로 틀의 빈 자리에 붙이고, 모양은 `deungbul.css`에 있다. 자리의 목록은 `shell.ts`의 `SLOTS`에 있고, 감싸는 요소 없이 그 자리의 형제로 붙는다. 붙이는 일은 게임의 진입점이 `startClient`를 부르기 전에 한다: 화면 코드가 init에서 요소를 잡기 전이어야 하기 때문이다. 틀의 스타일은 틀의 진입 모듈(`engine/client/main.ts`)이 맨 먼저 읽고 게임의 스타일은 그 뒤에 읽히므로 같은 무게의 규칙은 게임 쪽이 이기고, 색 변수(`--gold`, `--panel` 등)는 틀이 기본값을 갖고 게임이 덮어쓴다. 새 창이 이 게임의 것이면 `index.html`과 `style.css`가 아니라 `markup.ts`와 `deungbul.css`에 적는다(`framework.test.ts`가 뼈대와 틀의 스타일에 게임의 창이 남아 있지 않은지 검사한다). 뼈대의 파일 자체는 아직 게임의 폴더에 있다: `index.html`의 머리(제목, 아이콘, manifest)와 script는 게임의 것이고 body는 틀의 것이라, 다른 게임은 지금은 body를 그대로 베껴야 한다(뼈대를 `shell.ts`가 붙이게 올리는 일이 남아 있다).
- 화면 빌드(`games/deungbul/vite.config.ts`, `npm run build`가 `scripts/game.mjs`를 거쳐 고른다): 뿌리는 `games/deungbul/client`(그 안의 `index.html`, `guide.html`, `public/`), 결과는 저장소 뿌리의 `dist/`다. 틀의 코드는 뿌리 밖(`engine/client`)에 있어 개발 서버는 저장소 전체를 읽게 열어 둔다(`server.fs.allow`).

*저장·프로토콜의 호환*

- 캐릭터 저장: 이 게임의 네 칸(퀘스트, 기여, 기여 단계, 휴식)은 `ext`에만 쓴다. 칸을 옮긴 배포 한 번 동안 옛 최상위 칸(`quest`, `contrib`, `tier`, `rested`)에도 함께 쓰던 것(`WRITE_OLD_CELLS`, `Saver.legacySave`)은 껐고 코드도 지웠다. 옛 칸을 읽는 길(`legacy`)은 계속 둔다: 옛 저장은 그대로 읽히고, 다시 저장될 때 새 칸만 남는다. 이 커밋부터는 3단계 이전 코드로 되돌리면 그 뒤에 저장된 캐릭터의 이 네 칸을 잃는다(그 직전 커밋이 되돌릴 수 있는 마지막 지점이다).
- 개인 상태: 퀘스트 진행과 기여·기여 단계·휴식 보너스는 `me` 메시지로만 간다. 통로를 옮긴 배포 한 번 동안 옛 화면을 위해 함께 보내던 `quest` 메시지와 `stat`의 `contrib·rested·tier` 칸(`SEND_OLD_MSGS`, `g.oldMsgs`), 새 화면이 옛 서버의 것을 받던 처리기는 지웠고, 그러면서 `PROTOCOL`을 2로 올렸다. 배포는 서버를 먼저 재시작하고 곧바로 화면을 올린다: 그 사이에 열려 있던 옛 화면은 다시 접속할 때 새로고침 안내를 본다.
- 메시지의 모양이나 뜻을 바꾸면 `engine/shared/protocol.ts`의 `PROTOCOL`을 올린다. 옛 화면은 접속할 때 새로고침 안내를 본다.
- 맵이나 저장 형식을 고치면 `npm test`의 `framework`가 맵 지문과 저장 견본(`games/deungbul/test/fixtures/`)으로 확인한다. 맵을 일부러 바꿨으면 지문 값을 새로 적는다. 폴더 이동(9단계)은 저장 형식과 프로토콜을 건드리지 않았다.

*시험*

- **시험도 둘로 나뉜다**: 틀의 기능을 보는 시험은 `engine/test/이름.test.ts`(`test/all.ts`의 `ENGINE`)에 두고 `new Game()`으로 돌린다. 등탑·습격·퀘스트·등탑지기·휴식처럼 이 게임의 규칙을 보는 시험은 `games/deungbul/test/이름.test.ts`(`GAME`)에 두고 `newGame()`으로 돌린다. 틀의 시험이 게임의 규칙에 달린 것(잠금, 직업을 바꾸는 자리)을 봐야 할 때는 시험용 규칙을 넣는다(`g.rules.unlocked = (key) => …`, `g.rules.canChangeClass = …`). 틀의 시험 파일은 이 게임의 규칙·선언·화면·시험을 import하지 않는다(`framework.test.ts`가 import를 따라가 검사하고, `npm run test:engine`이 실행 중에 게임의 규칙 파일이 하나도 로드되지 않았는지 확인한다). 명령: `npm test`(전부), `npm run test:engine`(틀만), `npm run test:game`(이 게임만), `npx tsx test/all.ts growth deungbul/quests`(고른 것만: 이 게임의 시험은 예전처럼 앞에 `deungbul/`을 붙인다).
- 틀의 시험은 아직 등불지기의 내용(맵 좌표, 몬스터·아이템 id) 위에서 돈다: 이 게임만의 이름(`TOWER`, `POND`, `SHOP`, `SMITHY` 등)이 필요한 시험은 게임의 통로를 별칭으로 읽고(`@game/shared/defs`, `@game/shared/world`), 저장 견본도 게임의 `test/fixtures/`를 읽는다. 틀의 시험이 `@game`으로 읽어도 되는 것은 이 둘뿐이다(`framework.test.ts`). 이것을 떼는 일이 13단계다.
- 시험의 가짜 클라이언트: 틀의 `Peer`(`engine/test/harness.ts`)는 틀의 메시지만 읽고, 게임의 칸은 `games/deungbul/test/peer.ts`의 `connectDeungbul`이 `connect(port, name, token, onMsg)`로 넘겨받아 채운다.

**레벨과 필요 경험치**: 다음 레벨까지의 필요 경험치는 저장하지만 읽지 않는다. 접속할 때 레벨에서 다시 구한다(`needFor`: 레벨 업이 쓰는 수열과 같은 함수). 레벨 상한은 없고(읽을 때만 999), 필요 경험치는 Lv 110에서 Number의 안전한 정수 범위를 넘는다.

**문장 속의 수와 이름**: 문장에 들어가는 수(레벨당 능력치 점수, 강화 한도, 파티 인원, 자리 비움 사냥 한도, 길드 이름 길이, 거래소의 가장 싼 값)는 언어 파일이 내용 정의에서 읽는다. 서버 안내문의 인자를 늘리지 않는다. 피드의 보상 줄은 한국어 '이름 +N', 영어 '+N unit'으로 적는다. 영어 게임 이름은 Lampkeeper이고, 홈 화면 이름(manifest, `apple-mobile-web-app-title`)은 언어와 무관하게 '등불지기'다.

**분해·잠금·가방 넓히기·장비 비교** (메뉴 → 장비): 가방 장비 줄 앞의 ▲▼◆=는 지금 낀 같은 칸 장비와 바꿨을 때의 결론이고, 장비를 누르면 "지금 바꾸면"과 "둘 다 같은 강화 단계이면" 두 기준으로 수치별 증감과 맞추는 데 드는 기대 골드가 펼쳐진다. 안 쓰는 장비는 분해해 장비 가루(등급별 1/3/8/25, 강화 단계당 +1, 한도 9,999)로 바꾼다. 낀 장비·보급형·잠근 장비는 분해되지 않고, 자물쇠로 잠근 장비는 팔기·거래소 올리기도 막힌다. 일괄 분해는 등급을 고르면 대상 수와 나올 가루를 먼저 보여 주고, 자동 분해는 고른 등급 이하의 드롭을 줍자마자 가루로 바꾼다(자리 비움 사냥 중에도). 장비 가방은 30칸에서 5칸씩 여섯 번, 3,000골드부터 두 배씩 내고 60칸까지 넓힌다. 가방이 가득 차 버려진 장비는 가방 단추의 "!"와 가방·장비 화면, 돌아왔을 때의 안내로 알려 준다. 장비 가루는 거래소에 올릴 수 있고, 쓰는 곳(강화·재련)은 다음 단계에 붙는다. 수치는 `games/deungbul/shared/content/economy.ts`의 `SALVAGE`, `BAG_UP`, `DUST_MAX`에 있고, 가루를 주지 않는 게임(예: `games/sample`)에서는 기능이 꺼진다. 장비·아이템을 넣고 빼는 코드는 모두 통로 `g.bag`을 지난다(지갑처럼 원인과 함께 장부에 적힌다).

**재시작과 자리 비움 사냥**: 서버를 끌 때(`scripts/restart.sh`의 저장하고 끄기) 사냥 중이던 캐릭터(자리 비움 사냥 중인 것과, 자동 사냥을 켠 채 접속해 있던 것)의 목록을 월드 저장의 `awayAtClose` 칸에 적고, 켤 때 다시 세워 이어서 사냥하게 한다(`engine/server/net/server.ts`). 목록이 없으면(갑자기 죽었을 때) 마지막 저장 무렵에 자동 사냥을 켠 채 저장된 캐릭터를 찾아 세운다. 주인이 접속하면 평소처럼 넘겨받고, 하루 한도·레벨·수의 제한은 그대로다.

**지갑** (`engine/server/game/systems/wallet.ts`): 재화(골드, 불씨, 경험치)를 더하고 빼는 한 통로다. `g.wallet.add(p, 'gold', n, 원인)`은 실제로 더한 양을, `g.wallet.take(p, 'gold', n, 원인)`은 잔액이 모자라면 false를 돌려준다(`can`, `amount`도 있다). 틀의 시스템과 게임의 규칙 시스템이 모두 여기를 지나고, 재화의 칸(`p.gold`, `p.sparks`, `p.exp`)을 직접 고치는 코드가 지갑과 허용 목록(저장 읽기, 레벨 업) 밖에 생기면 `engine/test/wallet.test.ts`가 실패한다. 수급 배율(하루 몫, 모드별 보상)은 `g.wallet.scale`에 `(p, 재화, 양, 원인) => 배율` 함수를 등록한다: 더하는 쪽에만 걸리고, 값을 돌려주기만 해야 한다(미리 묻는 `amount`에서도 불린다). 깨진 값(NaN, 음수, 소수)은 지갑에서 걸러지고, 상한은 재화의 표(`CURRENCIES`)에서 읽는다. 골드·불씨·경험치는 지갑을 지날 때 원인의 이름과 함께 장부에 바로 적히고(틀의 이름은 `wallet.ts`의 `WHY`, 이 게임의 이름은 `economy.ts`의 `ECON_WHY`), 지갑 밖에서 고친 재화는 장부의 `other`/`tick`으로 드러난다. 장비와 아이템은 아직 이 통로를 지나지 않는다.

**경제 수치** (`games/deungbul/shared/content/economy.ts`): 수도꼭지와 배수구의 크기, 재화의 표와 한도를 한 파일에서 고친다. 통째로 옮긴 표(`ENHANCE`, `IDLE`, `DAILIES`, `ATTEND`, `RECIPES`, `REST`, `CONTRIB_TIERS`)는 옛 파일이 다시 내보내고, 묶음에 섞여 있던 것은 경제 쪽 조각(`GEAR_ECON`, `BUILD_COST`, `GUILD_ECON`, `MARKET_ECON`, `PRICES`, `DUNGEON_ECON`, `RAID_REWARD`)을 옛 묶음이 읽는다. 몬스터별 처치 보상처럼 정의의 표에 있는 것은 파일 머리의 색인이 가리킨다.

**재화 흐름 지표 (경제 장부)** (`engine/server/game/systems/ledger.ts`, 설계: `docs/economy.md`): 서버는 재화가 어디서 얼마나 생기고 어디로 얼마나 사라지는지를 날짜별·원인별로 적는다. 게임의 규칙은 바꾸지 않고 기록만 한다.
- 무엇을 적나: 골드·불씨·경험치, 장비(등급별 개수), 재료와 물약(아이템별 개수)의 생김(+)과 사라짐(-)을 (날짜, 재화, 원인, 방향)마다 양과 건수로.
- 어떻게 재나: 재화를 바꾸는 코드를 고치지 않고, 명령·처치 사건·틱의 앞뒤로 캐릭터가 가진 것의 차이를 재어 그 경계의 탓으로 적는다. 새 명령이나 우편 종류를 더해도 장부는 고칠 것이 없다.
- 원인 이름: `cmd:명령[:하위 동작]`(cmd:buy, cmd:guild:give), `mail:우편 종류`(mail:idle), 사냥은 `hunt`(접속 중)·`huntAway`(자리 비움 사냥)·`huntDungeon`(던전 안), 안내문으로 알리는 보상은 `quest`·`raid`·`tier`. 거래소의 골드는 생성도 소멸도 아닌 이동이라 `market:out`(낸 값)과 `market:in`(받은 값)으로 적히고 그 차이가 수수료다. 가방이 가득 차 버려진 장비는 `lostFull`.
- `other`, `tick`: 어느 원인에도 잡히지 않은 변화다. 0이어야 하고, 0이 아니면 빠뜨린 통로나 재화 복사 버그다. 명령과 사건 밖에서 재화를 바꾸는 코드는 바꾼 직후에 `g.ledger.note(p, '이름')`을 부르면 제 이름으로 적힌다. 틱이나 사건 한가운데서 바로 주는 보상은 그 보상을 알리는 안내문을 `games/deungbul/shared/content/economy.ts`의 `ECON_NOTICES`에 적는다.
- 캐릭터별 기록(`PlayerSave.ext.stats`): 만든 시각, 접속 플레이 시간, 자리 비움 사냥 시간, 레벨 5·10·20에 처음 닿은 플레이 시간, 오늘 번·쓴 골드.
- 분포 스냅샷: 하루 한 번(서버가 켜질 때와 날이 바뀐 뒤 첫 저장 때) 저장된 캐릭터를 훑어 활동 수, 레벨 분포, 골드 보유의 합계·중간값·상위 경계, 낀 장비의 강화 단계, 거래소의 값, 신규의 레벨 도달 시간을 남긴다. 이름이나 저장 키는 넣지 않는다.
- 저장: SQLite의 `econ_daily`, `econ_snapshot` 표(기존 DB에 자동으로 붙는다). 장부는 메모리에 모았다가 캐릭터·월드 저장 때 함께 얹는다. 저장소를 바꿀 때는 `Store`의 `addEcon`, `econ`, `saveEconSnapshot`, `econSnapshot`, `eachPlayer`도 구현한다.
- 보기: `npm run econ`(최근 7일), `npm run econ -- 14`, `npm run econ -- 14 경로/game.db`, `npm run econ -- --json`. 저장 파일을 읽기 전용으로 열므로 운영 중인 서버 옆에서 돌려도 된다. 판단 기준(임시값, `ECON_WATCH`): 골드 소멸/생성 비 0.7~1.0, 보유 일수 7일 이하, 상위 10% 경계 ÷ 중간값 10 이하, 자리 비움 사냥의 골드 비중 35% 이하, 낀 장비 중 +10 30% 이하, 원인 모름 1% 이하. 7일 활동 캐릭터가 30명 미만이면 "표본이 적어 참고만"이라고 함께 찍는다.

**도감** (`games/deungbul/client/guide.html`, `games/deungbul/client/guide/`): 게임의 수치와 규칙을 모두 보여 주는 따로 떨어진 페이지다. 게임 화면 왼쪽 가장자리의 '도감' 단추가 새 창으로 연다 (`games/deungbul/client/hud/guidelink.ts`). 직업과 기술, 몬스터(한 마리당 기대 보상, 장비 확률), 아이템과 상점, 제작, 장비(등급 확률, 옵션 값 범위, 강화 성공률과 +N까지의 기대 골드, 파는 값), 성장, 퀘스트 전체, 등탑과 주민, 습격, 던전, 일일 임무·출석·방치 보상, 파티, 길드, 거래소, 채널.
- 내용은 손으로 적지 않는다: `data.ts`가 `games/deungbul/shared/content/*`를 돌며 표를 만들므로 수치를 바꾸거나 몬스터·아이템을 더하면 도감이 따라 바뀐다. 이름은 게임의 언어 파일에서 읽고, 도감에만 있는 문장은 `text.ko.ts`·`text.en.ts`에 둔다 (새 언어는 같은 모양의 파일을 만들고 `data.ts`의 `PACKS`에 더한다). 규칙을 설명하는 문장은 손으로 쓴 것이라 서버 규칙을 바꾸면 함께 고친다.
- 서버에 접속하지 않는 정적 페이지다. `npm run build`가 게임 빌드 뒤에 도감을 따로 빌드해 `dist/guide.html`로 더하고(`games/deungbul/vite.config.ts`), 개발 중에는 http://localhost:5173/guide.html 로 연다. `?lang=en`으로 언어를 고르고, 없으면 게임에서 고른 언어를 따른다.
- 수치는 모두 `games/deungbul/shared/content`에, 그것으로 값을 구하는 식은 `engine/shared/defs/`(틀의 것)와 `content/tower.ts`·`raid.ts`(이 게임의 것)에 있다. 레벨 업 필요 경험치(`LEVEL`, `needFor`), 치명타와 자연 회복(`COMBAT`), 받는 피해 감소 한도와 옵션 값의 굴림(`GEAR`, `rollOpt`), 전투력(`POWER`, `powerOf`), 몬스터의 추적과 복귀(`MONSTER_AI`), 보스 체력·습격 적의 수·던전 완료 장비 등급·길드 레벨의 식은 서버와 도감이 같은 함수를 부른다. 도감은 서버의 코드(`engine/server/`, `games/deungbul/server/`)를 불러오지 않는다 (`games/deungbul/test/guide.test.ts`가 검사한다). 새 규칙을 만들 때 숫자를 서버 시스템 안에 적지 말고 내용 정의에 이름 붙여 두면 도감에 실을 수 있다.
- `games/deungbul/test/guide.test.ts`가 빠진 항목, 확률의 합, 서버를 실제로 굴린 결과와의 일치(강화 기대 비용, 등급 비율, 옵션 범위), 두 언어의 모양을 검사한다.

**새 직업, 기술**: `games/deungbul/shared/content/combat.ts`의 `CLASSES`와 `SKILL_DEFS`에 더하고 언어 파일에 이름을 넣는다. 기술은 효과의 종류(`SkillEffect`: 한 대상 피해, 범위 피해(+느려짐), 회복)로 처리하므로 서버, 자동 사냥, 이펙트가 함께 따라온다. 새 종류의 효과가 필요할 때만 `engine/server/game/systems/combat.ts`의 `useSkill`을 고친다. 직업의 겉모습(`hand`, `shot`, `hitColor`)도 `CLASSES`에 적는다. 새로운 손 모양이 필요하면 `engine/client/scene/models.ts`에 더한다.

**새 던전**: `games/deungbul/shared/content/map.ts`의 `MAP.areas`에 지역을(문의 자리는 `MAP.portals`에), `games/deungbul/shared/content/dungeons.ts`의 `DUNGEONS`에 문·무리·우두머리·보상을 더하고 언어 파일에 이름을 넣는다. 지형(기둥)은 `PILLARS`, 모양은 `games/deungbul/client/scene/scenery.ts`다.

**새 맵, 구역**: `games/deungbul/shared/content/map.ts`에서 범위를 넓히고 `TOWERS`, `CLEARINGS`, `MAP.scatter`에 더한다. `zoneOf`가 좌표를 구역 번호로 바꾼다. 몬스터 무리는 `games/deungbul/shared/content/monsters.ts`의 `CAMPS`에, 상인은 `games/deungbul/shared/content/items.ts`의 `SHOPS`에 더한다. 건물의 모양은 `games/deungbul/client/scene/scenery.ts`, 땅의 색은 `scene/paint.ts`, 미니맵 표식은 `hud/marks.ts`다. 맵은 하나만 가정한다.

**새 퀘스트 장**: `games/deungbul/shared/content/quests.ts`의 `QUESTS`에 장을 더하고 언어 파일에 제목과 단계 문장을 넣는다.

**새 아이템**: `games/deungbul/shared/content/items.ts`의 `ITEMS`에 더하고 언어 파일에 이름을 넣는다. `needs`에 조건을 적으면 그 조건이 풀린 뒤에(`g.rules.unlocked`) 상점에 들어온다.

**새 드롭 장비 칸, 옵션, 능력치, 일일 임무, 출석 보상**: `games/deungbul/shared/content/growth.ts`의 `GEAR_SLOTS`, `STATS`, `BUILD_STATS`, `DAILIES`, `ATTEND`에 더하고 이 게임의 언어 파일(`games/deungbul/client/i18n/`)의 이름표에 이름을 넣는다(칸은 `gearSlots`, 등급은 `rarities`, 능력치는 `buildStats`). 옵션과 능력치는 `mod`로 틀의 효과(공격 피해, 받는 피해 감소, 치명타, 최대 체력) 가운데 하나에 들며, 서버의 수치 보정과 화면의 문장은 틀이 그 효과로 만든다: 틀을 고치지 않아도 된다. 효과의 종류를 새로 만드는 것만 틀의 일이다(`engine/shared/defs/growth.ts`의 `StatMod`, `modValue`).

**새 몬스터, 주민**: `games/deungbul/shared/content/`에 정의를 더하고, 이 게임의 언어 파일(`games/deungbul/client/i18n/`)에 이름을 더하고, `games/deungbul/client/scene/models.ts`의 `MONSTER_LOOKS`에 모양을 더한다. 이름이나 모양을 빠뜨리면 컴파일이 실패한다.

**새 언어**: 틀의 문장(`engine/client/i18n/`)과 이 게임의 문장(`games/deungbul/client/i18n/`)에 각각 `ko.ts`와 같은 모양의 파일을 만들고, `games/deungbul/client/i18n/index.ts`에서 둘을 합쳐 `LOCALES`에 추가한다. 빠진 문장이 있으면 컴파일이 실패한다.

**새 안내문**: 어느 게임에나 있을 것이면 `engine/shared/messages.ts`에, 이 게임의 것이면 `games/deungbul/shared/deungbul.ts`의 `MsgMap`에 종류를 더한다. 모든 언어 파일이 그 문장을 갖춰야 컴파일된다.

**새 테스트**: 틀의 기능이면 `engine/test/fx/이름.test.ts`를 만들어 `engine/test/fx/all.ts`의 `FX`에, 이 게임의 규칙이면 `games/deungbul/test/이름.test.ts`를 만들어 `games/deungbul/test/all.ts`의 `GAME`에 더한다.

**저장소 교체**: `engine/server/store/types.ts`의 `Store`를 구현하고 `games/deungbul/server/main.ts`에서 고른다.

## 다음 단계

검증판 범위의 기능은 모두 들어갔고, 주민 세 명의 혜택도 모두 정식 기능이 됐다. 
알려진 한계: 길찾기는 고정된 장애물(집, 나무, 연못)만 피한다. 캐릭터끼리는 서로 지나다닌다.

## 예제 게임

`games/sample`("모닥불 사냥터")은 같은 틀로 만든 아주 작은 두 번째 게임이다. 틀이 다른 게임을 받는지 확인하는 본보기이고, 새 게임을 만들 때 베끼는 출발점이다. 만드는 차례는 [docs/making-a-game.md](docs/making-a-game.md)에 있다.

- 직업 둘, 몬스터 셋, 지역 하나, 상인 하나, 이 게임만의 규칙 하나(모닥불에 장작을 넣으면 곁에 있는 동안 회복이 빨라진다). 던전, 대장간, 보스, 불씨는 없다.
- 등불지기와 따로 돈다: 별칭 `@game`이 `games/sample`을 가리키는 자기 설정(`games/sample/tsconfig.json`, `vite.config.ts`), 포트 3002, 저장 `data/sample/`, 빌드 결과 `dist-sample/`.

```
npm run build:sample && npm run start:sample   # http://localhost:3002
npm run dev:sample             # 개발: 서버(3002) + 클라이언트(5174)
npm run test:sample            # 예제의 시험 + 문서의 코드 조각이 예제와 같은지 (npm test도 함께 돌린다)
npm run typecheck:sample       # 틀 + 예제
npm run typecheck:engine:sample   # 틀만, 예제의 내용으로 (틀에 등불지기의 id가 박혀 있으면 여기서 드러난다)
```

틀(`engine/`)이나 내용 계약을 고치면 예제도 통과해야 한다. `npm run typecheck`가 예제까지 검사한다.
