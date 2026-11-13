/* Carta Comercial — usa os dados da aba Correios sem interferir em PAC/SEDEX. */
(function(){
'use strict';
const el=id=>document.getElementById(id),val=id=>String(el(id)?.value||'').trim();
const dig=x=>String(x||'').replace(/\D/g,'');
const escape=x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Corrige enderecos em que o numero ja faz parte do logradouro.
function cartaSepararNumero(logradouro,numero){
 let rua=String(logradouro||'').trim().replace(/\s+/g,' ');
 let n=String(numero||'').trim().toUpperCase().replace(/\s+/g,'');
 const encontrados=[];
 for(let i=0;i<3;i++){
  const m=rua.match(/^(.*),\s*(?:N[º°.]*\s*)?(\d+[A-Z]?)$/i);
  if(!m)break;
  rua=m[1].trim();encontrados.unshift(m[2].toUpperCase());
 }
 if(encontrados.some(x=>x!==encontrados[0]))throw Error('Há números divergentes no endereço. Confira o cadastro do cliente.');
 if(n&&encontrados.length&&n!==encontrados[0])throw Error('Número da rua e campo Número não coincidem; confira antes de imprimir ou postar.');
 return {logradouro:rua,numero:n||encontrados[0]||'S/N'};
}
let servicos=[];
let tokenPiloto=null, resumoPiloto=null, valorPiloto=null, pilotando=false, pilotoDisponivel=false;
const CHAVE_TENTATIVA_CARTA='sofisticatto_carta_piloto_tentativa_pendente';
const CHAVE_400_ANTERIOR_CONFERIDO='sofisticatto_carta_erro400_20261113_conferido';
function bloqueioEmissao(){
 const botao=el('cartaEmitirPiloto');
 if(!botao)return;
 const emitida=Boolean(localStorage.getItem('sofisticatto_carta_piloto_real_id'));
 const pendente=Boolean(localStorage.getItem(CHAVE_TENTATIVA_CARTA));
 botao.disabled=!(pilotoDisponivel&&tokenPiloto&&!emitida&&!pendente&&!pilotando);
 botao.title=emitida?'Já existe uma carta com ID salvo: reimprima o PDF.':pendente?'Existe tentativa anterior. Confira no painel oficial antes de outra emissão.':'Exige prévia confirmada e autorização da primeira postagem real.';
}

function aviso(msg,ok){const e=el('cartaStatus');if(e){e.textContent=msg;e.style.color=ok?'#186c42':'#9a361c';}}
async function chave(){
 // Preview e producao sao origens diferentes; reutiliza a autenticacao protegida
 // ja empregada pelas cotacoes de frete (valida token ou pede senha mestre).
 if(typeof obterChaveIntegracoesCotacao==='function'){
  const autorizado=await obterChaveIntegracoesCotacao();
  if(!autorizado)throw Error('Autorização cancelada. Utilize o botão "Autorizar neste Preview".');
  return autorizado;
 }
 const token=sessionStorage.getItem('integrations_admin_key')||localStorage.getItem('integrations_admin_key')||'';
 if(!token)throw Error('Autorização ainda não disponível. Abra a Central de Integrações e valide a Senha Mestre nesta versão Preview.');
 return token;
}
window.cartaAutorizar=async()=>{
 try{
  aviso('Validando sua autorização neste endereço de testes...',true);
  await chave();
  aviso('Dispositivo autorizado neste Preview. Agora clique em "Verificar Carta no contrato".',true);
 }catch(e){aviso(e.message,false);}
};
async function request(modo,body){
 const key=await chave();
 const r=await fetch('/api/integracoes?action=carta-comercial-correios&modo='+modo,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-integrations-admin-key':key},body:body?JSON.stringify(body):undefined});
 const j=await r.json().catch(()=>({}));if(r.status===401)throw Error('Autorização recusada neste Preview. Valide a Senha Mestre deste ambiente e tente novamente.');
 if(!r.ok||!j.ok){const erro=new Error(j.erro||'Correios HTTP '+r.status);erro.codigo=j.codigo||null;erro.codigoCorreios=j.codigoCorreios||null;erro.detalhes=Array.isArray(j.detalhes)?j.detalhes:[];throw erro;}
 return j;
}
function destinatario(){const e=cartaSepararNumero(val('corEndereco'),val('corNumero'));return {nome:val('corCliente'),cpfCnpj:val('corDocumento'),endereco:{cep:val('corCep'),logradouro:e.logradouro,numero:e.numero,complemento:val('corComplemento'),bairro:val('corBairro'),cidade:val('corCidade'),uf:val('corUf')}};}
function hojeBrasilCarta(){
 const partes=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=Object.fromEntries(partes.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return v.year+'-'+v.month+'-'+v.day;
}
function iniciarDataCarta(){const e=el('cartaDataPrevista');if(e&&!e.value)e.value=hojeBrasilCarta();}
function corpo(){iniciarDataCarta();return {cepDestino:val('corCep'),pesoGramas:Number(val('cartaPesoGramas')),dataPrevistaPostagem:val('cartaDataPrevista'),codigoServico:val('cartaServico'),tipoConteudo:'DOCUMENTOS',destinatario:destinatario()};}
function tituloCategoria(categoria){return categoria==='simples'?'Carta Simples':categoria==='registrada_ar'?'Registrada com AR':'Carta Registrada';}
function modalidadeAtiva(){return servicos.find(s=>s.codigo===val('cartaServico'));}
window.cartaDiagnosticar=async()=>{
 try{
  aviso('Consultando Carta Comercial física no contrato...',true);
  const d=await request('diagnostico');
  servicos=d.servicos||[];
  pilotoDisponivel=d.emissaoDeTesteHabilitada===true;tokenPiloto=null;resumoPiloto=null;valorPiloto=null;bloqueioEmissao();
  const s=el('cartaServico'),anterior=s.value;
  s.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Escolha a modalidade';s.append(placeholder);
  for(const item of servicos){
   const o=document.createElement('option');o.value=item.codigo;
   o.textContent=tituloCategoria(item.categoria)+' — '+item.descricao+' ('+item.codigo+')';
   s.append(o);
  }
  // Escolha a Carta Registrada convencional por padrão para documentos importantes.
  // Mantém a modalidade escolhida pelo usuário quando ele atualiza a lista.
  const recomendado=servicos.find(x=>x.codigo==='80799'&&x.categoria==='registrada')||
    servicos.find(x=>x.categoria==='registrada'&&/\bPL3\b/i.test(x.descricao))||
    servicos.find(x=>x.categoria==='registrada')||servicos.find(x=>x.categoria==='simples');
  s.value=servicos.some(x=>x.codigo===anterior)?anterior:recomendado?.codigo||'';
  el('cartaCotacoes').textContent='';
  const verificada=d.registrada80799;
  const marca80799=verificada?.consultaDireta==='confirmado'?
    ' Serviço 80799: confirmado diretamente no cartão (consulta somente leitura).':
    verificada?.presenteNoContrato?
      ' Serviço 80799 aparece no contrato; consulta direta '+(verificada.consultaDireta==='consulta_falhou'?'não concluída':'inconclusiva')+'.':
      ' Código 80799 ainda não identificado nesta listagem do contrato.';
  aviso(servicos.length?(d.observacao+' Modalidade inicial: '+tituloCategoria(modalidadeAtiva()?.categoria)+'.'+marca80799+' '+(d.motivoBloqueioEmissao||'')):(d.observacao||'Carta indisponível.'),
    servicos.length>0&&!d.motivoBloqueioEmissao);
 }catch(e){aviso(e.message,false);}
};
window.cartaVerificarPrepostagem=async()=>{
 try{
  aviso('Verificando a habilitação da API Pré-Postagem no cartão, sem registrar objeto...',true);
  const r=await request('verificar-prepostagem');
  const confirmado=r.habilitacaoApiPrepostagem==='confirmado';
  aviso((confirmado?'API Pré-Postagem autorizada no cartão. ':'Acesso à API Pré-Postagem ainda não confirmado. ')+(r.observacao||''),confirmado);
 }catch(e){aviso(e.message,false);}
};
window.cartaDiagnosticarRotulo=async()=>{
 try{
  aviso('Consultando permissões de Pré-Postagem e rótulos (somente leitura)...',true);
  const d=await request('diagnostico-rotulo');
  const lista=Array.isArray(d.diagnosticos)?d.diagnosticos:[];
  const nome={faixas_solicitadas:'Faixas de etiquetas já solicitadas',saldo_de_rotulos:'Saldo de etiquetas do contrato'};
  const nomeEstado={acessivel:'acesso confirmado',sem_permissao:'sem permissão',limite_temporario:'limite temporário',nao_encontrado:'sem resultado ou recurso não localizado',falha_na_consulta:'falha na consulta',contrato_nao_configurado:'contrato não configurado'};
  const box=el('cartaDiagnosticoRotulo');if(box){
    box.replaceChildren();
    for(const passo of lista){
      const linha=document.createElement('p');
      linha.textContent=(nome[passo.etapa]||passo.etapa)+': '+(nomeEstado[passo.estado]||passo.estado)+(passo.httpStatus?' (HTTP '+passo.httpStatus+')':'');
      linha.style.color=passo.estado==='acessivel'?'#186c42':'#9a361c';
      box.append(linha);
    }
  }
  const acessiveis=lista.filter(x=>x.estado==='acessivel').length;
  const saldoOK=d.saldoAcessivel===true||lista.some(x=>x.etapa==='saldo_de_rotulos'&&x.estado==='acessivel');
  const resumo=saldoOK?'Saldo de rótulos: acesso confirmado. ':'Acesso ao saldo de rótulos não confirmado. ';
  aviso(resumo+'Consultas de leitura: '+acessiveis+'/'+lista.length+'. Nenhuma postagem criada. O PDF oficial só poderá ser validado com uma pré-postagem real autorizada.',saldoOK);
 }catch(e){aviso(e.message,false);}
};
window.cartaCotar=async()=>{
 try{
  if(!val('cartaServico')){aviso('Primeiro clique em "Verificar Carta no contrato" e escolha uma modalidade.',false);return;}
  aviso('Cotando somente a modalidade selecionada...',true);
  const r=await request('cotar',corpo()),box=el('cartaCotacoes');
  box.replaceChildren();
  for(const x of r.resultados||[]){
    const p=document.createElement('p');
    p.textContent=(x.titulo||tituloCategoria(x.categoria))+' — '+x.descricao+': '+
      (x.ok?Number(x.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Indisponível — '+x.erro);
    box.append(p);
  }
  aviso(r.validos?'Preço confirmado pela API para este serviço e peso. Nenhuma postagem criada.':'Não foi possível cotar este serviço; confira o retorno dos Correios.',r.validos>0);
 }catch(e){aviso(e.message,false);}
};
// Baixa somente o arquivo oficial de IMPORTAÇÃO de objetos registrados.
// O servidor não faz POST aos Correios; a criação ocorre apenas se o operador
// carregar o arquivo manualmente na PPN Web > objetos registrados.
window.cartaExportarRegistrada=async()=>{
 try{
  if(val('cartaServico')!=='80799')
   return aviso('Selecione Carta Registrada 80799 para exportar o JSON oficial.',false);
  aviso('Validando os dados e montando JSON de objeto registrado, SEM enviar aos Correios...',true);
  const d=await request('arquivo-registrado',corpo());
  const items=d.arquivo;
  if(!d.somenteArquivo||!Array.isArray(items)||items.length!==1||
     items[0]?.codigoServico!=='80799'||items[0]?.codigoFormatoObjetoInformado!=='1'||!Array.isArray(items[0]?.listaServicoAdicional)||
     !items[0].listaServicoAdicional.some(x=>x.codigoServicoAdicional==='025'))
    throw Error('O arquivo JSON retornado não corresponde ao modelo de uma Carta Registrada 80799.');
  const bytes=new Blob([JSON.stringify(items,null,2)+'\n'],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(bytes),a=document.createElement('a');
  a.href=url;a.download=d.nomeArquivo||'carta-registrada-80799.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  aviso('Arquivo JSON pronto com 1 Carta Registrada (80799 e adicional 025). Nenhuma postagem foi criada pelo portal Sofisticatto. Importe manualmente em Correios → Pré-postagem a faturar de objetos registrados → Importar arquivo; confira o processamento antes de imprimir o rótulo.',true);
 }catch(e){aviso('Arquivo não gerado: '+e.message,false)}
};
window.cartaPreparar=async()=>{
 tokenPiloto=null;resumoPiloto=null;valorPiloto=null;bloqueioEmissao();
 try{
  if(!val('cartaServico')){aviso('Selecione primeiro o serviço de Carta Comercial.',false);return;}
  aviso('Validando endereço e peso sem transmitir aos Correios...',true);
  const r=await request('preparar',corpo());
  if(r.confirmacaoPiloto&&r.resumo){
   tokenPiloto=r.confirmacaoPiloto;resumoPiloto=r.resumo;valorPiloto=r.valorCotado??null;
   aviso(r.emissaoDeTesteHabilitada===true?'Validação concluída. Confira destinatário, data e valor antes de autorizar uma carta.':'Dados, data e tarifa validados SEM ENVIO. A emissão real está bloqueada devido ao PPN-213 (objetos registrados versus objetos simples); o layout oficial ainda precisa ser confirmado.',r.emissaoDeTesteHabilitada===true);
  }else aviso(r.observacao,true);
  bloqueioEmissao();
 }catch(e){aviso(e.message,false);}
};
window.cartaConferiTentativaAnterior=()=>{
 if(!localStorage.getItem(CHAVE_TENTATIVA_CARTA))
  return aviso('Não há tentativa pendente registrada neste navegador. Se tentou enviar em outra versão, confira diretamente no portal oficial.',false);
 if(localStorage.getItem('sofisticatto_carta_piloto_real_id'))
  return aviso('Uma carta já possui ID registrado. Não crie outra: recupere a etiqueta oficial pelo ID.',false);
 const confirmou=window.confirm('Você consultou o portal de Pré-Postagem dos Correios e confirmou que NÃO existe carta registrada para este destinatário, serviço e horário?\n\nConfirme somente após verificar. Esta ação não envia carta, apenas libera uma nova validação.');
 if(!confirmou)return aviso('A tentativa anterior permanece bloqueada. Nenhuma carta foi enviada.',false);
 localStorage.removeItem(CHAVE_TENTATIVA_CARTA);
 localStorage.setItem(CHAVE_400_ANTERIOR_CONFERIDO,'1');
 tokenPiloto=null;resumoPiloto=null;valorPiloto=null;
 bloqueioEmissao();
 aviso('Verificação registrada. Clique novamente no botão 3 para validar dados e preço. Nenhuma carta foi enviada por esta ação.',true);
};
window.cartaEmitir=async()=>{
 if(pilotando)return;
 if(localStorage.getItem(CHAVE_TENTATIVA_CARTA))return aviso('Existe tentativa anterior: confira no portal oficial se houve registro antes de tentar novamente.',false);
 const idExistente=localStorage.getItem('sofisticatto_carta_piloto_real_id');
 if(idExistente){
  el('cartaId').value=idExistente;
  return aviso('Uma carta já foi registrada nesta sessão. Não envie novamente: use o ID salvo para obter o PDF oficial.',false);
 }
 if(!pilotoDisponivel||!tokenPiloto||!resumoPiloto)return aviso('Primeiro valide os dados da Carta Registrada pelo botão 3. O piloto só funciona na Preview autorizada.',false);
 const d=corpo(),s=servicos.find(x=>x.codigo===d.codigoServico);
 if(s?.categoria!=='registrada')return aviso('Selecione Carta Registrada sem AR para o primeiro piloto.',false);
 const resumo=[
  'PRÉ-POSTAGEM REAL DOS CORREIOS',
  'Destinatário: '+resumoPiloto.destinatario,
  'Endereço: '+resumoPiloto.endereco,
  'CEP/cidade: '+resumoPiloto.cepDestino+' — '+resumoPiloto.cidade+'/'+resumoPiloto.uf,
  'Modalidade: '+resumoPiloto.modalidade,
  'Peso: '+resumoPiloto.pesoGramas+' g',
  'Data prevista de postagem: '+resumoPiloto.dataPrevistaPostagem,
  valorPiloto!=null?'Valor cotado: '+Number(valorPiloto).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Valor: confira a cotação anterior',
  '',
  'Esta operação cria uma carta REAL e poderá gerar cobrança. Nenhum reenvio será automático.',
  'CONFIRMA os dados e autoriza a criação desta primeira carta?'
 ].join('\n');
 if(!window.confirm(resumo))return aviso('Emissão cancelada. Nenhum objeto criado.',false);
 localStorage.setItem(CHAVE_TENTATIVA_CARTA,JSON.stringify({data:new Date().toISOString(),situacao:'aguardando_reconciliacao'}));
 pilotando=true;bloqueioEmissao();aviso('Enviando uma única pré-postagem real. Não atualize a página...',true);
 try{
  const r=await request('emitir',{...d,confirmacaoPiloto:tokenPiloto,confirmarEmissaoReal:true});
  if(!/^PR[A-Za-z0-9]{10,40}$/.test(String(r.idPrePostagem||'')))throw Error('Resposta sem ID oficial. Confira o painel dos Correios ANTES de repetir.');
  localStorage.setItem('sofisticatto_carta_piloto_real_id',r.idPrePostagem);
  localStorage.setItem(CHAVE_TENTATIVA_CARTA,JSON.stringify({data:new Date().toISOString(),situacao:'id_recebido'}));
  el('cartaId').value=r.idPrePostagem;
  tokenPiloto=null;resumoPiloto=null;
  aviso('PRÉ-POSTAGEM REAL REGISTRADA! ID '+r.idPrePostagem+'. Solicitando PDF oficial; se ainda estiver processando, clique somente em Imprimir rótulo oficial por ID.',true);
  await window.cartaRotulo();
 }catch(e){
  const codigo=e.codigoCorreios?' Código Correios: '+e.codigoCorreios+'.':'';
  aviso('Pré-postagem não confirmada: '+e.message+codigo+' Confira no portal oficial se existe registro. Nova tentativa bloqueada até sua conferência.',false);
 }finally{pilotando=false;bloqueioEmissao();}
};
window.cartaRotulo=async()=>{
 try{
  const id=val('cartaId');if(!/^PR[A-Za-z0-9]{10,40}$/.test(id))throw Error('Informe o ID oficial da pré-postagem de Carta Registrada.');
  const key=await chave();
  aviso('Gerando rótulo oficial em PDF...',true);
  const url='/api/integracoes?action=documentos-correios&modo=rotulo&idPrePostagem='+encodeURIComponent(id)+'&tipoRotulo=P';
  const r=await fetch(url,{headers:{'x-integrations-admin-key':key}});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.erro||'Correios HTTP '+r.status);}
  const bytes=await r.arrayBuffer();
  if(new TextDecoder().decode(bytes.slice(0,4))!=='%PDF')throw Error('O serviço não retornou um PDF de rótulo válido.');
  const src=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const modal=document.createElement('div');modal.style.cssText='position:fixed;inset:0;background:#17122ac9;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:10px';
  const wrap=document.createElement('section');wrap.style.cssText='background:#fff;border-radius:12px;width:min(1120px,100%);height:94vh;display:flex;flex-direction:column;overflow:hidden';
  const bar=document.createElement('header');bar.style.cssText='padding:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
  const title=document.createElement('strong');title.textContent='Rótulo oficial — Carta Registrada';title.style.flex='1';bar.append(title);
  const frame=document.createElement('iframe');frame.title='Prévia de rótulo oficial';frame.src=src;frame.style.cssText='border:0;width:100%;flex:1';
  const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className='btn azul';b.onclick=action;bar.append(b);};
  const fechar=()=>{modal.remove();setTimeout(()=>URL.revokeObjectURL(src),3000);};
  button('Imprimir',()=>{frame.contentWindow.focus();frame.contentWindow.print();});
  button('Baixar PDF',()=>{const a=document.createElement('a');a.href=src;a.download='carta-registrada-correios.pdf';document.body.append(a);a.click();a.remove();});
  button('Fechar',fechar);wrap.append(bar,frame);modal.append(wrap);document.body.append(modal);
  aviso('Rótulo oficial aberto dentro do portal.',true);
 }catch(e){aviso(e.message,false);}
};
window.cartaImprimirEnderecamento=()=>{
 try{
  const d=destinatario(),e=d.endereco;
  if(!d.nome||dig(e.cep).length!==8||!e.logradouro||!e.cidade||!e.bairro||!e.uf)throw Error('Complete nome, rua, bairro, CEP, cidade e UF do destinatário.');
  const cep=dig(e.cep).replace(/^(\d{5})(\d{3})$/,'$1-$2');
  const rua=[e.logradouro,e.numero].filter(Boolean).join(', ');
  const remetenteNome=val('corRemNome');
  const remetenteEndereco=val('corRemEndereco');
  const remetenteLocal=[val('corRemCidade'),val('corRemUf')].filter(Boolean).join(' / ');
  // Enderecamento de apoio para colar sobre envelope. Nao gera codigo de postagem.
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8">'
   +'<style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12pt Arial,sans-serif;color:#111;margin:0}'
   +'.etiqueta{width:115mm;min-height:63mm;border:1px dashed #aaa;padding:7mm;break-inside:avoid}'
   +'.chapeu{font-size:8pt;color:#555;letter-spacing:.4px;margin-bottom:4mm}'
   +'.destinatario{font-size:13pt;font-weight:750;margin-bottom:3mm;overflow-wrap:anywhere}'
   +'.endereco{font-size:11pt;line-height:1.3;overflow-wrap:anywhere}'
   +'.cep{font-weight:750;letter-spacing:.3px;margin-top:1.5mm}'
   +'.remetente{font-size:8.5pt;color:#444;max-width:115mm;padding:3mm 2mm;border-bottom:1px solid #e4e4e4}'
   +'.observacao{margin-top:3mm;color:#555;font-size:8pt;max-width:115mm}</style></head><body>'
   +'<section class="remetente"><b>Remetente:</b> '+escape(remetenteNome)+' '+escape(remetenteEndereco)+' '+escape(remetenteLocal)+'</section>'
   +'<section class="etiqueta"><div class="chapeu">DESTINATÁRIO • CORRESPONDÊNCIA</div><div class="destinatario">'+escape(d.nome)+'</div>'
   +'<div class="endereco">'+escape(rua)+(e.complemento?' — '+escape(e.complemento):'')+'<br>'+escape(e.bairro)+'<br>'+escape(e.cidade)+' / '+escape(e.uf)+'</div>'
   +'<div class="cep">CEP '+escape(cep)+'</div></section>'
   +'<p class="observacao">Endereçamento interno para envelope. NÃO é rótulo postal oficial, postagem paga ou comprovante de envio.</p></body></html>';
  const f=document.createElement('iframe');
  f.style.cssText='position:fixed;left:-20000px;top:0;width:1px;height:1px;border:0';
  document.body.appendChild(f);
  f.onload=()=>{try{f.contentWindow.focus();f.contentWindow.print();}finally{setTimeout(()=>f.remove(),5000);}};
  f.srcdoc=html;
  aviso('Endereçamento A4 pronto, com o número correto uma única vez. Não substitui o rótulo oficial.',true);
 }catch(e){aviso(e.message,false);}
};
window.cartaBuscarCliente=()=>{
 const q=val('cartaBuscaCliente');if(q.length<2)return;
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const clientes=(typeof emailClientes!=='undefined'&&Array.isArray(emailClientes))?emailClientes:[];
 const selecionado=clientes.find(c=>norm(c.nome)===norm(q)||dig(q).length>=11&&dig(c.cpf_cnpj)===dig(q));
 if(selecionado){
  const m={corCliente:selecionado.nome,corDocumento:selecionado.cpf_cnpj,corEndereco:selecionado.endereco||selecionado.logradouro,corNumero:selecionado.numero,corComplemento:selecionado.complemento,corBairro:selecionado.bairro,corCidade:selecionado.cidade,corUf:selecionado.uf,corCep:selecionado.cep};
  for(const [id,v] of Object.entries(m))if(el(id)&&v)el(id).value=String(v);
  if(typeof atualizarCorreiosTudo==='function')atualizarCorreiosTudo();aviso('Cliente selecionado: '+selecionado.nome,true);
 }
 const dl=el('cartaClientesLista');dl.replaceChildren();
 for(const c of clientes.filter(c=>norm(c.nome).includes(norm(q))||(dig(q).length>=3&&dig(c.cpf_cnpj).includes(dig(q)))).slice(0,20)){
  const o=document.createElement('option');o.value=c.nome;o.label=(c.cpf_cnpj||'')+' — '+(c.cidade||'');dl.append(o);
 }
};
// Primeiro uso da correção: a tentativa com HTTP 400 de 13/11 foi feita antes
// do registro local de tentativas. Exigir conferência no Correios uma única vez.
try{
 const salvo=localStorage.getItem('sofisticatto_carta_piloto_real_id');
 if(salvo&&el('cartaId'))el('cartaId').value=salvo;
 if(!salvo&&!localStorage.getItem(CHAVE_400_ANTERIOR_CONFERIDO)&&!localStorage.getItem(CHAVE_TENTATIVA_CARTA))
  localStorage.setItem(CHAVE_TENTATIVA_CARTA,JSON.stringify({situacao:'reconciliar_envio_anterior_400',data:'2026-11-13'}));
}catch{}
iniciarDataCarta();
bloqueioEmissao();
})();