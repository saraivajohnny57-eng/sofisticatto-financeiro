# ETAPA 03 — Correções do Bloco B (parcial)

**Projeto:** Sofisticatto Financeiro
**Branch:** `cline-testes-integracoes`
**Escopo autorizado:** F06, F07, F23 e F24
**Data:** 28/10/2026
**Commits/pushes/PRs/deploys:** nenhum
**Serviços externos acessados:** nenhum (mocks/fixtures e bloqueio global de rede)

---

## 1. Resumo executivo

Os quatro problemas autorizados foram reproduzidos por teste antes da correção,
corrigidos e validados. A suíte completa terminou com **141 testes, 141 aprovados,
0 reprovados e 0 ignorados** (antes: 139 testes aprovados).

| Item | Antes | Depois |
|---|---|---|
| F06 — filtro de rastreio Correios | Atualizava a coleta `c-2` (errada) | Atualiza somente `c-1` |
| F07 — upsert PostgREST | `Prefer: return=representation` | `return=representation,resolution=merge-duplicates` |
| F23 — data SSW dd/mm/aaaa | `05/01/2024` virava 1º de maio | Permanece 5 de janeiro |
| F24 — data Bradesco | `20240105` virava `0105-24-20` | Vira `2024-01-05` (YYYYMMDD, DDMMYYYY e ISO) |

---

## 2. Procedimento TDD aplicado

Para cada item:

1. O teste existente de caracterização foi convertido em teste de regressão
   (ou um novo teste de integração foi criado).
2. A suíte foi executada e a falha esperada foi confirmada.
3. A correção mínima foi aplicada no código de produção.
4. O teste alvo passou.
5. A suíte completa foi executada para detectar regressões.

### Evidências das falhas antes da correção

```
✖ F06: filtro do rastreio Correios usa id correto e não atualiza outra coleta
  AssertionError: coleta diferente foi consultada ou atualizada

✖ F07: POST com on_conflict envia resolution=merge-duplicates
  actual:   'return=representation'
  expected: 'return=representation,resolution=merge-duplicates'

✖ F23 corrigido: data dd/mm/aaaa com dia <= 12 mantém o dia informado
  actual:   1714573800000  (1º de maio)
  expected: 1704465000000  (5 de janeiro)

✖ F24 corrigido: datas Bradesco distinguem YYYYMMDD, DDMMYYYY e ISO
  actual:   '0105-24-20'
  expected: '2024-01-05'
```

---

## 3. F06 — filtro do rastreio Correios

### Problema
`lib/integracoes/consultar-rastreio-correios.js` montava a query com
`& id=eq.<id>` (espaço depois do `&`) e tentava corrigir com
`.replace(' &','&')`. O padrão não casa, o filtro não é aplicado e o PostgREST
pode devolver a primeira linha da tabela. O handler então usava o
`coleta_agendamento_id` dessa linha errada e atualizava outra coleta.

### Teste
`tests/integration/correios-tracking-filter.test.js` — simula duas linhas
(`r-1`/coleta `c-1` correta e `r-2`/coleta `c-2` errada), emula o PostgREST
ignorando o parâmetro inválido e verifica:

- status HTTP 200 e status `entregue`;
- URL de consulta do rastreamento com `&id=eq.r-1&`;
- URL de consulta da coleta com `&id=eq.c-1&`;
- exatamente um PATCH em `coleta_agendamentos`, com `id=eq.c-1`;
- nenhuma URL contendo `c-2`.

### Correção
Queries montadas corretamente, sem o espaço e sem `replace`:

- `...&id=eq.${encodeURIComponent(registroId)}&limit=1`
- `...&id=eq.${encodeURIComponent(registro.coleta_agendamento_id)}&limit=1`

Aplicado em `lib/integracoes/consultar-rastreio-correios.js` e na cópia
idêntica `consultar-rastreio-correios.js` (legado), mantendo-as sincronizadas.

### Resultado
Teste aprovado; nenhuma coleta diferente é consultada ou atualizada.

## 4. F07 — upsert PostgREST

### Problema
`supabaseRest` enviava sempre `Prefer: return=representation`. Em `POST` com
`?on_conflict=`, o PostgREST precisa de `resolution=merge-duplicates` para
fazer upsert; sem isso, pode retornar 409 ou ignorar a atualização.

### Teste
`tests/unit/utils.test.js`:

- `F07: POST com on_conflict envia resolution=merge-duplicates`;
- `POST sem on_conflict mantém Prefer apenas com return=representation`.

`tests/unit/credentials.test.js` também passou a verificar o header no fluxo
real de `salvar-credenciais`.

### Correção
Nova função `preferRest(method, query)` em `lib/integracoes/_utils.js`:

- `POST` + `on_conflict` → `return=representation,resolution=merge-duplicates`;
- demais casos → `return=representation`.

Aplicada também em `_utils.js` (cópia legada idêntica) para evitar divergência.

### Resultado
Headers validados nos testes; nenhuma credencial real foi usada ou alterada.

---

## 5. F23 — datas SSW no padrão brasileiro

### Problema
`parseDataSSW` chamava `Date.parse` antes do parser brasileiro. O V8 aceita
`05/01/2024` como 1º de maio (mm/dd), impedindo o fallback correto e invertendo
dia e mês sempre que o dia era ≤ 12.

### Teste
`tests/unit/ssw.test.js` — `F23 corrigido`:

