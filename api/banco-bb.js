const https=require('https');
const forge=require('node-forge');
const {exigirAdmin,supabaseRest,criptografar,descriptografar}=require('../lib/integracoes/_utils');

const TABELA='integracoes_bancarias_segredos';
const CNPJ_PADRAO='05451985000195';
const normalizarAmb=v=>String(v||'producao').toLowerCase()==='teste'?'teste':'producao';
const soDigitos=v=>String(v||'').replace(/\D/g,'');

function idRegistro(amb,tipo){return `bb:${amb}:${tipo}`}
function json(res,status,data){res.status(status).json(data)}
function pemCert(cert){return forge.pki.certificateToPem(cert).trim()+'\n'}
function nomeAttr(attrs,nome){const a=(attrs||[]).find(x=>x.name===nome||x.shortName===nome);return a?.value||''}
function nomeCert(cert){return nomeAttr(cert.subject.attributes,'commonName')||nomeAttr(cert.subject.attributes,'organizationName')||'Certificado'}
function mesmoDn(a,b){return a.attributes.length===b.attributes.length && a.attributes.every((x,i)=>x.type===b.attributes[i]?.type&&String(x.value)===String(b.attributes[i]?.value))}
function ehAutoAssinado(cert){return mesmoDn(cert.subject,cert.issuer)}
function extrairCnpj(cert){
  const vals=[...(cert.subject?.attributes||[]).map(x=>String(x.value||'')),nomeCert(cert)];
  for(const v of vals){const m=v.match(/(?:^|\D)(\d{14})(?:\D|$)/);if(m)return m[1]}
  return '';
}
function montarCadeia(certificados){
  if(!certificados.length)return [];
  let leaf=certificados.find(c=>!certificados.some(o=>o!==c&&mesmoDn(o.issuer,c.subject)))||certificados[0];
  const out=[leaf], usados=new Set([leaf]);
  while(!ehAutoAssinado(out[out.length-1])){
    const atual=out[out.length-1];
    const prox=certificados.find(c=>!usados.has(c)&&mesmoDn(atual.issuer,c.subject));
    if(!prox)break;
    out.push(prox);usados.add(prox);
  }
  for(const c of certificados)if(!usados.has(c))out.push(c);
  return out;
}
function parsePfx(base64,senha){
  const raw=Buffer.from(String(base64||''),'base64');
  if(!raw.length)throw new Error('Arquivo A1 vazio ou inválido.');
  if(raw.length>2_500_000)throw new Error('Arquivo A1 muito grande.');
  const asn1=forge.asn1.fromDer(forge.util.createBuffer(raw.toString('binary')));
  let p12;
  try{p12=forge.pkcs12.pkcs12FromAsn1(asn1,false,String(senha||''))}catch(e){throw new Error('Não foi possível abrir o A1. Confira a senha do certificado.')}
  const certBags=[
    ...(p12.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag]||[])
  ];
  const keyBags=[
    ...(p12.getBags({bagType:forge.pki.oids.pkcs8ShroudedKeyBag})[forge.pki.oids.pkcs8ShroudedKeyBag]||[]),
    ...(p12.getBags({bagType:forge.pki.oids.keyBag})[forge.pki.oids.keyBag]||[])
  ];
  const certs=certBags.map(b=>b.cert).filter(Boolean);
  if(!certs.length)throw new Error('O arquivo não contém certificado X.509.');
  if(!keyBags.length)throw new Error('O arquivo não contém a chave privada necessária ao mTLS.');
  const cadeia=montarCadeia(certs);
  const leaf=cadeia[0];
  const agora=new Date();
  const inicio=new Date(leaf.validity.notBefore), fim=new Date(leaf.validity.notAfter);
  if(agora<inicio)throw new Error(`O certificado ainda não é válido. Início: ${inicio.toLocaleDateString('pt-BR')}.`);
  if(agora>fim)throw new Error(`O certificado está vencido desde ${fim.toLocaleDateString('pt-BR')}.`);
  const cnpj=extrairCnpj(leaf);
  const esperado=soDigitos(process.env.BB_CNPJ||CNPJ_PADRAO);
  if(cnpj&&esperado&&cnpj!==esperado)throw new Error(`O A1 pertence ao CNPJ ${cnpj}, diferente do CNPJ configurado para a Sofisticatto.`);
  const dias=Math.ceil((fim-agora)/86400000);
  return {raw,leaf,cadeia,metadata:{cnpj:cnpj||esperado||'',titular:nomeCert(leaf),emissor:nomeAttr(leaf.issuer.attributes,'commonName')||nomeAttr(leaf.issuer.attributes,'organizationName')||'',valido_de:inicio.toISOString(),valido_ate:fim.toISOString(),dias_restantes:dias,quantidade_cadeia:cadeia.length,serial:leaf.serialNumber||''},pem:cadeia.map(pemCert).join('\n')};
}
async function obterRegistro(id){
  const r=await supabaseRest(TABELA,{query:`?id=eq.${encodeURIComponent(id)}&select=*`});
  return Array.isArray(r)?r[0]:null;
}
async function salvarRegistro(id,banco,amb,tipo,obj,metadata={}){
  const c=criptografar(obj);
  const atual=await obterRegistro(id);
  const body={id,banco,ambiente:amb,tipo,payload_criptografado:c.payload,iv:c.iv,auth_tag:c.tag,metadata,atualizado_em:new Date().toISOString()};
  if(atual) return supabaseRest(TABELA,{method:'PATCH',query:`?id=eq.${encodeURIComponent(id)}`,body});
  return supabaseRest(TABELA,{method:'POST',body});
}
async function statusAmbiente(amb){
  const cred=await obterRegistro(idRegistro(amb,'credenciais'));
  const cert=await obterRegistro(idRegistro(amb,'certificado'));
  const pend=await obterRegistro(idRegistro(amb,'certificado_pendente'));
  const meta=cert?.metadata||null;
  const pendMeta=pend?.metadata||null;
  let dias=null, vencido=false;
  if(meta?.valido_ate){dias=Math.ceil((new Date(meta.valido_ate)-new Date())/86400000);vencido=dias<0}
  return {ambiente:amb,credenciais:{configuradas:!!cred,app_key:!!cred,client_id:!!cred,client_secret:!!cred,scopes:cred?.metadata?.scopes||''},certificado:{configurado:!!cert,...(meta||{}),dias_restantes:dias,vencido},certificado_pendente:pend?{configurado:true,...pendMeta}: {configurado:false}};
}
function postHttps({url,headers,body,pfx,passphrase}){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const req=https.request({hostname:u.hostname,port:443,path:u.pathname+u.search,method:'POST',headers,pfx,passphrase,rejectUnauthorized:true,timeout:20000},res=>{
      const parts=[];res.on('data',d=>parts.push(d));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(parts).toString('utf8')}));
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao conectar ao Banco do Brasil.')));
    req.on('error',reject);req.write(body);req.end();
  });
}
async function testarOAuth(amb){
  const credReg=await obterRegistro(idRegistro(amb,'credenciais'));
  const pendReg=await obterRegistro(idRegistro(amb,'certificado_pendente'));
  const certReg=pendReg||await obterRegistro(idRegistro(amb,'certificado'));
  if(!credReg)throw new Error('Credenciais BB ainda não cadastradas neste ambiente.');
  if(!certReg)throw new Error('Certificado A1 ainda não cadastrado neste ambiente.');
  const cred=descriptografar(credReg), cert=descriptografar(certReg);
  const base=amb==='teste'?'https://oauth.hm.bb.com.br':'https://oauth.bb.com.br';
  const form=new URLSearchParams({grant_type:'client_credentials'});
  if(cred.scopes)form.set('scope',cred.scopes);
  const body=form.toString();
  const auth=Buffer.from(`${cred.client_id}:${cred.client_secret}`,'utf8').toString('base64');
  const r=await postHttps({url:`${base}/oauth/token`,headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)},body,pfx:Buffer.from(cert.pfx_base64,'base64'),passphrase:cert.senha});
  let data={};try{data=JSON.parse(r.text||'{}')}catch{data={raw:r.text}}
  if(r.status<200||r.status>=300)throw new Error(data.error_description||data.error||data.message||`BB OAuth HTTP ${r.status}`);
  return {ok:true,status:r.status,token_recebido:!!data.access_token,expires_in:data.expires_in||null,scope:data.scope||cred.scopes||'',usou_pendente:!!pendReg};
}

