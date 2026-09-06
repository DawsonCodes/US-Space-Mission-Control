// Animated canvas background: a layered starfield with parallax, meteors,
// drifting asteroids, and the occasional comet. Sits at z-index -2 behind every
// panel, so it is allowed depth but never contrast that competes with the data.
//
// Everything is time-based rather than per-frame. The previous version advanced
// by a hard-coded 0.016 every frame, so on a 120Hz display the whole sky moved
// at double speed.
//
// Under prefers-reduced-motion the sky is painted once and the loop never
// starts: no drift, no parallax, no animation frames for the life of the page.

const TAU = Math.PI * 2;

// Mostly white, a few blue-white, occasionally a warm one. A real sky is not
// monochrome, and the variation is what stops this reading as grey noise.
const STAR_TINTS = [
  "228, 236, 250",
  "228, 236, 250",
  "228, 236, 250",
  "228, 236, 250",
  "196, 214, 255",
  "196, 214, 255",
  "255, 230, 202",
  "255, 208, 180"
];

// Three depth layers. Far stars are small, dim and barely move with the
// pointer; near stars are larger, brighter and shift most. That difference is
// the entire illusion of depth.
const LAYERS = [
  { share: 0.55, radius: [0.35, 0.95], alpha: [0.16, 0.4], parallax: 3 },
  { share: 0.3, radius: [0.7, 1.45], alpha: [0.3, 0.6], parallax: 8 },
  { share: 0.15, radius: [1.1, 2.1], alpha: [0.45, 0.85], parallax: 15 }
];

const DEFAULTS = {
  // Seconds between spawns, picked uniformly in each range.
  meteorGap: [1.4, 4.5],
  cometGap: [38, 85],
  asteroidGap: [10, 24],
  maxMeteors: 3,
  maxAsteroids: 3
};

