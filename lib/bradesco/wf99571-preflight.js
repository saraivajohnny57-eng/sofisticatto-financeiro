'use strict';
// Bradesco WF-99571 — piloto SOMENTE LEITURA, sem chamada PUT.
// Regras confirmadas por e-mail oficial em 10/11/2026.
// Strings de 6 posições são apenas representação documental: JSON numérico usa 50000/20000.
const ENCARGOS=Object.freeze({
  codigoComissaoPermanencia:2,
  diasComissaoPermanencia:1,
  valorComissaoPermanencia:50000,
  codigoMulta:2,
  diasMulta:1,
  valorMulta:20000
});
function soDigitos(x){return String(x??'').replace(/\D/g,'');}
function dmy(iso){const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+m[2]+m[1]:null;}
function verificarOriginal(reg,t){
 const pendencias=[];
 if(String(reg?.numero_nf)!=='55994'||Number(reg?.parcela_numero)!==1||String(reg?.referencia)!=='BRADESCO-55994-01')pendencias.push('identificação NF/parcela local');
 if(soDigitos(reg?.nosso_numero)!=='62710000024')pendencias.push('Nosso Número local');
 if(Number(reg?.valor)!==441.91)pendencias.push('valor nominal local');
 if(String(reg?.vencimento)!=='2026-10-18')pendencias.push('vencimento original local');
 if(String(t?.snumero)!=='55994-01')pendencias.push('Seu Número na consulta oficial');
 if(String(t?.dataEmis)!=='28092026')pendencias.push('emissão original na consulta oficial');
 if(String(t?.especDocto)!=='DM')pendencias.push('espécie DM na consulta oficial');
 if(String(t?.dataVencto)!=='18/10/2026')pendencias.push('vencimento original na consulta oficial');
 const bruto=Number(t?.valMoeda);
 if(!Number.isFinite(bruto)|| !(Math.abs(bruto-44191)<0.01||Math.abs(bruto-441.91)<0.01))
   pendencias.push('valor original na consulta oficial');
 if(Number(t?.codStatus)!==1||Number(t?.vlrPagto||0)>0||t?.dtPagto)pendencias.push('título não confirmado aberto na consulta oficial');
 if(Number(t?.codValMul||0)!==0||Number(t?.codComisPerm||0)!==0)
   pendencias.push('encargos já presentes: reconciliar antes de alterar');
 const sac=t?.sacado&&typeof t.sacado==='object'?t.sacado:{};
 const pagador={
   nome:!!String(sac.nome||'').trim(),
   documento:!!soDigitos(sac.cnpj||sac.cpf).match(/^\d{11}$|^\d{14}$/),
   endereco:!!String(sac.endereco||'').trim(),
   cep:soDigitos(sac.cep).length===5&&soDigitos(sac.cepc).length===3
 };
 if(Object.values(pagador).some(v=>!v))pendencias.push('dados do pagador incompletos na consulta');
 // A API exige corpo integral: campos que não serão alterados não devem ser inferidos
 // como zeros caso o título possua instruções originalmente registradas.
 const preservacao=['dataDesc1','valDesc1','codValDe1','tipoDesc1','dataDesc2','valDesc2','codValDe2','tipoDesc2','dataDesc3','valDesc3','codValDe3','tipoDesc3','diasProt','diasJuros','valAbat','codInscrProt','codNegativacao','diasNegativacao'];
 const naoConfirmados=preservacao.filter(c=>!Object.prototype.hasOwnProperty.call(t||{},c));
 if(naoConfirmados.length)pendencias.push('campos não alterados ainda sem mapeamento seguro: '+naoConfirmados.join(', '));
 return {
  titulo:'55994-01',nosso_numero:'62710000024',
  origem:{seu_numero_confirmado:String(t?.snumero)==='55994-01',emissao_confirmada:String(t?.dataEmis)==='28092026',
    especie_confirmada:String(t?.especDocto)==='DM',vencimento_original_confirmado:String(t?.dataVencto)==='18/10/2026',
    pagador_campos_confirmados:pagador},
  proposta:ENCARGOS,
  proposta_formatada:{juros:'050000',multa:'020000'},
  pendencias,
  contrato_put_integral_validado:false,
  transmitido:false,
  liberado_para_put:false
 };
}
module.exports={ENCARGOS,verificarOriginal,dmy};
