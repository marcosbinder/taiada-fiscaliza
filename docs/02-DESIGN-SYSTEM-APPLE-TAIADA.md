# 02 — Design System: Apple Fluid Interface & Paleta "Verde Taiada" (`taiada-fiscaliza`)

---

## 1. Identidade Visual Oficial e Suporte Duplo de Marca (`src/config/brand.ts`)

O sistema celebra a identidade cultural de **Caçapava - SP ("Terra da Taiada")** e opera com suporte nativo aos dois nomes oficiais a partir de um único arquivo de configuração (`src/config/brand.ts`), lendo o modo padrão de `import.meta.env.VITE_APP_BRAND_MODE` e permitindo alternância instantânea pelo cidadão no menu de Configurações:

| Propriedade | Modo A (`institucional` — Padrão) | Modo B (`imperativo` — Direto) |
| :--- | :--- | :--- |
| **Título Principal (`primaryName`)** | `Taiada Fiscaliza` | `Cobra, Taiada!` |
| **Subtítulo (`subtitle`)** | `"Cobra, Taiada! • Zeladoria Colaborativa de Caçapava"` | `"Taiada Fiscaliza • Mapa Cívico de Caçapava"` |
| **Botão de Ação Principal (`ctaLabel`)** | `+ Cobra, Taiada! Registrar Problema` | `+ Cobra, Taiada! Registrar Problema` |
| **Badge de Apoio Comunitário (`upvoteLabel`)** | `Cobra, Taiada! Também passo por aqui` | `Cobra, Taiada! Também passo por aqui` |

---

## 2. Componente `<BrandLogo />` (`src/components/BrandLogo.tsx`)

Para garantir que a futura logo oficial possa ser adicionada sem tocar em nenhuma linha de código:
1. O componente `<BrandLogo />` tenta carregar `/logo.svg` e, em fallback, `/logo.png` (via verificação de imagem assíncrona com cache em memória na sessão).
2. Enquanto `/public/logo.svg` e `/public/logo.png` não existirem no repositório, o componente renderiza automaticamente um **emblema vetorial minimalista padrão Apple**:
   - Contêiner `rounded-2xl` com gradiente linear de `135deg` de `#15301d` (Verde Taiada Profundo) para `#347947` (Verde Taiada Vivo), borda interna translúcida `rgba(255, 255, 255, 0.22)` e sombra suave;
   - Ícone vetorial interno combinando um escudo/pino de localização cívico e ondas de megafone em branco puro (`#FFFFFF`), acompanhado da tipografia `Taiada Fiscaliza` / `Cobra, Taiada!` com `tracking-tight`.

---

## 3. Paleta de Cores Oficial e Design Tokens (`src/index.css` & `tailwind.config.js`)

```css
:root {
  /* Cores Oficiais da Marca */
  --taiada-dark: #15301d;          /* rgb(21, 48, 29)  - Verde Taiada Profundo */
  --taiada-primary: #347947;       /* rgb(52, 121, 71) - Verde Taiada Vivo */
  --taiada-light-bg: #f4f7f5;      /* Superfície Apple clara harmonizada */
  --taiada-dark-bg: #0b1910;       /* Superfície Apple escura profunda */

  /* Tokens Semânticos — Modo Claro (Default) */
  --surface-bg: #f4f7f5;
  --surface-card: #ffffff;
  --surface-glass: rgba(255, 255, 255, 0.85);
  --surface-glass-dark: rgba(21, 48, 29, 0.90);
  --text-primary: #0f2416;
  --text-secondary: #3f5947;
  --border-subtle: rgba(21, 48, 29, 0.10);
  --border-weight: 1px;
}

[data-theme="dark"] {
  --surface-bg: #0b1910;
  --surface-card: #15301d;
  --surface-glass: rgba(21, 48, 29, 0.85);
  --text-primary: #f4f7f5;
  --text-secondary: #a7c7b0;
  --border-subtle: rgba(52, 121, 71, 0.35);
  --border-weight: 1px;
}

[data-theme="high-contrast"] {
  /* Modo Sol Forte (Alto Contraste para uso na rua debaixo do sol) */
  --surface-bg: #ffffff;
  --surface-card: #ffffff;
  --surface-glass: #ffffff;
  --text-primary: #15301d;
  --text-secondary: #15301d;
  --border-subtle: #15301d;
  --border-weight: 2px;
}
```

---

## 4. Diretrizes Obrigatórias da Skill `apple-design` na UI

Todo componente interativo deve implementar os 6 pilares técnicos da skill [`.agents/skills/apple-design/SKILL.md`](../.agents/skills/apple-design/SKILL.md):

1. **Resposta Instantânea no `pointerdown` (Zero Latência):**
   - Todos os botões, pílulas de filtro e cards clicáveis aplicam `active:scale-[0.97] transition-transform duration-100 ease-out` e `touch-action: manipulation` para resposta física imediata ao toque.
2. **Bottom Sheets Fluidos com Manipulação 1:1 e Projeção de Momento (`FluidBottomSheet.tsx`):**
   - O *Bottom Sheet* acompanha o dedo do usuário em proporção 1:1 via `PointerEvents`, respeitando o `grabOffset` inicial.
   - Ao soltar o gesto, calcula a velocidade em `px/s` dos últimos eventos e projeta o ponto final com a fórmula oficial da Apple:
     $$\text{projectedY} = y_{\text{atual}} + \frac{v_0}{1000} \cdot \frac{0,998}{1 - 0,998}$$
   - Escolhe o *snap point* mais próximo e anima com mola `damping: 0.8, response: 0.3` repassando a velocidade inicial (*velocity handoff*).
3. **Interrompibilidade Total:**
   - Transições não bloqueiam eventos de toque (`pointer-events` permanecem ativos) e partem sempre da posição atual na tela.
4. **Superfícies Translúcidas e Profundidade Espacial:**
   - Cabeçalho flutuante, barra de filtros e *Bottom Sheets* utilizam `backdrop-filter: blur(20px) saturate(180%)` (desativado automaticamente no **Modo Sol Forte** em favor de superfícies 100% sólidas com bordas `2px solid #15301d`).
5. **Tipografia e Espaçamento Generoso:**
   - Família `'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif`.
   - Cantos arredondados consistentes (`rounded-2xl` para cards e inputs, `rounded-3xl` para *Bottom Sheets* e modais).
   - Alvos de toque mínimos de `44px × 44px` para uso confortável com uma mão no celular caminhando pela rua.
6. **Foco Absoluto no Mapa de Caçapava e na Ação Principal:**
   - O mapa ocupa `100dvh × 100dvw` sem poluição visual.
   - O botão flutuante principal **`+ Cobra, Taiada!`** destaca-se em Verde Taiada Vivo (`#347947`) com hover/active em Verde Taiada Profundo (`#15301d`), sombra suave esverdeada e micro-interação tátil.
