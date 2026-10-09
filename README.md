# Motion Studio — فكرة ← فيديو احترافي

Remotion + React + TypeScript · عربي RTL أولاً · 9:16 / 1:1 / 4:5 / 16:9 · 30fps

تكتب الفكرة أو تحط لينك الموقع، والنظام بيعمل الباقي:
- يكتب الـ hook والسكريبت ويراجعهم.
- يسجّل الصوت بلهجة الفكرة.
- يولّد مزيكا متزامنة مع المشاهد، ويعمل الترجمة والصور.
- يراجع النتيجة بصرياً ويطلّع mp4.

وبعدها تقدر تعدّل أي حاجة بإيدك في المحرر المرئي.

## التشغيل

```bash
npm install
export OMNIROUTE_API_KEY=...        # أو انسخ .env.example إلى .env
npm run editor                       # يبني المحرر المرئي (مرة واحدة بعد أي تحديث)
npm run dashboard                    # http://localhost:4777
```

من الترمينال:

```bash
npm run make -- "الفكرة…" --client nova
npm run make -- "فيديو إطلاق لمنتجنا" --url https://example.com --tier premium
npm run revise -- "خلّي الـ hook أقوى، واللون الأساسي أخضر #10b981"
npm run render -- <job> --version 4      # رندر نسخة اتحفظت من المحرر
npm run reformat -- --format 1:1
```

كل فيديو بيتحفظ في `jobs/<id>/v<n>/` وفيه:
- `video-*.mp4`
- `review.html`: الفيديو، وصورة لكل مشهد، والنص، وملاحظات الـ QA.
- `props.json`

## خط الإنتاج

```
[--url] ← حقائق + لوجو + ألوان من موقع العميل
الفكرة ─▶ Director (hook/angle/style/music) ─▶ Hook tournament ─▶ Writer (JSON + zod ↺) ─▶ Critic ↺ ─▶ حارس الأرقام ↺
       ─▶ صوت Azure/Edge (توقيت كل كلمة) ─▶ صور / فيديو AI ─▶ مزيكا مولّدة + قطع على الإيقاع ─▶ stills ─▶ QA (كود + vision)
       ─▶ (تصحيح تلقائي) ─▶ mp4 + review ─▶ [نسخ A/B بـ hooks مختلفة]
```

**Hook tournament:**
1. يولّد حوالي 14 hook بـ 8 تقنيات.
2. يشيل العبارات المستهلكة.
3. حَكَم يقارنهم أزواج، وكل زوج بالترتيبين، والحكم اللي ماثبتش في الترتيبين يتشال.
4. ترتيب Bradley-Terry.

**Critic:** ناقد بيمسك الكلام العام والتكرار والترجمة الحرفية، والكاتب يعيد مرة.

**حارس الأرقام:** أي رقم أو موقع على الشاشة مش موجود في الفكرة أو حقائق الموقع يرجع للكاتب، أو يتمسح.

| الدور | الموديل (OmniRoute) |
|---|---|
| director / judge | `mimotp/mimo-v2.5-pro` ← `antigravity/gemini-3.1-pro-high` |
| vision | `antigravity/gemini-3.1-pro-high` |
| writer / hooks / brand facts | `ds/deepseek-flash` ← `mimotp/mimo-v2.5-pro` ← `groq/openai/gpt-oss-120b` |
| صوت | Azure Neural عن طريق Edge، مجاني: 32 صوت عربي بكل اللهجات، ومعاهم توقيت كل كلمة. ElevenLabs اختياري بـ `--voice <id>` |
| صور | `antigravity/gemini-3.1-flash-image` |
| فيديو AI | اختياري: `MOTION_VIDEO=veo-free/veo` (شوف الملاحظات) |

