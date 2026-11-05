/* V426: reconciliacao de consulta bancaria existente, estritamente somente leitura. */
(function(){
'use strict';
const $=id=>document.getElementById(id), str=x=>String(x??'').trim(),digits=x=>str(x).replace(/\D/g,'');
function montar(){
 const alvo=$('bradescoV425Painel');if(!alvo||$('bradescoV426Painel'))return;
 const div=document.createElement('div');div.id='bradescoV426Painel';div.style.cssText='margin:12px 0;padding:12px;border:1px solid #d7c8e6;border-radius:10px';
 const h=document.createElement('h4');h.textContent='V426 — Conciliar com consulta Bradesco (somente leitura)';div.appendChild(h);
 const p=document.createElement('p');p.textContent='A consulta utiliza a rotina bancária existente. Títulos ausentes da resposta não são considerados inexistentes, quitados ou autorizados para manutenção.';div.appendChild(p);
 const btn=document.createElement('button');btn.className='btn roxo';btn.type='button';btn.textContent='Consultar e comparar títulos no Bradesco';div.appendChild(btn);
 const out=document.createElement('div');out.style.marginTop='10px';div.appendChild(out);
 btn.onclick=async()=>{
 btn.disabled=true;out.textContent='Solicitando consulta bancária existente...';
 try{
 if(typeof window.consultarPendenciasCarteiraV294!=='function')throw Error('Rotina de consulta indisponível.');
 const inicio=Date.now();
 const ok=await window.consultarPendenciasCarteiraV294('bradesco',{silencioso:true,abrirRelatorio:false});
 if(!ok)throw Error('Consulta não concluída com sucesso.');
 const carteira=window.carteiraCompletaV296?.bradesco;
 if(!Array.isArray(carteira))throw Error('Resposta bancária não disponível para conciliação.');
 const locais=typeof auditoriaEncargosBradescoPortalDados==='undefined'?[]:auditoriaEncargosBradescoPortalDados;
 if(!locais.length)throw Error('Execute primeiro a auditoria local.');
 const mapa=new Map();
 carteira.forEach(x=>{const k=digits(x.nosso_numero);if(k){if(!mapa.has(k))mapa.set(k,[]);mapa.get(k).push(x)}});
 const linhas=locais.map(x=>{
 const k=digits(x.nosso_numero),matches=k?mapa.get(k)||[]:[];
 let resultado='NAO_LOCALIZADO_NA_RESPOSTA_PARCIAL';
 if(!k)resultado='SEM_NOSSO_NUMERO';
 else if(matches.length>1)resultado='AMBIGUIDADE_MULTIPLOS_REGISTROS';
 else if(matches.length===1){
 const b=matches[0],principal=Number(x.valor),valorBanco=Number(b.valor);
 if(!Number.isFinite(valorBanco)||!Number.isFinite(principal)||Math.abs(principal-valorBanco)>0.01)resultado='DIVERGENCIA_VALOR_OU_DADO_INDISPONIVEL';
 else if(str(b.vencimento).slice(0,10)!==str(x.vencimento).slice(0,10))resultado='CONFERIR_VENCIMENTO';
 else resultado='LOCALIZADO_CONFERIR_SITUACAO_E_ENCARGOS';
 }
 return {x,resultado};
 });
 out.replaceChildren();const resumo=document.createElement('p');resumo.textContent='Consulta concluída em '+new Date(inicio).toLocaleString('pt-BR')+'. '+carteira.length+' registros retornados pela rotina; '+linhas.length+' candidatos locais comparados. Nenhum título liberado para manutenção.';out.appendChild(resumo);
 const tabela=document.createElement('table');tabela.style.cssText='width:100%;font-size:12px';
 const cab=document.createElement('tr');['Documento','Parcela','Nosso número','Resultado'].forEach(v=>{const th=document.createElement('th');th.textContent=v;cab.appendChild(th)});tabela.appendChild(cab);
 linhas.forEach(({x,resultado})=>{const tr=document.createElement('tr');[x.numero_nf,x.parcela_numero,x.nosso_numero,resultado].forEach(v=>{const td=document.createElement('td');td.textContent=str(v);td.style.padding='5px';tr.appendChild(td)});tabela.appendChild(tr)});out.appendChild(tabela);
 }catch(e){out.textContent='Consulta/conciliação não confirmada: '+str(e.message||e)+'. Nenhuma alteração realizada.'}
 finally{btn.disabled=false}
 };
 alvo.insertAdjacentElement('afterend',div);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();