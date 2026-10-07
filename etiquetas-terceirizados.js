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
 const logo='/assets/sofisticatto-logo.jpeg';
 const x=tercAtual;
 document.querySelectorAll('#tercPreview .tercQrReal').forEach(el=>{
  el.innerHTML='';
  new QRCode(el,{text:url,width:120,height:120,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
 });
 document.querySelectorAll('#tercPreview .tercCodigoSvg').forEach(el=>{
  try{JsBarcode(el,String(x.codigo_barras||x.codigo).trim(),{format:tercBarcodeFormato(x),displayValue:true,fontSize:16,height:54,width:1.45,margin:0,textMargin:2,flat:false});}
  catch(e){el.outerHTML='<div style="color:#b00">Código de barras inválido</div>';}
 });
 document.querySelectorAll('#tercPreview .tercLogoReal').forEach(el=>{el.src=logo;el.style.display='block';el.onerror=()=>{el.style.display='none';tercMensagem('Logo oficial não encontrada em /assets/sofisticatto-logo.jpeg.');};});
}
function tercFolhaPronta(){
 const el=tercId('tercPreview').querySelector('.tercFolha');
 if(!el)return '';
 const clone=el.cloneNode(true);
 clone.querySelectorAll('.tercQrReal').forEach((q,index)=>{
  // QRCode.js gera um canvas oculto e uma imagem visível. Em alguns navegadores
  // o canvas oculto fica vazio; priorize a imagem pronta da prévia original.
  const original=el.querySelectorAll('.tercQrReal')[index];
  const visivel=original?.querySelector('img[src^="data:image/"]');
  const canvas=original?.querySelector('canvas');
  let uri=visivel?.getAttribute('src')||'';
  if(!uri&&canvas){try{uri=canvas.toDataURL('image/png');}catch(e){}}
  if(!uri)throw new Error('QR Code não foi gerado. Tente novamente.');
  const foto=document.createElement('img');
  foto.src=uri;foto.alt='QR Code Instagram';foto.className='tercQrImagem';
  q.replaceChildren(foto);
 });
 // SVGs are serialized with their full namespace and are self-contained in the print window.
 clone.querySelectorAll('.tercCodigoSvg').forEach(svg=>{
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  svg.style.width='48mm';svg.style.height='19mm';
  const vb=svg.getAttribute('viewBox');
  if(vb)svg.setAttribute('viewBox',vb);
 });
 return clone.outerHTML;
}
function tercBlocoEtiqueta(x,unidades){
 const v=tercCamposVariaveis();
 return `<div class="tercBloco"><div class="tercTopo"><img class="tercLogoReal" alt="Sofisticatto" style="display:none"><div class="tercInstagram"><span class="tercQrInsta">INSTA</span><div class="tercQrCentro"><div class="tercQrReal"></div><span class="tercQrGram">GRAM</span></div></div></div>
 <div class="tercProduto">${tercEscape(x.descricao)}</div>
 <div class="tercDetalhes">LOTE: <b>${tercEscape(v.lote)}</b><br>FAB: <b>${tercEscape(v.fab)}</b><br>VAL: <b>${tercEscape(v.val)}</b><br>CONTÉM <b>${tercEscape(unidades)}</b> UN.</div>
 <div class="tercRodape">CÓDIGO: ${tercEscape(x.codigo)}<svg class="tercCodigoSvg" xmlns="http://www.w3.org/2000/svg"></svg></div></div>`;
}
// V341: ajustes visuais locais, aplicados igualmente na prévia e na impressão.
const tercAjustesPadrao=()=>({logo:{size:100,rot:0,x:0,y:0},qr:{size:100,rot:0,x:0,y:0},insta:{size:100,rot:0,x:0,y:0},titulo:{size:100,rot:0,x:0,y:0}});
let tercAjustes=(()=>{try{const a=JSON.parse(localStorage.getItem('sof_terc_ajustes_v341')||'{}');return Object.fromEntries(Object.entries(tercAjustesPadrao()).map(([k,v])=>[k,{...v,...(a[k]||{})}]));}catch(e){return tercAjustesPadrao();}})();
function tercAplicarAjustes(){
 const pv=tercId('tercPreview');if(!pv)return;
 pv.querySelectorAll('.tercFolha').forEach(f=>{
  for(const [k,v] of Object.entries(tercAjustes)){
   f.style.setProperty('--terc-'+k+'-size',v.size/100);
   f.style.setProperty('--terc-'+k+'-rot',v.rot+'deg');
   f.style.setProperty('--terc-'+k+'-x',v.x+'mm');
   f.style.setProperty('--terc-'+k+'-y',v.y+'mm');
  }
 });
 document.querySelectorAll('[data-terc-value]').forEach(el=>{const [k,prop]=el.dataset.tercValue.split('.');el.textContent=prop==='size'?tercAjustes[k][prop]+'%':tercAjustes[k][prop]+(prop==='rot'?'°':' mm');});
}
function tercAjustar(k,prop,delta){
 if(!tercAjustes[k]||!['size','rot','x','y'].includes(prop))return;
 const v=tercAjustes[k],min=prop==='size'?50:prop==='rot'?-180:-20,max=prop==='size'?160:prop==='rot'?180:20;
 v[prop]=Math.max(min,Math.min(max,Math.round((v[prop]+delta)*10)/10));
 localStorage.setItem('sof_terc_ajustes_v341',JSON.stringify(tercAjustes));tercAplicarAjustes();
}
function tercRestaurarAjustes(){tercAjustes=tercAjustesPadrao();localStorage.removeItem('sof_terc_ajustes_v341');tercAplicarAjustes();}
function tercEstilos(){
 return `@page{size:150mm 100mm;margin:0}
 *{box-sizing:border-box}
 html,body{margin:0;padding:0;background:#fff}
 .tercFolha{width:150mm;height:100mm;display:flex;background:#fff;color:#000;font-family:Arial,sans-serif;padding:2mm;overflow:hidden}
 .tercBloco{flex:1;min-width:0;border:.35mm solid #111;display:flex;flex-direction:column;overflow:hidden;padding:1.6mm}
 .tercTopo{height:29mm;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:1mm;padding:0 1mm}
 .tercLogoReal{width:55%;height:21mm;object-fit:contain;object-position:center;transform:translate(var(--terc-logo-x,0mm),var(--terc-logo-y,0mm)) rotate(var(--terc-logo-rot,0deg)) scale(var(--terc-logo-size,1));transform-origin:center}
 .tercInstagram{width:39%;height:25mm;display:flex;align-items:flex-start;justify-content:flex-end;gap:1.15mm;overflow:visible;position:relative}
 .tercQrInsta{transform:translate(var(--terc-insta-x,0mm),var(--terc-insta-y,0mm)) rotate(var(--terc-insta-rot,0deg)) scale(var(--terc-insta-size,1));transform-origin:bottom center;font-size:3.3mm;font-weight:900;letter-spacing:0;writing-mode:vertical-rl;text-orientation:upright;line-height:1;align-self:flex-start;margin-top:1mm;white-space:nowrap;flex-shrink:0}
 .tercQrCentro{transform:translate(var(--terc-qr-x,0mm),var(--terc-qr-y,0mm)) rotate(var(--terc-qr-rot,0deg)) scale(var(--terc-qr-size,1));transform-origin:top right;width:23mm;height:24mm;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;position:relative;border-top:.6mm solid #111;border-right:.6mm solid #111;padding:1mm .8mm 0 0}
 .tercQrCentro:after{content:'';position:absolute;right:-.6mm;bottom:0;width:3.8mm;height:.6mm;background:#111}
 .tercQrReal{width:21mm;height:21mm;display:flex;align-items:center;justify-content:center;flex-shrink:0}
 .tercQrReal canvas,.tercQrReal img,.tercQrImagem{width:21mm!important;height:21mm!important;object-fit:contain}
 .tercQrGram{transform:translate(var(--terc-insta-x,0mm),var(--terc-insta-y,0mm)) rotate(var(--terc-insta-rot,0deg)) scale(var(--terc-insta-size,1));transform-origin:left center;font-size:3.1mm;font-weight:900;letter-spacing:1.35mm;line-height:1.1;white-space:nowrap;align-self:flex-start;margin-left:-2.0mm;position:relative;z-index:1;background:#fff;padding-right:.7mm;margin-top:-.2mm}
 .tercProduto{transform:translate(var(--terc-titulo-x,0mm),var(--terc-titulo-y,0mm)) rotate(var(--terc-titulo-rot,0deg)) scale(var(--terc-titulo-size,1));transform-origin:center;font-size:3.8mm;font-weight:800;text-align:center;height:12mm;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow-wrap:anywhere;line-height:1.22}
 .tercDetalhes{font-size:3.8mm;line-height:1.62;flex:1;padding-left:.6mm}
 .tercRodape{border-top:.35mm solid #111;font-size:3.3mm;padding-top:1mm;height:29mm;overflow:hidden;flex-shrink:0}
 .tercCodigoSvg{display:block;width:48mm!important;height:19mm!important;margin:1mm auto 0;max-width:95%;overflow:visible}
 .tercDupla .tercBloco{width:50%}
 @media print{html,body{width:150mm;height:auto;margin:0!important;padding:0!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}.tercFolha{break-after:page;page-break-after:always}.tercFolha:last-child{break-after:auto;page-break-after:auto}}
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
 pv.innerHTML=`<style>${tercEstilos()}#tercPreview .tercFolha{width:100%;height:100%}#tercPreview .tercBloco{padding:1.5%}</style>${tercFolhaHTML()}`;
 tercAplicarAjustes();
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
  // Aguarda carregamento das imagens antes de capturar a folha de impressão.
  await Promise.all(Array.from(preview.querySelectorAll('img.tercLogoReal')).map(i=>i.decode().catch(()=>{})));
  const folha=tercFolhaPronta();if(!folha)return tercMensagem('Não foi possível montar a etiqueta.');
  const n=Math.min(200,Math.max(1,Number(tercId('tercQtd').value)||1));
  const page=`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta ${tercEscape(tercAtual.codigo)}</title><style>${tercEstilos()}@media screen{body{background:#ddd}.tercFolha{margin:10px auto;box-shadow:0 1px 8px #999}}</style></head><body>${Array(n).fill(folha).join('')}<script>window.onload=async()=>{await Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{})));await document.fonts.ready;window.print()}<\/script></body></html>`;
  const win=window.open('','_blank');if(!win)return tercMensagem('Permita pop-ups para imprimir.');
  win.document.open();win.document.write(page);win.document.close();
 }catch(e){tercMensagem('Erro ao imprimir: '+e.message);}
}

