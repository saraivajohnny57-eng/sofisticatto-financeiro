'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('../helpers/env');
const { loadScript } = require('../helpers/sandbox');

preserveEnv();

const stubs = {
  './_utils': { json() {}, exigirAdmin() { return true; }, supabaseRest: async () => [] },
  './carregar-credenciais': { obterCredenciaisIntegracao: async () => ({}) }
};

const { context: cotar } = loadScript('lib/integracoes/cotar-ssw.js', { stubs });
const { context: rastreio } = loadScript('lib/integracoes/consultar-rastreio-ssw.js', { stubs });
const { context: coleta } = loadScript('lib/integracoes/agendar-coleta-ssw.js', { stubs });

function fixture(nome) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', nome), 'utf8');
}

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('xmlEsc escapa os cinco caracteres reservados', () => {
  assert.equal(cotar.xmlEsc(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&apos;f');
});

test('htmlDec reverte entidades XML', () => {
  assert.equal(cotar.htmlDec('a&amp;b&lt;c&gt;d&quot;e&apos;f'), `a&b<c>d"e'f`);
});

test('tag extrai conteúdo com atributos e é case-insensitive', () => {
  assert.equal(cotar.tag('<Erro tipo="x">-1</Erro>', 'erro'), '-1');
  assert.equal(cotar.tag('<a><b>valor</b></a>', 'c'), '');
});

test('numero interpreta decimal brasileiro', () => {
  assert.equal(cotar.numero('1.234,56'), 1234.56);
  assert.equal(cotar.numero('10,5'), 10.5);
  assert.equal(cotar.numero(''), 0);
  assert.equal(cotar.numero('abc'), 0);
});

test('volumeM3 aceita metros e centímetros e multiplica pela quantidade', () => {
  assert.equal(cotar.volumeM3('0,38 x 0,29 x 0,35'), 0.0386);
  assert.equal(cotar.volumeM3('38x29x35'), 0.0386);
  assert.equal(cotar.volumeM3('0,38 x 0,29 x 0,35', 2), 0.0771);
  assert.equal(cotar.volumeM3('incompleto'), 0);
});

test('dimensoesMedidas converte centímetros para metros', () => {
  const cm = cotar.dimensoesMedidas('38x29x35');
  assert.equal(cm.comprimento, 0.38);
  assert.equal(cm.largura, 0.29);
  assert.equal(cm.altura, 0.35);
  const vazio = cotar.dimensoesMedidas('');
  assert.equal(vazio.comprimento, 0);
  assert.equal(vazio.largura, 0);
  assert.equal(vazio.altura, 0);
});

test('mesmaTransportadoraSSW não confunde ACCERT, TG e nomes genéricos', () => {
  assert.equal(cotar.mesmaTransportadoraSSW('Rodonaves', 'Rodonaves Transportes'), true);
  assert.equal(cotar.mesmaTransportadoraSSW('Transportes Silva', 'Transportadora Silva'), true);
  assert.equal(cotar.mesmaTransportadoraSSW('ACCERT', 'TG Transportes'), false);
  // TG e TGT são aliases da mesma transportadora na regra atual.
  assert.equal(cotar.mesmaTransportadoraSSW('TG', 'TGT'), true);
  assert.equal(cotar.mesmaTransportadoraSSW('Transportes', 'Logística'), false);
});

test('credenciaisVercelSSW mapeia ACCERT e TG pelas variáveis de ambiente', () => {
  setEnv({
    ACCERT_SSW_DOMINIO: 'ACC',
    ACCERT_SSW_LOGIN: 'login-accert-ficticio',
    ACCERT_SSW_SENHA: 'senha-accert-ficticia',
    ACCERT_SSW_CODIGO_MERCADORIA: '9'
  });
  const accert = cotar.credenciaisVercelSSW('ACCERT Transportes');
  assert.equal(accert.ssw_dominio, 'ACC');
  assert.equal(accert.ssw_login, 'login-accert-ficticio');
  assert.equal(accert.ssw_codigo_mercadoria, '9');

  setEnv({
    TG_SSW_DOMINIO: 'TGT',
    TG_SSW_LOGIN: 'login-tg-ficticio',
    TG_SSW_SENHA: 'senha-tg-ficticia'
  });
  const tg = cotar.credenciaisVercelSSW('TG Transportes');
  assert.equal(tg.ssw_dominio, 'TGT');
  assert.equal(tg.ssw_login, 'login-tg-ficticio');
  assert.equal(Object.keys(cotar.credenciaisVercelSSW('Outra Transportadora')).length, 0);
});

test('interpretarRetornoSSW lê cotação de sucesso', () => {
  const d = cotar.interpretarRetornoSSW(fixture('ssw-cotacao-ok.xml'));
  assert.equal(d.erro, 0);
  assert.equal(d.totalFrete, 123.45);
  assert.equal(d.prazo, 3);
  assert.match(d.mensagem, /sucesso/);
});

test('interpretarRetornoSSW lê retorno escapado com erro', () => {
  const d = cotar.interpretarRetornoSSW(fixture('ssw-cotacao-erro.xml'));
  assert.equal(d.erro, -1);
  assert.equal(d.totalFrete, 0);
  assert.match(d.mensagem, /CNPJ/);
});

test('interpretarRetornoSSW lança em faultstring', () => {
  assert.throws(
    () => cotar.interpretarRetornoSSW('<soap:Fault><faultstring>Falha fictícia</faultstring></soap:Fault>'),
    /Falha fictícia/
  );
});

test('soapEnvelope escapa valores e inclui ciffob', () => {
  const xml = cotar.soapEnvelope('urn:teste', {
    dominio: 'ABC', login: 'u', senha: 'p', cnpjPagador: '11222333000181',
    cepOrigem: 74000000, cepDestino: 20000000, valorNF: 100,
    quantidade: 1, peso: 1, volume: 1, mercadoria: 1, ciffob: 'C',
    cnpjRemetente: '11222333000181', cnpjDestinatario: '99888777000166',
    observacao: 'Teste & <xml>', trt: 'N', coletar: 'S',
    entDificil: 'N', destContribuinte: 'N', qtdePares: 0,
    altura: 0, comprimento: 0, largura: 0, fatorMultiplicador: 0
  });
  assert.match(xml, /<ciffob[^>]*>C<\/ciffob>/);
  assert.match(xml, /Teste &amp; &lt;xml&gt;/);
  assert.match(xml, /xmlns:urn="urn:teste"/);
});

test('statusPorTexto normaliza as ocorrências SSW em status internos', () => {
  assert.equal(rastreio.statusPorTexto('Mercadoria entregue ao destinatário'), 'entregue');
  assert.equal(rastreio.statusPorTexto('Saiu para entrega'), 'saiu_entrega');
  assert.equal(rastreio.statusPorTexto('Em trânsito para a filial'), 'em_transito');
  assert.equal(rastreio.statusPorTexto('Chegada na unidade de destino'), 'na_filial');
  assert.equal(rastreio.statusPorTexto('Devolvido ao remetente'), 'cancelado');
  assert.equal(rastreio.statusPorTexto('Avaria na embalagem'), 'ocorrencia');
});

test('parseDataSSW aceita ISO e valor inválido', () => {
  assert.equal(rastreio.parseDataSSW('2024-01-05T10:00:00Z'), Date.parse('2024-01-05T10:00:00Z'));
  assert.equal(rastreio.parseDataSSW('25/01/2024 14:30'), new Date(2024, 0, 25, 14, 30).getTime());
  assert.equal(rastreio.parseDataSSW('não é data'), 0);
  assert.equal(rastreio.parseDataSSW(''), 0);
});

test('F23 corrigido: data dd/mm/aaaa com dia <= 12 mantém o dia informado', () => {
  assert.equal(rastreio.parseDataSSW('05/01/2024 14:30'), new Date(2024, 0, 5, 14, 30).getTime());
  assert.equal(rastreio.parseDataSSW('05/01/2024'), new Date(2024, 0, 5).getTime());
  assert.equal(rastreio.parseDataSSW('5/1/2024'), new Date(2024, 0, 5).getTime());
  assert.equal(rastreio.parseDataSSW('31/12/2023 23:59:30'), new Date(2023, 11, 31, 23, 59, 30).getTime());
});

test('eventosTrackingSSW ordena ocorrências e eventoTrackingSSW usa a mais recente', () => {
  const dados = {
    tracking: [
      { ocorrencia: 'EM TRANSITO', descricao: 'Em viagem', data_hora: '01/01/2024 10:00', cidade: 'Goiânia', filial: 'GO' },
      { ocorrencia: 'ENTREGUE', descricao: 'Entregue ao destinatário', data_hora: '02/01/2024 11:00' }
    ]
  };
  const eventos = rastreio.eventosTrackingSSW(dados);
  assert.equal(eventos.length, 2);
  assert.equal(eventos[0].titulo, 'EM TRANSITO');
  assert.equal(eventos[1].titulo, 'ENTREGUE');
  const ultimo = rastreio.eventoTrackingSSW(dados);
  assert.equal(ultimo.titulo, 'ENTREGUE');
  assert.equal(ultimo.totalEventos, 2);
});

test('helpers da coleta SSW normalizam documento e números', () => {
  assert.equal(coleta.digits('12.345.678/0001-99'), '12345678000199');
  assert.equal(coleta.num('1.234,56'), 1234.56);
  assert.equal(coleta.num('10'), 10);
  assert.equal(coleta.esc('a&b'), 'a&amp;b');
  assert.equal(coleta.xmlDecode('a&amp;b'), 'a&b');
  assert.equal(coleta.tag('<a><![CDATA[valor]]></a>', 'a'), 'valor');
});

test('mesmaTransportadoraSSW da coleta tem a mesma proteção de ACCERT/TG', () => {
  assert.equal(coleta.mesmaTransportadoraSSW('ACCERT', 'TG Transportes'), false);
  assert.equal(coleta.mesmaTransportadoraSSW('Rodonaves', 'Rodonaves Transportes'), true);
});
