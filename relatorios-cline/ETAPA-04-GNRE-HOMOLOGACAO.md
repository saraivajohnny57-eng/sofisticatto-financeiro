# ETAPA 04 — GNRE: auditoria, correções e bloqueios de homologação

**Projeto:** Sofisticatto Financeiro
**Branch:** `cline-testes-integracoes` (fast-forward para `2952fdf`, sem merge na `main`)
**Data:** 29/10/2026
**Escopo executado:** Fase A (auditoria/correções/testes offline)
**Envio fiscal:** nenhum
**mTLS autenticado:** não executado
**Commits/pushes/PRs/deploys:** nenhum

---

## 1. Resumo executivo

A branch local estava 61 commits atrás do remoto; foi feito apenas fast-forward
para `2952fdf`, preservando as alterações não commitadas do Bloco B. A suíte
completa passou de **183 testes com 2 falhas** (testes antigos do webhook SSW,
já corrigido no remoto) para **190 testes, 190 aprovados, 0 falhas**.

Foram corrigidos três defeitos reais no código GNRE, comprovados por testes
que falharam antes da correção:

1. **Namespaces SOAP divergentes do WSDL oficial** (`/wsdl/` em vez de
   `/webservice/`) — corrigido.
2. **Porta de homologação errada** (443 em vez de 444) — corrigido.
3. **Pool de conexões TLS compartilhado** no transporte mTLS — corrigido com
   `agent:false`.

Também foram incorporados os XSDs oficiais v1.00 com hashes, completando o
grafo de dependências, e criada uma inspeção segura de PFX A1 (metadados apenas,
sem chave/senha).

**Bloqueio externo confirmado:** o host `www.testegnre.pe.gov.br` apresenta
certificado `*.sefaz.pe.gov.br`, incompatível com o nome. Com verificação TLS
habilitada, a conexão falha em `checkServerIdentity`. Não é permitido desabilitar
TLS. Sem um hostname oficial válido (ou correção do certificado pelo provedor),
a homologação mTLS real não pode ser concluída.

---

## 2. Diagnóstico de causa raiz

### 2.1 Namespaces SOAP incorretos (corrigido)

Os WSDLs oficiais baixados da SVRS declaram:

- `targetNamespace="http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcao"`
- `targetNamespace="http://www.gnre.pe.gov.br/webservice/GnreResultadoLote"`

O envelope usava `http://www.gnre.pe.gov.br/wsdl/...`. O header `gnreCabecMsg`
e o body `gnreDadosMsg` ficavam em namespace incorreto, o que pode gerar
rejeição SOAP mesmo com action correta.

**Correção:** namespaces alterados para `/webservice/` em
`lib/integracoes/gnre-envelope-soap12.js`.
**Teste:** `tests/gnre-contrato-oficial.test.js` compara o XML gerado com o
`targetNamespace` extraído do WSDL oficial.

### 2.2 Porta de homologação (corrigido)

O portal HTTP responde:

```
HTTP/1.1 301 Moved Permanently
Location: https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreLoteRecepcao
```

O código usava HTTPS na porta padrão 443.

**Correção:** `SERVICOS` e `HOMOLOGACAO` agora usam
`https://www.testegnre.pe.gov.br:444/gnreWS/services`; o diagnóstico também
exige porta 444 e rejeita outras portas.

### 2.3 Certificado TLS do servidor não corresponde ao host (bloqueio externo)

Inspeção com `openssl s_client` em 29/10/2026:

```
subject=CN = *.sefaz.pe.gov.br
SAN: DNS:*.sefaz.pe.gov.br, DNS:sefaz.pe.gov.br
validade: 02/06/2026 até 17/12/2026
```

O host usado é `www.testegnre.pe.gov.br`. A validação padrão do Node falha com
`ERR_TLS_CERT_ALTNAME_INVALID`. O código **não** desabilita `rejectUnauthorized`
nem `checkServerIdentity` — comportamento correto. É necessário que o provedor
informe o hostname correto ou corrija o certificado; alternativa de contorno
insegura foi descartada.

### 2.4 Grafo XSD incompleto (corrigido)

Faltavam `dados_gnre_v1.00.xsd` e `tiposBasicoGNRE_v1.00.xsd`, referenciados por
cinco esquemas v2.00. Os arquivos oficiais foram baixados da SVRS, com SHA-256
registrado, e copiados para `docs/gnre-xsd/`.

