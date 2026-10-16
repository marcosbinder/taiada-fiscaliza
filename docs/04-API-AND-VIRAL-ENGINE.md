# 04 — Especificação de Rotas da API, Motor Viral de WhatsApp e Gerador de Ofício (`taiada-fiscaliza`)

---

## 1. Contratos das Rotas REST (`src/server/routes/`)

### 1.1. `GET /api/issues`
- **Comportamento:**
  - Identifica o `device_hash` do requisitante via middleware `deviceIdentity`.
  - Retorna todas as demandas que satisfazem:
    - `(moderation_status IN ('auto_approved', 'approved') AND is_shadowbanned = 0)` **OU** `(device_hash = :requesterHash AND moderation_status != 'rejected')`.
  - Para cada demanda, anexa:
    - `is_mine`: `boolean` (`issue.device_hash === requesterHash`)
    - `user_votes`: tipos de voto já emitidos por este `device_hash` no chamado (`upvote`, `resolved_yes`, `resolved_no_returned`)
    - `contributions_count`: total de fotos/apoios mesclados na tabela `issue_contributions`
  - Agrega e retorna também `street_dossiers`: lista de todos os `street_group_key` com $\ge 2$ chamados ativos (`resolution_status NOT IN ('resolved_community', 'resolved_official')`), ordenados pelo total de moradores impactados.
- **Payload de Resposta (`HTTP 200`):**
  ```json
  {
    "device_hash_short": "a9f4...c12e",
    "issues": [ /* IssueDTO[] */ ],
    "street_dossiers": [ /* StreetDossierDTO[] */ ],
    "stats": {
      "total_active": 6,
      "total_resolved": 1,
      "total_reopened": 1,
      "total_supporters": 112
    }
  }
  ```

### 1.2. `GET /api/issues/:id`
- Retorna os detalhes completos de um chamado específico (`TAI-2026-XXXX`), incluindo:
  - `timeline`: eventos da tabela `issue_timeline` ordenados cronologicamente;
  - `contributions`: contribuições e fotos anexadas por vizinhos (`issue_contributions`);
  - `votes_summary`: contagem de validações presenciais c/ foto, presenciais GPS e remotas, além do `consensus_score` atualizado.

### 1.3. `POST /api/issues/check-duplicates`
- **Body:** `{ latitude: number, longitude: number, category: IssueCategory, street_name?: string }`
- **Regras:**
  1. Valida se `(latitude, longitude)` pertence ao Bounding Box de Caçapava (`[-23.2600, -22.9500]`, `[-45.8100, -45.6000]`). Caso contrário, retorna `HTTP 422` com `{ error: 'OUTSIDE_CACAPAVA', message: '...' }`.
  2. Calcula a distância Haversine para todos os chamados ativos da mesma `category`.
  3. Retorna `nearby_duplicates` ($d \le 40\text{ m}$, ordenados pela menor distância) e `same_street_issues` (chamados ativos com a mesma `street_group_key` para informar sobre o Dossiê da Via).

### 1.4. `POST /api/issues` (`multipart/form-data`)
- **Campos:** `title`, `description`, `category`, `severity`, `latitude`, `longitude`, `raw_latitude`, `raw_longitude`, `street_name`, `neighborhood`, `reference_point`, `location_source`, `gps_accuracy_meters`, `author_name`, `auxiliary_data`, e arquivo `photo` (`req.file`).
- **Validações:**
  - Bloqueia coordenadas fora de Caçapava (`HTTP 422`).
  - Verifica obrigatoriedade de foto conforme a categoria (`buracos_vias`, `iluminacao`, `limpeza_mato`, `calcadas_acessibilidade`, `sinalizacao_transito` exigem `photo`; `saude`, `educacao`, `transporte` têm foto opcional).
  - Valida `author_name` (se informado) contra URLs, `@`, números de telefone e *blocklist* de ofensas/nomes políticos.
  - Executa pipeline `exifr` + `sharp` (`.webp` limpo) + heurística anti-brincadeira.
  - Calcula `trust_score`, verifica se o `device_hash` está em `shadowban`, gera o protocolo sequencial `TAI-2026-XXXX`, insere em `issues` e `issue_timeline`, dispara Webhook (se configurado) e retorna `HTTP 201` com o objeto criado e `share_url: "/c/TAI-2026-XXXX"`.

### 1.5. `POST /api/issues/:id/contribute` (`multipart/form-data`)
- **Propósito:** Acionado quando o morador escolhe a **Opção A** no card de interseção de $\le 40\text{ m}$ (*"Sim! Somar meu apoio e minha foto a este chamado"*).
- **Comportamento:** Sanitiza a foto opcional via `sharp`, insere registro em `issue_contributions`, garante $+1$ apoio em `upvotes_count` (se o `device_hash` ainda não apoiou), adiciona evento `merged_support` em `issue_timeline` e retorna o chamado atualizado.

