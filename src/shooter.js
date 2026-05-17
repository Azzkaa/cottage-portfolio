// Full-bleed "Carrot Blaster" mini-game (opened by clicking a star).
// A cute rabbit at the bottom slides left/right and fires carrots upward;
// stars drift down from the night sky and POP when a carrot hits them.
// Miss a star (it falls past the bottom) and you lose a life. Start /
// Game-Over screens are drawn on the canvas — same self-contained approach
// as snake.js / darts.js.
//
// Public API:  createShooterGame(rootEl) -> { start(), stop() }
//   rootEl is the #shooter-panel element. start() shows the Start screen
//   and wires input; stop() tears everything down (no leaked RAF/listeners).

export function createShooterGame(rootEl) {
  const canvas = rootEl.querySelector('.shooter-canvas');
  const ctx = canvas.getContext('2d');
  const frame = rootEl.querySelector('.shooter-frame'); // authoritative size

  const LIVES = 3;
  const FIRE_MS = 220;          // min gap between carrots
  const CARROT_V = 560;         // carrot px/sec upward
  const STAR_V0 = 95;           // base star fall px/sec
  const STAR_VMAX = 260;        // capped fall speed
  const SPAWN0 = 1000;          // base ms between star spawns
  const SPAWN_MIN = 380;        // fastest spawn cadence
  const RABBIT_V = 620;         // keyboard move px/sec

  let vw = 600, vh = 400;
  // phase: 'start' | 'play' | 'over'
  let phase = 'start';
  let score = 0, lives = LIVES, best = 0;
  let rabbit = { x: 300, y: 360, w: 54, h: 46 };
  let carrots = [];             // [{x,y}]
  let stars = [];               // [{x,y,r,tw}]
  let pops = [];                // [{x,y,t}]
  let bg = [];                  // faint background star dots
  let keyL = false, keyR = false;
  let lastFire = 0, spawnAcc = 0, lastTs = 0;
  let running = false, raf = 0;

  function reset() {
    score = 0; lives = LIVES;
    carrots = []; stars = []; pops = [];
    rabbit.x = vw / 2;
    spawnAcc = 0; lastFire = 0; lastTs = 0;
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
    rabbit.w = Math.max(32, Math.min(50, vw * 0.058));
    rabbit.h = rabbit.w * 0.84;
    rabbit.y = vh - rabbit.h * 0.7 - 14;
    rabbit.x = Math.max(rabbit.w / 2, Math.min(vw - rabbit.w / 2, rabbit.x));
    // Lazy faint starfield, sized to the board.
    if (!bg.length) {
      for (let i = 0; i < 70; i++) {
        bg.push({ x: Math.random() * vw, y: Math.random() * vh,
                  r: Math.random() * 1.4 + 0.4, p: Math.random() * 6.28 });
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
  function fire(now) {
    if (now - lastFire < FIRE_MS) return;
    lastFire = now;
    carrots.push({ x: rabbit.x, y: rabbit.y - rabbit.h * 0.5 });
  }
  function starSpeed() {
    return Math.min(STAR_VMAX, STAR_V0 + score * 1.4);
  }
  function spawnEvery() {
    return Math.max(SPAWN_MIN, SPAWN0 - score * 6);
  }
  function spawnStar() {
    const r = 16 + Math.random() * 12;
    stars.push({ x: r + Math.random() * (vw - r * 2), y: -r, r,
                 tw: Math.random() * 6.28 });
  }

  // --- Input ---
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') { keyL = true; e.preventDefault(); }
    else if (k === 'arrowright' || k === 'd') { keyR = true; e.preventDefault(); }
    else if (k === ' ' || k === 'enter' || k === 'arrowup' || k === 'w') {
      if (phase !== 'play') begin(); else fire(performance.now());
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') keyL = false;
    else if (k === 'arrowright' || k === 'd') keyR = false;
  }
  function pointerX(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    return Math.max(rabbit.w / 2, Math.min(vw - rabbit.w / 2, cx));
  }
  function onPointerDown(e) {
    if (phase !== 'play') { begin(); return; }
    rabbit.x = pointerX(e);
    fire(performance.now());
  }
  function onPointerMove(e) {
    if (phase !== 'play') return;
    rabbit.x = pointerX(e);   // follow the cursor/finger horizontally
  }

  // --- Simulation ---
  function update(dt) {
    if (keyL) rabbit.x -= RABBIT_V * dt;
    if (keyR) rabbit.x += RABBIT_V * dt;
    rabbit.x = Math.max(rabbit.w / 2, Math.min(vw - rabbit.w / 2, rabbit.x));

    for (let i = carrots.length - 1; i >= 0; i--) {
      carrots[i].y -= CARROT_V * dt;
      if (carrots[i].y < -24) carrots.splice(i, 1);
    }

    const sv = starSpeed();
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i];
      s.y += sv * dt;
      s.tw += dt * 3;
      if (s.y - s.r > vh) {                 // missed → lose a life
        stars.splice(i, 1);
        lives--;
        if (lives <= 0) { best = Math.max(best, score); phase = 'over'; }
      }
    }

    // Carrot ↔ star hits → pop.
    for (let i = carrots.length - 1; i >= 0; i--) {
      const c = carrots[i];
      for (let j = stars.length - 1; j >= 0; j--) {
        const s = stars[j];
        const dx = c.x - s.x, dy = c.y - s.y;
        if (dx * dx + dy * dy < (s.r + 7) * (s.r + 7)) {
          pops.push({ x: s.x, y: s.y, r: s.r, t: performance.now() });
          stars.splice(j, 1);
          carrots.splice(i, 1);
          score += 10;
          break;
        }
      }
    }

    spawnAcc += dt * 1000;
    if (spawnAcc >= spawnEvery()) { spawnAcc = 0; spawnStar(); }
  }

  // --- Rendering ---
  function softStar(x, y, R) {
    const r = R * 0.66;          // fatter inner radius → stubbier points
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 === 0 ? R : r;
      const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function drawStar(s) {
    const pulse = 0.85 + 0.15 * Math.sin(s.tw);
    ctx.save();
    ctx.shadowColor = 'rgba(255, 224, 102, 0.9)';
    ctx.shadowBlur = 18 * pulse;
    ctx.fillStyle = '#ffe066';
    ctx.strokeStyle = '#ffe066';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = s.r * 0.5;          // thick round stroke softens every tip
    // Inset the path so the round stroke restores the original size.
    softStar(s.x, s.y, s.r * pulse * 0.82);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  function drawCarrot(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.shadowColor = 'rgba(255, 140, 66, 0.8)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff8c42';                 // fatter, rounded body
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.quadraticCurveTo(14, -3, 10, 10);
    ctx.quadraticCurveTo(0, 17, -10, 10);
    ctx.quadraticCurveTo(-14, -3, 0, -16);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#7dc85b';                 // leaf
    ctx.beginPath();
    ctx.ellipse(0, 14, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawRabbit() {
    const { x, y, w, h } = rabbit;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = 'rgba(255, 200, 220, 0.55)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#fdf3f6';
    // Ears — a touch shorter & rounder.
    ctx.beginPath();
    ctx.ellipse(-w * 0.17, -h * 0.5, w * 0.13, h * 0.36, -0.12, 0, 6.3);
    ctx.ellipse(w * 0.17, -h * 0.5, w * 0.13, h * 0.36, 0.12, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#ffb4c6';
    ctx.beginPath();
    ctx.ellipse(-w * 0.17, -h * 0.47, w * 0.055, h * 0.22, -0.12, 0, 6.3);
    ctx.ellipse(w * 0.17, -h * 0.47, w * 0.055, h * 0.22, 0.12, 0, 6.3);
    ctx.fill();
    // Big round head/body.
    ctx.fillStyle = '#fdf3f6';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.08, w * 0.46, h * 0.46, 0, 0, 6.3);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Rosy round cheek blush, sitting low & wide like the reference.
    ctx.fillStyle = 'rgba(255, 156, 186, 0.6)';
    ctx.beginPath();
    ctx.arc(-w * 0.27, h * 0.17, w * 0.085, 0, 6.3);
    ctx.arc(w * 0.27, h * 0.17, w * 0.085, 0, 6.3);
    ctx.fill();
    // Big glossy kawaii eyes — tall black ovals, large highlight + a
    // small secondary sparkle, like the reference.
    const ex = w * 0.19, ey = h * 0.0;
    const erx = w * 0.13, ery = w * 0.17;
    ctx.fillStyle = '#241019';
    ctx.beginPath();
    ctx.ellipse(-ex, ey, erx, ery, 0, 0, 6.3);
    ctx.ellipse(ex, ey, erx, ery, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();                                  // big upper highlight
    ctx.arc(-ex - w * 0.04, ey - h * 0.06, w * 0.052, 0, 6.3);
    ctx.arc(ex - w * 0.04, ey - h * 0.06, w * 0.052, 0, 6.3);
    ctx.fill();
    ctx.beginPath();                                  // small lower sparkle
    ctx.arc(-ex + w * 0.05, ey + h * 0.06, w * 0.026, 0, 6.3);
    ctx.arc(ex + w * 0.05, ey + h * 0.06, w * 0.026, 0, 6.3);
    ctx.fill();
    // Tiny coral nose.
    ctx.fillStyle = '#ff9bad';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.12, w * 0.05, w * 0.038, 0, 0, 6.3);
    ctx.fill();
    // Soft brown "‿‿" bunny mouth with a little philtrum.
    ctx.strokeStyle = '#6b4a3a';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.12 + w * 0.038);
    ctx.lineTo(0, h * 0.165);
    ctx.stroke();
    const my = h * 0.165, mr = w * 0.055;
    ctx.beginPath(); ctx.arc(-mr, my, mr, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(mr, my, mr, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }
  function drawPops(now) {
    pops = pops.filter((p) => now - p.t < 460);
    pops.forEach((p) => {
      const k = (now - p.t) / 460;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + k * 26, 0, 6.3);
      ctx.strokeStyle = `rgba(255, 224, 102, ${(1 - k) * 0.8})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + k;
        const d = (p.r + 6) + k * 30;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d,
                2.4 * (1 - k), 0, 6.3);
        ctx.fillStyle = `rgba(255, 240, 170, ${(1 - k) * 0.9})`;
        ctx.fill();
      }
    });
  }
  function drawHud() {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffe45c';
    ctx.font = '700 18px Quicksand, sans-serif';
    ctx.fillText(`Score ${score}`, vw - 18, 16);
    // Lives as little carrots, top-right under the score.
    for (let i = 0; i < lives; i++) {
      const lx = vw - 22 - i * 20, ly = 46;
      ctx.fillStyle = '#ff8c42';
      ctx.beginPath();
      ctx.moveTo(lx, ly - 7); ctx.lineTo(lx + 4, ly + 6);
      ctx.lineTo(lx - 4, ly + 6); ctx.closePath(); ctx.fill();
    }
  }
  function drawOverlay(now) {
    ctx.fillStyle = 'rgba(8, 3, 8, 0.66)';
    ctx.fillRect(0, 0, vw, vh);
    const mx = vw / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.save();
    ctx.shadowColor = 'rgba(255, 180, 90, 0.7)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffd93d';
    ctx.font = '800 44px Quicksand, sans-serif';
    ctx.fillText(phase === 'over' ? 'Game Over' : 'Carrot Blaster',
                 mx, vh * 0.38);
    ctx.restore();
    if (phase === 'over') {
      ctx.fillStyle = '#ffe45c';
      ctx.font = '700 22px Quicksand, sans-serif';
      ctx.fillText(`Score ${score}  ·  Best ${best}`, mx, vh * 0.5);
    } else {
      ctx.fillStyle = 'rgba(255, 241, 220, 0.85)';
      ctx.font = '600 16px Quicksand, sans-serif';
      ctx.fillText('Move with ← → or the mouse · shoot to pop the stars',
                   mx, vh * 0.5);
    }
    const a = 0.55 + 0.45 * Math.sin(now / 380);
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.font = '600 18px Quicksand, sans-serif';
    ctx.fillText(phase === 'over' ? 'Press any key · tap to play again'
                                  : 'Press any key · tap to start',
                 mx, vh * 0.62);
  }
  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, vw, vh);
    // Faint twinkling background.
    bg.forEach((b) => {
      const tw = 0.4 + 0.4 * Math.sin(now / 600 + b.p);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 6.3);
      ctx.fillStyle = `rgba(255, 248, 220, ${tw})`;
      ctx.fill();
    });
    stars.forEach(drawStar);
    carrots.forEach(drawCarrot);
    drawPops(now);
    if (phase === 'play') { drawRabbit(); drawHud(); }
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
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('resize', resize);
    resize();               // sizes canvas + first paint
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', resize);
  }

  return { start, stop };
}
