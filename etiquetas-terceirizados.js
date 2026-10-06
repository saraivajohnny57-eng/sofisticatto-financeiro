// V327: módulo isolado. Nunca grava PDFs; somente dados estruturados.
let tercAtual=null;
const tercId=id=>document.getElementById(id);
const tercEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tercMensagem=s=>{if(tercId('tercAviso'))tercId('tercAviso').textContent=s};
async function tercApi(acao,payload){
 let key=typeof bbAdminKey==='function'?bbAdminKey():'';
 if(!key&&typeof garantirAutorizacaoIntegracoesV315==='function')key=await garantirAutorizacaoIntegracoesV315();
 async function request(k){return fetch('/api/etiquetas-terceirizados?acao='+encodeURIComponent(acao),{method:payload?'POST':'GET',headers:{'Content-Type':'application/json','x-integrations-admin-key':k},body:payload?JSON.stringify(payload):undefined});}
 let r=await request(key);
 if(r.status===401&&typeof garantirAutorizacaoIntegracoesV315==='function'){key=await garantirAutorizacaoIntegracoesV315(true);r=await request(key);}
 const data=await r.json().catch(()=>({}));
 if(!r.ok||!data.ok)throw new Error(data.erro||'Erro HTTP '+r.status);
 return data.data;
}
async function buscarEtiquetaTerc(){
 const codigo=tercId('tercBuscaCodigo').value.trim();if(!codigo)return tercMensagem('Digite um código.');
 let data;try{data=await tercApi('buscar',{codigo});}catch(e){return tercMensagem('Não foi possível consultar: '+e.message);}
 if(!data){tercAtual=null;tercMensagem('Código não cadastrado. Preencha o cadastro na janela aberta.');abrirCadastroTerc(codigo);return;}
 tercAtual=data;tercMensagem('Etiqueta encontrada: '+data.descricao);renderEtiquetaTerc();
}
async function listarEtiquetasTerc(){
 let data;try{data=await tercApi('listar');}catch(e){return tercMensagem('Não foi possível listar: '+e.message);}
 tercId('tercLista').innerHTML=(data||[]).map(x=>`<button class="btn azul" style="margin:3px" onclick="tercId('tercBuscaCodigo').value=${JSON.stringify(x.codigo).replace(/</g,'\\u003c')};buscarEtiquetaTerc()">${tercEscape(x.codigo)} — ${tercEscape(x.descricao)}</button>`).join('')||'Nenhuma etiqueta cadastrada.';
}
function abrirCadastroTerc(codigo=''){
 const x=(tercAtual&&(!codigo||codigo===tercAtual.codigo))?tercAtual:{};
 const fields={tercCodigo:codigo||x.codigo||'',tercGrupo:x.grupo||'',tercDescricao:x.descricao||'',tercMarca:x.marca||'',tercBarras:x.codigo_barras||'',tercLargura:x.largura_mm||150,tercAltura:x.altura_mm||100,tercTexto:x.texto||'',tercImagem:x.imagem_url||'',tercModelo:x.modelo||'inteira'};
 for(const [id,v] of Object.entries(fields))tercId(id).value=v;
 tercId('tercModalAviso').textContent='';tercId('tercModal').style.display='flex';
}
function fecharCadastroTerc(){tercId('tercModal').style.display='none'}
function editarAtualTerc(){if(!tercAtual)return tercMensagem('Selecione uma etiqueta antes de editar.');abrirCadastroTerc(tercAtual.codigo)}
async function salvarCadastroTerc(){
 const get=id=>tercId(id).value.trim();const codigo=get('tercCodigo'),descricao=get('tercDescricao');
 if(!codigo||!descricao)return tercId('tercModalAviso').textContent='Código e descrição são obrigatórios.';
 const largura=Number(get('tercLargura')),altura=Number(get('tercAltura'));
 if(!Number.isFinite(largura)||!Number.isFinite(altura)||largura<20||altura<20||largura>150||altura>150)return tercId('tercModalAviso').textContent='Dimensões devem estar entre 20 e 150 mm.';
 const imagem=get('tercImagem');if(imagem&&!/^https:\/\//i.test(imagem))return tercId('tercModalAviso').textContent='Use uma URL HTTPS para a arte.';
 const item={codigo,descricao,grupo:get('tercGrupo'),marca:get('tercMarca'),codigo_barras:get('tercBarras'),largura_mm:largura,altura_mm:altura,texto:get('tercTexto'),imagem_url:imagem||null,modelo:get('tercModelo'),atualizado_em:new Date().toISOString()};
 // Atualizações usam o código original, sem sobrescrever outro produto por engano.
 const original=tercAtual?.codigo;
 let data;try{data=await tercApi('salvar',{item,original:original||null});}catch(e){return tercId('tercModalAviso').textContent='Erro ao salvar: '+e.message;}
 tercAtual=data;tercId('tercBuscaCodigo').value=codigo;fecharCadastroTerc();renderEtiquetaTerc();listarEtiquetasTerc();tercMensagem('Cadastro salvo no Supabase.');
}

function tercCamposVariaveis(){
 return {lote:tercId('tercLote')?.value||'',fab:tercId('tercFab')?.value||'',val:tercId('tercVal')?.value||'',
 unidades:tercId('tercUnidades')?.value||'',unidades2:tercId('tercUnidades2')?.value||''};
}

async function tercCarregarGraficos(){
 if(typeof carregarBibliotecasEtiqueta==='function')await carregarBibliotecasEtiqueta();
 if(!window.QRCode||!window.JsBarcode)throw new Error('Bibliotecas de QR Code ou código de barras indisponíveis.');
}
function tercBarcodeFormato(x){
 const cod=String(x.codigo_barras||x.codigo||'').replace(/\s/g,'');
 if(/^\d{13}$/.test(cod))return 'EAN13';
 if(/^\d{8}$/.test(cod))return 'EAN8';
 return 'CODE128';
}
function tercGerarGraficos(){
 const url=(typeof ETIQUETA_INSTAGRAM_URL!=='undefined'?ETIQUETA_INSTAGRAM_URL:'https://www.instagram.com/sofisticatto.cosmeticos/');
 const logo=(typeof logoEtiquetaUrl==='function'?logoEtiquetaUrl():'')||'';
 const x=tercAtual;
 document.querySelectorAll('#tercPreview .tercQrReal').forEach(el=>{
  el.innerHTML='';
  new QRCode(el,{text:url,width:110,height:110,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
 });
 document.querySelectorAll('#tercPreview .tercCodigoSvg').forEach(el=>{
  try{JsBarcode(el,String(x.codigo_barras||x.codigo).trim(),{format:tercBarcodeFormato(x),displayValue:true,fontSize:15,height:62,width:1.65,margin:0,textMargin:3});}
  catch(e){el.outerHTML='<div style="color:#b00">Código de barras inválido</div>';}
 });
 document.querySelectorAll('#tercPreview .tercLogoReal').forEach(el=>{if(logo||x.imagem_url){el.src=x.imagem_url||logo;el.style.display='block';}});
}
function tercFolhaPronta(){
 const el=tercId('tercPreview').querySelector('.tercFolha');
 if(!el)return '';
 const clone=el.cloneNode(true);
 clone.querySelectorAll('.tercQrReal').forEach(q=>{
  const canvas=q.querySelector('canvas'),img=q.querySelector('img');
  if(canvas){const foto=document.createElement('img');foto.src=canvas.toDataURL('image/png');foto.className='tercQrImagem';q.replaceChildren(foto);}
  else if(img){const foto=img.cloneNode(true);foto.className='tercQrImagem';q.replaceChildren(foto);}
 });
 // SVGs are serialized with their full namespace and are self-contained in the print window.
 clone.querySelectorAll('.tercCodigoSvg').forEach(svg=>{
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  const vb=svg.getAttribute('viewBox');
  if(vb)svg.setAttribute('viewBox',vb);
 });
 return clone.outerHTML;
}
function tercBlocoEtiqueta(x,unidades){
 const v=tercCamposVariaveis();
 return `<div class="tercBloco"><div class="tercTopo"><img class="tercLogoReal" alt="Sofisticatto" style="display:none"><div class="tercInstagram"><div class="tercQrReal"></div><span class="tercQrTexto">INSTAGRAM</span></div></div>
 <div class="tercProduto">${tercEscape(x.descricao)}</div>
 <div class="tercDetalhes">LOTE: <b>${tercEscape(v.lote)}</b><br>FAB: <b>${tercEscape(v.fab)}</b><br>VAL: <b>${tercEscape(v.val)}</b><br>CONTÉM <b>${tercEscape(unidades)}</b> UN.</div>
 <div class="tercRodape">CÓDIGO: ${tercEscape(x.codigo)}<svg class="tercCodigoSvg" xmlns="http://www.w3.org/2000/svg"></svg></div></div>`;
}
function tercEstilos(){
 return `@page{size:150mm 100mm;margin:0}
 *{box-sizing:border-box}
 .tercFolha{width:150mm;height:100mm;display:flex;background:#fff;color:#000;font-family:Arial,sans-serif;padding:2mm;overflow:hidden}
 .tercBloco{flex:1;min-width:0;border:.4mm solid #111;display:flex;flex-direction:column;overflow:hidden;padding:2mm}
 .tercTopo{height:32%;display:flex;align-items:center;justify-content:space-around;gap:1mm}
 .tercLogoReal{width:56%;max-height:22mm;object-fit:contain}
 .tercInstagram{display:flex;flex-direction:column;align-items:center;justify-content:center;width:36%}
 .tercQrReal{width:22mm;height:22mm;display:flex;align-items:center;justify-content:center}
 .tercQrReal canvas,.tercQrReal img,.tercQrImagem{width:22mm!important;height:22mm!important;object-fit:contain}
 .tercQrTexto{font-size:2.7mm;font-weight:bold;letter-spacing:.7mm;margin-top:1mm}
 .tercProduto{font-size:4.3mm;font-weight:800;text-align:center;min-height:15%;display:flex;align-items:center;justify-content:center;overflow-wrap:anywhere}
 .tercDetalhes{font-size:4mm;line-height:1.6;flex:1}
 .tercRodape{border-top:.3mm solid #111;font-size:3.2mm;padding-top:1mm;height:30mm;overflow:visible;flex-shrink:0}
 .tercCodigoSvg{display:block;width:95%;height:25mm;margin:1mm auto 0;max-width:100%;overflow:visible}
 .tercDupla .tercBloco{width:50%}
 @media print{html,body{width:150mm;margin:0;padding:0}.tercFolha{break-after:page;page-break-after:always}.tercFolha:last-child{break-after:auto;page-break-after:auto}}
 `;
}
function tercFolhaHTML(){
 const x=tercAtual,v=tercCamposVariaveis(),dupla=(tercId('tercModeloImpressao')?.value||x.modelo)==='dupla';
 return `<div class="tercFolha ${dupla?'tercDupla':''}">${tercBlocoEtiqueta(x,v.unidades)}${dupla?tercBlocoEtiqueta(x,v.unidades2):''}</div>`;
}
async function renderEtiquetaTerc(){
 if(!tercAtual)return;
 const x=tercAtual,modelo=tercId('tercModeloImpressao');
 if(modelo&&modelo.dataset.codigo!==x.codigo){modelo.value=x.modelo||'inteira';modelo.dataset.codigo=x.codigo;}
 const pv=tercId('tercPreview');
 pv.style.width='min(100%,750px)';pv.style.height='auto';pv.style.aspectRatio='3 / 2';pv.style.padding='0';
 pv.innerHTML=`<style>${tercEstilos()}#tercPreview .tercFolha{width:100%;height:100%}#tercPreview .tercBloco{padding:1.5%}#tercPreview .tercProduto{font-size:clamp(10px,1.5vw,20px)}#tercPreview .tercDetalhes{font-size:clamp(9px,1.2vw,16px)}#tercPreview .tercRodape{font-size:clamp(8px,1vw,14px)}</style>${tercFolhaHTML()}`;
 tercId('tercInfoModelo').textContent=`150 × 100 mm • ${x.grupo||'Sem grupo'} • QR Code e código de barras reais`;
 try{await tercCarregarGraficos();tercGerarGraficos();}catch(e){tercMensagem('Falha ao carregar gráficos: '+e.message);}
}
async function imprimirEtiquetaTerc(){
 if(!tercAtual)return tercMensagem('Busque uma etiqueta antes de imprimir.');
 try{
  await renderEtiquetaTerc();
  // Convert external logos to data URIs so printing cannot lose them in about:blank.
  const preview=tercId('tercPreview');
  await Promise.all(Array.from(preview.querySelectorAll('img.tercLogoReal')).map(async img=>{
   if(!img.src||img.src.startsWith('data:'))return;
   try{const r=await fetch(img.src,{mode:'cors'});if(!r.ok)throw Error('logo');const blob=await r.blob();
    const uri=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(blob)});
    img.src=uri;
   }catch(e){/* Preserve the original URL when cross-origin conversion is blocked. */}
  }));
  const folha=tercFolhaPronta();if(!folha)return tercMensagem('Não foi possível montar a etiqueta.');
  const n=Math.min(200,Math.max(1,Number(tercId('tercQtd').value)||1));
  const page=`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta ${tercEscape(tercAtual.codigo)}</title><style>${tercEstilos()}@media screen{body{background:#ddd}.tercFolha{margin:10px auto;box-shadow:0 1px 8px #999}}</style></head><body>${Array(n).fill(folha).join('')}<script>window.onload=async()=>{await Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{})));await document.fonts.ready;window.print()}<\/script></body></html>`;
  const win=window.open('','_blank');if(!win)return tercMensagem('Permita pop-ups para imprimir.');
  win.document.open();win.document.write(page);win.document.close();
 }catch(e){tercMensagem('Erro ao imprimir: '+e.message);}
}
