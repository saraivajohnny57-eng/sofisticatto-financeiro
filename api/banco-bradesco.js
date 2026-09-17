const crypto=require('crypto');
const https=require('https');
const forge=require('node-forge');
const {exigirAdmin,supabaseRest,criptografar,descriptografar}=require('../lib/integracoes/_utils');

const TABELA='integracoes_bradesco_segredos';
const CNPJ_PADRAO='05451985000195';
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
async function status(amb){
  const cred=await obter(idRegistro(amb,'credenciais')), mtls=await obter(idRegistro(amb,'mtls'));
  return {ambiente:ambiente(amb),credenciais:{configuradas:!!cred,client_id:!!cred,client_secret:!!cred},mtls:{configurado:!!mtls,...(mtls?.metadata||{})},cnpj:CNPJ_PADRAO};
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
    // V196: corrige dataLimiteDesconto1 conforme validação real retornada pela API (DD.MM.AAAA).
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
      nuCliente:'DIAGNOSTICO-V196',
      dtEmissaoTitulo:'17.09.2026',
      dtVencimentoTitulo:'30.09.2026',
      vlNominalTitulo:'1',
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
    const body=JSON.stringify(payload);
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
    if(action==='salvar-mtls'){
      const certPem=pemValido(req.body?.cert_pem,'cert'), keyPem=pemValido(req.body?.key_pem,'key');
      const meta=validarParMtls(certPem,keyPem);
      await salvar(idRegistro(amb,'mtls'),amb,'mtls',{cert_pem:certPem,key_pem:keyPem},{...meta,cnpj:CNPJ_PADRAO});
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
      // V196: separa o resultado principal (default.json / errors / Error400Response)
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
      return json(res,200,{ok:true,diagnostico:{http_status:teste.http_status,codigo:d.codigo||null,mensagem:d.mensagem||d.message||'Validação do payload acionada.',resumo:{total_mensagens:mensagensPrincipais.length,total_unicas:unicas.length,campos_ausentes:ausentes,campos_rejeitados:rejeitados,erros_formato:formato,regras:regras,cenarios_sandbox_ignorados:cenariosUnicos.length},estrutura,total_nos:totalNos},seguranca:'V196 mantém o payload refinado da V195 e corrige dataLimiteDesconto1 para o formato DD.MM.AAAA exigido pela API. Cenários erro-*.json continuam separados. Token, Client Secret, Authorization, certificado, chave privada, credenciais e payload enviado não são devolvidos ao navegador.'});
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
    return json(res,statusHttp,{ok:false,erro:e.message||'Falha na integração Bradesco.',bradesco_http:upstream||null,detalhe:resposta});
  }
};
