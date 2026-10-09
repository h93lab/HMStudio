import {Composition} from 'remotion';
import {SceneEngine, calculateMetadata, videoSchema} from './engine/SceneEngine';
import type {VideoProps} from './schema';
import profiles from './profiles.json';

// One composition = one client profile (Promo-<id>); the pipeline reads its theme and renders it with AI-written scenes.
// Profiles live in src/profiles.json (edited by the Studio UI through the dashboard API), not in this file.
// `Showcase` renders every scene type for visual QA.
export const Root: React.FC = () => (
  <>
    {profiles.map((p) => (
      <Composition
        key={p.id}
        id={`Promo-${p.id}`}
        component={SceneEngine}
        schema={videoSchema}
        calculateMetadata={calculateMetadata}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={p.props as VideoProps}
      />
    ))}
    <Composition
      id="Showcase"
      component={SceneEngine}
      schema={videoSchema}
      calculateMetadata={calculateMetadata}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        theme: {
          client: "Nova Tech",
          direction: "rtl",
          numerals: "latn",
          font: "IBM Plex Sans Arabic",
          displayFont: "none",
          logo: "",
          colors: {
            background: "#05060f",
            surface: "rgba(255,255,255,0.06)",
            primary: "#6c5cff",
            accent: "#22d3ee",
            text: "#f5f7ff",
            muted: "#8b93b8"
          },
          radius: 36,
          glow: 0.7,
          motion: {
            speed: 1,
            damping: 18
          }
        },
        format: "9:16",
        style: "premium-tech",
        showCaptions: true,
        music: "music/ambient-pulse.wav",
        musicVolume: 0.35,
        sfx: true,
        scenes: [
          {
            type: "intro",
            duration: 90,
            kicker: "عرض المكتبة",
            title: "كل أنواع المشاهد",
            subtitle: "اثنا عشر مشهداً جاهزاً للإنتاج"
          },
          {
            type: "statement",
            duration: 90,
            text: "السرعة ليست ميزة، السرعة هي المنتج",
            emphasis: "المنتج"
          },
          {
            type: "features",
            duration: 110,
            title: "ليه تختارنا؟",
            items: [
              "أداء فائق السرعة",
              "أمان على مستوى المؤسسات",
              "تكامل مع أدواتك",
              "دعم على مدار الساعة"
            ],
            icons: ["bolt", "shield", "globe", "clock"]
          },
          {
            type: "stat",
            duration: 90,
            prefix: "",
            value: 98,
            suffix: "%",
            label: "نسبة رضا العملاء"
          },
          {
            type: "quote",
            duration: 110,
            quote: "وفّرنا نصف وقت الفريق من أول أسبوع، والنتيجة كانت واضحة في الأرقام",
            author: "سارة أحمد",
            role: "مديرة العمليات"
          },
          {
            type: "comparison",
            duration: 120,
            title: "قبل وبعد",
            beforeLabel: "قبل",
            before: [
              "تقارير يدوية",
              "أخطاء متكررة"
            ],
            afterLabel: "بعد",
            after: [
              "تقارير لحظية",
              "دقة كاملة"
            ]
          },
          {
            type: "steps",
            duration: 120,
            title: "ابدأ في ٣ خطوات",
            steps: [
              "سجّل حسابك",
              "اربط أدواتك",
              "شاهد النتائج"
            ]
          },
          {
            type: "chart",
            duration: 110,
            title: "نمو الإيرادات",
            suffix: "K",
            bars: [
              {
                label: "٢٠٢٣",
                value: 120
              },
              {
                label: "٢٠٢٤",
                value: 260
              },
              {
                label: "٢٠٢٥",
                value: 540
              }
            ]
          },
          {
            type: "device",
            duration: 110,
            title: "كل شيء في جيبك",
            caption: "تطبيق سريع وبسيط على كل الأجهزة",
            image: ""
          },
          {
            type: "image",
            duration: 100,
            title: "مصمم للمستقبل",
            subtitle: "بنية تحتية سحابية آمنة",
            image: "",
            imagePrompt: "abstract dark tech"
          },
          {
            type: "logo",
            name: "",
            duration: 75,
            tagline: "التقنية بلمسة إنسانية"
          },
          {
            type: "outro",
            duration: 90,
            title: "جاهز تبدأ؟",
            cta: "جرّبه مجاناً",
            url: "nova.tech"
          }
        ]
      }}
    />
  </>
);
