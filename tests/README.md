# Testes — Sofisticatto Financeiro

## Suíte principal (Node.js 20+)

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:security
npm run test:coverage
```

- Runner nativo `node:test`; nenhuma dependência de teste externa.
- `tests/helpers/no-network.js` é pré-carregado e bloqueia `fetch`,
  `http.request/get` e `https.request/get`.
- Fixtures e mocks apenas com dados fictícios. Nenhum acesso a Supabase,
  bancos, Correios, SSW ou transportadoras.

## GNRE (homologação isolada)

Testes offline em `tests/gnre-*.test.js` cobrem:

- contrato oficial WSDL/SOAP 1.2 (actions, namespaces e endereços);
- grafo XSD completo + SHA-256 das dependências v1.00;
- envelope SOAP 1.2 e transporte mTLS simulado (`agent:false`,
  `rejectUnauthorized:true`, TLS ≥1.2, limite de resposta);
- classificação de resposta SOAP sem alegar autorização fiscal;
- inspeção de PFX A1 sintético sem expor chave/senha;
- recusas antes de rede (ambiente, endpoint, certificado ausente).

`node --test tests/gnre-*.test.js`

## Segurança / caracterização

`tests/security/static-checks.test.js` mantém verificações estáticas e
caracteriza achados ainda pendentes (F01 parcial, F02/F03, F05, F10, F12–F16).
`tests/security-regression.test.js` (remoto) é uma suíte estática adicional.

## Estado dos achados

Corrigidos: F06, F07, F23, F24; F01 do webhook SSW (`tokenValido`).
Pendentes: autenticação dos demais endpoints, hash de senha, sessão,
RLS, segredo de dispositivo, lotes, SSRF, `health`, cópias legadas.

