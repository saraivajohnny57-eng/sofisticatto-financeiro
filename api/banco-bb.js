const https=require('https');
const forge=require('node-forge');
const {exigirAdmin,supabaseRest,criptografar,descriptografar}=require('../lib/integracoes/_utils');

const TABELA='integracoes_bancarias_segredos';
const CNPJ_PADRAO='05451985000195';
const BB_SCOPE_COBRANCAS='cobrancas.boletos-info cobrancas.boletos-requisicao';
const BB_CONFIG_PRODUCAO=Object.freeze({numeroConvenio:'3054166',numeroCarteira:'17',numeroVariacaoCarteira:'027',codigoModalidade:1});
const BB_NOSSO_NUMERO_INICIAL=34113;
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
  const attrs=cert.subject?.attributes||[];
  const esperado=soDigitos(process.env.BB_CNPJ||CNPJ_PADRAO);
  const extrair14=v=>{
    const texto=String(v||'');
    const achados=texto.match(/\d{14}/g)||[];
    return achados.map(soDigitos).find(x=>x.length===14)||'';
  };

  // ICP-Brasil: prioriza o identificador do TITULAR. Em certificados PJ,
  // o CNPJ costuma estar no CN (ex.: EMPRESA:05451985000195) e/ou no OID
  // 2.16.76.1.3.3. Não usamos o primeiro número de 14 dígitos de qualquer
  // atributo, pois outros campos podem pertencer à AC/AR e causar falso CNPJ.
  const cn=nomeAttr(attrs,'commonName');
  const cnpjCn=extrair14(cn);
  if(cnpjCn)return cnpjCn;

  const oidCnpj='2.16.76.1.3.3';
  const attrCnpj=attrs.find(a=>String(a.type||'')===oidCnpj);
  const cnpjOid=extrair14(attrCnpj?.value);
  if(cnpjOid)return cnpjOid;

  // Se o CNPJ esperado estiver explicitamente em algum atributo do subject,
  // ele é aceito como fallback seguro (somente subject do certificado folha).
  if(esperado&&attrs.some(a=>soDigitos(a.value).includes(esperado)))return esperado;

  // Último fallback: somente atributos de identidade do titular, nunca issuer.
  for(const nome of ['serialNumber','organizationName','organizationalUnitName']){
    const c=extrair14(nomeAttr(attrs,nome));
    if(c)return c;
  }
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
  // Como a Cobranças v2 desta aplicação não exige mTLS, um A1 já validado
  // localmente pode ser exibido como armazenado mesmo se veio da V146 como "pendente".
  const certExibido=pend||cert;
  const meta=certExibido?.metadata||null;
  let dias=null, vencido=false;
  if(meta?.valido_ate){dias=Math.ceil((new Date(meta.valido_ate)-new Date())/86400000);vencido=dias<0}
  return {ambiente:amb,mtls_exigido:false,credenciais:{configuradas:!!cred,app_key:!!cred,client_id:!!cred,client_secret:!!cred,scopes:cred?.metadata?.scopes||BB_SCOPE_COBRANCAS},certificado:{configurado:!!certExibido,...(meta||{}),dias_restantes:dias,vencido,uso:'opcional'},certificado_pendente:{configurado:false}};
}
function getHttps({url,headers}){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const req=https.request({hostname:u.hostname,port:443,path:u.pathname+u.search,method:'GET',headers,rejectUnauthorized:true,timeout:20000},res=>{
      const parts=[];res.on('data',d=>parts.push(d));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(parts).toString('utf8')}));
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao consultar a API do Banco do Brasil.')));
    req.on('error',reject);req.end();
  });
}
function requestHttps({url,headers={},body='',method='POST',pfx,passphrase}){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const req=https.request({hostname:u.hostname,port:443,path:u.pathname+u.search,method,headers,pfx,passphrase,rejectUnauthorized:true,timeout:20000},res=>{
      const parts=[];res.on('data',d=>parts.push(d));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(parts).toString('utf8')}));
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao conectar ao Banco do Brasil.')));
    req.on('error',reject);if(body)req.write(body);req.end();
  });
}
function postHttps(o){return requestHttps({...o,method:'POST'})}

