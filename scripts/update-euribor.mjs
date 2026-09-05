#!/usr/bin/env node
/* ╔══════════════════════════════════════════════════════════════════════════╗
   ║  update-euribor.mjs — actualiza o bloco AUTO-EURIBOR do index.html      ║
   ║                                                                          ║
   ║  Fonte: BPstat (Banco de Portugal), séries de média mensal da Euribor.   ║
   ║  É a média mensal que os contratos portugueses usam na revisão da taxa   ║
   ║  e é a mesma que os bancos citam nos exemplos representativos.           ║
   ║                                                                          ║
   ║  Sem dependências. Node 18+ (usa fetch global).                          ║
   ║    node scripts/update-euribor.mjs           → escreve se houver dados   ║
   ║    node scripts/update-euribor.mjs --check   → só reporta, não escreve   ║
   ║                                                                          ║
   ║  Saída: imprime "changed=true|false" (consumido pelo GitHub Actions).    ║
   ╚══════════════════════════════════════════════════════════════════════════╝ */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'index.html');

/* Séries BPstat — média mensal. Confirmadas em bpstat.bportugal.pt/serie/<id>. */
const SERIES = {
  eur3:  13168436, // Euribor a 3 meses - média mensal
  eur6:  13168438, // Euribor a 6 meses - média mensal
  eur12: 13168437, // Euribor a 1 ano  - média mensal
};

const API = 'https://bpstat.bportugal.pt/api/observations/';
const START = '/* AUTO-EURIBOR:START';
const END = '/* AUTO-EURIBOR:END */';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const fail = (msg) => { console.error('ERRO: ' + msg); console.log('changed=false'); process.exit(1); };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Tudo o que vem da rede e acaba dentro de um literal JS no index.html passa
   por aqui. O bloco gerado é código que corre no browser de quem visita o site,
   e o site é publicado sem revisão humana — uma resposta hostil do BPstat (ou um
   MITM) não pode poder injectar JavaScript na página. Só passam caracteres
   inofensivos; qualquer aspa, barra ou quebra de linha aborta a corrida. */
const safeStr = (v, campo) => {
  const s = String(v);
  if (!/^[\p{L}\p{N} .:+\-−]{1,40}$/u.test(s)) fail(`campo ${campo} com conteúdo inesperado: ${JSON.stringify(s).slice(0, 80)}`);
  return s;
};

/* ── 1. Buscar observações ─────────────────────────────────────────────── */

