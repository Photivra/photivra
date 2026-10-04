// SPDX-License-Identifier: Apache-2.0
import {expect,it} from "vitest";
import {calculateSensorApertureRays,type CalculateSensorApertureRaysInput} from "../src/index.js";
const input=():CalculateSensorApertureRaysInput=>({sourcePointNativeSensorMm:{x:8,y:3},focalLengthMm:50,nominalFNumber:2,
 focus:{kind:"finite",distanceM:4},angularVelocityRadPerSec:{pitch:0,yaw:0,roll:0},timeSecondsFromOpeningReference:0,
 pupil:{kind:"ideal-uniform-circular-pupil",radialSampleCount:4,angularSampleCount:16,evidence:[{sourceOrigin:"photivra",sourceReference:"test:owned-pupil",reuseStatus:"photivra-owned"}],limitation:"Constructed ideal geometric reference, no measured lens."}});
it("all off-axis pupil rays intersect the independently derived finite focus point",()=>{
 const v=calculateSensorApertureRays(input()).value;
 const imageDistance=50*4000/(4000-50),target={x:8*4/imageDistance,y:-3*4/imageDistance,z:4};
 expect(v.projectionDistanceMm).toBe(imageDistance);expect(v.pupilRadiusMm).toBe(12.5);
 let weight=0,xMean=0,yMean=0,r2=0;
 for(const ray of v.rays){
  const t=(4-ray.originM.z)/ray.directionUnitVector.z;
  expect(ray.originM.x+t*ray.directionUnitVector.x).toBeCloseTo(target.x,14);
  expect(ray.originM.y+t*ray.directionUnitVector.y).toBeCloseTo(target.y,14);
  expect(Math.hypot(...Object.values(ray.directionUnitVector))).toBeCloseTo(1,14);
  weight+=ray.weight;xMean+=ray.weight*ray.pupilPointMm.x;yMean+=ray.weight*ray.pupilPointMm.y;
  r2+=ray.weight*(ray.pupilPointMm.x**2+ray.pupilPointMm.y**2);
 }
 expect(weight).toBe(1);expect(xMean).toBeCloseTo(0,14);expect(yMean).toBeCloseTo(0,14);expect(r2).toBeCloseTo(12.5**2/2,12);
 expect(v.apertureAreaApplied).toBe(false);expect(v.sceneVisibilityCalculated).toBe(false);
});
it.each([3,6])("defocus footprint on depth %s agrees with an independent Gaussian-lens derivation",depth=>{
 const v=calculateSensorApertureRays(input()).value,radius=12.5/1000;
 for(const ray of v.rays){
  const t=depth/ray.directionUnitVector.z;
  const px=ray.originM.x+t*ray.directionUnitVector.x,py=ray.originM.y+t*ray.directionUnitVector.y;
  const cx=8*depth/v.projectionDistanceMm,cy=-3*depth/v.projectionDistanceMm;
  expect(px-cx).toBeCloseTo(ray.originM.x*(1-depth/4),14);
  expect(py-cy).toBeCloseTo(ray.originM.y*(1-depth/4),14);
  expect(Math.hypot(px-cx,py-cy)).toBeLessThan(radius*Math.abs(1-depth/4));
 }
});
it("infinity rays are parallel, preserve native Y inversion and retain pupil origins",()=>{
 const x=input();x.focus={kind:"infinity"};const v=calculateSensorApertureRays(x).value;
 for(const ray of v.rays){expect(ray.directionUnitVector).toEqual(v.rays[0]!.directionUnitVector);expect(ray.directionUnitVector.y).toBeLessThan(0);}
 expect(v.rays[0]!.originM).not.toEqual(v.rays[1]!.originM);
});
it("pure yaw rotates origins and rays coherently using the opening-reference axes",()=>{
 const x=input();x.angularVelocityRadPerSec.yaw=.4;x.timeSecondsFromOpeningReference=.2;
 const rotated=calculateSensorApertureRays(x).value;x.angularVelocityRadPerSec.yaw=0;const original=calculateSensorApertureRays(x).value;
 const angle=.08;
 for(let i=0;i<original.rays.length;i++)for(const key of ['originM','directionUnitVector'] as const){
  const a=original.rays[i]![key],b=rotated.rays[i]![key];
  expect(b.x).toBeCloseTo(a.x*Math.cos(angle)+a.z*Math.sin(angle),14);
  expect(b.y).toBe(a.y);expect(b.z).toBeCloseTo(a.z*Math.cos(angle)-a.x*Math.sin(angle),14);
 }
});
it.each(['count','evidence','kind','limit','zero-aperture','nan-point','bad-focus','negative-time','overflow'])('rejects malformed %s',fault=>{
 const x=input();if(fault==='count')x.pupil.radialSampleCount=0;if(fault==='evidence')x.pupil.evidence=[];
 if(fault==='kind')Object.assign(x.pupil,{kind:'unknown'});if(fault==='limit')x.pupil.angularSampleCount=65;
 if(fault==='zero-aperture')x.nominalFNumber=0;if(fault==='nan-point')x.sourcePointNativeSensorMm.x=NaN;
 if(fault==='bad-focus')x.focus={kind:'finite',distanceM:.04};if(fault==='negative-time')x.timeSecondsFromOpeningReference=-1;
 if(fault==='overflow')x.nominalFNumber=Number.MIN_VALUE;
 expect(()=>calculateSensorApertureRays(x)).toThrow();
});
it("returned evidence and geometry own their copies without freezing caller data",()=>{
 const x=input(),r=calculateSensorApertureRays(x).value;x.pupil.evidence[0]!.sourceReference='changed';
 expect(r.pupil.evidence[0]!.sourceReference).not.toBe('changed');expect(Object.isFrozen(x.pupil)).toBe(false);
});
