// Re-renders stills for an existing props file (no AI calls) — for checking layout changes.
// Usage: npx tsx scripts/stills.ts <props.json> <compositionId> <outDir>
import {readFileSync} from 'node:fs';
import {renderStills} from '../pipeline/render';

const [file, id, out] = process.argv.slice(2);
if (!file || !id || !out) throw new Error('usage: scripts/stills.ts <props.json> <compositionId> <outDir>');
console.log((await renderStills(id, JSON.parse(readFileSync(file, 'utf8')), out, 0.5)).length, 'stills');
