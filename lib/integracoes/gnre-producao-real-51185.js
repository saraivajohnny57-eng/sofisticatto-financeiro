'use strict';
/* V491 GNRE — transmissao real EXCLUSIVA NF 51185 PA / 100102 / R$24,91.
   Nenhum reenvio automatico. Armazenar somente recibo cifrado e metadados. */
const https=require('node:https'),crypto=require('node:crypto');
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {prepararPreEnvioPa,montarGuiaPa}=require('./gnre-preenvio-pa');
const {montarLoteGnre}=require('./gnre-lote-xml');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {interpretarRetorno,textoTag}=require('./gnre-interpretar-resultado');
const repo=require('./gnre-idempotencia-repo');
const CHAVE='52261105451985000195550010000511851000590032';
const CNPJ='05451985000195',ID='gnre:producao:'+crypto.createHash('sha256').update(CHAVE).digest('hex').slice(0,32);
// Retomada autorizada manualmente, no maximo UMA nova tentativa por nota.
const RETOMADA_ID=ID+':retomada-unica';
const URLS={recepcao:'https://www.gnre.pe.gov.br/gnreWS/services/GnreLoteRecepcao',consulta:'https://www.gnre.pe.gov.br/gnreWS/services/GnreResultadoLote'};
function liberado(){return process.env.VERCEL_ENV==='production'&&process.env.GNRE_PRODUCAO_HABILITACAO_CONFIRMADA==='1'&&process.env.GNRE_PILOTO_PA_51185_PRODUCAO==='1';}
function identidade(n){
 const esperado={chave:CHAVE,numero:'51185',cnpjEmitente:CNPJ,ufOrigem:'GO',ufDestino:'PA',valorDifal:'24.91',valorFcp:'0.00',consumidorFinal:'1',indIeDest:'9',ambienteNfe:'1',statusAutorizacao:'100',chaveProtocolo:CHAVE};
 return Object.entries(esperado).filter(([k,v])=>String(n?.[k]??'')!==v).map(([k])=>k);
}
function tls(cred){
 // Manual GNRE v2.17 item 3.2.3: certificado do transmissor pode pertencer a CNPJ diferente do emitente.
 if(!/^[0-9]{14}$/.test(String(cred?.meta?.cnpj||''))||cred?.meta?.expirado!==false)throw Object.assign(Error('A1: CNPJ do transmissor/validade nao confirmados'),{code:'A1_INVALIDO'});
 if(cred.key&&cred.cert)return {key:cred.key,cert:cred.cert};
 if(cred.pfx?.length&&cred.passphrase)return {pfx:cred.pfx,passphrase:cred.passphrase};
 throw Object.assign(Error('A1 sem credenciais de transmissao'),{code:'A1_INDISPONIVEL'});
}
function soap(servico,xml,cert){
 const alvo=URLS[servico],action=SOAP_ACTIONS[servico];
 if(!alvo||!action||typeof xml!=='string'||Buffer.byteLength(xml)>350000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Requisicao GNRE invalida');
 return new Promise((resolve,reject)=>{
  let done=false,bytes=0;const finish=(err,v)=>{if(done)return;done=true;err?reject(err):resolve(v)};
  const req=https.request(alvo,{method:'POST',...cert,rejectUnauthorized:true,minVersion:'TLSv1.2',
   servername:'www.gnre.pe.gov.br',agent:false,timeout:35000,
   headers:{'Content-Type':'application/soap+xml; charset=utf-8; action="'+action+'"','Content-Length':Buffer.byteLength(xml,'utf8')}},res=>{
   const buf=[];res.on('data',b=>{bytes+=b.length;if(bytes>3100000){req.destroy(Object.assign(Error('Resposta acima do limite'),{code:'RESPOSTA_GRANDE'}));return}buf.push(Buffer.from(b))});
   res.on('end',()=>finish(null,{status:res.statusCode,xml:Buffer.concat(buf).toString('utf8')}));
   res.on('error',finish);
  });
  req.on('timeout',()=>req.destroy(Object.assign(Error('Tempo limite do servidor'),{code:'ETIMEDOUT'})));
  req.on('error',finish);req.end(xml);
 });
}
function parseRecepcao(r){
 const xml=String(r?.xml||'');
 if(r.status!==200||/<(?:\w+:)?Fault\b|<!DOCTYPE|<!ENTITY/i.test(xml))return {ok:false,incerto:true,codigo:'TRANSPORTE_SOAP'};
 const bloco=textoTag(xml,'TRetLote_GNRE');
 if(!bloco||textoTag(bloco,'ambiente')!=='1')return {ok:false,incerto:true,codigo:'AMBIENTE_NAO_CONFIRMADO'};
 const cod=textoTag(textoTag(bloco,'situacaoRecepcao')||'','codigo'),recibo=textoTag(textoTag(bloco,'recibo')||'','numero');
 if(cod==='100'&&/^(?:\d{10}|\d{14})$/.test(recibo||''))return {ok:true,codigo:cod,recibo};
 if(/^\d{3}$/.test(cod||'')&&cod!=='100')return {ok:false,incerto:false,codigo:cod};
 return {ok:false,incerto:true,codigo:'SEM_RECIBO_VALIDO'};
}
async function emitir(body){
 const retomada=body?.modo==='emitir_retomada_unica';
 const idAtivo=retomada?RETOMADA_ID:ID;
 if(retomada){
  if(body?.aceiteRiscoDuplicidade!=='CIENTE_RISCO_DUPLICIDADE_GNRE_51185'||
      body?.confirmacaoFinal!=='AUTORIZO_UMA_RETOMADA_REAL_51185'||
      body?.consultaPortalConfirmada!==true)
   return {code:400,data:{ok:false,erro:'Confirmações individuais de consulta oficial e risco de duplicidade obrigatórias.'}};
  const anterior=await repo.buscar(ID);
  if(!anterior||anterior.estado!=='resultado_incerto'||Number(anterior.tentativa)!==1||
      anterior.erro_codigo!=='ETIMEDOUT'||anterior.recibo_retorno_mascarado)
   return {code:409,data:{ok:false,erro:'Tentativa original não elegível para retomada. Não transmitir.'}};
 }

 if(body?.confirmacao!=='EMITIR_PA_51185_24_91'||body?.semEmissaoAnterior!==true)return {code:400,data:{ok:false,erro:'Confirmacao de emissao unica obrigatoria'}};
 if(identidade(body?.nfe).length)return {code:400,data:{ok:false,erro:'XML nao corresponde ao piloto da NF-e 51185'}};
 let plano;
 try{plano=prepararPreEnvioPa({nfe:body.nfe,fiscal:body.fiscal})}
 catch(e){return {code:400,data:{ok:false,erro:'Pre-validacao fiscal: '+String(e.message).slice(0,140)}}}
 if(!plano.apto_para_revisao)return {code:400,data:{ok:false,erro:'Pendencias de vencimento ou enquadramento fiscal',pendencias:plano.pendencias}};
 const guia=montarGuiaPa(body.nfe,body.fiscal),lote=montarLoteGnre([guia]);
 const xml=montarEnvelopeSoap12({servico:'recepcao',xmlDados:lote});
 const hash=crypto.createHash('sha256').update(lote).digest('hex');
 const cert=tls(await credenciais());
 const local=await supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+CHAVE+'&select=id&limit=1'});
 if(local.length||await repo.buscar(RETOMADA_ID)||(!retomada&&await repo.buscar(ID)))
  return {code:409,data:{ok:false,bloqueado:true,erro:'Há guia ou reserva anterior; transmissão não repetida.'}};
 // A tabela existente limita servico a "recepcao" ou "consulta".
 // O ambiente de producao e identificado pela chave de idempotencia e configuracao protegida.
 let r;
 try{r=await repo.reservar({chave:idAtivo,servico:'recepcao',ator:retomada?'admin-51185-retomada-manual':'admin-51185',lote_sha256:hash})}
 catch(_){return {code:503,data:{ok:false,codigo:'GNRE_RESERVA_INDISPONIVEL',etapa:'reserva_idempotencia',erro:'Falha ao reservar a transmissao no Financeiro02. Nenhum envio realizado; nao repetir antes de consultar.'}}}
 if(!r?.ok)return {code:409,data:{ok:false,bloqueado:true,erro:'Reserva anterior encontrada; nao reenviar'}};
 try{await repo.marcarEnviando(idAtivo)}catch(_){return {code:409,data:{ok:false,estado:'reserva_incerta',aviso:'Nao reenviar'}}}
 let resp;
 try{resp=await soap('recepcao',xml,cert)}
 catch(e){await repo.incerto(idAtivo,{erro_codigo:/^[A-Z_0-9]{2,60}$/.test(e.code||'')?e.code:'TRANSPORTE_INCERTO'}).catch(()=>{});
  return {code:202,data:{ok:false,estado:'resultado_incerto',aviso:'Transmissao nao confirmada: NAO reenviar; consultar Portal GNRE'}}}
 const aceito=parseRecepcao(resp);
 if(!aceito.ok){
  if(aceito.incerto)await repo.incerto(idAtivo,{erro_codigo:aceito.codigo}).catch(()=>{});
  else await repo.falhar(idAtivo,{http_status:resp.status,categoria:'GNRE_'+aceito.codigo}).catch(()=>{});
  return {code:aceito.incerto?202:422,data:{ok:false,estado:aceito.incerto?'resultado_incerto':'rejeitado',codigo:aceito.codigo,aviso:'Nao reenviar automaticamente'}};
 }
 try{await repo.concluir(idAtivo,{http_status:resp.status,categoria:'recebido_producao',recibo_completo:aceito.recibo,recibo_retorno_mascarado:'****'+aceito.recibo.slice(-4)})}
 catch(_){return {code:202,data:{ok:false,estado:'recibo_nao_arquivado',aviso:'Lote recebido, recibo nao arquivado. Nao reenviar'}}}
 let registrado=false;
 try{const r=await supabaseRest('gnre_guias_arquivo',{method:'POST',body:{
  chave_nfe:CHAVE,numero_nfe:'51185',uf_favorecida:'PA',receita:'100102',valor_principal:'24.91',
  vencimento:body.fiscal.vencimento,ambiente:'producao',situacao:'recebida',chave_idempotencia:idAtivo,
  resposta_resumo:{recibo_mascarado:'****'+aceito.recibo.slice(-4),codigo:'100'}}});
  registrado=Array.isArray(r)&&r.length===1}catch(_){}
 return {code:200,data:{ok:true,estado:'lote_recebido',codigo_recepcao:'100',recibo_mascarado:'****'+aceito.recibo.slice(-4),
  recebido_em_producao:true,arquivado:registrado,retomada_manual:retomada,aviso:'Lote recebido. Consultar processamento e guia individual. Nao reenviar.'}};
}
function envelopeConsulta(recibo){
 if(!/^(?:\d{10}|\d{14})$/.test(recibo||''))throw Error('Recibo invalido');
 // XSD lote_gnre_consulta_v1.00: a tag de PDF e opcional, mas necessaria para recuperar a guia pagavel.
 return montarEnvelopeSoap12({servico:'consulta',xmlDados:'<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>1</ambiente><numeroRecibo>'+recibo+'</numeroRecibo><incluirPDFGuias>S</incluirPDFGuias></TConsLote_GNRE>'});
}
async function consultar(){
 const segunda=await repo.buscar(RETOMADA_ID);
 const chaveAtiva=segunda?RETOMADA_ID:ID;
 const tentativa=segunda||await repo.buscar(ID);
 if(!tentativa)return {code:404,data:{ok:false,estado:'sem_envio'}};
 const row=await supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+CHAVE+'&ambiente=eq.producao&select=id,numero_guia,situacao&limit=1'});
 if(row?.[0]?.situacao==='emitida')return {code:200,data:{ok:true,estado:'guia_emitida',pdf_disponivel:true,arquivo_id:row[0].id,numero_guia:row[0].numero_guia}};
 const recibo=await repo.obterReciboParaConsulta(chaveAtiva);
 if(!recibo)return {code:409,data:{ok:false,estado:'resultado_incerto',aviso:'Recibo nao identificado; nao reenviar'}};
 const cert=tls(await credenciais());
 let r;
 try{r=await soap('consulta',envelopeConsulta(recibo),cert)}
 catch(_){return {code:502,data:{ok:false,estado:'consulta_indisponivel',aviso:'Lote ja recebido. Nao reenviar.'}}}
 if(r.status!==200)return {code:502,data:{ok:false,estado:'consulta_http_erro',http_status:r.status}};
 const result=interpretarRetorno(r.xml,recibo,{ambienteEsperado:'1'}),g=result.guias?.length===1?result.guias[0]:null;
 const doc=String(g?.documento_origem||'').replace(/^0+(?=\d)/,'');
 const guiaValida=result.codigo==='402'&&result.guia_confirmada===true&&g?.situacao==='0'
  &&g?.receita==='100102'&&g?.uf==='PA'&&Number(g?.valor)===24.91
  &&Boolean(g?.numero_controle||g?.codigo_barras||g?.linha_digitavel)&&[CHAVE,'51185'].includes(doc);
 const base={ok:true,estado:result.estado,codigo_processamento:result.codigo,
  guia_individual_validada:guiaValida,numero_guia:guiaValida?g.numero_controle:null,
  pdf_disponivel:false,diagnostico:result.diagnostico,
  aviso:'Sem PDF oficial conferido. Nao retransmitir.'};
 // PDF retornado em resultado/pdfGuias e NAO dentro de resultado/guia (manual v2.17 / XSD).
 if(!guiaValida||!g?.pdf_base64)return {code:200,data:base};
 const pdf=Buffer.from(g.pdf_base64,'base64');
 if(pdf.length<20||pdf.length>2200000||pdf.subarray(0,5).toString('ascii')!=='%PDF-')return {code:200,data:base};
 const saved=await supabaseRest('gnre_guias_arquivo',{method:'PATCH',
  query:'?chave_idempotencia=eq.'+encodeURIComponent(chaveAtiva)+'&ambiente=eq.producao&situacao=eq.recebida&select=id',
  body:{situacao:'emitida',numero_guia:g.numero_controle,pdf_base64:g.pdf_base64,
   linha_digitavel:g.linha_digitavel||null,codigo_barras:g.codigo_barras||null,
   resposta_resumo:{origem:'resultado_oficial_confirmado',codigo:'402'},atualizado_em:new Date().toISOString()}});
 if(!Array.isArray(saved)||saved.length!==1)return {code:200,data:{...base,aviso:'Guia retornou mas PDF nao foi arquivado. Nao reenviar.'}};
 return {code:200,data:{ok:true,estado:'guia_emitida',numero_guia:g.numero_controle,arquivo_id:saved[0].id,
  pdf_disponivel:true,valor:'24.91',mensagem:'PDF oficial recuperado. Pagamento ainda nao confirmado.'}};
}

