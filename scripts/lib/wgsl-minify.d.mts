// SPDX-License-Identifier: Apache-2.0
/** Types of scripts/lib/wgsl-minify.mjs (#536). */
export interface WgslLiteral { offset: number; original: string; minified: string; kept: boolean; expressions: string[] }
export function minifyWgslTemplates(source: string): { code: string; literals: WgslLiteral[] };
export function wgslTokens(body: string): string[];
export function wgslMinifyPlugin(): { name: string; enforce: "pre"; transform(code: string, id: string): { code: string; map: null } | null };
