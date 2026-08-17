const {supabaseRest,descriptografar}=require('./_utils');

/**
 * Recupera credenciais criptografadas do convite/ambiente.
 * Nunca devolve o payload para o navegador.
 */
async function obterCredenciaisIntegracao(conviteId,ambiente='producao'){
  if(!conviteId)throw new Error('convite_id não informado.');
  const rows=await supabaseRest('integracao_credenciais',{
    query:`?select=id,convite_id,ambiente,payload_criptografado,iv,auth_tag,atualizado_em&convite_id=eq.${encodeURIComponent(conviteId)}&ambiente=eq.${encodeURIComponent(ambiente)}&limit=1`
  });
  if(!Array.isArray(rows)||!rows.length)throw new Error(`Credenciais de ${ambiente} não cadastradas no Portal de Integrações.`);
  return descriptografar(rows[0]);
}

module.exports={obterCredenciaisIntegracao};
