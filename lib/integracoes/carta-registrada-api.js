'use strict';
// Piloto de Carta Registrada 80799 por API: NUNCA reutilizar POST avulso de encomendas.
// Requer validação do contrato e do OpenAPI oficial ANTES de um único POST.
const {exigirAdmin}=require('./_utils');
const {cfg,configuracaoEfetiva,apiComToken,gerarToken,descobrirContrato}=require('./_correios');
const { _teste:carta }=require('./carta-comercial-correios');
const BASE='https://api.correios.com.br';
const ROTA='/prepostagem/v1/prepostagens/lista/objetosregistrados';
const DOCS=BASE+'/prepostagem/v3/api-docs';
const texto=v=>String(v??'').trim();
const dig=v=>texto(v).replace(/\D/g,'');
const reply=(res,status,d)=>res.status(status).json(d);
function liberarPreview(){
 return process.env.CORREIOS_CARTAS_EMISSAO_HABILITADA==='1'
  &&process.env.VERCEL_ENV==='preview'
  &&process.env.VERCEL_GIT_COMMIT_REF==='teste-carta-comercial-20261112';
}
function resolverReferencia(spec,schema){
 let obj=schema;
 for(let i=0;i<4&&obj?.$ref;i++){
  const ref=String(obj.$ref);
  if(!ref.startsWith('#/'))return null;
  obj=ref.slice(2).split('/').reduce((d,k)=>d?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],spec);
 }
 return obj;
}
function analisarEsquemaRegistrados(spec,campos){
 const erro=motivo=>({validado:false,motivo});
 if(!spec||typeof spec!=='object'||!spec.paths)return erro('A especificação oficial não foi recebida.');
 const operation=spec.paths['/v1/prepostagens/lista/objetosregistrados']?.post;
 if(!operation)return erro('A rota de objetos registrados não consta como POST no OpenAPI do CWS.');
 const param=(operation.parameters||[]).map(p=>resolverReferencia(spec,p)||p);
 if(param.some(p=>p.required===true))return erro('A rota exige parâmetros obrigatórios não homologados.');
 const body=resolverReferencia(spec,operation.requestBody);
 const tipos=body?.content||{};
 const schema=resolverReferencia(spec,tipos['application/json']?.schema||tipos['application/json;charset=UTF-8']?.schema);
 if(!schema||schema.type!=='array'||!schema.items)
  return erro('O OpenAPI não confirmou um corpo JSON do tipo array para objetos registrados.');
 const registro=resolverReferencia(spec,schema.items);
 const props=registro?.properties;
 if(!props||!Object.prototype.hasOwnProperty.call(props,'codigoServico')||
    !Object.prototype.hasOwnProperty.call(props,'destinatario')||
    !Object.prototype.hasOwnProperty.call(props,'remetente'))
  return erro('O schema de cada objeto registrado não corresponde ao JSON validado na PPN Web.');
 const obrigatorios=registro.required||[];
 const ausentes=obrigatorios.filter(nome=>!(nome in campos)||campos[nome]==null);
 if(ausentes.length)return erro('O schema oficial exige campos adicionais ainda não homologados.');
 if(!('codigoFormatoObjetoInformado' in campos)||campos.codigoFormatoObjetoInformado!=='1')
  return erro('A carta deve usar formato de envelope 1.');
 return {validado:true,tipoCorpo:'array_json',camposObrigatoriosConferidos:obrigatorios.length,
   operacao:operation.operationId||'importacao_registrados'};
}
async function obterEsquema(corpo){
 const token=await gerarToken('cartao');
 const r=await fetch(DOCS,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 if(!r.ok)return {validado:false,motivo:'O CWS não disponibilizou o OpenAPI de Pré-Postagem neste cartão (HTTP '+r.status+').',httpStatus:r.status};
 const ct=r.headers?.get?.('content-type')||'';
 if(ct&&!ct.includes('json'))return {validado:false,motivo:'A documentação oficial retornou conteúdo diferente de JSON.'};
 const bruto=await r.text();
 if(bruto.length>7_000_000)return {validado:false,motivo:'A documentação oficial excede o tamanho previsto.'};
 let spec;try{spec=JSON.parse(bruto);}catch{return {validado:false,motivo:'Não foi possível interpretar o OpenAPI oficial do CWS.'};}
 return analisarEsquemaRegistrados(spec,corpo);
}
async function verificarHabilitacao(c){
 if(!c.contrato||!c.cartao||dig(c.cnpj).length!==14)throw Object.assign(Error('Contrato, cartão ou CNPJ dos Correios incompletos.'),{httpStatus:422});
 for(const codigo of ['86720','80799']){
  const url=BASE+'/meucontrato/v1/empresas/'+encodeURIComponent(c.cnpj)+'/contratos/'+encodeURIComponent(c.contrato)+'/cartoes/'+encodeURIComponent(c.cartao)+'/servicos/'+codigo;
  const retorno=await apiComToken(url,{},'contrato');
  if(texto(retorno?.codigo||retorno?.coServico)!==codigo)
    throw Object.assign(Error('Cartão não confirmou o serviço '+codigo+' na consulta oficial.'),{httpStatus:422});
 }
}
function itensLista(resposta){
 if(Array.isArray(resposta))return resposta;
 for(const itens of [resposta?.content,resposta?.items,resposta?.prePostagens,resposta?.listaPrePostagens,resposta?.dados]){
  if(Array.isArray(itens))return itens;
 }
 return null;
}
// Falha fechada: não afirmar ausência de duplicidade quando a consulta é inconclusiva.
async function verificarDuplicidade(item){
 const params=new URLSearchParams({tipoObjeto:'REGISTRADO',status:'PREPOSTADO',page:'0',size:'100'});
 const resp=await apiComToken(BASE+'/prepostagem/v2/prepostagens?'+params.toString(),{},'cartao');
 const itens=itensLista(resp);
 if(!itens||resp?.hasNext===true||resp?.temProximaPagina===true||resp?.page?.totalPages>1)
  throw Object.assign(Error('Não foi possível confirmar a ausência de outra Carta Registrada ativa. Confira a lista na PPN Web.'),{httpStatus:409,codigo:'CONFERENCIA_DUPLICIDADE_PENDENTE'});
 const cpf=dig(item.destinatario.cpfCnpj),cep=dig(item.destinatario.endereco.cep);
 const igual=itens.some(reg=>{
  const dest=reg?.destinatario||{};
  const doc=dig(dest.cpfCnpj||reg.destinatarioCpfCnpj);
  const zip=dig(dest.endereco?.cep||reg.destinatarioEnderecoCep);
  const serv=dig(reg.codigoServico||reg.servico?.codigo);
  return doc&&doc===cpf&&zip===cep&&(!serv||serv==='80799');
 });
 if(igual)throw Object.assign(Error('Já existe pré-postagem ativa para esse destinatário e CEP. Não foi criada outra carta.'),{httpStatus:409,codigo:'CARTA_REGISTRADA_JA_EXISTENTE'});
 return {conferido:true,consultados:itens.length};
}
function extrairIdentificador(retorno){
 let itens=[];
 if(Array.isArray(retorno))itens=retorno;
 else if(retorno&&typeof retorno==='object'){
  itens=[retorno,...(Array.isArray(retorno.prePostagens)?retorno.prePostagens:[]),
    ...(Array.isArray(retorno.resultados)?retorno.resultados:[])];
 }
 for(const x of itens){
  const id=texto(x?.idPrePostagem||x?.id||x?.prePostagemId);
  const codigo=texto(x?.codigoObjeto||x?.codigoRastreio);
  if(/^PR[A-Za-z0-9]{10,40}$/.test(id))return {idPrePostagem:id,codigoObjeto:codigo};
 }
 return null;
}
async function solicitarRegistrada(item){
 const token=await gerarToken('cartao');
 const r=await fetch(BASE+ROTA,{
  method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},
  body:JSON.stringify([item])
 });
 const bruto=await r.text();
 let dados;try{dados=JSON.parse(bruto)}catch{dados={};}
 if(!r.ok){
  const detalhes=carta.mensagensValidacaoCorreios(dados);
  const codigo=detalhes.map(m=>m.match(/\b(?:PPN|RTL|PRE|COR)-\d{2,5}\b/i)?.[0]).find(Boolean)||null;
  throw Object.assign(Error('Correios HTTP '+r.status+': '+(detalhes.join(' | ')||'Pré-postagem recusada.')+'. Não reenviar sem conferir o painel.'),{
   httpStatus:r.status,codigo:'CORREIOS_REGISTRADA_RECUSADA',codigoCorreios:codigo});
 }
 return {id:extrairIdentificador(dados),status:r.status};
}
async function handler(req,res){
 if(!exigirAdmin(req,res))return;
 const modo=texto(req.query?.modo||req.body?.modo||'diagnostico');
 if(!['diagnostico','preparar','emitir'].includes(modo))return reply(res,400,{ok:false,erro:'Modo inválido.'});
 if(modo==='diagnostico'&&req.method!=='GET'||modo!=='diagnostico'&&req.method!=='POST')
  return reply(res,405,{ok:false,erro:'Método não permitido.'});
 try{
  const c=await configuracaoEfetiva(),habilitado=liberarPreview();
  if(modo==='diagnostico'){
   const contrato=await descobrirContrato();
   const registrado=(contrato?.todosServicos||[]).some(x=>texto(x.codigo)==='80799');
   return reply(res,200,{ok:true,somenteLeitura:true,rotaCandidata:ROTA,
     servico80799NoContrato:registrado,pilotoPreview:habilitado,
     precisaValidacaoOpenAPI:true,postagensCriadas:0,
     observacao:'Rota específica encontrada em documentação pública. Exige conferir o esquema oficial no CWS antes de permitir emissão.'});
  }
  const p=req.body||{},codigo=dig(p.codigoServico);
  if(codigo!=='80799'||p.tipoConteudo!=='DOCUMENTOS')
   return reply(res,422,{ok:false,codigo:'SOMENTE_CARTA_80799',erro:'Somente Carta Registrada 80799 para documentos, sem AR.'});
  const servico={codigo:'80799',categoria:'registrada'};
  const arquivo=carta.arquivoImportacaoRegistrada(p,c,servico);
  if(arquivo.length!==1)throw Object.assign(Error('Uma carta por vez no piloto.'),{httpStatus:422});
  const item=arquivo[0];
  if(!habilitado)return reply(res,423,{ok:false,codigo:'PILOTO_PREVIEW_INDISPONIVEL',erro:'Emissão real disponível somente na branch Preview autorizada.'});
  await verificarHabilitacao(c);
  const esquema=await obterEsquema(item);
  if(!esquema.validado)return reply(res,423,{ok:false,codigo:'SCHEMA_API_REGISTRADOS_PENDENTE',erro:esquema.motivo,
    somenteLeitura:true,postagensCriadas:0,rotaCandidata:ROTA});
  await verificarDuplicidade(item);
  if(modo==='preparar'){
   const assinatura=carta.assinaturaPiloto(arquivo);
   return reply(res,200,{ok:true,modo:'PREPARACAO_REGISTRADA_API',validado:true,postagensCriadas:0,
    confirmacaoPiloto:assinatura,rotaConfirmada:ROTA,
    resumo:{destinatario:item.destinatario.nome,cep:item.destinatario.endereco.cep,
     cidade:item.destinatario.endereco.cidade,uf:item.destinatario.endereco.uf,
     codigoServico:'80799',pesoGramas:item.pesoInformado,dataPrevistaPostagem:item.dataPrevistaPostagem}});
  }
  if(p.confirmarEmissaoReal!==true||!carta.validarAssinaturaPiloto(p.confirmacaoPiloto,arquivo))
   return reply(res,403,{ok:false,codigo:'CONFIRMACAO_PILOTO_INVALIDA',erro:'É necessário validar os dados e confirmar a emissão novamente.'});
  // Um único POST para um único registro. Erros e timeouts nunca disparam retry.
  const resultado=await solicitarRegistrada(item);
  if(!resultado.id)return reply(res,202,{ok:true,emitida:false,confirmacaoPendente:true,codigo:'VERIFICAR_RESULTADO_NO_PPN',
   mensagem:'Os Correios aceitaram a requisição, mas não forneceram ID individual confirmado. Consulte a PPN antes de qualquer nova tentativa.'});
  return reply(res,200,{ok:true,emitida:true,...resultado.id});
 }catch(e){
  const status=Number(e.httpStatus)||502;
  return reply(res,status,{ok:false,codigo:e.codigo||'FALHA_INTEGRACAO_REGISTRADA',
   erro:e.message||'Falha na validação da Carta Registrada. Confira o PPN antes de tentar novamente.',
   postagensCriadas:undefined});
 }
}
module.exports=handler;
module.exports._teste={analisarEsquemaRegistrados,extrairIdentificador,itensLista,verificarDuplicidade,liberarPreview,ROTA};
