import {AbsoluteFill, Html5Video, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {noise2D} from '@remotion/noise';
import {fitText} from '@remotion/layout-utils';
import type {Scene} from '../schema';
import {alpha, assetSrc, formatNumber, isArabic, localizeDigits, useEnter, usePack, useTheme} from '../design/theme';
import {staggerDelay} from '../design/packs';
import {AccentStroke, DrawIcon} from '../components/Icons';
import {useBeatPulse} from '../components/Beat';
import {Frame, useLayout} from '../components/Frame';
import {KineticText} from '../components/KineticText';
import {GlassCard} from '../components/GlassCard';
import {Pill} from '../components/Pill';
import {Counter} from '../components/Counter';

type Of<T extends Scene['type']> = Extract<Scene, {type: T}>;

const Body: React.FC<{text: string; size?: number; color?: string; weight?: 400 | 700; style?: React.CSSProperties}> = ({text, size = 48, color, weight = 400, style}) => {
  const {fontFamily, colors, numerals} = useTheme();
  const {u} = useLayout();
  return (
    <div dir={isArabic(text) ? 'rtl' : 'ltr'} style={{fontFamily, fontSize: size * u, fontWeight: weight, color: color ?? colors.text, lineHeight: 1.35, ...style}}>
      {localizeDigits(text, numerals)}
    </div>
  );
};

const Mark: React.FC<{ok: boolean}> = ({ok}) => {
  const {colors} = useTheme();
  const {u} = useLayout();
  const s = 50 * u;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{flexShrink: 0}}>
      <circle cx="12" cy="12" r="11" fill={ok ? colors.accent : 'transparent'} stroke={ok ? colors.accent : colors.muted} strokeWidth="1.5" opacity={ok ? 1 : 0.7} />
      <path d={ok ? 'M7 12.5l3.2 3.2L17 9' : 'M8.5 8.5l7 7M15.5 8.5l-7 7'} stroke={ok ? colors.background : colors.muted} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
};

const Intro: React.FC<Of<'intro'>> = ({kicker, title, subtitle}) => {
  const {colors} = useTheme();
  return (
    <Frame>
      <Pill text={kicker} />
      <KineticText text={title} size={130} delay={8} gradient />
      <KineticText text={subtitle} size={50} weight={400} delay={24} color={colors.muted} />
    </Frame>
  );
};

const Statement: React.FC<Of<'statement'>> = ({text, emphasis}) => {
  const {u} = useLayout();
  const pack = usePack();
  return (
    <Frame center>
      <KineticText text={text} size={120} maxLines={4} emphasis={emphasis} align="center" />
      <AccentStroke kind={pack.accent} delay={16 + text.split(/\s+/).length * pack.stagger.each} width={360 * u} />
    </Frame>
  );
};

const Features: React.FC<Of<'features'>> = ({title, items, icons}) => {
  const {colors} = useTheme();
  const {u} = useLayout();
  const pack = usePack();
  return (
    <Frame gap={32}>
      <KineticText text={title} size={96} maxLines={2} />
      {items.map((item, i) => (
        <GlassCard key={i} delay={14 + staggerDelay(i, items.length, pack.stagger) * 3} style={{display: 'flex', alignItems: 'center', gap: 30 * u}}>
          {icons?.[i] ? (
            <DrawIcon name={icons[i]} delay={20 + staggerDelay(i, items.length, pack.stagger) * 3} size={58} />
          ) : (
            <div style={{width: 22 * u, height: 22 * u, borderRadius: '50%', background: colors.accent, boxShadow: `0 0 ${30 * u}px ${colors.accent}`, flexShrink: 0}} />
          )}
          <Body text={item} size={56} weight={700} />
        </GlassCard>
      ))}
    </Frame>
  );
};

const Stat: React.FC<Of<'stat'>> = ({prefix, value, suffix, label}) => {
  const {colors} = useTheme();
  return (
    <Frame>
      <Counter value={value} prefix={prefix} suffix={suffix} delay={6} />
      <KineticText text={label} size={64} weight={400} delay={20} color={colors.muted} />
    </Frame>
  );
};

