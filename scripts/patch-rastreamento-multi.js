const fs = require('fs');

const coletasPath = 'coletas.js';
let s = fs.readFileSync(coletasPath, 'utf8');

const oldIntegracoes = `async function carregarTransportadorasRastreamentoIntegrado(){
  try{
    const r=await banco.from("transportadora_integracoes")
      .select("transportadora_nome,status_tecnico,rastreamento_ativo")
      .eq("rastreamento_ativo",true);
    if(r.error)throw r.error;
    transportadorasRastreamentoIntegrado=(r.data||[]).filter(
      x=>String(x.status_tecnico||"").toLowerCase()!=="suspensa"
    );
  }catch(e){
    console.warn("Não foi possível carregar transportadoras integradas:",e.message);
    transportadorasRastreamentoIntegrado=[];
  }
}`;

const newIntegracoes = `async function carregarTransportadorasRastreamentoIntegrado(){
  try{
    const r=await banco.from("transportadora_integracoes")
      .select("transportadora_nome,status_tecnico,rastreamento_ativo,integracao_tipo,coleta_ativa,ambiente_atual");
    if(r.error)throw r.error;
    transportadorasRastreamentoIntegrado=(r.data||[]).filter(x=>{
      const status=String(x.status_tecnico||"").toLowerCase();
      if(status==="suspensa")return false;
      if(x.rastreamento_ativo===true)return true;
      const tipo=String(x.integracao_tipo||"").toLowerCase();
      if(tipo==="webservice" && x.rastreamento_ativo!==false)return true;
      return false;
    });
  }catch(e){
    console.warn("Não foi possível carregar transportadoras integradas:",e.message);
    transportadorasRastreamentoIntegrado=[];
  }
}`;

if (s.includes(oldIntegracoes)) {
  s = s.replace(oldIntegracoes, newIntegracoes);
}

const oldCreate = `  const ehRodonaves=/rodonaves/i.test(transportadora?.nome||"");
  const statusColeta=String(payload.status_api||payload.status||"").toLowerCase();
  const coletada=/coletad/.test(statusColeta);

  if(!ehRodonaves&&!coletada)return;`;

const newCreate = `  const ehRodonaves=/rodonaves/i.test(transportadora?.nome||"");
  const integrado=transportadoraTemRastreamentoIntegrado(transportadora?.nome||"");
  const statusColeta=String(payload.status_api||payload.status||"").toLowerCase();
  const coletada=/coletad/.test(statusColeta);
  if(!ehRodonaves&&!integrado&&!coletada)return;`;

if (s.includes(oldCreate)) {
  s = s.replace(oldCreate, newCreate);
}

const oldUnsupported = `  alert("Esta transportadora ainda não possui consulta automática implementada.");`;
const newUnsupported = `  const integracao=(transportadorasRastreamentoIntegrado||[]).find(i=>{
    const a=nomeNormalizadoTransportadora(i.transportadora_nome);
    const b=nomeNormalizadoTransportadora(nome);
    return a&&(a.includes(b)||b.includes(a));
  });
  if(integracao && String(integracao.integracao_tipo||"").toLowerCase()==="webservice"){
    alert(\`O rastreio de \${nome} está integrado por WebService/SSW. As ocorrências são recebidas automaticamente quando a transportadora envia os eventos.\`);
    return;
  }
  alert(\`A transportadora \${nome} está integrada no painel, mas ainda não possui uma consulta direta configurada. O registro continua disponível para atualização por webhook/SSW ou acompanhamento manual.\`);`;

if (s.includes(oldUnsupported)) {
  s = s.replace(oldUnsupported, newUnsupported);
}

fs.writeFileSync(coletasPath, s, 'utf8');

const indexPath = 'index.html';
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace('coletas.js?v=36-alfa', 'coletas.js?v=37-rastreio-multi');
  fs.writeFileSync(indexPath, html, 'utf8');
}

console.log('[patch-rastreamento-multi] OK');
