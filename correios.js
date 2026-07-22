let correiosHistorico=[];

let correiosItens=[{id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),conteudo:"COSMÉTICOS",quantidade:1,valor:""}];

function montarItensCorreios(){
  const lista=document.getElementById("corItensLista");
  if(!lista) return;

  lista.innerHTML=correiosItens.map((item,indice)=>`
    <div class="cor-item-linha">
      <div>
        <label class="relatorio-label">Conteúdo ${indice+1}</label>
        <input value="${escaparHtmlEmail(item.conteudo || "")}"
          oninput="atualizarItemCorreios('${item.id}','conteudo',this.value)">
      </div>
      <div>
        <label class="relatorio-label">Quantidade</label>
        <input type="number" min="1" value="${Number(item.quantidade || 1)}"
          oninput="atualizarItemCorreios('${item.id}','quantidade',this.value)">
      </div>
      <div>
        <label class="relatorio-label">Valor (R$)</label>
        <input inputmode="decimal" value="${escaparHtmlEmail(item.valor || "")}" placeholder="0,00"
          oninput="atualizarItemCorreios('${item.id}','valor',this.value)">
      </div>
      <button type="button" onclick="removerItemCorreios('${item.id}')">Excluir</button>
    </div>`).join("");
}

function adicionarItemCorreios(){
  correiosItens.push({
    id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()),
    conteudo:"",
    quantidade:1,
    valor:""
  });
  montarItensCorreios();
  atualizarCorreiosTudo();
}

function removerItemCorreios(id){
  if(correiosItens.length===1){
    correiosItens=[{id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),conteudo:"",quantidade:1,valor:""}];
  }else{
    correiosItens=correiosItens.filter(item=>item.id!==id);
  }
  montarItensCorreios();
  atualizarCorreiosTudo();
}

function atualizarItemCorreios(id,campo,valor){
  const item=correiosItens.find(item=>item.id===id);
  if(!item) return;
  item[campo]=campo==="quantidade" ? Math.max(1,Number(valor || 1)) : valor;
  atualizarCorreiosTudo();
}

function numeroCorreios(valor){
  const texto=String(valor || "").trim();
  if(!texto) return 0;
  return Number(texto.replace(/\./g,"").replace(",", ".")) || 0;
}

function totalCorreiosItens(){
  return correiosItens.reduce((total,item)=>total+(numeroCorreios(item.valor)*Number(item.quantidade || 1)),0);
}


const CORREIOS_AJUSTES_PADRAO={
  logo:0,qr:0,destino:0,endereco:0,bairro:0,cidade:0,cep:0,servico:0,remetente:0,declaracao:0
};
let correiosAjustesTamanho=carregarCorreiosTamanhos();

function carregarCorreiosTamanhos(){
  try{
    return {...CORREIOS_AJUSTES_PADRAO,...JSON.parse(localStorage.getItem("sofisticatto_correios_tamanhos") || "{}")};
  }catch{
    return {...CORREIOS_AJUSTES_PADRAO};
  }
}
function salvarCorreiosTamanhos(){
  localStorage.setItem("sofisticatto_correios_tamanhos",JSON.stringify(correiosAjustesTamanho));
}
function ajustarCorreiosTamanho(campo,delta){
  const limites={
    logo:[-80,120],qr:[-18,35],destino:[-8,20],endereco:[-6,16],bairro:[-6,16],
    cidade:[-6,16],cep:[-5,12],servico:[-12,30],remetente:[-5,15],declaracao:[-3,6]
  };
  const [min,max]=limites[campo] || [-20,20];
  correiosAjustesTamanho[campo]=Math.max(min,Math.min(max,Number(correiosAjustesTamanho[campo] || 0)+Number(delta)));
  salvarCorreiosTamanhos();
  montarItensCorreios();
  atualizarCorreiosValoresAjuste();
  atualizarCorreiosTudo();
}
function restaurarCorreiosTamanhos(){
  correiosAjustesTamanho={...CORREIOS_AJUSTES_PADRAO};
  salvarCorreiosTamanhos();
  atualizarCorreiosValoresAjuste();
  atualizarCorreiosTudo();
}
function atualizarCorreiosValoresAjuste(){
  const mapa={
    logo:"corAjLogo",qr:"corAjQr",destino:"corAjDestino",endereco:"corAjEndereco",
    bairro:"corAjBairro",cidade:"corAjCidade",cep:"corAjCep",servico:"corAjServico",
    remetente:"corAjRemetente",declaracao:"corAjDeclaracao"
  };
  Object.entries(mapa).forEach(([campo,id])=>{
    const el=document.getElementById(id);
    if(!el) return;
    const valor=Number(correiosAjustesTamanho[campo] || 0);
    el.textContent=valor===0 ? "Padrão" : `${valor>0?"+":""}${valor}`;
  });
}
function aplicarAjustesCorreiosEtiqueta(etiqueta,tipo){
  if(!etiqueta) return;
  const ajuste=correiosAjustesTamanho;

  const logo=etiqueta.querySelector(".cor-logo");
  if(logo){
    const largura=Math.max(120,220+Number(ajuste.logo || 0));
    logo.style.width=`${largura}px`;
    logo.style.height="106px";
    logo.style.objectFit="contain";
  }

  const qr=etiqueta.querySelector(".etiqueta-qr");
  if(qr){
    const tamanho=Math.max(55,113+Number(ajuste.qr || 0));
    qr.style.width=`${tamanho}px`;
    qr.style.height=`${tamanho}px`;
  }

  const aplicarFonte=(seletor,base,campo,minimo=9)=>{
    const el=etiqueta.querySelector(seletor);
    if(el) el.style.fontSize=`${Math.max(minimo,base+Number(ajuste[campo] || 0))}px`;
  };

  aplicarFonte(".cor-destino",24,"destino",13);
  aplicarFonte(".cor-endereco",18,"endereco",11);
  aplicarFonte(".cor-bairro",18,"bairro",11);
  aplicarFonte(".cor-cidade",19,"cidade",11);
  aplicarFonte(".cor-cep",15,"cep",9);
  aplicarFonte(".cor-servico",83,"servico",40);
  aplicarFonte(".cor-rem-texto",23,"remetente",13);

  if(tipo==="declaracao"){
    const tamanho=Math.max(7,10+Number(ajuste.declaracao || 0));
    etiqueta.style.fontSize=`${tamanho}px`;

    etiqueta.querySelectorAll(
      ".cor-dec-bens th,.cor-dec-bens td,.cor-dec-linha,.cor-dec-declaracao,.cor-dec-data,.cor-dec-texto-assinatura"
    ).forEach(item=>{
      item.style.fontSize="inherit";
    });
  }
}


