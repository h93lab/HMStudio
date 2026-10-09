import {config} from './config';
import type {Ledger} from './ledger';

export type Message = {role: 'system' | 'user' | 'assistant'; content: string | Array<{type: 'text'; text: string} | {type: 'image_url'; image_url: {url: string}}>};

export const authHeaders = () => ({Authorization: `Bearer ${config.apiKey()}`});

// Pulls the JSON value out of a model reply: tolerates <think> blocks, code fences and prose around it.
export const extractJson = (text: string): unknown => {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const start = clean.search(/[[{]/);
  if (start < 0) throw new Error('no JSON found in model reply');
  const open = clean[start];
  const close = open === '{' ? '}' : ']';
  const end = clean.lastIndexOf(close);
  if (end <= start) throw new Error('unterminated JSON in model reply');
  return JSON.parse(clean.slice(start, end + 1));
};

type ChatOptions = {role: string; models: string[]; messages: Message[]; ledger?: Ledger; temperature?: number; maxTokens?: number; timeoutMs?: number};

// OpenAI-compatible chat call through OmniRoute; walks the model fallback list until one answers with content.
export const chat = async ({role, models, messages, ledger, temperature = 0.7, maxTokens = 6000, timeoutMs = 180_000}: ChatOptions) => {
  const errors: string[] = [];
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      try {
        const res = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {...authHeaders(), 'content-type': 'application/json'},
          body: JSON.stringify({model, messages, temperature, max_tokens: maxTokens}),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await res.text();
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`), {retry: res.status === 429 || res.status >= 500});
        const data = JSON.parse(body);
        const text: string = data.choices?.[0]?.message?.content ?? '';
        ledger?.add({role, model, ok: !!text.trim(), ms: Date.now() - started, promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens});
        if (!text.trim()) throw Object.assign(new Error('empty reply'), {retry: true, logged: true});
        return {text, model};
      } catch (err) {
        const e = err as Error & {retry?: boolean; logged?: boolean};
        if (!e.logged) ledger?.add({role, model, ok: false, ms: Date.now() - started, error: e.message.slice(0, 200)});
        errors.push(`${model}: ${e.message.slice(0, 160)}`);
        if (!e.retry && e.name !== 'TimeoutError') break; // hard error: next model
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }
  throw new Error(`all models failed for ${role}:\n  ${errors.join('\n  ')}`);
};

export type ChatFn = typeof chat;
