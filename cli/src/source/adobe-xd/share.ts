/**
 * XD paylaşım linkinin shell HTML'ini okur ve `window.prototypeData`'yı çıkarır.
 *
 * GÜVENLİK — ana plan Kural 1: uzak JS HİÇBİR koşulda çalıştırılmaz.
 * `window.prototypeData = {...}` bir JS ataması ve onu okumanın kolay yolu `eval`.
 * Yasak: uzak sunucudan gelen bir dizgiyi çalıştırmak, geliştirme ortamında keyfi
 * kod çalıştırmaktır. Bunun yerine atamanın sağ tarafı süslü parantez eşlemesiyle
 * kesilir ve YALNIZ `JSON.parse` ile ayrıştırılır.
 *
 * Bu yolun çalıştığı POC-1'de doğrulandı: manifest tam olarak böyle ayrıştırıldı.
 * `JSON.parse` başarısız olursa sözleşme değişmiş demektir — teşhisle durulur,
 * asla çalıştırmaya düşülmez.
 */
import { redactedError } from '../../util/redact.js';
import { olc } from '../../util/trace.js';

export interface Artboard {
  id: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  viewport?: { height: number };
  components: Array<{ id: string; path: string; rel?: string; type?: string }>;
  resources?: string[];
}

export interface Manifest {
  id: string;
  name: string;
  docId?: string;
  artboards: Artboard[];
  interactions?: { id: string; path: string };
  globalResources?: { id: string; path: string };
  resources?: Record<string, { id: string; path: string }>;
  includeSpecs?: boolean;
}

export interface PrototypeData {
  manifest: Manifest;
  linkTemplate: { href: string; data: { api_key: string; access_token: string } };
  modifiedDate?: number;
  appVersion?: string;
  ownerId?: string;
}

/**
 * `window.<isim> = <JSON>` atamasının sağ tarafını süslü parantez eşlemesiyle keser.
 *
 * String literal'lerin içindeki `{`/`}` ve kaçışlı tırnaklar dikkate alınır —
 * yoksa metin içinde geçen bir süslü parantez eşlemeyi bozardı.
 *
 * Atamanın sağı bir nesne/dizi DEĞİLSE `null` döner. Bu önemli: Adobe geçersiz
 * linke **HTTP 200 + `window.prototypeData = null`** dönüyor. Bu kontrol olmadan
 * tarayıcı sonraki bir `{`'ye atlayıp alakasız bir blok keser ve kullanıcının link
 * yazım hatası "Adobe sözleşmeyi değiştirdi" diye raporlanır.
 */
export function sliceAssignment(html: string, varName: string): string | null {
  const m = new RegExp(`window\\.${varName}\\s*=\\s*`).exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  // Sağ taraf nesne/dizi ile başlamıyorsa (null, undefined, sayı…) veri yok demektir.
  const ilk = html.slice(start, start + 32).trimStart()[0];
  if (ilk !== '{' && ilk !== '[') return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < html.length; i++) {
    const c = html[i]!;
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

/** Shell HTML'inden `prototypeData`'yı ayrıştırır. eval YOK. */
export function parsePrototypeData(html: string): PrototypeData {
  const raw = sliceAssignment(html, 'prototypeData');
  if (!raw) {
    // İki ayrı durumu ayır — teşhis kullanıcıyı doğru yere göndermeli.
    if (/window\.prototypeData\s*=\s*null/.test(html)) {
      throw redactedError(
        'XD linki geçersiz veya erişilemiyor (sunucu boş veri döndürdü).\n' +
          '  · Linkte yazım hatası olabilir\n' +
          '  · Paylaşım kaldırılmış veya süresi dolmuş olabilir\n' +
          '  · Link herkese açık bir "view" linki olmayabilir'
      );
    }
    throw redactedError(
      'XD paylaşım sözleşmesi değişmiş olabilir: window.prototypeData bulunamadı.\n' +
        '  Sunucu artık veriyi HTML içinde basmıyor olabilir. Ana plan §5 "B yolu tetiği".'
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    // Çalıştırmaya DÜŞÜLMEZ — teşhisle durulur.
    throw redactedError(
      `window.prototypeData JSON olarak ayrıştırılamadı (${(e as Error).message}).\n` +
        '  Sözleşme değişmiş olabilir. eval kullanılmaz; elle inceleyin.'
    );
  }
  const d = data as PrototypeData;
  if (!d?.manifest?.artboards?.length) {
    throw redactedError('prototypeData.manifest.artboards boş veya yok.');
  }
  if (!d?.linkTemplate?.data?.access_token) {
    throw redactedError(
      'linkTemplate.access_token yok — link özel/parolalı olabilir.\n' +
        '  Herkese açık bir "view" linki gerekiyor.'
    );
  }
  return d;
}

/** specs URL'ini normalize eder — spec paneli için sonu `/specs/` olmalı. */
export function normalizeShareUrl(url: string): string {
  const u = url.trim().replace(/\s+$/, '');
  if (/\/specs\/?$/.test(u)) return u.endsWith('/') ? u : u + '/';
  return u.replace(/\/$/, '') + '/specs/';
}

/** Shell HTML'ini çeker. Token ASLA saklanmaz — her koşuda taze alınır. */
export async function fetchShare(url: string, timeoutMs = 60_000): Promise<PrototypeData> {
  const target = normalizeShareUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await olc('xd-shell', () => fetch(target, { signal: ctrl.signal, redirect: 'follow' }));
  } catch (e) {
    throw redactedError(`XD linki açılamadı: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw redactedError(`XD linki ${res.status} döndü — link geçersiz veya yayından kaldırılmış.`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/html')) {
    throw redactedError(`Beklenen text/html yerine "${ct}" geldi.`);
  }
  return parsePrototypeData(await res.text());
}
