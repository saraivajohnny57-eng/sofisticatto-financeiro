/* Sofisticatto — visualizador de etiquetas v1. Corrige o fluxo da aba Etiquetas. */
(function(){
"use strict";
let busy=false, currentUrl=null, currentModal=null;
function close(){
  if(currentModal){currentModal.remove();currentModal=null;}
  if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null;}
}
async function pdfEtiquetas(progress){
  const result=await montarEtiquetasParaSaida();
  if(!result)return null;
  const {d,container}=result;
  const paginas=[...container.querySelectorAll(".etiqueta-papel")];
  const pdf=new window.jspdf.jsPDF({orientation:"landscape",unit:"mm",format:[150,100],compress:true});
  try{
    for(let i=0;i<paginas.length;i++){
      if(i)pdf.addPage([150,100],"landscape");
      const el=paginas[i];
      el.style.boxShadow="none";el.style.borderRadius="0";el.style.margin="0";
      if(typeof prepararEtiquetaParaCaptura==="function")await prepararEtiquetaParaCaptura(el);
      const canvas=await html2canvas(el,{scale:1.7,useCORS:true,allowTaint:false,backgroundColor:"#ffffff",width:el.scrollWidth,height:el.scrollHeight,windowWidth:el.scrollWidth,windowHeight:el.scrollHeight,logging:false});
      pdf.addImage(canvas.toDataURL("image/jpeg",0.88),"JPEG",0,0,150,100,undefined,"FAST");
      canvas.width=0;canvas.height=0;
      if(progress)progress(i+1,paginas.length);
      if(i%4===3)await new Promise(resolve=>setTimeout(resolve,0));
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