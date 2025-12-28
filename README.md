# Drift Hero

Arcade-style, top-down drifting demo built with Next.js. A canvas renderer, simple drift physics, and a procedural sinewave track combine into a single-page experience with a lightweight HUD and docked YouTube playlist.

## Highlights
- Procedural track made from stacked sine waves; fresh layout on each load
- Rear-biased drift physics with handbrake and chaining multiplier
- Canvas 2D renderer with boundaries, centerline, and HUD overlays
- Input handling for keyboard + tap-friendly YouTube playlist embed
- Ready-to-run Next.js App Router setup with TypeScript

## Tech Stack
- Next.js 14 (App Router) + React 18
- TypeScript
- Canvas 2D rendering

## Requirements
- Node.js 18+ (matches Next.js 14 support)
- npm (bundled with Node)

## Getting Started
1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Open `http://localhost:3000` and start drifting

## Available Scripts
- `npm run dev` – start the development server
- `npm run build` – build the production bundle
- `npm start` – run the production server (after `npm run build`)
- `npm run lint` – lint the project with ESLint

## Controls
- Move: WASD or Arrow keys
- Handbrake: Space

## Project Layout
- `app/page.tsx` – entry page wiring the game shell
- `app/GameShell.tsx` – HUD, input handling, and YouTube playlist
- `app/GameCanvas.tsx` – canvas element and engine bootstrap
- `lib/game/engine.ts` – render loop, scoring, and input plumbing
- `lib/game/track.ts` – procedural track sampler
- `lib/game/physics.ts` – drift physics model
- `lib/game/render.ts` – canvas drawing utilities
- `lib/game/config.ts` – track configuration and seeding helpers

## Deployment
Configured for GitHub Pages via Actions:
1. Push to `main`.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The workflow will run automatically on push to `main`.
