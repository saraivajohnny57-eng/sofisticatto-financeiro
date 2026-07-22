/* =========================================================
   ETIQUETAS DE ENTREGA 150 × 100 MM
   ========================================================= */
async function carregarBibliotecasEtiqueta(){
  const promessas = [];

  if(!window.QRCode){
    promessas.push(new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Falha ao carregar QR Code."));
      document.head.appendChild(script);
    }));
  }

  if(!window.JsBarcode){
    promessas.push(new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Falha ao carregar código de barras."));
      document.head.appendChild(script);
    }));
  }

  if(!window.html2canvas){
    promessas.push(new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Falha ao carregar gerador de imagem."));
      document.head.appendChild(script);
    }));
  }

  if(!window.jspdf?.jsPDF){
    promessas.push(new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Falha ao carregar gerador de PDF."));
      document.head.appendChild(script);
    }));
  }

  await Promise.all(promessas);
}

async function inicializarModuloEtiquetas(){
  if(!garantirFinanceiroEmail()) return;

  try{
    await carregarBibliotecasEtiqueta();
    await carregarHistoricoEtiquetas();
    montarListaFaixasPedidoEtiqueta();
    atualizarValoresAjustesEtiqueta();
    atualizarPreviewEtiqueta();
  }catch(erro){
    console.error("Erro no módulo de etiquetas:",erro);
    alert(erro.message);
  }
}


const ETQ_AJUSTES_PADRAO={
  destino:0,endereco:0,bairro:0,cep:0,cidade:0,nf:0,volume:0,chave:0,
  logo:0,qr:0,barcodeLargura:0,barcodeAltura:0
};
let etqAjustesTamanho=carregarTamanhosEtiqueta();

function carregarTamanhosEtiqueta(){
  try{
    return {...ETQ_AJUSTES_PADRAO,...JSON.parse(localStorage.getItem("sofisticatto_etiqueta_tamanhos") || "{}")};
  }catch{
    return {...ETQ_AJUSTES_PADRAO};
  }
}

function salvarTamanhosEtiqueta(){
  localStorage.setItem("sofisticatto_etiqueta_tamanhos",JSON.stringify(etqAjustesTamanho));
}

function ajustarTamanhoEtiqueta(campo,delta){
  const limites={
    destino:[-10,24],endereco:[-10,24],bairro:[-10,24],cep:[-10,24],
    cidade:[-10,24],nf:[-10,24],volume:[-10,24],chave:[-5,12],
    logo:[-100,100],qr:[-35,40],barcodeLargura:[-160,120],barcodeAltura:[-20,50]
  };
  const [min,max]=limites[campo] || [-50,50];
  etqAjustesTamanho[campo]=Math.max(min,Math.min(max,Number(etqAjustesTamanho[campo] || 0)+Number(delta)));
  salvarTamanhosEtiqueta();
  atualizarValoresAjustesEtiqueta();
  atualizarPreviewEtiqueta();
}

function restaurarTamanhosEtiqueta(){
  etqAjustesTamanho={...ETQ_AJUSTES_PADRAO};
  salvarTamanhosEtiqueta();
  atualizarValoresAjustesEtiqueta();
  atualizarPreviewEtiqueta();
}

function atualizarValoresAjustesEtiqueta(){
  const mapa={
    destino:"etqValDestino",endereco:"etqValEndereco",bairro:"etqValBairro",
    cep:"etqValCep",cidade:"etqValCidade",nf:"etqValNf",volume:"etqValVolume",
    chave:"etqValChave",logo:"etqValLogo",qr:"etqValQr",
    barcodeLargura:"etqValBarcodeLargura",barcodeAltura:"etqValBarcodeAltura"
  };
  Object.entries(mapa).forEach(([campo,id])=>{
    const el=document.getElementById(id);
    if(!el) return;
    const valor=Number(etqAjustesTamanho[campo] || 0);
    el.textContent=valor===0 ? "Padrão" : `${valor>0?"+":""}${valor}`;
  });

  const transp=document.getElementById("etqValTransportadora");
  const seletorTransp=document.getElementById("etqTransportadoraFonte");
  if(transp && seletorTransp){
    transp.textContent=seletorTransp.value==="auto" ? "Automático" : seletorTransp.value;
  }
}

function aplicarAjustesTamanhoEtiqueta(etiqueta){
  if(!etiqueta) return;

  const campos=[
    ["destino",".etiqueta-destino",23],
    ["endereco",".etiqueta-endereco",18],
    ["bairro",".etiqueta-bairro",18],
    ["cep",".etiqueta-cep",17],
    ["cidade",".etiqueta-cidade",18],
    ["nf",".etiqueta-nf",22],
    ["volume",".etiqueta-volume",22],
    ["chave",".etiqueta-chave",10]
  ];

  campos.forEach(([campo,seletor,tamanhoPadrao])=>{
    const elemento=etiqueta.querySelector(seletor);
    if(!elemento) return;

    // Usa sempre o tamanho padrão fixo como base.
    // Isso impede que o ajuste seja somado novamente toda vez que
    // qualquer outro botão atualizar a prévia.
    const ajuste=Number(etqAjustesTamanho[campo] || 0);
    elemento.style.fontSize=`${Math.max(7,tamanhoPadrao+ajuste)}px`;
  });

  const logo=etiqueta.querySelector(".etiqueta-logo");
  if(logo){
    const base=264;
    const largura=Math.max(120,base+Number(etqAjustesTamanho.logo || 0));
    logo.style.width=`${largura}px`;
    logo.style.maxWidth=`${largura}px`;
    logo.style.height="117px";
    logo.style.maxHeight="117px";
    logo.style.objectFit="contain";
  }

  const qr=etiqueta.querySelector(".etiqueta-qr");
  if(qr){
    const tamanho=Math.max(45,83+Number(etqAjustesTamanho.qr || 0));
    qr.style.width=`${tamanho}px`;
    qr.style.height=`${tamanho}px`;
    const imagem=qr.querySelector("canvas,img");
    if(imagem){
      imagem.style.width=`${tamanho}px`;
      imagem.style.height=`${tamanho}px`;
    }
  }

  const barcode=etiqueta.querySelector(".etiqueta-barcode");
  if(barcode){
    const larguraBase=454;
    const largura=Math.max(250,Math.min(490,larguraBase+Number(etqAjustesTamanho.barcodeLargura || 0)));
    const altura=Math.max(16,34+Number(etqAjustesTamanho.barcodeAltura || 0));

    barcode.style.width=`${largura}px`;
    barcode.style.height=`${altura}px`;

    // Centraliza o código de barras dentro da área útil da etiqueta.
    const larguraEtiqueta=etiqueta.getBoundingClientRect().width || 567;
    const areaUtilEsquerda=19;   // aproximadamente 5 mm
    const areaUtilDireita=95;    // reserva para a transportadora
    const centroUtil=(areaUtilEsquerda + (larguraEtiqueta-areaUtilDireita))/2;

    barcode.style.left=`${Math.max(0,centroUtil-(largura/2))}px`;
    barcode.style.right="auto";

    const chave=etiqueta.querySelector(".etiqueta-chave");
    if(chave){
      chave.style.width=`${largura}px`;
      chave.style.left=barcode.style.left;
      chave.style.right="auto";
    }
  }
}

function dadosEtiquetaFormulario(){
  return {
    cliente:document.getElementById("etqCliente")?.value.trim() || "",
    endereco:document.getElementById("etqEndereco")?.value.trim().toUpperCase() || "",
    bairro:document.getElementById("etqBairro")?.value.trim().toUpperCase() || "",
    cep:document.getElementById("etqCep")?.value.trim() || "",
    cidade:document.getElementById("etqCidade")?.value.trim().toUpperCase() || "",
    uf:document.getElementById("etqUf")?.value.trim().toUpperCase() || "",
    numero_nf:document.getElementById("etqNf")?.value.trim() || "",
    quantidade_volumes:Math.max(1,parseInt(document.getElementById("etqVolumes")?.value || "1",10) || 1),
    transportadora:document.getElementById("etqTransportadora")?.value.trim().toUpperCase() || "",
    transportadora_duas_linhas:document.getElementById("etqTransportadoraDuasLinhas")?.checked || false,
    transportadora_fonte:document.getElementById("etqTransportadoraFonte")?.value || "auto",
    pedidos_faixas:etiquetaPedidosFaixas.map(item=>({...item})),
    ajustes_tamanho:{...etqAjustesTamanho},
    chave_nfe:(document.getElementById("etqChave")?.value || "").replace(/\D/g,"").slice(0,44)
  };
}

