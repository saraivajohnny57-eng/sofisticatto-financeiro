'use strict';
// Consulta ConfigUF generica por UF/receita em Preview, apenas leitura.
// A rota nao cria lotes, nao calcula imposto e nao transmite guias.
const {json,exigirAdmin}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {requisitarPa}=require('./gnre-pa-configuf');
const {validarEntrada,envelope,analisarRetorno}=require('./gnre-configuf-multi');
function permitido(){
 return process.env.GNRE_AMBIENTE==='homologacao'&&process.env.VERCEL_ENV==='preview'
  &&process.env.VERCEL_GIT_COMMIT_REF==='gnre-xml-calculos-integracao';
}
function tls(c){
 if(c?.key&&c?.cert)return {key:c.key,cert:c.cert};
 if(c?.pfx&&c?.passphrase)return {pfx:c.pfx,passphrase:c.passphrase};
 throw new Error('Certificado TLS nao disponivel.');
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido.'});
 if(!exigirAdmin(req,res))return;
 if(!permitido())return json(res,403,{ok:false,erro:'ConfigUF multestado somente na Preview de homologacao.',transmissao:false});
 let uf,receita;
 try{
  const args=validarEntrada(req.body?.uf,req.body?.receita);
  uf=args.uf;receita=args.receita;
 }catch(_e){return json(res,400,{ok:false,erro:'UF ou receita invalida.',transmissao:false});}
 try{
  const c=await credenciais();
  const resposta=await requisitarPa(envelope(uf,receita),tls(c));
  const r=analisarRetorno({...resposta,uf,receita});
  return json(res,200,{...r,http_status:resposta.http_status,
   aviso:r.ok?'Configuracao lida. O retorno NAO comprova habilitacao fiscal nem autoriza producao.':
     'Configuracao nao confirmada. Nenhum XML de guia foi gerado.',
   transmissao:false});
 }catch(e){
  return json(res,502,{ok:false,uf,receita,transmissao:false,
   diagnostico:e?.code==='ETIMEDOUT'?'tempo_limite':'servico_ou_certificado_indisponivel',
   erro:'Consulta de configuracao indisponivel. Nenhuma guia foi transmitida.'});
 }
}
module.exports=handler;
module.exports.permitido=permitido;
