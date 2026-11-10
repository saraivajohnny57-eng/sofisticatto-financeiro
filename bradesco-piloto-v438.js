/* Piloto Bradesco 56078-02 — somente consulta, sem PUT. */
(function(){
'use strict';
function montar(){
 const base=document.getElementById('regularizacaoBradescoConferenciaV424');
 if(!base||document.getElementById('bradescoPilotoV459'))return;
 const panel=document.createElement('section');
 panel.id='bradescoPilotoV459';
 panel.style.cssText='margin:14px 0;padding:16px;border:1px solid #b9a5d5;border-radius:12px;background:#faf8fd';
 const h=document.createElement('h4');h.textContent='Piloto Bradesco — boleto 56078-02';panel.appendChild(h);
 const p=document.createElement('p');
 p.textContent='Consulta autenticada do título 56078-02 (Nosso Número 62710000058) para validar status, vencimento original, emissão e dados dos encargos. Não altera o título.';
 panel.appendChild(p);
 const b=document.createElement('button');b.type='button';b.className='btn roxo';
 b.textContent='Executar diagnóstico único do boleto 56078-02';
 panel.appendChild(b);
 const result=document.createElement('pre');result.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px;font:13px/1.5 Segoe UI,Arial,sans-serif';
 result.setAttribute('aria-live','polite');panel.appendChild(result);
 b.onclick=async()=>{
  b.disabled=true;result.textContent='Consultando título 56078-02 no Bradesco...';
  try{
   if(typeof bradescoReqProducao!=='function')throw new Error('Autorização de integrações indisponível.');
   const j=await bradescoReqProducao('conferir-piloto-56078-v459',{});
   const d=j.diagnostico_unico||{};
   const ok=(d.verificacoes||[]).filter(x=>x.ok).length;
   const total=(d.verificacoes||[]).length;
   result.textContent=[
    'BRADESCO — DIAGNÓSTICO ÚNICO DO TÍTULO 56078-02',
    'Consulta autenticada: '+(j.ok?'CONCLUÍDA':'FALHOU'),
    'Status bancário: '+j.status_descricao+' (código '+j.status_codigo+')',
    'Verificações contratuais: '+ok+'/'+total,
    'Payload candidato: '+(d.estrutura_candidata_montada?'ESTRUTURA MONTADA':'BLOQUEADO'),
    'Valor original: R$ '+Number(j.valor_nominal||0).toFixed(2).replace('.',',')+
      ' | vencimento original: '+j.vencimento_original,
    'Encargos previstos: 5% ao mês + multa 2% (início: 1 dia)',
    'Hash do payload (sem dados pessoais): '+(d.hash_payload_candidato||'não gerado'),
    '',
    'IMPEDIMENTOS REAIS:',
    ...(d.pendencias?.length?d.pendencias.map(x=>'• '+x):['Nenhuma divergência de dados detectada']),
    '',
    'VALIDAÇÕES CONTRATUAIS PENDENTES:',
    ...(d.alertas||[]).map(x=>'• '+x),
    '',
    'RESULTADO: '+(d.conclusao||'SEM DIAGNÓSTICO'),
    'ALTERAÇÃO NO BRADESCO: NÃO EXECUTADA',
    'O envio só será liberado após validar integralmente o contrato e confirmar a manutenção controlada.'
   ].join('\n');
  }catch(e){result.textContent='Falha na conferência: '+String(e.message||e);}
  finally{b.disabled=false;}
 };
 base.insertAdjacentElement('afterend',panel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();
