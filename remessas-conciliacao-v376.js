/* V376: pré-conciliação local, somente leitura; não gera nem transmite CNAB. */
(()=>{'use strict';
const $=id=>document.getElementById(id), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const digits=x=>String(x||'').replace(/\D/g,'');
const source='sofisticatto_remessas_preparacao_v357', snaps='sofisticatto_remessas_snapshots_v364';
const read=k=>{try{let a=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(a)?a:[]}catch{return []}};
const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))).map(n=>n.toString(16).padStart(2,'0')).join('');
const canonical=x=>({id_local:String(x.id||''),banco:String(x.banco||''),cliente:String(x.cliente||''),documento:digits(x.documento),pedido:String(x.pedido||''),valor_centavos:x.valor,vencimento:String(x.vencimento||'')});
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const base=x=>norm(x).replace(/\d+DE\d+$/,'');
let latest=[];
window.remV376Conferir=async()=>{const out=$('remV376Resultado'),btn=$('remV376Conferir');if(!out)return;btn.disabled=true;out.textContent='Conferindo títulos locais e consulta bancária…';try{
const bank=window.carteiraCompletaV296?.bradesco;
if(!Array.isArray(bank))throw Error('Consulte o Bradesco primeiro. Esta conferência precisa dos dados atuais da carteira.');
if(!crypto?.subtle)throw Error('A conferência de integridade exige HTTPS.');
const items=read(source).filter(x=>x.banco==='bradesco'&&x.situacao==='aprovado'),snapshots=read(snaps),seen=new Set();
latest=[];
for(const x of items){const c=canonical(x),issues=[],key=[c.documento,c.pedido].join('|'),s=snapshots.find(t=>t.id_local===c.id_local),digest=await hash(c);
if(!s||s.sha256!==digest)issues.push('Conferência congelada divergente');
if(seen.has(key))issues.push('Duplicidade local');seen.add(key);
if(!/^\d{11}$|^\d{14}$/.test(c.documento)||!Number.isSafeInteger(c.valor_centavos)||c.valor_centavos<=0||!/^\d{4}-\d{2}-\d{2}$/.test(c.vencimento))issues.push('Dados locais incompletos');
const matches=bank.filter(b=>{const d=norm(b.seu_numero),p=base(c.pedido),n=norm(c.pedido),cpf=digits(b.cpf_cnpj);return (d&&(d===p||d===n||n.startsWith(d+'1DE')||p===d)) || (cpf&&cpf===c.documento&&Math.round(Number(b.valor||0)*100)===c.valor_centavos&&String(b.vencimento||'').slice(0,10)===c.vencimento);});
let situacao=issues.length?'BLOQUEADO':matches.length?'POSSÍVEL REGISTRO EXISTENTE':'REVISÃO MANUAL NECESSÁRIA';
latest.push({...c,situacao,motivos:issues,correspondencias:matches.map(b=>({documento:String(b.seu_numero||''),nosso_numero:String(b.nosso_numero||''),status:String(b.status||b.status_banco||''),origem:String(b.origem||'')}))});}
const count=s=>latest.filter(x=>x.situacao===s).length;
const rows=latest.map(x=>`<tr><td>${esc(x.cliente)}</td><td>${esc(x.pedido)}</td><td>${(x.valor_centavos/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td>${esc(x.vencimento)}</td><td>${esc(x.situacao)}</td><td>${esc(x.motivos.join('; ')||x.correspondencias.map(m=>m.nosso_numero||m.documento).join(', ')||'Não encontrado na consulta de pendências; verificar Histórico e banco')}</td></tr>`).join('');
out.innerHTML=`<p><strong>${latest.length}</strong> título(s) aprovados: ${count('POSSÍVEL REGISTRO EXISTENTE')} com correspondência bancária; ${count('BLOQUEADO')} bloqueado(s); ${count('REVISÃO MANUAL NECESSÁRIA')} exigindo revisão.</p><p style="color:#8b4200"><strong>Nenhum título é liberado automaticamente para nova remessa.</strong> Ausência na lista de pendências não prova ausência de registro bancário.</p><div style="overflow:auto;max-height:340px"><table style="width:100%;font-size:12px"><thead><tr><th>Cliente</th><th>Pedido</th><th>Valor</th><th>Vencimento</th><th>Conferência</th><th>Observação</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Nenhum título aprovado localmente.</td></tr>'}</tbody></table></div>`;
$('remV376Exportar').disabled=!latest.length;
}catch(e){out.textContent='Conferência não concluída: '+e.message;}finally{btn.disabled=false;}};
window.remV376Exportar=()=>{if(!latest.length)return;const payload={tipo:'AUDITORIA_INTERNA_SEM_AUTORIZACAO_DE_REMESSA',versao:'376',data:new Date().toISOString(),aviso:'NÃO É CNAB. NÃO TRANSMITIR. NÃO COMPROVA AUSÊNCIA DE REGISTRO.',titulos:latest};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='sofisticatto_v376_auditoria_remessas.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);};
})();