function valorCampoCorreios(id){
  return document.getElementById(id)?.value.trim() || "";
}

function dadosCorreios(){
  return {
    cliente:valorCampoCorreios("corCliente"),
    endereco:valorCampoCorreios("corEndereco"),
    numero:valorCampoCorreios("corNumero"),
    complemento:valorCampoCorreios("corComplemento"),
    bairro:valorCampoCorreios("corBairro"),
    cep:valorCampoCorreios("corCep"),
    cidade:valorCampoCorreios("corCidade"),
    uf:valorCampoCorreios("corUf").toUpperCase(),
    documento:valorCampoCorreios("corDocumento"),
    servico:valorCampoCorreios("corServico") || "PAC",
    data_postagem:valorCampoCorreios("corData"),
    peso:valorCampoCorreios("corPeso"),
    rastreio:valorCampoCorreios("corRastreio").toUpperCase(),
    itens:correiosItens.map(item=>({...item})),
    conteudo:correiosItens.map(item=>item.conteudo).filter(Boolean).join(", "),
    quantidade:correiosItens.reduce((total,item)=>total+Number(item.quantidade || 0),0),
    valor_declarado:totalCorreiosItens(),
    remetente_nome:valorCampoCorreios("corRemNome"),
    remetente_endereco:valorCampoCorreios("corRemEndereco"),
    remetente_bairro:valorCampoCorreios("corRemBairro"),
    remetente_cep:valorCampoCorreios("corRemCep"),
    remetente_cidade:valorCampoCorreios("corRemCidade"),
    remetente_uf:valorCampoCorreios("corRemUf").toUpperCase(),
    remetente_documento:valorCampoCorreios("corRemDocumento")
  };
}

function montarLogoQrCorreios(container){
  container.innerHTML=`
    <img class="cor-logo" src="${escaparHtmlEmail(logoEtiquetaUrl() || "")}" alt="Sofisticatto" onerror="this.style.display='none'">

    <div class="etiqueta-qr-texto">
      <div class="insta-vertical">I<br>N<br>S<br>T<br>A</div>
      <div class="gram-horizontal">G&nbsp;R&nbsp;A&nbsp;M</div>
    </div>

    <div class="etiqueta-qr"></div>`;

  const alvo=container.querySelector(".etiqueta-qr");
  if(!alvo) return;

  // Usa exatamente a mesma função, o mesmo link, o mesmo tamanho
  // e o mesmo formato visual da aba Etiquetas.
  montarQrEtiqueta(alvo);
}

