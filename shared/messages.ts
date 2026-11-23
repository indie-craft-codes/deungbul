// 서버가 플레이어에게 보내는 안내문의 종류.
// 서버는 문장을 보내지 않고 종류(k)와 값(a)만 보낸다. 문장은 클라이언트의 언어 파일이 만든다.
// 새 안내문을 더하면 모든 언어 파일이 그 문장을 갖춰야 컴파일된다.

export type MsgArg = string | number;

/** 종류별로 a에 들어가는 값은 주석에 적는다. id류(몬스터, 주민)는 클라이언트가 이름으로 바꾼다. */
export type MsgKey =
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
  | 'offerFar' // []
  | 'noSparks' // []
  | 'towerFull' // []
  | 'noResident' // []
  | 'offered' // [바친 수, 누적 기여, 'tower' 또는 'resident']
  | 'stageChanged' // [단계 0~2, 등탑 id]
  | 'towerLit' // [등탑 id] 꺼져 있던 등탑이 켜졌다
  | 'residentBack' // [주민 id]
  | 'raidSoon' // [남은 초]
  | 'raidStart' // [적의 수]
  | 'raidWon' // [밝기 변화]
  | 'raidLost' // [밝기 변화]
  | 'raidReward' // [불씨, 경험치]
  | 'questStep' // [경험치, 불씨] 단계를 마침
  | 'questDone' // [장 id] 장을 마침
  | 'bought' // [아이템 id, 직업 id]
  | 'classChanged' // [직업 id]
  | 'classFar' // []
  | 'tierUp' // [단계, 골드] 기여 단계가 올랐다
  | 'bossUp' // [몬스터 id] 필드 보스가 나타났다
  | 'bossDown' // [몬스터 id, 함께 싸운 사람 수]
  | 'shopFar' // []
  | 'notStocked' // []
  | 'alreadyBest' // []
  | 'potionFull' // []
  | 'noGold' // []
  | 'noPotion' // []
  | 'hpFull' // []
  | 'rested' // [쌓인 휴식 보너스]
  | 'gearDrop' // [칸 id, 등급 id] 장비를 주웠다
  | 'gearFull' // [] 가방이 가득 차서 줍지 못했다
  | 'gearSold' // [받은 골드]
  | 'enhanceOk' // [강화 단계]
  | 'enhanceFail' // []
  | 'enhanceMax' // []
  | 'mailNew' // [] 우편이 왔다
  | 'mailGot' // [골드, 경험치, 불씨] 우편의 보상을 받았다
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
  | 'raidElsewhere' // [채널 번호] 습격의 적이 내 채널에는 없고 그 채널에 있다
  | 'statNone' // [] 찍을 점수가 없다
  | 'statReset' // [] 능력치를 모두 돌려받았다
  | 'skillUp' // [기술 id, 단계]
  | 'skillMax' // []
  | 'skillNeedLv' // [필요한 레벨]
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
  | 'reported' // [상대 이름] 신고가 접수됐다
  | 'reportWait'; // [] 같은 사람을 방금 신고했다
