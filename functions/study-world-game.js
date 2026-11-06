import {HttpsError} from './platform-http.js';

const fail=(code,message)=>{throw new HttpsError(code,message);};
const choices=['rock','paper','scissors'];
const live=game=>game.status==='pending'||game.status==='playing';
export function pruneWorldGames(games,members,now){
  return (games||[]).filter(game=>game.updatedAtMs>now-300000).slice(-16).map(game=>live(game)&&(game.expiresAtMs<=now||!Object.hasOwn(members,game.from)||!Object.hasOwn(members,game.to))?{...game,status:'cancelled',updatedAtMs:now}:game);
}
export function changeWorldGame(games,uid,input,members,now){
  const result=structuredClone(games),action=input.action;
  if(action==='rpsInvite'){
    if(typeof input.gameId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(input.gameId)||input.uid===uid||!Object.hasOwn(members,input.uid))fail('invalid-argument','같은 방에 있는 친구를 선택해 주세요.');
    const existing=result.find(game=>game.id===input.gameId);
    if(existing){if(existing.from===uid&&existing.to===input.uid)return result;fail('already-exists','이미 사용한 게임 번호예요.');}
    if(result.some(game=>live(game)&&[game.from,game.to].some(id=>id===uid||id===input.uid)))fail('failed-precondition','이미 진행 중인 가위바위보가 있어요.');
    result.push({id:input.gameId,from:uid,to:input.uid,status:'pending',choices:{},dismissed:[],createdAtMs:now,updatedAtMs:now,expiresAtMs:now+60000});return result.slice(-16);
  }
  const game=result.find(game=>game.id===input.gameId);
  if(!game||![game.from,game.to].includes(uid))fail('permission-denied','참여 중인 가위바위보를 선택해 주세요.');
  if(action==='rpsClose'){
    if(live(game))game.status='cancelled';if(!game.dismissed.includes(uid))game.dismissed.push(uid);game.updatedAtMs=now;return result;
  }
  if(action==='rpsDecline'){
    if(game.to!==uid||game.status!=='pending')fail('failed-precondition','이미 처리된 게임 요청이에요.');game.status='declined';game.dismissed.push(uid);
  }else if(action==='rpsAccept'){
    if(game.to!==uid||game.status!=='pending')fail('failed-precondition','이미 처리된 게임 요청이에요.');game.status='playing';game.expiresAtMs=now+90000;
  }else if(action==='rpsChoose'){
    if(game.status!=='playing'||!choices.includes(input.choice))fail('invalid-argument','진행 중인 게임에서 가위·바위·보를 선택해 주세요.');
    if(Object.hasOwn(game.choices,uid)){if(game.choices[uid]===input.choice)return result;fail('failed-precondition','이미 낸 손은 바꿀 수 없어요.');}
    game.choices[uid]=input.choice;
    if(Object.hasOwn(game.choices,game.from)&&Object.hasOwn(game.choices,game.to)){
      const a=game.choices[game.from],b=game.choices[game.to];game.status='done';game.winnerUid=a===b?null:({rock:'scissors',scissors:'paper',paper:'rock'}[a]===b?game.from:game.to);
    }
  }else fail('invalid-argument','게임 요청을 확인해 주세요.');
  game.updatedAtMs=now;return result;
}
export function worldGameForViewer(games,uid){
  const game=[...(games||[])].reverse().find(game=>[game.from,game.to].includes(uid));
  if(!game||game.dismissed.includes(uid))return null;
  const other=game.from===uid?game.to:game.from;
  return {id:game.id,from:game.from,to:game.to,status:game.status,expiresAtMs:game.expiresAtMs,myChoice:game.choices[uid]||null,opponentReady:Object.hasOwn(game.choices,other),...(game.status==='done'?{opponentChoice:game.choices[other],winnerUid:game.winnerUid}:{})};
}
