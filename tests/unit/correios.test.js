'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { preserveEnv, resetEnv, restoreEnv, setEnv } = require('../helpers/env');
const { response, withFetch } = require('../helpers/http');
const { loadScript } = require('../helpers/sandbox');

preserveEnv();
const correios = require('../../lib/integracoes/_correios');
const fixture = require('../fixtures/correios-prepostagens.json');
const sandbox = loadScript('lib/integracoes/_correios.js');
const { context: interno } = sandbox;

test.beforeEach(() => resetEnv());
test.after(() => restoreEnv());

test('cfg exige usuário e código de acesso', () => {
  assert.throws(() => correios.cfg(), /CORREIOS_USUARIO/);
  setEnv({ CORREIOS_USUARIO: 'usuario-ficticio', CORREIOS_CODIGO_ACESSO: 'codigo-ficticio' });
  const c = correios.cfg();
  assert.equal(c.usuario, 'usuario-ficticio');
  assert.equal(c.codigo, 'codigo-ficticio');
  assert.equal(c.cnpj.length, 14);
  assert.deepEqual(c.servicos, []);
});

test('listaPrepostResposta reconhece os envelopes usados pela API', () => {
  assert.deepEqual(correios.listaPrepostResposta([1, 2]), [1, 2]);
  assert.deepEqual(correios.listaPrepostResposta({ itens: [1] }), [1]);
  assert.deepEqual(correios.listaPrepostResposta({ items: [2] }), [2]);
  assert.deepEqual(correios.listaPrepostResposta({ content: [3] }), [3]);
  assert.deepEqual(correios.listaPrepostResposta({ prePostagens: [4] }), [4]);
  assert.deepEqual(correios.listaPrepostResposta({ objetos: [5] }), [5]);
  assert.deepEqual(correios.listaPrepostResposta({ outro: [6] }), []);
});

test('valorProfundo procura a primeira chave preenchida em qualquer nível', () => {
  const item = { a: { cpfCnpj: '11222333000181' }, b: { cpfCnpj: '99999999000199' } };
  assert.equal(correios.valorProfundo(item, ['cpfCnpj']), '11222333000181');
  assert.equal(correios.valorProfundo(item, ['inexistente']), '');
  assert.equal(correios.valorProfundo(null, ['x']), '');
});

test('expToken usa 50 minutos por padrão e respeita expiraEm', () => {
  const agora = Date.now();
  const padrao = interno.expToken({});
  assert.ok(padrao >= agora + 49 * 60 * 1000 && padrao <= agora + 51 * 60 * 1000);
  const exato = interno.expToken({ expiraEm: '2030-01-01T00:00:00.000Z' });
  assert.equal(exato, Date.parse('2030-01-01T00:00:00.000Z'));
});

test('br interpreta decimal brasileiro e n normaliza entrada', () => {
  assert.equal(interno.br('1.234,56'), 1234.56);
  assert.equal(interno.br('10,5'), 10.5);
  assert.equal(interno.br(''), 0);
  assert.equal(interno.n('10,5'), '10.5');
});

test('servicoCotavel aceita apenas produtos de contrato AG', () => {
  assert.equal(interno.servicoCotavel({ codigo: '03298', descricao: 'PAC CONTRATO AG' }), true);
  assert.equal(interno.servicoCotavel({ codigo: '03220', descricao: 'SEDEX CONTRATO AG' }), true);
  assert.equal(interno.servicoCotavel({ codigo: '03298', descricao: 'LOGISTICA REVERSA' }), false);
  assert.equal(interno.servicoCotavel({ codigo: '123', descricao: 'PAC' }), false);
});

function mockCorreios(payload) {
  return async (url) => {
    if (url.includes('/token/v1/autentica')) {
      return response({ token: 'token-ficticio', expiraEm: '2030-01-01T00:00:00.000Z' });
    }
    if (url.includes('/prepostagem/')) {
      const status = new URL(url).searchParams.get('status');
      return response(status === 'POSTADO' ? payload : { itens: [] });
    }
    return undefined;
  };
}

test('descobrirCodigoObjeto encontra o objeto por CNPJ e CEP', async () => {
  setEnv({ CORREIOS_USUARIO: 'usuario-ficticio', CORREIOS_CODIGO_ACESSO: 'codigo-ficticio' });
  let resultado = null;
  await withFetch(mockCorreios(fixture), async () => {
    resultado = await correios.descobrirCodigoObjeto({
      cnpj: '11222333000181',
      cep: '74000000',
      nome: 'CLIENTE FICTICIO ALFA',
      data: '2026-01-10T10:00:00'
    });
  });
  assert.equal(resultado.codigo, 'AA123456789BR');
  assert.ok(resultado.score >= 150);
});

test('descobrirCodigoObjeto não vincula quando há empate de pontuação', async () => {
  setEnv({ CORREIOS_USUARIO: 'usuario-ficticio', CORREIOS_CODIGO_ACESSO: 'codigo-ficticio' });
  const item = fixture.itens[0];
  const empate = {
    itens: [
      { ...item, codigoObjeto: 'CC111111111BR' },
      { ...item, codigoObjeto: 'DD222222222BR' }
    ]
  };
  let resultado = null;
  await withFetch(mockCorreios(empate), async () => {
    resultado = await correios.descobrirCodigoObjeto({
      cnpj: '11222333000181',
      cep: '74000000',
      nome: 'CLIENTE FICTICIO ALFA'
    });
  });
  assert.equal(resultado.codigo, null);
  assert.match(resultado.motivo, /Mais de um objeto/);
});

test('descobrirCodigoObjeto não aceita correspondência fraca', async () => {
  setEnv({ CORREIOS_USUARIO: 'usuario-ficticio', CORREIOS_CODIGO_ACESSO: 'codigo-ficticio' });
  let resultado = null;
  await withFetch(mockCorreios({ itens: [fixture.itens[1]] }), async () => {
    resultado = await correios.descobrirCodigoObjeto({
      cnpj: '11222333000181',
      cep: '74000000',
      nome: 'CLIENTE FICTICIO ALFA'
    });
  });
  assert.equal(resultado.codigo, null);
  assert.match(resultado.motivo, /sem correspondência segura/);
});

test('descobrirCodigoObjeto informa quando não há pré-postagens', async () => {
  setEnv({ CORREIOS_USUARIO: 'usuario-ficticio', CORREIOS_CODIGO_ACESSO: 'codigo-ficticio' });
  let resultado = null;
  await withFetch(mockCorreios({ itens: [] }), async () => {
    resultado = await correios.descobrirCodigoObjeto({ cnpj: '11222333000181', cep: '74000000' });
  });
  assert.equal(resultado.codigo, null);
  assert.match(resultado.motivo, /Nenhuma pré-postagem/);
});