function montarEtiquetaDestinoCorreios(){
  const d=dadosCorreios();
  const box=document.getElementById("corEtiquetaDestino");
  if(!box) return;

  montarLogoQrCorreios(box);
  const enderecoBase=String(d.endereco || "").trim();
  const numeroLimpo=String(d.numero || "").trim();
  const enderecoJaTemNumero=numeroLimpo && enderecoBase.toUpperCase().includes(numeroLimpo.toUpperCase());
  const endereco=[enderecoBase,enderecoJaTemNumero ? "" : numeroLimpo].filter(Boolean).join(", ");
  const enderecoCompleto=[endereco,d.complemento].filter(Boolean).join(" - ");
  box.insertAdjacentHTML("beforeend",`
    <div class="cor-destino">DESTINO:<br>${escaparHtmlEmail(d.cliente || "DESTINATÁRIO")}</div>
    <div class="cor-endereco">${escaparHtmlEmail(enderecoCompleto)}</div>
    <div class="cor-bairro">${d.bairro ? "BAIRRO: "+escaparHtmlEmail(d.bairro) : ""}</div>
    <div class="cor-cidade">${escaparHtmlEmail([d.cidade,d.uf].filter(Boolean).join("/"))}</div>
    <div class="cor-barcode-area">
      <svg class="cor-barcode"></svg>
      <div class="cor-cep">${d.cep ? "CEP: "+escaparHtmlEmail(formatarCepEtiqueta(d.cep)) : ""}</div>
    </div>
    <div class="cor-servico">${escaparHtmlEmail(d.servico)}</div>`);
  const barcodeDestino=box.querySelector(".cor-barcode");
  if(barcodeDestino && window.JsBarcode){
    JsBarcode(barcodeDestino,(d.cep || "").replace(/\D/g,"") || "00000000",{
      format:"CODE128",
      displayValue:false,
      margin:0,
      height:42,
      width:1.6,
      background:"#ffffff",
      lineColor:"#000000"
    });
    barcodeDestino.setAttribute("preserveAspectRatio","xMidYMid meet");
    barcodeDestino.setAttribute("width","272");
    barcodeDestino.setAttribute("height","53");
  }
  aplicarAjustesCorreiosEtiqueta(box,"destino");
}

function montarEtiquetaRemetenteCorreios(){
  const d=dadosCorreios();
  const box=document.getElementById("corEtiquetaRemetente");
  if(!box) return;

  montarLogoQrCorreios(box);
  box.insertAdjacentHTML("beforeend",`
    <div class="cor-rem-texto">
      <div class="cor-rem-label">REMETENTE:</div>
      <div>${escaparHtmlEmail(d.remetente_nome)}</div>
      <div>${escaparHtmlEmail(d.remetente_endereco)}</div>
      <div>${escaparHtmlEmail(d.remetente_bairro)}</div>
      <div>${escaparHtmlEmail([d.remetente_cidade,d.remetente_uf].filter(Boolean).join("/"))}</div>
    </div>
    <div class="cor-barcode-area">
      <svg class="cor-barcode"></svg>
      <div class="cor-cep">${d.remetente_cep ? "CEP: "+escaparHtmlEmail(formatarCepEtiqueta(d.remetente_cep)) : ""}</div>
    </div>
    <div class="cor-servico">${escaparHtmlEmail(d.servico)}</div>`);
  const barcodeRemetente=box.querySelector(".cor-barcode");
  if(barcodeRemetente && window.JsBarcode){
    JsBarcode(barcodeRemetente,(d.remetente_cep || "").replace(/\D/g,"") || "74550470",{
      format:"CODE128",
      displayValue:false,
      margin:0,
      height:42,
      width:1.6,
      background:"#ffffff",
      lineColor:"#000000"
    });
    barcodeRemetente.setAttribute("preserveAspectRatio","xMidYMid meet");
    barcodeRemetente.setAttribute("width","272");
    barcodeRemetente.setAttribute("height","53");
  }
  aplicarAjustesCorreiosEtiqueta(box,"remetente");
}

function dataExtensoCorreios(valor){
  const data=valor ? new Date(valor+"T12:00:00") : new Date();
  return {
    dia:String(data.getDate()).padStart(2,"0"),
    mes:data.toLocaleDateString("pt-BR",{month:"long"}),
    ano:String(data.getFullYear())
  };
}

