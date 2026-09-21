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
function pemValido(v,tipo){const s=String(v||'').trim();const marcador=tipo==='cert'?'CERTIFICATE':'PRIVATE KEY';if(!s.includes(`BEGIN ${marcador}`)||!s.includes(`END ${marcador}`))throw new Error(tipo==='cert'?'Certificado público PEM inválido.':'Chave privada PEM inválida.');return s+'\n'}
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
    if(action==='validar-configuracao'){
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg)throw new Error('Client ID e Client Secret ainda não foram cadastrados.');
      if(!mtlsReg)throw new Error('Certificado público e chave privada mTLS ainda não foram cadastrados.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);const meta=validarParMtls(mtls.cert_pem,mtls.key_pem);
      if(!cred.client_id||!cred.client_secret)throw new Error('Credenciais incompletas.');
      return json(res,200,{ok:true,teste:{configuracao_valida:true,mtls_valido:true,credenciais_validas:true,certificado:meta},mensagem:'Configuração local do Bradesco Sandbox validada. Nenhum boleto foi emitido.'});
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
        idProduto:Number(carteira),nuNegociacao:Number(negociacao),nuCliente:seuNumero,dtEmissaoTitulo:fmtData(emissao),dtVencimentoTitulo:fmtData(vencimento),tpVencimento:0,vlNominalTitulo:Number(valor.toFixed(2)),
        cdEspecieTitulo:especieNum,cindcdAceitSacdo:'N',percentualJuros:0,vlJuros:0,qtdeDiasJuros:0,percentualMulta:0,vlMulta:0,qtdeDiasMulta:0,percentualDesconto1:0,vlDesconto1:0,dataLimiteDesconto1:'',
        nomePagador:nome,logradouroPagador:endereco.logradouro,nuLogradouroPagador:endereco.numero,complementoLogradouroPagador:endereco.complemento,cepPagador:Number(cep8.slice(0,5)||0),complementoCepPagador:Number(cep8.slice(5,8)||0),bairroPagador:endereco.bairro,municipioPagador:endereco.municipio,ufPagador:endereco.uf,cdIndCpfcnpjPagador:documento.length===11?1:2,nuCpfcnpjPagador:Number(cpfCnpjApi),
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
      const previa={ambiente:'SANDBOX',versao:'V227',modo:'PAYLOAD_COMPLETO_CONTROLADO_SEM_ENVIO',envio_ao_bradesco:false,bloqueio_registro:true,
        contrato:{cnpj_beneficiario:mascarar(somenteDigitos(banco.cnpj),2,2),agencia:mascarar(somenteDigitos(banco.agencia),1,1),conta:mascarar(somenteDigitos(banco.conta),1,1),idProduto:carteira,cedente:mascarar(banco.cedente,1,1),nuNegociacao:mascarar(negociacao,4,4),nuNegociacao_digitos:negociacao.length,nuNegociacao_origem:banco.negociacao_origem||'configurado'},
        pagador:{nome,cpfCnpj:mascarar(documento,3,2),tipo_documento:documento.length===11?'CPF':'CNPJ',endereco},titulo:{valor:Number(valor.toFixed(2)),vencimento,seuNumero,identificacao_seu_numero:'nuCliente',nossoNumero:null,identificacao_nosso_numero:'nuTitulo (omitido; geração pelo banco)',especie:payloadCompleto.cdEspecieTitulo},
        normalizacoes:{endereco_numero_separado:enderecoNormalizadoAutomaticamente,cpf_api_14_posicoes:cpfCnpjApi},
        validacoes:{contrato_completo:true,idProduto_preenchido:!!carteira,nuNegociacao_18_digitos:negociacao.length===18,pagador_valido:true,endereco_pagador_completo:pendencias.length===0,formato_datas_dd_mm_aaaa:true,desconto_sem_data_limite:payloadCompleto.dataLimiteDesconto1==='',payload_pronto_para_teste:pendencias.length===0},pendencias,alertas,payload_sanitizado:payloadSanitizado,
        observacao:'V227 corrige Seu Nº x Nosso Nº: nuCliente recebe a referência da Sofisticatto (NF/pedido, até 10 caracteres) e nuTitulo/Nosso Nº fica omitido nesta preparação para geração pelo banco. Mantém datas DD.MM.AAAA, desconto zerado sem data-limite, campos numéricos tipados, CPF com 14 posições e normalização do endereço. NÃO executa POST no endpoint de registro.'};
      return json(res,200,{ok:true,previa,mensagem:'Payload completo de homologação preparado no backend para revisão. Nenhum dado foi enviado ao endpoint de registro do Bradesco.'});
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
      if(amb!=='sandbox')throw new Error('O teste externo está liberado somente para o Sandbox.');
      const credReg=await obter(idRegistro(amb,'credenciais')), mtlsReg=await obter(idRegistro(amb,'mtls'));
      if(!credReg||!mtlsReg)throw new Error('Cadastre as credenciais e o par mTLS antes do teste externo.');
      const cred=descriptografar(credReg), mtls=descriptografar(mtlsReg);validarParMtls(mtls.cert_pem,mtls.key_pem);
      const teste=await solicitarTokenMtls(endpointToken(amb),cred,mtls);
      return json(res,200,{ok:true,teste:{autenticacao:true,ambiente:'sandbox',endpoint:'openapisandbox.prebanco.com.br',http_status:teste.http_status,token_type:teste.token_type,expires_in:teste.expires_in,scope:teste.scope},mensagem:'Autenticação mTLS/OAuth do Bradesco Sandbox concluída com sucesso. Nenhum boleto foi consultado, alterado ou emitido.'});
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
      ? 'O banco de dados precisa da atualização SQL V211 para aceitar o cadastro dos dados bancários Bradesco. Nenhum dado foi alterado.'
      : msg;
    return json(res,statusHttp,{ok:false,erro:erroPublico,codigo:precisaMigracao?'BRADESCO_SQL_V211_PENDENTE':null,bradesco_http:upstream||null,detalhe:precisaMigracao?null:resposta});
  }
};
