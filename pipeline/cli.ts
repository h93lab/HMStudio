import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {formats, type Format} from '../src/schema';
import {config} from './config';
import {make, reformat, renderVersion, revise, type BuildOptions, type CreativeOptions} from './produce';
import {packIds, type PackId} from '../src/design/packs';
import {jobDir, latestJobId, ledgerFile, loadJob} from './jobs';
import {Ledger} from './ledger';
import {listClients} from './render';
import {bench} from './bench';
import type {Dialect, Lang} from './prompts';

const HELP = `Motion Studio pipeline

  npm run make -- "<idea>" --client nova [options]   idea → brief → storyboard → voice → video
  npm run revise -- [<job>] "<feedback>"              targeted edit, new version (unchanged voice lines are free)
  npm run reformat -- [<job>] --format 1:1            same video, another aspect ratio (no AI calls)
  npm run render -- [<job>] [--version n]               render a version (e.g. one saved from the editor) to mp4
  npm run editor                                      build the visual editor (served by the dashboard at /edit/<job>)
  npm run cost -- [<job>]                             token/char usage and cost per model
  npm run clients                                     list client profiles (edit them in the Studio)
  npm run batch -- ideas.json                         many videos: [{"idea", "client", "format"?, "dialect"?}]
  npm run dashboard                                   local web UI on http://localhost:4777
  npm run bench -- --writers ds/deepseek-flash,mimotp/mimo-v2.5-pro [--limit 5]

Options (make/revise):
  --client <id>        client profile (Promo-<id> in the Studio)          default nova
  --lang ar|en         default: detected from the idea
  --dialect msa|egyptian|gulf|levantine                                    default msa
  --format 9:16|1:1|4:5|16:9                                               default 9:16
  --seconds <n>        target length                                       default 30
  --tier draft|standard|premium                                           default standard
                       draft: no hook tournament/critic/images/QA (fast, cheapest)
                       standard: hook tournament + script critic + images + visual QA
                       premium: standard + 3 A/B hook variants + QA auto-fix
  --style <pack>       ${packIds.join(' | ')} (default: the director picks)
  --variants <n>       number of A/B hook variants (overrides the tier)
  --url <https://…>    read the client's site: verified facts, logo (copy and numbers ground on them)
  --brand-theme        also take the site's brand colors for this video
  --music <mood|file>  tech-pulse | cinematic | upbeat-pop | minimal | lofi, a file in public/ (beats detected), or none
  --screens a.png,b.png   real app screenshots for phone-mockup scenes
  --logo logo.png      logo for this video (else the client profile's logo)
  --clips a.mp4,b.mp4  your own b-roll clips for video scenes (else AI)
  --gender male|female narrator (free Azure/Edge voice matched to the dialect)   default male
  --voice <name>       any Edge voice (ar-EG-SalmaNeural, ar-AE-HamdanNeural…) or an ElevenLabs voice id
  --draft              stills + review page only (no mp4) — fast and cheap
  --no-voice  --no-images  --no-music  --no-captions  --no-qa
  --qa-fix             let visual QA trigger one automatic revision
  <job> defaults to the latest job.`;

const {values, positionals} = parseArgs({
  allowPositionals: true,
  options: {
    client: {type: 'string', default: 'nova'},
    lang: {type: 'string'},
    dialect: {type: 'string', default: 'msa'},
    format: {type: 'string'},
    seconds: {type: 'string', default: '30'},
    draft: {type: 'boolean', default: false},
    'no-voice': {type: 'boolean', default: false},
    'no-images': {type: 'boolean', default: false},
    'no-music': {type: 'boolean', default: false},
    'no-captions': {type: 'boolean', default: false},
    'no-qa': {type: 'boolean', default: false},
    'qa-fix': {type: 'boolean', default: false},
    screens: {type: 'string'},
    clips: {type: 'string'},
    voice: {type: 'string'},
    tier: {type: 'string', default: 'standard'},
    version: {type: 'string'},
    style: {type: 'string'},
    variants: {type: 'string'},
    music: {type: 'string'},
    url: {type: 'string'},
    'brand-theme': {type: 'boolean', default: false},
    gender: {type: 'string', default: 'male'},
    logo: {type: 'string'},
    writers: {type: 'string'},
    limit: {type: 'string', default: '5'},
    help: {type: 'boolean', short: 'h', default: false},
  },
});

const [command, ...args] = positionals;

const tier = values.tier === 'draft' || values.tier === 'premium' ? values.tier : 'standard';

const buildOptions = (): BuildOptions => ({
  voice: !values['no-voice'],
  images: !values['no-images'] && tier !== 'draft',
  music: !values['no-music'],
  captions: !values['no-captions'] && !values['no-voice'],
  video: !values.draft,
  qa: !values['no-qa'] && tier !== 'draft',
  qaFix: values['qa-fix'] || tier === 'premium',
});

const creativeOptions = (): CreativeOptions => {
  if (values.style && !packIds.includes(values.style as PackId)) throw new Error(`--style must be one of ${packIds.join(', ')}`);
  return {
    hooks: tier !== 'draft',
    critic: tier !== 'draft',
    variants: values.variants ? Math.max(1, Math.min(5, Number(values.variants) || 1)) : tier === 'premium' ? 3 : 1,
    style: values.style as PackId | undefined,
    musicChoice: values.music,
    url: values.url,
    brandTheme: values['brand-theme'],
  };
};

