'use strict';
// Consulta autenticada do resultado de lote GNRE, sem reenviar o lote.
// Resposta SOAP nao equivale a guia autorizada. Nao publica XML fiscal.
const {json,exigirAdmin}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {validarRecibo,SERVICOS}=require('./gnre-contrato');
const {montarEnvelopeSoap12}=require('./gnre-envelope-soap12');
const {SOAP_ACTIONS}=require('./gnre-soap-actions');
const {enviarSoap}=require('./gnre-soap-homologacao');
const {interpretarRetorno}=require('./gnre-interpretar-resultado');
const {arquivarGuiaOficial}=require('./gnre-arquivamento-oficial');
function montarConsulta(recibo){
 const n=validarRecibo(recibo);
 return montarEnvelopeSoap12({servico:'consulta',xmlDados:
   '<TconsLote_GNRE xmlns="http://www.gnre.pe.gov.br" versao="1.00"><ambiente>2</ambiente><numeroRecibo>'+n+'</numeroRecibo><incluirPDFGuias>S</incluirPDFGuias></TconsLote_GNRE>'});
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(String(process.env.GNRE_AMBIENTE||'').toLowerCase()!=='homologacao')
  return json(res,403,{ok:false,erro:'Consulta isolada em homologacao'});
 let xml;
 try{xml=montarConsulta(req.body?.numero_recibo);}
 catch(e){return json(res,400,{ok:false,erro:'Recibo deve ter 10 ou 14 digitos'});}
 try{
  const cred=await credenciais();
  const resposta=await enviarSoap({destino:SERVICOS.resultado,xml,
   soapAction:SOAP_ACTIONS.consulta,
   certificado:{pfx:cred.pfx,passphrase:cred.passphrase,key:cred.key,cert:cred.cert}});
  const analise=resposta.analise||{};
  if(!analise.ok)return json(res,502,{ok:false,erro:'SOAP GNRE nao confirmado',categoria:analise.categoria});
  const fiscal=interpretarRetorno(resposta.body,req.body.numero_recibo);
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
       chave_idempotencia:'gnre:consulta:'+req.body.numero_recibo+':'+ref.receita});
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
