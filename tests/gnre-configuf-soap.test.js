'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {SOAP_ACTION,montarDadosConfigUf,montarEnvelopeConfigUf,analisarConfigUf,validarWsdlConfigUf,deveConsultarUfSemReceita,classificarConfigUf}=require('../lib/integracoes/gnre-configuf-xml');

const SOAP12='http://schemas.xmlsoap.org/wsdl/soap12/';
const WSDL='<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap12="'+SOAP12+'">'
  +'<wsdl:operation name="consultar"><soap12:operation soapAction="'+SOAP_ACTION+'"/></wsdl:operation>'
  +'<wsdl:service><wsdl:port><soap12:address location="https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreConfigUF"/></wsdl:port></wsdl:service>'
  +'</wsdl:definitions>';
test('ConfigUF monta XML estruturado com o namespace exigido e somente homologacao',()=>{
  const xml=montarEnvelopeConfigUf();
  assert.match(xml,/<gnreDadosMsg xmlns="http:\/\/www.gnre.pe.gov.br\/webservice\/GnreConfigUF"><TConsultaConfigUf xmlns="http:\/\/www.gnre.pe.gov.br">/);
  assert.match(xml,/<ambiente>2<\/ambiente><uf>MG<\/uf><receita>100129<\/receita>/);
  assert.doesNotMatch(xml,/&lt;|&gt;|<ambiente>1<\/ambiente>/);
  assert.match(xml,/versaoDados>1\.00<\/versaoDados>/);
  assert.equal((xml.match(/<soap12:Envelope/g)||[]).length,1);
});
test('Fallback de configuracao da UF omite receita e preserva mesmo envelope',()=>{
  const uf=montarEnvelopeConfigUf({uf:'MG',receita:null});
  assert.match(uf,/<ambiente>2<\/ambiente><uf>MG<\/uf><\/TConsultaConfigUf>/);
  assert.doesNotMatch(uf,/<receita>/);
  assert.ok(uf.includes('<gnreDadosMsg xmlns="http://www.gnre.pe.gov.br/webservice/GnreConfigUF">'));
});
test('Somente consulta MG 100129 ou MG sem receita e valores arbitrarios sao recusados',()=>{
  assert.throws(()=>montarDadosConfigUf({uf:'GO',receita:'100129'}));
  assert.throws(()=>montarDadosConfigUf({uf:'MG',receita:'100099'}));
  assert.throws(()=>montarDadosConfigUf({uf:'MG',receita:'</receita>'}));
});
test('XSD versionado confirma TConsultaConfigUf e ordem ambiente uf receita',()=>{
  const schema=fs.readFileSync(path.join(__dirname,'../docs/gnre-xsd/consulta_config_uf_v1.00.xsd'),'utf8');
  assert.match(schema,/<element name="TConsultaConfigUf">/);
  assert.ok(schema.indexOf('name="ambiente"')<schema.indexOf('name="uf"'));
  assert.ok(schema.indexOf('name="uf"')<schema.indexOf('name="receita"'));
  assert.match(montarDadosConfigUf(),/^<TConsultaConfigUf xmlns=/);
});
test('Retorno SOAP Fault HTTP 500 nao pode virar consulta aprovada',()=>{
  const xml='<soapenv:Envelope><soapenv:Body><soapenv:Fault>'
    +'<soapenv:Reason><soapenv:Text xml:lang="en">java.rmi.RemoteException: Erro ao gerar XML de resposta</soapenv:Text></soapenv:Reason>'
    +'</soapenv:Fault></soapenv:Body></soapenv:Envelope>';
  const r=analisarConfigUf({http_status:500,xml});
  assert.equal(r.ok,false);
  assert.equal(r.falha_soap,true);
  assert.match(r.fault,/Erro ao gerar XML de resposta/);
  assert.equal(r.codigo_situacao,null);
});
test('Retorno SOAP 200 sem retorno fiscal 450 e sem TConfigUf nao confirma receita',()=>{
  assert.equal(analisarConfigUf({http_status:200,xml:'<soapenv:Envelope><resultado/></soapenv:Envelope>'}).ok,false);
});
test('Retorno valido HTTP 200 exige codigo fiscal e TConfigUf',()=>{
  const xml='<soap:Envelope><soap:Body><TConfigUf xmlns="http://www.gnre.pe.gov.br">'
    +'<situacaoConsulta><codigo>450</codigo><descricao>Consulta realizada</descricao></situacaoConsulta>'
    +'<receitas><receita codigo="100129"><exigeDocumentoOrigem>S</exigeDocumentoOrigem></receita></receitas>'
    +'</TConfigUf></soap:Body></soap:Envelope>';
  const r=analisarConfigUf({http_status:200,xml});
  assert.equal(r.ok,true);
  assert.deepEqual(r.receitas_encontradas,['100129']);
  assert.ok(r.campos_identificados.includes('exigeDocumentoOrigem'));
});
test('WSDL valida binding SOAP12 acao e HTTPS oficial porta 444',()=>{
  assert.equal(validarWsdlConfigUf(WSDL).href,'https://www.testegnre.pe.gov.br:444/gnreWS/services/GnreConfigUF');
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace(SOAP12,'http://schemas.xmlsoap.org/wsdl/soap/')));
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace(SOAP_ACTION,'https://example.com/action')));
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace('www.testegnre.pe.gov.br:444','localhost:444')));
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace('www.testegnre.pe.gov.br:444','www.testegnre.pe.gov.br:443')));
  assert.throws(()=>validarWsdlConfigUf(WSDL.replace('https://www.testegnre.pe.gov.br:444','http://www.testegnre.pe.gov.br:444')));
});

