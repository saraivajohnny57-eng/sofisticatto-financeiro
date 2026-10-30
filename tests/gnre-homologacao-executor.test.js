'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  ESTADOS,
  mascararRecibo,
  chaveIdempotencia,
  montarPlanoConsulta,
  executarConsulta
} = require('../lib/integracoes/gnre-homologacao-executor');

class RepositorioMemoria {
  constructor() {
    this.itens = new Map();
    this.chamadas = [];
  }
  async reservar({ chave, servico, recibo_mascarado, ator }) {
    this.chamadas.push('reservar');
    if (this.itens.has(chave)) return { ok: false, existente: this.itens.get(chave) };
    this.itens.set(chave, { servico, recibo_mascarado, ator, estado: ESTADOS.RESERVADO, tentativa: 1 });
    return { ok: true };
  }
  async marcarEnviando(chave) {
    this.chamadas.push('enviando');
    const item = this.itens.get(chave);
    if (item) item.estado = ESTADOS.ENVIANDO;
  }
  async concluir(chave, dados) {
    this.chamadas.push('concluir');
    const item = this.itens.get(chave);
    if (item) Object.assign(item, dados, { estado: ESTADOS.CONCLUIDO });
  }
  async falhar(chave, dados) {
    this.chamadas.push('falhar');
    const item = this.itens.get(chave);
    if (item) Object.assign(item, dados, { estado: ESTADOS.FALHA });
  }
  async incerto(chave, dados) {
    this.chamadas.push('incerto');
    const item = this.itens.get(chave);
    if (item) Object.assign(item, dados, { estado: ESTADOS.INCERTO });
  }
  estado(chave) {
    return this.itens.get(chave)?.estado || null;
  }
}

function transporteOk(body = '<soap:Envelope><ok/></soap:Envelope>', status = 200) {
  const sent = [];
  return {
    sent,
    request(url, opcoes, callback) {
      const req = new EventEmitter();
      req.end = (xml) => {
        sent.push({ url, opcoes, xml });
        const res = new EventEmitter();
        res.statusCode = status;
        callback(res);
        process.nextTick(() => {
          res.emit('data', Buffer.from(body, 'utf8'));
          res.emit('end');
        });
      };
      req.destroy = (erro) => req.emit('error', erro);
      return req;
    }
  };
}

function transporteErro(codigo = 'ECONNRESET') {
  let chamadas = 0;
  return {
    get chamadas() { return chamadas; },
    request() {
      chamadas++;
      const req = new EventEmitter();
      req.end = () => process.nextTick(() => {
        req.emit('error', Object.assign(new Error('falha de transporte fictícia'), { code: codigo }));
      });
      req.destroy = (erro) => req.emit('error', erro);
      return req;
    }
  };
}

const CERT = { pfx: Buffer.from('pfx-ficticio'), passphrase: 'senha-ficticia' };

test('mascararRecibo e chaveIdempotencia não expõem o recibo completo', () => {
  assert.equal(mascararRecibo('0000001234'), '••••••1234');
  assert.equal(mascararRecibo(''), '');
  const chave = chaveIdempotencia('consulta', '0000001234');
  assert.match(chave, /^gnre:consulta:[a-f0-9]{32}$/);
  assert.ok(!chave.includes('0000001234'));
  assert.notEqual(chave, chaveIdempotencia('consulta', '0000004321'));
});

test('montarPlanoConsulta monta envelope oficial e metadados', () => {
  const plano = montarPlanoConsulta('0000001234');
  assert.match(plano.xml, /<TConsLote_GNRE xmlns="http:\/\/www\.gnre\.pe\.gov\.br">/);
  assert.match(plano.xml, /<numeroRecibo>0000001234<\/numeroRecibo>/);
  assert.match(plano.xml, /http:\/\/www\.w3\.org\/2003\/05\/soap-envelope/);
  assert.match(plano.destino, /:444\/gnreWS\/services\/GnreResultadoLote$/);
  assert.equal(plano.soapAction, 'http://www.gnre.pe.gov.br/webservice/GnreResultadoLote/consultar');
  assert.equal(plano.xml_sha256.length, 64);
  assert.equal(plano.recibo_mascarado, '••••••1234');
});

