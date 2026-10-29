'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

function quiet() {}

function safeRequire(id, stubs) {
  if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
  return require(id);
}

// Avalia um arquivo de produção em um contexto isolado, sem executar
// requisições. Serve para acessar funções internas (não exportadas) sem
// alterar o código de produção.
function loadScript(relativePath, options = {}) {
  const file = path.join(ROOT, relativePath);
  const code = fs.readFileSync(file, 'utf8');
  const stubs = options.stubs || {};
  const expose = Array.isArray(options.expose) ? options.expose : [];
  const codeToRun = expose.length
    ? `${code}\n;globalThis.__exposed = {${expose.join(',')}};`
    : code;
  const context = {
    module: { exports: {} },
    exports: {},
    require: (id) => safeRequire(id, stubs),
    process,
    Buffer,
    URL,
    URLSearchParams,
    console: { log: quiet, warn: quiet, error: quiet, info: quiet, debug: quiet },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    fetch: async (url) => {
      throw new Error(`[TESTE] fetch bloqueado no sandbox: ${url}`);
    },
    ...(options.globals || {})
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(codeToRun, context, { filename: file, timeout: 10000 });
  return { context, exports: context.module.exports, exposed: context.__exposed, file };
}

// Extrai um trecho de código entre dois marcadores e avalia no sandbox.
function loadBlock(relativePath, startMarker, endMarker, options = {}) {
  const file = path.join(ROOT, relativePath);
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Marcador inicial não encontrado em ${relativePath}: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  if (endMarker && end < 0) throw new Error(`Marcador final não encontrado em ${relativePath}: ${endMarker}`);
  const code = source.slice(start, end);
  const context = {
    module: { exports: {} },
    exports: {},
    require: (id) => safeRequire(id, options.stubs || {}),
    process,
    Buffer,
    URL,
    URLSearchParams,
    console: { log: quiet, warn: quiet, error: quiet, info: quiet, debug: quiet },
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    crypto: require('node:crypto'),
    ...(options.globals || {})
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: file, timeout: 10000 });
  return { context, code };
}

module.exports = { ROOT, loadScript, loadBlock };
