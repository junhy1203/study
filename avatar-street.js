// Everyday looks, original vector silhouettes and small CSS-driven accents.
export const STREET_CHARACTERS={
  monohoodie:['모노 후디','#d6b79f','#8e7772','#f8d9be'],skater:['스케이트 크루','#d4a680','#936c5b','#f6d2a8'],nightdj:['나이트 DJ','#bd9d96','#65576e','#e6c5b6'],barista:['라떼 바리스타','#dbb695','#967259','#f8d9b3'],photographer:['스트리트 포토그래퍼','#c9a48c','#7e7169','#edceb3'],runner:['러닝 크루','#c99777','#805e54','#edbea0'],workwear:['블루 워크웨어','#d0aa88','#8d7466','#f0cfac'],director:['크리에이티브 디렉터','#d4b59e','#8f7c7d','#f6dcc0'],
};
export const STREET_EFFECTS={
  neonloop:{color:'#91f2db',shape:'neon',ring:true},vinylbeat:{color:'#b6a2ee',shape:'note',ring:true},chromehaze:{color:'#dfedff',shape:'chrome',ring:true},prism:{color:'#f0b3de',shape:'prism',ring:true},cityrain:{color:'#a9d8f5',shape:'rain'},confetti:{color:'#f2c593',shape:'confetti'},shutter:{color:'#f5ebd9',shape:'flash'},speedline:{color:'#d2efb2',shape:'speed'},
};
export function drawStreetCharacter(kind,body,{make,rect,ellipse,ink}){
  if(!STREET_CHARACTERS[kind])return;
  const path=(d,fill,stroke=ink,w=.3)=>make('path',{d,fill,stroke,'stroke-width':w,'stroke-linejoin':'round'},body);
  const clothes={monohoodie:'#414a52',skater:'#b87258',nightdj:'#424258',barista:'#ece2cd',photographer:'#8d9487',runner:'#b4d1b8',workwear:'#5f83a0',director:'#c0b8a7'}[kind];
  const hair=kind==='director'?'#c8b59b':kind==='runner'?'#5a493e':'#4b4248';
  path('M4 6V3l2-1h6l2 2v3l-3-2-2 1-3-1Z',hair);rect(5,4,3,1,hair,body);
  path('M4 14h10l1 6H3Z',clothes);rect(1,13,3,5,clothes,body);rect(14,13,3,5,clothes,body);
  rect(4,19,4,2,'#35424e',body);rect(10,19,4,2,'#35424e',body);rect(4,20,4,.7,'#e9e4da',body);rect(10,20,4,.7,'#e9e4da',body);
  if(kind==='monohoodie'){path('M4 14 6 12l3 2 3-2 2 2-2 2H6Z','#68717a');path('M7 14v3m4-3v3','none','#e8dfd3',.35);rect(6,17,6,1.5,'#343c46',body);}
  if(kind==='skater'){path('M0 20h18l1 1-1 1H0l-1-1Z','#dbbc91');for(const x of [3,15])ellipse(x,22,.8,.8,{fill:'#394652'},body);rect(6,14,6,2,'#eddec1',body);path('M8 14v2m2-2v2','none','#4c515c',.3);}
  if(kind==='nightdj'){path('M2 10V5q7-7 14 0v5','none','#373c4e',1.1);for(const x of [1,15]){rect(x,7,2,5,'#878da6',body);rect(x+.4,8,1.2,3,'#aee5df',body);}rect(5,16,8,4,'#2e3448',body);for(let i=0;i<5;i++)rect(6+i*1.3,19-i%3,.6,1+i%3,'#b5dfd7',body);}
  if(kind==='barista'){path('M6 13v2h6v-2M5 15h8v5H5Z','#8d6d55');rect(7,16,4,2,'#b59b7e',body);rect(15,13,3,3,'#eee5cf',body);path('M18 13q2 1 0 2','none','#eee5cf',.6);rect(15,12.5,3,.5,'#725b4e',body);}
  if(kind==='photographer'){path('M5 13 14 19','none','#4b4d4b',.8);rect(11,16,6,4,'#414955',body);ellipse(14,18,1.4,1.4,{fill:'#91a9b3',stroke:'#d8d6cc','stroke-width':'.3'},body);rect(12,15,2,1,'#414955',body);}
  if(kind==='runner'){path('M4 14 9 19l5-5','none','#e4eee1',.5);rect(5,15,3,2,'#f3eedb',body);rect(5.8,15.5,1.4,.5,'#687b74',body);rect(14,15,2,1,'#454e57',body);path('M6 3h6','none','#b6d3b4',.6);}
  if(kind==='workwear'){path('M9 14v6M5 15h3v2H5m5-2h3v2h-3','none','#c5d6d9',.3);rect(4,18,10,1,'#665e54',body);path('M17 19v-5q-2-1-1-3l1 1 1-1q1 2-1 3','none','#d1d7d7',.7);}
  if(kind==='director'){path('M5 14 8 18l1-4 1 4 3-4','none','#625f65',.5);rect(8,15,2,5,'#f0e9dc',body);rect(15,13,3,5,'#9c8d7e',body);rect(15.5,14,2,3,'#dcd2bd',body);}
}
export function drawStreetHat(kind,body,{make,rect,ellipse,ink}){
  const path=(d,fill,stroke=ink,w=.3)=>make('path',{d,fill,stroke,'stroke-width':w},body);
  if(['snapback','dadcap','racingcap'].includes(kind)){const c=kind==='snapback'?'#424955':kind==='dadcap'?'#aa9f84':'#f0e3cb';path('M4 4V2q5-4 10 0v3H4Z',c);path(kind==='snapback'?'M3 4h13v1H3Z':'M4 4h10l3 2H7Z',kind==='racingcap'?'#606b75':c);rect(8,1.5,2,1.2,kind==='racingcap'?'#bc6e5f':'#d4c8b3',body);if(kind==='racingcap')for(const x of [5,7,9,11])rect(x,3,.8,.6,'#b67461',body);}
  if(kind==='bucket'){path('M5 0h8l1 4 3 2H1l3-2Z','#b9ad91');rect(4,3,10,.7,'#827d70',body);path('M6 1h6','none','#ded3b8',.3);}
  if(kind==='beret'){path('M2 3Q2-2 10-2q7 0 6 5l-4 2H5Z','#53525b');rect(4,4,10,1,'#76717a',body);rect(9,-3,.6,2,'#45434e',body);}
  if(kind==='ribbeanie'){path('M4 4V1q5-4 10 0v3Z','#897c73');rect(3,3,12,2,'#b0a290',body);for(let x=5;x<14;x+=1.5)rect(x,0,.35,3,'#b2a490',body);rect(11,3.5,2,1,'#e1d5bf',body);}
  if(kind==='earmuffs'){path('M2 9V4q7-7 14 0v5','none','#bdb5a7',1);for(const x of [2,16])ellipse(x,9,2,3,{fill:'#eee4d2',stroke:'#c0b4a1','stroke-width':'.3'},body);}
  if(kind==='earbuds')for(const x of [3,15]){ellipse(x,9,.9,1.1,{fill:'#d7e2e7',stroke:'#81919e','stroke-width':'.25'},body);rect(x-.4,9,.8,3,'#b5c6d0',body);}
}
export function drawStreetGlasses(kind,body,{make,rect,ellipse}){
  if(!['clearframe','metalframe','sportwrap','darkrim','retroamber','rimless'].includes(kind))return;
  const path=(d,fill,stroke,w=.3)=>make('path',{d,fill,stroke,'stroke-width':w},body);
  if(kind==='sportwrap'){path('M3.5 7.5q5-1.5 11 0l-1 3h-3l-1.5-1-1.5 1h-3Z','#536979','#b4e1da',.4);path('M5 8h7','none','#c7f2e6',.4);return;}
  const colors={clearframe:['#f3ede4','#e9e2d4'],metalframe:['#c9d7db','#a6b9c7'],darkrim:['#52515b','#4c4d59'],retroamber:['#d7b27b','#9a7d64'],rimless:['#c8e2e5','#c9d9e4']},[lens,frame]=colors[kind];
  for(const x of [6.5,11.5]){if(kind==='metalframe')ellipse(x,9,2,1.8,{fill:lens,'fill-opacity':'.25',stroke:frame,'stroke-width':'.35'},body);else make('rect',{x:x-2,y:7.4,width:4,height:3.2,rx:.7,fill:lens,'fill-opacity':kind==='retroamber'?'.65':'.18',stroke:frame,'stroke-width':kind==='rimless'?'.18':'.4'},body);rect(x-1.2,7.9,1,.3,'#f7f6e9',body);}
  path('M8.5 8.5h1','none',frame,.35);
}
export function drawStreetParticle(kind,parent,{make,ellipse},color,index){
  const path=(d,fill=color,stroke='none',w=.25)=>make('path',{d,fill,stroke,'stroke-width':w},parent);
  if(kind==='neonloop'){path('M-1.5 0h3','none',index%2?'#e5b4ed':color,.5);ellipse(0,0,.3,.3,{fill:'#f3fff6'},parent);}
  if(kind==='vinylbeat'){path('M0 1v-3l2-.5V.5','none',color,.4);ellipse(-.5,1,.7,.5,{fill:color},parent);ellipse(1.5,.5,.7,.5,{fill:color},parent);}
  if(kind==='chromehaze'){path('M-1.5-1 1.5-1 1.5 1-1.5 1Z','none',color,.25);path('M-1-1 1 1','none','#9ab3d9',.35);}
  if(kind==='prism')path('M0-2 1.5 0 0 2-1.5 0Z',index%3===0?'#b3e6e0':index%3===1?'#d1bef0':color,'#f8e4ee',.15);
  if(kind==='cityrain')path('M.5-2-.5 2','none',color,.35);
  if(kind==='confetti')path(index%2?'M-1-1 1 1 1.5.5-.5-1.5Z':'M-1-.5h2v1h-2Z',['#f0bd9d','#b3d9c2','#beb6e6','#e4c882'][index%4]);
  if(kind==='shutter')path('M-1.5 0h3M0-1.5v3','none',color,.35);
  if(kind==='speedline')path('M-2-.4h3M-1 .4h3','none',color,.35);
}
