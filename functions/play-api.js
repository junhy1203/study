import {getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from './platform-store.js';
import {onCall,HttpsError} from './platform-http.js';
import {defineSecret} from './platform-secrets.js';
import {onSchedule} from './platform-scheduler.js';
import {generateForUser} from './ai-service.js';
import {savePlayProfile,readPlayProfile,buyPhoneTime,studyPersonality,purchaseAvatar} from './play-service.js';
import {startPhoneSession} from './phone-session.js';
import {changeStudyWorld,studyWorldInvites} from './study-world-service.js';
const db=getFirestore(getApps()[0]??initializeApp(),'study-data'),key=defineSecret('GOOGLE_AI_API_KEY');
const options={region:'asia-northeast3',maxInstances:2,timeoutSeconds:120,secrets:[key]};
function owner(request){if(!request.auth)throw new HttpsError('unauthenticated','로그인해 주세요.');return request.auth.uid;}
const analyze=uid=>async records=>(await generateForUser({user:uid,model:'gemini-3.8-flash',key:key.value(),requested:1024,contents:[{role:'user',parts:[{text:`실제 공부 기록으로 재미로 보는 공부 성향을 분석해. 과학적 MBTI 진단이나 인물의 실제 성격이라고 주장하지 마. records는 최근 7일 일별 시간과 과목별 초, sessionCount는 최근 7일 완료한 학습 횟수다. 시간 분포, 지속성, 과목 다양성을 고려해 scholars 16명 중 한 명을 골라 한국어 JSON {"scholar":"이름","reason":"기록 근거와 공부 제안 2문장"}만 반환해. 데이터: ${JSON.stringify(records)}`}]}]})).text;
export const getPlayProfile=onCall(options,request=>readPlayProfile(db,owner(request),request.data?.uid));
export const updatePlayProfile=onCall(options,request=>savePlayProfile(db,owner(request),request.data));
export const updateStudyWorld=onCall({region:'asia-northeast3',maxInstances:2,timeoutSeconds:30},request=>changeStudyWorld(db,owner(request),request.data));
export const getStudyWorldInvites=onCall({region:'asia-northeast3',maxInstances:2,timeoutSeconds:30},request=>studyWorldInvites(db,owner(request)));
export const purchasePhoneTime=onCall(options,request=>buyPhoneTime(db,owner(request),request.data));
export const beginPhoneSession=onCall(options,request=>startPhoneSession(db,owner(request),request.data));
export const purchaseAvatarItem=onCall(options,request=>purchaseAvatar(db,owner(request),request.data));
export const getStudyPersonality=onCall(options,request=>{const uid=owner(request);return studyPersonality(db,uid,{force:request.data?.force===true,generate:analyze(uid)});});
export const refreshStudyPersonalities=onSchedule({...options,timeoutSeconds:540,schedule:'every 24 hours',timeZone:'Asia/Seoul'},async()=>{
  const rows=await db.collection('users').where('studyPersonality.nextUpdateAtMs','<=',Date.now()).limit(50).get();
  for(const row of rows.docs)try{await studyPersonality(db,row.id,{generate:analyze(row.id)});}catch(error){console.warn('personality-refresh',error.code||'failed');}
});
