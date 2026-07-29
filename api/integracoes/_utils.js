const crypto = require("crypto");

function json(res,status,data){
  res.status(status).json(data);
}

function adminValido(req){
  const esperado=process.env.INTEGRATIONS_ADMIN_KEY||"";
  const recebido=String(req.headers["x-integrations-admin-key"]||"");
  if(!esperado||!recebido)return false;

  const a=Buffer.from(esperado);
  const b=Buffer.from(recebido);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

function exigirAdmin(req,res){
  if(!adminValido(req)){
    json(res,401,{ok:false,erro:"Chave administrativa inválida ou não configurada."});
    return false;
  }
  return true;
}

function supabaseConfig(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
  if(!url||!key)throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurada.");
  return {url,key};
}

async function supabaseRest(caminho,{method="GET",body,query=""}={}){
  const {url,key}=supabaseConfig();
  const resposta=await fetch(`${url}/rest/v1/${caminho}${query}`,{
    method,
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      "Content-Type":"application/json",
      Prefer:"return=representation"
    },
    body:body===undefined?undefined:JSON.stringify(body)
  });

  const texto=await resposta.text();
  let dados=null;
  try{dados=texto?JSON.parse(texto):null}catch{dados=texto}

  if(!resposta.ok){
    throw new Error(dados?.message||dados?.error||texto||`Supabase HTTP ${resposta.status}`);
  }
  return dados;
}

function chaveCriptografia(){
  const segredo=process.env.INTEGRATIONS_ENCRYPTION_KEY||"";
  if(segredo.length<32){
    throw new Error("INTEGRATIONS_ENCRYPTION_KEY deve ter pelo menos 32 caracteres.");
  }
  return crypto.createHash("sha256").update(segredo).digest();
}

function criptografar(objeto){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",chaveCriptografia(),iv);
  const texto=Buffer.from(JSON.stringify(objeto),"utf8");
  const cifrado=Buffer.concat([cipher.update(texto),cipher.final()]);
  const tag=cipher.getAuthTag();

  return {
    payload:cifrado.toString("base64"),
    iv:iv.toString("base64"),
    tag:tag.toString("base64")
  };
}

function descriptografar(registro){
  const decipher=crypto.createDecipheriv(
    "aes-256-gcm",
    chaveCriptografia(),
    Buffer.from(registro.iv,"base64")
  );
  decipher.setAuthTag(Buffer.from(registro.auth_tag,"base64"));
  const aberto=Buffer.concat([
    decipher.update(Buffer.from(registro.payload_criptografado,"base64")),
    decipher.final()
  ]);
  return JSON.parse(aberto.toString("utf8"));
}

function validarUrlPublica(valor){
  const url=new URL(valor);
  if(url.protocol!=="https:")throw new Error("Somente URLs HTTPS são permitidas.");

  const host=url.hostname.toLowerCase();
  if(
    host==="localhost"||
    host==="127.0.0.1"||
    host==="0.0.0.0"||
    host==="::1"||
    host.endsWith(".local")||
    /^10\./.test(host)||
    /^192\.168\./.test(host)||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)||
    /^169\.254\./.test(host)
  ){
    throw new Error("Endereço interno ou local não permitido.");
  }
  return url.toString();
}

function obterCampo(objeto,caminho){
  return String(caminho||"")
    .split(".")
    .filter(Boolean)
    .reduce((atual,chave)=>atual?.[chave],objeto);
}

module.exports={
  json,exigirAdmin,supabaseRest,criptografar,descriptografar,
  validarUrlPublica,obterCampo
};
