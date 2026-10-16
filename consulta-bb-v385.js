/* V385 — consulta assistida de pendências BB; somente leitura. */
(function(){'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digits=v=>String(v??'').replace(/\D/g,'');
const iso=v=>{const s=String(v||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=String(v||'').match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:''};
const br=v=>{const s=iso(v);return s?`${s.slice(8)}/${s.slice(5,7)}/${s.slice(0,4)}`:'—'};
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const data=()=>Array.isArray(window.carteiraCompletaV296?.bb)?window.carteiraCompletaV296.bb:null;
const open=x=>['aberto','vencido','parcial'].includes(String(x.status||'').toLowerCase())&&!/liquid|pago|baixad|cancelad|quitad/i.test(String(x.status_banco||''));
function selected(){const q=String($('bbV385Busca')?.value||'').trim().toLocaleLowerCase('pt-BR'),modo=$('bbV385Referencia')?.value||'vencidos',ini=$('bbV385Ini')?.value||'',fim=$('bbV385Fim')?.value||'',hoje=today();return (data()||[]).filter(x=>{if(!open(x))return false;const v=iso(x.vencimento);if(modo==='vencidos'&&(!v||v>=hoje))return false;if(modo==='periodo'&&(!v||(ini&&v<ini)||(fim&&v>fim)))return false;return !q||[x.cliente,x.cpf_cnpj,x.seu_numero,x.nosso_numero,x.origem].some(y=>String(y||'').toLocaleLowerCase('pt-BR').includes(q))}).sort((a,b)=>iso(a.vencimento).localeCompare(iso(b.vencimento)))}
function render(){const out=$('bbV385Resultado');if(!out)return;if(!data()){out.textContent='Clique em “Consultar BB” para buscar os títulos pendentes no banco.';return;}const items=selected();const rows=items.map((x,i)=>`<tr><td>${esc(x.cliente||'—')}<small style="display:block">${esc(x.cpf_cnpj||'')}</small></td><td>${esc(x.seu_numero||'—')}</td><td>${esc(x.nosso_numero||'—')}</td><td>${br(x.vencimento)}</td><td>${money(x.valor)}</td><td>${iso(x.vencimento)<today()?'Vencido / Em aberto':'Em aberto'}${x.descontado?' / Descontado':''}</td><td>${esc(x.origem||'BANCO')}</td><td><button type="button" class="btn" style="background:#e6b800;color:#222;white-space:nowrap" data-bb-v385="${i}">📅 2ª via atualizada</button></td></tr>`).join('');out.innerHTML=`<p><strong>${items.length}</strong> título(s) encontrado(s) nos filtros atuais. Consulta somente leitura, sem importar para o Histórico.</p><div style="overflow:auto;max-height:440px"><table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr><th>Cliente / CPF-CNPJ</th><th>Referência / Seu Nº</th><th>Nosso Nº</th><th>Vencimento</th><th>Valor original</th><th>Situação</th><th>Origem</th><th>Ação</th></tr></thead><tbody>${rows||'<tr><td colspan="8">Nenhum título correspondente.</td></tr>'}</tbody></table></div><p style="font-size:12px;color:#665">A segunda via com encargos deve ser confirmada no serviço oficial do BB. O portal não altera vencimento, código de barras ou valor registrado.</p>`;out.querySelectorAll('[data-bb-v385]').forEach(b=>b.addEventListener('click',()=>segundaVia(items[Number(b.dataset.bbV385)])))}
// V386: reaproveita o mesmo fluxo do botão verde do Histórico.
// Uma consulta detalhada só acontece quando o usuário pede a segunda via.
function segundaVia(x){
 if(!x)return;
 const regs=Array.isArray(window.cobrancasBancarias)?window.cobrancasBancarias:[];
 const nn=digits(x.nosso_numero),doc=digits(x.cpf_cnpj);
 const candidatos=regs.filter(r=>/^(bb|banco do brasil)$/i.test(String(r.banco||r.banco_nome||'').trim()) && nn && digits(r.nosso_numero)===nn);
 const local=candidatos.find(r=>!doc||digits(r.cpf_cnpj||r.documento_pagador)===doc);
 if(local && typeof window.abrirBoletoOficialBbRegistro==='function'){
   window.abrirBoletoOficialBbRegistro(local.id);return;
 }
 // Boletos registrados diretamente no banco não têm ID no Histórico.
 // Reaproveita a consulta oficial já existente; não grava nem importa registros.
 const w=window.open('about:blank','_blank');
 if(w)w.document.write('<p style="font-family:Arial;padding:24px">Buscando segunda via oficial do Banco do Brasil…</p>');
 (async()=>{
   try{
     let url=String(x.pdf_url||x.urlImagemBoleto||x.url_boleto||'').trim();
     if(!/^https:\/\//i.test(url) && nn && typeof window.obterUrlBoletoOficialBb==='function')
       url=await window.obterUrlBoletoOficialBb({nosso_numero:nn,cpf_cnpj:doc});
     const destino=/^https:\/\//i.test(url)?url:'https://boleto.apps.bb.com.br/segunda-via-final';
     if(w)w.location.replace(destino);else window.open(destino,'_blank');
     if(!/^https:\/\//i.test(url))alert('O BB não retornou um link direto para este título. A página oficial foi aberta; pode ser necessário preencher os dados manualmente.');
   }catch(e){if(w)w.location.replace('https://boleto.apps.bb.com.br/segunda-via-final');alert('Não foi possível obter o link direto do BB: '+(e.message||e));}
 })();
}
window.bbV385Render=render;
window.bbV385MudarReferencia=function(){const p=$('bbV385Referencia')?.value==='periodo';$('bbV385Datas').style.display=p?'flex':'none';render()};
let ultimaConsulta=0;
window.bbV385Consultar=async function(){const btn=$('bbV385Consultar'),out=$('bbV385Resultado');if(btn?.disabled)return;btn.disabled=true;out.textContent='Consultando títulos pendentes no Banco do Brasil…';try{if(Date.now()-ultimaConsulta<120000 && data()){render();return;}if(typeof window.consultarPendenciasCarteiraV294!=='function')throw Error('Consulta bancária indisponível.');const ok=await window.consultarPendenciasCarteiraV294('bb',{silencioso:true,abrirRelatorio:false});if(!ok)throw Error('Consulta não concluída.');ultimaConsulta=Date.now();render()}catch(e){out.textContent='Não foi possível consultar o BB: '+(e.message||e)+'. Nenhum dado foi alterado.'}finally{btn.disabled=false}};
})();
