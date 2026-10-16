---
name: apple-design
description: Apple's approach to interface design and fluid, physical motion, translated for the web. Use when building or reviewing gesture-driven UI, spring animations, drag/swipe/sheet interactions, momentum and interruptible transitions, translucent materials and depth, typography (optical sizing, tracking, leading), reduced-motion, or the design foundations (feedback, spatial consistency, restraint) behind Apple-style interfaces.
source: https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md
---

# Apple Design (Translated for `taiada-fiscaliza`)

How Apple builds interfaces that stop feeling like a computer and start feeling like an extension of you. Distilled from Apple's WWDC *Designing Fluid Interfaces* (WWDC 2018) and Human Interface Guidelines, translated into the web platform (CSS, Pointer Events, `requestAnimationFrame`, Framer Motion / spring physics) and harmonized with the **Verde Taiada** palette (`#15301d` and `#347947`).

The through-line: **an interface feels alive when motion starts from the current on-screen value, inherits the user's velocity, projects momentum forward, and can be grabbed and reversed at any instant.** Springs are the tool that makes all of this natural, because they are inherently interruptible and velocity-aware.

## 1. Response — Kill Latency
- **Respond on pointer-down, not on release.** Highlight and subtly scale a button the instant it is pressed (`active:scale-[0.97]`, `transition: transform 100ms ease-out`).
- **Zero artificial latency.** Eliminate tap delays (`touch-action: manipulation`) and keep feedback 1:1 during drag gestures.

## 2. Direct Manipulation — 1:1 Tracking
- When dragging the Bottom Sheet or adjusting the map pin, track the pointer 1:1 using `PointerEvents` (`setPointerCapture`) and respect the initial `grabOffset`.
- Maintain a short velocity/position ring buffer (last ~100ms of `pointermove` events) to compute accurate release velocity in `px/s`.

## 3. Interruptibility
- Never lock out user input during an animation.
- Animate from the current presentation value using springs, never fixed-duration uninterruptible keyframes for interactive sheets or cards.

## 4. Behavior Over Animation — Spring Parameters
Use Apple's designer-friendly spring parameters (`damping` ratio + `response` time):
- **Critically damped default (`damping: 1.0`, `response: 0.4` / `bounce: 0, duration: 0.4`):** Used for modals, filter pills, card reveals, and focus shifts. Graceful with zero distracting overshoot.
- **Drawer / Bottom Sheet with momentum (`damping: 0.8`, `response: 0.3` / `bounce: 0.18, duration: 0.35`):** Used when a drag release or flick carries physical velocity.

## 5. Velocity Handoff & Momentum Projection
When a drag gesture on a Bottom Sheet ends, compute the projected resting endpoint using Apple's exponential decay formula:
```ts
export function projectMomentum(initialVelocityPxPerSec: number, decelerationRate = 0.998): number {
  return ((initialVelocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}
```
Snap to the sheet point (`collapsed`, `half`, `expanded`, or `dismissed`) nearest to `currentY + projectMomentum(releaseVelocity)`, and pass `releaseVelocity` directly into the spring transition.

## 6. Spatial Consistency & Translucent Materials
- **Enter and exit along the same path:** Bottom sheets enter from and dismiss to the bottom; popovers scale from their trigger origin (`transform-origin`).
- **Translucent Depth (`backdrop-filter: blur(20px) saturate(180%)`):**
  - Light Surface: `rgba(255, 255, 255, 0.85)` over `#F4F7F5` with subtle border `rgba(21, 48, 29, 0.08)`.
  - Dark Surface: `rgba(21, 48, 29, 0.86)` over `#0B1910` with subtle border `rgba(52, 121, 71, 0.35)`.
  - High-Contrast ("Sol Forte") Surface: Opaque `#FFFFFF` or `#15301d` with `2px solid #15301d` borders and `#347947` action buttons for maximum outdoor sunlight legibility.
- **Typography & Restraint:**
  - Font stack: `'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif`.
  - Tight tracking on display/headings (`tracking-tight`), generous touch targets ($\ge 44\times44\text{ px}$), consistent rounded corners (`rounded-2xl` / `rounded-3xl`), and absolute visual focus on the map of Caçapava and the primary `+ Cobra, Taiada!` call-to-action.
