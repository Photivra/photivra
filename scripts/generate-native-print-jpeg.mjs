// SPDX-License-Identifier: Apache-2.0
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import process from 'node:process';
import {setTimeout} from 'node:timers';
import {performance} from 'node:perf_hooks';
import {createPrintJpegTask,createSrgbIccProfile} from '../dist/index.js';
const folder=process.argv[2];if(!folder)throw Error('Output directory required.');mkdirSync(folder,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const cases=[];
for(const spec of [
 {id:'native-color',width:32,height:24,crop:{x:0,y:0,width:32,height:24},outputWidth:32,outputHeight:24,pattern:'color'},
 {id:'linear-area-checker',width:16,height:16,crop:{x:0,y:0,width:16,height:16},outputWidth:8,outputHeight:8,pattern:'checker'},
 {id:'fractional-asymmetric-crop',width:33,height:25,crop:{x:1,y:2,width:31,height:21},outputWidth:11,outputHeight:7,pattern:'color'},
 {id:'gray-ramp',width:256,height:1,crop:{x:0,y:0,width:256,height:1},outputWidth:256,outputHeight:1,pattern:'gray'},
 {id:'megapixel-native',width:1000,height:1000,crop:{x:0,y:0,width:1000,height:1000},outputWidth:1000,outputHeight:1000,pattern:'color'}
]){
 const pixel=(x,y)=>spec.pattern==='checker'?Array(3).fill((x+y)%2*255):spec.pattern==='gray'?[x,x,x]:[Math.floor(x/(spec.width-1)*255+.5),Math.floor(y/(spec.height-1)*255+.5),(x+y)%2*255];
 const sourceBytes=Uint8Array.from(Array.from({length:spec.width*spec.height},(_,i)=>pixel(i%spec.width,Math.floor(i/spec.width))).flat());
 const input={source:{captureId:spec.id,imageStateId:'owned-encoded-srgb-control',artifactId:spec.id+'-source',sha256:sha(sourceBytes),width:spec.width,height:spec.height,encoding:'encoded-srgb-8-rgb'},crop:spec.crop,outputWidth:spec.outputWidth,outputHeight:spec.outputHeight,quantizationStep:1,maximumEncodedBytes:16_000_000,maximumProviderReads:1_000_000};
 const task=createPrintJpegTask(input,{readTile:async request=>{
  const samples=new Uint8Array(request.width*request.height*3);for(let y=0;y<request.height;y++)for(let x=0;x<request.width;x++)samples.set(pixel(request.x+x,request.y+y),(y*request.width+x)*3);return {...request,samples};
 },yieldControl:async()=>{await new Promise(done=>setTimeout(done,0));}});
 const start=performance.now();await task.run();const output=task.takeOutput();writeFileSync(folder+'/'+spec.id+'.jpg',output.bytes);
 cases.push({spec,input,jpegSha256:sha(output.bytes),encodedBytes:output.bytes.length,providerReads:output.providerReads,elapsedMs:performance.now()-start});
 process.stdout.write(JSON.stringify({id:spec.id,encodedBytes:output.bytes.length})+'\n');
}
writeFileSync(folder+'/srgb.icc',createSrgbIccProfile());
writeFileSync(folder+'/manifest.json',JSON.stringify({schemaVersion:'0.1.0',cases,iccSha256:sha(createSrgbIccProfile()),generatorSha256:sha(readFileSync('scripts/generate-native-print-jpeg.mjs')),scope:'Original encoded sRGB controls through actual bounded area filter/JPEG/ICC bytes; not calibrated source capture, printer/substrate appearance or platform save/share.'},null,2)+'\n');
