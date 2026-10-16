# Taiada Fiscaliza • "Cobra, Taiada!" 🌿🏛️

> **Plataforma Cívica Colaborativa Mobile-First (PWA), Zero-Auth e Open Source para Zeladoria Urbana e Serviços Públicos de Caçapava - SP.**

[![Node.js](https://img.shields.io/badge/Node.js-v24.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![SQLite WAL](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Apple Design](https://img.shields.io/badge/Design-Apple%20Fluid-000000?logo=apple&logoColor=white)](https://developer.apple.com/)
[![Licença MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-green.svg)](./LICENSE)
[![Município](https://img.shields.io/badge/Ca%C3%A7apava--SP-IBGE%203508504-15301d)](https://www.ibge.gov.br/)

---

## 1. Visão Geral e Identidade Cultural

O **Taiada Fiscaliza** (popularmente conhecido pelo brado cívico **"Cobra, Taiada!"**) é um sistema de governança colaborativa criado especialmente para a cidade de **Caçapava - SP** ("A Terra da Taiada", Código IBGE `3508504`).

A plataforma permite que qualquer cidadão registre problemas de zeladoria (buracos, iluminação apagada, mato alto, calçadas danificadas, semáforos, postos de saúde, escolas e transporte) em **menos de 30 segundos**, sem exigir senhas ou cadastros burocráticos. As demandas são agrupadas por inteligência geoespacial, validadas comunitariamente através de um motor de consenso estilo Waze e formalizadas automaticamente em **Ofícios e Indicações Parlamentares em PDF** prontos para entrega na Prefeitura e na Câmara Municipal de Caçapava.

### Identidade Visual "Verde Taiada" e Duplo Nome de Marca
- **Verde Taiada Profundo (`--taiada-dark`):** `#15301d`
- **Verde Taiada Vivo (`--taiada-primary`):** `#347947`
- **Superfície Clara:** `#F4F7F5` | **Superfície Escura:** `#0B1910`
- **Sistema de Dupla Marca:**
  - **Modo A (Institucional):** `Taiada Fiscaliza` — *"Cobra, Taiada! • Zeladoria Colaborativa de Caçapava"*
  - **Modo B (Imperativo):** `Cobra, Taiada!` — *"Taiada Fiscaliza • Mapa Cívico de Caçapava"*
- **Componente `<BrandLogo />`:** Detecta automaticamente `/logo.svg` ou `/logo.png` em `public/`, renderizando um emblema vetorial minimalista padrão Apple enquanto a marca final não for carregada.

---

## 2. Seed Realista Inicial de Caçapava - SP

Ao iniciar o sistema pela primeira vez com o banco vazio, o banco de dados é populado com **8 demandas realistas** em coordenadas verdadeiras de Caçapava - SP:

| Protocolo | Categoria | Bairro / Logradouro Real | Coordenadas | Impacto / Demonstração |
| :--- | :--- | :--- | :--- | :--- |
| **`TAI-2026-0101`** | `buracos_vias` | **Avenida Brasil**, Vera Cruz | `-23.1042, -45.7098` | **Dossiê Avenida Brasil (Ponto #1):** Cratera no asfalto sentido Centro com foto e 18 apoios. |
| **`TAI-2026-0102`** | `buracos_vias` | **Avenida Brasil**, Jardim Caçapava | `-23.1018, -45.7081` | **Dossiê Avenida Brasil (Ponto #2):** Afundamento na pista (~310m do #1) com 16 apoios. |
| **`TAI-2026-0103`** | `buracos_vias` | **Avenida Brasil**, Centro | `-23.0989, -45.7062` | **Dossiê Avenida Brasil (Ponto #3):** Sequência de buracos com 14 apoios (**Totalizando 48 moradores no Dossiê da Av. Brasil!**). |
| **`TAI-2026-0104`** | `iluminacao` | **Rua São Bento**, Vila Resende | `-23.1075, -45.7142` | Poste apagado (`CP-4812`), Gravidade 4/5, protocolado na Câmara (`Indicação Nº 142/2026`). |
| **`TAI-2026-0105`** | `sinalizacao_transito` | **Av. Coronel Manoel Inocêncio**, Centro | `-23.1004, -45.7059` | Faixa de pedestres apagada e semáforo intermitente em horário de pico, Gravidade 5/5. |
| **`TAI-2026-0106`** | `saude` | **Rua Dr. José de Moura Resende**, Vila Paraíso | `-23.0945, -45.7015` | Demora no acolhimento e falta de insumo na UBS Vila Paraíso (foto opcional, com campos auxiliares). |
| **`TAI-2026-0107`** | `buracos_vias` | **Rua Marquês de Herval**, Centro | `-23.0996, -45.7088` | **Caso Reaberto (`reopened`):** Problema que havia sido fechado mas reabriu após chuva forte com 4 eventos na timeline. |
| **`TAI-2026-0108`** | `calcadas_acessibilidade` | **Av. da Saudade**, Nova Caçapava | `-23.1128, -45.6945` | **Caso em Verificação Waze (`verifying_resolution`):** Rampa de acessibilidade reformada aguardando confirmação final ($S = 6,0$). |

---

## 3. Inovações e Arquitetura Técnica

1. **Delimitação Municipal e Geofencing Estrito:**
   - Centro fixado em `-23.1006, -45.7069` (Zoom 14).
   - Trava de Bounding Box: Latitude `[-23.2600, -22.9500]` e Longitude `[-45.8100, -45.6000]`. Coordenadas externas são rejeitadas com `HTTP 422 Unprocessable Entity` (`OUTSIDE_CACAPAVA`).
2. **Deduplicação Inteligente em 2 Níveis:**
   - **Nível 1 (Raio $\le 40\text{ m}$):** Ao relatar problema próximo via Haversine, o usuário recebe um card verde `#347947` para somar força ao chamado existente em vez de fragmentar a demanda.
   - **Nível 2 (Dossiê Automático de Rua):** Normalização de vias (`street_group_key`) agregando problemas da mesma rua em um Dossiê Coletivo com pinos numerados no mapa.
3. **Motor de Consenso Waze com Prova de Presença GPS:**
   - Pontuação: Presencial com foto ($\le 150\text{ m}$) = $\pm 5,0$; Presencial sem foto = $\pm 3,0$; Remoto = $\pm 0,5$ com **Trava de Teto Remoto** ($|\sum \text{remotos}| \le 3,0$).
   - Decaimento Temporal Exponencial: $S(t) = \sum s_i \cdot W_i \cdot (0,75)^{\Delta \text{dias}}$.
   - Transição de status: `open` $\to$ `verifying_resolution` $\to$ `resolved_community` (exige $S \ge 10,0$ e $\ge 2$ dispositivos presenciais distintos) $\to$ `reopened` se votos negativos contestarem a resolução.
4. **Pipeline Sharp + Exifr com Privacidade Total (LGPD):**
   - Sanitização de fotos para `.webp` (qualidade 80) removendo 100% dos dados de hardware e privacidade no arquivo público.
   - Coordenadas e data do EXIF são extraídas exclusivamente em memória para conferência do selo cívico de auditoria.
   - Heurística anti-troll por desvio padrão e entropia (`sharp.stats()`) para detectar fotos pretas, brancas ou fraudulentas.
5. **Segurança Zero-Auth e Defesa Anti-Spam:**
   - Cookie assinado `taiada_device_token` via HMAC-SHA256 e gravação apenas de `device_hash` anônimo.
   - Cálculo de `trust_score` (0 a 100) com Optimistic UI para relatos em moderação.
   - **Expurgo em 1 Clique:** Remoção atômica de todas as ações de um dispositivo troll nas últimas 72 horas com recálculo de consenso e Shadowban imediato.
6. **Motor Viral de WhatsApp e Documento Oficial em PDF/Print:**
   - Rota `/c/:id` com metatags OpenGraph dinâmicas e card SVG vetorizado para compartilhamento instantâneo no WhatsApp.
   - Gerador de Ofício / Indicação Parlamentar pronto para impressão ou salvamento em PDF com QR Code SVG funcional.
7. **Design System Apple Fluid (`apple-design` & `mobile-native`):**
   - Bottom sheets com física de mola real (`FluidBottomSheet`), *velocity handoff*, projeção exponencial `project(v, 0.998)`, resposta instantânea no toque e 3 temas: **Claro**, **Escuro** e **Sol Forte (Alto Contraste)** para fiscalização na rua.

---

## 4. Instalação e Execução

### Pré-requisitos
- Node.js >= 20 (Recomendado: Node.js v24.x)
- npm >= 10

### Passo a Passo
```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/taiada-fiscaliza.git
cd taiada-fiscaliza

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env

# 4. Inicie o servidor em desenvolvimento
npm run dev

# 5. Execute a suíte de testes automatizados
npm test
```

---

## 5. Estrutura do Projeto

```text
taiada-fiscaliza/
├── docs/                 # Memória arquitetural contínua e ADRs (00 a 05)
├── public/               # Favicon SVG e Manifesto PWA
├── src/
│   ├── config/           # brand.ts (Modos A e B) e env.ts (Validação Zod)
│   ├── shared/           # types.ts, categories.ts e geo.ts (Geofence Caçapava)
│   ├── server/           # Express, SQLite WAL (db/), rotas e serviços
│   ├── components/       # Interface Apple Fluid, mapas Leaflet e modais
│   ├── context/          # Preferências do usuário (Marca, Tema, Economia 3G)
│   ├── App.tsx           # Componente raiz da aplicação
│   ├── main.tsx          # Entrada React
│   └── index.css         # Tokens CSS e regras mobile-native
├── tests/                # Testes automatizados (tests/api.test.ts)
├── .env.example          # Exemplo seguro de variáveis de ambiente
├── CONTRIBUTING.md       # Diretrizes para colaboradores
├── SECURITY.md           # Política de segurança e modelo de ameaça
├── LICENSE               # Licença MIT
├── package.json          # Dependências e scripts
└── vite.config.ts        # Configuração do Vite e proxy
```

---

## 6. Licença e Governança

Este projeto é disponibilizado sob a **Licença MIT** — consulte o arquivo [`LICENSE`](./LICENSE) para obter detalhes completos. Contribuições cívicas da comunidade caçapavense e de todo o ecossistema de software livre são calorosamente bem-vindas!
