const {
  json,exigirAdmin,supabaseRest,descriptografar
}=require("./_utils");

const SOMENTE_NUMEROS=valor=>String(valor||"").replace(/\D/g,"");

async function obterIntegracaoRodonaves(){
  const dados=await supabaseRest("transportadora_integracoes",{
    query:"?select=*&transportadora_nome=ilike.*Rodonaves*&limit=1"
  });
  if(!dados?.[0])throw new Error("Integração Rodonaves não encontrada no Motor de Integrações.");
  return dados[0];
}

async function obterCredenciais(conviteId){
  const dados=await supabaseRest("integracao_credenciais",{
    query:`?select=*&convite_id=eq.${encodeURIComponent(conviteId)}&ambiente=eq.homologacao&limit=1`
  });
  if(!dados?.[0])throw new Error("Credenciais de homologação da Rodonaves não cadastradas.");
  const cred=descriptografar(dados[0]);
  if(!cred.username||!cred.password)throw new Error("Usuário ou senha da Rodonaves não cadastrado.");
  return cred;
}

async function gerarToken(baseUrl,cred){
  const params=new URLSearchParams();
  params.set("auth_type","DEV");
  params.set("grant_type","password");
  params.set("username",cred.username);
  params.set("password",cred.password);
  params.set("companyId","1");

  const resposta=await fetch(baseUrl,{
    method:"POST",
    headers:{
      "Content-Type":"application/x-www-form-urlencoded",
      "Accept":"application/json"
    },
    body:params.toString()
  });

  const texto=await resposta.text();
  let dados={};
  try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}

  if(!resposta.ok||!dados.access_token){
    throw new Error(
      dados.error_description||
      dados.error||
      `Falha ao gerar token em ${baseUrl}: HTTP ${resposta.status}`
    );
  }
  return dados.access_token;
}

async function consultarCidadePorCep(cep,token){
  const cache=await supabaseRest("rodonaves_cidades_cache",{
    query:`?select=*&cep=eq.${encodeURIComponent(cep)}&limit=1`
  });
  if(cache?.[0]?.cidade_id)return cache[0];

  const url=`https://dne-api.rte.com.br/api/cities/byzipcode?zipCode=${encodeURIComponent(cep)}`;
  const resposta=await fetch(url,{
    headers:{
      "Accept":"application/json",
      "Authorization":`Bearer ${token}`
    }
  });
  const texto=await resposta.text();
  let dados={};
  try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}

  if(!resposta.ok){
    throw new Error(
      dados?.[0]?.Message||
      dados?.Message||
      `CEP ${cep} não localizado pela Rodonaves (HTTP ${resposta.status}).`
    );
  }

  const cidadeId=Number(dados.Id||dados.id||dados.CityId||dados.cityId);
  if(!cidadeId)throw new Error(`A Rodonaves não retornou o ID da cidade para o CEP ${cep}.`);

  const registro={
    cep,
    cidade_id:cidadeId,
    cidade: dados.Description||dados.description||null,
    uf: dados.UnitFederation||dados.unitFederation||null,
    resposta:dados,
    atualizado_em:new Date().toISOString()
  };

  try{
    await supabaseRest("rodonaves_cidades_cache",{
      method:"POST",
      query:"?on_conflict=cep",
      body:registro
    });
  }catch(erroCache){
    console.warn("Cache de cidade:",erroCache.message);
  }

  return registro;
}

function extrairErro(dados){
  if(Array.isArray(dados)&&dados[0]){
    return dados[0].Message||dados[0].message||JSON.stringify(dados[0]);
  }
  return dados?.Message||dados?.message||dados?.erro||dados?.error||null;
}

