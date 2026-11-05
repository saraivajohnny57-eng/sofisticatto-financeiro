/* V424 - conferencia documental, sem escrita no Supabase nem transmissao bancaria. */
(function(){
'use strict';
function texto(v){return String(v==null?'':v).trim();}
function dataValida(v){const s=texto(v).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
function csvCell(v){return '"'+texto(v).replace(/"/g,'""')+'"';}
function download(nome,rows){const csv=rows.map(r=>r.map(csvCell).join(';')).join('\r\n');const u=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
function conferir(){
 const lista=typeof auditoriaEncargosBradescoPortalDados!=='undefined'?auditoriaEncargosBradescoPortalDados:[];
 const area=document.getElementById('regularizacaoBradescoConferenciaV424');
 if(!area)return;
 if(!lista.length){area.textContent='Consulte os títulos antes de conferir.';return;}
 const contagem=new Map();
 for(const x of lista){const k=texto(x.nosso_numero);if(k)contagem.set(k,(contagem.get(k)||0)+1);}
 const hoje=new Date().toISOString().slice(0,10);
 const linhas=lista.map(x=>{
  const motivos=[];const nosso=texto(x.nosso_numero);const venc=texto(x.vencimento).slice(0,10);
  if(!nosso)motivos.push('SEM_NOSSO_NUMERO');
  if(nosso&&contagem.get(nosso)>1)motivos.push('NOSSO_NUMERO_REPETIDO');
  if(!dataValida(venc))motivos.push('VENCIMENTO_INVALIDO');
  if(!Number.isFinite(Number(x.valor))||Number(x.valor)<=0)motivos.push('VALOR_INVALIDO');
  if(!['aberto','vencido'].includes(texto(x.status).toLowerCase()))motivos.push('STATUS_NAO_ELEGIVEL');
  if(!x.emitido_em)motivos.push('SEM_DATA_EMISSAO');
  if(!texto(x.parcela_numero))motivos.push('CONFERIR_PARCELA');
  return {x,venc,motivos,classe:motivos.length?'REVISAR_DADOS':'PENDENTE_CONSULTA_BANCO',vencido:dataValida(venc)&&venc<hoje};
 });
 const revisar=linhas.filter(r=>r.motivos.length).length;
 const vencidos=linhas.filter(r=>r.vencido).length;
 area.replaceChildren();
 const p=document.createElement('p');
 p.textContent='V424 — Conferência local: '+linhas.length+' candidatos; '+revisar+' exigem revisão cadastral; '+vencidos+' com vencimento anterior a hoje (UTC). Nenhum foi confirmado no Bradesco.';
 area.appendChild(p);
 const aviso=document.createElement('p');aviso.textContent='Juros de 5% e multa de 2% são parâmetros propostos, não confirmação bancária. A unidade e a forma de cálculo dos juros, os códigos de manutenção e a aplicação retroativa dependem de validação contratual e bancária. Não envie este CSV como CNAB.';area.appendChild(aviso);
 const botao=document.createElement('button');botao.type='button';botao.className='btn azul';botao.textContent='Exportar conferência V424 (CSV, não enviar ao banco)';
 botao.onclick=()=>download('conferencia-bradesco-v424-nao-enviar.csv',[
 ['documento','parcela','nosso_numero','vencimento','valor_original','situacao_local','vencido_na_data_da_conferencia','juros_propostos','multa_proposta','resultado_conferencia','pendencias','confirmacao_bancaria'],
 ...linhas.map(r=>[r.x.numero_nf,r.x.parcela_numero,r.x.nosso_numero,r.venc,r.x.valor,r.x.status,r.vencido?'SIM':'NAO','5 (unidade a confirmar)','2%',r.classe,r.motivos.join('|'),'NAO_CONSULTADO'])
 ]);
 area.appendChild(botao);
}
function instalar(){
 const parent=document.getElementById('regularizacaoBradescoPrevia');if(!parent||document.getElementById('regularizacaoBradescoConferenciaV424'))return;
 const box=document.createElement('div');box.style.marginTop='12px';box.id='regularizacaoBradescoConferenciaV424';
 const b=document.createElement('button');b.type='button';b.className='btn roxo';b.textContent='Conferir candidatos V424 (sem transmissão)';b.onclick=conferir;
 parent.insertAdjacentElement('afterend',box);box.appendChild(b);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar);else instalar();
})();