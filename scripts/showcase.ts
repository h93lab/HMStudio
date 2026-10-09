// Renders one still per scene of the Showcase composition (all scene types) for visual QA.
// Usage: npx tsx scripts/showcase.ts [format] [outDir] [stylePack]
import path from 'node:path';
import {selectComposition} from '@remotion/renderer';
import {getBundle, renderStills} from '../pipeline/render';
import {ROOT} from '../pipeline/config';
import type {Format, VideoProps} from '../src/schema';
import type {PackId} from '../src/design/packs';

const format = (process.argv[2] ?? '9:16') as Format;
const out = process.argv[3] ?? path.join(ROOT, 'out', 'showcase', format.replace(':', 'x'));
const comp = await selectComposition({serveUrl: await getBundle(), id: 'Showcase', inputProps: {}});
const base = comp.props as VideoProps;
const props: VideoProps = {...base, format, style: (process.argv[4] as PackId) ?? base.style};
const files = await renderStills('Showcase', props, out, 0.4);
console.log(files.join('\n'));
