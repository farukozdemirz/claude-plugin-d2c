/**
 * Component inventory — for the question "does this already exist?".
 *
 * It replaces `component-inventory.py` but does **not delete** it: the regex script
 * stays as a legacy fallback.
 *
 * Why an AST: on a synthetic file the regex version found **1 of 5 export forms**.
 * `export default function Card`, `export { Card as ProductCard }`, `export * from`
 * and `export { Legacy }` were invisible — so the code phase could conclude "this
 * component does not exist" and rewrite one that did.
 *
 * The parser choice was measured: `ts-morph` bundles to 13.5 MB (and dist is
 * committed), the target project's own `typescript` breaks on TS 7 (the main entry
 * only exposes `version`), while `@babel/parser` is 0.27 MB with full TSX support.
 * The last one was chosen — no new install step reaches the user.
 */
import { parse } from '@babel/parser';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

export interface ExportKaydi {
  ad: string;
  /** `fonksiyon` · `sinif` · `degisken` · `yeniden` (re-export) · `hepsi` (`export *`) */
  tur: 'fonksiyon' | 'sinif' | 'degisken' | 'yeniden' | 'hepsi';
  varsayilan: boolean;
  /** `export type { X }` — NOT a component. Unmarked, it would mislead the inventory. */
  sadeceTip?: boolean;
  /** For a re-export, its source. */
  kaynak?: string;
}

export interface DosyaKaydi {
  yol: string;
  exportlar: ExportKaydi[];
  jsdoc: string | null;
  testidler: string[];
  olculer: string[];
  radiuslar: string[];
  renkler: string[];
  /** If it could not be parsed, the reason — the file is **not skipped, it is reported**. */
  hata?: string;
}

export interface Envanter {
  kok: string;
  dosyalar: DosyaKaydi[];
  /** A hex embedded in 3+ files — a theme token candidate. */
  tokenAdaylari: Array<{ renk: string; dosyalar: string[] }>;
  hatalar: Array<{ yol: string; hata: string }>;
}

const UZANTILAR = new Set(['.tsx', '.ts', '.jsx']);
const ATLA = new Set(['node_modules', '.next', 'dist', 'build', '.git', 'coverage']);

function dosyalariBul(kok: string): string[] {
  const bulunan: string[] = [];
  const gez = (d: string) => {
    let girisler: string[];
    try { girisler = readdirSync(d); } catch { return; }
    for (const g of girisler.sort()) {
      if (ATLA.has(g)) continue;
      const tam = join(d, g);
      let st;
      try { st = statSync(tam); } catch { continue; }
      if (st.isDirectory()) gez(tam);
      // A `.d.ts` type declaration; not a component.
      else if (UZANTILAR.has(extname(g)) && !g.endsWith('.d.ts')) bulunan.push(tam);
    }
  };
  gez(kok);
  return bulunan;
}

/** The right-hand side of `export default` can be unnamed (arrow, anonymous class). */
function varsayilanAd(d: Record<string, any>): string {
  if (d?.id?.name) return d.id.name;
  if (d?.type === 'Identifier') return d.name;
  if (d?.type === 'ArrowFunctionExpression' || d?.type === 'FunctionExpression') return '(anonim fonksiyon)';
  if (d?.type === 'ClassExpression') return '(anonim sınıf)';
  if (d?.type === 'CallExpression') {
    // `export default memo(Card)` / `forwardRef(...)` — show the wrapped name.
    const ic = d.arguments?.[0];
    const sarma = d.callee?.name ?? d.callee?.property?.name ?? 'çağrı';
    const icAd = ic?.name ?? ic?.id?.name;
    return icAd ? `${sarma}(${icAd})` : `(${sarma} sonucu)`;
  }
  return `(${d?.type ?? 'bilinmiyor'})`;
}

