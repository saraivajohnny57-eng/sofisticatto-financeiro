// Portal Financeiro02: credenciais e tokens permanecem exclusivamente no servidor.
const crypto = require('node:crypto');
const COOKIE = 'sf02_session';
const TTL = 8 * 60 * 60 * 1000;

function config() {
  const url = String(process.env.FINANCEIRO02_SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.FINANCEIRO02_SUPABASE_SERVICE_ROLE_KEY || '');
  if (url !== 'https://xrtpidsqbfdlgjefuobs.supabase.co' || !key) {
    throw new Error('Financeiro02 não configurado no servidor');
  }
  return {url, key};
}
function secret() {
  const value = String(process.env.PORTAL_SESSION_SECRET || process.env.INTEGRATIONS_ENCRYPTION_KEY || '');
  if (value.length < 32) throw new Error('Segredo de sessão do Portal indisponível');
  return crypto.createHmac('sha256', value).update('sf02-portal-auth-v1').digest();
}
function hmac(text) { return crypto.createHmac('sha256', secret()).update(text).digest('base64url'); }
function equals(a,b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function comparePassword(plain, supplied) {
  return equals(crypto.createHash('sha256').update(String(plain ?? '')).digest('hex'),
    crypto.createHash('sha256').update(String(supplied ?? '')).digest('hex'));
}
function publicUser(user) {
  if (!user) return null;
  const {senha, ...safe} = user;
  return safe;
}
function issue(user) {
  const payload = {id:user.id, login:user.login, tipo:user.tipo, exp:Date.now()+TTL, nonce:crypto.randomBytes(12).toString('hex')};
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return b + '.' + hmac(b);
}
function session(req) {
  try {
    const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE+'='));
    if (!cookie) return null;
    const [b, signature] = decodeURIComponent(cookie.slice(COOKIE.length+1)).split('.');
    if (!b || !equals(signature, hmac(b))) return null;
    const data = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (!data.id || !data.login || !data.tipo || !Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    return data;
  } catch {return null;}
}
function cookieHeader(token) {
  const maxAge = token ? Math.floor(TTL / 1000) : 0;
  return COOKIE+'='+(token || '')+'; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Strict';
}
function sameOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const origin = req.headers.origin;
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (site === 'cross-site') return false;
  if (origin) {
    try {return new URL(origin).host === host && new URL(origin).protocol === 'https:';}catch{return false;}
  }
  return true;
}
async function db(path, options={}) {
  const {url,key}=config();
  const headers = {apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json', ...options.headers};
  const response = await fetch(url + path, {...options, headers, cache:'no-store', signal:AbortSignal.timeout(15000)});
  if (!response.ok) {
    const message = (await response.text()).slice(0,500);
    const error = new Error('Financeiro02 respondeu '+response.status+': '+message);
    error.status = response.status;
    throw error;
  }
  return response;
}
module.exports = {COOKIE,config,comparePassword,publicUser,issue,session,cookieHeader,sameOrigin,db};
