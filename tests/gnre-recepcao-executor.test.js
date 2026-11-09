'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { guiaSimples } = require('../lib/integracoes/gnre-guia-simples-offline');
const {
  ESTADOS,
  mascararRecibo,
  extrairRecibo,
  chaveIdempotencia,
  montarPlanoRecepcao,
  executarRecepcao
} = require('../lib/integracoes/gnre-recepcao-executor');

function guiaValida(overrides = {}) {
  return guiaSimples({
    ufFavorecida: 'MG',
    receita: '100099',
    valorPrincipal: '79.17',
    dataVencimento: '2026-07-08',
    contribuinte: { cnpj: '05451985000195', razaoSocial: 'Sofisticatto Teste' },
    documentoOrigem: '50371',
    tipoDocumentoOrigem: '10',
    ...overrides
  });
}

class RepositorioMemoria {
  constructor() { this.itens = new Map(); this.chamadas = []; }
  async reservar(dados) {
    this.chamadas.push(['reservar', dados.servico]);
    if (this.itens.has(dados.chave)) return { ok: false, existente: this.itens.get(dados.chave) };
    this.itens.set(dados.chave, { ...dados, estado: ESTADOS.RESERVADO });
    return { ok: true };
  }
  async marcarEnviando(k) { this.chamadas.push(['enviando']); this.itens.get(k).estado = ESTADOS.ENVIANDO; }
  async concluir(k, d) { this.chamadas.push(['concluir']); Object.assign(this.itens.get(k), d, { estado: ESTADOS.CONCLUIDO }); }
  async falhar(k, d) { this.chamadas.push(['falhar']); Object.assign(this.itens.get(k), d, { estado: ESTADOS.FALHA }); }
  async incerto(k, d) { this.chamadas.push(['incerto']); Object.assign(this.itens.get(k), d, { estado: ESTADOS.INCERTO }); }
  estado(k) { return this.itens.get(k)?.estado || null; }
}

function transporteOk(body, status = 200) {
  const enviados = [];
  return {
    enviados,
    request(url, opcoes, callback) {
      const req = new EventEmitter();
      req.end = (xml) => {
        enviados.push({ url, opcoes, xml });
        const res = new EventEmitter();
        res.statusCode = status;
        callback(res);
        process.nextTick(() => { res.emit('data', Buffer.from(body, 'utf8')); res.emit('end'); });
      };
      req.destroy = (e) => req.emit('error', e);
      return req;
    }
  };
}

const CERT = { pfx: Buffer.from('pfx-ficticio'), passphrase: 'senha-ficticia' };
const RECIBO_OK = '<soap:Envelope><soap:Body><TRetLote_GNRE>'
  +'<ambiente>2</ambiente><situacaoRecepcao><codigo>100</codigo>'
  +'<descricao>Lote recebido com sucesso</descricao></situacaoRecepcao>'
  +'<recibo><numero>1234567890</numero><dataHoraRecibo>2026-11-09T13:10:00</dataHoraRecibo>'
  +'<tempoEstimadoProc>1000</tempoEstimadoProc></recibo></TRetLote_GNRE></soap:Body></soap:Envelope>';

test('mascararRecibo expõe apenas os 4 últimos dígitos', () => {
  assert.equal(mascararRecibo('1234567890'), '••••••7890');
  assert.equal(mascararRecibo(''), '');
  assert.equal(mascararRecibo(null), '');
});

test('extrairRecibo lê recibo.numero apenas de retorno de recepcao codigo 100', () => {
  assert.equal(extrairRecibo(RECIBO_OK), '1234567890');
  assert.equal(extrairRecibo('<soap:Envelope><outro/></soap:Envelope>'), null);
  assert.equal(extrairRecibo(''), null);
  assert.equal(extrairRecibo('<soap:Envelope><numeroRecibo>1234567890</numeroRecibo></soap:Envelope>'), null);
});

test('chave de idempotência da recepção é derivada do hash do lote', () => {
  const plano = montarPlanoRecepcao([guiaValida()]);
  assert.match(plano.idempotency_key, /^gnre:recepcao:[a-f0-9]{32}$/);
  assert.ok(!plano.idempotency_key.includes(plano.lote_sha256));
  assert.throws(() => chaveIdempotencia('curto'), /Hash do lote/);
});

test('lotes diferentes geram chaves diferentes', () => {
  const a = montarPlanoRecepcao([guiaValida({ valorPrincipal: '79.17' })]);
  const b = montarPlanoRecepcao([guiaValida({ valorPrincipal: '80.00' })]);
  assert.notEqual(a.idempotency_key, b.idempotency_key);
});

test('plano de recepção monta envelope oficial com destino de recepção', () => {
  const plano = montarPlanoRecepcao([guiaValida()]);
  assert.equal(plano.servico, 'recepcao');
  assert.match(plano.destino, /\/gnreWS\/services\/GnreLoteRecepcao$/);
  assert.equal(plano.soapAction, 'http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcao/processar');
  assert.match(plano.xml, /<TLote_GNRE/);
  assert.equal(plano.guias, 1);
});

test('dry-run não exige certificado nem repositório', async () => {
  const r = await executarRecepcao({ guias: [guiaValida()] });
  assert.equal(r.ok, true);
  assert.equal(r.dry_run, true);
  assert.equal(r.transmissao, 'desabilitada_nesta_fase');
  assert.equal(Object.hasOwn(r, 'xml'), false);
});

