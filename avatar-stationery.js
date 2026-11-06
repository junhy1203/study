// Original compact SVG stationery, sized for the existing companion viewport.
export const STATIONERY={
  woodpencil:['pencil','#e8b75e','#fff0c1'],redpencil:['pencil','#e47888','#ffd2c1'],blueballpen:['ballpen','#659ade','#d9f2ff'],blackballpen:['ballpen','#697385','#edf0f5'],pinkgelpen:['ballpen','#e69fc3','#fff0f6'],yellowhighlighter:['marker','#f1dc6b','#fffab5'],waxcrayon:['crayon','#a4cde8','#e0efff'],mechanicalpencil:['mechanical','#87cfc0','#dffff4'],
  silvermechanical:['mechanical','#aebdce','#f4faff'],glittergelpen:['glitterpen','#b4a1e3','#fff2bf'],fourcolorpen:['multicolor','#e4e8ee','#9dc8ed'],classicfountain:['fountain','#657a9c','#e8cc8d'],inkbrushpen:['brushpen','#697582','#ddd5be'],watercolorbrush:['brush','#b79578','#b2dce7'],
  crystalpen:['crystalpen','#b2b7f5','#e7faff'],featherquill:['quill','#c1c4ef','#fff3d4'],starlighter:['marker','#c3afe8','#fff2a9'],draftingcompass:['compass','#a9b7d6','#dcecf5'],draftingpen:['technical','#676e85','#edc18a'],
  goldfountain:['fountain','#edc56c','#fff6ce'],aurorabrush:['brush','#99c6d5','#d6a8ee'],orbitquill:['quill','#afa2de','#e5fff6'],
  rainbowquill:['quill','#eea7da','#b5efff','신화'],cosmicfountain:['fountain','#c5b0f6','#fff0b5','신화'],
};
export function drawStationery(shape,art,{make},color,light){
  const supported=['pencil','ballpen','glitterpen','mechanical','multicolor','fountain','brushpen','brush','crayon','marker','crystalpen','quill','compass','technical'];
  if(!supported.includes(shape))return false;
  const pen=make('g',{transform:`rotate(${shape==='compass'?0:24})`},art);
  const path=(d,fill=color,extra={})=>make('path',{d,fill,stroke:'#59647b','stroke-width':'.16','stroke-linejoin':'round',...extra},pen);
  const rect=(x,y,w,h,fill=color,extra={})=>make('rect',{x,y,width:w,height:h,fill,...extra},pen);
  if(shape==='quill'){
    path('M-1 3Q-5-3 1-5 5-6 3-1L0 2Z');
    path('M-1.5 5Q-.8 0 2-4','none',{stroke:light,'stroke-width':'.35'});
    path('M-.4 0-2.3-1M.4-1.5l2-1M1.2-3-1-3.5','none',{stroke:light,'stroke-width':'.2'});
    path('M-1.5 4-2 5.5-.7 4.5Z','#7482a1');
  }else if(shape==='compass'){
    path('M-.7-3-3.8 4.5-3 5 0-.8 3 5 3.8 4.5 .7-3Z');
    path('M-3.2 4 0-2.5 3.2 4','none',{stroke:light,'stroke-width':'.3'});
    make('circle',{cx:0,cy:-2.6,r:.85,fill:light,stroke:'#59647b','stroke-width':'.2'},pen);
    rect(-.35,-4.3,.7,1.3,light);
  }else if(['marker','crayon'].includes(shape)){
    path(shape==='marker'?'M-1.5-4.5h3V2l-1 2h-2Z':'M-1.2-4.5h2.4l.6 2V3l-1.8 2L-1.8 3v-5.5Z');
    rect(-1.5,-1.8,3,3,light);rect(-.8,-1.2,1.6,.35,color);rect(-.8,-.3,1.6,.35,color);
    if(shape==='marker')path('M-1.5 3h2L0 4.6h-1.5Z',light);
  }else if(['brush','brushpen'].includes(shape)){
    path('M-.65-3h1.3L.4 3.5h-.8Z');rect(-.85,-3,1.7,1.1,light);
    path('M-.8-3q-1-1.4 .8-2.7Q2-4 .8-3Z',shape==='brushpen'?'#424654':light);
    path('M-.2-5 .25-3.7','none',{stroke:'#fff','stroke-width':'.15'});
  }else if(shape==='fountain'){
    path('M-1-4.5q1-1.2 2 0V1.7h-2Z');rect(-1,1,2,.5,light);rect(-.6,-4.1,.3,2.7,light);
    path('M-1 1.7 0 5 1 1.7Z',light);path('M0 2.4V5','none',{'stroke-width':'.18'});
    make('circle',{cx:0,cy:2.7,r:.24,fill:'#59647b'},pen);
  }else if(shape==='crystalpen'){
    path('M0-5 1.8-3.2 .75 2.8 0 5-.75 2.8-1.8-3.2Z');
    path('M0-5V5M-1.8-3.2h3.6M-.75 2.8h1.5','none',{stroke:light,'stroke-width':'.22'});
  }else{
    const pencil=shape==='pencil',metal=['mechanical','technical'].includes(shape);
    path('M-.9-4.3q.9-.7 1.8 0V2.5H-.9Z');rect(-.8,-3.6,.4,5.6,light);
    path('M-.9 2.5 0 5 .9 2.5Z',pencil?'#e8c99f':light);
    path('M-.25 4.3 0 5 .25 4.3Z','#566078');
    if(pencil){rect(-.9,-4.5,1.8,.7,'#e8a5b5');rect(-.9,-3.8,1.8,.45,'#bbc9d3');}
    else{
      rect(-.35,-5,.7,.9,light);path('M.7-3.8H1.5v2.5','none',{stroke:light,'stroke-width':'.3'});
      if(metal)for(let i=0;i<4;i++)rect(-.9,.3+i*.45,1.8,.16,'#59647b');
      if(shape==='multicolor')for(const [i,fill]of ['#ec90a9','#84b5ed','#9cc8b0','#686e89'].entries())rect(-1.2+i*.65,-4.5,.45,1.2,fill);
      if(shape==='glitterpen')for(const [x,y]of [[-.2,-2],[.2,0],[-.2,1]])path(`M${x} ${y- .45}l.2 .3 .4 .15-.4 .15-.2 .3-.2-.3-.4-.15.4-.15Z`,light, {stroke:'none'});
    }
  }
  return true;
}
