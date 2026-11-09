// Monotonic, observed intervals only. Similarity is a score, not an identity probability.
export const VERIFICATION_LIMITS=Object.freeze({window:90000,minimum:0,away:1500,loweredHold:15000,returnDelay:2000,attempt:4000,retry:1500,gap:3000});
const headPosition=signals=>Array.isArray(signals?.headPosition)&&signals.headPosition.length===2&&signals.headPosition.every(Number.isFinite)?signals.headPosition:null;
export function createVerificationPolicy(){
  let segments=[],previous=null,missingSince=null,returnAt=null,required=true,phase='scanning',reason='initial',attemptAt=null,retryAt=null,monitorAt=null,resetRequested=true;
  let ownerHead=null,poseHeld=false;
  function requireVerification(cause){
    if(required)return;
    required=true;reason=cause;phase=cause==='away'?'waiting':'scanning';
    returnAt=attemptAt=retryAt=null;
    ownerHead=null;poseHeld=false;
    resetRequested=cause!=='away';
  }
  function reset(preserve=false){
    if(!preserve){segments=[];monitorAt=null;}
    previous=null;missingSince=null;required=true;phase='scanning';reason='initial';returnAt=attemptAt=retryAt=null;resetRequested=true;
    ownerHead=null;poseHeld=false;
  }
  function update(signals,now){
    const replaced=signals?.identity?.ownerLost===true;
    const own=!replaced&&signals?.reliable===true&&signals.face===true&&signals.identity?.matched===true;
    if(previous&&now>=previous.at&&now-previous.at<=VERIFICATION_LIMITS.gap&&previous.own)segments.push([previous.at,now]);
    segments=segments.filter(([,end])=>end>now-VERIFICATION_LIMITS.window);
    const recognizedMs=segments.reduce((sum,[start,end])=>sum+end-Math.max(start,now-VERIFICATION_LIMITS.window),0);
    // Enrollment/model preparation is not a failed authentication attempt.
    if(signals?.identity&&(signals.identity.enrolled===false||['enrolling','saving'].includes(signals.identity.status))){
      required=true;previous={at:now,own:false};attemptAt=retryAt=null;missingSince=null;phase='scanning';
      ownerHead=null;poseHeld=false;
      return {required:true,phase,reason,recognizedMs,recognizedSeconds:Math.min(90,recognizedMs/1000),resetRequested:false};
    }
    const visible=signals?.reliable===true&&signals.face===true;
    if(replaced)requireVerification('replacement');
    // A return at the boundary still needs authentication, even without an intervening frame.
    if(!visible)missingSince??=now;
    const position=headPosition(signals);
    const missingTooLong=missingSince!==null&&now-missingSince>=VERIFICATION_LIMITS.away;
    const recentOwner=ownerHead&&now-ownerHead.at<VERIFICATION_LIMITS.loweredHold;
    const nearby=recentOwner&&signals?.reliable&&signals.head===true&&signals.body===true&&position&&
      Math.hypot(position[0]-ownerHead.position[0],position[1]-ownerHead.position[1])<=.2;
    if(!visible&&nearby&&position[1]-ownerHead.position[1]>=.07)ownerHead.lowered=true;
    // Pose can defer a new gate after a verified head tilt. Only a fresh face match can resume credit.
    const loweredHold=Boolean(!required&&missingTooLong&&recentOwner&&ownerHead.lowered);
    const recovered=loweredHold&&own&&signals.identity.checkedAt>ownerHead.checkedAt;
    poseHeld=loweredHold&&Boolean(nearby)&&!recovered;
    if(missingTooLong&&!poseHeld&&!recovered)requireVerification('away');
    if(visible&&(!poseHeld||recovered)){missingSince=null;poseHeld=false;}
    if(!visible&&!nearby)ownerHead=null;
    if(!required)monitorAt??=now;
    let returnRemainingMs=null;
    // Identity is an entry/return gate. Pose changes during an occupied session
    // must not trigger periodic authentication or train on unverified samples.
    if(required){
      const returnPending=phase==='waiting'||phase==='returning';
      if(!visible&&(reason==='initial'||returnPending||now-missingSince>=VERIFICATION_LIMITS.away)){
        phase='waiting';returnAt=attemptAt=retryAt=null;
        resetRequested=false;
      }else if(phase==='waiting'&&reason==='initial'){
        phase='scanning';attemptAt=now;resetRequested=true;
      }else if(returnPending){
        returnAt??=now;
        returnRemainingMs=Math.max(0,VERIFICATION_LIMITS.returnDelay-(now-returnAt));
        phase=returnRemainingMs>0?'returning':'scanning';
        if(phase==='scanning'){attemptAt=now;resetRequested=true;}
      }else if(phase==='failed'&&now>=retryAt){
        phase='scanning';attemptAt=now;resetRequested=true;
      }else if(phase==='scanning'){
        attemptAt??=now;
        // Cached matches from before the current attempt cannot unlock it.
        const fresh=signals?.identity?.checkedAt===undefined||signals.identity.checkedAt>=attemptAt;
        if(own&&fresh){required=false;phase='verified';monitorAt=now;}
        else if(now-attemptAt>=VERIFICATION_LIMITS.attempt){phase='failed';retryAt=now+VERIFICATION_LIMITS.retry;}
      }
    }
    if(visible&&!poseHeld)ownerHead=!required&&own&&position?
      {position,at:now,checkedAt:signals.identity.checkedAt,lowered:signals.headDown===true}:null;
    previous={at:now,own:own&&!poseHeld};
    const result={required,phase,reason,recognizedMs,recognizedSeconds:Math.min(90,recognizedMs/1000),resetRequested,returnRemainingMs,poseHeld};
    resetRequested=false;
    return result;
  }
  function suspend(){previous=null;missingSince=null;monitorAt=null;returnAt=null;ownerHead=null;poseHeld=false;}
  return {update,reset,requireVerification,suspend};
}
