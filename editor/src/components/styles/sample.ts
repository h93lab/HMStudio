import type {Theme} from '@/lib/api';
import {DEFAULT_THEME} from '@/components/library/brand';
import type {Pack} from '../../../../src/design/packs';
import type {VideoProps} from '../../../../src/schema';

// Short 4-scene video used to preview a style pack in the Styles editor.
export const sampleVideo = (theme: Theme | undefined, pack: Pack): VideoProps => {
  const t = theme ?? DEFAULT_THEME('Motion Studio');
  const ar = t.direction === 'rtl';
  const s = (en: string, arText: string) => (ar ? arText : en);
  return {
    theme: t,
    format: '9:16',
    style: 'premium-tech',
    pack,
    showCaptions: false,
    music: '',
    musicVolume: 0,
    sfx: false,
    scenes: [
      {type: 'intro', duration: 75, kicker: s('New', 'جديد'), title: s('Meet the future', 'مستقبل جديد'), subtitle: s('Motion that feels like your brand', 'حركة تشبه علامتك')},
      {type: 'statement', duration: 70, text: s('Make every second count', 'اجعل كل ثانية مهمة'), emphasis: s('every second', 'كل ثانية')},
      {type: 'stat', duration: 70, prefix: '', value: 87, suffix: '%', label: s('say it looks premium', 'يرونه فاخراً')},
      {type: 'outro', duration: 75, title: s('Ready to start?', 'جاهز للبدء؟'), cta: s('Get started', 'ابدأ الآن'), url: 'example.com'},
    ],
  };
};