function formatarCepEtiquetaCampo(campo){
  const numeros=String(campo.value || "").replace(/\D/g,"").slice(0,8);
  campo.value=numeros.length>5 ? `${numeros.slice(0,5)}-${numeros.slice(5)}` : numeros;
}

function formatarCepEtiqueta(valor){
  const numeros=String(valor || "").replace(/\D/g,"").slice(0,8);
  return numeros.length===8 ? `${numeros.slice(0,5)}-${numeros.slice(5)}` : (valor || "");
}

function formatarNfEtiqueta(valor){
  const numero=String(valor || "").replace(/\D/g,"");
  if(!numero) return "—";
  return numero.replace(/\B(?=(\d{3})+(?!\d))/g,".");
}

function formatarVolumeEtiqueta(atual,total){
  const tamanho=Math.max(2,String(total).length);
  return `${String(atual).padStart(tamanho,"0")} / ${String(total).padStart(tamanho,"0")}`;
}

function logoEtiquetaUrl(){
  return emailAssinaturaAtiva?.logo_url || "";
}

function montarQrEtiqueta(elemento){
  if(!window.QRCode || !elemento) return;
  elemento.innerHTML="";
  new QRCode(elemento,{
    text:ETIQUETA_INSTAGRAM_URL,
    width:112,
    height:112,
    colorDark:"#000000",
    colorLight:"#ffffff",
    correctLevel:QRCode.CorrectLevel.M
  });
}

function montarBarcodeEtiqueta(elemento,chave){
  if(!window.JsBarcode || !elemento) return;
  elemento.innerHTML="";
  if(!chave){
    elemento.setAttribute("viewBox","0 0 500 80");
    elemento.innerHTML='<text x="250" y="45" text-anchor="middle" font-size="22">CHAVE DA NF-E</text>';
    return;
  }
  JsBarcode(elemento,chave,{
    format:"CODE128",
    displayValue:false,
    margin:0,
    height:38,
    width:1.12,
    background:"#ffffff",
    lineColor:"#000000"
  });
}

function quebrarTransportadoraEmDuasLinhas(texto){
  const nome=String(texto || "").trim();
  if(!nome) return [""];

  const palavras=nome.split(/\s+/);
  if(palavras.length===1){
    const meio=Math.ceil(nome.length/2);
    return [nome.slice(0,meio),nome.slice(meio)];
  }

  let melhor=[nome,""];
  let menorDiferenca=Infinity;

  for(let i=1;i<palavras.length;i++){
    const primeira=palavras.slice(0,i).join(" ");
    const segunda=palavras.slice(i).join(" ");
    const diferenca=Math.abs(primeira.length-segunda.length);

    if(diferenca<menorDiferenca){
      menorDiferenca=diferenca;
      melhor=[primeira,segunda];
    }
  }

  return melhor;
}

function tamanhoFonteTransportadora(texto,duasLinhas){
  const tamanho=String(texto || "").replace(/\s+/g,"").trim().length;

  if(duasLinhas){
    if(tamanho>32) return "3.8mm";
    if(tamanho>24) return "4.5mm";
    if(tamanho>18) return "5.2mm";
    if(tamanho>12) return "6mm";
    return "7mm";
  }

  if(tamanho<=5) return "8.5mm";
  if(tamanho<=7) return "6.2mm";
  if(tamanho<=9) return "5.1mm";
  if(tamanho<=12) return "4.1mm";
  if(tamanho<=16) return "3.4mm";
  if(tamanho<=22) return "2.9mm";
  return "2.5mm";
}

function fonteTransportadoraEscolhida(texto,duasLinhas){
  const seletor=document.getElementById("etqTransportadoraFonte");
  const valor=seletor?.value || "auto";

  if(valor!=="auto"){
    return valor.endsWith("px") ? valor : `${valor}px`;
  }

  return tamanhoFonteTransportadora(texto,duasLinhas);
}

function ajustarFonteTransportadora(delta){
  const seletor=document.getElementById("etqTransportadoraFonte");
  if(!seletor) return;

  let atual;
  if(seletor.value==="auto"){
    const automatico=tamanhoFonteTransportadora(
      document.getElementById("etqTransportadora")?.value || "",
      document.getElementById("etqTransportadoraDuasLinhas")?.checked || false
    );
    atual=Math.round(parseFloat(automatico) * 3.7795275591);
  }else{
    atual=parseFloat(seletor.value);
  }

  atual=Math.max(12,Math.min(72,atual+delta));
  atual=Math.round(atual);

  let opcao=[...seletor.options].find(item=>parseFloat(item.value)===atual);
  if(!opcao){
    opcao=document.createElement("option");
    opcao.value=`${atual}px`;
    opcao.textContent=`${atual}px`;
    seletor.appendChild(opcao);
  }

  seletor.value=opcao.value;
  atualizarPreviewEtiqueta();
}


function pedidoParaVolumeEtiqueta(volume,faixas=etiquetaPedidosFaixas){
  const numero=Number(volume);
  return (faixas || []).find(item=>numero>=Number(item.inicio) && numero<=Number(item.fim)) || null;
}

function fonteAutomaticaPedidoEtiqueta(texto){
  const tamanho=String(texto || "").length;
  return tamanho>16 ? 14 : tamanho>11 ? 17 : 21;
}

function ajustarFontePedidoEtiqueta(elemento,texto,fonte="auto"){
  if(!elemento) return;
  const tamanhoPx=fonte && fonte!=="auto"
    ? Math.max(12,Math.min(72,Number(fonte) || 24))
    : fonteAutomaticaPedidoEtiqueta(texto);
  elemento.style.fontSize=`${tamanhoPx}px`;
}

function definirOpcaoFontePedido(select,valor){
  if(!select) return;
  const normalizado=valor==="auto" ? "auto" : String(Math.max(12,Math.min(72,Number(valor) || 24)));
  let opcao=[...select.options].find(item=>item.value===normalizado);
  if(!opcao && normalizado!=="auto"){
    opcao=document.createElement("option");
    opcao.value=normalizado;
    opcao.textContent=`${normalizado}px`;
    select.appendChild(opcao);
  }
  select.value=normalizado;
}

function ajustarFonteNovaFaixaPedido(delta){
  const select=document.getElementById("etqPedidoFonte");
  if(!select) return;
  let atual=select.value==="auto"
    ? fonteAutomaticaPedidoEtiqueta(document.getElementById("etqPedidoNome")?.value || "")
    : Number(select.value);
  atual=Math.max(12,Math.min(72,atual+delta));
  definirOpcaoFontePedido(select,atual);
}

function ajustarFonteFaixaPedido(id,delta){
  const item=etiquetaPedidosFaixas.find(faixa=>faixa.id===id);
  if(!item) return;
  let atual=item.fonte==="auto" || !item.fonte
    ? fonteAutomaticaPedidoEtiqueta(item.nome)
    : Number(item.fonte);
  atual=Math.max(12,Math.min(72,atual+delta));
  item.fonte=String(atual);
  montarListaFaixasPedidoEtiqueta();
  atualizarPreviewEtiqueta();
}

function montarListaFaixasPedidoEtiqueta(){
  const lista=document.getElementById("etqPedidosLista");
  if(!lista) return;

  lista.innerHTML=etiquetaPedidosFaixas.length
    ? etiquetaPedidosFaixas
        .slice()
        .sort((a,b)=>a.inicio-b.inicio)
        .map(item=>`
          <div class="etiqueta-pedido-item">
            <strong>${escaparHtmlEmail(item.nome)}</strong>
            <span>VOL ${String(item.inicio).padStart(2,"0")}–${String(item.fim).padStart(2,"0")}</span>
            <span>${item.fonte && item.fonte!=="auto" ? escaparHtmlEmail(item.fonte)+"px" : "Automático"}</span>
            <div class="pedido-fonte-acoes">
              <button type="button" onclick="ajustarFonteFaixaPedido('${item.id}',-2)">A−</button>
              <button type="button" onclick="ajustarFonteFaixaPedido('${item.id}',2)">A+</button>
            </div>
            <button type="button" onclick="removerFaixaPedidoEtiqueta('${item.id}')">Excluir</button>
          </div>`).join("")
    : '<small style="color:#7d73bd;">Nenhuma identificação adicionada.</small>';
}

