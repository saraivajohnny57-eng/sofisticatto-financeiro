/* V490: importar XML da NF 51185 e prevalidar GNRE; não transmite. */
(function(){
const $=id=>document.getElementById(id),tag=(el,n)=>el?.getElementsByTagName(n)?.[0]?.textContent?.trim()||'';
function init(){
 const a=$('gnreDiagnosticoCard');if(!a||$('gnreV490'))return;
 const b=document.createElement('div');b.id='gnreV490';b.className='card';b.style.cssText='margin:12px 0;padding:14px;border:1px solid #b9a5d5;border-radius:12px';
 b.innerHTML='<strong>GNRE PA — primeira NF-e 51185</strong><p>Importe a XML autorizada; valor fiscal declarado: DIFAL R$ 24,91, FCP R$ 0,00. Conferência sem transmissão.</p>'+
 '<input id="g490xml" type="file" accept=".xml"><label>Vencimento fiscal <input id="g490v" type="date"></label> <label>Pagamento <input id="g490p" type="date"></label>'+
 '<label style="display:block"><input id="g490ok" type="checkbox"> Confirmo a obrigação DIFAL/PA e as datas fiscais</label>'+
 '<button class="buscar" id="g490go" type="button">Conferir primeira GNRE</button>'+
'<label style="display:block;padding:9px 0"><input type="checkbox" id="g491previous"> Confirmo que ainda NÃO existe guia desta NF-e emitida no portal nacional</label>'+
'<button class="buscar" id="g491emit" disabled type="button">Emitir GNRE real — R$ 24,91</button> '+
'<button class="buscar" id="g491consult" disabled type="button">Consultar resultado oficial</button> '+
'<button class="buscar" id="g492diag" disabled type="button">Diagnosticar falha (sem enviar)</button> '+
'<button class="buscar" id="g497lookup" disabled type="button">Consultar GNRE pela NF (não emite)</button> '+
'<button class="buscar" id="g501status" disabled type="button">Auditar primeira tentativa (sem enviar)</button> '+
'<button class="buscar" id="g504config" disabled type="button">Consultar regras PA/100102 (sem emitir)</button>'+
'<section id="g502retomada" style="display:none;padding:12px;margin-top:10px;border:1px solid #b78a4f;border-radius:10px">'+
'<strong>Retomada única da NF-e 51185 — R$ 24,91</strong>'+
'<p>A primeira tentativa terminou com resultado incerto. O Portal GNRE não localizou guia nas consultas realizadas, mas permanece risco residual de duplicidade.</p>'+
'<label style="display:block"><input id="g502confirmar" type="checkbox"> Confirmo que consultei o Portal GNRE com os dados corretos e autorizo UMA nova transmissão, ciente do risco residual de guia duplicada.</label>'+
'<button id="g502botao" class="buscar" disabled type="button">Autorizar uma retomada real — R$ 24,91</button></section>'+
'<pre id="g490out" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
 a.insertAdjacentElement('afterend',b);
 let payload=null,adminKey=null;
 const append=(t)=>{$('g490out').textContent+='\n'+t};
 const solicitar=async(modo,data={})=>{
  if(!adminKey)throw Error('Execute a conferência autenticada primeiro.');
  const r=await fetch('/api/integracoes?action=gnre-producao-real-51185',{method:'POST',
   headers:{'Content-Type':'application/json','x-integrations-admin-key':adminKey},
   body:JSON.stringify({...data,modo})});
  const j=await r.json();if(!r.ok&&!j.estado)throw Error([j.codigo,j.etapa,j.erro||j.aviso||'Falha na operação'].filter(Boolean).join(' — '));
  return j;
 };
 $('g502confirmar').onchange=()=>{
   $('g502botao').disabled=!$('g502confirmar').checked||!payload;
 };
 $('g502botao').onclick=async()=>{
   if(!payload||!$('g502confirmar').checked)return;
   if(window.prompt('Confirma UMA nova transmissão real com risco residual de duplicidade? Digite exatamente: AUTORIZO 51185')!=='AUTORIZO 51185')return;
   $('g502botao').disabled=true;$('g502confirmar').disabled=true;
   append('Executando UMA retomada real. Se houver falha, NÃO repetir.');
   try{
    const x=await solicitar('emitir_retomada_unica',{...payload,
      confirmacao:'EMITIR_PA_51185_24_91',
      semEmissaoAnterior:true,consultaPortalConfirmada:true,
      aceiteRiscoDuplicidade:'CIENTE_RISCO_DUPLICIDADE_GNRE_51185',
      confirmacaoFinal:'AUTORIZO_UMA_RETOMADA_REAL_51185'});
    append('RETORNO DA RETOMADA: '+JSON.stringify(x));
   }catch(err){append('Retorno não confirmado: '+String(err.message||err)+'. NÃO repetir.');}
   $('g491consult').disabled=false;
 };
 $('g491emit').onclick=async()=>{
  if(!payload||!$('g491previous').checked)return alert('Confirme que a GNRE não foi emitida no portal oficial.');
  if(!window.confirm('Emissão REAL e única de GNRE PA 100102 para NF 51185, R$ 24,91. Confirmar transmissão e obrigação de pagamento?'))return;
  $('g491emit').disabled=true;append('Transmitindo UMA guia em produção...');
  try{
   const r=await solicitar('emitir',{...payload,confirmacao:'EMITIR_PA_51185_24_91',semEmissaoAnterior:true});
   append('Retorno GNRE: '+JSON.stringify(r));
   $('g491consult').disabled=false;
  }catch(e){append('Emissão não confirmada: '+String(e.message||e)+'. NÃO REPETIR sem consultar.');$('g491consult').disabled=false;$('g492diag').disabled=false}
 };
 $('g504config').onclick=async()=>{
    const btn=$('g504config');btn.disabled=true;
    append('Consultando configuração oficial PA/100102, sem emissão...');
    try{const r=await solicitar('configuf_pa_100102');
      append('CONFIGURAÇÃO OFICIAL PA/100102:\n'+JSON.stringify(r,null,2));
    }catch(e){append('Consulta ConfigUF não concluída: '+String(e.message||e)+'. Nenhum envio de guia.')}
    finally{btn.disabled=false;}
 };
 $('g501status').onclick=async()=>{
   const bt=$('g501status');bt.disabled=true;
   try{
    const x=await solicitar('situacao_local');
    const t=x.tentativa_original||{};
    const lines=[
      'AUDITORIA LOCAL DA PRIMEIRA TENTATIVA — NF-e 51185',
      'Estado: '+String(t.estado||'sem reserva'),
      'Número de tentativas: '+String(t.tentativa||0),
      'Erro da transmissão: '+String(t.codigo_erro||'não registrado'),
      'Início (UTC): '+String(t.criado_em||'não registrado'),
      'Atualização (UTC): '+String(t.atualizado_em||'não registrado'),
      'Recibo de emissão armazenado: '+(t.recibo_armazenado?'SIM':'NÃO'),
      'Guias arquivadas localmente: '+x.quantidade_guias_locais,
      'Retomada já reservada: '+(x.segunda_tentativa_registrada?'SIM — '+x.segunda_tentativa_estado:'NÃO'),
      'Guias emitidas confirmadas localmente: '+x.guias_confirmadas_locais,
      'Consulta por NF retornou 701: erro de validação do retorno da UF (observado anteriormente)',
      'Nenhuma transmissão realizada nesta auditoria.',
      'Reenvio autorizado: NÃO.',
      String(x.orientacao||'')
    ];
    append(lines.join('\n'));
   }catch(e){append('Auditoria local indisponível: '+String(e.message||e)+'. NÃO reemitir.')}
   finally{bt.disabled=false}
 };
 $('g497lookup').onclick=async()=>{
  const b=$('g497lookup');b.disabled=true;
  append('Iniciando consulta oficial por chave da NF 51185, sem gerar guia...');
  try{
   const primeira=await solicitar('consulta_documento_iniciar');
   if(!primeira.ok||!primeira.recibo_consulta){
     append('Retorno da consulta por NF: '+JSON.stringify(primeira));
     if(primeira.codigo_recebimento==='102'){
      append('DIAGNÓSTICO GNRE 102: CNPJ titular do certificado A1 não habilitado para o serviço em PRODUÇÃO.');
      append('O certificado pertence ao mesmo CNPJ da NF? '+(primeira.certificado_mesmo_cnpj_emitente?'SIM':'NÃO — conferir CNPJ do transmissor autorizado'));
      append('A autorização local não equivale à autorização oficial. Consulte a habilitação do CNPJ do A1 no Portal GNRE. NÃO reemitir esta nota.');
      b.dataset.bloqueio102='true';
      $('g491emit').disabled=true;
     }
     return;
   }
   append('Consulta por NF recebida (recibo '+primeira.recibo_mascarado+'). Aguardando resultado oficial...');
   await new Promise(resolve=>setTimeout(resolve,32000));
   const segunda=await solicitar('consulta_documento_resultado',{reciboConsulta:primeira.recibo_consulta});
   append('RESULTADO DA CONSULTA POR NF (sem emitir):\n'+JSON.stringify(segunda,null,2));
   if(segunda.estado==='consulta_rejeitada_retorno_uf'){
     append('CONSULTA INVALIDADA: código 701 — Erro na validação do retorno da UF (Manual GNRE 2.17).');
     append('O processamento 402 da consulta não confirma emissão. A tentativa original permanece incerta e bloqueada. NÃO reemitir.');
   }
   append('A reserva da tentativa anterior permanece protegida. NAO clique em Emitir.');
  }catch(e){append('Consulta por documento não concluída: '+String(e.message||e)+'. NÃO reemitir.')}
  finally{b.disabled=b.dataset.bloqueio102==='true'}
 };
 $('g492diag').onclick=async()=>{
   const bt=$('g492diag');bt.disabled=true;
   try{
    if(!payload)throw Error('Conferência da NF-e necessária');
    const r=await solicitar('diagnosticar',payload);
    append('DIAGNOSTICO SEM TRANSMISSAO V492:\n'+(r.checks||[]).map(c=>
      (c.ok?'OK':'FALHA')+' — '+c.etapa+': '+c.detalhe).join('\n')+
      '\n'+(r.ok?'Pré-validação aprovada; não autoriza reenvio automático.':'Falhas identificadas; não repetir a emissão.'));
   }catch(e){append('Diagnóstico indisponível: '+String(e.message||e))}
   finally{bt.disabled=false}
 };
 $('g491consult').onclick=async()=>{
  $('g491consult').disabled=true;
  try{
   const r=await solicitar('consultar');
   append('Consulta oficial:\n'+JSON.stringify(r,null,2));
   if(r.codigo_processamento==='403'){
     append('LOTE PROCESSADO COM PENDÊNCIAS (403): confira detalhe_individual.motivos_rejeicao e situacao_individual acima. A guia ainda não está confirmada. NÃO retransmitir.');
   }
   if(r.pdf_disponivel&&r.arquivo_id){
    const p=await fetch('/api/integracoes?action=gnre-arquivo-guias&id='+encodeURIComponent(r.arquivo_id),{
      headers:{'x-integrations-admin-key':adminKey}});
    if(!p.ok)throw Error('PDF oficial ainda indisponível');
    const url=URL.createObjectURL(await p.blob());window.open(url,'_blank','noopener,noreferrer');
    setTimeout(()=>URL.revokeObjectURL(url),60000);
   }
  }catch(e){append('Consulta não concluída: '+String(e.message||e))}
  finally{$('g491consult').disabled=false}
 };
 $('g490go').onclick=async()=>{
  const btn=$('g490go'),out=$('g490out');btn.disabled=true;out.textContent='Conferindo...';
  try{
   const file=$('g490xml').files?.[0];if(!file||file.size>200000)throw Error('Selecione XML válida da NF-e 51185');
   const x=new DOMParser().parseFromString(await file.text(),'application/xml');
   if(x.getElementsByTagName('parsererror').length)throw Error('XML inválida');
   const nfe=x.getElementsByTagName('NFe')[0],ide=nfe?.getElementsByTagName('ide')[0],emit=nfe?.getElementsByTagName('emit')[0],
    dest=nfe?.getElementsByTagName('dest')[0],inf=nfe?.getElementsByTagName('infNFe')[0],
    prot=x.getElementsByTagName('infProt')[0],total=nfe?.getElementsByTagName('ICMSTot')[0],
    ee=emit?.getElementsByTagName('enderEmit')[0],dd=dest?.getElementsByTagName('enderDest')[0];
   if(!ide||!inf||!prot||!total||!ee||!dd)throw Error('XML incompleta');
   const chave=String(inf.getAttribute('Id')||'').replace(/^NFe/,'');
   if(chave!=='52261105451985000195550010000511851000590032'||tag(total,'vNF')!=='355.49'||tag(total,'vICMSUFDest')!=='24.91'||tag(total,'vFCP')!=='0.00')throw Error('Chave ou valores fiscais divergem');
   if(!$('g490ok').checked||!$('g490v').value||!$('g490p').value)throw Error('Confirme obrigação e datas fiscais');
   const nf={chave,numero:tag(ide,'nNF'),cnpjEmitente:tag(emit,'CNPJ'),razaoSocialEmitente:tag(emit,'xNome'),
    enderecoEmitente:(tag(ee,'xLgr')+' '+tag(ee,'nro')).trim().slice(0,60),
    municipioEmitente:tag(ee,'cMun'),cepEmitente:tag(ee,'CEP'),ufOrigem:tag(ee,'UF'),ufDestino:tag(dd,'UF'),
    valorDifal:tag(total,'vICMSUFDest'),valorFcp:tag(total,'vFCP'),consumidorFinal:tag(ide,'indFinal'),
    indIeDest:tag(dest,'indIEDest'),ambienteNfe:tag(ide,'tpAmb'),statusAutorizacao:tag(prot,'cStat'),chaveProtocolo:tag(prot,'chNFe')};
   if(typeof obterChaveIntegracoesCotacao!=='function')throw Error('Acesso administrativo indisponível');
   const admin=await obterChaveIntegracoesCotacao();if(!admin)throw Error('Autorização administrativa necessária');
   const r=await fetch('/api/integracoes?action=gnre-piloto-51185-preflight',{method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':admin},
    body:JSON.stringify({nfe:nf,fiscal:{vencimento:$('g490v').value,pagamento:$('g490p').value,obrigacaoConfirmada:true,vencimentoConfirmado:true}})});
   const z=await r.json();if(!r.ok||!z.ok)throw Error(z.erro||'Conferência indisponível');
   adminKey=admin;
   $('g492diag').disabled=false;
   $('g497lookup').disabled=false;
   $('g501status').disabled=false;
   $('g504config').disabled=false;
   payload={nfe:nf,fiscal:{vencimento:$('g490v').value,pagamento:$('g490p').value,obrigacaoConfirmada:true,vencimentoConfirmado:true}};
   const bloqueios=(z.pendencias||[]).filter(s=>!String(s).includes('Conferir no portal nacional'));
   $('g491emit').disabled=!(z.lote_preparado&&z.arquivos_locais===0&&!z.reserva_existente&&z.certificado_cadastrado&&bloqueios.length===0);
   $('g491consult').disabled=false;
   $('g502retomada').style.display=z.retomada_elegivel&&z.arquivos_locais===0&&z.certificado_cadastrado&&z.lote_preparado?'block':'none';
   $('g502confirmar').checked=false;$('g502confirmar').disabled=false;$('g502botao').disabled=true;
   out.textContent=['GNRE PA/100102 — NF-e 51185','DIFAL: R$ 24,91 | FCP: R$ 0,00','Estimativa da cotação: R$ 31,99 (não usada para emitir)',
    'XML do lote preparado: '+(z.lote_preparado?'SIM':'NÃO'),'Guias locais: '+z.arquivos_locais,
    'Tentativa original: '+(z.reserva_existente?'SIM — '+z.reserva_estado:'NÃO'),
    'Retomada única: '+(z.retomada_existente?'JÁ UTILIZADA — '+z.retomada_estado:(z.retomada_elegivel?'Disponível mediante confirmação do risco':'Não liberada')),
    'Certificado A1 cadastrado: '+(z.certificado_cadastrado?'SIM':'NÃO'),'Pendências: '+z.pendencias.join('; '),
    z.reserva_existente?'Emissão anterior com resultado incerto; NÃO reemitir.':'Nenhuma emissão confirmada localmente; não comprova ausência de guia no serviço oficial.'].join('\n');
  }catch(e){out.textContent='Conferência não concluída: '+String(e.message||e);}
  finally{btn.disabled=false;}
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
