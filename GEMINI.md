# GEMINI.md — Constituição do Projeto & Memória Arquitetural Contínua (`taiada-fiscaliza`)

> **LEITURA OBRIGATÓRIA ANTES DE QUALQUER AÇÃO:**
> Todo agente de IA (Antigravity, Gemini, Subagentes `DeepCoder`, `DeepInvestigator`, `teamwork_preview` ou qualquer sessão futura) **DEVE** ler este arquivo e os documentos da pasta [`docs/`](./docs/00-INDEX.md) **antes** de planejar, criar ou modificar qualquer linha de código neste repositório.

---

## 1. REGRA DE OURO: GOVERNANÇA E MEMÓRIA ENTRE SESSÕES (`docs/`)

Este projeto utiliza a pasta [`docs/`](./docs/) como **Fonte Única da Verdade e Memória Persistente entre Sessões**. Para evitar perda de contexto entre trocas de modelo, sessões ou execuções multi-agente, cumpra rigorosamente o protocolo abaixo:

1. **Consultar Antes de Agir:**
   - Antes de implementar ou alterar qualquer funcionalidade, leia [`docs/00-INDEX.md`](./docs/00-INDEX.md) e o documento específico do domínio correspondente em `docs/`.
2. **Documentar Tudo o que Mudar ou For Decidido:**
   - **Toda decisão arquitetural**, escolha de biblioteca, alteração de schema SQLite, nova rota de API, ajuste de peso matemático (Haversine, Time-Decay, `trust_score`), mudança de componente de UI ou decisão tomada por um agente/subagente **DEVE ser imediatamente registrada na pasta `docs/`**.
   - Se a mudança refinar algo existente, **edite o arquivo correspondente em `docs/`** e adicione uma entrada no Changelog de Sessões em [`docs/00-INDEX.md`](./docs/00-INDEX.md).
   - Se surgir um novo módulo, integração ou decisão estrutural inédita, **crie um novo arquivo numerado em `docs/`** (ou um ADR em `docs/adr/ADR-XXXX-titulo.md`) e referencie-o em [`docs/00-INDEX.md`](./docs/00-INDEX.md).
3. **Passagem de Bastão entre Sessões e Subagentes:**
   - Sempre que encerrar uma etapa de implementação ou rodada de subagente, atualize o status em [`docs/05-AGENT-EXECUTION-PLAN.md`](./docs/05-AGENT-EXECUTION-PLAN.md) e [`docs/00-INDEX.md`](./docs/00-INDEX.md) indicando o que já foi construído, testado e o que resta fazer.

---

## 2. VISÃO EXECUTIVA E IDENTIDADE DO PROJETO

- **Projeto:** `taiada-fiscaliza` (**"Taiada Fiscaliza"** / **"Cobra, Taiada!"**)
- **Propósito:** Plataforma Cívica Colaborativa *Mobile-First* (PWA), *Zero-Auth* (sem cadastro/senha) e *Open Source* para mapeamento, agrupamento inteligente, priorização comunitária e fiscalização de demandas de zeladoria urbana e serviços públicos.
- **Recorte Geográfico Exclusivo:** Município de **Caçapava - SP** (Código IBGE: `3508504`).
  - **Centro Inicial do Mapa:** Latitude `-23.1006`, Longitude `-45.7069` (Zoom `14`).
  - **Trava de Geofencing (Bounding Box):**
    - Latitude: `[-23.2600, -22.9500]`
    - Longitude: `[-45.8100, -45.6000]`
    - Qualquer submissão fora desse polígono é bloqueada no frontend e rejeitada na API com `HTTP 422 Unprocessable Entity`.
- **Idioma:** 100% em **Português do Brasil (`pt-BR`)**, adaptado à realidade e aos bairros/logradouros de Caçapava - SP.

---

## 3. DIRETRIZES TÉCNICAS E DE DESIGN INEGOCIÁVEIS

1. **Ecossistema Obrigatório de Skills Instaladas (`.agents/skills/`):**
   - **Apple Fluid Design (`apple-design`):** [`.agents/skills/apple-design/SKILL.md`](./.agents/skills/apple-design/SKILL.md) — Resposta instantânea no `pointerdown` (`active:scale-[0.97]`), manipulação direta 1:1 em *Bottom Sheets*, animações interrompíveis baseadas em física de mola (*springs*), *velocity handoff*, projeção exponencial de momento (`project(v, 0.998)`), superfícies translúcidas (`backdrop-filter: blur(20px)`) e tipografia limpa (`Inter` / `-apple-system`).
   - **Mobile-Native PWA (`mobile-native`):** [`.agents/skills/mobile-native/SKILL.md`](./.agents/skills/mobile-native/SKILL.md) — `@media (hover: hover) and (pointer: fine)` (sem hover travado no toque), `-webkit-tap-highlight-color: transparent`, layout `100dvh`, inputs com `font-size >= 16px` (evita zoom forçado no iOS sem travar acessibilidade), `overscroll-behavior: none` e `env(safe-area-inset-bottom)`.
   - **Design Engineering, Performance 60/120fps, React Best Practices & Humanizer (`emil-design-eng`):** [`.agents/skills/emil-design-eng/SKILL.md`](./.agents/skills/emil-design-eng/SKILL.md) — Curvas customizadas (`--ease-out`, `--ease-drawer`), animação exclusiva em propriedades *composite* (`transform`, `opacity`), atualização direta via `ref` durante arraste sem re-render por frame, checagens síncronas antes de I/O e microcopy natural em `pt-BR` sem clichês robóticos de IA.