const pickFormat = (fallback: Format): Format => {
  const f = (values.format ?? fallback) as Format;
  if (!(f in formats)) throw new Error(`--format must be one of ${Object.keys(formats).join(', ')}`);
  return f;
};

const jobArg = (rest: string[], needsText: boolean) => {
  // `revise "<feedback>"` targets the latest job; `revise <job> "<feedback>"` a specific one.
  if (needsText ? rest.length >= 2 : rest.length >= 1) return {id: rest[0], text: rest.slice(1).join(' ')};
  const id = latestJobId();
  if (!id) throw new Error('no jobs yet: run `npm run make` first');
  return {id, text: rest.join(' ')};
};

const printCost = (summary: ReturnType<Ledger['summary']>) => {
  console.table(Object.entries(summary.byModel).map(([model, m]) => ({model, ...m, cost: m.cost === null ? 'price?' : `$${m.cost.toFixed(4)}`})));
  console.log(summary.totalUsd === null ? 'total: add prices in pipeline/prices.json to see USD' : `total: $${summary.totalUsd.toFixed(4)}`);
};

const main = async () => {
  if (values.help || !command) return console.log(HELP);
  switch (command) {
    case 'make': {
      const idea = args.join(' ').trim();
      if (!idea) throw new Error('give the idea in quotes: npm run make -- "..." --client nova');
      const lang = (values.lang ?? (/[؀-ۿ]/.test(idea) ? 'ar' : 'en')) as Lang;
      const {job, version, cost} = await make({idea, client: values.client!, lang, dialect: values.dialect as Dialect, format: pickFormat('9:16'), seconds: Number(values.seconds), screens: values.screens?.split(',').map((s) => path.resolve(s.trim())), clips: values.clips?.split(',').map((s) => path.resolve(s.trim())), logo: values.logo ? path.resolve(values.logo) : undefined, narrator: values.voice, gender: values.gender === 'female' ? 'female' : 'male', ...buildOptions(), ...creativeOptions()});
      console.log(`\n✓ ${job.id} v${version.v}\n  review: ${path.join(jobDir(job.id), version.review ?? '')}`);
      printCost(cost);
      return;
    }
    case 'revise': {
      const {id, text} = jobArg(args, true);
      if (!text.trim()) throw new Error('give the feedback in quotes');
      const version = await revise(id, text, buildOptions());
      console.log(`\n✓ ${id} v${version.v}\n  review: ${path.join(jobDir(id), version.review ?? '')}`);
      return;
    }
    case 'reformat': {
      const {id} = jobArg(args, false);
      console.log(`✓ ${await reformat(id, pickFormat(loadJob(id).format))}`);
      return;
    }
    case 'batch': {
      const file = args[0];
      if (!file) throw new Error('give a JSON file: [{"idea": "...", "client": "nova"}]');
      const items: {idea: string; client?: string; format?: Format; dialect?: Dialect; seconds?: number}[] = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
      const results: {idea: string; job?: string; review?: string; error?: string}[] = [];
      for (const [i, it] of items.entries()) {
        console.log(`\n━━ ${i + 1}/${items.length}: ${it.idea.slice(0, 60)}`);
        try {
          const lang = (/[\u0600-\u06FF]/.test(it.idea) ? 'ar' : 'en') as Lang;
          const {job, version} = await make({idea: it.idea, client: it.client ?? values.client!, lang, dialect: it.dialect ?? (values.dialect as Dialect), format: it.format ?? pickFormat('9:16'), seconds: it.seconds ?? Number(values.seconds), ...buildOptions(), ...creativeOptions()});
          results.push({idea: it.idea.slice(0, 40), job: job.id, review: path.join(jobDir(job.id), version.review ?? '')});
        } catch (e) {
          results.push({idea: it.idea.slice(0, 40), error: (e as Error).message.split('\n')[0]}); // one failure never stops the batch
        }
      }
      console.table(results);
      if (results.some((r) => r.error)) process.exitCode = 1;
      return;
    }
    case 'render': {
      const {id} = jobArg(args, false);
      console.log(`✓ ${await renderVersion(id, values.version ? Number(values.version) : undefined)}`);
      return;
    }
    case 'cost': {
      const {id} = jobArg(args, false);
      printCost(new Ledger(ledgerFile(id)).summary());
      return;
    }
    case 'clients': {
      for (const c of await listClients()) console.log(`${c.id.padEnd(12)} ${c.theme.client} · ${c.theme.font} · ${c.theme.direction}`);
      return;
    }
    case 'bench': {
      await bench({writers: values.writers ? values.writers.split(',') : config.models.writer.slice(0, 2), limit: Number(values.limit)});
      return;
    }
    default:
      console.log(HELP);
      process.exitCode = 1;
  }
};

main().catch((e) => {
  console.error(`\n✗ ${(e as Error).message}`);
  process.exitCode = 1;
});
