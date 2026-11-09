import {weekKey} from './domain.js';
import {roomStudyTotals} from './room-study.js';
import {roomAvailable,isGeneralRoom} from './room-service.js';

export function sharedStudySeconds(row){
  return Math.max(0,(Number(row?.totalSeconds)||0)-Math.max(0,Number(row?.privateSeconds)||0));
}

// Only callers which already checked friendship may supply targets here.
// Public statistics are selected explicitly; wallets and account fields never leave this module.
export async function friendHighlights(db,viewer,targets,now=Date.now()){
  const date=new Date(now+9*3600000).toISOString().slice(0,10),week=weekKey(date),ids=targets.map(row=>row.uid);
  const schools=[...new Set(targets.map(row=>row.profile.schoolId).filter(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id)))];
  const top=async path=>(await db.collection(path).orderBy('totalSeconds','desc').limit(3).get()).docs.map(doc=>({uid:doc.id,seconds:Number(doc.data().totalSeconds)||0}));
  const [stats,app,schoolRows,roomDoc]=await Promise.all([
    ids.length?db.getAll(...ids.flatMap(uid=>['stats/summary',`dailyStats/${date}`,`weeklyStats/${week}`].map(path=>db.doc(`users/${uid}/${path}`)))):[],
    top(`leaderboards/${week}/entries`),Promise.all(schools.map(async id=>[id,await top(`schoolLeaderboards/${id}/weeks/${week}/entries`)])),
    viewer.activeRoomId?db.doc(`studyRooms/${viewer.activeRoomId}`).get():null,
  ]);
  const room=roomDoc?.data(),shared=room&&roomAvailable(room,viewer.activeRoomId,now)&&room.memberIds?.includes(viewer.uid),schoolMap=new Map(schoolRows);
  const roomEntries=shared?room.memberIds.map(uid=>({uid,seconds:Math.floor(roomStudyTotals(room.members?.[uid],room.studyTotals?.[uid],now).week.ms/1000)})).sort((a,b)=>b.seconds-a.seconds||a.uid.localeCompare(b.uid)):[];
  const badges=(uid,rows,label,scope)=>{const index=rows.findIndex(row=>row.uid===uid);if(index<0||rows[index].seconds<=0)return [];const rank=1+rows.filter(row=>row.seconds>rows[index].seconds).length;return rank<=3?[{scope,label,rank}]:[];};
  return new Map(targets.map(({uid,profile},i)=>{
    const ranks=[...badges(uid,app,'앱','app'),...badges(uid,schoolMap.get(profile.schoolId)||[],'학교','school')];
    if(shared&&room.memberIds.includes(uid))ranks.push(...badges(uid,roomEntries,room.title||'스터디룸',isGeneralRoom(room,viewer.activeRoomId)?'schoolRoom':'room'));
    return [uid,{todaySeconds:sharedStudySeconds(stats[i*3+1]?.data()),weekSeconds:sharedStudySeconds(stats[i*3+2]?.data()),totalSeconds:sharedStudySeconds(stats[i*3]?.data()),ranks}];
  }));
}
