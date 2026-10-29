'use strict';

const Module = require('node:module');

// Substitui módulos externos apenas durante o require. Usado para carregar
// api/integracoes.js sem instalar node-forge/google-auth-library e sem
// qualquer acesso de rede.
function withModuleStubs(stubs, fn) {
  const original = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return original.apply(this, arguments);
  };
  try {
    return fn();
  } finally {
    Module._load = original;
  }
}

// Response e Request mínimos para testar handlers serverless sem Express.
function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    headersSent: false,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; }
  };
}

function fakeRequest(overrides = {}) {
  return {
    method: 'POST',
    query: {},
    body: {},
    headers: {},
    ...overrides
  };
}

module.exports = { withModuleStubs, fakeResponse, fakeRequest };
