// Layout self-reports: components log measured problems; the pipeline captures "[QA]" browser logs while rendering stills.
export const qaWarn = (message: string) => {
  console.warn(`[QA] ${message}`);
};
