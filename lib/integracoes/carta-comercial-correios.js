'use strict';
// Carta comercial (documentos): rotina isolada, sem alterar PAC/SEDEX.
const {exigirAdmin}=require('./_utils');
const crypto=require('node:crypto');
const {cfg,descobrirContrato,configuracaoEfetiva,apiComToken,gerarToken}=require('./_correios');
const BASE='https://api.correios.com.br';
const texto=v=>String(v??'').trim();
const dig=v=>texto(v).replace(/\D/g,'');
function valorBR(v){
  const s=texto(v).replace(/[^\d.,-]/g,'');
  if(!s)return 0;
  const x=s.includes(',')?Number(s.replace(/\./g,'').replace(',','.')):Number(s);
  return Number.isFinite(x)?x:0;
}
// Identificar somente cartas comerciais físicas. e-Carta e resposta paga são serviços distintos.
// Siglas que a API Meu Contrato realmente devolve: COML, REG, RG, AR, MFD, CHANC.
function descobrirCartas(dados){
  const encontrados=Array.isArray(dados?.todosServicos)?dados.todosServicos:[];
  const mapa=new Map();
  for(const s of encontrados){
    const codigo=texto(s.codigo),descricao=texto(s.descricao).toUpperCase().replace(/\s+/g,' ').trim();
    if(!/^\d{5}$/.test(codigo))continue;
    if(!/\bCARTA (?:COML|COMERCIAL)\b/.test(descricao))continue;
    if(/\bE.?CARTA\b|INTEGRACAO|TRANSMISSAO|\bAPI\b|RESPOSTA PAGA/.test(descricao))continue;
    const temRegistro=/\b(?:REG|RG|REGISTRADA?|REGISTRAD[AO]S?)\b/.test(descricao);
    const temAR=temRegistro&&/\b(?:AR|ARC)\b/.test(descricao);
    const categoria=temAR?'registrada_ar':temRegistro?'registrada':'simples';
    const titulo=categoria==='registrada_ar'?'Carta Comercial Registrada com AR':categoria==='registrada'?'Carta Comercial Registrada':'Carta Comercial Simples';
    mapa.set(codigo,{codigo,descricao,categoria,titulo,emitirAvulsaPossivel:categoria==='registrada'});
  }
  return [...mapa.values()].sort((a,b)=>
    (a.categoria==='registrada'?0:a.categoria==='simples'?1:2)-
    (b.categoria==='registrada'?0:b.categoria==='simples'?1:2) || a.descricao.localeCompare(b.descricao,'pt-BR'));
}
function validarCotacao(p){
  const cep=dig(p.cepDestino),peso=Number(p.pesoGramas);
  if(!/^\d{8}$/.test(cep))throw Error('Informe CEP do destinatário com 8 dígitos.');
  if(!Number.isInteger(peso)||peso<1||peso>500)throw Error('Informe peso do envelope entre 1 g e 500 g.');
  return {cep,peso};
}
// Normaliza endereços em que a rua já contém o número cadastrado.
// Ex.: "RUA IRINEU CONSTANTINO CURTULO, 106" + numero "106" => rua e número únicos.
// Divergências são bloqueadas: nunca escolher silenciosamente entre dois números diferentes.
function separarNumeroEnderecoCarta(logradouro, numero){
  let rua=texto(logradouro).replace(/\s+/g,' ');
  let numeroFinal=texto(numero).toUpperCase().replace(/\s+/g,'');
  const achados=[];
  for(let i=0;i<3;i++){
    const m=rua.match(/^(.*),\s*(?:N[º°.]*\s*)?(\d+[A-Z]?)$/i);
    if(!m)break;
    rua=m[1].trim();achados.unshift(m[2].toUpperCase());
  }
  if(achados.some(x=>x!==achados[0]))throw Error('O logradouro contém números diferentes. Confira endereço e número.');
  if(numeroFinal && achados.length && numeroFinal!==achados[0])throw Error('O número cadastrado diverge do número informado no logradouro.');
  numeroFinal=numeroFinal||achados[0]||'S/N';
  return {logradouro:rua,numero:numeroFinal};
}
function validarDestinatario(d){
  const endereco=d?.endereco||{};const separado=separarNumeroEnderecoCarta(endereco.logradouro,endereco.numero);
  const a={nome:texto(d?.nome).slice(0,80),cpfCnpj:dig(d?.cpfCnpj),email:texto(d?.email).slice(0,80),endereco:{
    cep:dig(endereco.cep),logradouro:separado.logradouro.slice(0,100),numero:separado.numero.slice(0,10),complemento:texto(endereco.complemento).slice(0,50),bairro:texto(endereco.bairro).slice(0,50),cidade:texto(endereco.cidade).slice(0,50),uf:texto(endereco.uf).toUpperCase().slice(0,2)
  }};
  if(!a.nome||!/^\d{8}$/.test(a.endereco.cep)||!a.endereco.logradouro||!a.endereco.bairro||!a.endereco.cidade||!/^[A-Z]{2}$/.test(a.endereco.uf))throw Error('Complete nome e endereço (CEP, rua, bairro, cidade e UF).');
  if(a.cpfCnpj&&!([11,14].includes(a.cpfCnpj.length)))throw Error('CPF/CNPJ do destinatário incompleto.');
  if(!a.cpfCnpj)delete a.cpfCnpj;
  if(!a.email)delete a.email;
  return a;
}
// Usa o mesmo telefone de remetente já configurado na integração PAC/SEDEX.
function telefoneRemetenteCarta(valor){
  let d=dig(valor);
  if((d.length===12||d.length===13)&&d.startsWith('55'))d=d.slice(2);
  if(!/^\d{10,11}$/.test(d))throw Error('Telefone do remetente para Carta inválido. Configure CORREIOS_REMETENTE_TELEFONE (DDD + número).');
  return {dddTelefone:d.slice(0,2),telefone:d.slice(2)};
}
// Os erros da API Correios vêm frequentemente em "msgs" (MessageResponse).
// Não divulgar stackTrace, token, CPF/CNPJ, email ou URLs com identificadores privados.
function mensagensValidacaoCorreios(resposta){
  const r=resposta&&typeof resposta==='object'?resposta:{};
  const candidatos=[r.msgs,r.msg,r.mensagens,r.mensagem,r.message,r.erro,r.errors,r.details,r.detalhes];
  const result=[];
  function coletar(valor,nivel=0){
    if(valor==null||nivel>3||result.length>=6)return;
    if(Array.isArray(valor)){for(const x of valor.slice(0,8))coletar(x,nivel+1);return;}
    if(typeof valor==='object'){
      for(const k of ['codigo','code','campo','field','mensagem','message','descricao','description','detail','detalhe','msg'])
        if(Object.prototype.hasOwnProperty.call(valor,k))coletar(valor[k],nivel+1);
      return;
    }
    if(typeof valor!=='string')return;
    const v=valor.trim();
    if(!v||v.length>900||/<(?:!doctype|html|script)\b/i.test(v))return;
    const seguro=v
      .replace(/Bearer\s+[\w.+/=:-]+/gi,'Bearer [oculto]')
      .replace(/\b[\w.%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi,'[email oculto]')
      .replace(/\b\d{11,14}\b/g,'[documento oculto]')
      .replace(/(?:https?:\/\/)[^\s]+/g,'[endereço de API oculto]')
      .replace(/(?:token|senha|password|secret|authorization)\s*[:=]\s*\S+/gi,'[credencial oculta]')
      .slice(0,360);
    if(seguro&&!result.includes(seguro))result.push(seguro);
  }
  for(const item of candidatos)coletar(item);
  return result.slice(0,5);
}
// Data prevista da apresentação física, NÃO confundir com prazo de entrega.
// Formato ISO que o campo dataPrevistaPostagem recebe na API de Pré-Postagem.
function hojeBrasil(){
  const partes=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const valor=Object.fromEntries(partes.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return valor.year+'-'+valor.month+'-'+valor.day;
}
function validarDataPrevistaCarta(data){
  const d=texto(data);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error('Informe a data prevista de pré-postagem no formato AAAA-MM-DD.');
  const dataObj=new Date(d+'T12:00:00Z');
  if(!Number.isFinite(dataObj.getTime())||dataObj.toISOString().slice(0,10)!==d)
    throw Error('Data prevista de pré-postagem inválida.');
  const hoje=hojeBrasil();
  const diferenca=Math.round((Date.parse(d+'T00:00:00Z')-Date.parse(hoje+'T00:00:00Z'))/86400000);
  if(diferenca<0)throw Error('A data prevista de pré-postagem não pode estar no passado.');
  if(diferenca>14)throw Error('Para o primeiro piloto, escolha uma data prevista de pré-postagem dentro dos próximos 14 dias.');
  return d;
}
function montarPrepostagem(p,c,servico){
  const {peso}=validarCotacao(p);const destinatario=validarDestinatario(p.destinatario);
  if(destinatario.endereco.cep!==dig(p.cepDestino))throw Error('CEP do destinatário diferente do CEP cotado.');
  if(servico.categoria==='simples')throw Error('Carta Simples requer lote próprio; não usar a API individual de encomendas.');
  if(servico.categoria==='registrada_ar')throw Error('Carta com AR precisa dos campos do serviço adicional confirmados; simulação e emissão avulsa indisponíveis até essa validação.');
  if(servico.categoria!=='registrada')throw Error('Selecione uma Carta Comercial Registrada compatível com a API avulsa.');
  if(p.tipoConteudo!=='DOCUMENTOS')throw Error('A modalidade Carta é exclusiva de correspondências/documentos neste módulo.');
  const dataPrevistaPostagem=validarDataPrevistaCarta(p.dataPrevistaPostagem);
  const telefoneRem=telefoneRemetenteCarta(process.env.CORREIOS_REMETENTE_TELEFONE||'(62) 3293-0035');
  const remetente={nome:texto(process.env.CORREIOS_REMETENTE_NOME||'SOFISTICATTO COSMÉTICOS'),cpfCnpj:dig(c.cnpj),...telefoneRem,endereco:{
    cep:dig(c.cepOrigem||process.env.CORREIOS_REMETENTE_CEP||'74550470'),logradouro:texto(process.env.CORREIOS_REMETENTE_LOGRADOURO||'Rua 4'),numero:texto(process.env.CORREIOS_REMETENTE_NUMERO||'217'),complemento:texto(process.env.CORREIOS_REMETENTE_COMPLEMENTO||'Qd.35, Lt.14E'),bairro:texto(process.env.CORREIOS_REMETENTE_BAIRRO||'Vila Abajá'),cidade:texto(process.env.CORREIOS_REMETENTE_CIDADE||'Goiânia'),uf:texto(process.env.CORREIOS_REMETENTE_UF||'GO')
  }};
  // Código de formato 1 = envelope (manual Preço e pré-postagem). Não incluir NF-e/DC-e de mercadorias.
  // Campos numéricos e de formato alinhados ao fluxo nacional de pré-postagem.
  // Correspondência de papel NÃO é remessa de mercadoria: não inclui NF-e nem DC-e.
  return {idCorreios:c.usuario,numeroCartaoPostagem:c.cartao,codigoServico:servico.codigo,
    codigoFormatoObjetoInformado:'1',pesoCubico:0,pesoInformado:peso,dataPrevistaPostagem,precoPostagem:0,
    precoPrePostagem:0,modalidadePagamento:'2',solicitarColeta:'N',
    logisticaReversa:'N',cienteObjetoNaoProibido:'1',remetente,destinatario};
}
async function cotarCarta(servico,cep,peso,c){
  const qp=new URLSearchParams({cepOrigem:c.cepOrigem,cepDestino:cep,psObjeto:String(peso),tpObjeto:'1'});
  if(c.contrato&&c.dr){qp.set('nuContrato',c.contrato);qp.set('nuDR',c.dr);}
  const r=await apiComToken(BASE+'/preco/v1/nacional/'+encodeURIComponent(servico.codigo)+'?'+qp.toString(),{},'cartao');
  const valor=valorBR(r?.pcFinal??r?.precoFinal??r?.valor);
  if(!(valor>0))throw Error('A API não retornou tarifa positiva.');
  return {codigo:servico.codigo,descricao:servico.descricao,categoria:servico.categoria,titulo:servico.titulo,valor,fonte:'API_PRECO_CONTRATO'};
}
function pilotoHabilitado(){
  return process.env.CORREIOS_CARTAS_EMISSAO_HABILITADA==='1'
    &&process.env.VERCEL_ENV==='preview'
    &&process.env.VERCEL_GIT_COMMIT_REF==='teste-carta-comercial-20261112';
}
// O PPN-213 confirmou que o fluxo escolhido mistura objeto registrado e
// arquivo de objetos simples. Não liberar novo POST até homologar o layout
// específico de registrada no CWS, sem inventar rota ou corpo de importação.
function layoutRegistradaConfirmado(){
  return process.env.CORREIOS_CARTA_REGISTRADA_LAYOUT_VALIDADO==='1';
}
function assinaturaPiloto(payload,agora=Date.now()){
  const segredo=String(process.env.INTEGRATIONS_ENCRYPTION_KEY||'');
  if(segredo.length<32)throw Error('Chave de confirmação do piloto indisponível na Preview.');
  const corpo=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const dados=agora+'.'+corpo;
  const sig=crypto.createHmac('sha256',segredo).update('carta-piloto-v1.'+dados).digest('hex');
  return 'cp1.'+dados+'.'+sig;
}
function validarAssinaturaPiloto(token,payload){
  const partes=texto(token).split('.');
  if(partes.length!==4||partes[0]!=='cp1'||!/^\d{13}$/.test(partes[1])||!/^[0-9a-f]{64}$/.test(partes[2])||!/^[0-9a-f]{64}$/.test(partes[3]))return false;
  const emitido=Number(partes[1]),agora=Date.now();
  if(emitido>agora+30000||agora-emitido>10*60000)return false;
  const esperado=assinaturaPiloto(payload,emitido);
  return crypto.timingSafeEqual(Buffer.from(esperado,'utf8'),Buffer.from(token,'utf8'));
}
function pilotoResumo(payload,servico){
  return {destinatario:payload.destinatario.nome,cepDestino:payload.destinatario.endereco.cep,
    endereco:payload.destinatario.endereco.logradouro+', '+payload.destinatario.endereco.numero,
    cidade:payload.destinatario.endereco.cidade,uf:payload.destinatario.endereco.uf,
    pesoGramas:payload.pesoInformado,dataPrevistaPostagem:payload.dataPrevistaPostagem,modalidade:servico.descricao,codigoServico:servico.codigo};
}
function responder(res,codigo,corpo){return res.status(codigo).json(corpo);}
async function handler(req,res){
  if(!exigirAdmin(req,res))return;
  const acao=texto(req.query?.modo||req.body?.modo||'diagnostico');
  if(req.method!=='GET'&&req.method!=='POST')return responder(res,405,{ok:false,erro:'Método não permitido.'});
  if(['cotar','preparar','emitir'].includes(acao)&&req.method!=='POST')return responder(res,405,{ok:false,erro:'Utilize POST.'});
  try{
    const dados=await descobrirContrato();const servicos=descobrirCartas(dados);const c=await configuracaoEfetiva();
    const habilitado=pilotoHabilitado();
    if(acao==='diagnostico')return responder(res,200,{ok:true,servicos,contratoComCarta:servicos.length>0,emissaoDeTesteHabilitada:habilitado&&layoutRegistradaConfirmado(),motivoBloqueioEmissao:habilitado&&!layoutRegistradaConfirmado()?'PPN-213: falta validar rota e layout de objetos registrados na API Correios.':null,observacao:servicos.length?'Cartas comerciais físicas identificadas no Meu Contrato. Selecione a modalidade e faça a cotação, sem emitir postagem.':'Carta Comercial física não identificada no Meu Contrato. Serviços e-Carta não equivalem a envelopes físicos.'});
    if(acao==='verificar-prepostagem'){
      // Consulta de habilitacao: SOMENTE GET, nenhuma pre-postagem e criada.
      // 86720 e o codigo oficial de "API PRE POSTAGEM" no Meu Contrato.
      const codigoApi='86720';
      const servicoListado=(dados.todosServicos||[]).some(x=>texto(x.codigo)===codigoApi);
      let status='nao_confirmado',detalhe='';
      if(!c.cartao||!c.contrato||dig(c.cnpj).length!==14){
        status='configuracao_incompleta';
        detalhe='Contrato, CNPJ ou cartao de postagem nao configurado para consultar a API Pre-Postagem.';
      }else{
        const url=BASE+'/meucontrato/v1/empresas/'+encodeURIComponent(c.cnpj)+'/contratos/'+encodeURIComponent(c.contrato)+'/cartoes/'+encodeURIComponent(c.cartao)+'/servicos/'+codigoApi;
        try{
          const resposta=await apiComToken(url,{},'contrato');
          const codigoRetornado=texto(resposta?.codigo||resposta?.coServico);
          if(codigoRetornado===codigoApi){status='confirmado';detalhe='O cartao retornou o servico API PRE POSTAGEM (86720).';}
          else{status='retorno_inconclusivo';detalhe='O retorno da consulta nao comprovou a habilitacao do codigo 86720.';}
        }catch(e){
          status=e.httpStatus===404?'nao_localizado':e.httpStatus===429?'limite_consultas':'consulta_falhou';
          detalhe=status==='nao_localizado'?'O servico 86720 nao foi localizado nesta consulta ao cartao.':status==='limite_consultas'?'A API limitou temporariamente as consultas; tente novamente mais tarde.':'Nao foi possivel confirmar o acesso da API Pre-Postagem no cartao.';
        }
      }
      return responder(res,200,{ok:true,servicoApiPrepostagemListado:servicoListado,habilitacaoApiPrepostagem:status,consultaSomenteLeitura:true,emissaoRealBloqueada:!habilitado,observacao:detalhe+' A compatibilidade do layout de Carta Registrada e a impressao oficial ainda precisam de teste proprio. Nenhuma postagem criada.'});
    }

    if(acao==='diagnostico-rotulo'){
      // Diagnóstico exclusivamente GET: não solicita etiquetas, não cria pré-postagens,
      // não consome faixa de códigos nem consulta dados pessoais de destinatários.
      const resultados=[];
      async function verificar(nome,caminho,tipoToken='cartao'){
        try{
          await apiComToken(BASE+caminho,{},tipoToken);
          resultados.push({etapa:nome,estado:'acessivel',metodo:'GET'});
        }catch(e){
          const status=Number(e?.httpStatus||0);
          resultados.push({etapa:nome,estado:status===401||status===403?'sem_permissao':status===429?'limite_temporario':status===404?'nao_encontrado':'falha_na_consulta',httpStatus:status||null,metodo:'GET'});
        }
      }
      // Usar as duas rotas GET previstas no manual de etiquetas. A antiga
      // listagem /v2/prepostagens pode retornar 404 para filtros sem objetos;
      // isso nao prova falha da autorizacao nem da emissao de rotulos.
      if(c.contrato){
        const contrato=encodeURIComponent(c.contrato);
        await verificar('faixas_solicitadas','/prepostagem/v1/prepostagens/rotulo/'+contrato+'/solicitadas');
        await verificar('saldo_de_rotulos','/prepostagem/v1/prepostagens/rotulo/'+contrato+'/saldo');
      }else{
        resultados.push({etapa:'faixas_solicitadas',estado:'contrato_nao_configurado',metodo:'GET'});
        resultados.push({etapa:'saldo_de_rotulos',estado:'contrato_nao_configurado',metodo:'GET'});
      }
      const saldoAcessivel=resultados.some(x=>x.etapa==='saldo_de_rotulos'&&x.estado==='acessivel');
      return responder(res,200,{ok:true,somenteLeitura:true,postagensCriadas:0,rotulosSolicitados:0,saldoAcessivel,diagnosticos:resultados,observacao:'Consultas oficiais de faixas solicitadas e saldo de etiquetas. Saldo acessivel nao comprova geracao de rótulo para Carta Registrada: a prova final requer uma pre-postagem real autorizada. Nenhuma postagem criada.'});
    }
    const p=req.body||{};
    const {cep,peso}=validarCotacao(p);
    const codigo=dig(p.codigoServico);
    const selecionados=codigo?servicos.filter(x=>x.codigo===codigo):servicos;
    if(!selecionados.length)return responder(res,422,{ok:false,codigo:'CARTA_NAO_HABILITADA',erro:'Nenhum código de Carta Comercial física autorizado foi encontrado no contrato/cartão. Verifique se o serviço foi selecionado.'});
    if(acao==='cotar'){
      // Evitar disparar muitas chamadas em paralelo (HTTP 429 na API de Token/Preço).
      // A tela consulta um serviço selecionado por vez.
      if(!codigo)return responder(res,422,{ok:false,codigo:'SELECIONE_SERVICO_CARTA',erro:'Selecione Carta Simples, Registrada ou com AR antes de cotar.'});
      const resultados=await Promise.all(selecionados.map(async s=>{try{return {...await cotarCarta(s,cep,peso,c),ok:true}}catch(e){return {ok:false,codigo:s.codigo,descricao:s.descricao,erro:e.message}}}));
      return responder(res,200,{ok:true,resultados,validos:resultados.filter(x=>x.ok).length,observacao:'Tarifas calculadas pela API de preços; AR não é incluído sem cotação específica.'});
    }
    if(!['preparar','emitir'].includes(acao))return responder(res,400,{ok:false,erro:'Modo inválido.'});
    if(!codigo)return responder(res,400,{ok:false,erro:'Selecione Carta Comercial Registrada (não Simples/AR) para validar a pré-postagem avulsa.'});
    const s=selecionados[0];
    if(acao==='preparar'){
      // Todos os serviços físicos podem ter dados validados sem envio.
      const destinatario=validarDestinatario(p.destinatario);
      if(destinatario.endereco.cep!==cep)throw Error('O CEP do endereço não coincide com o CEP da cotação.');
      if(p.tipoConteudo!=='DOCUMENTOS')throw Error('Esta rotina só valida cartas com documentos em papel.');
      if(s.categoria==='simples')return responder(res,200,{ok:true,modo:'SIMULACAO_CARTA_SIMPLES',codigoServico:s.codigo,categoria:s.categoria,validado:true,observacao:'Carta Simples: endereço e peso validados. Emissão oficial exige pré-postagem em LOTE; nenhuma postagem criada.'});
      if(s.categoria==='registrada_ar')return responder(res,200,{ok:true,modo:'SIMULACAO_CARTA_AR',codigoServico:s.codigo,categoria:s.categoria,validado:true,observacao:'Carta com AR: endereço e peso validados. A emissão ainda depende de confirmar os adicionais do AR; nenhuma postagem criada.'});
      const pilotPayload=montarPrepostagem(p,c,s);
      let confirmacaoPiloto=null;
      if(habilitado){
        // A lista geral de serviços é paginada/filtrada e pode não incluir o 86720
        // mesmo quando o endpoint oficial do cartão o confirma (teste de 13/11).
        // O GET específico por contrato/cartão é a verificação autoritativa.
        if(!c.contrato||!c.cartao||dig(c.cnpj).length!==14)
          throw Object.assign(Error('Contrato, cartão ou CNPJ não configurados para confirmar Pré-Postagem 86720.'),{httpStatus:422});
        const u=BASE+'/meucontrato/v1/empresas/'+encodeURIComponent(c.cnpj)+'/contratos/'+encodeURIComponent(c.contrato)+'/cartoes/'+encodeURIComponent(c.cartao)+'/servicos/86720';
        let acesso;
        try{acesso=await apiComToken(u,{},'contrato');}
        catch(e){
          const status=Number(e?.httpStatus||0);
          if(status===404||status===401||status===403)
            throw Object.assign(Error('Não foi possível validar o serviço 86720 diretamente no cartão (HTTP '+status+'). Emissão bloqueada.'),{httpStatus:422});
          throw e;
        }
        if(texto(acesso?.codigo||acesso?.coServico)!=='86720')
          throw Object.assign(Error('O cartão não confirmou o código 86720 na consulta específica. Emissão bloqueada.'),{httpStatus:422});
        confirmacaoPiloto=assinaturaPiloto(pilotPayload);
      }
      let valorCotado=null;
      if(habilitado){
        const cotacao=await cotarCarta(s,cep,peso,c);
        valorCotado=cotacao.valor;
      }
      return responder(res,200,{ok:true,modo:'SIMULACAO_SEM_ENVIO',codigoServico:s.codigo,categoria:s.categoria,
        validado:true,emissaoDeTesteHabilitada:habilitado&&layoutRegistradaConfirmado(),confirmacaoPiloto,valorCotado,
        resumo:pilotoResumo(pilotPayload,s),
        observacao:'Carta Registrada: dados validados sem envio. Nenhuma carta foi registrada ou cobrada. O piloto real requer confirmação específica.'});
    }
    const payload=montarPrepostagem(p,c,s);
    if(!habilitado)return responder(res,423,{ok:false,codigo:'EMISSAO_REAL_BLOQUEADA',erro:'A emissão real está restrita ao piloto na Preview autorizada; produção bloqueada.'});
    if(!layoutRegistradaConfirmado())return responder(res,423,{ok:false,codigo:'PPN213_LAYOUT_REGISTRADO_PENDENTE',erro:'PPN-213: pré-postagem real de Carta Registrada bloqueada até confirmar o fluxo correto no CWS. A data prevista foi acrescentada, mas não corrige sozinha a incompatibilidade entre registrados e objetos simples. Nenhuma postagem foi transmitida.'});
    if(p.confirmarEmissaoReal!==true||!validarAssinaturaPiloto(p.confirmacaoPiloto,payload))
      return responder(res,403,{ok:false,codigo:'CONFIRMACAO_PILOTO_INVALIDA',erro:'Confirmação do piloto ausente, expirada ou divergente. Valide os dados novamente antes de emitir.'});
    const token=await gerarToken('cartao');
    const resposta=await fetch(BASE+'/prepostagem/v1/prepostagens',{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(payload)});
    const bruto=await resposta.text();let j;try{j=JSON.parse(bruto)}catch{j={mensagem:bruto.slice(0,400)}}
    if(!resposta.ok){
      const detalhes=mensagensValidacaoCorreios(j);
      // PPN-213 não é erro de data. Trata-se da classificação/arquivo de
      // objetos registrados vs. simples; não disparar outra rota como fallback.
      if(detalhes.some(m=>/PPN-213\b/i.test(m))){
        detalhes.push('PPN-213 requer verificar o fluxo específico de Carta Registrada nos Correios. Não reenviar em rota de objetos simples nem criar outro lote automaticamente.');
      }
      const codigoCorreios=detalhes.map(m=>m.match(/\b(?:PPN|RTL|PRE|COR|CEP)-\d{2,5}\b/i)?.[0]).find(Boolean)||null;
      const msg=detalhes.length?detalhes.join(' | '):'O Correios recusou a requisição sem informar o motivo no retorno analisado.';
      throw Object.assign(
        Error('Correios HTTP '+resposta.status+': '+msg+'. Nenhum reenvio automático será realizado.'),
        {httpStatus:resposta.status,codigo:'CORREIOS_PREPOSTAGEM_RECUSADA',codigoCorreios,detalhes}
      );
    }
    const id=texto(j.id||j.idPrePostagem||j.prePostagemId);
    if(!/^PR[A-Za-z0-9]{10,40}$/.test(id))throw Object.assign(Error('Resposta recebida, mas sem identificador PR válido. Consulte a pré-postagem no portal oficial antes de tentar novamente; não haverá reenvio automático.'),{httpStatus:502});
    return responder(res,200,{ok:true,emitida:true,idPrePostagem:id,codigoObjeto:texto(j.codigoObjeto||j.codigoRastreio),servico:s.descricao});
  }catch(e){return responder(res,e.httpStatus||502,{ok:false,erro:e.message,codigo:e.codigo||null,codigoCorreios:e.codigoCorreios||null,detalhes:Array.isArray(e.detalhes)?e.detalhes:[]});}
}
module.exports=handler;
module.exports._teste={descobrirCartas,validarCotacao,validarDestinatario,montarPrepostagem,valorBR,separarNumeroEnderecoCarta,pilotoHabilitado,assinaturaPiloto,validarAssinaturaPiloto,telefoneRemetenteCarta,mensagensValidacaoCorreios,hojeBrasil,validarDataPrevistaCarta,layoutRegistradaConfirmado};
