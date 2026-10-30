#!/usr/bin/env node
'use strict';

/**
 * Aplica SQL_GNRE_HOMOLOGACAO_EXECUCOES.sql no Supabase via Management API.
 *
 * Requer (NUNCA versionar):
 *   SUPABASE_ACCESS_TOKEN  - token pessoal do Supabase (sbp_...)
 *   SUPABASE_PROJECT_REF   - referência do projeto
 *
 * Uso:
 *   node scripts/gnre-aplicar-sql-idempotencia.js --dry-run
 *   node scripts/gnre-aplicar-sql-idempotencia.js --confirmar
 *
 * --dry-run apenas valida a configuração e mostra o SQL.
 * Não executa a migração sem --confirmar.
 */

const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = path.join(__dirname, '..', 'SQL_GNRE_HOMOLOGACAO_EXECUCOES.sql');

function mascarar(valor) {
  const s = String(valor || '');
  if (s.length <= 6) return '••••';
  return s.slice(0, 3) + '••••' + s.slice(-2);
}

async function main() {
  const confirmar = process.argv.includes('--confirmar');
  const sql = fs.readFileSync(ARQUIVO, 'utf8');
  const token = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  const ref = String(process.env.SUPABASE_PROJECT_REF || '').trim();

  if (!token || !ref) {
    console.error('Faltam SUPABASE_ACCESS_TOKEN e/ou SUPABASE_PROJECT_REF.');
    console.error('Token atual:', token ? mascarar(token) : '(ausente)');
    console.error('Projeto:', ref || '(ausente)');
    process.exitCode = 2;
    return;
  }

  console.log('Projeto:', ref);
  console.log('Token:', mascarar(token));
  console.log('SQL:', path.relative(process.cwd(), ARQUIVO), `(${sql.length} bytes)`);

  if (!confirmar) {
    console.log('\n--dry-run: nada foi aplicado. Use --confirmar para executar.');
    return;
  }

  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/query`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  const texto = await resposta.text();
  if (!resposta.ok) {
    console.error(`Falha HTTP ${resposta.status}:`, texto.slice(0, 500));
    process.exitCode = 1;
    return;
  }
  console.log('SQL aplicado com sucesso.');
}

main().catch((erro) => {
  console.error('Falha:', erro.message);
  process.exitCode = 1;
});
