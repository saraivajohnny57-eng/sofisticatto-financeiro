const {exigirAdmin}=require('./_utils');
const {cfg,gerarToken,configuracaoEfetiva}=require('./_correios');
const BASE='https://api.correios.com.br/faturas/v1';
function json(res,status,data){return res.status(status).json(data)}
function dataBR(v){const s=String(v||'').trim();if(/^\d{2}-\d{2}-\d{4}$/.test(s))return s;if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const [a,m,d]=s.split('-');return `${d}-${m}-${a}`}return ''}
async function call(url,{method='GET',accept='application/json'}={}){
 const t=await gerarToken('contrato');
 const r=await fetch(url,{method,headers:{Authorization:`Bearer ${t}`,Accept:accept}});
 const buf=Buffer.from(await r.arrayBuffer());
 const ct=String(r.headers.get('content-type')||'');
 let d=null; const txt=buf.toString('utf8');
 if(ct.includes('json')){try{d=JSON.parse(txt)}catch{d={texto:txt}}}else d=txt;
 if(!r.ok)throw Object.assign(new Error(d?.mensagem||d?.message||d?.erro||`Correios Faturas HTTP ${r.status}`),{httpStatus:r.status,resposta:d});
 return {data:d,buffer:buf,contentType:ct};
}
module.exports=async(req,res)=>{
 if(!exigirAdmin(req,res))return;
 try{
  const action=String(req.query?.subaction||req.body?.subaction||'listar');
  const c=cfg(); const ef=await configuracaoEfetiva(); const contrato=c.contrato; const dr=String(ef.dr||c.dr||'').replace(/\D/g,'');
  if(!contrato)throw new Error('CORREIOS_CONTRATO não configurado.');
  if(!dr)throw new Error('Não foi possível identificar a DR/SE do contrato dos Correios.');
  if(action==='listar'){
   const ini=dataBR(req.query?.dataInicial),fim=dataBR(req.query?.dataFinal);if(!ini||!fim)return json(res,400,{ok:false,erro:'Informe dataInicial e dataFinal.'});
   const qs=new URLSearchParams({contrato,dr,dataInicial:ini,dataFinal:fim});
   const out=await call(`${BASE}/faturas?${qs}`);return json(res,200,{ok:true,contrato,dr,faturas:Array.isArray(out.data)?out.data:(out.data?.itens||out.data?.items||[])});
  }
  if(action==='solicitar-analitico'){
   const f=String(req.body?.fatura||'').trim(),tipo=String(req.body?.tipoDocumento||'RE').trim(),item=String(req.body?.itemFatura||'001').padStart(3,'0'),drF=String(req.body?.drFatura||dr).replace(/\D/g,'').padStart(5,'0');
   if(!f)return json(res,400,{ok:false,erro:'Fatura não informada.'}); const qs=new URLSearchParams({tipoDocumento:tipo,drFatura:drF,itemFatura:item});
   let out;try{out=await call(`${BASE}/faturas/${encodeURIComponent(f)}/analitico?${qs}`,{method:'POST'});}catch(e){if([404,405].includes(e.httpStatus))out=await call(`${BASE}/faturas/${encodeURIComponent(f)}/analitico?${qs}`,{method:'GET'});else throw e;}
   return json(res,200,{ok:true,processamento:out.data});
  }
  if(action==='status'){
   const id=String(req.query?.id||'').trim();if(!id)return json(res,400,{ok:false,erro:'ID do processamento não informado.'});const out=await call(`${BASE}/processamentos/${encodeURIComponent(id)}`);return json(res,200,{ok:true,processamento:out.data});
  }
  if(action==='arquivo'){
   const id=String(req.query?.id||'').trim();if(!id)return json(res,400,{ok:false,erro:'ID do processamento não informado.'});const out=await call(`${BASE}/processamentos/${encodeURIComponent(id)}/file`,{accept:'text/csv,*/*'});return json(res,200,{ok:true,nome:`extrato-analitico-${id}.csv`,conteudo:typeof out.data==='string'?out.data:out.buffer.toString('utf8')});
  }
  return json(res,400,{ok:false,erro:'Ação de fatura dos Correios inválida.'});
 }catch(e){return json(res,e.httpStatus||502,{ok:false,erro:e.message,resposta:e.resposta||null});}
};
