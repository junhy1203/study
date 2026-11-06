export function worldDatabase(){
  const records=new Map([['users/host',{displayName:'방 주인',avatar:{character:'sprout'}}],['users/guest',{displayName:'친구',avatar:{character:'cat'}}],['users/outsider',{displayName:'외부인'}],['users/host/friends/guest',{uid:'guest',displayName:'친구'}],['users/guest/friends/host',{uid:'host',displayName:'방 주인'}]]);
  const snapshot=(path,map=records)=>({id:path.split('/').at(-1),exists:map.has(path),data:()=>structuredClone(map.get(path))});
  const collection=path=>({orderBy:()=>collection(path),limit:limit=>({get:async()=>({docs:[...records.keys()].filter(key=>key.startsWith(path+'/')&&key.split('/').length===path.split('/').length+1).slice(0,limit).map(key=>snapshot(key))})})});
  const doc=path=>({path,get:async()=>snapshot(path),collection:name=>collection(path+'/'+name)});
  let queue=Promise.resolve();
  return {records,doc,collection,getAll:async(...refs)=>refs.map(ref=>snapshot(ref.path)),runTransaction(fn){
    const run=queue.then(async()=>{const next=structuredClone(records);let writing=false;const read=ref=>{if(writing)throw new Error('Transaction read after write');return snapshot(ref.path,next);};const result=await fn({get:async ref=>read(ref),getAll:async(...refs)=>refs.map(read),set:(ref,value)=>{writing=true;next.set(ref.path,structuredClone(value));},update:(ref,value)=>{writing=true;next.set(ref.path,{...next.get(ref.path),...structuredClone(value)});},delete:ref=>{writing=true;next.delete(ref.path);}});records.clear();for(const [key,value]of next)records.set(key,value);return result;});queue=run.catch(()=>{});return run;
  }};
}
