import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createIsolatedFaceDescriber} from '../face-descriptor-client.js';

test('descriptor worker preserves pixels, tensor input, output node and all 1024 features',async()=>{
  const source=await readFile(new URL('../face-descriptor-worker.js',import.meta.url),'utf8');
  const output=[],disposed=[],values=Float32Array.from({length:1024},(_,i)=>i/1024);
  const input={toFloat(){return this;},expandDims(axis){assert.equal(axis,0);return this;},dispose(){disposed.push('input');}};
  const pixels=new Uint8ClampedArray(224*224*4);pixels[100]=123;
  const tf={wasm:{setWasmPaths(){}},setBackend:async()=>true,ready:async()=>{},tidy:fn=>fn(),
    browser:{fromPixels:image=>{assert.equal(image.width,224);assert.equal(image.height,224);assert.equal(image.data,pixels);return input;}},
    loadGraphModel:async url=>{assert.equal(url,'unchanged-model');return {execute:(tensor,node)=>{
      assert.equal(tensor,input);assert.equal(node,'global_pooling/Mean');
      return {data:async()=>values,dispose(){disposed.push('descriptor');}};
    }};}};
  const self={tf,postMessage:(message,transfer)=>output.push({message,transfer})};
  const context=vm.createContext({self,importScripts(){},ImageData:class{constructor(data,width,height){Object.assign(this,{data,width,height});}},Float32Array});
  vm.runInContext(source,context);
  await self.onmessage({data:{type:'init',id:1,model:'unchanged-model'}});
  await self.onmessage({data:{type:'describe',id:2,image:{data:pixels,width:224,height:224}}});
  assert.deepEqual(output[1].message.values,values);
  assert.equal(output[1].transfer[0],output[1].message.values.buffer);
  assert.deepEqual(disposed,['input','descriptor']);
});

test('isolated descriptor client falls back on startup failure and rejects work on close',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');
  let worker,terminated=0,failInit=true;
  globalThis.Worker=class{
    constructor(){worker=this;}
    postMessage(data){if(data.type==='init')queueMicrotask(()=>this.onmessage({data:{id:data.id,...(failInit?{error:'unsupported'}:{})}}));}
    terminate(){terminated++;}
  };
  try{
    assert.equal(await createIsolatedFaceDescriber('model'),null);assert.equal(terminated,1);
    failInit=false;
    const client=await createIsolatedFaceDescriber('model');
    const first=client.describe({width:224});
    worker.onmessage({data:{id:2,values:new Float32Array(1024)}});
    assert.equal((await first).length,1024);
    const pending=client.describe({width:224});client.close();
    await assert.rejects(pending,/종료/);await assert.rejects(client.describe({}),/종료/);
    assert.equal(terminated,2);
  }finally{if(previous)Object.defineProperty(globalThis,'Worker',previous);else delete globalThis.Worker;}
});
