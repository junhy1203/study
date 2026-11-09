import {authReady,getAuthUser,reauthenticateFaceAccount} from './auth.js?v=20261104-1';
import {serverCallable} from './server-client.js?v=20261103-privateui1';
import {faceStore,faceRecordKey,createBrowserFaceKeys,clearLegacyFaceProfile,deleteLocalFaceAccount} from './face-storage.js';
import {signFace,hashFace} from './face-crypto.js?v=20261103-privateui1';
import {FACE_POLICY,FACE_ORIGIN,FACE_SCHEMA,FACE_PREPROCESS,studyNonce} from './functions/face-protocol.js?v=20261103-privateui1';
import {SCAN_COUNT} from './face-scan.js?v=20261104-1';
import {updateScanRing,stopScanRing,scanArrowGuidance} from './face-scan-guide.js?v=20261105-turn1';

let session=null,dialog=null,previousFocus=null,expiryTimer=null,hiddenTimer=null,progressTimer=null,epoch=0,verified=false;
let phase='SIGNED_OUT',lastProgress=-1,lastProgressAt=0,profileReady=false,rankingCheck=0;
let channel;
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
const invoke=async(name,data)=>{const response=await serverCallable(name) (data);return response.data;};
const broadcast=()=>{channel??=typeof BroadcastChannel==='function'?new BroadcastChannel('study-face-policy-v1'):null;return channel;};
function ensureStyle(){if(!document.querySelector('[data-face-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./face-enrollment.css?v=20261108-face-dialog2',import.meta.url).href;link.dataset.faceStyle='';document.head.append(link);}}
function closeDialog(){clearInterval(progressTimer);progressTimer=null;const closing=dialog,focus=previousFocus;dialog=null;previousFocus=null;if(!closing)return;stopScanRing(closing.querySelector('.face-ring'));const finish=()=>{if(closing.open)closing.close();closing.remove();if(!dialog&&focus?.isConnected)focus.focus();};if(!closing.open||matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}closing.dataset.closing='';closing.addEventListener('animationend',event=>{if(event.target===closing)finish();},{once:true});setTimeout(finish,250);}
function setPhase(value,label) {
  phase=value;
  const status=dialog?.querySelector('[data-face-status]');
  if(status&&status.textContent!==label)status.textContent=label;
  if(dialog)dialog.dataset.phase=value;
  const cancel=dialog?.querySelector('[data-face-cancel]');if(cancel){cancel.disabled=value==='ENROLLMENT_COMMITTING';cancel.hidden=Boolean(session?.ticket);}
  const capture=dialog?.querySelector('[data-face-capture]');if(capture){capture.disabled=value==='ENROLLMENT_COMMITTING'||capture.dataset.capturing==='true';if(['VERIFYING','VERIFIED'].includes(value))capture.hidden=true;}
}
function makeDialog({enrolling=false,choosing=false,deleting=false}={}){
  ensureStyle();closeDialog();previousFocus=document.activeElement;
  dialog=element('dialog',null,'face-enrollment');dialog.setAttribute('aria-labelledby','face-enrollment-title');
  const brand=element('div',null,'face-protector-brand');
  const mark=element('span',null,'face-protector-mark');mark.setAttribute('aria-hidden','true');
  mark.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 6v5c0 4.4-3 7.8-8 10-5-2.2-8-5.6-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>';
  brand.append(mark,element('span','Fair Protector'),document.createTextNode(' '),element('span','2.1','face-protector-version'));dialog.append(brand);
  if(choosing){
    const title=element('h2','학습 방식 선택');title.id='face-enrollment-title';
    const description=element('p','이 기기에 등록된 얼굴이 없어요. 얼굴을 등록하면 인증된 학습이 랭킹에 반영돼요. 랭킹을 포기하면 스터디캠이 얼굴 본인 확인 없이 자세와 자리 비움 등 학습 상태를 감지해요. 학습 시간은 내 기록에만 저장되고 Focus Time은 적립되지 않아요. 얼굴 등록 전에는 이 기기에서 랭킹이 표시되지 않아요.','face-subtitle');
    const choices=element('form',null,'face-study-choices');choices.method='dialog';
    for(const [value,label,style] of [['register','등록하기','face-primary'],['unranked','랭킹 포기하기','face-unranked'],['exit','나가기','']]){
      const button=element('button',label,style);button.value=value;
      if(value==='exit')button.dataset.faceCancel='';
      choices.append(button);
    }
    const choiceDialog=dialog;choices.addEventListener('submit',event=>{event.preventDefault();choiceDialog.returnValue=event.submitter?.value||'exit';closeDialog();});choiceDialog.addEventListener('cancel',event=>{event.preventDefault();choiceDialog.returnValue='exit';closeDialog();});
    dialog.append(title,description,choices);document.body.append(dialog);dialog.showModal();return dialog;
  }
  const title=element('h2',enrolling?'안심하고 얼굴 등록':'다시 만나 반가워요');title.id='face-enrollment-title';dialog.append(title);
  const subtitle=element('p',enrolling?'내 계정으로 공부하는 나를 확인하는 과정이에요.':'오늘의 학습을 시작하기 전에 계정을 확인해 주세요.','face-subtitle');dialog.append(subtitle);
  const steps=element('ol',null,'face-steps');steps.setAttribute('aria-label','진행 순서');
  (enrolling?['계정 확인','얼굴 등록','학습 시작']:['계정 확인','얼굴 확인','학습 시작']).forEach((text,index)=>{const step=element('li');step.append(element('span',String(index+1)),document.createTextNode(text));steps.append(step);});dialog.append(steps);
  const account=element('p',getAuthUser()?.email||'','face-account');dialog.append(account);
  const status=element('p','계정을 확인하고 있습니다.');status.dataset.faceStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.append(status);
  const privacy=element('p','얼굴 사진·영상·특징값은 서버로 전송하지 않아요.','face-privacy-footer');dialog.append(privacy);
  const cancel=element('button','취소');cancel.type='button';cancel.dataset.faceCancel='';
  if(!deleting){cancel.addEventListener('click',()=>lockFaceSession('얼굴 확인을 취소했습니다.'));
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!session?.ticket&&phase!=='ENROLLMENT_COMMITTING')lockFaceSession('얼굴 확인을 취소했습니다.');});}
  dialog.append(cancel);document.body.append(dialog);dialog.showModal();return dialog;
}
function askFaceStudyChoice(){
  const root=makeDialog({choosing:true});
  return new Promise(resolve=>root.addEventListener('close',()=>{
    if(dialog===root)closeDialog();
    resolve(root.returnValue||'exit');
  },{once:true}));
}
const currentProfile=value=>value?.binding?.schemaVersion===FACE_SCHEMA&&value.binding.preprocessVersion===FACE_PREPROCESS;
function setRankingVisibility(registered){
  document.documentElement.toggleAttribute('data-face-ranking-ready',registered);
}
async function refreshRankingVisibility(){
  const check=++rankingCheck,uid=getAuthUser()?.uid;
  setRankingVisibility(false);
  if(!uid||!globalThis.indexedDB)return;
  try{
    const installationId=await faceStore('settings','readonly','installation');
    if(!installationId||check!==rankingCheck)return;
    const keys=await faceStore('keys','readonly',`${uid}:${installationId}`);
    if(!keys?.signingKey||!keys.wrappingKey||check!==rankingCheck)return;
    const {active}=await invoke('getFaceEnrollmentStatus',{installationId});
    if(active?.installationId!==installationId)return;
    const record=await faceStore('profiles','readonly',faceRecordKey(uid,installationId,active.profileId));
    if(check===rankingCheck&&uid===getAuthUser()?.uid)setRankingVisibility(currentProfile(record)&&record.binding.generation===active.generation);
  }catch{}
}
function addPreview(){
  if(!dialog||dialog.querySelector('.face-preview'))return;
  dialog.dataset.scan='abstract';
  const guide=element('div',null,'face-preview'),center=element('div',null,'face-scan-center');
  const symbol=element('div',null,'face-scan-symbol');symbol.setAttribute('aria-hidden','true');
  symbol.dataset.mode='align';symbol.dataset.tone='hold';
  symbol.innerHTML='<svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><g class="face-arrow-single"><path d="M40 66V14M18 36l22-22 22 22"/></g><g class="face-arrow-align"><path d="M40 10v60M10 40h60M31 19l9-9 9 9M31 61l9 9 9-9M19 31l-9 9 9 9M61 31l9 9-9 9"/></g></svg>';
  const live=element('p','얼굴을 가운데로 맞춰 주세요','face-scan-live');live.dataset.faceScanLive='';
  const count=element('strong','0%','face-scan-percent');count.dataset.faceScanPercent='';
  const detail=element('p',`0 / ${SCAN_COUNT} 각도 수집`,'face-scan-count');detail.dataset.faceScanCount='';
  center.append(symbol,live,count,detail);guide.append(center);
  const ring=element('div',null,'face-ring');ring.setAttribute('role','progressbar');ring.setAttribute('aria-label','얼굴 등록 진행률');ring.setAttribute('aria-valuemin','0');ring.setAttribute('aria-valuemax',String(SCAN_COUNT));ring.setAttribute('aria-valuenow','0');guide.append(ring);updateScanRing(ring);
  dialog.insertBefore(guide,dialog.querySelector('[data-face-cancel]'));
  const hint=element('p','가운데 큰 화살표를 따라 얼굴 위치를 맞춘 뒤, 안내 방향으로 고개를 천천히 돌려 주세요. 바깥 빨간 표시는 더 보여 줄 방향이에요.','face-preview-hint');dialog.insertBefore(hint,dialog.querySelector('[data-face-cancel]'));
  const privacy=element('p','카메라 사용 중 · 얼굴 영상은 화면에 표시하지 않아요','face-scan-camera-note');dialog.insertBefore(privacy,dialog.querySelector('[data-face-cancel]'));
  const capture=element('button','자세 확인 · 촬영');capture.type='button';capture.dataset.faceCapture='';capture.disabled=true;capture.hidden=true;
  capture.addEventListener('click',()=>{if(capture.disabled)return;capture.disabled=true;capture.dataset.capturing='true';window.dispatchEvent(new Event('study:face-capture'));});dialog.insertBefore(capture,dialog.querySelector('[data-face-cancel]'));
}
function updateScanFeedback(data={}){
  const guide=dialog?.querySelector('.face-preview');if(!guide)return;
  const held=data.state==='QUALITY_HOLD',feedback=held?{...data,orientation:null,alignment:null}:data;
  guide.scanFeedback={...guide.scanFeedback,...feedback};
  if(data.alignment&&data.type==='face-scan-direction')guide.scanFeedback.state='ENROLLING';
  const ring=guide.querySelector('[role="progressbar"]');updateScanRing(ring,feedback);
  const symbol=guide.querySelector('.face-scan-symbol'),live=guide.querySelector('[data-face-scan-live]');
  const guidance=scanArrowGuidance(guide.scanFeedback);
  symbol.dataset.mode=guidance.mode;symbol.dataset.tone=guidance.tone;
  if(guidance.mode==='direction'){
    const previous=symbol.arrowAngle||0;
    // Keep angles continuous across -180/180 so the transition takes the short turn.
    const delta=((guidance.angle-previous+180)%360+360)%360-180;
    symbol.arrowAngle=previous+delta;
    symbol.querySelector('.face-arrow-single').style.transform=`rotate(${symbol.arrowAngle}deg)`;
  }
  if(live.textContent!==guidance.label)live.textContent=guidance.label;
  guide.dataset.tracking=guidance.tone==='hold'?'hold':'active';
  if(data.progress!==undefined){
    const total=data.total||SCAN_COUNT,progress=Math.max(0,Math.min(total,data.progress));
    ring.setAttribute('aria-valuenow',String(progress));ring.setAttribute('aria-valuetext',`${total}개 중 ${progress}개 각도 수집`);
    guide.querySelector('[data-face-scan-percent]').textContent=`${Math.round(progress/total*100)}%`;
    guide.querySelector('[data-face-scan-count]').textContent=`${progress} / ${total} 각도 수집`;
    if(progress>Number(guide.dataset.progress||0)&&!matchMedia('(prefers-reduced-motion: reduce)').matches)symbol.animate([{opacity:.5},{opacity:1}],{duration:300});
    guide.dataset.progress=String(progress);
  }
}
// Camera capture and inference remain in the camera controller and Worker.
// Registration never attaches the stream to a display element.
export function attachFacePreview(){addPreview();}
export function faceWorkerContext(){return session;}
export function faceSessionState(){return {phase,verified,ready:profileReady,profileId:session?.binding?.profileId};}
export function waitForFaceSessionReady(){
  const current=session;
  if(!current)return Promise.resolve(false);
  if(profileReady)return Promise.resolve(true);
  return new Promise(resolve=>{
    const finish=()=>{window.removeEventListener('study:face-ready',finish);window.removeEventListener('study:face-locked',finish);resolve(session===current&&profileReady);};
    window.addEventListener('study:face-ready',finish);window.addEventListener('study:face-locked',finish);
  });
}
export function waitForFaceVerification(){
  const current=session;
  if(!current)return Promise.resolve(false);
  if(verified)return Promise.resolve(true);
  return new Promise(resolve=>{
    const finish=()=>{
      window.removeEventListener('study:face-verified',finish);
      window.removeEventListener('study:face-locked',finish);
      resolve(session===current&&verified);
    };
    window.addEventListener('study:face-verified',finish);
    window.addEventListener('study:face-locked',finish);
  });
}
export function lockFaceSession(reason='얼굴 확인을 다시 시작해 주세요.',{remote=false}={}) {
  const old=session;epoch++;session=null;verified=false;profileReady=false;phase='PROFILE_LOCKED';
  clearTimeout(expiryTimer);clearTimeout(hiddenTimer);closeDialog();
  if(old?.ticket)void signFace(old.keys,'cancel',old.uid,old.installationId,old.ticket.id).then(signature=>invoke('cancelFaceEnrollment',{installationId:old.installationId,ticketId:old.ticket.id,signature})).catch(()=>{});
  if(remote&&old?.grant)void signFace(old.keys,'lock',old.uid,old.installationId,old.grant.id).then(signature=>invoke('lockFaceEnrollment',{installationId:old.installationId,signature})).catch(()=>{});
  window.dispatchEvent(new CustomEvent('study:face-locked',{detail:{reason}}));
}
async function askReauthentication({enrolling,replace,keys,uid,installationId,revoke=false}) {
  const root=dialog||makeDialog({enrolling});
  setPhase('DAILY_REAUTH_REQUIRED',enrolling?'계정을 다시 인증한 뒤 이 브라우저에 얼굴을 등록합니다.':'오늘 첫 학습을 위해 계정을 다시 인증해 주세요.');
  const description=element('section',null,'face-privacy-card');
  description.setAttribute('aria-label','얼굴 정보 보호 안내');
  description.append(element('h3','얼굴 정보 처리 및 이용 안내'));
  const protections=element('ul');
  for(const [heading,body] of [
    ['등록할 때','카메라 영상을 기기에서 실시간으로 분석해 여러 각도의 얼굴 특징과 형태를 추출해요. 사진이나 영상은 저장하지 않고, 비교용 특징값만 이 브라우저의 IndexedDB에 암호화해 보관해요.'],
    ['얼굴을 확인할 때','스터디캠을 시작하거나 자리를 비웠다가 돌아오면 등록한 특징값과 현재 얼굴을 기기에서 비교해요. 얼굴 특징 비교 기준을 충족하고 형태 유사도도 85% 이상이어야 해요.'],
    ['이용 범위','저장한 특징값은 스터디캠에서 등록한 사람인지 확인하는 데만 사용해요. 얼굴 사진, 영상, 특징값 모두 서버로 보내지 않아요.'],
  ]){const row=element('li');row.append(element('strong',heading),element('span',body));protections.append(row);}description.append(protections);
  const details=element('details',null,'face-privacy-details');details.append(element('summary','보관·삭제 및 서버 처리 정보'));
  details.append(element('p','재등록하면 새 특징값을 사용하며 암호화된 이전 기록은 브라우저에 남을 수 있어요. 계정 설정에서 얼굴 등록을 삭제하거나 브라우저의 사이트 데이터를 지우면 이 브라우저에 저장된 특징값이 삭제돼요. 다시 이용하려면 얼굴을 등록해야 해요.'));
  details.append(element('p','서버는 계정 인증, 등록 상태와 암호화 키 보호 정보를 처리해요. 학습 기록에는 세션 정보와 진행·일시정지 상태가 전달돼요.'));
  details.append(element('p','얼굴 확인이 끝난 뒤에는 기기에서 카메라 영상으로 얼굴이 화면에 있는지와 학습 상태를 살펴요. 등록 특징값과의 비교는 다시 확인이 필요한 시점에만 이뤄져요.'));
  details.append(element('p','일반 웹캠으로 얼굴을 비교하며 실명 확인이나 사진·영상 등 위조 탐지를 보장하지 않습니다.'));description.append(details);root.append(description);
  if(!enrolling)description.append(element('p','기존 얼굴 등록은 유지하고 오늘의 계정 인증만 갱신해요.','face-reauth-note'));
  if(enrolling&&replace)root.append(element('p','새 얼굴 등록을 완료하면 기존 활성 등록이 교체됩니다. 새 등록을 취소하면 기존 등록은 유지됩니다. 기존 얼굴과 불일치했다는 이유로 자동 교체하지 않습니다.','face-warning'));
  const consent=element('label',null,'face-consent'),checkbox=element('input');checkbox.type='checkbox';checkbox.required=true;consent.append(checkbox,element('span',enrolling?'얼굴 정보 처리 안내를 확인했고, 이 브라우저에 얼굴 비교 정보를 암호화해 저장하는 데 동의해요.':'안내를 확인했고, 오늘의 계정 재인증을 진행할게요.'));root.append(consent);
  const button=element('button','Google로 로그인','face-primary');button.type='button';root.append(button);
  root.append(root.querySelector('.face-privacy-footer'),root.querySelector('[data-face-cancel]'));
  const attempt=epoch;
  return new Promise((resolve,reject)=>{
    const cancelled=()=>{window.removeEventListener('study:face-locked',cancelled);reject(new Error('얼굴 확인을 취소했습니다.'));};
    window.addEventListener('study:face-locked',cancelled,{once:true});
    button.addEventListener('click',async()=>{
      if(!checkbox.checked){setPhase('DAILY_REAUTH_REQUIRED','안내를 확인한 뒤 동의해 주세요.');return;}
      button.disabled=true;
      try{
        const challenge=revoke?null:await invoke('beginDailyFaceAuth',{installationId,publicKey:keys.publicKey,enrollmentOnly:enrolling});
        await reauthenticateFaceAccount({getTotpCode:()=>new Promise(done=>{
          const otp=element('input');otp.inputMode='numeric';otp.autocomplete='one-time-code';otp.setAttribute('aria-label','인증 앱의 6자리 코드');const submit=element('button','인증 코드 확인');submit.type='button';root.append(otp,submit);otp.focus();submit.addEventListener('click',()=>{if(!/^\d{6}$/.test(otp.value))return;const value=otp.value;otp.value='';otp.remove();submit.remove();done(value);},{once:false});
        })});
        if(epoch!==attempt||getAuthUser()?.uid!==uid)throw new Error('계정 또는 인증 상태가 변경되었습니다.');
        const signature=revoke?null:await signFace(keys,'daily',uid,installationId,challenge.challengeId);
        const result=revoke?{grant:null}:await invoke('completeDailyFaceAuth',{installationId,challengeId:challenge.challengeId,signature});
        window.removeEventListener('study:face-locked',cancelled);
        description.remove();consent.remove();button.remove();
        resolve(result.grant?{...result.grant,serverNowMs:result.serverNowMs}:null);
      }catch(error){if(epoch!==attempt)return;setPhase('DAILY_REAUTH_REQUIRED',error.message||'계정을 다시 확인해 주세요.');button.disabled=false;}
    });
    button.focus();
  });
}
export async function prepareFaceSession({replace=false,allowUnranked=false,onCameraSelected}={}){
  if(!await authReady||!getAuthUser())throw new Error('로그인 후 이용해 주세요.');
  if(location.origin!==FACE_ORIGIN||!crypto.subtle||!globalThis.indexedDB)throw new Error('정식 HTTPS 학습 사이트와 보안 저장소를 지원하는 브라우저가 필요합니다.');
  const attempt=++epoch,uid=getAuthUser().uid;verified=false;profileReady=false;
  const choose=async()=>{
    rankingCheck++;setRankingVisibility(false);
    const choice=await askFaceStudyChoice();
    return attempt===epoch&&getAuthUser()?.uid===uid?choice:'exit';
  };
  let installationId=await faceStore('settings','readonly','installation');
  const existingInstallation=Boolean(installationId);
  if(allowUnranked&&!existingInstallation){
    const choice=await choose();
    if(choice!=='register')return {choice};
  }
  if(!installationId){installationId=crypto.randomUUID();await faceStore('settings','readwrite','installation',installationId);}
  const keyId=`${uid}:${installationId}`;
  let keys=await faceStore('keys','readonly',keyId);
  const status=await invoke('getFaceEnrollmentStatus',{installationId});
  let record=status.active?.installationId===installationId?await faceStore('profiles','readonly',faceRecordKey(uid,installationId,status.active.profileId)):null;
  const needsNewScan=Boolean(record&&!currentProfile(record));if(needsNewScan)record=null;
  const pendingId=await faceStore('settings','readonly',`${keyId}:pending`);
  const pendingRecord=pendingId?await faceStore('profiles','readonly',faceRecordKey(uid,installationId,pendingId)):null;
  const pending=currentProfile(pendingRecord)?pendingRecord:null;
  // Server confirmation wins over a lost commit response. Uncommitted candidates never unlock.
  if(!record&&pending?.binding.profileId===status.active?.profileId)record=pending;
  const recovering=!replace&&Boolean(keys&&pending&&pending.binding.profileId===status.pending?.profileId&&pending.ticketId===status.pending.id);
  const enrolling=replace||(!record||!keys)&&!recovering;
  if(allowUnranked&&existingInstallation&&(!record||!keys)){
    const choice=await choose();
    if(choice!=='register')return {choice};
  }
  if(!status.enabled)throw new Error('얼굴 보안 키 설정이 필요합니다. 관리자에게 문의해 주세요.');
  onCameraSelected?.();
  if(enrolling)record=null;
  if(!keys){keys=await createBrowserFaceKeys();await faceStore('keys','readwrite',keyId,keys);keys=await faceStore('keys','readonly',keyId);if(!keys?.signingKey||!keys.wrappingKey)throw new Error('이 브라우저는 보안 키 저장을 지원하지 않습니다.');}
  let grant=status.grant;
  if(enrolling){makeDialog({enrolling});grant=await askReauthentication({enrolling,replace:Boolean(status.active),keys,uid,installationId});}
  else if(!grant||grant.expiresAtMs<253402300799000){
    const challenge=await invoke('beginDailyFaceAuth',{installationId,publicKey:keys.publicKey,enrollmentOnly:false});
    const signature=await signFace(keys,'daily',uid,installationId,challenge.challengeId);
    const result=await invoke('completeDailyFaceAuth',{installationId,challengeId:challenge.challengeId,signature});
    grant={...result.grant,serverNowMs:result.serverNowMs};
  }
  if(attempt!==epoch||getAuthUser()?.uid!==uid)throw new Error('얼굴 확인이 취소되었습니다.');
  if(recovering){
    const signature=await signFace(keys,'commit',uid,installationId,`${pending.ticketId}:${status.pending.envelopeHash}`);
    const committed=await invoke('commitFaceEnrollment',{installationId,ticketId:pending.ticketId,idempotencyKey:pending.idempotencyKey,envelopeHash:status.pending.envelopeHash,signature});
    record=pending;grant={...committed.grant,serverNowMs:grant.serverNowMs||status.serverNowMs};
  }
  let ticket=null;
  if(enrolling){
    if(replace&&status.pending){const signature=await signFace(keys,'cancel',uid,installationId,status.pending.id);await invoke('cancelFaceEnrollment',{installationId,ticketId:status.pending.id,signature});}
    await clearLegacyFaceProfile();
    const persisted=await navigator.storage?.persist?.().catch(()=>false)||false;
    await faceStore('settings','readwrite',`${keyId}:consent`,{policyVersion:FACE_POLICY,persisted,acceptedAt:Date.now()});
    const signature=await signFace(keys,'enroll',uid,installationId,grant.id),idempotencyKey=crypto.randomUUID();
    ({ticket}=await invoke('beginFaceEnrollment',{installationId,idempotencyKey,signature}));
  }
  session={uid,installationId,keys,grant,record,ticket,binding:record?.binding||ticket.binding};
  if(enrolling){setPhase('ENROLLING',needsNewScan?'새 영상 3D 방식으로 다시 등록합니다. 정면을 잠시 바라봐 주세요':'정면을 잠시 바라봐 주세요');addPreview();}
  else{closeDialog();setPhase('PROFILE_LOADING','학습 화면에서 얼굴을 확인합니다.');}
  lastProgressAt=performance.now();lastProgress=-1;
  progressTimer=setInterval(()=>{if(dialog&&phase==='ENROLLING'&&performance.now()-lastProgressAt>45000)setPhase('ENROLLING','진행률은 유지됩니다. 조명을 확인하고 안내된 방향으로 조금씩 천천히 움직여 주세요.');},5000);
  const now=performance.now(),serverNowMs=grant.serverNowMs||status.serverNowMs,duration=grant.expiresAtMs-serverNowMs;
  session.serverNowMs=serverNowMs;session.monotonicStart=now;
  session.deadline=now+Math.max(0,duration);
  clearTimeout(expiryTimer);expiryTimer=null;
  broadcast()?.postMessage({uid,event:'generation',profileId:session.binding.profileId});
  return session;
}
const workerActions=new Set(['beginFaceUnlock','unlockFaceKeyEnvelope','sealFaceKeyEnvelope','commitFaceEnrollment']);
export async function handleFaceWorkerRPC(action,data){
  const current=session;if(!current||!workerActions.has(action)||data.installationId!==current.installationId||getAuthUser()?.uid!==current.uid)throw new Error('얼굴 보안 세션이 종료되었습니다.');
  const result=await invoke(action,data);
  if(session!==current)throw new Error('얼굴 보안 세션이 종료되었습니다.');
  if(action==='commitFaceEnrollment'){current.ticket=null;current.binding=result.active;current.grant=result.grant;current.record=await faceStore('profiles','readonly',faceRecordKey(current.uid,current.installationId,result.active.profileId));broadcast()?.postMessage({uid:current.uid,event:'generation',profileId:result.active.profileId});}
  return result;
}
export function handleFaceWorkerEvent(data){
  if(data.type==='face-scan-direction'){
    if(session)updateScanFeedback(data);return;
  }
  // Close bitmaps from a previously cached Worker without ever displaying them.
  if(data.type==='face-scan-mesh'){data.bitmap?.close?.();return;}
  if(!session)return;
  if(data.type==='face-framing')return;
  if(data.type==='face-progress'){
    if(data.progress!==undefined&&data.progress!==lastProgress){lastProgress=data.progress;lastProgressAt=performance.now();}
    setPhase(data.state,data.label||'얼굴 정보를 안전하게 저장하고 있어요');
    const capture=dialog?.querySelector('[data-face-capture]');
    if(capture){if(data.manualCapture!==undefined)capture.hidden=!data.manualCapture;if(data.canCapture!==undefined){capture.dataset.capturing=String(!data.canCapture);capture.disabled=!data.canCapture||data.state==='ENROLLMENT_COMMITTING';}if(data.captureLabel)capture.textContent=data.captureLabel;}
    if(dialog&&data.direction)dialog.dataset.direction=data.direction;
    updateScanFeedback(data);
  }
  if(data.type==='face-unlocked'){session.binding=data.binding;profileReady=true;rankingCheck++;setRankingVisibility(true);setPhase('READY','학습 준비가 완료됐습니다.');closeDialog();window.dispatchEvent(new Event('study:face-ready'));}
  if(data.type==='face-verified'&&!verified){verified=true;setPhase('VERIFIED','✓ 얼굴 확인이 완료됐어요');window.dispatchEvent(new Event('study:face-verified'));setTimeout(()=>{if(verified)closeDialog();},500);}
}
export async function faceStudyAuthorization(data){
  const current=session;
  if(!current||!profileReady||!verified||getAuthUser()?.uid!==current.uid||performance.now()>=current.deadline)throw new Error('얼굴 등록과 최초 얼굴 인증을 완료해 주세요.');
  const faceAuthorization={installationId:current.installationId,profileId:current.binding.profileId,generation:current.binding.generation,grantId:current.grant.id,issuedAt:Math.floor(current.serverNowMs+performance.now()-current.monotonicStart)};
  faceAuthorization.signature=await signFace(current.keys,'study',current.uid,current.installationId,studyNonce({...data,faceAuthorization}));return faceAuthorization;
}
export async function deleteFaceEnrollment(){
  if(!await authReady||!getAuthUser())throw new Error('로그인해 주세요.');
  lockFaceSession('얼굴 등록을 삭제하기 위해 계정을 확인합니다.');
  const uid=getAuthUser().uid,installationId=await faceStore('settings','readonly','installation')||crypto.randomUUID();
  const root=makeDialog({deleting:true});root.querySelector('h2').textContent='얼굴 등록 삭제';root.querySelector('.face-subtitle').textContent='얼굴 등록을 삭제할까요? 다시 사용하려면 얼굴을 등록해야 해요.';root.querySelector('.face-steps').remove();root.querySelector('[data-face-status]').textContent='서버의 등록 정보와 이 브라우저에 저장된 얼굴 비교 정보를 삭제합니다.';
  const cancelButton=root.querySelector('[data-face-cancel]');
  const button=element('button','얼굴 등록 삭제','face-primary');button.type='button';root.insertBefore(button,cancelButton);
  await new Promise(resolve=>{const stop=()=>{if(button.disabled)return;closeDialog();resolve();};cancelButton.addEventListener('click',stop);root.addEventListener('cancel',event=>{event.preventDefault();stop();});button.addEventListener('click',async()=>{button.disabled=true;cancelButton.disabled=true;try{if(getAuthUser()?.uid!==uid)throw new Error('계정이 변경되었습니다.');await invoke('revokeFaceEnrollment',{installationId});await deleteLocalFaceAccount(uid,installationId);void refreshRankingVisibility();broadcast()?.postMessage({event:'revoked',uid});lockFaceSession('얼굴 등록을 삭제했습니다.');resolve();}catch(error){button.disabled=false;cancelButton.disabled=false;root.querySelector('[data-face-status]').textContent=error.message||'삭제하지 못했습니다. 다시 시도해 주세요.';}});});
}
window.addEventListener('study:auth-changed',()=>{if(session&&getAuthUser()?.uid!==session.uid){broadcast()?.postMessage({event:'logout',uid:session.uid});lockFaceSession('계정이 변경되었습니다.',{remote:true});}void refreshRankingVisibility();});
void authReady.then(()=>{if(!rankingCheck)void refreshRankingVisibility();});
window.addEventListener('pagehide',()=>lockFaceSession('학습 화면이 닫혔습니다.'));
window.addEventListener('study:before-logout',()=>{if(session){broadcast()?.postMessage({event:'logout',uid:session.uid});lockFaceSession('로그아웃했습니다.',{remote:true});}});
document.addEventListener('visibilitychange',()=>{clearTimeout(hiddenTimer);if(document.hidden&&!session?.ticket)hiddenTimer=setTimeout(()=>lockFaceSession('장시간 자리를 비워 얼굴 확인을 잠갔습니다.'),300000);});
broadcast()?.addEventListener('message',({data})=>{if(session&&data?.uid===session.uid&&(data.event!=='generation'||data.profileId!==session.binding.profileId))lockFaceSession('다른 탭에서 계정 또는 얼굴 등록이 변경되었습니다.');if(data&&data.uid===getAuthUser()?.uid&&['generation','revoked'].includes(data.event))void refreshRankingVisibility();});
document.addEventListener('click',event=>{if(event.target.closest('[data-face-delete]'))void deleteFaceEnrollment().catch(error=>window.alert(error.message));});
