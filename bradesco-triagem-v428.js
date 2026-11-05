/* V428 — triagem local de candidatos, sem transmissão nem consulta bancária implícita. */
(function(){
'use strict';
const $=id=>document.getElementById(id),str=x=>String(x??'').trim(),dig=x=>str(x).replace(/\D/g,'');
const iso=s=>{const x=str(s).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return '';const n=Date.parse(x+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===x?x:'';};
const fmt=x=>Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const csvVal=x=>'"'+str(x).replace(/"/g,'""')+'"';
const bloqueado=x=>/pago|liquid|baixad|cancel|protest|descontad|quitad/i.test([x.status,x.situacao,x.status_local].map(str).join(' '));
function montar(){
 const alvo=$('bradescoV427Painel');if(!alvo||$('bradescoV428Painel'))return;
 const div=document.createElement('section');div.id='bradescoV428Painel';div.style.cssText='margin:12px 0;padding:14px;border:1px solid #c9b8e6;border-radius:10px';
 div.innerHTML='<h4>V428 — Triagem para manutenção bancária (sem envio)</h4><p>Separação dos títulos por vencimento, cadastro e situação local. Nenhum título será autorizado para manutenção sem consulta bancária individual recente. O botão abaixo não altera boletos.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="bradescoV428Triar" class="btn roxo" type="button">Recalcular triagem</button><button id="bradescoV428CSV" class="btn azul" type="button" disabled>Exportar lista de conferência (não CNAB)</button></div><div id="bradescoV428Resultado" style="margin-top:10px;overflow:auto" aria-live="polite"></div>';
 alvo.insertAdjacentElement('afterend',div);let linhas=[];
 $('bradescoV428Triar').onclick=()=>{
  const out=$('bradescoV428Resultado');out.replaceChildren();linhas=[];$('bradescoV428CSV').disabled=true;
  const dados=typeof auditoriaEncargosBradescoPortalDados==='undefined'?[]:auditoriaEncargosBradescoPortalDados;
  if(!Array.isArray(dados)||!dados.length){out.textContent='Execute primeiro a auditoria local V423/V424.';return;}
  const hoje=new Date(),data=[hoje.getFullYear(),String(hoje.getMonth()+1).padStart(2,'0'),String(hoje.getDate()).padStart(2,'0')].join('-');
  const contagem=new Map();dados.forEach(x=>{const nn=dig(x.nosso_numero);if(nn)contagem.set(nn,(contagem.get(nn)||0)+1)});
  linhas=dados.map(x=>{
   const nn=dig(x.nosso_numero),venc=iso(x.vencimento),valor=Number(x.valor);
   let grupo='A_CONFERIR_ABERTO_NAO_VENCIDO';
   if(bloqueado(x))grupo='EXCLUIDO_STATUS_LOCAL';
   else if(!nn)grupo='PENDENCIA_SEM_NOSSO_NUMERO';
   else if(contagem.get(nn)>1)grupo='PENDENCIA_NOSSO_NUMERO_DUPLICADO';
   else if(!venc)grupo='PENDENCIA_VENCIMENTO_INVALIDO';
   else if(!Number.isFinite(valor)||valor<=0)grupo='PENDENCIA_VALOR_INVALIDO';
   else if(venc<data)grupo='A_CONFERIR_VENCIDO';
   return {documento:str(x.numero_nf),parcela:str(x.parcela_numero),nosso_numero:nn,vencimento:venc||str(x.vencimento),principal:Number.isFinite(valor)?valor:'',grupo,confirmacao_bancaria:'NAO_EXECUTADA_NESTA_TRIAGEM',autorizado:'NAO'};
  });
  const grupos=['A_CONFERIR_VENCIDO','A_CONFERIR_ABERTO_NAO_VENCIDO','EXCLUIDO_STATUS_LOCAL','PENDENCIA_SEM_NOSSO_NUMERO','PENDENCIA_NOSSO_NUMERO_DUPLICADO','PENDENCIA_VENCIMENTO_INVALIDO','PENDENCIA_VALOR_INVALIDO'];
  const resumo=document.createElement('p');resumo.textContent='Triagem em '+data+': '+linhas.length+' títulos locais. '+grupos.map(g=>g+': '+linhas.filter(x=>x.grupo===g).length).join(' | ')+'. Nenhuma consulta ou alteração bancária nesta operação.';out.appendChild(resumo);
  const tbl=document.createElement('table');tbl.style.cssText='width:100%;min-width:750px;font-size:12px';const head=document.createElement('tr');['Documento','Parcela','Nosso número','Vencimento','Principal','Classificação','Autorizado'].forEach(t=>{const th=document.createElement('th');th.textContent=t;head.appendChild(th)});tbl.appendChild(head);
  linhas.forEach(x=>{const tr=document.createElement('tr');[x.documento,x.parcela,x.nosso_numero,x.vencimento,x.principal===''?'—':fmt(x.principal),x.grupo,'NÃO'].forEach(t=>{const td=document.createElement('td');td.textContent=t;td.style.padding='5px';tr.appendChild(td)});tbl.appendChild(tr)});out.appendChild(tbl);$('bradescoV428CSV').disabled=false;
 };
 $('bradescoV428CSV').onclick=()=>{
  if(!linhas.length)return;
  const cols=['documento','parcela','nosso_numero','vencimento','principal','grupo','confirmacao_bancaria','autorizado'];
  const csv=[cols,...linhas.map(x=>cols.map(k=>x[k]))].map(r=>r.map(csvVal).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='bradesco-v428-triagem-nao-enviar.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();
