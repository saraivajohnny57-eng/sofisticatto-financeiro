
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

function formatarEnderecoClienteFrete(cliente){
  if(!cliente) return "Nenhum cadastro localizado.";
  return [
    cliente.cpf_cnpj ? `CNPJ/CPF: ${cliente.cpf_cnpj}` : "",
    cliente.endereco || "",
    cliente.numero || "",
    cliente.complemento || "",
    cliente.bairro || "",
    cliente.cep || "",
    [cliente.cidade,cliente.uf].filter(Boolean).join("/"),
    cliente.possui_gnre ? "GNRE: Sim" : "GNRE: Não"
  ].filter(Boolean).join("\n") || "Cadastro possui somente o nome.";
}

function formatarEnderecoCotacaoFrete(dados){
  return [
    dados.cpf_cnpj_destino ? `CNPJ/CPF: ${dados.cpf_cnpj_destino}` : "",
    dados.endereco_destino || "",
    dados.bairro_destino || "",
    dados.cep_destino || "",
    [dados.cidade_destino,dados.uf_destino].filter(Boolean).join("/"),
    dados.gnre_modo !== "nao" ? "GNRE: Sim" : "GNRE: Não"
  ].filter(Boolean).join("\n") || "Nenhum dado de endereço preenchido.";
}

function abrirPerguntaEnderecoFrete({titulo,texto,cliente,dados}){
  return new Promise(resolve=>{
    const modal=document.getElementById("modalEnderecoFrete");
    const tituloEl=document.getElementById("freteModalTitulo");
    const textoEl=document.getElementById("freteModalTexto");
    const comparacao=document.getElementById("freteComparacaoEndereco");
    const btnSalvar=document.getElementById("freteModalSalvarCadastro");
    const btnSomente=document.getElementById("freteModalSomenteCotacao");
    const btnCancelar=document.getElementById("freteModalCancelar");

    if(!modal || !btnSalvar || !btnSomente || !btnCancelar){
      resolve(confirm(texto) ? "salvar" : "somente");
      return;
    }

    tituloEl.textContent=titulo;
    textoEl.textContent=texto;

    comparacao.innerHTML=`
      <div class="frete-endereco-box">
        <h3>CADASTRO ATUAL</h3>
        <div>${escaparHtmlEmail(formatarEnderecoClienteFrete(cliente)).replace(/\n/g,"<br>")}</div>
      </div>
      <div class="frete-endereco-box">
        <h3>DADOS DESTA COTAÇÃO</h3>
        <div>${escaparHtmlEmail(formatarEnderecoCotacaoFrete(dados)).replace(/\n/g,"<br>")}</div>
      </div>
    `;

    modal.style.display="flex";

    const finalizar=acao=>{
      modal.style.display="none";
      btnSalvar.onclick=null;
      btnSomente.onclick=null;
      btnCancelar.onclick=null;
      resolve(acao);
    };

    btnSalvar.onclick=()=>finalizar("salvar");
    btnSomente.onclick=()=>finalizar("somente");
    btnCancelar.onclick=()=>finalizar("cancelar");
  });
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

  if(!dados.endereco_destino && !dados.cep_destino && !dados.cidade_destino){
    return {acao:"sem_endereco",cliente};
  }

  if(!cliente){
    const acao=await abrirPerguntaEnderecoFrete({
      titulo:"Cliente sem cadastro",
      texto:"Este cliente ainda não possui cadastro. Deseja salvar os dados desta cotação no cadastro ou usar somente desta vez?",
      cliente:null,
      dados
    });

    if(acao==="cancelar") return {acao:"cancelar",cliente:null};
    if(acao==="somente") return {acao:"somente",cliente:null};

    const novo = dadosCadastroClientePelaCotacao(dados);
    const resposta = await banco
      .from("email_clientes")
      .insert([novo])
      .select()
      .single();

    if(resposta.error){
      alert("A cotação não foi salva no cadastro do cliente: " + resposta.error.message);
      return {acao:"erro",cliente:null};
    }

    emailClientes.push(resposta.data);
    dados.cliente_id = resposta.data.id;
    montarClientesFrete();
    if(freteCampo("freteCliente")) freteCampo("freteCliente").value = resposta.data.id;
    mostrarBalaoSistema("Cliente cadastrado", resposta.data.nome);
    return {acao:"salvar",cliente:resposta.data};
  }

  const incompleto=cadastroClienteFreteEstaIncompleto(cliente);
  const diferente=dadosFreteDiferemDoCadastro(cliente,dados);

  if(!incompleto && !diferente){
    return {acao:"igual",cliente};
  }

  const acao=await abrirPerguntaEnderecoFrete({
    titulo: incompleto ? "Cadastro incompleto" : "Endereço diferente",
    texto: incompleto
      ? "O cliente possui apenas parte dos dados cadastrados. Deseja completar o cadastro com os dados desta cotação ou usar somente desta vez?"
      : "O endereço desta cotação é diferente do cadastro atual. Deseja substituir o cadastro ou usar este endereço somente nesta cotação?",
    cliente,
    dados
  });

  if(acao==="cancelar") return {acao:"cancelar",cliente};
  if(acao==="somente") return {acao:"somente",cliente};

  const atualizacao = dadosCadastroClientePelaCotacao(dados);
  const resposta = await banco
    .from("email_clientes")
    .update(atualizacao)
    .eq("id", cliente.id)
    .select()
    .single();

  if(resposta.error){
    alert("Não foi possível atualizar o cadastro do cliente: " + resposta.error.message);
    return {acao:"erro",cliente};
  }

  const indice = emailClientes.findIndex(c => String(c.id) === String(cliente.id));
  if(indice >= 0) emailClientes[indice] = resposta.data;

  montarClientesFrete();
  mostrarBalaoSistema("Cadastro atualizado", resposta.data.nome);
  return {acao:"salvar",cliente:resposta.data};
}
