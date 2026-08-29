#!/usr/bin/env node
/**
 * Claude Code transcript'lerinden ARAÇ ÇAĞRISI sayar.
 *
 * Neden: d2c boru hattında süre ≈ araç çağrısı × ~15 sn. Asıl kaldıraç çağrı sayısı,
 * ama `runs.jsonl` bugün yalnız süreyi tutuyor. Modele kendini saydırmak kırılgan;
 * transcript'te `tool_use` blokları zaten duruyor ve deterministik olarak sayılabilir.
 *
 * Alt ajanlar ayrı transcript'lere yazılıyor (`subagents/agent-*.jsonl`) ve yanlarındaki
 * `agent-*.meta.json` `agentType` taşıyor — design-diff / visual-diff turlarının
 * maliyeti bu sayede ajan tipine atfedilebiliyor.
 *
 * Kullanım:
 *   count-tool-calls.mjs --project <proje-dizini> [--since ISO] [--until ISO] [--json]
 *   count-tool-calls.mjs --session <transcript.jsonl> [...]
 *   count-tool-calls.mjs --project <dizin> --split-on-d2c     # /d2c komutlarına göre böl
 *
 * --project: ~/.claude/projects/<kodlanmis-proje-yolu>/ dizini.
 *            Kısayol: gerçek proje yolu verilirse kodlanmış ada kendisi çevirir.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

// ── argümanlar ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { json: false, splitOnD2c: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') a.json = true;
    else if (k === '--split-on-d2c') a.splitOnD2c = true;
    else if (k === '--project') a.project = argv[++i];
    else if (k === '--session') a.session = argv[++i];
    else if (k === '--since') a.since = argv[++i];
    else if (k === '--until') a.until = argv[++i];
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`bilinmeyen argüman: ${k}`);
  }
  return a;
}

/** Gerçek proje yolunu Claude Code'un transcript dizin adına çevirir. */
function encodeProjectPath(p) {
  return p.replace(/\//g, '-');
}

function resolveProjectDir(input) {
  if (existsSync(input) && statSync(input).isDirectory()) {
    // Zaten transcript dizini mi? İçinde *.jsonl varsa öyle kabul et.
    const hasTranscripts = readdirSync(input).some((f) => f.endsWith('.jsonl'));
    if (hasTranscripts) return input;
  }
  const encoded = join(homedir(), '.claude', 'projects', encodeProjectPath(input));
  if (existsSync(encoded)) return encoded;
  throw new Error(`transcript dizini bulunamadı: ${input}\n  denenen: ${encoded}`);
}

// ── transcript okuma ──────────────────────────────────────────────────────────
/**
 * Bir .jsonl transcript'ini okur. Bozuk satırları ATLAR ve sayar — sessizce yutmaz.
 * @returns {{events: Array, skipped: number}}
 */
function readTranscript(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    return { events: [], skipped: 0, error: e.message };
  }
  const events = [];
  let skipped = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }
    events.push(rec);
  }
  return { events, skipped };
}

/** Bir kayıttaki tool_use bloklarının araç adlarını döndürür. */
function toolNames(rec) {
  const content = rec?.message?.content;
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const b of content) {
    if (b && typeof b === 'object' && b.type === 'tool_use' && typeof b.name === 'string') {
      out.push(b.name);
    }
  }
  return out;
}

/** Kullanıcı mesajının düz metni (komut tespiti için). */
function userText(rec) {
  if (rec?.type !== 'user') return null;
  const c = rec?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  }
  return null;
}

function inWindow(ts, since, until) {
  if (!ts) return true;
  if (since && ts < since) return false;
  if (until && ts > until) return false;
  return true;
}