function erroDestinatarioNaoEncontrado(dados){
  const msg=String(extrairErro(dados)||"").toLowerCase();
  return msg.includes("cliente destinat") && msg.includes("não encontr");
}
function esperar(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

function separarEndereco(entrada){
  let logradouro=String(entrada.logradouro_destino||"").trim();
  let numero=String(entrada.numero_destino||"").trim();
  let complemento=String(entrada.complemento_destino||"").trim();
  const completo=String(entrada.endereco_destino||"").trim();

  if(!logradouro && completo){
    const partes=completo.split(",").map(x=>x.trim()).filter(Boolean);
    logradouro=partes[0]||"";
    if(!numero && partes[1] && /\d/.test(partes[1])){
      numero=(partes[1].match(/\d+[A-Za-z0-9\-\/]*/)||[])[0]||partes[1];
    }
    if(!complemento && partes.length>2) complemento=partes.slice(2).join(", ");
  }
  return {logradouro,numero,complemento};
}

async function cadastrarDestinatarioRodonaves(entrada,cred,conviteId,transportadoraNome){
  const documento=SOMENTE_NUMEROS(entrada.cpf_cnpj_destino);
  const cep=SOMENTE_NUMEROS(entrada.cep_destino);
  const telefone=SOMENTE_NUMEROS(entrada.telefone_destino);
  const {logradouro,numero,complemento}=separarEndereco(entrada);

  const cadastro={
    Description:String(entrada.cliente_nome||"").trim(),
    TaxIdRegistration:documento,
    EstadualIdRegistration:String(entrada.inscricao_estadual_destino||"").trim(),
    Email:String(entrada.email_destino||"").trim(),
    Phone:telefone,
    ZipCode:cep,
    Street:logradouro,
    Number:numero,
    Supplement:complemento,
    District:String(entrada.bairro_destino||"").trim(),
    City:String(entrada.cidade_destino||"").trim(),
    UnitFederation:String(entrada.uf_destino||"").trim().toUpperCase()
  };

  const obrigatorios={
    cliente_nome:cadastro.Description,email:cadastro.Email,telefone:cadastro.Phone,
    cep:cadastro.ZipCode,logradouro:cadastro.Street,numero:cadastro.Number,
    bairro:cadastro.District,cidade:cadastro.City,uf:cadastro.UnitFederation
  };
  const faltantes=Object.entries(obrigatorios)
    .filter(([,v])=>!String(v||"").trim()).map(([k])=>k);

  if(faltantes.length){
    const erro=new Error(
      "O destinatário não existe na Rodonaves e faltam dados para cadastrá-lo automaticamente: "+
      faltantes.join(", ")+". Complete o cadastro do cliente no Portal Sofisticatto e tente novamente."
    );
    erro.codigo="DESTINATARIO_DADOS_INCOMPLETOS";
    erro.campos_faltantes=faltantes;
    throw erro;
  }

  const tokenCustomer=await gerarToken("https://customer-apigateway.rte.com.br/token",cred);
  const resposta=await fetch("https://customer-apigateway.rte.com.br/api/v1/customer/savecustomer",{
    method:"POST",
    headers:{
      "Accept":"application/json","Content-Type":"application/json",
      "Authorization":`Bearer ${tokenCustomer}`
    },
    body:JSON.stringify(cadastro)
  });
  const texto=await resposta.text();
  let dados={};
  try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}

  if(!resposta.ok){
    const erro=new Error(extrairErro(dados)||`Não foi possível cadastrar o destinatário (HTTP ${resposta.status}).`);
    erro.codigo="FALHA_CADASTRO_DESTINATARIO";
    erro.resposta=dados;
    throw erro;
  }

  try{
    await supabaseRest("integracao_logs",{method:"POST",body:{
      convite_id:conviteId,transportadora_nome:transportadoraNome,
      operacao:"cadastro_destinatario",ambiente:"homologacao",
      http_status:resposta.status,sucesso:true,
      mensagem:`Destinatário ${documento} cadastrado/atualizado automaticamente`,
      resposta_resumida:{
        documento,
        customer_id:dados.CustomerId??dados.customerId??null,
        person_id:dados.PersonId??dados.personId??null
      }
    }});
  }catch{}

  return dados;
}

async function executarCotacaoRodonaves(payload,tokenCotacao){
  const resposta=await fetch("https://quotation-apigateway.rte.com.br/api/v1/gera-cotacao",{
    method:"POST",
    headers:{
      "Accept":"application/json","Content-Type":"application/json",
      "Authorization":`Bearer ${tokenCotacao}`
    },
    body:JSON.stringify(payload)
  });
  const texto=await resposta.text();
  let dados={};
  try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}
  return {resposta,dados};
}