const Quote: React.FC<Of<'quote'>> = ({quote, author, role}) => {
  const {colors, fontFamily} = useTheme();
  const {u} = useLayout();
  const p = useEnter(0);
  return (
    <Frame>
      <div style={{fontFamily: 'Georgia, serif', fontSize: 260 * u, lineHeight: 0.6, height: 130 * u, color: colors.accent, opacity: p, transform: `scale(${p})`}}>“</div>
      <KineticText text={quote} size={78} maxLines={5} delay={8} />
      <GlassCard delay={30} style={{alignSelf: 'flex-start', padding: `${20 * u}px ${36 * u}px`}}>
        <div style={{fontFamily, fontSize: 40 * u, fontWeight: 700, color: colors.text}}>{author}</div>
        {role ? <div style={{fontFamily, fontSize: 32 * u, color: colors.muted}}>{role}</div> : null}
      </GlassCard>
    </Frame>
  );
};

const Comparison: React.FC<Of<'comparison'>> = ({title, beforeLabel, before, afterLabel, after}) => {
  const {colors} = useTheme();
  const {u, width, height} = useLayout();
  const row = width > height;
  const column = (label: string, items: string[], ok: boolean, delay: number) => (
    <GlassCard delay={delay} style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 20 * u, ...(ok && {background: `${alpha(colors.primary, 0.13)}`, borderColor: colors.primary})}}>
      <Body text={label} size={44} weight={700} color={ok ? colors.accent : colors.muted} />
      {items.map((it, i) => (
        <div key={i} style={{display: 'flex', alignItems: 'center', gap: 18 * u}}>
          <Mark ok={ok} />
          <Body text={it} size={50} color={ok ? colors.text : colors.muted} style={ok ? undefined : {textDecoration: 'line-through', textDecorationColor: `${alpha(colors.muted, 0.53)}`}} />
        </div>
      ))}
    </GlassCard>
  );
  return (
    <Frame gap={32}>
      <KineticText text={title} size={90} maxLines={2} />
      <div style={{display: 'flex', flexDirection: row ? 'row' : 'column', gap: 28 * u}}>
        {column(beforeLabel, before, false, 12)}
        {column(afterLabel, after, true, 26)}
      </div>
    </Frame>
  );
};

const Steps: React.FC<Of<'steps'>> = ({title, steps}) => {
  const {colors, fontFamily, numerals} = useTheme();
  const pack = usePack();
  const {u} = useLayout();
  const line = useEnter(10);
  return (
    <Frame gap={36}>
      <KineticText text={title} size={90} maxLines={2} />
      <div style={{position: 'relative', display: 'flex', flexDirection: 'column', gap: 34 * u}}>
        <div style={{position: 'absolute', insetInlineStart: 42 * u, top: 44 * u, width: 4 * u, height: `calc(${line * 100}% - ${80 * u}px)`, background: `linear-gradient(${colors.primary}, ${colors.accent})`}} />
        {steps.map((s, i) => (
          <StepRow key={i} index={i} text={s} delay={16 + staggerDelay(i, steps.length, pack.stagger) * 4} fontFamily={fontFamily} numerals={numerals} />
        ))}
      </div>
    </Frame>
  );
};

const StepRow: React.FC<{index: number; text: string; delay: number; fontFamily: string; numerals: 'latn' | 'arab'}> = ({index, text, delay, fontFamily, numerals}) => {
  const theme = useTheme();
  const {u} = useLayout();
  const p = useEnter(delay);
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 30 * u, opacity: p, transform: `translateY(${(1 - p) * 30 * u}px)`}}>
      <div style={{width: 88 * u, height: 88 * u, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: theme.colors.background, border: `${4 * u}px solid ${theme.colors.accent}`, boxShadow: `0 0 ${30 * u}px ${alpha(theme.colors.accent, 0.53)}`, fontFamily, fontWeight: 700, fontSize: 40 * u, color: theme.colors.text}}>
        {formatNumber(index + 1, {...theme, numerals})}
      </div>
      <Body text={text} size={56} weight={700} />
    </div>
  );
};

