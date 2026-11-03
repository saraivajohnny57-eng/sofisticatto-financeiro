# ETAPA 07 — Executor de recepção GNRE implementado

**Data:** 03/11/2026
**Branch:** `cline-testes-integracoes`
**Transmissão:** nenhuma (fluxo de envio implementado, desabilitado por padrão)

---

## 1. Migração aditiva aplicada no banco real

`SQL_GNRE_RECEPCAO_IDEMPOTENCIA.sql` — **aplicada e verificada** em
`drtgtwwsbxrmqcaabzcs`:

| Alteração | Verificação |
|---|---|
| `servico` passa a aceitar `recepcao` | ✅ `CHECK (servico = ANY (ARRAY['consulta','recepcao']))` |
| Coluna `recibo_retorno_mascarado` | ✅ criada |
| Coluna `lote_sha256` | ✅ criada |
| Dados existentes | ✅ intactos (tabela estava vazia) |
| Outras tabelas | ✅ `cobrancas_bancarias` 381, `logistica_rastreamentos` 239 |

Prova funcional: inserção com `servico='recepcao'` e `lote_sha256` aceita;
registro removido em seguida. **Tabela de execuções: 0 registros.**

---

## 2. Executor de recepção (`lib/integracoes/gnre-recepcao-executor.js`)

| Função | Comportamento |
|---|---|
| `montarPlanoRecepcao(guias)` | Monta `TLote_GNRE` + envelope SOAP 1.2 para `GnreLoteRecepcao` |
| `executarRecepcao()` | **dry-run por padrão**; envia só com `permitirTransmissao:true` + A1 + repositório |
| `extrairRecibo(xml)` | Lê `numeroRecibo` (10 dígitos) do envelope de resposta |
| `mascararRecibo()` | Expõe somente os 4 últimos dígitos |
| `chaveIdempotencia(sha)` | `gnre:recepcao:<32 hex>` derivada do hash do lote |

**Idempotência por conteúdo:** a chave deriva do SHA-256 do lote. O mesmo lote
nunca é reenviado; lotes diferentes (correção legítima) recebem chave distinta.

**Regra de segurança:** em erro de transporte, o estado vira `resultado_incerto`
e o reenvio é **bloqueado** com a mensagem "NÃO reenviar: verifique no portal se
o lote foi recebido".

---

## 3. Rota administrativa

`action=gnre-recepcao-plano` — exige admin, `GNRE_AMBIENTE=homologacao` e
`GNRE_HOMOLOGACAO_EXECUTOR=1`. Devolve apenas metadados de auditoria
(`lote_sha256`, `xml_sha256`, `idempotency_key`, `guias`). **Nunca devolve XML.**

---

## 4. Validação XSD

O lote gerado pelo executor foi extraído e validado:

```
docs/gnre-xsd/lote_gnre_v2.00.xsd  →  VÁLIDO
```

Com CNPJ real (05451985000195) e documento de origem. Confirmado por execução.

---

## 5. Testes

```
npm test
ℹ tests 243   ℹ pass 242   ℹ fail 0   ℹ skipped 1
```

| Suíte nova | Testes |
|---|---:|
| `gnre-recepcao-executor.test.js` | 12 |

Cenários cobertos: máscara de recibo, extração, chave por hash, dry-run,
exigência de A1/repositório, sucesso com recibo mascarado, **bloqueio de
reenvio**, **resultado incerto**, SOAP Fault e lote inválido.

O skip é o teste de integração real (`GNRE_TEST_SUPABASE=1`), que exige
credenciais no shell.

---

## 6. Segurança preservada

- Nenhuma guia transmitida
- Nenhum XML fiscal armazenado no banco
- Recibo completo nunca persistido nem retornado
- Nenhuma credencial gravada em arquivo, commit ou log
- Migração aditiva, sem `DROP COLUMN` nem `DELETE`

---

## 7. Procedimento para a primeira transmissão real

Pré-requisito: certificado A1 acessível ao runtime.

1. `POST action=gnre-diagnostico` → confirmar `ok:true`, `autorizado:true`, TLS ≥ 1.2
2. `POST action=gnre-recepcao-plano` com as guias → conferir `lote_sha256`
3. Validar o lote no XSD (`scripts/gnre-validar-xsd.py`)
4. Ensaio em dry-run (`executarRecepcao` sem `permitirTransmissao`)
5. **Execução única** com `permitirTransmissao:true`
6. Guardar `recibo_mascarado`, `estado`, `http_status`
7. Se `resultado_incerto`: **não reenviar** — conferir no portal
8. Consultar o recibo com `action=gnre-homologacao-plano` + `TConsLote_GNRE`

**Bloqueio remanescente:** o executor precisa de um runtime com acesso ao A1
real. Hoje o certificado vive na Vercel/Supabase e este ambiente não o possui.