// ── toplama ───────────────────────────────────────────────────────────────────
function collectSession(sessionFile, opts) {
  const { events, skipped, error } = readTranscript(sessionFile);
  const byTool = new Map();
  let total = 0;
  let first = null;
  let last = null;
  const d2cMarks = [];

  for (const rec of events) {
    const ts = rec.timestamp || null;
    if (!inWindow(ts, opts.since, opts.until)) continue;
    if (ts) {
      if (!first || ts < first) first = ts;
      if (!last || ts > last) last = ts;
    }
    const txt = userText(rec);
    // Sidechain (alt ajan) kayıtları ana döngüye sayılmaz; onlar ayrı dosyada zaten.
    if (txt && !rec.isSidechain) {
      const m = txt.match(/(^|\s)\/(d2c(?:-spec|-code|-verify)?)\b/);
      if (m) d2cMarks.push({ ts, cmd: `/${m[2]}`, snippet: txt.slice(0, 120).replace(/\s+/g, ' ') });
    }
    for (const name of toolNames(rec)) {
      byTool.set(name, (byTool.get(name) || 0) + 1);
      total++;
    }
  }

  return {
    file: basename(sessionFile),
    total,
    byTool: Object.fromEntries([...byTool.entries()].sort((a, b) => b[1] - a[1])),
    first,
    last,
    skippedLines: skipped,
    error,
    d2cMarks,
  };
}

function collectSubagents(sessionFile, opts) {
  const dir = sessionFile.replace(/\.jsonl$/, '');
  const subDir = join(dir, 'subagents');
  if (!existsSync(subDir)) return [];
  const out = [];
  for (const f of readdirSync(subDir)) {
    if (!f.endsWith('.jsonl')) continue;
    const agentFile = join(subDir, f);
    const metaFile = agentFile.replace(/\.jsonl$/, '.meta.json');
    let meta = {};
    if (existsSync(metaFile)) {
      try {
        meta = JSON.parse(readFileSync(metaFile, 'utf8'));
      } catch {
        /* meta okunamadıysa agentType bilinmez — sessiz geçme, aşağıda '?' olarak görünür */
      }
    }
    const { events, skipped } = readTranscript(agentFile);
    let total = 0;
    let first = null;
    let last = null;
    const byTool = new Map();
    for (const rec of events) {
      const ts = rec.timestamp || null;
      if (!inWindow(ts, opts.since, opts.until)) continue;
      if (ts) {
        if (!first || ts < first) first = ts;
        if (!last || ts > last) last = ts;
      }
      for (const name of toolNames(rec)) {
        byTool.set(name, (byTool.get(name) || 0) + 1);
        total++;
      }
    }
    if (total === 0 && !first) continue; // pencere dışı
    out.push({
      agentId: meta.agentId || basename(f, '.jsonl'),
      agentType: meta.agentType || '?',
      description: meta.description || '',
      total,
      byTool: Object.fromEntries([...byTool.entries()].sort((a, b) => b[1] - a[1])),
      first,
      last,
      durationSec: first && last ? Math.round((Date.parse(last) - Date.parse(first)) / 1000) : null,
      skippedLines: skipped,
    });
  }
  return out.sort((a, b) => (a.first || '').localeCompare(b.first || ''));
}

// ── rapor ─────────────────────────────────────────────────────────────────────
function summarizeAgents(agents) {
  const byType = new Map();
  for (const a of agents) {
    const t = a.agentType;
    if (!byType.has(t)) byType.set(t, { tur: 0, cagri: 0, sureler: [] });
    const e = byType.get(t);
    e.tur++;
    e.cagri += a.total;
    if (a.durationSec != null) e.sureler.push(a.durationSec);
  }
  const out = {};
  for (const [t, e] of byType) {
    const s = e.sureler.slice().sort((x, y) => x - y);
    out[t] = {
      tur: e.tur,
      toplamCagri: e.cagri,
      turBasinaCagri: +(e.cagri / e.tur).toFixed(1),
      turBasinaSureSnOrtanca: s.length ? s[Math.floor(s.length / 2)] : null,
      // 0 sn gerçek bir ölçüm — `|| null` onu "bilinmiyor"a çevirirdi.
      toplamSureSn: s.length ? e.sureler.reduce((a, b) => a + b, 0) : null,
    };
  }
  return out;
}

