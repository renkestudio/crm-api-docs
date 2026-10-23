#!/usr/bin/env node
// Demo local da doc (branch demo/docs-login-dev) contra a API do DEV.
// Uso (na raiz do repo): node demo/run-demo.mjs  (Windows/macOS/Linux, Node 20-24)   -> abre http://localhost:3000
// - sobe `mint dev` na porta 3301 (interna)
// - serve http://localhost:3000: tudo vai pro mint dev, exceto /rk-api/* que é
//   repassado (lado servidor, sem Origin) para https://api-dev.renkepipeline.com.br.
//   Assim o login do playground é same-origin e NÃO precisa de mudança de CORS no dev.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PORT = Number(process.env.PORT || 3000), MINT = Number(process.env.MINT_PORT || 3301);
const API = new URL(process.env.DEMO_API || 'https://api-dev.renkepipeline.com.br');
// --- mint: versão FIXA (package.json + package-lock.json), instalada localmente.
// Nada de `npx mint@latest` (cache do npx no Windows trazia árvore velha -> ERR_UNSUPPORTED_DIR_IMPORT
// em es-toolkit/compat com Node 24). Roda o index.js do mint com o próprio node (sem shell).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const MINT_ENTRY = path.join(ROOT, 'node_modules', 'mint', 'index.js');
function run(cmd, args) { // npm/npx: no Windows precisam de shell (são .cmd; Node >= 18.20/20.12 exige)
  return new Promise((ok) => {
    const q = (a) => (WIN && /[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a);
    const p = spawn(cmd, WIN ? args.map(q) : args, { cwd: ROOT, stdio: 'inherit', shell: WIN });
    p.on('exit', (c) => ok(c ?? 1)); p.on('error', () => ok(1));
  });
}
if (!fs.existsSync(MINT_ENTRY)) {
  console.log('>>> Instalando dependências fixas (npm ci), só na primeira vez...');
  if (await run('npm', ['ci', '--no-audit', '--no-fund']) !== 0) { console.error('npm ci falhou'); process.exit(1); }
}
let mint;
function startMint(useNode20) {
  const args = [MINT_ENTRY, 'dev', '--port', String(MINT), '--no-open'];
  console.log(`>>> mint dev com ${useNode20 ? 'Node 20 (npx -y node@20)' : 'Node ' + process.version}`);
  const startedAt = Date.now();
  mint = useNode20
    ? spawn('npx', ['-y', 'node@20', ...args].map((a) => (WIN && /[\s"]/.test(a) ? '"' + a + '"' : a)), { cwd: ROOT, stdio: 'inherit', shell: WIN })
    : spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  mint.on('exit', (code) => {
    if (code && Date.now() - startedAt < 120000 && !useNode20 && Number(process.versions.node.split('.')[0]) >= 23 && process.env.DEMO_NO_NODE20 !== '1') {
      console.log(`>>> mint caiu (código ${code}) no Node ${process.version}; tentando de novo com Node 20...`);
      return startMint(true);
    }
    if (code) { console.error(`>>> mint encerrou com código ${code}`); process.exit(code); }
  });
}
startMint(process.env.DEMO_FORCE_NODE20 === '1');
process.on('SIGINT', () => { try { mint.kill(); } catch {} process.exit(0); });
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/rk-api/')) {
    const h = { ...req.headers }; delete h.origin; delete h.referer; delete h.cookie; h.host = API.host;
    const up = https.request({ host: API.hostname, port: 443, method: req.method, path: req.url.slice(7), headers: h }, (r) => {
      const rh = { ...r.headers }; delete rh['set-cookie'];
      res.writeHead(r.statusCode, rh); r.pipe(res);
    });
    up.on('error', (e) => { res.writeHead(502); res.end('proxy: ' + e.message); });
    return req.pipe(up);
  }
  if (req.method === 'POST' && req.url.split('?')[0] === '/_mintlify/api/request') return playgroundProxy(req, res);
  const up = http.request({ host: 'localhost', port: MINT, method: req.method, path: req.url, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }); res.end('mint dev ainda subindo... recarregue em alguns segundos'); });
  req.pipe(up);
});
// "Enviar" do Experimentar: em vez do proxy do mint dev (que bloqueia DNS privado/VPN),
// repassa SÓ para a API do DEV; qualquer outro host é recusado (nunca vai para prod).
async function playgroundProxy(req, res) {
  let raw = ''; for await (const c of req) raw += c;
  const send = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    const b = JSON.parse(raw); const u = new URL(b.url);
    if (u.origin !== API.origin) return send({ error: true, errorMessage: `demo: só ${API.origin} é permitido (pedido: ${u.origin})` });
    for (const [k, v] of Object.entries(b.query || {})) if (v !== undefined && v !== '') u.searchParams.set(k, v);
    const headers = { ...(b.header || {}) };
    let body; if (b.body !== undefined && b.body !== null && !/^(get|head)$/i.test(b.method)) { body = typeof b.body === 'string' ? b.body : JSON.stringify(b.body); headers['content-type'] ||= 'application/json'; }
    const r = await fetch(u, { method: String(b.method || 'GET').toUpperCase(), headers, body });
    const data = Buffer.from(await r.arrayBuffer()).toString('base64'); // formato do proxy do Mintlify (responseEncoding base64)
    const rh = Object.fromEntries(r.headers); delete rh['content-encoding']; delete rh['content-length']; delete rh['set-cookie'];
    console.log(`[demo playground] ${b.method} ${u.pathname} -> ${r.status}`);
    send({ error: false, response: { status: r.status, statusText: r.statusText, headers: rh, data } });
  } catch (e) { send({ error: true, errorMessage: 'demo proxy: ' + e.message }); }
}
srv.on('upgrade', (req, sock, head) => { // websocket do hot reload
  const up = net.connect(MINT, 'localhost', () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    up.write(head); up.pipe(sock); sock.pipe(up);
  });
  up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
});
srv.listen(PORT, () => console.log(`\n>>> Demo: http://localhost:${PORT}  (API: ${API.origin})\n`));
