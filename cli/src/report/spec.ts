/**
 * spec.md — İNSAN için rapor. Claude'un girdisi `olcum.json`; bu dosya okunabilirlik için.
 *
 * Format `d2c-spec` SKILL.md'den: ekran · palet · character styles · ölçülen elemanlar ·
 * hesaplanan boşluklar. Kaynak işaretleri korunuyor:
 *   P = panelden okunan (artık: kaynak veriden) · Ö = pikselden ölçülen · H = hesaplanan
 */
import type { Olcum } from '../contracts/olcum.js';

const n2 = (v: number | null | undefined) => (v == null ? '—' : String(+v.toFixed(2)));

export function specMarkdown(o: Olcum): string {
  const L: string[] = [];
  const b = o.bolum;
  L.push(`# ${b.ad ?? `Bölüm ${b.index}`}`);
  L.push('');
  L.push(`- **Ekran:** ${o.kaynak.ekran}`);
  const kutu = b.desktop ?? b.mobil;
  L.push(`- **Bölüm kutusu:** ${kutu ? `Y ${kutu[1]} · yükseklik ${kutu[3]} · genişlik ${kutu[2]}` : '—'}`);
  L.push(`- **Zemin:** ${b.zemin ?? '—'}`);
  L.push(`- **Kaynak:** ağ tabanlı çıkarma (AGC scenegraph) · üretilme ${o.kaynak.uretilme.slice(0, 19)}`);
  L.push('');
  L.push('> Değerlerin tamamı **kaynak veriden** gelir (işaret: `P`). Piksel ölçümü (`Ö`)');
  L.push('> ve tahmin kullanılmadı. Türetilen boşluklar `H` olarak işaretli.');
  L.push('');

  if (o.palet.length) {
    L.push('## Renk paleti');
    L.push('');
    L.push('| hex | kullanım |');
    L.push('|---|---:|');
    for (const p of o.palet) L.push(`| \`${p.hex}\` | ${p.adet} |`);
    L.push('');
  }

  if (o.stiller.length) {
    L.push('## Character styles');
    L.push('');
    L.push('| aile | ağırlık | punto | satır | renk | hiza | adet |');
    L.push('|---|---|---:|---:|---|---|---:|');
    for (const s of o.stiller) {
      L.push(
        `| ${s.aile ?? '—'} | ${s.agirlik ?? '—'} | ${n2(s.punto)} | ${s.satir == null ? '— *(tek satır)*' : n2(s.satir)} | \`${s.renk ?? '—'}\` | ${s.hiza ?? '—'} | ${s.adet} |`
      );
    }
    L.push('');
    L.push('> `satır` tek satırlık metinlerde **ölçülemez** ve `—` bırakılır — uydurulmaz.');
    L.push('> Yarı-satır telafisi için font kutusu **kod fazında tarayıcıda ölçülür**');
    L.push('> (AGC değeri taşınıyor ama tüketilmiyor — bkz. POC-4).');
    L.push('');
  }

  L.push('## Ölçülen elemanlar');
  L.push('');
  L.push('| eleman | rol | tip | testid | desktop kutu | mobil kutu | radius | renk / kontur | font |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const e of o.elemanlar) {
    const kb = (v?: { kutu: number[] }) => (v ? v.kutu.map((x) => +x.toFixed(1)).join(', ') : '—');
    const d = e.desktop, m = e.mobil;
    const r = d?.radius ?? m?.radius;
    const rk = d?.radiusKaynak ?? m?.radiusKaynak;
    const renk = [d?.dolgu ?? m?.dolgu, (d?.kontur ?? m?.kontur) ? `${(d?.kontur ?? m?.kontur)!.genislik}px ${(d?.kontur ?? m?.kontur)!.renk} (${(d?.kontur ?? m?.kontur)!.hiza})` : null]
      .filter(Boolean).join(' · ') || '—';
    const font = e.font ? `${e.font.aile} ${e.font.agirlik} ${n2(e.font.punto)}${e.font.satir ? '/' + n2(e.font.satir) : ''}` : '—';
    const ad = (e.ad ?? '—') + (e.tekrar ? ` **×${e.tekrar.adet}**` : '');
    L.push(
      `| ${ad} | ${e.rol ?? '—'} | ${e.tip} | ${e.testid ?? '`null`'} | ${kb(d)} | ${kb(m)} | ` +
      `${r ? r.join(',') + (rk ? ` (${rk === 'rect' || rk === 'yol' ? 'P' : rk})` : '') : '—'} | ${renk} | ${font} |`
    );
  }
  L.push('');
  L.push('> `×N` işaretli satırlar **sıkıştırılmış tekrar**: N adet özdeş eleman, düzenli');
  L.push('> adımla dizili. Adım ve aradaki boşluk aşağıdaki tabloda.');
  L.push('> `testid` alanı **kod fazının sorumluluğu**; `null` kaldığı sürece');
  L.push('> `render verify` çalışmaz.');
  L.push('');

  if (o.hesaplanan.length) {
    L.push('## Hesaplanan boşluklar  `H`');
    L.push('');
    L.push('| ne | desktop | mobil | nasıl |');
    L.push('|---|---:|---:|---|');
    for (const h of o.hesaplanan) {
      L.push(`| ${h.ne} | ${n2(h.desktop)} | ${n2(h.mobil)} | \`${h.nasil}\` |`);
    }
    L.push('');
  }

  if (o.kabulEdilenSapmalar.length) {
    L.push('## Kabul edilen sapmalar');
    L.push('');
    for (const k of o.kabulEdilenSapmalar) L.push(`- ${k}`);
    L.push('');
  }

  L.push('## Çözülemedi');
  L.push('');
  if (o.cozulemedi.length) for (const c of o.cozulemedi) L.push(`- ${c}`);
  else L.push('- yok');
  L.push('');
  return L.join('\n');
}
