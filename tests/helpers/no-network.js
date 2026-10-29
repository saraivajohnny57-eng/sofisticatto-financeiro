'use strict';

// Carregado via --require em todos os scripts de teste.
// Garante que nenhum teste faça chamada real, mesmo que uma função de
// produção tente usar fetch/http/https diretamente.

globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : String(input?.url || input);
  throw new Error(`[TESTE] Rede externa bloqueada: ${url}`);
};

const http = require('node:http');
const https = require('node:https');

for (const modulo of [http, https]) {
  const bloquear = () => {
    throw new Error('[TESTE] Requisição HTTP externa bloqueada.');
  };
  modulo.request = bloquear;
  modulo.get = bloquear;
}