function montarDeclaracaoCorreios(){
  const d=dadosCorreios();
  const box=document.getElementById("corDeclaracao");
  if(!box) return;
  const data=dataExtensoCorreios(d.data_postagem);
  const enderecoDest=[d.endereco,d.numero,d.complemento].filter(Boolean).join(", ");
  box.innerHTML=`
    <h1>DECLARAÇÃO DE CONTEÚDO</h1>
    <div class="cor-dec-duplo">
      <div class="cor-dec-box">
        <div class="cor-dec-titulo">REMETENTE</div>
        <div class="cor-dec-linha"><b>NOME:</b> ${escaparHtmlEmail(d.remetente_nome)}</div>
        <div class="cor-dec-linha"><b>ENDEREÇO:</b> ${escaparHtmlEmail(d.remetente_endereco)}</div>
        <div class="cor-dec-linha">${escaparHtmlEmail(d.remetente_bairro)}</div>
        <div class="cor-dec-linha"><b>CIDADE:</b> ${escaparHtmlEmail(d.remetente_cidade)} &nbsp; <b>UF:</b> ${escaparHtmlEmail(d.remetente_uf)}</div>
        <div class="cor-dec-linha"><b>CEP:</b> ${escaparHtmlEmail(d.remetente_cep)} &nbsp; <b>CPF/CNPJ:</b> ${escaparHtmlEmail(d.remetente_documento)}</div>
      </div>
      <div class="cor-dec-box">
        <div class="cor-dec-titulo">DESTINATÁRIO</div>
        <div class="cor-dec-linha"><b>NOME:</b> ${escaparHtmlEmail(d.cliente)}</div>
        <div class="cor-dec-linha"><b>ENDEREÇO:</b> ${escaparHtmlEmail(enderecoDest)}</div>
        <div class="cor-dec-linha">${escaparHtmlEmail(d.bairro)}</div>
        <div class="cor-dec-linha"><b>CIDADE:</b> ${escaparHtmlEmail(d.cidade)} &nbsp; <b>UF:</b> ${escaparHtmlEmail(d.uf)}</div>
        <div class="cor-dec-linha"><b>CEP:</b> ${escaparHtmlEmail(d.cep)} &nbsp; <b>CPF/CNPJ:</b> ${escaparHtmlEmail(d.documento)}</div>
      </div>
    </div>

    <table class="cor-dec-bens">
      <colgroup><col style="width:8%"><col style="width:50%"><col style="width:18%"><col style="width:24%"></colgroup>
      <thead><tr><th>ITEM</th><th>CONTEÚDO</th><th>QTD.</th><th>VALOR (R$)</th></tr></thead>
      <tbody>
        ${d.itens.map((item,indice)=>`
          <tr>
            <td style="text-align:center;">${String(indice+1).padStart(2,"0")}</td>
            <td>${escaparHtmlEmail(item.conteudo || "")}</td>
            <td style="text-align:center;">${Number(item.quantidade || 0)}</td>
            <td style="text-align:center;font-size:8.5px;">${item.valor ? "R$ "+numeroCorreios(item.valor).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : ""}</td>
          </tr>`).join("")}
        ${Array.from({length:Math.max(0,10-d.itens.length)},()=>'<tr><td></td><td></td><td></td><td></td></tr>').join("")}
        <tr>
          <td colspan="2" style="text-align:right;font-weight:700;">TOTAIS</td>
          <td style="text-align:center;font-weight:700;">${d.quantidade}</td>
          <td style="text-align:center;font-weight:700;font-size:8.5px;">R$ ${totalCorreiosItens().toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        </tr>
        <tr><td colspan="3" style="text-align:right;font-weight:700;">PESO TOTAL (kg)</td><td style="text-align:center;font-weight:700;">${escaparHtmlEmail(d.peso || "")}</td></tr>
      </tbody>
    </table>

    <div class="cor-dec-declaracao">
      <div style="text-align:center;font-weight:900;letter-spacing:4px;margin-bottom:9px;">DECLARAÇÃO</div>
      Declaro que não me enquadro no conceito de contribuinte previsto no art. 4º da Lei Complementar nº 87/1996, uma vez que não realizo, com habitualidade ou em volume que caracterize intuito comercial, operações de circulação de mercadoria, ainda que se iniciem no exterior, ou estou dispensado da emissão da nota fiscal por força da legislação tributária vigente, responsabilizando-me, nos termos da lei e a quem de direito, por informações inverídicas.<br><br>
      Declaro ainda que não estou postando conteúdo inflamável, explosivo, causador de combustão espontânea, tóxico, corrosivo, gás ou qualquer outro conteúdo que constitua perigo, conforme o art. 13 da Lei Postal nº 6.538/78.
      <div class="cor-dec-assinatura">
        <div class="cor-dec-data">
          ${escaparHtmlEmail(d.remetente_cidade)}, ${data.dia} de ${escaparHtmlEmail(data.mes)} de ${data.ano}
        </div>
        <div class="cor-dec-assinar">
          <div class="cor-dec-linha-assinatura"></div>
          <div class="cor-dec-texto-assinatura">Assinatura do Declarante/Remetente</div>
        </div>
      </div>
    </div>
    <div style="border:2px solid #111;margin-top:6px;padding:8px;"><b>OBSERVAÇÃO:</b><br>Constitui crime contra a ordem tributária suprimir ou reduzir tributo, ou contribuição social e qualquer acessório (Lei 8.137/90 Art. 1º, V).</div>`;
  aplicarAjustesCorreiosEtiqueta(box,"declaracao");
}

async function atualizarCorreiosTudo(){
  try{
    await carregarBibliotecasEtiqueta();
  }catch(erro){
    console.error("Não foi possível carregar as bibliotecas das etiquetas:",erro);
  }
  montarEtiquetaDestinoCorreios();
  montarEtiquetaRemetenteCorreios();
  montarDeclaracaoCorreios();
}