async function obterTokenOAuth(amb){
  const credReg=await obterRegistro(idRegistro(amb,'credenciais'));
  if(!credReg)throw new Error('Credenciais BB ainda não cadastradas neste ambiente.');
  const cred=descriptografar(credReg);
  const base=amb==='teste'?'https://oauth.hm.bb.com.br':'https://oauth.bb.com.br';
  const scopes=String(cred.scopes||BB_SCOPE_COBRANCAS).trim()||BB_SCOPE_COBRANCAS;
  const body=`grant_type=client_credentials&scope=${encodeURIComponent(scopes)}`;
  const auth=Buffer.from(`${cred.client_id}:${cred.client_secret}`,'utf8').toString('base64');
  const r=await postHttps({url:`${base}/oauth/token`,headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)},body});
  let data={};try{data=JSON.parse(r.text||'{}')}catch{data={raw:r.text}}
  if(r.status<200||r.status>=300)throw new Error(data.error_description||data.error||data.message||`BB OAuth HTTP ${r.status}`);
  if(!data.access_token)throw new Error('O BB não retornou access_token.');
  return {cred,token:data.access_token,expires_in:data.expires_in||null,scope:data.scope||scopes,status:r.status};
}
function dataBbHoje(){const d=new Date();return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear()}
async function testarApiCobrancas(amb,entrada={}){
  const agencia=soDigitos(entrada.agencia);
  const conta=soDigitos(entrada.conta);
  if(!agencia||!conta)throw new Error('Informe agência e conta do convênio BB para o teste de consulta.');
  const o=await obterTokenOAuth(amb);
  const base=amb==='teste'?'https://api.hm.bb.com.br':'https://api.bb.com.br';
  const q=new URLSearchParams({
    'gw-dev-app-key':o.cred.app_key,
    indicadorSituacao:'B',
    agenciaBeneficiario:agencia,
    contaBeneficiario:conta,
    dataInicioMovimento:dataBbHoje(),
    dataFimMovimento:dataBbHoje()
  });
  const r=await getHttps({url:`${base}/cobrancas/v2/boletos?${q.toString()}`,headers:{Authorization:`Bearer ${o.token}`,Accept:'application/json'}});
  let data={};try{data=JSON.parse(r.text||'{}')}catch{data={raw:r.text}}
  // 200 confirma a chamada. 204 também é aceito como consulta sem conteúdo.
  if(r.status!==200&&r.status!==204){
    const detalhe=data?.erros?.[0]?.mensagem||data?.mensagem||data?.message||data?.error_description||data?.error||`API Cobranças v2 HTTP ${r.status}`;
    throw new Error(detalhe);
  }
  const quantidade=Array.isArray(data?.boletos)?data.boletos.length:(Array.isArray(data?.listaBoletos)?data.listaBoletos.length:null);
  return {ok:true,status:r.status,endpoint:'/cobrancas/v2/boletos',metodo:'GET',somente_consulta:true,data:dataBbHoje(),quantidade};
}