- `05/01/2024 14:30` → 5 de janeiro, 14:30;
- `05/01/2024` → 5 de janeiro;
- `5/1/2024` → 5 de janeiro;
- `31/12/2023 23:59:30` → 31 de dezembro;
- ISO e entradas inválidas continuam cobertos pelo teste existente.

### Correção
O padrão `dd/mm/aaaa [hh:mm[:ss]]` é interpretado primeiro; somente se não
casar é usado `Date.parse`. Formatos ISO permanecem inalterados.

### Resultado
Datas brasileiras com dia ≤ 12 deixaram de ser invertidas; ISO preservado.

---

## 6. F24 — datas Bradesco

### Problema
`dataBradescoIso` testava primeiro `DDMMYYYY` (8 dígitos), capturando também
`YYYYMMDD`. Resultado: `20240105` virava `0105-24-20`. Formatos ISO com hífen
não eram aceitos.

### Teste
`tests/unit/banks.test.js` — `F24 corrigido`:

- `05012024` → `2024-01-05`;
- `01012024` → `2024-01-01`;
- `20240105` → `2024-01-05`;
- `05/01/2024` → `2024-01-05`;
- `2024-01-05` e `2024-01-05T10:00:00` → `2024-01-05`;
- `20241305` → `null` (mês inválido);
- `invalida` → `null`.

### Correção
Ordem de detecção: ISO com hífen → `YYYYMMDD` (ano plausível 1900–2999) →
`DD/MM/AAAA` → `DDMMYYYY`, com validação básica de ano, mês e dia.

### Resultado
Sem ambiguidade entre os formatos; formatos válidos anteriores preservados.

---

## 7. Resultados dos testes

### Alvo (após correções)
```
node --require ./tests/helpers/no-network.js --test \
  tests/unit/utils.test.js tests/unit/ssw.test.js tests/unit/banks.test.js \
  tests/integration/correios-tracking-filter.test.js tests/security/static-checks.test.js

ℹ tests 68
ℹ pass 68
ℹ fail 0
```

### Suíte completa
```
npm test

ℹ tests 141
ℹ pass 141
ℹ fail 0
ℹ skipped 0
```

Nenhuma regressão nos 139 testes anteriores; houve 2 testes novos
(integração F06 e POST sem `on_conflict`).

---

## 8. Arquivos modificados nesta etapa

### Produção
1. `lib/integracoes/consultar-rastreio-correios.js` — F06
2. `consultar-rastreio-correios.js` — F06 (cópia legada idêntica)
3. `lib/integracoes/_utils.js` — F07
4. `_utils.js` — F07 (cópia legada idêntica)
5. `lib/integracoes/consultar-rastreio-ssw.js` — F23
6. `api/banco-bradesco.js` — F24

### Testes
7. `tests/integration/correios-tracking-filter.test.js` — novo
8. `tests/unit/utils.test.js` — F07
9. `tests/unit/credentials.test.js` — header de upsert
10. `tests/unit/ssw.test.js` — F23
11. `tests/unit/banks.test.js` — F24
12. `tests/security/static-checks.test.js` — F06
13. `tests/README.md` — status dos achados

### Relatório
14. `relatorios-cline/ETAPA-03-CORRECOES-BLOCO-B.md`

---

## 9. Limitações

- **Sem Supabase real:** F06 e F07 validados com fetch mockado e fake de
  PostgREST; o comportamento 409 x “do nothing” não foi exercitado em banco.
- **F06:** o mock emula o pior caso (PostgREST ignorando o parâmetro inválido).
- **F23:** parser usa fuso local, como antes; datas de calendário inválidas
  continuam sujeitas ao rollover do `Date`.
- **F24:** valida dia 1–31 e mês 1–12; não valida a combinação completa do
  calendário. Anos fora de 1900–2999 retornam `null`.
- **Cópias legadas:** `consultar-rastreio-correios.js` e `_utils.js` foram
  sincronizados; as demais divergências (F14) continuam pendentes.
- **Não testado:** autenticação, RLS, emissão/baixa bancária, chamadas reais
  de transportadoras e Correios.

---

## 10. Problemas pendentes

| ID | Situação |
|---|---|
| F01 | Parcialmente corrigido no remoto (webhook SSW com token); demais endpoints pendentes |
| F02/F03 | Senha em texto puro, sessão/chave em localStorage — pendente |
| F04 | Políticas RLS — não verificáveis sem acesso ao banco |
| F05 | Token de dispositivo sem segredo obrigatório — pendente |
| F08 | Lote/timeout/chave legada — pendente |
| F09 | Rodonaves fixa em homologação — pendente |
| F10 | BB assume produção por padrão — pendente |
| F11 | Múltiplas tentativas Correios — pendente |
| F12 | SSRF (100.64/10 e IPv6 loopback) — pendente |
| F13 | `health` público — pendente |
| F14 | Outras cópias divergentes na raiz — pendente |
| F15–F22 | Higiene, dependências, rate limit, CNAB local, timeouts — pendentes |

---

## 11. Conclusão

F06, F07, F23 e F24 estão corrigidos e cobertos por testes de regressão.
Nenhuma funcionalidade existente foi removida e nenhuma operação real foi
executada. A suíte completa estava verde (141/141) ao final desta etapa.

Aguardo sua análise para autorizar (ou não) o avanço para as integrações
bancárias e transportadoras.

