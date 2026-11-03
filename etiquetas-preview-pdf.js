/* Sofisticatto - atualização isolada da impressão de Etiquetas (150 x 100 mm).
   Mantém os demais botões, canhotos e relatórios sem alterações. */
(function () {
  'use strict';
  let urlAtual = null;
  function limparUrl() { if (urlAtual) { URL.revokeObjectURL(urlAtual); urlAtual = null; } }
  function fechar() { document.getElementById('etq-pdf-modal-v1')?.remove(); limparUrl(); }
  function abrirModal() {
    fechar();
    const fundo = document.createElement('div');
    fundo.id = 'etq-pdf-modal-v1';
    fundo.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#0009;display:flex;align-items:center;justify-content:center;padding:18px';
    const painel = document.createElement('section');
    painel.style.cssText = 'background:white;border-radius:14px;width:min(1150px,96vw);height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 16px 50px #0005';
    painel.innerHTML = '<header style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;font:600 14px Arial"><span style="flex:1">Etiquetas de entrega — preparando PDF...</span><button type="button" data-etq="print" disabled>Imprimir</button><button type="button" data-etq="download" disabled>Baixar PDF</button><button type="button" data-etq="close">Fechar</button></header><iframe title="Prévia das etiquetas" style="border:0;flex:1;width:100%"></iframe>';
    painel.querySelectorAll('button').forEach(b => b.style.cssText = 'background:#5a4fa3;color:#fff;border:0;border-radius:7px;padding:9px 12px;cursor:pointer');
    fundo.appendChild(painel); document.body.appendChild(fundo);
    fundo.querySelector('[data-etq="close"]').onclick = fechar;
    fundo.addEventListener('click', e => { if(e.target === fundo) fechar(); });
    return {fundo, titulo:painel.querySelector('span'), iframe:painel.querySelector('iframe'), imprimir:painel.querySelector('[data-etq="print"]'), baixar:painel.querySelector('[data-etq="download"]')};
  }
  window.imprimirEtiquetas = async function () {
    if(typeof validarEtiqueta !== 'function' || typeof criarElementoEtiqueta !== 'function') {
      alert('Funções de etiquetas não carregadas. Atualize a página e tente novamente.'); return;
    }
    const dados = validarEtiqueta(); if(!dados) return;
    const quantidade = Number(dados.quantidade_volumes);
    if(!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 1000) { alert('Quantidade de volumes inválida.'); return; }
    const modal = abrirModal(); let temporario;
    try {
      if(typeof carregarBibliotecasEtiqueta === 'function') await carregarBibliotecasEtiqueta();
      if(typeof html2canvas !== 'function' || !window.jspdf?.jsPDF) throw Error('Bibliotecas de PDF não carregadas');
      const pdf = new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:[150,100],compress:true});
      temporario = document.createElement('div');
      temporario.style.cssText = 'position:fixed;left:-20000px;top:0;background:white;pointer-events:none';
      document.body.appendChild(temporario);
      for(let volume=1;volume<=quantidade;volume++) {
        if(!modal.fundo.isConnected) return;
        modal.titulo.textContent = `Preparando etiquetas: ${volume} de ${quantidade}`;
        const etiqueta = criarElementoEtiqueta(dados,volume);
        etiqueta.style.margin='0';etiqueta.style.boxShadow='none';etiqueta.style.borderRadius='0';etiqueta.style.transform='none';
        temporario.appendChild(etiqueta);
        try {
          if(typeof prepararEtiquetaParaCaptura === 'function') await prepararEtiquetaParaCaptura(etiqueta);
          const largura = Math.round(etiqueta.getBoundingClientRect().width);
          const altura = Math.round(etiqueta.getBoundingClientRect().height);
          if(!largura || !altura) throw Error('Dimensões da etiqueta inválidas');
          const canvas = await html2canvas(etiqueta,{scale:2,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',width:largura,height:altura,windowWidth:largura,windowHeight:altura,scrollX:0,scrollY:0,logging:false});
          if(volume>1) pdf.addPage([150,100],'landscape');
          pdf.addImage(canvas.toDataURL('image/jpeg',0.85),'JPEG',0,0,150,100,undefined,'FAST');
          canvas.width=canvas.height=0;
        } finally { etiqueta.remove(); }
        if(volume % 3 === 0) await new Promise(resolve => setTimeout(resolve,0));
      }
      if(!modal.fundo.isConnected) return;
      const blob=pdf.output('blob'); urlAtual=URL.createObjectURL(blob);
      modal.iframe.src=urlAtual;
      modal.titulo.textContent=`Etiquetas de entrega — ${quantidade} volume(s)`;
      modal.imprimir.disabled=false;modal.baixar.disabled=false;
      modal.imprimir.onclick=()=>{try {modal.iframe.contentWindow?.focus();modal.iframe.contentWindow?.print();}catch(e){window.open(urlAtual,'_blank');}};
      modal.baixar.onclick=()=>{const a=document.createElement('a');a.href=urlAtual;a.download='ETIQUETAS_'+String(dados.numero_nf||'SEM_NF').replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf';document.body.appendChild(a);a.click();a.remove();};
    } catch(e) { console.error('Erro no PDF de etiquetas:',e); if(modal.fundo.isConnected) {modal.titulo.textContent='Erro ao gerar etiquetas';alert('Não foi possível preparar as etiquetas: '+e.message);} }
    finally {temporario?.remove();}
  };
})();