function exportlariCikar(gövde: any[]): ExportKaydi[] {
  const out: ExportKaydi[] = [];
  for (const n of gövde) {
    if (n.type === 'ExportDefaultDeclaration') {
      out.push({ ad: varsayilanAd(n.declaration), tur: turFromNode(n.declaration), varsayilan: true });
    } else if (n.type === 'ExportNamedDeclaration') {
      const d = n.declaration;
      if (d) {
        if (d.type === 'VariableDeclaration') {
          for (const v of d.declarations) {
            if (v.id?.name) out.push({ ad: v.id.name, tur: 'degisken', varsayilan: false });
          }
        } else if (d.id?.name) {
          const tip = d.type === 'TSInterfaceDeclaration' || d.type === 'TSTypeAliasDeclaration';
          out.push({ ad: d.id.name, tur: turFromNode(d), varsayilan: false, ...(tip ? { sadeceTip: true } : {}) });
        }
      }
      // `export type { X }` marks the whole declaration, `export { type X }` a single specifier.
      const tipBildirimi = n.exportKind === 'type';
      for (const s of n.specifiers ?? []) {
        // `export * as ns from` babel'de ExportNamespaceSpecifier olarak gelir.
        if (s.type === 'ExportNamespaceSpecifier') {
          out.push({
            ad: `* as ${s.exported?.name ?? '?'}`, tur: 'hepsi', varsayilan: false,
            ...(n.source ? { kaynak: n.source.value } : {}),
          });
          continue;
        }
        const yerel = s.local?.name ?? s.exported?.name;
        const disa = s.exported?.name ?? s.exported?.value ?? yerel;
        if (!disa) continue;
        const sadeceTip = tipBildirimi || s.exportKind === 'type';
        out.push({
          ad: yerel && yerel !== disa ? `${yerel} as ${disa}` : disa,
          tur: 'yeniden',
          varsayilan: disa === 'default',
          ...(sadeceTip ? { sadeceTip: true } : {}),
          ...(n.source ? { kaynak: n.source.value } : {}),
        });
      }
    } else if (n.type === 'ExportAllDeclaration') {
      out.push({
        ad: n.exported?.name ? `* as ${n.exported.name}` : '*',
        tur: 'hepsi', varsayilan: false, kaynak: n.source.value,
      });
    }
  }
  return out;
}

function turFromNode(d: Record<string, any>): ExportKaydi['tur'] {
  const t = d?.type ?? '';
  if (t.includes('Class')) return 'sinif';
  if (t.includes('Function') || t === 'ArrowFunctionExpression') return 'fonksiyon';
  if (t === 'TSInterfaceDeclaration' || t === 'TSTypeAliasDeclaration') return 'degisken';
  return 'degisken';
}

/** The JSDoc at the top of a file — in components we used to generate it carried the XD source. */
function bastakiJsdoc(src: string): string | null {
  const m = /^\s*\/\*\*([\s\S]*?)\*\//.exec(src);
  if (!m) return null;
  return m[1]!
    .split('\n')
    .map((l) => l.trim().replace(/^\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim() || null;
}

const RE_TESTID = /data-testid\s*=\s*["'{]([^"'}]+)["'}]?/g;
const RE_OLCU = /\b(?:[a-z]+:)?(?:w|h|min-h|min-w|max-w|max-h)-\[[^\]]+\]/g;
const RE_RADIUS = /\brounded(?:-[a-z]+)?(?:-\[[^\]]+\])?/g;
const RE_HEX = /#[0-9A-Fa-f]{6}\b/g;

const benzersiz = (a: string[]) => [...new Set(a)].sort();

