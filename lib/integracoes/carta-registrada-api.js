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
// O OpenAPI 3.1 pode declarar o requestBody por $ref, allOf ou
// por um objeto contendo a lista. Diagnosticar a forma sem assumir array.
function schemaResolvido(spec,entrada,nivel=0){
 if(nivel>8||!entrada||typeof entrada!=='object')return null;
 const s=resolverReferencia(spec,entrada);
 if(!s)return null;
 const partes=s.allOf||s.oneOf||s.anyOf;
 if(Array.isArray(partes)){
  // Não escolher um dos múltiplos formatos alternativos por palpite.
  if((s.oneOf||s.anyOf)&&partes.length!==1)return s;
  const combinados=partes.map(p=>schemaResolvido(spec,p,nivel+1)).filter(Boolean);
  if(s.allOf&&combinados.length===partes.length){
   return {...s,
    type:s.type||combinados.find(p=>p.type)?.type,
    properties:Object.assign({},...combinados.map(p=>p.properties||{}),s.properties||{}),
    required:[...new Set([...combinados.flatMap(p=>p.required||[]),...(s.required||[])])],
    items:s.items||combinados.find(p=>p.items)?.items};
  }
  if(combinados.length===1)return combinados[0];
 }
 return s;
}
function detalharEsquemaRegistrados(spec){
 const operacao=spec?.paths?.['/v1/prepostagens/lista/objetosregistrados']?.post;
 if(!operacao)return {rotaPresente:false,metodoPost:false};
 const corpo=resolverReferencia(spec,operacao.requestBody);
 const conteudos=Object.keys(corpo?.content||{}).slice(0,8);
 const tipoJson=conteudos.find(t=>/^application\/json(?:;|$)/i.test(t));
 const tipoMultipart=conteudos.find(t=>/^multipart\/form-data(?:;|$)/i.test(t));
 const tipoAtivo=tipoJson||tipoMultipart;
 const media=tipoAtivo?corpo?.content?.[tipoAtivo]:null;
 const raiz=media?schemaResolvido(spec,media.schema):null;
 const multipartProps=tipoMultipart?Object.entries(raiz?.properties||{}):[];
 const multipartCampos=multipartProps.map(([nome,valor])=>{
  const campo=schemaResolvido(spec,valor)||{};
  return {nome:nome.slice(0,90),tipo:String(campo.type||'').slice(0,30),
    formato:String(campo.format||'').slice(0,30),
    mediaType:String(campo.contentMediaType||'').slice(0,55),
    obrigatorio:(raiz?.required||[]).includes(nome),
    codificacao:String(media?.encoding?.[nome]?.contentType||'').slice(0,90)};
 });
 const parametrosFormData=(operacao.parameters||[]).map(p=>resolverReferencia(spec,p)||p)
  .filter(p=>p.in==='formData').map(p=>({nome:String(p.name||'').slice(0,90),
   tipo:String(p.type||p.schema?.type||'').slice(0,40),
   formato:String(p.format||p.schema?.format||'').slice(0,40),
   obrigatorio:p.required===true}));
 const propriedades=Object.keys(raiz?.properties||{}).slice(0,24);
 const arrays=propriedades.filter(chave=>{
   const propriedade=schemaResolvido(spec,raiz.properties[chave]);
   return propriedade?.type==='array'||Boolean(propriedade?.items);
 });
 const campoLista=arrays.length===1?arrays[0]:null;
 const itens=raiz?.type==='array'?raiz.items:campoLista?schemaResolvido(spec,raiz.properties[campoLista])?.items:null;
 const registro=schemaResolvido(spec,itens);
 return {rotaPresente:true,metodoPost:true,
  nomeOperacao:String(operacao.operationId||'').slice(0,80),
  tiposConteudo:conteudos,tipoRaiz:raiz?.type||'não identificado',
  referenciaRaiz:String(media?.schema?.$ref||'').slice(0,110),
  possuiSchemaMultipart:Boolean(tipoMultipart&&media?.schema),
  multipartCampos, parametrosFormData,
  propriedadesRaiz:propriedades,
  camposObrigatoriosRaiz:(raiz?.required||[]).filter(x=>typeof x==='string').slice(0,24),
  camposArray:arrays.slice(0,8),campoLista,
  tipoItem:registro?.type||'não identificado',
  propriedadesItem:Object.keys(registro?.properties||{}).slice(0,24),
  camposObrigatoriosItem:(registro?.required||[]).filter(x=>typeof x==='string').slice(0,24),
  parametrosObrigatorios:(operacao.parameters||[]).map(p=>resolverReferencia(spec,p)||p).filter(p=>p.required).map(p=>p.name).filter(x=>typeof x==='string').slice(0,12)};
}
function analisarEsquemaRegistrados(spec,campos){
 const diagnostico=detalharEsquemaRegistrados(spec);
 const erro=motivo=>({validado:false,motivo,diagnostico});
 if(!diagnostico.rotaPresente)return erro('O POST de objetos registrados não foi identificado no OpenAPI recebido.');
 if(diagnostico.parametrosObrigatorios?.length)
  return erro('Há parâmetros obrigatórios na rota que exigem homologação adicional.');
 const tipoMultipart=(diagnostico.tiposConteudo||[]).find(t=>/^multipart\/form-data(?:;|$)/i.test(t));
 if(tipoMultipart){
  const partesMultipart=diagnostico.multipartCampos||[];
  const binarios=partesMultipart.filter(f=>f.tipo==='string'&&f.formato==='binary');
  // Não adivinhar o parâmetro: para emitir o CWS precisa nomeá-lo explicitamente.
  if(!diagnostico.possuiSchemaMultipart||!partesMultipart.length)
   return erro('O OpenAPI confirma multipart/form-data, mas não descreve o nome do campo de arquivo. Emissão bloqueada até homologar esse parâmetro.');
  if(binarios.length!==1||!/^[-A-Za-z0-9_]{1,90}$/.test(binarios[0]?.nome||''))
   return erro('O multipart possui campo de arquivo ausente, ambíguo ou sem format: binary. É necessário validar o nome correto no CWS.');
  const extra=partesMultipart.filter(f=>f.obrigatorio&&f.nome!==binarios[0].nome);
  if(extra.length||diagnostico.parametrosObrigatorios.length)
   return erro('A API exige outros campos multipart ou parâmetros obrigatórios ainda não homologados.');
  if(diagnostico.multipartCampos.some(f=>f.nome===binarios[0].nome&&f.codificacao&&!/^(application\/json|application\/octet-stream)(?:;|$)/i.test(f.codificacao)))
   return erro('O campo de arquivo exige uma codificação diferente de JSON ou octet-stream.');
  if(campos.codigoFormatoObjetoInformado!=='1'||campos.codigoServico!=='80799')
   return erro('É necessário o serviço 80799 e formato de envelope 1.');
  return {validado:true,tipoCorpo:'multipart_json_file',campoArquivo:binarios[0].nome,
    diagnostico,operacao:diagnostico.nomeOperacao||'processaObjetosRegistrados'};
 }
 if(!diagnostico.tiposConteudo?.some(t=>/^application\/json(?:;|$)/i.test(t)))
  return erro('O endpoint não declarou application/json ou multipart/form-data com arquivo JSON reconhecido.');
 const root=diagnostico.tipoRaiz,props=diagnostico.propriedadesItem;
 let tipoCorpo=null,campoLista=null;
 if(root==='array')tipoCorpo='array_json';
 else if(root==='object'&&diagnostico.campoLista){
   campoLista=diagnostico.campoLista;
   // Somente um campo lista é aceito e nenhum outro campo obrigatório pode faltar.
   if(diagnostico.camposObrigatoriosRaiz.some(nome=>nome!==campoLista))
     return erro('O corpo JSON contém campos obrigatórios além da lista de objetos registrados.');
   tipoCorpo='objeto_lista_json';
 }else return erro('A rota declarou um formato diferente de lista JSON de objetos. Consulte o diagnóstico detalhado.');
 if(diagnostico.tipoItem!=='object')
  return erro('O tipo dos itens da lista não foi confirmado como objeto.');
 if(!['codigoServico','destinatario','remetente'].every(p=>props.includes(p)))
  return erro('O esquema dos itens não corresponde aos campos de Carta Registrada importados no PPN Web.');
 const faltantes=diagnostico.camposObrigatoriosItem.filter(nome=>!(nome in campos)||campos[nome]==null);
 if(faltantes.length)return erro('O esquema oficial exige outros campos que não constam no JSON validado.');
 if(campos.codigoFormatoObjetoInformado!=='1'||campos.codigoServico!=='80799')
  return erro('É necessário o serviço 80799 e formato de envelope 1.');
 return {validado:true,tipoCorpo,campoLista,diagnostico,
  camposObrigatoriosConferidos:diagnostico.camposObrigatoriosItem.length,
  operacao:diagnostico.nomeOperacao||'importacao_registrados'};
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
async function cotar80799(p,c){
 const {cep,peso}=carta.validarCotacao(p);
 const qs=new URLSearchParams({cepOrigem:c.cepOrigem,cepDestino:cep,psObjeto:String(peso),tpObjeto:'1'});
 if(c.contrato&&c.dr){qs.set('nuContrato',c.contrato);qs.set('nuDR',c.dr);}
 const dados=await apiComToken(BASE+'/preco/v1/nacional/80799?'+qs.toString(),{},'cartao');
 const valor=carta.valorBR(dados?.pcFinal??dados?.precoFinal??dados?.valor);
 if(!(valor>0))throw Object.assign(Error('Não foi possível confirmar tarifa positiva da Carta Registrada.'),{httpStatus:422});
 return valor;
}
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
async function solicitarRegistrada(item,esquema){
 // A estrutura deve ter sido confirmada pelo OpenAPI nesta mesma requisição.
 let corpo;
 if(esquema?.tipoCorpo==='array_json')corpo=[item];
 else if(esquema?.tipoCorpo==='objeto_lista_json'&&esquema.campoLista)
  corpo={[esquema.campoLista]:[item]};
 else if(esquema?.tipoCorpo==='multipart_json_file'&&/^[-A-Za-z0-9_]{1,90}$/.test(esquema.campoArquivo||'')){
  if(typeof FormData!=='function'||typeof Blob!=='function')
   throw Object.assign(Error('O servidor não oferece suporte a upload multipart nativo.'),{httpStatus:503});
  const form=new FormData();
  const arquivo=new Blob([JSON.stringify([item])],{type:'application/json'});
  form.append(esquema.campoArquivo,arquivo,'carta-registrada-80799.json');
  corpo=form;
 }else throw Object.assign(Error('Formato de importação não homologado; emissão não iniciada.'),{httpStatus:423});
 const token=await gerarToken('cartao');
 const multipart=esquema.tipoCorpo==='multipart_json_file';
 const r=await fetch(BASE+ROTA,{
  method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json',
    ...(!multipart?{'Content-Type':'application/json'}:{})},
  // multipart: NÃO definir Content-Type manualmente; o runtime adiciona boundary.
  body:multipart?corpo:JSON.stringify(corpo)
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
   // Inspeção somente GET: campos sintéticos de estrutura, sem qualquer cliente real.
   let esquema={validado:false,motivo:'Verificação do OpenAPI ainda não concluída.'};
   if(registrado&&habilitado){
    const modelo={codigoServico:'80799',codigoFormatoObjetoInformado:'1',pesoInformado:'20',
      destinatario:{},remetente:{},cienteObjetoNaoProibido:1,listaServicoAdicional:[],
      dataPrevistaPostagem:'13/11/2026',sequencial:'1'};
    try{esquema=await obterEsquema(modelo);}catch(e){
      esquema={validado:false,motivo:'A documentação da API não pôde ser consultada pelo servidor.'};
    }
   }
   return reply(res,200,{ok:true,somenteLeitura:true,rotaCandidata:ROTA,
     servico80799NoContrato:registrado,pilotoPreview:habilitado,
     esquemaOficialConfirmado:esquema.validado===true,
     motivoEsquema:esquema.validado?'Esquema oficial de importação de objetos registrados confirmado.':esquema.motivo,
     diagnosticoEsquema:esquema.diagnostico||null,
     formatoApiReconhecido:esquema.validado?esquema.tipoCorpo:null,
     postagensCriadas:0,
     observacao:'Diagnóstico da API e do contrato somente em leitura. Nenhuma emissão ou cobrança realizada.'});
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
    diagnosticoEsquema:esquema.diagnostico||null,
    somenteLeitura:true,postagensCriadas:0,rotaCandidata:ROTA});
  await verificarDuplicidade(item);
  if(modo==='preparar'){
   const valorCotado=await cotar80799(p,c);
   const assinatura=carta.assinaturaPiloto(arquivo);
   return reply(res,200,{ok:true,modo:'PREPARACAO_REGISTRADA_API',validado:true,postagensCriadas:0,
    confirmacaoPiloto:assinatura,rotaConfirmada:ROTA,
    resumo:{destinatario:item.destinatario.nome,cep:item.destinatario.endereco.cep,
     cidade:item.destinatario.endereco.cidade,uf:item.destinatario.endereco.uf,
     codigoServico:'80799',pesoGramas:item.pesoInformado,dataPrevistaPostagem:item.dataPrevistaPostagem,
     valorCotado}});
  }
  if(p.confirmarEmissaoReal!==true||!carta.validarAssinaturaPiloto(p.confirmacaoPiloto,arquivo))
   return reply(res,403,{ok:false,codigo:'CONFIRMACAO_PILOTO_INVALIDA',erro:'É necessário validar os dados e confirmar a emissão novamente.'});
  // Um único POST para um único registro. Erros e timeouts nunca disparam retry.
  const resultado=await solicitarRegistrada(item,esquema);
  if(!resultado.id)return reply(res,202,{ok:true,emitida:false,confirmacaoPendente:true,codigo:'VERIFICAR_RESULTADO_NO_PPN',
   mensagem:'Os Correios aceitaram a requisição, mas não forneceram ID individual confirmado. Consulte a PPN antes de qualquer nova tentativa.'});
  return reply(res,200,{ok:true,emitida:true,...resultado.id});
 }catch(e){
  const status=Number(e.httpStatus)||502;
  const mensagem=texto(e.message||'Falha na validação da Carta Registrada. Confira o PPN antes de tentar novamente.')
   .replace(/\\b\\d{11,14}\\b/g,'[documento oculto]')
   .replace(/Bearer\\s+\\S+/gi,'Bearer [oculto]')
   .slice(0,550);
  return reply(res,status,{ok:false,codigo:e.codigo||'FALHA_INTEGRACAO_REGISTRADA',
   erro:mensagem});
 }
}
module.exports=handler;
module.exports._teste={analisarEsquemaRegistrados,detalharEsquemaRegistrados,schemaResolvido,extrairIdentificador,itensLista,verificarDuplicidade,liberarPreview,ROTA};
