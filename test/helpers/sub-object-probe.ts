// SPDX-License-Identifier: Apache-2.0

import {
  InvalidConfigurationError,
  InvalidScientificInputError,
  InvalidScientificResultError
} from "../../src/index.js";

/**
 * "Valid input minus one sub-object" probe. Starting from an input the function accepts, each nested
 * plain object (and the first element of each array of objects) is in turn set to null, removed, or
 * replaced by a number. The function must reject or accept each variant with a domain error class,
 * never a raw TypeError or RangeError from reading a property of a missing object.
 *
 * Returns the escaped errors as "path [variant] Class: message" strings (empty when clean) and the
 * number of probed paths.
 */
export async function probeSubObjects(
  call: (input: unknown) => unknown, validInput: object, options: { maximumDepth?: number; include?: (path: string) => boolean } = {}
): Promise<{ probedPaths: number; escaped: string[] }> {
  const maximumDepth = options.maximumDepth ?? 6;
  const isPlain = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer);
  const paths: (string | number)[][] = [];
  const walk = (value: unknown, prefix: (string | number)[], depth: number): void => {
    if (depth > maximumDepth) return;
    if (Array.isArray(value)) {
      if (value.length > 0 && isPlain(value[0])) { paths.push([...prefix, 0]); walk(value[0], [...prefix, 0], depth + 1); }
      return;
    }
    if (!isPlain(value)) return;
    for (const key of Object.keys(value)) {
      if (isPlain(value[key])) { paths.push([...prefix, key]); walk(value[key], [...prefix, key], depth + 1); }
    }
  };
  walk(validInput, [], 0);
  const mutate = (path: (string | number)[], variant: "null" | "delete" | "number"): unknown => {
    const copy = (value: unknown): Record<string | number, unknown> =>
      (Array.isArray(value) ? [...value] : { ...(value as object) }) as Record<string | number, unknown>;
    const top = copy(validInput);
    let current = top;
    for (const key of path.slice(0, -1)) { const next = copy(current[key]); current[key] = next; current = next; }
    const last = path[path.length - 1]!;
    if (variant === "delete") {
      if (Array.isArray(current)) (current as unknown[]).splice(last as number, 1); else delete current[last];
    } else current[last] = variant === "null" ? null : 42;
    return top;
  };
  const escaped: string[] = [];
  const selected = paths.filter((path) => options.include?.(path.join(".")) ?? true);
  for (const path of selected) {
    for (const variant of ["null", "delete", "number"] as const) {
      try {
        const result = call(mutate(path, variant));
        if (result instanceof Promise) await result;
      } catch (error) {
        if (!(error instanceof InvalidConfigurationError || error instanceof InvalidScientificInputError || error instanceof InvalidScientificResultError)) {
          escaped.push(`${path.join(".")} [${variant}] ${error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error)}`);
        }
      }
    }
  }
  return { probedPaths: selected.length, escaped };
}