const ids = Object.values(SERIES).join(',');
let payload;
try {
  const res = await fetch(`${API}?series_ids=${ids}&language=PT`, {
    headers: { 'accept': 'application/json', 'user-agent': 'spotcredit-euribor-updater' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) fail(`BPstat respondeu ${res.status}`);
  payload = await res.json();
} catch (e) {
  fail(`não foi possível contactar o BPstat: ${e.message}`);
}

const rows = Array.isArray(payload) ? payload : payload.data;
if (!Array.isArray(rows) || rows.length === 0) fail('resposta do BPstat sem observações');

/* ── 2. Última e penúltima observação de cada série ────────────────────── */

const latest = {};
for (const [key, sid] of Object.entries(SERIES)) {
  const obs = rows
    .filter(o => Number(o.series_id) === sid && o.value != null)
    .sort((a, b) => a.reference_date.localeCompare(b.reference_date));
  if (obs.length < 2) fail(`série ${sid} (${key}) veio com menos de 2 observações`);

  const cur = obs[obs.length - 1];
  const prev = obs[obs.length - 2];
  /* As datas vêm da rede e são usadas como texto no ficheiro gerado e na
     comparação de "mês mais recente" — exigir o formato exacto. */
  if (!ISO_DATE.test(String(cur.reference_date)) || !ISO_DATE.test(String(prev.reference_date)))
    fail(`série ${sid} com reference_date fora do formato AAAA-MM-DD`);
  const val = Number(cur.value);
  const prevVal = Number(prev.value);
  if (!Number.isFinite(val) || !Number.isFinite(prevVal)) fail(`série ${sid} com valor não numérico`);
  /* Guarda de sanidade: a Euribor viveu entre -1% e 6% na sua história.
     Fora deste intervalo é erro de fonte, não notícia — não escrevemos. */
  if (val < -2 || val > 20) fail(`série ${sid} com valor implausível: ${val}`);

  latest[key] = { date: cur.reference_date, val, prevVal, prevDate: prev.reference_date };
}

/* Os três prazos têm de referir-se ao mesmo mês. */
const refDates = new Set(Object.values(latest).map(o => o.date));
if (refDates.size !== 1) fail(`prazos com meses diferentes: ${[...refDates].join(', ')}`);

const ref = new Date([...refDates][0] + 'T00:00:00Z');
const prevRef = new Date(Object.values(latest)[0].prevDate + 'T00:00:00Z');
if (Number.isNaN(ref.getTime()) || Number.isNaN(prevRef.getTime()))
  fail('reference_date com formato válido mas data inexistente');

const mesLabel = `${MESES[ref.getUTCMonth()]} ${ref.getUTCFullYear()}`;
const mesAnterior = MESES[prevRef.getUTCMonth()];

/* ── 3. Montar o bloco ─────────────────────────────────────────────────── */

const r3 = (n) => Math.round(n * 1000) / 1000;

const deltaOf = (cur, prev) => {
  const d = r3(cur) - r3(prev);
  if (Math.abs(d) < 0.0005) return { dir: 'flat', label: '—' };
  const sign = d > 0 ? '+' : '−'; // U+2212 minus, como no resto da página
  return { dir: d > 0 ? 'up' : 'down', label: `${sign}${Math.abs(d).toFixed(3)} pp` };
};

const d3 = deltaOf(latest.eur3.val, latest.eur3.prevVal);
const d6 = deltaOf(latest.eur6.val, latest.eur6.prevVal);
const d12 = deltaOf(latest.eur12.val, latest.eur12.prevVal);

const block = `${START} — gerado por scripts/update-euribor.mjs. Não editar à mão.
     Fonte: BPstat / Banco de Portugal — Euribor, média mensal (indexante de revisão). */
  date:         '${safeStr(mesLabel, 'date')}',
  refMonth:     '${safeStr([...refDates][0], 'refMonth')}',
  prevMonth:    '${safeStr(mesAnterior, 'prevMonth')}',
  updatedAt:    '${safeStr(new Date().toISOString().slice(0, 10), 'updatedAt')}',
  eur3:         ${r3(latest.eur3.val).toFixed(3)},
  eur6:         ${r3(latest.eur6.val).toFixed(3)},
  eur12:        ${r3(latest.eur12.val).toFixed(3)},
  delta3:       ${`'${d3.dir}',`.padEnd(8)}deltaLabel3:  '${d3.label}',
  delta6:       ${`'${d6.dir}',`.padEnd(8)}deltaLabel6:  '${d6.label}',
  delta12:      ${`'${d12.dir}',`.padEnd(8)}deltaLabel12: '${d12.label}',
  ${END}`;

/* ── 4. Substituir no index.html ───────────────────────────────────────── */

const html = readFileSync(TARGET, 'utf8');
const from = html.indexOf(START);
const to = html.indexOf(END);
if (from === -1 || to === -1 || to < from) fail(`marcadores AUTO-EURIBOR não encontrados em ${TARGET}`);

/* Nunca recuar no tempo: se o ficheiro já tem um mês igual ou mais recente, parar. */
const currentRef = html.slice(from, to).match(/refMonth:\s*'(\d{4}-\d{2}-\d{2})'/);
if (currentRef && currentRef[1] >= [...refDates][0]) {
  console.log(`sem novidade — ficheiro já em ${currentRef[1]}, BPstat em ${[...refDates][0]}`);
  console.log('changed=false');
  process.exit(0);
}

const next = html.slice(0, from) + block + html.slice(to + END.length);

console.log(`Euribor ${mesLabel} (fonte BPstat):`);
console.log(`  3m  ${r3(latest.eur3.val).toFixed(3)}%  ${d3.label}`);
console.log(`  6m  ${r3(latest.eur6.val).toFixed(3)}%  ${d6.label}`);
console.log(`  12m ${r3(latest.eur12.val).toFixed(3)}%  ${d12.label}`);

if (process.argv.includes('--check')) {
  console.log('modo --check: nada escrito');
  console.log('changed=false');
  process.exit(0);
}

writeFileSync(TARGET, next);
console.log(`index.html actualizado (${currentRef ? currentRef[1] : 'sem data anterior'} → ${[...refDates][0]})`);
console.log(`mes=${mesLabel}`);
console.log('changed=true');
