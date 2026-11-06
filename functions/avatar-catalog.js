// Shared, public catalog. Prices are Focus Time seconds, enforced by the server.
export const AVATAR_DEFAULT=Object.freeze({character:'sprout',hat:'none',glasses:'none',effect:'none',background:'none',accessory:'none'});
const group=(slot,rows)=>rows.map(([value,name,minutes,tier='일반'])=>({id:`${slot}_${value}`,slot,value,name,costSeconds:minutes*60,tier}));
const luxury=(slot,rows)=>group(slot,rows.map(([value,name,hours])=>[value,name,hours*60,'신화']));
export const AVATAR_CATALOG=Object.freeze([
  ...group('character',[['sprout','새싹 친구',0],['cat','치즈 고양이',30],['fox','노을 여우',45],['penguin','꼬마 펭귄',45],['robot','우주 로봇',60,'레어'],['bunny','달빛 토끼',60,'레어'],['bear','꿀빛 곰',45],['dragon','별빛 드래곤',120,'에픽']]),
  ...group('hat',[['none','모자 없음',0],['cap','블루 캡',10],['crown','황금 왕관',45,'레어'],['wizard','별의 마법사',60,'에픽'],['beanie','체리 비니',15],['headphones','네온 헤드폰',30,'레어'],['halo','천사의 고리',60,'에픽'],['flower','꽃 화관',25],['samurai','붉은 무사',90,'에픽'],['astronaut','우주 헬멧',90,'에픽']]),
  ...group('glasses',[['none','안경 없음',0],['round','클래식 안경',10],['sun','미드나잇 선글라스',15],['heart','하트 선글라스',20],['visor','사이버 바이저',45,'레어'],['monocle','골든 모노클',30,'레어'],['goggles','탐험가 고글',25]]),
  ...group('effect',[['none','효과 없음',0],['stars','골든 스타 궤도',60,'레어'],['leaves','숲의 정령',45,'레어'],['sparkles','오로라 반짝임',60,'레어'],['flame','불꽃 군주',120,'에픽'],['galaxy','은하수 소환',180,'레전드'],['snow','서리의 왕관',90,'에픽'],['hearts','하트 버블',45,'레어']]),
  ...group('background',[['none','기본 배경',0],['forest','반딧불 숲',45,'일반'],['sunset','노을빛 언덕',60,'레어'],['ocean','푸른 산호 바다',90,'레어'],['aurora','오로라 설원',120,'에픽'],['cosmos','별의 천문대',180,'레전드']]),
  ...group('character',[
    ['knight','견습 기사',45],['ranger','숲의 궁수',45],['mage','수정 마법사',60,'레어'],['rogue','그림자 도적',60,'레어'],['paladin','태양의 성기사',150,'에픽'],['necromancer','영혼술사',150,'에픽'],['slime','에메랄드 슬라임',30],['golem','룬석 골렘',90,'레어'],['skeleton','꼬마 해골 검사',60,'레어'],['ghost','달빛 유령',60,'레어'],['phoenix','불사조',240,'레전드'],['unicorn','오팔 유니콘',180,'에픽'],['werewolf','은빛 늑대',120,'에픽'],['vampire','밤의 귀족',150,'에픽'],['angel','새벽의 천사',240,'레전드'],['reaper','황혼의 사신',300,'레전드'],['mushroom','버섯 정찰병',30],['treant','고목 수호자',90,'레어'],['fairy','별가루 요정',120,'에픽'],['demonking','심연의 마왕',360,'레전드'],
  ]),
  ...group('hat',[
    ['ironhelm','철의 기사 투구',30],['rangerhood','초록 궁수 후드',30],['pirate','해적 선장의 모자',45,'레어'],['antlers','정령의 사슴뿔',60,'레어'],['lotus','연꽃 관',45,'레어'],['icecrown','빙결 왕관',120,'에픽'],['dragonhelm','용기사 투구',150,'에픽'],['phoenixcrest','불사조 깃털관',180,'에픽'],['runecrown','고대 룬 왕관',240,'레전드'],['voidhorns','공허의 쌍각',300,'레전드'],['catcap','고양이 후드',30],['mushroomcap','붉은 버섯 모자',25],['jester','달빛 광대 모자',60,'레어'],['viking','바이킹 투구',60,'레어'],['ninja','닌자 머리띠',30],['rose','흑장미 머리장식',90,'레어'],['tiara','별의 티아라',120,'에픽'],['sunhalo','태양신의 광배',300,'레전드'],['witchhat','저주받은 마녀 모자',150,'에픽'],['valkyrie','발키리 날개 투구',240,'레전드'],
  ]),
  ...group('glasses',[
    ['eyepatch','해적 안대',15],['runeeye','룬술사의 외눈',60,'레어'],['iceglass','서리 수정 렌즈',90,'에픽'],['dragonmask','용비늘 반가면',120,'에픽'],['steampunk','증기기관 렌즈',45,'레어'],['ninjawrap','그림자 복면',30],['starframe','별 모양 안경',30],['butterfly','요정의 나비 가면',60,'레어'],['goldmask','황금 수호 가면',180,'레전드'],['voidvisor','공허의 눈',240,'레전드'],['crystal','보랏빛 수정 안경',90,'에픽'],['plague','연금술사의 부리 가면',120,'에픽'],
  ]),
  ...group('effect',[
    ['fireflies','반딧불 행진',30],['petals','벚꽃의 맹세',45,'레어'],['runes','비전 마법진',120,'에픽'],['lightning','뇌신의 번개',180,'에픽'],['swords','무한의 검무',240,'레전드'],['phoenixfire','불사조의 비상',300,'레전드'],['void','심연의 균열',360,'레전드'],['butterflies','요정 나비 군무',90,'레어'],['bubbles','물방울 정령',30],['coins','보물 고블린의 축복',60,'레어'],['poison','맹독 연금술',120,'에픽'],['crystals','얼음 수정 결계',150,'에픽'],['meteors','유성 폭풍',300,'레전드'],['dragonsoul','고대 용의 혼',360,'레전드'],['holy','대천사의 가호',240,'레전드'],['ravens','흑마법사의 까마귀',150,'에픽'],
  ]),
  ...group('background',[
    ['tavern','모험가의 선술집',45],['meadow','시작의 초원',30],['castle','왕국의 성채',90,'레어'],['dungeon','고대 지하 던전',90,'레어'],['enchanted','마력의 숲',120,'에픽'],['volcano','불꽃 용의 화산',180,'에픽'],['icepalace','얼음 여왕의 궁전',180,'에픽'],['skyisland','천공의 섬',240,'레전드'],['abyss','심연의 왕좌',360,'레전드'],['dragonnest','황금 용의 둥지',300,'레전드'],['moonshrine','달빛 신전',150,'에픽'],['worldtree','세계수의 성역',480,'레전드'],
  ]),
  ...group('character',[
    ['monohoodie','모노 후디',45],['skater','스케이트 크루',60,'레어'],['nightdj','나이트 DJ',120,'에픽'],['barista','라떼 바리스타',45],['photographer','스트리트 포토그래퍼',90,'레어'],['runner','러닝 크루',60,'레어'],['workwear','블루 워크웨어',60,'레어'],['director','크리에이티브 디렉터',180,'레전드'],
  ]),
  ...group('hat',[
    ['snapback','블랙 스냅백',30],['bucket','샌드 버킷햇',30],['beret','모노 베레모',45,'레어'],['ribbeanie','리브드 비니',30],['dadcap','빈티지 볼캡',30],['earmuffs','크림 이어머프',60,'레어'],['earbuds','실버 이어버드',90,'에픽'],['racingcap','레이싱 클럽 캡',120,'에픽'],
  ]),
  ...group('glasses',[
    ['clearframe','클리어 프레임',30],['metalframe','실버 메탈 프레임',60,'레어'],['sportwrap','스포츠 랩어라운드',120,'에픽'],['darkrim','매트 블랙 뿔테',45,'레어'],['retroamber','앰버 틴트',60,'레어'],['rimless','크롬 림리스',180,'레전드'],
  ]),
  ...group('effect',[
    ['neonloop','네온 루프',120,'에픽'],['vinylbeat','바이닐 그루브',150,'에픽'],['chromehaze','리퀴드 크롬',240,'레전드'],['prism','프리즘 글로우',150,'에픽'],['cityrain','시티 레인',60,'레어'],['confetti','컬러 컨페티',30],['shutter','스튜디오 플래시',60,'레어'],['speedline','러너스 하이',45,'레어'],
  ]),
  ...group('background',[
    ['loft','시티 로프트',60,'레어'],['nightcity','미드나이트 시티',180,'에픽'],['rooftop','선셋 루프톱',120,'에픽'],['studio','화이트 스튜디오',45],['coast','오션 드라이브',90,'레어'],['metro','새벽 지하철',120,'에픽'],['gallery','콘크리트 갤러리',150,'에픽'],['arcade','네온 아케이드',240,'레전드'],
  ]),
  ...luxury('character',[['rainbowsovereign','무지개 다이아 대공',999]]),
  ...luxury('hat',[['prismcrown','칠색 보석 황제관',333],['discohalo','천상 디스코 광배',777]]),
  ...luxury('glasses',[['diamondgaze','다이아 샤라랑 안경',100],['prismveil','무지개 여신의 가면',333]]),
  ...luxury('effect',[['rainbowparade','무지개 은하 행진',555],['sharalashower','샤라랑 별가루 샤워',1111],['prismnova','우주 대폭발 프리즘',9999]]),
  ...luxury('background',[['rainbowpalace','구름 위 무지개 궁전',888],['diamondgalaxy','다이아몬드 은하 왕좌',2222]]),
  ...group('accessory',[
    ['none','액세서리 없음',0],
    ['sproutorb','꼬마 새싹 구슬',15],['cloudlet','몽실 구름',20],['starbud','별사탕 친구',25],['bubblebot','방울 로봇',30],['honeybee','꿀벌 배달부',30],['jellybean','말랑 젤리',45],
    ['moonbunny','초승달 토끼',60,'레어'],['minidrone','네온 미니 드론',75,'레어'],['spellbook','둥둥 마법책',90,'레어'],['crystalwing','수정 나비',90,'레어'],['tinywhale','하늘 고래',120,'레어'],['treasureling','꼬마 보물상자',120,'레어'],
    ['flamefox','불꽃 여우 정령',180,'에픽'],['icejelly','빙하 해파리',180,'에픽'],['chronorb','시간의 톱니 구슬',240,'에픽'],['ufo','오로라 UFO',240,'에픽'],['cometcat','혜성 고양이',300,'에픽'],
    ['stardragon','은하 꼬마 용',480,'레전드'],['sunphoenix','태양 불사조',600,'레전드'],['voidwhale','심연의 우주 고래',900,'레전드'],['royalorb','황금 왕실 정령',1200,'레전드'],
  ]),
  ...luxury('accessory',[['rainbowseraph','칠색 다이아 세라핌',333],['prismleviathan','무지개 은하룡',999],['universeling','샤라랑 우주 한 조각',9999]]),
  ...group('accessory',[
    ['woodpencil','둥둥 나무 연필',10],['redpencil','빨간 채점 연필',15],['blueballpen','파란 볼펜',20],['blackballpen','검정 볼펜',20],['pinkgelpen','딸기우유 젤펜',25],['yellowhighlighter','레몬 형광펜',25],['waxcrayon','구름 크레용',30],['mechanicalpencil','민트 샤프',45],
    ['silvermechanical','실버 제도 샤프',60,'레어'],['glittergelpen','별가루 글리터 펜',75,'레어'],['fourcolorpen','찰칵 사색 볼펜',90,'레어'],['classicfountain','클래식 만년필',120,'레어'],['inkbrushpen','먹빛 붓펜',90,'레어'],['watercolorbrush','수채화 붓',120,'레어'],
    ['crystalpen','수정 보석 펜',180,'에픽'],['featherquill','달빛 깃펜',180,'에픽'],['starlighter','별빛 형광펜',240,'에픽'],['draftingcompass','궤도의 컴퍼스',240,'에픽'],['draftingpen','설계자의 로트링',300,'에픽'],
    ['goldfountain','황금 서약 만년필',480,'레전드'],['aurorabrush','오로라를 그리는 붓',600,'레전드'],['orbitquill','은하 기록자의 깃펜',1200,'레전드'],
  ]),
  ...luxury('accessory',[['rainbowquill','칠색 창조주의 깃펜',333],['cosmicfountain','샤라랑 우주 만년필',9999]]),
  ...luxury('effect',[
    ['celestialwings','천상의 일곱 날개',3333],['rainbowthrone','무지개 황제의 강림',7777],['meteorcathedral','별이 쏟아지는 성역',15000],['prismfireworks','프리즘 불꽃 대축제',33333],['galacticgate','차원을 여는 은하문',55555],['cosmiccoronation','창세의 무지개 대관식',88888],
  ]),
]);
export const avatarItem=(slot,value)=>AVATAR_CATALOG.find(item=>item.slot===slot&&item.value===value);
export function ownedAvatarItems(profile={}){
  const base=AVATAR_CATALOG.filter(item=>item.costSeconds===0).map(item=>item.id);
  // Preserve equipped items from the former free editor exactly once.
  const saved=Array.isArray(profile.avatarInventory)?profile.avatarInventory:Object.entries(profile.avatar||{}).map(([slot,value])=>avatarItem(slot,value)?.id);
  return [...new Set([...base,...saved.filter(id=>AVATAR_CATALOG.some(item=>item.id===id))])];
}