**Resultado:** 9 XSDs locais, todos XML bem formados, nenhuma dependência
`xs:include` ausente.

**Limitação:** isso valida o grafo e a boa formação, **não** valida instâncias
XML contra o XSD. O ambiente não possui `xmllint`, `lxml` ou `xmlschema`, e a
instalação via pip falhou por verificação TLS do índice. A validação XSD real
permanece pendente de ferramenta/CI.

### 2.5 Conexão mTLS e pool TLS (corrigido)

`enviarSoap` passa `pfx`/`key` por requisição, mas usava o agente global HTTPS.
Foi adicionado `agent:false`, garantindo socket novo e isolado por credencial.
O teste verifica `agent:false`, `rejectUnauthorized:true`, TLS ≥ 1.2,
Content-Type SOAP 1.2 com `action`, limite de resposta e classificação sem
alegar autorização fiscal.

### 2.6 Certificado A1 (auditoria parcial)

Foi adicionada `inspecionarPfx(pfx, senha)`, que retorna apenas:

- formato PKCS#12, titular, emissor;
- validade (`valido_de`, `valido_ate`, `expirado`);
- CNPJ extraído do titular (quando presente);
- fingerprint SHA-256 e tipo de chave pública.

Não retorna PFX, senha, chave privada ou conteúdo binário. Teste com PFX
sintético gerado por OpenSSL valida leitura, CNPJ, fingerprint, rejeição de
senha errada e ausência de vazamento.

**Não foi possível validar o A1 real**: o certificado está na Vercel/Supabase e
não foi copiado nem exposto neste ambiente.

## 3. Testes antes e depois

### Antes das correções GNRE

```
npm test
ℹ tests 183
ℹ pass 181
ℹ fail 2
```

As 2 falhas eram testes antigos que esperavam o webhook SSW sem autenticação;
o remoto já havia implementado `SSW_OCORRENCIAS_WEBHOOK_TOKEN`. Testes
ajustados para o novo contrato (401 sem token; 500 seguro com token e sem
Supabase).

Falhas esperadas dos novos testes GNRE (7), confirmadas antes da correção:

- namespace divergente do WSDL;
- porta 444 ausente;
- grafo XSD incompleto;
- hashes das dependências v1.00 ausentes;
- `inspecionarPfx` inexistente;
- `agent:false` ausente;
- preflight XSD ainda esperando arquivos faltantes.

### Depois das correções

```
npm test
ℹ tests 190
ℹ pass 190
ℹ fail 0
ℹ skipped 0
```

```
node --test tests/gnre-*.test.js
ℹ tests 41
ℹ pass 41
ℹ fail 0
```

Nenhuma chamada a SEFAZ, GNRE, Supabase, bancos ou transportadoras durante os
testes. O bloqueio global de rede permaneceu ativo.

---

## 4. Validação dos contratos oficiais

Arquivos preservados em `docs/gnre-oficial/` com manifesto SHA-256:

| Arquivo | SHA-256 (início) |
|---|---|
| `GnreLoteRecepcao.wsdl` | `bc3912a556f2acd6…` |
| `GnreResultadoLote.wsdl` | `3ab1116660cc8d32…` |
| `dados_gnre_v1.00.xsd` | `a53ea134d1feca9d…` |
| `tiposBasicoGNRE_v1.00.xsd` | `d110fe070a90e7a2…` |

Confirmado nos WSDLs:

- binding SOAP 1.2;
- `soapAction` de recepção:
  `http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcao/processar`;
- `soapAction` de consulta:
  `http://www.gnre.pe.gov.br/webservice/GnreResultadoLote/consultar`;
- endereços de produção publicados em HTTP (`www.gnre.pe.gov.br`).

Os testes `tests/gnre-contrato-oficial.test.js` falham se o código divergir
desses valores.

---

## 5. Arquivos alterados/criados nesta etapa

### Código GNRE
- `lib/integracoes/gnre-contrato.js` — porta 444.
- `lib/integracoes/gnre-isolamento.js` — porta 444.
- `lib/integracoes/gnre-diagnostico.js` — porta 444 obrigatória.
- `lib/integracoes/gnre-envelope-soap12.js` — namespaces oficiais.
- `lib/integracoes/gnre-soap-homologacao.js` — `agent:false`.
- `lib/integracoes/gnre-certificado.js` — `inspecionarPfx`/`extrairCnpj` e
  metadados no caminho nativo.

