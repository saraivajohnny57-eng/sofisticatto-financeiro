'use strict';
// Consulta oficial ConfigUF multiestado. Somente LEITURA. Nunca transmite GNRE.
const https=require('node:https');
const crypto=require('node:crypto');
const {exigirAdmin,json,supabaseRest,criptografar}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {textoTag,blocos}=require('./gnre-interpretar-resultado');
const {inventariar}=require('./gnre-consulta-auditoria');
const UFS=new Set('AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' '));
const URL='https://www.gnre.pe.gov.br/gnreWS/services/GnreConfigUF';
const IGNORAR_DADOS_PESSOAIS=true;
function seguroErro(e){return /^[A-Z0-9_]{2,60}$/.test(String(e?.code||''))?e.code:'ERRO_SERVICO_EXTERNO';}
function agente(cred){
 if(!/^[0-9]{14}$/.test(String(cred?.meta?.cnpj||''))||cred?.meta?.expirado!==false)
  throw Object.assign(Error('A1 invalido'),{code:'A1_INVALIDO'});
 if(cred.key&&cred.cert)return {key:cred.key,cert:cred.cert};
 if(cred.pfx?.length&&cred.passphrase)return {pfx:cred.pfx,passphrase:cred.passphrase};
 throw Object.assign(Error('A1 indisponivel'),{code:'A1_INDISPONIVEL'});
}
function consultar(xml,tlsCred){
 return new Promise((resolve,reject)=>{
  let bytes=0,finished=false;const fim=(err,val)=>{if(finished)return;finished=true;err?reject(err):resolve(val)};
  const req=https.request(URL,{method:'POST',...tlsCred,rejectUnauthorized:true,minVersion:'TLSv1.2',servername:'www.gnre.pe.gov.br',agent:false,timeout:25000,
   headers:{'Content-Type':'application/soap+xml; charset=utf-8; action="'+SOAP_ACTIONS.configuracao+'"',
    'Content-Length':Buffer.byteLength(xml,'utf8')}},res=>{
    const chunks=[];res.on('data',b=>{bytes+=b.length;if(bytes>2000000){
      req.destroy(Object.assign(Error('retorno grande'),{code:'RESPOSTA_GRANDE'}));return;}chunks.push(Buffer.from(b))});
    res.on('end',()=>fim(null,{status:res.statusCode,xml:Buffer.concat(chunks).toString('utf8')}));
    res.on('error',fim);
   });
  req.on('timeout',()=>req.destroy(Object.assign(Error('timeout'),{code:'ETIMEDOUT'})));
  req.on('error',fim);req.end(xml);
 });
}
function lerConfigUf(xml,uf,receita){
 const body=textoTag(xml,'TConfigUf');
 const codigo=textoTag(textoTag(body||'','situacaoConsulta')||'','codigo');
 const ufResposta=textoTag(body||'','uf');
 const lista=textoTag(body||'','receitas')||'';
 const matches=[...lista.matchAll(/<(?:[A-Za-z_][\w.-]*:)?receita\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?receita\s*>/gi)];
 const item=matches.find(m=>new RegExp('\\bcodigo=["\\x27]'+receita+'["\\x27]').test(m[1])||textoTag(m[2],'codigo')===receita);
 const config=item?.[2]||null;
 const props=['exigeUfFavorecida','exigeReceita','exigeContribuinteEmitente','exigeDetalhamentoReceita','exigeProduto',
 'exigeDocumentoOrigem','exigePeriodoReferencia','exigePeriodoApuracao','exigeParcela','exigeContribuinteDestinatario',
 'exigeDataVencimento','exigeDataPagamento','exigeConvenio','exigeCamposAdicionais','exigeValorFecp','valorExigido'];
 const obrigatoriedade={};
 for(const p of props)obrigatoriedade[p]=config?textoTag(config,p):null;
 // Os dois primeiros campos pertencem ao TConfigUf; nao a receita individual.
 for(const p of ['exigeUfFavorecida','exigeReceita'])obrigatoriedade[p]=textoTag(body||'',p);

 const tipos=config?blocos(textoTag(config,'tiposDocumentosOrigem')||'','tipoDocumentoOrigem')
  .map(s=>({codigo:textoTag(s,'codigo'),descricao:(textoTag(s,'descricao')||'').slice(0,100)})).filter(x=>/^\d{2}$/.test(x.codigo||'')):[];
 const adicionais=config?blocos(textoTag(config,'camposAdicionais')||'','campoAdicional')
  .map(s=>({codigo:textoTag(s,'codigo'),titulo:(textoTag(s,'titulo')||'').slice(0,100),obrigatorio:textoTag(s,'obrigatorio')})):[];
 const detalhes=config?blocos(textoTag(config,'detalhamentosReceita')||'','detalhamentoReceita')
  .map(s=>({codigo:textoTag(s,'codigo'),descricao:(textoTag(s,'descricao')||'').slice(0,100)})):[];
 // As tags adicionais no retorno sao preservadas separadamente, sem considerar S/N como semantica global:
 // a validacao obrigatoria de cada receita ainda precisa seguir XSD e ConfigUF oficial.
 const endereco=textoTag(body||'','enderecoObr');
 const propriedadeUf={
  enderecoObr:endereco&&/[<>]/.test(endereco)?{
    emitCpf:textoTag(endereco,'emitCpf'),emitCnpj:textoTag(endereco,'emitCnpj')
   }:endereco,
  emitCpf:textoTag(body||'','emitCpf'),
  emitCnpj:textoTag(body||'','emitCnpj'),
  aceitaPgPix:textoTag(body||'','aceitaPgPix')
 };
 const versoesXml=blocos(textoTag(body||'','versoesXml')||'','versao')
  .map(v=>v.trim()).filter(v=>/^\d\.\d{2}$/.test(v));
 const versoesDocOrigem=blocos(textoTag(config||'','versoesXmlDocOrigem')||'','versao')
  .map(v=>v.trim()).filter(v=>/^\d\.\d{2}$/.test(v));
 const tipoXml=textoTag(body||'','tiposGnreDaUF')||textoTag(body||'','tiposGnre')||'';
 const tiposGnreDisponiveis=blocos(tipoXml,'tipoGnre')
  .map(v=>({codigo:(textoTag(v,'codigo')||v.trim()).slice(0,12),
   descricao:textoTag(v,'descricao')||null}))
  .filter(v=>/^[0-9]{1,2}$/.test(v.codigo));
 const maximos={};
 const xmlMaximo=textoTag(body||'','qtdMaximas')||'';
 for(const nome of ['guiasPorLote','itensPorGuia','itensPorLote','qtdConsultas'])
  maximos[nome]=textoTag(xmlMaximo,nome);

 const confirmado=codigo==='450'&&ufResposta===uf&&!!config;
 return {ok:confirmado,codigo_situacao:codigo,uf_retorno:ufResposta,
  receita_localizada:!!config,
  obrigatoriedade,propriedades_uf:propriedadeUf,versoes_xml_uf:versoesXml,
  versoes_xml_documento_origem:versoesDocOrigem,limites_uf:maximos,
  tipos_gnre_uf:tiposGnreDisponiveis,
  tipos_documento_origem:tipos,campos_adicionais:adicionais,detalhamentos_receita:detalhes,
  inventario_todos_campos:inventariar(xml),
  emissao_ativada:false,
  motivo:confirmado?'ConfigUF consultada com sucesso. Validacao por receita/UF ainda necessaria para emitir.':
   'Configuracao nao confirmada; nenhuma guia pode ser emitida com essa combinacao.'};
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo indisponivel'});
 if(!exigirAdmin(req,res))return;
 const uf=String(req.body?.uf||'').trim().toUpperCase(), receita=String(req.body?.receita||'').trim();
 if(!UFS.has(uf)||!/^[0-9]{6}$/.test(receita))return json(res,400,{ok:false,erro:'UF ou codigo de receita invalido'});
 if(process.env.VERCEL_ENV!=='production'||process.env.GNRE_PRODUCAO_HABILITACAO_CONFIRMADA!=='1')
  return json(res,409,{ok:false,erro:'Credenciamento GNRE de producao nao confirmado'});
 const xmlDados='<TConsultaConfigUf xmlns="http://www.gnre.pe.gov.br"><ambiente>1</ambiente><uf>'+uf+'</uf><receita>'+receita+'</receita></TConsultaConfigUf>';
 const envelope=montarEnvelopeSoap12({servico:'configuracao',xmlDados});
 const start=Date.now();let remoto=null,erro=null,analise=null;
 try{
  remoto=await consultar(envelope,agente(await credenciais()));
  analise=remoto.status===200?lerConfigUf(remoto.xml,uf,receita):null;
 }catch(e){erro=seguroErro(e);}
 const inventario=remoto?inventariar(remoto.xml):{erro_transporte:erro};
 let arquivoId=null,erroAuditoria=null;
 try{
  const response=await supabaseRest('gnre_config_uf_consultas',{method:'POST',body:{
   uf,receita,ambiente:'producao',status_http:remoto?.status??null,
   codigo_gnre:analise?.codigo_situacao||null,
   inventario:analise?{...inventario,config:analise}:inventario,
   retorno_sha256:remoto?.xml?crypto.createHash('sha256').update(remoto.xml).digest('hex'):null,
   retorno_cifrado:remoto?.xml?criptografar({xml:remoto.xml}):null,
   observacao:erro||null
  }});
  arquivoId=response?.[0]?.id||null;
 }catch(e){erroAuditoria='Falha no arquivamento do retorno';}
 const ok=remoto?.status===200&&!!analise?.ok&&!!arquivoId;
 return json(res,ok?200:502,{ok,uf,receita,ambiente:'producao',modo:'consultar_configuf',
  http_status:remoto?.status??null,retorno:analise,
  arquivo_id:arquivoId,auditoria_salva:!!arquivoId,erro_auditoria:erroAuditoria,
  erro:erro||null,transmissao:false,
  aviso:'Consulta nao emite guia. Cada UF/receita precisa ser validada antes de ativar a transmissao.'});
}
module.exports=handler;
module.exports.lerConfigUf=lerConfigUf;
