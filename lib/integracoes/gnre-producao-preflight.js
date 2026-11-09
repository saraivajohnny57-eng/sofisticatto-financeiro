'use strict';
// PREPARACAO de primeira GNRE de PRODUCAO (somente leitura).
// Esta rota nao pode enviar guias. Restrita ao branch Preview de testes.
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {credenciais}=require('./gnre-certificado');
const {prepararPlanoProducao}=require('./gnre-producao-plano');
function validoAmbiente(){
 return process.env.VERCEL_ENV==='preview'&&
  process.env.VERCEL_GIT_COMMIT_REF==='gnre-xml-calculos-integracao';
}
async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo nao permitido.'});
 if(!exigirAdmin(req,res))return;
 if(!validoAmbiente())return json(res,403,{
  ok:false,erro:'Pre-producao disponivel apenas na Preview de homologacao.',transmissao:false});
 let plano;
 try{plano=prepararPlanoProducao({nfe:req.body?.nfe,fiscal:req.body?.fiscal});}
 catch(e){return json(res,400,{ok:false,erro:'NF-e ou valores fiscais invalidos: '+String(e.message).slice(0,150),transmissao:false});}
 if(!plano.apto_para_revisao)return json(res,200,{...plano,pronto_para_transmitir:false});
 const nfe=req.body.nfe;
 try{
  const [reg,cred]=await Promise.all([
   supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+encodeURIComponent(nfe.chave)+
    '&receita=eq.100102&ambiente=eq.producao&select=situacao,numero_guia&limit=1'}),
   credenciais()
  ]);
  const pendencias=[];
  if(!Array.isArray(reg))pendencias.push('Consulta de duplicidade nao foi confirmada.');
  else if(reg.length)pendencias.push('Ja existe guia/tentativa de producao para esta NF-e e receita; nao reenviar.');
  if(cred?.meta?.expirado!==false)pendencias.push('A1 nao comprovadamente vigente.');
  if(cred?.meta?.cnpj!==nfe.cnpjEmitente)pendencias.push('CNPJ do A1 nao corresponde ao emitente.');
  if(process.env.GNRE_PRODUCAO_HABILITACAO_CONFIRMADA!=='1')
   pendencias.push('Habilitacao do CNPJ no WebService GNRE PRODUCAO nao foi comprovada.');
  // Esta API usa A1 da Preview e nao comprova a credencial instalada em producao.
  pendencias.push('Validar o A1 e o CNPJ no ambiente de PRODUCAO antes da emissao.');
  pendencias.push('Confirmar ConfigUF da receita 100102 no ambiente de PRODUCAO.');
  pendencias.push('Verificar no Portal GNRE se a NF-e ja possui guia fora do historico local.');
  pendencias.push('Autorizar o envio real apenas para a chave de uma NF-e selecionada.');
  // Nunca oferecer botao de transmissao a partir deste preflight.
  return json(res,200,{...plano,apto_para_revisao:pendencias.length===0,pronto_para_transmitir:false,
   pendencias,certificado_preview_compativel:cred?.meta?.expirado===false&&cred?.meta?.cnpj===nfe.cnpjEmitente,
   possui_duplicata:Array.isArray(reg)?reg.length>0:null,
   aviso:'Somente preparacao. Primeira emissao pagavel exige revisao fiscal final e autorizacao para uma NF-e especifica.',
   transmissao:false});
 }catch(_e){
  return json(res,503,{ok:false,pronto_para_transmitir:false,
   erro:'Certificado ou pesquisa de duplicidade indisponivel; nao e seguro emitir.',
   transmissao:false});
 }
}
module.exports=handler;
module.exports.validoAmbiente=validoAmbiente;