كل دور ليه قائمة بدائل. **تغيّر الموديلات من لوحة التحكم:** "⚙️ موديلات الذكاء الاصطناعي" (`/settings`).
- لكل دور تكتب الموديل الأساسي والبدائل، فيه زرار "اختبر"، والحفظ بيتطبق فوراً.
- الإعدادات بتتحفظ في `settings.json`، وليها الأولوية على `.env` وعلى الافتراضي.
- الافتراضي حالياً للمخرج والحَكَم هو `mimotp/mimo-v2.5-pro`.

**الكاش:** أي جملة صوت أو صورة أو مزيكا اتعملت قبل كده مابتتعملش تاني.

## مستويات الجودة (`--tier`)

| | draft | standard (الافتراضي) | premium |
|---|---|---|---|
| Hook tournament + critic | – | ✓ | ✓ |
| صور AI + QA بصري | – | ✓ | ✓ |
| نسخ A/B بـ hooks مختلفة | – | – | 3 |
| تصحيح تلقائي من الـ QA | – | – | ✓ |

## الشكل: Style Packs (`--style`، أو المخرج يختار)

`premium-tech` · `apple-minimal` · `cyber-neon` · `editorial` · `bold-pop`

كل pack بيحدد الحاجات دي:
- **الحركة:** منحنى الحركة والـ overshoot، وترتيب ظهور العناصر (stagger).
- **الكاميرا:** نوعها (drift / push / float / static)، مع parallax بين الطبقات وzoom-through وانت خارج من المشهد.
- **الانتقالات:** منها shader زي zoom-blur وcross-zoom وfilm-burn.
- **الخلفيات:** orbs / grid floor / mesh / aurora / spotlight / minimal، وبتتغيّر من مشهد للتاني.
- **اللمسة النهائية:** grain وvignette وlight leaks وchromatic aberration.
- **النص:** طريقة ظهوره (blur / rise / wipe / scale)، وخط العناوين (Reem Kufi، Lalezar، Kufam، El Messiri…)، وشكل الـ accent.

البراند (الألوان واللوجو والخط) في الـ theme، والحركة في الـ pack. ينفع تغيّر أي مشهد بـ `camera` أو `background`.

## المشاهد (13 نوع)

intro · statement · features (أيقونات بترسم نفسها) · stat · quote · comparison · steps · chart · device · image (صورة "حية") · video (b-roll) · logo · outro

**إضافة نوع جديد:**
1. schema في `src/schema.ts`.
2. component + case في `src/scenes/scenes.tsx`.
3. سطر في `sceneCatalog` (`pipeline/prompts.ts`).
4. مدة دنيا في `pipeline/timing.ts`.

المحرر بيعمل الفورم بتاعه لوحده.

## الصوت والمزيكا

- **الراوي:** بيتختار حسب اللهجة والنوع (`--gender male|female`)، أو تحدده بـ `--voice ar-AE-HamdanNeural`.
- **المزيكا:** متولدة بالكود (`pipeline/music.ts`)، وأي track جديد ومش مكرر فمفيش أي مشاكل حقوق. 5 أنواع: `tech-pulse`، `cinematic`، `upbeat-pop`، `minimal`، `lofi`، وفيها drums وbass وpads بـ sidechain وarps وpiano وrisers. وبما إن السرعة معروفة، القطعات بين المشاهد بتقع على الإيقاع، والكلمات المميزة والـ CTA بينبضوا معاه.
- **مزيكا مرخّصة بتاعتك:** `--music music/my-track.mp3`، والإيقاع بيتكشف أوتوماتيك.

## التحكم الكامل: المحرر المرئي (`/edit/<job>` من الداشبورد)

