
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
function preencherSelectVendedoraImportacao(){const s=document.getElementById("importadorClienteVendedora");if(!s)return;const a=s.value;s.innerHTML='<option value="">Não definir</option>'+(emailVendedoras||[]).map(v=>`<option value="${v.id}">${escaparHtmlEmail(v.nome||"")}</option>`).join("");s.value=a}
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

async function gravarClienteImportacaoSeguro({tipo,id,dados}){
  const payload={...dados};
  const ignoradas=[];

  for(let tentativa=0;tentativa<15;tentativa++){
    const resposta=tipo==="insert"
      ? await banco.from("email_clientes").insert([payload]).select().single()
      : await banco.from("email_clientes").update(payload).eq("id",id).select().single();

    if(!resposta.error){
      return {data:resposta.data,error:null,ignoradas};
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
 const itens=clientesImportacaoPendentes.filter(i=>i.selecionado&&i.status!=="erro");if(!itens.length){alert("Selecione pelo menos um cadastro.");return}
 const padrao=document.getElementById("importadorClienteAcaoDuplicado")?.value||"automatico_vazios";let novos=0,atualizados=0,ignorados=0,erros=0;
 for(const i of itens){try{let existente=i.existente||null,acao=padrao;

 if(i.match?.tipo==="nome_semelhante"){
   if(padrao==="automatico_vazios"){
     // No modo automático não pergunta um por um.
     // Só completa automaticamente quando a semelhança for alta.
     if(Number(i.match.score || 0) >= 0.88){
       existente=i.match.cliente;
       i.existente=existente;
       acao="atualizar_vazios";
     }else{
       // Semelhança baixa ou duvidosa: cria novo cadastro para não alterar o cliente errado.
       existente=null;
       i.existente=null;
       i.match=null;
     }
   }else{
     const d=await perguntarNomeSemelhanteImportacao(i);
     if(d==="cancelar")break;
     if(d==="ignorar"){ignorados++;continue}
     if(d==="criar_novo"){existente=null;i.existente=null;i.match=null}
     else{existente=i.match.cliente;i.existente=existente;acao="atualizar_vazios"}
   }
 }

 const dados=dadosBancoImportacaoCliente(i);
 if(!existente){
   const r=await gravarClienteImportacaoSeguro({tipo:"insert",dados});
   if(r.error)throw r.error;
   emailClientes.push(r.data);
   novos++;
   continue
 }

 if(padrao==="automatico_vazios" && ["cnpj","nome_exato"].includes(i.match?.tipo)){
   acao="atualizar_vazios";
 }else if(i.match?.tipo==="nome_exato"&&!normalizarDocumentoCliente(existente.cpf_cnpj)){
   acao="atualizar_vazios";
 }else if(acao==="perguntar"){
   acao=await perguntarDuplicadoImportacao(i);
 }
 if(acao==="cancelar")break;if(acao==="ignorar"){ignorados++;continue}
 const up=acao==="atualizar_vazios"?preencherSomenteVaziosCliente(existente,dados):dados;
 const r=await gravarClienteImportacaoSeguro({tipo:"update",id:existente.id,dados:up});if(r.error)throw r.error;
 const idx=emailClientes.findIndex(c=>String(c.id)===String(existente.id));if(idx>=0)emailClientes[idx]=r.data;atualizados++
 }catch(e){console.error(e);erros++}}
 montarTabelaClientesEmail();montarClientesFrete();prepararEnviosEmail();limparImportacaoClientes();alert(`Importação concluída.\n\nNovos: ${novos}\nAtualizados: ${atualizados}\nIgnorados: ${ignorados}\nErros: ${erros}`)
}
function limparImportacaoClientes(){clientesImportacaoPendentes=[];const a=document.getElementById("importadorClientesArquivos"),l=document.getElementById("importadorClientesLista"),r=document.getElementById("importadorClientesResumo"),b=document.getElementById("btnImportarClientesConfirmar");if(a)a.value="";if(l)l.innerHTML="";if(r){r.innerHTML="";r.style.display="none"}if(b)b.style.display="none"}
function configurarArrastarClientesImportacao(){const d=document.getElementById("importadorClientesDrop");if(!d||d.dataset.configurado==="1")return;d.dataset.configurado="1";["dragenter","dragover"].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.add("arrastando")}));["dragleave","drop"].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.remove("arrastando")}));d.addEventListener("drop",e=>analisarArquivosClientesImportados(e.dataTransfer.files))}
document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>{configurarArrastarClientesImportacao();preencherSelectVendedoraImportacao()},500));

