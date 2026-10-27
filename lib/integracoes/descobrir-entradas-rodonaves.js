/** V441: descoberta assistida, SOMENTE LEITURA, de rastreios Rodonaves.
 * Endpoint oficial batchByOccurrenceDate exige TaxIdRegistration, período e token.
 * Uma consulta por CNPJ não comprova que a Sofisticatto é destinatária.
 */
const {json,exigirAdmin}=require('./_utils');
const {obterContextoTrackingRodonaves,gerarTokenTracking}=require('./_rodonaves-tracking');
const dig=v=>String(v||'').replace(/\D/g,'');
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,erro:'Método não permitido'});
 if(!exigirAdmin(req,res))return;
 const cnpj=dig(process.env.SOFISTICATTO_CNPJ||'');
 if(cnpj.length!==14)return json(res,200,{ok:false,configuracao:true,erro:'Configure SOFISTICATTO_CNPJ (14 dígitos) na Vercel para consultar remessas associadas à empresa.'});
 const dias=Math.min(15,Math.max(1,Number(req.body?.dias)||7));
 const fim=new Date(),inicio=new Date(fim.getTime()-dias*86400000);
 try{
  const contexto=await obterContextoTrackingRodonaves();
  const token=await gerarTokenTracking(contexto.cred);
  const url=new URL('https://tracking-apigateway.rte.com.br/api/v1/tracking/batchByOccurrenceDate');
  url.searchParams.set('TaxIdRegistration',cnpj);
  url.searchParams.set('StartDate',inicio.toISOString());url.searchParams.set('EndDate',fim.toISOString());
  url.searchParams.set('Page','1');url.searchParams.set('AmountByPage','50');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
  let resposta;
  try{resposta=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:controller.signal});}finally{clearTimeout(timer)}
  if(!resposta.ok)return json(res,200,{ok:false,erro:`Rodonaves respondeu HTTP ${resposta.status}. Confira permissões para consulta em lote.`});
  const dados=await resposta.json();
  const listas=[dados,dados?.Data,dados?.data,dados?.Items,dados?.items,dados?.Results,dados?.results,dados?.Trackings,dados?.trackings];
  const itens=listas.find(Array.isArray)||[];
  const campo=(o,...nomes)=>nomes.map(n=>o?.[n]).find(v=>v!==null&&v!==undefined&&v!=='')||'';
  const saida=itens.slice(0,50).map(o=>{
   const dest=dig(campo(o,'RecipientTaxIdRegistration','recipientTaxIdRegistration','RecipientTaxId','recipientTaxId','DestinatarioCnpj','destinatarioCnpj'));
   const remetente=campo(o,'SenderName','senderName','ShipperName','shipperName','Remetente','remetente');
   return {numeroNfe:String(campo(o,'InvoiceNumber','invoiceNumber','NFeNumber','nfeNumber','NotaFiscal','notaFiscal')),
    numeroCte:String(campo(o,'CTeNumber','cteNumber','CteNumber','KnowledgeNumber','knowledgeNumber')),
    remetente:String(remetente),status:String(campo(o,'StatusDescription','statusDescription','Status','status')),
    data:String(campo(o,'OccurrenceDate','occurrenceDate','Date','date')),
    destinatarioConfirmado:dest.length===14&&dest===cnpj,
    destinatarioInformado:!!dest,transportadora:'RODONAVES'};
  });
  return json(res,200,{ok:true,fonte:'Rodonaves - batchByOccurrenceDate',cnpjConsultado:'***'+cnpj.slice(-4),
    aviso:'Consulta por CNPJ associado, não prova por si só que a empresa é destinatária. Nenhum registro foi criado automaticamente.',
    totalPagina:saida.length,limitado:true,resultados:saida});
 }catch(e){return json(res,200,{ok:false,erro:e.name==='AbortError'?'Tempo limite da Rodonaves':'Não foi possível consultar o lote Rodonaves: '+String(e.message||'erro').slice(0,180)});}
};
