/* V368: auditoria pre-emissao de boletos por remessa; SEM geracao de titulo bancario. */
(()=>{'use strict';
const SRC='sofisticatto_remessas_preparacao_v357',SNAP='sofisticatto_remessas_snapshots_v364';
const $=id=>document.getElementById(id);
const read=k=>{try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch{return []}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canon=x=>({id_local:String(x.id||''),banco:String(x.banco||''),cliente:String(x.cliente||''),documento:String(x.documento||'').replace(/\D/g,''),pedido:String(x.pedido||''),valor_centavos:x.valor,vencimento:String(x.vencimento||'')});
const sha=async o=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(o))))).map(x=>x.toString(16).padStart(2,'0')).join('');
const check=x=>{const e=[];if(x.banco!=='bradesco')e.push('Banco diferente de Bradesco');if(!x.cliente)e.push('Cliente ausente');if(!/^\d{11}$|^\d{14}$/.test(x.documento))e.push('CPF/CNPJ ausente');if(!x.pedido)e.push('Pedido ausente');if(!Number.isSafeInteger(x.valor_centavos)||x.valor_centavos<=0)e.push('Valor inválido');if(!/^\d{4}-\d{2}-\d{2}$/.test(x.vencimento)||Number.isNaN(Date.parse(x.vencimento+'T12:00:00Z')))e.push('Vencimento inválido');return e};
window.remessaV368Auditar=async()=>{
 const tb=$('remV368Lista'),status=$('remV368Status');if(!tb||!status)return;
 tb.innerHTML='<tr><td colspan="6">Conferindo integridade...</td></tr>';
 if(!crypto?.subtle){status.textContent='HTTPS é necessário para validar SHA-256.';return}
 const src=read(SRC).filter(x=>x.banco==='bradesco'&&x.situacao==='aprovado'),snap=read(SNAP),keys=new Map(),rows=[];let ok=0;
 for(const x of src){const d=canon(x),errors=check(d),s=snap.find(v=>v.id_local===x.id),hash=await sha(d),key=[d.banco,d.documento,d.pedido].join('|');keys.set(key,(keys.get(key)||0)+1);
 if(!s)errors.push('Conferência não congelada');else if(s.sha256!==hash)errors.push('Dados alterados após congelamento');
 rows.push({d,errors,key});}
 for(const r of rows){if(keys.get(r.key)>1)r.errors.push('Duplicidade de documento/pedido');if(!r.errors.length)ok++}
 tb.innerHTML=rows.length?rows.map(({d,errors})=>`<tr><td>${esc(d.cliente)}</td><td>${esc(d.pedido)}</td><td>${esc(d.documento)}</td><td>${(d.valor_centavos/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td>${esc(d.vencimento)}</td><td>${errors.length?'<strong style="color:#a22525">'+esc(errors.join('; '))+'</strong>':'<strong style="color:#147d48">Dados internos conferidos</strong>'}</td></tr>`).join(''):'<tr><td colspan="6">Nenhum rascunho Bradesco aprovado.</td></tr>';
 status.textContent=`${src.length} rascunho(s) aprovado(s) do Bradesco · ${ok} com dados internos conferidos · ${src.length-ok} pendente(s). Mesmo os conferidos NÃO são boletos: falta validar convênio, carteira, sequenciamento do Nosso Número, dígito verificador, código de barras, linha digitável e layout CNAB com o banco.`;
};
})();
