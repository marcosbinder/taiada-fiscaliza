---
name: mobile-native
description: Make a web app feel native on a phone — CSS and meta-tag rules that separate a website in a browser from an installed mobile app. Covers sticky hover states, tap highlight flashes, 100dvh layout, 16px inputs to prevent auto-zoom, touch-action manipulation, overscroll-behavior, and safe-area-insets.
source: https://github.com/emilkowalski/skills/blob/main/skills/mobile-native/SKILL.md
---

# Mobile-Native Web Rules for `taiada-fiscaliza`

Because `taiada-fiscaliza` is a Mobile-First PWA used by citizens walking through streets and neighborhoods of Caçapava - SP, every view and sheet MUST apply these rules:

1. **Gate Hover Behind Capability Queries (No Sticky Hover on Touch):**
   ```css
   @media (hover: hover) and (pointer: fine) {
     .interactive:hover { ... }
   }
   ```
   Configure Tailwind with `future: { hoverOnlyWhenSupported: true }` so `hover:` classes never stick after a tap on Android/iOS.
2. **Eliminate Gray/Blue Tap Flash:**
   ```css
   html {
     -webkit-tap-highlight-color: transparent;
     overscroll-behavior-y: none;
   }
   ```
3. **Use `100dvh` for the App Shell:**
   Never use `100vh` alone on the map/app container; use `h-[100dvh]` so the floating `+ Cobra, Taiada!` button and collapsed bottom sheet are never hidden behind the mobile browser URL bar.
4. **Prevent iOS Auto-Zoom on Inputs Without Breaking Accessibility:**
   All `<input>`, `<select>`, and `<textarea>` elements MUST have `font-size >= 16px` (`text-base`). Never set `user-scalable=no` or `maximum-scale=1`.
5. **Kill 300ms Tap Delay & Accidental Text Selection on Controls:**
   Interactive buttons, pills, and sheet drag handles must use `touch-action: manipulation` and `select-none` (`user-select: none`).
6. **Respect Notch & Home Indicator (`safe-area-inset`):**
   Use `viewport-fit=cover` in `index.html` and apply `pb-[max(1rem,env(safe-area-inset-bottom))]` on bottom sheets and floating controls, plus `<meta name="theme-color" content="#15301d">`.
