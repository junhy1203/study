import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createReadCache,statsRevision} from '../client-cache.js';
const source=await readFile(new URL('../data.js',import.meta.url),'utf8');
test('purchase receipt updates cached Focus Time immediately and ignores another account',()=>{
  const fn=source.slice(source.indexOf('function applyFocusReceipt('),source.indexOf("window.addEventListener('study:focus-purchase'"));
  const state={profile:{studyRevision:5,focusRevision:2},focusTime:{balanceSeconds:356400},pending:new Set(['focusTime']),failed:new Set(['focusTime'])},cache=createReadCache({storage:null});let paints=0;
  const context=vm.createContext({getAuthUser:()=>({uid:'owner'}),state,readCache:cache,statsRevision,dateKey:()=> '2026-11-04',paint:()=>paints++,focusReceiptEpoch:0});
  vm.runInContext(`${fn}\nglobalThis.apply=applyFocusReceipt;`,context);
  context.apply({uid:'other',balanceSeconds:0});assert.equal(state.focusTime.balanceSeconds,356400);
  context.apply({uid:'owner',balanceSeconds:324000});assert.equal(state.focusTime.balanceSeconds,324000);assert.equal(state.pending.has('focusTime'),false);assert.equal(state.failed.has('focusTime'),false);assert.equal(paints,1);
  assert.equal(cache.get('owner:stats:wallet-v3:2026-11-04:7::focusTime').balanceSeconds,324000);assert.equal(context.focusReceiptEpoch,1);
  assert.equal(statsRevision({studyRevision:5,focusRevision:3},'focusTime'),8);
  assert.equal(statsRevision({studyRevision:5,focusRevision:3},'ranking'),5,'shopping never invalidates study ranking revisions');
});
test('an older in-flight Focus Time read cannot overwrite a newly completed purchase',async()=>{
  const fn=source.slice(source.indexOf('async function loadVisibleData()'),source.indexOf('async function connectUser()'));
  let deliver;const pending=new Promise(resolve=>deliver=resolve),cache=createReadCache({storage:null});
  const state={profile:{studyRevision:0},pending:new Set(),failed:new Set(),focusTime:{balanceSeconds:356400}};
  const context=vm.createContext({sdk:{doc:()=>({}),getDoc:()=>pending},db:{},connectedUid:'owner',generation:1,state,document:{hidden:false},dateKey:()=> '2026-11-04',monday:()=> '2026-11-02',statsRevision,readCache:cache,visibleDataKeys:()=>new Set(['focusTime']),dataRequests:new Map(),focusReceiptEpoch:0,paint(){},notice(){},errorText:String});
  vm.runInContext(`${fn}\nglobalThis.load=loadVisibleData;`,context);const loading=context.load();
  context.focusReceiptEpoch++;state.focusTime.balanceSeconds=324000;
  deliver({data:()=>({balanceSeconds:356400})});await loading;
  assert.equal(state.focusTime.balanceSeconds,324000);assert.equal(cache.get('owner:stats:wallet-v3:2026-11-04:0::focusTime'),undefined);
});
