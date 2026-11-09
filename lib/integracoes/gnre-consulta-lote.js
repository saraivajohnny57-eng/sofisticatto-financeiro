'use strict';
// Consulta autenticada do resultado de lote GNRE, sem reenviar o lote.
// Resposta SOAP nao equivale a guia autorizada. Nao publica XML fiscal.
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {SERVICOS}=require('./gnre-contrato');
const {montarConsultaRecibo}=require('./gnre-consulta-xml');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {enviarSoap}=require('./gnre-soap-homologacao');
const {interpretarRetorno}=require('./gnre-interpretar-resultado');
const {conferirResultadoIndividual}=require('./gnre-conferencia-individual');
const {obterReciboParaConsulta}=require('./gnre-idempotencia-repo');
// Usar um unico construtor de consulta. O XML anterior tinha nome de elemento
// incorreto (TconsLote_GNRE) e campos adicionais fora do XSD oficial.
function montarConsulta(recibo){
 return montarEnvelopeSoap12({servico:'consulta',xmlDados:montarConsultaRecibo(recibo)});
}

async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(String(process.env.GNRE_AMBIENTE||'').toLowerCase()!=='homologacao')
  return json(res,403,{ok:false,erro:'Consulta isolada em homologacao'});
 let xml, numeroRecibo, chaveConsulta=null, piloto=false;
 try{
  piloto= req.body?.piloto_mg_51109===true
    &&process.env.VERCEL_ENV==='preview'
    &&process.env.VERCEL_GIT_COMMIT_REF==='gnre-xml-calculos-integracao';
  const shaPiloto=String(process.env.GNRE_PILOTO_51109_LOTE_SHA256||'');
  const chavePiloto=piloto&&/^[a-f0-9]{64}$/.test(shaPiloto)
    ?'gnre:recepcao:'+shaPiloto.slice(0,32):null;
  if(req.body?.idempotency_key||chavePiloto){
   const chave=String(req.body.idempotency_key||chavePiloto);
   chaveConsulta=chave;
   if(!/^gnre:recepcao:[a-f0-9]{32}$/.test(chave)) return json(res,400,{ok:false,erro:'Chave de idempotencia invalida'});
   numeroRecibo=await obterReciboParaConsulta(chave);
   if(!numeroRecibo) return json(res,404,{ok:false,erro:'Recibo cifrado nao localizado; verificar reconciliacao antes de reenviar'});
  }else numeroRecibo=req.body?.numero_recibo;
  xml=montarConsulta(numeroRecibo);
 }
 catch(e){return json(res,400,{ok:false,erro:'Recibo deve ter 10 ou 14 digitos'});}
 try{
  const cred=await credenciais();
  const resposta=await enviarSoap({destino:SERVICOS.resultado,xml,
   soapAction:SOAP_ACTIONS.consulta,
   certificado:{pfx:cred.pfx,passphrase:cred.passphrase,key:cred.key,cert:cred.cert}});
  const analise=resposta.analise||{};
  if(!analise.ok)return json(res,502,{ok:false,erro:'SOAP GNRE nao confirmado',categoria:analise.categoria});
  const fiscal=interpretarRetorno(resposta.body,numeroRecibo);
  const resumo=fiscal.guias.map(g=>({situacao:g.situacao,numero_controle:g.numero_controle,
   receita:g.receita,uf:g.uf,valor:g.valor,pdf_disponivel:!!g.pdf_base64,rejeicoes:g.rejeicoes}));
  // Conferência cruzada com NF-e arquivada: somente o lote piloto identificado
  // pelo hash definido em Preview. Nenhuma escrita no banco e nenhum reenvio.
  let conciliacao=null;
  if(piloto&&chaveConsulta){
   try{
    const registro=await supabaseRest('gnre_guias_arquivo',{
     query:'?chave_idempotencia=eq.'+encodeURIComponent(chaveConsulta)
      +'&ambiente=eq.homologacao'
      +'&select=chave_nfe,numero_nfe,receita,uf_favorecida,valor_principal,ambiente,situacao&limit=1'
    });
    conciliacao=conferirResultadoIndividual(fiscal,Array.isArray(registro)?registro[0]:null);
   }catch(_e){
    conciliacao={confirmado:false,conferencia:'referencia_indisponivel',
      pendencias:['Nao foi possivel conferir os dados do retorno com o registro arquivado.'],
      documento_valido_para_pagamento:false,ambiente:'homologacao'};
   }
  }
  // Somente leitura: não marcar guia como emitida sem validar dados individuais
  // contra o XSD oficial e a referência fiscal. Nunca retransmitir.
  const arquivamento='suspenso_aguardando_validacao_individual';
  const aviso=fiscal.aviso||'A consulta nao comprova emissao ou pagamento da guia. Nao retransmitir.';
  return json(res,200,{ok:fiscal.ok,consulta_realizada:true,http_status:resposta.status,
   categoria:analise.categoria,estado:fiscal.estado,codigo:fiscal.codigo,
   descricao:fiscal.descricao,guias:resumo,guia_confirmada:fiscal.guia_confirmada===true,
   diagnostico:fiscal.diagnostico||null,conciliacao,arquivamento,aviso});
 }catch(e){
  return json(res,502,{ok:false,erro:'Falha ao consultar lote GNRE',
   codigo:/^[A-Z][A-Z0-9_]{1,60}$/.test(String(e.code||''))?e.code:'CONSULTA_FALHOU'});
 }
}
module.exports=handler;module.exports.montarConsulta=montarConsulta;
