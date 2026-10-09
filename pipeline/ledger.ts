import {appendFileSync, existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from './config';

export type LedgerEntry = {
  at: string;
  role: string;
  model: string;
  ok: boolean;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
  chars?: number; // TTS input characters
  seconds?: number; // audio seconds (STT)
  images?: number;
  cached?: boolean;
  error?: string;
};

// Prices are yours to fill in pipeline/prices.json (USD); unknown prices count as null, never guessed.
type Price = {inputPer1M?: number; outputPer1M?: number; perChar?: number; perSecond?: number; perImage?: number};
const loadPrices = (): Record<string, Price> => {
  const file = path.join(ROOT, 'pipeline', 'prices.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
};

export const entryCost = (e: LedgerEntry, prices: Record<string, Price>): number | null => {
  if (e.cached || !e.ok) return 0;
  const p = prices[e.model];
  if (!p) return null;
  return (
    ((e.promptTokens ?? 0) * (p.inputPer1M ?? 0)) / 1e6 +
    ((e.completionTokens ?? 0) * (p.outputPer1M ?? 0)) / 1e6 +
    (e.chars ?? 0) * (p.perChar ?? 0) +
    (e.seconds ?? 0) * (p.perSecond ?? 0) +
    (e.images ?? 0) * (p.perImage ?? 0)
  );
};

export class Ledger {
  entries: LedgerEntry[] = [];
  constructor(private file?: string) {
    if (file && existsSync(file)) this.entries = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  add(e: Omit<LedgerEntry, 'at'>) {
    const entry = {at: new Date().toISOString(), ...e};
    this.entries.push(entry);
    if (this.file) appendFileSync(this.file, JSON.stringify(entry) + '\n');
  }
  summary() {
    const prices = loadPrices();
    const byModel: Record<string, {calls: number; failed: number; promptTokens: number; completionTokens: number; chars: number; cost: number | null}> = {};
    let total: number | null = 0;
    for (const e of this.entries) {
      const m = (byModel[e.model] ??= {calls: 0, failed: 0, promptTokens: 0, completionTokens: 0, chars: 0, cost: 0});
      m.calls++;
      if (!e.ok) m.failed++;
      m.promptTokens += e.promptTokens ?? 0;
      m.completionTokens += e.completionTokens ?? 0;
      m.chars += e.chars ?? 0;
      const c = entryCost(e, prices);
      m.cost = c === null || m.cost === null ? null : m.cost + c;
      total = c === null || total === null ? null : total + c;
    }
    return {byModel, totalUsd: total};
  }
}
