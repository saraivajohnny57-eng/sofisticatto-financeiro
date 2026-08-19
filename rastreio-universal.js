/* =========================================================
   RASTREAMENTO UNIVERSAL — transportadoras integradas
   V2
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

      (re.data || []).forEach(ep => {
        const it = (ri.data || []).find(x => String(x.convite_id) === String(ep.convite_id));
        if(it && String(it.status_tecnico || "").toLowerCase() !== "suspensa"){
          porConvite.set(String(it.convite_id), it);
        }
      });

      transportadorasRastreamentoIntegrado = [...porConvite.values()];
      return transportadorasRastreamentoIntegrado;
    }catch(e){
      console.warn("Rastreamento universal: não foi possível carregar integrações", e?.message || e);
      transportadorasRastreamentoIntegrado = [];
      return [];
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

  let timer = null;

  async function instalar(){
    // Se por algum motivo o script for carregado antes do coletas.js,
    // aguarda até o módulo de rastreamento existir.
    if(typeof window.carregarRastreamentosLogistica !== "function"){
      setTimeout(instalar, 800);
      return;
    }

    window.carregarTransportadorasRastreamentoIntegrado = carregarTransportadorasRastreamentoUniversal;
    window.transportadoraTemRastreamentoIntegrado = transportadoraTemRastreamentoUniversal;

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

        if(tipo && typeof atualizarOriginal === "function") return atualizarOriginal(id, botao);
        await carregarRastreamentosLogistica(r.sentido || "saida");
      }catch(e){
        console.error("Rastreamento universal:", e);
        alert("Não foi possível atualizar o rastreio: " + (e?.message || e));
      }
    };

    await carregarTransportadorasRastreamentoUniversal();

    if(timer) clearInterval(timer);
    timer = setInterval(async ()=>{
      const tabela = document.getElementById("rastreamentoTabelaSaidas");
      if(tabela && tabela.offsetParent !== null){
        try{
          await carregarTransportadorasRastreamentoUniversal();
          await carregarRastreamentosLogistica("saida");
          if(typeof carregarRastreamentosEntregues === "function") await carregarRastreamentosEntregues();
        }catch(e){
          console.warn("Atualização automática de rastreio:", e?.message || e);
        }
      }
    }, 60000);

    console.info("Rastreamento universal instalado para", transportadorasRastreamentoIntegrado.length, "transportadora(s).");
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", ()=>setTimeout(instalar, 300));
  }else{
    setTimeout(instalar, 300);
  }
})();