module.exports=async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;

  const inicio=Date.now();
  let conviteId=null;
  let transportadoraNome="Rodonaves";

  try{
    const entrada=req.body||{};
    const documento=SOMENTE_NUMEROS(entrada.cpf_cnpj_destino);
    const cepDestino=SOMENTE_NUMEROS(entrada.cep_destino);
    const cepOrigem="74550470";
    const cnpjOrigem="05451985000195";

    if(documento.length<11)throw new Error("CNPJ/CPF do destinatário inválido.");
    if(cepDestino.length!==8)throw new Error("CEP de destino inválido.");
    if(!Number(entrada.peso_total))throw new Error("Peso total obrigatório.");
    if(!Number(entrada.valor_nf))throw new Error("Valor da NF obrigatório.");
    if(!Number(entrada.volumes))throw new Error("Quantidade de volumes obrigatória.");

    const integracao=await obterIntegracaoRodonaves();
    conviteId=integracao.convite_id;
    transportadoraNome=integracao.transportadora_nome||transportadoraNome;
    const cred=await obterCredenciais(conviteId);

    // Cada API Rodonaves possui token próprio.
    const [tokenCotacao,tokenDne]=await Promise.all([
      gerarToken("https://quotation-apigateway.rte.com.br/token",cred),
      gerarToken("https://dne-api.rte.com.br/token",cred)
    ]);

    const [origem,destino]=await Promise.all([
      consultarCidadePorCep(cepOrigem,tokenDne),
      consultarCidadePorCep(cepDestino,tokenDne)
    ]);

    const enviarPacks=entrada.enviar_packs===true;
    let packs=[];

    if(enviarPacks){
      const volumes=Number(entrada.volumes);
      const pesoTotal=Number(entrada.peso_total);
      const altura=Number(entrada.altura_cm);
      const largura=Number(entrada.largura_cm);
      const comprimento=Number(entrada.comprimento_cm);
      const pesoUnitario=Number(entrada.peso_unitario)||(pesoTotal/volumes);

      if(!volumes||!pesoUnitario||!altura||!largura||!comprimento){
        throw new Error("Para enviar Packs, informe volumes, peso e todas as dimensões.");
      }

      const modoPacks=entrada.modo_packs==="individual"?"individual":"agrupado";
      const pacote={
        AmountPackages:modoPacks==="agrupado"?volumes:1,
        Weight:Number(pesoUnitario.toFixed(3)),
        Length:Number(comprimento.toFixed(3)),
        Height:Number(altura.toFixed(3)),
        Width:Number(largura.toFixed(3))
      };
      packs=modoPacks==="agrupado"
        ? [pacote]
        : Array.from({length:volumes},()=>({...pacote}));
    }

    const payload={
      OriginZipCode:cepOrigem,
      OriginCityId:Number(origem.cidade_id),
      DestinationZipCode:cepDestino,
      DestinationCityId:Number(destino.cidade_id),
      TotalWeight:Number(entrada.peso_total),
      EletronicInvoiceValue:Number(entrada.valor_nf),
      CustomerTaxIdRegistration:cnpjOrigem,
      ReceiverCpfcnp:documento,
      Packs:packs,
      ContactName:String(entrada.solicitante||"Johnny").slice(0,100),
      ContactPhoneNumber:"6232930035",
      TotalPackages:Number(entrada.volumes)
    };

    let clienteCadastradoAutomaticamente=false;
    let cadastroClienteResposta=null;

    let tentativaCotacao=await executarCotacaoRodonaves(payload,tokenCotacao);
    let resposta=tentativaCotacao.resposta;
    let dados=tentativaCotacao.dados;

    if(!resposta.ok && erroDestinatarioNaoEncontrado(dados)){
      cadastroClienteResposta=await cadastrarDestinatarioRodonaves(
        entrada,cred,conviteId,transportadoraNome
      );
      clienteCadastradoAutomaticamente=true;

      const esperas=[500,1500,3000];
      for(let i=0;i<esperas.length;i++){
        await esperar(esperas[i]);
        tentativaCotacao=await executarCotacaoRodonaves(payload,tokenCotacao);
        resposta=tentativaCotacao.resposta;
        dados=tentativaCotacao.dados;
        if(resposta.ok || !erroDestinatarioNaoEncontrado(dados))break;
      }
    }

    const tempo=Date.now()-inicio;

    if(!resposta.ok){
      const erro=extrairErro(dados)||`Rodonaves retornou HTTP ${resposta.status}.`;

      await supabaseRest("integracao_logs",{
        method:"POST",
        body:{
          convite_id:conviteId,
          transportadora_nome:transportadoraNome,
          operacao:"cotacao",
          ambiente:"homologacao",
          http_status:resposta.status,
          tempo_ms:tempo,
          sucesso:false,
          mensagem:erro,
          resposta_resumida:dados
        }
      });

      return json(res,502,{ok:false,erro,resposta:dados});
    }

    const valor=Number(
      dados.Value??
      dados.value??
      dados.FreightValue??
      dados.freightValue??
      dados.Freight??
      dados.freight??
      0
    );

    const prazo=Number(
      dados.DeliveryTime??
      dados.deliveryTime??
      dados.ExpectedDeliveryDays??
      dados.expectedDeliveryDays??
      0
    );

    const protocolo=String(
      dados.ProtocolNumber??
      dados.protocolNumber??
      dados.ProtocolId??
      dados.protocolId??
      ""
    );

    const registro={
      cotacao_id:entrada.cotacao_id||null,
      convite_id:conviteId,
      cliente_nome:entrada.cliente_nome||null,
      cpf_cnpj_destino:documento,
      cep_origem:cepOrigem,
      cidade_origem_id:origem.cidade_id,
      cep_destino:cepDestino,
      cidade_destino_id:destino.cidade_id,
      peso_total:Number(entrada.peso_total)||null,
      volumes:Number(entrada.volumes)||null,
      altura_cm:Number(entrada.altura_cm)||null,
      largura_cm:Number(entrada.largura_cm)||null,
      comprimento_cm:Number(entrada.comprimento_cm)||null,
      peso_unitario:Number(entrada.peso_unitario)||null,
      cubagem_total:Number(entrada.cubagem_total)||null,
      packs_enviados:enviarPacks,
      packs_modo:enviarPacks?(entrada.modo_packs==="individual"?"individual":"agrupado"):null,
      packs_quantidade:packs.length,
      packs_payload:packs,
      embalagem:entrada.embalagem||null,
      servico:entrada.servico||null,
      valor_frete:valor||null,
      prazo_dias:prazo||null,
      numero_cotacao:protocolo||null,
      payload_enviado:payload,
      resposta_recebida:dados,
      sucesso:true,
      created_at:new Date().toISOString()
    };

    try{
      await supabaseRest("rodonaves_cotacoes_api",{method:"POST",body:registro});
    }catch(erroHistorico){
      console.warn("Histórico Rodonaves:",erroHistorico.message);
    }

    await supabaseRest("integracao_logs",{
      method:"POST",
      body:{
        convite_id:conviteId,
        transportadora_nome:transportadoraNome,
        operacao:"cotacao",
        ambiente:"homologacao",
        http_status:resposta.status,
        tempo_ms:tempo,
        sucesso:true,
        mensagem:"Cotação gerada com sucesso",
        resposta_resumida:{
          valor_frete:valor,
          prazo_dias:prazo,
          numero_cotacao:protocolo
        }
      }
    });

    return json(res,200,{
      ok:true,
      numero_cotacao:protocolo,
      valor_frete:valor,
      prazo_dias:prazo,
      cidade_origem:origem.cidade,
      cidade_destino:destino.cidade,
      tempo_ms:tempo,
      packs_enviados:enviarPacks,
      modo_packs:enviarPacks?(entrada.modo_packs==="individual"?"individual":"agrupado"):null,
      quantidade_packs:packs.length,
      cliente_cadastrado_automaticamente:clienteCadastradoAutomaticamente,
      cadastro_cliente_resposta:clienteCadastradoAutomaticamente?cadastroClienteResposta:null,
      resposta:dados,
      aviso:enviarPacks
        ? "As dimensões foram enviadas em Packs. Compare esta cotação com o Portal Rodonaves antes de validar a cubagem."
        : "A cotação foi enviada com Packs vazio. Ative o envio somente para o teste controlado de cubagem."
    });
  }catch(erro){
    const tempo=Date.now()-inicio;
    console.error("cotar-rodonaves:",erro);

    if(conviteId){
      try{
        await supabaseRest("integracao_logs",{
          method:"POST",
          body:{
            convite_id:conviteId,
            transportadora_nome:transportadoraNome,
            operacao:"cotacao",
            ambiente:"homologacao",
            tempo_ms:tempo,
            sucesso:false,
            mensagem:erro.message
          }
        });
      }catch{}
    }

    if(erro.codigo==="DESTINATARIO_DADOS_INCOMPLETOS"){
      return json(res,422,{
        ok:false,codigo:erro.codigo,erro:erro.message,
        campos_faltantes:erro.campos_faltantes||[]
      });
    }
    return json(res,500,{
      ok:false,codigo:erro.codigo||null,erro:erro.message,
      resposta:erro.resposta||null
    });
  }
};
