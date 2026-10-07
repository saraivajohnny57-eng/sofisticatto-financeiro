
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

function textoPesquisaClienteFrete(cliente){
  return [
    cliente.nome,
    cliente.cpf_cnpj,
    ...(Array.isArray(cliente.emails)?cliente.emails:[]),
    cliente.cidade,
    cliente.uf,
    cliente.telefone,
    cliente.celular
  ].filter(Boolean).join(" ");
}

function montarClientesFrete(){
  const listaHtml=freteCampo("freteClientesLista");
  const contador=freteCampo("freteClientesCarregados");
  if(!listaHtml) return;

  const lista=[...(emailClientes || [])].sort((a,b)=>
    String(a.nome || "").localeCompare(String(b.nome || ""),"pt-BR")
  );

  // O datalist fica leve mostrando nome + documento/cidade.
  listaHtml.innerHTML=lista.map(cliente=>{
    const complemento=[
      cliente.cpf_cnpj,
      [cliente.cidade,cliente.uf].filter(Boolean).join("/")
    ].filter(Boolean).join(" • ");

    return `<option value="${escaparHtmlEmail(cliente.nome || "")}" label="${escaparHtmlEmail(complemento)}"></option>`;
  }).join("");

  if(contador){
    contador.textContent=`${lista.length.toLocaleString("pt-BR")} clientes disponíveis`;
  }
}

function limparSelecaoClienteFrete(){
  const id=freteCampo("freteCliente");
  if(id) id.value="";
}

function clientesFreteFiltrados(termo,limite=12){
  const busca=normalizarNomeEmail(termo || "");
  if(!busca) return [];

  const palavras=busca.split(" ").filter(Boolean);

  return (emailClientes || [])
    .map(cliente=>{
      const nome=normalizarNomeEmail(cliente.nome || "");
      const texto=normalizarNomeEmail(textoPesquisaClienteFrete(cliente));
      let pontos=0;

      if(nome===busca) pontos+=100;
      if(nome.startsWith(busca)) pontos+=60;
      if(nome.includes(busca)) pontos+=40;
      if(palavras.every(p=>texto.includes(p))) pontos+=25;
      if(texto.includes(busca)) pontos+=15;

      return {cliente,pontos};
    })
    .filter(item=>item.pontos>0)
    .sort((a,b)=>b.pontos-a.pontos||
      String(a.cliente.nome||"").localeCompare(String(b.cliente.nome||""),"pt-BR")
    )
    .slice(0,limite)
    .map(item=>item.cliente);
}

function pesquisarClienteFreteDigitado(){
  limparSelecaoClienteFrete();

  const campo=freteCampo("freteClienteBusca");
  const resultados=freteCampo("freteClienteResultados");
  if(!campo || !resultados) return;

  const termo=campo.value.trim();

  if(termo.length<2){
    resultados.innerHTML="";
    resultados.style.display="none";
    return;
  }

  const lista=clientesFreteFiltrados(termo);

  resultados.innerHTML=lista.length
    ? lista.map(cliente=>`
      <button type="button" class="frete-cliente-resultado"
        onclick="selecionarClienteFretePorId('${cliente.id}')">
        <strong>${escaparHtmlEmail(cliente.nome||"")}</strong>
        <span>${escaparHtmlEmail([
          cliente.cpf_cnpj,
          [cliente.cidade,cliente.uf].filter(Boolean).join("/"),
          Array.isArray(cliente.emails)?cliente.emails[0]:""
        ].filter(Boolean).join(" • "))}</span>
      </button>`).join("")
    : `<div class="frete-cliente-sem-resultado">
        Nenhum cliente carregado encontrado. Clique em <b>Buscar</b> para consultar diretamente no banco.
      </div>`;

  resultados.style.display="block";
}

function selecionarClienteFreteDigitado(){
  const nome=freteValor("freteClienteBusca");
  if(!nome) return;

  const exato=clienteFretePorNome(nome);
  if(exato){
    selecionarClienteFretePorId(exato.id);
  }
}

function selecionarClienteFretePorId(id){
  const cliente=clienteFretePorId(id);
  if(!cliente) return;

  const campoId=freteCampo("freteCliente");
  const busca=freteCampo("freteClienteBusca");
  const resultados=freteCampo("freteClienteResultados");

  if(campoId) campoId.value=cliente.id;
  if(busca) busca.value=cliente.nome || "";
  if(resultados){
    resultados.innerHTML="";
    resultados.style.display="none";
  }

  preencherClienteFrete();
}

async function buscarClienteFreteNoBanco(){
  const termo=freteValor("freteClienteBusca");

  if(termo.length<2){
    alert("Digite pelo menos duas letras do nome, CNPJ/CPF ou e-mail.");
    return;
  }

  const botao=document.querySelector(".frete-busca-cliente .btn");
  if(botao){
    botao.disabled=true;
    botao.textContent="Buscando...";
  }

  try{
    // Primeiro tenta nos clientes já carregados.
    const locais=clientesFreteFiltrados(termo,30);
    if(locais.length){
      pesquisarClienteFreteDigitado();
      return;
    }

    // Busca por nome diretamente no Supabase.
    const respostaNome=await banco
      .from("email_clientes")
      .select("*")
      .ilike("nome",`%${termo}%`)
      .order("nome",{ascending:true})
      .limit(30);

    if(respostaNome.error) throw respostaNome.error;

    let encontrados=respostaNome.data || [];

    // Se o termo for parecido com documento, tenta CNPJ/CPF também.
    const documento=String(termo).replace(/\D/g,"");
    if(documento.length>=5){
      const respostaDocumento=await banco
        .from("email_clientes")
        .select("*")
        .ilike("cpf_cnpj",`%${documento}%`)
        .limit(30);

      if(!respostaDocumento.error){
        encontrados.push(...(respostaDocumento.data || []));
      }
    }

    const mapa=new Map();
    encontrados.forEach(cliente=>mapa.set(String(cliente.id),cliente));
    encontrados=[...mapa.values()];

    // Incorpora resultados à memória sem apagar a lista atual.
    encontrados.forEach(cliente=>{
      const indice=emailClientes.findIndex(c=>String(c.id)===String(cliente.id));
      if(indice>=0) emailClientes[indice]=cliente;
      else emailClientes.push(cliente);
    });

    emailClientes.sort((a,b)=>
      String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR")
    );

    montarClientesFrete();

    const resultados=freteCampo("freteClienteResultados");
    if(resultados){
      resultados.innerHTML=encontrados.length
        ? encontrados.map(cliente=>`
          <button type="button" class="frete-cliente-resultado"
            onclick="selecionarClienteFretePorId('${cliente.id}')">
            <strong>${escaparHtmlEmail(cliente.nome||"")}</strong>
            <span>${escaparHtmlEmail([
              cliente.cpf_cnpj,
              [cliente.cidade,cliente.uf].filter(Boolean).join("/")
            ].filter(Boolean).join(" • "))}</span>
          </button>`).join("")
        : `<div class="frete-cliente-sem-resultado">
            Nenhum cliente encontrado no banco. Você pode preencher os dados manualmente.
          </div>`;
      resultados.style.display="block";
    }
  }catch(erro){
    console.error("Erro ao buscar cliente para cotação:",erro);
    alert("Não foi possível buscar o cliente: "+(erro.message||erro));
  }finally{
    if(botao){
      botao.disabled=false;
      botao.textContent="Buscar";
    }
  }
}