### Testes
- `tests/gnre-contrato-oficial.test.js` — novo.
- `tests/gnre-xsd-completo.test.js` — novo.
- `tests/gnre-certificado-inspecao.test.js` — novo.
- `tests/gnre-contrato.test.js` — porta 444.
- `tests/gnre-regression.test.js` — endpoint 444.
- `tests/gnre-soap-homologacao.test.js` — `agent:false`.
- `tests/gnre-xsd-preflight.test.js` — grafo completo.
- `tests/integration/open-endpoints.test.js` — webhook SSW autenticado.
- `tests/security/static-checks.test.js` — allowlist do webhook.
- `tests/helpers/env.js` — token do webhook.
- `tests/README.md` — suíte GNRE e estado dos achados.

### Contratos/documentação
- `docs/gnre-oficial/` — WSDLs, XSDs e manifesto SHA-256.
- `docs/gnre-xsd/dados_gnre_v1.00.xsd`
- `docs/gnre-xsd/tiposBasicoGNRE_v1.00.xsd`
- `docs/gnre-xsd/FONTES-OFICIAIS.md`
- `docs/GNRE-FONTES-OFICIAIS-E-HOMOLOGACAO.md` — evidências de 29/10/2026.

### Relatórios
- `relatorios-cline/ETAPA-03-CORRECOES-BLOCO-B.md` — concluído.
- `relatorios-cline/ETAPA-04-GNRE-HOMOLOGACAO.md` — este arquivo.

---

## 6. O que não foi executado (e por quê)

| Item | Motivo |
|---|---|
| Conexão mTLS autenticada | A1 real não está acessível neste ambiente e o host apresenta certificado incompatível |
| Transmissão de guia de teste | Exige autorização explícita, certificado real e endpoint TLS válido |
| Consulta de recibo | Depende de transmissão anterior |
| Validação XSD de instância | Sem `xmllint`/`lxml`/`xmlschema`; apenas grafo e boa formação |
| Validação do A1 real | Certificado permanece na Vercel/Supabase; não foi copiado |
| Teste em Preview isolado | O isolamento exige ausência de credenciais e não há executor segregado |
| Emissão real | Produção não confirmada e não autorizada |

---

## 7. Pendências para homologação real

1. **Resolver o hostname TLS**: obter da GNRE/SEFAZ o endereço de homologação
   cujo certificado corresponda ao nome, ou confirmação oficial de exceção.
   Não desabilitar verificação TLS.
2. **Executor segregado**: ambiente/rota administrativa que use o A1 sem
   copiá-lo para Preview, com `GNRE_AMBIENTE=homologacao`, endpoint fixo :444,
   timeout, limite de resposta e auditoria sem dados fiscais.
3. **Validador XSD real** no CI (`xmllint`/Java) com amostras válidas e inválidas.
4. **Gerador do XML de recepção** (`TConsLote_GNRE`) ainda não existe; somente a
   consulta (`TconsLote_GNRE`) está implementada.
5. **Controle de duplicidade/idempotência** para transmissão: chave de lote,
   trava persistente e recuperação de resultado incerto.
6. **Confirmação documental da habilitação de produção**.
7. **Teste mTLS real e transmissão de uma guia de homologação** somente após
   autorização explícita.

---

## 8. Plano de implantação e rollback

- Alterações são aditivas e restritas a GNRE; nenhuma migração ou remoção.
- Rollback: reverter os arquivos listados na seção 5 para o commit `2952fdf`;
  não há dados persistidos nem migração.
- A emissão permanece desabilitada: não há rota pública que transmita guia.
- `verificarIsolamento` continua retornando `emissaoHabilitada:false`.

---

## 9. Conclusão

A Fase A está concluída no que é possível sem credenciais e sem rede fiscal:
contratos oficiais conferidos, três defeitos corrigidos, XSD completo e
inspeção segura de A1 implementada, com 190/190 testes verdes.

A homologação autenticada **não pode ser declarada concluída** enquanto o
certificado do servidor não corresponder ao hostname e o A1 real não puder ser
usado em ambiente segregado. Nenhuma guia foi transmitida.

