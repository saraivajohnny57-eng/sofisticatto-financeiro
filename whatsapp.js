
/* =========================================================
   WHATSAPP — mensagem de comparação para a vendedora
   ========================================================= */
async function copiarTextoFrete(chave){
  const texto = freteCampo("freteTexto_" + chave)?.innerText || "";
  if(!texto) return;

  await navigator.clipboard.writeText(texto);
  mostrarBalaoSistema("Texto copiado", "Cole no WhatsApp ou e-mail da transportadora.");
}

function normalizarTelefoneWhatsappFrete(valor){
  const numero = String(valor || "").replace(/\D/g, "");
  if(!numero) return "";
  return numero.startsWith("55") ? numero : "55" + numero;
}

async function abrirWhatsAppTransportadoraFrete(transportadoraId, tipoFrete){
  const transportadora = freteTransportadoras.find(
    item => String(item.id) === String(transportadoraId)
  );

  const chave = chaveRespostaFrete(transportadoraId, tipoFrete);
  const texto = freteCampo("freteTexto_" + chave)?.innerText || "";
  const telefone = normalizarTelefoneWhatsappFrete(transportadora?.whatsapp);

  if(!texto){
    alert("Gere o modelo da cotação antes de enviar.");
    return;
  }

  if(!telefone){
    await navigator.clipboard.writeText(texto);
    alert(
      "A transportadora não possui WhatsApp cadastrado.\n\n" +
      "A mensagem foi copiada para você colar manualmente."
    );
    return;
  }

  window.open(
    `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`,
    "_blank"
  );
}

function sincronizarRespostasDaTelaFrete(){
  const dados = dadosFormularioFrete();
  const tipos = tiposRespostaFrete(dados.tipo_frete);

  dados.transportadoras_ids.forEach(id => {
    tipos.forEach(tipo => {
      const chave = chaveRespostaFrete(id, tipo);
      if(!freteCampo("freteRespValor_" + chave)) return;

      const item = coletarRespostaTela(id, tipo);
      if(!item.numero_cotacao && !item.valor_frete && !item.prazo && !item.gnre_valor) return;

      const indice = freteRespostasAtuais.findIndex(r =>
        String(r.transportadora_id) === String(id) &&
        String(r.tipo_frete || "CIF") === String(tipo)
      );

      if(indice >= 0) freteRespostasAtuais[indice] = {...freteRespostasAtuais[indice], ...item};
      else freteRespostasAtuais.push(item);
    });
  });
}