function tercMontarPainelAjustes(){
 const el=tercId('tercPainelAjustes');if(!el)return;
 const nomes={logo:'Logo',qr:'QR Code + moldura',insta:'Texto INSTAGRAM em L',titulo:'Título do produto'};
 const bot=(k,p,d,txt)=>`<button type="button" style="padding:3px 7px;cursor:pointer" onclick="tercAjustar('${k}','${p}',${d})">${txt}</button>`;
 el.innerHTML=Object.entries(nomes).map(([k,n])=>`<div style="border:1px solid #e5e2f3;border-radius:9px;padding:9px;margin:8px 0"><strong>${n}</strong><div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:7px;font-size:12px">Tamanho ${bot(k,'size',-5,'−')} <b data-terc-value="${k}.size">100%</b> ${bot(k,'size',5,'+')} &nbsp; Ângulo ${bot(k,'rot',-5,'−')} <b data-terc-value="${k}.rot">0°</b> ${bot(k,'rot',5,'+')}</div><div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:7px;font-size:12px">Posição ${bot(k,'x',-0.5,'←')} ${bot(k,'y',-0.5,'↑')} ${bot(k,'y',0.5,'↓')} ${bot(k,'x',0.5,'→')} <span>X: <b data-terc-value="${k}.x">0 mm</b> / Y: <b data-terc-value="${k}.y">0 mm</b></span></div></div>`).join('');
 tercAplicarAjustes();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tercMontarPainelAjustes);else tercMontarPainelAjustes();
