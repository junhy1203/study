// Monotonic, observed intervals only. Similarity is a score, not an identity probability.
export const VERIFICATION_LIMITS=Object.freeze({window:90000,minimum:0,away:1500,attempt:4000,retry:1500,gap:3000});
export function createVerificationPolicy(){
  let segments=[],previous=null,missingSince=null,required=true,phase='scanning',reason='initial',attemptAt=null,retryAt=null,monitorAt=null,resetRequested=true;
  function requireVerification(cause){
    if(required){if(cause==='away')reason=cause;return;}
    required=true;reason=cause;phase='scanning';attemptAt=null;retryAt=null;resetRequested=true;
  }
  function reset(preserve=false){
    if(!preserve){segments=[];monitorAt=null;}
    previous=null;missingSince=null;required=true;phase='scanning';reason='initial';attemptAt=retryAt=null;resetRequested=true;
  }
  function update(signals,now){
    const own=signals?.reliable===true&&signals.face===true&&signals.identity?.matched===true;
    if(previous&&now>=previous.at&&now-previous.at<=VERIFICATION_LIMITS.gap&&previous.own)segments.push([previous.at,now]);
    segments=segments.filter(([,end])=>end>now-VERIFICATION_LIMITS.window);
    const recognizedMs=segments.reduce((sum,[start,end])=>sum+end-Math.max(start,now-VERIFICATION_LIMITS.window),0);
    // Enrollment/model preparation is not a failed authentication attempt.
    if(signals?.identity&&(signals.identity.enrolled===false||['enrolling','saving'].includes(signals.identity.status))){
      required=true;previous={at:now,own:false};attemptAt=retryAt=null;missingSince=null;phase='scanning';
      return {required:true,phase,reason,recognizedMs,recognizedSeconds:Math.min(90,recognizedMs/1000),resetRequested:false};
    }
    if(signals?.reliable&&(signals.head??signals.face)){missingSince=null;}else missingSince??=now;
    if(missingSince!==null&&now-missingSince>=VERIFICATION_LIMITS.away)requireVerification('away');
    if(!required)monitorAt??=now;
    // Identity is an entry/return gate. Pose changes during an occupied session
    // must not trigger periodic authentication or train on unverified samples.
    if(required){
      attemptAt??=now;
      if(phase==='failed'&&now>=retryAt){phase='scanning';attemptAt=now;resetRequested=true;}
      // A gate needs evidence captured after the gate began; cached pre-pause matches cannot unlock it.
      const fresh=signals?.identity?.checkedAt===undefined||signals.identity.checkedAt>=attemptAt;
      if(phase==='scanning'&&own&&fresh){required=false;phase='verified';monitorAt=now;}
      else if(phase==='scanning'&&now-attemptAt>=VERIFICATION_LIMITS.attempt){phase='failed';retryAt=now+VERIFICATION_LIMITS.retry;}
      if(reason==='away'&&!signals?.face){phase='scanning';attemptAt=null;retryAt=null;}
    }
    previous={at:now,own};
    const result={required,phase,reason,recognizedMs,recognizedSeconds:Math.min(90,recognizedMs/1000),resetRequested};
    resetRequested=false;
    return result;
  }
  function suspend(){previous=null;missingSince=null;monitorAt=null;}
  return {update,reset,requireVerification,suspend};
}
