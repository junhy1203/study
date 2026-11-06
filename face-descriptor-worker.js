// Nested worker: expensive TF kernels must not stall live landmark tracking.
let model;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
      let accelerated=false;
      try{
        importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/tf-backend-wasm.js');
        self.tf.wasm.setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/');
        accelerated=await self.tf.setBackend('wasm');
      }catch{}
      if(!accelerated)await self.tf.setBackend('cpu');
      await self.tf.ready();
      model=await self.tf.loadGraphModel(data.model);
      self.postMessage({id:data.id});
    }else if(data.type==='describe'){
      const image=new ImageData(data.image.data,data.image.width,data.image.height);
      const input=self.tf.tidy(()=>self.tf.browser.fromPixels(image).toFloat().expandDims(0));
      let descriptor;
      try{
        descriptor=model.execute(input,'global_pooling/Mean');
        const values=new Float32Array(await descriptor.data());
        if(values.length!==1024)throw new Error('얼굴 모델 특징 크기가 올바르지 않습니다.');
        self.postMessage({id:data.id,values},[values.buffer]);
      }finally{input.dispose();descriptor?.dispose();}
    }
  }catch(error){self.postMessage({id:data.id,error:error.message||String(error)});}
};
