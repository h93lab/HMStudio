// One color per scene type (data colors, not UI chrome). Shared by Templates and, later, the editor timeline.
export const SCENE_COLOR: Record<string, string> = {
  intro: '#6c5cff', stat: '#dcff2a', features: '#4f9dff', device: '#22d3ee', quote: '#fb7185', steps: '#f59e0b',
  comparison: '#a78bfa', outro: '#8d8d93', logo: '#10b981', chart: '#e4f222', statement: '#f472b6', image: '#38bdf8', video: '#fb923c',
};
export const sceneColor = (type: string) => SCENE_COLOR[type] ?? '#8d8d93';
