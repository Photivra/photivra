// SPDX-License-Identifier: Apache-2.0
import {describe,it,expect} from "vitest";
import {createNativeRawTask,createNativeRawDevelopmentTask,type NativeRawDevelopmentInput,type NativeRawOutput,type NativeRawTile,type NativeRawTileRequest} from "../src/index.js";
import {createNativeRawTaskWithCadence} from "../src/capture/native-raw.js";
import {createNativeRawDevelopmentTaskWithCadence} from "../src/capture/native-raw-development.js";
import {HOST_YIELD_BUDGET_MILLISECONDS,createHostYieldGate,type HostYieldCadence} from "../src/capture/host-yield-cadence.js";
import {nativeRawFixture} from "./helpers/native-raw-fixture.js";
import {loadPhotographicExportInput} from "./helpers/photographic-export-fixture.js";

/** A clock that advances one millisecond per read: with budget N it yields every N gate checks. */
function stepClock(budgetMilliseconds:number):HostYieldCadence {let t=0;return {budgetMilliseconds,now:()=>t++};}
const cadences=():[string,HostYieldCadence|undefined][]=>[
  ["every tile",{budgetMilliseconds:0,now:()=>0}],
  ["every 2 checks",stepClock(2)],
  ["every 5 checks",stepClock(5)],
  ["final tile only",{budgetMilliseconds:Number.POSITIVE_INFINITY,now:()=>0}],
  ["default time budget",undefined]
];
const fields=["codes","blackLevels","digitalSaturationCodes","saturationFlags"] as const;

async function runRaw(width:number,cadence:HostYieldCadence|undefined):Promise<{out:NativeRawOutput;requests:NativeRawTileRequest[];yields:number;tiles:number;tileCount:number}> {
  const f=nativeRawFixture(259,2);f.input.exposure.noise.seedUint32=0xffffffff;
  const requests:NativeRawTileRequest[]=[];let yields=0;
  const provider={readTile:async(r:NativeRawTileRequest,s:AbortSignal):Promise<NativeRawTile>=>{requests.push({...r});return f.provider.readTile(r,s);},
    yieldControl:async():Promise<void>=>{yields++;}};
  const input={...f.input,tileWidth:width};
  const task=cadence===undefined?createNativeRawTask(input,provider):createNativeRawTaskWithCadence(input,provider,cadence);
  await task.run();return {out:task.takeOutput(),requests,yields,tiles:task.completedTileCount,tileCount:task.plan.tileCount};
}

