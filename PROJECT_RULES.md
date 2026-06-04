# PROJECT RULES — WhatsApp Kanban CRM

## Regra principal
Este projeto deve ser alterado sempre de forma cirúrgica.

## Não fazer
- Não refatorar o projeto inteiro.
- Não trocar a arquitetura.
- Não mudar funcionalidades que já estão funcionando.
- Não alterar arquivos fora do escopo solicitado.
- Não recriar o layout inteiro sem autorização.
- Não adicionar frameworks.
- Não adicionar backend.
- Não adicionar IA.
- Não adicionar automação de mensagens.
- Não alterar manifest.json sem necessidade real.

## Como trabalhar
- Antes de alterar, listar os arquivos que serão modificados.
- Fazer uma alteração por vez.
- Preservar o visual e funcionamento existente.
- Priorizar CSS antes de mexer no JavaScript.
- Validar sintaxe após alterações.
- Informar exatamente o que mudou.

## Arquivos principais
- content.js: lógica da extensão, cards, colunas, storage e interações.
- styles.css: layout e visual.
- manifest.json: configuração da extensão Chrome.
- README.md: documentação.

## Regra para layout
Qualquer ajuste visual deve ser pequeno e isolado.

Exemplo:
- ajustar altura dos cards;
- alinhar botão;
- corrigir menu;
- corrigir espaçamento;
- ajustar posição do painel.

Nunca fazer tudo ao mesmo tempo.
