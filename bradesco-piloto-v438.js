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
 const b=document.createElement('button');b.type='button';b.className='btn roxo';b.textContent='Executar conferência única 55994-01';panel.appendChild(b);
 const result=document.createElement('pre');result.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px;font:13px/1.5 Segoe UI,Arial,sans-serif';result.setAttribute('aria-live','polite');panel.appendChild(result);
 b.onclick=async()=>{
  b.disabled=true;result.textContent='Consultando Bradesco...';
  try{
   if(typeof bradescoReqProducao!=='function')throw new Error('A função autenticada do portal não está disponível. Atualize a página.');
   const j=await bradescoReqProducao('conferir-piloto-55994-v435',{parcela:'01'});
   const t=j.titulo||{},s=j.simulacao||{};
   const f=j.conferencia_unica_v446||{};
   const format=v=>'R$ '+Number(v||0).toFixed(2).replace('.',',');
   const faltantes=(f.pendencias||[]).join('; ');
   result.textContent=[
    'CONFERÊNCIA ÚNICA — BOLETO 55994-01',
    'Consulta autenticada: CONCLUÍDA',
    'Nosso Número: '+(t.nosso_numero||'—'),
    'Status bancário: '+(t.status_banco||'—'),
    'Vencimento original no Bradesco: '+(t.vencimento_original_banco||'—'),
    'Vencimento original no cadastro: '+(t.vencimento_original_local||'—'),
    'Data da segunda via: '+(t.vencimento_boleto_atualizado||'—'),
    'Valor nominal: '+format(t.valor_nominal_local),
    'Elegibilidade preliminar: '+(j.elegivel_preliminar?'SIM':'NÃO'),
    'Identificadores para alteração: '+(f.identificadores_ok?'LOCALIZADOS':'INCOMPLETOS'),
    'Campos do pagador localizados: '+Object.entries(f.pagador||{}).filter(([,v])=>v).map(([k])=>k).join(', '),
    'Campos do título com fonte candidata (sujeitos à validação): '+Object.entries(f.titulo||{}).filter(([,v])=>v).map(([k])=>k).join(', '),
    'Simulação local: multa '+format(s.multa_estimada)+' + juros '+format(s.juros_estimados)+' = '+format(s.total_estimado),
    'Dados bancários originais confirmados: '+Object.entries(f.origem_confirmada||{}).filter(([k,v])=>k.endsWith('Banco')&&v).map(([k])=>k).join(', '),
    'BLOQUEIOS DO CONTRATO PUT: '+(f.impedimentos_contratuais||[]).join('; '),
    'PENDÊNCIAS: '+(faltantes||'Nenhuma identificada'),
    'ALTERAÇÃO BANCÁRIA: NÃO TRANSMITIDA — contrato e escala dos encargos ainda não homologados.'
   ].join('\n');
  }catch(e){result.textContent='Não foi possível concluir a conferência: '+String(e.message||e);}
  finally{b.disabled=false;}
 };
 base.insertAdjacentElement('afterend',panel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();
