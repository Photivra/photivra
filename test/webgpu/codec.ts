// SPDX-License-Identifier: Apache-2.0
/** JSON transport with typed arrays as base64, shared by the Node driver and the browser page runner. */
const TYPES = { Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array } as const;
type TypedName = keyof typeof TYPES;

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeTransport(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    for (const name of Object.keys(TYPES) as TypedName[]) {
      if (v instanceof TYPES[name]) {
        const view = v as ArrayBufferView;
        return { $typed: name, data: toBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) };
      }
    }
    return v;
  });
}

export function decodeTransport<T>(text: string): T {
  return JSON.parse(text, (_key, v: unknown) => {
    if (v && typeof v === "object" && "$typed" in v && "data" in v) {
      const { $typed, data } = v as { $typed: TypedName; data: string };
      const bytes = fromBase64(data), Type = TYPES[$typed];
      return new Type(bytes.buffer, 0, bytes.byteLength / Type.BYTES_PER_ELEMENT);
    }
    return v;
  }) as T;
}
