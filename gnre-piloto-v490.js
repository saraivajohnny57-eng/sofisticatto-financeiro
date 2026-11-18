/* V490: importar XML da NF 51185 e prevalidar GNRE; não transmite. */
(function(){
const $=id=>document.getElementById(id),tag=(el,n)=>el?.getElementsByTagName(n)?.[0]?.textContent?.trim()||'';
function init(){
 const a=$('gnreDiagnosticoCard');if(!a||$('gnreV490'))return;
 const b=document.createElement('div');b.id='gnreV490';b.className='card';b.style.cssText='margin:12px 0;padding:14px;border:1px solid #b9a5d5;border-radius:12px';
 b.innerHTML='<strong>GNRE PA — primeira NF-e 51185</strong><p>Importe a XML autorizada; valor fiscal declarado: DIFAL R$ 24,91, FCP R$ 0,00. Conferência sem transmissão.</p>'+
 '<input id="g490xml" type="file" accept=".xml"><label>Vencimento fiscal <input id="g490v" type="date"></label> <label>Pagamento <input id="g490p" type="date"></label>'+
 '<label style="display:block"><input id="g490ok" type="checkbox"> Confirmo a obrigação DIFAL/PA e as datas fiscais</label>'+
 '<button class="buscar" id="g490go" type="button">Conferir primeira GNRE</button><pre id="g490out" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
 a.insertAdjacentElement('afterend',b);
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
   out.textContent=['GNRE PA/100102 — NF-e 51185','DIFAL: R$ 24,91 | FCP: R$ 0,00','Estimativa da cotação: R$ 31,99 (não usada para emitir)',
    'XML do lote preparado: '+(z.lote_preparado?'SIM':'NÃO'),'Tentativas locais: '+z.arquivos_locais,
    'Certificado A1 cadastrado: '+(z.certificado_cadastrado?'SIM':'NÃO'),'Pendências: '+z.pendencias.join('; '),
    'Nenhuma guia transmitida ou emitida.'].join('\n');
  }catch(e){out.textContent='Conferência não concluída: '+String(e.message||e);}
  finally{btn.disabled=false;}
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
