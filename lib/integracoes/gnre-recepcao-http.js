'use strict';

// Rota de RECEPÇÃO GNRE em homologação.
//
// Proteções em camadas (todas obrigatórias para transmitir):
//   1. autorização administrativa
//   2. GNRE_AMBIENTE=homologacao
//   3. GNRE_HOMOLOGACAO_EXECUTOR=1
//   4. GNRE_TRANSMISSAO_HABILITADA=1  (ausente por padrão = nunca transmite)
//   5. confirmação explícita no corpo: { confirmacao: 'TRANSMITIR_HOMOLOGACAO' }
//
// Modo "verificar": carrega e valida o A1, monta o plano e devolve metadados.
// NUNCA transmite. É o passo recomendado antes do primeiro envio real.
const { json, exigirAdmin } = require('./_utils');
const { credenciais } = require('./gnre-certificado');
const { executarRecepcao } = require('./gnre-recepcao-executor');
const repositorio = require('./gnre-idempotencia-repo');
const { supabaseRest } = require('./_utils');

const CONFIRMACAO = 'TRANSMITIR_HOMOLOGACAO';

function transmissaoHabilitada() {
  return String(process.env.GNRE_TRANSMISSAO_HABILITADA || '') === '1';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, erro: 'Método não permitido.' });
  if (!exigirAdmin(req, res)) return;

  if (String(process.env.GNRE_AMBIENTE || '').toLowerCase() !== 'homologacao') {
    return json(res, 400, { ok: false, erro: 'GNRE_AMBIENTE deve ser homologacao.' });
  }
  if (String(process.env.GNRE_HOMOLOGACAO_EXECUTOR || '') !== '1') {
    return json(res, 403, { ok: false, erro: 'Executor de homologação não habilitado.' });
  }

  const guias = req.body?.guias;
  if (!Array.isArray(guias) || guias.length === 0) {
    return json(res, 400, { ok: false, erro: 'Envie "guias" como array de TDadosGNRE.' });
  }
  const ator = String(req.headers?.['x-forwarded-user'] || 'admin').slice(0, 120);

  // ---- Modo verificação: valida o A1 sem transmitir ----
  if (req.body?.modo === 'verificar') {
    try {
      const cred = await credenciais();
      const temMaterial = Boolean((cred.key && cred.cert) || (cred.pfx && cred.pfx.length));
      if (!temMaterial) {
        return json(res, 503, { ok: false, erro: 'Certificado A1 não cadastrado.' });
      }
      const meta = cred.meta || null;
      const plano = await executarRecepcao({ guias });
      return json(res, 200, {
        ok: true,
        modo: 'verificar',
        transmissao: 'nao_realizada',
        certificado: {
          origem: cred.origem,
          modo: cred.modo || 'nativo',
          valido_ate: meta?.valido_ate || null,
          expirado: meta?.expirado ?? null,
          cnpj: meta?.cnpj || null,
          fingerprint256: meta?.fingerprint256 || null
        },
        plano: {
          servico: plano.servico,
          destino: plano.destino,
          guias: plano.guias,
          lote_sha256: plano.lote_sha256,
          idempotency_key: plano.idempotency_key
        },
        verificacoes: {
          certificado_carregado: true,
          certificado_valido: meta?.expirado === false,
          ambiente_homologacao: true,
          transmissao_habilitada: transmissaoHabilitada()
        }
      });
    } catch (erro) {
      return json(res, 503, {
        ok: false,
        erro: 'Não foi possível carregar o certificado A1. Confira o cadastro no portal.',
        detalhe: String(erro.message || '').slice(0, 120)
      });
    }
  }

  // ---- Transmissão: exige flag + confirmação explícita ----
  if (!transmissaoHabilitada()) {
    return json(res, 403, {
      ok: false,
      erro: 'Transmissão desabilitada. Configure GNRE_TRANSMISSAO_HABILITADA=1 somente para a janela autorizada.',
      transmissao_habilitada: false
    });
  }
  if (String(req.body?.confirmacao || '') !== CONFIRMACAO) {
    return json(res, 400, {
      ok: false,
      erro: `Confirmação obrigatória: envie {"confirmacao":"${CONFIRMACAO}"}.`
    });
  }

  // Referencia obrigatoria antes do envio para garantir rastreabilidade.
  const refPre = req.body?.referencia_nfe;
  if (!refPre || !/^[0-9]{44}$/.test(String(refPre.chave_nfe||'')) ||
      !/^[0-9]{1,18}$/.test(String(refPre.numero_nfe||'')) ||
      !/^[A-Z]{2}$/.test(String(refPre.uf_favorecida||'')) ||
      !/^[0-9]{6}$/.test(String(refPre.receita||'')) ||
      !/^\d{1,12}\.\d{2}$/.test(String(refPre.valor_principal||'')) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(refPre.vencimento||''))) {
    return json(res, 400, {ok:false,erro:'Referencia fiscal da NF-e obrigatoria antes da transmissao.'});
  }
  try {
    const cred = await credenciais();
    const resultado = await executarRecepcao({
      guias,
      certificado: { pfx: cred.pfx, passphrase: cred.passphrase, key: cred.key, cert: cred.cert },
      repositorio,
      ator,
      permitirTransmissao: true
    });
    // Registra automaticamente a recepcao sem confundi-la com emissao.
    // O documento oficial e o PDF so sao arquivados apos consulta do resultado.
    if (resultado.ok && resultado.estado === 'concluido' && req.body?.referencia_nfe) {
      const ref = req.body.referencia_nfe;
      const valido = ref && /^[0-9]{44}$/.test(String(ref.chave_nfe||'')) &&
        /^[0-9]{1,18}$/.test(String(ref.numero_nfe||'')) &&
        /^[A-Z]{2}$/.test(String(ref.uf_favorecida||'')) &&
        /^[0-9]{6}$/.test(String(ref.receita||'')) &&
        /^\d{1,12}\.\d{2}$/.test(String(ref.valor_principal||'')) &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(ref.vencimento||''));
      if (!valido) {
        return json(res, 202, { ...resultado, arquivamento: 'referencia_invalida',
          aviso: 'Lote transmitido; confira a recepcao antes de qualquer reenvio.' });
      }
      try {
        const registros = await supabaseRest('gnre_guias_arquivo', {
          method: 'POST',
          query: '?on_conflict=chave_idempotencia',
          body: {
            chave_nfe: ref.chave_nfe,
            numero_nfe: String(ref.numero_nfe),
            uf_favorecida: ref.uf_favorecida,
            receita: ref.receita,
            valor_principal: ref.valor_principal,
            vencimento: ref.vencimento,
            ambiente: 'homologacao',
            situacao: 'recebida',
            chave_idempotencia: resultado.idempotency_key,
            resposta_resumo: { categoria: resultado.categoria,
              validacao_fiscal: resultado.validacao_fiscal,
              recibo_mascarado: resultado.recibo_mascarado || null }
          }
        });
        resultado.arquivamento = Array.isArray(registros) && registros.length ? 'recepcao_registrada' : 'nao_confirmado';
      } catch (_erroArquivo) {
        resultado.arquivamento = 'falha_ao_registrar';
        resultado.aviso = 'Lote transmitido, mas nao foi possivel arquivar. NAO retransmitir sem reconciliacao.';
      }
    }
    return json(res, resultado.ok ? 200 : 502, resultado);
  } catch (erro) {
    return json(res, 502, {
      ok: false,
      erro: 'Falha na recepção GNRE.',
      detalhe: String(erro.message || '').slice(0, 160)
    });
  }
};