- **المعاينة:** فورية بنفس محرك الرندر (`@remotion/player`).
- **المشاهد:** ترتيب بالسحب، ونسخ، وحذف، وإضافة أي نوع.
- **الفورم:** فورم لكل مشهد بيتبني من الـ schema، وفيه عدّاد للحروف.
- **التايملاين:** تشد طرف المشهد علشان تغيّر مدته.
- **الألوان والخطوط والستايل والمقاس:** كلها من تاب "Video & brand".
- **تراجع:** Undo/Redo (⌘Z / ⇧⌘Z).
- **القفل 🔒:** أي حقل عدّلته بإيدك بيتقفل، فالـ AI مايقدرش يغيّره.
- **"Rewrite scene with AI":** يعيد كتابة مشهد واحد بتعليمات منك.
- **Save:** بيحفظ نسخة جديدة. الجمل اللي ماتغيرتش بتحتفظ بصوتها، واللي اتغيرت بس بتتسجّل.
- **Render mp4:** يرندر النسخة.

**مراجعة العميل:**
1. "🔗 رابط مراجعة العميل" بيفتح الفيديو، والعميل يكتب تعليق، والتعليق بيتسجّل عند الثانية اللي هو فيها.
2. "طبّق التعليقات" بيحوّلهم لتعديل AI بالمشهد والثانية.

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run make -- "<idea>"` | `--client` `--url` `--brand-theme` `--tier` `--style` `--music` `--variants` `--format` `--dialect` `--gender` `--voice` `--screens` `--clips` `--logo` `--seconds` `--draft` `--qa-fix` `--no-voice/images/music/captions/qa` |
| `npm run revise -- [<job>] "<feedback>"` | تعديل بالكلام |
| `npm run render -- [<job>] [--version n]` | رندر نسخة |
| `npm run reformat -- [<job>] --format 16:9` | مقاس تاني من غير AI |
| `npm run batch -- ideas.json` | فيديوهات كتير |
| `npm run bench -- --writers a,b` | مقارنة موديلات الكتابة (judge + Jev) |
| `npm run cost -- [<job>]` | الاستهلاك (الأسعار في `pipeline/prices.json`) |
| `npm run dashboard` / `npm run editor` / `npm run studio` | الواجهات |
| `npm test` / `npm run typecheck` | الاختبارات |

## الجودة والأمان

- **QA بالكود:** المشاهد بتبلّغ لو المحتوى اتصغّر علشان يدخل في الكادر أو النص بقى صغير جداً، والتباين بيتحسب بمعيار WCAG. الـ vision model بياخد النتايج دي كحقائق، ويركز على الشكل والكلام.
- **الداشبورد:** شغال على localhost وعلى عنوان Tailscale بتاعك بس، وبيرفض أي طلب جاي من موقع تاني (Host/Origin). مش متاح على شبكة البيت ولا على الإنترنت. رابط المراجعة بيحتاج token.
- **من برّه البيت:** افتح `http://hmac:4777` من أي جهاز عليه Tailscale. اسم الجهاز بيتكشف لوحده، ولو Tailscale اشتغل بعد الداشبورد، الداشبورد بيستناه.

## ملاحظات

- **الفيديو المولّد بالـ AI (veo/seedance المجانيين في OmniRoute):** بياخد أكتر من 100 ثانية، فـ Cloudflare بيقطعه (524). علشان يشتغل لازم تعمل حاجة من دول:
  - تخلّي `api.h93lab.com` يعدّي من غير الـ proxy (DNS only).
  - تفتح OmniRoute على عنوان من غير Cloudflare.

  وبعدها حط `MOTION_VIDEO=veo-free/veo,veo-free/seedance`. لحد ما ده يحصل، مشهد الـ video بيستعمل صورة AI "حية" (عمق + light sweep + particles)، أو كليباتك بـ `--clips`.
- **Lyria:** محتاج رصيد OpenRouter (0.5$ على الأقل)، فالمزيكا متولدة بالكود.
- **صوت Edge:** خدمة Microsoft المجانية الخاصة بالقراءة بصوت عالي (طريقة غير رسمية)؛ مناسبة للاستخدام الشخصي. للعملاء استعمل Azure Speech الرسمي أو ElevenLabs مدفوع.
- **الترخيص:** Remotion مجاني للأفراد والفرق لحد 3 أشخاص.