function preencherClienteFrete(){
  let cliente=clienteFretePorId(freteValor("freteCliente"));

  if(!cliente){
    cliente=clienteFretePorNome(freteValor("freteClienteBusca"));
  }

  if(!cliente) return;

  const campoId=freteCampo("freteCliente");
  const campoBusca=freteCampo("freteClienteBusca");
  if(campoId) campoId.value=cliente.id;
  if(campoBusca) campoBusca.value=cliente.nome||"";

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
      if(freteCampo("freteCliente")) freteCampo("freteCliente").value=cliente.id;
      if(freteCampo("freteClienteBusca")) freteCampo("freteClienteBusca").value=cliente.nome||"";
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
    if(freteCampo("freteCliente")) freteCampo("freteCliente").value=resposta.data.id;
    if(freteCampo("freteClienteBusca")) freteCampo("freteClienteBusca").value=resposta.data.nome||"";
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


/* IMPORTAÇÃO DE CADASTROS TXT/CSV */
let clientesImportacaoPendentes=[];
function normalizarDocumentoCliente(v){return String(v||"").replace(/\D/g,"")}
function formatarCpfCnpjImportacao(v){const n=normalizarDocumentoCliente(v);if(n.length===14)return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5");if(n.length===11)return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,"$1.$2.$3-$4");return v||""}
function detectarEmailImportacao(valores){return valores.find(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(v||"").trim()))||""}
function analisarCadastroTextoPipe(conteudo,nomeArquivo="arquivo.txt"){
 const linhas=String(conteudo||"").replace(/\r/g,"").split("\n").map(l=>l.trim()).filter(Boolean);
 const linha1=linhas.find(l=>l.startsWith("1|")),linha2=linhas.find(l=>l.startsWith("2|"));
 if(!linha1||!linha2)return{erro:"Formato não reconhecido: faltam as linhas 1 e 2.",arquivo:nomeArquivo,status:"erro",selecionado:false};
 const c1=linha1.split("|"),c2=linha2.split("|");
 const nome=(c1[7]||"").trim(),email=detectarEmailImportacao(c2);
 if(!nome)return{erro:"Nome do cliente não identificado.",arquivo:nomeArquivo,status:"erro",selecionado:false};
 const telefone=(c2[8]||c2[22]||"").trim(),celular=(c2[10]||c2[23]||"").trim(),contato=(c2[11]||"").trim();
 return{arquivo:nomeArquivo,nome,cpf_cnpj:formatarCpfCnpjImportacao(c1[2]||""),inscricao_estadual:(c1[3]||"").trim(),endereco:(c2[1]||c2[16]||"").trim(),bairro:(c2[2]||c2[17]||"").trim(),numero:(c2[3]||c2[18]||"").trim(),complemento:(c2[4]||"").trim(),cep:(c2[5]||c2[19]||"").trim(),cidade:"",uf:(c2[6]||c2[20]||"").trim().toUpperCase(),telefone,celular,contato,emails:email?[email]:[],observacao:[contato?`Contato: ${contato}`:"",telefone?`Telefone: ${telefone}`:"",celular?`Celular: ${celular}`:""].filter(Boolean).join(" | "),selecionado:true}
}

function nomeComparacaoCliente(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/&/g," E ").replace(/\b(LTDA|ME|EPP|EIRELI|SA|S A)\b/g," ").replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim()}
function similaridadeNomesCliente(a,b){const x=nomeComparacaoCliente(a),y=nomeComparacaoCliente(b);if(!x||!y)return 0;if(x===y)return 1;const A=new Set(x.split(" ")),B=new Set(y.split(" "));const i=[...A].filter(p=>B.has(p)).length,u=new Set([...A,...B]).size||1;const menor=x.length<=y.length?x:y,maior=x.length>y.length?x:y;return Math.max(i/u,maior.includes(menor)?menor.length/maior.length:0)}
function encontrarClientesSemelhantesImportacao(nome){return(emailClientes||[]).map(cliente=>({cliente,score:similaridadeNomesCliente(nome,cliente.nome)})).filter(x=>x.score>=.72).sort((a,b)=>b.score-a.score)}
function analisarRelatorioClientes(conteudo,nomeArquivo="relatorio.txt"){
 const partes=String(conteudo||"").replace(/\r/g,"").split(/-{20,}/g),r=[];
 for(const p of partes){if(!p.includes("CNPJ / CPF....:")||!p.includes("Razao social:"))continue;
 const linhas=p.split("\n"),l1=linhas.find(l=>l.includes("CNPJ / CPF....:"))||"",lc=linhas.find(l=>l.includes("Codigo cliente:"))||"",le=linhas.find(l=>l.includes("Endereco......:"))||"",lb=linhas.find(l=>l.includes("Bairro........:"))||"",lz=linhas.find(l=>l.includes("C.E.P.........:"))||"",li=linhas.find(l=>l.includes("Insc.estadual.:"))||"",lm=linhas.find(l=>l.includes("E-mail........:"))||"";
 const g=(s,rx)=>(s.match(rx)||[])[1]?.trim()||"";
 const nome=g(l1,/Razao social:\s*(.*)$/);if(!nome)continue;
 const emailTxt=g(lm,/E-mail\.\.\.\.\.\.\.\.:\s*(.*)$/),emails=emailTxt.split(/[;\s\/]+/).filter(e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(e));
 r.push({arquivo:nomeArquivo,nome,cpf_cnpj:formatarCpfCnpjImportacao(g(l1,/CNPJ \/ CPF\.\.\.\.:\s*(.*?)\s+Razao social:/)),codigo_cliente:g(lc,/Codigo cliente:\s*(.*?)\s+Fantasia/),nome_fantasia:g(lc,/Fantasia\.\.\.\.:\s*(.*)$/),endereco:g(le,/Endereco\.\.\.\.\.\.:\s*(.*?)\s+Nr\.:/),numero:g(le,/Nr\.:\s*(.*)$/),bairro:g(lb,/Bairro\.\.\.\.\.\.\.\.:\s*(.*?)\s+Cidade\.\.\.\.\.\.:/),cidade:g(lb,/Cidade\.\.\.\.\.\.:\s*(.*)$/),cep:g(lz,/C\.E\.P\.\.\.\.\.\.\.\.\.:\s*(.*?)\s+Telefone\.\.\.\.:/),telefone:g(lz,/Telefone\.\.\.\.:\s*(.*)$/),inscricao_estadual:g(li,/Insc\.estadual\.:\s*(.*?)\s+Contato\.\.\.\.\.:/),contato:g(li,/Contato\.\.\.\.\.:\s*(.*)$/),emails,uf:"",complemento:"",celular:"",observacao:"",selecionado:true})}
 return r}
