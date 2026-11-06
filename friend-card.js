import {element as el} from './study-api.js?v=20261024-selfhost1';
import {pixelAvatar,avatarBackground} from './avatar-renderer.js?v=20261106-accessory1';
const time=value=>{const n=Math.max(0,Math.floor(value||0));return `${Math.floor(n/3600)}시간 ${Math.floor(n%3600/60)}분`;};
export function renderFriendCard(root,data,{self=false}={}){
  const signature=JSON.stringify([data.displayName,data.bio,data.avatar,data.friendSummary,self]);if(root.dataset.friendCardSignature===signature)return root;root.dataset.friendCardSignature=signature;
  root.classList.add('friend-inline');
  const avatarSignature=JSON.stringify(data.avatar),priorAvatar=root.dataset.friendAvatarSignature===avatarSignature?root.querySelector('.friend-card-avatar'):null;
  const avatar=priorAvatar||el('div','friend-card-avatar'),identity=el('div','friend-card-identity'),name=el('strong','friend-inline-name',`${data.displayName}${self?' (나)':''}`),bio=el('span','friend-inline-bio',data.bio||'');bio.dataset.friendBio='';name.title=data.displayName;bio.title=data.bio||'';if(!priorAvatar){const svg=pixelAvatar(data.avatar);if(!svg.hasAttribute('data-has-accessory')&&!svg.hasAttribute('data-cinematic-effect'))svg.setAttribute('viewBox','-5 -6 28 33');avatar.append(svg);}root.dataset.friendAvatarSignature=avatarSignature;identity.append(name,bio);
  const stats=el('div','friend-card-stats'),summary=data.friendSummary||{};
  for(const [label,key]of [['오늘','todaySeconds'],['이번 주','weekSeconds'],['누적','totalSeconds']]){const cell=el('div');cell.append(el('span','',label),el('strong','',time(summary[key])));stats.append(cell);}
  const badges=el('div','friend-rank-badges');for(const rank of summary.ranks||[]){if(!Number.isInteger(rank.rank)||rank.rank<1||rank.rank>3)continue;const badge=el('span',`friend-rank-badge rank-${rank.rank}`,`${['','🥇','🥈','🥉'][rank.rank]} ${rank.label} ${rank.rank}위`);badge.title=`이번 주 ${rank.label} ${rank.rank}위`;badge.dataset.rankScope=rank.scope;badges.append(badge);}
  const footer=el('div','friend-card-footer');footer.append(badges);root.replaceChildren(avatar,identity,stats,footer);avatarBackground(root,data.avatar);return root;
}
