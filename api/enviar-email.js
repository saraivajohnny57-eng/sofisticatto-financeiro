const nodemailer = require("nodemailer");
const crypto = require("crypto");

function supabaseConfig(){
  let url=String(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").trim();
  if(url.endsWith("/")) url=url.slice(0,-1);
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
  return {url,key};
}
async function buscarCredencialRemetente(email){
  const {url,key}=supabaseConfig();
  if(!url||!key||!email) return null;
  const r=await fetch(`${url}/rest/v1/email_remetentes_smtp?email=eq.${encodeURIComponent(String(email).toLowerCase())}&ativo=eq.true&select=*`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if(!r.ok) return null;
  const d=await r.json().catch(()=>[]);
  return Array.isArray(d)?d[0]:null;
}
function decifrarCredencial(row){
  const {key}=supabaseConfig();
  const master=crypto.createHash("sha256").update("sofisticatto:smtp:v60:"+key).digest();
  const d=crypto.createDecipheriv("aes-256-gcm",master,Buffer.from(row.iv,"base64"));
  d.setAuthTag(Buffer.from(row.tag,"base64"));
  return Buffer.concat([d.update(Buffer.from(row.senha_cifrada,"base64")),d.final()]).toString("utf8");
}

function responder(res, status, corpo) {
  res.status(status).json(corpo);
}

function listaEmails(valor) {
  if (Array.isArray(valor)) {
    return valor.map(String).map(v => v.trim()).filter(Boolean);
  }

  return String(valor || "")
    .split(/[;,\n]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return responder(res, 405, {
      ok: false,
      erro: "Método não permitido."
    });
  }

  try {
    const {
      remetente,
      nome_remetente,
      para,
      cc,
      assunto,
      texto,
      html,
      anexos = [],
      anexos_storage = []
    } = req.body || {};

    const destinatarios = listaEmails(para);
    const copias = listaEmails(cc);

    if (!destinatarios.length) {
      return responder(res, 400, {
        ok: false,
        erro: "Nenhum destinatário foi informado."
      });
    }

    const porta = Number(process.env.SMTP_PORT || 465);
    const seguro = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
    const solicitado=String(remetente||"").trim().toLowerCase();
    const credencial=solicitado ? await buscarCredencialRemetente(solicitado) : null;

    let smtpUser, smtpPass, emailRemetente;
    if(credencial){
      smtpUser=String(credencial.email||solicitado).trim().toLowerCase();
      smtpPass=decifrarCredencial(credencial);
      emailRemetente=smtpUser;
    }else{
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return responder(res, 500, {ok:false,erro:"Este remetente ainda não possui senha de aplicativo configurada e o SMTP padrão também não está disponível."});
      }
      smtpUser=process.env.SMTP_USER;
      smtpPass=process.env.SMTP_PASS;
      const padrao=String(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER||"").trim().toLowerCase();
      if(solicitado && solicitado !== padrao && solicitado !== String(process.env.SMTP_USER||"").trim().toLowerCase()){
        return responder(res,400,{ok:false,erro:`O remetente ${solicitado} ainda não possui senha de aplicativo configurada no Portal.`});
      }
      emailRemetente=padrao;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: porta,
      secure: seguro,
      auth: {user:smtpUser,pass:smtpPass}
    });
    await transporter.verify();

    const nomeRemetente = nome_remetente || credencial?.nome_exibicao || process.env.SMTP_FROM_NAME || process.env.SMTP_FROM || "Sofisticatto Cosméticos";

    const arquivos = Array.isArray(anexos)
      ? anexos.map(anexo => ({
          filename: String(anexo.nome || "anexo"),
          content: String(anexo.conteudo_base64 || ""),
          encoding: "base64",
          contentType: anexo.tipo || "application/octet-stream"
        }))
      : [];

    // V347: anexos grandes são enviados diretamente ao Storage antes do envio SMTP.
    // Nunca confiar em caminhos informados pelo cliente sem validar a sessão e a propriedade.
    const refs = Array.isArray(anexos_storage) ? anexos_storage : [];
    const {url:storageUrl,key:storageKey}=supabaseConfig();
    let arquivosTemporarios=[];
    if(refs.length){
      if(!storageUrl||!storageKey) return responder(res,503,{ok:false,erro:'Storage de e-mail indisponível: configure SUPABASE_SERVICE_ROLE_KEY.'});
      const bearer=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
      if(!bearer) return responder(res,401,{ok:false,erro:'Sessão necessária para enviar anexos.'});
      const auth=await fetch(`${storageUrl}/auth/v1/user`,{headers:{apikey:storageKey,Authorization:`Bearer ${bearer}`}});
      if(!auth.ok) return responder(res,401,{ok:false,erro:'Sessão expirada. Entre novamente no portal.'});
      const usuario=await auth.json();
      if(!usuario?.id) return responder(res,401,{ok:false,erro:'Sessão inválida.'});
      if(refs.length>30) return responder(res,400,{ok:false,erro:'Máximo de 30 anexos por e-mail.'});
      let total=0;
      for(const ref of refs){
        const caminho=String(ref?.caminho||'');
        if(!caminho.startsWith(`${usuario.id}/`) || !/^[a-zA-Z0-9_./-]+$/.test(caminho) || caminho.includes('..')){
          return responder(res,403,{ok:false,erro:'Referência de anexo não autorizada.'});
        }
        const nome=String(ref?.nome||'anexo').replace(/[\r\n]/g,' ').slice(0,180);
        const endpoint=`${storageUrl}/storage/v1/object/email-anexos-temporarios/${caminho.split('/').map(encodeURIComponent).join('/')}`;
        const ar=await fetch(endpoint,{headers:{apikey:storageKey,Authorization:`Bearer ${storageKey}`}});
        if(!ar.ok) throw new Error(`Não foi possível recuperar o anexo ${nome} (${ar.status}).`);
        const buffer=Buffer.from(await ar.arrayBuffer());
        total+=buffer.length;
        if(total>22*1024*1024) return responder(res,413,{ok:false,erro:'Os anexos somam mais de 22 MB. Divida o envio em mensagens menores.'});
        arquivos.push({filename:nome,content:buffer,contentType:String(ref?.tipo||'application/octet-stream')});
        arquivosTemporarios.push(caminho);
      }
    }

    const resultado = await transporter.sendMail({
      from: `"${nomeRemetente}" <${emailRemetente}>`,
      replyTo: emailRemetente,
      to: destinatarios,
      cc: copias.length ? copias : undefined,
      subject: assunto || "Documentos Sofisticatto",
      text: texto || "",
      html: html || undefined,
      attachments: arquivos
    });

    // Limpeza após SMTP confirmar o aceite. Uma falha na limpeza não reenvia o e-mail.
    if(arquivosTemporarios.length){
      try{await fetch(`${storageUrl}/storage/v1/object/email-anexos-temporarios`,{
        method:'DELETE',headers:{apikey:storageKey,Authorization:`Bearer ${storageKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({prefixes:arquivosTemporarios})
      });}catch(e){console.warn('Limpeza de anexos temporários:',e.message);}
    }
    return responder(res, 200, {
      ok: true,
      mensagem: "E-mail enviado com sucesso.",
      messageId: resultado.messageId
    });
  } catch (erro) {
    console.error("Erro em /api/enviar-email:", erro);

    return responder(res, 500, {
      ok: false,
      erro: erro?.message || "Não foi possível enviar o e-mail."
    });
  }
};
