const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { para, cc = [], assunto, texto, html, anexos = [] } = req.body || {};

    if (!Array.isArray(para) || para.length === 0) {
      return res.status(400).json({ error: 'Nenhum destinatário informado.' });
    }
    if (!assunto) {
      return res.status(400).json({ error: 'Assunto não informado.' });
    }

    const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) {
      return res.status(500).json({ error: `Variáveis ausentes na Vercel: ${missing.join(', ')}` });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const attachments = anexos.map((item) => ({
      filename: item.nome,
      content: Buffer.from(item.conteudo_base64, 'base64'),
      contentType: item.tipo || 'application/octet-stream',
    }));

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM_NAME
        ? `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`
        : process.env.SMTP_USER,
      to: para,
      cc: Array.isArray(cc) && cc.length ? cc : undefined,
      replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_USER,
      subject: assunto,
      text: texto || '',
      html: html || undefined,
      attachments,
    });

    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (error) {
    console.error('Erro no envio SMTP:', error);
    return res.status(500).json({ error: error.message || 'Falha ao enviar e-mail.' });
  }
};
