const {
  json,exigirAdmin,supabaseRest,descriptografar
}=require("./_utils");

async function obterIntegracao(){
  const dados=await supabaseRest("transportadora_integracoes",{
    query:"?select=*&transportadora_nome=ilike.*Rodonaves*&limit=1"
  });
  if(!dados?.[0])throw new Error("Integração Rodonaves não encontrada.");
  return dados[0];
}
async function obterCredenciais(conviteId){
  const dados=await supabaseRest("integracao_credenciais",{
    query:`?select=*&convite_id=eq.${encodeURIComponent(conviteId)}&ambiente=eq.homologacao&limit=1`
  });
  if(!dados?.[0])throw new Error("Credenciais da Rodonaves não cadastradas.");
  return descriptografar(dados[0]);
}
async function tokenPickup(cred){
  const body=new URLSearchParams({
    auth_type:"DEV",grant_type:"password",
    username:cred.username,password:cred.password,companyId:"1"
  });
  const r=await fetch("https://pickup-apigateway.rte.com.br/token",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
    body:body.toString()
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||`Falha no token Pickup: HTTP ${r.status}`);
  return d.access_token;
}
function somenteNumeros(v){return String(v||"").replace(/\D/g,"")}
function parseCidadeUf(v){
  const texto=String(v||"");
  const partes=texto.split(/[\/-]/).map(x=>x.trim()).filter(Boolean);
  return {cidade:partes[0]||texto,uf:(partes[1]||"").slice(0,2).toUpperCase()};
}
function medidas(v){
  const n=String(v||"").replace(/,/g,".").match(/\d+(?:\.\d+)?/g)||[];
  return {Height:Number(n[0]||0),Width:Number(n[1]||0),Length:Number(n[2]||0)};
}
function pick(o,...ks){for(const k of ks)if(o?.[k]!==undefined&&o?.[k]!==null&&o?.[k]!=="")return o[k];return null}

