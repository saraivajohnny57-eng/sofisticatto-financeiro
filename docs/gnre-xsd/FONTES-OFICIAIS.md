# GNRE — dependências XSD oficiais incorporadas

Origem pública (SVRS), baixada em 29/10/2026 sem certificado e sem dados fiscais:

- https://dfe-portal.svrs.rs.gov.br/Schemas/PRPSVRS/GNRE/v2.00/dados_gnre_v1.00.xsd
- https://dfe-portal.svrs.rs.gov.br/Schemas/PRPSVRS/GNRE/v2.00/tiposBasicoGNRE_v1.00.xsd

| Arquivo | SHA-256 | Bytes |
|---|---|---|
| `dados_gnre_v1.00.xsd` | `a53ea134d1feca9d4ee6a373f1cf77aa430929158d03b16aeb1ce232b4579949` | 16413 |
| `tiposBasicoGNRE_v1.00.xsd` | `d110fe070a90e7a2cf61b0bd74a031576982b0adf1ffc3f3a92d0215f6d5ff72` | 9635 |

Os WSDLs oficiais e o manifesto completo estão em `docs/gnre-oficial/`.

**Limitação:** esta pasta apenas completa o grafo de `xs:include`. A validação
XSD de documentos fiscais ainda exige um validador real (`xmllint`, Java ou
`xmlschema`) e amostras XML válidas; nenhum XML fiscal é transmitido aqui.
