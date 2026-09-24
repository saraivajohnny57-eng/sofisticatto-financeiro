const crypto=require('crypto');
const https=require('https');
const forge=require('node-forge');
const {exigirAdmin,supabaseRest,criptografar,descriptografar}=require('../lib/integracoes/_utils');

const TABELA='integracoes_bradesco_segredos';
const AMBIENTE_PADRAO='sandbox';

function json(res,status,data){res.status(status).json(data)}
function ambiente(v){return String(v||AMBIENTE_PADRAO).toLowerCase()==='producao'?'producao':'sandbox'}
function idRegistro(amb,tipo){return `bradesco:${ambiente(amb)}:${tipo}`}
async function obter(id){const r=await supabaseRest(TABELA,{query:`?id=eq.${encodeURIComponent(id)}&select=*`});return Array.isArray(r)?(r[0]||null):null}
async function salvar(id,amb,tipo,obj,metadata={}){
  const c=criptografar(obj), atual=await obter(id);
  const body={id,ambiente:ambiente(amb),tipo,payload_criptografado:c.payload,iv:c.iv,auth_tag:c.tag,metadata,atualizado_em:new Date().toISOString()};
  if(atual)return supabaseRest(TABELA,{method:'PATCH',query:`?id=eq.${encodeURIComponent(id)}`,body});
  return supabaseRest(TABELA,{method:'POST',body});
}
function pemValido(v,tipo){const s=String(v||'').trim();if(tipo==='cert'){if(!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(s))throw new Error('Certificado público PEM inválido.');}else{if(!/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]+-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(s))throw new Error('Chave privada PEM inválida.');}return s+'\n'}

function extrairP12Base64(p12Base64,senha){
  const b64=String(p12Base64||'').replace(/^data:[^,]+,/, '').trim();
  if(!b64)throw new Error('Selecione o certificado A1 no formato .p12 ou .pfx.');
  let der;try{der=forge.util.decode64(b64)}catch(_){throw new Error('Arquivo P12/PFX inválido.')}
  let p12;try{p12=forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der),false,String(senha||''))}catch(_){throw new Error('Não foi possível abrir o P12/PFX. Confira a senha do certificado.')}
  let key=null, cert=null;
  for(const sc of p12.safeContents||[])for(const bag of sc.safeBags||[]){if(!key&&bag.key)key=bag.key;if(!cert&&bag.cert)cert=bag.cert;}
  if(!key||!cert)throw new Error('O P12/PFX não contém certificado e chave privada utilizáveis.');
  const certPem=forge.pki.certificateToPem(cert), keyPem=forge.pki.privateKeyToPem(key);
  return {certPem,keyPem};
}

function validarParMtls(certPem,keyPem){
  const cert=new crypto.X509Certificate(pemValido(certPem,'cert'));
  const key=crypto.createPrivateKey(pemValido(keyPem,'key'));
  const pubCert=cert.publicKey.export({type:'spki',format:'der'});
  const pubKey=crypto.createPublicKey(key).export({type:'spki',format:'der'});
  if(!crypto.timingSafeEqual(Buffer.from(pubCert),Buffer.from(pubKey)))throw new Error('A chave privada não corresponde ao certificado público cadastrado no Bradesco.');
  const ate=new Date(cert.validTo), de=new Date(cert.validFrom), agora=new Date();
  if(agora<de)throw new Error('O certificado ainda não está válido.');
  if(agora>ate)throw new Error('O certificado está vencido.');
  return {subject:cert.subject,issuer:cert.issuer,valido_de:de.toISOString(),valido_ate:ate.toISOString(),dias_restantes:Math.ceil((ate-agora)/86400000),fingerprint256:cert.fingerprint256};
}
function gerarNuNegociacao(agencia,conta){
  const dig=v=>String(v||'').replace(/\D/g,'');
  const ag=dig(agencia), ct=dig(conta);
  if(!ag||!ct)return '';
  if(ag.length>4)throw new Error('Para gerar o número de negociação automaticamente, informe a agência sem dígito verificador, com até 4 números.');
  if(ct.length>7)throw new Error('Para gerar o número de negociação automaticamente, informe a conta sem dígito verificador, com até 7 números.');
  return ag.padStart(4,'0')+'0000000'+ct.padStart(7,'0');
}
function mascarar(v,inicio=2,fim=2){
  const s=String(v||''); if(!s)return ''; if(s.length<=inicio+fim)return '•'.repeat(s.length);
  return s.slice(0,inicio)+'•'.repeat(Math.min(10,s.length-inicio-fim))+s.slice(-fim);
}
async function dadosBancariosStatus(amb){
  const reg=await obter(idRegistro(amb,'dados-bancarios'));
  if(!reg)return {configurados:false,campos:{}};
  const d=descriptografar(reg)||{};
  return {configurados:!!(d.cnpj&&d.agencia&&d.conta&&d.carteira&&d.cedente&&d.negociacao),campos:{
    cnpj:mascarar(d.cnpj,2,2),agencia:mascarar(d.agencia,1,1),conta:mascarar(d.conta,1,1),
    carteira:mascarar(d.carteira,0,1),cedente:mascarar(d.cedente,1,1),negociacao:mascarar(d.negociacao,2,2)
  },presentes:{cnpj:!!d.cnpj,agencia:!!d.agencia,conta:!!d.conta,carteira:!!d.carteira,cedente:!!d.cedente,negociacao:!!d.negociacao},negociacao_origem:d.negociacao_origem||null};
}
async function status(amb){
  const cred=await obter(idRegistro(amb,'credenciais')), mtls=await obter(idRegistro(amb,'mtls'));
  return {ambiente:ambiente(amb),credenciais:{configuradas:!!cred,client_id:!!cred,client_secret:!!cred},mtls:{configurado:!!mtls,...(mtls?.metadata||{})},dados_bancarios:await dadosBancariosStatus(amb)};
}

