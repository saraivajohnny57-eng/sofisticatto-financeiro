# ETAPA 05 — Fase B GNRE: validação XSD, XML de consulta, executor e TLS

**Projeto:** Sofisticatto Financeiro
**Branch:** `cline-testes-integracoes` (sem merge, sem push, sem deploy)
**Data:** 30/10/2026
**Transmissão fiscal realizada:** nenhuma
**Estado:** preparado para o primeiro teste oficial de homologação

---

## 1. Verificação da Fase A (não presumida)

| Verificação | Resultado |
|---|---|
| Suíte completa | 203/203 aprovados, 0 falhas, 0 ignorados |
| Manifesto SHA-256 de WSDL/XSD | íntegro |
| Grafo XSD local | completo (16 arquivos) |
| Homologação real concluída? | **NÃO** |

A Fase A estava tecnicamente correta. A conclusão anterior de bloqueio TLS,
porém, mudou — ver seção 5.

---

## 2. Commits criados (locais, na branch de testes)

| Commit | Conteúdo |
|---|---|
| `b0589e8` | Suíte isolada de testes (unidade, integração, segurança) + lockfile |
| `09a65c9` | Correções F06 (filtro de rastreio), F07 (upsert), F23/F24 (datas) |
| `493fa1b` | GNRE: contratos oficiais, XSD completo, inspeção de A1 |
| `3c68c55` | Fase B: validação XSD real, `TConsLote_GNRE`, executor e idempotência |
| `f20f5f9` | Contrato de homologação fixado a partir do WSDL publicado pelo serviço |

Nenhum commit foi enviado ao GitHub; `main` não foi tocada.

---

## 3. Validação XSD real (prioridade 2)

**Implementado**
- `scripts/gnre-validar-xsd.py` — valida um XML contra um XSD oficial e devolve
  JSON (`ok`, `total_erros`, `erros`). Sem rede, sem banco, sem certificado.
- `scripts/gnre-instalar-validador-xsd.sh` — provisiona `xmlschema` de forma
  isolada em `.tools/pylibs`, sem instalar nada no sistema.
- `tests/gnre-xsd-validacao.test.js` — 1 caso positivo + 8 negativos + 1 de
  validação de entrada.

**Cenários negativos:** raiz com grafia errada, `ambiente` fora do enum (1/2),
recibo de 9 dígitos, recibo de 14 dígitos, elemento obrigatório ausente, ordem
invertida, elemento extra e namespace incorreto.

**Resultado:** o XML gerado valida; as 8 variações inválidas são rejeitadas.

> Limitação: sem as libs, os testes são explicitamente *skipped* — nunca
> passam silenciosamente.

---

## 4. XML de consulta `TConsLote_GNRE` (prioridade 3)

| Antes | Depois |
|---|---|
| `<TconsLote_GNRE>` (minúsculo) | `<TConsLote_GNRE>` |

O XSD oficial `lote_gnre_consulta_v1.00.xsd` declara
`<xs:element name="TConsLote_GNRE">` com sequência obrigatória `ambiente`
(`1|2`) e `numeroRecibo` (`[0-9]{10}`). A estrutura estava correta; o nome da
raiz divergia e causaria rejeição.

Foram incorporados 7 XSD oficiais que faltavam: `lote_gnre_consulta_v1.00`,
`lote_gnre_recibo_v1.00`, `lote_gnre_result_v1.00`, `lote_gnre_v1.00`,
`cabecMsg_v1.00`, `config_uf_v1.00` e `consulta_config_uf_v1.00`.

**Achado:** `docs/gnre-xsd/lote_consulta_guia_v2.00.xsd` não consta na listagem
oficial da SVRS e descreve consulta de *guias* (`TLote_ConsultaGNRE`), não de
recibo de lote. Não foi usado como base.

## 5. Investigação TLS (prioridade 6) — resultado

**Causa raiz anterior:** o host apresentava certificado `*.sefaz.pe.gov.br`,
incompatível com `www.testegnre.pe.gov.br`.

**Situação em 30/10/2026 — corrigida pelo provedor:**

