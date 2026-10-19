// SPDX-License-Identifier: Apache-2.0
import { portablePow } from "../core/portable-math.js";
/** Internal sRGB transfer function for one component. Shared by SDR rendering and the staged Print filter. */
export function encodeSrgbComponent(sample:number):number {
  return sample===1?1:sample<=.0031308?sample*12.92:1.055*sample**(1/2.4)-.055;
}
/**
 * The same sRGB transfer function with the engine's portable power function (`portablePow`, within 1 ulp of the
 * exact power) instead of `**`, so the result has the same bits in every JavaScript engine. Used by the display
 * view; captures keep `encodeSrgbComponent`.
 */
export function encodeSrgbComponentPortable(sample:number):number {
  return sample===1?1:sample<=.0031308?sample*12.92:1.055*portablePow(sample,1/2.4)-.055;
}
export function decodeSrgbComponent(sample:number):number {
  return sample===1?1:sample<=.04045?sample/12.92:((sample+.055)/1.055)**2.4;
}
