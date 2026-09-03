const {listarPrepostagens,listaPrepostResposta,valorProfundo}=require('./_correios');

function txt(v){return String(v??'').trim();}
function dig(v){return txt(v).replace(/\D/g,'');}
function normalizaCodigo(v){return txt(v).toUpperCase().replace(/\s+/g,'');}
function extrairAdicionais(item){
  const candidatos=[item?.listaServicoAdicional,item?.servicosAdicionais,item?.servicoAdicional,item?.objeto?.listaServicoAdicional];
  for(const v of candidatos) if(Array.isArray(v)) return v;
  return [];
}
function possui095(lista){return (lista||[]).some(x=>dig(x?.codigoServicoAdicional??x?.codigo??x)==='095');}
function resumo(item){
  const adicionais=extrairAdicionais(item);
  return {
    idPrePostagem:txt(valorProfundo(item,['idPrePostagem','prePostagemId','id'])),
    codigoObjeto:normalizaCodigo(valorProfundo(item,['codigoObjeto','codObjeto','codigoRastreio','eticket'])),
    codigoServico:dig(valorProfundo(item,['codigoServico','servico','codigoServicoPostagem'])).slice(0,5),
    status:txt(valorProfundo(item,['status','statusAtual','descricaoStatus'])),
    listaServicoAdicional:adicionais,
    codigo095Registrado:possui095(adicionais),
    cienteObjetoNaoProibido:valorProfundo(item,['cienteObjetoNaoProibido']),
    objetoCargo:valorProfundo(item,['objetoCargo','indicadorObjetoCargo','isCargo'])||null,
    logisticaReversa:valorProfundo(item,['logisticaReversa'])||null,
    dadosRisco:{
      restricaoAerea:valorProfundo(item,['restricaoAerea','indicadorRestricaoAerea','transporteAereo','modalAereo'])||null,
      artigoPerigoso:valorProfundo(item,['artigoPerigoso','artigosPerigosos','indicadorArtigoPerigoso'])||null
    }
  };
}

module.exports=async function handler(req,res){
  try{
    if(!['GET','POST'].includes(req.method)) return res.status(405).json({ok:false,erro:'Use GET ou POST.'});
    const b=req.method==='GET'?(req.query||{}):(req.body||{});
    const alvoId=txt(b.idPrePostagem||b.id);
    const alvoCodigo=normalizaCodigo(b.codigoObjeto||b.codigoRastreio);
    if(!alvoId&&!alvoCodigo) return res.status(400).json({ok:false,erro:'Informe idPrePostagem ou codigoObjeto.'});

    const consultados=[];
    let encontrado=null;
    for(const status of ['PREPOSTADO','PREATENDIDO','POSTADO']){
      for(let page=0;page<5&&!encontrado;page++){
        let d;
        try{d=await listarPrepostagens({status,tipoObjeto:'REGISTRADO',page,size:100});}
        catch(e){consultados.push({status,page,erro:e.message});break;}
        const itens=listaPrepostResposta(d);
        consultados.push({status,page,quantidade:itens.length});
        encontrado=itens.find(item=>{
          const id=txt(valorProfundo(item,['idPrePostagem','prePostagemId','id']));
          const cod=normalizaCodigo(valorProfundo(item,['codigoObjeto','codObjeto','codigoRastreio','eticket']));
          return (alvoId&&id===alvoId)||(alvoCodigo&&cod===alvoCodigo);
        })||null;
        const temProxima=Boolean(d?.hasNext??d?.temProximaPagina??(Number(d?.page?.number)<Number((d?.page?.totalPages||1)-1)));
        if(itens.length<100&&!temProxima)break;
      }
      if(encontrado)break;
    }

    if(!encontrado) return res.status(404).json({ok:false,erro:'Pré-postagem não localizada na consulta oficial dos Correios neste momento.',idPrePostagem:alvoId||null,codigoObjeto:alvoCodigo||null,consultados});

    const r=resumo(encontrado);
    console.log('[CORREIOS DIAGNOSTICO V128]',{alvoId,alvoCodigo,...r});
    return res.status(200).json({ok:true,...r,consultados,raw:encontrado});
  }catch(e){
    return res.status(Number(e.httpStatus)||500).json({ok:false,erro:e.message,resposta:e.resposta||null});
  }
};
