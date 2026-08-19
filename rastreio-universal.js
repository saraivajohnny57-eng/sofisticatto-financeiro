/* =========================================================
   RASTREAMENTO UNIVERSAL — transportadoras integradas
   V1
   - Inclui API, WebService/SSW e integrações aprovadas em produção.
   - Não expõe credenciais.
   - Mantém Rodonaves e Alfa com suas consultas específicas.
   ========================================================= */
(function(){
  "use strict";

  const normalizar = v => String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  function integracaoPodeRastrear(it){
    if(!it) return false;
    if(String(it.status_tecnico || "").toLowerCase() === "suspensa") return false;

    const tipo = String(it.integracao_tipo || "").toLowerCase();
    const status = String(it.status_tecnico || "").toLowerCase();

    // Formas já suportadas pelo projeto:
    if(it.rastreamento_ativo === true) return true;
    if(["webservice","ssw","edi"].includes(tipo)) return true;
    if(["producao","homologacao_aprovada"].includes(status) &&
       (it.coleta_ativa || it.cotacao_ativa || it.prazo_ativo || it.comprovante_ativo)) return true;

    return false;
  }

  async function carregarTransportadorasRastreamentoUniversal(){
    try{
      const [ri,re] = await Promise.all([
        banco.from("transportadora_integracoes")
          .select("convite_id,transportadora_nome,status_tecnico,rastreamento_ativo,integracao_tipo,ambiente_atual,coleta_ativa,cotacao_ativa,prazo_ativo,comprovante_ativo")
          .order("transportadora_nome"),
        banco.from("transportadora_endpoints")
          .select("convite_id,operacao,ambiente,url")
          .ilike("operacao","%rastreamento%")
      ]);

      if(ri.error) throw ri.error;

      const porConvite = new Map();
      (ri.data || []).forEach(it => {
        if(integracaoPodeRastrear(it)) porConvite.set(String(it.convite_id), it);
      });

      // Um endpoint de rastreamento também torna a transportadora elegível,
      // mesmo que o checkbox antigo rastreamento_ativo ainda não tenha sido marcado.
      (re.data || []).forEach(ep => {
        const it = (ri.data || []).find(x => String(x.convite_id) === String(ep.convite_id));
        if(it && String(it.status_tecnico || "").toLowerCase() !== "suspensa"){
          porConvite.set(String(it.convite_id), it);
        }
      });

      transportadorasRastreamentoIntegrado = [...porConvite.values()];
    }catch(e){
      console.warn("Rastreamento universal: não foi possível carregar integrações", e?.message || e);
      transportadorasRastreamentoIntegrado = [];
    }
  }

  function transportadoraTemRastreamentoUniversal(nome){
    const n = normalizar(nome);
    if(!n) return false;
    return (transportadorasRastreamentoIntegrado || []).some(it => {
      const x = normalizar(it.transportadora_nome);
      return x && (n === x || n.includes(x) || x.includes(n));
    });
  }

  function tipoIntegracaoNome(nome){
    const n = normalizar(nome);
    const it = (transportadorasRastreamentoIntegrado || []).find(x => {
      const xnome = normalizar(x.transportadora_nome);
      return xnome && (n === xnome || n.includes(xnome) || xnome.includes(n));
    });
    return String(it?.integracao_tipo || "").toLowerCase();
  }

  // Essas duas funções são consultadas pelo módulo coletas.js em tempo de execução.
  // Sobrescrevê-las aqui faz o painel aceitar as demais transportadoras sem
  // precisar alterar o arquivo grande coletas.js.
  window.carregarTransportadorasRastreamentoIntegrado = carregarTransportadorasRastreamentoUniversal;
  window.transportadoraTemRastreamentoIntegrado = transportadoraTemRastreamentoUniversal;

  // Mantém a função original para Rodonaves/Alfa. Para WebService/SSW, o clique
  // apenas atualiza a leitura do banco: as ocorrências chegam automaticamente pelo
  // endpoint /api/ssw-ocorrencias.js e já ficam em logistica_rastreamentos.
  const atualizarOriginal = window.atualizarRastreioIntegrado;
  window.atualizarRastreioIntegrado = async function(id, botao=null){
    try{
      const r = await obterRastreamentoPorId(id);
      if(!r){ alert("Rastreio não encontrado."); return; }

      const nome = r.frete_transportadoras?.nome || "";
      const tipo = tipoIntegracaoNome(nome);

      if(/rodonaves/i.test(nome) || /alfa/i.test(nome)){
        if(typeof atualizarOriginal === "function") return atualizarOriginal(id, botao);
      }

      if(["webservice","ssw","edi"].includes(tipo)){
        if(botao){ botao.disabled=true; botao.textContent="Atualizando..."; }
        await carregarRastreamentosLogistica(r.sentido || "saida");
        if((r.sentido || "saida") === "saida" && typeof carregarRastreamentosEntregues === "function"){
          await carregarRastreamentosEntregues();
        }
        if(botao && document.body.contains(botao)){
          botao.disabled=false;
          botao.textContent="Atualizado";
          setTimeout(()=>{ if(document.body.contains(botao)) botao.textContent="Atualizar rastreio"; },1800);
        }
        return;
      }

      if(tipo && typeof atualizarOriginal === "function"){
        // Para uma futura API específica, preserva o fluxo antigo em vez de
        // inventar uma chamada genérica que possa enviar credenciais ao endpoint errado.
        return atualizarOriginal(id, botao);
      }

      await carregarRastreamentosLogistica(r.sentido || "saida");
    }catch(e){
      console.error("Rastreamento universal:", e);
      alert("Não foi possível atualizar o rastreio: " + (e?.message || e));
    }
  };

  let timer = null;
  async function atualizarPainelUniversal(){
    const tabela = document.getElementById("rastreamentoTabelaSaidas");
    if(!tabela) return;
    try{
      await carregarTransportadorasRastreamentoUniversal();
      await carregarRastreamentosLogistica("saida");
      if(typeof carregarRastreamentosEntregues === "function") await carregarRastreamentosEntregues();
    }catch(e){
      console.warn("Atualização automática de rastreio:", e?.message || e);
    }
  }

  function iniciarAtualizacaoUniversal(){
    if(timer) clearInterval(timer);
    timer = setInterval(()=>{
      const tabela = document.getElementById("rastreamentoTabelaSaidas");
      if(tabela && tabela.offsetParent !== null) atualizarPainelUniversal();
    }, 60000);
  }

  document.addEventListener("DOMContentLoaded", async ()=>{
    // Espera todos os scripts do index.html (principalmente coletas.js) terminarem.
    setTimeout(async ()=>{
      try{
        await carregarTransportadorasRastreamentoUniversal();
        iniciarAtualizacaoUniversal();
      }catch(e){
        console.warn("Rastreamento universal não inicializado:", e?.message || e);
      }
    }, 1200);
  });
})();
