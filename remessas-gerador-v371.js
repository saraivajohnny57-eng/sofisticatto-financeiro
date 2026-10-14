/* V371: preparação auditável do gerador bancário. NÃO produz CNAB homologado nem boletos. */
(()=>{'use strict';
const SRC='sofisticatto_remessas_preparacao_v357', SNAP='sofisticatto_remessas_snapshots_v364';
const el=id=>document.getElementById(id);
const read=k=>{try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch{return []}};
const digits=s=>String(s||'').replace(/\D/g,'');
const canonical=x=>({id_local:String(x.id||''),banco:String(x.banco||''),cliente:String(x.cliente||''),documento:digits(x.documento),pedido:String(x.pedido||''),valor_centavos:x.valor,vencimento:String(x.vencimento||'')});
const sha=async o=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(o))))).map(x=>x.toString(16).padStart(2,'0')).join('');
const set=s=>{if(el('remV371Status'))el('remV371Status').textContent=s};
async function check(){if(!crypto?.subtle)throw Error('A verificação requer HTTPS.');const src=read(SRC).filter(x=>x.banco==='bradesco'&&x.situacao==='aprovado'),snaps=read(SNAP),seen=new Set(),valid=[],errors=[];
for(const x of src){const d=canonical(x),key=[d.banco,d.documento,d.pedido].join('|'),snapshot=snaps.find(s=>s.id_local===d.id_local),digest=await sha(d),issues=[];
if(!d.cliente.trim()||!d.pedido.trim()||!/^\d{11}$|^\d{14}$/.test(d.documento)||!Number.isSafeInteger(d.valor_centavos)||d.valor_centavos<=0||!/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento)||Number.isNaN(Date.parse(d.vencimento+'T12:00:00Z')))issues.push('dados inválidos');
if(!snapshot||snapshot.sha256!==digest)issues.push('conferência não congelada ou alterada');if(seen.has(key))issues.push('duplicidade');seen.add(key);
if(issues.length)errors.push({pedido:d.pedido,motivos:issues});else valid.push({...d,sha256:digest});}
return {valid,errors};}
window.remessaV371Verificar=async()=>{try{const r=await check();set(`${r.valid.length} título(s) com conferência íntegra; ${r.errors.length} pendência(s). Gerador CNAB ainda bloqueado: layout, Nosso Número, DV e convênio precisam de homologação.`)}catch(e){set('Erro: '+e.message)}};
window.remessaV371Exportar=async()=>{try{const r=await check();if(!r.valid.length){set('Nenhum título elegível para exportação.');return}const payload={tipo:'MANIFESTO_INTERNO_NAO_BANCARIO',versao:'371',gerado_em:new Date().toISOString(),carteira_informada:'09',aviso:'NÃO É ARQUIVO CNAB, NÃO TRANSMITIR AO BANCO, NÃO É BOLETO',titulos:r.valid,pendencias:r.errors};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sofisticatto_v371_manifesto_interno_nao_cnab.json';document.body.appendChild(a);a.click();a.remove();set(`Manifesto interno exportado: ${r.valid.length} conferência(s), ${r.errors.length} pendência(s). Nenhum boleto ou remessa bancária gerado.`);setTimeout(()=>URL.revokeObjectURL(url),10000)}catch(e){set('Erro: '+e.message)}};
})();
