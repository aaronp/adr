import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Reads the bundled sample file. Pure w.r.t. test state: each call returns a fresh string. */
export const readSample = (): string => readFileSync(fileURLToPath(new URL('../src/sample/decisions.md', import.meta.url)), 'utf8');
