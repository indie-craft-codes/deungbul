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
  | 'kill' // [몬스터 id, 경험치, 불씨, 골드]
  | 'levelUp' // [레벨]
  | 'died' // [다시 일어난 등탑 id]
  | 'bought' // [아이템 id, 직업 id]
  | 'classChanged' // [직업 id]
  | 'classFar' // []
  | 'bossUp' // [몬스터 id] 필드 보스가 나타났다
  | 'bossDown' // [몬스터 id, 함께 싸운 사람 수]
  | 'shopFar' // []
  | 'notStocked' // []
  | 'alreadyBest' // []
  | 'potionFull' // []
  | 'noGold' // []
  | 'noPotion' // []
  | 'hpFull' // []
  | 'gearDrop' // [칸 id, 등급 id] 장비를 주웠다
  | 'gearFull' // [] 가방이 가득 차서 줍지 못했다
  | 'gearSold' // [받은 골드]
  | 'enhanceOk' // [강화 단계]
  | 'enhanceFail' // []
  | 'enhanceMax' // []
  | 'mailNew' // [] 우편이 왔다
  | 'mailGot' // [골드, 경험치, 불씨, 장비 수, 아이템 수] 우편의 보상을 받았다
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
  | 'awayBack' // [자리를 비운 분, 얻은 불씨, 얻은 골드, 오른 레벨] 자리를 비운 동안 자동 사냥을 했다
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
  | 'awayGear' // [가방이 가득 차 버려진 장비 수, 자동 분해한 장비 수, 얻은 가루] 자리를 비운 동안의 장비 (awayBack에 이어서 온다)
  | 'bagUpDone' // [새 가방 칸 수]
  | 'bagUpMax'; // [] 더 넓힐 수 없다