function adicionarFaixaPedidoEtiqueta(){
  const nome=(document.getElementById("etqPedidoNome")?.value || "").trim().toUpperCase();
  const inicio=parseInt(document.getElementById("etqPedidoInicio")?.value || "0",10);
  const fim=parseInt(document.getElementById("etqPedidoFim")?.value || "0",10);
  const fonte=document.getElementById("etqPedidoFonte")?.value || "auto";
  const total=Math.max(1,parseInt(document.getElementById("etqVolumes")?.value || "1",10));

  if(!nome){
    alert("Informe o nome ou a identificação do pedido.");
    return;
  }
  if(!inicio || !fim || inicio<1 || fim<inicio){
    alert("Informe uma faixa de volumes válida. Exemplo: do volume 1 até o volume 5.");
    return;
  }
  if(fim>total){
    alert(`O volume final não pode ser maior que a quantidade total de volumes (${total}).`);
    return;
  }

  const conflito=etiquetaPedidosFaixas.find(item=>inicio<=item.fim && fim>=item.inicio);
  if(conflito){
    alert(`Essa faixa coincide com ${conflito.nome}, volumes ${conflito.inicio} a ${conflito.fim}.`);
    return;
  }

  etiquetaPedidosFaixas.push({
    id:`faixa_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    nome,
    inicio,
    fim,
    fonte
  });

  document.getElementById("etqPedidoNome").value="";
  document.getElementById("etqPedidoInicio").value="";
  document.getElementById("etqPedidoFim").value="";
  document.getElementById("etqPedidoFonte").value="auto";
  montarListaFaixasPedidoEtiqueta();
  atualizarPreviewEtiqueta();
}

function removerFaixaPedidoEtiqueta(id){
  etiquetaPedidosFaixas=etiquetaPedidosFaixas.filter(item=>item.id!==id);
  montarListaFaixasPedidoEtiqueta();
  atualizarPreviewEtiqueta();
}


function atualizarPreviewsFaixasEtiqueta(){
  const secao=document.getElementById("etqFaixasPreview");
  const grid=document.getElementById("etqFaixasPreviewGrid");
  if(!secao || !grid) return;

  const d=dadosEtiquetaFormulario();
  const faixas=(d.pedidos_faixas || []).slice().sort((a,b)=>Number(a.inicio)-Number(b.inicio));

  if(!faixas.length){
    secao.style.display="none";
    grid.innerHTML="";
    return;
  }

  secao.style.display="block";
  grid.innerHTML="";

  faixas.forEach(faixa=>{
    const volume=Math.max(1,Number(faixa.inicio) || 1);
    const card=document.createElement("div");
    card.className="etiqueta-faixa-card";

    const titulo=document.createElement("div");
    titulo.className="etiqueta-faixa-titulo";
    titulo.textContent=`${faixa.nome} — volumes ${String(faixa.inicio).padStart(2,"0")} a ${String(faixa.fim).padStart(2,"0")}`;

    const wrap=document.createElement("div");
    wrap.className="etiqueta-mini-wrap";
    wrap.appendChild(criarElementoEtiqueta(d,volume));

    card.appendChild(titulo);
    card.appendChild(wrap);
    grid.appendChild(card);
  });
}



let enderecoXmlPendenteEtiqueta=null;
let resolverEscolhaEnderecoEtiqueta=null;

function formatarEnderecoEscolhaEtiqueta(dados){
  const enderecoNumero=[dados.endereco,dados.numero].filter(Boolean).join(", ");
  const enderecoCompleto=[enderecoNumero,dados.complemento].filter(Boolean).join(" - ");
  return [
    enderecoCompleto,
    dados.bairro ? `Bairro: ${dados.bairro}` : "",
    dados.cep ? `CEP: ${formatarCepEtiqueta(dados.cep)}` : "",
    [dados.cidade,dados.uf].filter(Boolean).join("/")
  ].filter(Boolean).map(escaparHtmlEmail).join("<br>") || "Endereço não informado.";
}

function cadastroPossuiEnderecoLogistico(cliente){
  return !!(cliente && (cliente.endereco || cliente.bairro || cliente.cep || cliente.cidade || cliente.uf));
}

function limparNovoEnderecoEtiqueta(){
  ["novoEtqEndereco","novoEtqNumero","novoEtqComplemento","novoEtqBairro",
   "novoEtqCep","novoEtqCidade","novoEtqUf"].forEach(id=>{
    const campo=document.getElementById(id);
    if(campo) campo.value="";
  });
}

function alternarNovoEnderecoEtiqueta(){
  const opcao=document.querySelector('input[name="enderecoEtiquetaEscolhido"]:checked')?.value;
  const box=document.getElementById("novoEnderecoEtiquetaBox");
  if(box) box.style.display=opcao==="novo" ? "block" : "none";
}

function dadosNovoEnderecoEtiqueta(){
  return {
    endereco:document.getElementById("novoEtqEndereco")?.value.trim() || "",
    numero:document.getElementById("novoEtqNumero")?.value.trim() || "",
    complemento:document.getElementById("novoEtqComplemento")?.value.trim() || "",
    bairro:document.getElementById("novoEtqBairro")?.value.trim() || "",
    cep:document.getElementById("novoEtqCep")?.value.trim() || "",
    cidade:document.getElementById("novoEtqCidade")?.value.trim() || "",
    uf:document.getElementById("novoEtqUf")?.value.trim().toUpperCase() || ""
  };
}

function abrirEscolhaEnderecoEtiqueta(cliente,dadosXml){
  return new Promise(resolve=>{
    enderecoXmlPendenteEtiqueta={cliente,dadosXml};
    resolverEscolhaEnderecoEtiqueta=resolve;

    document.getElementById("enderecoCadastradoPrevia").innerHTML=
      formatarEnderecoEscolhaEtiqueta({
        endereco:cliente.endereco || "",
        numero:cliente.numero || "",
        complemento:cliente.complemento || "",
        bairro:cliente.bairro || "",
        cep:cliente.cep || "",
        cidade:cliente.cidade || "",
        uf:cliente.uf || ""
      });

    document.getElementById("enderecoXmlPrevia").innerHTML=
      formatarEnderecoEscolhaEtiqueta(dadosXml);

    document.querySelectorAll('input[name="enderecoEtiquetaEscolhido"]').forEach(item=>{
      item.checked=item.value==="cadastrado";
    });

    limparNovoEnderecoEtiqueta();
    alternarNovoEnderecoEtiqueta();
    document.getElementById("modalEscolherEnderecoEtiqueta").style.display="flex";
  });
}

function cancelarEscolhaEnderecoEtiqueta(){
  document.getElementById("modalEscolherEnderecoEtiqueta").style.display="none";
  if(resolverEscolhaEnderecoEtiqueta) resolverEscolhaEnderecoEtiqueta(null);
  resolverEscolhaEnderecoEtiqueta=null;
  enderecoXmlPendenteEtiqueta=null;
}

async function confirmarEscolhaEnderecoEtiqueta(substituirCadastro){
  const tipo=document.querySelector('input[name="enderecoEtiquetaEscolhido"]:checked')?.value || "cadastrado";
  const pendente=enderecoXmlPendenteEtiqueta;

  if(!pendente){
    cancelarEscolhaEnderecoEtiqueta();
    return;
  }

  let dadosEscolhidos;

  if(tipo==="cadastrado"){
    dadosEscolhidos={
      endereco:pendente.cliente.endereco || "",
      numero:pendente.cliente.numero || "",
      complemento:pendente.cliente.complemento || "",
      bairro:pendente.cliente.bairro || "",
      cep:pendente.cliente.cep || "",
      cidade:pendente.cliente.cidade || "",
      uf:pendente.cliente.uf || ""
    };
  }else if(tipo==="xml"){
    dadosEscolhidos={...pendente.dadosXml};
  }else{
    dadosEscolhidos=dadosNovoEnderecoEtiqueta();

    if(!dadosEscolhidos.endereco || !dadosEscolhidos.cidade || !dadosEscolhidos.uf){
      alert("Para cadastrar outro endereço, informe pelo menos Endereço, Cidade e UF.");
      return;
    }
  }

  if(substituirCadastro && tipo!=="cadastrado"){
    const resposta=await banco
      .from("email_clientes")
      .update({
        endereco:dadosEscolhidos.endereco || "",
        numero:dadosEscolhidos.numero || "",
        complemento:dadosEscolhidos.complemento || "",
        bairro:dadosEscolhidos.bairro || "",
        cep:dadosEscolhidos.cep || "",
        cidade:dadosEscolhidos.cidade || "",
        uf:dadosEscolhidos.uf || "",
        atualizado_em:new Date().toISOString()
      })
      .eq("id",pendente.cliente.id)
      .select()
      .single();

    if(resposta.error){
      alert("Não foi possível substituir o endereço cadastrado: "+resposta.error.message);
      return;
    }

    const posicao=emailClientes.findIndex(item=>item.id===pendente.cliente.id);
    if(posicao>=0) emailClientes[posicao]=resposta.data;
    montarTabelaClientesEmail();
  }

  document.getElementById("modalEscolherEnderecoEtiqueta").style.display="none";

  if(resolverEscolhaEnderecoEtiqueta){
    resolverEscolhaEnderecoEtiqueta({
      tipo,
      dados:dadosEscolhidos,
      substituiu:!!substituirCadastro
    });
  }

  resolverEscolhaEnderecoEtiqueta=null;
  enderecoXmlPendenteEtiqueta=null;
}


function preencherEnderecoEtiquetaComCadastro(cliente){
  const enderecoNumero=[cliente.endereco,cliente.numero].filter(Boolean).join(", ");
  const enderecoCompleto=[enderecoNumero,cliente.complemento].filter(Boolean).join(" - ");

  document.getElementById("etqEndereco").value=enderecoCompleto || "";
  document.getElementById("etqBairro").value=cliente.bairro || "";
  document.getElementById("etqCep").value=formatarCepEtiqueta(cliente.cep || "");
  document.getElementById("etqCidade").value=cliente.cidade || "";
  document.getElementById("etqUf").value=cliente.uf || "";
}

function preencherEnderecoEtiquetaComXml(dadosXml){
  const enderecoNumero=[dadosXml.endereco,dadosXml.numero].filter(Boolean).join(", ");
  const enderecoCompleto=[enderecoNumero,dadosXml.complemento].filter(Boolean).join(" - ");

  document.getElementById("etqEndereco").value=enderecoCompleto || "";
  document.getElementById("etqBairro").value=dadosXml.bairro || "";
  document.getElementById("etqCep").value=formatarCepEtiqueta(dadosXml.cep || "");
  document.getElementById("etqCidade").value=dadosXml.cidade || "";
  document.getElementById("etqUf").value=dadosXml.uf || "";
}

function ajustarLinhasVisiveisEtiqueta(etiqueta,d){
  if(!etiqueta) return;

  const valores={
    ".etiqueta-endereco":d.endereco,
    ".etiqueta-bairro":d.bairro,
    ".etiqueta-cep":d.cep,
    ".etiqueta-cidade":[d.cidade,d.uf].filter(Boolean).join("/"),
    ".etiqueta-nf":d.numero_nf,
    ".etiqueta-chave":d.chave_nfe,
    ".etiqueta-barcode":d.chave_nfe,
    ".etiqueta-transportadora":d.transportadora
  };

  Object.entries(valores).forEach(([seletor,valor])=>{
    const elemento=etiqueta.querySelector(seletor);
    if(elemento) elemento.style.display=valor ? "" : "none";
  });

  let topo=44;
  [
    [".etiqueta-endereco",d.endereco,7],
    [".etiqueta-bairro",d.bairro,7],
    [".etiqueta-cep",d.cep,7],
    [".etiqueta-cidade",[d.cidade,d.uf].filter(Boolean).join("/"),8]
  ].forEach(([seletor,valor,espaco])=>{
    if(!valor) return;
    const elemento=etiqueta.querySelector(seletor);
    if(elemento){
      elemento.style.top=`${topo}mm`;
      topo+=espaco;
    }
  });

  const nf=etiqueta.querySelector(".etiqueta-nf");
  const volume=etiqueta.querySelector(".etiqueta-volume");
  if(nf) nf.style.top=`${topo}mm`;
  if(volume) volume.style.top=`${topo}mm`;
}

function atualizarPreviewEtiqueta(){
  const d=dadosEtiquetaFormulario();

  const logo=document.getElementById("etqLogo");
  if(logo){
    const url=logoEtiquetaUrl();
    logo.src=url || "";
    logo.style.display=url ? "block" : "none";
  }

  document.getElementById("etqPrevCliente").textContent=(d.cliente || "CLIENTE").toUpperCase();
  document.getElementById("etqPrevEndereco").textContent=d.endereco || "";
  document.getElementById("etqPrevBairro").textContent=d.bairro || "";
  document.getElementById("etqPrevCep").textContent=formatarCepEtiqueta(d.cep) || "";
  document.getElementById("etqPrevCidade").textContent=[d.cidade,d.uf].filter(Boolean).join("/") || "";
  document.getElementById("etqPrevNf").textContent=formatarNfEtiqueta(d.numero_nf);
  document.getElementById("etqPrevVolume").textContent=formatarVolumeEtiqueta(1,d.quantidade_volumes);
  document.getElementById("etqPrevChave").textContent=d.chave_nfe;

  const pedidoVolumeUm=pedidoParaVolumeEtiqueta(1,d.pedidos_faixas);
  const pedidoTag=document.getElementById("etqPrevPedidoTag");
  if(pedidoTag){
    pedidoTag.textContent=pedidoVolumeUm?.nome || "";
    pedidoTag.classList.toggle("vazia",!pedidoVolumeUm);
    ajustarFontePedidoEtiqueta(pedidoTag,pedidoVolumeUm?.nome || "",pedidoVolumeUm?.fonte || "auto");
  }

  const destino=document.querySelector("#etqPreview .etiqueta-destino");
  const endereco=document.querySelector("#etqPreview .etiqueta-endereco");
  const bairro=document.querySelector("#etqPreview .etiqueta-bairro");
  const cidade=document.querySelector("#etqPreview .etiqueta-cidade");
  if(destino) destino.style.fontSize=(d.cliente.length>30 ? "5mm" : d.cliente.length>24 ? "5.6mm" : "6.2mm");
  if(endereco) endereco.style.fontSize=(d.endereco.length>38 ? "3.8mm" : d.endereco.length>30 ? "4.2mm" : "4.8mm");
  if(bairro) bairro.style.fontSize=(d.bairro.length>22 ? "4mm" : "4.8mm");
  const cidadeUf=[d.cidade,d.uf].filter(Boolean).join("/");
  if(cidade) cidade.style.fontSize=(cidadeUf.length>24 ? "5.8mm" : cidadeUf.length>18 ? "6.2mm" : "6.8mm");

  const transp=document.getElementById("etqPrevTransportadora");
  transp.classList.toggle("vazia",!d.transportadora);
  transp.classList.toggle("duas-linhas",!!d.transportadora_duas_linhas);
  transp.style.fontSize=fonteTransportadoraEscolhida(d.transportadora,d.transportadora_duas_linhas);

  if(d.transportadora_duas_linhas && d.transportadora){
    const linhas=quebrarTransportadoraEmDuasLinhas(d.transportadora);
    transp.innerHTML=`<span>${escaparHtmlEmail(linhas[0])}</span><span>${escaparHtmlEmail(linhas[1] || "")}</span>`;
  }else{
    transp.textContent=d.transportadora || "";
  }

  if(window.QRCode) montarQrEtiqueta(document.getElementById("etqQr"));
  if(window.JsBarcode) montarBarcodeEtiqueta(document.getElementById("etqBarcode"),d.chave_nfe);

  aplicarAjustesTamanhoEtiqueta(document.getElementById("etqPreview"));
  ajustarLinhasVisiveisEtiqueta(document.getElementById("etqPreview"),d);
  atualizarValoresAjustesEtiqueta();
  atualizarPreviewsFaixasEtiqueta();

  const resumo=document.getElementById("etqResumoVolumes");
  if(resumo){
    resumo.innerHTML=Array.from({length:d.quantidade_volumes},(_,i)=>
      `<span class="etiqueta-mini">VOL ${formatarVolumeEtiqueta(i+1,d.quantidade_volumes)}</span>`
    ).join("");
  }
}


function clienteEtiquetaJaCadastrado(nome){
  const normalizado=normalizarNomeEmail(nome || "");
  return emailClientes.find(item=>normalizarNomeEmail(item.nome || "")===normalizado) || null;
}

function preencherVendedorasModalClienteEtiqueta(){
  const select=document.getElementById("modalClienteEtiquetaVendedora");
  if(!select) return;

  select.innerHTML='<option value="">Selecione a vendedora</option>' +
    emailVendedoras
      .filter(item=>item.ativo!==false)
      .sort((a,b)=>(a.nome || "").localeCompare(b.nome || "","pt-BR"))
      .map(item=>`<option value="${item.id}">${escaparHtmlEmail(item.nome || "")} — ${escaparHtmlEmail(item.email || "")}</option>`)
      .join("");
}

function abrirModalClienteEtiqueta(nome){
  preencherVendedorasModalClienteEtiqueta();

  document.getElementById("modalClienteEtiquetaNomeOriginal").value=nome || "";
  document.getElementById("modalClienteEtiquetaNome").value=nome || "";
  document.getElementById("modalClienteEtiquetaEmails").value="";
  document.getElementById("modalClienteEtiquetaVendedora").value="";

  const modal=document.getElementById("modalClienteEtiqueta");
  modal.style.display="flex";
}

function fecharModalClienteEtiqueta(){
  const modal=document.getElementById("modalClienteEtiqueta");
  if(modal) modal.style.display="none";
}

async function salvarClienteRapidoEtiqueta(){
  if(!bancoPronto()) return;

  const nome=document.getElementById("modalClienteEtiquetaNome")?.value.trim() || "";
  const emailsTexto=document.getElementById("modalClienteEtiquetaEmails")?.value.trim() || "";
  const vendedora_id=document.getElementById("modalClienteEtiquetaVendedora")?.value || "";

  if(!nome){
    alert("Informe o nome do cliente.");
    return;
  }
  if(!emailsTexto){
    alert("Informe pelo menos um e-mail do cliente.");
    return;
  }
  if(!vendedora_id){
    alert("Selecione a vendedora.");
    return;
  }

  const emails=emailsTexto
    .split(/[;,\n]+/)
    .map(item=>item.trim())
    .filter(Boolean);

  const invalidos=emails.filter(email=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if(invalidos.length){
    alert("Verifique estes e-mails inválidos:\n"+invalidos.join("\n"));
    return;
  }

  const existente=clienteEtiquetaJaCadastrado(nome);
  if(existente){
    alert("Esse cliente já está cadastrado.");
    fecharModalClienteEtiqueta();
    return;
  }

  const dadosEtiqueta=dadosEtiquetaFormulario();

  const resposta=await banco.from("email_clientes").insert([{
    nome,
    emails,
    vendedora_id,
    endereco:dadosEtiqueta.endereco || "",
    numero:"",
    complemento:"",
    bairro:dadosEtiqueta.bairro || "",
    cep:dadosEtiqueta.cep || "",
    cidade:dadosEtiqueta.cidade || "",
    uf:dadosEtiqueta.uf || "",
    transportadora_preferencial:dadosEtiqueta.transportadora || "",
    observacao_logistica:"",
    ativo:true,
    atualizado_em:new Date().toISOString()
  }]).select().single();

  if(resposta.error){
    alert("Erro ao cadastrar cliente: "+resposta.error.message);
    return;
  }

  emailClientes.unshift(resposta.data);
  montarTabelaClientesEmail();
  fecharModalClienteEtiqueta();
  mostrarAvisoEmail(`Cliente ${nome} cadastrado com sucesso para futuros envios de boletos.`,true);
}

function verificarCadastroClienteEtiqueta(){
  const nome=document.getElementById("etqCliente")?.value.trim() || "";
  if(!nome) return;

  if(!clienteEtiquetaJaCadastrado(nome)){
    abrirModalClienteEtiqueta(nome);
  }
}

function mostrarSugestoesEtiqueta(){
  const input=document.getElementById("etqCliente");
  const lista=document.getElementById("etqSugestoesClientes");
  if(!input || !lista) return;

  const termo=normalizarNomeEmail(input.value);
  const encontrados=emailClientes
    .filter(item=>!termo || normalizarNomeEmail(item.nome).includes(termo))
    .slice(0,15);

  if(!encontrados.length){
    lista.innerHTML="";
    lista.classList.remove("ativa");
    return;
  }

  lista.innerHTML=encontrados.map(item=>`
    <div class="etiqueta-sugestao" onmousedown="selecionarClienteEtiqueta('${item.id}')">
      <b>${escaparHtmlEmail(item.nome)}</b>
      <small>${escaparHtmlEmail([item.cidade,item.uf].filter(Boolean).join("/") || "Cidade/UF não cadastrada")}</small>
    </div>`).join("");
  lista.classList.add("ativa");
}

function selecionarClienteEtiqueta(id){
  const item=emailClientes.find(x=>x.id===id);
  if(!item) return;
  document.getElementById("etqCliente").value=item.nome || "";

  const enderecoNumero=[item.endereco,item.numero].filter(Boolean).join(", ");
  const enderecoCompleto=[enderecoNumero,item.complemento].filter(Boolean).join(" - ");

  document.getElementById("etqEndereco").value=enderecoCompleto || "";
  document.getElementById("etqBairro").value=item.bairro || "";
  document.getElementById("etqCep").value=formatarCepEtiqueta(item.cep || "");
  document.getElementById("etqCidade").value=item.cidade || "";
  document.getElementById("etqUf").value=item.uf || "";
  document.getElementById("etqTransportadora").value=item.transportadora_preferencial || "";
  document.getElementById("etqSugestoesClientes").classList.remove("ativa");
  atualizarPreviewEtiqueta();
}

document.addEventListener("click",evento=>{
  const box=document.querySelector("#emailSubEtiquetas .etiqueta-sugestoes");
  if(box && !box.contains(evento.target)){
    document.getElementById("etqSugestoesClientes")?.classList.remove("ativa");
  }
});


function decodificarEntidadesXml(valor){
  let texto=String(valor || "");

  // Decodifica entidades comuns e também casos duplamente codificados,
  // como &amp;amp;H, sem alterar o caractere & correto.
  for(let tentativa=0;tentativa<3;tentativa++){
    const textarea=document.createElement("textarea");
    textarea.innerHTML=texto;
    const decodificado=textarea.value;

    if(decodificado===texto) break;
    texto=decodificado;
  }

  return texto
    .replace(/\u00A0/g," ")
    .replace(/\s+/g," ")
    .trim();
}

async function lerXmlEtiqueta(evento){
  const arquivo=evento.target.files?.[0];
  if(!arquivo) return;

  try{
    const texto=await arquivo.text();
    const xml=new DOMParser().parseFromString(texto,"application/xml");
    if(xml.querySelector("parsererror")) throw new Error("XML inválido.");

    const textoNo=(seletores)=>{
      for(const seletor of seletores){
        const no=xml.querySelector(seletor);
        if(no?.textContent?.trim()){
          return decodificarEntidadesXml(no.textContent);
        }
      }
      return "";
    };

    const chave=textoNo(["protNFe infProt chNFe","infNFe"]).replace(/^NFe/,"");
    const numeroNf=textoNo(["ide nNF"]);
    const cliente=decodificarEntidadesXml(textoNo(["dest xNome"]));
    const logradouro=textoNo(["dest enderDest xLgr"]);
    const numeroEndereco=textoNo(["dest enderDest nro"]);
    const complemento=textoNo(["dest enderDest xCpl"]);
    const bairro=textoNo(["dest enderDest xBairro"]);
    const cep=textoNo(["dest enderDest CEP"]);
    const cidade=textoNo(["dest enderDest xMun"]);
    const uf=textoNo(["dest enderDest UF"]);
    const transportadoraCompleta=textoNo(["transp transporta xNome","transporta xNome"]);
    const transportadoraPrimeiroNome=transportadoraCompleta.trim().split(/\s+/)[0] || "";
    const endereco=[logradouro,numeroEndereco].filter(Boolean).join(", ") + (complemento ? ` - ${complemento}` : "");

    // Quantidade de volumes: primeiro tenta qVol; se não existir,
    // conta os blocos <vol>; por último tenta nVol quando vier numérico.
    let quantidadeVolumes=0;
    const qVolTexto=textoNo(["transp vol qVol","vol qVol"]);
    if(qVolTexto){
      quantidadeVolumes=parseInt(String(qVolTexto).replace(/\D/g,""),10) || 0;
    }

    if(!quantidadeVolumes){
      const blocosVol=xml.querySelectorAll("transp vol, vol");
      if(blocosVol.length) quantidadeVolumes=blocosVol.length;
    }

    if(!quantidadeVolumes){
      const nVolTexto=textoNo(["transp vol nVol","vol nVol"]);
      const numeroExtraido=String(nVolTexto || "").match(/\d+/);
      if(numeroExtraido) quantidadeVolumes=parseInt(numeroExtraido[0],10) || 0;
    }

    if(cliente) document.getElementById("etqCliente").value=cliente;
    if(transportadoraPrimeiroNome) document.getElementById("etqTransportadora").value=transportadoraPrimeiroNome.toUpperCase();
    if(numeroNf) document.getElementById("etqNf").value=numeroNf;
    if(quantidadeVolumes>0) document.getElementById("etqVolumes").value=quantidadeVolumes;
    if(chave) document.getElementById("etqChave").value=chave.replace(/\D/g,"").slice(0,44);

    const dadosEnderecoXml={
      endereco:logradouro || "",
      numero:numeroEndereco || "",
      complemento:complemento || "",
      bairro:bairro || "",
      cep:cep || "",
      cidade:cidade || "",
      uf:uf || ""
    };

    const cadastroEncontrado=cliente ? clienteEtiquetaJaCadastrado(cliente) : null;

    if(cadastroEncontrado && cadastroPossuiEnderecoLogistico(cadastroEncontrado)){
      const escolha=await abrirEscolhaEnderecoEtiqueta(cadastroEncontrado,dadosEnderecoXml);

      if(escolha===null){
        evento.target.value="";
        return;
      }

      preencherEnderecoEtiquetaComXml(escolha.dados);
    }else{
      preencherEnderecoEtiquetaComXml(dadosEnderecoXml);
    }

    atualizarPreviewEtiqueta();

    if(cliente){
      const cadastro=clienteEtiquetaJaCadastrado(cliente);

      if(!cadastro){
        setTimeout(()=>abrirModalClienteEtiqueta(cliente),250);
      }else{
        const atualizacao={};

        if(!cadastro.endereco && logradouro) atualizacao.endereco=logradouro;
        if(!cadastro.numero && numeroEndereco) atualizacao.numero=numeroEndereco;
        if(!cadastro.complemento && complemento) atualizacao.complemento=complemento;
        if(!cadastro.bairro && bairro) atualizacao.bairro=bairro;
        if(!cadastro.cep && cep) atualizacao.cep=cep;
        if(!cadastro.cidade && cidade) atualizacao.cidade=cidade;
        if(!cadastro.uf && uf) atualizacao.uf=uf;
        if(!cadastro.transportadora_preferencial && transportadoraPrimeiroNome){
          atualizacao.transportadora_preferencial=transportadoraPrimeiroNome.toUpperCase();
        }

        if(Object.keys(atualizacao).length){
          atualizacao.atualizado_em=new Date().toISOString();

          const resultado=await banco
            .from("email_clientes")
            .update(atualizacao)
            .eq("id",cadastro.id)
            .select()
            .single();

          if(!resultado.error && resultado.data){
            const posicao=emailClientes.findIndex(item=>item.id===cadastro.id);
            if(posicao>=0) emailClientes[posicao]=resultado.data;
            montarTabelaClientesEmail();
          }
        }

        alert("Dados da NF-e carregados. O endereço do cadastro foi completado quando havia informações faltando.");
      }
    }
  }catch(erro){
    alert("Não foi possível ler o XML: "+erro.message);
  }
}

function criarElementoEtiqueta(d,volumeAtual){
  const etiqueta=document.createElement("div");
  etiqueta.className="etiqueta-papel";
  const pedidoVolume=pedidoParaVolumeEtiqueta(volumeAtual,d.pedidos_faixas);
  etiqueta.innerHTML=`
    <div class="etiqueta-pedido-tag ${pedidoVolume ? "" : "vazia"}">${pedidoVolume ? escaparHtmlEmail(pedidoVolume.nome) : ""}</div>
    <img class="etiqueta-logo" alt="Logo Sofisticatto">
    <div class="etiqueta-qr-texto">
                <div class="insta-vertical">I<br>N<br>S<br>T<br>A</div>
                <div class="gram-horizontal">G&nbsp;R&nbsp;A&nbsp;M</div>
              </div>
    <div class="etiqueta-qr"></div>
    <div class="etiqueta-destino">DESTINO: <b>${escaparHtmlEmail((d.cliente || "CLIENTE").toUpperCase())}</b></div>
    <div class="etiqueta-endereco">ENDEREÇO: <b>${escaparHtmlEmail(d.endereco || "ENDEREÇO")}</b></div>
    <div class="etiqueta-bairro">BAIRRO: <b>${escaparHtmlEmail(d.bairro || "BAIRRO")}</b></div>
    <div class="etiqueta-cep">CEP: <b>${escaparHtmlEmail(formatarCepEtiqueta(d.cep) || "CEP")}</b></div>
    <div class="etiqueta-cidade">CIDADE: <b>${escaparHtmlEmail([d.cidade,d.uf].filter(Boolean).join("/") || "CIDADE/UF")}</b></div>
    <div class="etiqueta-nf">NF: ${escaparHtmlEmail(formatarNfEtiqueta(d.numero_nf))}</div>
    <div class="etiqueta-volume">VOL: ${escaparHtmlEmail(formatarVolumeEtiqueta(volumeAtual,d.quantidade_volumes))}</div>
    <svg class="etiqueta-barcode"></svg>
    <div class="etiqueta-chave">${escaparHtmlEmail(d.chave_nfe)}</div>
    <div class="etiqueta-transportadora ${d.transportadora ? "" : "vazia"} ${d.transportadora_duas_linhas ? "duas-linhas" : ""}"></div>`;

  const pedidoTag=etiqueta.querySelector(".etiqueta-pedido-tag");
  ajustarFontePedidoEtiqueta(pedidoTag,pedidoVolume?.nome || "",pedidoVolume?.fonte || "auto");

  const destino=etiqueta.querySelector(".etiqueta-destino");
  const endereco=etiqueta.querySelector(".etiqueta-endereco");
  const bairro=etiqueta.querySelector(".etiqueta-bairro");
  const cidade=etiqueta.querySelector(".etiqueta-cidade");
  destino.style.fontSize=(d.cliente.length>30 ? "5mm" : d.cliente.length>24 ? "5.6mm" : "6.2mm");
  endereco.style.fontSize=(d.endereco.length>38 ? "3.8mm" : d.endereco.length>30 ? "4.2mm" : "4.8mm");
  bairro.style.fontSize=(d.bairro.length>22 ? "4mm" : "4.8mm");
  const cidadeUf=[d.cidade,d.uf].filter(Boolean).join("/");
  cidade.style.fontSize=(cidadeUf.length>24 ? "5.8mm" : cidadeUf.length>18 ? "6.2mm" : "6.8mm");

  const transportadora=etiqueta.querySelector(".etiqueta-transportadora");
  transportadora.style.fontSize=fonteTransportadoraEscolhida(d.transportadora,d.transportadora_duas_linhas);

  if(d.transportadora_duas_linhas && d.transportadora){
    const linhas=quebrarTransportadoraEmDuasLinhas(d.transportadora);
    transportadora.innerHTML=`<span>${escaparHtmlEmail(linhas[0])}</span><span>${escaparHtmlEmail(linhas[1] || "")}</span>`;
  }else{
    transportadora.textContent=d.transportadora || "";
  }

  const logo=etiqueta.querySelector(".etiqueta-logo");
  const logoUrl=logoEtiquetaUrl();
  if(logoUrl) logo.src=logoUrl; else logo.style.display="none";

  montarQrEtiqueta(etiqueta.querySelector(".etiqueta-qr"));
  montarBarcodeEtiqueta(etiqueta.querySelector(".etiqueta-barcode"),d.chave_nfe);
  aplicarAjustesTamanhoEtiqueta(etiqueta);
  ajustarLinhasVisiveisEtiqueta(etiqueta,d);
  return etiqueta;
}

function validarEtiqueta(){
  const d=dadosEtiquetaFormulario();
  if(!d.cliente){alert("Informe o nome do cliente.");return null}
  if(!d.cidade || !d.uf){alert("Informe a cidade e o estado.");return null}
  if(!d.numero_nf){alert("Informe o número da Nota Fiscal.");return null}
  if(d.chave_nfe.length!==44){alert("A chave da NF-e deve ter 44 dígitos.");return null}
  return d;
}

async function montarEtiquetasParaSaida(){
  const d=validarEtiqueta();
  if(!d) return null;
  await carregarBibliotecasEtiqueta();

  const container=document.getElementById("etiquetasImpressao");
  container.innerHTML="";
  container.style.display="block";
  for(let i=1;i<=d.quantidade_volumes;i++){
    container.appendChild(criarElementoEtiqueta(d,i));
  }
  await new Promise(resolve=>setTimeout(resolve,350));
  return {d,container};
}


async function converterSvgBarcodeParaCanvas(etiqueta){
  const svg=etiqueta.querySelector(".etiqueta-barcode");
  if(!svg) return;

  const rect=svg.getBoundingClientRect();
  if(!rect.width || !rect.height) return;

  const clone=svg.cloneNode(true);
  clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
  clone.setAttribute("width",String(Math.max(1,Math.round(rect.width))));
  clone.setAttribute("height",String(Math.max(1,Math.round(rect.height))));

  const textoSvg=new XMLSerializer().serializeToString(clone);
  const blob=new Blob([textoSvg],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(blob);

  try{
    const imagem=new Image();
    await new Promise((resolve,reject)=>{
      imagem.onload=resolve;
      imagem.onerror=reject;
      imagem.src=url;
    });

    const escala=4;
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(rect.width*escala));
    canvas.height=Math.max(1,Math.round(rect.height*escala));
    canvas.className=svg.className.baseVal || "etiqueta-barcode";
    canvas.style.cssText=svg.style.cssText;

    const contexto=canvas.getContext("2d");
    contexto.scale(escala,escala);
    contexto.fillStyle="#fff";
    contexto.fillRect(0,0,rect.width,rect.height);
    contexto.drawImage(imagem,0,0,rect.width,rect.height);

    svg.replaceWith(canvas);
  }finally{
    URL.revokeObjectURL(url);
  }
}

function converterTransportadoraParaCanvas(etiqueta){
  const elemento=etiqueta.querySelector(".etiqueta-transportadora");
  if(!elemento || elemento.classList.contains("vazia")) return;

  const texto=(elemento.textContent || "").trim();
  if(!texto) return;

  const rect=elemento.getBoundingClientRect();
  if(!rect.width || !rect.height) return;

  const estilo=getComputedStyle(elemento);
  const escala=4;
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(rect.width*escala));
  canvas.height=Math.max(1,Math.round(rect.height*escala));
  canvas.className="etiqueta-transportadora-canvas";
  canvas.style.position="absolute";
  canvas.style.right=getComputedStyle(elemento).right;
  canvas.style.bottom=getComputedStyle(elemento).bottom;
  canvas.style.width=`${rect.width}px`;
  canvas.style.height=`${rect.height}px`;
  canvas.style.transform="none";
  canvas.style.writingMode="horizontal-tb";
  canvas.style.overflow="visible";

  const contexto=canvas.getContext("2d");
  contexto.scale(escala,escala);
  contexto.clearRect(0,0,rect.width,rect.height);
  contexto.fillStyle=estilo.color || "#000";
  contexto.font=`${estilo.fontWeight || "900"} ${estilo.fontSize || "32px"} Arial`;
  contexto.textAlign="center";
  contexto.textBaseline="middle";

  const duasLinhas=elemento.classList.contains("duas-linhas");
  if(duasLinhas){
    const linhas=[...elemento.querySelectorAll("span")]
      .map(item=>item.textContent.trim())
      .filter(Boolean);

    const alturaLinha=parseFloat(estilo.fontSize || "24")*1.05;
    const inicioY=rect.height/2-((linhas.length-1)*alturaLinha)/2;
    linhas.forEach((linha,indice)=>{
      contexto.fillText(linha,rect.width/2,inicioY+(indice*alturaLinha),rect.width-2);
    });
  }else{
    contexto.save();
    contexto.translate(rect.width/2,rect.height/2);
    contexto.rotate(-Math.PI/2);
    contexto.fillText(texto,0,0,rect.height-4);
    contexto.restore();
  }

  elemento.replaceWith(canvas);
}

async function esperarImagensEtiqueta(etiqueta){
  const imagens=[...etiqueta.querySelectorAll("img")];
  await Promise.all(imagens.map(imagem=>{
    if(imagem.complete) return Promise.resolve();
    return new Promise(resolve=>{
      imagem.addEventListener("load",resolve,{once:true});
      imagem.addEventListener("error",resolve,{once:true});
    });
  }));
}

function normalizarLogoParaCaptura(etiqueta){
  const logoGerada=etiqueta.querySelector(".etiqueta-logo");
  const logoPrevia=document.getElementById("etqLogo");
  if(!logoGerada || !logoPrevia) return;

  const estiloPrevia=getComputedStyle(logoPrevia);
  const rectPrevia=logoPrevia.getBoundingClientRect();

  logoGerada.style.position="absolute";
  logoGerada.style.left=estiloPrevia.left;
  logoGerada.style.top=estiloPrevia.top;
  logoGerada.style.width="220px";
  logoGerada.style.height="auto";
  logoGerada.style.maxWidth="none";
  logoGerada.style.maxHeight="none";
  logoGerada.style.objectFit="contain";
  logoGerada.style.transform="none";
}

async function prepararEtiquetaParaCaptura(etiqueta){
  normalizarLogoParaCaptura(etiqueta);
  await esperarImagensEtiqueta(etiqueta);
  await converterSvgBarcodeParaCanvas(etiqueta);
  converterTransportadoraParaCanvas(etiqueta);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}

async function imprimirEtiquetas(){
  const d=validarEtiqueta();
  if(!d) return;

  try{
    await carregarBibliotecasEtiqueta();

    const janela=window.open("","_blank","width=980,height=760");
    if(!janela){
      alert("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
      return;
    }

    janela.document.open();
    janela.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Etiquetas ${escaparHtmlEmail(d.cliente)}</title>
<style>
@page{size:150mm 100mm;margin:0}
html,body{margin:0!important;padding:0!important;background:#fff!important}
.pagina{width:150mm;height:100mm;margin:0;padding:0;overflow:hidden;page-break-after:always;break-after:page}
.pagina:last-child{page-break-after:auto;break-after:auto}
.pagina img{display:block;width:150mm;height:100mm;margin:0;padding:0;object-fit:fill}
@media print{
  html,body{width:150mm;margin:0!important;padding:0!important}
  .pagina{width:150mm;height:100mm;margin:0!important;padding:0!important}
}
</style>
</head>
<body><div id="paginas"></div></body>
</html>`);
    janela.document.close();

    const temporario=document.createElement("div");
    temporario.style.position="fixed";
    temporario.style.left="-10000px";
    temporario.style.top="0";
    temporario.style.background="#fff";
    temporario.style.zIndex="-1";
    document.body.appendChild(temporario);

    const paginas=janela.document.getElementById("paginas");

    for(let volume=1;volume<=d.quantidade_volumes;volume++){
      const etiqueta=criarElementoEtiqueta(d,volume);
      etiqueta.style.margin="0";
      etiqueta.style.boxShadow="none";
      etiqueta.style.borderRadius="0";
      etiqueta.style.transform="none";
      temporario.appendChild(etiqueta);

      await prepararEtiquetaParaCaptura(etiqueta);
      await new Promise(resolve=>setTimeout(resolve,120));

      const rectEtiqueta=etiqueta.getBoundingClientRect();
      const canvas=await html2canvas(etiqueta,{
        scale:4,
        useCORS:true,
        allowTaint:true,
        backgroundColor:"#ffffff",
        width:Math.round(rectEtiqueta.width),
        height:Math.round(rectEtiqueta.height),
        windowWidth:Math.round(rectEtiqueta.width),
        windowHeight:Math.round(rectEtiqueta.height),
        scrollX:0,
        scrollY:0,
        logging:false
      });

      const pagina=janela.document.createElement("div");
      pagina.className="pagina";
      const imagem=janela.document.createElement("img");
      imagem.src=canvas.toDataURL("image/png");
      pagina.appendChild(imagem);
      paginas.appendChild(pagina);

      etiqueta.remove();
    }

    temporario.remove();

    await new Promise(resolve=>setTimeout(resolve,700));
    janela.focus();
    janela.print();
  }catch(erro){
    console.error("Erro ao imprimir etiquetas:",erro);
    alert("Não foi possível preparar a impressão: "+erro.message);
  }
}
async function baixarEtiquetasPDF(){
  try{
    const resultado=await montarEtiquetasParaSaida();
    if(!resultado) return;
    const {jsPDF}=window.jspdf;
    const etiquetas=[...resultado.container.querySelectorAll(".etiqueta-papel")];
    const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:[150,100]});

    for(let i=0;i<etiquetas.length;i++){
      if(i>0) pdf.addPage([150,100],"landscape");
      etiquetas[i].style.boxShadow="none";
      etiquetas[i].style.borderRadius="0";
      etiquetas[i].style.margin="0";
      const canvas=await html2canvas(etiquetas[i],{
        scale:3,
        useCORS:true,
        allowTaint:true,
        backgroundColor:"#ffffff",
        width:etiquetas[i].scrollWidth,
        height:etiquetas[i].scrollHeight,
        windowWidth:etiquetas[i].scrollWidth,
        windowHeight:etiquetas[i].scrollHeight
      });
      pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,150,100,undefined,"FAST");
    }

    pdf.save(`ETIQUETAS_${(resultado.d.cliente || "CLIENTE").replace(/[^a-z0-9]+/gi,"_")}_NF_${resultado.d.numero_nf}.pdf`);
    resultado.container.style.display="none";
  }catch(erro){
    console.error(erro);
    alert("Não foi possível gerar o PDF das etiquetas: "+erro.message);
  }
}

