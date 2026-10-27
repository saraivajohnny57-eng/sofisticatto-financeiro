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
 const pagina=Math.min(20,Math.max(1,Number(req.body?.pagina)||1));
 const fim=new Date(),inicio=new Date(fim.getTime()-dias*86400000);
 try{
  const contexto=await obterContextoTrackingRodonaves();
  const token=await gerarTokenTracking(contexto.cred);
  const url=new URL('https://tracking-apigateway.rte.com.br/api/v1/tracking/batchByOccurrenceDate');
  url.searchParams.set('TaxIdRegistration',cnpj);
  url.searchParams.set('StartDate',inicio.toISOString());url.searchParams.set('EndDate',fim.toISOString());
  url.searchParams.set('Page',String(pagina));url.searchParams.set('AmountByPage','50');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
  let resposta;
  try{resposta=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:controller.signal});}finally{clearTimeout(timer)}
  if(!resposta.ok)return json(res,200,{ok:false,erro:`Rodonaves respondeu HTTP ${resposta.status}. Confira permissões para consulta em lote.`});
  const dados=await resposta.json();
  // V443: campos de destinatário somente em papéis explícitos; nunca inferir pelo CNPJ da consulta.
  const arr=(v)=>Array.isArray(v)?v:null;
  const possiveis=[dados,dados?.Data,dados?.data,dados?.Items,dados?.items,dados?.Results,dados?.results,dados?.Trackings,dados?.trackings,dados?.Data?.Items,dados?.data?.items,dados?.Data?.Results,dados?.data?.results,dados?.Data?.Trackings,dados?.data?.trackings];
  const itens=possiveis.map(arr).find(Boolean)||[];
  const campo=(o,...nomes)=>nomes.map(n=>o?.[n]).find(v=>v!==null&&v!==undefined&&v!=='')||'';
  const obj=(o,...nomes)=>nomes.map(n=>o?.[n]).find(v=>v&&typeof v==='object'&&!Array.isArray(v))||{};
  const txt=v=>typeof v==='string'||typeof v==='number'?String(v):'';
  const saida=itens.slice(0,50).map(o=>{
   const destinatario=obj(o,'Recipient','recipient','Consignee','consignee','Destinatario','destinatario','Receiver','receiver');
   const origem=obj(o,'Sender','sender','Shipper','shipper','Remetente','remetente');
   const documentoDest=campo(o,'RecipientTaxIdRegistration','recipientTaxIdRegistration','RecipientTaxId','recipientTaxId','ConsigneeTaxIdRegistration','consigneeTaxIdRegistration','DestinatarioCnpj','destinatarioCnpj','CnpjDestinatario','cnpjDestinatario')||campo(destinatario,'TaxIdRegistration','taxIdRegistration','TaxId','taxId','Cnpj','cnpj','Document','document','CpfCnpj','cpfCnpj');
   const dest=dig(documentoDest);
   const remetente=campo(o,'SenderName','senderName','ShipperName','shipperName','RemetenteNome','remetenteNome')||campo(origem,'Name','name','CorporateName','corporateName','RazaoSocial','razaoSocial');
   const nf=campo(o,'InvoiceNumber','invoiceNumber','NFeNumber','nfeNumber','NotaFiscal','notaFiscal');
   const cte=campo(o,'CTeNumber','cteNumber','CteNumber','KnowledgeNumber','knowledgeNumber');
   return {numeroNfe:txt(nf),numeroCte:txt(cte),remetente:txt(remetente),
    status:txt(campo(o,'StatusDescription','statusDescription','Status','status')),
    data:txt(campo(o,'OccurrenceDate','occurrenceDate','Date','date')),
    destinatarioConfirmado:dest.length===14&&dest===cnpj,
    destinatarioInformado:dest.length===11||dest.length===14,
    destinatarioSituacao:dest.length===14?(dest===cnpj?'confirmado':'divergente'):(dest.length===11?'divergente':'nao_identificado'),
    transportadora:'RODONAVES'};
  });
  const total=Number(campo(dados,'TotalCount','totalCount','Total','total','TotalItems','totalItems')||campo(dados?.Data,'TotalCount','totalCount','Total','total'));
  return json(res,200,{ok:true,fonte:'Rodonaves - batchByOccurrenceDate',cnpjConsultado:'***'+cnpj.slice(-4),
    aviso:'Resultados por CNPJ associado. Somente documentos com destinatário explicitamente confirmado podem ser considerados entradas. Nenhum registro foi criado.',
    pagina,porPagina:50,temProximaPagina:itens.length===50&&(Number.isFinite(total)&&total>0?pagina*50<total:true),
    totalPagina:saida.length,limitado:true,confirmados:saida.filter(x=>x.destinatarioConfirmado).length,
    naoIdentificados:saida.filter(x=>x.destinatarioSituacao==='nao_identificado').length,resultados:saida});
 }catch(e){return json(res,200,{ok:false,erro:e.name==='AbortError'?'Tempo limite da Rodonaves':'Não foi possível consultar o lote Rodonaves: '+String(e.message||'erro').slice(0,180)});}
};