function encontrarClienteImportacao(d){
 const doc=normalizarDocumentoCliente(d.cpf_cnpj);
 if(doc){const c=(emailClientes||[]).find(x=>normalizarDocumentoCliente(x.cpf_cnpj)===doc);if(c)return{tipo:"cnpj",cliente:c,score:1}}
 const n=nomeComparacaoCliente(d.nome);const ex=(emailClientes||[]).find(x=>nomeComparacaoCliente(x.nome)===n);if(ex)return{tipo:"nome_exato",cliente:ex,score:1};
 const s=encontrarClientesSemelhantesImportacao(d.nome);return s.length?{tipo:"nome_semelhante",cliente:s[0].cliente,score:s[0].score}:null
}
async function analisarArquivosClientesImportados(files){
 clientesImportacaoPendentes=[];const formato=document.getElementById("importadorClienteFormato")?.value||"automatico";
 for(const arq of Array.from(files||[])){try{const c=await arq.text();let regs=[];
 const rel=c.includes("CNPJ / CPF....:")&&c.includes("Razao social:"),pipe=c.includes("\n1|")||c.startsWith("1|");
 if(formato==="relatorio"||(formato==="automatico"&&rel))regs=analisarRelatorioClientes(c,arq.name);
 else if(formato==="pipe"||(formato==="automatico"&&pipe))regs=[analisarCadastroTextoPipe(c,arq.name)];
 else regs=[{arquivo:arq.name,erro:"Formato não reconhecido.",status:"erro",selecionado:false}];
 if(!regs.length)regs=[{arquivo:arq.name,erro:"Nenhum cliente identificado.",status:"erro",selecionado:false}];
 for(const d of regs){if(!d.erro){d.match=encontrarClienteImportacao(d);d.existente=d.match?.cliente||null;d.status=d.existente?"duplicado":"novo"}clientesImportacaoPendentes.push(d)}
 }catch(e){clientesImportacaoPendentes.push({arquivo:arq.name,erro:e.message,status:"erro",selecionado:false})}}
 montarImportacaoClientes()
}
function montarImportacaoClientes(){
 const box=document.getElementById("importadorClientesLista"),resumo=document.getElementById("importadorClientesResumo"),botao=document.getElementById("btnImportarClientesConfirmar");if(!box||!resumo||!botao)return;
 const novos=clientesImportacaoPendentes.filter(i=>i.status==="novo").length,duplicados=clientesImportacaoPendentes.filter(i=>i.status==="duplicado").length,erros=clientesImportacaoPendentes.filter(i=>i.status==="erro").length,sel=clientesImportacaoPendentes.filter(i=>i.selecionado).length;
 resumo.style.display="grid";resumo.innerHTML=`<div><span>Arquivos</span><b>${clientesImportacaoPendentes.length}</b></div><div><span>Novos</span><b>${novos}</b></div><div><span>Existentes</span><b>${duplicados}</b></div><div><span>Erros</span><b>${erros}</b></div>`;
 box.innerHTML=clientesImportacaoPendentes.map((i,n)=>i.status==="erro"?`<div class="importador-item erro"><input type="checkbox" disabled><div class="importador-dados"><strong>${escaparHtmlEmail(i.arquivo)}</strong><br>${escaparHtmlEmail(i.erro)}</div><span class="importador-selo erro">ERRO</span></div>`:`<div class="importador-item ${i.status}"><input type="checkbox" ${i.selecionado?"checked":""} onchange="alterarSelecaoImportacaoCliente(${n},this.checked)"><div class="importador-dados"><strong>${escaparHtmlEmail(i.nome)}</strong><br>CNPJ/CPF: ${escaparHtmlEmail(i.cpf_cnpj||"-")}<br>Endereço: ${escaparHtmlEmail([i.endereco,i.numero,i.bairro].filter(Boolean).join(", ")||"-")}<br>CEP/UF: ${escaparHtmlEmail([i.cep,i.uf].filter(Boolean).join(" - ")||"-")}<br>E-mail: ${escaparHtmlEmail((i.emails||[]).join("; ")||"-")}<br>Telefone: ${escaparHtmlEmail(i.celular||i.telefone||"-")}</div><span class="importador-selo ${i.status}">${i.status==="duplicado"?"JÁ CADASTRADO":"NOVO"}</span></div>`).join("");
 botao.style.display=sel?"inline-block":"none"
}
function alterarSelecaoImportacaoCliente(i,v){if(clientesImportacaoPendentes[i])clientesImportacaoPendentes[i].selecionado=v;montarImportacaoClientes()}
function preencherSelectVendedoraImportacao(){const s=document.getElementById("importadorClienteVendedora");if(!s)return;const a=s.value;s.innerHTML='<option value="">Não definir</option>'+(emailVendedoras||[]).map(v=>`<option value="${v.id}">${escaparHtmlEmail(v.nome||"")}</option>`).join("");if(typeof usuarioEhVendedoraRastreio==="function"&&usuarioEhVendedoraRastreio()){s.value=String(usuarioLogado?.vendedora_id||"");s.disabled=true}else{s.disabled=false;s.value=a}}
function dadosBancoImportacaoCliente(i){
  const vend=document.getElementById("importadorClienteVendedora")?.value||null;
  return{
    nome:i.nome,
    cpf_cnpj:i.cpf_cnpj||null,
    emails:i.emails||[],
    vendedora_id:vend||i.existente?.vendedora_id||null,
    endereco:i.endereco||null,
    numero:i.numero||null,
    complemento:i.complemento||null,
    bairro:i.bairro||null,
    cep:i.cep||null,
    cidade:i.cidade||null,
    uf:i.uf||null,
    observacao:i.observacao||null,
    inscricao_estadual:i.inscricao_estadual||null,
    telefone:i.telefone||null,
    celular:i.celular||null,
    contato:i.contato||null,
    importado_em:new Date().toISOString(),
    importado_por:usuarioLogado?.login||null,
    atualizado_em:new Date().toISOString()
  };
}
function preencherSomenteVaziosCliente(e,n){const r={};Object.entries(n).forEach(([k,v])=>{const a=e?.[k];r[k]=Array.isArray(v)?((Array.isArray(a)&&a.length)?a:v):((a!==null&&a!==undefined&&String(a).trim()!=="")?a:v)});r.atualizado_em=new Date().toISOString();return r}
function perguntarDuplicadoImportacao(i){return new Promise(resolve=>{const m=document.getElementById("modalImportacaoClienteDuplicado"),c=document.getElementById("importacaoDuplicadoComparacao");if(!m||!c){resolve("ignorar");return}const a=i.existente||{};c.innerHTML=`<div class="frete-endereco-box"><h3>CADASTRO ATUAL</h3><div>${escaparHtmlEmail(a.nome||"")}<br>CNPJ/CPF: ${escaparHtmlEmail(a.cpf_cnpj||"-")}<br>${escaparHtmlEmail([a.endereco,a.numero,a.bairro].filter(Boolean).join(", ")||"-")}<br>${escaparHtmlEmail([a.cep,a.cidade,a.uf].filter(Boolean).join(" - ")||"-")}</div></div><div class="frete-endereco-box"><h3>DADOS DO ARQUIVO</h3><div>${escaparHtmlEmail(i.nome||"")}<br>CNPJ/CPF: ${escaparHtmlEmail(i.cpf_cnpj||"-")}<br>${escaparHtmlEmail([i.endereco,i.numero,i.bairro].filter(Boolean).join(", ")||"-")}<br>${escaparHtmlEmail([i.cep,i.cidade,i.uf].filter(Boolean).join(" - ")||"-")}</div></div>`;m.style.display="flex";const fim=x=>{m.style.display="none";resolve(x)};document.getElementById("importacaoDuplicadoAtualizarTudo").onclick=()=>fim("atualizar_tudo");document.getElementById("importacaoDuplicadoPreencherVazios").onclick=()=>fim("atualizar_vazios");document.getElementById("importacaoDuplicadoIgnorar").onclick=()=>fim("ignorar");document.getElementById("importacaoDuplicadoCancelar").onclick=()=>fim("cancelar")})}
function perguntarNomeSemelhanteImportacao(i){return new Promise(resolve=>{const m=document.getElementById("modalImportacaoNomeSemelhante"),c=document.getElementById("importacaoNomeComparacao"),a=i.match?.cliente;if(!m||!c||!a){resolve("criar_novo");return}c.innerHTML=`<div class="frete-endereco-box"><h3>CADASTRO ENCONTRADO</h3><div>${escaparHtmlEmail(a.nome||"")}<br>CNPJ/CPF: ${escaparHtmlEmail(a.cpf_cnpj||"Não cadastrado")}<br>${escaparHtmlEmail([a.endereco,a.numero,a.bairro].filter(Boolean).join(", ")||"Sem endereço")}</div></div><div class="frete-endereco-box"><h3>DADOS DO RELATÓRIO</h3><div>${escaparHtmlEmail(i.nome||"")}<br>CNPJ/CPF: ${escaparHtmlEmail(i.cpf_cnpj||"Não informado")}<br>${escaparHtmlEmail([i.endereco,i.numero,i.bairro].filter(Boolean).join(", ")||"Sem endereço")}</div></div>`;m.style.display="flex";const f=x=>{m.style.display="none";resolve(x)};document.getElementById("importacaoNomeCompletar").onclick=()=>f("completar");document.getElementById("importacaoNomeCriarNovo").onclick=()=>f("criar_novo");document.getElementById("importacaoNomeIgnorar").onclick=()=>f("ignorar");document.getElementById("importacaoNomeCancelar").onclick=()=>f("cancelar")})}

