# WhatsApp Kanban CRM

Extensão Chrome (Manifest V3) que injeta um componente Kanban fixo no rodapé do WhatsApp Web.

## Funcionalidades

- Barra recolhida de 48px fixa no rodapé da tela
- Painel expandido de 360px, abrindo para cima
- 4 colunas fixas: **Novo**, **Em atendimento**, **Aguardando**, **Fechado**
- Leitura automática das conversas visíveis na lista lateral do WhatsApp Web
- Novas conversas viram cards automaticamente na coluna **Novo**
- Toolbar com menu, contador total, filtro de atendentes, busca, editar colunas, atualizar e expandir/recolher
- Cards arrastáveis entre colunas (drag & drop nativo)
- Editar nome e nota de cada card (modal)
- Remover card pelo menu do card
- Tudo salvo em `chrome.storage.local` — persiste entre sessões
- Sem backend, sem login, sem dependências externas

---

## Instalação (modo desenvolvedor)

1. Abra o Chrome e acesse `chrome://extensions`
2. Ative **"Modo do desenvolvedor"** (toggle no canto superior direito)
3. Clique em **"Carregar sem compactação"**
4. Selecione a pasta `whatsapp-kanban-crm`
5. Acesse [web.whatsapp.com](https://web.whatsapp.com)
6. A barra Kanban aparecerá fixa no rodapé da página

---

## Como usar

| Ação | Como fazer |
|------|-----------|
| Recolher/expandir o CRM | Clique no botão de expandir/recolher na direita da barra |
| Adicionar contato manual | Clique no menu à esquerda ou no botão **+** da coluna desejada |
| Sincronizar chats | Abra o WhatsApp Web; as conversas visíveis entram automaticamente em **Novo** |
| Buscar card | Use o campo **Buscar...** na toolbar |
| Mover card | Arraste o card para outra coluna |
| Editar card | Passe o mouse sobre o card → menu **⋮** → **Editar** |
| Remover card | Passe o mouse sobre o card → menu **⋮** → **Remover** |

---

## Estrutura de arquivos

```
whatsapp-kanban-crm/
├── manifest.json   — configuração da extensão (Manifest V3)
├── content.js      — toda a lógica do painel Kanban
├── styles.css      — estilos do painel (injetados no WA Web)
└── background.js   — service worker (ciclo de vida da extensão)
```

---

## Notas técnicas

- Os cards ficam em `chrome.storage.local` sob a chave `wk_cards`
- As colunas ficam em `chrome.storage.local` sob a chave `wk_cols`
- Cada card automático salva `name`, `chatId`, `colIndex`, `note` e datas básicas
- A leitura automática usa seletores robustos como `div[role="row"] span[title]` e `div[role="row"] span[aria-label]`
- O identificador único prefere o `href` do link do chat; se não houver link, usa atributos estáveis do item ou o nome normalizado como fallback
- O WhatsApp Web é uma SPA; um `MutationObserver` injeta o painel após o carregamento e monitora mudanças na lista de chats
- O observador adiciona apenas chats novos e atualiza nomes quando o mesmo `chatId` reaparece com outro nome
- Nenhuma mensagem é enviada; a extensão é 100% passiva (somente leitura do DOM)
