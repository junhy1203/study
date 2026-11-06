// Original SVG equipment and creatures; no image downloads or extra render loop.
export const RPG_CHARACTERS={
  knight:['견습 기사','#b8c5d5','#71839d','#ecf6ff'],ranger:['숲의 궁수','#d5b18c','#7b9560','#f4d8ad'],mage:['수정 마법사','#c3afe6','#75659f','#eee2ff'],rogue:['그림자 도적','#a7a9bf','#555776','#dddff4'],paladin:['태양의 성기사','#efd18b','#ad843c','#fff3c6'],necromancer:['영혼술사','#a0c9ad','#56697d','#d0ffe5'],slime:['에메랄드 슬라임','#7be4bc','#309e91','#d1fff1'],golem:['룬석 골렘','#a2ada7','#687d77','#d2e4d4'],skeleton:['꼬마 해골 검사','#e3dbc5','#a79d8b','#fff9e8'],ghost:['달빛 유령','#d8e6ff','#8c9acb','#f5f8ff'],phoenix:['불사조','#ffac69','#cf5354','#fff1a1'],unicorn:['오팔 유니콘','#eddbf8','#bca0da','#fff3ff'],werewolf:['은빛 늑대','#a7bccb','#637e94','#e0edf5'],vampire:['밤의 귀족','#dbb2c3','#764c78','#ffe6ed'],angel:['새벽의 천사','#f1dfb4','#c0a476','#fff7dd'],reaper:['황혼의 사신','#a1a0cb','#514e77','#ded9ff'],mushroom:['버섯 정찰병','#f0d3a1','#b17865','#fff0c4'],treant:['고목 수호자','#b99572','#6b6c51','#e0c494'],fairy:['별가루 요정','#d9bcf1','#8b71b4','#fae8ff'],demonking:['심연의 마왕','#b787b8','#5e477f','#f5b9dc'],
};
export const RPG_EFFECTS={
  fireflies:{color:'#ddff8e',shape:'light',motion:'float'},petals:{color:'#ffaed1',shape:'petal',motion:'float'},runes:{color:'#baadff',shape:'rune',ring:true},lightning:{color:'#a5eaff',shape:'bolt',motion:'flash',ring:true},swords:{color:'#e9e4ff',shape:'sword',ring:true},phoenixfire:{color:'#ffbd74',shape:'feather',motion:'rise',ring:true},void:{color:'#bd8aff',shape:'rift',ring:true},butterflies:{color:'#c4b1ff',shape:'butterfly',motion:'float'},bubbles:{color:'#9ae9ff',shape:'bubble',motion:'rise'},coins:{color:'#ffdb76',shape:'coin'},poison:{color:'#a2ed75',shape:'skull',motion:'rise'},crystals:{color:'#9ce8ff',shape:'crystal',ring:true},meteors:{color:'#ffc196',shape:'meteor',motion:'fall'},dragonsoul:{color:'#8affdd',shape:'dragon',ring:true},holy:{color:'#fff1af',shape:'cross',ring:true},ravens:{color:'#c6b4ec',shape:'raven',motion:'float'},
};
export function drawRPGCharacter(kind,body,{make,rect,ellipse,ink}){
  const spec=RPG_CHARACTERS[kind];if(!spec)return;
  const [,c,shade,light]=spec;
  const path=(d,fill,stroke=ink,width=.35,parent=body)=>make('path',{d,fill,stroke,'stroke-width':width,'stroke-linejoin':'round'},parent);
  const eyes=(y=9)=>{const group=make('g',{class:'avatar-eyes'},body);for(const x of [6,11]){rect(x,y,1.1,1.6,ink,group);rect(x,y,.35,.4,light,group);}};
  const gem=(x,y,color=light)=>path(`M${x} ${y-1}l1 1-1 1-1-1Z`,color);
  const sword=()=>{path('M17 15V5l1-2 1 2v10Z','#e2eaff');rect(16,14,4,.8,'#d6b266',body);rect(17.5,15,1,3,'#9c7356',body);};
  const wings=(color,bat=false)=>{for(const side of [-1,1])make('path',{d:bat?'M0 0Q-6-7-7-2L-6 4-3 2 0 5Z':'M0 0Q-5-7-7-3L-5 2-3 1-2 4 0 4Z',fill:color,stroke:shade,'stroke-width':'.35',transform:`translate(${side<0?3:15} 11) scale(${-side} 1)`},body);};
  if(['slime','golem','skeleton','ghost','phoenix','mushroom','treant'].includes(kind))body.replaceChildren();
  if(kind==='slime'){path('M1 18Q0 9 4 7Q6 3 10 5Q17 5 18 18Q10 23 1 18Z',c);path('M2 17Q9 20 17 16L17 19Q9 22 2 19Z',shade,'none');ellipse(6,8,2.8,1.3,{fill:light,opacity:'.7'},body);eyes(13);path('M8 16q1 1 2 0','none',ink,.4);gem(12,7);}
  if(kind==='golem'){for(const x of [-1,14]){rect(x,10,5,8,ink,body);rect(x+.5,10.5,4,6,c,body);}rect(3,3,12,15,ink,body);rect(4,4,10,13,c,body);path('M8 4 6 9l3 2-2 5','none',shade,.7);rect(5,7,3,1,'#8bffe1',body);rect(10,7,3,1,'#8bffe1',body);gem(9,13,'#9cffe7');for(const x of [4,11])rect(x,18,3,3,shade,body);}
  if(kind==='skeleton'){path('M3 5 5 2h8l2 3v7l-3 2H6l-3-2Z',c);for(const x of [5,10])rect(x,6,3,3,'#514d63',body);path('M9 9 8 11h2Z',shade);for(let x=6;x<13;x+=2)rect(x,12,1,2,shade,body);rect(8,14,2,5,c,body);for(const y of [15,17])rect(5,y,8,.7,c,body);for(const x of [4,12])path(`M${x} 15v5`,'none',c,1.1);sword();}
  if(kind==='ghost'){path('M2 20V9Q2 2 9 2t7 7v11l-3-2-3 2-3-2-3 2Z',c);path('M3 15q6 3 12-1v4l-2-1-3 2-3-2-3 2Z',shade,'none');eyes(9);ellipse(9,13,1,1.4,{fill:shade},body);}
  if(kind==='phoenix'){wings('#f58c66');path('M5 19 2 23 8 20 9 25 11 20 17 23 13 18Z','#ee6d5f');path('M5 9 8 4 8 1l2 3 2-3 1 5 2 5-3 8H6Z',c);path('M8 10h3v8H8Z',light,'none');path('M9 8 13 9 9 11Z','#ffe28a');rect(7,7,1,1,ink,body);}
  if(kind==='mushroom'){rect(5,10,8,10,c,body);rect(4,18,4,2,shade,body);rect(10,18,4,2,shade,body);path('M0 10Q0 0 9 0t9 10Z','#d5676c');for(const [x,y,r]of [[4,5,1.6],[10,3,1.5],[14,7,1.8]])ellipse(x,y,r,r,{fill:light},body);eyes(13);rect(3,16,2,3,'#668c64',body);rect(13,16,2,3,'#668c64',body);}
  if(kind==='treant'){path('M1 17 4 9 3 4 7 5 9 1 11 5 16 3 14 10 17 17 13 16 14 21 10 20 9 17 7 21 3 21 4 16Z',c);for(const [x,y,r]of [[4,4,4],[10,2,4],[15,5,4]])ellipse(x,y,r,r,{fill:y===2?'#86bc78':'#60996a'},body);path('M6 10v8M12 9l-1 7','none',shade,.6);eyes(10);gem(9,14,'#b9ef9c');}
  if(['knight','ranger','mage','rogue','paladin','necromancer','vampire','angel','reaper','fairy','demonking'].includes(kind)){
    const robe={knight:'#8fabc0',ranger:'#547b58',mage:'#7763b3',rogue:'#45455f',paladin:'#c6a259',necromancer:'#436c64',vampire:'#8b496b',angel:'#f0dfad',reaper:'#504d79',fairy:'#a47dc8',demonking:'#71446e'}[kind];
    path('M4 14h10l2 6H2Z',robe);rect(5,15,8,1,light,body);gem(9,16,kind==='necromancer'?'#a7ffbf':light);
    if(['knight','paladin'].includes(kind)){for(const x of [1,13])rect(x,13,4,3,shade,body);sword();path('M0 14h4v5l-2 2-2-2Z',kind==='paladin'?'#f1cf76':'#7999b9');gem(2,17);}
    if(kind==='ranger'){path('M17 5q7 7 0 15M17 5v15','none','#b89163',.7);path('M14 12h8l-2-1m2 1-2 1','none',light,.4);rect(4,3,10,2,'#66865b',body);}
    if(['mage','necromancer'].includes(kind)){path('M18 19V5','none','#8a6b91',.8);ellipse(18,3,2,2,{fill:kind==='mage'?'#b5edff':'#a9f8bd',stroke:shade,'stroke-width':'.4'},body);path('M4 5 9-2l5 7Z',robe);}
    if(kind==='rogue'){path('M3 8 4 3l5-3 5 3 1 5-4-3H7Z',robe);rect(4,10,10,3,robe,body);path('M17 18v-6l1-2 1 2-1 6Z','#d7d7eb');}
    if(kind==='vampire'){path('M3 11 0 8l1 13 8-2 8 2 1-13-3 3Z','#442c57');rect(5,14,8,3,robe,body);path('M6 12v2l1-2m4 0v2l1-2',light,'none');gem(9,16,'#f197b7');}
    if(['angel','fairy'].includes(kind)){wings(kind==='angel'?'#fff2ce':'#dcb7fb');if(kind==='angel')ellipse(9,0,4,1,{fill:'none',stroke:'#f4d17a','stroke-width':'.6'},body);else{path('M17 18V9','none',light,.5);gem(17,7,'#ffe4a8');}}
    if(kind==='reaper'){path('M3 7 5 1 9-1l5 3 1 6-5-3H7Z',robe);path('M18 21V1Q12-2 10 2q5-1 8 3','none','#c3c0e2',.8);rect(4,10,10,3,robe,body);}
    if(kind==='demonking'){wings('#714b86',true);path('M4 5 1-2 6 1M14 5l3-7-5 3','#dab2da');rect(5,8,3,1,'#ffb5d1',body);rect(10,8,3,1,'#ffb5d1',body);gem(9,16,'#f7a3c6');}
  }
  if(kind==='unicorn'){path('M7 4 9-3l2 7Z','#e7c987');path('M3 5 5 1l2 4m4 0 2-4 2 4',light);path('M13 5q5 6 2 13l-3-3V5Z','#d59bd0');rect(7,11,5,3,light,body);rect(9,12,1,1,shade,body);}
  if(kind==='werewolf'){path('M3 6 2 0l5 4m4 0 5-4-1 7',shade);path('M7 10h4l2 4H5Z',light);rect(8,11,2,1,ink,body);path('M14 18q7 3 6-4 5 7-6 7Z',shade);}
}
export function drawRPGHat(kind,body,{make,rect,ellipse,ink}){
  const path=(d,fill,stroke=ink,width=.35)=>make('path',{d,fill,stroke,'stroke-width':width,'stroke-linejoin':'round'},body);
  const jewel=(x,y,c)=>path(`M${x} ${y-1}l1 1-1 1-1-1Z`,c);
  if(['ironhelm','dragonhelm','viking','valkyrie'].includes(kind)){
    const c=kind==='dragonhelm'?'#a1778c':kind==='valkyrie'?'#e5d6a8':'#aab6c7';path('M3 7V3l3-3h6l3 3v4l-3-2H6Z',c);rect(8,0,2,7,'#e1d5af',body);rect(4,4,4,1,'#4c5672',body);rect(10,4,4,1,'#4c5672',body);
    if(kind==='viking')path('M4 3Q-2 1 1-3l1 4 3 1m8 0 4-1 1-4q3 5-4 6','#efdfb6');
    if(kind==='dragonhelm')path('M4 2 2-3 7 0m4 0 5-3-2 6','#dbc1bc');
    if(kind==='valkyrie')for(const side of [-1,1])make('path',{d:'M0 2-5-3-4 1-6-1-3 4Z',fill:'#fff5d3',stroke:'#c8ae7f','stroke-width':'.3',transform:`translate(${side<0?4:14} 1) scale(${-side} 1)`},body);
  }
  if(['rangerhood','catcap'].includes(kind)){path('M2 7 3 2 8-1h3l4 3 1 5-4-3H6Z',kind==='rangerhood'?'#5c8668':'#9d88b4');if(kind==='catcap')path('M3 3 2-2l5 3m5 0 4-3-1 5','#c4abd4');}
  if(kind==='pirate'){path('M1 4 2 0l4 1 3-3 3 3 4-1 1 4Z','#3d3e5b');rect(3,4,12,1,'#d3ac71',body);ellipse(9,1,1.2,1,{fill:'#f2e8ce'},body);rect(8.5,2,1,1,'#f2e8ce',body);}
  if(kind==='antlers')for(const side of [-1,1])make('path',{d:'M0 3-2-3m1 3-3-1m2-1-1-3',fill:'none',stroke:'#d7b687','stroke-width':'.9',transform:`translate(${side<0?5:13} 1) scale(${-side} 1)`},body);
  if(kind==='lotus'){for(let i=0;i<5;i++)ellipse(5+i*2,2-Math.sin(i*Math.PI/4)*2,1.5,2,{fill:i%2?'#f4bad5':'#d697cb',transform:`rotate(${(i-2)*20} ${5+i*2} 2)`},body);jewel(9,2,'#ffe4b1');}
  if(['icecrown','runecrown','tiara'].includes(kind)){const c=kind==='icecrown'?'#b7edff':kind==='runecrown'?'#b9a5f0':'#f1c8e2';path('M3 4 3 0l3 2 3-5 3 5 3-2v4Z',c);rect(4,4,10,.8,'#e5e5ff',body);for(const x of [5,9,13])jewel(x,3,kind==='runecrown'?'#7455bd':'#fff5d9');}
  if(kind==='phoenixcrest'){for(const side of [-1,1])make('path',{d:'M0 3-5-2-3-3 0 0 2-5 3-1 2 4Z',fill:'#f3a373',stroke:'#bb6977','stroke-width':'.3',transform:`translate(${side<0?7:11} 0) scale(${-side} 1)`},body);jewel(9,3,'#fff0ac');}
  if(kind==='voidhorns'){path('M4 4Q-2 0 3-5 1 0 6 1m6 0q5-1 3-6 5 5-1 9','#9272c2');jewel(9,2,'#dba7ff');}
  if(kind==='mushroomcap'){path('M1 4Q1-3 9-3t8 7Z','#d56675');for(const x of [4,9,14])ellipse(x,x===9?-1:1,1.3,1,{fill:'#ffe4be'},body);}
  if(kind==='jester'){path('M2 4 1-2l5 2 3-4 3 4 5-2-1 6Z','#8f79ba');for(const [x,y]of [[1,-2],[9,-4],[17,-2]])ellipse(x,y,.7,.7,{fill:'#f4d68d'},body);rect(3,3,12,1,'#ebbc8b',body);}
  if(kind==='ninja'){rect(3,2,12,2,'#525271',body);rect(7,2,4,2,'#b7bdcf',body);path('M14 3 20 1l-2 3 3 2-7-2Z','#766a98');}
  if(kind==='rose'){path('M3 3 15 3','none','#668b72',.6);for(let i=0;i<3;i++){ellipse(5+i*4,2,1.8,1.5,{fill:i===1?'#b56a98':'#6f4a7c'},body);jewel(5+i*4,2,'#e6a7c9');}}
  if(kind==='sunhalo'){for(let i=0;i<12;i++){const t=i*Math.PI/6;path(`M${9+Math.cos(t)*5} ${Math.sin(t)*2}l${Math.cos(t)*2} ${Math.sin(t)*2}`,'none','#f8d375',.5);}ellipse(9,0,5,2,{fill:'none',stroke:'#ffe4a1','stroke-width':'.7',class:'avatar-halo-crown'},body);}
  if(kind==='witchhat'){path('M0 5 18 5 13 2 12-4 7-3 5 2Z','#524064');rect(4,3,10,1,'#b48a9f',body);jewel(9,3,'#b2e9ad');}
}
export function drawRPGGlasses(kind,body,{make,rect,ellipse,ink}){
  const path=(d,fill,stroke=ink,width=.3)=>make('path',{d,fill,stroke,'stroke-width':width},body);
  if(kind==='eyepatch'){path('M4 7 14 11','none','#54445e',.5);rect(4.5,7.5,4,3,'#423d54',body);}
  if(['runeeye','steampunk'].includes(kind)){for(const x of kind==='runeeye'?[11.5]:[6.5,11.5]){ellipse(x,9,2.2,2.1,{fill:kind==='runeeye'?'#b3f2e3':'#c0dfdd',stroke:'#b89463','stroke-width':'.65'},body);path(`M${x-1} 9h2m-1-1v2`,'none','#f5ebbf',.3);}}
  if(['iceglass','crystal'].includes(kind)){const c=kind==='iceglass'?'#b6efff':'#c4a9f6';for(const x of [6.5,11.5])path(`M${x-2} 8l2-1 2 1v2l-2 1-2-1Z`,c,'#747eaf');rect(8.5,8.5,1,.5,'#cab8d8',body);}
  if(kind==='dragonmask'){path('M4 10 9 9l5 1-2 4H6Z','#85799e');for(const x of [6,9,12])path(`M${x} 10l1 1-1 1-1-1Z`,'#c6b0d4');}
  if(kind==='ninjawrap'){rect(4,10,10,4,'#46465d',body);path('M5 11 13 13M5 13l8-2','none','#706782',.2);}
  if(kind==='starframe')for(const x of [6.5,11.5])path(`M${x} 6.5l.7 1.6 1.8.1-1.4 1.2.5 1.8-1.6-1-1.6 1 .5-1.8-1.4-1.2 1.8-.1Z`,'#e6c38c','#a47e99');
  if(kind==='butterfly'){path('M9 9Q2 3 3 10l5 2h2l5-2q1-7-6-1Z','#c6a5dd');for(const x of [6,11])ellipse(x,9,1,1,{fill:'#685779'},body);}
  if(kind==='goldmask'){path('M4 7 9 5l5 2v5l-5 3-5-3Z','#e3bc75');rect(5,8,3,1,ink,body);rect(10,8,3,1,ink,body);path('M9 7v5','none','#fff0b1',.5);}
  if(kind==='voidvisor'){rect(4,7,10,4,'#463a65',body);path('M5 9 7 8l2 2 2-2 2 1','none','#d2a7ff',.6);}
  if(kind==='plague'){path('M4 8 9 7l5 1-3 3-2 5-2-3-1-3Z','#d4c9b7');for(const x of [6,11])ellipse(x,9,1.2,1.2,{fill:'#6b6c81'},body);}
}
export function drawRPGParticle(kind,parent,{make,ellipse},color,index){
  const path=(d,fill=color,stroke='none',width=.25)=>make('path',{d,fill,stroke,'stroke-width':width},parent);
  const shape=RPG_EFFECTS[kind]?.shape;
  if(shape==='light'){ellipse(0,0,.6,.6,{fill:color},parent);ellipse(0,0,1.4,1.4,{fill:color,opacity:'.18'},parent);}
  if(shape==='petal')path('M0 2Q-3 0-1-2 2-2 1 0Z');
  if(shape==='rune'){const glyph=make('text',{x:0,y:1,'text-anchor':'middle','font-size':3,fill:color,'font-family':'serif'},parent);glyph.textContent=['ᚠ','ᚱ','ᛟ','ᛉ','ᛞ'][index%5];}
  if(shape==='bolt')path('M0-3-1.8.3-.3 0-1 3 2-.8.5-.5 1-3Z');
  if(shape==='sword'){path('M-.35-3 .35-3 .5 1-.5 1Z','#edf5ff','#b8a3e3');path('M-1 1h2M0 1v2','none','#e7c47e',.4);}
  if(shape==='feather')path('M-1 2Q-3-2 1-3 3 0-1 2M-1 2 1-2',color,'#ffda96');
  if(shape==='rift')path('M0-2 2-.5 1 2-2 .5Z','none',color,.4);
  if(shape==='butterfly'){path('M0 0Q-3-3-2 0q-2 3 2 1 4 2 2-1 1-3-2 0Z');path('M0-1v3','none','#eee4ff',.25);}
  if(shape==='bubble'){ellipse(0,0,1.3,1.3,{fill:color,'fill-opacity':'.14',stroke:color,'stroke-width':'.25'},parent);ellipse(-.4,-.4,.35,.35,{fill:'#fff'},parent);}
  if(shape==='coin'){ellipse(0,0,1,1.4,{fill:color,stroke:'#b88b47','stroke-width':'.25'},parent);path('M0-1v2','none','#fff1b5',.25);}
  if(shape==='skull'){path('M-1 1v-2q1-2 2 0v2l-.5-.2v1h-1v-1Z');for(const x of [-.5,.5])ellipse(x,-.2,.25,.3,{fill:'#467752'},parent);}
  if(shape==='crystal')path('M0-2 1-.5.5 2-.5 2-1-.5Z',color,'#edfbff');
  if(shape==='meteor'){path('M-2-3 1 0 0 1-3-2Z',color);ellipse(.2,.2,.8,.8,{fill:'#fff1c7'},parent);}
  if(shape==='dragon')path('M-2 1-1-2 1-3 .5-1 2 0 1 2 0 1-1 2Z');
  if(shape==='cross')path('M-.4-2h.8v1.5H2v.8H.4V2h-.8V.3H-2v-.8h1.6Z');
  if(shape==='raven')path('M0 0Q-3-3-3 0l2 1 1 2 1-2 2-1q0-3-3 0Z');
}
