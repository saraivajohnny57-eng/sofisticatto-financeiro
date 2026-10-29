'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv } = require('../helpers/env');
const { loadScript } = require('../helpers/sandbox');

preserveEnv();

const utilsStub = {
  exigirAdmin() { return true; },
  supabaseRest: async () => [],
  criptografar: () => ({}),
  descriptografar: () => ({})
};
const forgeStub = { pki: {} };

const { context: bb, exposed: bbExposed } = loadScript('api/banco-bb.js', {
  stubs: { 'node-forge': forgeStub, '../lib/integracoes/_utils': utilsStub },
  expose: ['normalizarAmb', 'soDigitos']
});
const { context: bradesco } = loadScript('api/banco-bradesco.js', {
  stubs: { 'node-forge': forgeStub, '../lib/integracoes/_utils': utilsStub }
});

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('BB: normalizarAmb só reconhece "teste" e trata o resto como produção', () => {
  const normalizar = bbExposed.normalizarAmb;
  assert.equal(normalizar('teste'), 'teste');
  assert.equal(normalizar('TESTE'), 'teste');
  assert.equal(normalizar('producao'), 'producao');
  // F10 (comportamento atual): ambientes não previstos caem em produção.
  assert.equal(normalizar('homologacao'), 'producao');
  assert.equal(normalizar(undefined), 'producao');
});

test('BB: montarNossoNumeroBb exige 10 dígitos e prefixa o convênio', () => {
  const numero = bb.montarNossoNumeroBb('0000034114');
  assert.equal(numero.length, 20);
  assert.match(numero, /^\d{20}$/);
  assert.ok(numero.endsWith('0000034114'));
  assert.throws(() => bb.montarNossoNumeroBb('123'), /10 dígitos/);
  assert.throws(() => bb.montarNossoNumeroBb('0000000000'), /não pode ser zero/);
});

test('BB: dataBb aceita data ISO curta e rejeita inválida', () => {
  assert.equal(bb.dataBb('2024-01-05'), '05.01.2024');
  assert.match(bb.dataBbHoje(), /^\d{2}\.\d{2}\.\d{4}$/);
  assert.throws(() => bb.dataBb('data-invalida'), /Data inválida/);
});

test('BB: interpretarSituacaoBoletoBb prioriza o estado bancário', () => {
  assert.equal(bb.interpretarSituacaoBoletoBb({ codigoEstadoTituloCobranca: 6 }).statusNovo, 'pago');
  assert.equal(bb.interpretarSituacaoBoletoBb({ codigoEstadoTituloCobranca: 7 }).statusNovo, 'cancelado');

  const vencido = bb.interpretarSituacaoBoletoBb(
    { codigoEstadoTituloCobranca: 1 },
    { vencimento: '2000-01-01' }
  );
  assert.equal(vencido.statusNovo, 'vencido');

  const aberto = bb.interpretarSituacaoBoletoBb(
    { codigoEstadoTituloCobranca: 1 },
    { vencimento: '2999-01-01' }
  );
  assert.equal(aberto.statusNovo, 'aberto');

  const parcial = bb.interpretarSituacaoBoletoBb({ codigoEstadoTituloCobranca: 18 });
  assert.equal(parcial.parcial, true);
  assert.equal(parcial.detalhe, 'Pago parcialmente');

  const protestado = bb.interpretarSituacaoBoletoBb({ codigoEstadoTituloCobranca: 9 });
  assert.equal(protestado.protestado, true);

  const descontado = bb.interpretarSituacaoBoletoBb({ codigoEstadoTituloCobranca: 1, codigoModalidadeTitulo: 6 });
  assert.equal(descontado.descontado, true);
});

test('BB: acharCampoBb encontra chaves aninhadas', () => {
  const dados = { titulo: { cobranca: { valorPagoSacado: 10.5 } } };
  assert.equal(bb.acharCampoBb(dados, ['valorPagoSacado']), 10.5);
  assert.equal(bb.acharCampoBb(dados, ['inexistente']), null);
});

