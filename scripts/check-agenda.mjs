#!/usr/bin/env node
// Guarda da referência de Agenda e Formulários no openapi.json.
// Node puro, sem dependência. Sai com código 1 se qualquer regra falhar.
// Uso: node scripts/check-agenda.mjs [caminho/do/openapi.json]
//
// As listas abaixo são cópia da allowlist do /v1 no CRM-Backend
// (src/framework/http/public-api-v1-surface.ts), com `:param` → `{param}` e sem o
// prefixo /v1, que fica em servers[0]. Se o BE mudar a allowlist, atualize aqui.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const AGENDA = [
  'GET /calendar/appointments',
  'GET /calendar/appointments/{id}',
  'GET /calendar/appointments/{id}/events',
  'GET /calendar/appointments/{id}/note',
  'PUT /calendar/appointments/{id}/note',
  'DELETE /calendar/appointments/{id}/note',
  'POST /calendar/appointments',
  'POST /calendar/appointments/{id}/reschedule',
  'POST /calendar/appointments/{id}/cancel',
  'POST /calendar/appointments/{id}/attendance',
  'POST /calendar/appointments/{id}/confirmation',
  'POST /calendar/appointments/{id}/deposit',
  'GET /calendar/bookables/{id}/slots',
  'GET /calendar/availability/next',
  'GET /calendar/calendars',
  'GET /calendar/calendars/{id}',
  'GET /calendar/calendars/{id}/members',
  'GET /calendar/calendars/{id}/bookables',
  'GET /calendar/calendars/{id}/notifications',
  'GET /calendar/settings',
  'GET /calendar/units',
  'GET /calendar/resources',
  'GET /calendar/resources/{id}/availability-rules',
  'GET /calendar/bookables',
  'GET /calendar/bookables/{id}',
  'GET /calendar/waitlist',
  'GET /calendar/waitlist/{id}',
  'GET /calendar/waitlist/{id}/events',
  'POST /calendar/waitlist',
  'POST /calendar/waitlist/{id}/release',
  'POST /calendar/waitlist/{id}/remove',
];

const FORMULARIOS = [
  'GET /web-forms',
  'POST /web-forms',
  'GET /web-forms/{id}',
  'PATCH /web-forms/{id}',
  'DELETE /web-forms/{id}',
  'POST /web-forms/{id}/links',
  'GET /web-forms/{id}/analytics',
  'GET /web-forms/{id}/submissions',
  'GET /web-forms/{id}/submissions/{submissionId}',
  'GET /opportunities/{opportunityId}/web-forms',
  'GET /opportunities/{opportunityId}/web-forms/submissions/{submissionId}',
];

// Escritas da Agenda que chegam à regra de negócio do motor (422 com `code`).
const AGENDA_422 = new Set([
  'POST /calendar/appointments',
  'POST /calendar/appointments/{id}/reschedule',
  'POST /calendar/appointments/{id}/cancel',
  'POST /calendar/appointments/{id}/attendance',
  'POST /calendar/appointments/{id}/confirmation',
  'POST /calendar/appointments/{id}/deposit',
]);

// UUIDs fictícios aceitos nos exemplos: só dígitos, `e` e hífen (padrão eeeeeeee-…).
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID_FICTICIO = /^[e0-9-]+$/i;
const METODOS = ['get', 'post', 'put', 'patch', 'delete'];
const ESCRITAS = new Set(['POST', 'PUT', 'PATCH']);

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = process.argv[2] ?? resolve(raiz, 'openapi.json');
const doc = JSON.parse(readFileSync(arquivo, 'utf8'));
const falhas = [];
const falha = (msg) => falhas.push(msg);