function human(result) {
  const L = [];
  L.push(`# Araç çağrısı sayımı`);
  if (result.window.since || result.window.until) {
    L.push(`  pencere: ${result.window.since || '—'} → ${result.window.until || '—'}`);
  }
  L.push('');
  for (const s of result.sessions) {
    L.push(`## oturum ${s.file}`);
    if (s.error) L.push(`  ! okunamadı: ${s.error}`);
    L.push(`  aralık      : ${s.first || '—'} → ${s.last || '—'}`);
    L.push(`  ana döngü   : ${s.total} araç çağrısı`);
    if (s.skippedLines) L.push(`  ! atlanan bozuk satır: ${s.skippedLines}`);
    const top = Object.entries(s.byTool).slice(0, 8);
    for (const [k, v] of top) L.push(`      ${String(v).padStart(5)}  ${k}`);
    if (Object.keys(s.byTool).length > 8) {
      L.push(`      ${' '.repeat(5)}  … +${Object.keys(s.byTool).length - 8} araç daha`);
    }
    if (s.d2cMarks.length) {
      L.push(`  /d2c komutları (${s.d2cMarks.length}):`);
      for (const m of s.d2cMarks) L.push(`      ${m.ts || '—'}  ${m.cmd}`);
    }
    L.push('');
  }
  if (result.agents.length) {
    L.push(`## alt ajanlar (${result.agents.length} tur)`);
    L.push(
      `  ${'ajan tipi'.padEnd(22)} ${'çağrı'.padStart(6)} ${'süre sn'.padStart(8)}  açıklama`
    );
    for (const a of result.agents) {
      L.push(
        `  ${a.agentType.padEnd(22)} ${String(a.total).padStart(6)} ${String(
          a.durationSec ?? '—'
        ).padStart(8)}  ${a.description.slice(0, 44)}`
      );
    }
    L.push('');
    L.push(`## ajan tipi özeti`);
    for (const [t, e] of Object.entries(result.agentSummary)) {
      L.push(
        `  ${t.padEnd(22)} ${e.tur} tur · tur başına ${e.turBasinaCagri} çağrı · ` +
          `ortanca ${e.turBasinaSureSnOrtanca ?? '—'} sn · toplam ${e.toplamSureSn ?? '—'} sn`
      );
    }
    L.push('');
  }
  L.push(`## TOPLAM`);
  L.push(`  ana döngü   : ${result.totals.anaDongu}`);
  L.push(`  alt ajanlar : ${result.totals.altAjan}`);
  L.push(`  GENEL       : ${result.totals.genel} araç çağrısı`);
  return L.join('\n');
}

// ── ana ───────────────────────────────────────────────────────────────────────
const HELP = `count-tool-calls.mjs — Claude Code transcript'lerinden araç çağrısı sayar

  --project <yol>     proje dizini (gerçek yol ya da ~/.claude/projects altındaki dizin)
  --session <dosya>   tek bir transcript .jsonl
  --since <ISO>       bu zamandan sonraki kayıtlar
  --until <ISO>       bu zamana kadarki kayıtlar
  --split-on-d2c      /d2c komutlarını sınır olarak işaretle
  --json              makine okunur çıktı
  -h, --help          bu yardım
`;

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`HATA: ${e.message}\n\n${HELP}`);
    process.exit(2);
  }
  if (args.help || (!args.project && !args.session)) {
    console.log(HELP);
    process.exit(args.help ? 0 : 2);
  }

  let sessionFiles = [];
  if (args.session) {
    if (!existsSync(args.session)) {
      console.error(`HATA: transcript bulunamadı: ${args.session}`);
      process.exit(2);
    }
    sessionFiles = [args.session];
  } else {
    let dir;
    try {
      dir = resolveProjectDir(args.project);
    } catch (e) {
      console.error(`HATA: ${e.message}`);
      process.exit(2);
    }
    sessionFiles = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => join(dir, f))
      .sort();
    if (!sessionFiles.length) {
      console.error(`HATA: ${dir} içinde transcript yok`);
      process.exit(2);
    }
  }

  const opts = { since: args.since, until: args.until };
  const sessions = [];
  let agents = [];
  for (const f of sessionFiles) {
    const s = collectSession(f, opts);
    if (s.total === 0 && !s.first && !s.error) continue; // pencere dışı oturum
    sessions.push(s);
    agents = agents.concat(collectSubagents(f, opts).map((a) => ({ ...a, session: s.file })));
  }

  const anaDongu = sessions.reduce((n, s) => n + s.total, 0);
  const altAjan = agents.reduce((n, a) => n + a.total, 0);
  const result = {
    window: { since: args.since || null, until: args.until || null },
    sessions,
    agents,
    agentSummary: summarizeAgents(agents),
    totals: { anaDongu, altAjan, genel: anaDongu + altAjan },
  };

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(human(result));
}

main();
