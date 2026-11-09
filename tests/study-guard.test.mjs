import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudyGuard} from '../study-guard.js';
import {checkpointCamera} from '../functions/domain.js';

function setup(){
  const target=()=>{const handlers=new Map();return {addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},
    removeEventListener(type,fn){handlers.get(type)?.delete(fn);},emit(type){for(const fn of [...(handlers.get(type)||[])])fn();},count(){return [...handlers.values()].reduce((n,set)=>n+set.size,0);}};};
  const win=Object.assign(target(),{screen:{width:390,height:844},innerWidth:390,innerHeight:700,visualViewport:Object.assign(target(),{width:390,height:700})});
  const doc=Object.assign(target(),{hidden:false,hasFocus:()=>true});
  let time=0,poll;const changes=[];
  win.setInterval=fn=>{poll=fn;return 1;};win.clearInterval=()=>{poll=null;};
  const guard=createStudyGuard({window:win,document:doc,now:()=>time,onChange:state=>changes.push(state)});
  return {win,doc,guard,changes,tick(ms=500){time+=ms;poll?.();}};
}

test('iOS Safari and Android: hidden app, tab and lock pause immediately; focus is independent',()=>{
  const {guard,doc,win}=setup();guard.start();
  doc.hidden=true;doc.emit('visibilitychange');assert.equal(guard.reason,'hidden');
  doc.hidden=false;doc.emit('visibilitychange');assert.equal(guard.blocked,false);
  win.emit('blur');assert.equal(guard.reason,'blur');
  doc.emit('visibilitychange');assert.equal(guard.blocked,true);
  win.emit('focus');assert.equal(guard.blocked,false);
  win.emit('pagehide');assert.equal(guard.blocked,true);
  win.emit('pageshow');assert.equal(guard.blocked,false);
});

test('split screen pauses even when screen dimensions still describe the full device',()=>{
  const {guard,win}=setup();guard.start();
  win.visualViewport.width=195;win.visualViewport.emit('resize');assert.equal(guard.reason,'ratio');
  win.visualViewport.width=390;win.visualViewport.emit('resize');assert.equal(guard.blocked,false);
  win.visualViewport.height=500;win.visualViewport.emit('resize');assert.equal(guard.reason,'ratio','no keyboard or toolbar exception');
});

test('screen rotation and screen ratio changes pause; fractional rounding is tolerated',()=>{
  const {guard,win}=setup();guard.start();
  win.visualViewport.width=390.3;win.visualViewport.emit('resize');assert.equal(guard.blocked,false);
  win.screen.width=844;win.screen.height=390;win.emit('orientationchange');assert.equal(guard.reason,'ratio');
});

test('layout viewport fallback works without VisualViewport API',()=>{
  const {guard,win}=setup();delete win.visualViewport;guard.start();
  win.innerWidth=200;win.emit('resize');assert.equal(guard.reason,'ratio');
});

test('every start owns a new baseline; stop erases state and listeners; tabs remain isolated',()=>{
  const first=setup(),second=setup();first.guard.start();second.guard.start();
  first.win.visualViewport.width=200;first.win.emit('resize');assert.equal(first.guard.blocked,true);assert.equal(second.guard.blocked,false);
  first.guard.stop();assert.equal(first.guard.active,false);assert.equal(first.guard.reason,null);assert.equal(first.guard.pauseAt,null);
  assert.equal(first.win.count()+first.doc.count()+first.win.visualViewport.count(),0);
  first.guard.start();assert.equal(first.guard.blocked,false,'new run uses its own current dimensions');
  first.guard.start();assert.equal(first.win.count(),6,'restart replaces handlers instead of duplicating them');
});

test('suspended event loop pauses at the last observed time instead of crediting the missing interval',()=>{
  const {guard,tick}=setup();guard.start();tick(500);tick(7000);
  assert.equal(guard.reason,'gap');assert.equal(guard.pauseAt,500);
  tick();assert.equal(guard.blocked,false,'recovery requires the camera to verify fresh frames');
});

test('unavailable geometry refuses a new baseline and never overwrites with invalid data',()=>{
  const {guard,win}=setup();win.visualViewport.width=0;
  assert.throws(()=>guard.start(),/화면 크기/);assert.equal(guard.active,false);
});

test('delayed server pause caps both total and hourly credit at the observed interruption',()=>{
  const session={startedAtMs:100000,activeSinceMs:100000,leaseUntilMs:110000};
  const paused=checkpointCamera(session,109000,false,undefined,103000);
  assert.equal(paused.accumulatedSeconds,3);assert.equal(paused.activeSinceMs,null);
  assert.equal(Object.values(paused.hourlySeconds).flatMap(Object.values).reduce((a,b)=>a+b,0),3);
  const future=checkpointCamera(session,120000,false,undefined,999999);
  assert.equal(future.accumulatedSeconds,10,'a submitted cutoff cannot extend the server lease');
  const resumed=checkpointCamera({...session,...paused},120000,true);
  assert.equal(resumed.accumulatedSeconds,3);assert.equal(resumed.activeSinceMs,120000);
});
