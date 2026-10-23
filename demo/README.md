# Demo: login do playground contra a API do DEV

Branch **demo/docs-login-dev**. Não vai para main e não altera o site público.

## Rodar no PC (Node 20 a 24; o mint é fixado em 4.2.1107 via package-lock)
Windows (PowerShell):
```powershell
git clone -b demo/docs-login-dev https://github.com/renkestudio/crm-api-docs.git C:\renke-tmp\docs-demo; cd C:\renke-tmp\docs-demo; node demo/run-demo.mjs
```
macOS/Linux:
```
git clone -b demo/docs-login-dev https://github.com/renkestudio/crm-api-docs.git && cd crm-api-docs && node demo/run-demo.mjs
```
Na primeira vez, o script roda `npm ci`, que instala o mint fixo em `node_modules`; não usa `npx mint@latest`.
Se o mint cair no Node >= 23, o script tenta de novo sozinho com `npx -y node@20`.
Para forçar o Node 20 direto: `$env:DEMO_FORCE_NODE20="1"; node demo/run-demo.mjs`.
Se já houver um clone antigo (e20803d), rode `git pull` antes.
Abra http://localhost:3000/api-reference/contatos/listar-contatos. A primeira subida baixa o `mint` e leva de 1 a 2 minutos.

## Como funciona
- `mint dev` roda internamente na porta 3301, e o `run-demo.mjs` serve a porta 3000.
- `/rk-api/*` vai para https://api-dev.renkepipeline.com.br pelo lado do servidor e sem Origin. O login do playground fica same-origin, então **não precisa mudar o CORS do DEV**.
- O "Enviar" do Experimentar (`/_mintlify/api/request`) é atendido pelo próprio run-demo e **só aceita a API do DEV**. Qualquer outro host, inclusive api.renkecrm.com, é recusado.
- `openapi.json` → servers = DEV. `renke-playground-login.js` → `window.RENKE_DOCS_API_BASE` = DEV.

Para encerrar, use Ctrl+C. As chaves geradas são temporárias (60 min, somente leitura) e uma chave nova revoga a anterior.
