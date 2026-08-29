/**
 * CDN bileşen indirmesi.
 *
 * POC-1'de doğrulanan URL sözleşmesi — bu detaylar deneme yanılmayla bulundu,
 * değiştirmeden önce ölçün:
 *   {base};revision=0?component_id=<id>&api_key=CometServer1&access_token=<tok>
 *
 *   · `;revision=0` ZORUNLU — yoksa 400
 *   · `component_id` çalışır
 *   · `component_path` 400 döner — kullanmayın
 *
 * Hata mesajlarında URL redakte edilir (Kural 2).
 */
import { redactUrl, redactedError } from '../../util/redact.js';
import type { PrototypeData } from './share.js';
import { olc } from '../../util/trace.js';

export const CONTENT_TYPES = {
  agc: 'application/vnd.adobe.agc.graphicstree+json',
  globalResources: 'application/vnd.adobe.uxdesign.globalresources+json',
  interactions: 'application/vnd.adobe.uxdesign.interactions+json',
} as const;

/** `linkTemplate`'ten bileşen URL'i kurar. */
export function componentUrl(proto: PrototypeData, componentId: string, revision = 0): string {
  const base = proto.linkTemplate.href.split('{')[0]!;
  const q = new URLSearchParams({
    component_id: componentId,
    api_key: proto.linkTemplate.data.api_key,
    access_token: proto.linkTemplate.data.access_token,
  });
  return `${base};revision=${revision}?${q.toString()}`;
}

/** Bileşeni JSON olarak indirir; `expectType` verilirse content-type doğrulanır. */
export async function fetchComponentJson<T = unknown>(
  proto: PrototypeData,
  componentId: string,
  expectType?: string,
  timeoutMs = 60_000
): Promise<T> {
  const url = componentUrl(proto, componentId);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await olc('cdn-indirme', () => fetch(url, { signal: ctrl.signal }));
  } catch (e) {
    throw redactedError(`bileşen indirilemedi (${redactUrl(url)}): ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw redactedError(
      `bileşen ${res.status} döndü: ${redactUrl(url)}\n` +
        (res.status === 400
          ? '  400 genelde URL sözleşmesi hatası: ";revision=0" eksik ya da component_path kullanılmış.'
          : res.status === 401 || res.status === 403
            ? '  Token süresi dolmuş olabilir — shell yeniden alınmalı (token saklanmaz).'
            : '')
    );
  }
  const ct = res.headers.get('content-type') ?? '';
  if (expectType && !ct.includes(expectType)) {
    throw redactedError(
      `CDN sözleşmesi değişmiş olabilir: beklenen "${expectType}", gelen "${ct}".`
    );
  }
  return (await res.json()) as T;
}
