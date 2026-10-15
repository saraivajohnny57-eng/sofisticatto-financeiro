/* V374 — Consulta automática somente leitura da carteira Bradesco na aba Remessas.
 * Reutiliza a mesma função/API já utilizada no Histórico; não importa RET nem altera títulos.
 */
(function(){'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const date=v=>{const s=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4):esc(s||'—')};
 const status=v=>{const s=String(v.status||'').toLowerCase();return s==='cancelado'?'Cancelado/Baixado':s==='pago'?'Pago':s==='vencido'?'Vencido':s==='aberto'?'Em aberto':esc(v.status_banco||v.status||'Não informado')};
 function render(){const out=$('remV374Resultado');if(!out)return;const data=window.carteiraCompletaV296?.bradesco;
 if(!Array.isArray(data)){out.textContent='Ainda não há consulta nesta sessão. Clique em Consultar Bradesco.';return;}
 const q=String($('remV374Busca')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const list=data.filter(x=>!q||[x.cliente,x.cpf_cnpj,x.seu_numero,x.nosso_numero].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));
 const body=list.map(x=>`<tr><td>${esc(x.cliente||'—')}</td><td>${esc(x.seu_numero||'—')}</td><td>${esc(x.nosso_numero||'—')}</td><td>${date(x.vencimento)}</td><td>${money(x.valor)}</td><td>${status(x)}${x.descontado?' / Descontado':''}</td><td>${esc(x.origem||'BANCO')}</td></tr>`).join('');
 out.innerHTML=`<p><strong>${list.length}</strong> título(s) exibido(s) de <strong>${data.length}</strong> pendência(s) consolidadas. <small>Consulta de pendências: títulos pagos ou baixados podem não constar desta listagem.</small></p><div style="overflow:auto;max-height:400px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>Cliente</th><th>Documento</th><th>Nosso Número</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Origem</th></tr></thead><tbody>${body||'<tr><td colspan="7">Nenhum título encontrado.</td></tr>'}</tbody></table></div><p style="font-size:12px">Somente leitura: nenhum título ou status foi alterado nesta consulta.</p>`;
 }
 window.remV374Render=render;
 window.remV374Consultar=async function(){const btn=$('remV374Consultar'),out=$('remV374Resultado');if(btn?.disabled)return;btn.disabled=true;if(out)out.textContent='Consultando carteira Bradesco pela integração já existente…';try{
 if(typeof window.consultarPendenciasCarteiraV294!=='function')throw Error('Integração do Histórico indisponível.');
 const ok=await window.consultarPendenciasCarteiraV294('bradesco',{silencioso:true,abrirRelatorio:false});
 if(!ok)throw Error('A consulta não foi concluída.');render();
 }catch(e){if(out)out.textContent='Não foi possível consultar a carteira: '+(e?.message||e)+'. Nenhum dado foi alterado.';}finally{btn.disabled=false;}};
})();
