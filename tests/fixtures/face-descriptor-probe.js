// Public synthetic pixels only: compare the exact model across worker boundaries.
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/tf-backend-wasm.js');
self.onmessage=async()=>{
  let isolated,model;
  try{
    tf.wasm.setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/');
    await tf.setBackend('wasm');await tf.ready();
    const url='https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/faceres.json';
    const {createIsolatedFaceDescriber}=await import('/face-descriptor-client.js');
    const {lightingNormalizedFace}=await import('/camera-identity.js');
    isolated=await createIsolatedFaceDescriber(url);
    if(!isolated)throw Error('Nested worker unavailable');
    model=await tf.loadGraphModel(url);
    const canvas=new OffscreenCanvas(224,224),context=canvas.getContext('2d');
    const gradient=context.createLinearGradient(0,0,224,224);gradient.addColorStop(0,'#2d5267');gradient.addColorStop(1,'#e6ab92');
    context.fillStyle=gradient;context.fillRect(0,0,224,224);
    context.fillStyle='#383533';context.fillRect(65,75,25,15);context.fillRect(140,75,25,15);context.fillRect(80,145,65,15);
    const image=context.getImageData(0,0,224,224);let maxDifference=0,ticks=0;
    for(const frame of [image,lightingNormalizedFace(image)]){
      const pixels=new ImageData(frame.data,frame.width,frame.height);
      const input=tf.tidy(()=>tf.browser.fromPixels(pixels).toFloat().expandDims(0));
      const output=model.execute(input,'global_pooling/Mean');
      const expected=await output.data();
      const timer=setInterval(()=>ticks++,10);
      let actual;
      try{actual=await isolated.describe(frame);}finally{clearInterval(timer);}
      if(actual.length!==expected.length)throw Error('Descriptor length changed');
      for(let i=0;i<actual.length;i++)maxDifference=Math.max(maxDifference,Math.abs(actual[i]-expected[i]));
      input.dispose();output.dispose();
    }
    self.postMessage({maxDifference,ticks,views:2,featuresPerView:1024});
  }catch(error){self.postMessage({error:error.message});}
  finally{isolated?.close();model?.dispose();}
};
