/* V388: prévia local, somente leitura, a partir da carteira consultada. NÃO emite boleto novo. */
(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dig=v=>String(v??'').replace(/\D/g,'');
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function pick(o,...names){for(const n of names){if(o&&o[n]!=null&&String(o[n]).trim())return o[n]}return ''}
const cache=new Map();
function validateLine(line){
 if(line.length!==47)return false;
 const mod10=s=>{let sum=0,m=2;for(let i=s.length-1;i>=0;i--){let n=Number(s[i])*m;sum+=n>9?n-9:n;m=m===2?1:2}return (10-sum%10)%10};
 return mod10(line.slice(0,9))===Number(line[9])&&mod10(line.slice(10,20))===Number(line[20])&&mod10(line.slice(21,31))===Number(line[31]);
}
function barcodeFromLine(line){return line.slice(0,4)+line.slice(32,33)+line.slice(33,47)+line.slice(4,9)+line.slice(10,20)+line.slice(21,31)}
function asText(v){return v===null||v===undefined||String(v).trim()===''?'Não informado':String(v)}
async function consultarIndividual(bank,x,el){
 const btn=el.querySelector('[data-consultar]');btn.disabled=true;btn.textContent='Consultando banco...';
 try{
  const nn=dig(x.nosso_numero);if(!nn)throw new Error('Nosso Número ausente.');
  const key=bank+':'+nn;let raw=cache.get(key)?.raw;
  if(!raw||Date.now()-cache.get(key).time>120000){
   const j=bank==='bb'?await bbReq('consultar-boleto',{method:'POST',body:{nosso_numero:nn}}):await bradescoReqProducao('consultar-segunda-via-v389',{nosso_numero:nn});
   raw=bank==='bb'?(j.consulta||j):(j.consulta||{});cache.set(key,{raw,time:Date.now()});
  }
  const objs=[raw,raw?.boleto,raw?.titulo,raw?.dados,raw?.consulta,raw?.data].filter(o=>o&&typeof o==='object');
  const val=(...keys)=>{for(const o of objs)for(const k of keys){if(o[k]!==undefined&&o[k]!==null&&String(o[k]).trim())return String(o[k])}return ''};
  const line=dig(val('linha_digitavel','linhaDigitavel','linhaDig'));
  const rawBar=dig(val('codigo_barras','codigoBarraNumerico','codigoBarras','cdBarras'));
  const lineOk=validateLine(line), bar=rawBar.length===44?rawBar:(lineOk?barcodeFromLine(line):'');
  const url=val('urlImagemBoleto','url_boleto','urlBoleto','pdfUrl');
  const safeUrl=(()=>{try{const u=new URL(url);return u.protocol==='https:'&&/^(?:[a-z0-9-]+\.)*(?:bb\.com\.br|bradesco\.com\.br)$/i.test(u.hostname)?u.href:''}catch{return ''}})();
  const result=el.querySelector('[data-resultado]');
  const bankValue=val('valor_boleto','valorBoleto','valorMoedaBol','valor_titulo','valorTitulo');
  const warning=bank==='bradesco'&&bankValue?'O valor retornado pela API não possui confirmação de unidade monetária ou de atualização por encargos.':'Não há confirmação de valor atualizado com encargos.';
  result.innerHTML=`<div style="border-top:1px solid #ddd;padding-top:10px"><b>Consulta individual concluída.</b> Nenhum registro foi modificado.<table style="width:100%;border-collapse:collapse;margin-top:8px"><tbody>${[['Linha digitável da consulta',lineOk?line:(line?'Formato ou dígitos verificadores inválidos':'Não retornada')],['Código de barras',bar.length===44?bar:'Não retornado'],['Valor bruto retornado pela API',asText(bankValue)],['Vencimento retornado',asText(val('vencimento','dataVencimento','dataVencimentoTitulo'))],['Status retornado',asText(val('status_descricao','status','situacao'))]].map(([k,v])=>`<tr><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">${esc(k)}</th><td style="padding:6px;border-bottom:1px solid #ddd;overflow-wrap:anywhere">${esc(v)}</td></tr>`).join('')}</tbody></table><p style="font-size:12px;color:#934800">${esc(warning)} Esta consulta não autoriza criar uma nova linha digitável ou alterar o boleto original.</p>${safeUrl?'<button data-url type="button">Abrir documento oficial retornado pelo banco</button>':''}</div>`;
  if(safeUrl)result.querySelector('[data-url]').onclick=()=>window.open(safeUrl,'_blank','noopener');
  const original=el.querySelector('[data-original-note]');if(original)original.textContent='Dados acima: consulta da carteira. Dados abaixo: resposta individual do banco (sem alteração no Histórico).';
 }catch(e){el.querySelector('[data-resultado]').textContent='Não foi possível consultar o título: '+(e.message||e)}finally{btn.disabled=false;btn.textContent='Consultar título individual na API'}
}
function show(bank,x){
 const line=dig(pick(x,'linha_digitavel','linhaDigitavel','linha','linhaDig'));
 const barcode=dig(pick(x,'codigo_barras','codigoBarras','codigoBarraNumerico','cdBarras'));
 const validLine=validateLine(line);
 const validBar=barcode.length===44;
 const old=document.getElementById('sv388');if(old)old.remove();
 const el=document.createElement('div');el.id='sv388';el.style='position:fixed;inset:0;z-index:2147483000;background:#0009;display:flex;align-items:center;justify-content:center;padding:12px';
 const nome=bank==='bb'?'Banco do Brasil':'Bradesco';
 el.innerHTML=`<section style="background:white;color:#17202a;border-radius:14px;max-width:720px;width:100%;max-height:92vh;overflow:auto;padding:24px;font:14px Arial"><h2 style="margin:0 0 8px">${nome} — consulta de segunda via</h2><p style="background:#fff1c2;padding:12px;border-radius:8px"><b>Prévia informativa, não é boleto para pagamento.</b> O sistema não recebeu confirmação de valor atualizado com encargos nem autorização para gerar uma nova linha digitável. Nenhum título será modificado.</p><table style="width:100%;border-collapse:collapse"><tbody>${[['Cliente',pick(x,'cliente','cliente_nome')],['CPF/CNPJ',pick(x,'cpf_cnpj','documento_pagador')],['Referência',pick(x,'seu_numero','referencia')],['Nosso Número',pick(x,'nosso_numero')],['Vencimento original',pick(x,'vencimento')],['Valor nominal',money(x.valor)],['Linha digitável registrada',validLine?line:'Não disponível na consulta'],['Código de barras registrado',validBar?barcode:'Não disponível na consulta']].map(([k,v])=>`<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">${esc(k)}</th><td style="padding:8px;border-bottom:1px solid #ddd;word-break:break-all">${esc(v)}</td></tr>`).join('')}</tbody></table><p data-original-note style="font-size:12px;color:#555">${validLine||validBar?'Os dados bancários acima são os registrados na consulta, não uma atualização do valor.':'A consulta da carteira não trouxe linha digitável ou código de barras suficiente para produzir uma segunda via pagável.'}</p><div data-resultado style="margin:12px 0"></div><div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button data-close style="padding:10px">Fechar</button><button data-consultar style="padding:10px;background:#2256a3;color:white">Consultar título individual na API</button><button data-print style="padding:10px">Imprimir prévia informativa</button></div></section>`;
 document.body.appendChild(el);el.querySelector('[data-consultar]').onclick=()=>consultarIndividual(bank,x,el);el.querySelector('[data-close]').onclick=()=>el.remove();el.onclick=e=>{if(e.target===el)el.remove()};el.querySelector('[data-print]').onclick=()=>{const win=window.open('','_blank');if(!win){alert('Permita pop-ups para imprimir a prévia.');return;}const html=el.querySelector('section').cloneNode(true);html.querySelector('div:last-child')?.remove();win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Prévia informativa</title></head><body>'+html.outerHTML+'</body></html>');win.document.close();win.focus();win.print()};
}
window.sv388Abrir=show;
})();
