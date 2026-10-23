#!/usr/bin/env node
// Demo local da doc (branch demo/docs-login-dev) contra a API do DEV.
// Uso (na raiz do repo): node demo/run-demo.mjs   -> abre http://localhost:3000
// - sobe `mint dev` na porta 3301 (interna)
// - serve http://localhost:3000: tudo vai pro mint dev, exceto /rk-api/* que é
//   repassado (lado servidor, sem Origin) para https://api-dev.renkepipeline.com.br.
//   Assim o login do playground é same-origin e NÃO precisa de mudança de CORS no dev.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { spawn } from 'node:child_process';
const PORT = Number(process.env.PORT || 3000), MINT = Number(process.env.MINT_PORT || 3301);
const API = new URL(process.env.DEMO_API || 'https://api-dev.renkepipeline.com.br');
const mint = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['-y', 'mint@latest', 'dev', '--port', String(MINT), '--no-open'], { stdio: 'inherit', shell: process.platform === 'win32' });
process.on('SIGINT', () => { mint.kill(); process.exit(0); });
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
