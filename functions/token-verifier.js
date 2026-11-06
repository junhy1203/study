// Keep the existing revocation window, sharing only concurrent work.
// Sensitive face requests still ask Firebase to check revocation on every request.
export function createTokenVerifier(auth,{clock=Date.now,ttl=45000,limit=10000}={}){
  const users=new Map(),pendingUsers=new Map(),pendingTokens=new Map();
  function singleFlight(map,key,load){
    let pending=map.get(key);
    if(!pending){pending=Promise.resolve().then(load).finally(()=>{if(map.get(key)===pending)map.delete(key);});map.set(key,pending);}
    return pending;
  }
  return async function verifyToken(value,{checkRevoked=false}={}){
    if(checkRevoked)return auth.verifyIdToken(value,true);
    const decoded=await singleFlight(pendingTokens,value,()=>auth.verifyIdToken(value));
    if(!decoded?.uid)throw new Error('invalid-token');
    let state=users.get(decoded.uid);
    if(!state||state.expires<=clock())state=await singleFlight(pendingUsers,decoded.uid,async()=>{
      const user=await auth.getUser(decoded.uid);
      const result={disabled:user.disabled,validSince:Date.parse(user.tokensValidAfterTime||'1970-01-01')/1000,expires:clock()+ttl};
      users.set(decoded.uid,result);if(users.size>limit)users.delete(users.keys().next().value);
      return result;
    });
    if(state.disabled||!Number.isFinite(state.validSince)||decoded.auth_time<state.validSince)throw new Error('revoked');
    return decoded;
  };
}