async function salvarHistoricoEtiqueta(){
  const d=validarEtiqueta();
  if(!d) return;

  const resposta=await banco.from("email_etiquetas").insert([{
    ...d,
    instagram_url:ETIQUETA_INSTAGRAM_URL,
    criado_por:usuarioLogado.login
  }]);

  if(resposta.error){
    alert("Erro ao salvar etiqueta: "+resposta.error.message);
    return;
  }

  alert("Etiqueta salva no histórico.");
  carregarHistoricoEtiquetas();
}

async function carregarHistoricoEtiquetas(){
  if(!banco || !usuarioLogado || usuarioLogado.tipo!=="financeiro") return;
  const resposta=await banco.from("email_etiquetas").select("*").order("created_at",{ascending:false}).limit(300);
  if(resposta.error){
    console.error("Erro ao carregar etiquetas:",resposta.error);
    return;
  }
  etiquetasHistorico=resposta.data || [];
  montarHistoricoEtiquetas(etiquetasHistorico);
}

function montarHistoricoEtiquetas(lista){
  const tabela=document.getElementById("etqTabelaHistorico");
  if(!tabela) return;
  tabela.innerHTML=lista.length ? lista.map(item=>`
    <tr>
      <td>${new Date(item.created_at).toLocaleString("pt-BR")}</td>
      <td>${escaparHtmlEmail(item.cliente)}</td>
      <td>${escaparHtmlEmail([item.cidade,item.uf].filter(Boolean).join("/"))}</td>
      <td>${escaparHtmlEmail(item.numero_nf || "")}</td>
      <td>${item.quantidade_volumes}</td>
      <td>${escaparHtmlEmail(item.transportadora || "")}</td>
      <td>
        <button class="btn azul" onclick="reutilizarEtiqueta('${item.id}')">Usar</button>
        <button class="btn vermelho" onclick="excluirEtiqueta('${item.id}')">Excluir</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="7">Nenhuma etiqueta salva.</td></tr>`;
}

function filtrarHistoricoEtiquetas(){
  const termo=normalizarNomeEmail(document.getElementById("etqBuscaHistorico")?.value || "");
  if(!termo){montarHistoricoEtiquetas(etiquetasHistorico);return}
  montarHistoricoEtiquetas(etiquetasHistorico.filter(item=>
    normalizarNomeEmail([item.cliente,item.endereco,item.bairro,item.cep,item.numero_nf,item.transportadora,item.cidade,item.uf].join(" ")).includes(termo)
  ));
}

function reutilizarEtiqueta(id){
  const item=etiquetasHistorico.find(x=>x.id===id);
  if(!item) return;
  document.getElementById("etqCliente").value=item.cliente || "";
  document.getElementById("etqEndereco").value=item.endereco || "";
  document.getElementById("etqBairro").value=item.bairro || "";
  document.getElementById("etqCep").value=formatarCepEtiqueta(item.cep || "");
  document.getElementById("etqCidade").value=item.cidade || "";
  document.getElementById("etqUf").value=item.uf || "";
  document.getElementById("etqNf").value=item.numero_nf || "";
  document.getElementById("etqVolumes").value=item.quantidade_volumes || 1;
  document.getElementById("etqTransportadora").value=item.transportadora || "";
  document.getElementById("etqTransportadoraDuasLinhas").checked=!!item.transportadora_duas_linhas;
  document.getElementById("etqTransportadoraFonte").value=item.transportadora_fonte || "auto";
  etiquetaPedidosFaixas=Array.isArray(item.pedidos_faixas)
    ? item.pedidos_faixas.map((faixa,index)=>({
        id:faixa.id || `faixa_salva_${index}_${Date.now()}`,
        nome:String(faixa.nome || "").toUpperCase(),
        inicio:Number(faixa.inicio),
        fim:Number(faixa.fim),
        fonte:faixa.fonte || "auto"
      }))
    : [];
  montarListaFaixasPedidoEtiqueta();
  document.getElementById("etqChave").value=item.chave_nfe || "";
  atualizarPreviewEtiqueta();
  window.scrollTo({top:0,behavior:"smooth"});
}

async function excluirEtiqueta(id){
  if(!confirm("Excluir esta etiqueta do histórico?")) return;
  const resposta=await banco.from("email_etiquetas").delete().eq("id",id);
  if(resposta.error){alert("Erro ao excluir: "+resposta.error.message);return}
  carregarHistoricoEtiquetas();
}

function limparFormularioEtiqueta(){
  ["etqCliente","etqEndereco","etqBairro","etqCep","etqCidade","etqUf","etqNf","etqTransportadora","etqChave"].forEach(id=>{
    const campo=document.getElementById(id);
    if(campo) campo.value="";
  });
  document.getElementById("etqVolumes").value=1;
  document.getElementById("etqTransportadoraDuasLinhas").checked=false;
  document.getElementById("etqTransportadoraFonte").value="auto";
  etiquetaPedidosFaixas=[];
  montarListaFaixasPedidoEtiqueta();
  document.getElementById("etqPedidoFonte").value="auto";
  ["etqPedidoNome","etqPedidoInicio","etqPedidoFim"].forEach(id=>{
    const campo=document.getElementById(id);
    if(campo) campo.value="";
  });
  document.getElementById("etqXml").value="";
  atualizarPreviewEtiqueta();
}

document.addEventListener("DOMContentLoaded", async function(){
  try{
    mostrarCarregando("Conectando...");
    await carregarSupabase();
    iniciarRealtime();
    esconderCarregando();

    const salvo = localStorage.getItem("usuarioLogado");
    if(salvo){
      usuarioLogado = JSON.parse(salvo);
      iniciarSistema();
    }else{
      atualizarBotaoNotificacao();
    }
  }catch(erro){
    console.error("Erro ao iniciar sistema:", erro);
    esconderCarregando();
    mostrarBalaoSistema("Erro de conexão", "Não foi possível conectar agora. Verifique a internet e atualize a página.");
  }
});
