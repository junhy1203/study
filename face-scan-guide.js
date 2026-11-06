// Display guidance only; this never changes enrollment or recognition decisions.
export function scanArrowGuidance({alignment,state,direction,coverage=[],refining=false}={}){
  if(state==='QUALITY_HOLD'||!alignment||![alignment.x,alignment.y].every(Number.isFinite))return {mode:'align',angle:0,tone:'hold',label:'얼굴을 가운데로 맞춰 주세요'};
  const {x,y}=alignment;
  if(Math.max(Math.abs(x),Math.abs(y))>.12){
    const angle=Math.atan2(x,-y)*180/Math.PI;
    const heading=Math.round(angle/45)*45;
    const label=({'0':'위쪽','45':'오른쪽 위','90':'오른쪽','135':'오른쪽 아래','180':'아래쪽','-180':'아래쪽','-135':'왼쪽 아래','-90':'왼쪽','-45':'왼쪽 위'})[heading];
    return {mode:'direction',angle,tone:'adjust',label:`${label}${label.endsWith('쪽')?'으로':'로'} 옮겨 주세요`};
  }
  if(direction!=='circle')return {mode:'align',angle:0,tone:'ready',label:'위치가 맞아요 · 정면 유지'};
  const sector=Array.from({length:8},(_,i)=>coverage[i]||0).findIndex(count=>count<2);
  if(sector<0)return {mode:'align',angle:0,tone:'ready',label:refining?'천천히 한 바퀴 더 돌아 주세요':'모든 각도를 담았어요'};
  return {mode:'direction',angle:[-90,-45,0,45,90,135,180,-135][sector],tone:'scan',label:`${['왼쪽을','왼쪽 위를','위쪽을','오른쪽 위를','오른쪽을','오른쪽 아래를','아래쪽을','왼쪽 아래를'][sector]} 더 보여 주세요`};
}

// Pure geometry shared by the live registration ring and its regression tests.
export function scanRingSegments(orientation,coverage=[]){
  const x=orientation?.x,y=orientation?.y,valid=Number.isFinite(x)&&Number.isFinite(y);
  const radius=valid?Math.hypot(x,y):0,heading=valid?Math.atan2(-x,-y):0;
  return Array.from({length:64},(_,i)=>{
    const angle=i*Math.PI/32,sector=(Math.round((angle+Math.PI/2)/(Math.PI/4))+8)%8;
    const difference=Math.atan2(Math.sin(angle-heading),Math.cos(angle-heading));
    const active=radius>.2?Math.exp(-Math.pow(difference/.48,2))*Math.min(1,radius):0;
    const count=coverage[sector]||0,outer=102+8*active;
    return {x1:112+92*Math.sin(angle),y1:112-92*Math.cos(angle),x2:112+outer*Math.sin(angle),y2:112-outer*Math.cos(angle),
      color:active>.1?'#5df5a4':count>=2?'#36c78b':count===1?'#68bda0':'#b6c7d7',opacity:active>.1||count>=2?1:count===1?.8:.55,width:2.5+active*1.2,sector,active,
      missing:{x1:112+118*Math.sin(angle),y1:112-118*Math.cos(angle),x2:112+123*Math.sin(angle),y2:112-123*Math.cos(angle),opacity:count>=2?0:count===1?.45:.9}};
  });
}
const states=new WeakMap(),attributes=new WeakMap(),NS='http://www.w3.org/2000/svg';
function put(node,key,value){
  value=String(value);let cache=attributes.get(node);
  if(!cache){cache=new Map();attributes.set(node,cache);}
  if(cache.get(key)===value)return;
  cache.set(key,value);node.setAttribute(key,value);
}
function drawRing(state){
  scanRingSegments(state.orientation,state.coverage).forEach((segment,i)=>{
    const line=state.lines[i],missing=state.missingLines[i];
    for(const key of ['x1','y1','x2','y2']){put(line,key,segment[key].toFixed(2));put(missing,key,segment.missing[key].toFixed(2));}
    put(line,'stroke',segment.color);put(line,'stroke-opacity',segment.opacity);put(line,'stroke-width',segment.width.toFixed(2));
    put(missing,'stroke-opacity',segment.missing.opacity);put(missing,'data-face-missing-sector',segment.sector);
  });
}
function animateRing(ring,state){
  if(state.frame!==null)return;
  const view=ring.ownerDocument.defaultView;
  let previousTime=null;
  const tick=time=>{
    state.frame=null;
    if(ring.isConnected===false)return;
    const dt=previousTime===null?16:Math.min(64,Math.max(0,time-previousTime));previousTime=time;
    const target=state.target||{x:0,y:0},current=state.orientation||{x:0,y:0},alpha=1-Math.exp(-dt/55);
    const x=current.x+(target.x-current.x)*alpha,y=current.y+(target.y-current.y)*alpha;
    const moving=Math.hypot(x-target.x,y-target.y)>.002;
    state.orientation=moving?{x,y}:state.target;drawRing(state);
    if(moving)state.frame=view.requestAnimationFrame(tick);
  };
  state.frame=view.requestAnimationFrame(tick);
}
export function stopScanRing(ring){
  const state=ring&&states.get(ring);if(!state)return;
  if(state.frame!==null)ring.ownerDocument.defaultView?.cancelAnimationFrame(state.frame);
  states.delete(ring);
}
export function updateScanRing(ring,feedback={}){
  if(!ring)return;
  let state=states.get(ring);
  if(!state){
    const svg=ring.ownerDocument.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 224 224');svg.setAttribute('aria-hidden','true');
    const arrows=[['↑',112,20],['→',206,116],['↓',112,213],['←',18,116]].map(([label,x,y])=>{const node=ring.ownerDocument.createElementNS(NS,'text');node.textContent=label;node.setAttribute('x',x);node.setAttribute('y',y);node.setAttribute('text-anchor','middle');node.setAttribute('fill','#c4d3d4');node.setAttribute('font-size','17');svg.append(node);return node;});
    const lines=Array.from({length:64},()=>{const line=ring.ownerDocument.createElementNS(NS,'line');line.setAttribute('stroke-linecap','round');svg.append(line);return line;});
    const missingLines=Array.from({length:64},()=>{const line=ring.ownerDocument.createElementNS(NS,'line');line.setAttribute('stroke','#ed525d');line.setAttribute('stroke-width','2.5');line.setAttribute('stroke-linecap','round');svg.append(line);return line;});
    ring.classList.add('face-scan-ring');ring.replaceChildren(svg);state={lines,missingLines,arrows,orientation:null,target:null,coverage:[],frame:null};states.set(ring,state);
  }
  if('orientation'in feedback)state.target=feedback.orientation;
  if(feedback.coverage)state.coverage=feedback.coverage;
  if('alignment'in feedback){const a=feedback.alignment||{x:0,y:0},active=[a.y<-.12,a.x>.12,a.y>.12,a.x<-.12];state.arrows.forEach((arrow,i)=>{put(arrow,'fill',active[i]?'#37d99a':'#c4d3d4');put(arrow,'opacity',active[i]?'1':'.3');put(arrow,'font-weight',active[i]?'700':'400');});}
  const view=ring.ownerDocument.defaultView,reduced=view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(!view?.requestAnimationFrame||reduced||!state.target){
    if(state.frame!==null)view?.cancelAnimationFrame(state.frame);
    state.frame=null;state.orientation=state.target;
  }else animateRing(ring,state);
  drawRing(state);
}
