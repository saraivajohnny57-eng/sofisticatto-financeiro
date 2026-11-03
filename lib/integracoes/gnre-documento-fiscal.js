'use strict';

// Validação de documentos fiscais brasileiros (dígito verificador).
// O XSD oficial aceita qualquer sequência de 11/14 dígitos; a SEFAZ não.
// Esta checagem é de negócio e complementa o XSD, não o substitui.

function digitos(valor) {
  return String(valor == null ? '' : valor).replace(/\D/g, '');
}

function cpfValido(valor) {
  const s = digitos(valor);
  if (s.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(s)) return false; // 111.111.111-11 e similares
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(s[i]) * (10 - i);
  let dv1 = (soma * 10) % 11;
  if (dv1 === 10) dv1 = 0;
  if (dv1 !== Number(s[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(s[i]) * (11 - i);
  let dv2 = (soma * 10) % 11;
  if (dv2 === 10) dv2 = 0;
  return dv2 === Number(s[10]);
}

function cnpjValido(valor) {
  const s = digitos(valor);
  if (s.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(s)) return false;
  const calc = (base, pesos) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += Number(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = calc(s, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv1 !== Number(s[12])) return false;
  const dv2 = calc(s, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv2 === Number(s[13]);
}

function documentoValido(valor) {
  const s = digitos(valor);
  if (s.length === 11) return cpfValido(s);
  if (s.length === 14) return cnpjValido(s);
  return false;
}

module.exports = { digitos, cpfValido, cnpjValido, documentoValido };
