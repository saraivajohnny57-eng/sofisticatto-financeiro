/* V388: prévia local, somente leitura, a partir da carteira consultada. NÃO emite boleto novo. */
(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dig=v=>String(v??'').replace(/\D/g,'');
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function pick(o,...names){for(const n of names){if(o&&o[n]!=null&&String(o[n]).trim())return o[n]}return ''}
async function consultarIndividual(bank,x,el){
 const btn=el.querySelector('[data-consultar]');btn.disabled=true;btn.textContent='Consultando banco...';
 try{
  const nn=dig(x.nosso_numero);if(!nn)throw new Error('Nosso Número ausente.');
  const j=bank==='bb'?await bbReq('consultar-boleto',{method:'POST',body:{nosso_numero:nn}}):await bradescoReqProducao('consultar-segunda-via-v389',{nosso_numero:nn});
  const raw=bank==='bb'?(j.consulta||j):(j.consulta||{});
  const objs=[raw,raw?.boleto,raw?.titulo,raw?.dados,raw?.consulta,raw?.data].filter(Boolean);
  const val=(...keys)=>{for(const o of objs)for(const k of keys){if(o[k]!==undefined&&o[k]!==null&&String(o[k]).trim())return String(o[k])}return ''};
  const line=dig(val('linha_digitavel','linhaDigitavel','linhaDig'));const bar=dig(val('codigo_barras','codigoBarraNumerico','codigoBarras','cdBarras'));
  const url=val('urlImagemBoleto','url_boleto','urlBoleto','pdfUrl');
  const safeUrl=/^https:\/\//i.test(url)?url:'';
  const result=el.querySelector('[data-resultado]');
  result.innerHTML=`<p><b>Consulta individual concluída.</b> Nenhum registro foi modificado.</p><p>Linha digitável: <b>${line.length===47||line.length===48?esc(line):'Não retornada'}</b></p><p>Código de barras: <b>${bar.length===44?esc(bar):'Não retornado'}</b></p><p>Valor retornado pelo banco: <b>${esc(val('valor_boleto','valorBoleto','valorMoedaBol')||'Não informado')}</b></p><p style="font-size:12px">A presença de uma linha digitável não comprova atualização de encargos. Confirme os valores antes do pagamento.</p>${safeUrl?'<button data-url type="button">Abrir documento oficial fornecido pelo banco</button>':''}`;
  if(safeUrl)result.querySelector('[data-url]').onclick=()=>window.open(safeUrl,'_blank','noopener');
 }catch(e){el.querySelector('[data-resultado]').textContent='Não foi possível consultar o título: '+(e.message||e)}finally{btn.disabled=false;btn.textContent='Consultar título individual na API'}
}
function show(bank,x){
 const line=dig(pick(x,'linha_digitavel','linhaDigitavel','linha','linhaDig'));
 const barcode=dig(pick(x,'codigo_barras','codigoBarras','codigoBarraNumerico','cdBarras'));
 const validLine=line.length===47||line.length===48;
 const validBar=barcode.length===44;
 const old=document.getElementById('sv388');if(old)old.remove();
 const el=document.createElement('div');el.id='sv388';el.style='position:fixed;inset:0;z-index:2147483000;background:#0009;display:flex;align-items:center;justify-content:center;padding:12px';
 const nome=bank==='bb'?'Banco do Brasil':'Bradesco';
 el.innerHTML=`<section style="background:white;color:#17202a;border-radius:14px;max-width:720px;width:100%;max-height:92vh;overflow:auto;padding:24px;font:14px Arial"><h2 style="margin:0 0 8px">${nome} — consulta de segunda via</h2><p style="background:#fff1c2;padding:12px;border-radius:8px"><b>Prévia informativa, não é boleto para pagamento.</b> O sistema não recebeu confirmação de valor atualizado com encargos nem autorização para gerar uma nova linha digitável. Nenhum título será modificado.</p><table style="width:100%;border-collapse:collapse"><tbody>${[['Cliente',pick(x,'cliente','cliente_nome')],['CPF/CNPJ',pick(x,'cpf_cnpj','documento_pagador')],['Referência',pick(x,'seu_numero','referencia')],['Nosso Número',pick(x,'nosso_numero')],['Vencimento original',pick(x,'vencimento')],['Valor nominal',money(x.valor)],['Linha digitável registrada',validLine?line:'Não disponível na consulta'],['Código de barras registrado',validBar?barcode:'Não disponível na consulta']].map(([k,v])=>`<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">${esc(k)}</th><td style="padding:8px;border-bottom:1px solid #ddd;word-break:break-all">${esc(v)}</td></tr>`).join('')}</tbody></table><p style="font-size:12px;color:#555">${validLine||validBar?'Os dados bancários acima são os registrados na consulta, não uma atualização do valor.':'A consulta da carteira não trouxe linha digitável ou código de barras suficiente para produzir uma segunda via pagável.'}</p><div data-resultado style="margin:12px 0"></div><div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button data-close style="padding:10px">Fechar</button><button data-consultar style="padding:10px;background:#2256a3;color:white">Consultar título individual na API</button><button data-print style="padding:10px">Imprimir prévia informativa</button></div></section>`;
 document.body.appendChild(el);el.querySelector('[data-consultar]').onclick=()=>consultarIndividual(bank,x,el);el.querySelector('[data-close]').onclick=()=>el.remove();el.onclick=e=>{if(e.target===el)el.remove()};el.querySelector('[data-print]').onclick=()=>{const win=window.open('','_blank');if(!win){alert('Permita pop-ups para imprimir a prévia.');return;}const html=el.querySelector('section').cloneNode(true);html.querySelector('div:last-child')?.remove();win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Prévia informativa</title></head><body>'+html.outerHTML+'</body></html>');win.document.close();win.focus();win.print()};
}
window.sv388Abrir=show;
})();
