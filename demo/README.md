# Demo: login do playground contra a API do DEV

Branch **demo/docs-login-dev**. Não vai para main e não altera o site público.

## Rodar no PC (1 comando, Node 20+)
```
git clone -b demo/docs-login-dev https://github.com/renkestudio/crm-api-docs.git && cd crm-api-docs && node demo/run-demo.mjs
```
Abra http://localhost:3000/api-reference/contatos/listar-contatos. A primeira subida baixa o `mint` e leva de 1 a 2 minutos.

## Como funciona
- `mint dev` roda internamente na porta 3301, e o `run-demo.mjs` serve a porta 3000.
- `/rk-api/*` vai para https://api-dev.renkepipeline.com.br pelo lado do servidor e sem Origin. O login do playground fica same-origin, então **não precisa mudar o CORS do DEV**.
- O "Enviar" do Experimentar (`/_mintlify/api/request`) é atendido pelo próprio run-demo e **só aceita a API do DEV**. Qualquer outro host, inclusive api.renkecrm.com, é recusado.
- `openapi.json` → servers = DEV. `renke-playground-login.js` → `window.RENKE_DOCS_API_BASE` = DEV.

Para encerrar, use Ctrl+C. As chaves geradas são temporárias (60 min, somente leitura) e uma chave nova revoga a anterior.
