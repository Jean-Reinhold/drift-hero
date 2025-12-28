# Drift Hero

A dark-themed Next.js template for a 2D top-down drifting game. It includes a
procedural sinewave track generator, a simple drift physics model, and a canvas
render loop with a minimal HUD.

## Features
- Single-page game layout at `/` with a minimal HUD
- Procedural track built from stacked sine waves
- Rear-biased drift physics with handbrake
- Asphalt track rendering with boundaries and centerline
- Small, soft YouTube playlist player

## Quick Start
1. Install dependencies: `npm install`
2. Run the dev server: `npm run dev`
3. Open `http://localhost:3000`

## Controls
- Move: WASD or Arrow keys
- Handbrake: Space

## Project Structure
- `app/page.tsx`: main page (game layout)
- `app/GameShell.tsx`: UI overlays and HUD
- `app/GameCanvas.tsx`: canvas + engine wiring
- `lib/game/engine.ts`: render loop, scoring, input
- `lib/game/track.ts`: procedural track sampling
- `lib/game/physics.ts`: drift physics
- `lib/game/render.ts`: drawing
