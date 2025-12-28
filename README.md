# Drift Hero

Arcade-style, top-down drifting demo built with Next.js. A canvas renderer, simple drift physics, and a procedural sinewave track combine into a single-page experience with a lightweight HUD and docked YouTube playlist.

**Live demo:** [jean-reinhold.github.io/drift-hero](https://jean-reinhold.github.io/drift-hero/)

![Drift Hero gameplay](docs/gameplay.png)

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

## Implementation Notes

### Procedural Track Generation

The road is a constant-width strip around a **centerline curve** \(x(y)\) generated as a sum of a few sine “bands”:

\[
x(y) = \sum_i A_i \cdot \sin(y \cdot f_i + \phi_i)
\]

Where each band is a `TrackBand` with:
- **`amplitude`**: how far the road can swing left/right
- **`frequency`**: how quickly it oscillates as you move “forward” (along +Y)
- **`phase`**: a seeded random offset so the same seed produces the same track

On each page load, `createTrackConfig(randomSeed())` picks a seed and uses a tiny PRNG (`mulberry32`) to randomize the band phases. The result is **fresh every reload**, but still **deterministic** for a given seed.

**Sampling & geometry**
- **`sampleTrack()`** returns the centerline `centerX` plus a unit **tangent** and **normal** vector at a given Y. Rendering uses the normal to offset left/right borders, keeping the road width consistent even through bends.

**Robust “on track” detection**
- **`isOnTrack()`** intentionally does *not* check `abs(carX - centerX(carY))`. On tight turns that can incorrectly flag you as off-track.
- Instead it does a small **local search** around the car’s Y to approximate the closest point on the centerline, then checks **distance-to-curve** against half the track width. This is more stable on sharp bends and where the strip can visually self-intersect.

### Arcade Drift Physics

Physics is an intentionally lightweight, arcade model implemented in `stepCar()`:

- **Forward/side decomposition**: velocity is split into forward and lateral components using the car’s `heading`.
- **Throttle + braking**: acceleration is applied along the forward axis, with speed clamped to a max (and a smaller reverse max).
- **Drag**: forward speed gets damped each step to keep things controllable across frame rates.
- **Grip as lateral damping**: sideways velocity is reduced over time (a simple “tire grip” approximation).
- **Speed-dependent handling**: grip and steering scale with speed so the car doesn’t feel twitchy at low speed or impossibly snappy at high speed.
- **Handbrake**: switches to a different lateral grip value, letting you intentionally break traction and hold angle.

**Drift scoring**
The engine measures drift as the angle between the velocity vector and the car heading. When you’re on track, moving fast enough, and holding enough angle, it builds combo → multiplier and converts speed × angle into score.

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
- Live URL: [jean-reinhold.github.io/drift-hero](https://jean-reinhold.github.io/drift-hero/)
1. Push to `main`.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The workflow will run automatically on push to `main`.
