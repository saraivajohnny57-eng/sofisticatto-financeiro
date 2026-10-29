# GNRE — fontes oficiais e validação pendente (28/10/2026)

## Fontes primárias localizadas
- Diretório oficial SVRS: https://dfe-portal.svrs.rs.gov.br/Schemas/PRPSVRS/GNRE/v2.00/
- WSDL recepção: https://dfe-portal.svrs.rs.gov.br/Schemas/PRPSVRS/GNRE/v2.00/GnreLoteRecepcao.wsdl
- WSDL consulta: https://dfe-portal.svrs.rs.gov.br/Schemas/PRPSVRS/GNRE/v2.00/GnreResultadoLote.wsdl
- XSD ausente: https://dfe-portal.svrs.rs.gov.br/Schemas/PRPSVRS/GNRE/v2.00/dados_gnre_v1.00.xsd
- XSD ausente: https://dfe-portal.svrs.rs.gov.br/Schemas/PRPSVRS/GNRE/v2.00/tiposBasicoGNRE_v1.00.xsd
- Manual CONFaz (historico 1.33): https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/anexo-i-manual-de-integracao-versao-1-33.pdf

## Resultado da inspeção
A listagem oficial da SVRS comprova a existência dos arquivos, mas **não comprova que os arquivos do projeto são idênticos** aos oficiais.
Os arquivos publicados em SVRS incluem dependências v1.00 que ainda não constam neste repositório.
O acesso de leitura ao conteúdo XML/WSDL falhou neste ambiente; NÃO foi possível verificar operações, SOAPAction, SOAP 1.1/1.2, namespaces ou hashes.
A URL de recepção GnreLoteRecepcaoConsulta é citada por integradores, mas não foi validada diretamente com WSDL oficial. NÃO trocar endpoints automaticamente.
O código SOAP 1.2 e o Content-Type configurados continuam **provisórios** até confrontação com WSDL oficial.

## Portões de homologação
1. Baixar os XSD/WSDL oficiais em ambiente com rede e registrar SHA-256; comparar com arquivos existentes e completar dependências.
2. Validar os XMLs gerados com validador XSD real (não apenas checagem de include).
3. Confirmar binding SOAP, operação, action e endereço de homologação a partir do WSDL oficial.
4. Confirmar habilitação do CNPJ junto ao serviço GNRE de homologação.
5. Executar mTLS em ambiente segregado, usando certificado A1 já cadastrado no portal somente por fluxo autorizado, sem expor chaves e sem desabilitar verificação TLS.
6. Registrar status HTTP, fault e recibo/retorno redigidos, sem armazenar XML com dados pessoais nos logs.
7. Só depois de resposta de homologação aprovada, solicitar aprovação explícita para ativação de emissão real.

## Atualização 29/10/2026 — contratos públicos e bloqueio TLS

- WSDLs oficiais baixados da SVRS e preservados em `docs/gnre-oficial/` com SHA-256.
- Confirmado binding **SOAP 1.2**, ações `processar` e `consultar`, e namespaces
  `http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcao` e
  `.../GnreResultadoLote`.
- O portal HTTP de homologação (`http://www.testegnre.pe.gov.br/gnreWS/services/...`)
  redireciona (301) para **`https://www.testegnre.pe.gov.br:444/...`**; a porta
  correta de homologação é **444**, não 443.
- Inspeção TLS em 29/10/2026: tanto em 443 quanto em 444 o servidor apresenta
  certificado `CN=*.sefaz.pe.gov.br` (SAN `*.sefaz.pe.gov.br` e `sefaz.pe.gov.br`),
  que **não corresponde** a `www.testegnre.pe.gov.br`. Com verificação TLS
  habilitada, `checkServerIdentity` falha com `ERR_TLS_CERT_ALTNAME_INVALID`.
  Não desabilitar a verificação; é necessário endereço/hostname oficial válido
  ou correção do certificado pelo provedor.
- XSDs v1.00 oficiais incorporados em `docs/gnre-xsd/` (hashes em
  `FONTES-OFICIAIS.md`), completando o grafo de includes.
- Nenhuma conexão mTLS autenticada nem transmissão fiscal foi executada.

Nenhum envio fiscal foi executado nesta etapa.
