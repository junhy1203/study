// Shared room rules: no DOM dependencies, also validated by the server.
export const ROOM_SIZE=8;
export const ROOM_EMOTES=Object.freeze({wave:{emoji:'👋',label:'인사'},heart:{emoji:'💛',label:'좋아요'},clap:{emoji:'👏',label:'박수'},laugh:{emoji:'😆',label:'웃음'},cheer:{emoji:'🙌',label:'만세'},think:{emoji:'🤔',label:'생각 중'},sleep:{emoji:'😴',label:'졸려요'},fire:{emoji:'🔥',label:'집중 모드'}});
export const ROOM_THEMES={sage:{name:'초록 서재',wall:'#d8e5d7',side:'#bacdb9',floor:'#e7d9bd'},cream:{name:'햇살 원목',wall:'#f1e3cc',side:'#dfc9aa',floor:'#debd94'},night:{name:'달빛 서재',wall:'#59627d',side:'#414c68',floor:'#8993ab'}};
export const ROOM_ITEMS={
  desk:{name:'공부 책상',w:2,h:1,height:39,color:'#b98458'},
  shelf:{name:'책장',w:1,h:1,height:78,color:'#ac805b'},
  chair:{name:'의자',w:1,h:1,height:28,color:'#7d9b87'},
  plant:{name:'초록 화분',w:1,h:1,height:47,color:'#639573'},
  lamp:{name:'스탠드',w:1,h:1,height:63,color:'#ddbb72'},
  sofa:{name:'포근한 소파',w:2,h:1,height:31,color:'#a3b6a1'},
  rug:{name:'체크 러그',w:2,h:2,height:1,color:'#c6a8a0',walkable:true},
  table:{name:'작은 테이블',w:1,h:1,height:21,color:'#c2926a'},
};
export function roomFootprint(item){const spec=ROOM_ITEMS[item.kind];return item.rotation?{w:spec.h,h:spec.w}:{w:spec.w,h:spec.h};}
export function roomCells(item){const {w,h}=roomFootprint(item);return Array.from({length:w*h},(_,i)=>({x:item.x+i%w,y:item.y+Math.floor(i/w)}));}
export function canPlace(items,item,ignoreId=item.id){
  if(!ROOM_ITEMS[item.kind]||!Number.isInteger(item.x)||!Number.isInteger(item.y))return false;
  const cells=roomCells(item);if(cells.some(p=>p.x<0||p.y<0||p.x>=ROOM_SIZE||p.y>=ROOM_SIZE))return false;
  return !items.some(other=>other.id!==ignoreId&&Boolean(ROOM_ITEMS[other.kind].walkable)===Boolean(ROOM_ITEMS[item.kind].walkable)&&roomCells(other).some(a=>cells.some(b=>a.x===b.x&&a.y===b.y)));
}
export function isRoomFree(items,x,y){return x>=0&&y>=0&&x<ROOM_SIZE&&y<ROOM_SIZE&&!items.some(item=>!ROOM_ITEMS[item.kind].walkable&&roomCells(item).some(p=>p.x===x&&p.y===y));}
export function roomPath(items,start,end){
  if(!isRoomFree(items,end.x,end.y))return [];
  const queue=[{...start,path:[]}],seen=new Set([`${start.x},${start.y}`]);
  for(let i=0;i<queue.length;i++){const p=queue[i];if(p.x===end.x&&p.y===end.y)return p.path;
    for(const [dx,dy]of [[0,1],[1,0],[0,-1],[-1,0]]){const x=p.x+dx,y=p.y+dy,key=`${x},${y}`;if(seen.has(key)||!isRoomFree(items,x,y))continue;seen.add(key);queue.push({x,y,path:[...p.path,{x,y}]});}}
  return [];
}
export function defaultRoom(){return {version:1,theme:'sage',items:[{id:'desk',kind:'desk',x:1,y:1,rotation:0},{id:'shelf',kind:'shelf',x:0,y:0,rotation:0},{id:'plant',kind:'plant',x:6,y:0,rotation:0},{id:'chair',kind:'chair',x:2,y:2,rotation:0},{id:'rug',kind:'rug',x:3,y:4,rotation:0},{id:'lamp',kind:'lamp',x:0,y:3,rotation:0}],spawn:{x:4,y:5}};}
export function validateRoom(input){
  if(!input||!Object.hasOwn(ROOM_THEMES,input.theme)||!Array.isArray(input.items)||input.items.length>32)throw new Error('방 테마와 가구 수를 확인해 주세요.');
  const items=[],ids=new Set();
  for(const value of input.items){if(!value||!Object.hasOwn(ROOM_ITEMS,value.kind)||typeof value.id!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test(value.id)||ids.has(value.id)||![0,1].includes(value.rotation))throw new Error('가구 정보를 확인해 주세요.');
    const item={id:value.id,kind:value.kind,x:value.x,y:value.y,rotation:value.rotation};if(!canPlace(items,item))throw new Error('가구가 겹치거나 방 밖에 있어요.');ids.add(item.id);items.push(item);}
  const spawn=input.spawn;if(!spawn||!Number.isInteger(spawn.x)||!Number.isInteger(spawn.y)||!isRoomFree(items,spawn.x,spawn.y))throw new Error('아바타가 설 공간을 남겨 주세요.');
  return {version:1,theme:input.theme,items,spawn:{x:spawn.x,y:spawn.y}};
}