function mostrarPreviewCorreios(tipo){
  ["Destino","Remetente","Declaracao"].forEach(nome=>{
    document.getElementById("corPreview"+nome)?.classList.remove("ativo");
    document.getElementById("corTab"+nome)?.classList.remove("ativo");
  });
  const nome={destino:"Destino",remetente:"Remetente",declaracao:"Declaracao"}[tipo];
  document.getElementById("corPreview"+nome)?.classList.add("ativo");
  document.getElementById("corTab"+nome)?.classList.add("ativo");
}

function preencherListaClientesCorreios(){
  const lista=document.getElementById("corClientesLista");
  if(!lista) return;
  lista.innerHTML=emailClientes.map(item=>`<option value="${escaparHtmlEmail(item.nome || "")}"></option>`).join("");
}

function preencherCorreiosPeloCliente(){
  const nome=decodificarEntidadesXml(valorCampoCorreios("corCliente"));
  const nomeNormalizado=normalizarNomeEmail(nome);

  let cliente=emailClientes.find(item=>
    normalizarNomeEmail(decodificarEntidadesXml(item.nome || ""))===nomeNormalizado
  );

  if(!cliente){
    cliente=emailClientes.find(item=>{
      const cadastro=normalizarNomeEmail(decodificarEntidadesXml(item.nome || ""));
      return cadastro.includes(nomeNormalizado) || nomeNormalizado.includes(cadastro);
    });
  }

  if(!cliente){
    alert("Cliente não encontrado no cadastro. Verifique o nome digitado ou cadastre o cliente primeiro.");
    return;
  }

  document.getElementById("corCliente").value=decodificarEntidadesXml(cliente.nome || nome);
  document.getElementById("corEndereco").value=cliente.endereco || "";
  document.getElementById("corNumero").value=cliente.numero || "";
  document.getElementById("corComplemento").value=cliente.complemento || "";
  document.getElementById("corBairro").value=cliente.bairro || "";
  document.getElementById("corCep").value=formatarCepEtiqueta(cliente.cep || "");
  document.getElementById("corCidade").value=cliente.cidade || "";
  document.getElementById("corUf").value=(cliente.uf || "").toUpperCase();
  document.getElementById("corDocumento").value=cliente.cpf_cnpj || cliente.cnpj || cliente.cpf || "";

  atualizarCorreiosTudo();

  const possuiEndereco=!!(
    cliente.endereco || cliente.bairro || cliente.cep || cliente.cidade || cliente.uf
  );

  if(!possuiEndereco){
    alert("O cliente foi encontrado, mas ainda não possui endereço logístico cadastrado.");
  }else{
    mostrarAvisoEmail("Dados do cliente preenchidos com sucesso.",true);
  }
}

function inicializarModuloCorreios(){
  preencherListaClientesCorreios();
  const data=document.getElementById("corData");
  if(data && !data.value) data.value=new Date().toISOString().slice(0,10);
  atualizarCorreiosValoresAjuste();
  atualizarCorreiosTudo();
  carregarHistoricoCorreios();

  // A assinatura, a logo e a biblioteca do QR podem carregar depois da abertura.
  setTimeout(atualizarCorreiosTudo,600);
}

function clonarElementoCorreiosParaImpressao(elemento){
  const clone=elemento.cloneNode(true);

  // Converte canvas em imagem para não desaparecer na impressão.
  const canvasesOriginais=elemento.querySelectorAll("canvas");
  const canvasesClone=clone.querySelectorAll("canvas");

  canvasesOriginais.forEach((canvas,indice)=>{
    const correspondente=canvasesClone[indice];
    if(!correspondente) return;

    try{
      const imagem=document.createElement("img");
      imagem.src=canvas.toDataURL("image/png");
      imagem.alt="QR Code";
      imagem.style.display="block";
      imagem.style.width="100%";
      imagem.style.height="100%";
      imagem.style.objectFit="contain";
      correspondente.replaceWith(imagem);
    }catch(erro){
      console.error("Erro ao preparar canvas para impressão:",erro);
    }
  });

  return clone;
}

