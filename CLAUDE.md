---
name: project-overview
description: High-level project definition and scope for the 3D portfolio website
metadata:
  type: reference
---

# Project Overview

## Goal

An interactive 3D scene that serves as a portfolio website. A stylized juice-carton shop sits on a cream-colored ground in a magical neon-cottagecore night atmosphere. A vertical white "straw" signpost with 4 colored arrow plaques (Projects, About, Experience, Contact) stands beside the carton — clickable plaques open HTML overlay panels with portfolio content. Author: Azka Aftab.

## Tech Stack

- **Vanilla JavaScript**
- **Vite** (dev server & bundler)
- **Three.js**
  - `GLTFLoader` for loading the model
  - `OrbitControls` for camera navigation
  - `Raycaster` for detecting clicks on signs (planned)
  - `EffectComposer` + `UnrealBloomPass` for glow
  - Custom `ShaderMaterial` (sky gradient + firefly particles)
  - `CanvasTexture` for the floor name text

## Aesthetic

Neon cottagecore at night. Inspired by Jesse Zhou's ramen-shop portfolio + the visual vibe of _Tangled_'s lantern scene. Key elements:

- Stylized juice carton model at center (KHR_materials_unlit, painted illustration style)
- Deep wine-purple gradient sky (#1A0612 → #3D1A2E)
- Cream/beige ground plane that picks up the colored point lights (pink, cyan, magenta wash)
- Glowing yellow stars around the carton (emissive + bloom)
- 60 firefly particles drifting with sine-wave bobbing + flicker
- 3 colored point lights cast soft shadows
- Subtle bloom (strength ~0.03, threshold 0.95) — the painted texture is already bright
- White vertical "straw" signpost with arrow plaques in carton-palette colors (yellow, white, orange, green)
- Floor name text in the back-left corner: "AZKA AFTAB / > FULL STACK DEVELOPER / > RESEARCHER", yellow with glow

## Model

- File: `public/models/cottage.glb` (a juice carton shop, kept as "cottage" in code for consistency)
- Source: FAB.com, artist Ergoninane, free, KHR_materials_unlit
- 293k triangles
- Material names: `Tex_1`, `Tex_2`, `OutLine`, `Leafs_Alfa`
- Star meshes: `Star001_Tex_2_0`, `Star002_Tex_2_0`, `Star003_Tex_2_0` (+ `_OutLine` variants) — converted to MeshStandardMaterial with emissive yellow on load

## Scope (v1) – In Scope

- Single .glb model loaded with auto-fit camera
- Initial camera locked to front-3/4 view, slightly above; auto-rotate kicks in after 4 seconds
- OrbitControls with damping
- 4 clickable arrow plaques on a vertical straw signpost beside the carton
- Each plaque opens an HTML overlay panel: **Projects**, **About**, **Experience**, **Contact**
- Neon lighting + bloom post-processing
- Firefly particle system
- Sky gradient background
- Cream ground plane with colored light spill
- Shadows on ground from carton + signpost
- Floor name text in corner
- Responsive layout (desktop + mobile)
- Deployed (Vercel, Netlify, or GitHub Pages)

## Scope (v1) – Out of Scope

- Custom Blender modeling
- `.ktx2` texture compression
- Custom complex shaders beyond what we already have (sky, fireflies)

## Audio (v1, minimal — added in Day 5+ polish, NOT before)

- Ambient loop: low-volume forest/wind background, plays after user interaction
- Click sound: short soft tap when a clickable sign is selected
- Panel open sound: gentle chime when a content panel opens
- All audio via Three.js AudioListener and Audio classes
- Audio files: short .mp3 or .ogg, CC0 from freesound.org, < 200KB each
- Mute toggle in UI corner

## Content Source

Reuse from existing portfolio at `https://azka-aftab-25.vercel.app`:

- Bio + photo (About panel)
- 3 projects: Email AI Auto-Reply, Student Portal SKSU, Fault Detection for Substations (Projects panel)
- Education + work history (Experience panel)
- Email, GitHub, LinkedIn, resume link (Contact panel)

## Git Branches

- `main`: active development
- `cake-experiment`: snapshot of an earlier attempt with a Strawberry Cake Bakery model. Recoverable via `git checkout cake-experiment`.

## Console-Exposed Globals (for live tweaking in DevTools)

The following are exposed to `window` for live position/scale/rotation experimentation:
`signpostGroup`, `signMeshes`, `controls`, `camera`, `ground`, `scene`, `nameText`

Workflow: type commands in browser console (e.g. `signpostGroup.position.x = -0.5`), see changes live, then ask the assistant to hardcode final values.

## Working Principles

1. **One change at a time.** Verify in the browser before the next change.
2. **Commit often.** After every working state. The cake-experiment branch saved 6 hours of work.
3. **Verify edits.** When making file changes, read the file back to confirm the edit took effect. Don't trust that an edit succeeded without reading.
4. **Atomic prompts.** Long multi-step prompts have a higher failure rate. Prefer one-file, one-task prompts.
5. **Stylized > photoreal.** The juice carton's painted illustration look is the strength. Avoid aggressive material overrides; enhance with lighting + post-processing instead.
6. **Expose to console for live tuning.** When positioning a new 3D object, expose it to window so you can adjust in DevTools, then bake final values into code.
7. **JavaScript temporal dead zone gotcha.** `let`/`const` variables exist before their declaration line but throw ReferenceError if used. Declare arrays before using them in callbacks.
