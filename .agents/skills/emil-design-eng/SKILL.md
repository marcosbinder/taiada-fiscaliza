---
name: emil-design-eng
description: Emil Kowalski's design engineering philosophy, animation decision framework, custom cubic-bezier curves, GPU composite-only animation performance, and React best practices.
source: https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md
---

# Design Engineering, Animation Performance & React Best Practices (`taiada-fiscaliza`)

Combines `emil-design-eng`, `animate`, `animation-performance` (`emilkowalski/skills`), `react-best-practices` (`vercel-labs/agent-skills`), and `humanizer` for `pt-BR` civic microcopy.

## 1. Custom Easing Curves & Duration Budgets
Never use generic `ease-in` on UI entrances or `transition: all`. Declare and use these exact CSS tokens:
```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}
```
- **Button press (`:active`):** `transform: scale(0.97)` over `120ms var(--ease-out)`.
- **Popovers / Filter pills:** `150ms–200ms var(--ease-out)`, starting from `scale(0.95)` and `opacity: 0` (never `scale(0)`!), with `transform-origin` anchored to the trigger button.
- **Drawers / Bottom Sheets:** `280ms–380ms var(--ease-drawer)` or spring (`damping: 0.8, response: 0.3`).

## 2. 60/120fps Animation Performance on Mobile Hardware
- **Animate Composite-Only Properties:** Restrict animations to `transform` and `opacity`. Never animate `height`, `top`, `bottom`, `margin`, or `padding` during sheet dragging.
- **No React State Re-renders Per Drag Frame:** During `pointermove` on `FluidBottomSheet`, write `translate3d(0, ${y}px, 0)` directly to `sheetRef.current.style.transform` and only commit React state when snapping to a resting point (`collapsed`, `half`, `expanded`).
- **Blur Budget:** Keep `backdrop-filter: blur(20px)` at or below `20px` and disable it automatically in `high-contrast` ("Modo Sol Forte") and `prefers-reduced-motion: reduce`.

## 3. React & Backend Performance Rules (`react-best-practices`)
- **Cheap Sync Checks First:** Validate Caçapava geofencing (`isWithinCacapava`) synchronously before touching SQLite or `sharp`.
- **Direct Imports & Low Bundle Weight:** Avoid barrel imports; respect the **3G/4G Data Saver Mode** (`dataSaverMode`) by rendering a lightweight `"Carregar foto (~90 KB)"` placeholder button instead of auto-fetching images when enabled.

## 4. Natural Civic Copywriting (`humanizer` for `pt-BR`)
- All UI labels, error messages, WhatsApp templates, and Parliamentary Indications (`Ofício Oficial`) must be written in direct, authentic Brazilian Portuguese tailored to Caçapava - SP.
- Avoid robotic AI formulas ("Não é apenas X, mas Y", "Vamos explorar", excesso de travessões ou jargões técnicos para o morador).