const Chart: React.FC<Of<'chart'>> = ({title, bars, suffix}) => {
  const theme = useTheme();
  const {u} = useLayout();
  const frame = useCurrentFrame();
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <Frame gap={30}>
      <KineticText text={title} size={88} maxLines={2} />
      {bars.map((b, i) => {
        const grow = interpolate(frame - (16 + i * 7), [0, 30 / theme.motion.speed], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        const eased = 1 - Math.pow(1 - grow, 3);
        const best = b.value === max;
        return (
          <div key={i} style={{display: 'flex', flexDirection: 'column', gap: 10 * u, opacity: Math.min(1, grow * 3)}}>
            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <Body text={b.label} size={46} weight={700} />
              <Body text={`${formatNumber(b.value * eased, theme)}${suffix}`} size={46} weight={700} color={best ? theme.colors.accent : theme.colors.muted} />
            </div>
            <div style={{height: 42 * u, borderRadius: 42 * u, background: theme.colors.surface}}>
              <div style={{width: `${(b.value / max) * 100 * eased}%`, height: '100%', borderRadius: 42 * u, background: best ? `linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.accent})` : `${alpha(theme.colors.muted, 0.4)}`, boxShadow: best ? `0 0 ${30 * u}px ${alpha(theme.colors.accent, 0.53)}` : 'none'}} />
            </div>
          </div>
        );
      })}
    </Frame>
  );
};

const Device: React.FC<Of<'device'>> = ({title, caption, image}) => {
  const {colors} = useTheme();
  const {u, contentHeight, width, height} = useLayout();
  const p = useEnter(10);
  const frame = useCurrentFrame();
  const portrait = height > width;
  const phoneH = contentHeight * (portrait ? 0.62 : 0.78);
  const phoneW = phoneH * 0.49;
  const r = 70 * (phoneH / 1100);
  const phone = (
    <div
      style={{
        alignSelf: 'center',
        width: phoneW,
        height: phoneH,
        borderRadius: r,
        padding: phoneW * 0.035,
        background: `linear-gradient(145deg, ${alpha(colors.muted, 0.33)}, ${colors.background})`,
        boxShadow: `0 ${60 * u}px ${140 * u}px -${40 * u}px ${alpha(colors.primary, 0.67)}, 0 0 0 ${2 * u}px ${alpha(colors.muted, 0.27)}`,
        transform: `perspective(${1600 * u}px) translateY(${(1 - p) * 300 * u}px) rotateX(${(1 - p) * 25}deg) rotateY(${Math.sin(frame / 50) * 4}deg)`,
        opacity: p,
        flexShrink: 0,
      }}
    >
      <div style={{width: '100%', height: '100%', borderRadius: r * 0.85, overflow: 'hidden', background: colors.background, position: 'relative'}}>
        {image ? <Img src={assetSrc(image)} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : <MockUI frame={frame} />}
      </div>
    </div>
  );
  return (
    <Frame gap={30} center={!portrait}>
      <div style={{display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: 'center', gap: 50 * u}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 20 * u, flex: portrait ? undefined : 1, width: portrait ? '100%' : undefined}}>
          <KineticText text={title} size={84} maxLines={2} width={portrait ? undefined : width * 0.4} />
          {caption ? <Body text={caption} size={42} color={colors.muted} /> : null}
        </div>
        {phone}
      </div>
    </Frame>
  );
};

// Placeholder app UI when no screenshot is given: skeleton cards with a moving shimmer in brand colors.
const MockUI: React.FC<{frame: number}> = ({frame}) => {
  const {colors} = useTheme();
  const shimmer = (frame * 2) % 200;
  const bar = (w: string, h: number, c = `${alpha(colors.muted, 0.2)}`) => <div style={{width: w, height: `${h}%`, borderRadius: 999, background: c}} />;
  return (
    <div style={{position: 'absolute', inset: 0, padding: '14% 8% 8%', display: 'flex', flexDirection: 'column', gap: '3%'}}>
      {bar('45%', 2.2, colors.text)}
      {bar('70%', 1.6)}
      <div style={{height: '22%', borderRadius: 18, background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, marginTop: '4%'}} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{display: 'flex', gap: '5%', alignItems: 'center', height: '9%', padding: '0 4%', borderRadius: 14, background: colors.surface}}>
          <div style={{width: '18%', aspectRatio: '1', borderRadius: '50%', background: `${alpha(colors.accent, 0.33)}`}} />
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 8}}>
            {bar('80%', 18)}
            {bar('50%', 14)}
          </div>
        </div>
      ))}
      <div style={{position: 'absolute', inset: 0, background: `linear-gradient(100deg, transparent ${shimmer - 40}%, ${alpha(colors.text, 0.08)} ${shimmer - 20}%, transparent ${shimmer}%)`}} />
    </div>
  );
};

