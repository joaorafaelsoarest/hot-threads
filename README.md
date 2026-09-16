# Hot Threads

Extensão Chrome MV3 para destacar threads do Google Chat e do Chat no Gmail.

## Dados locais e privacidade

Todos os dados ficam somente no armazenamento local do navegador, em IndexedDB/Dexie (`hot_threads`), nas tabelas `threads` e `access_logs`. A extensão não envia dados para a nuvem, não usa armazenamento de rede, CDN, analytics, `chrome.storage.sync`, `fetch`, WebSocket ou XMLHttpRequest.

## Permissões e escopo de hosts

O manifest declara apenas estas permissões:

- `storage`
- `scripting`
- `tabs`

Os únicos padrões de host são:

- `*://chat.google.com/*`
- `*://mail.google.com/chat/*`

Os scripts da extensão são executados somente nesses hosts. A permissão `storage` não significa sincronização: a aplicação usa IndexedDB local e não usa `chrome.storage.sync`.

## Desenvolvimento local

Requisitos: Node.js e npm.

```bash
npm install
npm test
npm run build
```

O build gera `dist/manifest.json`, `dist/background.js`, `dist/content.js` e `dist/page-bridge.js`.

## Carregar no Chrome como extensão descompactada

1. Execute `npm install` e `npm run build`.
2. Abra `chrome://extensions`.
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** (*Load unpacked*).
5. Selecione a pasta `dist/` deste projeto.
6. Após alterações, execute `npm run build` e use **Recarregar** na página da extensão.

## Checklist de QA manual

- [ ] Instalar/carregar a pasta `dist/` sem erro no `chrome://extensions`.
- [ ] Abrir uma thread no Google Chat e confirmar que o botão de fixar aparece no cabeçalho.
- [ ] Fixar e desafixar a thread; confirmar `aria-label`, `aria-pressed` e o estado visual.
- [ ] Recarregar/navegar entre threads via SPA e confirmar que o botão acompanha a rota correta.
- [ ] Abrir **🔥 Threads** e confirmar que o painel aparece sem remover o restante da página.
- [ ] Confirmar as seções **Fixadas** e **Em alta hoje**, abertura de uma thread e ação **Desafixar**.
- [ ] Verificar estados de carregamento, erro e tentativa novamente.
- [ ] Testar navegação por teclado, foco visível e retorno do foco ao fechar o painel.
- [ ] Reabrir o painel e confirmar que não há botões duplicados nem perda do conteúdo nativo.
- [ ] Conferir no DevTools que não há requisições externas e que os dados permanecem locais.

Não há armazenamento em nuvem ou sincronização entre dispositivos; a extensão é local por projeto.