module.exports=async function(req,res){
  if(!exigirAdmin(req,res))return;
  const action=String(req.query?.action||'status');
  const amb=normalizarAmb(req.query?.ambiente||req.body?.ambiente);
  try{
    if(action==='status')return json(res,200,{ok:true,...await statusAmbiente(amb)});
    if(action==='salvar-credenciais'){
      const atual=await obterRegistro(idRegistro(amb,'credenciais'));
      let anterior={};if(atual)anterior=descriptografar(atual);
      const app_key=String(req.body?.app_key||anterior.app_key||'').trim();
      const client_id=String(req.body?.client_id||anterior.client_id||'').trim();
      const client_secret=String(req.body?.client_secret||anterior.client_secret||'').trim();
      const scopes=String(req.body?.scopes??anterior.scopes??'').trim();
      if(!app_key||!client_id||!client_secret)throw new Error('Informe App Key, Client ID e Client Secret na primeira configuração.');
      await salvarRegistro(idRegistro(amb,'credenciais'),'bb',amb,'credenciais',{app_key,client_id,client_secret,scopes},{scopes});
      return json(res,200,{ok:true,mensagem:'Credenciais salvas com criptografia no backend.'});
    }
    if(action==='atualizar-certificado'){
      const base64=String(req.body?.pfx_base64||'');const senha=String(req.body?.senha||'');
      if(!base64||!senha)throw new Error('Selecione o arquivo A1 e informe a senha.');
      const p=parsePfx(base64,senha);
      await salvarRegistro(idRegistro(amb,'certificado_pendente'),'bb',amb,'certificado_pendente',{pfx_base64:base64,senha,pem_cadeia:p.pem},{...p.metadata,nome_arquivo:String(req.body?.nome_arquivo||'certificado.pfx')});
      return json(res,200,{ok:true,mensagem:'Novo A1 validado e preparado. O certificado atual continuará ativo até o novo passar no teste com o BB.',certificado:p.metadata});
    }
    if(action==='cadeia'){
      const certReg=(await obterRegistro(idRegistro(amb,'certificado_pendente')))||(await obterRegistro(idRegistro(amb,'certificado')));if(!certReg)throw new Error('Nenhum A1 cadastrado.');
      const cert=descriptografar(certReg);res.setHeader('Content-Type','application/x-pem-file; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="BB_CADEIA_${amb.toUpperCase()}.pem"`);return res.status(200).send(cert.pem_cadeia||'');
    }
    if(action==='testar'){
      const teste=await testarOAuth(amb);
      if(teste.usou_pendente){
        const pend=await obterRegistro(idRegistro(amb,'certificado_pendente'));
        const aberto=descriptografar(pend);
        await salvarRegistro(idRegistro(amb,'certificado'),'bb',amb,'certificado',aberto,pend.metadata||{});
        await supabaseRest(TABELA,{method:'DELETE',query:`?id=eq.${encodeURIComponent(idRegistro(amb,'certificado_pendente'))}`});
        teste.promovido=true;
      }
      return json(res,200,{ok:true,teste});
    }
    return json(res,400,{ok:false,erro:'Ação inválida.'});
  }catch(e){console.error('[BANCO-BB V144]',action,e);return json(res,500,{ok:false,erro:e.message||'Falha na integração Banco do Brasil.'});}
};
