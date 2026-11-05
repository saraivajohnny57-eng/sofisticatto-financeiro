/* V427 — simulador de encargos: NÃO transmite instruções ao banco. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const numero=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN;};
const cent=v=>Math.round((v+Number.EPSILON)*100)/100;
const moeda=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const diaUTC=v=>{const s=String(v||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return NaN;const d=Date.parse(s+'T00:00:00Z');return Number.isFinite(d)&&new Date(d).toISOString().slice(0,10)===s?d:NaN;};
const diasAtraso=(v,hoje)=>Math.max(0,Math.floor((diaUTC(hoje)-diaUTC(v))/86400000));
function montar(){
 const alvo=$('bradescoV426Painel')||$('bradescoV425Painel');if(!alvo||$('bradescoV427Painel'))return;
 const div=document.createElement('section');div.id='bradescoV427Painel';div.style.cssText='margin:12px 0;padding:14px;border:1px solid #c9b8e8;border-radius:10px;background:#faf8ff';
 div.innerHTML='<h4>V427 — Prévia de juros e multa (sem envio bancário)</h4><p>Multa única de 2% + juros simples de 5% ao mês (mês comercial de 30 dias). A simulação não altera os boletos, nem comprova autorização do banco ou validade contratual dos encargos.</p><div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><label>Data de cálculo <input id="bradescoV427Data" type="date" style="padding:7px"></label><button class="btn roxo" type="button" id="bradescoV427Calcular">Calcular prévia local</button><button class="btn azul" type="button" id="bradescoV427Exportar" disabled>Exportar prévia CSV (não CNAB)</button></div><div id="bradescoV427Saida" style="margin-top:12px;overflow-x:auto" aria-live="polite"></div>';
 alvo.insertAdjacentElement('afterend',div);
 const input=$('bradescoV427Data');input.value=new Date().toLocaleDateString('en-CA');let exportacao=[];
 $('bradescoV427Calcular').onclick=()=>{
  const dados=typeof auditoriaEncargosBradescoPortalDados==='undefined'?[]:auditoriaEncargosBradescoPortalDados;
  const saida=$('bradescoV427Saida');saida.replaceChildren();exportacao=[];$('bradescoV427Exportar').disabled=true;
  if(!Number.isFinite(diaUTC(input.value))){saida.textContent='Informe uma data válida.';return;}
  if(!Array.isArray(dados)||!dados.length){saida.textContent='Execute primeiro a auditoria local V423/V424. Nenhuma consulta ao banco foi executada.';return;}
  const statusBloqueado=x=>/pago|liquid|baixad|cancel|protest|descontad/i.test(String(x.status||x.situacao||x.status_local||''));
  const linhas=dados.map(x=>{
   const valor=numero(x.valor),dias=diasAtraso(x.vencimento,input.value),nn=String(x.nosso_numero||'').replace(/\D/g,'');
   const motivo=statusBloqueado(x)?'BLOQUEADO_STATUS_LOCAL':!nn?'SEM_NOSSO_NUMERO':!Number.isFinite(valor)||valor<=0?'VALOR_INVALIDO':!Number.isFinite(dias)?'DATA_INVALIDA':'SIMULACAO_SEM_AUTORIZACAO_BANCARIA';
   const multa=motivo==='SIMULACAO_SEM_AUTORIZACAO_BANCARIA'&&dias>0?cent(valor*.02):0;
   const juros=motivo==='SIMULACAO_SEM_AUTORIZACAO_BANCARIA'&&dias>0?cent(valor*.05*dias/30):0;
   return {documento:String(x.numero_nf||''),parcela:String(x.parcela_numero||''),nosso_numero:nn,vencimento:String(x.vencimento||''),principal:valor,dias,multa,juros,total:cent(valor+multa+juros),motivo};
  });
  exportacao=linhas;
  const resumo=document.createElement('p');resumo.textContent=linhas.length+' candidatos locais simulados em '+input.value+'. '+linhas.filter(x=>x.dias>0&&x.motivo==='SIMULACAO_SEM_AUTORIZACAO_BANCARIA').length+' vencidos com prévia calculada. Não houve consulta individual nem transmissão ao Bradesco.';saida.appendChild(resumo);
  const tabela=document.createElement('table');tabela.style.cssText='width:100%;font-size:12px;min-width:750px';const tr=document.createElement('tr');['Documento','Parcela','Nosso número','Atraso','Principal','Multa 2%','Juros 5% a.m.','Total simulado','Condição'].forEach(x=>{const th=document.createElement('th');th.textContent=x;tr.appendChild(th)});tabela.appendChild(tr);
  linhas.forEach(x=>{const tr=document.createElement('tr');[x.documento,x.parcela,x.nosso_numero,x.dias,moeda(x.principal),moeda(x.multa),moeda(x.juros),moeda(x.total),x.motivo].forEach(v=>{const td=document.createElement('td');td.textContent=String(v);td.style.padding='5px';tr.appendChild(td)});tabela.appendChild(tr)});saida.appendChild(tabela);$('bradescoV427Exportar').disabled=false;
 };
 $('bradescoV427Exportar').onclick=()=>{
  if(!exportacao.length)return;
  const cab=['documento','parcela','nosso_numero','vencimento','principal','dias_atraso','multa_simulada','juros_simulados','total_simulado','condicao'];
  const esc=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
  const csv=[cab,...exportacao.map(x=>[x.documento,x.parcela,x.nosso_numero,x.vencimento,x.principal,x.dias,x.multa,x.juros,x.total,x.motivo])].map(l=>l.map(esc).join(';')).join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='bradesco-v427-previa-nao-enviar.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();
