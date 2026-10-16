/* V388: prévia local, somente leitura, a partir da carteira consultada. NÃO emite boleto novo. */
(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dig=v=>String(v??'').replace(/\D/g,'');
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function pick(o,...names){for(const n of names){if(o&&o[n]!=null&&String(o[n]).trim())return o[n]}return ''}
function show(bank,x){
 const line=dig(pick(x,'linha_digitavel','linhaDigitavel','linha','linhaDig'));
 const barcode=dig(pick(x,'codigo_barras','codigoBarras','codigoBarraNumerico','cdBarras'));
 const validLine=line.length===47||line.length===48;
 const validBar=barcode.length===44;
 const old=document.getElementById('sv388');if(old)old.remove();
 const el=document.createElement('div');el.id='sv388';el.style='position:fixed;inset:0;z-index:2147483000;background:#0009;display:flex;align-items:center;justify-content:center;padding:12px';
 const nome=bank==='bb'?'Banco do Brasil':'Bradesco';
 el.innerHTML=`<section style="background:white;color:#17202a;border-radius:14px;max-width:720px;width:100%;max-height:92vh;overflow:auto;padding:24px;font:14px Arial"><h2 style="margin:0 0 8px">${nome} — consulta de segunda via</h2><p style="background:#fff1c2;padding:12px;border-radius:8px"><b>Prévia informativa, não é boleto para pagamento.</b> O sistema não recebeu confirmação de valor atualizado com encargos nem autorização para gerar uma nova linha digitável. Nenhum título será modificado.</p><table style="width:100%;border-collapse:collapse"><tbody>${[['Cliente',pick(x,'cliente','cliente_nome')],['CPF/CNPJ',pick(x,'cpf_cnpj','documento_pagador')],['Referência',pick(x,'seu_numero','referencia')],['Nosso Número',pick(x,'nosso_numero')],['Vencimento original',pick(x,'vencimento')],['Valor nominal',money(x.valor)],['Linha digitável registrada',validLine?line:'Não disponível na consulta'],['Código de barras registrado',validBar?barcode:'Não disponível na consulta']].map(([k,v])=>`<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">${esc(k)}</th><td style="padding:8px;border-bottom:1px solid #ddd;word-break:break-all">${esc(v)}</td></tr>`).join('')}</tbody></table><p style="font-size:12px;color:#555">${validLine||validBar?'Os dados bancários acima são os registrados na consulta, não uma atualização do valor.':'A consulta da carteira não trouxe linha digitável ou código de barras suficiente para produzir uma segunda via pagável.'}</p><div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button data-close style="padding:10px">Fechar</button><button data-print style="padding:10px">Imprimir prévia informativa</button></div></section>`;
 document.body.appendChild(el);el.querySelector('[data-close]').onclick=()=>el.remove();el.onclick=e=>{if(e.target===el)el.remove()};el.querySelector('[data-print]').onclick=()=>{const win=window.open('','_blank');if(!win){alert('Permita pop-ups para imprimir a prévia.');return;}const html=el.querySelector('section').cloneNode(true);html.querySelector('div:last-child')?.remove();win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Prévia informativa</title></head><body>'+html.outerHTML+'</body></html>');win.document.close();win.focus();win.print()};
}
window.sv388Abrir=show;
})();
