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
function tercBlocoEtiqueta(x,unidades){
 const v=tercCamposVariaveis(),logo=x.imagem_url?`<img src="${tercEscape(x.imagem_url)}" style="max-width:45%;max-height:19mm;object-fit:contain">`:`<div style="font-size:5mm;color:#554b92;font-style:italic">Sofisticatto<small style="display:block;font-size:2mm;letter-spacing:2px">COSMÉTICOS</small></div>`;
 const barcode=tercEscape(x.codigo_barras||x.codigo);
 return `<div class="tercBloco"><div class="tercTopo">${logo}<div class="tercQr">INSTAGRAM<br>▦</div></div>
 <div class="tercProduto">${tercEscape(x.descricao)}</div>
 <div class="tercDetalhes">LOTE: ${tercEscape(v.lote)}<br>FAB: ${tercEscape(v.fab)}<br>VAL: ${tercEscape(v.val)}<br>CONTÉM ${tercEscape(unidades)} UN.</div>
 <div class="tercRodape">CÓDIGO: ${tercEscape(x.codigo)}<div class="tercBarras">${barcode}</div></div></div>`;
}
function tercEstilos(){
 return `.tercFolha{width:150mm;height:100mm;display:flex;background:#fff;color:#000;font-family:Arial,sans-serif;box-sizing:border-box;padding:2mm;overflow:hidden}
 .tercBloco{flex:1;min-width:0;border:0.35mm solid #111;display:flex;flex-direction:column;overflow:hidden;padding:2mm}
 .tercTopo{height:28%;display:flex;align-items:center;justify-content:space-around}
 .tercQr{font-size:2.8mm;text-align:center;font-weight:bold}
 .tercProduto{font-size:5mm;font-weight:800;text-align:center;min-height:15%;display:flex;align-items:center;justify-content:center;overflow-wrap:anywhere}
 .tercDetalhes{font-size:4.2mm;line-height:1.6;flex:1}
 .tercRodape{border-top:.3mm solid #111;font-size:3.3mm;padding-top:1mm}
 .tercBarras{font-family:monospace;font-size:5mm;letter-spacing:1mm;text-align:center;border-top:3mm repeating-linear-gradient(90deg,#111 0mm,#111 .5mm,#fff .5mm,#fff 1mm);padding-top:2mm;margin:1mm 2mm 0;overflow:hidden;white-space:nowrap}
 .tercDupla .tercBloco{width:50%}
 @media print{@page{size:150mm 100mm;margin:0}body{margin:0}.tercFolha{break-after:page;page-break-after:always}}
 `;
}
function tercFolhaHTML(){
 const x=tercAtual,v=tercCamposVariaveis(),dupla=(tercId('tercModeloImpressao')?.value||x.modelo)==='dupla';
 return `<div class="tercFolha ${dupla?'tercDupla':''}">${tercBlocoEtiqueta(x,v.unidades)}${dupla?tercBlocoEtiqueta(x,v.unidades2):''}</div>`;
}
function renderEtiquetaTerc(){
 if(!tercAtual)return;
 const x=tercAtual,modelo=tercId('tercModeloImpressao');
 if(modelo&&modelo.dataset.codigo!==x.codigo){modelo.value=x.modelo||'inteira';modelo.dataset.codigo=x.codigo;}
 const pv=tercId('tercPreview');
 pv.style.width='min(100%,750px)';pv.style.height='auto';pv.style.aspectRatio='3 / 2';pv.style.padding='0';
 pv.innerHTML=`<style>${tercEstilos()}#tercPreview .tercFolha{width:100%;height:100%;font-size:inherit}#tercPreview .tercBloco{padding:1.5%}#tercPreview .tercProduto{font-size:clamp(10px,1.5vw,20px)}#tercPreview .tercDetalhes{font-size:clamp(9px,1.2vw,16px)}#tercPreview .tercRodape{font-size:clamp(8px,1vw,14px)}#tercPreview .tercBarras{font-size:clamp(10px,1.4vw,18px)}#tercPreview .tercTopo{font-size:clamp(10px,1.5vw,20px)}</style>${tercFolhaHTML()}`;
 tercId('tercInfoModelo').textContent=`150 × 100 mm • ${x.grupo||'Sem grupo'} • layout aproximado dos modelos BarTender`;
}
function imprimirEtiquetaTerc(){
 if(!tercAtual)return tercMensagem('Busque uma etiqueta antes de imprimir.');
 const n=Math.min(200,Math.max(1,Number(tercId('tercQtd').value)||1));
 const page=`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta ${tercEscape(tercAtual.codigo)}</title><style>${tercEstilos()}@media screen{body{background:#ddd}.tercFolha{margin:10px auto;box-shadow:0 1px 8px #999}}</style></head><body>${Array.from({length:n},()=>tercFolhaHTML()).join('')}<script>window.onload=()=>window.print()<\/script></body></html>`;
 const win=window.open('','_blank');if(!win)return tercMensagem('Permita pop-ups para imprimir.');win.document.open();win.document.write(page);win.document.close();
}