function endpointToken(amb){
  return ambiente(amb)==='sandbox'
    ? 'https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token'
    : 'https://openapi.bradesco.com.br/auth/server-mtls/v2/token';
}
function criarPfxTemporario(certPem,keyPem){
  // Empacota em PKCS#12 somente em memória. Isso força o runtime TLS a apresentar
  // o certificado cliente no handshake mTLS, sem gravar chave privada em disco.
  const cert=forge.pki.certificateFromPem(pemValido(certPem,'cert'));
  const key=forge.pki.privateKeyFromPem(pemValido(keyPem,'key'));
  const senha=crypto.randomBytes(24).toString('hex');
  const asn1=forge.pkcs12.toPkcs12Asn1(key,[cert],senha,{algorithm:'3des'});
  const der=forge.asn1.toDer(asn1).getBytes();
  return {pfx:Buffer.from(der,'binary'),passphrase:senha};
}
function solicitarTokenMtls(url,cred,mtls){
  return new Promise((resolve,reject)=>{
    const u=new URL(url);
    const form=new URLSearchParams({grant_type:'client_credentials',client_id:cred.client_id,client_secret:cred.client_secret}).toString();
    let pacote;
    try{pacote=criarPfxTemporario(mtls.cert_pem,mtls.key_pem)}catch(e){return reject(new Error('Não foi possível preparar o certificado mTLS para o transporte HTTPS: '+e.message));}
    const agent=new https.Agent({
      pfx:pacote.pfx,passphrase:pacote.passphrase,
      minVersion:'TLSv1.2',rejectUnauthorized:true,keepAlive:false
    });
    const req=https.request({
      protocol:u.protocol,hostname:u.hostname,servername:u.hostname,port:u.port||443,path:u.pathname+u.search,method:'POST',
      agent,
      headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','Content-Length':Buffer.byteLength(form)},
      timeout:20000
    },r=>{
      let raw='';r.setEncoding('utf8');r.on('data',d=>{if(raw.length<200000)raw+=d});
      r.on('end',()=>{
        agent.destroy();
        let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={resposta:raw.slice(0,1500)}}
        if(r.statusCode>=200&&r.statusCode<300&&data.access_token){
          return resolve({http_status:r.statusCode,access_token:data.access_token,token_type:data.token_type||'Bearer',expires_in:data.expires_in||null,scope:data.scope||null,transporte_mtls:'pkcs12-memory'});
        }
        const detalhe=data.error_description||data.descricaoErro||data.message||data.error||`HTTP ${r.statusCode}`;
        const sslMsg=/SSL with client authentication is required/i.test(String(detalhe))
          ? 'O Bradesco não reconheceu o certificado cliente no handshake mTLS. Confirme se o Client ID/Secret pertencem à mesma credencial para a qual este certificado público foi provisionado no Portal Bradesco.'
          : `Bradesco recusou a autenticação: ${detalhe}`;
        const e=new Error(sslMsg);e.http_status=r.statusCode;e.resposta=data;reject(e);
      });
    });
    req.on('socket',socket=>{
      socket.once('secureConnect',()=>{
        try{
          const local=typeof socket.getCertificate==='function'?socket.getCertificate():null;
          if(!local||!Object.keys(local).length)console.warn('[BANCO-BRADESCO] TLS conectado sem certificado cliente local visível no socket.');
        }catch(_){}
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao conectar ao Bradesco Sandbox.')));
    req.on('error',e=>{agent.destroy();reject(e)});req.write(form);req.end();
  });
}

function consultarPendentesSandbox(token,mtls){
  return new Promise((resolve,reject)=>{
    const url='https://openapisandbox.prebanco.com.br:443/boleto/cobranca-pendente/v1/listar';
    const u=new URL(url);
    // Payload demonstrativo publicado pelo próprio Swagger do recurso Sandbox.
    // Ele serve apenas para validar o consumo do recurso; não representa dados da Sofisticatto.
    const payload={
      cpfCnpj:{cpfCnpj:'31759488',filial:'0',controle:'55'},
      produto:'05',negociacao:'38610041000',nossoNumero:'4197000001',
      cpfCnpjPagador:{cpfCnpj:'31759488',filial:'0',controle:'55'},
      dataVencimentoDe:'01012022',dataVencimentoAte:'01012022',
      dataRegistroDe:'1012020',dataRegistroAte:'24052020',
      valorTituloDe:'0',faixaVencto:'7',paginaAnterior:'0'
    };
    const body=JSON.stringify(payload);
    let pacote;try{pacote=criarPfxTemporario(mtls.cert_pem,mtls.key_pem)}catch(e){return reject(e)}
    const agent=new https.Agent({pfx:pacote.pfx,passphrase:pacote.passphrase,minVersion:'TLSv1.2',rejectUnauthorized:true,keepAlive:false});
    const req=https.request({protocol:u.protocol,hostname:u.hostname,servername:u.hostname,port:u.port||443,path:u.pathname,method:'POST',agent,headers:{Authorization:`Bearer ${token}`,'Accept':'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:20000},r=>{
      let raw='';r.setEncoding('utf8');r.on('data',d=>{if(raw.length<500000)raw+=d});r.on('end',()=>{
        agent.destroy();let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={resposta:raw.slice(0,4000)}}
        const result={http_status:r.statusCode,data};
        if(r.statusCode>=200&&r.statusCode<300)return resolve(result);
        const detalhe=data?.mensagem||data?.message||data?.erro||data?.descricao||data?.causa||`Bradesco respondeu HTTP ${r.statusCode}`;
        const e=new Error(`HTTP ${r.statusCode} — ${typeof detalhe==='string'?detalhe:JSON.stringify(detalhe).slice(0,800)}`);e.http_status=r.statusCode;e.resposta=data;reject(e);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao consultar títulos pendentes no Bradesco Sandbox.')));
    req.on('error',e=>{agent.destroy();reject(e)});req.write(body);req.end();
  });
}

function validarEndpointRegistroSandbox(token,mtls){
  return new Promise((resolve,reject)=>{
    const url='https://openapisandbox.prebanco.com.br:443/boleto/cobranca-registro/v1/cobranca';
    const u=new URL(url);
    // V185: diagnóstico deliberadamente sem dados de boleto. O objetivo é validar
    // autorização/mTLS/vínculo do recurso sem risco de registrar um título.
    const body='{}';
    let pacote;try{pacote=criarPfxTemporario(mtls.cert_pem,mtls.key_pem)}catch(e){return reject(e)}
    const agent=new https.Agent({pfx:pacote.pfx,passphrase:pacote.passphrase,minVersion:'TLSv1.2',rejectUnauthorized:true,keepAlive:false});
    const req=https.request({protocol:u.protocol,hostname:u.hostname,servername:u.hostname,port:u.port||443,path:u.pathname,method:'POST',agent,headers:{Authorization:`Bearer ${token}`,'Accept':'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:20000},r=>{
      let raw='';r.setEncoding('utf8');r.on('data',d=>{if(raw.length<200000)raw+=d});r.on('end',()=>{
        agent.destroy();let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={resposta:raw.slice(0,4000)}}
        // 400/412/422 são respostas esperadas para body vazio e comprovam que o endpoint foi alcançado.
        if([400,412,422].includes(r.statusCode))return resolve({http_status:r.statusCode,endpoint_alcancado:true,nenhum_boleto_emitido:true,data});
        // 2xx com body vazio seria comportamento inesperado: não afirmar emissão e bloquear avanço.
        if(r.statusCode>=200&&r.statusCode<300)return resolve({http_status:r.statusCode,endpoint_alcancado:true,resposta_inesperada:true,nenhum_boleto_emitido:false,data});
        const detalhe=data?.mensagem||data?.message||data?.erro||data?.descricao||data?.causa||`Bradesco respondeu HTTP ${r.statusCode}`;
        const e=new Error(`HTTP ${r.statusCode} — ${typeof detalhe==='string'?detalhe:JSON.stringify(detalhe).slice(0,800)}`);e.http_status=r.statusCode;e.resposta=data;reject(e);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao validar o endpoint de registro do Bradesco Sandbox.')));
    req.on('error',e=>{agent.destroy();reject(e)});req.write(body);req.end();
  });
}


function enviarRegistroCobrancaSandbox(token,mtls,payload){
  return new Promise((resolve,reject)=>{
    const url='https://openapisandbox.prebanco.com.br:443/boleto/cobranca-registro/v1/cobranca';
    const u=new URL(url), body=JSON.stringify(payload);
    let pacote;try{pacote=criarPfxTemporario(mtls.cert_pem,mtls.key_pem)}catch(e){return reject(e)}
    const agent=new https.Agent({pfx:pacote.pfx,passphrase:pacote.passphrase,minVersion:'TLSv1.2',rejectUnauthorized:true,keepAlive:false});
    const req=https.request({protocol:u.protocol,hostname:u.hostname,servername:u.hostname,port:u.port||443,path:u.pathname,method:'POST',agent,headers:{Authorization:`Bearer ${token}`,'Accept':'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:25000},r=>{
      let raw='';r.setEncoding('utf8');r.on('data',d=>{if(raw.length<700000)raw+=d});r.on('end',()=>{
        agent.destroy();let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={resposta:raw.slice(0,12000)}}
        resolve({http_status:r.statusCode,data});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao registrar a cobrança no Bradesco Sandbox.')));
    req.on('error',e=>{agent.destroy();reject(e)});req.write(body);req.end();
  });
}


function enviarRegistroCobrancaProducao(token,mtls,payload){
  return new Promise((resolve,reject)=>{
    const url='https://openapi.bradesco.com.br/boleto/cobranca-registro/v1/cobranca';
    const u=new URL(url), body=JSON.stringify(payload);
    let pacote;try{pacote=criarPfxTemporario(mtls.cert_pem,mtls.key_pem)}catch(e){return reject(e)}
    const agent=new https.Agent({pfx:pacote.pfx,passphrase:pacote.passphrase,minVersion:'TLSv1.2',rejectUnauthorized:true,keepAlive:false});
    const req=https.request({protocol:u.protocol,hostname:u.hostname,servername:u.hostname,port:u.port||443,path:u.pathname,method:'POST',agent,headers:{Authorization:`Bearer ${token}`,'Accept':'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:25000},r=>{
      let raw='';r.setEncoding('utf8');r.on('data',d=>{if(raw.length<700000)raw+=d});r.on('end',()=>{
        agent.destroy();let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={resposta:raw.slice(0,12000)}}
        resolve({http_status:r.statusCode,data});
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado ao registrar a cobrança no Bradesco Produção.')));
    req.on('error',e=>{agent.destroy();reject(e)});req.write(body);req.end();
  });
}

function montarPayloadRegistroReal(body,banco){
  const dig=v=>String(v||'').replace(/\D/g,'');
  // V252: a API de registro do Bradesco rejeita caracteres especiais em campos
  // de endereço. Normalizamos somente o payload enviado ao banco; o cadastro
  // original do cliente permanece intacto no sistema.
  const textoBradesco=(v,max=120)=>String(v||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9 ]+/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,max);
  const nome=textoBradesco(body?.nome,80), documento=dig(body?.documento), valor=Number(body?.valor), vencimento=String(body?.vencimento||'').trim(), seuNumero=String(body?.seuNumero||'').trim();
  const erros=[];if(!nome)erros.push('nome');if(![11,14].includes(documento.length))erros.push('CPF/CNPJ');if(!(valor>0))erros.push('valor');if(!/^\d{4}-\d{2}-\d{2}$/.test(vencimento))erros.push('vencimento');if(!seuNumero||seuNumero.length>10)erros.push('Seu Nº (1 a 10 caracteres)');
  const carteira=dig(banco.carteira).padStart(2,'0'), negociacao=dig(banco.negociacao), cnpj=dig(banco.cnpj);
  if(cnpj.length!==14)erros.push('CNPJ do beneficiário');if(negociacao.length!==18)erros.push('nuNegociacao com 18 dígitos');if(!carteira)erros.push('idProduto/carteira');
  const cep8=dig(body?.cep);let logradouroOriginal=String(body?.logradouro||'').trim(), numeroOriginal=String(body?.numero||'').trim();
  if(!numeroOriginal||/^S\/?N$/i.test(numeroOriginal)){const m=logradouroOriginal.match(/^(.*?)(?:\s+(?:N[º°]?|NÚMERO|NUMERO)\s*[.:#-]?\s*|,\s*)(\d+[A-Z0-9\/-]*)\s*$/i);if(m){logradouroOriginal=m[1].trim();numeroOriginal=m[2].trim();}}
  const logradouro=textoBradesco(logradouroOriginal,70), numero=textoBradesco(numeroOriginal,10);
  const complemento=textoBradesco(body?.complemento,40), bairro=textoBradesco(body?.bairro,40), municipio=textoBradesco(body?.municipio,40), uf=String(body?.uf||'').replace(/[^A-Za-z]/g,'').trim().toUpperCase().slice(0,2);
  if(cep8.length!==8)erros.push('CEP');if(!logradouro)erros.push('logradouro');if(!numero)erros.push('número');if(!bairro)erros.push('bairro');if(!municipio)erros.push('município');if(!/^[A-Z]{2}$/.test(uf))erros.push('UF');
  const hoje=new Date().toISOString().slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(vencimento)&&new Date(vencimento+'T12:00:00')<=new Date(hoje+'T12:00:00'))erros.push('vencimento deve ser posterior à data de emissão');
  const especie=Number(dig(body?.especie)||2);if(!Number.isInteger(especie)||especie<1||especie>99)erros.push('espécie do título');
  if(erros.length)throw new Error('Emissão bloqueada pela pré-validação: '+erros.join(', ')+'.');
  const fmt=v=>{const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);return `${m[3]}.${m[2]}.${m[1]}`};
  const cpfCnpjApi=documento.length===11?documento.padStart(14,'0'):documento;
  const payload={nuCPFCNPJ:cnpj.slice(0,8),filialCPFCNPJ:cnpj.slice(8,12),ctrlCPFCNPJ:cnpj.slice(12,14),idProduto:carteira,nuNegociacao:negociacao,nuCliente:seuNumero,dtEmissaoTitulo:fmt(hoje),dtVencimentoTitulo:fmt(vencimento),tpVencimento:0,vlNominalTitulo:Number(valor.toFixed(2)),cdEspecieTitulo:especie,cindcdAceitSacdo:'N',percentualJuros:0,vlJuros:0,qtdeDiasJuros:0,percentualMulta:0,vlMulta:0,qtdeDiasMulta:0,percentualDesconto1:0,vlDesconto1:0,dataLimiteDesconto1:'',nomePagador:nome,logradouroPagador:logradouro,nuLogradouroPagador:numero,...(complemento?{complementoLogradouroPagador:complemento}:{}),cepPagador:cep8.slice(0,5),complementoCepPagador:cep8.slice(5,8),bairroPagador:bairro,municipioPagador:municipio,ufPagador:uf,cdIndCpfcnpjPagador:documento.length===11?1:2,nuCpfcnpjPagador:cpfCnpjApi,listaMsgs:[{mensagem:textoBradesco(body?.mensagem||'COBRANCA SOFISTICATTO',80)||'COBRANCA SOFISTICATTO'}]};
  const resumo={pagador:nome,documento:mascarar(documento,3,2),valor:Number(valor.toFixed(2)),vencimento,seuNumero,endereco:`${logradouro}, ${numero}${complemento?' - '+complemento:''} - ${bairro} - ${municipio}/${uf} - CEP ${cep8.slice(0,5)}-${cep8.slice(5)}`,especie,mensagem:payload.listaMsgs[0].mensagem,contrato:{cnpj:mascarar(cnpj,2,2),carteira:mascarar(carteira,0,1),negociacao:mascarar(negociacao,4,4)}};
  const hash=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return {payload,resumo,hash};
}

function diagnosticarPayloadMinimoRegistroSandbox(token,mtls){
  return new Promise((resolve,reject)=>{
    const url='https://openapisandbox.prebanco.com.br:443/boleto/cobranca-registro/v1/cobranca';
    const u=new URL(url);
    // V199: consolida a serialização e reconhece o limite do Sandbox por cenários fixos.
    // A API exige número JSON com ponto e duas casas (ex.: 1.00), sem aspas; JSON.stringify(1.00) viraria 1.
    // Remove debitoAutomatico, rejeitado pelo default.json deste endpoint, e inclui os campos
    // sintéticos de Sacador/Avalista e listaMsgs solicitados pelo cenário principal.
    // Negociação/beneficiário continuam deliberadamente sintéticos para impedir registro real.
    // O payload nunca é devolvido ao navegador.
    const payload={
      nuCPFCNPJ:'000000000',
      filialCPFCNPJ:'0000',
      ctrlCPFCNPJ:'00',
      idProduto:'99',
      nuNegociacao:'000000000000000000',
      nuCliente:'55999',
      dtEmissaoTitulo:'17.09.2026',
      dtVencimentoTitulo:'30.09.2026',
      vlNominalTitulo:'1.00',
      cdEspecieTitulo:'01',
      cindcdAceitSacdo:'N',
      percentualJuros:'0',
      vlJuros:'0',
      qtdeDiasJuros:'0',
      percentualMulta:'0',
      vlMulta:'0',
      qtdeDiasMulta:'0',
      percentualDesconto1:'0',
      vlDesconto1:'0',
      dataLimiteDesconto1:'17.09.2026',
      nomePagador:'DIAGNOSTICO SANDBOX',
      logradouroPagador:'RUA DIAGNOSTICO',
      nuLogradouroPagador:'0',
      cepPagador:'99999',
      complementoCepPagador:'999',
      bairroPagador:'CENTRO',
      municipioPagador:'SAO PAULO',
      ufPagador:'SP',
      cdIndCpfcnpjPagador:'1',
      nuCpfcnpjPagador:'99999999999',
      nomeSacadorAvalista:'SACADOR DIAGNOSTICO',
      logradouroSacadorAvalista:'RUA TESTE',
      nuLogradouroSacadorAvalista:'1',
      complementoLogradouroSacadorAvalista:'SEM COMPLEMENTO',
      cepSacadorAvalista:'99999',
      complementoCepSacadorAvalista:'999',
      bairroSacadorAvalista:'CENTRO',
      municipioSacadorAvalista:'SAO PAULO',
      ufSacadorAvalista:'SP',
      cdIndCpfcnpjSacadorAvalista:'1',
      nuCpfcnpjSacadorAvalista:'99999999999',
      enderecoSacadorAvalista:'RUA TESTE 1',
      dddFoneSacadorAvalista:'011',
      foneSacadorAvalista:'99999999999',
      listaMsgs:[{mensagem:'DIAGNOSTICO SANDBOX 1'},{mensagem:'DIAGNOSTICO SANDBOX 2'}]
    };
    // Serializa normalmente e, somente no campo monetário validado pelo Bradesco,
    // remove as aspas preservando exatamente as duas casas decimais.
    // Resultado transmitido: "vlNominalTitulo":1.00 (não 1 e não "1.00").
    let body=JSON.stringify(payload);
    body=body.replace(/"vlNominalTitulo":"(-?\d+\.\d{2})"/, '"vlNominalTitulo":$1');
    let pacote;try{pacote=criarPfxTemporario(mtls.cert_pem,mtls.key_pem)}catch(e){return reject(e)}
    const agent=new https.Agent({pfx:pacote.pfx,passphrase:pacote.passphrase,minVersion:'TLSv1.2',rejectUnauthorized:true,keepAlive:false});
    const req=https.request({protocol:u.protocol,hostname:u.hostname,servername:u.hostname,port:u.port||443,path:u.pathname,method:'POST',agent,headers:{Authorization:`Bearer ${token}`,'Accept':'application/json','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:20000},r=>{
      let raw='';r.setEncoding('utf8');r.on('data',d=>{if(raw.length<200000)raw+=d});r.on('end',()=>{
        agent.destroy();let data={};try{data=raw?JSON.parse(raw):{}}catch(_){data={resposta:raw.slice(0,4000)}}
        if(r.statusCode>=400&&r.statusCode<500)return resolve({http_status:r.statusCode,diagnostico_seguro:true,data});
        if(r.statusCode>=200&&r.statusCode<300)return resolve({http_status:r.statusCode,diagnostico_seguro:false,resposta_inesperada:true,data});
        const detalhe=data?.mensagem||data?.message||data?.erro||data?.descricao||data?.causa||`Bradesco respondeu HTTP ${r.statusCode}`;
        const e=new Error(`HTTP ${r.statusCode} — ${typeof detalhe==='string'?detalhe:JSON.stringify(detalhe).slice(0,800)}`);e.http_status=r.statusCode;e.resposta=data;reject(e);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Tempo esgotado no diagnóstico completo Bradesco Sandbox.')));
    req.on('error',e=>{agent.destroy();reject(e)});req.write(body);req.end();
  });
}

module.exports=async function(req,res){
  if(!exigirAdmin(req,res))return;
  const action=String(req.query?.action||'status'), amb=ambiente(req.query?.ambiente||req.body?.ambiente);
  try{
    if(action==='status')return json(res,200,{ok:true,...await status(amb)});
    if(action==='salvar-credenciais'){
      const atual=await obter(idRegistro(amb,'credenciais'));let anterior={};if(atual)anterior=descriptografar(atual);
      const client_id=String(req.body?.client_id||anterior.client_id||'').trim();
      const client_secret=String(req.body?.client_secret||anterior.client_secret||'').trim();
      if(!client_id||!client_secret)throw new Error('Informe Client ID e Client Secret na primeira configuração.');
      await salvar(idRegistro(amb,'credenciais'),amb,'credenciais',{client_id,client_secret},{client_id_configurado:true});
      return json(res,200,{ok:true,mensagem:'Credenciais Bradesco salvas com criptografia no backend.'});
    }
    if(action==='obter-dados-bancarios'){
      return json(res,200,{ok:true,dados_bancarios:await dadosBancariosStatus(amb)});
    }
    if(action==='salvar-dados-bancarios'){
      const reg=await obter(idRegistro(amb,'dados-bancarios'));
      let anterior={}; if(reg)anterior=descriptografar(reg)||{};
      const somenteDigitos=v=>String(v||'').replace(/\D/g,'');
      const entrada=req.body||{};
      const dados={
        cnpj:somenteDigitos(entrada.cnpj)||anterior.cnpj||'',
        agencia:somenteDigitos(entrada.agencia)||anterior.agencia||'',
        conta:somenteDigitos(entrada.conta)||anterior.conta||'',
        carteira:somenteDigitos(entrada.carteira)||anterior.carteira||'',
        cedente:String(entrada.cedente||'').trim()||anterior.cedente||'',
        negociacao:'',
        negociacao_origem:''
      };
      const negociacaoManual=somenteDigitos(entrada.negociacao);
      if(negociacaoManual){
        if(negociacaoManual.length!==18)throw new Error('O número de negociação informado manualmente deve conter exatamente 18 números.');
        dados.negociacao=negociacaoManual;
        dados.negociacao_origem='manual';
      }else{
        // V221: regra Bradesco: agência (4) + 7 zeros + conta (7), sempre sem DV.
        // Recalcula quando agência/conta são enviados; se a edição não mexeu neles, preserva o valor salvo.
        const alterouAgenciaConta=!!(somenteDigitos(entrada.agencia)||somenteDigitos(entrada.conta));
        if(alterouAgenciaConta||!anterior.negociacao){
          dados.negociacao=gerarNuNegociacao(dados.agencia,dados.conta);
          dados.negociacao_origem='automatico_agencia_conta';
        }else{
          dados.negociacao=anterior.negociacao||'';
          dados.negociacao_origem=anterior.negociacao_origem||'salvo_anteriormente';
        }
      }
      if(dados.cnpj && dados.cnpj.length!==14)throw new Error('O CNPJ deve conter 14 números.');
      if(dados.carteira && dados.carteira.length>2)throw new Error('A carteira/produto deve conter no máximo 2 números.');
      if(dados.negociacao && dados.negociacao.length!==18)throw new Error('O número de negociação deve conter exatamente 18 números.');
      if(!dados.cnpj||!dados.agencia||!dados.conta||!dados.carteira||!dados.cedente)throw new Error('Na primeira configuração informe CNPJ, agência, conta, carteira/produto e cedente.');
      await salvar(idRegistro(amb,'dados-bancarios'),amb,'dados-bancarios',dados,{campos_configurados:Object.keys(dados).filter(k=>!!dados[k])});
      return json(res,200,{ok:true,mensagem:`Dados bancários Bradesco salvos com criptografia no backend. Nº negociação ${dados.negociacao_origem==='automatico_agencia_conta'?'gerado automaticamente pela agência + 7 zeros + conta.':'mantido conforme configuração.'}`,dados_bancarios:await dadosBancariosStatus(amb)});
    }
    if(action==='salvar-mtls'){
      const certPem=pemValido(req.body?.cert_pem,'cert'), keyPem=pemValido(req.body?.key_pem,'key');
      const meta=validarParMtls(certPem,keyPem);
      await salvar(idRegistro(amb,'mtls'),amb,'mtls',{cert_pem:certPem,key_pem:keyPem},{...meta});
      return json(res,200,{ok:true,mensagem:'Par mTLS validado e armazenado com criptografia no backend.',certificado:meta});
    }
    if(action==='salvar-mtls-p12'){
      const extraido=extrairP12Base64(req.body?.p12_base64,req.body?.p12_senha);
      const certPem=pemValido(extraido.certPem,'cert'), keyPem=pemValido(extraido.keyPem,'key');
      const meta=validarParMtls(certPem,keyPem);
      await salvar(idRegistro(amb,'mtls'),amb,'mtls',{cert_pem:certPem,key_pem:keyPem},{...meta,origem:'P12/PFX importado pelo portal'});
      return json(res,200,{ok:true,mensagem:'Certificado A1 P12/PFX validado, convertido em memória e armazenado com criptografia no backend. A senha do P12 não foi armazenada.',certificado:meta});
    }
    if(action==='validar-configuracao'){
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg)throw new Error('Client ID e Client Secret ainda não foram cadastrados.');
      if(!mtlsReg)throw new Error('Certificado público e chave privada mTLS ainda não foram cadastrados.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);const meta=validarParMtls(mtls.cert_pem,mtls.key_pem);
      if(!cred.client_id||!cred.client_secret)throw new Error('Credenciais incompletas.');
      return json(res,200,{ok:true,teste:{configuracao_valida:true,mtls_valido:true,credenciais_validas:true,certificado:meta},mensagem:`Configuração local do Bradesco ${amb==='producao'?'Produção':'Sandbox'} validada. Nenhum boleto foi emitido.`});
    }
    if(action==='consultar-pendentes'){
      if(amb!=='sandbox')throw new Error('A consulta de homologação está liberada somente para o Sandbox.');
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg||!mtlsReg)throw new Error('Cadastre as credenciais e o par mTLS antes da consulta.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);validarParMtls(mtls.cert_pem,mtls.key_pem);
      const auth=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
      const consulta=await consultarPendentesSandbox(auth.access_token,mtls);
      const d=consulta.data||{};
      return json(res,200,{ok:true,consulta:{http_status:consulta.http_status,status:d.status??consulta.http_status,mensagem:d.mensagem||'Operação realizada com sucesso.',causa:d.causa||null,pagina:d.pagina??null,indMaisPagina:d.indMaisPagina??null,qtdeTitulos:d.qtdeTitulos??(Array.isArray(d.titulos)?d.titulos.length:null),vtotTitulos:d.vtotTitulos??null,qtdeOcorr:d.qtdeOcorr??null,titulos:Array.isArray(d.titulos)?d.titulos.slice(0,20):[]},mensagem:'Consulta segura ao recurso de títulos pendentes do Bradesco Sandbox concluída. Nenhum boleto foi registrado, alterado ou baixado.'});
    }
    if(action==='verificar-prontidao-producao'){
      const prod='producao';
      const credReg=await obter(idRegistro(prod,'credenciais')), mtlsReg=await obter(idRegistro(prod,'mtls')), bancoReg=await obter(idRegistro(prod,'dados-bancarios'));
      const pendencias=[];
      if(!credReg)pendencias.push('credenciais OAuth de Produção');
      if(!mtlsReg)pendencias.push('certificado/chave mTLS de Produção');
      if(!bancoReg)pendencias.push('dados bancários/contrato de Produção');
      let certificado=null, contrato=null;
      if(mtlsReg){const mtls=descriptografar(mtlsReg)||{};certificado=validarParMtls(mtls.cert_pem,mtls.key_pem);}
      if(bancoReg){const b=descriptografar(bancoReg)||{};const faltam=['cnpj','agencia','conta','carteira','cedente','negociacao'].filter(k=>!String(b[k]||'').trim());if(faltam.length)pendencias.push('contrato de Produção incompleto: '+faltam.join(', '));contrato={cnpj:mascarar(b.cnpj,2,2),agencia:mascarar(b.agencia,1,1),conta:mascarar(b.conta,1,1),carteira:mascarar(b.carteira,0,1),cedente:mascarar(b.cedente,1,1),negociacao:mascarar(b.negociacao,4,4)};}
      return json(res,200,{ok:true,prontidao:{versao:'V233',ambiente:'PRODUCAO',pronto_para_configurar_emissao:pendencias.length===0,emissao_real_habilitada:false,post_producao_executado:false,pendencias,certificado:certificado?{valido_ate:certificado.valido_ate,dias_restantes:certificado.dias_restantes}:null,contrato},mensagem:pendencias.length?'Produção ainda possui pendências de configuração. Nenhum boleto foi enviado.':'Configuração de Produção encontrada e validada localmente. A emissão real continua bloqueada nesta V233; nenhum POST de cobrança foi executado.'});
    }
    if(action==='preparar-emissao-producao-v248'){
      if(amb!=='producao')throw new Error('A primeira emissão controlada é exclusiva do ambiente de Produção.');
      const reg=await obter(idRegistro(amb,'dados-bancarios')), credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!reg||!credReg||!mtlsReg)throw new Error('Contrato, credenciais e mTLS precisam estar configurados antes de preparar a emissão.');
      const banco=descriptografar(reg)||{}, mtls=descriptografar(mtlsReg)||{};validarParMtls(mtls.cert_pem,mtls.key_pem);
      const prep=montarPayloadRegistroReal(req.body,banco);
      return json(res,200,{ok:true,preparacao:{versao:'V248',ambiente:'PRODUCAO',pronto_para_confirmar:true,post_executado:false,hash:prep.hash,resumo:prep.resumo},mensagem:'Prévia de Produção preparada e congelada por hash. Nenhum endpoint de cobrança foi chamado.'});
    }
    if(action==='emitir-cobranca-producao-v248'){
      if(amb!=='producao')throw new Error('A emissão real é exclusiva do ambiente de Produção.');
      if(String(req.body?.confirmacao||'')!=='EMITIR_PRODUCAO')throw new Error('Confirmação final inválida. Nenhuma cobrança foi enviada.');
      const reg=await obter(idRegistro(amb,'dados-bancarios')), credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!reg||!credReg||!mtlsReg)throw new Error('Contrato, credenciais e mTLS precisam estar configurados antes da emissão.');
      const banco=descriptografar(reg)||{}, cred=descriptografar(credReg)||{}, mtls=descriptografar(mtlsReg)||{};validarParMtls(mtls.cert_pem,mtls.key_pem);
      const prep=montarPayloadRegistroReal(req.body,banco), hashRecebido=String(req.body?.preview_hash||'');
      if(!hashRecebido||hashRecebido!==prep.hash)throw new Error('Os dados mudaram depois da prévia. Gere uma nova prévia antes de emitir. Nenhuma cobrança foi enviada.');
      const seuNumero=String(req.body?.seuNumero||'').trim();
      const travaId=idRegistro(amb,'emissao-v248-'+crypto.createHash('sha256').update(seuNumero).digest('hex').slice(0,24));
      const anterior=await obter(travaId);
      let tentativaNumero=1, tentativaAnterior=null;
      if(anterior){
        tentativaAnterior=descriptografar(anterior)||{};
        const statusAnterior=Number(tentativaAnterior.http_status||0);
        // V252: somente uma rejeição HTTP 400 já respondida pelo Bradesco pode
        // ser corrigida e reenviada manualmente. HTTP 2xx, erro de transporte,
        // timeout ou qualquer resultado incerto continuam bloqueados.
        if(!(tentativaAnterior.estado==='RESPOSTA_RECEBIDA' && statusAnterior===400)){
          throw new Error('Este Seu Nº já possui uma tentativa que não pode ser reenviada automaticamente. O sistema manteve o bloqueio para evitar duplicidade. Confira o retorno/histórico antes de qualquer nova tentativa.');
        }
        tentativaNumero=Number(tentativaAnterior.tentativa_numero||1)+1;
      }
      await salvar(travaId,amb,'emissao',{seuNumero,hash:prep.hash,estado:'INICIADA',tentativa_numero:tentativaNumero,reenvio_correcao_http400:!!anterior,tentativa_anterior:tentativaAnterior?{http_status:tentativaAnterior.http_status||null,estado:tentativaAnterior.estado||null,resposta:tentativaAnterior.resposta||null,finalizada_em:tentativaAnterior.finalizada_em||null}:null,iniciada_em:new Date().toISOString()},{seuNumero_mascarado:mascarar(seuNumero,2,2),estado:'INICIADA',tentativa_numero:tentativaNumero,reenvio_correcao_http400:!!anterior});
      let retorno;
      try{
        const auth=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
        retorno=await enviarRegistroCobrancaProducao(auth.access_token,mtls,prep.payload);
      }catch(e){
        await salvar(travaId,amb,'emissao',{seuNumero,hash:prep.hash,estado:'ERRO_TRANSPORTE_SEM_RETRY',erro:String(e.message||e),finalizada_em:new Date().toISOString()},{seuNumero_mascarado:mascarar(seuNumero,2,2),estado:'ERRO_TRANSPORTE_SEM_RETRY'});
        throw new Error('A tentativa foi interrompida sem repetição automática: '+String(e.message||e)+'. Confira no Bradesco antes de tentar novamente.');
      }
      const d=retorno.data||{}, http2xx=retorno.http_status>=200&&retorno.http_status<300;
      const achar=(...ks)=>{for(const k of ks){const v=d?.[k]??d?.titulo?.[k]??d?.boleto?.[k]??d?.dados?.[k];if(v!==undefined&&v!==null&&String(v)!=='')return v}return null};
      const nossoNumero=d.nuTitulo??d.nossoNumero??d.numeroTitulo??d.nuTituloGerado??d?.titulo?.nuTitulo??null;
      await salvar(travaId,amb,'emissao',{seuNumero,hash:prep.hash,estado:'RESPOSTA_RECEBIDA',http_status:retorno.http_status,nossoNumero:nossoNumero||null,resposta:d,payload_hash:prep.hash,finalizada_em:new Date().toISOString()},{seuNumero_mascarado:mascarar(seuNumero,2,2),estado:'RESPOSTA_RECEBIDA',http_status:retorno.http_status});
      let historico={salvo:false,id:null,erro:null,impressao_disponivel:false};
      if(http2xx){
        const linha=achar('linhaDigitavel','linha_digitavel','linhaDig','linha');
        const barras=achar('codigoBarras','codigoBarra','codigo_barras','codigoBarraNumerico');
        const urlPdf=achar('urlBoleto','urlImagemBoleto','urlPdf','pdfUrl','pdf_url');
        const agora=new Date().toISOString();
        const hist={cliente_nome:String(req.body?.nome||''),cpf_cnpj:String(req.body?.documento||'').replace(/\D/g,''),endereco:String(req.body?.logradouro||''),numero:String(req.body?.numero||''),bairro:String(req.body?.bairro||''),cidade:String(req.body?.municipio||''),uf:String(req.body?.uf||'').toUpperCase(),cep:String(req.body?.cep||'').replace(/\D/g,''),email:req.body?.email||null,banco:'bradesco',banco_nome:'BRADESCO',tipo:'boleto',valor:Number(req.body?.valor||0),vencimento:String(req.body?.vencimento||''),numero_nf:seuNumero,referencia:'BRADESCO-'+seuNumero,status:'aberto',origem:'emissao_bradesco_v253',parcela_numero:1,parcela_total:1,nosso_numero:nossoNumero||null,linha_digitavel:linha||null,codigo_barras:barras||null,pdf_url:urlPdf||null,emitido_em:agora,atualizado_em:agora};
        try{
          const existentes=await supabaseRest('cobrancas_bancarias',{query:`?banco=eq.bradesco&numero_nf=eq.${encodeURIComponent(seuNumero)}&select=id&limit=1`});
          if(Array.isArray(existentes)&&existentes.length){historico.salvo=true;historico.id=existentes[0].id;}
          else{
            let gravado;
            try{gravado=await supabaseRest('cobrancas_bancarias',{method:'POST',body:hist});}
            catch(e1){
              const compat={cliente_nome:hist.cliente_nome,cpf_cnpj:hist.cpf_cnpj,banco:hist.banco,banco_nome:hist.banco_nome,tipo:hist.tipo,valor:hist.valor,vencimento:hist.vencimento,numero_nf:hist.numero_nf,referencia:hist.referencia,status:hist.status,origem:hist.origem,nosso_numero:hist.nosso_numero,linha_digitavel:hist.linha_digitavel,codigo_barras:hist.codigo_barras,pdf_url:hist.pdf_url,emitido_em:hist.emitido_em,atualizado_em:hist.atualizado_em};
              gravado=await supabaseRest('cobrancas_bancarias',{method:'POST',body:compat});
            }
            const row=Array.isArray(gravado)?gravado[0]:gravado;historico.salvo=true;historico.id=row?.id||null;
          }
          historico.impressao_disponivel=!!(linha||barras||urlPdf);
        }catch(eHist){historico.erro=String(eHist.message||eHist);}
        await salvar(travaId,amb,'emissao',{seuNumero,hash:prep.hash,estado:historico.salvo?'ACEITA_E_SALVA_NO_HISTORICO':'ACEITA_HISTORICO_PENDENTE',http_status:retorno.http_status,nossoNumero:nossoNumero||null,resposta:d,historico,finalizada_em:new Date().toISOString()},{seuNumero_mascarado:mascarar(seuNumero,2,2),estado:historico.salvo?'ACEITA_E_SALVA_NO_HISTORICO':'ACEITA_HISTORICO_PENDENTE',http_status:retorno.http_status,historico_salvo:historico.salvo});
      }
      return json(res,200,{ok:true,registro:{ambiente:'PRODUCAO',versao:'V253',http_status:retorno.http_status,enviado_ao_bradesco:true,http_2xx_bradesco:http2xx,reenvio_automatico:false,seuNumero,nossoNumero_retornado:nossoNumero,historico,resposta_bradesco:d},mensagem:http2xx?(historico.salvo?'Bradesco respondeu HTTP 2xx e o boleto foi salvo no Histórico pelo backend.':'Bradesco respondeu HTTP 2xx. A emissão foi preservada no backend, mas houve falha ao copiar para o Histórico. NÃO reemita; recupere esta emissão antes de qualquer nova tentativa.'):'O Bradesco respondeu HTTP '+retorno.http_status+'. A tentativa foi registrada e não será repetida automaticamente.'});
    }
    if(action==='preparar-homologacao-controlada'){
      if(amb!=='sandbox')throw new Error('A preparação controlada está liberada somente para o Sandbox.');
      const reg=await obter(idRegistro(amb,'dados-bancarios'));
      if(!reg)throw new Error('Cadastre os dados bancários do contrato Bradesco antes de preparar a homologação.');
      const banco=descriptografar(reg)||{};
      const faltam=['cnpj','agencia','conta','carteira','cedente','negociacao'].filter(k=>!String(banco[k]||'').trim());
      if(faltam.length)throw new Error('Configuração bancária incompleta: '+faltam.join(', ')+'.');
      const somenteDigitos=v=>String(v||'').replace(/\D/g,'');
      const nome=String(req.body?.nome||'').trim();
      const documento=somenteDigitos(req.body?.documento);
      const valor=Number(req.body?.valor);
      const vencimento=String(req.body?.vencimento||'').trim();
      const seuNumero=String(req.body?.seuNumero||'').trim();
      const erros=[];
      if(!nome)erros.push('nome do pagador');
      if(![11,14].includes(documento.length))erros.push('CPF/CNPJ do pagador com 11 ou 14 dígitos');
      if(!(valor>0))erros.push('valor maior que zero');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(vencimento))erros.push('vencimento válido');
      if(!seuNumero)erros.push('Seu Nº (NF/pedido)');
      if(seuNumero.length>10)erros.push('Seu Nº (nuCliente) com no máximo 10 caracteres');
      if(erros.length)throw new Error('Complete a prévia: '+erros.join(', ')+'.');
      const carteira=somenteDigitos(banco.carteira).padStart(2,'0');
      const negociacao=somenteDigitos(banco.negociacao);
      if(negociacao.length!==18)throw new Error('O Nº negociação armazenado não possui 18 dígitos. Revise os dados bancários.');
      const fmtData=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:String(v||'')};
      const cep8=somenteDigitos(req.body?.cep);
      const endereco={logradouro:String(req.body?.logradouro||'').trim(),numero:String(req.body?.numero||'').trim(),complemento:String(req.body?.complemento||'').trim(),bairro:String(req.body?.bairro||'').trim(),municipio:String(req.body?.municipio||'').trim(),uf:String(req.body?.uf||'').trim().toUpperCase(),cep:cep8};
      // V226: muitos cadastros antigos trazem o número embutido no logradouro e S/N no campo próprio.
      // Ex.: "RUA TRAVESSA MOJU N 98" + "S/N" -> logradouro "RUA TRAVESSA MOJU" + número "98".
      let enderecoNormalizadoAutomaticamente=false;
      if(!endereco.numero || /^S\/?N$/i.test(endereco.numero)){
        const m=endereco.logradouro.match(/^(.*?)(?:\s+(?:N[º°]?|NÚMERO|NUMERO)\s*[.:#-]?\s*|,\s*)(\d+[A-Z0-9\/-]*)\s*$/i);
        if(m && m[1].trim() && m[2]){endereco.logradouro=m[1].trim();endereco.numero=m[2].trim();enderecoNormalizadoAutomaticamente=true;}
      }
      const emissao=new Date().toISOString().slice(0,10);
      const especieNum=Number(String(req.body?.especie||'2').replace(/\D/g,''));
      const cpfCnpjApi=documento.length===11?documento.padStart(14,'0'):documento;
      const payloadCompleto={
        nuCPFCNPJ:Number(somenteDigitos(banco.cnpj).slice(0,8)),filialCPFCNPJ:Number(somenteDigitos(banco.cnpj).slice(8,12)),ctrlCPFCNPJ:Number(somenteDigitos(banco.cnpj).slice(-2)),
        idProduto:carteira,nuNegociacao:negociacao,nuCliente:seuNumero,dtEmissaoTitulo:fmtData(emissao),dtVencimentoTitulo:fmtData(vencimento),tpVencimento:0,vlNominalTitulo:Number(valor.toFixed(2)),
        cdEspecieTitulo:especieNum,cindcdAceitSacdo:'N',percentualJuros:0,vlJuros:0,qtdeDiasJuros:0,percentualMulta:0,vlMulta:0,qtdeDiasMulta:0,percentualDesconto1:0,vlDesconto1:0,dataLimiteDesconto1:'',
        nomePagador:nome,logradouroPagador:endereco.logradouro,nuLogradouroPagador:endereco.numero,...(endereco.complemento?{complementoLogradouroPagador:endereco.complemento}:{}),cepPagador:Number(cep8.slice(0,5)||0),complementoCepPagador:Number(cep8.slice(5,8)||0),bairroPagador:endereco.bairro,municipioPagador:endereco.municipio,ufPagador:endereco.uf,cdIndCpfcnpjPagador:documento.length===11?1:2,nuCpfcnpjPagador:Number(cpfCnpjApi),
        listaMsgs:[{mensagem:String(req.body?.mensagem||'').trim()||'COBRANCA SOFISTICATTO'}]
      };
      const pendencias=[], alertas=[];
      if(cep8.length!==8)pendencias.push('CEP do pagador deve ter 8 dígitos'); if(!endereco.logradouro)pendencias.push('logradouro do pagador'); if(!endereco.numero)pendencias.push('número do endereço do pagador'); if(!endereco.bairro)pendencias.push('bairro do pagador'); if(!endereco.municipio)pendencias.push('município do pagador'); if(!/^[A-Z]{2}$/.test(endereco.uf))pendencias.push('UF do pagador com 2 letras');
      if(!/^\d{2}\.\d{2}\.\d{4}$/.test(payloadCompleto.dtEmissaoTitulo))pendencias.push('data de emissão fora do formato DD.MM.AAAA');
      if(!/^\d{2}\.\d{2}\.\d{4}$/.test(payloadCompleto.dtVencimentoTitulo))pendencias.push('data de vencimento fora do formato DD.MM.AAAA');
      if(new Date(vencimento+'T12:00:00')<=new Date(emissao+'T12:00:00'))pendencias.push('vencimento deve ser posterior à data de emissão');
      if(!Number.isInteger(especieNum)||especieNum<1||especieNum>99)pendencias.push('espécie do título inválida');
      alertas.push('Nosso Nº (nuTitulo) não é o Seu Nº. Nesta preparação ele não é enviado, pois o layout consultado informa que nuTitulo é opcional e pode ser gerado pelo banco.');
      if(enderecoNormalizadoAutomaticamente)alertas.push('Número do endereço separado automaticamente do logradouro para o payload Bradesco.');
      const payloadSanitizado={...payloadCompleto,nuCPFCNPJ:mascarar(String(payloadCompleto.nuCPFCNPJ),2,2),filialCPFCNPJ:mascarar(String(payloadCompleto.filialCPFCNPJ),1,1),ctrlCPFCNPJ:'••',nuNegociacao:mascarar(negociacao,4,4),nuCpfcnpjPagador:mascarar(cpfCnpjApi,3,2)};
      const previa={ambiente:'SANDBOX',versao:'V233',modo:'PAYLOAD_LAYOUT_REVISADO_SEM_ENVIO',envio_ao_bradesco:false,bloqueio_registro:true,
        contrato:{cnpj_beneficiario:mascarar(somenteDigitos(banco.cnpj),2,2),agencia:mascarar(somenteDigitos(banco.agencia),1,1),conta:mascarar(somenteDigitos(banco.conta),1,1),idProduto:carteira,cedente:mascarar(banco.cedente,1,1),nuNegociacao:mascarar(negociacao,4,4),nuNegociacao_digitos:negociacao.length,nuNegociacao_origem:banco.negociacao_origem||'configurado'},
        pagador:{nome,cpfCnpj:mascarar(documento,3,2),tipo_documento:documento.length===11?'CPF':'CNPJ',endereco},titulo:{valor:Number(valor.toFixed(2)),vencimento,seuNumero,identificacao_seu_numero:'nuCliente',nossoNumero:null,identificacao_nosso_numero:'nuTitulo (omitido; geração pelo banco)',especie:payloadCompleto.cdEspecieTitulo},
        normalizacoes:{endereco_numero_separado:enderecoNormalizadoAutomaticamente,cpf_api_14_posicoes:cpfCnpjApi},
        validacoes:{contrato_completo:true,idProduto_preenchido:!!carteira,nuNegociacao_18_digitos:negociacao.length===18,pagador_valido:true,endereco_pagador_completo:pendencias.length===0,formato_datas_dd_mm_aaaa:true,desconto_sem_data_limite:payloadCompleto.dataLimiteDesconto1==='',payload_pronto_para_teste:pendencias.length===0},pendencias,alertas,payload_sanitizado:payloadSanitizado,
        observacao:'V232 realinha o payload ao layout revisado: tpVencimento=0 volta ao payload; complementoLogradouroPagador é enviado somente quando preenchido; Seu Nº (nuCliente) e Nosso Nº (nuTitulo) permanecem separados. O Sandbox continua sendo tratado como validador de cenários. Esta preparação NÃO executa POST.'};
      return json(res,200,{ok:true,previa,mensagem:'Payload completo de homologação preparado no backend para revisão. Nenhum dado foi enviado ao endpoint de registro do Bradesco.'});
    }
    if(action==='registrar-cobranca-sandbox-controlada'){
      if(amb!=='sandbox')throw new Error('O registro controlado está liberado somente para o Sandbox.');
      if(String(req.body?.confirmacao||'')!=='TESTAR_SANDBOX')throw new Error('Confirmação de segurança inválida. Nenhuma cobrança foi enviada.');
      const reg=await obter(idRegistro(amb,'dados-bancarios'));
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!reg||!credReg||!mtlsReg)throw new Error('Contrato, credenciais e mTLS precisam estar configurados antes do teste de registro.');
      const banco=descriptografar(reg)||{}, cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);validarParMtls(mtls.cert_pem,mtls.key_pem);
      const dig=v=>String(v||'').replace(/\D/g,'');
      const nome=String(req.body?.nome||'').trim(), documento=dig(req.body?.documento), valor=Number(req.body?.valor), vencimento=String(req.body?.vencimento||'').trim(), seuNumero=String(req.body?.seuNumero||'').trim();
      const erros=[];if(!nome)erros.push('nome');if(![11,14].includes(documento.length))erros.push('CPF/CNPJ');if(!(valor>0))erros.push('valor');if(!/^\d{4}-\d{2}-\d{2}$/.test(vencimento))erros.push('vencimento');if(!seuNumero||seuNumero.length>10)erros.push('Seu Nº (1 a 10 caracteres)');
      const carteira=dig(banco.carteira).padStart(2,'0'), negociacao=dig(banco.negociacao), cnpj=dig(banco.cnpj);
      if(cnpj.length!==14)erros.push('CNPJ do beneficiário');if(negociacao.length!==18)erros.push('nuNegociacao com 18 dígitos');if(!carteira)erros.push('idProduto/carteira');
      const cep8=dig(req.body?.cep);let logradouro=String(req.body?.logradouro||'').trim(), numero=String(req.body?.numero||'').trim();
      if(!numero||/^S\/?N$/i.test(numero)){const m=logradouro.match(/^(.*?)(?:\s+(?:N[º°]?|NÚMERO|NUMERO)\s*[.:#-]?\s*|,\s*)(\d+[A-Z0-9\/-]*)\s*$/i);if(m){logradouro=m[1].trim();numero=m[2].trim();}}
      const bairro=String(req.body?.bairro||'').trim(), municipio=String(req.body?.municipio||'').trim(), uf=String(req.body?.uf||'').trim().toUpperCase();
      if(cep8.length!==8)erros.push('CEP');if(!logradouro)erros.push('logradouro');if(!numero)erros.push('número');if(!bairro)erros.push('bairro');if(!municipio)erros.push('município');if(!/^[A-Z]{2}$/.test(uf))erros.push('UF');
      if(erros.length)throw new Error('Registro bloqueado pela pré-validação: '+erros.join(', ')+'.');
      const fmt=v=>{const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);return `${m[3]}.${m[2]}.${m[1]}`};
      const emissao=new Date().toISOString().slice(0,10), cpfCnpjApi=documento.length===11?documento.padStart(14,'0'):documento, especie=Number(dig(req.body?.especie)||2);
      const payload={
        nuCPFCNPJ:cnpj.slice(0,8),filialCPFCNPJ:cnpj.slice(8,12),ctrlCPFCNPJ:cnpj.slice(12,14),idProduto:carteira,nuNegociacao:negociacao,nuCliente:seuNumero,
        dtEmissaoTitulo:fmt(emissao),dtVencimentoTitulo:fmt(vencimento),tpVencimento:0,vlNominalTitulo:Number(valor.toFixed(2)),cdEspecieTitulo:especie,cindcdAceitSacdo:'N',
        percentualJuros:0,vlJuros:0,qtdeDiasJuros:0,percentualMulta:0,vlMulta:0,qtdeDiasMulta:0,percentualDesconto1:0,vlDesconto1:0,dataLimiteDesconto1:'',
        nomePagador:nome,logradouroPagador:logradouro,nuLogradouroPagador:numero,...(String(req.body?.complemento||'').trim()?{complementoLogradouroPagador:String(req.body.complemento).trim()}:{}),cepPagador:cep8.slice(0,5),complementoCepPagador:cep8.slice(5,8),bairroPagador:bairro,municipioPagador:municipio,ufPagador:uf,cdIndCpfcnpjPagador:documento.length===11?1:2,nuCpfcnpjPagador:cpfCnpjApi,
        listaMsgs:[{mensagem:String(req.body?.mensagem||'').trim()||'COBRANCA SOFISTICATTO'}]
      };
      const auth=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
      const retorno=await enviarRegistroCobrancaSandbox(auth.access_token,mtls,payload);
      const http2xx=retorno.http_status>=200&&retorno.http_status<300;
      const d=retorno.data||{};
      const nossoNumero=d.nuTitulo??d.nossoNumero??d.numeroTitulo??d.nuTituloGerado??d?.titulo?.nuTitulo??null;
      // V232: a rota interna sempre responde ok:true quando conseguiu conversar com o Bradesco.
      // O status do Bradesco fica em registro.http_status. Assim o frontend não perde o body quando
      // o banco responde 4xx/422, nem confunde HTTP da rota Vercel (200) com HTTP do Bradesco.
      return json(res,200,{ok:true,registro:{ambiente:'SANDBOX',versao:'V233',http_status:retorno.http_status,enviado_ao_bradesco:true,http_2xx_bradesco:http2xx,confirmado_pelo_bradesco:false,status_negocio:'NAO_CONFIRMADO',seuNumero,nuTitulo_enviado:false,nossoNumero_retornado:nossoNumero,resposta_bradesco:d},mensagem:http2xx?'O Bradesco respondeu HTTP 2xx. O sistema preservou a resposta completa, mas não marca o título como confirmado apenas pelo HTTP. Analise os campos retornados antes de novo envio.':'O Bradesco respondeu HTTP '+retorno.http_status+'. A resposta completa foi preservada abaixo. Nenhuma nova tentativa foi feita automaticamente.'});
    }
    if(action==='diagnosticar-payload-minimo'){
      if(amb!=='sandbox')throw new Error('O diagnóstico está liberado somente para o Sandbox.');
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg||!mtlsReg)throw new Error('Cadastre as credenciais e o par mTLS antes do diagnóstico.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);validarParMtls(mtls.cert_pem,mtls.key_pem);
      const auth=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
      const teste=await diagnosticarPayloadMinimoRegistroSandbox(auth.access_token,mtls);
      if(teste.resposta_inesperada)return json(res,200,{ok:false,teste:{http_status:teste.http_status},mensagem:'Resposta 2xx inesperada. O sistema interrompeu o diagnóstico e não fará novas tentativas automáticas.'});
      const dOriginal=teste.data||{};
      // V191: algumas respostas do Bradesco chegam em uma segunda camada JSON dentro de `resposta`.
      // Desserializa somente essa camada para que os erros de validação sejam classificados corretamente.
      let d=dOriginal;
      if(typeof dOriginal?.resposta==='string'){
        try{const interno=JSON.parse(dOriginal.resposta);if(interno&&typeof interno==='object')d=interno;}catch(_){}
      }
      // V199: separa o resultado principal (default.json / errors / Error400Response)
      // dos cenários internos erro-*.json do Sandbox. Estes cenários não são usados para montar o boleto.
      const mensagensPrincipais=[];
      const mensagensCenarios=[];
      if(Array.isArray(d.errors)) for(const msg of d.errors){ if(typeof msg==='string') mensagensPrincipais.push(msg); }
      if(Array.isArray(d.errosValidacao)) for(const bloco of d.errosValidacao){
        if(typeof bloco==='string'){ mensagensPrincipais.push(bloco); continue; }
        const nome=String(bloco?.nomeDoArquivo||'');
        const destino=(nome && nome.toLowerCase()!=='default.json')?mensagensCenarios:mensagensPrincipais;
        if(typeof bloco?.mensagem==='string') destino.push(bloco.mensagem);
        if(Array.isArray(bloco?.erros)) for(const msg of bloco.erros){ if(typeof msg==='string') destino.push(msg); }
      }
      if(d.errosValidacao && !Array.isArray(d.errosValidacao) && typeof d.errosValidacao==='object'){
        if(typeof d.errosValidacao.mensagem==='string') mensagensPrincipais.push(d.errosValidacao.mensagem);
      }
      const unicas=[...new Set(mensagensPrincipais)];
      const cenariosUnicos=[...new Set(mensagensCenarios)];
      const ausentes=unicas.filter(x=>/não foi enviado na requisição/i.test(x)).slice(0,40);
      const rejeitados=unicas.filter(x=>/argumento .+ não existe no arquivo/i.test(x)).slice(0,40);
      const formato=unicas.filter(x=>/(formato|inválid|invalido|tamanho|quantidade|deve ser|permitid|não bateu|valor)/i.test(x)&&!/não existe no arquivo/i.test(x)).slice(0,40);
      const regras=unicas.filter(x=>!ausentes.includes(x)&&!rejeitados.includes(x)&&!formato.includes(x)).slice(0,40);
      // V189/V190: revela a ESTRUTURA sanitizada da resposta 4xx, sem expor segredos. da resposta 4xx, sem adivinhar o formato de errosValidacao.
      // A lista abaixo bloqueia por nome qualquer propriedade potencialmente sensível.
      const CHAVE_SENSIVEL=/(authorization|bearer|token|secret|client.?secret|private|privada|key|chave|certificate|certificado|senha|password|pfx|pkcs|credential|credencial|access.?token|refresh.?token)/i;
      let totalNos=0;
      const MAX_NOS=80, MAX_PROF=6, MAX_ARRAY=15, MAX_TEXTO=500;
      function estruturaSegura(valor,prof=0){
        if(totalNos>=MAX_NOS)return '[limite de diagnóstico atingido]';
        totalNos++;
        if(valor===null)return null;
        if(prof>MAX_PROF)return '[profundidade limitada]';
        if(Array.isArray(valor))return valor.slice(0,MAX_ARRAY).map(v=>estruturaSegura(v,prof+1));
        if(typeof valor==='object'){
          const out={};
          for(const [k,v] of Object.entries(valor)){
            if(totalNos>=MAX_NOS)break;
            if(CHAVE_SENSIVEL.test(k)){out[k]='[REMOVIDO POR SEGURANÇA]';continue;}
            out[k]=estruturaSegura(v,prof+1);
          }
          return out;
        }
        if(typeof valor==='string')return valor.slice(0,MAX_TEXTO);
        if(typeof valor==='number'||typeof valor==='boolean')return valor;
        return String(valor).slice(0,MAX_TEXTO);
      }
      // Retorna apenas a resposta do Bradesco sanitizada. O payload enviado nunca é incluído.
      const estrutura=estruturaSegura(d);
      const msgPrincipal=String(d.mensagem||d.message||'Validação do payload acionada.');
      const sandboxCenarioFixo=teste.http_status===422 && /não atende aos cenários existentes para Sandbox/i.test(msgPrincipal);
      const validacaoEstruturalConcluida=sandboxCenarioFixo && unicas.length===0 && ausentes.length===0 && rejeitados.length===0 && formato.length===0;
      return json(res,200,{ok:true,diagnostico:{http_status:teste.http_status,codigo:d.codigo||null,mensagem:msgPrincipal,sandbox_cenario_fixo:sandboxCenarioFixo,validacao_estrutural_concluida:validacaoEstruturalConcluida,proximo_passo:validacaoEstruturalConcluida?'Usar os dados bancários reais/homologados do beneficiário fornecidos pelo Bradesco (CPF/CNPJ do beneficiário, carteira/idProduto e nuNegociacao). Não tentar descobrir esses valores por força bruta no Sandbox.':null,resumo:{total_mensagens:mensagensPrincipais.length,total_unicas:unicas.length,campos_ausentes:ausentes,campos_rejeitados:rejeitados,erros_formato:formato,regras:regras,cenarios_sandbox_ignorados:cenariosUnicos.length},estrutura,total_nos:totalNos},seguranca:'V199 reconhece HTTP 422 de cenário fixo do Sandbox como limite da massa sintética quando não há erros estruturais. Mantém vlNominalTitulo com duas casas decimais e não tenta adivinhar dados bancários reais. Token, Client Secret, Authorization, certificado, chave privada, credenciais e payload enviado não são devolvidos ao navegador.'});
    }
    if(action==='validar-endpoint-registro'){
      if(amb!=='sandbox')throw new Error('A validação do registro está liberada somente para o Sandbox.');
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg||!mtlsReg)throw new Error('Cadastre as credenciais e o par mTLS antes da validação.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);validarParMtls(mtls.cert_pem,mtls.key_pem);
      const auth=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
      const teste=await validarEndpointRegistroSandbox(auth.access_token,mtls);
      if(teste.resposta_inesperada) return json(res,200,{ok:false,teste,mensagem:'O endpoint respondeu 2xx a um corpo vazio. O sistema bloqueou qualquer avanço automático; revise a resposta antes de continuar.'});
      const d=teste.data||{};
      return json(res,200,{ok:true,teste:{http_status:teste.http_status,endpoint_alcancado:true,nenhum_boleto_emitido:true,codigo:d.codigo||null,mensagem:d.mensagem||d.message||'Endpoint alcançado e validação de campos acionada.'},mensagem:'Endpoint oficial de registro do Bradesco Sandbox alcançado com mTLS + Bearer. O teste enviou somente {} e não continha dados suficientes para registrar boleto.'});
    }
    if(action==='testar-autenticacao'){
      // V233: autenticação OAuth/mTLS pode ser testada também em Produção.
      // Esta ação chama somente o endpoint de token; nunca chama registro/consulta de cobrança.
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg||!mtlsReg)throw new Error('Cadastre as credenciais e o par mTLS antes do teste externo.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);validarParMtls(mtls.cert_pem,mtls.key_pem);
      const teste=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
      return json(res,200,{ok:true,teste:{autenticacao:true,ambiente:amb,endpoint:amb==='producao'?'openapi.bradesco.com.br':'openapisandbox.prebanco.com.br',http_status:teste.http_status,token_type:teste.token_type,expires_in:teste.expires_in,scope:teste.scope,nenhum_post_cobranca:true},mensagem:`Autenticação mTLS/OAuth do Bradesco ${amb==='producao'?'Produção':'Sandbox'} concluída com sucesso. Somente o endpoint de token foi chamado; nenhum boleto foi consultado, alterado ou emitido.`});
    }
    return json(res,400,{ok:false,erro:'Ação inválida.'});
  }catch(e){
    console.error('[BANCO-BRADESCO]',action,e);
    const upstream=Number(e?.http_status)||0;
    const statusHttp=(upstream>=400&&upstream<=599)?upstream:500;
    const resposta=e?.resposta&&typeof e.resposta==='object'?e.resposta:null;
    const msg=String(e?.message||'Falha na integração Bradesco.');
    const precisaMigracao=/integracoes_bradesco_segredos_tipo_check|violates check constraint/i.test(msg);
    const erroPublico=precisaMigracao
      ? 'A trava de segurança da emissão não pôde ser gravada porque falta a migração SQL V251. O POST de cobrança NÃO foi executado. Aplique o arquivo SQL_V251_BRADESCO_EMISSAO.sql no Supabase e gere uma nova conferência.'
      : msg;
    return json(res,statusHttp,{ok:false,erro:erroPublico,codigo:precisaMigracao?'BRADESCO_SQL_V251_PENDENTE':null,post_cobranca_executado:precisaMigracao?false:undefined,bradesco_http:upstream||null,detalhe:precisaMigracao?null:resposta});
  }
};
