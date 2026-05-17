// Full-bleed Darts mini-game (opened by the round medallion above the menu).
// Physical grab-drag-release throw — no easy aim reticle:
//   • A dart rests at the bottom (in your "hand").
//   • Press to grab it, then DRAG it up toward the board — the dart stays
//     under your mouse/finger like you're really holding it.
//   • Where you aim (left/right) and HOW FAR you pull (depth/power) decide
//     where it lands. Release to throw — the orange dart flies and sticks.
// A live guide shows the predicted landing so it's learnable, but you must
// coordinate aim + power by hand, so it's a real skill (not a snap-to dot).
//
// The board is styled like a real dartboard: concentric orange scoring
// rings, radial wedge spokes (the "triangles"), and the point value of
// each ring printed around the sides. Closer to the bull = more points.
//
// Public API:  createDartsGame(rootEl) -> { start(), stop() }
//   rootEl is the #darts-panel element. start() shows the Start screen and
//   wires input; stop() tears everything down (no leaked RAF/listeners).

export function createDartsGame(rootEl) {
  const canvas = rootEl.querySelector('.darts-canvas');
  const ctx = canvas.getContext('2d');
  const frame = rootEl.querySelector('.darts-frame'); // authoritative size

  const THROWS = 6;          // darts per game
  const FLY_MS = 380;        // dart flight duration (ms)
  const DRAG_MIN = 16;       // px — shorter than this = a tap, not a throw
  const SEGMENTS = 16;       // decorative wedge spokes ("triangles")
  const LEVER_X = 1.15;      // horizontal aim sensitivity (higher = twitchier)
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
  let lpx = 300, lpy = 560;               // launch anchor (the "hand", bottom)
  let refLen = 300;                       // anchor→board-centre distance
  // phase: 'start' | 'aim' | 'fly' | 'over'
  let phase = 'start';
  let throwsLeft = THROWS, score = 0, best = 0;
  let grabbed = false;                     // pointer currently holding the dart
  let held = { x: 300, y: 560 };           // current hand/pointer position
  let aim = { nx: 0, ny: 0, lx: 300, ly: 200, ang: 0, valid: false };
  let fly = null;                          // active dart flight, or null
  let darts = [];                          // [{x,y,pts}] landed (normalised)
  let pops = [];                           // expanding rings on landing
  let suppressUp = false;                  // ignore the pointerup that started a game
  let running = false, raf = 0;

  function restPos() { return { x: vw / 2, y: vh - Math.max(30, bR * 0.18) }; }

  // Fresh game (counters + cleared board).
  function startGame() {
    throwsLeft = THROWS; score = 0; darts = []; pops = [];
    fly = null; grabbed = false; aim.valid = false;
    held = restPos();
    phase = 'aim';
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
    bR = Math.min(vw, vh) * 0.34;
    const rp = restPos();
    lpx = rp.x; lpy = rp.y;                 // throw originates at the hand
    refLen = Math.hypot(bcx - lpx, bcy - lpy);
    if (!grabbed) held = rp;
    draw();
  }

  // Pointer (mouse/touch/pen) → canvas drawing space. The ctx is dpr-
  // scaled, so drawing space == CSS px; scale by rect→canvas ratio so it
  // stays correct even if the frame is briefly CSS-scaled on open.
  function ptr(e) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: lpx, y: lpy };
    return {
      x: (e.clientX - rect.left) * (vw / rect.width),
      y: (e.clientY - rect.top) * (vh / rect.height),
    };
  }

  // Turn the current hand position into a board target. Direction (where
  // you point) sets X with leverage; pull length (how far you dragged up
  // from the bottom) sets depth/power → Y. ~Half power lands at the bull.
  function computeAim() {
    const pull = Math.hypot(held.x - lpx, held.y - lpy);
    const minPull = refLen * 0.55, maxPull = refLen * 1.45;
    const powerN = Math.max(0, Math.min(1, (pull - minPull) / (maxPull - minPull)));
    const ny = (0.5 - powerN) * 2 * 1.15;          // .5→bull, more→high, less→low
    let nx = ((held.x - lpx) / bR) * LEVER_X;
    nx = Math.max(-1.7, Math.min(1.7, nx));
    aim.nx = nx;
    aim.ny = ny;
    aim.lx = bcx + nx * bR;
    aim.ly = bcy + ny * bR;
    aim.ang = Math.atan2(aim.ly - held.y, aim.lx - held.x);
    aim.valid = pull > DRAG_MIN;
  }

  // Score a normalised (-1..1) hit by distance from the bull.
  function scoreHit(nx, ny) {
    const d = Math.hypot(nx, ny);                   // 0 (bull) .. ~1.4+
    for (let i = RINGS.length - 1; i >= 0; i--) {
      if (d <= RINGS[i].r) return RINGS[i].pts;
    }
    return 0;                                       // outside the board (miss)
  }

  // Release: the dart leaves your hand and flies to the aimed point.
  function launchDart() {
    fly = {
      fromX: held.x, fromY: held.y,                 // from where you let go
      toX: aim.lx, toY: aim.ly,
      nx: aim.nx, ny: aim.ny,
      t0: performance.now(), dur: FLY_MS,
    };
    grabbed = false;
    aim.valid = false;
    phase = 'fly';
  }

  // The dart arrived: score exactly where aimed, record it, advance.
  function landDart() {
    const nx = fly.nx, ny = fly.ny;
    const pts = scoreHit(nx, ny);
    score += pts;
    darts.push({ x: nx, y: ny, pts });
    pops.push({ x: nx, y: ny, t: performance.now() });
    fly = null;
    held = restPos();
    throwsLeft--;
    if (throwsLeft <= 0) { best = Math.max(best, score); phase = 'over'; }
    else phase = 'aim';
  }

  // --- Input (unified pointer events: mouse + touch + pen) ---
  function onPointerDown(e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (phase === 'start' || phase === 'over') {
      startGame();
      suppressUp = true;             // don't let this same tap throw
      return;
    }
    if (phase === 'aim') {           // grab the dart anywhere
      grabbed = true;
      held = ptr(e);
      computeAim();
    }
  }
  function onPointerMove(e) {
    if (phase === 'aim' && grabbed) {
      held = ptr(e);                 // the dart stays in your hand
      computeAim();
    }
  }
  function onPointerUp(e) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (suppressUp) { suppressUp = false; return; }
    if (phase === 'aim' && grabbed) {
      held = ptr(e);
      computeAim();
      if (aim.valid) launchDart();   // a real drag → throw
      else { grabbed = false; held = restPos(); }  // a tap → no throw
    }
  }
  function onPointerCancel(e) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    suppressUp = false;
    grabbed = false;
    held = restPos();
  }
  function onKey(e) {
    if (phase === 'start' || phase === 'over') startGame();
    e.preventDefault();
  }

  // --- Rendering ---
  function bx(nx) { return bcx + nx * bR; }   // normalised → board px
  function by(ny) { return bcy + ny * bR; }

  // A stylised orange dart pointing along `angle`, scaled by `s`. Reused
  // for the held dart, the flying dart and (small) landed markers.
  function drawDart(x, y, angle, s, glow) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(s, s);
    if (glow) {
      ctx.shadowColor = 'rgba(255, 150, 60, 0.85)';
      ctx.shadowBlur = 16;
    }
    // Tail flights (cream triangles), behind the shaft.
    ctx.fillStyle = '#ffe9c8';
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-15, -7);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-15, 7);
    ctx.closePath();
    ctx.fill();
    // Shaft (warm orange gradient).
    const g = ctx.createLinearGradient(-16, 0, 14, 0);
    g.addColorStop(0, '#e9701c');
    g.addColorStop(1, '#ff9d4d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-16, -3.4);
    ctx.lineTo(10, -3.4);
    ctx.lineTo(10, 3.4);
    ctx.lineTo(-16, 3.4);
    ctx.closePath();
    ctx.fill();
    // Point (bright triangular tip).
    ctx.fillStyle = '#fff0d6';
    ctx.beginPath();
    ctx.moveTo(10, -3.4);
    ctx.lineTo(20, 0);
    ctx.lineTo(10, 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Small rounded label pill (dark, so numbers read on the orange board).
  function pill(text, x, y, fs) {
    ctx.font = `700 ${fs}px Quicksand, sans-serif`;
    const w = ctx.measureText(text).width + fs * 0.9;
    const h = fs * 1.6;
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, y - h / 2);
    ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
    ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
    ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
    ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(26, 10, 4, 0.62)';
    ctx.fill();
    ctx.fillStyle = '#ffe7c2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

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

    // Wedge spokes / "triangles" — a real-dartboard segmented look.
    // Clipped to the outer circle; alternate wedges get a faint shade.
    ctx.save();
    ctx.beginPath();
    ctx.arc(bcx, bcy, bR, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < SEGMENTS; i++) {
      const a0 = (i / SEGMENTS) * Math.PI * 2;
      const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(bcx, bcy);
        ctx.arc(bcx, bcy, bR, a0, a1);
        ctx.closePath();
        ctx.fillStyle = 'rgba(20, 8, 4, 0.10)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(bcx, bcy);
      ctx.lineTo(bcx + Math.cos(a0) * bR, bcy + Math.sin(a0) * bR);
      ctx.strokeStyle = 'rgba(20, 8, 4, 0.30)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    // Bull highlight pulse.
    const pa = 0.5 + 0.5 * Math.sin(now / 360);
    ctx.beginPath();
    ctx.arc(bcx, bcy, bR * RINGS[RINGS.length - 1].r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 240, 170, ${0.35 + pa * 0.4})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Point numbers around the board (top + both sides), like a real
    // dartboard, so you can read scoring from the side.
    const fs = Math.max(11, Math.round(bR * 0.085));
    for (let i = 0; i < RINGS.length - 1; i++) {
      const mid = (RINGS[i].r + RINGS[i + 1].r) / 2 * bR;
      const label = String(RINGS[i].pts);
      pill(label, bcx - mid, bcy, fs);          // left side
      pill(label, bcx + mid, bcy, fs);          // right side
      pill(label, bcx, bcy - mid, fs);          // top
    }
    pill('50', bcx, bcy - bR * RINGS[4].r - fs * 1.1, fs); // bull value

    // Landed darts — little orange darts stuck in the board.
    darts.forEach((d) => drawDart(bx(d.x), by(d.y), -0.7, 0.6, false));

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

  // While aiming: the held dart under the hand, a guide to the predicted
  // landing, and a pulsing impact ring so the throw is learnable.
  function drawAiming(now) {
    if (grabbed) {
      if (aim.valid) {
        // Dashed guide hand → predicted landing.
        ctx.save();
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = 'rgba(255, 125, 176, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(held.x, held.y);
        ctx.lineTo(aim.lx, aim.ly);
        ctx.stroke();
        ctx.restore();
        // Predicted impact ring.
        const pr = 1 + 0.14 * Math.sin(now / 200);
        ctx.save();
        ctx.shadowColor = 'rgba(255, 120, 170, 0.9)';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = '#ff7db0';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(aim.lx, aim.ly, 15 * pr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(aim.lx, aim.ly, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ff7db0';
        ctx.fill();
        ctx.restore();
      }
      // The dart stays in your hand the moment you grab it — pointed at
      // the board once you've dragged far enough to have a real aim.
      drawDart(held.x, held.y, aim.valid ? aim.ang : -Math.PI / 2, 1.05, true);
    } else {
      // Resting dart at the bottom, gently bobbing, pointing up.
      const rp = restPos();
      const bob = Math.sin(now / 420) * 4;
      drawDart(rp.x, rp.y + bob, -Math.PI / 2, 1.05, true);
      ctx.fillStyle = 'rgba(255, 241, 220, 0.7)';
      ctx.font = '600 15px Quicksand, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Grab the dart, drag up to aim, release to throw',
        vw / 2, rp.y - 34);
    }
  }

  // The orange dart in flight: eased travel + a slight lob + grows as it
  // nears the board. Lands (scores) when the flight completes.
  function drawFlyingDart() {
    const k = Math.min((performance.now() - fly.t0) / fly.dur, 1);
    const e = 1 - Math.pow(1 - k, 3);                 // easeOutCubic
    const x = fly.fromX + (fly.toX - fly.fromX) * e;
    let y = fly.fromY + (fly.toY - fly.fromY) * e;
    y -= Math.sin(Math.PI * k) * Math.min(vw, vh) * 0.06;  // gentle lob
    const ang = Math.atan2(fly.toY - fly.fromY, fly.toX - fly.fromX);
    const s = 0.7 + 0.45 * e;
    drawDart(x, y, ang, s, true);
    if (k >= 1) landDart();
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
    ctx.fillText(phase === 'over' ? 'Game Over' : 'Darts', midX, vh * 0.38);
    ctx.restore();

    if (phase === 'over') {
      ctx.fillStyle = '#ffe45c';
      ctx.font = '700 22px Quicksand, sans-serif';
      ctx.fillText(`Score ${score}  ·  Best ${best}`, midX, vh * 0.5);
    } else {
      ctx.fillStyle = 'rgba(255, 241, 220, 0.85)';
      ctx.font = '600 16px Quicksand, sans-serif';
      ctx.fillText('Hold the dart, drag it up to aim,', midX, vh * 0.49);
      ctx.fillText('then release to throw — hit the bull', midX, vh * 0.55);
    }

    const a = 0.55 + 0.45 * Math.sin(now / 380);
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.font = '600 18px Quicksand, sans-serif';
    ctx.fillText(
      phase === 'over' ? 'Tap · click · any key to play again'
                       : 'Tap · click · any key to start',
      midX, vh * 0.66
    );
  }

  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, vw, vh);
    drawBoard(now);
    if (phase === 'aim') {
      drawAiming(now);
      drawHud();
    } else if (phase === 'fly') {
      drawFlyingDart();   // may flip phase via landDart()
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
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('resize', resize);
    phase = 'start';
    darts = []; pops = []; fly = null; grabbed = false;
    throwsLeft = THROWS; score = 0;
    resize();               // sizes canvas + first paint
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('resize', resize);
  }

  return { start, stop };
}
