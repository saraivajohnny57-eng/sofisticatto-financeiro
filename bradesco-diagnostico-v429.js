/* V429: diagnóstico consolidado somente leitura, sem chamadas ou gravações no Supabase/Bradesco. */
(function(){
'use strict';
const $=id=>document.getElementById(id),s=x=>String(x??'').trim(),digits=x=>s(x).replace(/\D/g,'');
const cents=x=>Math.round((Number(x)+Number.EPSILON)*100);
const iso=x=>{const t=s(x).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(t))return '';const d=Date.parse(t+'T00:00:00Z');return Number.isFinite(d)&&new Date(d).toISOString().slice(0,10)===t?t:'';};
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const daydiff=(a,b)=>Math.max(0,Math.floor((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000));
const blocked=x=>/pago|liquid|baixad|cancel|protest|descontad|quitad/i.test([x.status,x.situacao,x.status_local,x.status_banco].map(s).join(' '));
const esc=x=>'"'+s(x).replace(/"/g,'""')+'"';
const money=x=>Number(x/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function calc(principalCentavos,dias){const multa=dias>0?Math.round(principalCentavos*.02):0,juros=dias>0?Math.round(principalCentavos*.05*dias/30):0;return {multa,juros,total:principalCentavos+multa+juros};}
function tests(){
 const casos=[[10000,0,0,0,10000],[10000,10,200,167,10367],[44191,18,884,1326,46401]];
 return casos.map(([v,d,m,j,t])=>{const c=calc(v,d);return c.multa===m&&c.juros===j&&c.total===t});
}
function montar(){
 const alvo=$('bradescoV428Painel');if(!alvo||$('bradescoV429Painel'))return;
 const painel=document.createElement('section');painel.id='bradescoV429Painel';painel.style.cssText='margin:12px 0;padding:14px;border:1px solid #a995cf;border-radius:10px;background:#faf9fd';
 painel.innerHTML='<h4>V429 — Diagnóstico consolidado de encargos (sem transmissão)</h4><p>Uma única execução local verifica cadastro, duplicidade, situação local, cálculo, correspondência com a última resposta parcial de pendências e requisitos ainda não comprovados. Não consulta nem altera o banco ou Supabase.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn roxo" type="button" id="bradescoV429Executar">Executar diagnóstico completo</button><button class="btn azul" type="button" id="bradescoV429CSV" disabled>Baixar relatório completo CSV (não CNAB)</button></div><div id="bradescoV429Resultado" style="margin-top:12px;overflow:auto" aria-live="polite"></div>';
 alvo.insertAdjacentElement('afterend',painel);let linhas=[];
 $('bradescoV429Executar').onclick=()=>{
  const out=$('bradescoV429Resultado');out.replaceChildren();linhas=[];$('bradescoV429CSV').disabled=true;
  const locais=typeof auditoriaEncargosBradescoPortalDados==='undefined'?[]:auditoriaEncargosBradescoPortalDados;
  if(!Array.isArray(locais)||!locais.length){out.textContent='Execute primeiro a auditoria local. Nenhum teste bancário foi realizado.';return;}
  const resultados=tests(),data=today();
  const snap=window.bradescoRespostaBancariaV426;
  const bank=Array.isArray(snap?.titulos)?snap.titulos:null;
  const mapa=new Map(),repetidos=new Map();
  locais.forEach(x=>{const n=digits(x.nosso_numero);if(n)repetidos.set(n,(repetidos.get(n)||0)+1)});
  if(bank)bank.forEach(x=>{const n=digits(x.nosso_numero);if(n){if(!mapa.has(n))mapa.set(n,[]);mapa.get(n).push(x)}});
  linhas=locais.map(x=>{
   const nn=digits(x.nosso_numero),v=iso(x.vencimento),p=cents(x.valor);
   const dias=v?daydiff(data,v):0;
   const erros=[];
   if(blocked(x))erros.push('STATUS_LOCAL_BLOQUEADO');
   if(!nn)erros.push('NOSSO_NUMERO_AUSENTE');
   else if(repetidos.get(nn)>1)erros.push('NOSSO_NUMERO_DUPLICADO');
   if(!v)erros.push('VENCIMENTO_INVALIDO');
   if(!Number.isFinite(p)||p<=0)erros.push('VALOR_INVALIDO');
   const hits=nn&&bank?mapa.get(nn)||[]:[];
   let comparacao='SEM_CONSULTA_PARCIAL_NESTA_SESSAO';
   if(bank)comparacao=!nn?'SEM_NOSSO_NUMERO':hits.length===0?'AUSENTE_DA_RESPOSTA_PARCIAL':hits.length>1?'AMBIGUO_NA_RESPOSTA_PARCIAL':'LOCALIZADO_EM_PENDENCIAS_SEM_CONFIRMACAO_INDIVIDUAL';
   if(hits.length===1){
    const b=hits[0],bp=Number(b.valor),bv=iso(b.vencimento);
    if(!Number.isFinite(bp)||!Number.isFinite(p)||Math.abs(bp*100-p)>1)erros.push('VALOR_BANCARIO_DIVERGENTE_OU_INDISPONIVEL');
    if(!bv||bv!==v)erros.push('VENCIMENTO_BANCARIO_DIVERGENTE_OU_INDISPONIVEL');
   }
   if(hits.length>1)erros.push('DUPLICIDADE_NA_RESPOSTA_PARCIAL');
   const c=Number.isFinite(p)&&p>0&&v&&!blocked(x)?calc(p,dias):null;
   return {documento:s(x.numero_nf),parcela:s(x.parcela_numero),nosso_numero:nn,vencimento:v||s(x.vencimento),principal_centavos:Number.isFinite(p)?p:'',dias_atraso:dias,multa_centavos:c?.multa??'',juros_centavos:c?.juros??'',total_centavos:c?.total??'',comparacao,pendencias:erros.join('|')||'NENHUMA_PENDENCIA_LOCAL',consulta_individual:'NAO_REALIZADA',manutencao_habilitada:'NAO_COMPROVADA',transmissao:'NAO_REALIZADA',apto_envio:'NAO'};
  });
  const titulo=document.createElement('p');titulo.textContent='Diagnóstico '+data+' — '+linhas.length+' títulos. Testes de cálculo: '+resultados.filter(Boolean).length+'/'+resultados.length+'. Vencidos: '+linhas.filter(x=>x.dias_atraso>0).length+'. Pendências locais: '+linhas.filter(x=>x.pendencias!=='NENHUMA_PENDENCIA_LOCAL').length+'. Resposta parcial bancária na sessão: '+(bank?bank.length+' registros ('+s(snap.consultadoEm)+')':'indisponível')+'. Nenhum título autorizado para envio.';out.appendChild(titulo);
  const alerta=document.createElement('p');alerta.textContent='BLOQUEIOS PARA OPERAÇÃO REAL: validar autorização contratual dos juros/multa, canal técnico de manutenção Bradesco carteira 09, consulta individual atual de cada título, homologação e confirmação de aceite. Ausência em pendências não comprova pagamento.';out.appendChild(alerta);
  const tbl=document.createElement('table');tbl.style.cssText='min-width:900px;width:100%;font-size:12px';const h=document.createElement('tr');['Documento','Parcela','Nosso número','Atraso','Principal','Multa','Juros','Total simulado','Conferência','Pendências'].forEach(z=>{const th=document.createElement('th');th.textContent=z;h.appendChild(th)});tbl.appendChild(h);
  linhas.forEach(x=>{const tr=document.createElement('tr');[x.documento,x.parcela,x.nosso_numero,x.dias_atraso,x.principal_centavos===''?'—':money(x.principal_centavos),x.multa_centavos===''?'—':money(x.multa_centavos),x.juros_centavos===''?'—':money(x.juros_centavos),x.total_centavos===''?'—':money(x.total_centavos),x.comparacao,x.pendencias].forEach(z=>{const td=document.createElement('td');td.textContent=s(z);td.style.padding='5px';tr.appendChild(td)});tbl.appendChild(tr)});out.appendChild(tbl);
  $('bradescoV429CSV').disabled=false;
 };
 $('bradescoV429CSV').onclick=()=>{
  if(!linhas.length)return;
  const cols=Object.keys(linhas[0]);const csv=[cols,...linhas.map(x=>cols.map(k=>x[k]))].map(row=>row.map(esc).join(';')).join('\r\n');
  const u=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='bradesco-v429-diagnostico-consolidado-nao-enviar.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();
