/* V438: painel único para consulta autenticada do piloto; não transmite alterações. */
(function(){
'use strict';
function montar(){
 const base=document.getElementById('regularizacaoBradescoConferenciaV424');
 if(!base||document.getElementById('bradescoPilotoV438'))return;
 const panel=document.createElement('section');panel.id='bradescoPilotoV438';
 panel.style.cssText='margin:14px 0;padding:16px;border:1px solid #b9a5d5;border-radius:12px;background:#faf8fd';
 const h=document.createElement('h4');h.textContent='Piloto Bradesco — boleto 55994-01';panel.appendChild(h);
 const p=document.createElement('p');p.textContent='Consulta individual autenticada ao Bradesco para verificar situação, vencimento, valor e simulação de multa de 2% + juros de 5% ao mês. Somente leitura: não altera nem reemite boleto.';panel.appendChild(p);
 const b=document.createElement('button');b.type='button';b.className='btn roxo';b.textContent='Conferir 55994-01 no Bradesco';panel.appendChild(b);
 const result=document.createElement('pre');result.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px;font:13px/1.5 Segoe UI,Arial,sans-serif';result.setAttribute('aria-live','polite');panel.appendChild(result);
 b.onclick=async()=>{
  b.disabled=true;result.textContent='Consultando Bradesco...';
  try{
   if(typeof bradescoReqProducao!=='function')throw new Error('A função autenticada do portal não está disponível. Atualize a página.');
   const j=await bradescoReqProducao('conferir-piloto-55994-v435',{parcela:'01'});
   const t=j.titulo||{},s=j.simulacao||{};
   result.textContent=['Consulta concluída (sem alteração bancária)','Documento: 55994-01','Nosso Número: '+(t.nosso_numero||'—'),'Status no Bradesco: '+(t.status_banco||'—'),'Vencimento original no Bradesco: '+(t.vencimento_original_banco||'—'),'Data no boleto atualizado: '+(t.vencimento_boleto_atualizado||'—'),'Vencimento original no cadastro: '+(t.vencimento_original_local||'—'),'Valor nominal: R$ '+Number(t.valor_nominal_local||0).toFixed(2).replace('.',','),'Vencimento original confere: '+(j.vencimento_confere?'SIM':'NÃO — não autoriza transmissão'),'Elegibilidade preliminar: '+(j.elegivel_preliminar?'SIM':'NÃO'),'Atraso: '+(s.dias_atraso??'—')+' dia(s)','Multa simulada: R$ '+Number(s.multa_estimada||0).toFixed(2).replace('.',','),'Juros simulados: R$ '+Number(s.juros_estimados||0).toFixed(2).replace('.',','),'Total simulado (data original): '+(s.total_estimado==null?'indisponível':'R$ '+Number(s.total_estimado).toFixed(2).replace('.',',')),'Datas fornecidas pela API: '+JSON.stringify(j.diagnostico_datas_banco||{}),'Nenhuma instrução enviada ao banco.'].join('\n');
  }catch(e){result.textContent='Não foi possível concluir a conferência: '+String(e.message||e);}
  finally{b.disabled=false;}
 };
 base.insertAdjacentElement('afterend',panel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();
