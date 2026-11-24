/* Impressao de envelope Sofisticatto, independente da pre-postagem Correios. */
(function(){
 'use strict';
 const STORAGE='sofisticatto_envelope_correios_115x230_v1';
 const LOGO='/assets/sofisticatto-logo.jpeg';
 // Envelope medido: 229 x 114 mm (retrato 114 x 229 mm na Brother).
 // Arte paisagem 229 x 114 mm, rotacionada 90° na impressao.
 // Mantemos como opcao a regulagem anterior de papel 115 x 230 mm.
 const VALORES={modo:'envelope',x:0,y:0,documento:false,nota:true,
  // remY alto leva o REMETENTE ao lado oposto do envelope depois da rotação.
  // A função posicaoPermitida ajusta para a margem física de 10 mm considerando a altura real.
  remX:5,remY:104,remAng:0,destX:124,destY:28,destAng:0};
 // Coordenadas da arte: 229 x 114 mm, girada 90° para o envelope 114 x 229 mm.
 // A moldura de 10 mm é uma zona segura da arte (não é impressa).
 const TAMANHO={w:229,h:114,margem:10};
 const BLOCOS={rem:{w:78,baixo:104},dest:{w:85,baixo:104}};
 const LAYOUT_VERSAO=5;
 const limitar=(v,min,max)=>Math.max(min,Math.min(max,v));
 const arredondar=v=>Math.round(v*10)/10;
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
  try{
   const antigo=JSON.parse(localStorage.getItem(STORAGE)||'{}');
   if(antigo&&typeof antigo==='object'&&!Array.isArray(antigo))p={...p,...antigo};
  }catch(_){}
  // Migração v5: aproxima apenas o remetente da lateral. Mantém destinatário.
  // Preserva o destinatário que já foi aprovado e as correções de impressão.
  if(Number(p.layoutVersao)!==LAYOUT_VERSAO){
   p.remX=VALORES.remX;
   p.remY=VALORES.remY;
   p.remAng=VALORES.remAng;
   p.layoutVersao=LAYOUT_VERSAO;
   persistirConfig(p);
  }
  for(const chave of ['x','y','remX','remY','remAng','destX','destY','destAng']){
   const n=Number(p[chave]);p[chave]=Number.isFinite(n)?n:VALORES[chave];
  }
  p.x=limitar(p.x,-5,5);p.y=limitar(p.y,-5,5);
  p.remAng=limitar(p.remAng,-5,5);p.destAng=limitar(p.destAng,-5,5);
  if(p.modo!=='a4'&&p.modo!=='envelope115')p.modo='envelope';
  return p;
 }
 function persistirConfig(p){
  try{localStorage.setItem(STORAGE,JSON.stringify(p))}catch(_){}
 }
 function guardar(){
  const p={...configuracao(),
   modo:['a4','envelope115'].includes(valor('Modo'))?valor('Modo'):'envelope',
   x:limitar(Number(valor('X'))||0,-5,5),
   y:limitar(Number(valor('Y'))||0,-5,5),
   documento:!!el('Documento')?.checked,
   nota:!!el('Nota')?.checked
  };
  persistirConfig(p);
  textoNo('Info','Ajustes salvos neste navegador e aplicados à impressão.');
  atualizar();
 }
 function alturaBlocoMm(tipo){
  const papel=el('Papel'),item=el(tipo==='rem'?'ArrastarRem':'ArrastarDest');
  if(!papel?.clientWidth||!item)return tipo==='rem'?46:52;
  return item.offsetHeight*TAMANHO.w/papel.clientWidth;
 }
 function limitesBloco(tipo,p){
  const bloco=BLOCOS[tipo],ang=Number(p[tipo+'Ang'])||0;
  const rad=Math.abs(ang)*Math.PI/180;
  const cos=Math.cos(rad),sen=Math.sin(rad);
  const w=bloco.w,h=alturaBlocoMm(tipo);
  const metadeX=(w*cos+h*sen)/2,metadeY=(w*sen+h*cos)/2;
  // Coordenadas exatas após a rotação de 90°: xPapel=114+p.x-yArte,
  // yPapel=p.y+xArte. Conserva 10 mm físicos de cada lado da mídia 114x229.
  // Reserva outros 10 mm no final da alimentação para minimizar cortes.
  // O remetente pode se aproximar até 5 mm da margem do arquivo.
  // Para distância física precisa, o driver NÃO pode estar configurado em A4.
  const minArteX=tipo==='rem'?Math.max(5,5-p.y):Math.max(10,10-p.y);
  const maxArteX=Math.min(209,219-p.y);
  const minArteY=Math.max(10,10+p.x),maxArteY=Math.min(bloco.baixo,104+p.x);
  return {
   minX:minArteX+metadeX-w/2,maxX:maxArteX-metadeX-w/2,
   minY:minArteY+metadeY-h/2,maxY:maxArteY-metadeY-h/2,
   cabe:h>0&&minArteX+2*metadeX<=maxArteX+0.05&&minArteY+2*metadeY<=maxArteY+0.05
  };
 }
 function posicaoPermitida(tipo,p){
  const l=limitesBloco(tipo,p);
  return {
   x:arredondar(limitar(p[tipo+'X'],l.minX,Math.max(l.minX,l.maxX))),
   y:arredondar(limitar(p[tipo+'Y'],l.minY,Math.max(l.minY,l.maxY))),
   cabe:l.cabe
  };
 }
 function aplicarLayout(){
  const papel=el('Papel');if(!papel)return[];
  const largura=papel.clientWidth;
  // 10 pt = 3,5278 mm. Mantém na prévia a mesma fonte da impressão.
  if(largura)papel.style.fontSize=(largura/TAMANHO.w*3.52778)+'px';
  let p=configuracao(),mudou=false;
  for(const tipo of ['rem','dest']){
   const bloco=el(tipo==='rem'?'ArrastarRem':'ArrastarDest');
   if(!bloco)continue;
   bloco.style.width=(BLOCOS[tipo].w/TAMANHO.w*100)+'%';
  }
  const alertas=[];
  for(const tipo of ['rem','dest']){
   const bloco=el(tipo==='rem'?'ArrastarRem':'ArrastarDest');
   if(!bloco)continue;
   const pos=posicaoPermitida(tipo,p);
   if(!pos.cabe)alertas.push(tipo==='rem'?'remetente':'destinatário');
   if(p[tipo+'X']!==pos.x||p[tipo+'Y']!==pos.y)mudou=true;
   p[tipo+'X']=pos.x;p[tipo+'Y']=pos.y;
   if(tipo==='rem'&&el('RemMargem'))el('RemMargem').value=String(pos.x);
   bloco.style.left=(pos.x/TAMANHO.w*100)+'%';
   bloco.style.top=(pos.y/TAMANHO.h*100)+'%';
   bloco.style.transform='rotate('+p[tipo+'Ang']+'deg)';
   const rotulo=el(tipo==='rem'?'RemAngulo':'DestAngulo');
   if(rotulo)rotulo.textContent=p[tipo+'Ang']+'°';
  }
  if(mudou)persistirConfig(p);
  // X/Y são correções no papel retrato. A arte gira 90° ao imprimir.
  if(largura)papel.style.transform='translate('+(p.y*largura/TAMANHO.w)+'px,'+(-p.x*largura/TAMANHO.w)+'px)';
  return alertas;
 }
 function mudarAngulo(tipo,delta){
  const p=configuracao();
  p[tipo+'Ang']=limitar(Math.round(p[tipo+'Ang']+delta),-5,5);
  persistirConfig(p);atualizar();
  textoNo('Info','Ângulo do '+(tipo==='rem'?'remetente':'destinatário')+
   ' ajustado para '+p[tipo+'Ang']+'°. Alteração salva para impressão.');
 }
 function conectarArraste(tipo){
  const bloco=el(tipo==='rem'?'ArrastarRem':'ArrastarDest'),papel=el('Papel');
  if(!bloco||!papel)return;
  let inicio=null;
  bloco.addEventListener('pointerdown',e=>{
   if(e.button!==0||!papel.clientWidth)return;
   const p=configuracao();
   inicio={id:e.pointerId,mouseX:e.clientX,mouseY:e.clientY,x:p[tipo+'X'],y:p[tipo+'Y']};
   bloco.setPointerCapture(e.pointerId);
   bloco.classList.add('env-arrastando');
   e.preventDefault();
  });
  bloco.addEventListener('pointermove',e=>{
   if(!inicio||e.pointerId!==inicio.id||!papel.clientWidth)return;
   const mmPorPx=TAMANHO.w/papel.getBoundingClientRect().width;
   const p=configuracao();
   p[tipo+'X']=inicio.x+(e.clientX-inicio.mouseX)*mmPorPx;
   p[tipo+'Y']=inicio.y+(e.clientY-inicio.mouseY)*mmPorPx;
   const pos=posicaoPermitida(tipo,p);
   p[tipo+'X']=pos.x;p[tipo+'Y']=pos.y;
   persistirConfig(p);
   aplicarLayout();
  });
  const terminar=e=>{
   if(!inicio||e.pointerId!==inicio.id)return;
   inicio=null;bloco.classList.remove('env-arrastando');
   atualizar();textoNo('Info','Posição do '+(tipo==='rem'?'remetente':'destinatário')+
    ' salva. A impressão seguirá esta prévia.');
  };
  bloco.addEventListener('pointerup',terminar);
  bloco.addEventListener('pointercancel',terminar);
 }
 function restaurarBlocos(){
  const p=configuracao();
  for(const tipo of ['rem','dest'])
   for(const campo of ['X','Y','Ang'])p[tipo+campo]=VALORES[tipo+campo];
  persistirConfig(p);atualizar();
  textoNo('Info','Posições e ângulos restaurados, respeitando a margem de 1 cm.');
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
  textoNo('PrevRemEndereco',endRem(d.rem).join('\n'));
  textoNo('PrevDestNome',d.dest.nome||'NOME DO DESTINATÁRIO');
  textoNo('PrevDestDoc',d.config.documento&&d.dest.doc?d.dest.doc:'');
  textoNo('PrevDestEndereco',endDest(d.dest).join('\n'));
  textoNo('PrevNf',d.config.nota&&d.dest.nf?'Referência: NF-e '+d.dest.nf:'');
  const fora=aplicarLayout();
  textoNo('Status',missing.length?'Preencha ou confira: '+missing.join(', ')+'.':
   fora.length?'Atenção: o texto de '+fora.join(' e ')+' não cabe na área segura. Reduza o endereço ou os dados antes de imprimir.':
   'Prévia com margem segura de 1 cm. Arraste os blocos; as posições também serão usadas na impressão.');
  const atual=d.config;
  textoNo('Medida',atual.modo==='a4'?'A4 para conferência — arte 229 × 114 mm':
   atual.modo==='envelope115'?'Envelope 115 × 230 mm (ajuste anterior; arte 229 × 114 mm girada 90°)':
   'Envelope 114 × 229 mm (medida informada; arte 229 × 114 mm girada 90°)');

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
  const fora=aplicarLayout();
  if(fora.length){
   textoNo('Status','Texto fora da área segura: '+fora.join(', ')+'. Reduza o endereço para imprimir sem cortes.');
   return;
  }
  const faltam=validar();
  if(faltam.length){textoNo('Status','Corrija antes de imprimir: '+faltam.join(', '));return;}
  const {dest,rem,config}=dados();
  const modo=config.modo;
  const p=window.open('','_blank','width=1050,height=780');
  if(!p){textoNo('Status','O navegador bloqueou a janela. Libere pop-ups para imprimir.');return;}
  // Sem rede externa nem envio de XML; todo o documento e montado no navegador.
  const htmlEnd=s=>textoSeguro(s).replace(/\n/g,'<br>');
  const remHTML='<div class="rem" style="'+estiloBloco('rem')+'"><strong>REMETENTE</strong><div class="rn">'+htmlEnd(rem.nome)+
    '</div><div>'+htmlEnd(rem.documento)+'</div><div>'+htmlEnd(endRem(rem).join('\n'))+'</div></div>';
  // A referência integra o destinatário e acompanha sua posição e rotação.
  const destHTML='<div class="dest" style="'+estiloBloco('dest')+'"><strong>DESTINATÁRIO</strong><div class="dn">'+htmlEnd(dest.nome)+
    '</div>'+(config.documento&&dest.doc?'<div>'+htmlEnd(dest.doc)+'</div>':'')+
    '<div class="end">'+htmlEnd(endDest(dest).join('\n'))+'</div>'+
    (config.nota&&dest.nf?'<div class="ref-nfe">Referência: NF-e '+textoSeguro(dest.nf)+'</div>':'')+'</div>';
  const imageUrl=location.origin+LOGO;
  // A folha fica em retrato, mas a arte tem 229x114 mm e recebe rotação de 90°.
  const papelAnterior=modo==='envelope115';
  const larguraPapel=papelAnterior?115:114;
  const alturaPapel=papelAnterior?230:229;
  const margemCentral=papelAnterior?0.5:0;
  const align='translate('+(114+margemCentral+config.x)+'mm,'+(margemCentral+config.y)+'mm) rotate(90deg)';
  const printCss=modo==='a4'?
   '@page{size:A4 portrait;margin:0}.sheet{width:210mm;height:297mm}.art{left:10mm;top:45mm;width:229mm;height:114mm;transform-origin:top left;transform:translate('+config.x+'mm,'+config.y+'mm) scale(.82)}':
   '@page{size:'+larguraPapel+'mm '+alturaPapel+'mm;margin:0}.sheet{width:'+larguraPapel+'mm;height:'+alturaPapel+'mm}.art{width:229mm;height:114mm;left:0;top:0;transform-origin:top left;transform:'+align+'}';
  function estiloBloco(tipo){
   const pos=posicaoPermitida(tipo,config);
   return 'left:'+pos.x+'mm;top:'+pos.y+'mm;width:'+BLOCOS[tipo].w+'mm;transform:rotate('+config[tipo+'Ang']+'deg);';
  }
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Envelope Sofisticatto</title>'+
  '<style>html,body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#161616;background:#ededf0}'+
  '.toolbar{padding:12px 20px;background:#fff;border-bottom:1px solid #ddd;position:sticky;top:0;z-index:2}'+
  'button{border:0;border-radius:8px;background:#594b9e;color:white;padding:11px 18px;font-weight:700;cursor:pointer}'+
  '.toolbar small{margin-left:12px;color:#51476c}.sheet{position:relative;background:white;margin:20px auto;box-shadow:0 1px 14px #0002;overflow:hidden}'+
  '.art{position:absolute;border:0;box-sizing:border-box;background:#fff;overflow:hidden}'+
  '.art img{position:absolute;left:10mm;top:10mm;width:45mm;height:22mm;object-fit:contain;object-position:left center}'+
  '.rem{position:absolute;font-size:9pt;line-height:1.35;overflow-wrap:anywhere;transform-origin:top left}'+
  '.rem strong,.dest strong{display:block;font-size:8pt;letter-spacing:.4px;margin-bottom:2mm}.rn{font-weight:bold;font-size:10pt}'+
  '.dest{position:absolute;font-size:10pt;line-height:1.32;overflow-wrap:anywhere;transform-origin:top left}'+
  '.dn{font-size:13pt;font-weight:bold;line-height:1.22;margin-bottom:2mm}.end{white-space:normal;font-size:10pt}'+
  '.ref-nfe{display:block;margin-top:3mm;font-size:8pt;line-height:1.3;color:#444;overflow-wrap:anywhere}'+
  printCss+
  '@media print{html,body{width:100%;height:100%;background:white}.toolbar{display:none!important}'+
  '.sheet{box-shadow:none!important;margin:0!important;break-after:page;page-break-after:avoid}'+
  'html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'+
  '</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Imprimir / Salvar como PDF</button>'+
  '<small>'+(modo==='a4'?'Conferência em A4':'Brother: tamanho do papel '+(papelAnterior?'115 × 230':'114 × 229')+' mm (NÃO A4), alimentação manual, escala 100%')+'</small></div>'+
  '<div class="sheet"><div class="art"><img alt="Sofisticatto" src="'+textoSeguro(imageUrl)+'">'+
  remHTML+destHTML+'</div></div></body></html>';
  p.document.open();p.document.write(html);p.document.close();
  textoNo('Info','Prévia aberta. Na Brother, escolha exatamente '+(papelAnterior?'115 × 230':'114 × 229')+' mm, alimentação manual e escala 100%.');
 }
 function montar(){
  const root=document.getElementById('envelopeRoot');
  if(!root||inicializado)return;
  root.innerHTML=[
  '<div class="env-grid"><div class="card">',
  '<h2>Impressão em envelope</h2><p>Envelope 229 × 114 mm (papel 114 × 229 mm na bandeja central). Arte girada 90° na impressão. Para evitar margens excessivas, não use A4 no driver Brother.</p>',
  '<label class="relatorio-label">Importar XML da NF-e</label><input id="envXml" type="file" accept=".xml,text/xml,application/xml">',
  '<label class="relatorio-label">Obter endereço de</label><select id="envOrigem"><option value="dest">Destinatário da NF-e (cliente)</option><option value="emit">Emitente da NF-e</option></select>',
  '<div class="env-fields"><label>Nome / Razão social<input id="envNome"></label><label>CPF/CNPJ<input id="envDoc"></label>',
  '<label>Logradouro<input id="envRua"></label><label>Número<input id="envNumero"></label>',
  '<label>Complemento<input id="envCompl"></label><label>Bairro<input id="envBairro"></label>',
  '<label>CEP<input id="envCep" maxlength="9" inputmode="numeric"></label><label>Cidade<input id="envCidade"></label>',
  '<label>UF<input id="envUf" maxlength="2"></label><label>NF-e (opcional)<input id="envNf"></label></div>',
  '<button type="button" id="envRemCorreios" class="btn azul">Atualizar remetente dos Correios</button>',
  '<p id="envRemResumo" class="env-sender"></p>',
  '<div class="env-layout-editor"><strong>Ajustar posição e ângulo</strong>',
  '<label class="env-rem-margem">Margem lateral do remetente (mm, na arte)<input id="envRemMargem" type="number" min="5" max="45" step="1" value="5"></label>',
  '<p class="env-driver-alerta"><strong>Atenção à Brother:</strong> se em Preferências de Impressão o tamanho do papel continuar <b>A4</b>, a impressora pode centralizar a arte e criar uma margem grande, mesmo com o remetente a 5 mm no arquivo. Selecione o envelope 114 × 229 mm no driver antes de imprimir.</p>',
  '<p>Arraste o REMETENTE e o DESTINATÁRIO com o mouse diretamente na prévia. A referência da NF-e acompanha o destinatário. A linha pontilhada marca 1 cm e a impressora recebe uma folga extra no final do papel.</p>',
  '<div class="env-giro"><b>Remetente</b><button type="button" data-env-bloco="rem" data-env-giro="-1" aria-label="Girar remetente 1 grau à esquerda">↶ 1°</button><output id="envRemAngulo">0°</output><button type="button" data-env-bloco="rem" data-env-giro="1" aria-label="Girar remetente 1 grau à direita">↷ 1°</button></div>',
  '<div class="env-giro"><b>Destinatário</b><button type="button" data-env-bloco="dest" data-env-giro="-1" aria-label="Girar destinatário 1 grau à esquerda">↶ 1°</button><output id="envDestAngulo">0°</output><button type="button" data-env-bloco="dest" data-env-giro="1" aria-label="Girar destinatário 1 grau à direita">↷ 1°</button></div>',
  '<button type="button" id="envRestaurarPos" class="btn">Restaurar posições e ângulos</button></div>',
  '<div class="env-controls"><label>Modelo de impressão<select id="envModo"><option value="envelope">Envelope 114 × 229 mm (novo)</option><option value="envelope115">Envelope 115 × 230 mm (anterior)</option><option value="a4">Conferência em folha A4</option></select></label>',
  '<label>Correção X (mm)<input id="envX" type="number" min="-5" max="5" step="0.5"></label>',
  '<label>Correção Y (mm)<input id="envY" type="number" min="-5" max="5" step="0.5"></label></div>',
  '<label class="env-check"><input type="checkbox" id="envDocumento"> Mostrar CPF/CNPJ do destinatário</label>',
  '<label class="env-check"><input type="checkbox" id="envNota"> Mostrar referência da NF-e</label>',
  '<div class="env-actions"><button type="button" id="envImprimir" class="btn roxo">Imprimir envelope / salvar PDF</button>',
  '<button type="button" id="envLimpar" class="btn">Limpar destinatário</button></div>',
  '<p id="envInfo" class="env-info" role="status"></p></div>',
  '<div class="card"><h2>Prévia do envelope</h2><p id="envMedida"></p>',
  '<div class="env-frame"><div class="env-paper" id="envPapel"><div class="env-limite" aria-hidden="true"></div><img class="env-logo" src="'+LOGO+'" alt="Logo Sofisticatto">',
  '<div class="env-rem env-draggable" id="envArrastarRem" title="Arraste para reposicionar o remetente"><strong>REMETENTE</strong><b id="envPrevRemNome"></b><small id="envPrevRemCnpj"></small><span id="envPrevRemEndereco"></span></div>',
  '<div class="env-dest env-draggable" id="envArrastarDest" title="Arraste para reposicionar o destinatário"><strong>DESTINATÁRIO</strong><b id="envPrevDestNome">NOME DO DESTINATÁRIO</b><small id="envPrevDestDoc"></small>',
  '<span id="envPrevDestEndereco"></span><small class="env-nf" id="envPrevNf"></small></div>',
  '</div></div><p class="env-info" id="envStatus" role="status"></p>',
  '<p class="env-info">Este é apenas o endereçamento do envelope, não uma etiqueta de postagem com rastreio. Para Carta Registrada, use a postagem oficial dos Correios.</p>',
  '<p class="env-info">Na Brother: tipo de mídia <b>Envelope</b>, papel personalizado <b>114 × 229 mm</b> (ou 115 × 230 mm se selecionado), orientação <b>Retrato</b>, alimentação <b>Manual / bandeja central</b>, escala <b>100%</b>, sem duplex.</p>',
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
   '.env-paper{position:relative;width:100%;max-width:870px;aspect-ratio:229 / 114;background:white;border:1px solid #b2a9c0;box-shadow:0 2px 8px #0001;overflow:hidden;font-family:Arial,sans-serif;color:#202020}',
   '.env-paper .env-logo{position:absolute;left:4.367%;top:8.772%;width:19.65%;height:19.3%;object-fit:contain;object-position:left center;pointer-events:none}',
   '.env-rem{position:absolute;font-size:.9em;line-height:1.35;overflow-wrap:anywhere;transform-origin:top left}',
   '.env-rem strong,.env-dest strong{display:block;margin-bottom:2mm;letter-spacing:.3px}.env-rem strong{font-size:.889em}.env-dest strong{font-size:.8em}',
   '.env-rem b,.env-dest b,.env-rem small,.env-dest small,.env-rem span,.env-dest span{display:block}',
   '.env-rem span{white-space:pre-line;font-size:1em}.env-rem small{font-size:1em}',
   '.env-dest{position:absolute;font-size:1em;line-height:1.32;overflow-wrap:anywhere;transform-origin:top left}',
   '.env-dest b{font-size:1.3em;line-height:1.22;margin-bottom:2mm}.env-rem b{font-size:1.111em}',
   '#envPrevDestEndereco{white-space:pre-line}',
   '.env-dest .env-nf{position:static;display:block;margin-top:3mm;font-size:.8em;line-height:1.3;text-align:left;color:#444;overflow-wrap:anywhere}',
   '@media(max-width:900px){.env-grid{grid-template-columns:1fr}}',
   '.env-limite{position:absolute;inset:8.772% 4.367%;border:1px dashed #b6a2d9;border-radius:2px;pointer-events:none;box-sizing:border-box}',
   '.env-draggable{cursor:grab;touch-action:none;user-select:none;border-radius:3px;outline:1px dashed transparent}',
   '.env-draggable:hover,.env-draggable:focus-visible{outline-color:#806cbd;background:rgba(111,75,164,.04)}',
   '.env-draggable.env-arrastando{cursor:grabbing;outline:1px solid #6a1b9a;background:rgba(111,75,164,.08)}',
   '.env-layout-editor{padding:12px;margin:12px 0;border:1px solid #ddd2ec;border-radius:12px;background:#fbfaff}',
   '.env-layout-editor>strong{color:#564783;font-size:14px}',
   '.env-layout-editor p{font-size:12px;color:#615b7a;margin:6px 0 10px;line-height:1.45}',
   '.env-giro{display:flex;align-items:center;gap:8px;margin:7px 0;flex-wrap:wrap}',
   '.env-giro b{min-width:94px;font-size:13px;color:#4d436b}',
   '.env-giro button{border:1px solid #c5b6dd;background:#fff;color:#594b9e;border-radius:7px;padding:6px 11px;font-weight:700;cursor:pointer}',
   '.env-giro output{font-weight:700;font-size:13px;min-width:25px;text-align:center}',
   '#envRestaurarPos{margin-top:8px;font-size:12px}',
   '.env-rem-margem{font-size:12px;color:#51467c;display:block;margin:9px 0}',
   '.env-rem-margem input{max-width:100px!important;margin-left:8px}',
   '.env-driver-alerta{background:#fff9ee;border-left:3px solid #be822c;padding:8px 10px!important;color:#654817!important}',
   '@media(max-width:580px){.env-fields{grid-template-columns:1fr}.env-controls{grid-template-columns:1fr 1fr}.env-controls label:first-child{grid-column:1/-1}}'
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
  root.querySelectorAll('[data-env-bloco][data-env-giro]').forEach(botao=>{
   botao.addEventListener('click',()=>mudarAngulo(
    botao.getAttribute('data-env-bloco'),Number(botao.getAttribute('data-env-giro'))));
  });
  el('RestaurarPos').addEventListener('click',restaurarBlocos);
  el('RemMargem').addEventListener('change',()=>{
   const p=configuracao();
   p.remX=arredondar(limitar(Number(valor('RemMargem'))||5,5,45));
   persistirConfig(p);atualizar();
   textoNo('Info','Margem do remetente ajustada na arte. Na Brother, use o tamanho real do envelope, nunca A4.');
  });
  conectarArraste('rem');conectarArraste('dest');
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
  if(typeof ResizeObserver!=='undefined'){
   const observer=new ResizeObserver(()=>{if(inicializado)aplicarLayout();});
   observer.observe(el('Papel'));
  }
 }
 function dadoRemetenteResumo(){const r=dadosRemetente();return 'Remetente: '+r.nome+' · '+r.documento+' · '+endRem(r).join(' · ');}
 window.inicializarImpressaoEnvelopeSofisticatto=montar;
})();
