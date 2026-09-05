#!/usr/bin/env node
/* ╔══════════════════════════════════════════════════════════════════════════╗
   ║  check-bank-rates.mjs — vigia a validade das campanhas dos bancos       ║
   ║                                                                          ║
   ║  Os spreads/TAEG dos bancos são MANUAIS por decisão de projecto (ver     ║
   ║  CLAUDE.md: nada de scraping a sites de bancos). O que se pode           ║
   ║  automatizar é o aviso: quando uma campanha marcada com `validUntil`     ║
   ║  expira, isto sinaliza-a para alguém ir confirmar as novas condições.    ║
   ║                                                                          ║
   ║    node scripts/check-bank-rates.mjs                                     ║
   ║                                                                          ║
   ║  Saída: "expired=true|false" + lista legível. Não altera nada.           ║
   ╚══════════════════════════════════════════════════════════════════════════╝ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/* Lê as entradas sem executar o ficheiro: procura pares nome/validUntil na
   mesma linha, que é como o BANKS está formatado. */
const linhas = html.split('\n');
const hoje = new Date().toISOString().slice(0, 10);
const expiradas = [];
const activas = [];

for (const linha of linhas) {
  const nome = linha.match(/nome:\s*'([^']+)'/);
  const val = linha.match(/validUntil:\s*'(\d{4}-\d{2}-\d{2})'/);
  if (!nome || !val) continue;
  (val[1] < hoje ? expiradas : activas).push({ nome: nome[1], validUntil: val[1] });
}

if (activas.length === 0 && expiradas.length === 0) {
  console.log('Nenhuma entrada com validUntil — nada a vigiar.');
  console.log('expired=false');
  process.exit(0);
}

for (const c of activas) console.log(`ok       ${c.validUntil}  ${c.nome}`);
for (const c of expiradas) console.log(`EXPIRADA ${c.validUntil}  ${c.nome}`);

if (expiradas.length) {
  console.log(`\n${expiradas.length} campanha(s) fora de validade — confirmar condições no site do banco.`);
}
console.log(`expired=${expiradas.length > 0}`);
