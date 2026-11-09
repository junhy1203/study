// Per-run state only: never share a baseline between tabs or persist it.
export function createStudyGuard({window:win,document:doc,now=()=>performance.now(),onChange=()=>{}}) {
  let baseline=null,reason=null,lastCheck=null,timer=null,unfocused=false,pauseAt=null;
  const listeners=[];
  const geometry=()=>({screenWidth:Number(win.screen?.width),screenHeight:Number(win.screen?.height),
    width:Number(win.visualViewport?.width??win.innerWidth),height:Number(win.visualViewport?.height??win.innerHeight)});
  const valid=g=>Object.values(g).every(value=>Number.isFinite(value)&&value>0);
  // Two CSS pixels allow fractional layout rounding, not a resize grace period.
  const sameRatio=(w,h,bw,bh)=>Math.abs(w*bh-h*bw)<=2*Math.max(bw,bh);
  function check() {
    if(!baseline)return true;
    const time=now(),gap=lastCheck!=null&&time-lastCheck>2500;
    const previousCheck=lastCheck;lastCheck=time;
    const current=geometry();
    const next=doc.hidden?'hidden':unfocused?'blur':!valid(current)?'geometry':
      !sameRatio(current.screenWidth,current.screenHeight,baseline.screenWidth,baseline.screenHeight)||
      !sameRatio(current.width,current.height,baseline.width,baseline.height)?'ratio':gap?'gap':null;
    if(next!==reason){
      if(next)pauseAt??=gap?previousCheck:time;
      else pauseAt=null;
      reason=next;onChange({blocked:Boolean(reason),reason});
    }
    return !reason;
  }
  function listen(target,type,handler){target?.addEventListener?.(type,handler);listeners.push(()=>target?.removeEventListener?.(type,handler));}
  function stop(){
    if(timer!=null)win.clearInterval?.(timer);
    timer=null;for(const remove of listeners.splice(0))remove();
    baseline=null;reason=null;lastCheck=null;unfocused=false;pauseAt=null;
  }
  function start(){
    stop();
    const current=geometry();
    if(!valid(current))throw new Error('학습 화면 크기를 확인하지 못했습니다. 브라우저에서 다시 시작해 주세요.');
    baseline=Object.freeze(current);lastCheck=now();
    unfocused=typeof doc.hasFocus==='function'&&!doc.hasFocus();
    listen(doc,'visibilitychange',check);
    listen(win,'blur',()=>{unfocused=true;check();});
    listen(win,'focus',()=>{unfocused=false;check();});
    listen(win,'resize',check);listen(win,'orientationchange',check);
    listen(win.visualViewport,'resize',check);
    listen(win,'pagehide',()=>{unfocused=true;check();});
    listen(win,'pageshow',()=>{unfocused=typeof doc.hasFocus==='function'&&!doc.hasFocus();check();});
    timer=win.setInterval?.(check,500)??null;
    check();
  }
  return {start,stop,check,get blocked(){return Boolean(reason);},get reason(){return reason;},get pauseAt(){return pauseAt;},get active(){return baseline!==null;}};
}
