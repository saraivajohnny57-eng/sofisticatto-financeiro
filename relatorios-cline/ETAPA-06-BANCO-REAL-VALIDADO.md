# ETAPA 06 — Banco real validado (itens 1 e 2)

**Data:** 03/11/2026
**Projeto Supabase:** `drtgtwwsbxrmqcaabzcs` (`relatorio-banco`, us-east-2, PG 17.6)
**Nenhum dado de produção alterado. Nenhuma guia transmitida.**

---

## 1. Item 1 — tabela de idempotência: VERIFICADA

A tabela `gnre_homologacao_execucoes` **já existia** no banco. Verifiquei a
estrutura real em vez de reaplicar DDL.

| Verificação | Resultado |
|---|---|
| Colunas (12) | ✅ idênticas ao SQL versionado |
| `UNIQUE (chave_idempotencia)` | ✅ presente |
| `CHECK` de `estado` (5 valores) | ✅ presente |
| `CHECK` de `servico` (`consulta`) | ✅ presente |
| `CHECK` de `tentativa >= 1` | ✅ presente |
| `RELROWSECURITY` | ✅ `true` |
| Grants para `anon`/`authenticated` | ✅ **nenhum** |
| Índice `estado_idx` | ✅ presente |
| Registros | 0 |

**Conclusão:** item 1 **concluído** — nada a aplicar, estrutura conforme.

---

## 2. Item 2 — provas de comportamento no banco real

Executadas com SQL equivalente ao do repositório:

| # | Operação | Resultado observado |
|---|---|---|
| 1 | Reserva inicial | ✅ `rows_affected=1`, estado `reservado` |
| 2 | Reserva duplicada | ✅ **SQLSTATE 23505** — `duplicate key value violates unique constraint` |
| 3 | Transição `reservado → enviando` | ✅ `rows_affected=1` |
| 4 | Transição inválida (`reservado → concluido`) | ✅ **`rows_affected=0`** (guarda de concorrência) |
| 5 | Transição `enviando → concluido` | ✅ `http_status=200`, `categoria=soap_recebido` |
| 6 | Recibo completo vazado? | ✅ Não — apenas `••••9999` |

**Isso valida a correção de hoje:** o banco devolve `ERROR: 23505`, não a palavra
"duplicate" no campo `message`. Antes da correção o repositório lançaria exceção
genérica; agora trata como conflito.

---

## 3. Integridade dos dados de produção

| Tabela | Registros | Situação |
|---|---:|---|
| `cobrancas_bancarias` | 381 | intacta |
| `logistica_rastreamentos` | 239 | intacta |
| `integracoes_credenciais` | 3 | intacta |
| `gnre_homologacao_execucoes` | 0 | limpa (só registros sintéticos, já removidos) |

Todos os registros de teste usaram chaves com prefixo `SMOKETEST`/`REPOTEST` e
foram excluídos ao final.

---

## 4. Testes

```
npm test
ℹ tests 231   ℹ pass 230   ℹ fail 0   ℹ skipped 1
```

O skip é o teste de integração real (`GNRE_TEST_SUPABASE=1`), que exige
credenciais no ambiente do shell — não disponíveis por design. As mesmas
operações foram validadas manualmente contra o banco (seção 2).

---

## 5. Segurança

- A `service_role` foi obtida via API do Composio e **nunca exibida em log,
  commit ou relatório**.
- Nenhuma chave, senha ou certificado foi gravado em arquivo.
- Nenhuma variável de ambiente persistida com segredo.

---

## 6. Pendência restante para emissão real

**Executor de recepção (`TLote_GNRE` → `GnreLoteRecepcao`)** — hoje só existe
o fluxo de consulta de recibo. Sem ele não há caminho técnico para emitir,
mesmo com banco e idempotência validados.