function resolver(no) {
  if (!no || typeof no !== 'object' || typeof no.$ref !== 'string') return no;
  const partes = no.$ref.replace(/^#\//, '').split('/');
  let alvo = doc;
  for (const parte of partes) alvo = alvo?.[parte];
  if (alvo === undefined) falha(`$ref quebrado: ${no.$ref}`);
  return alvo;
}

function operacoesDaTag(tag) {
  const ops = new Map();
  for (const [caminho, item] of Object.entries(doc.paths ?? {})) {
    for (const metodo of METODOS) {
      const op = item[metodo];
      if (op?.tags?.includes(tag)) ops.set(`${metodo.toUpperCase()} ${caminho}`, op);
    }
  }
  return ops;
}

function exemplosDoSucesso(op) {
  const achados = [];
  for (const [codigo, bruta] of Object.entries(op.responses ?? {})) {
    if (!/^2\d\d$/.test(codigo)) continue;
    const resposta = resolver(bruta);
    for (const midia of Object.values(resposta?.content ?? {})) {
      if (midia.example !== undefined) achados.push(midia.example);
      for (const ex of Object.values(midia.examples ?? {})) {
        const valor = resolver(ex)?.value;
        if (valor !== undefined) achados.push(valor);
      }
    }
  }
  return achados;
}

function sucessoTemCorpo(op) {
  return Object.entries(op.responses ?? {}).some(
    ([codigo, bruta]) => /^2\d\d$/.test(codigo) && resolver(bruta)?.content,
  );
}

function conferirGrupo(tag, esperado, opcoes) {
  const ops = operacoesDaTag(tag);
  const atual = [...ops.keys()];
  const faltam = esperado.filter((k) => !ops.has(k));
  const sobram = atual.filter((k) => !esperado.includes(k));
  // 1. Conjunto de operações igual à allowlist do /v1.
  if (faltam.length || sobram.length) {
    falha(`[1] ${tag}: ${atual.length} operações, esperado ${esperado.length}` +
      (faltam.length ? `; faltam ${faltam.join(', ')}` : '') +
      (sobram.length ? `; sobram ${sobram.join(', ')}` : ''));
  }
  let comExemplo = 0;
  let com4xx = 0;
  for (const [chave, op] of ops) {
    const [metodo, caminho] = chave.split(' ');
    // 2. Exemplo de resposta de sucesso (resposta sem corpo dispensa).
    const exemplos = exemplosDoSucesso(op);
    if (exemplos.length > 0) comExemplo += 1;
    else if (sucessoTemCorpo(op)) falha(`[2] ${chave}: sem exemplo no 2xx`);
    // 3. Erros por operação.
    const exigidos = ['401', '403', '429'];
    if (caminho.includes('{')) exigidos.push('404');
    if (ESCRITAS.has(metodo)) exigidos.push('400');
    if (opcoes.exige422?.has(chave)) exigidos.push('422');
    const faltando = exigidos.filter((c) => !op.responses?.[c]);
    if (faltando.length) falha(`[3] ${chave}: sem resposta ${faltando.join(', ')}`);
    else com4xx += 1;
    // 7. UUID dos exemplos só no padrão fictício.
    const texto = JSON.stringify(exemplos);
    for (const uuid of texto.match(UUID) ?? []) {
      if (!UUID_FICTICIO.test(uuid)) falha(`[7] ${chave}: UUID fora do padrão fictício no exemplo: ${uuid}`);
    }
    // 5. `durationMinutes` não aparece (a chave de API descarta o campo).
    const referenciados = [];
    const textoOp = JSON.stringify(op);
    for (const m of textoOp.matchAll(/"#\/components\/(schemas|responses|examples)\/([^"]+)"/g)) {
      referenciados.push(doc.components?.[m[1]]?.[m[2]]);
    }
    if (opcoes.semDuracao && /durationMinutes/.test(textoOp + JSON.stringify(referenciados) + texto)) {
      falha(`[5] ${chave}: contém durationMinutes`);
    }
  }
  return { total: ops.size, comExemplo, com4xx };
}

const agenda = conferirGrupo('Agenda', AGENDA, { exige422: AGENDA_422, semDuracao: true });
const formularios = conferirGrupo('Formulários', FORMULARIOS, {});

// 4. Filtro opportunityRef descrito (e contactRef).
const lista = doc.paths?.['/calendar/appointments']?.get;
for (const nome of ['opportunityRef', 'contactRef']) {
  const p = (lista?.parameters ?? []).map(resolver).find((x) => x?.name === nome);
  if (!p?.description?.trim()) falha(`[4] GET /calendar/appointments: parâmetro ${nome} sem descrição`);
}

// 6. Nada de rota interna/pública nem host do motor; servidor é o /v1.
for (const caminho of Object.keys(doc.paths ?? {})) {
  if (/\/internal|\/public|calendar\.renkecrm\.com/.test(caminho)) falha(`[6] path proibido: ${caminho}`);
}
if (/calendar\.renkecrm\.com/.test(JSON.stringify(doc))) falha('[6] host do calendar-service no documento');
if (doc.servers?.[0]?.url !== 'https://api.renkecrm.com/v1') {
  falha(`[6] servers[0].url = ${doc.servers?.[0]?.url}, esperado https://api.renkecrm.com/v1`);
}

const resumo = (nome, r) => `${nome}: ${r.total} operações, ${r.comExemplo} com exemplo, ${r.com4xx} com 4xx`;
console.log(resumo('Agenda', agenda));
console.log(resumo('Formulários', formularios));
if (falhas.length) {
  console.error(`\nFALHOU (${falhas.length}):`);
  for (const f of falhas) console.error(`- ${f}`);
  process.exit(1);
}
console.log('\nOK: Agenda e Formulários conferem com o /v1.');
