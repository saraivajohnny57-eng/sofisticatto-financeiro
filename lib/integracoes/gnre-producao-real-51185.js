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
   servername:'www.gnre.pe.gov.br',agent:false,timeout:18000,
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
 if(local.length||await repo.buscar(ID))return {code:409,data:{ok:false,bloqueado:true,erro:'Ja existe guia/tentativa da NF-e 51185; nao reenviar'}};
 // A tabela existente limita servico a "recepcao" ou "consulta".
 // O ambiente de producao e identificado pela chave de idempotencia e configuracao protegida.
 let r;
 try{r=await repo.reservar({chave:ID,servico:'recepcao',ator:'admin-51185',lote_sha256:hash})}
 catch(_){return {code:503,data:{ok:false,codigo:'GNRE_RESERVA_INDISPONIVEL',etapa:'reserva_idempotencia',erro:'Falha ao reservar a transmissao no Financeiro02. Nenhum envio realizado; nao repetir antes de consultar.'}}}
 if(!r?.ok)return {code:409,data:{ok:false,bloqueado:true,erro:'Reserva anterior encontrada; nao reenviar'}};
 try{await repo.marcarEnviando(ID)}catch(_){return {code:409,data:{ok:false,estado:'reserva_incerta',aviso:'Nao reenviar'}}}
 let resp;
 try{resp=await soap('recepcao',xml,cert)}
 catch(e){await repo.incerto(ID,{erro_codigo:/^[A-Z_0-9]{2,60}$/.test(e.code||'')?e.code:'TRANSPORTE_INCERTO'}).catch(()=>{});
  return {code:202,data:{ok:false,estado:'resultado_incerto',aviso:'Transmissao nao confirmada: NAO reenviar; consultar Portal GNRE'}}}
 const aceito=parseRecepcao(resp);
 if(!aceito.ok){
  if(aceito.incerto)await repo.incerto(ID,{erro_codigo:aceito.codigo}).catch(()=>{});
  else await repo.falhar(ID,{http_status:resp.status,categoria:'GNRE_'+aceito.codigo}).catch(()=>{});
  return {code:aceito.incerto?202:422,data:{ok:false,estado:aceito.incerto?'resultado_incerto':'rejeitado',codigo:aceito.codigo,aviso:'Nao reenviar automaticamente'}};
 }
 try{await repo.concluir(ID,{http_status:resp.status,categoria:'recebido_producao',recibo_completo:aceito.recibo,recibo_retorno_mascarado:'****'+aceito.recibo.slice(-4)})}
 catch(_){return {code:202,data:{ok:false,estado:'recibo_nao_arquivado',aviso:'Lote recebido, recibo nao arquivado. Nao reenviar'}}}
 let registrado=false;
 try{const r=await supabaseRest('gnre_guias_arquivo',{method:'POST',body:{
  chave_nfe:CHAVE,numero_nfe:'51185',uf_favorecida:'PA',receita:'100102',valor_principal:'24.91',
  vencimento:body.fiscal.vencimento,ambiente:'producao',situacao:'recebida',chave_idempotencia:ID,
  resposta_resumo:{recibo_mascarado:'****'+aceito.recibo.slice(-4),codigo:'100'}}});
  registrado=Array.isArray(r)&&r.length===1}catch(_){}
 return {code:200,data:{ok:true,estado:'lote_recebido',codigo_recepcao:'100',recibo_mascarado:'****'+aceito.recibo.slice(-4),
  recebido_em_producao:true,arquivado:registrado,aviso:'Lote recebido. Consultar processamento e guia individual. Nao reenviar.'}};
}
function envelopeConsulta(recibo){
 if(!/^(?:\d{10}|\d{14})$/.test(recibo||''))throw Error('Recibo invalido');
 // XSD lote_gnre_consulta_v1.00: a tag de PDF e opcional, mas necessaria para recuperar a guia pagavel.
 return montarEnvelopeSoap12({servico:'consulta',xmlDados:'<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br"><ambiente>1</ambiente><numeroRecibo>'+recibo+'</numeroRecibo><incluirPDFGuias>S</incluirPDFGuias></TConsLote_GNRE>'});
}
async function consultar(){
 const tentativa=await repo.buscar(ID);
 if(!tentativa)return {code:404,data:{ok:false,estado:'sem_envio'}};
 const row=await supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+CHAVE+'&ambiente=eq.producao&select=id,numero_guia,situacao&limit=1'});
 if(row?.[0]?.situacao==='emitida')return {code:200,data:{ok:true,estado:'guia_emitida',pdf_disponivel:true,arquivo_id:row[0].id,numero_guia:row[0].numero_guia}};
 const recibo=await repo.obterReciboParaConsulta(ID);
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
  query:'?chave_idempotencia=eq.'+encodeURIComponent(ID)+'&ambiente=eq.producao&situacao=eq.recebida&select=id',
  body:{situacao:'emitida',numero_guia:g.numero_controle,pdf_base64:g.pdf_base64,
   linha_digitavel:g.linha_digitavel||null,codigo_barras:g.codigo_barras||null,
   resposta_resumo:{origem:'resultado_oficial_confirmado',codigo:'402'},atualizado_em:new Date().toISOString()}});
 if(!Array.isArray(saved)||saved.length!==1)return {code:200,data:{...base,aviso:'Guia retornou mas PDF nao foi arquivado. Nao reenviar.'}};
 return {code:200,data:{ok:true,estado:'guia_emitida',numero_guia:g.numero_controle,arquivo_id:saved[0].id,
  pdf_disponivel:true,valor:'24.91',mensagem:'PDF oficial recuperado. Pagamento ainda nao confirmado.'}};
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
  req.body?.modo==='consultar'?await consultar():req.body?.modo==='diagnosticar'?await diagnosticar(req.body):{code:400,data:{ok:false,erro:'Modo invalido'}};
  return json(res,r.code,r.data);
 }catch(e){return json(res,503,{ok:false,codigo:/^[A-Z_0-9]{2,60}$/.test(e.code||'')?e.code:'ERRO_INTERNO',
  aviso:'Resultado nao confirmado. Consultar antes de qualquer reenvio.'})}
};
module.exports.liberado=liberado;
module.exports.identidade=identidade;
module.exports.parseRecepcao=parseRecepcao;
module.exports.ID=ID;
