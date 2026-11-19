/* V438: painel único para consulta autenticada do piloto; não transmite alterações. */
(function(){
'use strict';
function montar(){
 const base=document.getElementById('regularizacaoBradescoConferenciaV424');
 if(!base||document.getElementById('bradescoPilotoV438'))return;
 const panel=document.createElement('section');panel.id='bradescoPilotoV438';
 panel.style.cssText='margin:14px 0;padding:16px;border:1px solid #b9a5d5;border-radius:12px;background:#faf8fd';
 const h=document.createElement('h4');h.textContent='Piloto Bradesco — manutenção de encargos';panel.appendChild(h);
 const p=document.createElement('p');p.textContent='Consulta individual autenticada ao Bradesco para verificar situação, vencimento, valor e simulação de multa de 2% + juros de 5% ao mês. Somente leitura: não altera nem reemite boleto.';panel.appendChild(p);
 const b=document.createElement('button');b.type='button';b.className='btn roxo';b.textContent='Executar conferência única 55994-01';panel.appendChild(b);

 const button484=document.createElement('button');button484.type='button';button484.className='btn roxo';
 button484.textContent='Teste único 56078-02 — diagnóstico completo';
 button484.style.marginLeft='8px';panel.appendChild(button484);
 const audit484=document.createElement('pre');audit484.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px;font:13px/1.5 Segoe UI,Arial,sans-serif';
 audit484.setAttribute('aria-live','polite');panel.appendChild(audit484);
 let relatorioV508='';
 const baixarV508=document.createElement('button');baixarV508.type='button';
 baixarV508.className='btn roxo';baixarV508.style.marginLeft='8px';
 baixarV508.textContent='Baixar relatório técnico TXT';baixarV508.disabled=true;
 panel.appendChild(baixarV508);
 baixarV508.onclick=()=>{
  if(!relatorioV508)return;
  const url=URL.createObjectURL(new Blob([relatorioV508],{type:'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='Bradesco_WF-99571_Teste_Unico_56078-02_V508.txt';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 button484.onclick=async()=>{
  button484.disabled=true;audit484.textContent='Consultando o registro original no Bradesco (somente leitura)...';
  try{
   if(typeof bradescoReqProducao!=='function')throw new Error('Autorização de integração indisponível. Atualize a página.');
   const j=await bradescoReqProducao('teste-unico-encargos-v508',{numero_nf:'56078',parcela:2});
   const u=j.diagnostico_unico_v508;
   if(!u)throw Error('Servidor ainda não publicou V508. Nenhum PUT enviado.');
   const lista=Array.isArray(u.detalhe_todas_verificacoes)?u.detalhe_todas_verificacoes:[];
   relatorioV508=[
    'SOFISTICATTO — CHAMADO WF-99571 — TESTE ÚNICO BRADESCO V508',
    'Título 56078-02 | Nosso Número 62710000058 | Emissão/alteração PUT: NÃO REALIZADA',
    'Estado: '+u.status+' | Código: '+(u.codigo_erro||'nenhum'),
    'HTTP da consulta: '+(u.http_status_consulta??'não concluída'),
    'Situação bancária: '+(u.situacao_bancaria||'não confirmada'),
    'Total de verificações: '+(u.numero_verificacoes??lista.length),
    'Pendências: '+(u.numero_pendencias??0),
    'Chamada PUT: 0 | cURL executado: NÃO EXISTE | response de PUT: NÃO EXISTE',
    'NÃO encaminhar este relatório como se houvesse uma alteração executada.',
    '',
    'VERIFICAÇÃO CAMPO A CAMPO:',
    ...lista.map(c=>[c.estado,c.campo,c.fonte,c.descricao,c.proxima_acao].join(' | ')),
    '',
    'CAMPOS IMPEDITIVOS: '+(u.campos_impeditivos||[]).join('; '),
    'PRÓXIMA AÇÃO: '+u.proxima_acao,
    'OBS.: Identificadores, credenciais e dados pessoais completos omitidos.'
   ].join('\\n');
   audit484.textContent=[
    'RESULTADO DO TESTE ÚNICO — BRADESCO 56078-02',
    'Situação: '+u.status,
    'HTTP consulta: '+(u.http_status_consulta??'não concluída')+' | PUT: NÃO ENVIADO',
    'Verificações: '+(u.numero_verificacoes??lista.length)+' | Pendências: '+(u.numero_pendencias??0),
    'ERROS / PENDÊNCIAS CONSOLIDADOS:',
    ...lista.filter(c=>['FALHA','PENDENTE'].includes(c.estado)).map(c=>'• '+c.campo+' — '+c.descricao+' | '+c.proxima_acao),
    '',
    'Relatório TXT completo disponível no botão acima. Uma consulta; sem reenvio.'
   ].join('\\n');
   baixarV508.disabled=false;
   return;
   const t=j.titulo||{},v=j.auditoria_originais_v484||{},res=v.resumo||{},doc=v.documento_pagador||{};
   const rotulo=v=>v?'OK':'PENDENTE';
   audit484.textContent=[
    'CONFERÊNCIA AUTENTICADA — BRADESCO 56078-02',
    'Modalidade: SOMENTE LEITURA — nenhuma alteração transmitida',
    'Nosso Número: '+(t.nosso_numero||'—'),
    'Valor original: R$ '+Number(t.valor_nominal||0).toFixed(2).replace('.',','),
    'Vencimento ORIGINAL no Bradesco: '+(t.vencimento_original_banco||res.vencimento_banco||'não confirmado'),
    'Vencimento do BOLETO ATUALIZADO: '+(t.vencimento_boleto_atualizado||res.vencimento_boleto_atualizado||t.vencimento||'não informado'),
    'Data de emissão do Bradesco: '+(res.data_emissao||'não informada'),
    'Espécie do documento: '+(res.especie||'não informada'),
    'Seu Número: '+(res.seu_numero||'não informado'),
    'Estado bancário: '+(t.status_banco||'—'),
    'Documento do pagador: '+(doc.situacao||'NÃO AVALIADO')+
      ' — portal: '+(doc.tipo_local||'não informado')+' | banco: '+(doc.tipo_banco||'não informado')+
      '. '+(doc.motivo||''),
    'Nome do pagador confere: '+(doc.nome_confere?'SIM':'NÃO CONFIRMADO'),
    'Verificação de documento: '+(doc.formato_comparacao||'NAO_VALIDADO')+
      ' — Manual Bradesco v1.6.4, raiz 9 + filial 4 + controle 2.',
    doc.situacao==='CONFERE'?
     'Identificação confirmada pelo retorno bancário: nenhuma correção de CPF/CNPJ necessária.':
     'Atenção: documento não confirmado. Não substituir CPF/CNPJ automaticamente.',
    'Dados originais: '+Object.entries(v.origem||{}).map(([ch,ok])=>ch+'='+rotulo(ok)).join(' | '),
    'Pagador: '+Object.entries(v.campos||{}).map(([ch,ok])=>ch+'='+rotulo(ok)).join(' | '),
    'Diferença do contrato: manual v1.6.4 determina codigoNegativacao=1, e-mail do suporte sugere zero para numéricos não usados.',
    'Pendências: '+(v.pendencias||[]).join('; '),
    'RETORNO BANCÁRIO — INVENTÁRIO INTEGRAL (sem nova consulta; dados pessoais ocultos):',
    'Total de campos: '+(j.diagnostico_campos_v488?.total_campos??'indisponível')+
      ' | exibidos: '+(j.diagnostico_campos_v488?.mostrados??0)+
      ' | truncado: '+(j.diagnostico_campos_v488?.truncado?'SIM':'NÃO'),
    ...(j.diagnostico_campos_v488?.campos||[]).map(c=>'  '+c.caminho+' ['+c.tipo+'] = '+c.valor+(c.vazio?' (VAZIO)':'')),
    'CAMPOS IMUTÁVEIS DO PUT: '+(j.documentacao_put_v488?.campos_chave||[]).join(' | '),
    'DIVERGÊNCIAS MANUAL x EXEMPLO: '+(j.documentacao_put_v488?.divergencias||[]).join(' ; '),
    'CAMPOS DE JUROS/MULTA A VALIDAR: '+(j.documentacao_put_v488?.campos_juros_multa_a_validar||[]).join(' | '),
    'PRÉ-VALIDAÇÃO DO CONTRATO PUT V489 — usa a mesma consulta, não transmite:',
    'Campos mapeados: '+(j.diagnostico_put_v489?.quantidade_campos??'indisponível')+
      ' | pendências: '+(j.diagnostico_put_v489?.quantidade_pendencias??'indisponível'),
    ...(j.diagnostico_put_v489?.campos||[]).map(c=>'  '+c.campo+' => '+c.estado+' | '+c.indicador+
      ' | origem: '+c.fonte+(c.nota?' | '+c.nota:'')),
    'PONTOS IMPEDITIVOS DO PUT:',
    ...(j.diagnostico_put_v489?.pendencias||[]).map(v=>'  • '+v),
    'TRANSMISSÃO PUT: BLOQUEADA até orientação inequívoca do banco.',
    'Nenhum boleto foi emitido, baixado ou alterado.'
   ].join('\n');
  }catch(e){audit484.textContent='Conferência não concluída: '+String(e.message||e);}
  finally{button484.disabled=false;}
 };

 const result=document.createElement('pre');result.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px;font:13px/1.5 Segoe UI,Arial,sans-serif';result.setAttribute('aria-live','polite');panel.appendChild(result);
 b.onclick=async()=>{
  b.disabled=true;result.textContent='Consultando Bradesco...';
  try{
   if(typeof bradescoReqProducao!=='function')throw new Error('A função autenticada do portal não está disponível. Atualize a página.');
   const j=await bradescoReqProducao('conferir-piloto-55994-v435',{parcela:'01'});
   const t=j.titulo||{},s=j.simulacao||{};
   const f=j.conferencia_unica_v446||{};
   const format=v=>'R$ '+Number(v||0).toFixed(2).replace('.',',');
   const faltantes=(f.pendencias||[]).join('; ');
   result.textContent=[
    'CONFERÊNCIA ÚNICA — BOLETO 55994-01',
    'Consulta autenticada: CONCLUÍDA',
    'Nosso Número: '+(t.nosso_numero||'—'),
    'Status bancário: '+(t.status_banco||'—'),
    'Vencimento original no Bradesco: '+(t.vencimento_original_banco||'—'),
    'Vencimento original no cadastro: '+(t.vencimento_original_local||'—'),
    'Data da segunda via: '+(t.vencimento_boleto_atualizado||'—'),
    'Valor nominal: '+format(t.valor_nominal_local),
    'Elegibilidade preliminar: '+(j.elegivel_preliminar?'SIM':'NÃO'),
    'Identificadores para alteração: '+(f.identificadores_ok?'LOCALIZADOS':'INCOMPLETOS'),
    'Campos do pagador localizados: '+Object.entries(f.pagador||{}).filter(([,v])=>v).map(([k])=>k).join(', '),
    'Campos do título com fonte candidata (sujeitos à validação): '+Object.entries(f.titulo||{}).filter(([,v])=>v).map(([k])=>k).join(', '),
    'Simulação local: multa '+format(s.multa_estimada)+' + juros '+format(s.juros_estimados)+' = '+format(s.total_estimado),
    'Dados bancários originais confirmados: '+Object.entries(f.origem_confirmada||{}).filter(([k,v])=>k.endsWith('Banco')&&v).map(([k])=>k).join(', '),
    'BLOQUEIOS DO CONTRATO PUT: '+(f.impedimentos_contratuais||[]).join('; '),
    'Fontes locais V451: '+Object.entries(f.descoberta_campos_v451?.fontes_historico||{}).filter(([,v])=>v).map(([k])=>k).join(', '),
    'Aliases da API V451: '+Object.entries(f.descoberta_campos_v451?.nomes_encontrados||{}).map(([k,v])=>k+'=['+v.join(', ')+']').join('; '),
    'Resposta histórica V452: '+Object.entries(f.auditoria_resposta_v452?.campos_originais_presentes||{}).map(([k,v])=>k+'=['+v.join(', ')+']').join('; '),
    'Origem da emissão original comprovada pela resposta armazenada: '+(f.auditoria_resposta_v452?.origem_emissao_original_comprovada?'SIM':'NÃO'),
    'Referência local corresponde à NF/parcela: '+(f.evidencias_v453?.referencia_compativel_com_nf_parcela?'SIM':'NÃO'),
    'Pré-validação para transmissão: '+(f.evidencias_v453?.elegivel_para_transmissao?'LIBERADA':'BLOQUEADA'),
    'Manual Bradesco V450: '+(f.revisao_manual_v450?.endpoint||'não conferido'),
    'Escala dos juros no PUT homologada: '+(f.revisao_manual_v450?.juros_mensal_5_porcento_escala_homologada?'SIM':'NÃO'),
    'Alteração retroativa confirmada: '+(f.revisao_manual_v450?.retroativo_vencido_aceito_confirmado?'SIM':'NÃO'),
    'PENDÊNCIAS: '+(faltantes||'Nenhuma identificada'),
    'ALTERAÇÃO BANCÁRIA: NÃO TRANSMITIDA — contrato e escala dos encargos ainda não homologados.'
   ].join('\n');
  }catch(e){result.textContent='Não foi possível concluir a conferência: '+String(e.message||e);}
  finally{b.disabled=false;}
 };
 base.insertAdjacentElement('afterend',panel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',montar);else montar();
})();