function estilosImpressaoCorreios(tipo){
  const base=`
    *{box-sizing:border-box}
    html,body{
      margin:0!important;
      padding:0!important;
      background:#fff!important;
      color:#000!important;
      width:100%!important;
      min-height:100%!important;
      overflow:visible!important;
      -webkit-print-color-adjust:exact!important;
      print-color-adjust:exact!important;
    }
    body{
      display:block!important;
      visibility:visible!important;
    }
    body *{
      visibility:visible!important;
    }
    img,svg,canvas{
      visibility:visible!important;
      opacity:1!important;
    }
  `;

  if(tipo==="etiqueta"){
    return base+`
      @page{size:150mm 100mm;margin:0}
      .correios-etiqueta{
        position:relative!important;
        display:block!important;
        width:150mm!important;
        height:100mm!important;
        min-width:150mm!important;
        min-height:100mm!important;
        max-width:150mm!important;
        max-height:100mm!important;
        margin:0!important;
        padding:0!important;
        overflow:hidden!important;
        background:#fff!important;
        color:#000!important;
        font-family:Arial,sans-serif!important;
        transform:none!important;
        box-shadow:none!important;
        border-radius:0!important;
      }
      .cor-logo{
        position:absolute!important;
        left:48mm!important;
        top:5mm!important;
        width:58mm!important;
        height:28mm!important;
        object-fit:contain!important;
      }
      .etiqueta-qr-texto{
        position:absolute!important;
        right:14mm!important;
        top:7mm!important;
        width:31mm!important;
        height:27mm!important;
        font-weight:900!important;
        color:#000!important;
        line-height:1!important;
        z-index:7!important;
      }
      .insta-vertical{
        position:absolute!important;
        left:0!important;
        top:0!important;
        width:6mm!important;
        font-size:4mm!important;
        line-height:1.08!important;
        text-align:center!important;
      }
      .gram-horizontal{
        position:absolute!important;
        left:0!important;
        bottom:0!important;
        width:31mm!important;
        font-size:4mm!important;
        letter-spacing:1.05mm!important;
        white-space:nowrap!important;
      }
      .etiqueta-qr{
        position:absolute!important;
        right:16mm!important;
        top:8mm!important;
        width:22mm!important;
        height:22mm!important;
        overflow:hidden!important;
        background:#fff!important;
        z-index:6!important;
      }
      .etiqueta-qr img,.etiqueta-qr canvas{
        width:100%!important;
        height:100%!important;
        display:block!important;
        object-fit:contain!important;
      }
      .cor-destino{
        position:absolute!important;
        left:7mm!important;
        top:35mm!important;
        width:115mm!important;
        max-height:15mm!important;
        overflow:hidden!important;
        font-size:6.2mm!important;
        font-weight:900!important;
        line-height:1.08!important;
        white-space:normal!important;
        word-break:break-word!important;
      }
      .cor-endereco{
        position:absolute!important;
        left:7mm!important;
        top:52mm!important;
        width:112mm!important;
        max-height:10mm!important;
        overflow:hidden!important;
        font-size:4.6mm!important;
        font-weight:700!important;
        line-height:1.12!important;
        white-space:normal!important;
        word-break:break-word!important;
      }
      .cor-bairro{
        position:absolute!important;
        left:7mm!important;
        top:63mm!important;
        width:112mm!important;
        max-height:7mm!important;
        overflow:hidden!important;
        font-size:4.6mm!important;
        font-weight:700!important;
        line-height:1.08!important;
        white-space:nowrap!important;
        text-overflow:ellipsis!important;
      }
      .cor-cidade{
        position:absolute!important;
        left:7mm!important;
        top:68mm!important;
        width:112mm!important;
        max-height:6mm!important;
        overflow:hidden!important;
        font-size:4.6mm!important;
        font-weight:700!important;
        line-height:1.05!important;
        white-space:nowrap!important;
        text-overflow:ellipsis!important;
      }
      .cor-rem-texto{
        position:absolute!important;
        left:8mm!important;
        top:34mm!important;
        width:87mm!important;
        max-height:43mm!important;
        font-size:6mm!important;
        line-height:1.45!important;
        overflow:hidden!important;
      }
      .cor-rem-label{font-size:4mm!important;font-weight:700!important}
      .cor-barcode-area{
        position:absolute!important;
        left:7mm!important;
        bottom:2.5mm!important;
        width:72mm!important;
        height:18mm!important;
        display:flex!important;
        flex-direction:column!important;
        align-items:center!important;
        justify-content:flex-end!important;
        background:#fff!important;
        z-index:6!important;
      }
      .cor-barcode{
        position:static!important;
        display:block!important;
        width:68mm!important;
        height:11mm!important;
        max-width:68mm!important;
        max-height:11mm!important;
        background:#fff!important;
      }
      .cor-cep{
        position:static!important;
        width:68mm!important;
        margin-top:1mm!important;
        text-align:center!important;
        font-size:4mm!important;
        font-weight:900!important;
        line-height:1!important;
        white-space:nowrap!important;
      }
      .cor-servico{
        position:absolute!important;
        right:12mm!important;
        bottom:8mm!important;
        font-size:22mm!important;
        font-weight:900!important;
        line-height:1!important;
      }
    `;
  }

  return base+`
    @page{size:A4 portrait;margin:8mm}
    .correios-declaracao{
      display:block!important;
      width:194mm!important;
      max-width:194mm!important;
      min-height:281mm!important;
      margin:0 auto!important;
      padding:5mm!important;
      overflow:hidden!important;
      background:#fff!important;
      color:#000!important;
      font-family:Arial,sans-serif!important;
      box-shadow:none!important;
      border-radius:0!important;
      transform:none!important;
    }
    .correios-declaracao h1{
      text-align:center!important;
      border:2px solid #111!important;
      padding:8px!important;
      margin:0 0 6px!important;
      font-size:20px!important;
    }
    .cor-dec-duplo{
      display:grid!important;
      grid-template-columns:1fr 1fr!important;
    }
    .cor-dec-box{border:2px solid #111!important;padding:0!important}
    .cor-dec-box+.cor-dec-box{border-left:0!important}
    .cor-dec-titulo{
      text-align:center!important;
      font-weight:900!important;
      letter-spacing:4px!important;
      border-bottom:1px solid #111!important;
      padding:5px!important;
    }
    .cor-dec-linha{
      min-height:23px!important;
      border-bottom:1px solid #111!important;
      padding:5px!important;
    }
    .cor-dec-linha:last-child{border-bottom:0!important}
    .cor-dec-bens{
      width:100%!important;
      max-width:100%!important;
      table-layout:fixed!important;
      border-collapse:collapse!important;
      margin-top:6px!important;
    }
    .cor-dec-bens th,.cor-dec-bens td{
      border:1px solid #111!important;
      padding:3px 2px!important;
      height:24px!important;
      font-size:inherit!important;
      line-height:1.1!important;
      overflow:hidden!important;
      word-break:break-word!important;
      white-space:normal!important;
    }
    .cor-dec-bens th{text-align:center!important}
    .cor-dec-declaracao{
      border:2px solid #111!important;
      margin-top:6px!important;
      padding:10px!important;
      line-height:1.35!important;
      text-align:justify!important;
    }
    .cor-dec-assinatura{
      display:grid!important;
      grid-template-columns:1fr 1fr!important;
      gap:20px!important;
      margin-top:28px!important;
      align-items:start!important;
    }
    .cor-dec-data{text-align:left!important;padding-top:2px!important}
    .cor-dec-assinar{text-align:center!important}
    .cor-dec-linha-assinatura{
      border-top:1px solid #111!important;
      width:100%!important;
      margin-bottom:4px!important;
    }
    .cor-dec-texto-assinatura{
      font-size:9px!important;
      line-height:1.2!important;
    }
  `;
}

