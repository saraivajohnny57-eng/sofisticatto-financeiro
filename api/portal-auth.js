const auth = require('./_portal-secure');
function reply(res, status, value) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(value);
}
module.exports = async function handler(req,res) {
  try {
    res.setHeader('Cache-Control','no-store');
    if (!auth.sameOrigin(req)) return reply(res,403,{ok:false,erro:'Origem não autorizada'});
    if (req.method === 'GET') {
      const user = auth.session(req);
      return user ? reply(res,200,{ok:true,usuario:{id:user.id,login:user.login,tipo:user.tipo}}) :
        reply(res,401,{ok:false,erro:'Sessão expirada'});
    }
    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie',auth.cookieHeader(''));
      return reply(res,200,{ok:true});
    }
    if (req.method !== 'POST') return reply(res,405,{ok:false,erro:'Método não permitido'});
    const login=String(req.body?.login || '').trim().slice(0,120);
    const senha=String(req.body?.senha || '');
    if (!login || !senha || senha.length>400) return reply(res,401,{ok:false,erro:'Login ou senha inválidos'});
    const row=await auth.db('/rest/v1/usuarios?login=eq.'+encodeURIComponent(login)+'&select=*&limit=1');
    const users=await row.json();
    const u=Array.isArray(users)?users[0]:null;
    if(!u || u.ativo === false || !auth.comparePassword(u.senha,senha)) {
      return reply(res,401,{ok:false,erro:'Login ou senha inválidos'});
    }
    const token=auth.issue(u);
    res.setHeader('Set-Cookie',auth.cookieHeader(token));
    return reply(res,200,{ok:true,usuario:auth.publicUser(u)});
  } catch(e) {
    console.error('[Financeiro02] Falha na autenticação:',e.status || 500,String(e.message||'').slice(0,120));
    return reply(res,503,{ok:false,erro:'Não foi possível autenticar no Financeiro02'});
  }
};