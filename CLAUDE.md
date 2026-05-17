---
name: project-overview
description: High-level project definition and scope for the 3D portfolio website
metadata:
  type: reference
---

# Project Overview

## Goal

An interactive 3D scene that serves as a portfolio website for **Azka Aftab**.
A stylized juice-carton shop sits on a cream ground in a magical
neon-cottagecore night. A first load shows an **intro/START screen**; pressing
START sweeps the camera in cinematically to the opening pose.

A vertical white "straw" signpost holds 4 colored arrow plaques. Hovering a
plaque highlights it; clicking one:

- **PROJECTS** → camera fly + the white/orange Projects panel
- **ABOUT ME** → camera fly + dive to the rear box, opens the dark About Me panel
- **ARTICLES** → opens an external Google Drive link in a new tab
- **CREDITS** → flies up + zooms into a star, opens the full-bleed **Snake** game

Beyond the plaques, much of the scene is now interactive:

- **Floor text** is 3 individually-clickable lines: `> FULL STACK DEVELOPER`
  and `> RESEARCHER` open the résumé PDF in a new tab; `> CONTACT ME` opens a
  dark **Contact** panel (Email / GitHub / LinkedIn / WhatsApp).
- The **about-label sticker** on the rear box opens the About Me panel (same
  camera flow as the ABOUT ME plaque — shared `_flyToAbout()`).
- The **round medallion** above the hanging menu opens a **Darts** mini-game.
- Clicking **any star** opens the **Carrot Blaster** mini-game.
- Clicking the **ground rabbit** opens the **Bunny Hop** pixel-art endless
  runner.
- Stars, the dart medallion, and the ground rabbit **glow on hover** (plus a
  soft hover tick sound); the rabbit also has a resting glow and spawns a
  **firefly swarm** on hover.
- A soft **click sound** plays on every actionable DOM button/link and 3D
  scene action (the START button keeps its own chime).

## Tech Stack

- **Vanilla JavaScript** + **Vite** (dev server & bundler)
- **Three.js**
  - `GLTFLoader` (shop + rabbit prop), `OrbitControls`, `Raycaster`
  - `EffectComposer` + `UnrealBloomPass` (subtle bloom)
  - Custom `ShaderMaterial` (sky gradient + 60-point firefly system)
  - `CanvasTexture` (floor name, plaque labels, About sticker, per-line floor
    meshes, glow/firefly sprite textures)
  - Additive `Sprite` halos for star / dart-medallion / rabbit-firefly glow
  - Custom camera tween `flyCamera(toPos,toTarget,durMs,onDone)`; `flyHome()`
- **HTML overlay panels** (DOM over the canvas) in `src/style.css`, "Quicksand"
- **Mini-game modules** (self-contained 2D `<canvas>`, `createX(rootEl) -> { start, stop }`):
  - `src/snake.js` — Star Snake (Credits panel)
  - `src/darts.js` — Darts (opened by the round medallion)
  - `src/shooter.js` — Carrot Blaster (opened by clicking any star)
  - `src/runner.js` — Bunny Hop (pixel-art runner, opened by the ground rabbit)
- **Audio** (`HTMLAudioElement`, wired in `main.js`): looping background music
  (`/backgr0und.mpeg`, vol 0.06, starts 1s after START), START chime
  (`/start.mpeg`), soft hover tick (`/butt0n_1.mpeg`, vol 0.03, 80ms throttle),
  generic click (`/CIick.mpeg`, vol 0.4, 60ms dedupe) on every DOM button/link
  + 3D action. Files are `.mpeg`; if one is silent the dev server's MIME is the
  cause → rename to `.mp3` and update the path.

## Aesthetic

Neon cottagecore at night. Inspired by Jesse Zhou's ramen-shop portfolio +
_Tangled_'s lantern scene. Soft / rounded / warm over sharp / harsh.

