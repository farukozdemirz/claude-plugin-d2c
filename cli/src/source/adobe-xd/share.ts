/**
 * Reads the shell HTML of an XD share link and extracts `window.prototypeData`.
 *
 * SECURITY — the main plan's Rule 1: remote JS is NEVER executed, under any condition.
 * `window.prototypeData = {...}` is a JS assignment and the easy way to read it is
 * `eval`. That is forbidden: executing a string from a remote server means running
 * arbitrary code in a development environment. Instead the right-hand side of the
 * assignment is sliced by brace matching and parsed with `JSON.parse` ONLY.
 *
 * That this works was verified in POC-1: the manifest was parsed exactly this way.
 * If `JSON.parse` fails, the contract has changed — we stop with a diagnosis, and never
 * fall back to executing anything.
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
 * Slices the right-hand side of a `window.<name> = <JSON>` assignment by brace matching.
 *
 * `{`/`}` inside string literals and escaped quotes are accounted for — otherwise a
 * brace occurring inside text would break the matching.
 *
 * Returns `null` when the right-hand side is NOT an object/array. This matters: Adobe
 * answers an invalid link with **HTTP 200 + `window.prototypeData = null`**. Without
 * this check the parser would jump to the next `{`, slice an unrelated block, and the
 * user's typo would be reported as "Adobe changed the contract".
 */
export function sliceAssignment(html: string, varName: string): string | null {
  const m = new RegExp(`window\\.${varName}\\s*=\\s*`).exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  // If the right-hand side does not start with an object/array (null, undefined, a number…) there is no data.
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

/** Parses `prototypeData` out of the shell HTML. NO eval. */
export function parsePrototypeData(html: string): PrototypeData {
  const raw = sliceAssignment(html, 'prototypeData');
  if (!raw) {
    // Separate the two cases — the diagnosis has to send the user to the right place.
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
    // We do NOT fall back to executing — we stop with a diagnosis.
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

/**
 * Normalises the share URL.
 *
 * XD has more than one link form, and blindly appending `/specs/` to all of them is
 * WRONG. Measured: `https://xd.adobe.com/spec/<id>/grid/` is live and returns 200, but
 * appending `/specs/` makes it 404 — and the tool then blamed THE USER with "the link
 * is invalid or has been withdrawn". The error was not in the link, it was in the
 * address we produced.
 *
 * The rule: only the `/view/<id>...` form is reduced to `/view/<id>/specs/`
 * (including deep prototype links — `/view/<id>/screen/<sid>/`).
 * Other forms are tried AS GIVEN.
 */
export function normalizeShareUrl(url: string): string {
  const u = url.trim().replace(/\s+$/, '');
  const m = /^(https?:\/\/[^/]+)\/view\/([^/?#]+)/i.exec(u);
  if (m) return `${m[1]}/view/${m[2]}/specs/`;
  return u.endsWith('/') ? u : u + '/';
}

/** Fetches the shell HTML. The token is NEVER stored — it is fetched fresh on every run. */
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
    // If we changed the address, SAY SO — otherwise the link gets the blame.
    const degistirildi = target !== url.trim();
    throw redactedError(
      `XD linki ${res.status} döndü — link geçersiz veya yayından kaldırılmış.` +
        (degistirildi ? `\n  Denenen adres: ${target}\n  Verilen adres : ${url.trim()}` : '')
    );
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/html')) {
    throw redactedError(`Beklenen text/html yerine "${ct}" geldi.`);
  }
  return parsePrototypeData(await res.text());
}
