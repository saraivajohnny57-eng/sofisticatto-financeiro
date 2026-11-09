'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extrairRecibo, mascararRecibo, executarRecepcao, montarPlanoRecepcao } = require('../../lib/integracoes/gnre-recepcao-executor');
const { montarConsulta } = require('../../lib/integracoes/gnre-consulta-lote');
const guia = '<TDadosGNRE versao="2.00"><ufFavorecida>MG</ufFavorecida></TDadosGNRE>';

test('extrai recibos GNRE de 10 e 14 digitos sem expor na mascara', () => {
 for (const recibo of ['1234567890', '12345678901234']) {
  assert.equal(extrairRecibo('<numeroRecibo>'+recibo+'</numeroRecibo>'),recibo);
  assert.equal(extrairRecibo('<ns:numeroRecibo>'+recibo+'</ns:numeroRecibo>'),recibo);
  assert.ok(!mascararRecibo(recibo).includes(recibo));
  assert.ok(mascararRecibo(recibo).endsWith(recibo.slice(-4)));
  assert.match(montarConsulta(recibo), /TConsLote_GNRE/);
 }
 assert.equal(extrairRecibo('<numeroRecibo>123</numeroRecibo>'),null);
});
test('planejamento gera chave deterministica para mesmo lote', () => {
 const a=montarPlanoRecepcao([guia]);
 const b=montarPlanoRecepcao([guia]);
 assert.equal(a.idempotency_key,b.idempotency_key);
 assert.match(a.idempotency_key,/^gnre:recepcao:[a-f0-9]{32}$/);
});
test('modo seguro nao chama repositorio ou transporte',async()=>{
 const result=await executarRecepcao({guias:[guia],permitirTransmissao:false});
 assert.equal(result.dry_run,true);
 assert.equal(result.transmissao,'desabilitada_nesta_fase');
});
test('transmissao requer certificado e repositorio',async()=>{
 await assert.rejects(executarRecepcao({guias:[guia],permitirTransmissao:true}),/Certificado A1/);
 await assert.rejects(executarRecepcao({guias:[guia],permitirTransmissao:true,certificado:{pfx:Buffer.from('dummy')}}),/Repositório de idempotência/);
});

const { criptografar, descriptografar } = require('../../lib/integracoes/_utils');
test('recibo cifrado faz round-trip e detecta adulteracao sem revelar valor', () => {
 const anterior = process.env.INTEGRATIONS_ENCRYPTION_KEY;
 try {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'gnre-test-only-encryption-key-not-for-production';
  const recibo = '12345678901234';
  const registro = criptografar({ recibo });
  assert.ok(!JSON.stringify(registro).includes(recibo));
  assert.equal(descriptografar({ payload_criptografado: registro.payload, iv: registro.iv, auth_tag: registro.tag }).recibo, recibo);
  const tag = Buffer.from(registro.tag, 'base64');
  tag[0] ^= 1;
  assert.throws(() => descriptografar({ payload_criptografado: registro.payload, iv: registro.iv, auth_tag: tag.toString('base64') }));
 } finally {
  if (anterior === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  else process.env.INTEGRATIONS_ENCRYPTION_KEY = anterior;
 }
});