function dataBb(v){
  const d=v?new Date(String(v).includes('T')?v:String(v)+'T12:00:00'):new Date();
  if(isNaN(d))throw new Error('Data inválida.');
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
}
function amanhaDaData(v){const d=new Date(String(v)+'T12:00:00');d.setDate(d.getDate()+1);return dataBb(d.toISOString())}
function texto(v,max){return String(v||'').trim().replace(/[\\\r\n]/g,' ').slice(0,max)}
function configBbProducao(){return {...BB_CONFIG_PRODUCAO}}
function montarNossoNumeroBb(sequencial){
  const seq=soDigitos(sequencial);
  if(seq.length!==10)throw new Error('Informe o sequencial do Nosso Número com exatamente 10 dígitos.');
  if(seq==='0000000000')throw new Error('O sequencial do Nosso Número não pode ser zero.');
  return '000'+BB_CONFIG_PRODUCAO.numeroConvenio+seq;
}
async function obterProximoSequencialNossoNumero(amb){
  const reg=await obterRegistro(idRegistro(amb,'nosso_numero'));
  if(!reg)return String(BB_NOSSO_NUMERO_INICIAL).padStart(10,'0');
  const dados=descriptografar(reg)||{};
  const n=Number.parseInt(dados.proximo_sequencial,10);
  const proximo=Number.isFinite(n)&&n>=BB_NOSSO_NUMERO_INICIAL?n:BB_NOSSO_NUMERO_INICIAL;
  return String(proximo).padStart(10,'0');
}
async function avancarNossoNumero(amb,sequencialEmitido){
  const atual=await obterProximoSequencialNossoNumero(amb);
  const emitido=String(sequencialEmitido||'').replace(/\D/g,'');
  if(atual!==emitido)throw new Error(`O próximo Nosso Número mudou para ${atual}. Não foi possível confirmar esta emissão com segurança.`);
  const proximo=String(Number.parseInt(atual,10)+1).padStart(10,'0');
  await salvarRegistro(idRegistro(amb,'nosso_numero'),'bb',amb,'nosso_numero',{proximo_sequencial:proximo},{proximo_sequencial:proximo,ultimo_emitido:atual});
  return proximo;
}