// A still that feels alive: blurred depth plate + slow push with parallax drift + light sweep + floating particles.
const LivingImage: React.FC<{src: string}> = ({src}) => {
  const {colors} = useTheme();
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const t = frame / Math.max(1, durationInFrames);
  const zoom = interpolate(t, [0, 1], [1.06, 1.2]);
  const dx = noise2D('img-x', frame / 160, 0) * 18 * u;
  const dy = noise2D('img-y', frame / 180, 1) * 14 * u;
  const sweep = interpolate(frame, [10, 70], [-60, 160], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <Img src={src} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom * 1.15}) translate(${-dx}px, ${-dy}px)`, filter: 'blur(18px) brightness(0.7)'}} />
      <Img src={src} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom}) translate(${dx}px, ${dy}px)`, maskImage: 'radial-gradient(ellipse 85% 75% at 50% 45%, black 55%, transparent 100%)'}} />
      <AbsoluteFill style={{background: `linear-gradient(115deg, transparent ${sweep - 30}%, ${alpha(colors.text, 0.12)} ${sweep}%, transparent ${sweep + 30}%)`, mixBlendMode: 'screen'}} />
      {Array.from({length: 18}, (_, i) => {
        const px = (noise2D(`p${i}`, i, 0) * 0.5 + 0.5) * width;
        const raw = (noise2D(`p${i}`, 0, i) * 0.5 + 0.5) * height - frame * (0.6 + (i % 5) * 0.25) * u;
        const py = ((raw % height) + height) % height; // particles wrap around forever
        const r = (2 + (i % 4)) * u;
        return <div key={i} style={{position: 'absolute', left: px, top: py, width: r, height: r, borderRadius: '50%', background: colors.accent, opacity: 0.35 + (i % 3) * 0.15, boxShadow: `0 0 ${8 * u}px ${colors.accent}`}} />;
      })}
    </AbsoluteFill>
  );
};