function colunaAusenteErroImportacao(erro){
  const mensagem=String(erro?.message || erro || "");
  const resultado=mensagem.match(/Could not find the ['"]([^'"]+)['"] column/i);
  return resultado ? resultado[1] : "";
}


let importacaoClientesCancelada=false;
let importacaoClientesInicio=0;

function abrirProgressoImportacaoClientes(total){
  importacaoClientesCancelada=false;
  importacaoClientesInicio=Date.now();

  const modal=document.getElementById("modalProgressoImportacaoClientes");
  if(modal) modal.style.display="flex";

  document.getElementById("btnCancelarImportacaoClientes").style.display="inline-block";
  document.getElementById("btnFecharImportacaoClientes").style.display="none";
  document.getElementById("importacaoProgressoTitulo").textContent="Importando clientes...";
  document.getElementById("importacaoProgressoCliente").textContent="Preparando importação.";
  document.getElementById("importacaoProgressoPercentual").textContent="0%";
  document.getElementById("importacaoProgressoBarraInterna").style.width="0%";
  document.getElementById("importacaoProgressoContagem").textContent=`0 de ${total}`;
  document.getElementById("importacaoProgressoTempo").textContent="Calculando tempo...";
  document.getElementById("importacaoQtdNovos").textContent="0";
  document.getElementById("importacaoQtdAtualizados").textContent="0";
  document.getElementById("importacaoQtdIgnorados").textContent="0";
  document.getElementById("importacaoQtdErros").textContent="0";
  document.getElementById("importacaoProgressoLog").innerHTML="";
}

