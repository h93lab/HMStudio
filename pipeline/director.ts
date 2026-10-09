import {z} from 'zod';
import {chat, extractJson, type ChatFn} from './llm';
import {config} from './config';
import {directorPrompt, type Dialect, type Lang} from './prompts';
import type {Ledger} from './ledger';

export const briefSchema = z.looseObject({
  hook: z.string().min(1),
  cta: z.string().min(1),
  scenes: z.array(z.looseObject({type: z.string(), purpose: z.string().optional(), keyMessage: z.string().optional()})).min(4).max(12),
});
export type Brief = z.infer<typeof briefSchema>;

// Creative direction: the strongest model available decides hook, angle and scene plan; it's one short call per video.
export const makeBrief = async (p: {idea: string; client: string; lang: Lang; dialect: Dialect; seconds: number; ledger?: Ledger; chatFn?: ChatFn}) => {
  const run = p.chatFn ?? chat;
  const messages = directorPrompt(p);
  for (let attempt = 0; attempt < 2; attempt++) {
    const {text, model} = await run({role: 'director', models: config.models.director, messages, ledger: p.ledger, temperature: 0.9, maxTokens: 4000});
    try {
      return {brief: briefSchema.parse(extractJson(text)), model};
    } catch (e) {
      if (attempt === 1) throw new Error(`director returned an invalid brief: ${(e as Error).message.slice(0, 300)}`);
    }
  }
  throw new Error('unreachable');
};
