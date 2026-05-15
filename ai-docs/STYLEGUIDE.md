# UI Style Guide

A lightweight guide for building consistent UI across the template.

## Design Principles
- Calm dark UI with high-contrast content
- Neutral surfaces with a single friendly brand color
- Minimal chrome; let content shine

## Color System (Tailwind classes)
- Neutral (base): `zinc`
  - Backgrounds: `from-zinc-900 to-zinc-950`, panels: `bg-white/5`, borders: `border-white/10`
  - Text: primary `text-white`, body `text-zinc-300`, muted `text-zinc-400`
- Brand (primary): `emerald`
  - Primary actions: `bg-emerald-500 hover:bg-emerald-400`
  - Emphasis text/accents: `text-emerald-300`
- Accents (sparingly): `sky`, `fuchsia`
  - Hero gradients: `bg-gradient-to-r from-emerald-300 via-sky-300 to-fuchsia-300`
- States
  - Success: `emerald-500`
  - Info: `sky-500`
  - Warning: `amber-500`
  - Danger: `rose-500`

## Surfaces & Elevation
- Panels: `rounded-xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur`
- Cards: reduce blur/shadow on dense pages

## Typography
- Headlines: `font-extrabold tracking-tight`
  - H1: `text-4xl sm:text-5xl`
- Body: `text-zinc-300`
- Small/meta: `text-sm text-zinc-400`
- Code/inline tokens: subtle contrast e.g., `text-emerald-300`

## Layout & Spacing
- Page container: `min-h-screen flex items-center justify-center px-4`
- Content width: `max-w-3xl` (marketing) or `max-w-6xl` (docs)
- Panel padding: `p-6` (smaller on mobile if needed)

## Motion
- Use subtle transitions: `transition hover:*`
- Avoid long/aggressive animations; prefer `hover:bg-*`, `animate-pulse` sparingly

## Components
- Primary Button
  - `inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400`
- Secondary Button
  - `rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 font-semibold text-white transition hover:bg-white/10`
- Badge/Chip
  - `inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300`

## Accessibility
- Maintain sufficient contrast on dark backgrounds
- Ensure focus visibility (default focus rings or `focus-visible` styles)
- Avoid color-only distinctions; pair color with text or icons

## Example Snippets
```tsx
// Primary CTA
<button className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400">
  Get Started
</button>

// Card / Panel
<div className="rounded-xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
  <h3 className="text-zinc-200 font-semibold">Card Title</h3>
  <p className="mt-2 text-zinc-300">Supportive description text.</p>
</div>
```

## Where to Put Shared Styles
- Compose Tailwind classes directly in components
- Extract reused UI into `libs/web-ui`
- If you add custom tokens/utilities, keep them in `libs/shared/styles` and document them here

## Usage Notes
- Keep gradients and bright colors to hero/marketing moments
- Use `zinc` scale for most backgrounds/text; brand colors for actions and highlights
- Be deliberate: fewer, stronger accents > many competing colors