const {spawnSync}=require('node:child_process');
const os=require('node:os');
const base=path.join(__dirname,'..');
const schemaConfig=path.join(base,'docs/gnre-xsd/consulta_config_uf_v1.00.xsd');
const scriptValidador=path.join(base,'scripts/gnre-validar-xsd.py');
const xmlschemaDisponivel=spawnSync('python3',['-c','import xmlschema'],{encoding:'utf8'}).status===0;
test('XML real de consulta MG com e sem receita passa no XSD ConfigUF versionado',
  {skip:xmlschemaDisponivel?false:'Python xmlschema indisponivel'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gnre-configuf-'));
  try {
    for(const receita of ['100129',null]){
      const xml=montarDadosConfigUf({uf:'MG',receita});
      const nome=path.join(dir,receita?'com-receita.xml':'sem-receita.xml');
      fs.writeFileSync(nome,xml,'utf8');
      const resultado=spawnSync('python3',[scriptValidador,'--schema',schemaConfig,'--xml',nome],{encoding:'utf8'});
      assert.equal(resultado.status,0,resultado.stdout+' '+resultado.stderr);
      assert.equal(JSON.parse(resultado.stdout).ok,true);
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('GNRE codigo 199 mesmo com HTTP 200 ativa controle MG sem receita',()=>{
 const xml='<soapenv:Envelope xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope"><soapenv:Body>'
  +'<gnreRespostaMsg><TConfigUf><situacaoConsulta><codigo>199</codigo>'
  +'<descricao>Erro ao validar a comunicacao. Confira o endereco informado em AUTOMACAO.</descricao>'
  +'</situacaoConsulta></TConfigUf></gnreRespostaMsg>'
  +'</soapenv:Body></soapenv:Envelope>';
 const a=analisarConfigUf({http_status:200,xml});
 assert.equal(a.http_status,200);
 assert.equal(a.ok,false);
 assert.equal(a.codigo_situacao,'199');
 assert.equal(a.falha_soap,false);
 assert.equal(deveConsultarUfSemReceita(a),true);
 assert.equal(classificarConfigUf(a,null),'codigo_199_validacao_de_comunicacao');
});
test('rejeicao 199 em receita e controle da UF identifica falha comum de comunicacao',()=>{
 const a={ok:false,http_status:200,codigo_situacao:'199'};
 const uf={ok:false,http_status:200,codigo_situacao:'199'};
 assert.equal(classificarConfigUf(a,uf),'codigo_199_nas_duas_consultas');
});
test('rejeicao 199 so na receita e consulta geral UF aprovada identifica filtro',()=>{
 const a={ok:false,http_status:200,codigo_situacao:'199'};
 const uf={ok:true,http_status:200,codigo_situacao:'450'};
 assert.equal(classificarConfigUf(a,uf),'codigo_199_apenas_com_filtro_de_receita');
});
test('nao consulta UF de novo quando receita 450 ja foi confirmada',()=>{
 const a={ok:true,http_status:200,codigo_situacao:'450'};
 assert.equal(deveConsultarUfSemReceita(a),false);
 assert.equal(classificarConfigUf(a,null),'receita_confirmada');
});
test('consulta de controle continua para Fault ou HTTP 500 sem engolir rejeicao HTTP 200',()=>{
 assert.equal(deveConsultarUfSemReceita({ok:false,http_status:500,falha_soap:false}),true);
 assert.equal(deveConsultarUfSemReceita({ok:false,http_status:200,falha_soap:true}),true);
 assert.equal(deveConsultarUfSemReceita({ok:false,http_status:200,codigo_situacao:'451'}),false);
});
test('rota administrativa usa a decisao 199 e nao retransmite GNRE fiscal',()=>{
 const handler=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-configuf-consulta.js'),'utf8');
 assert.ok(handler.includes('if(deveConsultarUfSemReceita(analise))'));
 assert.ok(handler.includes('consultarSoap(destino,tls,null)'));
 assert.ok(handler.includes("endereco_efetivo_solicitacao:destino.href"));
 assert.doesNotMatch(handler,/GnreLoteRecepcao|GNRE_TRANSMISSAO_HABILITADA/);
});

test('endereco HTTPS 443 so pode ser testado em modo comparativo explicito',()=>{
 const alternativo=WSDL.replace(/https:\/\/www\.testegnre\.pe\.gov\.br:444\/gnreWS/, 'https://www.testegnre.pe.gov.br/gnreWS');
 assert.throws(()=>validarWsdlConfigUf(alternativo),'Modo padrao deve rejeitar ausencia da porta 444');
 assert.equal(validarWsdlConfigUf(alternativo,{permitir443:true}).href,
   'https://www.testegnre.pe.gov.br/gnreWS/services/GnreConfigUF');
 assert.throws(()=>validarWsdlConfigUf(
   alternativo.replace('www.testegnre.pe.gov.br','www.gnre.pe.gov.br'),{permitir443:true}));
 assert.throws(()=>validarWsdlConfigUf(
   alternativo.replace('www.testegnre.pe.gov.br','localhost'),{permitir443:true}));
 assert.throws(()=>validarWsdlConfigUf(
   alternativo.replace('https://','http://'),{permitir443:true}));
});
test('diagnostico HTTPS 443 envia somente consulta MG sem receita e usa endpoint aprovado',()=>{
 const codigo=fs.readFileSync(path.join(__dirname,'../lib/integracoes/gnre-configuf-consulta.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../cotacoes.js'),'utf8');
 assert.match(codigo,/tipo_teste==='comparar_443'/);
 assert.match(codigo,/const destino=validarWsdlConfigUf\(wsdl\.xml,\{permitir443:true\}\)/);
 assert.match(codigo,/if\(destino\.href!==ENDPOINT_ALTERNATIVO_443\)/);
 assert.match(codigo,/consultarSoap\(destinoAlternativo,tls,null\)/);
 assert.match(codigo,/const WSDL=ENDPOINT_ALTERNATIVO_443\+'\?wsdl'/);
 assert.doesNotMatch(codigo,/GnreLoteRecepcao|processarGuia|emitirGuia/);
 assert.match(html,/onclick="compararGnreConfigUf443\(\)"/);
 assert.match(ui,/async function compararGnreConfigUf443\(\)/);
 assert.match(ui,/tipo_teste:'comparar_443'/);
 assert.match(ui,/recepcao e consulta de lotes usam HTTPS 443/);
});
