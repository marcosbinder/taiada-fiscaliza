# 05 — Plano de Execução Multi-Agente & Prompts para o Gemini 3.8 (`taiada-fiscaliza`)

> **IMPORTANTE:** Sempre que o Gemini 3.8 executar uma fase deste plano, ele deve atualizar os checkboxes abaixo e registrar as decisões tomadas em [`docs/00-INDEX.md`](./00-INDEX.md).

---

## 1. Status das Fases de Execução

- [x] **Fase 0 — Arquitetura, Skills e Governança Documental (Concluída no Argon)**
- [x] **Fase 1 — Fundação, Configuração, Tipagem Compartilhada e Banco SQLite (`WAL`) + Seed de Caçapava (Concluída)**
- [x] **Fase 2 — Serviços de Backend, Pipeline `sharp`+`exifr`, Consenso Waze e Rotas Express (Concluída)**
- [x] **Fase 3 — Frontend Apple Design, Mapa de Caçapava, Bottom Sheets, WhatsApp e Ofício PDF (Concluída)**
- [x] **Fase 4 — Testes Automatizados e Documentação Open Source Inicial (Concluída)**
- [x] **Fase 5 — Refinamento Pós-Auditoria Argon, Higienização, 8 Commits Semânticos e Preparação GitHub (Concluída)**
  - [x] **5.1. Higienização do Repositório e `.gitignore`:**
    - Remover a pasta temporária `.agents/teamwork/` (mantendo intacta `.agents/skills/`) e remover `PROJECT.md` da raiz.
    - Remover os scripts avulsos temporários de `tests/` que não são suítes `.test.ts` do Vitest (`tests/adversarial-m1.ts`, `tests/adversarial-m2-2.ts`, `tests/adversarial-challenger-m4-2.ts`, `tests/adversarial-deep-stress.ts`, `tests/adversarial-aux-stress.ts`, `tests/db-stress.ts`, `tests/verify-routes.ts`), mantendo todas as 5 suítes oficiais do Vitest (`tests/api.test.ts`, `tests/adversarial_qr.test.ts`, `tests/adversarial-frontend.test.ts`, `tests/adversarial-consensus.test.ts`, `tests/adversarial-m4.test.ts`).
    - Adicionar `.agents/teamwork/` ao `.gitignore`.
  - [x] **5.2. Fluxo Direto da Opção A na Interseção de $\le 40\text{ m}$ (`CreateIssueSheet.tsx` & `App.tsx`):**
    - Em `src/components/CreateIssueSheet.tsx` e `src/App.tsx`, quando o cidadão clicar em **"Opção A (Recomendado): Somar meu apoio a este chamado existente"**, enviar imediatamente `POST /api/issues/:id/contribute` (incluindo `photo` se o usuário já tiver selecionado foto e comentário opcional), recarregar os chamados (`loadIssuesData()`), selecionar o chamado apoiado e **abrir automaticamente o modal de compartilhamento do WhatsApp (`setShareTarget({ issue: updatedIssue })`)**, cumprindo 100% da Seção 3.2 do PRD.
  - [x] **5.3. Scripts Completos em `package.json`:**
    - Adicionar `"start": "cross-env NODE_ENV=production tsx src/server/index.ts"` em `package.json`.
    - Atualizar `"test": "vitest run"` para rodar todas as 5 suítes `.test.ts` (136 testes Vitest) de uma só vez.
  - [x] **5.4. Atualização Final da Documentação Viva (`docs/`):**
    - Marcar todos os checkboxes da Fase 5 como `[x]` neste arquivo (`docs/05-AGENT-EXECUTION-PLAN.md`) e registrar a linha da Fase 5 no Diário de Sessões de [`docs/00-INDEX.md`](./00-INDEX.md).
    - Executar `npm run typecheck`, `npm test` e `npm run build` para confirmar `0` erros antes de commitar.
  - [x] **5.5. Inicialização do Git e Separação em 8 Commits Semânticos Atômicos:**
    - Inicializar o repositório (`git init -b main`) e criar exatamente os **8 commits separados** na ordem abaixo:
      1. `docs(governance): add GEMINI.md constitution, agent skills, and architectural docs` (`GEMINI.md`, `.agents/skills/`, `docs/`)
      2. `chore(config): initialize project configuration, TypeScript, Vite, Tailwind, and env validation` (`package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `.gitignore`, `.env.example`, `src/config/`, `src/vite-env.d.ts`)
      3. `feat(shared): implement Cacapava geofencing, Haversine math, street normalization, and categories` (`src/shared/`)
      4. `feat(db): create SQLite WAL schema with 5 tables and realistic Cacapava seed` (`src/server/db/`)
      5. `feat(server): implement EXIF/Sharp image pipeline, Waze time-decay consensus, and Zero-Auth security` (`src/server/middleware/`, `src/server/services/`)
      6. `feat(api): add Express REST routes, WhatsApp OpenGraph SSR (/c/:id), and admin 1-click purge` (`src/server/routes/`, `src/server/index.ts`)
      7. `feat(ui): build Apple Fluid Design PWA interface, Leaflet map, and A4 Official Document generator` (`index.html`, `public/`, `src/index.css`, `src/main.tsx`, `src/App.tsx`, `src/context/`, `src/utils/`, `src/components/`)
      8. `test(suite) & docs(oss): add comprehensive Vitest suites and Open Source repository documentation` (`tests/`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`)
  - [x] **5.6. Verificação de Git e Push para o GitHub (se autenticado via `gh` ou remote configurado):**
    - Verificar `git status` (garantindo `working tree clean`) e `git log --oneline`.
    - Verificar se `gh auth status` ou `git remote -v` está disponível; se houver remote ou se o usuário desejar publicar via `gh`, deixar pronto ou publicar.

