/*
 * Renke CRM · login do playground ("Experimentar") da Referência da API.
 *
 * Fluxo: botão "Entrar com minha conta Renke" -> modal de login (e-mail/senha do
 * CRM, POST /iam/auth/login) -> GET /docs-playground/tenants -> usuário escolhe o
 * tenant -> POST /docs-playground/keys gera chave TEMPORÁRIA (rnk_..., expira em
 * ~1h, só daquele tenant) -> preenche Authorization: Bearer rnk_... e tenant-id
 * nos campos do playground.
 *
 * Segurança:
 * - Nada de cookie: fetch com credentials 'omit'; o token do login fica só em
 *   memória (variável deste script) e é descartado após gerar a chave.
 * - A chave temporária fica em sessionStorage (some ao fechar a aba) e é
 *   apagada ao expirar ou ao clicar em "Sair" (que também revoga no backend).
 *
 * URL da API: window.RENKE_DOCS_API_BASE (se definido antes) ou o padrão abaixo.
 */
(function () {
  if (window.__rkPlaygroundLogin) return;
  window.__rkPlaygroundLogin = 1;

  window.RENKE_DOCS_API_BASE = window.RENKE_DOCS_API_BASE || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.origin + '/rk-api' : 'https://api-dev.renkepipeline.com.br'); // DEMO DEV
  var DEFAULT_API_BASE = 'https://api.renkecrm.com';
  var API_BASE = String(window.RENKE_DOCS_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  var STORAGE_KEY = 'rk-docs-playground-key';
  var BTN_ID = 'rk-pg-login-btn';

  // ---------------------------------------------------------------- estado
  var memory = { sessionToken: null, tenants: [] };

  function readKey() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var k = JSON.parse(raw);
      if (!k || !k.plaintextKey || new Date(k.expiresAt).getTime() <= Date.now()) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return k;
    } catch (e) {
      return null;
    }
  }
  function saveKey(k) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(k));
    } catch (e) {
      /* sessionStorage indisponível: fica só em memória */
    }
    memory.key = k;
  }
  function clearKey() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
    memory.key = null;
  }
  function currentKey() { return readKey() || (memory.key && new Date(memory.key.expiresAt) > new Date() ? memory.key : null); }

  // ------------------------------------------------------------------- API
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    return fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'omit',
      mode: 'cors',
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var msg = (data && (data.message || data.error)) || 'Erro ' + res.status;
          if (res.status === 401) msg = 'E-mail ou senha inválidos.';
          if (res.status === 403) msg = Array.isArray(msg) ? msg.join(', ') : msg;
          if (res.status === 429) msg = 'Muitas tentativas. Aguarde um minuto.';
          var err = new Error(Array.isArray(msg) ? msg.join(', ') : msg);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  // --------------------------------------------------- preencher playground
  function setNativeValue(input, value) {
    var proto = Object.getPrototypeOf(input);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Mintlify (validado em 22/10/2026): todos os campos têm id="api-playground-input";
  // o nome do header vem no placeholder/aria-label ("digite token bearer",
  // "Enter bearer token", "digite tenant-id", "Inserir tenant-id"). Só olhamos
  // esses atributos: o texto dos ancestrais inclui descrições de outros campos
  // (ex.: "Authorization") e fazia page/search serem sobrescritos.
  function fieldKind(input) {
    var own = [input.name, input.placeholder, input.getAttribute('aria-label')].join(' ').toLowerCase();
    if (/\btenant-id\b/.test(own)) return 'tenant';
    if (/\bbearer\b|\bauthorization\b/.test(own)) return 'auth';
    return null;
  }
  function fillPlayground() {
    var k = currentKey();
    if (!k) return;
    var inputs = document.querySelectorAll('#api-playground-input, [id^="api-playground"] input, input[type="text"], input[type="password"], input:not([type])');
    Array.prototype.forEach.call(inputs, function (input) {
      var kind = fieldKind(input);
      // Mintlify (securityScheme http bearer) já prefixa "Bearer ": o campo recebe só o token.
      if (kind === 'auth' && input.value !== k.plaintextKey) setNativeValue(input, k.plaintextKey);
      else if (kind === 'tenant' && input.value !== k.tenantId) setNativeValue(input, k.tenantId);
    });
  }

  // ------------------------------------------------------------------- UI
  var css = '' +
    '#' + BTN_ID + '{display:inline-flex;align-items:center;gap:.4rem;margin:.75rem 0;padding:.45rem .9rem;border-radius:.5rem;border:1px solid #FECF01;background:#FECF01;color:#111;font-weight:600;cursor:pointer;font-size:.875rem}' +
    '#' + BTN_ID + '.rk-on{background:transparent;color:inherit}' +
    '.rk-pg-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center}' +
    '.rk-pg-md{background:#fff;color:#111;border-radius:.75rem;padding:1.5rem;width:min(92vw,380px);box-shadow:0 10px 40px rgba(0,0,0,.3);font-size:.9rem}' +
    '.dark .rk-pg-md{background:#18181b;color:#f4f4f5}' +
    '.rk-pg-md h3{margin:0 0 .25rem;font-size:1.05rem}.rk-pg-md p{margin:.25rem 0 1rem;opacity:.75}' +
    '.rk-pg-md input,.rk-pg-md select{width:100%;box-sizing:border-box;margin:.25rem 0 .75rem;padding:.5rem;border:1px solid #d4d4d8;border-radius:.4rem;background:transparent;color:inherit}' +
    '.rk-pg-md .rk-row{display:flex;gap:.5rem;justify-content:flex-end}' +
    '.rk-pg-md button{padding:.45rem .9rem;border-radius:.4rem;border:1px solid #d4d4d8;background:transparent;color:inherit;cursor:pointer}' +
    '.rk-pg-md button.rk-pri{background:#FECF01;border-color:#FECF01;color:#111;font-weight:600}' +
    '.rk-pg-err{color:#dc2626;min-height:1.2em;margin:.25rem 0}';
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (a) {
      if (a === 'text') e.textContent = attrs[a]; else e.setAttribute(a, attrs[a]);
    });
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  function closeModal() {
    var ov = document.querySelector('.rk-pg-ov');
    if (ov) ov.remove();
  }

  function openModal() {
    closeModal();
    var err = el('div', { class: 'rk-pg-err', role: 'alert' });
    var body = el('div');
    var md = el('div', { class: 'rk-pg-md', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Entrar com minha conta Renke' }, [body]);
    var ov = el('div', { class: 'rk-pg-ov' }, [md]);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(ov);
    renderLogin(body, err);
  }

  function renderLogin(body, err) {
    body.innerHTML = '';
    var email = el('input', { type: 'email', autocomplete: 'username', placeholder: 'voce@empresa.com', required: '' });
    var pass = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Senha', required: '' });
    var submit = el('button', { type: 'submit', class: 'rk-pri', text: 'Entrar' });
    var cancel = el('button', { type: 'button', text: 'Cancelar' });
    cancel.onclick = closeModal;
    var form = el('form', {}, [
      el('h3', { text: 'Entrar com minha conta Renke' }),
      el('p', { text: 'Gera uma chave de teste temporária (expira em ~1h) só para o tenant que você escolher.' }),
      el('label', { text: 'E-mail' }), email,
      el('label', { text: 'Senha' }), pass,
      err,
      el('div', { class: 'rk-row' }, [cancel, submit]),
    ]);
    form.onsubmit = function (e) {
      e.preventDefault();
      err.textContent = '';
      submit.disabled = true;
      api('/iam/auth/login', { method: 'POST', body: { email: email.value.trim(), password: pass.value } })
        .then(function (res) {
          pass.value = '';
          memory.sessionToken = res && res.accessToken;
          if (!memory.sessionToken) throw new Error('Login sem token.');
          return api('/docs-playground/tenants', { token: memory.sessionToken });
        })
        .then(function (res) {
          memory.tenants = (res && res.data) || [];
          renderTenants(body, err);
        })
        .catch(function (e2) { err.textContent = e2.message || 'Falha no login.'; })
        .finally(function () { submit.disabled = false; });
    };
    body.appendChild(form);
    email.focus();
  }

  function renderTenants(body, err) {
    body.innerHTML = '';
    err.textContent = '';
    var admins = memory.tenants.filter(function (t) { return t.isAdmin; });
    if (memory.tenants.length === 0) {
      err.textContent = 'Sua conta não está vinculada a nenhum tenant ativo.';
    } else if (admins.length === 0) {
      err.textContent = 'Só administradores do tenant podem gerar chave de teste.';
    }
    var select = el('select', {});
    memory.tenants.forEach(function (t) {
      var o = el('option', { value: t.id, text: t.name + (t.isAdmin ? '' : ' (sem permissão)') });
      if (!t.isAdmin) o.disabled = true;
      select.appendChild(o);
    });
    if (admins[0]) select.value = admins[0].id;
    var write = el('input', { type: 'checkbox', style: 'width:auto;margin-right:.4rem' });
    var submit = el('button', { type: 'submit', class: 'rk-pri', text: 'Gerar chave de teste' });
    if (!admins.length) submit.disabled = true;
    var cancel = el('button', { type: 'button', text: 'Cancelar' });
    cancel.onclick = function () { memory.sessionToken = null; closeModal(); };
    var form = el('form', {}, [
      el('h3', { text: 'Escolha o tenant' }),
      el('p', { text: 'As chamadas do playground vão agir neste tenant com dados reais.' }),
      select,
      el('label', {}, [write, document.createTextNode('Permitir escrita (criar/editar registros)')]),
      err,
      el('div', { class: 'rk-row' }, [cancel, submit]),
    ]);
    form.onsubmit = function (e) {
      e.preventDefault();
      err.textContent = '';
      submit.disabled = true;
      api('/docs-playground/keys', {
        method: 'POST',
        token: memory.sessionToken,
        body: { tenantId: select.value, access: write.checked ? 'write' : 'read' },
      })
        .then(function (k) {
          var t = memory.tenants.filter(function (x) { return x.id === k.tenantId; })[0];
          saveKey({ id: k.id, plaintextKey: k.plaintextKey, tenantId: k.tenantId, tenantName: t ? t.name : '', expiresAt: k.expiresAt });
          // o token de sessão do CRM não é mais necessário
          memory.sessionToken = null;
          closeModal();
          refresh();
        })
        .catch(function (e2) { err.textContent = e2.message || 'Falha ao gerar chave.'; submit.disabled = false; });
    };
    body.appendChild(form);
  }

  function logout() {
    var k = currentKey();
    clearKey();
    refresh();
    if (k) {
      // Revoga com a própria chave não dá (rota exige token de login); a chave expira sozinha.
      // Se ainda houver token de sessão em memória, revoga já.
      if (memory.sessionToken) {
        api('/docs-playground/keys/' + k.id + '/revoke', { method: 'POST', token: memory.sessionToken, body: { tenantId: k.tenantId } }).catch(function () {});
      }
    }
  }

  // --------------------------------------------------------- botão no topo
  function isApiReference() {
    return !!document.querySelector('[class*="api-playground"], [class*="ApiPlayground"], [data-testid*="playground"], [id*="playground"]') ||
      /\/api-reference|\/referencia|\/(get|post|patch|put|delete)-/i.test(location.pathname) ||
      !!document.querySelector('[class*="method-pill"], [class*="MethodPill"]');
  }
  function buttonLabel() {
    var k = currentKey();
    if (!k) return 'Entrar com minha conta Renke';
    var min = Math.max(0, Math.round((new Date(k.expiresAt).getTime() - Date.now()) / 60000));
    return 'Conectado: ' + (k.tenantName || k.tenantId) + ' · expira em ' + min + ' min · Sair';
  }
  function ensureButton() {
    var existing = document.getElementById(BTN_ID);
    if (!isApiReference()) { if (existing) existing.remove(); return; }
    var anchor = document.querySelector('#content-area header, #content-area h1, article h1, main h1');
    if (!anchor) return;
    if (!existing) {
      existing = el('button', { id: BTN_ID, type: 'button' });
      existing.onclick = function () { currentKey() ? logout() : openModal(); };
      anchor.parentNode.insertBefore(existing, anchor.nextSibling);
    }
    existing.textContent = buttonLabel();
    existing.classList.toggle('rk-on', !!currentKey());
  }
  function refresh() {
    ensureButton();
    fillPlayground();
  }

  function boot() {
    if (document.getElementById('rk-pg-style')) return;
    var style = document.createElement('style');
    style.id = 'rk-pg-style';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; refresh(); });
    }).observe(document.body, { childList: true, subtree: true });
    setInterval(function () { if (memory.key || readKey()) refresh(); else ensureButton(); }, 30000);
    refresh();
  }
  // Pode carregar antes do <body>/da hidratação do React do Mintlify: mexer no DOM
  // antes disso gera o erro React #418 (hydration mismatch). Espera o load + ocioso.
  function bootLater() {
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 300); };
    idle(boot, { timeout: 2000 });
  }
  if (document.readyState === 'complete') bootLater(); else window.addEventListener('load', bootLater);
})();
