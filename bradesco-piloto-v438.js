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
 b.textContent='Conferir título 56078-02 no Bradesco (sem alterar)';
 panel.appendChild(b);
 const result=document.createElement('pre');result.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px;font:13px/1.5 Segoe UI,Arial,sans-serif';
 result.setAttribute('aria-live','polite');panel.appendChild(result);
 b.onclick=async()=>{
  b.disabled=true;result.textContent='Consultando título 56078-02 no Bradesco...';
  try{
   if(typeof bradescoReqProducao!=='function')throw new Error('Autorização de integrações indisponível.');
   const j=await bradescoReqProducao('conferir-piloto-56078-v459',{});
   result.textContent=[
    'BRADESCO — PILOTO 56078-02',
    'Consulta autenticada: '+(j.ok?'CONCLUÍDA':'NÃO CONFIRMADA'),
    'Nosso Número: '+j.nosso_numero,
    'Vencimento original: '+j.vencimento_original,
    'Valor nominal: R$ '+Number(j.valor_nominal||0).toFixed(2).replace('.',','),
    'Status bancário: '+j.status_descricao+' (código '+j.status_codigo+')',
    'Status preliminarmente compatível: '+(j.situacao_apta?'SIM':'NÃO'),
    'Seu Número, emissão, espécie, vencimento e valor confirmados: '+
       (Object.values(j.verificacoes||{}).every(Boolean)?'SIM':'NÃO'),
    'Juros: 5% ao mês / Multa: 2% / Início: 1 dia após vencimento',
    'Encargos já presentes: '+(j.encargos_ja_presentes?'SIM':'NÃO'),
    'Campos mapeados do contrato: '+(j.auditoria_payload?.campos_mapeados??'não informado'),
    'Campos ausentes da resposta: '+((j.auditoria_payload?.campos_ausentes||[]).join(', ')||'nenhum dentre os mapeados'),
    'Pendências: '+(j.pendencias||[]).join('; '),
    'PUT liberado: NÃO',
    'Alteração bancária: NÃO TRANSMITIDA'
   ].join('\n');
  }catch(e){result.textContent='Falha na conferência: '+String(e.message||e);}
  finally{b.disabled=false;}
 };
 base.insertAdjacentElement('afterend',panel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();