function atualizarProgressoImportacaoClientes({
  atual,total,nome,novos,atualizados,ignorados,erros,tipo,mensagem
}){
  const percentual=total ? Math.round(atual/total*100) : 0;
  const decorrido=Math.max(1,(Date.now()-importacaoClientesInicio)/1000);
  const porItem=atual ? decorrido/atual : 0;
  const restante=Math.max(0,Math.round((total-atual)*porItem));

  document.getElementById("importacaoProgressoCliente").textContent=
    nome ? `Processando: ${nome}` : "Processando...";
  document.getElementById("importacaoProgressoPercentual").textContent=`${percentual}%`;
  document.getElementById("importacaoProgressoBarraInterna").style.width=`${percentual}%`;
  document.getElementById("importacaoProgressoContagem").textContent=`${atual} de ${total}`;
  document.getElementById("importacaoProgressoTempo").textContent=
    restante>60
      ? `Tempo restante aproximado: ${Math.floor(restante/60)} min ${restante%60} s`
      : `Tempo restante aproximado: ${restante} s`;

  document.getElementById("importacaoQtdNovos").textContent=novos;
  document.getElementById("importacaoQtdAtualizados").textContent=atualizados;
  document.getElementById("importacaoQtdIgnorados").textContent=ignorados;
  document.getElementById("importacaoQtdErros").textContent=erros;

  if(mensagem){
    const log=document.getElementById("importacaoProgressoLog");
    const linha=document.createElement("div");
    linha.className=`importacao-log-linha ${tipo || ""}`;
    linha.textContent=mensagem;
    log.appendChild(linha);
    log.scrollTop=log.scrollHeight;
  }
}

function finalizarProgressoImportacaoClientes(cancelada=false){
  document.getElementById("importacaoProgressoTitulo").textContent=
    cancelada ? "Importação cancelada" : "Importação concluída";
  document.getElementById("importacaoProgressoCliente").textContent=
    cancelada
      ? "Os clientes já processados foram mantidos."
      : "Todos os clientes selecionados foram processados.";
  document.getElementById("btnCancelarImportacaoClientes").style.display="none";
  document.getElementById("btnFecharImportacaoClientes").style.display="inline-block";
}

function cancelarImportacaoClientesEmAndamento(){
  importacaoClientesCancelada=true;
  document.getElementById("importacaoProgressoCliente").textContent=
    "Cancelando após o cliente atual...";
  document.getElementById("btnCancelarImportacaoClientes").disabled=true;
}

function fecharProgressoImportacaoClientes(){
  const modal=document.getElementById("modalProgressoImportacaoClientes");
  if(modal) modal.style.display="none";
  const cancelar=document.getElementById("btnCancelarImportacaoClientes");
  if(cancelar) cancelar.disabled=false;
}

function pausaInterfaceImportacao(){
  return new Promise(resolve=>setTimeout(resolve,0));
}

async function buscarClienteExistenteAntesDeInserir(dados){
  const documento=normalizarDocumentoCliente(dados?.cpf_cnpj);

  if(documento){
    const local=(emailClientes || []).find(cliente =>
      normalizarDocumentoCliente(cliente.cpf_cnpj)===documento
    );
    if(local) return local;

    const porDocumento=await banco
      .from("email_clientes")
      .select("*")
      .eq("cpf_cnpj",dados.cpf_cnpj)
      .limit(1);

    if(!porDocumento.error && porDocumento.data?.length){
      return porDocumento.data[0];
    }
  }

  const nome=String(dados?.nome || "").trim();
  if(!nome) return null;

  const nomeNormalizado=nomeComparacaoCliente(nome);
  const local=(emailClientes || []).find(cliente =>
    nomeComparacaoCliente(cliente.nome || "")===nomeNormalizado
  );
  if(local) return local;

  // Consulta exata antes do INSERT para não gerar conflito 409 no console.
  const porNome=await banco
    .from("email_clientes")
    .select("*")
    .eq("nome",nome)
    .limit(5);

  if(!porNome.error && porNome.data?.length){
    return porNome.data.find(cliente =>
      nomeComparacaoCliente(cliente.nome || "")===nomeNormalizado
    ) || porNome.data[0];
  }

  return null;
}