```
== porta 443
subject=CN = www.testegnre.pe.gov.br
    Verify return code: 0 (ok)
== porta 444
subject=CN = www.testegnre.pe.gov.br
    Verify return code: 0 (ok)
```

Certificado Let's Encrypt, SAN `DNS:www.testegnre.pe.gov.br`, válido de
29/10/2026 a 27/01/2027.

**Porta correta confirmada:**

| URL | Resultado |
|---|---|
| `https://…:444/gnreWS/services/GnreLoteRecepcao` | HTTP 200, TLS ok |
| `https://…:444/gnreWS/services/GnreResultadoLote` | HTTP 200, TLS ok |
| `https://…:443/gnreWS/services/GnreLoteRecepcao` | HTTP 403 |

**WSDL publicado pelo próprio serviço** (`?wsdl` na porta 444), preservado em
`docs/gnre-oficial/homologacao-*.wsdl`, confirma:

- `soap12:address location="https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreResultadoLote"`
- `soapAction="http://www.gnre.pe.gov.br/webservice/GnreResultadoLote/consultar"`
- `targetNamespace="http://www.gnre.pe.gov.br/webservice/GnreResultadoLote"`
- elementos `gnreDadosMsg` (request) e `gnreRespostaMsg` (response)

Nenhum contorno inseguro foi usado. `tests/gnre-contrato-homologacao.test.js`
falha se o código divergir desse WSDL.

---

## 6. Executor de homologação e idempotência (prioridades 4 e 5)

**`lib/integracoes/gnre-homologacao-executor.js`**
- `montarPlanoConsulta(recibo)` — monta o envelope SOAP 1.2 e devolve metadados
  (destino, action, `xml_sha256`, bytes, chave de idempotência, recibo mascarado).
- `executarConsulta()` — **dry-run por padrão**. Só envia com
  `permitirTransmissao: true`, A1 e repositório injetados.
- Nunca devolve o XML nem o recibo completo ao chamador.

**Idempotência e resultado incerto**

| Situação | Estado | Comportamento |
|---|---|---|
| 2xx com envelope SOAP | `concluido` | registra e libera |
| SOAP Fault / erro HTTP | `falha` | registra, **sem retry automático** |
| Erro de transporte/timeout | `resultado_incerto` | **bloqueia** repetição; exige consulta manual |
| Repetição da mesma chave | — | bloqueada, sem novo envio |

**`lib/integracoes/gnre-homologacao-plano.js`** — rota administrativa
`action=gnre-homologacao-plano`: exige admin, `GNRE_AMBIENTE=homologacao` e
`GNRE_HOMOLOGACAO_EXECUTOR=1`, e devolve apenas o plano de auditoria
(sem XML, sem segredo).

**`SQL_GNRE_HOMOLOGACAO_EXECUCOES.sql`** — tabela de auditoria com
`chave_idempotencia` única, RLS habilitada e `revoke` para `anon`/`authenticated`.
Não armazena XML, recibo completo, senha ou PFX. **Não aplicado** ao banco.

---

## 7. Resultados dos testes

```
npm test
ℹ tests 203
ℹ pass 203
ℹ fail 0
ℹ skipped 0
```

| Suíte | Testes |
|---|---:|
| GNRE (`tests/gnre-*.test.js`) | 54 |
| Unitários gerais | 105 |
| Integração | 24 |
| Segurança estática | 14 |

Nenhuma regressão em bancos, boletos, transportadoras e financeiro: os testes
existentes continuam verdes e nenhum arquivo dessas áreas foi alterado.

---

## 8. Pendências

| # | Pendência | Bloqueia homologação? |
|---|---|---|
| 1 | Aplicar `SQL_GNRE_HOMOLOGACAO_EXECUCOES.sql` (com aprovação) | Sim |
| 2 | Implementar repositório PostgREST de idempotência (hoje interface + teste) | Sim |
| 3 | Executor segregado com acesso ao A1 real (sem copiar para Preview) | Sim |
| 4 | Gerador de recepção `TLote_GNRE` (somente consulta existe) | Não, para consulta |
| 5 | Confirmação documental da habilitação de produção | Só produção |
| 6 | `xmlschema` no CI para tornar a validação XSD obrigatória | Não |
| 7 | Rotina de reconciliação de estados `resultado_incerto` | Boa prática |