### 1.6. `POST /api/issues/:id/interact` (`multipart/form-data`)
- **Campos:** `vote_type` (`'upvote' | 'resolved_yes' | 'resolved_no_returned'`), `voter_latitude?`, `voter_longitude?`, `note?`, e arquivo opcional `proof_photo`.
- **Comportamento:**
  - Para `upvote`: garante 1 voto positivo de prioridade por `device_hash` por chamado, incrementando `upvotes_count`.
  - Para `resolved_yes` / `resolved_no_returned`:
    - Calcula a distância Haversine $d_{\text{voto}}$ entre `(voter_latitude, voter_longitude)` e o pino do chamado;
    - Define `is_presential_gps = (d_voto <= 150 ? 1 : 0)`;
    - Atribui peso `5.0` (se presencial + `proof_photo` válida), `3.0` (se presencial sem foto) ou `0.5` (se remoto / sem GPS);
    - Recalcula a equação de decaimento temporal $S(t_{\text{agora}})$ (respeitando o teto remoto de $\pm 3,0$) e atualiza `consensus_score`, `resolution_status` e `reopened_count`, gravando transições na `issue_timeline`.

### 1.7. Rotas Administrativas (`/api/admin/*` — Header `Authorization: Bearer <ADMIN_TOKEN>`)
- **`GET /api/admin/overview`:** Lista fila `pending_review`, itens sinalizados, dispositivos em `shadowban` e estatísticas gerais.
- **`POST /api/admin/moderation/:id`:** Permite aprovar (`approved`), rejeitar (`rejected`), alterar `official_status` (`received`, `triaged`, `protocolled`, `completed`) e gravar `official_protocol_number` (ex: `"Indicação Nº 142/2026 - Câmara Municipal de Caçapava"`), adicionando evento `official_protocol` na `issue_timeline`.
- **`POST /api/admin/purge-device`:** Recebe `{ device_hash, issue_id?, mode: 'purge_and_shadowban' | 'shadowban_only', reason? }`. Executa o **Expurgo em 1 Clique** removendo relatos, fotos e votos das últimas 72h daquele `device_hash`, ativando `shadowban = 1` em `blocked_devices` e recalculando o consenso de todos os chamados afetados.

---

## 2. Motor Viral de WhatsApp ("Feito para o Zap" — `/c/:id` & `/api/og/:id.svg`)

1. **Rota Curta `/c/:id` (`src/server/routes/share.ts`):**
   - Busca o chamado `TAI-2026-XXXX` no banco SQLite.
   - Renderiza o HTML da aplicação com as metatags OpenGraph e Twitter Cards injetadas no `<head>` antes de entregar ao cliente/crawler (`WhatsApp/2.x`, `facebookexternalhit`, `TelegramBot`):
     - `og:title`: `"📍 [Bairro] ([Rua]) — [Título do Problema] | Taiada Fiscaliza (Caçapava)"`
     - `og:description`: `"Cobra, Taiada! Gravidade [N]/5 • [X] moradores já confirmaram este problema. Clique para apoiar ou informar se já foi resolvido (não precisa de cadastro)."`
     - `og:image`: URL absoluta da foto real enviada (`/uploads/...webp`) ou, caso não tenha foto, `/api/og/TAI-2026-XXXX.svg` (card visual dinâmico nas cores `#15301d` e `#347947` com protocolo, bairro, rua, gravidade e apoios).
   - Inclui `window.__INITIAL_ISSUE_ID__ = "TAI-2026-XXXX"` para que a SPA abra automaticamente o mapa centralizado no pino com o *Bottom Sheet* do chamado aberto.
2. **Compartilhamento Direto (`WhatsAppShareModal.tsx`):**
   - Gera link `https://wa.me/?text=...` com mensagem natural em `pt-BR` pronta para grupos de bairro de Caçapava, além de botão de cópia rápida com feedback tátil e Web Share API (`navigator.share`).

---

## 3. Gerador Automático de Ofício / Indicação Parlamentar (`OfficialDocumentModal.tsx`)

Disponível tanto em cada pino individual quanto em qualquer **Dossiê de Rua** (ex: *Dossiê da Avenida Brasil*):
- Renderiza um documento formal padronizado com cabeçalho institucional em `#15301d` e botão **"Imprimir / Salvar em PDF (`window.print()`)"** com regras `@media print` dedicadas (ocultando o mapa de fundo e barras de navegação na folha A4):
  1. **Cabeçalho Institucional:** Emblema `<BrandLogo />`, título **"DOCUMENTO CÍVICO DE DEMANDA URBANA / MINUTA DE INDICAÇÃO E OFÍCIO"**, endereçado à Prefeitura Municipal de Caçapava - SP / Secretaria Municipal Competente e Câmara Municipal de Caçapava.
  2. **Quadro Técnico da Demanda:** Número do Protocolo (`TAI-2026-XXXX` ou código do Dossiê de Rua), Categoria, Nível de Gravidade (`1 a 5`), Logradouro, Bairro, Ponto de Referência e Coordenadas GPS exatas (`Latitude, Longitude`).
  3. **QR Code Vetorial Nativo (SVG):** Gerado em tempo real no cliente (sem depender de API externa) apontando para `<origem>/c/TAI-2026-XXXX`, permitindo que assessores, vereadores ou engenheiros da Prefeitura escaneiem o papel impresso e abram o ponto exato no celular.
  4. **Prova Social e Consenso Comunitário:** Total de moradores de Caçapava que apoiaram a demanda, status de validação comunitária Waze e histórico de reaberturas (`reopened_count`) caso um reparo anterior tenha falhado.
  5. **Anexo Fotográfico Auditado:** Fotos do chamado e das contribuições vizinhas com carimbo de data/hora EXIF (`exif_captured_at`) e selo de verificação local.
