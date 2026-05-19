<div align="center">

# Azka's Portfolio — a Neon Cottagecore Juice Shop

**A portfolio you can walk around in.**
A stylized juice-carton shop glowing on a cream floor under a wine-purple
night sky — fireflies drifting, stars humming with bloom, and every sign,
sticker and star is something you can click.

[![Three.js](https://img.shields.io/badge/Three.js-r184-000000?logo=three.js&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![JavaScript](https://img.shields.io/badge/Vanilla-JS-F7DF1E?logo=javascript&logoColor=black)](#)
[![WebGL](https://img.shields.io/badge/WebGL-Real--time%203D-990000)](#)

</div>

<div align="center">

<img src="docs/hero.gif" alt="Flythrough of the neon cottagecore juice-shop portfolio" width="820" />

</div>

---

## What it is

I didn't want my portfolio to be a list of links, so I built a tiny world
instead. You press **START**, the camera sweeps in cinematically, and you're
standing in front of a glowing juice-carton shop. A vertical white signpost
holds four colored arrow plaques. Hover one and it lights up. Click one and
the camera *flies*.

> I took my cues from Jesse Zhou's ramen-shop portfolio and the lantern
> scene in *Tangled*. My one rule the whole way through was **soft over
> sharp, warm over harsh**.

<div align="center">

<img src="docs/plaques.gif" alt="Hovering and clicking the colored signpost plaques" width="820" />

</div>

## The four plaques

| Plaque | What happens |
|---|---|
| **PROJECTS** | Camera flies to the white/orange Projects panel — 8 real projects with screenshots, tags and GitHub links |
| **ABOUT ME** | Camera dives to the rear box and opens the dark About Me panel (tabs: About / Quick Facts / Skills / Experience) |
| **ARTICLES** | Opens the external writing collection in a new tab |
| **CREDITS** | Flies up, zooms into a star, and drops you into a full-screen **Snake** game |

## Almost everything is interactive

The plaques are just the start. Wander and you'll find:

- **Clickable floor text** — `> FULL STACK DEVELOPER` and `> RESEARCHER` open
  the résumé; `> CONTACT ME` opens a dark contact panel (Email / GitHub /
  LinkedIn / WhatsApp).
- **The about-label sticker** on the rear box opens the About Me panel.
- **A round medallion** above the hanging menu opens a **Darts** mini-game.
- **Any star** you click launches the **Carrot Blaster** shooter.
- **The ground rabbit** kicks off **Bunny Hop**, a pixel-art endless runner.
- **The bunny inside the shop** zooms the camera in and pops a cute welcome
  speech bubble.
- Stars, the medallion and the rabbit **glow on hover** (with a soft tick),
  the rabbit even spawns a little firefly swarm.

## Mini-games

Four self-contained 2D games, each living in its own module and rendered to
its own `<canvas>`:

| Game | Module | Opened by |
|---|---|---|
| **Star Snake** | `src/snake.js` | CREDITS plaque |
| **Darts** | `src/darts.js` | the round medallion |
| **Carrot Blaster** | `src/shooter.js` | clicking any star |
| **Bunny Hop** | `src/runner.js` | the ground rabbit |

<div align="center">

<img src="docs/minigames.gif" alt="Montage of the four built-in mini-games" width="820" />

</div>

## Built with

- **Vanilla JavaScript** + **Vite** — no framework, no build ceremony
- **Three.js** — `GLTFLoader`, `OrbitControls`, `Raycaster`,
  `EffectComposer` + `UnrealBloomPass`
- A custom **sky-gradient shader** and a **60-point firefly particle system**
- Additive **sprite halos** for the real glow (the global bloom is kept
  deliberately low — texture is already bright)
- A hand-rolled camera tween (`flyCamera` / `flyHome`)
- **HTML overlay panels** layered over the WebGL canvas
- Looping background music + START chime + soft hover / click SFX

## Run it locally

```bash
git clone https://github.com/Azzkaa/cottage-portfolio.git
cd cottage-portfolio
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # production bundle in dist/
npm run preview      # serve the built bundle
```

## Credits

The 3D model is **"Juice Carton Shop"** by **Ergoni** (Sketchfab,
CC&nbsp;Attribution) — art by Stef (@stefscribbles), concept by Cheryl
Doujima (@cysketch), and the ground prop is a CC bunny model. Huge thanks to
them. Everything else — the scene, the interactions, the panels, the
mini-games and the audio — I built myself.

## Contact

Always happy to talk — reach me at **azka.aftab25@gmail.com** or find me on
GitHub at [@Azzkaa](https://github.com/Azzkaa). My LinkedIn and WhatsApp are
in the Contact panel inside the portfolio itself.

<div align="center">

*Built with juice cartons, fireflies, and far too many camera tweens.*

</div>
