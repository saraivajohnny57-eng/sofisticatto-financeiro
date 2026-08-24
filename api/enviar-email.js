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
      anexos = []
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