module.exports=async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;

  const inicio=Date.now();
  let conviteId=null;
  try{
    const e=req.body||{};
    const origem=e.origem||{},destino=e.destino||{},carga=e.carga||{};
    const origemCnpj=somenteNumeros(origem.cnpj);
    const destinoDoc=somenteNumeros(destino.cnpj);
    const protocolo=String(e.protocolo_referencia||"");
    if(origemCnpj.length!==14)throw new Error("CNPJ da origem inválido.");
    if(somenteNumeros(origem.cep).length!==8)throw new Error("CEP da origem inválido.");
    if(!origem.logradouro||!origem.numero||!origem.bairro||!origem.cidade||!origem.uf)throw new Error("Endereço alternativo incompleto.");
    if(!carga.volumes||!carga.peso)throw new Error("Volumes e peso são obrigatórios.");

    const integracao=await obterIntegracao();
    conviteId=integracao.convite_id;
    const cred=await obterCredenciais(conviteId);
    const token=await tokenPickup(cred);
    const destinoCidade=parseCidadeUf(destino.cidade_uf);
    const med=medidas(carga.medidas);
    const pesoUnitario=Number(carga.peso)/Number(carga.volumes);

    // Estrutura da solicitação completa. O protocolo é mantido como referência externa.
    const telefoneContato=somenteNumeros(origem.telefone);
    const pessoaOrigem=origemCnpj.length===14?2:1;
    const pessoaDestino=destinoDoc.length===14?2:1;

    const payload={
      CustomerTaxIdRegistration:origemCnpj,
      ContactName:origem.nome||"Johnny",
      ContactPhoneNumber:telefoneContato,

      Sender:{
        TaxIdRegistration:origemCnpj,
        Name:origem.razao_social||origem.nome,
        Person:pessoaOrigem,
        UnitFederation:String(origem.uf).toUpperCase()
      },

      Recipient:{
        TaxIdRegistration:destinoDoc,
        Name:destino.razao_social||"Destinatário",
        Person:pessoaDestino,
        UnitFederation:destinoCidade.uf
      },

      Payer:{
        TaxIdRegistration:origemCnpj,
        Name:origem.razao_social||origem.nome,
        Person:pessoaOrigem,
        UnitFederation:String(origem.uf).toUpperCase()
      },

      PickupAddress:{
        Cep:somenteNumeros(origem.cep),
        Address:origem.logradouro,
        Number:String(origem.numero),
        Complement:origem.complemento||"",
        District:origem.bairro,
        City:origem.cidade,
        UnitFederation:String(origem.uf).toUpperCase(),
        Reference:origem.referencia||""
      },

      DestinationAddress:{
        Cep:somenteNumeros(destino.cep),
        Address:destino.logradouro||"",
        Number:String(destino.numero||""),
        Complement:destino.complemento||"",
        District:destino.bairro||"",
        City:destinoCidade.cidade,
        UnitFederation:destinoCidade.uf
      },

      PackInformation:{
        AmountPackages:Number(carga.volumes),
        Weight:Number(pesoUnitario.toFixed(3)),
        Length:med.Length,
        Height:med.Height,
        Width:med.Width
      },
      TotalWeight:Number(carga.peso),
      TotalPackages:Number(carga.volumes),
      InvoiceValue:Number(carga.valor_nf||0),
      InvoiceNumber:String(carga.numero_nf||""),
      ProductDescription:String(carga.mercadoria||"Cosméticos"),
      PackageType:String(carga.embalagem||"Caixas"),
      PickupServiceType:Number(e.pickup_service_type||1),
      ScheduleDate:String(e.schedule_date),
      Comment:String(e.comment||"").slice(0,500),
      RegisterSource:2,
      ExternalQuotationId:protocolo
    };

    const r=await fetch("https://pickup-apigateway.rte.com.br/api/v1/pickup",{
      method:"POST",
      headers:{
        "Accept":"application/json",
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      },
      body:JSON.stringify(payload)
    });
    const texto=await r.text();
    let dados={};try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}
    if(!r.ok){
      const erro=pick(dados,"Message","message","error_description","error")||texto||`HTTP ${r.status}`;
      throw new Error(String(erro));
    }

    const pickupId=pick(dados,"Id","id","PickupId","pickupId","Code","code");
    const status=String(pick(dados,"Status","status","Description","description")||"solicitado");
    const agora=new Date().toISOString();

    if(e.agendamento_id){
      await supabaseRest("coleta_agendamentos",{
        method:"PATCH",
        query:`?id=eq.${encodeURIComponent(e.agendamento_id)}`,
        body:{
          protocolo_cotacao:protocolo||null,
          codigo_coleta:pickupId?String(pickupId):null,
          status_api:status,
          status:"solicitado",
          modo_endereco:"alternativo",
          endereco_coleta_alternativo:origem,
          data_programada:e.schedule_date,
          servico_api:Number(e.pickup_service_type||1),
          resposta_api:dados,
          solicitado_api_em:agora,
          atualizado_em:agora
        }
      });
    }

    await supabaseRest("integracao_logs",{
      method:"POST",
      body:{
        convite_id:conviteId,
        transportadora_nome:"Rodonaves",
        operacao:"agendar_coleta_endereco_alternativo",
        ambiente:"homologacao",
        http_status:r.status,
        tempo_ms:Date.now()-inicio,
        sucesso:true,
        mensagem:`Coleta criada com endereço alternativo. Protocolo ref. ${protocolo}`,
        resposta_resumida:{pickup_id:pickupId,status,cep_origem:somenteNumeros(origem.cep)}
      }
    });

    return json(res,200,{
      ok:true,
      agendamento_id:e.agendamento_id||null,
      pickup_id:pickupId?String(pickupId):null,
      status,
      resposta:dados
    });
  }catch(erro){
    return json(res,502,{ok:false,erro:erro.message});
  }
};