
/* =========================================================
   CLIENTES — integração do cadastro com cotações
   ========================================================= */
function freteCampo(id){
  return document.getElementById(id);
}

function freteValor(id){
  return freteCampo(id)?.value?.trim() || "";
}

function clienteFretePorId(id){
  return (emailClientes || []).find(c => String(c.id) === String(id));
}

function clienteFretePorNome(nome){
  const procurado = normalizarNomeEmail(nome || "");
  return (emailClientes || []).find(c => normalizarNomeEmail(c.nome || "") === procurado);
}

function montarClientesFrete(){
  const select = freteCampo("freteCliente");
  if(!select) return;

  const selecionado = select.value;
  const lista = [...(emailClientes || [])].sort((a,b) =>
    String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
  );

  select.innerHTML =
    '<option value="">Selecione ou preencha manualmente</option>' +
    lista.map(c => `<option value="${c.id}">${escaparHtmlEmail(c.nome || "")}</option>`).join("");

  if(lista.some(c => String(c.id) === String(selecionado))){
    select.value = selecionado;
  }
}

function preencherClienteFrete(){
  const cliente = clienteFretePorId(freteValor("freteCliente"));
  if(!cliente) return;

  const set = (id, valor) => {
    const el = freteCampo(id);
    if(el) el.value = valor || "";
  };

  set("freteClienteNome", cliente.nome);
  set("freteCpfCnpj", cliente.cpf_cnpj || cliente.documento || cliente.cnpj_cpf);
  set("freteCep", cliente.cep);
  set("freteCidade", cliente.cidade);
  set("freteUf", cliente.uf);

  const enderecoCompleto = [
    cliente.endereco,
    cliente.numero,
    cliente.complemento
  ].filter(Boolean).join(", ");

  set("freteEndereco", enderecoCompleto);
  set("freteBairro", cliente.bairro);

  if(cliente.possui_gnre === true){
    set("freteGnreModo", "automatico");
  }

  if(cliente.origem_produto_padrao){
    set("freteOrigemProduto", cliente.origem_produto_padrao);
  }

  if(typeof calcularGnreFrete === "function") calcularGnreFrete();
}

function dadosCadastroClientePelaCotacao(dados){
  const enderecoDigitado = dados.endereco_destino || "";
  return {
    nome: dados.cliente_nome,
    cpf_cnpj: dados.cpf_cnpj_destino || null,
    cep: dados.cep_destino || null,
    cidade: dados.cidade_destino || null,
    uf: dados.uf_destino || null,
    endereco: enderecoDigitado || null,
    bairro: dados.bairro_destino || null,
    possui_gnre: dados.gnre_modo !== "nao",
    origem_produto_padrao: dados.origem_produto || "nacional"
  };
}

function cadastroClienteFreteEstaIncompleto(cliente){
  if(!cliente) return true;
  return !cliente.cpf_cnpj ||
         !cliente.cep ||
         !cliente.cidade ||
         !cliente.uf ||
         !cliente.endereco;
}

function dadosFreteDiferemDoCadastro(cliente, dados){
  if(!cliente) return true;
  const cadastro = dadosCadastroClientePelaCotacao(dados);
  const norm = v => String(v || "").trim().toUpperCase();

  return (
    norm(cliente.cpf_cnpj) !== norm(cadastro.cpf_cnpj) ||
    norm(cliente.cep) !== norm(cadastro.cep) ||
    norm(cliente.cidade) !== norm(cadastro.cidade) ||
    norm(cliente.uf) !== norm(cadastro.uf) ||
    norm(cliente.endereco) !== norm(cadastro.endereco) ||
    norm(cliente.bairro) !== norm(cadastro.bairro) ||
    Boolean(cliente.possui_gnre) !== Boolean(cadastro.possui_gnre) ||
    norm(cliente.origem_produto_padrao || "nacional") !== norm(cadastro.origem_produto_padrao)
  );
}

async function perguntarAtualizacaoClienteFrete(dados){
  let cliente = clienteFretePorId(dados.cliente_id);

  if(!cliente && dados.cliente_nome){
    cliente = clienteFretePorNome(dados.cliente_nome);
    if(cliente){
      dados.cliente_id = cliente.id;
      if(freteCampo("freteCliente")) freteCampo("freteCliente").value = cliente.id;
    }
  }

  if(!cliente){
    const criar = confirm(
      "Este cliente ainda não está cadastrado.\n\n" +
      "Clique em OK para criar o cadastro com os dados desta cotação.\n" +
      "Clique em Cancelar para usar os dados somente nesta cotação."
    );

    if(!criar) return null;

    const novo = dadosCadastroClientePelaCotacao(dados);
    const resposta = await banco
      .from("email_clientes")
      .insert([novo])
      .select()
      .single();

    if(resposta.error){
      alert("A cotação poderá ser salva, mas não foi possível cadastrar o cliente: " + resposta.error.message);
      return null;
    }

    emailClientes.push(resposta.data);
    dados.cliente_id = resposta.data.id;
    montarClientesFrete();
    if(freteCampo("freteCliente")) freteCampo("freteCliente").value = resposta.data.id;
    mostrarBalaoSistema("Cliente cadastrado", resposta.data.nome);
    return resposta.data;
  }

  if(!cadastroClienteFreteEstaIncompleto(cliente) && !dadosFreteDiferemDoCadastro(cliente, dados)){
    return cliente;
  }

  const atualizar = confirm(
    "O cadastro deste cliente está incompleto ou possui dados diferentes.\n\n" +
    "Clique em OK para ATUALIZAR/SUBSTITUIR o cadastro com os dados desta cotação.\n" +
    "Clique em Cancelar para usar os dados SOMENTE NESTA COTAÇÃO."
  );

  if(!atualizar) return cliente;

  const atualizacao = dadosCadastroClientePelaCotacao(dados);
  const resposta = await banco
    .from("email_clientes")
    .update(atualizacao)
    .eq("id", cliente.id)
    .select()
    .single();

  if(resposta.error){
    alert("A cotação poderá ser salva, mas o cadastro do cliente não foi atualizado: " + resposta.error.message);
    return cliente;
  }

  const indice = emailClientes.findIndex(c => String(c.id) === String(cliente.id));
  if(indice >= 0) emailClientes[indice] = resposta.data;

  montarClientesFrete();
  mostrarBalaoSistema("Cadastro atualizado", resposta.data.nome);
  return resposta.data;
}
