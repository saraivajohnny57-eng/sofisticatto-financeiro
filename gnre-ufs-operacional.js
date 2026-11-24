/* GNRE V534 - Painel de MG e auditoria por UF. Nao emite guias. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const UF='AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const RECEITAS=['100099','100102','100129'];
const tag=(el,n)=>el?.getElementsByTagName(n)?.[0]?.textContent?.trim()||'';
let chave=null,parar=false,ocupado=false;
async function autorizar(){
 if(!chave&&typeof obterChaveIntegracoesCotacao==='function')chave=await obterChaveIntegracoesCotacao();
 if(!chave)throw Error('Autorizacao administrativa necessaria.');
 return chave;
}
async function chamar(acao,dados,arquivo=false){
 const cab={'x-integrations-admin-key':await autorizar()};
 if(dados)cab['Content-Type']='application/json';
 const resp=await fetch('/api/integracoes?action='+acao,{
  method:arquivo?'GET':'POST',cache:'no-store',headers:cab,
  body:arquivo?undefined:JSON.stringify(dados||{})
 });
 if(resp.status===401){chave=null;throw Error('Autorizacao expirada; reautorize no portal.');}
 if(arquivo){
  if(!resp.ok)throw Error('PDF indisponivel: HTTP '+resp.status);
  const blob=await resp.blob();if(blob.type!=='application/pdf'||blob.size<500)throw Error('PDF invalido');
  return blob;
 }
 return {status:resp.status,dados:await resp.json().catch(()=>({ok:false,erro:'Resposta inesperada'}))};
}
function criar(){
 const piloto=$('gnreV490');
 if(!piloto||$('g534painel'))return;
 const p=document.createElement('section');p.id='g534painel';p.className='card';
 p.style.cssText='margin:12px 0;padding:18px;border:1px solid #bdaee0;border-radius:14px;background:#fff';
 p.innerHTML=[
 '<h3 style="color:#4a3c80;margin:0 0 6px">GNRE — Preparar MG e analisar estados</h3>',
 '<p style="margin:0 0 13px;color:#605c76">Emissao somente apos validacao fiscal. As consultas deste painel nao emitem guias.</p>',
 '<section style="background:#f8f6fc;padding:13px;border:1px solid #e1d9ee;border-radius:10px">',
 '<strong>Minas Gerais — preparar GNRE pela NF-e</strong>',
 '<p style="font-size:13px">DIFAL 100102; FCP 100129 em guia separada quando devido.</p>',
 '<label>XML da NF-e autorizada para MG <input type="file" id="g534xml" accept=".xml,text/xml" style="display:block;width:100%"></label>',
 '<div style="display:flex;gap:12px;flex-wrap:wrap;margin:9px 0">',
 '<label style="flex:1;min-width:160px">Vencimento<input id="g534v" type="date" style="display:block;width:100%"></label>',
 '<label style="flex:1;min-width:160px">Pagamento<input id="g534p" type="date" style="display:block;width:100%"></label>',
 '<label style="flex:1;min-width:180px">Convenio (quando aplicavel)<input id="g534conv" maxlength="30" placeholder="Opcional quando S" style="display:block;width:100%"></label></div>',
 '<label style="display:block;margin:7px 0"><input id="g534confirm" type="checkbox"> Confirmo obrigacao DIFAL/MG e vencimento legal</label>',
 '<label style="display:block;margin:7px 0"><input id="g534atraso" type="checkbox"> Estou ciente dos encargos de vencimento anterior</label>',
 '<details id="g534fcparea" style="margin:9px 0;padding:11px;border:1px solid #dcd3e9;border-radius:9px">',
 '<summary style="cursor:pointer;font-weight:600;color:#504486">FCP / MG 100129 — preencher somente quando NF tiver FCP</summary>',
 '<p style="font-size:13px">Conforme ConfigUF oficial: convenio O = obrigatorio; referencia S = exigida; nao informar documento de origem nem detalhamento. Conferir com a contabilidade.</p>',
 '<div style="display:flex;gap:10px;flex-wrap:wrap">',
 '<label style="flex:1;min-width:160px">Vencimento FCP<input id="g534vfcp" type="date" style="display:block;width:100%"></label>',
 '<label style="flex:1;min-width:160px">Pagamento FCP<input id="g534pfcp" type="date" style="display:block;width:100%"></label>',
 '<label style="flex:1;min-width:160px">Convenio/protocolo FCP<input id="g534convfcp" maxlength="30" placeholder="Obrigatorio: dado oficial" style="display:block;width:100%"></label></div>',
 '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">',
 '<label style="flex:1;min-width:160px">Mes/ano referencia FCP<input type="month" id="g534refmes" style="display:block;width:100%"></label>',
 '<label style="flex:1;min-width:160px">Codigo do periodo FCP<select id="g534refperiodo" style="display:block;width:100%"><option value="">Selecionar conforme fiscal</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label></div>',
 '<label style="display:block;margin-top:8px"><input type="checkbox" id="g534fcpconfirm"> Confirmo convenio, periodo de referencia e vencimento do FCP com o fiscal</label>',
 '</details>',
 '<button class="buscar" id="g534preparar" type="button">Conferir XML e preparar MG (sem emitir)</button>',
 '<div id="g534resumo" role="status" style="white-space:pre-wrap;font-size:13px;margin-top:9px;line-height:1.5"></div>',
 '<details><summary>Retorno tecnico MG</summary><pre id="g534tecnico" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:330px;overflow:auto"></pre></details>',
 '</section>',
 '<section style="margin-top:12px;padding:13px;border:1px solid #e1d9ee;border-radius:10px">',
 '<strong>Analisar todas as 27 UFs em PDF detalhado</strong>',
 '<p style="font-size:13px;margin:7px 0">Consultas ConfigUF independentes; campos obrigatorios, documentos, codigos, avisos e inventario de retornos oficiais.</p>',
 '<div style="display:flex;gap:14px;flex-wrap:wrap;margin:8px 0">',
 '<label><input type="checkbox" id="g534r099" checked> 100099</label>',
 '<label><input type="checkbox" id="g534r102" checked> 100102</label>',
 '<label><input type="checkbox" id="g534r129" checked> 100129</label></div>',
 '<div style="display:flex;gap:8px;flex-wrap:wrap">',
 '<button class="buscar" id="g534scan" type="button">Analisar 27 UFs e gerar PDF</button>',
 '<button class="buscar" id="g534pdf" type="button">Baixar PDF das consultas salvas</button>',
 '<button class="buscar" id="g534stop" type="button" disabled>Interromper</button></div>',
 '<progress id="g534progress" max="81" value="0" style="width:100%;display:block;margin:12px 0 7px"></progress>',
 '<div id="g534estado" role="status" style="font-size:13px">Consulta ainda nao iniciada; nenhum documento fiscal sera transmitido.</div>',
 '<details><summary>Historico da analise</summary><pre id="g534log" style="max-height:340px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>',
 '</section>'
 ].join('');
 piloto.insertAdjacentElement('beforebegin',p);
 $('g534p').value=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
 // Recolher a area de testes PA preservando os controles e seus eventos.
 const area=document.createElement('details');
 area.style.cssText='margin:10px 0;padding:10px;border:1px solid #ddd6eb;border-radius:9px';
 area.innerHTML='<summary>Ferramentas tecnicas do piloto PA/51185</summary>';
 piloto.appendChild(area);
 function mover(id){
  const el=$(id);if(!el)return;
  const label=el.closest('label');
  const node=label&&label.parentElement===piloto?label:el;
  if(node.parentElement!==area)area.appendChild(node);
 }
 for(const id of ['g490xml','g490v','g490p','g490ok','g490go','g491previous','g491emit',
 'g491consult','g523auditoria','g492diag','g497lookup','g501status','g504config','g490out'])mover(id);
 const teste=$('g528emit')?.closest('section');
 if(teste)area.appendChild(teste);
 const reserva=$('g502retomada');if(reserva)area.appendChild(reserva);
 const titulo=piloto.querySelector('strong');if(titulo)titulo.textContent='GNRE PA — guia paga e reimpressao';
 const texto=piloto.querySelector('p');if(texto)texto.textContent='A guia oficial 51185 esta arquivada; o piloto antigo fica nas ferramentas tecnicas.';
 $('g534preparar').onclick=prepararMg;
 $('g534scan').onclick=analisarTodas;
 $('g534stop').onclick=()=>{parar=true;$('g534estado').textContent='Interrompendo apos a consulta atual.'};
 $('g534pdf').onclick=baixarPdf;
}
async function prepararMg(){
 const b=$('g534preparar'),out=$('g534resumo'),f=$('g534xml').files?.[0];
 if(!f){out.textContent='Escolha XML da NF-e MG autorizada.';return}
 if(f.size>2000000||f.size<500){out.textContent='Tamanho do XML fora do limite.';return}
 if(!$('g534v').value||!$('g534p').value){out.textContent='Preencha as duas datas legais.';return}
 b.disabled=true;out.textContent='Conferindo a NF-e e a ConfigUF MG sem emitir...';
 try{
  const xml=await f.text();if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DTD/XML inseguro.');
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('XML nao valido.');
  const root=doc.documentElement,ide=root.getElementsByTagName('ide')[0],emit=root.getElementsByTagName('emit')[0],
   dest=root.getElementsByTagName('dest')[0],tot=root.getElementsByTagName('ICMSTot')[0],
   prot=root.getElementsByTagName('infProt')[0],inf=root.getElementsByTagName('infNFe')[0],
   end=emit?.getElementsByTagName('enderEmit')[0];
  if(!ide||!emit||!dest||!prot||!inf)throw Error('Arquivo sem NF-e completa e protocolo de autorizacao.');
  const nfe={chave:String(inf.getAttribute('Id')||'').replace(/^NFe/,''),
   dataEmissao:tag(ide,'dhEmi')||tag(ide,'dEmi'),
   numero:tag(ide,'nNF'),cnpjEmitente:tag(emit,'CNPJ'),
   chaveProtocolo:tag(prot,'chNFe'),statusAutorizacao:tag(prot,'cStat'),
   ambienteNfe:tag(ide,'tpAmb'),ufOrigem:tag(end,'UF'),
   ufDestino:tag(dest.getElementsByTagName('enderDest')[0],'UF'),
   consumidorFinal:tag(ide,'indFinal'),indIeDest:tag(dest,'indIEDest'),
   valorDifal:tag(tot,'vICMSUFDest')||'0.00',valorFcp:tag(tot,'vFCPUFDest')||'0.00',
   razaoSocialEmitente:tag(emit,'xNome'),municipioEmitente:tag(end,'cMun'),
   cepEmitente:tag(end,'CEP'),enderecoEmitente:[tag(end,'xLgr'),tag(end,'nro')].filter(Boolean).join(' ').slice(0,60)};
  const {status,dados}=await chamar('gnre-preenvio-mg',{nfe,fiscal:{
   vencimento:$('g534v').value,pagamento:$('g534p').value,convenio:$('g534conv').value.trim(),
   obrigacaoConfirmada:$('g534confirm').checked,vencimentoConfirmado:$('g534confirm').checked,
   atrasoCiente:$('g534atraso').checked,
   vencimentoFcp:$('g534vfcp').value,pagamentoFcp:$('g534pfcp').value,
   convenioFcp:$('g534convfcp').value.trim(),
   referenciaFcp:($('g534refmes').value&&$('g534refperiodo').value!=='')?{
     periodo:$('g534refperiodo').value,mes:$('g534refmes').value.slice(5,7),
     ano:$('g534refmes').value.slice(0,4)
   }:null,
   vencimentoFcpConfirmado:$('g534fcpconfirm').checked,
   convenioFcpConfirmado:$('g534fcpconfirm').checked,
   referenciaFcpConfirmada:$('g534fcpconfirm').checked}});
  $('g534tecnico').textContent=JSON.stringify(dados,null,2);
  if(status!==200||!dados.ok)throw Error(dados.erro||'Falha ao analisar a NF-e.');
  out.textContent='NF-e '+(dados.numero_nfe||'?')+' — MG / DIFAL 100102 + FCP 100129 quando devido'+
   '\nDIFAL: R$ '+(dados.valor_difal||'?')+'  |  FCP: R$ '+(dados.valor_fcp||'?')+
   '\nCotacao de tributos somada (sem encargos): R$ '+(dados.cotacao_principal_somado||'?')+
   '\nGuias offline: '+(dados.guias_preparadas||0)+' de '+(dados.guias_requeridas||'?')+
   ' | Lote completo: '+(dados.lote_xml_offline_preparado?'PREPARADO':'PENDENTE')+
   '\nPendencias DIFAL: '+(dados.pendencias_difal?.join('; ')||'Nenhuma na conferencia preliminar')+
   '\nPendencias FCP: '+(dados.pendencias_fcp?.join('; ')||'Nenhuma')+
   '\nObservacoes: '+(dados.avisos?.join('; ')||'-')+
   '\nNao houve emissao real. A primeira guia MG exige validacao final do XML.';
 }catch(e){out.textContent='Falha na conferencia: '+String(e.message||e).slice(0,280)+' (nenhuma guia emitida)';}
 finally{b.disabled=false;}
}
async function baixarPdf(){
 const b=$('g534pdf');b.disabled=true;
 try{
  $('g534estado').textContent='Gerando PDF com as consultas oficiais arquivadas...';
  const blob=await chamar('gnre-relatorio-ufs',null,true),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Sofisticatto-GNRE-Analise-27-UFs.pdf';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),120000);
  $('g534estado').textContent='PDF pronto. Ausencias de consulta aparecem explicitamente como pendencias.';
 }catch(e){$('g534estado').textContent='PDF indisponivel: '+String(e.message||e).slice(0,250);}
 finally{b.disabled=false;}
}
async function analisarTodas(){
 if(ocupado)return;
 const selecionadas=RECEITAS.filter(x=>$('g534r'+x.slice(-3)).checked);
 if(!selecionadas.length){alert('Selecione alguma receita.');return}
 const total=UF.length*selecionadas.length;
 if(!confirm('Consultar '+total+' combinacoes UF/receita em sequencia, sem emitir nenhuma GNRE?'))return;
 ocupado=true;parar=false;let feitos=0,ok=0,erros=0;
 const b=$('g534scan'),stop=$('g534stop'),barra=$('g534progress'),est=$('g534estado'),log=$('g534log');
 b.disabled=true;stop.disabled=false;barra.max=total;barra.value=0;log.textContent='';
 try{
  await autorizar();
  loop:for(const uf of UF)for(const receita of selecionadas){
   if(parar)break loop;
   est.textContent='Consultando '+uf+'/'+receita+' | '+feitos+'/'+total+' | confirmadas '+ok+' | pendencias '+erros;
   try{
    const {status,dados}=await chamar('gnre-config-multiuf',{uf,receita});
    const correto=status===200&&dados.ok===true&&dados.auditoria_salva===true;
    if(correto)ok++;else erros++;
    log.textContent+=uf+'/'+receita+' - '+(correto?'OK':'NAO VALIDADA')+' | HTTP '+status+
     ' | GNRE '+(dados.retorno?.codigo_situacao||'-')+(dados.arquivo_id?' | arquivo '+dados.arquivo_id:'')+'\n';
   }catch(e){
    erros++;log.textContent+=uf+'/'+receita+' - ERRO '+String(e.message||e).slice(0,120)+'\n';
    if(/Autorizacao expirada/.test(String(e.message||e))){parar=true;break loop;}
   }
   feitos++;barra.value=feitos;log.scrollTop=log.scrollHeight;
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  est.textContent=(parar?'Analise interrompida':'Analise concluida')+
   ': '+feitos+'/'+total+' consultadas, '+ok+' confirmadas, '+erros+' pendentes. Preparando PDF.';
  await baixarPdf();
 }catch(e){est.textContent='Consulta nao concluida: '+String(e.message||e).slice(0,250);}
 finally{ocupado=false;b.disabled=false;stop.disabled=true;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',criar);else criar();
})();