test('exige A1 e repositório antes de qualquer envio', async () => {
  await assert.rejects(
    () => executarRecepcao({ guias: [guiaValida()], permitirTransmissao: true, repositorio: new RepositorioMemoria() }),
    /Certificado A1/
  );
  await assert.rejects(
    () => executarRecepcao({ guias: [guiaValida()], permitirTransmissao: true, certificado: CERT }),
    /Repositório/
  );
});

test('recepção bem-sucedida registra recibo mascarado', async () => {
  const repo = new RepositorioMemoria();
  const transport = transporteOk(RECIBO_OK);
  const r = await executarRecepcao({
    guias: [guiaValida()], repositorio: repo, certificado: CERT, transport, permitirTransmissao: true
  });
  assert.equal(r.ok, true);
  assert.equal(r.estado, ESTADOS.CONCLUIDO);
  assert.equal(r.codigo_gnre, '100');
  assert.equal(r.recibo_mascarado, '••••••7890');
  assert.equal(r.possui_recibo, true);
  assert.ok(!JSON.stringify(r).includes('1234567890'), 'recibo completo não deve sair');
  assert.equal(repo.itens.get(r.idempotency_key).recibo_retorno_mascarado, '••••••7890');
  assert.equal(transport.enviados.length, 1);
});

test('reenvio do mesmo lote é bloqueado sem novo envio', async () => {
  const repo = new RepositorioMemoria();
  const transport = transporteOk(RECIBO_OK);
  const guias = [guiaValida()];
  await executarRecepcao({ guias, repositorio: repo, certificado: CERT, transport, permitirTransmissao: true });
  const segunda = await executarRecepcao({ guias, repositorio: repo, certificado: CERT, transport, permitirTransmissao: true });
  assert.equal(segunda.bloqueado, true);
  assert.equal(segunda.estado, ESTADOS.CONCLUIDO);
  assert.equal(transport.enviados.length, 1);
});

test('falha de transporte vira resultado incerto e bloqueia reenvio', async () => {
  const repo = new RepositorioMemoria();
  let chamadas = 0;
  const transport = {
    request() {
      chamadas++;
      const req = new EventEmitter();
      req.end = () => process.nextTick(() => req.emit('error', Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
      req.destroy = (e) => req.emit('error', e);
      return req;
    }
  };
  const guias = [guiaValida()];
  const r = await executarRecepcao({ guias, repositorio: repo, certificado: CERT, transport, permitirTransmissao: true });
  assert.equal(r.estado, ESTADOS.INCERTO);
  assert.equal(r.erro_codigo, 'ETIMEDOUT');
  assert.match(r.motivo, /NÃO reenviar/);

  const segunda = await executarRecepcao({ guias, repositorio: repo, certificado: CERT, transport, permitirTransmissao: true });
  assert.equal(segunda.bloqueado, true);
  assert.equal(chamadas, 1);
});

test('SOAP Fault sem confirmacao oficial vira resultado incerto (sem reenvio)', async () => {
  const repo = new RepositorioMemoria();
  const r = await executarRecepcao({
    guias: [guiaValida()],
    repositorio: repo,
    certificado: CERT,
    transport: transporteOk('<soap:Envelope><soap:Fault><faultstring>x</faultstring></soap:Fault></soap:Envelope>'),
    permitirTransmissao: true
  });
  assert.equal(r.estado, ESTADOS.INCERTO);
  assert.equal(r.categoria, 'soap_fault');
});

test('lote inválido falha antes de reservar idempotência', async () => {
  const repo = new RepositorioMemoria();
  assert.throws(() => montarPlanoRecepcao([]), /1 a 50 guias/);
  assert.equal(repo.chamadas.length, 0);
});

test('rejeicao aplicacional 102 e tratada como falha sem recibo', async () => {
 const repo=new RepositorioMemoria();
 const resposta='<soap:Envelope><TRetLote_GNRE><ambiente>2</ambiente><situacaoRecepcao>'
  +'<codigo>102</codigo><descricao>CNPJ nao habilitado</descricao></situacaoRecepcao>'
  +'</TRetLote_GNRE></soap:Envelope>';
 const transport=transporteOk(resposta);
 const r=await executarRecepcao({guias:[guiaValida()],repositorio:repo,
  certificado:CERT,transport,permitirTransmissao:true});
 assert.equal(r.ok,false);
 assert.equal(r.estado,ESTADOS.FALHA);
 assert.equal(r.codigo_gnre,'102');
 assert.equal(transport.enviados.length,1);
});
test('HTTP 200 sem codigo 100 + recibo e incerto e nao pode reencaminhar', async () => {
 const repo=new RepositorioMemoria();
 const transport=transporteOk('<soap:Envelope><outro/></soap:Envelope>');
 const guias=[guiaValida()];
 const first=await executarRecepcao({guias,repositorio:repo,certificado:CERT,
   transport,permitirTransmissao:true});
 assert.equal(first.estado,ESTADOS.INCERTO);
 const second=await executarRecepcao({guias,repositorio:repo,certificado:CERT,
   transport,permitirTransmissao:true});
 assert.equal(second.bloqueado,true);
 assert.equal(transport.enviados.length,1);
});
