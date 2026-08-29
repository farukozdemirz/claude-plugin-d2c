/**
 * Token redaksiyonu — MERKEZÎ tek nokta.
 *
 * Ana plan Kural 2: Adobe `access_token` stdout/stderr, --verbose/--trace, hata
 * mesajları, runs.jsonl ve commit edilen fixture'lara HİÇBİR koşulda yazılmaz.
 *
 * Token tüm tasarım dokümanına okuma erişimi veriyor ve her CDN isteğinin sorgu
 * dizgisinde bulunuyor. Bu yüzden dışarı çıkan her URL buradan geçer — çağıranın
 * "bu log zararsız" diye karar vermesine bırakılmaz.
 */

/** Sorgu dizgisinde değeri gizlenecek parametreler. */
const GIZLI = new Set(['access_token', 'api_key']);

/** URL'deki gizli sorgu parametrelerini maskeler. Parse edilemezse kaba maskeye düşer. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (GIZLI.has(k)) u.searchParams.set(k, '***');
    }
    return u.toString();
  } catch {
    return redactText(url);
  }
}

/**
 * Serbest metinde token deseni arar ve maskeler.
 * Adobe token biçimi: `<epoch>_urn:aaid:sc:<bölge>:<uuid>;public_<hex>`
 */
export function redactText(s: string): string {
  return s
    .replace(/(access_token|api_key)=([^&\s"']+)/gi, '$1=***')
    .replace(/\d{10}_urn:aaid:sc:[^;\s"']+;public_[0-9a-f]+/gi, '***');
}

/** Derin yapıdaki string'leri redakte eder — JSON çıktısı ve fixture yazımı için. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactText(value) as unknown as T;
  if (Array.isArray(value)) return value.map(redactDeep) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = GIZLI.has(k) ? '***' : redactDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}

/** Redakte edilmiş mesajla hata — throw yolunun da sızdırmaması için. */
export function redactedError(message: string): Error {
  return new Error(redactText(message));
}
