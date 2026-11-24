/* Impressao de envelope Sofisticatto, independente da pre-postagem Correios. */
(function(){
 'use strict';
 const STORAGE='sofisticatto_envelope_correios_115x230_v1';
 const LOGO='/assets/sofisticatto-logo.jpeg';
 // Correios anteriormente configurado: envelope fisico 115 x 230 mm (retrato na Brother);
 // arte 220 x 110 mm (paisagem) rotacionada 90 graus na impressao.
 const VALORES={modo:'envelope',x:0,y:0,documento:false,nota:true};
 const ids=['nome','doc','rua','numero','compl','bairro','cep','cidade','uf','nf'];
 let inicializado=false;
 function el(id){return document.getElementById('env'+id);}
 function somenteNumero(s){return String(s||'').replace(/\D/g,'');}
 function textoSeguro(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function valor(id){return el(id)?.value?.trim()||'';}
 function textoNo(id,s){const n=el(id);if(n)n.textContent=s||'';}
 function dadosRemetente(){
  const ler=(id,def)=>document.getElementById(id)?.value?.trim()||def;
  return {
   nome:ler('corRemNome','SOFISTICATTO COSMÉTICOS'),
   documento:ler('corRemDocumento','05.451.985/0001-95'),
   rua:ler('corRemEndereco','RUA 4, Nº 217'),
   bairro:ler('corRemBairro','VILA ABAJÁ'),
   cep:ler('corRemCep','74550-470'),
   cidade:ler('corRemCidade','GOIÂNIA'),
   uf:ler('corRemUf','GO')
  };
 }
 function configuracao(){
  let p={...VALORES};
  try{p={...p,...JSON.parse(localStorage.getItem(STORAGE)||'{}')}}catch(_){}
  return p;
 }
 function guardar(){
  const p={
   modo:valor('Modo')==='a4'?'a4':'envelope',
   x:Math.max(-5,Math.min(5,Number(valor('X'))||0)),
   y:Math.max(-5,Math.min(5,Number(valor('Y'))||0)),
   documento:!!el('Documento')?.checked,
   nota:!!el('Nota')?.checked
  };
  try{localStorage.setItem(STORAGE,JSON.stringify(p))}catch(_){}
  textoNo('Info','Posição e opções salvas somente neste navegador.');
  atualizar();
 }
 function dados(){
  const dest={};
  for(const id of ids)dest[id]=valor(id.charAt(0).toUpperCase()+id.slice(1));
  return {dest,rem:dadosRemetente(),config:configuracao()};
 }
 function enderecoSemNumeroRepetido(rua,numero){
  const logradouro=String(rua||'').trim().replace(/\s+/g,' ');
  const nro=String(numero||'').trim().replace(/^(?:N[º°.]?|NRO\.?|NR\.?|NUMERO|NÚMERO)\s*[:.°º-]*\s*/i,'');
  if(!nro)return logradouro;
  const escaped=nro.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
  const padrao=new RegExp('(?:\\s*[,;–-]\\s*|\\s+)(?:(?:N[º°.]?|NRO\\.?|NR\\.?|NUMERO|NÚMERO)\\s*[:.°º-]*\\s*)?'+escaped+'\\s*$','i');
  return logradouro.replace(padrao,'').replace(/[\s,;–-]+$/,'').trim()||logradouro;
 }
 function endDest(d){
  const numero=String(d.numero||'').trim().replace(/^(?:N[º°.]?|NRO\.?|NR\.?|NUMERO|NÚMERO)\s*[:.°º-]*\s*/i,'');
  const rua=[enderecoSemNumeroRepetido(d.rua,numero),numero?'nº '+numero:''].filter(Boolean).join(', ');
  return [rua,d.compl,d.bairro,[d.cidade,d.uf].filter(Boolean).join(' / '),
   d.cep?('CEP '+d.cep):''].filter(Boolean);
 }
 function endRem(r){
  return [r.rua,r.bairro,[r.cidade,r.uf].filter(Boolean).join(' / '),
   r.cep?'CEP '+r.cep:''].filter(Boolean);
 }
 function validar(){const d=dados().dest;
  const faltam=['nome','rua','bairro','cidade','uf','cep'].filter(k=>!d[k]);
  if(d.cep&&somenteNumero(d.cep).length!==8)faltam.push('CEP com 8 dígitos');
  if(d.uf&&!/^[A-Za-z]{2}$/.test(d.uf))faltam.push('UF com 2 letras');
  return [...new Set(faltam)];
 }
 function atualizar(){
  if(!inicializado)return;
  const d=dados(),missing=validar();
  textoNo('PrevRemNome',d.rem.nome);textoNo('PrevRemCnpj',d.rem.documento);
  textoNo('PrevRemEndereco',endRem(d.rem).join('  ·  '));
  textoNo('PrevDestNome',d.dest.nome||'NOME DO DESTINATÁRIO');
  textoNo('PrevDestDoc',d.config.documento&&d.dest.doc?d.dest.doc:'');
  textoNo('PrevDestEndereco',endDest(d.dest).join('\n'));
  textoNo('PrevNf',d.config.nota&&d.dest.nf?'REFERÊNCIA: NF-e '+d.dest.nf:'');
  textoNo('Status',missing.length?'Preencha ou confira: '+missing.join(', ')+'.':
   'Dados completos. Confira a prévia e o sentido de alimentação do envelope.');
  const atual=d.config;
  textoNo('Medida',atual.modo==='a4'?'A4 para conferência — conteúdo em 220 × 110 mm':
   'Envelope 115 × 230 mm (papel retrato; arte 220 × 110 mm girada 90°)');
  const p=el('Papel');
  if(p)p.style.transform='translate('+atual.x*0.15+'px,'+atual.y*0.15+'px)';
 }
 function child(parent,name){
  if(!parent)return null;
  return Array.from(parent.children||[]).find(n=>n.localName===name)||null;
 }
 function tag(parent,name){return child(parent,name)?.textContent?.trim()||'';}
 function formatCep(v){const n=somenteNumero(v).slice(0,8);return n.length>5?n.slice(0,5)+'-'+n.slice(5):n;}
 function formatDoc(v){
  const n=somenteNumero(v);
  if(n.length===11)return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
  if(n.length===14)return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
  return v||'';
 }
 async function importarXml(e){
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>2_000_000||file.size<100){
   textoNo('Status','XML fora do limite de 100 bytes a 2 MB.');return;
  }
  try{
   const xml=await file.text();
   if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('XML com DTD/entidades não é permitido.');
   const doc=new DOMParser().parseFromString(xml,'application/xml');
   if(doc.getElementsByTagName('parsererror').length)throw Error('XML inválido.');
   const inf=doc.getElementsByTagNameNS('*','infNFe')[0]||doc.getElementsByTagName('infNFe')[0];
   if(!inf)throw Error('Arquivo não contém uma NF-e (infNFe).');
   const origem=valor('Origem')==='emit'?'emit':'dest';
   const parte=child(inf,origem),end=child(parte,origem==='emit'?'enderEmit':'enderDest');
   if(!parte||!end)throw Error('NF-e sem dados de endereço de '+(origem==='emit'?'emitente':'destinatário')+'.');
   const campos={
    Nome:tag(parte,'xNome'),Doc:formatDoc(tag(parte,'CNPJ')||tag(parte,'CPF')),
    Rua:tag(end,'xLgr'),Numero:tag(end,'nro'),Compl:tag(end,'xCpl'),Bairro:tag(end,'xBairro'),
    Cep:formatCep(tag(end,'CEP')),Cidade:tag(end,'xMun'),Uf:tag(end,'UF'),
    Nf:tag(child(inf,'ide'),'nNF')
   };
   for(const [id,v] of Object.entries(campos)){if(el(id))el(id).value=v||'';}
   atualizar();
   textoNo('Info','NF-e '+(campos.Nf||'sem número')+' importada. Confira endereço e número antes de imprimir.');
  }catch(err){
   textoNo('Info','Não foi possível importar: '+String(err.message||err));
  }
 }
 function criarImpressao(){
  const faltam=validar();
  if(faltam.length){textoNo('Status','Corrija antes de imprimir: '+faltam.join(', '));return;}
  const {dest,rem,config}=dados();
  const modo=config.modo==='a4'?'a4':'envelope';
  const p=window.open('','_blank','width=1050,height=780');
  if(!p){textoNo('Status','O navegador bloqueou a janela. Libere pop-ups para imprimir.');return;}
  // Sem rede externa nem envio de XML; todo o documento e montado no navegador.
  const htmlEnd=s=>textoSeguro(s).replace(/\n/g,'<br>');
  const remHTML='<div class="rem"><strong>REMETENTE</strong><div class="rn">'+htmlEnd(rem.nome)+
    '</div><div>'+htmlEnd(rem.documento)+'</div><div>'+htmlEnd(endRem(rem).join(' · '))+'</div></div>';
  const destHTML='<div class="dest"><strong>DESTINATÁRIO</strong><div class="dn">'+htmlEnd(dest.nome)+
    '</div>'+(config.documento&&dest.doc?'<div>'+htmlEnd(dest.doc)+'</div>':'')+
    '<div class="end">'+htmlEnd(endDest(dest).join('\n'))+'</div></div>';
  const nfHTML=(config.nota&&dest.nf?'<div class="nf">Referência: NF-e '+textoSeguro(dest.nf)+'</div>':'');
  const imageUrl=location.origin+LOGO;
  const align='translate('+(112.5+config.x)+'mm,'+(5+config.y)+'mm) rotate(90deg)';
  const offsetA4='translate('+(Math.max(0,config.x))+'mm,'+(Math.max(0,config.y))+'mm)';
  const printCss=modo==='a4'?'@page{size:A4 portrait;margin:0} .sheet{width:210mm;height:297mm;} .art{left:5mm;top:45mm;width:200mm;height:100mm;transform:'+offsetA4+';}':
    '@page{size:115mm 230mm;margin:0} .sheet{width:115mm;height:230mm;} .art{width:220mm;height:110mm;left:0;top:0;transform-origin:top left;transform:'+align+';}';
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Envelope Sofisticatto</title>'+
  '<style>html,body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#161616;background:#ededf0}'+
  '.toolbar{padding:12px 20px;background:#fff;border-bottom:1px solid #ddd;position:sticky;top:0;z-index:2}'+
  'button{border:0;border-radius:8px;background:#594b9e;color:white;padding:11px 18px;font-weight:700;cursor:pointer}'+
  '.toolbar small{margin-left:12px;color:#51476c}.sheet{position:relative;background:white;margin:20px auto;box-shadow:0 1px 14px #0002;overflow:hidden}'+
  '.art{position:absolute;border:0;box-sizing:border-box;background:#fff;overflow:hidden}'+
  '.art img{position:absolute;left:3.5%;top:6%;width:23%;height:21%;object-fit:contain;object-position:left center}'+
  '.rem{position:absolute;left:4%;top:30%;width:37%;font-size:9pt;line-height:1.35;overflow-wrap:anywhere}'+
  '.rem strong,.dest strong{display:block;font-size:8pt;letter-spacing:1px;margin-bottom:7px}.rn{font-weight:bold;font-size:10pt}'+
  '.dest{position:absolute;left:59%;top:34%;width:36%;font-size:10pt;line-height:1.32;overflow-wrap:anywhere}'+
  '.dn{font-size:13pt;font-weight:bold;line-height:1.22;margin-bottom:8px}.end{white-space:normal;font-size:10pt}'+
  '.nf{position:absolute;right:5%;top:87%;width:36%;text-align:right;font-size:8pt;color:#444}'+
  printCss+
  '@media print{html,body{width:100%;height:100%;background:white}.toolbar{display:none!important}'+
  '.sheet{box-shadow:none!important;margin:0!important;break-after:page;page-break-after:avoid}'+
  'html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'+
  '</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Imprimir / Salvar como PDF</button>'+
  '<small>'+(modo==='a4'?'Conferência em A4':'Brother: mídia Envelope 115 × 230 mm, alimentação manual/bandeja central, retrato, escala 100%')+'</small></div>'+
  '<div class="sheet"><div class="art"><img alt="Sofisticatto" src="'+textoSeguro(imageUrl)+'">'+
  remHTML+destHTML+nfHTML+'</div></div></body></html>';
  p.document.open();p.document.write(html);p.document.close();
  textoNo('Info','Prévia de impressão aberta. Na Brother, escolha envelope 115 × 230 mm, origem manual e escala 100%.');
 }
 function montar(){
  const root=document.getElementById('envelopeRoot');
  if(!root||inicializado)return;
  root.innerHTML=[
  '<div class="env-grid"><div class="card">',
  '<h2>Impressão em envelope</h2><p>Mesma configuração dos Correios: papel 115 × 230 mm na bandeja central, com arte de 220 × 110 mm girada 90°.</p>',
  '<label class="relatorio-label">Importar XML da NF-e</label><input id="envXml" type="file" accept=".xml,text/xml,application/xml">',
  '<label class="relatorio-label">Obter endereço de</label><select id="envOrigem"><option value="dest">Destinatário da NF-e (cliente)</option><option value="emit">Emitente da NF-e</option></select>',
  '<div class="env-fields"><label>Nome / Razão social<input id="envNome"></label><label>CPF/CNPJ<input id="envDoc"></label>',
  '<label>Logradouro<input id="envRua"></label><label>Número<input id="envNumero"></label>',
  '<label>Complemento<input id="envCompl"></label><label>Bairro<input id="envBairro"></label>',
  '<label>CEP<input id="envCep" maxlength="9" inputmode="numeric"></label><label>Cidade<input id="envCidade"></label>',
  '<label>UF<input id="envUf" maxlength="2"></label><label>NF-e (opcional)<input id="envNf"></label></div>',
  '<button type="button" id="envRemCorreios" class="btn azul">Atualizar remetente dos Correios</button>',
  '<p id="envRemResumo" class="env-sender"></p>',
  '<div class="env-controls"><label>Modelo de impressão<select id="envModo"><option value="envelope">Envelope Correios · 115 × 230 mm</option><option value="a4">Conferência em folha A4</option></select></label>',
  '<label>Correção X (mm)<input id="envX" type="number" min="-5" max="5" step="0.5"></label>',
  '<label>Correção Y (mm)<input id="envY" type="number" min="-5" max="5" step="0.5"></label></div>',
  '<label class="env-check"><input type="checkbox" id="envDocumento"> Mostrar CPF/CNPJ do destinatário</label>',
  '<label class="env-check"><input type="checkbox" id="envNota"> Mostrar referência da NF-e</label>',
  '<div class="env-actions"><button type="button" id="envImprimir" class="btn roxo">Imprimir envelope / salvar PDF</button>',
  '<button type="button" id="envLimpar" class="btn">Limpar destinatário</button></div>',
  '<p id="envInfo" class="env-info" role="status"></p></div>',
  '<div class="card"><h2>Prévia do envelope</h2><p id="envMedida"></p>',
  '<div class="env-frame"><div class="env-paper" id="envPapel"><img class="env-logo" src="'+LOGO+'" alt="Logo Sofisticatto">',
  '<div class="env-rem"><strong>REMETENTE</strong><b id="envPrevRemNome"></b><small id="envPrevRemCnpj"></small><span id="envPrevRemEndereco"></span></div>',
  '<div class="env-dest"><strong>DESTINATÁRIO</strong><b id="envPrevDestNome">NOME DO DESTINATÁRIO</b><small id="envPrevDestDoc"></small>',
  '<span id="envPrevDestEndereco"></span></div><div class="env-nf" id="envPrevNf"></div>',
  '</div></div><p class="env-info" id="envStatus" role="status"></p>',
  '<p class="env-info">Este é apenas o endereçamento do envelope, não uma etiqueta de postagem com rastreio. Para Carta Registrada, use a postagem oficial dos Correios.</p>',
  '<p class="env-info">Na Brother: tipo de mídia <b>Envelope</b>, papel personalizado <b>115 × 230 mm</b>, orientação <b>Retrato</b>, alimentação <b>Manual / bandeja central</b>, escala <b>100%</b>, sem duplex.</p>',
  '</div></div>'
  ].join('');
  const style=document.createElement('style');style.id='envelopeEstilo';
  style.textContent=[
   '#emailSubEnvelope{width:100%;min-width:0}',
   '.env-grid{display:grid;grid-template-columns:minmax(320px,470px) minmax(0,1fr);gap:18px}',
   '#emailSubEnvelope .card{min-width:0;padding:22px}',
   '#emailSubEnvelope .relatorio-label{display:block;margin-top:13px;font-size:13px;font-weight:600}',
   '#emailSubEnvelope input:not([type=checkbox]),#emailSubEnvelope select{max-width:100%;width:100%;box-sizing:border-box;border:1px solid #d7c9ed;border-radius:8px;padding:10px;background:#f7f5fc}',
   '.env-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}',
   '.env-fields label,.env-controls label{font-size:13px;font-weight:600;color:#5a4f90}',
   '.env-fields input,.env-controls input{display:block;margin-top:4px}',
   '.env-controls{display:grid;grid-template-columns:2fr 1fr 1fr;gap:9px;margin:16px 0}',
   '.env-check{display:block;margin:8px 0;font-size:13px}',
   '.env-actions{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}',
   '.env-sender,.env-info{color:#6c619b;font-size:12px;line-height:1.45}',
   '.env-frame{overflow-x:auto;border:1px solid #d5cbe7;border-radius:12px;background:#f9f7fc;padding:16px}',
   '.env-paper{position:relative;width:100%;max-width:870px;aspect-ratio:2;background:white;border:1px solid #b2a9c0;box-shadow:0 2px 8px #0001;overflow:hidden;font-family:Arial,sans-serif;color:#202020}',
   '.env-paper .env-logo{position:absolute;left:3.5%;top:6%;width:23%;height:21%;object-fit:contain;object-position:left center}',
   '.env-rem{position:absolute;left:4%;top:30%;width:37%;font-size:clamp(7px,1vw,12px);line-height:1.35;overflow-wrap:anywhere}',
   '.env-rem strong,.env-dest strong{display:block;font-size:.88em;margin-bottom:7px;letter-spacing:1px}',
   '.env-rem b,.env-dest b,.env-rem small,.env-dest small,.env-rem span,.env-dest span{display:block}',
   '.env-dest{position:absolute;left:59%;top:34%;width:36%;font-size:clamp(8px,1.05vw,13px);line-height:1.3;overflow-wrap:anywhere}',
   '.env-dest b{font-size:1.18em;line-height:1.22;margin-bottom:7px}',
   '#envPrevDestEndereco{white-space:pre-line}',
   '.env-nf{position:absolute;right:5%;top:87%;width:36%;text-align:right;font-size:clamp(7px,.85vw,11px)}',
   '@media(max-width:900px){.env-grid{grid-template-columns:1fr}.env-rem{font-size:1.45vw}.env-dest{font-size:1.65vw}}',
   '@media(max-width:580px){.env-fields{grid-template-columns:1fr}.env-controls{grid-template-columns:1fr 1fr}.env-controls label:first-child{grid-column:1/-1}.env-rem{font-size:2vw}.env-dest{font-size:2.2vw}}'
  ].join('\n');
  document.head.appendChild(style);
  const p=configuracao();
  el('Modo').value=p.modo;el('X').value=p.x;el('Y').value=p.y;
  el('Documento').checked=!!p.documento;el('Nota').checked=!!p.nota;
  el('Xml').addEventListener('change',importarXml);
  for(const id of ids){const e=el(id.charAt(0).toUpperCase()+id.slice(1));if(e)e.addEventListener('input',atualizar);}
  el('Cep').addEventListener('blur',()=>{el('Cep').value=formatCep(el('Cep').value);atualizar();});
  el('Uf').addEventListener('blur',()=>{el('Uf').value=valor('Uf').toUpperCase();atualizar();});
  for(const id of ['Modo','X','Y','Documento','Nota'])el(id).addEventListener('change',guardar);
  el('Imprimir').addEventListener('click',criarImpressao);
  el('RemCorreios').addEventListener('click',()=>{
    textoNo('RemResumo',dadoRemetenteResumo());atualizar();
  });
  el('Limpar').addEventListener('click',()=>{
   for(const id of ids)el(id.charAt(0).toUpperCase()+id.slice(1)).value='';
   el('Xml').value='';atualizar();textoNo('Info','Destinatário limpo.');
  });
  inicializado=true;
  textoNo('RemResumo',dadoRemetenteResumo());
  atualizar();
 }
 function dadoRemetenteResumo(){const r=dadosRemetente();return 'Remetente: '+r.nome+' · '+r.documento+' · '+endRem(r).join(' · ');}
 window.inicializarImpressaoEnvelopeSofisticatto=montar;
})();
