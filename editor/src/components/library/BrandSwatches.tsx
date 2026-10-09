export const BrandSwatches: React.FC<{colors: string[]}> = ({colors}) => (
  <span aria-hidden className="flex gap-1">
    {colors.map((c, i) => (
      <span key={i} className="size-3 rounded-md border" style={{background: c}} />
    ))}
  </span>
);
