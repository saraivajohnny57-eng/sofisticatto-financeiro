const {
  json,exigirAdmin,supabaseRest,descriptografar,validarUrlPublica,obterCampo
}=require("./_utils");

module.exports=async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,erro:"Método não permitido."});
  if(!exigirAdmin(req,res))return;

  try{
    const {convite_id,corpo={}}=req.body||{};
    if(!convite_id)return json(res,400,{ok:false,erro:"convite_id é obrigatório."});

    const configs=await supabaseRest("integracao_configuracoes",{
      query:`?select=*&convite_id=eq.${encodeURIComponent(convite_id)}&limit=1`
    });
    const config=configs?.[0];
    if(!config)throw new Error("Configuração da integração não encontrada.");

    const credenciaisDb=await supabaseRest("integracao_credenciais",{
      query:`?select=*&convite_id=eq.${encodeURIComponent(convite_id)}&ambiente=eq.homologacao&limit=1`
    });
    const credRegistro=credenciaisDb?.[0];
    const cred=credRegistro?descriptografar(credRegistro):{};

    const endpoint=validarUrlPublica(config.url_homologacao);
    const headers={"Content-Type":"application/json","Accept":"application/json"};

    if(config.auth_tipo==="bearer"){
      if(!cred.token)throw new Error("Bearer Token não cadastrado.");
      headers.Authorization=`Bearer ${cred.token}`;
    }else if(config.auth_tipo==="api_key"){
      if(!cred.api_key)throw new Error("API Key não cadastrada.");
      headers[config.api_key_header||"x-api-key"]=cred.api_key;
    }else if(config.auth_tipo==="basic"){
      if(!cred.username||!cred.password)throw new Error("Usuário e senha não cadastrados.");
      headers.Authorization=`Basic ${Buffer.from(`${cred.username}:${cred.password}`).toString("base64")}`;
    }else if(config.auth_tipo==="login_token"){
      if(!config.token_url)throw new Error("URL de geração de token não informada.");
      const tokenUrl=validarUrlPublica(config.token_url);
      const loginBody={
        [config.usuario_campo||"username"]:cred.username,
        [config.senha_campo||"password"]:cred.password
      };
      const tokenResp=await fetch(tokenUrl,{
        method:"POST",
        headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify(loginBody)
      });
      const tokenTexto=await tokenResp.text();
      let tokenDados={};
      try{tokenDados=tokenTexto?JSON.parse(tokenTexto):{}}catch{tokenDados={}}
      if(!tokenResp.ok)throw new Error(`Falha ao gerar token: HTTP ${tokenResp.status}`);
      const token=obterCampo(tokenDados,config.token_resposta_campo||"access_token");
      if(!token)throw new Error("Token não encontrado na resposta de autenticação.");
      headers.Authorization=`Bearer ${token}`;
    }

    const inicio=Date.now();
    const metodo=config.metodo||"POST";
    const resposta=await fetch(endpoint,{
      method:metodo,
      headers,
      body:metodo==="GET"?undefined:JSON.stringify(corpo)
    });
    const tempo=Date.now()-inicio;
    const texto=await resposta.text();
    let retorno=texto;
    try{retorno=texto?JSON.parse(texto):{}}catch{}

    const log={
      convite_id,
      ambiente:"homologacao",
      operacao:"teste_conexao",
      url:config.url_homologacao,
      metodo,
      http_status:resposta.status,
      tempo_ms:tempo,
      sucesso:resposta.ok,
      resposta_resumida:typeof retorno==="string"?retorno.slice(0,3000):retorno,
      created_at:new Date().toISOString()
    };

    try{
      await supabaseRest("integracao_testes",{method:"POST",body:log});
    }catch(erroLog){
      console.warn("Falha ao registrar teste:",erroLog.message);
    }

    if(!resposta.ok){
      return json(res,502,{
        ok:false,
        erro:`A transportadora retornou HTTP ${resposta.status}.`,
        http_status:resposta.status,
        tempo_ms:tempo,
        resposta:retorno
      });
    }

    return json(res,200,{
      ok:true,
      http_status:resposta.status,
      tempo_ms:tempo,
      url:config.url_homologacao,
      resposta:retorno
    });
  }catch(erro){
    console.error("testar-homologacao:",erro);
    return json(res,500,{ok:false,erro:erro.message});
  }
};