---

## 9. Procedimento para a primeira transmissão autenticada

**Pré-requisitos:** autorização explícita por escrito, A1 válido no cofre,
SQL aplicado, repositório de idempotência implantado, executor segregado
publicado.

1. **Diagnóstico sem transmissão** — `action=gnre-diagnostico` com
   `GNRE_AMBIENTE=homologacao`. Confirmar `ok:true`, certificado carregado,
   não expirado, `conexao_tls.protocolo` ≥ TLSv1.2 e `autorizado:true`.
2. **Plano da consulta** — `action=gnre-homologacao-plano` com `{recibo}`.
   Conferir `idempotency_key`, `recibo_mascarado` e `xml_sha256`.
3. **Validação XSD** — `python3 scripts/gnre-validar-xsd.py --schema
   docs/gnre-xsd/lote_gnre_consulta_v1.00.xsd --xml <arquivo>` → `ok:true`.
4. **Ensaio em dry-run** — `executarConsulta({recibo})`; não há rede.
5. **Transmissão única** — `executarConsulta({recibo, certificado,
   repositorio, permitirTransmissao:true})`, uma vez, com responsável
   acompanhando.
6. **Leitura do resultado** — `concluido`, `falha` ou `resultado_incerto`.
7. **Se `resultado_incerto`** — **não repetir**. Consultar o recibo/lote antes
   de qualquer nova tentativa e registrar a decisão.
8. **Registro** — guardar `http_status`, `categoria`, `xml_sha256` e
   `recibo_mascarado`. Nunca logar XML fiscal, recibo completo ou PFX.
9. **Encerramento** — comparar o retorno com o XSD de retorno oficial.

**Não fazer:** desabilitar TLS, repetir após incerteza, transmitir em produção,
copiar o A1 para Preview.

---

## 10. Entregáveis

- `dist/sofisticatto-fase-b-gnre.zip` — 86 arquivos alterados/criados
  (código, testes, XSD/WSDL oficiais, scripts e relatórios).
- `dist/sofisticatto-fase-b-gnre.patch` — diff completo `2952fdf..HEAD`.
- Este relatório: `relatorios-cline/ETAPA-05-GNRE-FASE-B.md`.

## 11. Autorização de 30/10/2026 — itens 1 e 2 das pendências

Após autorização, foram implementados:

**Item 2 — repositório de idempotência real** (`lib/integracoes/gnre-idempotencia-repo.js`)
- `reservar` atômico: verifica a existência e trata violação de unicidade
  concorrente como conflito (sem envio duplicado).
- Transições `enviando` → `concluido` / `falha` / `resultado_incerto`.
- `listarIncertos` para reconciliação.
- Grava somente `recibo_mascarado`, nunca XML, recibo completo, senha ou PFX.
- 7 testes com PostgREST simulado.

**Reconciliação somente leitura** (`lib/integracoes/gnre-reconciliacao.js`,
rota `action=gnre-reconciliacao`): exige admin e `GNRE_AMBIENTE=homologacao`,
lista execuções incertas e orienta explicitamente **não repetir** o envio.
Não altera estado, não transmite e não devolve recibo completo. 5 testes.

**Item 1 — aplicação do SQL** (`scripts/gnre-aplicar-sql-idempotencia.js`)
- Exige `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF` (nunca versionados).
- `--dry-run` valida a configuração e mostra o SQL sem executar.
- `--confirmar` aplica via Management API.

> **Status do item 1:** o SQL **não foi aplicado** — este ambiente não possui
> credenciais do Supabase (variáveis ausentes) e aplicar migração exige a
> autorização explícita de execução. O script está pronto e testado em
> `--dry-run` (falha com segurança quando faltam credenciais).

**Testes após a autorização:** `npm test` → **215/215 aprovados, 0 falhas**.
O ZIP e o patch foram regerados: 93 arquivos, 247 KB.

**Pendência remanescente para o primeiro envio:** item 3 — executor segregado
com acesso ao A1 real (sem copiar para Preview) — continua pendente.