describe("native host-yield cadence (#275)",()=>{
  it("keeps the yield budget well under a 60 Hz frame and restarts it after each yield",()=>{
    expect(HOST_YIELD_BUDGET_MILLISECONDS).toBeGreaterThan(0);expect(HOST_YIELD_BUDGET_MILLISECONDS).toBeLessThanOrEqual(16);
    let t=0;const gate=createHostYieldGate({budgetMilliseconds:8,now:()=>t});
    expect(gate.due()).toBe(false);t=7.99;expect(gate.due()).toBe(false);t=8;expect(gate.due()).toBe(true);
    gate.restart();expect(gate.due()).toBe(false);t=16;expect(gate.due()).toBe(true);
  });

  it("produces identical native RAW output, tile requests and seeds for every yield cadence",async()=>{
    for(const width of [3,256]){
      const baseline=await runRaw(width,{budgetMilliseconds:0,now:()=>0});
      expect(baseline.yields).toBe(baseline.tileCount);
      for(const [name,cadence] of cadences()){
        const run=await runRaw(width,cadence);
        for(const field of fields)expect(run.out[field],name+" "+field).toEqual(baseline.out[field]);
        expect(run.requests,name).toEqual(baseline.requests);
        expect(run.tiles).toBe(run.tileCount);
        expect(run.yields).toBeGreaterThanOrEqual(1);expect(run.yields).toBeLessThanOrEqual(run.tileCount);
        if(name==="final tile only")expect(run.yields).toBe(1);
        if(name==="every 5 checks")expect(run.yields).toBeLessThan(run.tileCount);
      }
    }
  },60_000);

  it("honours cancellation at the first host yield and reads no further tile",async()=>{
    const f=nativeRawFixture(259,3);let reads=0;
    // stepClock(4): the gate start reads t=0; tile k's check reads t=k, so the first yield follows tile 4.
    const task=createNativeRawTaskWithCadence({...f.input,tileWidth:3},{readTile:async(r,s):Promise<NativeRawTile>=>{reads++;return f.provider.readTile(r,s);},
      yieldControl:async():Promise<void>=>{task.cancel();}},stepClock(4));
    await expect(task.run()).rejects.toThrow("aborted");
    expect(task.completedTileCount).toBe(4);expect(reads).toBe(4);expect(task.state).toBe("cancelled");expect(()=>task.takeOutput()).toThrow();
  });

  it("lets a real host timer cancel slow tiles within the default time budget",async()=>{
    const f=nativeRawFixture(259,3);let reads=0,readsAfterCancel=0,cancelled=false,yields=0;
    const task=createNativeRawTask({...f.input,tileWidth:1},{
      readTile:async(r,s):Promise<NativeRawTile>=>{reads++;if(cancelled)readsAfterCancel++;
        const until=performance.now()+1;while(performance.now()<until){/* simulate ~1 ms of tile work */}return f.provider.readTile(r,s);},
      yieldControl:async():Promise<void>=>{yields++;await new Promise<void>(done=>setTimeout(done,0));}});
    setTimeout(()=>{cancelled=true;task.cancel();},0);
    await expect(task.run()).rejects.toThrow();
    expect(task.state).toBe("cancelled");expect(yields).toBe(1);expect(readsAfterCancel).toBe(0);
    // The first yield is due after about 8 ms of ~1 ms tiles, far before all 777 tiles.
    expect(reads).toBeGreaterThanOrEqual(1);expect(reads).toBeLessThan(task.plan.tileCount);
  },60_000);

  it("produces identical developed SDR output for every yield cadence and cancels at a budgeted yield",async()=>{
    const width=514,height=2,f=nativeRawFixture(width,height),exportInput=loadPhotographicExportInput();
    const acquisition=createNativeRawTask(f.input,f.provider);await acquisition.run();const raw=acquisition.takeOutput();
    const input=():NativeRawDevelopmentInput=>({raw:{...raw,codes:raw.codes.slice(),blackLevels:raw.blackLevels.slice(),digitalSaturationCodes:raw.digitalSaturationCodes.slice(),saturationFlags:raw.saturationFlags.slice(),effectiveSaturationCodes:raw.effectiveSaturationCodes.slice()},
      phaseProfiles:exportInput.reconstruction.phaseProfiles,colorProfile:exportInput.colorProfile,whiteBalance:exportInput.whiteBalance,rendering:exportInput.rendering,maximumRetainedPayloadBytes:width*height*10});
    const develop=async(cadence:HostYieldCadence|undefined):Promise<{samples:number[];diagnostics:unknown;yields:number}>=>{
      let yields=0;const y=async():Promise<void>=>{yields++;};
      const task=cadence===undefined?createNativeRawDevelopmentTask(input(),y):createNativeRawDevelopmentTaskWithCadence(input(),y,cadence);
      await task.run();const out=task.takeOutput();return {samples:Array.from(out.integerSamples),diagnostics:out.diagnostics,yields};
    };
    const baseline=await develop({budgetMilliseconds:0,now:()=>0});
    // One budgeted integrity chunk plus every output tile.
    expect(baseline.yields).toBe(1+Math.ceil(width/256)*height);
    for(const [name,cadence] of cadences()){
      const run=await develop(cadence);
      expect(run.samples,name).toEqual(baseline.samples);expect(run.diagnostics,name).toEqual(baseline.diagnostics);
      expect(run.yields).toBeGreaterThanOrEqual(1);expect(run.yields).toBeLessThanOrEqual(baseline.yields);
      if(name==="final tile only")expect(run.yields).toBe(1);
    }
    let yields=0;
    const task=createNativeRawDevelopmentTaskWithCadence(input(),async():Promise<void>=>{yields++;task.cancel();},stepClock(2));
    await expect(task.run()).rejects.toThrow("aborted");expect(yields).toBe(1);expect(task.state).toBe("cancelled");expect(()=>task.takeOutput()).toThrow();
  },60_000);
});