const MediaOverlay: React.FC<{title: string; subtitle: string}> = ({title, subtitle}) => {
  const {colors} = useTheme();
  return (
    <>
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${alpha(colors.background, 0.4)} 0%, transparent 25%, ${alpha(colors.background, 0.85)} 58%, ${colors.background} 100%)`}} />
      <Frame bottom>
        <KineticText text={title} size={110} maxLines={3} delay={6} />
        {subtitle ? <KineticText text={subtitle} size={50} weight={400} delay={18} color={colors.text} /> : null}
      </Frame>
    </>
  );
};

const ImageScene: React.FC<Of<'image'>> = ({title, subtitle, image}) => {
  const {colors} = useTheme();
  return (
    <AbsoluteFill>
      {image ? <LivingImage src={assetSrc(image)} /> : <AbsoluteFill style={{background: `radial-gradient(circle at 30% 30%, ${colors.primary}, ${colors.background} 70%)`}} />}
      <MediaOverlay title={title} subtitle={subtitle} />
    </AbsoluteFill>
  );
};

// Generated or client b-roll under the type; falls back to the living still when there is no clip.
const VideoScene: React.FC<Of<'video'>> = ({title, subtitle, video, image}) => {
  const {colors} = useTheme();
  return (
    <AbsoluteFill>
      {video ? (
        // Short generated clips loop for the whole scene instead of freezing on their last frame.
        <Html5Video src={assetSrc(video)} muted loop style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      ) : image ? (
        <LivingImage src={assetSrc(image)} />
      ) : (
        <AbsoluteFill style={{background: `radial-gradient(circle at 30% 30%, ${colors.primary}, ${colors.background} 70%)`}} />
      )}
      <MediaOverlay title={title} subtitle={subtitle} />
    </AbsoluteFill>
  );
};

const Logo: React.FC<Of<'logo'>> = ({name, tagline}) => {
  const {colors, logo, client, displayFamily: fontFamily} = useTheme();
  const {u, contentWidth} = useLayout();
  const p = useEnter(4);
  const frame = useCurrentFrame();
  const sweep = interpolate(frame, [20, 55], [-120, 220], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <Frame center gap={50}>
      <div style={{position: 'relative', transform: `scale(${0.6 + p * 0.4})`, opacity: p}}>
        <div style={{position: 'absolute', left: '50%', top: '50%', width: 520 * u, height: 520 * u, marginLeft: -260 * u, marginTop: -260 * u, borderRadius: '50%', border: `${3 * u}px solid ${alpha(colors.accent, 0.4)}`, boxShadow: `0 0 ${80 * u}px ${alpha(colors.primary, 0.33)}, inset 0 0 ${80 * u}px ${alpha(colors.primary, 0.2)}`, transform: `scale(${0.4 + p * 1.1})`, opacity: interpolate(p, [0, 0.3, 1], [0, 0.9, 0])}} />
        {logo ? (
          <Img src={assetSrc(logo)} style={{maxWidth: contentWidth * 0.6, maxHeight: 360 * u, objectFit: 'contain', filter: `drop-shadow(0 0 ${40 * u}px ${alpha(colors.primary, 0.67)})`}} />
        ) : (
          <div style={{fontFamily, fontWeight: 700, fontSize: Math.min(150 * u, fitText({text: name || client, withinWidth: contentWidth * 0.92, fontFamily, fontWeight: 700}).fontSize), backgroundImage: `linear-gradient(110deg, ${colors.primary} ${sweep - 40}%, ${colors.text} ${sweep}%, ${colors.accent} ${sweep + 40}%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', whiteSpace: 'nowrap'}}>
            {name || client}
          </div>
        )}
      </div>
      {tagline ? <KineticText text={tagline} size={56} weight={400} delay={22} color={colors.muted} align="center" /> : null}
    </Frame>
  );
};

const Outro: React.FC<Of<'outro'>> = ({title, cta, url}) => {
  const {colors, fontFamily, radius} = useTheme();
  const {u} = useLayout();
  const frame = useCurrentFrame();
  const beat = useBeatPulse();
  const pulse = 1 + Math.sin(frame / 6) * 0.02 + beat * 0.05;
  return (
    <Frame>
      <KineticText text={title} size={120} maxLines={3} gradient />
      <GlassCard delay={20} style={{alignSelf: 'flex-start', padding: `${34 * u}px ${70 * u}px`, background: colors.primary, borderRadius: radius * u, transform: `scale(${pulse})`, boxShadow: `0 0 ${80 * u}px ${colors.primary}`}}>
        <div dir={isArabic(cta) ? 'rtl' : 'ltr'} style={{fontFamily, fontSize: 56 * u, fontWeight: 700, color: colors.text, whiteSpace: 'nowrap'}}>{cta}</div>
      </GlassCard>
      {/* URL stays LTR inside, but sits on the same side as the CTA in RTL layouts. */}
      {url ? <div style={{alignSelf: 'flex-start', fontFamily, fontSize: 40 * u, color: colors.muted}}><span dir="ltr">{url}</span></div> : null}
    </Frame>
  );
};

export const SceneView: React.FC<{scene: Scene}> = ({scene}) => {
  switch (scene.type) {
    case 'intro': return <Intro {...scene} />;
    case 'statement': return <Statement {...scene} />;
    case 'features': return <Features {...scene} />;
    case 'stat': return <Stat {...scene} />;
    case 'quote': return <Quote {...scene} />;
    case 'comparison': return <Comparison {...scene} />;
    case 'steps': return <Steps {...scene} />;
    case 'chart': return <Chart {...scene} />;
    case 'device': return <Device {...scene} />;
    case 'image': return <ImageScene {...scene} />;
    case 'video': return <VideoScene {...scene} />;
    case 'logo': return <Logo {...scene} />;
    case 'outro': return <Outro {...scene} />;
  }
};
