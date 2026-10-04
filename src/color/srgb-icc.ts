// SPDX-License-Identifier: Apache-2.0

/** Original ICC v4 matrix/TRC serialization from public sRGB/ICC numeric specifications. */
import { resolveCaptureColorModel } from "./capture-color.js";
import { invertSensorColorMatrix } from "./sensor-color-development.js";
export const SRGB_ICC_PROFILE_VERSION="0.1.0" as const;
/**
 * Reference: https://registry.color.org/rgb-registry/files/sRGB.pdf and ICC.1:2022.
 * This is an original Photivra profile, not a redistributed ICC or operating-system profile.
 * Bradford here encodes the D50 profile-connection space; it does not apply shooting WB.
 */
export function createSrgbIccProfile():Uint8Array {
  const model=resolveCaptureColorModel(),d65=[model.referenceWhiteXyz.x,1,model.referenceWhiteXyz.z],d50=[.9642,1,.8249];
  const bradford=[[.8951,.2664,-.1614],[-.7502,1.7135,.0367],[.0389,-.0685,1.0296]];
  const lms=(v:readonly number[]):number[]=>bradford.map(row=>row.reduce((sum,x,i)=>sum+x*v[i]!,0));
  const a=lms(d65),b=lms(d50),inverse=invertSensorColorMatrix(bradford);
  const chad=inverse.map(row=>[0,1,2].map(j=>row.reduce((sum,x,i)=>sum+x*b[i]!/a[i]!*bradford[i]![j]!,0)));
  const colorants=chad.map(row=>[0,1,2].map(j=>row.reduce((sum,x,i)=>sum+x*model.cameraRgbToXyz[i]![j]!,0)));
  const signature=(value:string):Uint8Array=>new TextEncoder().encode(value);
  function xyz(v:readonly number[]):Uint8Array {
    const bytes=new Uint8Array(20),view=new DataView(bytes.buffer);bytes.set(signature("XYZ "));
    v.forEach((x,i)=>view.setInt32(8+4*i,Math.round(x*65536),false));return bytes;
  }
  function text(value:string):Uint8Array {
    const bytes=new Uint8Array(28+2*value.length),view=new DataView(bytes.buffer);bytes.set(signature("mluc"));
    view.setUint32(8,1,false);view.setUint32(12,12,false);bytes.set(signature("enUS"),16);view.setUint32(20,value.length*2,false);view.setUint32(24,28,false);
    for(let i=0;i<value.length;i++)view.setUint16(28+2*i,value.charCodeAt(i),false);return bytes;
  }
  const curve=new Uint8Array(40),cv=new DataView(curve.buffer);curve.set(signature("para"));cv.setUint16(8,4,false);
  [2.4,1/1.055,.055/1.055,1/12.92,.04045,0,0].forEach((x,i)=>cv.setInt32(12+4*i,Math.round(x*65536),false));
  const adaptation=new Uint8Array(44),av=new DataView(adaptation.buffer);adaptation.set(signature("sf32"));chad.flat().forEach((x,i)=>av.setInt32(8+4*i,Math.round(x*65536),false));
  const tags:[string,Uint8Array][]=[
    ["desc",text("Photivra sRGB matrix/TRC v4")],["cprt",text("Copyright Photivra contributors. Apache-2.0.")],
    ["wtpt",xyz(d50)],["rXYZ",xyz(colorants.map(row=>row[0]!))],["gXYZ",xyz(colorants.map(row=>row[1]!))],["bXYZ",xyz(colorants.map(row=>row[2]!))],
    ["rTRC",curve],["gTRC",curve],["bTRC",curve],["chad",adaptation]
  ];
  const aligned=(n:number):number=>Math.ceil(n/4)*4;
  const size=132+12*tags.length+tags.reduce((sum,[,bytes])=>sum+aligned(bytes.length),0);
  const output=new Uint8Array(size),view=new DataView(output.buffer);view.setUint32(0,size,false);view.setUint32(8,0x04300000,false);
  output.set(signature("mntr"),12);output.set(signature("RGB "),16);output.set(signature("XYZ "),20);
  [2000,1,1,0,0,0].forEach((x,i)=>view.setUint16(24+2*i,x,false));output.set(signature("acsp"),36);
  view.setUint32(64,1,false);d50.forEach((x,i)=>view.setInt32(68+4*i,Math.round(x*65536),false));output.set(signature("PHTV"),80);
  view.setUint32(128,tags.length,false);let offset=132+12*tags.length;
  tags.forEach(([name,bytes],i)=>{const p=132+12*i;output.set(signature(name),p);view.setUint32(p+4,offset,false);view.setUint32(p+8,bytes.length,false);output.set(bytes,offset);offset+=aligned(bytes.length);});
  return output;
}
