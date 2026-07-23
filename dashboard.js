
/* =========================================================
   DASHBOARD DE COTAÇÕES — indicadores simples e seguros
   ========================================================= */
function atualizarDashboardFretes(){
  const container = document.getElementById("freteDashboardKpis");
  if(!container) return;

  const total = freteHistorico.length;
  const autorizadas = freteHistorico.filter(c => c.status === "autorizada");
  const respostas = freteHistorico.flatMap(c => c.frete_cotacao_respostas || []);
  const valores = respostas.filter(r => Number(r.valor_frete) > 0).map(r => Number(r.valor_frete));

  const media = valores.length
    ? valores.reduce((soma, valor) => soma + valor, 0) / valores.length
    : 0;

  const gnre = respostas.reduce(
    (soma, resposta) => soma + Number(resposta.gnre_valor || 0),
    0
  );

  container.innerHTML = `
    <div class="frete-kpi"><span>Cotações</span><b>${total}</b></div>
    <div class="frete-kpi"><span>Autorizadas</span><b>${autorizadas.length}</b></div>
    <div class="frete-kpi"><span>Frete médio</span><b>${moedaFrete(media)}</b></div>
    <div class="frete-kpi"><span>GNRE registrada</span><b>${moedaFrete(gnre)}</b></div>
  `;
}