async function esperarImagensCorreios(container){
  const imagens=Array.from(container.querySelectorAll("img"));
  await Promise.all(imagens.map(imagem=>{
    if(imagem.complete && imagem.naturalWidth>0) return Promise.resolve();

    return new Promise(resolve=>{
      const finalizar=()=>resolve();
      imagem.addEventListener("load",finalizar,{once:true});
      imagem.addEventListener("error",finalizar,{once:true});
      setTimeout(finalizar,3000);
    });
  }));
}

async function abrirJanelaImpressaoCorreios(elemento,tipo,titulo){
  const janela=window.open("","_blank","width=1050,height=780");
  if(!janela){
    alert("Permita pop-ups para imprimir.");
    return;
  }

  const clone=clonarElementoCorreiosParaImpressao(elemento);
  const css=estilosImpressaoCorreios(tipo);

  janela.document.open();
  janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
  <style>${css}</style>
</head>
<body></body>
</html>`);
  janela.document.close();

  janela.document.body.appendChild(janela.document.importNode(clone,true));

  await esperarImagensCorreios(janela.document.body);
  await new Promise(resolve=>{
    janela.requestAnimationFrame(()=>{
      janela.requestAnimationFrame(()=>{
        setTimeout(resolve,900);
      });
    });
  });

  janela.focus();
  janela.print();
}

async function imprimirEtiquetaCorreios(tipo){
  await atualizarCorreiosTudo();

  const id=tipo==="destino" ? "corEtiquetaDestino" : "corEtiquetaRemetente";
  const elemento=document.getElementById(id);

  if(!elemento){
    alert("Não foi possível localizar a etiqueta para impressão.");
    return;
  }

  await abrirJanelaImpressaoCorreios(
    elemento,
    "etiqueta",
    tipo==="destino" ? "Etiqueta do Destinatário" : "Etiqueta do Remetente"
  );
}

async function imprimirDeclaracaoCorreios(){
  await atualizarCorreiosTudo();

  const elemento=document.getElementById("corDeclaracao");
  if(!elemento){
    alert("Não foi possível localizar a Declaração de Conteúdo.");
    return;
  }

  const declaracaoParaImprimir=elemento.cloneNode(true);
  const tamanhoAtual=Math.max(
    7,
    10 + Number(correiosAjustesTamanho.declaracao || 0)
  );

  declaracaoParaImprimir.style.fontSize=`${tamanhoAtual}px`;

  declaracaoParaImprimir.querySelectorAll(
    ".cor-dec-bens th,.cor-dec-bens td,.cor-dec-linha,.cor-dec-declaracao,.cor-dec-data,.cor-dec-texto-assinatura"
  ).forEach(item=>{
    item.style.fontSize="inherit";
  });

  await abrirJanelaImpressaoCorreios(
    declaracaoParaImprimir,
    "declaracao",
    "Declaração de Conteúdo"
  );
}

async function imprimirPacoteCorreios(){
  await imprimirEtiquetaCorreios("destino");
  await new Promise(resolve=>setTimeout(resolve,700));
  await imprimirEtiquetaCorreios("remetente");
  await new Promise(resolve=>setTimeout(resolve,700));
  await imprimirDeclaracaoCorreios();
}

async function salvarEnvioCorreios(){
  if(!bancoPronto()) return;
  const d=dadosCorreios();
  if(!d.cliente || !d.endereco || !d.cep || !d.cidade || !d.uf){
    alert("Preencha cliente, endereço, CEP, cidade e UF.");
    return;
  }
  const resposta=await banco.from("correios_envios").insert([{
    cliente_nome:d.cliente,endereco:d.endereco,numero:d.numero,complemento:d.complemento,
    bairro:d.bairro,cep:d.cep,cidade:d.cidade,uf:d.uf,cpf_cnpj:d.documento,
    servico:d.servico,data_postagem:d.data_postagem,peso_kg:d.peso ? Number(String(d.peso).replace(",",".")) : null,
    codigo_rastreio:d.rastreio,conteudo:d.conteudo,quantidade:d.quantidade,
    valor_declarado:d.valor_declarado ? Number(String(d.valor_declarado).replace(".","").replace(",",".")) : null,
    criado_por:usuarioAtual?.username || null
  }]).select().single();
  if(resposta.error){alert("Erro ao salvar postagem: "+resposta.error.message);return;}
  mostrarAvisoEmail("Postagem dos Correios salva com sucesso.",true);
  carregarHistoricoCorreios();
}

async function carregarHistoricoCorreios(){
  if(!bancoPronto()) return;
  const resposta=await banco.from("correios_envios").select("*").order("created_at",{ascending:false}).limit(200);
  if(resposta.error){console.error(resposta.error);return;}
  correiosHistorico=resposta.data || [];
  const tbody=document.getElementById("corTabelaHistorico");
  if(!tbody) return;
  tbody.innerHTML=correiosHistorico.length ? correiosHistorico.map(item=>`
    <tr>
      <td>${formatarDataHoraEmail(item.data_postagem || item.created_at)}</td>
      <td>${escaparHtmlEmail(item.cliente_nome || "")}</td>
      <td>${escaparHtmlEmail(item.cep || "")}</td>
      <td>${escaparHtmlEmail(item.servico || "")}</td>
      <td>${item.peso_kg ?? ""}</td>
      <td>${escaparHtmlEmail(item.codigo_rastreio || "")}</td>
      <td>
        <button class="btn azul" onclick="reutilizarEnvioCorreios('${item.id}')">Usar</button>
        <button class="btn vermelho" onclick="excluirEnvioCorreios('${item.id}')">Excluir</button>
      </td>
    </tr>`).join("") : '<tr><td colspan="7">Nenhuma postagem salva.</td></tr>';
}

function reutilizarEnvioCorreios(id){
  const item=correiosHistorico.find(reg=>reg.id===id);
  if(!item) return;
  const mapa={
    corCliente:item.cliente_nome,corEndereco:item.endereco,corNumero:item.numero,
    corComplemento:item.complemento,corBairro:item.bairro,corCep:item.cep,
    corCidade:item.cidade,corUf:item.uf,corDocumento:item.cpf_cnpj,
    corServico:item.servico,corData:item.data_postagem,corPeso:item.peso_kg,
    corRastreio:item.codigo_rastreio
  };
  Object.entries(mapa).forEach(([idCampo,valor])=>{const el=document.getElementById(idCampo);if(el)el.value=valor ?? "";});
  correiosItens=[{
    id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    conteudo:item.conteudo || "COSMÉTICOS",
    quantidade:Number(item.quantidade || 1),
    valor:item.valor_declarado ? Number(item.valor_declarado).toLocaleString("pt-BR",{minimumFractionDigits:2}) : ""
  }];
  montarItensCorreios();
  atualizarCorreiosTudo();
  window.scrollTo({top:0,behavior:"smooth"});
}

async function excluirEnvioCorreios(id){
  if(!confirm("Excluir esta postagem do histórico?")) return;
  const resposta=await banco.from("correios_envios").delete().eq("id",id);
  if(resposta.error){alert(resposta.error.message);return;}
  carregarHistoricoCorreios();
}

function limparCorreios(){
  ["corCliente","corEndereco","corNumero","corComplemento","corBairro","corCep","corCidade","corUf",
   "corDocumento","corPeso","corRastreio","corValor"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  document.getElementById("corServico").value="PAC";
  correiosItens=[{id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),conteudo:"COSMÉTICOS",quantidade:1,valor:""}];
  montarItensCorreios();
  document.getElementById("corData").value=new Date().toISOString().slice(0,10);
  atualizarCorreiosTudo();
}
