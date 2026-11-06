// Private awards are server-owned display badges. They grant no administrative permissions.
export const PRIVATE_BADGES=Object.freeze(['ADMIN','Contributor']);
export function privateBadgeAwards(token){
  return token?.email_verified===true&&typeof token.email==='string'&&token.email.trim().toLowerCase()==='tntgame1203@gmail.com'?[...PRIVATE_BADGES]:[];
}
export async function accountBadges(db,uid,token){
  const ref=db.doc(`users/${uid}`),awards=privateBadgeAwards(token);
  return db.runTransaction(async tx=>{
    const row=await tx.get(ref),saved=row.data()?.privateBadges||[];
    const canonical=saved.map(value=>value==='ADMIM'?'ADMIN':value);
    const badges=[...new Set([...canonical.filter(value=>PRIVATE_BADGES.includes(value)),...awards])];
    if(row.exists&&(saved.length!==badges.length||saved.some((value,index)=>value!==badges[index])))tx.update(ref,{privateBadges:badges});
    return {badges:badges.map(label=>({id:label,label,private:true})),persisted:row.exists};
  });
}
export async function provisionPrivateBadges(db,auth){
  let user;
  try{user=await auth.getUserByEmail('tntgame1203@gmail.com');}
  catch(error){if(error.code==='auth/user-not-found')return {persisted:false,badges:[]};throw error;}
  if(user.disabled||!user.emailVerified)return {persisted:false,badges:[]};
  return accountBadges(db,user.uid,{email:user.email,email_verified:user.emailVerified});
}
