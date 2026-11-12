/* V464 — Editor posicional das etiquetas 150 x 100mm.
   Ajusta o layout visual, sem modificar os dados da NF-e ou a emissão. */
(function(){
  'use strict';
  const CHAVE='sofisticatto_etiquetas_layout_v464';
  const CAMPOS=[
    ['transportadora','.etiqueta-transportadora','Transportadora'],
    ['pedido','.etiqueta-pedido-tag','Identificação do pedido'],
    ['logo','.etiqueta-logo','Logo'],
    ['qr','.etiqueta-qr','QR Code'],
    ['textoqr','.etiqueta-qr-texto','Texto Instagram'],
    ['destino','.etiqueta-destino','Destinatário'],
    ['endereco','.etiqueta-endereco','Endereço'],
    ['bairro','.etiqueta-bairro','Bairro'],
    ['cep','.etiqueta-cep','CEP'],
    ['cidade','.etiqueta-cidade','Cidade / UF'],
    ['nf','.etiqueta-nf','Número da NF'],
    ['volume','.etiqueta-volume','Volumes'],
    ['barcode','.etiqueta-barcode','Código de barras'],
    ['chave','.etiqueta-chave','Chave da NF-e']
  ];
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):0));
  const round=v=>Math.round(v*10)/10;
  const estado={};
  let ativo=false, selecionado='transportadora', arrasto=null;
  let previa=null, controle=null, seletor=null, inputs={},status=null;
  function normalizar(entrada){
    if(!entrada||typeof entrada!=='object')return;
    for(const [id] of CAMPOS){
      const p=entrada[id];
      if(!p||typeof p!=='object')continue;
      estado[id]={
        x:round(clamp(p.x,-40,40)),
        y:round(clamp(p.y,-40,40)),
        giro:round(clamp(p.giro,-180,180))
      };
    }
  }
  try{normalizar(JSON.parse(localStorage.getItem(CHAVE)||'{}'));}catch(_){}
  function get(id){return estado[id]||{x:0,y:0,giro:0};}
  function salvar(mensagem){
    try{
      localStorage.setItem(CHAVE,JSON.stringify(estado));
      if(status && mensagem)status.textContent=mensagem;
    }catch(e){if(status)status.textContent='Não foi possível salvar neste navegador: '+(e.message||e);}
  }
  function aplicar(etiqueta){
    if(!etiqueta||!etiqueta.querySelector)return;
    for(const [id,css] of CAMPOS){
      const el=etiqueta.querySelector(css);
      if(!el)continue;
      const p=get(id);
      const base=id==='transportadora'&&!el.classList.contains('duas-linhas')?180:0;
      // translate() antecede rotate(): deslocamento continua nos eixos da etiqueta.
      el.style.transform='translate('+p.x+'mm, '+p.y+'mm) rotate('+(base+p.giro)+'deg)';
      el.style.transformOrigin='center center';
      // Usado pela rotina de captura que substitui o texto vertical por canvas.
      el.dataset.etqX=String(p.x);
      el.dataset.etqY=String(p.y);
      el.dataset.etqGiro=String(p.giro);
    }
  }
  window.sofAjustarLayoutEtiqueta=aplicar;
  function redesenhar(){
    if(previa)aplicar(previa);
    if(!previa)return;
    previa.querySelectorAll('.etq-edicao-selecionada').forEach(el=>el.classList.remove('etq-edicao-selecionada'));
    if(ativo){
      const css=CAMPOS.find(c=>c[0]===selecionado)?.[1];
      const el=css?previa.querySelector(css):null;
      if(el)el.classList.add('etq-edicao-selecionada');
    }
  }
  function atualizarControles(){
    const p=get(selecionado);
    for(const [campo,valor] of [['x',p.x],['y',p.y],['giro',p.giro]]){
      const inp=inputs[campo];
      if(!inp)continue;
      inp.value=String(valor);
      const saida=controle?.querySelector('[data-etq-valor="'+campo+'"]');
      if(saida)saida.textContent=(campo==='giro'?valor+'°':valor+' mm');
    }
    if(seletor)seletor.value=selecionado;
    redesenhar();
  }
  function mudar(chave,valor,persistir){
    const p={...get(selecionado)};
    p[chave]=round(clamp(valor,chave==='giro'?-180:-40,chave==='giro'?180:40));
    estado[selecionado]=p;
    atualizarControles();
    if(persistir)salvar('Ajustes salvos neste navegador.');
  }
  function escolher(id){
    if(!CAMPOS.some(x=>x[0]===id))return;
    selecionado=id;atualizarControles();
  }
  function controleRange(chave,titulo,min,max,step){
    const label=document.createElement('label');
    label.className='etq-movel-campo';
    const txt=document.createElement('span');txt.textContent=titulo;
    const val=document.createElement('strong');val.setAttribute('data-etq-valor',chave);val.textContent='0';
    const input=document.createElement('input');input.type='range';
    input.min=min;input.max=max;input.step=step;
    input.setAttribute('aria-label',titulo);
    input.addEventListener('input',()=>mudar(chave,input.value,false));
    input.addEventListener('change',()=>salvar('Posição e ângulo salvos.'));
    label.append(txt,val,input);inputs[chave]=input;
    return label;
  }
  function botao(texto,aoClicar){
    const b=document.createElement('button');b.type='button';
    b.textContent=texto;b.addEventListener('click',aoClicar);
    return b;
  }
  function iniciar(){
    previa=document.getElementById('etqPreview');
    const area=document.querySelector('.etiqueta-preview-area');
    if(!previa||!area||document.getElementById('etqEditorPosicaoV464'))return;
    controle=document.createElement('section');
    controle.id='etqEditorPosicaoV464';controle.className='etq-movel-editor';
    const titulo=document.createElement('h3');titulo.textContent='Ajuste de posição e ângulo';
    const desc=document.createElement('p');desc.textContent='Ative o arraste, selecione um campo e mova com o mouse ou toque. O ajuste aparece também na impressão e no PDF.';
    const linha=document.createElement('div');linha.className='etq-movel-linha';
    const campoSel=document.createElement('label');
    campoSel.textContent='Campo a ajustar';
    seletor=document.createElement('select');seletor.id='etqMovelCampo';
    for(const [id,,nome] of CAMPOS){const option=document.createElement('option');option.value=id;option.textContent=nome;seletor.append(option);}
    seletor.addEventListener('change',()=>escolher(seletor.value));
    campoSel.append(seletor);
    const toggle=botao('Ativar arraste',()=>{
      ativo=!ativo;
      toggle.textContent=ativo?'Desativar arraste':'Ativar arraste';
      toggle.setAttribute('aria-pressed',String(ativo));
      previa.classList.toggle('etq-movel-ativa',ativo);
      redesenhar();
    });
    toggle.setAttribute('aria-pressed','false');
    linha.append(campoSel,toggle);
    const controles=document.createElement('div');controles.className='etq-movel-ranges';
    controles.append(
      controleRange('x','Mover horizontalmente (X)',-40,40,0.5),
      controleRange('y','Mover verticalmente (Y)',-40,40,0.5),
      controleRange('giro','Ângulo (ajuste do original)',-180,180,1)
    );
    const botoes=document.createElement('div');botoes.className='etq-movel-botoes';
    botoes.append(
      botao('Salvar layout',()=>salvar('Layout salvo para as próximas etiquetas neste navegador.')),
      botao('Restaurar campo',()=>{
        delete estado[selecionado];
        atualizarControles();salvar('Campo restaurado para a posição original.');
      }),
      botao('Restaurar todos',()=>{
        if(!window.confirm('Restaurar a posição e o ângulo de todos os campos da etiqueta?'))return;
        for(const key of Object.keys(estado))delete estado[key];
        atualizarControles();salvar('Layout original restaurado.');
      })
    );
    status=document.createElement('div');status.className='etq-movel-status';
    status.setAttribute('role','status');
    status.textContent='As alterações são guardadas somente neste navegador.';
    controle.append(titulo,desc,linha,controles,botoes,status);
    area.parentNode.insertBefore(controle,area);
    // Clique no campo seleciona; o arraste só começa se a edição estiver habilitada.
    previa.addEventListener('pointerdown',e=>{
      if(!ativo || e.button>0)return;
      const hit=CAMPOS.find(([,css])=>e.target.closest?.(css)?.closest('.etiqueta-papel')===previa);
      if(!hit)return;
      escolher(hit[0]);
      const rect=previa.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const p=get(selecionado);
      arrasto={pointerId:e.pointerId,id:selecionado,startX:e.clientX,startY:e.clientY,
        x:p.x,y:p.y,pxmm:150/rect.width,pymm:100/rect.height};
      e.preventDefault();
      try{previa.setPointerCapture(e.pointerId);}catch(_){}
    });
    previa.addEventListener('pointermove',e=>{
      if(!arrasto||arrasto.pointerId!==e.pointerId)return;
      selecionado=arrasto.id;
      estado[selecionado]={
        ...get(selecionado),
        x:round(clamp(arrasto.x+(e.clientX-arrasto.startX)*arrasto.pxmm,-40,40)),
        y:round(clamp(arrasto.y+(e.clientY-arrasto.startY)*arrasto.pymm,-40,40))
      };
      atualizarControles();
    });
    const terminar=e=>{
      if(!arrasto||e.pointerId!==arrasto.pointerId)return;
      arrasto=null;salvar('Posição salva. A impressão e o PDF usarão este ajuste.');
    };
    previa.addEventListener('pointerup',terminar);
    previa.addEventListener('pointercancel',terminar);
    previa.addEventListener('lostpointercapture',e=>{if(arrasto&&arrasto.pointerId===e.pointerId){arrasto=null;salvar('Posição salva.');}});
    atualizarControles();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar,{once:true});
  else iniciar();
})();
