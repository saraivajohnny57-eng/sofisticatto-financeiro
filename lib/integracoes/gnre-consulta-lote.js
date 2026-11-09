'use strict';
// Consulta autenticada do resultado de lote GNRE, sem reenviar o lote.
// Resposta SOAP nao equivale a guia autorizada. Nao publica XML fiscal.
const {json,exigirAdmin}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {SERVICOS}=require('./gnre-contrato');
const {montarConsultaRecibo}=require('./gnre-consulta-xml');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {enviarSoap}=require('./gnre-soap-homologacao');
const {interpretarRetorno}=require('./gnre-interpretar-resultado');
const {arquivarGuiaOficial}=require('./gnre-arquivamento-oficial');
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
 let xml, numeroRecibo;
 try{
  if(req.body?.idempotency_key){
   const chave=String(req.body.idempotency_key);
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
  let arquivamento='nao_realizado';
  const ref=req.body?.referencia_nfe;
  // Bloqueio preventivo: sem validacao do XSD/retorno oficial nao afirmar autorizacao.
  const autorizadas=[];
  if(fiscal.ok&&autorizadas.length===1&&fiscal.guias.length===1&&ref){
   const g=autorizadas[0];
   if(g.receita===ref.receita&&g.uf===ref.uf_favorecida&&
      Number(g.valor)===Number(ref.valor_principal)&&g.numero_controle){
    try{
     const salva=await arquivarGuiaOficial({...ref,ambiente:'homologacao',
       numero_guia:g.numero_controle,pdf_base64:g.pdf_base64,
       linha_digitavel:g.linha_digitavel,codigo_barras:g.codigo_barras,
       chave_idempotencia:'gnre:consulta:'+numeroRecibo+':'+ref.receita});
     arquivamento=salva?'guia_arquivada':'retorno_arquivo_nao_confirmado';
    }catch(_e){arquivamento='falha_ao_arquivar_nao_retransmitir';}
   }else{arquivamento='divergencia_referencia_fiscal';}
  }
  return json(res,200,{ok:fiscal.ok,consulta_realizada:true,http_status:resposta.status,
   categoria:analise.categoria,estado:fiscal.estado,codigo:fiscal.codigo,
   descricao:fiscal.descricao,guias:resumo,arquivamento,
   aviso:'Arquivamento automatico suspenso ate validar o XML fiscal contra o esquema oficial; nao retransmitir o lote.'});
 }catch(e){
  return json(res,502,{ok:false,erro:'Falha ao consultar lote GNRE',
   codigo:/^[A-Z][A-Z0-9_]{1,60}$/.test(String(e.code||''))?e.code:'CONSULTA_FALHOU'});
 }
}
module.exports=handler;module.exports.montarConsulta=montarConsulta;
