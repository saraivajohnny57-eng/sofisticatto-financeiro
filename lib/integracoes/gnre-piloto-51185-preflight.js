'use strict';
// V490 GNRE: confere NF 51185 e monta lote offline; nunca transmite.
const {json,exigirAdmin,supabaseRest}=require('./_utils');
const {prepararPreEnvioPa}=require('./gnre-preenvio-pa');
const reservaRepo=require('./gnre-idempotencia-repo');
const crypto=require('node:crypto');
const CHAVE='52261105451985000195550010000511851000590032';
const ID_RESERVA='gnre:producao:'+crypto.createHash('sha256').update(CHAVE).digest('hex').slice(0,32);
const RETOMADA_ID=ID_RESERVA+':retomada-unica';
const fixos={chave:CHAVE,numero:'51185',cnpjEmitente:'05451985000195',ufOrigem:'GO',ufDestino:'PA',valorDifal:'24.91',valorFcp:'0.00',consumidorFinal:'1',indIeDest:'9',ambienteNfe:'1',statusAutorizacao:'100',chaveProtocolo:CHAVE};
function conferir(n){return Object.entries(fixos).filter(([k,v])=>String(n?.[k]??'')!==v).map(([k])=>'Divergencia: '+k);}
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Metodo invalido'});
 if(!exigirAdmin(req,res))return;
 const n=req.body?.nfe,f=req.body?.fiscal;
 if(!n||!f)return json(res,400,{ok:false,erro:'NF-e e dados fiscais obrigatorios'});
 const erros=conferir(n);
 if(erros.length)return json(res,400,{ok:false,pendencias:erros,transmissao:false,erro:'XML diferente do piloto 51185'});
 let pre;
 try{pre=prepararPreEnvioPa({nfe:n,fiscal:f});}
 catch(e){return json(res,400,{ok:false,erro:String(e.message).slice(0,160),transmissao:false})}
 let arquivos,cert,reserva,retomada;
 try{[arquivos,cert,reserva,retomada]=await Promise.all([
  supabaseRest('gnre_guias_arquivo',{query:'?chave_nfe=eq.'+CHAVE+'&select=situacao,ambiente,numero_guia&limit=5'}),
  supabaseRest('gnre_certificados',{query:'?id=eq.principal&select=id&limit=1'}),
 reservaRepo.buscar(ID_RESERVA),
 reservaRepo.buscar(RETOMADA_ID)
 ]);}
 catch(_){return json(res,503,{ok:false,erro:'Consulta de duplicidade/credencial falhou',transmissao:false})}
 const pendencias=[...(pre.pendencias||[])];
 if(arquivos.length)pendencias.push('Ja existe guia/tentativa registrada para esta NF-e');
 if(reserva)pendencias.push('Tentativa original registrada: '+String(reserva.estado||'situação indisponível')+'.');
 if(retomada)pendencias.push('Retomada manual já reservada: '+String(retomada.estado||'indefinida')+'. Não repetir.');
 if(cert.length!==1)pendencias.push('Certificado A1 nao confirmado');
 if(process.env.VERCEL_ENV!=='production')pendencias.push('Deploy nao esta em producao');
 if(process.env.GNRE_PRODUCAO_HABILITACAO_CONFIRMADA!=='1')pendencias.push('Habilitacao WebService PRODUCAO pendente na configuracao');
 if(process.env.GNRE_PILOTO_PA_51185_PRODUCAO!=='1')pendencias.push('Janela de emissao especifica da NF 51185 nao liberada');
 pendencias.push('Conferir no portal nacional se existe guia fora do historico local');
 return json(res,200,{ok:true,transmissao:false,numero:'51185',receita:'100102',uf:'PA',
  difal:'24.91',fcp:'0.00',cotacao_estimada:'31.99',arquivos_locais:arquivos.length,
 reserva_existente:!!reserva,reserva_estado:reserva?.estado||null,
 retomada_existente:!!retomada,retomada_estado:retomada?.estado||null,
 retomada_elegivel:Boolean(
  reserva?.estado==='resultado_incerto'&&Number(reserva?.tentativa)===1&&
  reserva?.erro_codigo==='ETIMEDOUT'&&!reserva?.recibo_retorno_mascarado&&
  !retomada&&arquivos.length===0&&cert.length===1&&pre.apto_para_revisao===true&&
  process.env.VERCEL_ENV==='production'&&
  process.env.GNRE_PRODUCAO_HABILITACAO_CONFIRMADA==='1'&&
  process.env.GNRE_PILOTO_PA_51185_PRODUCAO==='1'),
  certificado_cadastrado:cert.length===1,lote_preparado:pre.apto_para_revisao===true,
  lote_hash:pre.plano?.lote_sha256||null,
  pendencias:[...new Set(pendencias)],
  aviso:'Somente pre-emissao. Nenhuma GNRE transmitida ou emitida.'});
};
module.exports.conferir=conferir;
