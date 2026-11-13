/* Carta Registrada: prévia e impressão oficial em 4 tamanhos, sem emissão postal. */
(function(){
'use strict';
const formatos=Object.freeze([
 {id:'etiqueta1',nome:'Etiqueta 1',tam:'100 × 80 mm'},
 {id:'etiqueta2',nome:'Etiqueta 2',tam:'100 × 150 mm'},
 {id:'a4',nome:'Folha A4',tam:'210 × 297 mm'},
 {id:'envelope',nome:'Envelope',tam:'230 × 115 mm'}
]);
const chaveFormato='sofisticatto_carta_rotulo_formato_v1';
let ativo=null;
function salvo(){
 try{const s=localStorage.getItem(chaveFormato);return formatos.some(f=>f.id===s)?s:'envelope';}
 catch{return 'envelope';}
}
function memorizar(id){try{localStorage.setItem(chaveFormato,id);}catch{}}
function estilo(e,valor){e.style.cssText=valor;return e;}
function elemento(tag,txt){
 const e=document.createElement(tag);
 if(txt!==undefined)e.textContent=txt;
 return e;
}
function botoes(texto,fn){
 const b=elemento('button',texto);
 b.type='button';b.onclick=fn;
 return estilo(b,'border:0;border-radius:9px;padding:10px 13px;background:#6a1b9a;color:white;cursor:pointer;font:600 13px Arial');
}
async function autorizacao(){
 if(typeof obterChaveIntegracoesCotacao==='function'){
  const token=await obterChaveIntegracoesCotacao();
  if(!token)throw Error('Autorize a integração para preparar o PDF.');
  return token;
 }
 const key=sessionStorage.getItem('integrations_admin_key')||localStorage.getItem('integrations_admin_key')||'';
 if(!key)throw Error('Autorize primeiro o dispositivo no painel de integrações.');
 return key;
}
function validarPDF(blob){
 if(!blob||blob.size<100||blob.size>2*1024*1024)throw Error('Escolha o PDF oficial dos Correios (até 2 MB).');
 if(blob.type && !/pdf|octet-stream/i.test(blob.type))throw Error('O arquivo selecionado não é PDF.');
}
function base64(blob){
 return new Promise((resolve,reject)=>{
  const r=new FileReader();
  r.onerror=()=>reject(Error('Não foi possível ler o PDF selecionado.'));
  r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');
  r.readAsDataURL(blob);
 });
}
async function transformar(blob,formato){
 const key=await autorizacao(),pdfBase64=await base64(blob);
 const r=await fetch('/api/integracoes?action=documentos-correios&modo=ajustar-rotulo-carta',{
  method:'POST',headers:{'Content-Type':'application/json','x-integrations-admin-key':key},
  body:JSON.stringify({formato,pdfBase64})
 });
 if(!r.ok){
  const e=await r.json().catch(()=>({}));
  throw Error(e.erro||'Não foi possível preparar o formato de impressão (HTTP '+r.status+').');
 }
 const pdf=await r.blob();
 const bytes=new Uint8Array(await pdf.slice(0,4).arrayBuffer());
 if(String.fromCharCode(...bytes)!=='%PDF')throw Error('O servidor não retornou um PDF válido.');
 return pdf;
}
function guia(formato){
 if(formato==='envelope')
  return 'Brother DCP-L2540DW: envelope 230 × 115 mm; inserir com 115 mm de largura na entrada manual frontal. No driver: Tamanho personalizado = 115 × 230 mm; Origem = Manual; Tipo de mídia = Envelope; duplex desligado. Abra a tampa traseira e abaixe as duas alavancas verdes antes de imprimir.';
 if(formato==='a4')return 'A4: folhas convencionais; selecione a origem de papel apropriada no driver. Para vários rótulos, o PDF pode organizar até dois por página.';
 return 'Atenção: o PDF original de envelope será reduzido neste formato. Confira nitidez, dimensão do código de barras e aceitação pelos Correios antes de usar.';
}
async function abrir(blob,nome){
 validarPDF(blob);
 const bytes=new Uint8Array(await blob.slice(0,4).arrayBuffer());
 if(String.fromCharCode(...bytes)!=='%PDF')throw Error('O arquivo não começa com a assinatura %PDF.');
 if(ativo)ativo.fechar();
 const modal=estilo(elemento('div'),'position:fixed;inset:0;z-index:2147483000;background:#19112dcf;display:flex;align-items:center;justify-content:center;padding:10px');
 const panel=estilo(elemento('section'),'background:#fff;color:#24202d;border-radius:13px;width:min(1120px,99vw);height:96vh;overflow:hidden;display:flex;flex-direction:column;font:13px Arial');
 const header=estilo(elemento('header'),'display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:10px 13px;border-bottom:1px solid #ddd');
 const title=estilo(elemento('strong',nome||'Rótulo oficial Correios'),'flex:1;min-width:220px;font:700 14px Arial');
 header.append(title);
 const opts=estilo(elemento('div'),'display:flex;gap:7px;flex-wrap:wrap;padding:10px 13px;background:#f8f6fc');
 const status=estilo(elemento('p'),'padding:5px 13px;margin:0;color:#47396e;font:12px Arial');
 status.setAttribute('role','status');
 const dica=estilo(elemento('p'),'padding:7px 13px;margin:0;background:#fff8eb;color:#6e4e1e;font:12px Arial;line-height:1.4');
 const frame=estilo(elemento('iframe'),'width:100%;flex:1;border:0;background:#eee');
 frame.title='Prévia do rótulo oficial em PDF';
 const rodape=estilo(elemento('footer'),'display:flex;gap:8px;padding:10px 13px;flex-wrap:wrap;border-top:1px solid #ddd');
 const resultado=new Map();
 let urlAtual='',emProcesso=false,fechado=false,formato=salvo();
 const seletores=[];
 const imprimir=botoes('Imprimir no Windows',()=>{
  if(!urlAtual)return;
  try{frame.contentWindow.focus();frame.contentWindow.print();}
  catch(e){status.textContent='O navegador bloqueou o diálogo. Use o botão Imprimir no visualizador PDF ou baixe o arquivo.';}
 });
 const baixar=botoes('Baixar PDF preparado',()=>{
  const item=resultado.get(formato);if(!item)return;
  const url=URL.createObjectURL(item),a=elemento('a');
  a.href=url;a.download='CARTA_REGISTRADA_'+formato.toUpperCase()+'.pdf';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
 });
 const fechar=()=>{
  if(fechado)return;fechado=true;
  modal.remove();document.removeEventListener('keydown',esc);
  if(urlAtual)URL.revokeObjectURL(urlAtual);
  if(ativo?.fechar===fechar)ativo=null;
 };
 const esc=e=>{if(e.key==='Escape')fechar();};
 function visualizar(pdf){
  if(urlAtual)URL.revokeObjectURL(urlAtual);
  urlAtual=URL.createObjectURL(pdf);
  frame.src=urlAtual;
 }
 async function selecionar(id){
  if(emProcesso||fechado)return;
  formato=id;memorizar(id);
  seletores.forEach(({id:ident,botao})=>{
   const escolhido=ident===formato;
   botao.style.background=escolhido?'#6a1b9a':'#fff';
   botao.style.color=escolhido?'#fff':'#3e2e63';
   botao.style.border=escolhido?'2px solid #6a1b9a':'2px solid #c2b6dc';
   botao.setAttribute('aria-pressed',escolhido?'true':'false');
  });
  dica.textContent=guia(formato);
  imprimir.disabled=true;baixar.disabled=true;emProcesso=true;
  status.textContent='Preparando o PDF vetorial para '+formatos.find(f=>f.id===id).tam+'...';
  try{
   let pdf=resultado.get(id);
   if(!pdf){pdf=await transformar(blob,id);resultado.set(id,pdf);}
   if(fechado)return;
   visualizar(pdf);status.textContent='PDF pronto. Confira o tamanho de papel, a impressora Brother e a origem Manual no diálogo de impressão.';
   imprimir.disabled=false;baixar.disabled=false;
  }catch(e){
   if(!fechado){status.textContent='Erro: '+e.message+' Nenhuma nova pré-postagem foi criada.';status.style.color='#ae281a';}
  }finally{emProcesso=false;}
 }
 for(const f of formatos){
  const b=botoes(f.nome+' — '+f.tam,()=>selecionar(f.id));
  b.style.fontSize='12px';
  seletores.push({id:f.id,botao:b});opts.append(b);
 }
 const exit=botoes('Fechar',fechar);exit.style.background='#575264';
 rodape.append(imprimir,baixar,exit);
 panel.append(header,opts,status,dica,frame,rodape);modal.append(panel);document.body.append(modal);
 document.addEventListener('keydown',esc);
 ativo={fechar};
 selecionar(formato);
}
window.cartaAbrirPdfOficialCarta=abrir;
window.cartaImportarRotuloPDF=()=>{
 const input=elemento('input');input.type='file';input.accept='.pdf,application/pdf';
 input.onchange=async()=>{
  const file=input.files&&input.files[0];if(!file)return;
  try{await abrir(file,'Rótulo oficial importado — '+file.name);}
  catch(e){const status=document.getElementById('cartaStatus');if(status){status.textContent=e.message;status.style.color='#ae281a';}else alert(e.message);}
 };
 input.click();
};
window.cartaImpressaoFormatos=()=>formatos.map(f=>({...f}));
})();