
/* =========================================================
   WHATSAPP — mensagem de comparação para a vendedora
   ========================================================= */
async function copiarTextoFrete(id){
  const texto = freteCampo("freteTexto_" + id)?.innerText || "";
  if(!texto) return;

  await navigator.clipboard.writeText(texto);
  mostrarBalaoSistema("Texto copiado", "Cole no WhatsApp ou e-mail da transportadora.");
}

function atualizarMensagemVendedoraFrete(){
  const dados = dadosFormularioFrete();
  const respostas = freteRespostasAtuais.filter(
    r => r.numero_cotacao || Number(r.valor_frete) > 0 || r.prazo
  );

  const numeroCotacao = freteValor("freteCotacaoId")
    ? String(
        freteHistorico.find(c => String(c.id) === String(freteValor("freteCotacaoId")))?.numero || "01"
      ).padStart(2,"0")
    : String((freteHistorico.length || 0) + 1).padStart(2,"0");

  let texto = `Cotação: ${numeroCotacao}\n\n`;
  texto += `${(dados.cliente_nome || "CLIENTE").toUpperCase()}\n\n`;

  respostas.forEach((resposta, indice) => {
    texto += `${String(resposta.transportadora_nome || "").toUpperCase()} 🚛\n\n`;
    texto += `🚚 Cotação: ${resposta.numero_cotacao || "Aguardando"}\n`;
    texto += `💰 Frete (${dados.tipo_frete}): ${moedaFrete(resposta.valor_frete)}\n`;

    if(Number(resposta.gnre_valor) > 0){
      texto += `🪙 GNRE: ${moedaFrete(resposta.gnre_valor)}\n`;
    }

    texto += `⏰ Prazo aproximado: ${resposta.prazo || "A confirmar"}\n`;

    if(indice < respostas.length - 1){
      texto += "\n--------------------------------------------\n\n";
    }
  });

  const preview = freteCampo("freteWhatsappPreview");
  if(preview){
    preview.textContent = respostas.length
      ? texto
      : "Nenhuma resposta cadastrada.";
  }

  return respostas.length ? texto : "";
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

  const telefone = String(vendedora?.whatsapp || vendedora?.telefone || "")
    .replace(/\D/g, "");

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

  const numero = telefone.startsWith("55") ? telefone : "55" + telefone;
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank");
}
