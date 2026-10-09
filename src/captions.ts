import type {CaptionWord} from './schema';

export type CaptionPage = {startMs: number; endMs: number; words: CaptionWord[]};

// Groups word timings into short on-screen pages: max `maxWords`, and a long pause always starts a new page.
export const toPages = (words: CaptionWord[], maxWords = 4, pauseMs = 550): CaptionPage[] => {
  const pages: CaptionPage[] = [];
  for (const w of words) {
    const last = pages[pages.length - 1];
    if (!last || last.words.length >= maxWords || w.startMs - last.endMs > pauseMs) {
      pages.push({startMs: w.startMs, endMs: w.endMs, words: [w]});
    } else {
      last.words.push(w);
      last.endMs = w.endMs;
    }
  }
  // Keep each page on screen until the next one starts so captions never flicker off mid-sentence.
  for (let i = 0; i < pages.length - 1; i++) pages[i].endMs = Math.max(pages[i].endMs, pages[i + 1].startMs);
  return pages;
};

// Latest page that has started; it lingers 250ms after its last word unless the next page took over.
export const pageAt = (pages: CaptionPage[], ms: number) => {
  const page = pages.findLast((p) => ms >= p.startMs);
  return page && ms < page.endMs + 250 ? page : null;
};
