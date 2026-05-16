// Full-bleed Snake mini-game for the Credits panel.
// The game fills the whole panel: a dark night board, a glowing orange
// snake chasing a glowing yellow star. Start / Game-Over screens are drawn
// on the canvas (no DOM chrome) so the container *is* the game.
//
// Public API:  createSnakeGame(rootEl) -> { start(), stop() }
//   rootEl is the #credits-panel element. start() shows the Start screen
//   and wires input; stop() tears everything down (no leaked RAF/listeners).

export function createSnakeGame(rootEl) {
  const canvas = rootEl.querySelector('.snake-canvas');
  const ctx = canvas.getContext('2d');
  const dpad = rootEl.querySelector('.snake-dpad');
  const frame = rootEl.querySelector('.snake-frame'); // authoritative size source
  const backBtn = rootEl.querySelector('.panel-back'); // never spawn the star under it

  const CELL = 30;            // target px per grid cell (grid derived from size)
  const TICK_MS = 120;        // ms between snake steps (lower = faster)
  const CREDITS_AT = 2;       // stars to eat before the Credits screen opens

  // Layout (recomputed in resize): grid size, square cell px, board origin.
  let COLS = 20, ROWS = 14, cell = CELL, ox = 0, oy = 0, vw = 600, vh = 400;

  // Game state. phase: 'start' (idle) | 'play' | 'over' | 'credits' (terminal)
  let snake, dir, nextDir, food, score, phase = 'start';
  let creditsT = 0;           // timestamp the Credits screen opened (fade-in)
  let pops = [];              // brief expanding rings when a star is eaten
  let running = false, raf = 0, acc = 0, last = 0;

  // Lay out a fresh round centred on the current grid.
  function newRound() {
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    pops = [];
    placeFood();
  }

  // The Back button sits over the top-left of the board; return the pixel
  // rect it covers (drawing space), padded so a star's glow can't tuck
  // under it. Null until the canvas/button are measurable.
  function backBtnZone() {
    if (!backBtn) return null;
    const cr = canvas.getBoundingClientRect();
    const br = backBtn.getBoundingClientRect();
    if (!cr.width || !br.width) return null;
    const pad = cell * 1.2;                 // clears the star body + halo
    return {
      x0: br.left - cr.left - pad, y0: br.top - cr.top - pad,
      x1: br.right - cr.left + pad, y1: br.bottom - cr.top + pad,
    };
  }

  // Drop the star on a random free cell — never on the snake, and never
  // overlapping the Back button. Guarded so a near-full grid can't hang.
  function placeFood() {
    const zone = backBtnZone();
    const blocked = (gx, gy) => {
      if (snake.some((s) => s.x === gx && s.y === gy)) return true;
      if (!zone) return false;
      const px = ox + gx * cell, py = oy + gy * cell;
      // cell rect [px..px+cell] x [py..py+cell] intersects the button zone?
      return !(px + cell < zone.x0 || px > zone.x1 ||
               py + cell < zone.y0 || py > zone.y1);
    };
    let p, guard = 0;
    do {
      p = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 };
    } while (blocked(p.x, p.y) && guard++ < 200);
    food = p;
  }

  // Fit the canvas to the FRAME (its clientWidth/Height is the real layout
  // size — unaffected by the open-transition transform — and never the
  // full-screen panel). If it's not measurable yet, retry next frame
  // instead of falling back to a wrong size.
  function resize() {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h) { requestAnimationFrame(resize); return; }
    vw = w;
    vh = h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Grid sized so cells are ~CELL px; square cells, centred (slim letterbox).
    COLS = Math.max(12, Math.round(vw / CELL));
    ROWS = Math.max(9, Math.round(vh / CELL));
    cell = Math.min(vw / COLS, vh / ROWS);
    ox = (vw - cell * COLS) / 2;
    oy = (vh - cell * ROWS) / 2;
    // If a resize left the snake/food off the (new) grid, restart cleanly.
    if (snake && (food.x >= COLS || food.y >= ROWS ||
        snake.some((s) => s.x >= COLS || s.y >= ROWS))) {
      newRound();
      phase = 'start';
    }
    draw();
  }

  // --- Input ---
  function turn(nx, ny) {
    if (nx === -dir.x && ny === -dir.y) return;          // reverse vs current
    if (nx === -nextDir.x && ny === -nextDir.y) return;  // reverse vs pending
    nextDir = { x: nx, y: ny };
  }
  // Leave the Start / Game-Over screen and run a round.
  function begin() {
    if (phase === 'credits') return;   // terminal screen — leave via Back
    if (phase === 'over') newRound();
    phase = 'play';
    acc = 0; last = 0;
  }

  function onKey(e) {
    const k = e.key.toLowerCase();
    let d = null;
    if (k === 'arrowup' || k === 'w') d = [0, -1];
    else if (k === 'arrowdown' || k === 's') d = [0, 1];
    else if (k === 'arrowleft' || k === 'a') d = [-1, 0];
    else if (k === 'arrowright' || k === 'd') d = [1, 0];
    if (d) {
      if (phase !== 'play') begin();   // first arrow starts AND steers
      turn(d[0], d[1]);
      e.preventDefault();
    } else if (k === ' ' || k === 'enter') {
      if (phase !== 'play') begin();
      e.preventDefault();
    }
  }

  // Touch: swipe to steer; a small tap just starts/continues.
  let tsx = 0, tsy = 0;
  function onTouchStart(e) {
    const t = e.changedTouches[0];
    tsx = t.clientX; tsy = t.clientY;
  }
  function onTouchEnd(e) {
    const t = e.changedTouches[0];
    const dx = t.clientX - tsx, dy = t.clientY - tsy;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      if (phase !== 'play') begin();
      return;
    }
    if (phase !== 'play') begin();
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
    else turn(0, dy > 0 ? 1 : -1);
  }

  function onDpad(e) {
    const b = e.target.closest('[data-dir]');
    if (!b) return;
    e.preventDefault();
    if (phase !== 'play') begin();
    const d = b.dataset.dir;
    if (d === 'up') turn(0, -1);
    else if (d === 'down') turn(0, 1);
    else if (d === 'left') turn(-1, 0);
    else if (d === 'right') turn(1, 0);
  }

  // --- Simulation ---
  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
    const hitSelf = snake.slice(0, -1).some((s) => s.x === head.x && s.y === head.y);
    if (hitWall || hitSelf) { phase = 'over'; return; }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++;
      pops.push({ x: food.x, y: food.y, t: performance.now() });
      if (score >= CREDITS_AT) { phase = 'credits'; creditsT = performance.now(); }
      else placeFood();
    } else {
      snake.pop();
    }
  }

  // --- Rendering helpers ---
  function cx(gx) { return ox + gx * cell + cell / 2; }
  function cy(gy) { return oy + gy * cell + cell / 2; }
  function starPath(x, y, outer, inner) {
    let rot = -Math.PI / 2;
    const stepA = Math.PI / 5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    for (let i = 0; i < 5; i++) {
      rot += stepA; ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
      rot += stepA; ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    }
    ctx.closePath();
  }

  // A soft, plump star. The sharp 5-point spike read as too "edgy" next to
  // the painted juice-carton look, so the inner radius is fattened and every
  // corner is rounded by a round-joined stroke in the same ink.
  function softStar(x, y, r, color) {
    const round = r * 0.34;                 // rounding thickness (tips + notches)
    starPath(x, y, r - round / 2, r * 0.52 - round / 2);
    ctx.lineJoin = 'round';
    ctx.lineWidth = round;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  }

  // The Credits screen — a soft rounded star frame with attribution,
  // opened automatically once CREDITS_AT stars are eaten. Terminal screen:
  // the player leaves via the panel's floating Back button.
  function drawCredits(now) {
    const fade = Math.min(1, (now - creditsT) / 450);   // gentle fade-in
    ctx.fillStyle = 'rgba(10, 3, 8, 0.74)';
    ctx.fillRect(0, 0, vw, vh);

    const min = Math.min(vw, vh);
    const cx0 = vw / 2, cy0 = vh / 2;
    const R = min * 0.48 * (0.99 + 0.01 * Math.sin(now / 700)); // gentle breathe
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Rounded star: fatter inner radius + round joins = soft (not spiky),
    // a dim interior so text reads, a wide soft halo, then a slim warm rim.
    const rw = R * 0.06;
    starPath(cx0, cy0, R - rw / 2, R * 0.56 - rw / 2);
    ctx.fillStyle = 'rgba(32, 15, 31, 0.82)';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.save();
    ctx.shadowColor = 'rgba(255, 196, 96, 0.55)';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = 'rgba(255, 214, 130, 0.22)';
    ctx.lineWidth = rw * 2.4;                  // soft outer halo
    ctx.stroke();
    const rim = ctx.createLinearGradient(0, cy0 - R, 0, cy0 + R);
    rim.addColorStop(0, '#FFEFC2');
    rim.addColorStop(1, '#FFC64A');
    ctx.shadowBlur = 12;
    ctx.strokeStyle = rim;
    ctx.lineWidth = rw;                        // slim crisp rim
    ctx.stroke();
    ctx.restore();

    // Title — a warm-to-pink gradient with a soft pink glow.
    const tSize = Math.round(min * 0.05);
    ctx.font = `800 ${tSize}px Quicksand, sans-serif`;
    const tw = ctx.measureText('Credits').width;
    const tGrad = ctx.createLinearGradient(cx0 - tw / 2, 0, cx0 + tw / 2, 0);
    tGrad.addColorStop(0, '#FFD9A6');
    tGrad.addColorStop(1, '#FF8FC8');
    ctx.save();
    ctx.shadowColor = 'rgba(255, 130, 180, 0.5)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = tGrad;
    ctx.fillText('Credits', cx0, cy0 - R * 0.34);
    ctx.restore();

    // Slim divider under the title.
    ctx.strokeStyle = 'rgba(255, 214, 150, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx0 - R * 0.15, cy0 - R * 0.22);
    ctx.lineTo(cx0 + R * 0.15, cy0 - R * 0.22);
    ctx.stroke();

    // Attribution — each line a soft hue from the scene's neon palette.
    // Sized down + clamped well inside the body so it clears the rim.
    const lines = [
      ['A portfolio by Azka Aftab',          '#FFC2A0'],
      ['“Juice Carton Shop” — Ergoni',        '#FFD98A'],
      ['Art: Stef (@stefscribbles)',          '#FF9ECF'],
      ['Concept: Cheryl Doujima (@cysketch)', '#8FE3DA'],
      ['License: CC Attribution',             '#C9B3FF'],
      ['Built with Three.js',                 '#A8E6C9'],
    ];
    let fs = Math.max(9, Math.round(min * 0.021));
    const maxW = R * 0.74;
    ctx.font = `600 ${fs}px Quicksand, sans-serif`;
    while (fs > 8 && lines.some(([t]) => ctx.measureText(t).width > maxW)) {
      fs -= 1;
      ctx.font = `600 ${fs}px Quicksand, sans-serif`;
    }
    const lh = fs * 1.55;
    // Centre the block in the star's wide mid-body (slightly below centre).
    let ty = cy0 + R * 0.02 - ((lines.length - 1) / 2) * lh;
    for (const [t, col] of lines) {
      ctx.fillStyle = col;
      ctx.fillText(t, cx0, ty);
      ty += lh;
    }
    ctx.restore();
  }

  function draw() {
    // resize() paints once before newRound() has built any state — bail out
    // safely until snake/food exist (otherwise this throws and aborts start).
    if (!snake || !food) return;
    const now = performance.now();

    // Dark night backdrop (near-black with a faint warm wine glow).
    const g = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
    g.addColorStop(0, '#241225');
    g.addColorStop(1, '#100309');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    // Eat-pops: expanding fading rings.
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      const k = (now - p.t) / 420;
      if (k >= 1) { pops.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(255, 224, 102, ${0.6 * (1 - k)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx(p.x), cy(p.y), cell * (0.3 + k * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }

    // The star: slow spin + gentle pulse + bloom-y glow, with a soft halo.
    const fx = cx(food.x), fy = cy(food.y);
    const pulse = 1 + Math.sin(now / 320) * 0.09;
    const halo = ctx.createRadialGradient(fx, fy, 0, fx, fy, cell * 1.1);
    halo.addColorStop(0, 'rgba(255, 224, 102, 0.30)');
    halo.addColorStop(1, 'rgba(255, 224, 102, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(fx, fy, cell * 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate((now / 1600) % (Math.PI * 2));
    ctx.shadowColor = 'rgba(255, 213, 74, 0.95)';
    ctx.shadowBlur = 18;
    softStar(0, 0, cell * 0.46 * pulse, '#FFE45C');
    ctx.restore();

    // The snake: a soft neon bloom, a warm head→tail gradient body, a
    // glossy core ridge, a rounded tail, and a painted, cute face.
    if (snake.length) {
      const pts = snake.map((s) => [cx(s.x), cy(s.y)]);
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      };
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Soft ambient bloom so the snake glows into the dark board.
      trace();
      ctx.shadowColor = 'rgba(255, 150, 80, 0.9)';
      ctx.shadowBlur = 26;
      ctx.strokeStyle = 'rgba(255, 138, 64, 0.30)';
      ctx.lineWidth = cell * 1.12;
      ctx.stroke();

      // Body: warm head→tail gradient for a painted, dimensional look.
      const h0 = pts[0], t0 = pts[pts.length - 1];
      let body = '#FF8C42';
      if (h0[0] !== t0[0] || h0[1] !== t0[1]) {
        body = ctx.createLinearGradient(h0[0], h0[1], t0[0], t0[1]);
        body.addColorStop(0, '#FF9D4D');
        body.addColorStop(1, '#E9701C');
      }
      trace();
      ctx.shadowBlur = 12;
      ctx.strokeStyle = body;
      ctx.lineWidth = cell * 0.8;
      ctx.stroke();

      // Glossy core highlight (no shadow) — a slim warm-white ridge.
      trace();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 226, 188, 0.85)';
      ctx.lineWidth = cell * 0.26;
      ctx.stroke();

      // Rounded tail nub so the body ends softly, not abruptly.
      ctx.fillStyle = '#E9701C';
      ctx.beginPath(); ctx.arc(t0[0], t0[1], cell * 0.22, 0, Math.PI * 2); ctx.fill();

      // Head: a rounded cap with a soft top-left sheen + big cute eyes.
      const hx = h0[0], hy = h0[1];
      ctx.fillStyle = '#FF7A1F';
      ctx.beginPath(); ctx.arc(hx, hy, cell * 0.47, 0, Math.PI * 2); ctx.fill();
      const sheen = ctx.createRadialGradient(hx - cell * 0.18, hy - cell * 0.18, 0, hx, hy, cell * 0.5);
      sheen.addColorStop(0, 'rgba(255, 224, 184, 0.55)');
      sheen.addColorStop(1, 'rgba(255, 224, 184, 0)');
      ctx.fillStyle = sheen;
      ctx.beginPath(); ctx.arc(hx, hy, cell * 0.47, 0, Math.PI * 2); ctx.fill();
      const fwx = (phase === 'play' ? dir.x : nextDir.x);
      const fwy = (phase === 'play' ? dir.y : nextDir.y);
      const eo = cell * 0.19;                 // eye spread
      for (const sgn of [-1, 1]) {
        const exx = hx + (-fwy) * eo * sgn + fwx * cell * 0.1;
        const eyy = hy + (fwx) * eo * sgn + fwy * cell * 0.1;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(exx, eyy, cell * 0.16, 0, Math.PI * 2); ctx.fill();
        const px = exx + fwx * cell * 0.06, py = eyy + fwy * cell * 0.06;
        ctx.fillStyle = '#241225';
        ctx.beginPath(); ctx.arc(px, py, cell * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';   // catch-light
        ctx.beginPath(); ctx.arc(px - cell * 0.03, py - cell * 0.03, cell * 0.025, 0, Math.PI * 2); ctx.fill();
      }
      // Occasional tongue flick while playing.
      if (phase === 'play' && ((now / 240 | 0) % 3 === 0)) {
        ctx.strokeStyle = '#ff5774';
        ctx.lineWidth = Math.max(2, cell * 0.06);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hx + fwx * cell * 0.47, hy + fwy * cell * 0.47);
        ctx.lineTo(hx + fwx * cell * 0.76, hy + fwy * cell * 0.76);
        ctx.stroke();
      }
    }

    // HUD: score + a little star, top-RIGHT — the top-left corner is the
    // Back button, so the count used to sit on top of it.
    const hudY = oy + 26;
    const hudX = ox + COLS * cell - 22;     // inner right margin of the board
    ctx.save();
    ctx.shadowColor = 'rgba(255, 213, 74, 0.7)';
    ctx.shadowBlur = 8;
    softStar(hudX, hudY, 9, '#FFE45C');
    ctx.restore();
    ctx.fillStyle = '#FFF1DC';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '700 18px Quicksand, sans-serif';
    ctx.fillText(String(score), hudX - 16, hudY + 1);

    // Start / Game-Over screens.
    if (phase === 'start' || phase === 'over') {
      ctx.fillStyle = 'rgba(10, 3, 8, 0.6)';
      ctx.fillRect(0, 0, vw, vh);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const midX = vw / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 140, 66, 0.7)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#FFB066';
      ctx.font = `800 ${Math.round(Math.min(vw, vh) * 0.11)}px Quicksand, sans-serif`;
      ctx.fillText(phase === 'over' ? 'Game Over' : 'Star Snake', midX, vh * 0.4);
      ctx.restore();

      if (phase === 'over') {
        ctx.fillStyle = '#FFE45C';
        ctx.font = '700 22px Quicksand, sans-serif';
        ctx.fillText(`${score} ${score === 1 ? 'star' : 'stars'} caught`, midX, vh * 0.52);
      } else {
        ctx.fillStyle = 'rgba(255, 241, 220, 0.85)';
        ctx.font = '600 16px Quicksand, sans-serif';
        ctx.fillText('Guide the snake — eat the star', midX, vh * 0.52);
      }

      // Pulsing call-to-action.
      const a = 0.55 + 0.45 * Math.sin(now / 380);
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
      ctx.font = '600 18px Quicksand, sans-serif';
      ctx.fillText(
        phase === 'over' ? 'Press any key · tap to play again'
                         : 'Press any key · tap · swipe to start',
        midX, vh * 0.64
      );
    } else if (phase === 'credits') {
      drawCredits(now);
    }
  }

  // --- Loop: fixed-timestep simulation, render every frame ---
  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (phase === 'play') {
      if (!last) last = ts;
      acc += ts - last;
      last = ts;
      let guard = 0;
      while (acc >= TICK_MS && phase === 'play' && guard++ < 5) { step(); acc -= TICK_MS; }
    }
    draw();
  }

  // --- Lifecycle ---
  function start() {
    stop();                 // idempotent
    running = true;
    acc = 0; last = 0;
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    if (dpad) dpad.addEventListener('click', onDpad);
    window.addEventListener('resize', resize);
    resize();               // sizes canvas + derives grid + first paint
    newRound();             // idle snake behind the Start screen
    phase = 'start';
    draw();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchend', onTouchEnd);
    if (dpad) dpad.removeEventListener('click', onDpad);
    window.removeEventListener('resize', resize);
  }

  return { start, stop };
}