2. **Paleta Oficial "Verde Taiada" e Nomes Duplos da Marca (`src/config/brand.ts`):**
   - **Verde Taiada Profundo (`--taiada-dark`):** `#15301d` (`rgb(21, 48, 29)`)
   - **Verde Taiada Vivo (`--taiada-primary`):** `#347947` (`rgb(52, 121, 71)`)
   - **Superfície Clara (`--taiada-light-bg`):** `#F4F7F5` | **Superfície Escura (`--taiada-dark-bg`):** `#0B1910`
   - **Suporte Nativo aos 2 Nomes Oficiais:**
     - **Modo A (Institucional):** `Taiada Fiscaliza` (Subtítulo: *"Cobra, Taiada! • Zeladoria Colaborativa de Caçapava"*)
     - **Modo B (Imperativo):** `Cobra, Taiada!` (Subtítulo: *"Taiada Fiscaliza • Mapa Cívico de Caçapava"*)
   - **Componente `<BrandLogo />` (`src/components/BrandLogo.tsx`):** Verifica automaticamente se `/logo.svg` ou `/logo.png` existe em `public/`. Enquanto não existir, renderiza o emblema vetorial minimalista padrão Apple (escudo/pino geométrico com gradiente `#15301d` $\rightarrow$ `#347947` + ícone de localização/megafone cívico).
3. **Padrão Open Source e Segurança Zero Segredos:**
   - **Proibido** inserir senhas, chaves privadas, `DEVICE_SECRET` ou `ADMIN_TOKEN` fixos no código-fonte.
   - Todas as configurações sensíveis vêm de variáveis de ambiente validadas via `zod` na inicialização, documentadas em `.env.example`.

---

## 4. MAPA DA DOCUMENTAÇÃO (`docs/`)

| Arquivo | Conteúdo Principal | Quando Consultar / Atualizar |
| :--- | :--- | :--- |
| [`docs/00-INDEX.md`](./docs/00-INDEX.md) | Índice geral, status de implementação e **Diário de Decisões entre Sessões**. | No início e no fim de **toda** sessão ou execução de subagente. |
| [`docs/01-ARCHITECTURE-AND-STACK.md`](./docs/01-ARCHITECTURE-AND-STACK.md) | Stack tecnológica, estrutura de pastas, schema SQLite (`WAL`), índices e especificação do Seed realista de Caçapava. | Ao criar/alterar tabelas, migrations, seed, scripts ou pacotes npm. |
| [`docs/02-DESIGN-SYSTEM-APPLE-TAIADA.md`](./docs/02-DESIGN-SYSTEM-APPLE-TAIADA.md) | Regras da skill `apple-design`, tokens `#15301d`/`#347947`, temas (Claro, Escuro, Sol Forte), `<BrandLogo />` e componentes de UI. | Ao construir ou modificar qualquer tela, modal, *Bottom Sheet* ou estilo CSS/Tailwind. |
| [`docs/03-GEO-CONSENSUS-AND-SECURITY.md`](./docs/03-GEO-CONSENSUS-AND-SECURITY.md) | Geofencing de Caçapava, 4 modos de localização, deduplicação em 2 níveis ($40\text{ m}$ + Dossiê de Rua), pipeline `sharp`+`exifr`, Motor Waze Time-Decay e Defesa Anti-Troll (`trust_score`, Shadowban, Expurgo). | Ao implementar regras de negócio, cálculos matemáticos, uploads de foto ou moderação. |
| [`docs/04-API-AND-VIRAL-ENGINE.md`](./docs/04-API-AND-VIRAL-ENGINE.md) | Contratos das rotas de API, SSR de OpenGraph para WhatsApp (`/c/:id`) e Gerador Automático de Ofício / Indicação Parlamentar (PDF/Impressão). | Ao criar/alterar endpoints Express, integração frontend-backend, compartilhamento ou impressão de ofícios. |
| [`docs/05-AGENT-EXECUTION-PLAN.md`](./docs/05-AGENT-EXECUTION-PLAN.md) | Plano de execução detalhado em fases, prompts prontos para subagentes e checklist de verificação automatizada. | Ao orquestrar subagentes (`DeepCoder`, `teamwork_preview`) ou validar entregas. |