async function prepararBoletoPiloto(amb,entrada={}){
  if(amb!=='producao')throw new Error('A emissão piloto desta tela está liberada somente em Produção.');
  const {numeroConvenio:convenio,numeroCarteira:carteira,numeroVariacaoCarteira:variacao,codigoModalidade:modalidade}=BB_CONFIG_PRODUCAO;
  const valor=Number(entrada.valorOriginal||0);
  const venc=String(entrada.dataVencimento||'');
  const doc=soDigitos(entrada.numeroInscricao), cep=soDigitos(entrada.cep);
  const nome=texto(entrada.nome,30), endereco=texto(entrada.endereco,30), bairro=texto(entrada.bairro,30), cidade=texto(entrada.cidade,30), uf=texto(entrada.uf,2).toUpperCase();
  if(convenio.length!==7||!carteira||!variacao)throw new Error('A configuração bancária oficial do BB está incompleta no servidor.');
  if(modalidade!==1)throw new Error('A configuração oficial desta integração deve permanecer na modalidade 1 (Simples).');
  if(!(valor>0))throw new Error('Informe um valor maior que zero.');
  if(!venc)throw new Error('Informe o vencimento.');
  if(![11,14].includes(doc.length))throw new Error('Informe CPF ou CNPJ válido do pagador.');
  if(!nome||!endereco||!bairro||!cidade||uf.length!==2||cep.length<7)throw new Error('Preencha nome, endereço, bairro, cidade, UF e CEP do pagador.');
  const tipoInscricao=doc.length===11?1:2;
  const atual=await obterProximoSequencialNossoNumero(amb);
  const solicitado=soDigitos(entrada.sequencialNossoNumero);
  if(solicitado && solicitado!==atual)throw new Error(`O Nosso Número foi atualizado por outra emissão. O próximo disponível agora é ${atual}. Gere a prévia novamente.`);
  const seq=atual;
  const nossoNumero=montarNossoNumeroBb(seq);
  const seuNumero=texto(entrada.numeroTituloBeneficiario,15).toUpperCase();
  if(!seuNumero)throw new Error('Informe o Nº do Título da cobrança. Use até 15 caracteres, por exemplo o número da NF ou do pedido.');
  const payload={
    numeroConvenio:Number(convenio),numeroCarteira:Number(carteira),numeroVariacaoCarteira:Number(variacao),codigoModalidade:modalidade,
    dataEmissao:dataBb(),dataVencimento:dataBb(venc),valorOriginal:Math.round(valor*100)/100,valorAbatimento:0,
    indicadorAceiteTituloVencido:'S',numeroDiasLimiteRecebimento:90,codigoAceite:'N',codigoTipoTitulo:2,descricaoTipoTitulo:'DUPLICATA MERCANTIL',
    indicadorPermissaoRecebimentoParcial:'N',numeroTituloBeneficiario:seuNumero,numeroTituloCliente:nossoNumero,
    mensagemBloquetoOcorrencia:'SOFISTICATTO COSMETICOS',desconto:{tipo:0},segundoDesconto:{tipo:0},terceiroDesconto:{tipo:0},
    jurosMora:{tipo:2,porcentagem:5.00},multa:{tipo:2,data:amanhaDaData(venc),porcentagem:2.00},
    pagador:{tipoInscricao,numeroInscricao:doc.replace(/^0+/,''),nome,endereco,bairro,cidade,cep:cep.replace(/^0+/,''),uf},
    indicadorPix:'N'
  };
  if(entrada.email)payload.email=texto(entrada.email,60);
  return {
    ok:true,
    configuracao:{numeroConvenio:convenio,numeroCarteira:carteira,numeroVariacaoCarteira:variacao,codigoModalidade:modalidade},
    sequencialNossoNumero:seq,
    numeroTituloCliente:nossoNumero,
    numeroTituloBeneficiario:seuNumero,
    resumo:{valorOriginal:payload.valorOriginal,dataVencimento:payload.dataVencimento,pagador:{tipoInscricao:payload.pagador.tipoInscricao,numeroInscricao:doc,nome:payload.pagador.nome,cidade:payload.pagador.cidade,uf:payload.pagador.uf},jurosMora:payload.jurosMora,multa:payload.multa,indicadorPermissaoRecebimentoParcial:payload.indicadorPermissaoRecebimentoParcial},
    payload
  };
}
async function emitirBoletoPiloto(amb,entrada={}){
  const preparo=await prepararBoletoPiloto(amb,entrada);
  const payload=preparo.payload;
  const nossoNumero=preparo.numeroTituloCliente;
  const seuNumero=preparo.numeroTituloBeneficiario;
  const o=await obterTokenOAuth(amb), base='https://api.bb.com.br';
  const url=`${base}/cobrancas/v2/boletos?gw-dev-app-key=${encodeURIComponent(o.cred.app_key)}`;
  const body=JSON.stringify(payload);
  const r=await requestHttps({url,method:'POST',headers:{Authorization:`Bearer ${o.token}`,Accept:'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body});
  let data={};try{data=JSON.parse(r.text||'{}')}catch{data={raw:r.text}}
  if(r.status<200||r.status>=300){const detalhe=data?.erros?.[0]?.mensagem||data?.mensagem||data?.message||data?.error_description||data?.error||`API Cobranças v2 HTTP ${r.status}`;throw new Error(detalhe)}
  const proximoSequencialNossoNumero=await avancarNossoNumero(amb,preparo.sequencialNossoNumero);
  return {ok:true,status:r.status,emitido:true,numeroTituloCliente:nossoNumero,numeroTituloBeneficiario:seuNumero,numeroBoletoBB:data.numero||data.numeroBoletoBB||data.numeroTituloCliente||nossoNumero,linhaDigitavel:data.linhaDigitavel||data.linhaDigitavelBoleto||null,codigoBarraNumerico:data.codigoBarraNumerico||data.codigoBarras||null,proximoSequencialNossoNumero,data};
}

async function testarOAuth(amb){
  const credReg=await obterRegistro(idRegistro(amb,'credenciais'));
  if(!credReg)throw new Error('Credenciais BB ainda não cadastradas neste ambiente.');
  const cred=descriptografar(credReg);
  const base=amb==='teste'?'https://oauth.hm.bb.com.br':'https://oauth.bb.com.br';

  // Cobranças v2 exige escopos OAuth mesmo quando o campo foi salvo vazio.
  // Para esta aplicação o Portal Developers BB informou que mTLS não é exigido,
  // portanto o teste OAuth NÃO depende do A1 e não envia PFX na conexão.
  const scopes=String(cred.scopes||BB_SCOPE_COBRANCAS).trim()||BB_SCOPE_COBRANCAS;
  // O BB tem histórico de exigir separação RFC3986 (%20), e URLSearchParams usa '+'.
  // Montamos o payload explicitamente para garantir %20 entre múltiplos escopos.
  const body=`grant_type=client_credentials&scope=${encodeURIComponent(scopes)}`;
  const auth=Buffer.from(`${cred.client_id}:${cred.client_secret}`,'utf8').toString('base64');
  const r=await postHttps({url:`${base}/oauth/token`,headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)},body});
  let data={};try{data=JSON.parse(r.text||'{}')}catch{data={raw:r.text}}
  if(r.status<200||r.status>=300)throw new Error(data.error_description||data.error||data.message||`BB OAuth HTTP ${r.status}`);
  return {ok:true,status:r.status,token_recebido:!!data.access_token,expires_in:data.expires_in||null,scope:data.scope||scopes,mtls_exigido:false};
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
      const scopes=String(req.body?.scopes??anterior.scopes??BB_SCOPE_COBRANCAS).trim()||BB_SCOPE_COBRANCAS;
      if(!app_key||!client_id||!client_secret)throw new Error('Informe App Key, Client ID e Client Secret na primeira configuração.');
      await salvarRegistro(idRegistro(amb,'credenciais'),'bb',amb,'credenciais',{app_key,client_id,client_secret,scopes},{scopes});
      return json(res,200,{ok:true,mensagem:'Credenciais salvas com criptografia no backend.'});
    }
    if(action==='atualizar-certificado'){
      const base64=String(req.body?.pfx_base64||'');const senha=String(req.body?.senha||'');
      if(!base64||!senha)throw new Error('Selecione o arquivo A1 e informe a senha.');
      const p=parsePfx(base64,senha);
      await salvarRegistro(idRegistro(amb,'certificado_pendente'),'bb',amb,'certificado_pendente',{pfx_base64:base64,senha,pem_cadeia:p.pem},{...p.metadata,nome_arquivo:String(req.body?.nome_arquivo||'certificado.pfx')});
      return json(res,200,{ok:true,mensagem:'A1 validado e armazenado com segurança. Para a Cobranças v2 desta aplicação, o Banco do Brasil não exige mTLS.',certificado:p.metadata});
    }
    if(action==='cadeia'){
      const certReg=(await obterRegistro(idRegistro(amb,'certificado_pendente')))||(await obterRegistro(idRegistro(amb,'certificado')));if(!certReg)throw new Error('Nenhum A1 cadastrado.');
      const cert=descriptografar(certReg);res.setHeader('Content-Type','application/x-pem-file; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="BB_CADEIA_${amb.toUpperCase()}.pem"`);return res.status(200).send(cert.pem_cadeia||'');
    }
    if(action==='testar'){
      const teste=await testarOAuth(amb);
      return json(res,200,{ok:true,teste});
    }
    if(action==='testar-api'){
      const teste=await testarApiCobrancas(amb,req.body||{});
      return json(res,200,{ok:true,teste});
    }
    if(action==='proximo-nosso-numero'){
      const sequencialNossoNumero=await obterProximoSequencialNossoNumero(amb);
      return json(res,200,{ok:true,sequencialNossoNumero});
    }
    if(action==='preparar-piloto'){
      const preparo=await prepararBoletoPiloto(amb,req.body||{});
      const {payload,...seguro}=preparo;
      return json(res,200,{ok:true,preparo:seguro});
    }
    if(action==='emitir-piloto'){
      const emissao=await emitirBoletoPiloto(amb,req.body||{});
      return json(res,201,{ok:true,emissao});
    }
    return json(res,400,{ok:false,erro:'Ação inválida.'});
  }catch(e){console.error('[BANCO-BB V150]',action,e);return json(res,500,{ok:false,erro:e.message||'Falha na integração Banco do Brasil.'});}
};
