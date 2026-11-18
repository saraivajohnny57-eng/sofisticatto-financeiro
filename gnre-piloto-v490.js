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
'<button class="buscar" id="g497lookup" disabled type="button">Consultar GNRE pela NF (não emite)</button>'+
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
   append('RESULTADO DA CONSULTA POR NF (sem emitir): '+JSON.stringify(segunda));
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
   append('Consulta oficial: '+JSON.stringify(r));
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
   payload={nfe:nf,fiscal:{vencimento:$('g490v').value,pagamento:$('g490p').value,obrigacaoConfirmada:true,vencimentoConfirmado:true}};
   const bloqueios=(z.pendencias||[]).filter(s=>!String(s).includes('Conferir no portal nacional'));
   $('g491emit').disabled=!(z.lote_preparado&&z.arquivos_locais===0&&!z.reserva_existente&&z.certificado_cadastrado&&bloqueios.length===0);
   $('g491consult').disabled=false;
   out.textContent=['GNRE PA/100102 — NF-e 51185','DIFAL: R$ 24,91 | FCP: R$ 0,00','Estimativa da cotação: R$ 31,99 (não usada para emitir)',
    'XML do lote preparado: '+(z.lote_preparado?'SIM':'NÃO'),'Guias locais: '+z.arquivos_locais,
    'Tentativa de emissão reservada: '+(z.reserva_existente?'SIM — '+z.reserva_estado+' (NÃO reemitir)':'NÃO'),
    'Certificado A1 cadastrado: '+(z.certificado_cadastrado?'SIM':'NÃO'),'Pendências: '+z.pendencias.join('; '),
    'Nenhuma guia transmitida ou emitida.'].join('\n');
  }catch(e){out.textContent='Conferência não concluída: '+String(e.message||e);}
  finally{btn.disabled=false;}
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
