const {
  json,exigirAdmin,supabaseRest,descriptografar
}=require("./_utils");

module.exports=async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;
  try{
    const {convite_id}=req.body||{};
    if(!convite_id)return json(res,400,{ok:false,erro:"convite_id obrigatório."});

    const credRows=await supabaseRest("integracao_credenciais",{
      query:`?select=*&convite_id=eq.${encodeURIComponent(convite_id)}&ambiente=eq.homologacao&limit=1`
    });
    if(!credRows?.[0])throw new Error("Credenciais de homologação não cadastradas.");
    const cred=descriptografar(credRows[0]);
    if(!cred.username||!cred.password)throw new Error("Usuário e senha não cadastrados.");

    const endpointRows=await supabaseRest("transportadora_endpoints",{
      query:`?select=*&convite_id=eq.${encodeURIComponent(convite_id)}&operacao=eq.token&ambiente=eq.homologacao&limit=1`
    });
    const endpoint=endpointRows?.[0]?.url||"https://quotation-apigateway.rte.com.br/token";

    const params=new URLSearchParams();
    params.set("auth_type","DEV");
    params.set("grant_type","password");
    params.set("username",cred.username);
    params.set("password",cred.password);

    const inicio=Date.now();
    const resposta=await fetch(endpoint,{
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
      body:params.toString()
    });
    const tempo=Date.now()-inicio;
    const texto=await resposta.text();
    let dados={};try{dados=texto?JSON.parse(texto):{}}catch{dados={raw:texto}}

    const conviteRows=await supabaseRest("integracao_convites",{
      query:`?select=transportadora_nome&id=eq.${encodeURIComponent(convite_id)}&limit=1`
    });
    const nome=conviteRows?.[0]?.transportadora_nome||"Rodonaves";
    await supabaseRest("integracao_logs",{method:"POST",body:{
      convite_id,transportadora_nome:nome,operacao:"autenticacao",
      ambiente:"homologacao",http_status:resposta.status,tempo_ms:tempo,
      sucesso:resposta.ok,mensagem:resposta.ok?"Token gerado com sucesso":"Falha na autenticação",
      resposta_resumida:{
        token_type:dados.token_type||null,
        expires_in:dados.expires_in||null,
        possui_access_token:!!dados.access_token
      }
    }});

    if(!resposta.ok)return json(res,502,{ok:false,erro:`Rodonaves retornou HTTP ${resposta.status}.`});
    return json(res,200,{
      ok:true,http_status:resposta.status,tempo_ms:tempo,
      token_type:dados.token_type,expires_in:dados.expires_in,
      possui_access_token:!!dados.access_token
    });
  }catch(erro){
    return json(res,500,{ok:false,erro:erro.message});
  }
};
