# ETAPA 08 — Rota de recepção protegida por flags

**Data:** 03/11/2026
**Transmissão:** bloqueada por padrão (nenhum envio executado)

---

## 1. Rota criada: `action=gnre-recepcao`

`lib/integracoes/gnre-recepcao-http.js` — cinco camadas de proteção:

| # | Verificação | Ausente → |
|---|---|---|
| 1 | Autorização administrativa | 401 |
| 2 | `GNRE_AMBIENTE=homologacao` | 400 |
| 3 | `GNRE_HOMOLOGACAO_EXECUTOR=1` | 403 |
| 4 | **`GNRE_TRANSMISSAO_HABILITADA=1`** | 403 (padrão: nunca transmite) |
| 5 | Corpo `{"confirmacao":"TRANSMITIR_HOMOLOGACAO"}` | 400 |

A camada 4 é a trava principal: **sem essa variável, nenhuma transmissão
acontece**, mesmo com tudo o mais correto.

---

## 2. Modo `verificar` — o passo seguro que faltava

`POST {"guias":[...], "modo":"verificar"}`

Carrega o A1 do cofre, valida e devolve **apenas metadados**:

```json
{
  "modo": "verificar",
  "transmissao": "nao_realizada",
  "certificado": { "valido_ate": "...", "expirado": false,
                   "cnpj": "054519585...", "fingerprint256": "..." },
  "plano": { "lote_sha256": "...", "idempotency_key": "..." },
  "verificacoes": { "certificado_carregado": true,
                    "certificado_valido": true,
                    "transmissao_habilitada": false }
}
```

**Nunca devolve** PFX, senha, chave privada ou XML fiscal. Teste verifica
explicitamente que `pfx-ficticio` e `senha-ficticia` não aparecem na resposta.

---

## 3. Estado real do certificado A1 (verificado no banco)

| Verificação | Resultado |
|---|---|
| Registro em `gnre_certificados` | ✅ existe (`id='principal'`) |
| Bytes cifrados | 16.784 |
| IV / auth_tag | 16 / 24 bytes (AES-256-GCM) |
| Atualizado em | 22/10/2026 20:39 UTC |

**Limitação deste ambiente:** não é possível descriptografar o certificado daqui,
porque `INTEGRATIONS_ENCRYPTION_KEY` existe apenas na Vercel. A rota precisa
rodar **lá** para o modo `verificar` funcionar de verdade.

---

## 4. Testes

```
npm test
ℹ tests 250   ℹ pass 249   ℹ fail 0   ℹ skipped 1
```

| Suíte nova | Testes |
|---|---:|
| `gnre-recepcao-http.test.js` | 7 |

Cobre: método/auth, ambiente, executor, guias inválidas, **modo verificar sem
transmitir**, **bloqueio sem flag**, **exigência de confirmação** e delegação com
respeito à idempotência.

---

## 5. Como usar na Vercel

**Passo 1 — verificar (seguro, pode rodar já):**

```
POST /api/integracoes?action=gnre-recepcao
x-integrations-admin-key: <chave>
{ "guias": ["<TDadosGNRE ...>"], "modo": "verificar" }
```

Variáveis exigidas: `GNRE_AMBIENTE=homologacao`, `GNRE_HOMOLOGACAO_EXECUTOR=1`.
**Não** exige a flag de transmissão.

**Passo 2 — transmitir (somente na janela autorizada):**

Adicionar `GNRE_TRANSMISSAO_HABILITADA=1` e enviar com `confirmacao`.

**Passo 3 — desabilitar imediatamente após o teste:**

Remover `GNRE_TRANSMISSAO_HABILITADA` e fazer redeploy.

---

## 6. Pendências

| # | Item | Status |
|---|---|---|
| 1 | Rota de recepção protegida | ✅ implementada |
| 2 | Modo verificar (A1 sem transmitir) | ✅ implementado |
| 3 | Executar `verificar` na Vercel | ⏸️ depende de você acionar |
| 4 | Primeira transmissão | ⏸️ aguarda confirmação do passo 3 |
| 5 | Consulta de recibo pós-envio | ✅ já existe (`gnre-homologacao-plano`) |
