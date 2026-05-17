// Full-bleed "Bunny Hop" mini-game (opened by clicking the ground rabbit).
// A Chrome-Dino-style endless runner rendered as crisp PIXEL ART: a small
// side-view chibi bunny bounces across a pastel meadow and HOPS over pixel
// carrots. Hit one and it's game over; survive longer for a higher score,
// and the world speeds up (gently) the further you get. Start / Game-Over
// screens are drawn on the canvas — self-contained like the other modules.
//
// Public API:  createRunnerGame(rootEl) -> { start(), stop() }
//   rootEl is the #runner-panel element. start() shows the Start screen
//   and wires input; stop() tears everything down (no leaked RAF/listeners).

export function createRunnerGame(rootEl) {
  const canvas = rootEl.querySelector('.runner-canvas');
  const ctx = canvas.getContext('2d');
  const frame = rootEl.querySelector('.runner-frame'); // authoritative size

  const GRAVITY = 2600;         // px/sec^2 pulling the bunny down
  const JUMP_V = 880;           // initial upward hop velocity (px/sec)
  const SPEED0 = 300;           // base world scroll speed (px/sec)
  const SPEED_MAX = 540;        // capped scroll speed
  const SPEED_RAMP = 0.55;      // speed gained per score point (gentle ramp)

  // Scene (non-sprite) colours.
  const C = {
    skyTop: '#bfe8ff', skyMid: '#dff3ec', skyLow: '#fdf3d8',
    hillBack: '#cdbbe6', hillFront: '#9fd47e',
    grass: '#8fce75', grassEdge: '#bce89f', grassDk: '#6fb457',
    soil: '#7a5236',
  };

  // --- Pixel sprites (each char = a palette key; '.' = transparent) ---
  // Bunny is a SIDE profile facing right (the running direction): ears up,
  // eye + nose on the right, little tail nub at the back-left, two feet.
  const BUNNY = [
    '.........OO.OO..',
    '........OWOOWO..',
    '........OPOOPO..',
    '.......OWWOOWWO.',
    '........OWWWWWO.',
    '.......OWWWWWWWO',
    '...OWWWWWWWWHEWO',
    '.OWWWWWWWWWWEEWN',
    '.OWWWWWWWWWKWWWO',
    'OWWWWSSWWWWWWWWO',
    '..OWWWWWWWWWWWWO',
    '...OWWWWWWWWWWO.',
    '....OWWO.OWWO...',
    '....OOOO.OOOO...',
  ];
  const BUNNY_PAL = {
    O: '#4a2f2a', W: '#fffdf7', S: '#ead9c2', P: '#ffaec4',
    N: '#e08a86', E: '#3a2a30', H: '#ffffff', K: '#ffb59c',
  };
  const CARROT = [
    '..G..G..',
    '.G.GG.G.',
    '.GGGGGG.',
    '..GGGG..',
    '.OCCCCO.',
    '.OCLCCO.',
    '.OCLCCO.',
    '..OCCO..',
    '..OCCO..',
    '..OCCO..',
    '...OCO..',
    '...OCO..',
    '...OO...',
  ];
  const CARROT_PAL = { G: '#62b048', C: '#ff9c43', L: '#ffd0a3', O: '#4a2f2a' };
  const CLOUD = ['..OOO..', 'OOOOOOO', '.OOOOO.'];
  const CLOUD_PAL = { O: '#ffffff' };
  const SUN = [
    '.OOOOO.', 'OOOOOOO', 'OEOOOEO', 'OOOOOOO',
    'OKOOOKO', 'OOOOOOO', '.OOOOO.',
  ];
  const SUN_PAL = { O: '#ffe27a', E: '#c89a36', K: '#ffb59c' };

  let vw = 600, vh = 400;
  let groundY = 340;            // y of the grass line (set in resize)
  let U = 3;                    // scene pixel unit (smaller = cuter)
  let pxBun = 4, pxSun = 4;     // sprite pixel sizes (set in resize)
  // phase: 'start' | 'play' | 'over'
  let phase = 'start';
  let score = 0, best = 0;
  let traveled = 0;             // total px scrolled (drives score + scenery)
  // Bunny: x is fixed; y is the FEET position (== groundY when grounded).
  let bunny = { x: 90, y: 340, w: 64, h: 56, vy: 0, grounded: true };
  let obstacles = [];           // [{x,w,h}] carrot plants, scrolling left
  let puffs = [];               // [{x,y,t}] soft landing dust
  let sparkles = [];            // [{x,y,vx,vy,t}] cute jump sparkles
  let clouds = [];              // [{x,y,s}] drifting parallax clouds
  let lastTs = 0;
  let running = false, raf = 0;

  function reset() {
    score = 0;
    traveled = 0;
    obstacles = [];
    puffs = [];
    sparkles = [];
    bunny.vy = 0;
    bunny.grounded = true;
    bunny.y = groundY;
    lastTs = 0;
  }

  // Fit the canvas to the FRAME (its clientWidth/Height is the true layout
  // size, unaffected by the open-transition transform). Retry until ready.
  function resize() {
    const w = frame.clientWidth, h = frame.clientHeight;
    if (!w || !h) { requestAnimationFrame(resize); return; }
    vw = w; vh = h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;     // keep pixels crisp
    const groundH = Math.max(38, Math.min(80, vh * 0.15));
    groundY = vh - groundH;
    // One scene unit drives the overall size — kept small so the bunny is a
    // little character in a wide meadow (smaller reads cuter).
    U = Math.max(2, Math.round(Math.min(vw, vh) / 280));
    pxBun = U * 2;
    pxSun = U * 2;
    bunny.w = 16 * pxBun;       // hitbox tracks the drawn sprite
    bunny.h = 14 * pxBun;
    bunny.x = Math.max(60, vw * 0.15);
    if (bunny.grounded) bunny.y = groundY;
    if (!clouds.length) {
      for (let i = 0; i < 5; i++) {
        clouds.push({ x: Math.random() * vw,
                      y: 14 + Math.random() * (vh * 0.38),
                      s: 0.7 + Math.random() * 0.7 });
      }
    }
    draw();
  }

  // --- Helpers ---
  function begin() {
    if (phase === 'play') return;
    reset();
    phase = 'play';
  }
  function speed() {
    return Math.min(SPEED_MAX, SPEED0 + score * SPEED_RAMP);
  }
  function jump() {
    if (phase !== 'play') { begin(); return; }
    if (!bunny.grounded) return;       // single hop only (no air-jump)
    bunny.vy = -JUMP_V;
    bunny.grounded = false;
    for (let i = 0; i < 5; i++) {
      sparkles.push({
        x: bunny.x + (Math.random() - 0.5) * bunny.w * 0.7,
        y: groundY - 6,
        vx: (Math.random() - 0.5) * 80,
        vy: -90 - Math.random() * 90,
        t: performance.now(),
      });
    }
  }
  // Gap to the next plant: scaled so a hop always clears comfortably (the
  // bunny's air-time times current speed), plus a random breather.
  function spawnGap() {
    const airTime = (2 * JUMP_V) / GRAVITY;            // seconds aloft
    const reach = speed() * airTime;                   // px covered mid-hop
    return reach * 0.55 + 150 + Math.random() * 190;
  }
  function spawnObstacle() {
    const h = bunny.h * (0.55 + Math.random() * 0.40); // scales with scene
    const w = bunny.w * (0.50 + Math.random() * 0.22);
    obstacles.push({ x: vw + 30, w, h });
  }

  // --- Input ---
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'arrowup' || k === 'w' || k === 'enter') {
      jump();
      e.preventDefault();
    }
  }
  function onPointerDown(e) {
    jump();
    e.preventDefault();
  }

  // --- Simulation ---
  function update(dt) {
    const sp = speed();
    traveled += sp * dt;
    score = Math.floor(traveled / 22);

    if (!bunny.grounded) {
      bunny.vy += GRAVITY * dt;
      bunny.y += bunny.vy * dt;
      if (bunny.y >= groundY) {        // landed
        bunny.y = groundY;
        bunny.vy = 0;
        bunny.grounded = true;
        puffs.push({ x: bunny.x - bunny.w * 0.16, y: groundY,
                     t: performance.now() });
      }
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= sp * dt;
      if (obstacles[i].x + obstacles[i].w < -20) obstacles.splice(i, 1);
    }
    const last = obstacles[obstacles.length - 1];
    if (!last || last.x < vw - spawnGap()) spawnObstacle();

    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 220 * dt;
      if (performance.now() - s.t > 520) sparkles.splice(i, 1);
    }

    // Collision: forgiving AABB (bunny hitbox inset; leaves are soft).
    const bx0 = bunny.x - bunny.w * 0.28;
    const bx1 = bunny.x + bunny.w * 0.28;
    const by0 = bunny.y - bunny.h * 0.78;
    const by1 = bunny.y - bunny.h * 0.06;
    for (const o of obstacles) {
      const ox0 = o.x + 4, ox1 = o.x + o.w - 4;
      const oy0 = groundY - o.h * 0.78;
      if (bx1 > ox0 && bx0 < ox1 && by1 > oy0 && by0 < groundY) {
        best = Math.max(best, score);
        phase = 'over';
        for (let i = 0; i < 6; i++) {
          puffs.push({ x: bunny.x + (Math.random() - 0.5) * bunny.w,
                       y: groundY - Math.random() * 16, t: performance.now() });
        }
        break;
      }
    }
  }

  // --- Pixel rendering ---
  function drawSprite(g, pal, dx, dy, px) {
    dx = Math.round(dx); dy = Math.round(dy);
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      for (let c = 0; c < row.length; c++) {
        const col = pal[row[c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(dx + c * px, dy + r * px, px, px);
      }
    }
  }
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, groundY + 20);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(0.55, C.skyMid);
    g.addColorStop(1, C.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
  }
  function drawSun() {
    drawSprite(SUN, SUN_PAL, vw * 0.84, vh * 0.10, pxSun);
  }
  function drawClouds() {
    clouds.forEach((c) => {
      c.x -= (8 + c.s * 6) * 0.016;        // slow, speed-independent drift
      if (c.x < -60) { c.x = vw + 50; c.y = 14 + Math.random() * (vh * 0.38); }
      const px = Math.max(2, Math.round(U * 1.2 * c.s));
      drawSprite(CLOUD, CLOUD_PAL, c.x, c.y, px);
    });
  }
  function drawHills() {
    const b = U * 2;
    ctx.fillStyle = C.hillBack;
    for (let x = 0; x < vw; x += b) {
      let t = groundY - U * 3 - Math.sin((x + traveled * 0.10) / 120) * (U * 5);
      t = Math.floor(t / b) * b;
      ctx.fillRect(x, t, b, vh - t);
    }
    ctx.fillStyle = C.hillFront;
    for (let x = 0; x < vw; x += b) {
      let t = groundY + U - Math.sin((x + traveled * 0.22) / 90) * (U * 7);
      t = Math.floor(t / b) * b;
      ctx.fillRect(x, t, b, vh - t);
    }
  }
  function drawGround() {
    const b = Math.max(2, U);
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, groundY, vw, vh - groundY);
    ctx.fillStyle = C.grassEdge;
    ctx.fillRect(0, groundY, vw, b);                  // bright top edge
    ctx.fillStyle = C.soil;
    ctx.fillRect(0, vh - b * 2, vw, b * 2);           // dirt strip
    const step = b * 14;
    const off = Math.floor(traveled) % step;
    for (let i = -1, x = -off; x < vw + step; x += step, i++) {
      const fx = Math.floor(x);
      ctx.fillStyle = C.grassDk;
      ctx.fillRect(fx, groundY + b * 3, b, b);
      ctx.fillRect(fx + b, groundY + b * 2, b, b);
      if (((Math.floor(traveled / step) + i) % 3) === 0) {
        ctx.fillStyle = '#ff9ec4';                    // little flower
        ctx.fillRect(fx + b * 5, groundY + b * 3, b, b);
        ctx.fillStyle = '#ffd95e';
        ctx.fillRect(fx + b * 5, groundY + b * 2, b, b);
      }
    }
  }
  function drawCarrotPlant(o) {
    const px = Math.max(2, Math.round(o.h / 13));
    const dx = o.x + o.w / 2 - 4 * px;
    const dy = groundY - 13 * px;
    drawSprite(CARROT, CARROT_PAL, dx, dy, px);
  }
  function drawBunny() {
    const px = pxBun;
    const sw = 16 * px, sh = 14 * px;
    // Flat pixel ground shadow — shrinks/fades as the bunny rises.
    const lift = Math.max(0, groundY - bunny.y);
    const a = Math.max(0.06, 0.22 - lift / 600);
    const shw = Math.max(px * 2, sw * 0.5 - lift * 0.18);
    ctx.fillStyle = `rgba(120, 95, 140, ${a})`;
    ctx.fillRect(Math.round(bunny.x - shw / 2), groundY + 2,
                 Math.round(shw), Math.max(2, px));
    drawSprite(BUNNY, BUNNY_PAL, bunny.x - sw / 2, bunny.y - sh, px);
  }
  function drawPuffs(now) {
    puffs = puffs.filter((d) => now - d.t < 360);
    puffs.forEach((d) => {
      const k = (now - d.t) / 360;
      const s = U + k * (U * 3);
      ctx.fillStyle = `rgba(255, 255, 255, ${(1 - k) * 0.6})`;
      ctx.fillRect(Math.round(d.x - s / 2), Math.round(d.y - k * 10 - s / 2),
                   Math.round(s), Math.round(s));
    });
  }
  function drawSparkles(now) {
    sparkles.forEach((s) => {
      const k = (now - s.t) / 520;
      const sz = Math.max(2, U * 1.6 * (1 - k));
      ctx.fillStyle = `rgba(255, 246, 196, ${(1 - k) * 0.95})`;
      ctx.fillRect(Math.round(s.x - sz / 2), Math.round(s.y - sz / 2),
                   Math.round(sz), Math.round(sz));
    });
  }
  function drawHud() {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = '800 19px Quicksand, sans-serif';
    ctx.fillStyle = '#5a3a30';
    ctx.fillText(`Score ${score}`, vw - 18, 16);
    if (best > 0) {
      ctx.font = '700 14px Quicksand, sans-serif';
      ctx.fillStyle = 'rgba(90, 58, 48, 0.7)';
      ctx.fillText(`Best ${best}`, vw - 18, 41);
    }
  }
  function drawOverlay(now) {
    ctx.fillStyle = 'rgba(255, 250, 240, 0.42)';
    ctx.fillRect(0, 0, vw, vh);
    const mx = vw / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ff8fb4';
    ctx.font = '800 46px Quicksand, sans-serif';
    ctx.fillText(phase === 'over' ? 'Oopsie!' : 'Bunny Hop', mx, vh * 0.38);
    ctx.restore();
    ctx.fillStyle = '#5a3a30';
    if (phase === 'over') {
      ctx.font = '800 23px Quicksand, sans-serif';
      ctx.fillText(`Score ${score}  ·  Best ${best}`, mx, vh * 0.5);
    } else {
      ctx.font = '700 16px Quicksand, sans-serif';
      ctx.fillText('Hop the carrots — don’t trip!', mx, vh * 0.5);
    }
    const a = 0.55 + 0.45 * Math.sin(now / 380);
    ctx.fillStyle = `rgba(90, 58, 48, ${a})`;
    ctx.font = '700 18px Quicksand, sans-serif';
    ctx.fillText(phase === 'over' ? 'Press Space · tap to play again'
                                  : 'Press Space · tap to start',
                 mx, vh * 0.62);
  }
  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, vw, vh);
    drawSky();
    drawSun();
    drawClouds();
    drawHills();
    drawGround();
    obstacles.forEach(drawCarrotPlant);
    drawPuffs(now);
    drawBunny();
    drawSparkles(now);
    if (phase === 'play') drawHud();
    else drawOverlay(now);
  }

  // --- Loop: delta-time animation ---
  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (phase === 'play') update(dt);
    draw();
  }

  // --- Lifecycle ---
  function start() {
    stop();                 // idempotent
    running = true;
    phase = 'start';
    reset();
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', resize);
    resize();               // sizes canvas + first paint
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('resize', resize);
  }

  return { start, stop };
}