async function gravarClienteImportacaoSeguro({tipo,id,dados}){
  const payload={...dados};
  const ignoradas=[];

  if(tipo==="insert"){
    const existenteAntes=await buscarClienteExistenteAntesDeInserir(payload);

    if(existenteAntes){
      const atualizacao=preencherSomenteVaziosCliente(existenteAntes,payload);
      const atualizado=await banco
        .from("email_clientes")
        .update(atualizacao)
        .eq("id",existenteAntes.id)
        .select()
        .single();

      if(!atualizado.error){
        return {
          data:atualizado.data,
          error:null,
          ignoradas,
          convertidoEmAtualizacao:true
        };
      }

      return {data:null,error:atualizado.error,ignoradas};
    }
  }

  for(let tentativa=0;tentativa<15;tentativa++){
    const resposta=tipo==="insert"
      ? await banco.from("email_clientes").insert([payload]).select().single()
      : await banco.from("email_clientes").update(payload).eq("id",id).select().single();

    if(!resposta.error){
      return {data:resposta.data,error:null,ignoradas};
    }

    const codigo=String(resposta.error?.code || "");
    const mensagem=String(resposta.error?.message || "");

    if(tipo==="insert" && codigo==="23505" && mensagem.includes("email_clientes_nome_unico")){
      const nomeNormalizado=nomeComparacaoCliente(payload.nome || "");
      let existente=(emailClientes || []).find(cliente =>
        nomeComparacaoCliente(cliente.nome || "")===nomeNormalizado
      );

      if(!existente){
        const busca=await banco
          .from("email_clientes")
          .select("*")
          .ilike("nome",payload.nome)
          .limit(10);

        existente=(busca.data || []).find(cliente =>
          nomeComparacaoCliente(cliente.nome || "")===nomeNormalizado
        );
      }

      if(existente){
        const atualizacao=preencherSomenteVaziosCliente(existente,payload);
        const atualizado=await banco
          .from("email_clientes")
          .update(atualizacao)
          .eq("id",existente.id)
          .select()
          .single();

        if(!atualizado.error){
          return {
            data:atualizado.data,
            error:null,
            ignoradas,
            convertidoEmAtualizacao:true
          };
        }

        return {data:null,error:atualizado.error,ignoradas};
      }
    }

    const coluna=colunaAusenteErroImportacao(resposta.error);
    if(!coluna || !(coluna in payload)){
      return {data:null,error:resposta.error,ignoradas};
    }

    delete payload[coluna];
    ignoradas.push(coluna);
    console.warn(`Importação: campo "${coluna}" ignorado porque a coluna não existe no Supabase.`);
  }

  return {
    data:null,
    error:new Error("Não foi possível adaptar o cadastro às colunas disponíveis."),
    ignoradas
  };
}

async function confirmarImportacaoClientes(){
  const itens=clientesImportacaoPendentes.filter(
    item=>item.selecionado && item.status!=="erro"
  );

  if(!itens.length){
    alert("Selecione pelo menos um cadastro.");
    return;
  }

  const botao=document.getElementById("btnImportarClientesConfirmar");
  if(botao) botao.disabled=true;

  abrirProgressoImportacaoClientes(itens.length);

  const padrao=document.getElementById("importadorClienteAcaoDuplicado")?.value
    || "automatico_vazios";

  let novos=0;
  let atualizados=0;
  let ignorados=0;
  let erros=0;
  let processados=0;

  for(const item of itens){
    if(importacaoClientesCancelada) break;

    let tipoLog="";
    let mensagemLog="";

    try{
      let existente=item.existente || null;
      let acao=padrao;

      atualizarProgressoImportacaoClientes({
        atual:processados,
        total:itens.length,
        nome:item.nome,
        novos,atualizados,ignorados,erros
      });

      if(item.match?.tipo==="nome_semelhante"){
        if(padrao==="automatico_vazios"){
          if(Number(item.match.score || 0)>=0.88){
            existente=item.match.cliente;
            item.existente=existente;
            acao="atualizar_vazios";
          }else{
            existente=null;
            item.existente=null;
            item.match=null;
          }
        }else{
          const decisao=await perguntarNomeSemelhanteImportacao(item);

          if(decisao==="cancelar"){
            importacaoClientesCancelada=true;
            break;
          }

          if(decisao==="ignorar"){
            ignorados++;
            tipoLog="ignorado";
            mensagemLog=`Ignorado: ${item.nome}`;
            processados++;
            atualizarProgressoImportacaoClientes({
              atual:processados,total:itens.length,nome:item.nome,
              novos,atualizados,ignorados,erros,
              tipo:tipoLog,mensagem:mensagemLog
            });
            continue;
          }

          if(decisao==="criar_novo"){
            existente=null;
            item.existente=null;
            item.match=null;
          }else{
            existente=item.match.cliente;
            item.existente=existente;
            acao="atualizar_vazios";
          }
        }
      }

      const dados=dadosBancoImportacaoCliente(item);

      if(!existente){
        const resultado=await gravarClienteImportacaoSeguro({
          tipo:"insert",
          dados
        });

        if(resultado.error) throw resultado.error;

        const indice=emailClientes.findIndex(
          cliente=>String(cliente.id)===String(resultado.data.id)
        );

        if(indice>=0) emailClientes[indice]=resultado.data;
        else emailClientes.push(resultado.data);

        if(resultado.convertidoEmAtualizacao){
          atualizados++;
          tipoLog="atualizado";
          mensagemLog=`Atualizado: ${item.nome}`;
        }else{
          novos++;
          tipoLog="sucesso";
          mensagemLog=`Novo: ${item.nome}`;
        }
      }else{
        if(
          padrao==="automatico_vazios" &&
          ["cnpj","nome_exato"].includes(item.match?.tipo)
        ){
          acao="atualizar_vazios";
        }else if(
          item.match?.tipo==="nome_exato" &&
          !normalizarDocumentoCliente(existente.cpf_cnpj)
        ){
          acao="atualizar_vazios";
        }else if(acao==="perguntar"){
          acao=await perguntarDuplicadoImportacao(item);
        }

        if(acao==="cancelar"){
          importacaoClientesCancelada=true;
          break;
        }

        if(acao==="ignorar"){
          ignorados++;
          tipoLog="ignorado";
          mensagemLog=`Ignorado: ${item.nome}`;
        }else{
          const atualizacao=acao==="atualizar_vazios"
            ? preencherSomenteVaziosCliente(existente,dados)
            : dados;

          const resultado=await gravarClienteImportacaoSeguro({
            tipo:"update",
            id:existente.id,
            dados:atualizacao
          });

          if(resultado.error) throw resultado.error;

          const indice=emailClientes.findIndex(
            cliente=>String(cliente.id)===String(existente.id)
          );
          if(indice>=0) emailClientes[indice]=resultado.data;

          atualizados++;
          tipoLog="atualizado";
          mensagemLog=`Atualizado: ${item.nome}`;
        }
      }
    }catch(erro){
      console.error("Erro ao importar cliente:",item.nome,erro);
      erros++;
      tipoLog="erro";
      mensagemLog=`Erro em ${item.nome}: ${erro?.message || erro}`;
    }

    processados++;

    atualizarProgressoImportacaoClientes({
      atual:processados,
      total:itens.length,
      nome:item.nome,
      novos,atualizados,ignorados,erros,
      tipo:tipoLog,
      mensagem:mensagemLog
    });

    // Libera o navegador para atualizar a barra e não parecer travado.
    await pausaInterfaceImportacao();
  }

  montarTabelaClientesEmail();
  if(typeof montarClientesFrete==="function") montarClientesFrete();
  if(typeof prepararEnviosEmail==="function") prepararEnviosEmail();

  finalizarProgressoImportacaoClientes(importacaoClientesCancelada);

  atualizarProgressoImportacaoClientes({
    atual:processados,
    total:itens.length,
    nome:importacaoClientesCancelada ? "Importação interrompida." : "Importação finalizada.",
    novos,atualizados,ignorados,erros
  });

  if(!importacaoClientesCancelada){
    limparImportacaoClientes();
  }

  if(botao) botao.disabled=false;
}
function limparImportacaoClientes(){clientesImportacaoPendentes=[];const a=document.getElementById("importadorClientesArquivos"),l=document.getElementById("importadorClientesLista"),r=document.getElementById("importadorClientesResumo"),b=document.getElementById("btnImportarClientesConfirmar");if(a)a.value="";if(l)l.innerHTML="";if(r){r.innerHTML="";r.style.display="none"}if(b)b.style.display="none"}
function configurarArrastarClientesImportacao(){const d=document.getElementById("importadorClientesDrop");if(!d||d.dataset.configurado==="1")return;d.dataset.configurado="1";["dragenter","dragover"].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.add("arrastando")}));["dragleave","drop"].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.remove("arrastando")}));d.addEventListener("drop",e=>analisarArquivosClientesImportados(e.dataTransfer.files))}
document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>{configurarArrastarClientesImportacao();preencherSelectVendedoraImportacao()},500));



