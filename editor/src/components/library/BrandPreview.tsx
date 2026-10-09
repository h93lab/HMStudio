import type {Theme} from '@/lib/api';

const SAMPLE = {
  rtl: {kicker: 'إطلاق جديد', title: 'المستقبل يبدأ الآن', subtitle: 'منصة ذكية تعيد تعريف السرعة'},
  ltr: {kicker: 'New launch', title: 'The future starts now', subtitle: 'A smart platform redefining speed'},
};

export const BrandPreview: React.FC<{theme: Theme}> = ({theme}) => {
  const s = SAMPLE[theme.direction];
  const {colors} = theme;
  const titleFont = theme.displayFont === 'none' ? theme.font : theme.displayFont;
  return (
    <div
      dir={theme.direction}
      className="flex flex-col gap-2 border p-6"
      style={{background: colors.background, color: colors.text, fontFamily: `'${theme.font}', sans-serif`, borderRadius: Math.min(theme.radius, 32), boxShadow: `0 0 ${theme.glow * 60}px ${colors.primary}55`}}
    >
      <span className="w-fit px-3 py-1 text-xs font-bold" style={{background: colors.primary, color: colors.background, borderRadius: Math.min(theme.radius, 999)}}>
        {s.kicker}
      </span>
      <span className="text-3xl font-extrabold" style={{fontFamily: `'${titleFont}', sans-serif`}}>
        {s.title}
      </span>
      <span style={{color: colors.muted}}>{s.subtitle}</span>
      <span className="mt-2 w-fit px-3 py-2 text-xs" style={{background: colors.surface, color: colors.accent, borderRadius: Math.min(theme.radius, 24)}}>
        {theme.client || 'Client'}
      </span>
    </div>
  );
};
