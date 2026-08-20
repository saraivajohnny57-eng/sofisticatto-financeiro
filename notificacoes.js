
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
