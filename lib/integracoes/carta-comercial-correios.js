'use strict';
// Carta comercial (documentos): rotina isolada, sem alterar PAC/SEDEX.
const {exigirAdmin}=require('./_utils');
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
function montarPrepostagem(p,c,servico){
  const {peso}=validarCotacao(p);const destinatario=validarDestinatario(p.destinatario);
  if(destinatario.endereco.cep!==dig(p.cepDestino))throw Error('CEP do destinatário diferente do CEP cotado.');
  if(servico.categoria==='simples')throw Error('Carta Simples requer lote próprio; não usar a API individual de encomendas.');
  if(servico.categoria==='registrada_ar')throw Error('Carta com AR precisa dos campos do serviço adicional confirmados; simulação e emissão avulsa indisponíveis até essa validação.');
  if(servico.categoria!=='registrada')throw Error('Selecione uma Carta Comercial Registrada compatível com a API avulsa.');
  if(p.tipoConteudo!=='DOCUMENTOS')throw Error('A modalidade Carta é exclusiva de correspondências/documentos neste módulo.');
  const remetente={nome:texto(process.env.CORREIOS_REMETENTE_NOME||'SOFISTICATTO COSMÉTICOS'),cpfCnpj:dig(c.cnpj),endereco:{
    cep:dig(c.cepOrigem||process.env.CORREIOS_REMETENTE_CEP||'74550470'),logradouro:texto(process.env.CORREIOS_REMETENTE_LOGRADOURO||'Rua 4'),numero:texto(process.env.CORREIOS_REMETENTE_NUMERO||'217'),complemento:texto(process.env.CORREIOS_REMETENTE_COMPLEMENTO||'Qd.35, Lt.14E'),bairro:texto(process.env.CORREIOS_REMETENTE_BAIRRO||'Vila Abajá'),cidade:texto(process.env.CORREIOS_REMETENTE_CIDADE||'Goiânia'),uf:texto(process.env.CORREIOS_REMETENTE_UF||'GO')
  }};
  // Código de formato 1 = envelope (manual Preço e pré-postagem). Não incluir NF-e/DC-e de mercadorias.
  return {idCorreios:c.usuario,numeroCartaoPostagem:c.cartao,codigoServico:servico.codigo,codigoFormatoObjetoInformado:'1',pesoInformado:peso,modalidadePagamento:'2',solicitarColeta:'N',logisticaReversa:'N',cienteObjetoNaoProibido:'1',remetente,destinatario};
}
async function cotarCarta(servico,cep,peso,c){
  const qp=new URLSearchParams({cepOrigem:c.cepOrigem,cepDestino:cep,psObjeto:String(peso),tpObjeto:'1'});
  if(c.contrato&&c.dr){qp.set('nuContrato',c.contrato);qp.set('nuDR',c.dr);}
  const r=await apiComToken(BASE+'/preco/v1/nacional/'+encodeURIComponent(servico.codigo)+'?'+qp.toString(),{},'cartao');
  const valor=valorBR(r?.pcFinal??r?.precoFinal??r?.valor);
  if(!(valor>0))throw Error('A API não retornou tarifa positiva.');
  return {codigo:servico.codigo,descricao:servico.descricao,categoria:servico.categoria,titulo:servico.titulo,valor,fonte:'API_PRECO_CONTRATO'};
}
function responder(res,codigo,corpo){return res.status(codigo).json(corpo);}
async function handler(req,res){
  if(!exigirAdmin(req,res))return;
  const acao=texto(req.query?.modo||req.body?.modo||'diagnostico');
  if(req.method!=='GET'&&req.method!=='POST')return responder(res,405,{ok:false,erro:'Método não permitido.'});
  if(['cotar','preparar','emitir'].includes(acao)&&req.method!=='POST')return responder(res,405,{ok:false,erro:'Utilize POST.'});
  try{
    const dados=await descobrirContrato();const servicos=descobrirCartas(dados);const c=await configuracaoEfetiva();
    const habilitado=process.env.CORREIOS_CARTAS_EMISSAO_HABILITADA==='1'&&process.env.VERCEL_ENV!=='production';
    if(acao==='diagnostico')return responder(res,200,{ok:true,servicos,contratoComCarta:servicos.length>0,emissaoDeTesteHabilitada:habilitado,observacao:servicos.length?'Cartas comerciais físicas identificadas no Meu Contrato. Selecione a modalidade e faça a cotação, sem emitir postagem.':'Carta Comercial física não identificada no Meu Contrato. Serviços e-Carta não equivalem a envelopes físicos.'});
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
      // A consulta de listagem exige combinação de filtros e só usamos o status.
      await verificar('consulta_registradas','/prepostagem/v2/prepostagens?status=PREPOSTADO&tipoObjeto=REGISTRADO&page=0&size=1');
      if(c.contrato)await verificar('saldo_de_rotulos','/prepostagem/v1/prepostagens/rotulo/'+encodeURIComponent(c.contrato)+'/saldo');
      else resultados.push({etapa:'saldo_de_rotulos',estado:'contrato_nao_configurado',metodo:'GET'});
      return responder(res,200,{ok:true,somenteLeitura:true,postagensCriadas:0,rotulosSolicitados:0,diagnosticos:resultados,observacao:'Consultas GET concluídas. Acessibilidade de listagem/saldo não comprova que o PDF oficial de Carta Registrada será aceito; isso requer um ID real validado e autorização separada para a primeira emissão.'});
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
      montarPrepostagem(p,c,s); // Validar dados da pré-postagem avulsa sem enviá-la.
      return responder(res,200,{ok:true,modo:'SIMULACAO_SEM_ENVIO',codigoServico:s.codigo,categoria:s.categoria,validado:true,emissaoDeTesteHabilitada:habilitado,observacao:'Carta Registrada: dados validados sem envio. Nenhuma carta foi registrada ou cobrada.'});
    }
    const payload=montarPrepostagem(p,c,s);
    if(!habilitado)return responder(res,423,{ok:false,codigo:'EMISSAO_REAL_BLOQUEADA',erro:'A emissão real de cartas está bloqueada até confirmar o contrato e habilitar a variável de teste em Preview.'});
    if(p.confirmarEmissaoReal!==true)return responder(res,400,{ok:false,erro:'Confirmação explícita necessária para criar pré-postagem real.'});
    const token=await gerarToken('cartao');
    const resposta=await fetch(BASE+'/prepostagem/v1/prepostagens',{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(payload)});
    const bruto=await resposta.text();let j;try{j=JSON.parse(bruto)}catch{j={mensagem:bruto.slice(0,400)}}
    if(!resposta.ok)throw Object.assign(Error(j.mensagem||j.message||'Correios recusaram a pré-postagem.'),{httpStatus:resposta.status});
    const id=texto(j.id||j.idPrePostagem||j.prePostagemId);
    if(!id)throw Error('Correios não retornaram ID da carta registrada; verifique no painel antes de repetir.');
    return responder(res,200,{ok:true,emitida:true,idPrePostagem:id,codigoObjeto:texto(j.codigoObjeto||j.codigoRastreio),servico:s.descricao});
  }catch(e){return responder(res,e.httpStatus||502,{ok:false,erro:e.message});}
}
module.exports=handler;
module.exports._teste={descobrirCartas,validarCotacao,validarDestinatario,montarPrepostagem,valorBR,separarNumeroEnderecoCarta};