- Stylized juice carton model (KHR_materials_unlit, painted illustration)
- Deep wine-purple gradient sky (#1A0612 → #3D1A2E)
- Cream ground plane picking up pink/cyan/magenta point lights
- Glowing yellow stars (emissive + bloom), hover halo
- 60 firefly particles (sine bob + flicker); extra hover swarm around the rabbit
- Subtle bloom (low strength, threshold 0.95) — texture is already bright; real
  "glow" comes from **additive sprite halos**, not just emissive bumps
- Floor name text back-left: `AZKA AFTAB / > FULL STACK DEVELOPER /
  > RESEARCHER / > CONTACT ME`, yellow with glow
- Intro: near-black overlay, bobbing juice-carton icon, "Pouring your juice…
  NN%", then a pulsing **START** (hover → gold + pink glow)

## Model

- File: `public/models/cottage.glb` (a juice carton shop, kept as "cottage")
- Source: Sketchfab — "Juice Carton Shop" by **Ergoni**, **CC Attribution**,
  KHR_materials_unlit. Art by Stef (@stefscribbles), concept by Cheryl Doujima
  (@cysketch). 97.7k tris / 50.5k verts.
- Material names: `Tex_1`, `Tex_2`, `OutLine`, `Leafs_Alfa`
- Star meshes: `Star001_Tex_2_0` … (+ `_OutLine`) — matched by
  `name.startsWith('Star')`, converted to emissive MeshStandardMaterial on load,
  grouped by `Star00N` for the per-star hover halo
- **The round medallion is NOT its own mesh** — it is baked into the big merged
  `Juice_Box_Tex_1_0` (material `Tex_1`). It can't be picked by name, so an
  invisible sphere proxy (`window.dartTarget`, baked `DART_TARGET`) sits over it
  for click + a visible additive halo (`window.dartGlow`)
- Ground prop: `public/models/cute_rabbit.glb` — bunny + carrot, auto-scaled to
  ~0.45u, seated on the ground above the floor text. Exposed as `window.rabbit`
  (position still a tuned starting guess — adjust in console, then bake). Its
  materials are cloned on load so hover effects don't leak

## Mini-games

| Game | Module | Opened by | Panel |
|---|---|---|---|
| Star Snake | `src/snake.js` | CREDITS plaque (fly into a star) | `#credits-panel.panel--game` |
| Darts | `src/darts.js` | round medallion (`dartTarget`) | `#darts-panel.panel--game` |
| Carrot Blaster | `src/shooter.js` | clicking **any star** | `#shooter-panel.panel--game` |
| Bunny Hop | `src/runner.js` | clicking the **ground rabbit** | `#runner-panel.panel--game` |

- All three follow the same pattern: full-bleed `.X-frame`/`.X-canvas`,
  Start/Game-Over drawn on the canvas, Quicksand font, dpr-aware resize from the
  frame's `clientWidth/Height`, idempotent `start()`/`stop()`.
- **Snake**: glowing snake eats soft stars; `TICK_MS = 150` (slowed); eating
  `CREDITS_AT = 2` opens the terminal in-canvas Credits screen (`drawCredits`).
- **Darts**: two-step timing throw (lock sweeping X line, then Y), 6 darts,
  ring scoring (bull 50); `SWEEP_MS = 1900` (slowed). `window.openDartsPanel()`.
- **Carrot Blaster**: kawaii rabbit slides (←→ / A D / mouse), fires carrots
  (space / tap / click) at falling stars that pop; 3 lives; soft rounded star,
  cute bunny face, fat carrot. `window.openShooterPanel()`.
- **Bunny Hop**: Chrome-Dino-style **pixel-art** runner — a static side-view
  bunny sprite hops carrot plants over a sunny pastel meadow; space/tap to
  hop, gentle speed ramp (`SPEED_RAMP = 0.55`). Hand-authored sprite grids +
  palettes at the top of the file; one `U` unit scales the whole scene
  (smaller = cuter). `window.openRunnerPanel()`.

## Panels & Content

Panel content is now **real** (the old `<!-- EDIT THESE -->` placeholders are
gone):

- **About Me** (`#about-panel`, dark theme): tabs **About Me / Quick Facts /
  Skills / Experience**. Round portrait `public/azka.jpg` (gold rim, pink glow)
  in the About Me tab. Quick Facts + Experience + Skills hold real data.
  ⚠️ The About Me bio still says *"Currently wrapping up at Universiti Teknologi
  Malaysia"* — **stale**, awaiting replacement wording from the author.
- **Projects** (`#projects-panel`, white/orange): 8 real projects, each with a
  screenshot (`.proj-shot`), tags, and a "View on GitHub" pill (`.proj-link`).
  The pill hrefs are a **disclosed placeholder** → `https://github.com/Azzkaa`
  (per-repo URLs still pending from the author).
- **Articles**: external Google Drive link, new tab (`noopener,noreferrer`).
- **Contact** (`#contact-panel`, dark, **no camera move**): opened by the
  `> CONTACT ME` floor line. Buttons: Email `mailto:azka.aftab25@gmail.com`,
  GitHub `github.com/Azzkaa`, LinkedIn (full profile URL), WhatsApp
  `wa.me/60176491858`. Styling `.contact-links` / `.contact-btn`.
- **Résumé**: `public/Azka_Resume_18_1.pdf`, opened via the two résumé floor
  lines (`/Azka_Resume_18_1.pdf`, new tab).
- Cute white CSS mascots peek on the About/Projects/Contact panels.
- All `.panel` hidden pre-`style.css` via the critical inline `<style>` (no
  flash); focus dropped before `aria-hidden` on close (a11y).

## Intro / camera

- `#intro` overlay (critical inline CSS so it's opaque from first paint).
  Climbing fake `%` (real Content-Length not guaranteed); the model success
  callback calls `_introReady()` (it repurposed the old dead `#loader` stub) →
  swaps loader for **START**.
- Controls are **locked** (`controls.enabled = false`, no auto-rotate) until
  START. START plays the chime, fades the overlay, jumps the camera to
  `_introStartPos` (`modelCenter + (-camDistance*1.4, +0.95, -1.15)`), then
  `flyCamera` to the opening pose over 2600ms; the looping bgm starts 1s
  later; `_beginAfterIntro()` re-enables controls and starts auto-rotate 4s
  later (the old idle behaviour, deferred until after the intro).
- **Zoom-out is capped**: `controls.maxDistance` = opening orbit radius ×1.18
  so the 40×40 ground's edge can't be reached by free orbiting (scripted
  camera flies skip `controls.update()`, so they're unaffected).

## Glow / hover effects

- **Stars**: per-star additive halo `Sprite` (`window.starGlows` Map), shown
  only on the hovered star. Tuned via `window.STAR_GLOW`
  (`{color:'#FFE066', scale:1.2 /* baked */, opacity:0.95}`).
- **Dart medallion**: always-on soft additive halo (`window.dartGlow`),
  brighter on hover. Tuned via `window.DART_GLOW`
  (`{color:'#FFD93D', scale:3.4, rest:0.4, hover:0.95}`).
- **Ground rabbit**: cloned materials; resting glow + hover brighten via
  `window.RABBIT_HOVER` (`{color:'#FFE9B0', intensity:0.9, lighten:0.4,
  rest:0.35}`); plus a 12-mote firefly swarm that fades in on hover
  (centered on the rabbit's bbox so it wraps the body, animated in `animate()`).

## Console-Exposed Globals (live-tune then bake)

`signpostGroup`, `signMeshes`, `controls`, `camera`, `ground`, `scene`,
`nameText`, `rabbit`, `aboutLabel`, `HOVER_COLOR`, `aboutCamPos`,
`aboutCamTarget`, `aboutDiveLerp`, `projectsCamPos`, `projectsCamTarget`,
`creditsCamPos`, `creditsCamTarget`, `flyHome()`, `floorLines[]`, `dartTarget`,
`dartGlow`, `starGlows`, `STAR_GLOW`, `DART_GLOW`, `RABBIT_HOVER`,
`openDartsPanel()`, `openShooterPanel()`, `openRunnerPanel()`

> **Still starting guesses — not yet baked:** `floorLines[i].position` (the 3
> clickable floor lines), `dartTarget.position`/`.scale` (medallion hotspot;
> move `dartGlow` to match or re-bake together), the intro pose/duration, and
> `creditsCamPos`/`creditsCamTarget`. `STAR_GLOW.scale` is baked to `1.2`.

Workflow: tune in the browser console, then ask the assistant to hardcode the
readback as plain absolute literals.

## Assets added

`public/azka.jpg` (portrait), `public/Azka_Resume_18_1.pdf` (résumé),
`public/{SKSU,backend,fyp22,hands,n8n,penguins,sp,vue-taskmanager}.png`
(project screenshots), and audio
`public/{backgr0und,start,butt0n_1,CIick}.mpeg` (bgm / START chime / hover
tick / click — note the leetspeak filenames, referenced verbatim in code).
`public/favicon.svg` is now a soft pastel bunny; the tab title is
**"Azka's Portfolio"**. The original `WhatsApp Image ….jpg` is left untracked
(redundant — `azka.jpg` is the used copy).

## Git Branches

- `main`: active development (remote `origin` =
  `github.com/Azzkaa/cottage-portfolio`)
- `cake-experiment`: snapshot of the earlier Strawberry Cake Bakery attempt
- `.claude/` (agent worktrees/session data) is git-ignored — never commit it

## Scope (v1) – Out of Scope

- Custom Blender modeling, `.ktx2` compression, complex new shaders
- Audio is now **in** (bgm + START / hover / click sfx). A user-facing
  **mute toggle** is still out of scope / future polish.

## Working Principles

1. **One change at a time.** Verify in the browser before the next change.
2. **Commit often.** After every working state.
3. **Verify edits.** Read back / `node --check` / cross-file grep for
   multi-file features.
4. **Atomic prompts.** Prefer one-file, one-task changes.
5. **Stylized > photoreal.** Avoid aggressive material overrides; enhance with
   lighting + post-processing. Real glow = additive sprite halos (the global
   bloom is intentionally low), not just emissive bumps.
6. **Expose to console for live tuning, then bake** absolute literals.
7. **JS temporal dead zone gotcha.** Declare module vars before async callbacks
   assign them.
8. **Bake absolute world coords, not `modelSize` coefficients.**
9. **Self-contained DOM games/widgets get their own module.** Size canvases
   from a stable parent (`.X-frame`), never the full-screen `#*-panel` root.
10. **Un-pickable merged geometry → invisible proxy mesh.** When a thing isn't
    its own mesh (e.g. the medallion in `Juice_Box_Tex_1_0`), drop an invisible
    raycast proxy at baked coords instead of name-matching.
11. **Clone glTF prop materials before per-object hover effects** so changes
    can't leak into shared materials; restore from stored base on mouse-out.
12. **Extract shared flows** (e.g. `_flyToAbout()` used by both the plaque and
    the about-label sticker) rather than duplicating camera logic.
