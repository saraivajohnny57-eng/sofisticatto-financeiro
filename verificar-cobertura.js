const {json,exigirAdmin,supabaseRest,descriptografar}=require('./_utils');
const soNum=v=>String(v||'').replace(/\D/g,'');
async function integracaoRodonaves(){
  const d=await supabaseRest('transportadora_integracoes',{query:'?select=*&transportadora_nome=ilike.*Rodonaves*&limit=1'});
  if(!d?.[0]) throw new Error('Integração Rodonaves não encontrada.');
  return d[0];
}
async function credenciais(conviteId){
  let d=await supabaseRest('integracao_credenciais',{query:`?select=*&convite_id=eq.${encodeURIComponent(conviteId)}&ambiente=eq.producao&limit=1`});
  if(!d?.[0]) d=await supabaseRest('integracao_credenciais',{query:`?select=*&convite_id=eq.${encodeURIComponent(conviteId)}&ambiente=eq.homologacao&limit=1`});
  if(!d?.[0]) throw new Error('Credenciais Rodonaves não cadastradas.');
  return descriptografar(d[0]);
}
async function token(host,cred){
  const p=new URLSearchParams({auth_type:'DEV',grant_type:'password',username:cred.username,password:cred.password,companyId:'1'});
  const r=await fetch(host+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:p.toString(),signal:AbortSignal.timeout(15000)});
  const t=await r.text(); let d={}; try{d=t?JSON.parse(t):{}}catch{}
  if(!r.ok||!d.access_token) throw new Error(d.error_description||d.error||`Falha ao autenticar malha Rodonaves (HTTP ${r.status}).`);
  return d.access_token;
}
module.exports=async function(req,res){
  if(req.method!=='POST') return json(res,405,{ok:false,erro:'Método não permitido.'});
  if(!exigirAdmin(req,res)) return;
  const e=req.body||{}, nome=String(e.transportadora_nome||'').toUpperCase();
  if(!nome.includes('RODONAVES')&&!nome.includes('RTE')) return json(res,200,{ok:true,status:'nao_confirmado',fonte:'sem_consulta_api'});
  const cep=soNum(e.cep_destino), dest=soNum(e.cpf_cnpj_destino), rem=soNum(e.cnpj_remetente||'05451985000195');
  if(cep.length!==8||![11,14].includes(dest.length)) return json(res,200,{ok:true,status:'nao_confirmado',fonte:'dados_incompletos'});
  try{
    const i=await integracaoRodonaves(), c=await credenciais(i.convite_id);
    const tk=await token('https://unittocity-apigateway.rte.com.br',c);
    const q=new URLSearchParams({ReceiverCustomerTaxIdRegistration:dest,SenderCustomerTaxIdRegistration:rem,ZipCode:cep,District:String(e.bairro_destino||'CENTRO'),AddressNumber:String(e.numero_destino||'S/N'),CityDescription:String(e.cidade_destino||''),UnitFederation:String(e.uf_destino||'').toUpperCase()});
    const r=await fetch('https://unittocity-apigateway.rte.com.br/api/v1/unittocity/getWithHallsByDestinationAddressAndCustomers?'+q,{headers:{Accept:'application/json',Authorization:`Bearer ${tk}`},signal:AbortSignal.timeout(20000)});
    const txt=await r.text(); let d={}; try{d=txt?JSON.parse(txt):{raw:txt}}catch{d={raw:txt}}
    if(!r.ok) return json(res,200,{ok:true,status:'nao_confirmado',fonte:'api_rodonaves',aviso:d.ErrorMessage||d.Message||`HTTP ${r.status}`});
    const vazio=d==null||(Array.isArray(d)&&!d.length)||(typeof d==='object'&&!Array.isArray(d)&&!Object.keys(d).length);
    const erro=String(d?.ErrorMessage||d?.Message||'').toLowerCase();
    const nao=erro.includes('não atend')||erro.includes('nao atend')||erro.includes('sem atendimento');
    return json(res,200,{ok:true,status:nao?'nao_atende':vazio?'nao_confirmado':'atende',fonte:'malha_rodonaves',detalhe:nao?(d.ErrorMessage||d.Message):null});
  }catch(err){return json(res,200,{ok:true,status:'nao_confirmado',fonte:'api_rodonaves',aviso:err.message});}
};
