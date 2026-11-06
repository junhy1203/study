// Used only inside the camera Worker. Neither pixels nor descriptors reach UI.
export async function createIsolatedFaceDescriber(model){
  let worker,sequence=0,closed=false;
  const pending=new Map();
  const fail=error=>{
    if(closed)return;
    closed=true;worker?.terminate();
    for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}
    pending.clear();
  };
  const call=(type,data={})=>new Promise((resolve,reject)=>{
    if(closed){reject(new Error('얼굴 특징 분석이 종료되었습니다.'));return;}
    const id=++sequence,timer=setTimeout(()=>fail(new Error('얼굴 특징 분석 시간이 초과되었습니다.')),60000);
    pending.set(id,{resolve,reject,timer});
    try{worker.postMessage({type,id,...data});}catch(error){fail(error);}
  });
  try{
    worker=new Worker(new URL('./face-descriptor-worker.js?v=20261105-lag1',import.meta.url));
    worker.onmessage=({data})=>{
      const request=pending.get(data.id);if(!request)return;
      pending.delete(data.id);clearTimeout(request.timer);
      if(data.error)request.reject(new Error(data.error));else request.resolve(data.values);
    };
    worker.onerror=event=>{event.preventDefault?.();fail(new Error(event.message||'얼굴 특징 분석을 시작하지 못했습니다.'));};
    worker.onmessageerror=()=>fail(new Error('얼굴 특징 분석 응답을 읽지 못했습니다.'));
    await call('init',{model});
    return {describe:image=>call('describe',{image}),close:()=>fail(new Error('얼굴 특징 분석이 종료되었습니다.'))};
  }catch{
    fail(new Error('별도 얼굴 특징 분석을 사용할 수 없습니다.'));
    return null;
  }
}
