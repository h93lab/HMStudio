import {Composition} from 'remotion';
import {SceneEngine, calculateMetadata, videoSchema} from './engine/SceneEngine';

// One composition = one client profile (Promo-<client>); the pipeline reads its theme and renders it with AI-written scenes.
// Keep attributes static (no spread) and defaultProps inline: that is what lets the Studio's Save button
// (props panel) and right-click → Duplicate write profiles back here.
// `Showcase` renders every scene type for visual QA.
export const Root: React.FC = () => (
  <>
    <Composition
      id="Promo-nova"
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
            kicker: "إطلاق جديد",
            title: "المستقبل يبدأ الآن",
            subtitle: "منصة ذكية تعيد تعريف سرعة العمل"
          },
          {
            type: "features",
            duration: 120,
            title: "ليه تختارنا؟",
            items: [
              "أداء فائق السرعة",
              "أمان على مستوى المؤسسات",
              "تكامل مع أدواتك"
            ]
          },
          {
            type: "stat",
            duration: 90,
            prefix: "",
            value: 250000,
            suffix: "+",
            label: "مستخدم يثقون بنا"
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
    <Composition
      id="Promo-sahara"
      component={SceneEngine}
      schema={videoSchema}
      calculateMetadata={calculateMetadata}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        theme: {
          client: "Sahara Labs",
          direction: "rtl",
          numerals: "arab",
          font: "Cairo",
          displayFont: "none",
          logo: "",
          colors: {
            background: "#0d0a06",
            surface: "rgba(255,214,150,0.07)",
            primary: "#f59e0b",
            accent: "#fb7185",
            text: "#fff8ec",
            muted: "#b8a68a"
          },
          radius: 20,
          glow: 0.5,
          motion: {
            speed: 1.2,
            damping: 26
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
            kicker: "إطلاق جديد",
            title: "المستقبل يبدأ الآن",
            subtitle: "منصة ذكية تعيد تعريف سرعة العمل"
          },
          {
            type: "features",
            duration: 120,
            title: "ليه تختارنا؟",
            items: [
              "أداء فائق السرعة",
              "أمان على مستوى المؤسسات",
              "تكامل مع أدواتك"
            ]
          },
          {
            type: "stat",
            duration: 90,
            prefix: "",
            value: 250000,
            suffix: "+",
            label: "مستخدم يثقون بنا"
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
    <Composition
      id="Promo-orbit"
      component={SceneEngine}
      schema={videoSchema}
      calculateMetadata={calculateMetadata}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        theme: {
          client: "Orbit",
          direction: "ltr",
          numerals: "latn",
          font: "Readex Pro",
          displayFont: "none",
          logo: "",
          colors: {
            background: "#020617",
            surface: "rgba(148,163,184,0.08)",
            primary: "#10b981",
            accent: "#a3e635",
            text: "#ecfdf5",
            muted: "#7c8ea6"
          },
          radius: 12,
          glow: 0.4,
          motion: {
            speed: 0.9,
            damping: 14
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
            kicker: "إطلاق جديد",
            title: "المستقبل يبدأ الآن",
            subtitle: "منصة ذكية تعيد تعريف سرعة العمل"
          },
          {
            type: "features",
            duration: 120,
            title: "ليه تختارنا؟",
            items: [
              "أداء فائق السرعة",
              "أمان على مستوى المؤسسات",
              "تكامل مع أدواتك"
            ]
          },
          {
            type: "stat",
            duration: 90,
            prefix: "",
            value: 250000,
            suffix: "+",
            label: "مستخدم يثقون بنا"
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
