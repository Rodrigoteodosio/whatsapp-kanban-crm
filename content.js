/**
 * WhatsApp Kanban CRM — content.js  v2.0
 *
 * Componente fixo no RODAPE do WhatsApp Web. Tema claro.
 * JavaScript puro. Sem dependências externas.
 *
 * Dados salvos em chrome.storage.local:
 *   wk_cards   → [ { id, chatId, name, note, colIndex, createdAt } ]
 *   wk_cols    → [ { label } ]   (nomes das 4 colunas)
 */

(function () {
  'use strict';

  /* ============================================================
     ESTADO GLOBAL
  ============================================================ */

  const STORAGE_CARDS = 'wk_cards';
  const STORAGE_COLS  = 'wk_cols';

  const DEFAULT_COLS = [
    { label: 'Novo' },
    { label: 'Em atendimento' },
    { label: 'Aguardando' },
    { label: 'Fechado' },
  ];

  let cards      = [];           // array de cards
  let cols       = [];           // array de colunas { label }
  let draggedId  = null;         // card sendo arrastado
  let editingId  = null;         // card aberto no modal
  let editMode   = false;        // modo "editar nomes de colunas"
  let toastTimer = null;
  let chatObserver = null;
  let chatScanTimer = null;
  let searchQuery = '';

  /* ============================================================
     UTILS
  ============================================================ */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function esc(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Gera iniciais a partir do nome (até 2 letras) */
  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Cor do avatar: rotação por soma dos char codes */
  function avatarClass(name) {
    const n = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return 'wk-av-' + (n % 8);
  }

  function normalizeName(name) {
    return (name || '').replace(/\s+/g, ' ').trim();
  }

  function makeManualCard(name, colIndex) {
    return {
      id: uid(),
      chatId: null,
      name,
      note: '',
      colIndex,
      createdAt: new Date().toISOString(),
      source: 'manual',
    };
  }

  function cardTime(card) {
    const d = new Date(card.createdAt || Date.now());
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function cardPreview(card) {
    return card.note || 'Ultima mensagem do contato...';
  }

  function svg(paths) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  function iconMenu() {
    return svg('<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>');
  }

  function iconSearch() {
    return svg('<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>');
  }

  function iconSliders() {
    return svg('<line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="11" cy="18" r="2"/>');
  }

  function iconRefresh() {
    return svg('<polyline points="20 6 20 12 14 12"/><polyline points="4 18 4 12 10 12"/><path d="M6.5 8a7 7 0 0 1 11.4-2.1L20 8"/><path d="M17.5 16a7 7 0 0 1-11.4 2.1L4 16"/>');
  }

  function iconExpand() {
    return svg('<polyline points="8 3 3 3 3 8"/><line x1="3" y1="3" x2="9" y2="9"/><polyline points="16 3 21 3 21 8"/><line x1="21" y1="3" x2="15" y2="9"/><polyline points="8 21 3 21 3 16"/><line x1="3" y1="21" x2="9" y2="15"/><polyline points="16 21 21 21 21 16"/><line x1="21" y1="21" x2="15" y2="15"/>');
  }

  function iconCollapse() {
    return svg('<polyline points="18 15 12 9 6 15"/>');
  }

  /* ============================================================
     STORAGE
  ============================================================ */

  function loadAll(cb) {
    chrome.storage.local.get([STORAGE_CARDS, STORAGE_COLS], (res) => {
      cards = (res[STORAGE_CARDS] || []).map(card => ({
        note: '',
        colIndex: 0,
        ...card,
        chatId: card.chatId || null,
      }));
      cols  = res[STORAGE_COLS]  || JSON.parse(JSON.stringify(DEFAULT_COLS));
      cb && cb();
    });
  }

  function saveAll(cb) {
    chrome.storage.local.set({ [STORAGE_CARDS]: cards, [STORAGE_COLS]: cols }, () => {
      cb && cb();
    });
  }

  /* ============================================================
     LEITURA DO WHATSAPP WEB
     Detecta o nome da conversa atualmente aberta.
  ============================================================ */

  function getActiveContactName() {
    // Múltiplos seletores como fallback (o WA muda classes com frequência)
    const sel = [
      'header [data-testid="conversation-info-header-chat-title"] span',
      'header span[dir="auto"][title]',
      'header ._ao3e span',
      '[data-testid="contact-info-name"] span',
    ].join(',');

    const el = document.querySelector(sel);
    if (el) return el.getAttribute('title') || el.textContent.trim();

    // Fallback: título da aba
    const t = document.title.replace(/^\(\d+\)\s*/, '').replace('WhatsApp', '').trim();
    return t || null;
  }

  function getChatListRoot() {
    return document.querySelector('#pane-side')
      || document.querySelector('div[aria-label][role="grid"]')
      || document.querySelector('div[role="grid"]')
      || document.querySelector('#app');
  }

  function cleanChatName(raw) {
    const name = normalizeName(raw);
    if (!name) return '';
    if (/^\d{1,2}:\d{2}$/.test(name)) return '';
    if (/^(fixada|pinned|arquivadas|archived)$/i.test(name)) return '';
    return name;
  }

  function chatIdFromRow(row, name) {
    const link = row.querySelector('a[href]');
    const href = link && link.getAttribute('href');
    if (href && href !== '#') return href;

    const stableAttrs = ['data-id', 'data-testid', 'id'];
    for (const attr of stableAttrs) {
      const value = row.getAttribute(attr);
      if (value) return attr + ':' + value;
    }

    return 'name:' + normalizeName(name).toLowerCase();
  }

  function extractChatsFromWhatsApp() {
    const rows = Array.from(document.querySelectorAll('div[role="row"]'));
    const seen = new Set();
    const chats = [];

    rows.forEach(row => {
      // Nomes de conversa ficam de forma mais estável em title/aria-label.
      const nameEl = row.querySelector('span[title], span[aria-label]');
      if (!nameEl) return;

      const name = cleanChatName(
        nameEl.getAttribute('title')
        || nameEl.getAttribute('aria-label')
        || nameEl.textContent
      );
      if (!name) return;

      const chatId = chatIdFromRow(row, name);
      if (!chatId || seen.has(chatId)) return;

      seen.add(chatId);
      chats.push({ chatId, name });
    });

    return chats;
  }

  function findCardByChat(chat) {
    if (chat.chatId) {
      const byId = cards.find(card => card.chatId === chat.chatId || card.id === chat.chatId);
      if (byId) return byId;
    }

    const normalized = chat.name.toLowerCase();
    return cards.find(card => !card.chatId && normalizeName(card.name).toLowerCase() === normalized);
  }

  function syncChatsFromWhatsApp(options = {}) {
    const chats = extractChatsFromWhatsApp();
    if (!chats.length) return;

    let added = 0;
    let changed = false;

    chats.forEach(chat => {
      const card = findCardByChat(chat);
      if (card) {
        if (!card.chatId) {
          card.chatId = chat.chatId;
          card.source = card.source || 'manual';
          changed = true;
        }
        if (card.name !== chat.name && card.chatId === chat.chatId) {
          card.name = chat.name;
          changed = true;
        }
        return;
      }

      cards.unshift({
        id: uid(),
        chatId: chat.chatId,
        name: chat.name,
        note: '',
        colIndex: 0,
        createdAt: new Date().toISOString(),
        source: 'whatsapp',
      });
      added += 1;
      changed = true;
    });

    if (!changed) return;

    saveAll(() => {
      renderBoard();
      if (!options.silent && added > 0) {
        showToast(added === 1 ? '1 conversa adicionada ao Kanban' : added + ' conversas adicionadas ao Kanban');
      }
    });
  }

  function refreshFromWhatsApp() {
    syncChatsFromWhatsApp({ silent: false });
    showToast('Conversas atualizadas');
  }

  function scheduleChatScan() {
    clearTimeout(chatScanTimer);
    chatScanTimer = setTimeout(() => syncChatsFromWhatsApp({ silent: true }), 350);
  }

  function startChatObserver() {
    if (chatObserver) chatObserver.disconnect();

    const root = getChatListRoot();
    if (!root) return;

    chatObserver = new MutationObserver(scheduleChatScan);
    chatObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'href'],
    });
  }

  /* ============================================================
     TOAST
  ============================================================ */

  function showToast(msg) {
    const el = document.getElementById('wk-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ============================================================
     MODAL DE EDIÇÃO DE CARD
  ============================================================ */

  function openModal(cardId) {
    editingId = cardId;
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    document.getElementById('wk-m-name').value = card.name || '';
    document.getElementById('wk-m-note').value = card.note || '';
    document.getElementById('wk-modal-overlay').classList.add('visible');
    document.getElementById('wk-m-name').focus();
  }

  function closeModal() {
    document.getElementById('wk-modal-overlay').classList.remove('visible');
    editingId = null;
  }

  function saveModal() {
    if (!editingId) return;
    const card = cards.find(c => c.id === editingId);
    if (!card) return;
    const name = document.getElementById('wk-m-name').value.trim();
    const note = document.getElementById('wk-m-note').value.trim();
    if (!name) return;
    card.name = name;
    card.note = note;
    saveAll(() => { renderBoard(); closeModal(); showToast('Contato atualizado'); });
  }

  /* ============================================================
     DRAG & DROP
  ============================================================ */

  function onDragStart(e, cardId) {
    draggedId = cardId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
    requestAnimationFrame(() => {
      const el = document.querySelector(`.wk-card[data-id="${cardId}"]`);
      if (el) el.classList.add('dragging');
    });
  }

  function onDragEnd() {
    document.querySelectorAll('.wk-card.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.wk-card-list.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedId = null;
  }

  function onDragOver(e, listEl) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.wk-card-list.drag-over').forEach(el => el.classList.remove('drag-over'));
    listEl.classList.add('drag-over');
  }

  function onDrop(e, colIndex) {
    e.preventDefault();
    const id = draggedId || e.dataTransfer.getData('text/plain');
    if (!id) return;
    const card = cards.find(c => c.id === id);
    if (!card) return;
    if (card.colIndex !== colIndex) {
      card.colIndex = colIndex;
      saveAll(() => renderBoard());
    }
    document.querySelectorAll('.wk-card-list.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  /* ============================================================
     ADICIONAR CONTATO — via header (conversa atual do WA)
  ============================================================ */

  function toggleQuickAdd() {
    const bar = document.getElementById('wk-quick-add');
    const inp = document.getElementById('wk-quick-input');
    const visible = bar.classList.toggle('visible');
    if (visible) {
      // Pré-preenche com o contato aberto, se houver
      const name = getActiveContactName();
      inp.value = name || '';
      inp.focus();
      inp.select();
    }
  }

  function confirmQuickAdd() {
    const inp  = document.getElementById('wk-quick-input');
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }

    // Evita duplicata exata
    if (cards.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      showToast('Contato já existe no Kanban');
      inp.focus(); return;
    }

    cards.unshift(makeManualCard(name, 0));
    saveAll(() => { renderBoard(); showToast('Contato adicionado: ' + name); });

    inp.value = '';
    document.getElementById('wk-quick-add').classList.remove('visible');
  }

  /* ============================================================
     ADICIONAR CONTATO — inline em cada coluna
  ============================================================ */

  function showColInlineAdd(colIndex) {
    // Fecha todos os outros inline-adds abertos
    document.querySelectorAll('.wk-col-inline-add.visible').forEach(el => el.classList.remove('visible'));
    document.querySelectorAll('.wk-col-add-btn').forEach(el => el.style.display = '');

    const col      = document.querySelector(`.wk-col[data-col="${colIndex}"]`);
    const inlineEl = col.querySelector('.wk-col-inline-add');
    const addBtn   = col.querySelector('.wk-col-add-btn');
    const inp      = col.querySelector('.wk-col-inline-input');

    addBtn.style.display = 'none';
    inlineEl.classList.add('visible');
    inp.value = '';
    inp.focus();
  }

  function hideColInlineAdd(colIndex) {
    const col      = document.querySelector(`.wk-col[data-col="${colIndex}"]`);
    const inlineEl = col.querySelector('.wk-col-inline-add');
    const addBtn   = col.querySelector('.wk-col-add-btn');
    inlineEl.classList.remove('visible');
    addBtn.style.display = '';
  }

  function confirmColAdd(colIndex) {
    const col  = document.querySelector(`.wk-col[data-col="${colIndex}"]`);
    const inp  = col.querySelector('.wk-col-inline-input');
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }

    if (cards.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      showToast('Contato já existe no Kanban');
      inp.focus(); return;
    }

    cards.push(makeManualCard(name, colIndex));
    saveAll(() => { renderBoard(); showToast('Adicionado em "' + cols[colIndex].label + '"'); });
  }

  /* ============================================================
     DELETAR CARD
  ============================================================ */

  function deleteCard(cardId) {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    // Remove sem confirmação — KISS
    cards = cards.filter(c => c.id !== cardId);
    saveAll(() => { renderBoard(); showToast('Contato removido'); });
  }

  /* ============================================================
     MODO EDIÇÃO DE COLUNAS
  ============================================================ */

  function toggleEditMode() {
    editMode = !editMode;
    const btn = document.getElementById('wk-btn-edit-cols');

    document.querySelectorAll('.wk-col-name').forEach((inp, i) => {
      inp.readOnly = !editMode;
      inp.classList.toggle('editable', editMode);
      if (editMode) {
        inp.focus();
        inp.select();
      }
    });

    if (editMode) {
      btn.innerHTML = iconSliders();
      btn.title = 'Salvar colunas';
      btn.style.color = '#059669';
      btn.style.borderColor = '#059669';
    } else {
      // Salva os novos nomes
      document.querySelectorAll('.wk-col-name').forEach((inp, i) => {
        const val = inp.value.trim();
        if (val) cols[i].label = val;
      });
      saveAll(() => showToast('Nomes das colunas salvos'));
      btn.innerHTML = iconSliders();
      btn.title = 'Editar colunas';
      btn.style.color = '';
      btn.style.borderColor = '';
    }
  }

  /* ============================================================
     DROPDOWN MENU ⋮ DO CARD
  ============================================================ */

  // Fecha todos os dropdowns abertos
  function closeAllDropdowns() {
    document.querySelectorAll('.wk-dropdown.open').forEach(el => el.classList.remove('open'));
  }

  function toggleDropdown(cardId, btnEl) {
    const dd = btnEl.parentElement.querySelector('.wk-dropdown');
    if (!dd) return;
    const wasOpen = dd.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) dd.classList.add('open');
  }

  /* ============================================================
     RENDER DO BOARD
  ============================================================ */

  function renderBoard() {
    const board = document.getElementById('wk-board');
    if (!board) return;

    board.innerHTML = '';
    const totalBadge = document.getElementById('wk-total-count');
    if (totalBadge) totalBadge.textContent = cards.length;

    cols.forEach((col, i) => {
      const colCards = cards.filter(c => {
        if (c.colIndex !== i) return false;
        if (!searchQuery) return true;
        const haystack = normalizeName((c.name || '') + ' ' + (c.note || '')).toLowerCase();
        return haystack.includes(searchQuery);
      });

      /* ------ Coluna ------ */
      const colEl = document.createElement('div');
      colEl.className = 'wk-col';
      colEl.dataset.col = i;

      /* Linha colorida no topo */
      const stripe = document.createElement('div');
      stripe.className = 'wk-col-stripe';

      /* Header da coluna */
      const colHeader = document.createElement('div');
      colHeader.className = 'wk-col-header';

      const nameInp = document.createElement('input');
      nameInp.type      = 'text';
      nameInp.className = 'wk-col-name' + (editMode ? ' editable' : '');
      nameInp.value     = col.label;
      nameInp.readOnly  = !editMode;
      nameInp.maxLength = 32;

      const badge = document.createElement('span');
      badge.className   = 'wk-col-count';
      badge.textContent = colCards.length;

      const headerAddBtn = document.createElement('button');
      headerAddBtn.className = 'wk-col-head-add';
      headerAddBtn.type = 'button';
      headerAddBtn.title = 'Adicionar cartão';
      headerAddBtn.textContent = '+';
      headerAddBtn.addEventListener('click', () => showColInlineAdd(i));

      colHeader.appendChild(nameInp);
      colHeader.appendChild(badge);
      colHeader.appendChild(headerAddBtn);

      /* Lista de cards */
      const listEl = document.createElement('div');
      listEl.className  = 'wk-card-list';
      listEl.dataset.col = i;

      listEl.addEventListener('dragover',  e => onDragOver(e, listEl));
      listEl.addEventListener('dragleave', e => {
        if (!listEl.contains(e.relatedTarget)) listEl.classList.remove('drag-over');
      });
      listEl.addEventListener('drop', e => onDrop(e, i));

      /* Cards */
      if (colCards.length === 0) {
        const empty = document.createElement('div');
        empty.className   = 'wk-empty';
        empty.textContent = 'Sem contatos';
        listEl.appendChild(empty);
      } else {
        colCards.forEach(card => {
          const cardEl = document.createElement('div');
          cardEl.className  = 'wk-card';
          cardEl.dataset.id = card.id;
          cardEl.draggable  = true;

          const sub = card.note
            ? card.note.slice(0, 40) + (card.note.length > 40 ? '…' : '')
            : cardPreview(card);

          cardEl.innerHTML = `
            <div class="wk-avatar ${avatarClass(card.name)}">${esc(initials(card.name))}</div>
            <div class="wk-card-body">
              <div class="wk-card-top">
                <div class="wk-card-name">${esc(card.name)}</div>
                <span class="wk-card-time">${esc(cardTime(card))}</span>
              </div>
              <div class="wk-card-bottom">
                <div class="wk-card-sub">${esc(sub)}</div>
                <span class="wk-agent-badge">${esc(initials(card.name))}</span>
              </div>
            </div>
            <button class="wk-card-menu-btn" title="Opções">⋮</button>
            <div class="wk-dropdown">
              <button class="wk-dd-item edit-item">✏ Editar</button>
              <button class="wk-dd-item danger del-item">✕ Remover</button>
            </div>
          `;

          /* Drag */
          cardEl.addEventListener('dragstart', e => onDragStart(e, card.id));
          cardEl.addEventListener('dragend',   onDragEnd);

          /* Menu ⋮ */
          const menuBtn = cardEl.querySelector('.wk-card-menu-btn');
          menuBtn.addEventListener('click', e => {
            e.stopPropagation();
            toggleDropdown(card.id, menuBtn);
          });

          cardEl.querySelector('.edit-item').addEventListener('click', e => {
            e.stopPropagation();
            closeAllDropdowns();
            openModal(card.id);
          });

          cardEl.querySelector('.del-item').addEventListener('click', e => {
            e.stopPropagation();
            closeAllDropdowns();
            deleteCard(card.id);
          });

          listEl.appendChild(cardEl);
        });
      }

      /* Rodapé da coluna com "+ Adicionar cartão" */
      const footer = document.createElement('div');
      footer.className = 'wk-col-footer';

      const addBtn = document.createElement('button');
      addBtn.className   = 'wk-col-add-btn';
      addBtn.innerHTML   = `<span style="font-size:14px;margin-top:-1px">+</span> Adicionar cartão`;
      addBtn.addEventListener('click', () => showColInlineAdd(i));

      const inlineAdd = document.createElement('div');
      inlineAdd.className = 'wk-col-inline-add';
      inlineAdd.innerHTML = `
        <input class="wk-col-inline-input" type="text" placeholder="Nome do contato…" maxlength="60">
        <div class="wk-col-inline-actions">
          <button class="wk-col-inline-btn save">Salvar</button>
          <button class="wk-col-inline-btn cancel">Cancelar</button>
        </div>
      `;

      const inlineInp = inlineAdd.querySelector('.wk-col-inline-input');

      inlineAdd.querySelector('.save').addEventListener('click', () => confirmColAdd(i));
      inlineAdd.querySelector('.cancel').addEventListener('click', () => hideColInlineAdd(i));

      inlineInp.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); confirmColAdd(i); }
        if (e.key === 'Escape') hideColInlineAdd(i);
      });

      footer.appendChild(addBtn);
      footer.appendChild(inlineAdd);

      /* Monta a coluna */
      colEl.appendChild(stripe);
      colEl.appendChild(colHeader);
      colEl.appendChild(listEl);
      colEl.appendChild(footer);

      board.appendChild(colEl);
    });

    /* Atualiza inputs se editMode estiver ativo */
    if (editMode) {
      document.querySelectorAll('.wk-col-name').forEach(inp => {
        inp.readOnly = false;
        inp.classList.add('editable');
      });
    }
  }

  /* ============================================================
     CONSTRUÇÃO INICIAL DO DOM
  ============================================================ */

  function buildShell() {
    /* ---- Painel raiz ---- */
    const root = document.createElement('div');
    root.id = 'wk-root';

    /* ---- Header ---- */
    root.innerHTML = `
      <div id="wk-header">
        <button class="wk-icon-btn" id="wk-btn-menu" title="Adicionar contato manual">${iconMenu()}</button>
        <span id="wk-title">Kanban CRM</span>
        <span id="wk-total-count">0</span>

        <div class="wk-toolbar-spacer"></div>

        <select id="wk-agent-filter" aria-label="Filtrar atendente">
          <option>Todos os atendentes</option>
        </select>

        <div id="wk-search-wrap">
          ${iconSearch()}
          <input id="wk-search" type="search" placeholder="Buscar..." autocomplete="off">
          ${iconSearch()}
        </div>

        <button class="wk-icon-btn" id="wk-btn-edit-cols" title="Editar colunas">${iconSliders()}</button>
        <button class="wk-icon-btn" id="wk-btn-refresh" title="Atualizar">${iconRefresh()}</button>

        <button class="wk-icon-btn" id="wk-btn-collapse" title="Expandir">${iconExpand()}</button>
      </div>

      <div id="wk-quick-add">
        <input id="wk-quick-input" type="text" placeholder="Nome do contato…" maxlength="60" autocomplete="off">
        <button class="wk-quick-btn save"   id="wk-quick-save">Adicionar</button>
        <button class="wk-quick-btn cancel" id="wk-quick-cancel">Cancelar</button>
      </div>

      <div id="wk-board"></div>
    `;

    document.body.appendChild(root);

    /* ---- Modal de edição ---- */
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'wk-modal-overlay';
    modalOverlay.innerHTML = `
      <div id="wk-modal">
        <h3>Editar contato</h3>
        <label class="wk-m-label">Nome</label>
        <input  class="wk-m-input"    id="wk-m-name" type="text" placeholder="Nome do contato" maxlength="60">
        <label class="wk-m-label">Nota</label>
        <textarea class="wk-m-textarea" id="wk-m-note" placeholder="Anotação rápida…"></textarea>
        <div class="wk-m-actions">
          <button class="wk-m-btn cancel" id="wk-m-cancel">Cancelar</button>
          <button class="wk-m-btn save"   id="wk-m-save">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalOverlay);

    /* ---- Toast ---- */
    const toast = document.createElement('div');
    toast.id = 'wk-toast';
    document.body.appendChild(toast);

    /* ============================================================
       EVENTOS GLOBAIS
    ============================================================ */

    /* Toggle recolher/expandir */
    const collapseBtn = document.getElementById('wk-btn-collapse');
    collapseBtn.addEventListener('click', () => {
      const collapsed = root.classList.toggle('collapsed');
      document.body.classList.toggle('wk-open',      !collapsed);
      document.body.classList.toggle('wk-collapsed',  collapsed);
      collapseBtn.innerHTML = collapsed ? iconExpand() : iconCollapse();
      collapseBtn.title = collapsed ? 'Expandir' : 'Recolher';
    });

    /* Menu: contato manual */
    document.getElementById('wk-btn-menu').addEventListener('click', () => {
      if (root.classList.contains('collapsed')) {
        root.classList.remove('collapsed');
        document.body.classList.add('wk-open');
        document.body.classList.remove('wk-collapsed');
        collapseBtn.innerHTML = iconCollapse();
        collapseBtn.title = 'Recolher';
      }
      toggleQuickAdd();
    });

    document.getElementById('wk-btn-refresh').addEventListener('click', refreshFromWhatsApp);
    document.getElementById('wk-search').addEventListener('input', e => {
      searchQuery = normalizeName(e.target.value).toLowerCase();
      renderBoard();
    });

    /* Quick-add: salvar */
    document.getElementById('wk-quick-save').addEventListener('click', confirmQuickAdd);
    document.getElementById('wk-quick-cancel').addEventListener('click', () => {
      document.getElementById('wk-quick-add').classList.remove('visible');
    });
    document.getElementById('wk-quick-input').addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); confirmQuickAdd(); }
      if (e.key === 'Escape') document.getElementById('wk-quick-add').classList.remove('visible');
    });

    /* Editar colunas */
    document.getElementById('wk-btn-edit-cols').addEventListener('click', toggleEditMode);

    /* Modal */
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
    document.getElementById('wk-m-cancel').addEventListener('click', closeModal);
    document.getElementById('wk-m-save').addEventListener('click', saveModal);
    modalOverlay.addEventListener('keydown', e => {
      if (e.key === 'Escape')              closeModal();
      if (e.key === 'Enter' && e.ctrlKey) saveModal();
    });

    /* Fechar dropdowns ao clicar fora */
    document.addEventListener('click', e => {
      if (!e.target.closest('.wk-card-menu-btn') && !e.target.closest('.wk-dropdown')) {
        closeAllDropdowns();
      }
    });

    /* Estado inicial: recolhido no rodape */
    root.classList.add('collapsed');
    document.body.classList.add('wk-collapsed');
  }

  /* ============================================================
     INICIALIZAÇÃO
  ============================================================ */

  function init() {
    if (document.getElementById('wk-root')) return; // já injetado
    buildShell();
    loadAll(() => {
      renderBoard();
      syncChatsFromWhatsApp({ silent: false });
      startChatObserver();
    });
    console.log('[Kanban CRM v2] Carregado ✓');
  }

  function waitForWhatsApp() {
    if (document.querySelector('#app')) { setTimeout(init, 600); return; }
    const obs = new MutationObserver(() => {
      if (document.querySelector('#app')) { obs.disconnect(); setTimeout(init, 600); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForWhatsApp);
  } else {
    waitForWhatsApp();
  }

})();
