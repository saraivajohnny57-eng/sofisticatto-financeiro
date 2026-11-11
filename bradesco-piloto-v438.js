/* Piloto Bradesco 56078-02 — consulta e execução única controlada. */
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
 p.textContent='Nosso Número 62710000058. O diagnóstico consulta o banco sem alterar; a execução exige confirmação explícita e permite apenas uma tentativa no servidor.';
 panel.appendChild(p);
 const b=document.createElement('button');b.type='button';b.className='btn roxo';
 b.textContent='Executar diagnóstico único do boleto 56078-02';
 panel.appendChild(b);
 const executar=document.createElement('button');
 executar.type='button';executar.className='btn roxo';
 executar.textContent='Executar UMA alteração real — juros 5% + multa 2%';
 executar.style.cssText='margin-left:8px;background:#8b2543';
 panel.appendChild(executar);
 const consultarResultado=document.createElement('button');
 consultarResultado.type='button';consultarResultado.className='btn roxo';
 consultarResultado.textContent='Consultar resultado bancário sem reenviar';
 consultarResultado.style.marginLeft='8px';
 panel.appendChild(consultarResultado);
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
    'Contrato JSON (tipagem e campos): '+(d.validacao_estrutural?.aprovada?'VALIDADO LOCALMENTE':'NÃO VALIDADO'),
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
 executar.onclick=async()=>{
  const mensagem='ATENÇÃO: ação REAL no Bradesco!\\nBoleto 56078-02, Nosso Número 62710000058.\\nJuros 5% ao mês e multa 2%.\\nO sistema tentará executar uma única alteração, sem repetição automática. Confirma?';
  if(!window.confirm(mensagem.replace(/\\n/g,'\n')))return;
  executar.disabled=true;
  b.disabled=true;
  result.textContent='Registrando tentativa única e consultando o título antes da transmissão...';
  try{
   const j=await bradescoReqProducao('executar-manutencao-56078-wf99571',
    {autorizacao:'AUTORIZO-56078-02-JUROS5-MULTA2'});
   result.textContent=[
    'BRADESCO — EXECUÇÃO CONTROLADA 56078-02',
    'Transmissão efetuada: '+(j.transmitido?'SIM':j.transmissao_incerta?'RESULTADO INCERTO':'NÃO CONFIRMADA'),
    'Estado: '+(j.estado||'verificar no banco'),
    'Código de juros: '+(j.codigo_juros??'aguardando'),
    'Código de multa: '+(j.codigo_multa??'aguardando'),
    'Taxa de juros: '+(j.taxa_juros??'aguardando'),
    'Taxa de multa: '+(j.taxa_multa??'aguardando'),
    'Dias para juros: '+(j.dias_juros??'aguardando'),
    'Dias para multa: '+(j.dias_multa??'aguardando'),
    'Vencimento preservado: '+(j.vencimento_preservado===true?'SIM':'não confirmado'),
    'Valor nominal preservado: '+(j.valor_nominal_preservado===true?'SIM':'não confirmado'),
    'Aviso: '+(j.aviso||'Consultar o banco antes de qualquer outra tentativa.'),
    'REENVIO AUTOMÁTICO: PROIBIDO'
   ].join('\n');
  }catch(e){
   const info=e.bradescoResponse||{};
   const erros=Array.isArray(info.erros)?info.erros.filter(x=>typeof x==='string').slice(0,20):[];
   result.textContent='Resultado da execução: '+String(info.retorno||info.aviso||info.erro||e.message||e)+
     (erros.length?'\nValidações não atendidas:\n• '+erros.join('\n• '):'')+
     (info.transmitido===false&&!info.sem_reenvio
        ?'\nO banco NÃO recebeu alteração; confira as pendências antes de tentar novamente.'
        :'\nNão repetir o PUT. Consulte o estado bancário antes de qualquer ação.');
   if(info.transmitido===false&&!info.sem_reenvio) {
     executar.disabled=false;
     b.disabled=false;
   }
  }
  // Nunca reabilitar o botão após qualquer tentativa. O servidor também bloqueia a duplicidade.
 };
 consultarResultado.onclick=async()=>{
  consultarResultado.disabled=true;
  result.textContent='Consultando o Bradesco sem transmitir alteração...';
  try{
   const j=await bradescoReqProducao('consultar-manutencao-56078-wf99571',{});
   result.textContent=[
    'CONCILIAÇÃO DO BOLETO 56078-02 — SOMENTE CONSULTA',
    'Estado: '+(j.estado||'não informado'),
    'Juros: código '+(j.codigo_juros??'-')+' | valor percentual retornado '+(j.taxa_juros??'-'),
    'Multa: código '+(j.codigo_multa??'-')+' | valor percentual retornado '+(j.taxa_multa??'-'),
    'Dias juros: '+(j.dias_juros??'-')+' | dias multa: '+(j.dias_multa??'-'),
    'Confirmação completa: '+(j.confirmado?'SIM':'NÃO'),
    'Aviso: '+(j.aviso||''),
    'NENHUM NOVO PUT ENVIADO'
   ].join('\n');
  }catch(e){result.textContent='Não foi possível conciliar: '+String(e.bradescoResponse?.aviso||e.message||e)+'\nNão reenviar o PUT.'}
  finally{consultarResultado.disabled=false;}
 };
 base.insertAdjacentElement('afterend',panel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();
