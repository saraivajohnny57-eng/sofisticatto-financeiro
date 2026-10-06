// V327: módulo isolado. Nunca grava PDFs; somente dados estruturados.
let tercAtual=null;
const tercId=id=>document.getElementById(id);
const tercEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tercMensagem=s=>{if(tercId('tercAviso'))tercId('tercAviso').textContent=s};
async function buscarEtiquetaTerc(){
 const codigo=tercId('tercBuscaCodigo').value.trim();if(!codigo)return tercMensagem('Digite um código.');
 const {data,error}=await banco.from('etiquetas_terceirizados').select('*').eq('codigo',codigo).maybeSingle();
 if(error)return tercMensagem('Não foi possível consultar. Verifique o SQL de instalação. '+error.message);
 if(!data){tercAtual=null;tercMensagem('Código não cadastrado. Preencha o cadastro na janela aberta.');abrirCadastroTerc(codigo);return;}
 tercAtual=data;tercMensagem('Etiqueta encontrada: '+data.descricao);renderEtiquetaTerc();
}
async function listarEtiquetasTerc(){
 const {data,error}=await banco.from('etiquetas_terceirizados').select('codigo,descricao,grupo').order('descricao').limit(200);
 if(error){tercMensagem('Para usar o cadastro, execute o SQL incluído no pacote. '+error.message);return;}
 tercId('tercLista').innerHTML=(data||[]).map(x=>`<button class="btn azul" style="margin:3px" onclick="tercId('tercBuscaCodigo').value=${JSON.stringify(x.codigo).replace(/</g,'\\u003c')};buscarEtiquetaTerc()">${tercEscape(x.codigo)} — ${tercEscape(x.descricao)}</button>`).join('')||'Nenhuma etiqueta cadastrada.';
}
function abrirCadastroTerc(codigo=''){
 const x=(tercAtual&&(!codigo||codigo===tercAtual.codigo))?tercAtual:{};
 const fields={tercCodigo:codigo||x.codigo||'',tercGrupo:x.grupo||'',tercDescricao:x.descricao||'',tercMarca:x.marca||'',tercBarras:x.codigo_barras||'',tercLargura:x.largura_mm||100,tercAltura:x.altura_mm||150,tercTexto:x.texto||'',tercImagem:x.imagem_url||''};
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
 const item={codigo,descricao,grupo:get('tercGrupo'),marca:get('tercMarca'),codigo_barras:get('tercBarras'),largura_mm:largura,altura_mm:altura,texto:get('tercTexto'),imagem_url:imagem||null,atualizado_em:new Date().toISOString()};
 // Atualizações usam o código original, sem sobrescrever outro produto por engano.
 const original=tercAtual?.codigo;
 if(original&&original!==codigo){const check=await banco.from('etiquetas_terceirizados').select('codigo').eq('codigo',codigo).maybeSingle();if(check.data)return tercId('tercModalAviso').textContent='Este novo código já pertence a outro produto.';}
 const r=original?await banco.from('etiquetas_terceirizados').update(item).eq('codigo',original).select().single():await banco.from('etiquetas_terceirizados').insert(item).select().single();
 if(r.error)return tercId('tercModalAviso').textContent='Erro ao salvar: '+r.error.message;
 tercAtual=r.data;tercId('tercBuscaCodigo').value=codigo;fecharCadastroTerc();renderEtiquetaTerc();listarEtiquetasTerc();tercMensagem('Cadastro salvo no Supabase.');
}
function renderEtiquetaTerc(){
 if(!tercAtual)return;const x=tercAtual;
 const w=Number(x.largura_mm)||100,h=Number(x.altura_mm)||150;
 const pv=tercId('tercPreview');pv.style.width=`${Math.min(480,w*3)}px`;pv.style.height=`${Math.min(480,h*3)}px`;
 pv.innerHTML=`<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:9px;overflow:hidden;font-family:Arial,sans-serif;overflow-wrap:anywhere">${x.imagem_url?`<img alt="Arte" src="${tercEscape(x.imagem_url)}" style="max-height:28%;max-width:95%;object-fit:contain">`:''}<div style="font-size:12px">${tercEscape(x.grupo)}</div><strong style="font-size:19px">${tercEscape(x.descricao)}</strong><div>${tercEscape(x.marca)}</div><div style="white-space:pre-wrap;font-size:12px">${tercEscape(x.texto)}</div><div style="font-family:monospace;letter-spacing:2px;font-size:17px">${tercEscape(x.codigo_barras||x.codigo)}</div><small>Cód. ${tercEscape(x.codigo)}</small></div>`;
 tercId('tercInfoModelo').textContent=`${w} × ${h} mm • ${x.grupo||'Sem grupo'}`;
}
function imprimirEtiquetaTerc(){
 if(!tercAtual)return tercMensagem('Busque uma etiqueta antes de imprimir.');
 const x=tercAtual,n=Math.min(200,Math.max(1,Number(tercId('tercQtd').value)||1));
 const w=Number(x.largura_mm)||100,h=Number(x.altura_mm)||150;
 const preview=tercId('tercPreview').innerHTML;
 const page=`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas ${tercEscape(x.codigo)}</title><style>@page{size:${w}mm ${h}mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial}.label{width:${w}mm;height:${h}mm;padding:4mm;break-after:page;page-break-after:always;overflow:hidden}.label>div{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2mm;overflow-wrap:anywhere}.label img{max-width:90%;max-height:28%;object-fit:contain}@media screen{body{background:#ddd}.label{background:#fff;margin:10px auto;box-shadow:0 1px 8px #999}}</style></head><body>${Array.from({length:n},()=>`<section class="label">${preview}</section>`).join('')}<script>window.onload=()=>window.print()<\/script></body></html>`;
 const win=window.open('','_blank');if(!win)return tercMensagem('Permita pop-ups para imprimir.');win.document.open();win.document.write(page);win.document.close();
}
