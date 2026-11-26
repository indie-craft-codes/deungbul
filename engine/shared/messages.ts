// 서버가 플레이어에게 보내는 안내문의 종류.
// 서버는 문장을 보내지 않고 종류(k)와 값(a)만 보낸다. 문장은 클라이언트의 언어 파일이 만든다.
// 새 안내문을 더하면 모든 언어 파일이 그 문장을 갖춰야 컴파일된다.
import type { MsgMap } from './ext';

export type MsgArg = string | number;

/** 종류별로 a에 들어가는 값은 주석에 적는다. id류(몬스터, 주민)는 클라이언트가 이름으로 바꾼다. */
export type MsgKey =
  | keyof MsgMap // 게임이 더한 안내문 (engine/shared/ext.ts의 MsgMap. 이 게임의 것은 games/deungbul/shared/deungbul.ts)
  | 'joined' // [이름]
  | 'left' // [이름]
  | 'renamed' // [이전 이름, 새 이름]
  | 'renameWait' // []
  | 'replaced' // []
  | 'noTarget' // []
  | 'tooFar' // []
  | 'kill' // [몬스터 id, 경험치, 두 번째 재화, 골드]
  | 'levelUp' // [레벨]
  | 'died' // [다시 일어난 곳의 id (g.rules.respawn이 돌려준 것)]
  | 'bought' // [아이템 id, 직업 id]
  | 'classChanged' // [직업 id]
  | 'classFar' // []
  | 'bossUp' // [몬스터 id] 필드 보스가 나타났다
  | 'bossDown' // [몬스터 id, 함께 싸운 사람 수]
  | 'shopFar' // []
  | 'notStocked' // []
  | 'alreadyBest' // []
  | 'dungeonBack' // [던전 id] 접속이 끊겼다 곧 돌아와 하던 회차로 다시 들어왔다
  | 'gearBagFull' // [] 장비 가방이 가득 차 무기·갑옷을 사거나 만들 수 없다 (값을 치르기 전에 막는다)
  | 'potionFull' // []
  | 'noGold' // []
  | 'noPotion' // []
  | 'hpFull' // []
  | 'gearDrop' // [칸 id, 등급 id] 장비를 주웠다
  | 'gearFull' // [] 가방이 가득 차서 줍지 못했다
  | 'gearSold' // [받은 골드]
  | 'enhanceOk' // [강화 단계]
  | 'enhanceFail' // []
  | 'enhanceDown' // [내려간 강화 단계] 실패해서 한 단계 내려갔다 (ENHANCE.dropFrom 이상)
  | 'enhanceSaved' // [강화 단계] 실패했지만 보호 부적으로 내려가지 않았다
  | 'reforged' // [새 옵션 id, 재련한 횟수, 한도, 옛 옵션 id, 옛 값, 새 값] 옵션 하나를 다시 뽑았다 (값은 강화 단계를 넣은 보이는 값)
  | 'reforgeMax' // [한도] 이 장비는 더 재련할 수 없다
  | 'marketBound' // [귀속 단계] 강화한 장비라 거래소에 올릴 수 없다
  | 'enhanceMax' // []
  | 'mailNew' // [] 우편이 왔다
  | 'mailGot' // [골드, 경험치, 두 번째 재화, 장비 수, 아이템 수] 우편의 보상을 받았다
  | 'dungeonMate' // [들어간 사람 이름, 던전 id] 파티원이 던전에 들어갔다
  | 'dungeonFar' // [] 문에서 멀다
  | 'dungeonLevel' // [필요한 레벨]
  | 'dungeonNoRuns' // [] 오늘 들어갈 수 있는 횟수를 다 썼다
  | 'dungeonEnter' // [던전 id]
  | 'dungeonClear' // [던전 id, 밖으로 나가기까지 남은 초]
  | 'dungeonFail' // [] 제한 시간을 넘겼다
  | 'dungeonLeft' // [] 스스로 나왔다
  | 'channelMoved' // [채널 번호] 채널을 옮겼다
  | 'channelDungeon' // [] 던전 안에서는 채널을 바꿀 수 없다
  | 'channelFight' // [] 싸우는 중에는 바꿀 수 없다
  | 'channelWait' // [남은 초] 방금 바꿨다
  | 'channelFull' // [채널 번호] 그 채널이 가득 찼다
  | 'statNone' // [] 찍을 점수가 없다
  | 'statReset' // [] 능력치를 모두 돌려받았다
  | 'skillUp' // [기술 id, 단계]
  | 'skillMax' // []
  | 'skillNeedLv' // [필요한 레벨]
  | 'mailLeft' // [] 가방이나 한도가 모자라 우편의 물건을 다 받지 못했다 (남은 것은 우편에 그대로 있다)
  | 'marketGuest' // [] 손님은 거래소를 쓸 수 없다
  | 'marketFull' // [한 사람이 올릴 수 있는 수]
  | 'marketPriceBad' // [값의 한도]
  | 'marketCant' // [] 올릴 수 없는 물건 (낀 장비, 보급형, 재료가 아닌 것)
  | 'marketPosted' // [값]
  | 'marketBought' // [값]
  | 'marketGone' // [] 이미 팔렸거나 내려간 물건
  | 'marketOwn' // [] 자기 물건은 살 수 없다
  | 'marketCanceled' // [] 올린 물건을 내렸다
  | 'marketMailFull' // [우편 한도] 물건이 붙은 우편이 너무 많아 거래소에서 올리거나 살 수 없다
  | 'marketCrowded' // [] 거래소 전체에 올라온 물건이 한도에 닿아 더 올릴 수 없다
  | 'chatWait' // [] 같은 주소(또는 서버 전체)의 대화가 너무 많아 방금 한 말이 전해지지 않았다
  | 'marketNeedLv' // [필요한 레벨]
  | 'guildGuest' // [] 손님은 길드에 들 수 없다
  | 'guildNeedLv' // [필요한 레벨]
  | 'guildNameBad' // []
  | 'guildNameTaken' // []
  | 'guildCreated' // [길드 이름]
  | 'guildNotLeader' // []
  | 'guildBusy' // [상대 이름] 초대할 수 없는 상대
  | 'guildFull' // []
  | 'guildInvited' // [상대 이름]
  | 'guildJoined' // [들어온 사람]
  | 'guildLeft' // [나간 사람]
  | 'guildYouLeft' // []
  | 'guildKicked' // [] 내가 추방됐다
  | 'guildGave' // [골드]
  | 'guildLevelUp' // [길드 레벨]
  | 'guildNone' // [] 길드가 없는데 길드 대화를 했다
  | 'awayBack' // [자리를 비운 분, 얻은 두 번째 재화, 얻은 골드, 오른 레벨] 자리를 비운 동안 자동 사냥을 했다
  | 'loot' // [재료 id] 재료를 주웠다
  | 'crafted' // [아이템 id, 직업 id]
  | 'forgeFar' // []
  | 'forgeClosed' // [] 대장장이가 아직 돌아오지 않았다
  | 'noMats' // []
  | 'partyInvited' // [상대 이름] 초대를 보냈다
  | 'partyBusy' // [상대 이름] 초대할 수 없는 상대
  | 'partyFull' // []
  | 'partyGone' // [] 받은 초대가 이미 사라졌다
  | 'partyDeclined' // [상대 이름]
  | 'partyJoined' // [들어온 사람 이름]
  | 'partyLeft' // [나간 사람 이름]
  | 'partyYouLeft' // []
  | 'partyEnded' // [] 혼자 남아 파티가 풀렸다
  | 'nameBad' // [] 쓸 수 없는 이름
  | 'nameTaken' // [] 지금 접속해 있는 다른 사람이 쓰는 이름
  | 'reported' // [상대 이름] 신고가 접수됐다
  | 'reportWait' // [] 같은 사람을 방금 신고했다
  | 'salvaged' // [분해한 장비 수, 얻은 가루]
  | 'salvageCant' // [] 분해할 수 없는 장비가 섞여 있다 (낀 것, 보급형, 잠근 것, 없는 것) 또는 분해가 없는 게임
  | 'salvageFull' // [나올 가루, 가루를 더 들 수 있는 자리] 가루의 한도를 넘어 분해하지 않았다
  | 'gearLocked' // [] 잠근 장비라 팔거나 거래소에 올릴 수 없다
  | 'autoSalvaged' // [분해한 장비 수, 얻은 가루] 주운 장비를 자동으로 분해했다 (일정 시간의 합계)
  | 'awayLimit' // [하루 한도(시간)] 오늘의 자리 비움 사냥 시간을 다 썼다: 창을 닫으면 자동 사냥이 멈춘다 (자정에 다시 채워진다)
  | 'awayGear' // [가방이 가득 차 버려진 장비 수, 자동 분해한 장비 수, 얻은 가루] 자리를 비운 동안의 장비 (awayBack에 이어서 온다)
  | 'bagUpDone' // [새 가방 칸 수]
  | 'bagUpMax' // [] 더 넓힐 수 없다
  // ---- 운영: 관리자 통로(engine/server/net/admin.ts)와 기기 옮기기(engine/server/net/handoff.ts) ----
  | 'muted' // [남은 분 (0이면 영구)] 말이 막혀 있어 방금 한 말을 보내지 않았다
  | 'kicked' // [] 운영자가 내보냈다 (곧 연결이 끊긴다)
  | 'banned' // [남은 분 (0이면 영구)] 접속이 막혀 있다 (곧 연결이 끊긴다)
  | 'adminNotice' // [글] 운영자의 공지: 가운데 알림
  | 'adminChat' // [글] 운영자의 공지: 대화창의 한 줄
  | 'adminGive' // [재화 id(gold, sparks, exp)나 아이템 id, 수] 운영자가 주었다
  | 'adminTake' // [같은 것] 운영자가 거두었다
  | 'handoffGuest' // [] 이 브라우저는 캐릭터가 저장되지 않아 옮길 수 없다
  | 'handoffBad' // [더 틀릴 수 있는 횟수] 맞지 않거나 시간이 지난 코드
  | 'handoffWait' // [다시 해 볼 수 있을 때까지의 분] 틀린 코드를 너무 많이 넣었다
  | 'handoffSelf' // [] 지금 이 기기의 캐릭터의 코드다
  | 'handedOff' // [] 이 캐릭터를 다른 기기로 옮겼다: 이 기기에서는 더 이어지지 않는다
  // ---- 팀 (engine/server/game/systems/teams.ts) ----
  | 'teamJoined' // [팀 번호] 그 팀에 들어갔다
  | 'teamFull' // [팀 번호] 그 팀은 사람이 더 많아 들어갈 수 없다
  | 'teamStay' // [팀 번호(지금 팀)] 이 게임은 팀을 옮길 수 없다
  // ---- 수집형·방치형 (engine/server/game/systems/roster.ts, gacha.ts, stages.ts, dungeon.ts의 열쇠) ----
  | 'costShort' // [재화 'gold' | 'sparks'] 값을 치를 재화가 모자란다
  | 'heroUp' // [영웅 id, 레벨] 영웅의 레벨이 올랐다
  | 'heroStar' // [영웅 id, 별] 영웅의 별이 올랐다
  | 'heroMaxLv' // [영웅 id] 이 별에서는 더 오르지 않는다 (별을 올려야 한다)
  | 'heroShards' // [영웅 id, 모자란 조각] 별을 올릴 조각이 모자란다
  | 'heroNew' // [영웅 id] 새 영웅을 얻었다
  // 영웅의 성장 (HERO_RULES.skill·awaken, herogear 모듈: engine/shared/defs/herogrow.ts)
  | 'heroSkillUp' // [영웅 id, 기술 레벨] 기술 레벨이 올랐다
  | 'heroSkillMax' // [영웅 id] 이 별·각성에서는 기술 레벨이 더 오르지 않는다
  | 'heroAwaken' // [영웅 id, 각성 단계] 각성했다
  | 'heroAwakenMax' // [영웅 id] 더 각성할 수 없다
  | 'heroAwakenStars' // [영웅 id, 필요한 별] 별이 최대여야 각성한다
  | 'hgDrop' // [영웅 장비 id] 영웅 장비를 얻었다
  | 'hgFull' // [영웅 장비 id] 영웅 장비가 가득 차 줍지 못했다
  | 'hgEnhance' // [영웅 장비 id, 강화, 성공 1 실패 0] 영웅 장비를 강화했다
  | 'hgEnhanceMax' // [영웅 장비 id] 더 강화할 수 없다
  | 'hgSalvaged' // [분해한 수] 영웅 장비를 분해했다
  | 'stageClear' // [단계 id, 처음 깼으면 1] 단계를 깼다
  | 'stageFail' // [단계 id, 까닭 0 쓰러짐 1 시간] 단계를 깨지 못했다 (깬 단계로 돌아간다)
  | 'stageLocked' // [단계 id] 아직 갈 수 없는 단계다 (앞 단계를 먼저 깬다)
  | 'stageLast' // [] 마지막 단계까지 깼다: 같은 단계를 되풀이한다
  | 'dungeonNoKeys' // [던전 id] 열쇠가 없다
  | 'dungeonKeyBought' // [던전 id, 가진 열쇠] 열쇠를 샀다
  | 'dungeonKeyLimit' // [던전 id] 오늘은 더 살 수 없다
  // ---- 소탕·오프라인 진행·픽업 배너·선택권 (stages.ts, dungeon.ts, gacha.ts) ----
  | 'swept' // ['stage' | 'dungeon', id, 횟수] 소탕했다 (받은 것은 메시지 sweep)
  | 'sweepLocked' // ['stage' | 'dungeon', id] 아직 소탕할 수 없다 (깨지 않았거나 소탕할 수 없는 곳)
  | 'itemShort' // [재화나 아이템 id, 드는 수, 가진 수] 값(소탕권, 선택권, 재화, 영웅 성장의 재료)이 모자란다
  | 'stageAway' // [처음 단계 id, 지금 단계 id, 깬 단계의 수] 자리를 비운 동안 단계가 앞으로 나아갔다
  | 'bannerClosed' // [배너 id] 지금 열려 있지 않은 배너다 (기간이 아니다)
  | 'heroPicked' // [영웅 id, 이미 가졌으면 1, 받은 조각] 선택권으로 영웅을 골랐다
  // ---- 단계 밖 (roster.ts의 재료 교환) ----
  | 'heroTraded' // [영웅 id, 받은 조각, 쓴 아이템 id, 남은 아이템 수] 재료로 영웅의 조각을 얻었다 (HERO_RULES.trade)
  // ---- 판 (rooms 모듈: engine/server/game/systems/rooms.ts) ----
  | 'roomWait' // [] 판을 열고 다른 사람을 기다린다
  | 'roomStart' // [먼저 두면 1, 상대의 이름(컴퓨터는 RoomDef.cpuName이나 빈 문자열: 셋 이상이면 다음 자리의 이름), 자리 수] 판이 시작됐다
  | 'roomFull' // [] 더 열 수 있는 판이 없다
  | 'roomBusy' // [] 이미 판에 앉아 있다
  | 'roomGone' // [] 들어갈 수 없는 판이다 (찼거나 없어졌다, 또는 컴퓨터와 둘 수 없는 판)
  | 'roomNotTurn' // [] 내 차례가 아니다
  | 'roomTimeout' // [이름(컴퓨터는 RoomDef.cpuName이나 빈 문자열)] 시간이 다 되어 그 사람의 차례를 게임이 정한 대로 처리했다 (기본: 넘김)
  | 'roomFoeLeft' // [이름, 기다리는 초] 함께 앉은 사람의 연결이 끊겼다
  | 'roomFoeBack' // [이름] 끊겼던 사람이 돌아왔다
  | 'roomBack' // [] 끊겼던 내가 두던 판으로 돌아왔다
  | 'roomResult' // [0 이김 1 짐 2 비김(등수로 끝낸 판: 1등 0, 함께 1등 2, 그 밖 1), 까닭, 내 등수(등수로 끝냈으면, 아니면 0), 등수를 받은 자리 수, 같은 등수가 또 있으면 1] 판이 끝났다
  | 'roomAgainWait' // [] 다시 하기: 다른 사람을 기다린다
  | 'roomFoeGone' // [이름] 함께 앉은 사람이 판을 떠나 다시 할 수 없다
  | 'roomFewer' // [시작할 수 있는 가장 적은 사람 수] '지금 시작'을 눌렀지만 사람이 모자란다
  // ---- 캐릭터 정의와 변신 (chars, morph 모듈: engine/server/game/systems/chars.ts, morph.ts) ----
  | 'charBad' // [거절 코드(CharErr), 자리, 값] 캐릭터 정의가 거절됐다 (engine/shared/defs/chardef.ts의 validateCharDef)
  | 'charNew' // [캐릭터 id] 새 캐릭터를 얻었다 (변신에 쓴다)
  | 'morphOn' // [캐릭터 id] 변신했다
  | 'morphOff' // [] 변신을 풀었다
  | 'morphEnd' // [] 변신의 시간이 다 되어 풀렸다
  | 'morphGone' // [] 그 캐릭터의 정의가 빠져 변신이 풀렸다
  | 'morphWait' // [남은 초] 아직 다시 변신할 수 없다
  | 'morphFight' // [] 싸우는 중이라 변신할 수 없다
  | 'morphNone' // [] 가지지 않았거나 없는 캐릭터다
  // ---- 웹 출시의 바탕: 내 데이터 (engine/server/net/web.ts) ----
  | 'eraseAsked' // [유예 일수] 삭제를 요청했다: 그 뒤에 지운다 (그동안 취소할 수 있다)
  | 'eraseCanceled' // [] 삭제 요청을 거뒀다
  | 'erased' // [] 요청한 대로 이 캐릭터의 데이터를 지웠다 (연결을 끊는다)
  | 'mydataGuest' // [] 저장되지 않는 손님이라 내보내거나 지울 것이 없다
  | 'mydataWait'; // [초] 너무 잦다: 그만큼 뒤에 다시
