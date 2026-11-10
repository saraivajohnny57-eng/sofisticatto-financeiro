'use strict';
// Consultar ConfigUF no SERVIDOR para cada receita e montar preflight de NF-e nova.
// Nao aceita perfil fornecido pelo navegador. Nao transmite nenhuma guia.
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {requisitarPa}=require('./gnre-pa-configuf');
const {envelope,analisarRetorno}=require('./gnre-configuf-multi');
const {prepararDuasGuias,RECEITAS}=require('./gnre-duas-guias-nova');
function tls(c){
 if(c?.key&&c?.cert)return {key:c.key,cert:c.cert};
 if(c?.pfx&&c?.passphrase)return {pfx:c.pfx,passphrase:c.passphrase};
 throw new Error('Certificado A1 indisponivel');
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido'});
 if(!exigirAdmin(req,res))return;
 if(process.env.VERCEL_ENV!=='preview'||process.env.GNRE_AMBIENTE!=='homologacao'
 ||process.env.VERCEL_GIT_COMMIT_REF!=='gnre-xml-calculos-integracao')
  return json(res,403,{ok:false,erro:'Preflight limitado a Preview em homologacao',transmissao:false});
 const nfe=req.body?.nfe, fiscal=req.body?.fiscal;
 try{
  // Validar identificacao fiscal ANTES de consultar os servicos externos.
  const {conferirNfe}=require('./gnre-duas-guias-nova');
  if(req.body?.novaOperacao!==true)throw new TypeError('Operacao nova precisa ser identificada.');
  conferirNfe(nfe);
  const cred=await credenciais();
  const perfis={};
  for(const item of RECEITAS){
   const resposta=await requisitarPa(envelope(nfe.ufDestino,item.codigo),tls(cred));
   const resultado=analisarRetorno({...resposta,uf:nfe.ufDestino,receita:item.codigo});
   if(!resultado.ok||!resultado.receita_confirmada||!resultado.perfil?.ok)
    return json(res,409,{ok:false,transmissao:false,receita:item.codigo,
     diagnostico:resultado.diagnostico||'configuf_nao_confirmada',
     erro:'ConfigUF nao confirmou a receita. Nao montar lote nem transmitir.'});
   perfis[item.codigo]=resultado.perfil;
  }
  const {resumo}=prepararDuasGuias({nfe,fiscal,perfis,novaOperacao:true});
  // Em caso de falha de leitura, nao declarar a nota elegivel.
  const achados=await Promise.all(RECEITAS.map(item=>supabaseRest('gnre_guias_arquivo',{
   query:'?chave_nfe=eq.'+encodeURIComponent(nfe.chave)+'&receita=eq.'+item.codigo+
   '&select=ambiente,situacao&limit=5'
  })));
  if(achados.some(a=>!Array.isArray(a)))
   return json(res,503,{ok:false,transmissao:false,erro:'Consulta de duplicidade indisponivel.'});
  if(achados.some(a=>a.length))
   return json(res,409,{ok:false,transmissao:false,erro:'Ja existe registro GNRE para esta NF-e/receita. Conferir antes de qualquer novo envio.'});
  return json(res,200,{ok:true,...resumo,duplicidade:'sem_registros_localizados',
   aviso:'Duas guias XML preparadas em memoria. Nenhuma transmissao realizada; esta etapa NAO gera PDF pagavel.'});
 }catch(e){
  return json(res,e instanceof TypeError?400:503,{ok:false,transmissao:false,
   erro:e instanceof TypeError?String(e.message).slice(0,200):'Nao foi possivel confirmar as exigencias da ConfigUF ou a conferencia fiscal.'});
 }
}
module.exports=handler;