function atualizarMensagemVendedoraFrete(){
  sincronizarRespostasDaTelaFrete();

  const dados = dadosFormularioFrete();
  const gnreGeral = Number(dados.gnre_valor || 0);
  const opcoesCorreios = typeof opcoesCorreiosDaCotacao === 'function' ? opcoesCorreiosDaCotacao(dados) : [];
  const chavesCorreios = new Set(opcoesCorreios.map(x=>x.chave));

  // Para Correios com cotação automática, a mensagem usa TODAS as opções retornadas.
  // A resposta selecionada nos campos continua servindo para registrar qual modalidade será realmente usada.
  const respostas = freteRespostasAtuais.filter(r => {
    const chave=chaveRespostaFrete(r.transportadora_id,r.tipo_frete||'CIF');
    if(chavesCorreios.has(chave)) return false;
    return r.numero_cotacao || Number(r.valor_frete) > 0 || r.prazo || Number(r.gnre_valor) > 0;
  });

  const numeroCotacao = freteValor("freteCotacaoId")
    ? String(
        freteHistorico.find(c => String(c.id) === String(freteValor("freteCotacaoId")))?.numero || "01"
      ).padStart(2,"0")
    : String((freteHistorico.length || 0) + 1).padStart(2,"0");

  let texto = `*Cotação: ${numeroCotacao}*\n\n`;
  texto += `${(dados.cliente_nome || "CLIENTE").toUpperCase()}\n\n`;

  const blocos=[];

  // Agrupa as modalidades dos Correios no mesmo bloco, para o cliente comparar PAC x SEDEX.
  if(opcoesCorreios.length){
    const porTipo={};
    opcoesCorreios.forEach(op=>{
      const tipo=op.tipo_frete||'CIF';
      (porTipo[tipo] ||= []).push(op);
    });
    Object.entries(porTipo).forEach(([tipo,ops])=>{
      const lista=[...ops].sort((a,b)=>Number(a.prazoDias||9999)-Number(b.prazoDias||9999) || Number(a.valor||0)-Number(b.valor||0));
      let b=`*CORREIOS 📮*\n\n`;
      lista.forEach((op,i)=>{
        const nome=typeof nomeServicoCorreios==='function'?nomeServicoCorreios(op):(`Correios ${op.coProduto||''}`);
        b += `📦 *${nome}*${op.coProduto?` (${op.coProduto})`:''}\n`;
        b += `💰 Frete (${tipo}): *${moedaFrete(op.valor)}*\n`;
        b += `⏰ Prazo aproximado: *${op.prazoDias?`${op.prazoDias} dias úteis`:'A confirmar'}*\n`;
        if(i<lista.length-1)b+='\n';
      });
      b += `\n✅ *Escolha a opção de frete que prefere.*`;
      blocos.push(b);
    });
  }

  respostas.forEach(resposta => {
    const tipo = resposta.tipo_frete || (dados.tipo_frete === "MISTO" ? "CIF" : dados.tipo_frete);
    const gnre = Number(resposta.gnre_valor || gnreGeral || 0);
    let b=`*${String(resposta.transportadora_nome || "").toUpperCase()} 🚛*\n\n`;
    b += `🚚 Cotação: *${resposta.numero_cotacao || "-"}*\n`;
    b += `💰 Frete (${tipo}): *${moedaFrete(resposta.valor_frete)}*\n`;
    if(gnre > 0)b += `🪙 GNRE: *${moedaFrete(gnre)}*\n`;
    b += `⏰ Prazo aproximado: *${resposta.prazo || "A confirmar"}*`;
    blocos.push(b);
  });

  texto += blocos.join("\n\n--------------------------------------------------\n\n");

  const preview = freteCampo("freteWhatsappPreview");
  if(preview){
    preview.textContent = blocos.length ? texto : "Nenhuma resposta cadastrada.";
  }

  return blocos.length ? texto : "";
}

async function copiarMensagemVendedoraFrete(){
  const texto = atualizarMensagemVendedoraFrete();
  if(!texto){
    alert("Registre pelo menos uma resposta de transportadora.");
    return;
  }

  await navigator.clipboard.writeText(texto);
  mostrarBalaoSistema("Mensagem copiada", "Pronta para enviar à vendedora.");
}

function abrirWhatsAppVendedoraFrete(){
  const dados = dadosFormularioFrete();
  const cliente = clienteFretePorId(dados.cliente_id);

  const vendedora = (emailVendedoras || []).find(
    v => String(v.id) === String(cliente?.vendedora_id)
  );

  const telefone = normalizarTelefoneWhatsappFrete(
    vendedora?.whatsapp || vendedora?.telefone || ""
  );

  const texto = atualizarMensagemVendedoraFrete();

  if(!texto){
    alert("Registre pelo menos uma resposta de transportadora.");
    return;
  }

  if(!telefone){
    alert("A vendedora deste cliente não possui WhatsApp cadastrado. A mensagem foi copiada.");
    navigator.clipboard.writeText(texto);
    return;
  }

  window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`, "_blank");

  const cotacaoId=freteValor("freteCotacaoId");
  if(cotacaoId && typeof definirStatusCotacaoFrete==="function"){
    definirStatusCotacaoFrete(cotacaoId,"aguardando_autorizacao");
  }
}
