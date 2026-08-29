/**
 * Contract health check — fail fast before starting a long extraction.
 *
 * The XD viewer is a private implementation; producing a SILENTLY WRONG result when the
 * contract breaks would be the worst outcome. So the checks return a diagnosis.
 */
import type { PrototypeData } from './share.js';

export type Seviye = 'ok' | 'uyari' | 'hata';
export interface Kontrol { ad: string; seviye: Seviye; detay: string }

/** Known AGC schema versions. Outside this set a warning is raised, but work continues. */
export const BILINEN_AGC_SURUMLERI = new Set(['1.5.0']);

export function checkPrototype(proto: PrototypeData): Kontrol[] {
  const k: Kontrol[] = [];
  const push = (ad: string, seviye: Seviye, detay: string) => k.push({ ad, seviye, detay });

  push('prototypeData', 'ok', 'bulundu ve JSON olarak ayrıştırıldı (eval kullanılmadı)');

  const tok = proto.linkTemplate?.data?.access_token;
  if (!tok) push('access_token', 'hata', 'yok — link özel/parolalı olabilir');
  else {
    // The token prefix is an epoch: `<exp>_urn:...`. If it has expired, the shell must be re-fetched.
    const exp = Number(tok.split('_')[0]);
    if (Number.isFinite(exp)) {
      const kalanDk = Math.round((exp * 1000 - Date.now()) / 60000);
      if (kalanDk <= 0) push('access_token', 'hata', 'süresi dolmuş — shell yeniden alınmalı');
      else push('access_token', 'ok', `geçerli (~${kalanDk} dk kaldı, saklanmıyor)`);
    } else push('access_token', 'uyari', 'biçim tanınmadı — süre kontrolü yapılamadı');
  }

  const ab = proto.manifest?.artboards ?? [];
  if (!ab.length) push('artboards', 'hata', 'manifest.artboards boş');
  else {
    const bozuk = ab.filter(
      (a) => !a.bounds || ['x', 'y', 'width', 'height'].some((f) => typeof (a.bounds as any)?.[f] !== 'number')
    );
    if (bozuk.length) push('artboards', 'hata', `${bozuk.length} artboard'ın bounds'u sayısal değil`);
    else push('artboards', 'ok', `${ab.length} artboard, bounds'lar sayısal`);
  }

  const primarysiz = ab.filter((a) => !(a.components ?? []).some((c) => c.rel === 'primary'));
  if (primarysiz.length) {
    push('graphicContent', 'uyari', `${primarysiz.length} artboard'da primary bileşen yok — çıkarılamaz`);
  } else if (ab.length) {
    push('graphicContent', 'ok', 'her artboard primary bileşen taşıyor');
  }

  if (proto.manifest?.includeSpecs === false) {
    push('includeSpecs', 'uyari', 'paylaşımda spec modu kapalı — ölçüler yine de AGC\'den gelir');
  }
  return k;
}

export function checkAgc(agc: Record<string, any>, bilinmeyenTipler: Record<string, number>, toplamDugum: number): Kontrol[] {
  const k: Kontrol[] = [];
  const v = agc?.version;
  if (!v) k.push({ ad: 'agc.version', seviye: 'uyari', detay: 'sürüm alanı yok' });
  else if (!BILINEN_AGC_SURUMLERI.has(v))
    k.push({
      ad: 'agc.version',
      seviye: 'uyari',
      detay: `bilinmeyen sürüm "${v}" — normalize sonucu ŞÜPHELİ sayılmalı`,
    });
  else k.push({ ad: 'agc.version', seviye: 'ok', detay: v });

  const bilinmeyenAdet = Object.values(bilinmeyenTipler).reduce((a, b) => a + b, 0);
  const oran = toplamDugum ? (100 * bilinmeyenAdet) / toplamDugum : 0;
  k.push({
    ad: 'bilinmeyen tip',
    seviye: oran > 2 ? 'uyari' : 'ok',
    detay:
      `%${oran.toFixed(2)} (${bilinmeyenAdet}/${toplamDugum})` +
      (bilinmeyenAdet ? ` — ${Object.entries(bilinmeyenTipler).map(([t, n]) => `${t}×${n}`).join(', ')}` : ''),
  });
  return k;
}

export function enKotuSeviye(k: Kontrol[]): Seviye {
  if (k.some((x) => x.seviye === 'hata')) return 'hata';
  if (k.some((x) => x.seviye === 'uyari')) return 'uyari';
  return 'ok';
}
