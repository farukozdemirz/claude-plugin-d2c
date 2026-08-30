/**
 * Detects UI capabilities the project already has.
 *
 * WHY THIS IS MEASURED: the rule is "use the project's package; if there is none, ask".
 * Leaving step one to judgement means the model decides "there probably isn't one" and
 * hand-writes a carousel. That actually happened — a `useCarousel` hook with scroll
 * listeners, an index state and a ResizeObserver appeared in a project that was never
 * asked about a package.
 *
 * Reading `package.json` is a fact, not a judgement.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface PaketBulgusu {
  /** The package.json that was read, or null when none was found. */
  paketJson: string | null;
  /** Installed carousel/slider packages. */
  carousel: string[];
  /** Headless UI kits that already ship the relevant primitives. */
  uiKit: string[];
  /** Animation libraries — not carousels, but worth knowing about. */
  animasyon: string[];
}

/**
 * Known carousel/slider packages. The list is deliberately explicit: guessing from a
 * name ("does anything contain 'slide'?") produces false positives.
 */
export const CAROUSEL_PAKETLERI = [
  'swiper',
  'embla-carousel', 'embla-carousel-react', 'embla-carousel-autoplay',
  'keen-slider',
  '@splidejs/react-splide', '@splidejs/splide',
  'react-slick', 'slick-carousel',
  'react-responsive-carousel',
  'react-multi-carousel',
  'flickity',
  'glidejs', '@glidejs/glide',
];

export const UI_KIT_PAKETLERI = [
  '@radix-ui/react-tabs', '@radix-ui/react-accordion', '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu', '@radix-ui/react-navigation-menu',
  '@headlessui/react', '@mantine/carousel', '@nextui-org/react', '@chakra-ui/react',
];

export const ANIMASYON_PAKETLERI = ['framer-motion', 'motion', '@react-spring/web'];

/** Walks up from a directory looking for the nearest package.json. */
export function paketJsonBul(baslangic: string, tavan = 6): string | null {
  let d = resolve(baslangic);
  for (let i = 0; i < tavan; i++) {
    const p = join(d, 'package.json');
    if (existsSync(p)) return p;
    const ust = dirname(d);
    if (ust === d) break;
    d = ust;
  }
  return null;
}

/** Reports which of the known packages the project has installed. */
export function paketleriBul(baslangic: string): PaketBulgusu {
  const paketJson = paketJsonBul(baslangic);
  if (!paketJson) return { paketJson: null, carousel: [], uiKit: [], animasyon: [] };

  let bagimliliklar: Record<string, string> = {};
  try {
    const j = JSON.parse(readFileSync(paketJson, 'utf8'));
    bagimliliklar = { ...(j.dependencies ?? {}), ...(j.devDependencies ?? {}) };
  } catch {
    // An unreadable package.json is not a reason to claim "no package exists" —
    // returning an empty list here would send the caller down the "ask" path, which is
    // the safe direction anyway.
    return { paketJson, carousel: [], uiKit: [], animasyon: [] };
  }

  const var_ = (liste: string[]) => liste.filter((p) => p in bagimliliklar);
  return {
    paketJson,
    carousel: var_(CAROUSEL_PAKETLERI),
    uiKit: var_(UI_KIT_PAKETLERI),
    animasyon: var_(ANIMASYON_PAKETLERI),
  };
}

/** Human-readable summary — the block the code phase reads before writing a carousel. */
export function paketleriYaz(p: PaketBulgusu): string {
  const s: string[] = ['## Kurulu UI paketleri'];
  if (!p.paketJson) {
    s.push('   package.json bulunamadı — paket tespiti YAPILAMADI, varsayma');
    return s.join('\n') + '\n';
  }
  s.push(`   carousel : ${p.carousel.length ? p.carousel.join(', ') : '— YOK'}`);
  if (p.uiKit.length) s.push(`   ui kit   : ${p.uiKit.join(', ')}`);
  if (p.animasyon.length) s.push(`   animasyon: ${p.animasyon.join(', ')}`);
  s.push(p.carousel.length
    ? '   → Carousel gerekiyorsa MEVCUT paketi kullan; yenisini kurma.'
    : '   ⚠ Carousel paketi YOK — kendi motorunu YAZMA. Kullanıcıya sor (SKILL.md §3a4).');
  return s.join('\n') + '\n';
}