const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function setupStarfield(options = {}) {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const settings = { ...DEFAULTS, ...options };
  const reducedMotion = prefersReducedMotion();

  const stars = [];
  const meteors = [];
  const asteroids = [];
  const comets = [];

  let width = 0;
  let height = 0;
  let pointerX = 0;
  let pointerY = 0;
  let running = false;
  let frame = 0;
  let lastTime = 0;

  let nextMeteor = rand(...settings.meteorGap);
  let nextComet = rand(settings.cometGap[0] * 0.35, settings.cometGap[1] * 0.5);
  let nextAsteroid = rand(...settings.asteroidGap);

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      return false;
    }
  }

  // ---- population ---------------------------------------------------------

  function buildStars() {
    stars.length = 0;
    const total = Math.max(90, Math.min(420, Math.floor((width * height) / 7600)));

    for (const layer of LAYERS) {
      const count = Math.round(total * layer.share);
      for (let i = 0; i < count; i += 1) {
        const radius = rand(...layer.radius);
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius,
          tint: pick(STAR_TINTS),
          alpha: rand(...layer.alpha),
          parallax: layer.parallax,
          twinkleSpeed: rand(0.25, 0.9),
          phase: Math.random() * TAU,
          // The brightest handful get diffraction spikes, which is what makes a
          // starfield look photographed rather than dotted.
          spikes: radius > 1.7 && Math.random() < 0.55
        });
      }
    }
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    buildStars();
    if (reducedMotion) paint(0);
  }

  // ---- transient objects --------------------------------------------------

  function spawnMeteor() {
    // Enter from the top or from either upper corner, so they do not all fall
    // along the same diagonal the way a single spawn box made them.
    const leftToRight = Math.random() < 0.5;
    const speed = rand(680, 1180);
    const angle = rand(0.24, 0.62) * (leftToRight ? 1 : -1);

    meteors.push({
      x: leftToRight ? rand(-120, width * 0.55) : rand(width * 0.45, width + 120),
      y: rand(-60, height * 0.35),
      vx: Math.cos(angle) * speed * (leftToRight ? 1 : -1),
      vy: Math.abs(Math.sin(angle)) * speed + rand(90, 190),
      life: 0,
      maxLife: rand(0.75, 1.35),
      length: rand(110, 240),
      width: rand(1.1, 2.2),
      tint: Math.random() < 0.25 ? "198, 220, 255" : "240, 244, 252"
    });
  }

  function spawnComet() {
    // Slow, large and rare. Crosses the whole viewport over several seconds so
    // it reads as something distant and massive rather than as a fast streak.
    const leftToRight = Math.random() < 0.5;
    const speed = rand(38, 72);
    const drift = rand(-14, 26);

    comets.push({
      x: leftToRight ? -180 : width + 180,
      y: rand(height * 0.08, height * 0.55),
      vx: leftToRight ? speed : -speed,
      vy: drift,
      radius: rand(2.2, 3.6),
      life: 0,
      // Long enough to cross, plus margin for the fade at each end.
      maxLife: (width + 420) / speed
    });
  }

  function spawnAsteroid() {
    // An irregular silhouette with a lit rim, tumbling slowly. Built once at
    // spawn so the shape is stable while it drifts.
    const points = Math.floor(rand(7, 11));
    // Small enough to sit behind the content, large enough not to be mistaken
    // for a dead pixel, which is what the first pass at 3px looked like.
    const radius = rand(4.5, 9.5);
    const shape = [];
    for (let i = 0; i < points; i += 1) {
      shape.push({ angle: (i / points) * TAU, radius: radius * rand(0.62, 1.32) });
    }

    const leftToRight = Math.random() < 0.5;
    const speed = rand(14, 34);

    asteroids.push({
      x: leftToRight ? rand(-80, -20) : rand(width + 20, width + 80),
      y: rand(height * 0.05, height * 0.95),
      vx: leftToRight ? speed : -speed,
      vy: rand(-9, 9),
      shape,
      radius,
      rotation: Math.random() * TAU,
      spin: rand(-0.32, 0.32),
      alpha: rand(0.34, 0.6)
    });
  }

  // ---- painting -----------------------------------------------------------

  function paintGlow() {
    const cx = width * 0.5 + pointerX * 16;
    const cy = height * 0.12 + pointerY * 10;
    const glow = context.createRadialGradient(cx, cy, 20, cx, cy, Math.max(width, height) * 0.85);
    glow.addColorStop(0, "rgba(150, 162, 186, 0.055)");
    glow.addColorStop(0.5, "rgba(118, 130, 152, 0.03)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }

  function paintStars(elapsed) {
    for (const star of stars) {
      if (!reducedMotion) star.phase += star.twinkleSpeed * elapsed;
      const twinkle = (Math.sin(star.phase) + 1) * 0.5;
      const alpha = star.alpha * (0.55 + twinkle * 0.45);
      const x = star.x + pointerX * star.parallax;
      const y = star.y + pointerY * star.parallax * 0.7;

      context.fillStyle = `rgba(${star.tint}, ${alpha})`;
      context.beginPath();
      context.arc(x, y, star.radius, 0, TAU);
      context.fill();

      if (!star.spikes) continue;

      // Two hairlines and a soft halo. Cheaper than a shadow blur and it is
      // what separates a bright star from a big dot.
      const reach = star.radius * 5.5;
      const halo = context.createRadialGradient(x, y, 0, x, y, reach);
      halo.addColorStop(0, `rgba(${star.tint}, ${alpha * 0.5})`);
      halo.addColorStop(1, `rgba(${star.tint}, 0)`);
      context.fillStyle = halo;
      context.beginPath();
      context.arc(x, y, reach, 0, TAU);
      context.fill();

      context.strokeStyle = `rgba(${star.tint}, ${alpha * 0.4})`;
      context.lineWidth = 0.6;
      context.beginPath();
      context.moveTo(x - reach, y);
      context.lineTo(x + reach, y);
      context.moveTo(x, y - reach);
      context.lineTo(x, y + reach);
      context.stroke();
    }
  }

  function paintMeteors(elapsed) {
    for (let i = meteors.length - 1; i >= 0; i -= 1) {
      const m = meteors[i];
      m.life += elapsed;
      m.x += m.vx * elapsed;
      m.y += m.vy * elapsed;

      const progress = m.life / m.maxLife;
      // Fade in quickly, fade out over the tail of its life.
      const alpha = Math.min(1, progress * 6) * (1 - progress) * 0.75;
      const angle = Math.atan2(m.vy, m.vx);
      const tailX = m.x - Math.cos(angle) * m.length;
      const tailY = m.y - Math.sin(angle) * m.length;

      const streak = context.createLinearGradient(m.x, m.y, tailX, tailY);
      streak.addColorStop(0, `rgba(${m.tint}, ${alpha})`);
      streak.addColorStop(0.35, `rgba(${m.tint}, ${alpha * 0.35})`);
      streak.addColorStop(1, `rgba(${m.tint}, 0)`);
      context.strokeStyle = streak;
      context.lineWidth = m.width;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(m.x, m.y);
      context.lineTo(tailX, tailY);
      context.stroke();

      // A small bright head, so the streak has a source instead of just ending.
      const head = context.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.width * 3.5);
      head.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.9})`);
      head.addColorStop(1, `rgba(${m.tint}, 0)`);
      context.fillStyle = head;
      context.beginPath();
      context.arc(m.x, m.y, m.width * 3.5, 0, TAU);
      context.fill();

      if (progress >= 1 || m.x < -320 || m.x > width + 320 || m.y > height + 260) {
        meteors.splice(i, 1);
      }
    }
    context.lineCap = "butt";
  }

  function paintComets(elapsed) {
    for (let i = comets.length - 1; i >= 0; i -= 1) {
      const c = comets[i];
      c.life += elapsed;
      c.x += c.vx * elapsed;
      c.y += c.vy * elapsed;

      const progress = c.life / c.maxLife;
      // Ease in and out at the screen edges so it never pops into existence.
      const fade = Math.min(1, progress * 8) * Math.min(1, (1 - progress) * 8);
      const alpha = Math.max(0, fade) * 0.6;
      if (alpha <= 0.001) {
        if (progress >= 1) comets.splice(i, 1);
        continue;
      }

      // Tails point away from the light, which sits where the page glow does,
      // the way a real comet's do regardless of which way it is travelling.
      const sunX = width * 0.5;
      const sunY = height * 0.12;
      const away = Math.atan2(c.y - sunY, c.x - sunX);

      // Built from overlapping soft blobs along the axis rather than as a
      // filled cone. A cone has straight sides, and at these alphas that read
      // as a flat grey triangle laid over the sky. Blobs give the diffuse edge
      // a tail actually has, and there is only ever one comet to draw.
      const tail = (angle, length, startR, endR, tint, strength) => {
        // Enough steps that consecutive blobs overlap. At 26 the spacing near
        // the head exceeded the blob radius and the tail read as a bead string.
        const steps = 48;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        for (let step = 0; step < steps; step += 1) {
          const t = step / (steps - 1);
          const px = c.x + nx * length * t;
          const py = c.y + ny * length * t;
          const radius = startR + (endR - startR) * t;
          // Falls away faster than linearly, so the tail thins out instead of
          // stopping. Each blob is soft-edged, so the union is too.
          const a = strength * alpha * Math.pow(1 - t, 1.9);
          if (a <= 0.002) continue;
          const blob = context.createRadialGradient(px, py, 0, px, py, radius);
          blob.addColorStop(0, `rgba(${tint}, ${a})`);
          blob.addColorStop(1, `rgba(${tint}, 0)`);
          context.fillStyle = blob;
          context.beginPath();
          context.arc(px, py, radius, 0, TAU);
          context.fill();
        }
      };

      // Ion tail: long, narrow, blue, the more defined of the two.
      const ionLen = 210 + c.radius * 34;
      tail(away, ionLen, c.radius * 3.4, c.radius * 6, "170, 206, 255", 0.17);

      // Dust tail: shorter, broader, faintly warm, swept off the ion tail.
      // Kept dim on purpose; at full strength it looked like dirt on the lens.
      const dustAngle = away - 0.3 * Math.sign(c.vx || 1);
      tail(dustAngle, ionLen * 0.7, c.radius * 4, c.radius * 11, "255, 238, 214", 0.075);

      // Coma: a soft glowing head with a bright core.
      const comaR = c.radius * 6;
      const coma = context.createRadialGradient(c.x, c.y, 0, c.x, c.y, comaR);
      coma.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      coma.addColorStop(0.25, `rgba(206, 228, 255, ${alpha * 0.55})`);
      coma.addColorStop(1, "rgba(206, 228, 255, 0)");
      context.fillStyle = coma;
      context.beginPath();
      context.arc(c.x, c.y, comaR, 0, TAU);
      context.fill();

      if (progress >= 1) comets.splice(i, 1);
    }
  }

  function paintAsteroids(elapsed) {
    for (let i = asteroids.length - 1; i >= 0; i -= 1) {
      const a = asteroids[i];
      a.x += a.vx * elapsed;
      a.y += a.vy * elapsed;
      if (!reducedMotion) a.rotation += a.spin * elapsed;

      context.save();
      context.translate(a.x, a.y);
      context.rotate(a.rotation);

      // Smooth the silhouette through the midpoints between vertices. Straight
      // edges made these read as little grey pentagons, more UI shape than rock.
      const pts = a.shape.map((point) => ({
        x: Math.cos(point.angle) * point.radius,
        y: Math.sin(point.angle) * point.radius
      }));
      context.beginPath();
      const mid = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
      let from = mid(pts[pts.length - 1], pts[0]);
      context.moveTo(from.x, from.y);
      for (let n = 0; n < pts.length; n += 1) {
        const current = pts[n];
        const to = mid(current, pts[(n + 1) % pts.length]);
        context.quadraticCurveTo(current.x, current.y, to.x, to.y);
      }
      context.closePath();

      // A dark body with one lit limb, so it reads as a rock catching light
      // rather than as a grey blob. The gradient runs across the silhouette.
      // Lit from the upper left, falling to near-black on the far side, so it
      // reads as a rock catching a little light rather than as a grey shape.
      const body = context.createLinearGradient(-a.radius, -a.radius, a.radius * 0.8, a.radius);
      body.addColorStop(0, `rgba(150, 158, 176, ${a.alpha * 0.85})`);
      body.addColorStop(0.4, `rgba(74, 80, 94, ${a.alpha * 0.7})`);
      body.addColorStop(1, `rgba(24, 27, 34, ${a.alpha * 0.6})`);
      context.fillStyle = body;
      context.fill();

      // A lit limb on the sunward side only, drawn by clipping the outline.
      context.save();
      context.clip();
      const limb = context.createLinearGradient(-a.radius, -a.radius, 0, 0);
      limb.addColorStop(0, `rgba(214, 224, 242, ${a.alpha * 0.5})`);
      limb.addColorStop(1, "rgba(214, 224, 242, 0)");
      context.fillStyle = limb;
      context.fillRect(-a.radius * 1.4, -a.radius * 1.4, a.radius * 2.8, a.radius * 2.8);
      context.restore();
      context.restore();

      if (a.x < -140 || a.x > width + 140 || a.y < -140 || a.y > height + 140) {
        asteroids.splice(i, 1);
      }
    }
  }

  function paint(elapsed) {
    context.clearRect(0, 0, width, height);
    paintGlow();
    paintStars(elapsed);
    if (reducedMotion) return;
    paintAsteroids(elapsed);
    paintComets(elapsed);
    paintMeteors(elapsed);
  }

  // ---- loop ---------------------------------------------------------------

  function schedule(elapsed) {
    nextMeteor -= elapsed;
    if (nextMeteor <= 0) {
      if (meteors.length < settings.maxMeteors) spawnMeteor();
      nextMeteor = rand(...settings.meteorGap);
    }

    nextAsteroid -= elapsed;
    if (nextAsteroid <= 0) {
      if (asteroids.length < settings.maxAsteroids) spawnAsteroid();
      nextAsteroid = rand(...settings.asteroidGap);
    }

    nextComet -= elapsed;
    if (nextComet <= 0) {
      if (comets.length === 0) spawnComet();
      nextComet = rand(...settings.cometGap);
    }
  }

  function tick(now) {
    if (!running) return;
    // Clamp the step so a backgrounded tab returning does not teleport
    // everything across the screen in one frame.
    const elapsed = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0.016;
    lastTime = now;

    schedule(elapsed);
    paint(elapsed);
    frame = window.requestAnimationFrame(tick);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    lastTime = 0;
    frame = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  window.addEventListener("pointermove", (event) => {
    // Twinkle, drift and spawning are all gated on reduced motion, and so is
    // this: otherwise the whole sky still slid under the pointer for a reader
    // who asked for no motion.
    if (reducedMotion) return;
    pointerX = (event.clientX / width - 0.5) * 2;
    pointerY = (event.clientY / height - 0.5) * 2;
  });

  window.addEventListener("resize", resize);

  // A hidden tab has nothing to animate for. rAF is already throttled there,
  // but stopping outright means no wasted frames at all.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stop();
    else start();
  });

  resize();
  start();
}
