/* Sofisticatto — visualizador de etiquetas v1. Corrige o fluxo da aba Etiquetas. */
(function(){
"use strict";
let busy=false, currentUrl=null, currentModal=null;
function close(){
  if(currentModal){currentModal.remove();currentModal=null;}
  if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null;}
}
async function pdfEtiquetas(progress){
  const d=validarEtiqueta();
  if(!d)return null;
  await carregarBibliotecasEtiqueta();
  const container=document.getElementById("etiquetasImpressao");
  if(!container)throw Error("Área de impressão não encontrada");
  container.innerHTML="";
  container.style.display="block";
  const pdf=new window.jspdf.jsPDF({orientation:"landscape",unit:"mm",format:[150,100],compress:true});
  const cache=new Map();
  try{
    // Somente as faixas de pedido distintas exigem uma imagem base.
    // O número do volume é desenhado como texto vetorial em cada página.
    for(let i=1;i<=d.quantidade_volumes;i++){
      const pedido=typeof pedidoParaVolumeEtiqueta==="function" ? pedidoParaVolumeEtiqueta(i,d.pedidos_faixas) : null;
      const chave=JSON.stringify([pedido?.nome||"",pedido?.fonte||""]);
      let base=cache.get(chave);
      if(!base){
        const el=criarElementoEtiqueta(d,i);
        el.style.boxShadow="none";el.style.borderRadius="0";el.style.margin="0";
        container.appendChild(el);
        await prepararEtiquetaParaCaptura(el);
        const volume=el.querySelector(".etiqueta-volume");
        if(!volume)throw Error("Campo de volume não encontrado");
        const rect=el.getBoundingClientRect(),vr=volume.getBoundingClientRect();
        const cs=getComputedStyle(volume);
        const fontPx=parseFloat(cs.fontSize)||18;
        const x=(vr.left-rect.left)/rect.width*150;
        const y=(vr.top-rect.top)/rect.height*100;
        const w=vr.width/rect.width*150;
        const h=vr.height/rect.height*100;
        volume.style.visibility="hidden";
        const canvas=await html2canvas(el,{scale:2.8,useCORS:true,allowTaint:false,backgroundColor:"#ffffff",width:el.scrollWidth,height:el.scrollHeight,windowWidth:el.scrollWidth,windowHeight:el.scrollHeight,logging:false});
        base={image:canvas.toDataURL("image/jpeg",0.96),x,y,w,h,fontPt:fontPx*72/96,bold:/bold|[6-9]00/.test(cs.fontWeight),align:cs.textAlign};
        canvas.width=0;canvas.height=0;
        cache.set(chave,base);
        el.remove();
      }
      if(i>1)pdf.addPage([150,100],"landscape");
      pdf.addImage(base.image,"JPEG",0,0,150,100,undefined,"FAST");
      pdf.setTextColor(0,0,0);
      pdf.setFont("helvetica",base.bold?"bold":"normal");
      const label="VOL: "+formatarVolumeEtiqueta(i,d.quantidade_volumes);
      // Não usar maxWidth do jsPDF: esse parâmetro quebra "VOL: 11 / 32"
      // em duas linhas quando a caixa HTML não comporta a fonte original.
      // Ajustar proporcionalmente a fonte e manter o texto vetorial em linha única.
      const alinhamento=base.align==="right"?"right":base.align==="center"?"center":"left";
      const tx=alinhamento==="right"?base.x+base.w:alinhamento==="center"?base.x+base.w/2:base.x;
      const larguraSegura=Math.max(8,Math.min(base.w-1.2,alinhamento==="right"?base.x+base.w-1:150-base.x-1));
      pdf.setFontSize(base.fontPt);
      const larguraTexto=pdf.getTextWidth(label);
      const fonteAjustada=larguraTexto>larguraSegura
        ?Math.max(7,base.fontPt*(larguraSegura/larguraTexto)*0.96):base.fontPt;
      pdf.setFontSize(fonteAjustada);
      const alturaTexto=fonteAjustada*0.3528;
      pdf.text(label,tx,base.y+Math.min(base.h*0.79,alturaTexto*1.12),{align:alinhamento});
      if(progress)progress(i,d.quantidade_volumes);
      if(i%20===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    const nome="ETIQUETAS_"+String(d.cliente||"CLIENTE").replace(/[^a-z0-9]+/gi,"_")+"_NF_"+String(d.numero_nf||"").replace(/[^0-9A-Za-z-]/g,"")+".pdf";
    return {blob:pdf.output("blob"),nome};
  }finally{
    container.innerHTML="";
    container.style.display="none";
  }
}
window.imprimirEtiquetas=async function(){
  if(busy)return;
  if(currentModal)close();
  busy=true;
  const modal=document.createElement("div");
  currentModal=modal;
  modal.id="sofisticatto-etiquetas-pdf-modal";
  modal.style.cssText="position:fixed;inset:0;z-index:2147483000;background:rgba(22,15,42,.76);display:flex;align-items:center;justify-content:center;padding:12px";
  const panel=document.createElement("section");
  panel.style.cssText="background:#fff;border-radius:14px;overflow:hidden;width:min(1120px,98vw);height:94vh;display:flex;flex-direction:column;box-shadow:0 18px 60px #0005";
  const header=document.createElement("header");
  header.style.cssText="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px;font:600 14px Arial;color:#34235b";
  const title=document.createElement("span");
  title.style.cssText="flex:1;min-width:160px";
  title.textContent="Preparando etiquetas...";
  const makeButton=(label,action)=>{
    const b=document.createElement("button");
    b.type="button";b.textContent=label;
    b.style.cssText="border:0;border-radius:8px;padding:10px 14px;background:#6a1b9a;color:white;font:600 13px Arial;cursor:pointer";
    b.disabled=true;b.onclick=action;return b;
  };
  const iframe=document.createElement("iframe");
  iframe.title="Prévia do PDF das etiquetas";
  iframe.style.cssText="border:0;flex:1;width:100%;background:#eee";
  let nome="";
  const print=makeButton("Imprimir",()=>{
    if(!currentUrl)return;
    try{iframe.contentWindow.focus();iframe.contentWindow.print();}
    catch(e){window.open(currentUrl,"_blank","noopener");}
  });
  const download=makeButton("Baixar PDF",()=>{
    if(!currentUrl)return;
    const a=document.createElement("a");a.href=currentUrl;a.download=nome;
    document.body.appendChild(a);a.click();a.remove();
  });
  const fechar=makeButton("Fechar",close);fechar.disabled=false;
  header.append(title,print,download,fechar);
  panel.append(header,iframe);modal.appendChild(panel);document.body.appendChild(modal);
  try{
    const result=await pdfEtiquetas((i,total)=>{if(modal.isConnected)title.textContent="Preparando etiquetas "+i+"/"+total+"...";});
    if(!result){close();return;}
    if(!modal.isConnected)return;
    nome=result.nome;
    currentUrl=URL.createObjectURL(result.blob);
    iframe.src=currentUrl;
    title.textContent="Etiquetas — "+nome;
    print.disabled=false;download.disabled=false;
  }catch(err){
    console.error("Erro na prévia das etiquetas",err);
    if(modal.isConnected)title.textContent="Erro ao gerar etiquetas: "+(err.message||err);
  }finally{busy=false;}
};
})();