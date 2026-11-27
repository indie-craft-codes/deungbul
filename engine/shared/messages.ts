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
  // 판의 공통화 (RoomDef의 codes·lead·voteS·watch·midJoin)
  | 'roomCodeBad' // [] 그런 방 코드가 없다
  | 'roomPassword' // [] 비밀번호가 틀렸거나 비었다
  | 'roomSlow' // [] 비밀번호를 너무 자주 틀려 잠시 막혔다
  | 'roomFriendsOnly' // [] 방장의 친구만 들어가는 판이다
  | 'roomBanned' // [] 방장이 내보낸 판이라 다시 들어갈 수 없다
  | 'roomKicked' // [] 방장(이나 투표)이 나를 내보냈다
  | 'roomKickedOut' // [이름] 그 사람이 내보내졌다
  | 'roomLeadNew' // [이름] 방장이 바뀌었다
  | 'roomLeadOnly' // [] 방장만 할 수 있다
  | 'roomNotReady' // [준비하지 않은 사람 수] 모두 준비해야 시작할 수 있다
  | 'roomVote' // [무엇 opt|again|kick, 낸 사람, 내보낼 사람의 이름(kick)] 투표가 열렸다 (규칙의 이름·값은 개인 상태 room의 vote에)
  | 'roomVoteEnd' // [통과 1 부결 0, 무엇] 투표가 끝났다
  | 'roomVoteBusy' // [] 이미 투표가 진행 중이다
  | 'roomRegroup' // [] 같은 무리로 다음 판: 대기실로 돌아왔다
  | 'roomQueued' // [관전 지연 초] 두는 중인 판이라 구경하며 다음 판을 기다린다
  | 'roomWatching' // [관전 지연 초] 판을 구경한다
  | 'roomWatchFull' // [] 구경하는 사람이 너무 많다
  | 'roomMidJoin' // [이름] 그 사람이 판 중간에 들어왔다
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
  // ---- 운영의 바탕 (기능 깃발, 점검: engine/server/game/systems/live.ts, engine/server/net/server.ts) ----
  | 'featureOff' // [깃발 이름 (join, chat, market, mail, gacha 또는 게임의 FLAGS)] 그 기능이 잠시 꺼져 있다
  | 'joinClosed' // [] 지금은 새로 접속할 수 없다 (깃발 join이 꺼짐)
  | 'maintSoon' // [남은 분, 예정 끝 시각(UTC ms, 없으면 0)] 곧 점검이 시작된다 (30·10·5·1분 전)
  | 'maintStart' // [예정 끝 시각(UTC ms, 없으면 0)] 점검이 시작되어 접속이 끊긴다
  | 'maintEnd' // [] 점검이 끝났다 (점검 중에 들어와 있던 관리자에게)
  // ---- 웹 출시의 바탕: 내 데이터 (engine/server/net/web.ts) ----
  | 'eraseAsked' // [유예 일수] 삭제를 요청했다: 그 뒤에 지운다 (그동안 취소할 수 있다)
  | 'eraseCanceled' // [] 삭제 요청을 거뒀다
  | 'erased' // [] 요청한 대로 이 캐릭터의 데이터를 지웠다 (연결을 끊는다)
  | 'mydataGuest' // [] 저장되지 않는 손님이라 내보내거나 지울 것이 없다
  | 'mydataWait' // [초] 너무 잦다: 그만큼 뒤에 다시
  // ---- 사회와 안전: 차단, 대화, 친구, 제한 모드 (engine/server/net/social.ts) ----
  | 'blockedOn' // [이름] 차단했다 (그 사람의 대화·귓말·요청·초대가 오지 않는다)
  | 'blockedOff' // [이름] 차단을 풀었다
  | 'blockFull' // [상한] 더 차단할 수 없다
  | 'chatSame' // [] 같은 말을 방금 했다 (도배 막기)
  | 'chatQuickOnly' // [] 제한 모드라 정해진 문장만 쓸 수 있다
  | 'chatNoParty' // [] 파티가 없어 파티 대화를 보낼 수 없다
  | 'whisperOffline' // [이름] 지금 접속해 있지 않다
  | 'whisperNoOne' // [이름] 그런 이름의 사람이 없다
  | 'whisperNo' // [이름] 귓말을 받지 않는 사람이다
  | 'limitedCant' // [] 제한 모드에서는 쓸 수 없는 기능이다
  | 'friendGuest' // [] 저장되지 않는 손님은 친구를 맺을 수 없다
  | 'friendWait' // [초] 요청은 잠시 뒤에
  | 'friendNoOne' // [이름] 그런 이름의 사람이 없다
  | 'friendAlready' // [이름] 이미 친구다
  | 'friendAsked' // [이름] 친구 요청을 보냈다
  | 'friendAskIn' // [이름] 친구 요청이 왔다
  | 'friendNew' // [이름] 친구가 되었다
  | 'friendNo' // [이름] 그 사람에게는 지금 요청할 수 없다 (요청을 받지 않음, 상한)
  | 'friendFull' // [상한] 친구가 가득 찼다
  | 'friendRemoved' // [이름] 친구를 끊었다
  | 'friendOffline' // [이름] 친구가 접속해 있지 않다
  // ---- 운영 도구와 고객지원 (support 모듈: engine/server/net/support.ts, 롤백: engine/server/net/rollback.ts) ----
  | 'supportSent' // [번호] 문의를 받았다
  | 'supportAnswered' // [번호] 문의에 답이 왔다
  | 'supportShort' // [가장 짧은 글자 수] 글이 너무 짧다
  | 'supportWait' // [초] 문의는 잠시 뒤에
  | 'supportFull' // [열린 문의의 상한] 답을 기다리는 문의가 많다 (하루 상한도 이것)
  | 'supportAppealed' // [] 이 제재에는 이미 이의를 냈다
  | 'supportGuest' // [] 저장되지 않는 손님은 답을 받을 곳이 없어 문의할 수 없다
  | 'supportNoSanction' // [] 이의를 낼 제재가 없다
  | 'supportOff' // [] 지금은 문의를 받지 않는다
  | 'rolledBack' // [] 운영자가 이 캐릭터를 앞의 시점으로 되돌렸다 (연결을 끊는다: 다시 들어오면 되돌린 상태)
  // ---- 게임 안의 모드 (modes 모듈: engine/server/game/systems/modes.ts), 단계를 뒤에서 이어 가기, 자동 사냥의 안전장치 ----
  | 'modeOn' // [모드 id] 그 모드로 왔다
  | 'modeWait' // [남은 초] 아직 모드를 바꿀 수 없다
  | 'modeStandOn' // [] 들판의 몸이 남아 자동 사냥을 이어 간다 (다른 모드에 가 있는 동안)
  | 'modeStandDown' // [] 들판에서 대신 사냥하던 몸이 쓰러졌다
  | 'modeStandEnd' // [] 들판의 대신 사냥이 끝났다 (오늘의 시간을 다 썼다)
  | 'stageBgStop' // [단계 id, 까닭 0 자동 진행이 꺼짐 1 실패] 뒤에서 이어 가던 단계가 멈췄다
  | 'autoRetreat' // [체력 %] 체력이 낮아 자동 사냥을 멈추고 물러났다 (안전장치)
  | 'autoNoPotion' // [] 물약이 떨어져 자동 사냥을 멈췄다 (안전장치)
  | 'autoDied'; // [] 쓰러져 자동 사냥을 끝냈다 (안전장치)