// V497: Reconciliacao de GUIA EXISTENTE por documento de origem, nunca emissao.
// Manual GNRE 2.17, secoes 4.4/4.5 e XSD lote_consulta_guia_v2.00.
const CONSULTA_GUIA={
 iniciar:{url:'https://www.gnre.pe.gov.br/gnreWS/services/GnreLoteRecepcaoConsulta',
  action:'http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcaoConsulta/consultar',
  soapVersion:'1.1'},
 resultado:{url:'https://www.gnre.pe.gov.br/gnreWS/services/GnreResultadoLoteConsulta',
  action:'http://www.gnre.pe.gov.br/webservice/GnreResultadoLoteConsulta/consultar',
  soapVersion:'1.2'}
};
function documentoXml(){
 return '<TLote_ConsultaGNRE xmlns="http://www.gnre.pe.gov.br" versao="2.00">'+
 '<consulta><uf>PA</uf><emitenteId><CNPJ>'+CNPJ+'</CNPJ></emitenteId>'+
 '<docOrigem tipo="24">'+CHAVE+'</docOrigem><idConsulta>51185</idConsulta>'+
 '<tipoConsulta>D</tipoConsulta></consulta></TLote_ConsultaGNRE>';
}
function corpoConsultaGuia(tipo,recibo){
 if(tipo==='iniciar'){
  return '<?xml version="1.0" encoding="UTF-8"?>'+
   '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'+
   '<soap:Body><gnreDadosMsg xmlns="http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcaoConsulta">'+
   documentoXml()+'</gnreDadosMsg></soap:Body></soap:Envelope>';
 }
 if(!/^(?:\d{10}|\d{14})$/.test(String(recibo||'')))throw Error('Recibo de consulta invalido');
 return '<?xml version="1.0" encoding="UTF-8"?>'+
  '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'+
  '<soap12:Header><gnreCabecMsg xmlns="http://www.gnre.pe.gov.br/webservice/GnreResultadoLoteConsulta">'+
  '<versaoDados>1.00</versaoDados></gnreCabecMsg></soap12:Header>'+
  '<soap12:Body><gnreDadosMsg xmlns="http://www.gnre.pe.gov.br/webservice/GnreResultadoLoteConsulta">'+
  '<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br">'+
  '<ambiente>1</ambiente><numeroRecibo>'+recibo+'</numeroRecibo></TConsLote_GNRE>'+
  '</gnreDadosMsg></soap12:Body></soap12:Envelope>';
}
function solicitarConsultaGuia(tipo,xml,tlsCred){
 const d=CONSULTA_GUIA[tipo];
 if(!d||typeof xml!=='string'||Buffer.byteLength(xml,'utf8')>30000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Consulta documental invalida');
 return new Promise((resolve,reject)=>{
  let finished=false,size=0;
  const progresso={dns:false,tcp:false,tls:false,enviado:false,resposta:false};
  const terminar=(e,retorno)=>{if(finished)return;finished=true;
   if(e){e.etapa=!progresso.tcp?'conexao_tcp':!progresso.tls?'handshake_tls':!progresso.enviado?'envio_consulta':'aguardando_resposta';e.indicadores=progresso;reject(e)}
   else resolve({...retorno,indicadores:progresso})};
  const headers=d.soapVersion==='1.1'?
   {'Content-Type':'text/xml; charset=utf-8','SOAPAction':'"'+d.action+'"'}:
   {'Content-Type':'application/soap+xml; charset=utf-8; action="'+d.action+'"'};
  headers['Content-Length']=Buffer.byteLength(xml,'utf8');
  const req=https.request(d.url,{method:'POST',...tlsCred,
   rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,timeout:22000,headers},res=>{
   progresso.resposta=true;
   const parts=[];res.on('data',buf=>{size+=buf.length;
    if(size>2500000){req.destroy(Object.assign(Error('Resposta excessiva'),{code:'RESPOSTA_GRANDE'}));return}
    parts.push(Buffer.from(buf))});
   res.on('end',()=>terminar(null,{status:res.statusCode,xml:Buffer.concat(parts).toString('utf8')}));
   res.on('error',e=>terminar(e));
  });
  req.on('socket',sock=>{
   sock.on('lookup',()=>{progresso.dns=true});
   sock.on('connect',()=>{progresso.tcp=true});
   sock.on('secureConnect',()=>{progresso.tls=true});
  });
  req.on('finish',()=>{progresso.enviado=true});
  req.on('timeout',()=>req.destroy(Object.assign(Error('Tempo limite do servico de consulta'),{code:'ETIMEDOUT'})));
  req.on('error',e=>terminar(e));req.end(xml);
 });
}
function obterRetornoXml(xml,nome){
 if(typeof xml!=='string'||xml.length>2500000||/<!DOCTYPE|<!ENTITY/i.test(xml))return null;
 let ret=textoTag(xml,nome);if(ret!==null)return ret;
 if(xml.includes('&lt;')){
  const decoded=xml.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
  ret=textoTag(decoded,nome);
 }
 return ret;
}

/* GNRE v2.17 Anexo I: codigos de recepcao do WebService.
   Em especial 102 eh autorizacao do CNPJ do certificado, nao sintaxe XML. */
function classificarRecepcaoConsulta(codigo,descricao,cnpjCert){
 const known={
  '101':'Certificado digital rejeitado pelo Portal GNRE.',
  '102':'CNPJ titular do certificado não habilitado para uso do WebService GNRE em produção.',
  '103':'XML ultrapassou o limite permitido.',
  '154':'CNPJ bloqueado pelo Portal GNRE.',
  '156':'XML do lote inválido.'
 };
 const code=String(codigo||'');
 if(code==='100')return null;
 const desc=String(descricao||'').slice(0,230).replace(/[\u0000-\u001f]/g,' ').trim();
 const is102=code==='102';
 return {
  ok:false,
  estado:is102?'cnpj_certificado_nao_habilitado':'consulta_recusada_pelo_portal',
  codigo_recebimento:code||'INDEFINIDO',
  descricao_oficial:desc,
  interpretacao:known[code]||'Rejeição de recepção do WebService. Verificar a descrição oficial antes de agir.',
  certificado_mesmo_cnpj_emitente:String(cnpjCert||'')===CNPJ,
  habilitacao_producao_servidor_confirmada:false,
  emissao_realizada:false,pendencia_original_preservada:true,
  aviso:is102?
   'A autorização configurada localmente não comprova habilitação no Portal GNRE. Confirme a habilitação de produção para o CNPJ do certificado A1 usado na conexão. NÃO reemitir a NF 51185.':
   'Consulta não recebida. Preservar reserva da tentativa anterior e não reemitir.'
 };
}


/* V499 — Inventario SEGURO dos campos de cada guia da consulta documental.
 * Nenhum numero de documento, pagador, endereco, codigo de barras ou XML bruto
 * e exposto no retorno para o navegador. Nao altera estado nem emite GNRE. */
function inspecionarGuiaConsulta(xml){
 const nomes=[...new Set([...String(xml||'').matchAll(/<\/?(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)(?=[\s/>])/g)].map(m=>m[1]))].slice(0,80);
 const ler=(nomes)=>{for(const n of nomes){const v=textoTag(xml,n);if(v!==null)return String(v).replace(/<[^>]*>/g,'').trim()}return null};
 const docCampos=['c04_docOrigem','documentoOrigem','docOrigem','numDocOrigem','numeroDocumentoOrigem',
   'documentoDeOrigem','chaveNFe','chaveNF','chaveAcesso','numeroNFe','numeroNotaFiscal'];
 const documentos=docCampos.flatMap(n=>{const v=textoTag(xml,n);return v===null?[]:[{nome:n,valor:String(v).replace(/<[^>]*>/g,'').trim()}]});
 const normalizar=v=>String(v||'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
 const documentoConfere=documentos.some(x=>[CHAVE,'51185'].includes(normalizar(x.valor)));
 const idConsulta=ler(['idConsulta','idConsultaGuia','identificadorConsulta']);
 const situacao=ler(['situacaoGuia','statusGuia','situacao']);
 const receita=ler(['c02_receita','receita','codigoReceita']);
 const uf=ler(['c01_ufFavorecida','ufFavorecida']);
 const valor=ler(['c06_valorPrincipal','valorPrincipal','valorGNRE','valorTotal']);
 const numControle=ler(['c38_numeroControle','numeroControle','nossoNumero','identificadorGuia']);
 const motivos=[...String(xml||'').matchAll(/<(?:[A-Za-z_][\w.-]*:)?motivo(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?motivo\s*>/gi)]
   .slice(0,12).map(m=>{const codigo=textoTag(m[1],'codigo');if(!/^[0-9]{3}$/.test(String(codigo||'')))return null;
    const d=String(textoTag(m[1],'descricao')||'').replace(/<[^>]*>/g,' ').replace(/\b\d{11,44}\b/g,'[documento oculto]').replace(/\s+/g,' ').trim().slice(0,180);
    return {codigo,descricao_oficial:d||null,descricao_manual:codigo==='701'?'Erro na validação do retorno da UF':null}
   }).filter(Boolean);
 const seguro=(v,padrao)=>typeof v==='string'&&padrao.test(v)?v:null;
 const situacaoSegura=seguro(situacao,/^[A-Za-z0-9_-]{1,24}$/);
 const receitaSegura=seguro(receita,/^[0-9]{4,12}$/);
 const ufSegura=seguro(uf,/^[A-Z]{2}$/);
 const valorSeguro=seguro(valor,/^[0-9]{1,12}(?:[.,][0-9]{1,2})?$/);
 return {
  campos_presentes:nomes,
  campo_documento_encontrado:documentos.map(x=>x.nome),
  documento_origem_confere:documentoConfere,
  identificador_consulta_confere:normalizar(idConsulta)==='51185',
  situacao_guia:situacaoSegura||'nao_identificada',
  situacao_guia_descricao:({'0':'Processada com sucesso','1':'Invalidada pelo Portal','2':'Invalidada pela UF','3':'Erro de comunicação','4':'Pendência de processamento'})[situacaoSegura]||'Não identificada',
  receita:receitaSegura,uf:ufSegura,valor_principal:valorSeguro,
  controle_presente:Boolean(numControle),
  linha_digitavel_presente:Boolean(ler(['linhaDigitavel'])),
  codigo_barras_presente:Boolean(ler(['codigoBarras'])),
  codigos_rejeicao:motivos.map(x=>x.codigo),
  motivos_rejeicao:motivos,
  nenhuma_informacao_pessoal_exposta:true
 };
}

async function consultaPorDocumento(modo,recibo){
 const tentativa=await repo.buscar(ID);
 if(!tentativa||tentativa.estado!=='resultado_incerto'){
  return {code:409,data:{ok:false,estado:'sem_pendencia_para_reconciliar',aviso:'Esta consulta so e permitida para tentativa de resultado incerto.'}};
 }
 const c=tls(await credenciais()),tipo=modo==='consulta_documento_iniciar'?'iniciar':'resultado';
 let resposta;
 try{resposta=await solicitarConsultaGuia(tipo,corpoConsultaGuia(tipo,recibo),c)}
 catch(e){return {code:202,data:{ok:false,estado:'consulta_sem_resposta',etapa:e.etapa||'indefinida',
  codigo:/^[A-Z0-9_]{2,50}$/.test(String(e.code||''))?e.code:'TRANSPORTE',
  indicadores:e.indicadores||{},emissao_realizada:false,
  aviso:'A consulta nao gerou guia. Reserva original preservada; nao reemitir.'}}}
 if(resposta.status!==200)return {code:200,data:{ok:false,estado:'consulta_http_inesperado',
  status_http:resposta.status,indicadores:resposta.indicadores,
  emissao_realizada:false,aviso:'Sem retorno fiscal conclusivo. Nao reemitir.'}};
 if(tipo==='iniciar'){
  const ret=obterRetornoXml(resposta.xml,'TRetLote_GNRE');
  if(!ret)return {code:200,data:{ok:false,estado:'consulta_retorno_nao_reconhecido',emissao_realizada:false,
   aviso:'Recebido HTTP 200 sem recibo interpretavel de consulta. Nao reemitir.'}};
  const ambiente=textoTag(ret,'ambiente'),re=textoTag(ret,'situacaoRecepcao')||'',
   codigo=textoTag(re,'codigo'),descricao=textoTag(re,'descricao'),
   num=textoTag(textoTag(ret,'recibo')||'','numero');
  if(ambiente!=='1')return {code:200,data:{ok:false,estado:'ambiente_nao_confirmado',
   codigo_recebimento:codigo,ambiente_producao:false,emissao_realizada:false,
   aviso:'Não é resposta de produção. Não reemitir.'}};
  const recusa=classificarRecepcaoConsulta(codigo,descricao,c.meta?.cnpj);
  if(recusa)return {code:200,data:{...recusa,ambiente_producao:true}};
  if(!/^(?:\d{10}|\d{14})$/.test(String(num||'')))
   return {code:200,data:{ok:false,estado:'consulta_sem_recibo_valido',
    codigo_recebimento:codigo,ambiente_producao:true,emissao_realizada:false,
    descricao_oficial:String(descricao||'').slice(0,230),
    aviso:'Recepção não forneceu recibo válido. Não reemitir.'}};
  return {code:200,data:{ok:true,estado:'consulta_documental_recebida',
   recibo_consulta:num,recibo_mascarado:'****'+num.slice(-4),emissao_realizada:false,
   aviso:'Somente consulta de guia existente, sem emissao. Aguarde o processamento da consulta.'}};
 }
 const resultadoXml=obterRetornoXml(resposta.xml,'TResultLote_GNRE');
 if(!resultadoXml)return {code:200,data:{ok:false,estado:'resultado_consulta_nao_reconhecido',emissao_realizada:false}};
 const processo=textoTag(resultadoXml,'situacaoProcess'),codigo=textoTag(processo||'','codigo');
 const guias=obterRetornoXml(resposta.xml,'resultado')||'';
 const partes=[...guias.matchAll(/<(?:[A-Za-z_][\w.-]*:)?guia(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?guia\s*>/gi)].slice(0,50);

 const diagnosticoGuias=partes.map(x=>inspecionarGuiaConsulta(x[1]));
 const achadas=diagnosticoGuias.filter(x=>x.documento_origem_confere);
 const validada=achadas.some(x=>x.situacao_guia==='0'&&x.receita==='100102'&&x.uf==='PA'&&
  Number(String(x.valor_principal||'').replace(',','.'))===24.91);
 return {code:200,data:{
  ok:true,estado:validada?'guia_localizada':diagnosticoGuias.some(g=>g.codigos_rejeicao.includes('701'))?'consulta_rejeitada_retorno_uf':'resultado_documental_conferir',
  codigo_processamento:codigo,guias_correspondentes:achadas,
  codigo_701_descricao:diagnosticoGuias.some(g=>g.codigos_rejeicao.includes('701'))?'Erro na validação do retorno da UF':null,
  guias_retornadas:partes.length,
  inventario_campos_guia:diagnosticoGuias,
  guia_valida_localizada:validada,
  pdf_retornado_presente:Boolean(textoTag(guias,'pdfGuias')),
  emissao_realizada:false,pendencia_original_preservada:true,
  aviso:validada?
   'Registro individual confere com NF, UF, receita e valor. Confirmar documento oficial antes de considerar guia emitida. NAO reemitir.':
   'Lote de consulta processado. Conferir o inventario dos campos e a situacao individual; 402 nao garante emissao. Reserva preservada; NAO reemitir.'
 }};

}


/* V501 — Status local da PRIMEIRA tentativa. Somente PostgREST SELECT.
 * Não consulta UF, não cria reserva e nunca muda resultado_incerto. */
async function situacaoTentativaOriginal(){
 const [registro,arquivos,segunda]=await Promise.all([
  repo.buscar(ID),
  supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+CHAVE+
   '&select=id,situacao,numero_guia,ambiente&limit=3'}),
  repo.buscar(RETOMADA_ID)
 ]);
 const guias=Array.isArray(arquivos)?arquivos:[];
 const tentativa=registro?{
  estado:registro.estado||'indefinido',
  tentativa:Number(registro.tentativa||0),
  codigo_erro:registro.erro_codigo||null,
  http_status:registro.http_status||null,
  recibo_armazenado:Boolean(registro.recibo_retorno_mascarado),
  criado_em:registro.criado_em||null,
  atualizado_em:registro.atualizado_em||null
 }:null;
 const estado=registro?.estado||'sem_reserva_local';
 const inconclusiva=Boolean(registro&&['resultado_incerto','enviando','reservado','recibo_nao_arquivado'].includes(estado));
 return {code:200,data:{
  ok:true,tipo:'auditoria_local_somente_leitura',
  documento:'NF-e 51185',uf:'PA',receita:'100102',valor:'24.91',
  quantidade_guias_locais:guias.length,
  guias_confirmadas_locais:guias.filter(g=>g.ambiente==='producao'&&g.situacao==='emitida'&&g.numero_guia).length,
  tentativa_original:tentativa,
  segunda_tentativa_registrada:!!segunda,
  segunda_tentativa_estado:segunda?.estado||null,
  transmissao_nesta_consulta:false,
  situacao_geral:inconclusiva?'reconciliacao_pendente':estado,
  reenvio_permitido:false,
  orientacao:inconclusiva?
   'A primeira transmissao pode ter chegado ao GNRE. Sem recibo e com retorno 701 da consulta por NF, e necessario reconciliar oficialmente. NAO reemitir.':
   'Este diagnostico nao autoriza reenvio. Validar situacao oficial e reservar nova tentativa apenas com confirmacao.'
 }};
}

async function diagnosticar(body){
 const checks=[],add=(etapa,ok,detalhe)=>checks.push({etapa,ok,detalhe:String(detalhe||'').slice(0,150)});
 if(identidade(body?.nfe).length)return {code:400,data:{ok:false,erro:'XML da NF-e 51185 divergente',transmissao:false}};
 try{
  const p=prepararPreEnvioPa({nfe:body.nfe,fiscal:body.fiscal});
  add('dados_fiscais',p.apto_para_revisao,(p.pendencias||[]).join('; ')||'Aprovado');
  if(!p.apto_para_revisao)return {code:200,data:{ok:false,checks,transmissao:false}};
  const lote=montarLoteGnre([montarGuiaPa(body.nfe,body.fiscal)]);
  montarEnvelopeSoap12({servico:'recepcao',xmlDados:lote});
  add('lote_soap_offline',true,'XML montado localmente sem transmissao');
 }catch(e){add('montagem_lote',false,String(e.message));return {code:200,data:{ok:false,checks,transmissao:false}}}
 try{
  const c=await credenciais(),m=c?.meta||{};
  // Manual GNRE v2.17 §3.2.3: certificado do transmissor pode ter CNPJ diferente do emitente.
  const transmissorIdentificado=/^[0-9]{14}$/.test(String(m.cnpj||''));
  add('a1_cnpj_transmissor',transmissorIdentificado,transmissorIdentificado?'CNPJ titular identificado (sem exibir dados)':'CNPJ do titular nao identificado; validar A1');
  add('a1_validade',m.expirado===false,m.expirado===false?'Vigente':'Vigencia nao confirmada');
  try{tls(c);add('a1_tls',true,'Material TLS disponivel')}
  catch(e){add('a1_tls',false,String(e.code||'A1_INVALIDO'))}
 }catch(e){add('a1_leitura',false,
 /senha|password|decrypt|criptograf|PFX|PKCS/i.test(String(e.message||''))?
 'Nao foi possivel abrir o A1 (senha/formato/criptografia)':'Falha na leitura segura do A1')}
 try{
  const [arquivo,reserva]=await Promise.all([
   supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+CHAVE+'&select=id&limit=1'}),repo.buscar(ID)]);
  add('guia_local',arquivo.length===0,arquivo.length?'Guia anterior no Financeiro02':'Sem guia local');
  add('reserva',!reserva,reserva?'Reserva ou tentativa anterior existente':'Sem reserva');
 }catch(_){add('consulta_banco',false,'Falha de consulta no Financeiro02')}
 return {code:200,data:{ok:checks.every(c=>c.ok),modo:'diagnostico_sem_envio',
  checks,transmissao:false,nenhuma_guia_emitida_nesta_consulta:true,
  aviso:'Nao retransmitir ate excluir duplicidade no Portal GNRE externo e corrigir falhas.'}};
}

