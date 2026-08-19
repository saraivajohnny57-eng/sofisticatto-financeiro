
/* =========================================================
   NOTIFICAÇÕES — extensão segura para o módulo de fretes
   O sistema principal continua controlando notificações gerais.
   ========================================================= */
async function notificarCotacaoAutorizada(cotacao, transportadora){
  if(typeof mostrarBalaoSistema === "function"){
    mostrarBalaoSistema(
      "Cotação autorizada",
      `${cotacao?.cliente_nome || "Cliente"} — ${transportadora?.nome || "Transportadora"}`
    );
  }
}

window.addEventListener("online", () => {
  if(typeof freteModuloCarregado !== "undefined" && freteModuloCarregado){
    carregarHistoricoFrete();
  }
});

/*
   O index.html carrega este arquivo antes de coletas.js.
   O carregamento abaixo é agendado para depois que os demais scripts
   síncronos terminarem, permitindo que o rastreamento universal substitua
   apenas os pontos de extensão necessários, sem alterar o fluxo existente.
*/
setTimeout(()=>{
  try{
    const script=document.createElement("script");
    script.src="/rastreio-universal.js?v=1";
    script.async=false;
    script.onload=()=>console.info("Rastreamento universal carregado.");
    script.onerror=e=>console.warn("Não foi possível carregar rastreio-universal.js",e);
    document.head.appendChild(script);
  }catch(e){
    console.warn("Falha ao iniciar rastreamento universal:",e);
  }
},0);
