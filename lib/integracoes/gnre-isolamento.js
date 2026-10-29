'use strict';
// Preflight somente de leitura. Nunca registra segredos e nunca envia GNRE.
const HOMOLOGACAO='https://www.testegnre.pe.gov.br:444/gnreWS/services';
function verificarIsolamento(env=process.env){
 const problemas=[];
 if(env.GNRE_AMBIENTE!=='homologacao')problemas.push('GNRE_AMBIENTE deve ser homologacao');
 if(env.GNRE_BASE_URL!==HOMOLOGACAO)problemas.push('GNRE_BASE_URL nao e endpoint homologacao permitido');
 if(env.VERCEL_ENV!=='preview')problemas.push('VERCEL_ENV deve ser preview');
 if(env.VERCEL_GIT_COMMIT_REF!=='cline-testes-integracoes')problemas.push('Branch preview nao autorizada');
 if(env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_URL)problemas.push('Supabase nao deve estar presente no preview isolado');
 if(env.GNRE_CERT_PFX_BASE64||env.GNRE_CERT_PASSWORD)problemas.push('Certificado A1 nao deve ser copiado para o preview sem isolamento');
 return {isolado:problemas.length===0,problemas,emissaoHabilitada:false};
}
module.exports={verificarIsolamento,HOMOLOGACAO};