/* =========================================================
   LOCALIZADOR E MESCLAGEM DE CLIENTES DUPLICADOS — V11.8
   ========================================================= */
let clientesDuplicadosEncontrados=[];

function qualidadeCadastroCliente(cliente){
  const campos=[
    "cpf_cnpj","endereco","numero","complemento","bairro","cep",
    "cidade","uf","telefone","celular","contato","observacao",
    "inscricao_estadual","vendedora_id"
  ];
  let pontos=campos.reduce((total,campo)=>{
    const valor=cliente?.[campo];
    return total+(valor!==null && valor!==undefined && String(valor).trim()!=="" ? 1 : 0);
  },0);
  pontos+=Array.isArray(cliente?.emails) ? cliente.emails.filter(Boolean).length : 0;
  return pontos;
}

function gruposDuplicadosClientes(){
  const mapa=new Map();

  (emailClientes || []).forEach(cliente=>{
    const chave=nomeComparacaoCliente(cliente.nome || "");
    if(!chave) return;
    if(!mapa.has(chave)) mapa.set(chave,[]);
    mapa.get(chave).push(cliente);
  });

  const exatos=[...mapa.entries()]
    .filter(([,lista])=>lista.length>1)
    .map(([chave,lista])=>({tipo:"nome_exato",chave,clientes:lista,score:1}));

  const unicos=[...mapa.entries()]
    .filter(([,lista])=>lista.length===1)
    .map(([chave,lista])=>({chave,cliente:lista[0]}));

  const semelhantes=[];
  const usados=new Set();

  for(let i=0;i<unicos.length;i++){
    for(let j=i+1;j<unicos.length;j++){
      const a=unicos[i],b=unicos[j];
      const score=similaridadeNomesCliente(a.chave,b.chave);
      if(score<0.9) continue;

      const idPar=[String(a.cliente.id),String(b.cliente.id)].sort().join("|");
      if(usados.has(idPar)) continue;
      usados.add(idPar);

      semelhantes.push({
        tipo:"nome_semelhante",
        chave:idPar,
        clientes:[a.cliente,b.cliente],
        score
      });
    }
  }

  return [...exatos,...semelhantes]
    .sort((a,b)=>b.score-a.score);
}

function localizarDuplicadosClientes(){
  clientesDuplicadosEncontrados=gruposDuplicadosClientes();
  montarDuplicadosClientes();
  const secao=document.getElementById("clientesDuplicadosSecao");
  if(secao) secao.scrollIntoView({behavior:"smooth",block:"start"});
}

function montarDuplicadosClientes(){
  const box=document.getElementById("clientesDuplicadosLista");
  const resumo=document.getElementById("clientesDuplicadosResumo");
  if(!box || !resumo) return;

  resumo.textContent=clientesDuplicadosEncontrados.length
    ? `${clientesDuplicadosEncontrados.length} grupo(s) possível(is) encontrado(s).`
    : "Nenhum possível duplicado encontrado.";

  box.innerHTML=clientesDuplicadosEncontrados.length
    ? clientesDuplicadosEncontrados.map((grupo,indice)=>{
        const ordenados=[...grupo.clientes].sort(
          (a,b)=>qualidadeCadastroCliente(b)-qualidadeCadastroCliente(a)
        );
        const principal=ordenados[0];

        return `<div class="duplicado-grupo">
          <div class="duplicado-grupo-topo">
            <div>
              <h3>${grupo.tipo==="nome_exato" ? "Mesmo nome" : `Nome ${Math.round(grupo.score*100)}% semelhante`}</h3>
              <small>Escolha o cadastro principal antes de mesclar.</small>
            </div>
          </div>

          <div class="duplicado-clientes-grid">
            ${ordenados.map(cliente=>`
              <label class="duplicado-cliente-card">
                <input type="radio" name="duplicadoPrincipal_${indice}"
                  value="${cliente.id}" ${String(cliente.id)===String(principal.id)?"checked":""}>
                <div>
                  <strong>${escaparHtmlEmail(cliente.nome || "")}</strong>
                  <span>CNPJ/CPF: ${escaparHtmlEmail(cliente.cpf_cnpj || "não cadastrado")}</span>
                  <span>${escaparHtmlEmail([cliente.endereco,cliente.numero,cliente.bairro].filter(Boolean).join(", ") || "Sem endereço")}</span>
                  <span>${escaparHtmlEmail([cliente.cep,cliente.cidade,cliente.uf].filter(Boolean).join(" - ") || "")}</span>
                  <span>E-mails: ${escaparHtmlEmail((cliente.emails || []).join("; ") || "nenhum")}</span>
                  <span>Completude: ${qualidadeCadastroCliente(cliente)} ponto(s)</span>
                </div>
              </label>`).join("")}
          </div>

          <div class="email-acoes">
            <button class="btn verde" onclick="mesclarGrupoClientesDuplicados(${indice})">Mesclar no principal</button>
            <button class="btn azul" onclick="ignorarGrupoClienteDuplicado(${indice})">Manter separados</button>
          </div>
        </div>`;
      }).join("")
    : '<div class="texto-vazio">Nenhum possível duplicado encontrado.</div>';
}