module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo invalido'});
 if(!exigirAdmin(req,res))return;
 if(!liberado())return json(res,403,{ok:false,erro:'Piloto GNRE de producao ainda desabilitado.'});
 try{const r=req.body?.modo==='emitir'?await emitir(req.body):
  req.body?.modo==='consultar'?await consultar():
  req.body?.modo==='emitir_retomada_unica'?await emitir(req.body):
  req.body?.modo==='situacao_local'?await situacaoTentativaOriginal():
  ['consulta_documento_iniciar','consulta_documento_resultado'].includes(req.body?.modo)?await consultaPorDocumento(req.body?.modo,req.body?.reciboConsulta):
  req.body?.modo==='diagnosticar'?await diagnosticar(req.body):{code:400,data:{ok:false,erro:'Modo invalido'}};
  return json(res,r.code,r.data);
 }catch(e){return json(res,503,{ok:false,codigo:/^[A-Z_0-9]{2,60}$/.test(e.code||'')?e.code:'ERRO_INTERNO',
  aviso:'Resultado nao confirmado. Consultar antes de qualquer reenvio.'})}
};
module.exports.liberado=liberado;
module.exports.identidade=identidade;
module.exports.parseRecepcao=parseRecepcao;
module.exports.ID=ID;
module.exports.classificarRecepcaoConsulta=classificarRecepcaoConsulta;
module.exports.inspecionarGuiaConsulta=inspecionarGuiaConsulta;
