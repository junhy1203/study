// Relative 3D inferred from RGB by MediaPipe. No measured depth or sensor APIs.
export const MESH_POINTS=Object.freeze([33,133,362,263,168,6,1,4,98,327,49,279,50,280,101,330,118,347,123,352,116,345,117,346,119,348,54,284,67,297,109,338]);
export const MESH_SIZE=MESH_POINTS.length*3;
export const MESH_THRESHOLD=.8;
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const sub=(a,b)=>a.map((value,i)=>value-b[i]);
const unit=a=>{const length=Math.hypot(...a);return length>1e-6?a.map(value=>value/length):null;};
export function validFaceShape(shape){return Array.isArray(shape)&&shape.length===MESH_SIZE&&shape.every(value=>Number.isFinite(value)&&Math.abs(value)<8)&&Math.hypot(...shape)>1;}
export function estimatedFaceShape(face,width,height){
  if(!face||!(width>0&&height>0))return null;
  const point=index=>{const p=face[index];return p&&[p.x,p.y,p.z].every(Number.isFinite)?[p.x*width,p.y*height,p.z*width]:null;};
  const indices=[...MESH_POINTS,10,152],points=new Map(indices.map(index=>[index,point(index)]));
  if([...points.values()].some(p=>!p))return null;
  const mean=(a,b)=>points.get(a).map((value,i)=>(value+points.get(b)[i])/2);
  const left=mean(33,133),right=mean(263,362),eye=sub(right,left),scale=Math.hypot(...eye),x=unit(eye);
  if(!x||scale<12)return null;
  const vertical=sub(points.get(152),points.get(10)),along=dot(vertical,x),y=unit(vertical.map((value,i)=>value-along*x[i]));
  if(!y)return null;
  const z=unit([x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]]),origin=left.map((value,i)=>(value+right[i])/2);
  if(!z)return null;
  const shape=MESH_POINTS.flatMap(index=>{const p=sub(points.get(index),origin);return [dot(p,x)/scale,dot(p,y)/scale,dot(p,z)/scale];});
  return validFaceShape(shape)?shape:null;
}
export function faceShapeScore(saved,observed){
  if(!validFaceShape(saved)||!validFaceShape(observed))return 0;
  const distances=[];
  for(let i=0;i<MESH_SIZE;i+=3)distances.push(Math.hypot(saved[i]-observed[i],saved[i+1]-observed[i+1],saved[i+2]-observed[i+2]));
  distances.sort((a,b)=>a-b);
  // Suppress a few expression/occlusion outliers without discarding the whole shape.
  const kept=distances.slice(0,Math.ceil(distances.length*.8));
  return Math.exp(-Math.sqrt(kept.reduce((sum,value)=>sum+value*value,0)/kept.length)/.25);
}
export const MESH_PREVIEW_EDGES=Object.freeze(MESH_POINTS.flatMap((index,i)=>[[index,MESH_POINTS[(i+1)%MESH_POINTS.length]],[index,168]]));