export function dosyayiTara(yol: string, kok: string): DosyaKaydi {
  const src = readFileSync(yol, 'utf8');
  const kayit: DosyaKaydi = {
    yol: relative(kok, yol) || yol,
    exportlar: [],
    jsdoc: bastakiJsdoc(src),
    testidler: benzersiz([...src.matchAll(RE_TESTID)].map((m) => m[1]!)),
    olculer: benzersiz(src.match(RE_OLCU) ?? []),
    radiuslar: benzersiz(src.match(RE_RADIUS) ?? []),
    renkler: benzersiz((src.match(RE_HEX) ?? []).map((h) => h.toUpperCase())),
  };
  try {
    const ast = parse(src, {
      sourceType: 'module',
      // `errorRecovery`: one syntax error must not take down the whole inventory.
      errorRecovery: true,
      plugins: ['typescript', 'jsx', 'decorators-legacy'],
    });
    kayit.exportlar = exportlariCikar(ast.program.body);
  } catch (e) {
    // Skipping silently gives the same outcome as "no component" — SAY SO.
    kayit.hata = e instanceof Error ? e.message.split('\n')[0]! : String(e);
  }
  return kayit;
}

export function envanterCikar(kok: string): Envanter {
  if (!existsSync(kok)) {
    return { kok, dosyalar: [], tokenAdaylari: [], hatalar: [] };
  }
  const dosyalar = dosyalariBul(kok).map((y) => dosyayiTara(y, kok));
  const hexHarita = new Map<string, string[]>();
  for (const d of dosyalar) {
    for (const h of d.renkler) {
      if (!hexHarita.has(h)) hexHarita.set(h, []);
      hexHarita.get(h)!.push(d.yol);
    }
  }
  const tokenAdaylari = [...hexHarita.entries()]
    .filter(([, v]) => v.length >= 3)
    .map(([renk, dosyalar]) => ({ renk, dosyalar: benzersiz(dosyalar) }))
    .sort((a, b) => b.dosyalar.length - a.dosyalar.length || a.renk.localeCompare(b.renk));

  return {
    kok,
    dosyalar,
    tokenAdaylari,
    hatalar: dosyalar.filter((d) => d.hata).map((d) => ({ yol: d.yol, hata: d.hata! })),
  };
}

/** Human-readable output — stays close to the Python script's format. */
export function envanterYaz(env: Envanter): string {
  const s: string[] = [];
  if (!env.dosyalar.length) return `(bileşen yok: ${env.kok})\n`;
  for (const d of env.dosyalar) {
    s.push(`## ${d.yol}`);
    const ex = d.exportlar.map((e) => {
      const on = e.varsayilan ? 'default ' : '';
      const arka = e.kaynak ? ` ← ${e.kaynak}` : '';
      const tip = e.sadeceTip ? ' (tip)' : '';
      return `${on}${e.ad}${tip}${arka}`;
    });
    s.push(`   export : ${ex.length ? ex.join(', ') : '-'}`);
    if (d.jsdoc) s.push(`   kaynak : ${d.jsdoc.slice(0, 300)}`);
    s.push(`   testid : ${d.testidler.length ? d.testidler.join(', ') : '-'}`);
    if (d.olculer.length) s.push(`   ölçü   : ${d.olculer.join(' ')}`);
    if (d.radiuslar.length) s.push(`   radius : ${d.radiuslar.join(' ')}`);
    if (d.renkler.length) s.push(`   renk   : ${d.renkler.join(' ')}`);
    if (d.hata) s.push(`   ⚠ PARSE EDİLEMEDİ: ${d.hata}`);
    s.push('');
  }
  if (env.tokenAdaylari.length) {
    s.push('## Token adayları (3+ bileşende gömülü hex)');
    for (const t of env.tokenAdaylari) {
      s.push(`   ${t.renk}  (${t.dosyalar.length} bileşen: ${t.dosyalar.join(', ')})`);
    }
    s.push('');
  }
  if (env.hatalar.length) {
    s.push(`## ⚠ ${env.hatalar.length} dosya parse edilemedi — envanter EKSİK`);
    for (const h of env.hatalar) s.push(`   ${h.yol}: ${h.hata}`);
  }
  return s.join('\n') + '\n';
}
