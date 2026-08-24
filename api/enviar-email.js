const nodemailer = require("nodemailer");

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

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return responder(res, 500, {
        ok: false,
        erro: "As variáveis SMTP_USER e SMTP_PASS não estão configuradas na Vercel."
      });
    }

    const porta = Number(process.env.SMTP_PORT || 465);
    const seguro =
      String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: porta,
      secure: seguro,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.verify();

    const nomeRemetente =
      nome_remetente || process.env.SMTP_FROM_NAME || process.env.SMTP_FROM || "Sofisticatto Cosméticos";

    const solicitado=String(remetente||"").trim().toLowerCase();
    const emailRemetente = solicitado.endsWith("@sofisticatto1.com.br")
      ? solicitado
      : (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER);

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