test('Bradesco: ambiente é sandbox por padrão', () => {
  assert.equal(bradesco.ambiente(), 'sandbox');
  assert.equal(bradesco.ambiente('homologacao'), 'sandbox');
  assert.equal(bradesco.ambiente('producao'), 'producao');
  assert.equal(bradesco.ambiente('PRODUCAO'), 'producao');
});

test('Bradesco: gerarNuNegociacao monta 4 + 7 zeros + 7 dígitos', () => {
  const numero = bradesco.gerarNuNegociacao('1234', '56789');
  assert.equal(numero, '1234' + '0000000' + '0056789');
  assert.equal(numero.length, 18);
  assert.equal(bradesco.gerarNuNegociacao('', '1'), '');
  assert.throws(() => bradesco.gerarNuNegociacao('12345', '1'), /até 4/);
  assert.throws(() => bradesco.gerarNuNegociacao('1', '12345678'), /até 7/);
});

test('Bradesco: mascarar preserva extremos e oculta o miolo', () => {
  assert.equal(bradesco.mascarar('123456789', 2, 2), '12•••••89');
  assert.equal(bradesco.mascarar('12', 2, 2), '••');
  assert.equal(bradesco.mascarar(''), '');
});

test('Bradesco: interpretarConsultaBradesco detecta pago, baixado e vencido', () => {
  const pago = bradesco.interpretarConsultaBradesco({ titulo: { codStatus: 13, vlrPagto: 100 } }, {});
  assert.equal(pago.pago, true);
  assert.equal(pago.statusNovo, 'pago');

  const baixado = bradesco.interpretarConsultaBradesco({ titulo: { codStatus: 51 } }, {});
  assert.equal(baixado.baixado, true);
  assert.equal(baixado.statusNovo, 'cancelado');

  const vencido = bradesco.interpretarConsultaBradesco(
    { titulo: { codStatus: 1, dataVenctoBol: '01/01/2000' } },
    { status: 'aberto' }
  );
  assert.equal(vencido.statusNovo, 'vencido');

  const aberto = bradesco.interpretarConsultaBradesco(
    { titulo: { codStatus: 1, dataVenctoBol: '01/01/2999' } },
    { status: 'aberto' }
  );
  assert.equal(aberto.statusNovo, 'aberto');
});

test('Bradesco: dadosBancariosStatus e detalhe de erro não expõem segredos', () => {
  const detalhe = bradesco.detalheRespostaBradesco({
    mensagem: 'Erro fictício do banco',
    token: 'segredo-nao-vazar',
    client_secret: 'outro-segredo-nao-vazar'
  });
  assert.match(detalhe, /Erro fictício do banco/);
  assert.ok(!detalhe.includes('segredo-nao-vazar'));
  assert.ok(!detalhe.includes('outro-segredo-nao-vazar'));
});

test('F24 corrigido: datas Bradesco distinguem YYYYMMDD, DDMMYYYY e ISO', () => {
  assert.equal(bradesco.bradescoStatusDescricao(61), 'PAGO');
  assert.equal(bradesco.bradescoStatusDescricao(999), '');
  assert.equal(bradesco.dataBradescoIso('05012024'), '2024-01-05');
  assert.equal(bradesco.dataBradescoIso('01012024'), '2024-01-01');
  assert.equal(bradesco.dataBradescoIso('20240105'), '2024-01-05');
  assert.equal(bradesco.dataBradescoIso('05/01/2024'), '2024-01-05');
  assert.equal(bradesco.dataBradescoIso('2024-01-05'), '2024-01-05');
  assert.equal(bradesco.dataBradescoIso('2024-01-05T10:00:00'), '2024-01-05');
  assert.equal(bradesco.dataBradescoIso('20241305'), null);
  assert.equal(bradesco.dataBradescoIso('invalida'), null);
});
