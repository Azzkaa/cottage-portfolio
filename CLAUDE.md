---
name: project-overview
description: High-level project definition and scope for cottage-core 3D portfolio website
metadata:
  type: reference
---

# Project Overview

## Goal
Create an interactive 3D cottage scene that serves as a portfolio website. The scene should feature clickable signs that open content panels displaying the author's projects, bio, experience, and contact information.

## Tech Stack
- **Vanilla JavaScript**
- **Vite** (dev server & bundler)
- **Three.js**
  - `GLTFLoader` for loading the cottage model
  - `OrbitControls` for user navigation
  - `Raycaster` for detecting clicks on signs

## Aesthetic
A cottage‑core / Tangled inspired visual style:
- Wooden cottage with warm lanterns
- Wisteria vines, fireflies, and a lavender/sage/warm‑pink color palette
- Soft, warm lighting to evoke a cozy, story‑book feel

## Scope (v1) – In Scope
- One pre‑downloaded cottage GLTF model
- Camera orbit controls for navigation
- Four clickable signs that open HTML panels:
  - **Projects**
  - **About**
  - **Experience**
  - **Contact**
- Warm lighting setup (ambient + point/spot lights)
- Responsive layout for desktop and mobile browsers
- Deployment ready build (Vite preview/production)

## Scope (v1) – Out of Scope
- Custom Blender modeling (the cottage model is pre‑made)
- `.ktx2` texture compression
- Custom shader development

## Content Source
Existing portfolio content will be reused from the previous site:
`https://azka-aftab-25.vercel.app`
- Bio, project descriptions, experience details, and contact info will be copied into the respective 3D panels.

## Working Principle
- Make changes one at a time.
- After each change, open the browser to verify the behavior before proceeding to the next task.
- Audio is added in Day 5 (polish), not earlier. Don't add audio until visuals and interactions are working.

## Audio (v1, minimal)
- Ambient loop: low-volume forest/wind background, plays after user interaction (browsers require this)
- Click sound: short soft tap when a clickable sign is selected
- Panel open sound: gentle chime when a content panel opens
- All audio uses Web Audio API via Three.js AudioListener and Audio classes
- Audio files: short .mp3 or .ogg, sourced CC0 from freesound.org or similar, kept under 200KB each
- Mute toggle visible in the UI corner

---
