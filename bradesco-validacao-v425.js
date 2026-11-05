/* V425 - validacao pre-transmissao. Somente leitura; nenhum envio ou gravacao. */
(function(){
'use strict';
const el=id=>document.getElementById(id);
const str=v=>String(v??'').trim();
const esc=v=>'"'+str(v).replace(/"/g,'""')+'"';
const date=v=>{const s=str(v).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s?s:null};
const data=()=>typeof auditoriaEncargosBradescoPortalDados==='undefined'?[]:auditoriaEncargosBradescoPortalDados;
function baixar(rows){const csv=rows.map(r=>r.map(esc).join(';')).join('\r\n');const u=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='bradesco-v425-validacao-pretransmissao-nao-enviar.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
function analisar(){
 const box=el('bradescoV425Resultado');if(!box)return;
 const registros=data();box.replaceChildren();
 if(!registros.length){box.textContent='Execute primeiro Consultar títulos sem encargos.';return;}
 const filtro=str(el('bradescoV425Filtro')?.value).toLowerCase();
 const selecionados=registros.filter(x=>!filtro||[x.numero_nf,x.parcela_numero,x.nosso_numero,x.cliente_nome].some(v=>str(v).toLowerCase().includes(filtro)));
 const contagem=new Map();registros.forEach(x=>{const k=str(x.nosso_numero);if(k)contagem.set(k,(contagem.get(k)||0)+1)});
 const linhas=selecionados.map(x=>{
 const motivos=[];const numero=str(x.nosso_numero);const venc=date(x.vencimento);const parcela=str(x.parcela_numero);
 if(!numero)motivos.push('NOSSO_NUMERO_AUSENTE');else if(contagem.get(numero)>1)motivos.push('NOSSO_NUMERO_DUPLICADO');
 if(!venc)motivos.push('VENCIMENTO_INVALIDO');
 if(!parcela)motivos.push('PARCELA_A_CONFERIR');
 if(!Number.isFinite(Number(x.valor))||Number(x.valor)<=0)motivos.push('VALOR_INVALIDO');
 if(!['aberto','vencido'].includes(str(x.status).toLowerCase()))motivos.push('STATUS_NAO_ELEGIVEL');
 if(!x.emitido_em)motivos.push('EMISSAO_NAO_CONFIRMADA_LOCALMENTE');
 return {x,venc,parcela,motivos};
 });
 const p=document.createElement('p');p.textContent='V425: '+linhas.length+' títulos selecionados; '+linhas.filter(r=>r.motivos.length).length+' com pendências locais. Consulta bancária: NÃO EXECUTADA. Autorização de manutenção: NÃO CONFIRMADA.';box.appendChild(p);
 const tabela=document.createElement('table');tabela.style.cssText='width:100%;font-size:12px;border-collapse:collapse';
 const head=document.createElement('tr');['Documento','Parcela','Nosso número','Vencimento','Principal','Verificação'].forEach(h=>{const th=document.createElement('th');th.textContent=h;th.style.padding='6px';head.appendChild(th)});tabela.appendChild(head);
 linhas.forEach(r=>{const tr=document.createElement('tr');[r.x.numero_nf,r.parcela,r.x.nosso_numero,r.venc||'INVÁLIDO',Number(r.x.valor||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),r.motivos.join(', ')||'PENDENTE CONSULTA BANCÁRIA'].forEach(v=>{const td=document.createElement('td');td.textContent=str(v);td.style.cssText='padding:6px;border-top:1px solid #ddd';tr.appendChild(td)});tabela.appendChild(tr)});box.appendChild(tabela);
 const btn=document.createElement('button');btn.type='button';btn.className='btn azul';btn.textContent='Exportar dossiê V425 (não é CNAB)';
 btn.onclick=()=>baixar([['documento','parcela','nosso_numero','valor_principal','vencimento','status_local','pendencias_locais','situacao_no_bradesco','juros_propostos','multa_proposta','periodicidade_juros','codigo_manutencao','confirmacao_convenio','liberado_para_transmissao'],...linhas.map(r=>[r.x.numero_nf,r.parcela,r.x.nosso_numero,r.x.valor,r.venc,r.x.status,r.motivos.join('|'),'NAO_CONSULTADO','5% (proposta)','2% (proposta)','NAO_CONFIRMADA','NAO_CONFIRMADO','NAO_CONFIRMADO','NAO'])]);box.insertBefore(btn,tabela);
}
function iniciar(){
 const prev=el('regularizacaoBradescoConferenciaV424');if(!prev||el('bradescoV425Painel'))return;
 const div=document.createElement('div');div.id='bradescoV425Painel';div.style.cssText='margin:14px 0;padding:12px;border:1px solid #d7c8e6;border-radius:10px';
 const titulo=document.createElement('h4');titulo.textContent='V425 — Dossiê pré-transmissão Bradesco';div.appendChild(titulo);
 const aviso=document.createElement('p');aviso.textContent='Conferência documental por título/parcela. Não consulta a API, não altera dados e não envia instruções ao banco. Confirme carteira 09, convênio, periodicidade dos juros, códigos de manutenção e aceitação de datas retroativas antes de habilitar transmissão.';div.appendChild(aviso);
 const input=document.createElement('input');input.id='bradescoV425Filtro';input.placeholder='Buscar NF, parcela, nosso número ou cliente';input.style.cssText='max-width:380px;margin:5px';div.appendChild(input);
 const botao=document.createElement('button');botao.type='button';botao.className='btn roxo';botao.textContent='Conferir títulos V425';botao.onclick=analisar;div.appendChild(botao);
 const resultado=document.createElement('div');resultado.id='bradescoV425Resultado';resultado.style.cssText='margin-top:10px;max-height:330px;overflow:auto';div.appendChild(resultado);
 prev.insertAdjacentElement('afterend',div);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();