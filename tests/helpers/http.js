'use strict';

// Bloqueio de rede dos testes: qualquer URL não mockada lança erro.
// Nenhuma chamada real a Correios, SSW, bancos, transportadoras ou Supabase.

const realFetch = globalThis.fetch;

function response(body, status = 200, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? null);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    async text() { return text; },
    async json() { return JSON.parse(text); },
    async arrayBuffer() { return Buffer.from(text, 'utf8'); }
  };
}

function blocked(url) {
  throw new Error(`[TESTE] Chamada externa bloqueada: ${url}`);
}

// handler(url, init) deve devolver uma resposta. Se devolver undefined,
// a chamada é considerada externa e falha imediatamente.
async function withFetch(handler, fn) {
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || input);
    const mocked = await handler(url, init);
    if (mocked === undefined) blocked(url);
    return mocked;
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

// Fila de respostas: cada requisição consome o próximo item.
function withFetchQueue(items, fn) {
  let index = 0;
  const calls = [];
  return withFetch(async (url, init) => {
    calls.push({ url, init });
    if (index >= items.length) return undefined;
    const item = items[index++];
    if (typeof item === 'function') return item(url, init);
    return item;
  }, async () => {
    const result = await fn(calls);
    return result;
  }).finally(() => { index = 0; });
}

// Garante que nenhuma chamada de rede acontece em um bloco de teste.
async function withNoNetwork(fn) {
  return withFetch(async () => undefined, fn);
}

module.exports = { response, withFetch, withFetchQueue, withNoNetwork };
