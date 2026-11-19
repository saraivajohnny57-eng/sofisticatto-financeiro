// V509: permissão mínima de emissão individual, independente da chave administrativa.
// Sessão assinada e HttpOnly emitida pelo login Financeiro02; não confia no perfil enviado pelo navegador.
const auth=require('./secure');
const ACTIONS=Object.freeze({
 bb:new Set(['emitir-boleto','verificar-titulo','consultar-boleto','sincronizar-status']),
 bradesco:new Set(['preparar-emissao-producao-v248','emitir-cobranca-producao-v248','verificar-preparacao-sem-envio-v495','consultar-status-titulo'])
});
function podeOperarEmissaoCobranca(req,banco,action,ambiente){
 if(!req || req.method!=='POST' || ambiente!=='producao')return false;
 if(!auth.sameOrigin(req))return false;
 const sessao=auth.session(req);
 if(sessao?.tipo!=='cobranca' || !sessao?.id)return false;
 if(!ACTIONS[banco]?.has(String(action||'')))return false;
 if(banco==='bb'&&action==='sincronizar-status' && !/^[0-9a-f-]{36}$/i.test(String(req.body?.id||'')))return false;
 const queryAmb=String(req.query?.ambiente||'');
 const bodyAmb=String(req.body?.ambiente||'');
 if((queryAmb&&queryAmb!=='producao')||(bodyAmb&&bodyAmb!=='producao'))return false;
 return true;
}
module.exports={podeOperarEmissaoCobranca};
