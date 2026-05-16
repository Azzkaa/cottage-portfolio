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

  const CELL = 30;            // target px per grid cell (grid derived from size)
  const TICK_MS = 120;        // ms between snake steps (lower = faster)

  // Layout (recomputed in resize): grid size, square cell px, board origin.
  let COLS = 20, ROWS = 14, cell = CELL, ox = 0, oy = 0, vw = 600, vh = 400;

  // Game state. phase: 'start' (idle, awaiting first input) | 'play' | 'over'
  let snake, dir, nextDir, food, score, phase = 'start';
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

  // Drop the star on a random free cell.
  function placeFood() {
    let p;
    do {
      p = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 };
    } while (snake.some((s) => s.x === p.x && s.y === p.y));
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
      placeFood();
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

    // Very faint grid so the play area reads without being busy.
    ctx.strokeStyle = 'rgba(255, 180, 120, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      ctx.beginPath(); ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + ROWS * cell); ctx.stroke();
    }
    for (let j = 0; j <= ROWS; j++) {
      ctx.beginPath(); ctx.moveTo(ox, oy + j * cell); ctx.lineTo(ox + COLS * cell, oy + j * cell); ctx.stroke();
    }

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
    ctx.fillStyle = '#FFE45C';
    starPath(0, 0, cell * 0.46 * pulse, cell * 0.2 * pulse);
    ctx.fill();
    ctx.restore();

    // The snake: one smooth glowing tube (stroked polyline) + a brighter
    // core for a rounded look, then a friendly face on the head.
    if (snake.length) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx(snake[0].x), cy(snake[0].y));
      for (let i = 1; i < snake.length; i++) ctx.lineTo(cx(snake[i].x), cy(snake[i].y));
      // Outer glow + body.
      ctx.shadowColor = 'rgba(255, 140, 66, 0.85)';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = '#FF8C42';
      ctx.lineWidth = cell * 0.78;
      ctx.stroke();
      // Brighter inner core (no shadow) for a glossy tube feel.
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#FFC487';
      ctx.lineWidth = cell * 0.34;
      ctx.stroke();

      // Head: a rounded cap with big eyes looking the way we travel.
      const hx = cx(snake[0].x), hy = cy(snake[0].y);
      ctx.fillStyle = '#FF7A1F';
      ctx.beginPath(); ctx.arc(hx, hy, cell * 0.46, 0, Math.PI * 2); ctx.fill();
      const fwx = (phase === 'play' ? dir.x : nextDir.x);
      const fwy = (phase === 'play' ? dir.y : nextDir.y);
      const eo = cell * 0.18;                 // eye spread
      for (const sgn of [-1, 1]) {
        const exx = hx + (-fwy) * eo * sgn + fwx * cell * 0.1;
        const eyy = hy + (fwx) * eo * sgn + fwy * cell * 0.1;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(exx, eyy, cell * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#241225';
        ctx.beginPath();
        ctx.arc(exx + fwx * cell * 0.06, eyy + fwy * cell * 0.06, cell * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      // Occasional tongue flick while playing.
      if (phase === 'play' && ((now / 240 | 0) % 3 === 0)) {
        ctx.strokeStyle = '#ff5774';
        ctx.lineWidth = Math.max(2, cell * 0.06);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hx + fwx * cell * 0.46, hy + fwy * cell * 0.46);
        ctx.lineTo(hx + fwx * cell * 0.74, hy + fwy * cell * 0.74);
        ctx.stroke();
      }
    }

    // HUD: a little star + score, top-left, glowing softly.
    ctx.save();
    ctx.shadowColor = 'rgba(255, 213, 74, 0.7)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#FFE45C';
    starPath(ox + 24, oy + 26, 9, 4);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFF1DC';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 18px Quicksand, sans-serif';
    ctx.fillText(String(score), ox + 40, oy + 27);

    // Start / Game-Over screens.
    if (phase !== 'play') {
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
      while (acc >= TICK_MS && guard++ < 5) { step(); acc -= TICK_MS; }
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