function unirEmailsClientes(...listas){
  return [...new Set(
    listas.flatMap(lista=>Array.isArray(lista)?lista:[])
      .map(email=>String(email || "").trim().toLowerCase())
      .filter(Boolean)
  )];
}

function combinarCadastrosClientes(principal,secundarios){
  const campos=[
    "cpf_cnpj","endereco","numero","complemento","bairro","cep","cidade","uf",
    "telefone","celular","contato","observacao","inscricao_estadual",
    "codigo_cliente","nome_fantasia","whatsapp","vendedora_id"
  ];

  const resultado={...principal};
  resultado.emails=unirEmailsClientes(
    principal.emails,
    ...secundarios.map(c=>c.emails)
  );

  campos.forEach(campo=>{
    const atual=resultado[campo];
    if(atual!==null && atual!==undefined && String(atual).trim()!=="") return;

    const encontrado=secundarios.find(cliente=>{
      const valor=cliente?.[campo];
      return valor!==null && valor!==undefined && String(valor).trim()!=="";
    });

    if(encontrado) resultado[campo]=encontrado[campo];
  });

  resultado.atualizado_em=new Date().toISOString();
  return resultado;
}

async function transferirReferenciasClienteDuplicado(principalId,secundarioId){
  const tentativas=[
    ["frete_cotacoes","cliente_id"],
    ["email_envios","cliente_id"],
    ["correios_envios","cliente_id"],
    ["email_relatorios_clientes","cliente_id"]
  ];

  for(const [tabela,coluna] of tentativas){
    try{
      const resposta=await banco
        .from(tabela)
        .update({[coluna]:principalId})
        .eq(coluna,secundarioId);

      if(resposta.error){
        const mensagem=String(resposta.error.message || "");
        if(!mensagem.includes("does not exist") &&
           !mensagem.includes("Could not find") &&
           !mensagem.includes("schema cache")){
          console.warn(`Não foi possível transferir ${tabela}.${coluna}:`,mensagem);
        }
      }
    }catch(erro){
      console.warn(`Transferência ignorada em ${tabela}:`,erro);
    }
  }
}

async function mesclarGrupoClientesDuplicados(indice){
  const grupo=clientesDuplicadosEncontrados[indice];
  if(!grupo) return;

  const radio=document.querySelector(`input[name="duplicadoPrincipal_${indice}"]:checked`);
  const principalId=radio?.value;
  const principal=grupo.clientes.find(c=>String(c.id)===String(principalId));

  if(!principal){
    alert("Selecione o cadastro principal.");
    return;
  }

  const secundarios=grupo.clientes.filter(c=>String(c.id)!==String(principal.id));

  if(!confirm(
    `Mesclar ${secundarios.length} cadastro(s) em "${principal.nome}"?\n\n`+
    "Os campos vazios do principal serão completados e os cadastros secundários serão excluídos."
  )) return;

  const combinado=combinarCadastrosClientes(principal,secundarios);
  const camposPermitidos=[
    "cpf_cnpj","emails","vendedora_id","endereco","numero","complemento",
    "bairro","cep","cidade","uf","observacao","inscricao_estadual",
    "telefone","celular","contato","codigo_cliente","nome_fantasia",
    "whatsapp","atualizado_em"
  ];
  const payload=Object.fromEntries(
    camposPermitidos
      .filter(campo=>campo in combinado)
      .map(campo=>[campo,combinado[campo]])
  );

  const atualizado=await gravarClienteImportacaoSeguro({
    tipo:"update",
    id:principal.id,
    dados:payload
  });

  if(atualizado.error){
    alert("Não foi possível atualizar o cadastro principal: "+atualizado.error.message);
    return;
  }

  let removidos=0;
  let falhas=0;

  for(const secundario of secundarios){
    await transferirReferenciasClienteDuplicado(principal.id,secundario.id);

    const exclusao=await banco
      .from("email_clientes")
      .delete()
      .eq("id",secundario.id);

    if(exclusao.error){
      console.warn("Não foi possível excluir cadastro secundário:",exclusao.error.message);
      falhas++;
    }else{
      removidos++;
    }
  }

  const idsRemovidos=new Set(secundarios.map(c=>String(c.id)));
  emailClientes=emailClientes.filter(c=>!idsRemovidos.has(String(c.id)));

  const pos=emailClientes.findIndex(c=>String(c.id)===String(principal.id));
  if(pos>=0) emailClientes[pos]=atualizado.data;

  montarTabelaClientesEmail();
  montarClientesFrete();
  prepararEnviosEmail();
  localizarDuplicadosClientes();

  alert(
    `Mesclagem concluída.\n\n`+
    `Cadastros removidos: ${removidos}\n`+
    `Cadastros que não puderam ser removidos: ${falhas}`
  );
}

function ignorarGrupoClienteDuplicado(indice){
  clientesDuplicadosEncontrados.splice(indice,1);
  montarDuplicadosClientes();
}

