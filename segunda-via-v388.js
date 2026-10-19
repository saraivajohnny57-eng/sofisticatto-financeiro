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
function barcodeAmount(bar){
 // Padrão FEBRABAN cobrança: posições 10 a 19 do código de barras (10 dígitos, centavos).
 if(!/^\d{44}$/.test(bar)||!['001','237'].includes(bar.slice(0,3)))return null;
 return Number(bar.slice(9,19))/100;
}
function barcodeBankMatches(bank,bar){return bar.length===44&&bar.slice(0,3)===(bank==='bb'?'001':'237')}
// V394: código ITF-2of5, padrão de impressão dos boletos de cobrança.
function itfSvg(digits){
 if(!/^\d{44}$/.test(digits))throw new Error('Código de barras inválido.');
 const patterns=['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010'];
 let x=12;let bars='<rect x="'+x+'" y="0" width="2" height="64"/>';x+=3;bars+='<rect x="'+x+'" y="0" width="2" height="64"/>';x+=3;
 for(let i=0;i<digits.length;i+=2){const a=patterns[Number(digits[i])],b=patterns[Number(digits[i+1])];for(let j=0;j<5;j++){let w=a[j]==='1'?5:2;bars+='<rect x="'+x+'" y="0" width="'+w+'" height="64"/>';x+=w;x+=b[j]==='1'?5:2}}
 bars+='<rect x="'+x+'" y="0" width="5" height="64"/>';x+=7;bars+='<rect x="'+x+'" y="0" width="2" height="64"/>';x+=14;
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+x+' 64" style="width:100%;height:80px;display:block" preserveAspectRatio="none">'+bars+'</svg>';
}
function barcodeDvOk(bar){if(!/^\d{44}$/.test(bar))return false;let sum=0,w=2;for(let i=43;i>=0;i--){if(i===4)continue;sum+=Number(bar[i])*w;w=w===9?2:w+1}const r=sum%11;const dv=(r===0||r===1||r===10)?1:11-r;return dv===Number(bar[4])}
function brDate(d){const m=String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:String(d||'')}
function todayLocal(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function makePaymentHtml(x,line,bar,amount,returnedDate){
 const formatted=line.replace(/(\d{5})(\d{5})(\d{5})(\d{6})(\d{5})(\d{6})(\d)(\d{14})/,'$1.$2 $3.$4 $5.$6 $7 $8');
 const doc=esc(pick(x,'seu_numero','referencia'));const payer=esc(pick(x,'cliente','cliente_nome'));const cpf=esc(pick(x,'cpf_cnpj','documento_pagador'));
 const beneficiary='SOFISTICATTO INDUSTRIA, COMERCIO E EXPOR';const cnpj='00.451.985/0001-95';
 const fields=(receipt)=>'<div class="line"><b>Beneficiário</b><span>'+beneficiary+' — CNPJ '+cnpj+'</span></div><div class="triple"><div><small>Data da consulta</small>'+brDate(todayLocal())+'</div><div><small>Nº do documento</small>'+doc+'</div><div><small>Nosso Número</small>'+esc(pick(x,'nosso_numero'))+'</div></div><div class="triple"><div><small>Vencimento informado pela API</small>'+brDate(returnedDate)+'</div><div><small>Valor do documento</small>'+money(amount)+'</div><div><small>Banco</small>237 — Bradesco</div></div><div class="line"><b>Pagador</b><span>'+payer+' — '+cpf+'</span></div>';
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dados de pagamento Bradesco - '+doc+'</title><style>@page{size:A4;margin:14mm}body{font:12px Arial,sans-serif;color:#111;max-width:800px;margin:auto}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #222;padding:12px 0;font-size:19px;font-weight:bold}.line{border-bottom:1px solid #aaa;padding:9px 0}.line b{display:block;font-size:10px}.triple{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #aaa}.triple div{padding:8px;border-right:1px solid #aaa}.triple small{display:block;font-size:10px;color:#555;margin-bottom:5px}.digit{font-family:monospace;font-size:15px;font-weight:bold;overflow-wrap:anywhere}.notice{background:#fff1c7;border:1px solid #ad8023;padding:12px;margin:12px 0;line-height:1.5}.separator{border-top:1px dashed #555;margin:30px 0}.barcode{margin-top:20px;max-width:650px}.actions{margin:15px 0}@media print{.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">Imprimir / Salvar como PDF</button></div><div class="notice"><b>Documento gerado pelo Sofisticatto com dados consultados na API Bradesco.</b> Não é uma via emitida pelo site do banco. Confira beneficiário, valor e validade no aplicativo bancário antes de pagar. Dados consultados em '+brDate(todayLocal())+'. Para pagamento em outra data, faça nova consulta.</div><div class="header"><span>bradesco | 237-2</span><span>Dados de pagamento</span></div><p class="digit">'+formatted+'</p>'+fields(true)+'<div class="separator"></div><div class="header"><span>bradesco | 237-2</span><span>Ficha para pagamento</span></div><p class="digit">'+formatted+'</p>'+fields(false)+'<p><b>Valor informado pelo banco: '+money(amount)+'</b></p><div class="barcode">'+itfSvg(bar)+'</div><p style="font-family:monospace;text-align:center">'+bar+'</p></body></html>';
}
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
  const barValid=barcodeBankMatches(bank,bar);
  const barAmount=barValid?barcodeAmount(bar):null;
  const rawAmount=barAmount===null?'Não disponível':money(barAmount);
  const url=val('urlImagemBoleto','url_boleto','urlBoleto','pdfUrl');
  const safeUrl=(()=>{try{const u=new URL(url);return u.protocol==='https:'&&/^(?:[a-z0-9-]+\.)*(?:bb\.com\.br|bradesco\.com\.br)$/i.test(u.hostname)?u.href:''}catch{return ''}})();
  const result=el.querySelector('[data-resultado]');
  const bankValue=val('valor_boleto','valorBoleto','valorMoedaBol','valor_titulo','valorTitulo');
  const warning=barValid?'Valor codificado extraído do código de barras, mas isso não confirma a atualização dos encargos nem a aceitação do pagamento pelo banco.':'Não foi possível validar um código de barras bancário deste banco. Não há confirmação de valor atualizado com encargos.';
  result.innerHTML=`<div style="border-top:1px solid #ddd;padding-top:10px"><b>Consulta individual concluída.</b> Nenhum registro foi modificado.<table style="width:100%;table-layout:fixed;border-collapse:collapse;margin-top:8px"><tbody>${[['Linha digitável da consulta',lineOk?line:(line?'Formato ou dígitos verificadores inválidos':'Não retornada')],['Código de barras',barValid?bar:(bar?'Banco ou formato inconsistente':'Não retornado')],['Valor codificado no código de barras',rawAmount],['Valor bruto retornado pela API',asText(bankValue)],['Vencimento retornado',asText(val('vencimento','dataVencimento','dataVencimentoTitulo'))],['Status retornado',asText(val('status_descricao','status','situacao'))]].map(([k,v])=>`<tr><th style="text-align:left;width:48%;padding:6px;border-bottom:1px solid #ddd;overflow-wrap:anywhere">${esc(k)}</th><td style="padding:6px;border-bottom:1px solid #ddd;overflow-wrap:anywhere">${esc(v)}</td></tr>`).join('')}</tbody></table><p style="font-size:12px;color:#934800">${esc(warning)} Esta consulta não autoriza criar uma nova linha digitável ou alterar o boleto original.</p>${safeUrl?'<button data-url type="button">Abrir documento oficial retornado pelo banco</button>':''}</div>`;
  if(safeUrl)result.querySelector('[data-url]').onclick=()=>window.open(safeUrl,'_blank','noopener');
  // V393: exibir os dados retornados pelo banco, sem fabricar boleto oficial.
  // A linha deve pertencer ao Bradesco e o valor da API deve coincidir com o código.
  if(bank==='bradesco'&&lineOk&&barValid&&barAmount!==null&&/^\d+$/.test(bankValue)&&Number(bankValue)===Math.round(barAmount*100)){
   const area=document.createElement('div');area.style.cssText='margin-top:12px;padding:12px;border:1px solid #a9c4af;border-radius:8px;background:#f5fff6;overflow-wrap:anywhere';
   area.innerHTML='<b>Dados de pagamento conferidos com a consulta do Bradesco</b><p style="font-size:12px">A linha digitável e o valor retornados pela API são consistentes. Confirme no aplicativo bancário o beneficiário, o valor e a data de validade antes de pagar. Isto não é uma segunda via oficial em PDF.</p><p><b>Valor:</b> '+esc(money(barAmount))+'</p><p style="font-family:monospace;overflow-wrap:anywhere">'+esc(line.replace(/(\d{5})(\d{5})(\d{5})(\d{6})(\d{5})(\d{6})(\d)(\d{14})/,'$1.$2 $3.$4 $5.$6 $7 $8'))+'</p><button type="button" data-copyline>Copiar linha digitável</button>';
   result.appendChild(area);
   area.querySelector('[data-copyline]').onclick=async()=>{try{await navigator.clipboard.writeText(line);area.querySelector('[data-copyline]').textContent='Linha copiada ✓'}catch{alert('Não foi possível copiar. Selecione a linha manualmente.')}};
   const pdfBtn=document.createElement('button');pdfBtn.type='button';pdfBtn.textContent='Gerar PDF com dados atualizados';pdfBtn.style.cssText='margin-left:8px;padding:8px;background:#205ca3;color:#fff;border:0;border-radius:5px';area.appendChild(pdfBtn);
   pdfBtn.onclick=async()=>{
    // Abrir no gesto do usuário para evitar bloqueador de pop-ups; só imprimir após consulta nova.
    const w=window.open('','_blank');if(!w){alert('Não foi possível abrir a janela de impressão.');return}
    w.document.write('<!doctype html><html><meta charset="utf-8"><body>Consultando novamente o Bradesco para emitir dados atualizados...</body></html>');w.document.close();pdfBtn.disabled=true;
    try{
     const j=await bradescoReqProducao('consultar-segunda-via-v389',{nosso_numero:dig(x.nosso_numero)});
     const rr=j.consulta||{};const objs2=[rr,rr.boleto,rr.titulo,rr.dados,rr.consulta,rr.data].filter(o=>o&&typeof o==='object');
     const v2=(...keys)=>{for(const o of objs2)for(const k of keys)if(o[k]!==undefined&&o[k]!==null&&String(o[k]).trim())return String(o[k]);return ''};
     const l2=dig(v2('linha_digitavel','linhaDigitavel','linhaDig'));
     const b2=barcodeFromLine(l2);
     const value2=v2('valor_boleto','valorBoleto','valorMoedaBol','valor_titulo','valorTitulo');
     const dt=v2('vencimento','dataVencimento','dataVencimentoTitulo');
     if(!validateLine(l2)||!barcodeBankMatches('bradesco',b2)||!barcodeDvOk(b2))throw new Error('Linha digitável ou código de barras não passaram na validação.');
     if(!/^\d+$/.test(value2)||Number(value2)!==Math.round(barcodeAmount(b2)*100))throw new Error('Valor retornado pela API não coincide com o código de barras.');
     if(!/^\d{4}-\d{2}-\d{2}$/.test(dt)||dt!==todayLocal())throw new Error('A data de vencimento/validade retornada ('+dt+') não corresponde à data de hoje. Confirme a regra de validade antes de gerar o PDF.');
     const status=v2('status_descricao','status','situacao').toUpperCase();if(/PAGO|LIQUIDADO|CANCELADO|BAIXADO/.test(status))throw new Error('Título não está disponível para pagamento: '+status);
     w.document.open();w.document.write(makePaymentHtml(x,l2,b2,barcodeAmount(b2),dt));w.document.close();w.focus();
    }catch(e){w.document.open();w.document.write('<!doctype html><meta charset="utf-8"><p>Não foi possível gerar o PDF: '+esc(e.message||e)+'</p><p>O título original não foi alterado.</p>');w.document.close()}
    finally{pdfBtn.disabled=false}
   };

  }
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
 el.innerHTML=`<section style="background:white;color:#17202a;border-radius:14px;max-width:720px;width:100%;max-height:92vh;overflow-x:hidden;overflow-y:auto;box-sizing:border-box;padding:24px;font:14px Arial"><h2 style="margin:0 0 8px">${nome} — consulta de segunda via</h2><p style="background:#fff1c2;padding:12px;border-radius:8px"><b>Prévia informativa, não é boleto para pagamento.</b> O sistema não recebeu confirmação de valor atualizado com encargos nem autorização para gerar uma nova linha digitável. Nenhum título será modificado.</p><table style="width:100%;border-collapse:collapse"><tbody>${[['Cliente',pick(x,'cliente','cliente_nome')],['CPF/CNPJ',pick(x,'cpf_cnpj','documento_pagador')],['Referência',pick(x,'seu_numero','referencia')],['Nosso Número',pick(x,'nosso_numero')],['Vencimento original',pick(x,'vencimento')],['Valor nominal',money(x.valor)],['Linha digitável registrada',validLine?line:'Não disponível na consulta'],['Código de barras registrado',validBar?barcode:'Não disponível na consulta']].map(([k,v])=>`<tr><th style="text-align:left;width:45%;padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere">${esc(k)}</th><td style="padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere;word-break:break-word">${esc(v)}</td></tr>`).join('')}</tbody></table><p data-original-note style="font-size:12px;color:#555">${validLine||validBar?'Os dados bancários acima são os registrados na consulta, não uma atualização do valor.':'A consulta da carteira não trouxe linha digitável ou código de barras suficiente para produzir uma segunda via pagável.'}</p><div data-resultado style="margin:12px 0"></div><div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button data-close style="padding:10px">Fechar</button><button data-consultar style="padding:10px;background:#2256a3;color:white">Consultar título individual na API</button><button data-print style="padding:10px">Imprimir prévia informativa</button></div></section>`;
 document.body.appendChild(el);el.querySelector('[data-consultar]').onclick=()=>consultarIndividual(bank,x,el);el.querySelector('[data-close]').onclick=()=>el.remove();el.onclick=e=>{if(e.target===el)el.remove()};el.querySelector('[data-print]').onclick=()=>{const win=window.open('','_blank');if(!win){alert('Permita pop-ups para imprimir a prévia.');return;}const html=el.querySelector('section').cloneNode(true);html.querySelector('div:last-child')?.remove();win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Prévia informativa</title></head><body>'+html.outerHTML+'</body></html>');win.document.close();win.focus();win.print()};
}
window.sv388Abrir=show;
})();