test('executor em dry-run não exige repositório, certificado ou transporte', async () => {
  const r = await executarConsulta({ recibo: '0000001234' });
  assert.equal(r.ok, true);
  assert.equal(r.dry_run, true);
  assert.equal(r.transmissao, 'desabilitada_nesta_fase');
  assert.equal(Object.hasOwn(r, 'xml'), false);
  assert.equal(r.recibo_mascarado, '••••••1234');
});

test('executor exige A1 e repositório antes de qualquer envio', async () => {
  await assert.rejects(
    () => executarConsulta({ recibo: '0000001234', permitirTransmissao: true, repositorio: new RepositorioMemoria() }),
    /Certificado A1/
  );
  await assert.rejects(
    () => executarConsulta({ recibo: '0000001234', permitirTransmissao: true, certificado: CERT }),
    /Repositório/
  );
});

test('executor envia uma única vez e bloqueia duplicidade', async () => {
  const repo = new RepositorioMemoria();
  const transport = transporteOk();
  const primeira = await executarConsulta({
    recibo: '0000001234', repositorio: repo, certificado: CERT, transport, permitirTransmissao: true
  });
  assert.equal(primeira.ok, true);
  assert.equal(primeira.estado, ESTADOS.CONCLUIDO);
  assert.equal(primeira.validacao_fiscal, 'nao_realizada');
  assert.equal(transport.sent.length, 1);
  assert.match(transport.sent[0].xml, /TConsLote_GNRE/);
  assert.match(transport.sent[0].opcoes.headers['Content-Type'], /action="http:\/\/www\.gnre\.pe\.gov\.br\/webservice\/GnreResultadoLote\/consultar"/);
  assert.equal(repo.estado(primeira.idempotency_key), ESTADOS.CONCLUIDO);

  const segunda = await executarConsulta({
    recibo: '0000001234', repositorio: repo, certificado: CERT, transport, permitirTransmissao: true
  });
  assert.equal(segunda.ok, false);
  assert.equal(segunda.bloqueado, true);
  assert.equal(segunda.estado, ESTADOS.CONCLUIDO);
  assert.equal(transport.sent.length, 1);
});

test('erro de transporte vira resultado incerto e não é repetido', async () => {
  const repo = new RepositorioMemoria();
  const transport = transporteErro('ECONNRESET');
  const r = await executarConsulta({
    recibo: '0000005678', repositorio: repo, certificado: CERT, transport, permitirTransmissao: true
  });
  assert.equal(r.ok, false);
  assert.equal(r.estado, ESTADOS.INCERTO);
  assert.equal(r.erro_codigo, 'ECONNRESET');
  assert.equal(repo.estado(r.idempotency_key), ESTADOS.INCERTO);

  const repeticao = await executarConsulta({
    recibo: '0000005678', repositorio: repo, certificado: CERT, transport, permitirTransmissao: true
  });
  assert.equal(repeticao.bloqueado, true);
  assert.equal(repeticao.estado, ESTADOS.INCERTO);
  assert.equal(transport.chamadas, 1);
});

test('SOAP Fault e HTTP de erro são registrados como falha, sem retry', async () => {
  const repo = new RepositorioMemoria();
  const fault = await executarConsulta({
    recibo: '0000001111',
    repositorio: repo,
    certificado: CERT,
    transport: transporteOk('<soap:Envelope><soap:Fault><faultstring>erro</faultstring></soap:Fault></soap:Envelope>'),
    permitirTransmissao: true
  });
  assert.equal(fault.estado, ESTADOS.FALHA);
  assert.equal(fault.categoria, 'soap_fault');

  const repo2 = new RepositorioMemoria();
  const httpErro = await executarConsulta({
    recibo: '0000002222',
    repositorio: repo2,
    certificado: CERT,
    transport: transporteOk('<soap:Envelope><erro/></soap:Envelope>', 500),
    permitirTransmissao: true
  });
  assert.equal(httpErro.estado, ESTADOS.FALHA);
  assert.equal(httpErro.categoria, 'http_erro');
});

test('recibo inválido falha antes de reservar idempotência', async () => {
  const repo = new RepositorioMemoria();
  await assert.rejects(
    () => executarConsulta({ recibo: '123', repositorio: repo, certificado: CERT, transport: transporteOk(), permitirTransmissao: true }),
    /10 ou 14/
  );
  assert.equal(repo.chamadas.length, 0);
});
