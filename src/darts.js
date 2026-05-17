// Full-bleed Darts mini-game (opened by the round medallion above the menu).
// Skill-based two-step "timing" throw — no dragging:
//   1. a vertical line sweeps left↔right; press to lock the X aim
//   2. a horizontal line sweeps up↕down; press to lock the Y aim → dart lands
// Closer to the bull = more points. You get a fixed number of darts.
// Start / Game-Over screens are drawn on the canvas (no DOM chrome) so the
// container *is* the game — same approach as snake.js.
//
// Public API:  createDartsGame(rootEl) -> { start(), stop() }
//   rootEl is the #darts-panel element. start() shows the Start screen and
//   wires input; stop() tears everything down (no leaked RAF/listeners).

export function createDartsGame(rootEl) {
  const canvas = rootEl.querySelector('.darts-canvas');
  const ctx = canvas.getContext('2d');
  const frame = rootEl.querySelector('.darts-frame'); // authoritative size
  const backBtn = rootEl.querySelector('.panel-back');

  const THROWS = 6;          // darts per game
  const SWEEP_MS = 1900;     // one full sweep cycle (lower = harder)
  // Rings as a fraction of the board radius (outer→inner) + point values.
  // A throw scores the first (smallest) ring it falls inside.
  const RINGS = [
    { r: 1.00, pts: 5,  fill: '#7a2f1c' },
    { r: 0.80, pts: 10, fill: '#c75a26' },
    { r: 0.60, pts: 15, fill: '#e8954a' },
    { r: 0.40, pts: 25, fill: '#f3d29a' },
    { r: 0.18, pts: 50, fill: '#ffd93d' }, // bullseye
  ];

  let vw = 600, vh = 400;
  let bcx = 300, bcy = 200, bR = 150;     // board centre + radius (resize)
  // phase: 'start' | 'aimX' | 'aimY' | 'over'
  let phase = 'start';
  let throwsLeft = THROWS, score = 0, best = 0;
  let lockX = 0;                          // locked X aim (-1..1) for this dart
  let darts = [];                         // [{x,y,pts}] landed (normalised)
  let pops = [];                          // expanding rings on landing
  let running = false, raf = 0;

  // Fresh game (counters + cleared board).
  function startGame() {
    throwsLeft = THROWS; score = 0; darts = []; pops = [];
    phase = 'aimX';
  }

  // Fit the canvas to the FRAME (its clientWidth/Height is the real layout
  // size, unaffected by the open-transition transform). Retry if not yet
  // measurable instead of falling back to a wrong size.
  function resize() {
    const w = frame.clientWidth, h = frame.clientHeight;
    if (!w || !h) { requestAnimationFrame(resize); return; }
    vw = w; vh = h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bcx = vw / 2;
    bcy = vh / 2 + 6;
    bR = Math.min(vw, vh) * 0.36;
    draw();
  }

  // Sweep position in -1..1 as a triangle wave (bounces edge-to-edge).
  function sweep(now) {
    const p = (now % SWEEP_MS) / SWEEP_MS;          // 0..1
    const tri = p < 0.5 ? p * 2 : 2 - p * 2;        // 0..1..0
    return tri * 2 - 1;                             // -1..1
  }

  // Score a normalised (-1..1) hit by distance from the bull.
  function scoreHit(nx, ny) {
    const d = Math.hypot(nx, ny);                   // 0 (bull) .. ~1.41
    for (let i = RINGS.length - 1; i >= 0; i--) {
      if (d <= RINGS[i].r) return RINGS[i].pts;
    }
    return 0;                                       // outside the board
  }

  // Land the dart at the locked aim (tiny jitter for life), then advance.
  function throwDart(lockY) {
    const nx = lockX + (Math.random() - 0.5) * 0.05;
    const ny = lockY + (Math.random() - 0.5) * 0.05;
    const pts = scoreHit(nx, ny);
    score += pts;
    darts.push({ x: nx, y: ny, pts });
    pops.push({ x: nx, y: ny, t: performance.now() });
    throwsLeft--;
    if (throwsLeft <= 0) { best = Math.max(best, score); phase = 'over'; }
    else phase = 'aimX';
  }

  // One "action" press drives the state machine.
  function press() {
    const now = performance.now();
    if (phase === 'start' || phase === 'over') { startGame(); return; }
    if (phase === 'aimX') { lockX = sweep(now); phase = 'aimY'; return; }
    if (phase === 'aimY') { throwDart(sweep(now)); return; }
  }

  // --- Input (keyboard + click + tap) ---
  function onKey(e) {
    // Any key throws/advances — preventDefault stops Space/arrows scrolling.
    press();
    e.preventDefault();
  }
  function onClick() { press(); }
  let touchMoved = false;
  function onTouchStart() { touchMoved = false; }
  function onTouchMove() { touchMoved = true; }
  function onTouchEnd(e) {
    if (!touchMoved) press();   // a tap, not a scroll/drag
    e.preventDefault();
  }

  // --- Rendering ---
  function bx(nx) { return bcx + nx * bR; }   // normalised → board px
  function by(ny) { return bcy + ny * bR; }

  function drawBoard(now) {
    // Soft glow behind the board.
    const g = ctx.createRadialGradient(bcx, bcy, bR * 0.1, bcx, bcy, bR * 1.5);
    g.addColorStop(0, 'rgba(255, 200, 120, 0.16)');
    g.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    // Concentric rings, outer → inner.
    for (let i = 0; i < RINGS.length; i++) {
      ctx.beginPath();
      ctx.arc(bcx, bcy, bR * RINGS[i].r, 0, Math.PI * 2);
      ctx.fillStyle = RINGS[i].fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(20, 8, 4, 0.45)';
      ctx.stroke();
    }
    // Bull highlight pulse.
    const pa = 0.5 + 0.5 * Math.sin(now / 360);
    ctx.beginPath();
    ctx.arc(bcx, bcy, bR * RINGS[RINGS.length - 1].r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 240, 170, ${0.35 + pa * 0.4})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Landed darts.
    darts.forEach((d) => {
      ctx.beginPath();
      ctx.arc(bx(d.x), by(d.y), 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff4dd';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3a0f26';
      ctx.stroke();
    });

    // Expanding pops (fade ~600ms).
    pops = pops.filter((p) => now - p.t < 600);
    pops.forEach((p) => {
      const k = (now - p.t) / 600;
      ctx.beginPath();
      ctx.arc(bx(p.x), by(p.y), 6 + k * 34, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 217, 61, ${(1 - k) * 0.7})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }

  function drawReticle(now) {
    ctx.save();
    ctx.shadowColor = 'rgba(255, 120, 170, 0.9)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#ff7db0';
    ctx.lineWidth = 2.5;
    if (phase === 'aimX') {
      const x = bx(sweep(now));
      ctx.beginPath();
      ctx.moveTo(x, bcy - bR * 1.15);
      ctx.lineTo(x, bcy + bR * 1.15);
      ctx.stroke();
    } else if (phase === 'aimY') {
      const lx = bx(lockX);                       // locked vertical (dimmer)
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(lx, bcy - bR * 1.15);
      ctx.lineTo(lx, bcy + bR * 1.15);
      ctx.stroke();
      ctx.restore();
      const y = by(sweep(now));                   // sweeping horizontal
      ctx.beginPath();
      ctx.moveTo(bcx - bR * 1.15, y);
      ctx.lineTo(bcx + bR * 1.15, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud() {
    // Top-RIGHT so it never sits under the Back button (top-left).
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffe45c';
    ctx.font = '700 18px Quicksand, sans-serif';
    ctx.fillText(`Score ${score}`, vw - 18, 16);
    ctx.fillStyle = 'rgba(255, 241, 220, 0.8)';
    ctx.font = '600 14px Quicksand, sans-serif';
    ctx.fillText(
      `${throwsLeft} ${throwsLeft === 1 ? 'dart' : 'darts'} left`,
      vw - 18, 40
    );
  }

  function drawOverlay(now) {
    ctx.fillStyle = 'rgba(12, 4, 8, 0.62)';
    ctx.fillRect(0, 0, vw, vh);
    const midX = vw / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.save();
    ctx.shadowColor = 'rgba(255, 180, 90, 0.7)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffd93d';
    ctx.font = '800 46px Quicksand, sans-serif';
    ctx.fillText(phase === 'over' ? 'Game Over' : 'Darts', midX, vh * 0.4);
    ctx.restore();

    if (phase === 'over') {
      ctx.fillStyle = '#ffe45c';
      ctx.font = '700 22px Quicksand, sans-serif';
      ctx.fillText(`Score ${score}  ·  Best ${best}`, midX, vh * 0.52);
    } else {
      ctx.fillStyle = 'rgba(255, 241, 220, 0.85)';
      ctx.font = '600 16px Quicksand, sans-serif';
      ctx.fillText('Lock the sweep twice — hit the bull', midX, vh * 0.52);
    }

    const a = 0.55 + 0.45 * Math.sin(now / 380);
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.font = '600 18px Quicksand, sans-serif';
    ctx.fillText(
      phase === 'over' ? 'Press any key · tap to play again'
                       : 'Press any key · tap to start',
      midX, vh * 0.64
    );
  }

  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, vw, vh);
    drawBoard(now);
    if (phase === 'aimX' || phase === 'aimY') {
      drawReticle(now);
      drawHud();
    } else {
      drawOverlay(now);
    }
  }

  // --- Loop: this game is purely animated (no fixed-timestep sim) ---
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    draw();
  }

  // --- Lifecycle ---
  function start() {
    stop();                 // idempotent
    running = true;
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('resize', resize);
    phase = 'start';
    darts = []; pops = []; throwsLeft = THROWS; score = 0;
    resize();               // sizes canvas + first paint
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('resize', resize);
  }

  return { start, stop };
}
