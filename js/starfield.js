// Animated canvas background: twinkling stars, a parallax glow that follows the
// pointer, and the occasional shooting star. Respects prefers-reduced-motion.

export function setupStarfield() {
  const canvas = document.getElementById("starfield");
  const context = canvas.getContext("2d");
  if (!context) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stars = [];
  const shootingStars = [];

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let pointerX = 0;
  let pointerY = 0;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    stars.length = 0;
    const density = Math.max(80, Math.floor((width * height) / 14000));

    for (let i = 0; i < density; i += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.6 + 0.25,
        alpha: Math.random() * 0.6 + 0.15,
        twinkleSpeed: Math.random() * 0.016 + 0.004,
        phase: Math.random() * Math.PI * 2,
        depth: Math.random() * 0.9 + 0.1
      });
    }
  }

  function spawnShootingStar() {
    shootingStars.push({
      x: Math.random() * width * 0.8,
      y: Math.random() * height * 0.35,
      vx: Math.random() * 500 + 900,
      vy: Math.random() * 180 + 160,
      life: 0,
      maxLife: Math.random() * 0.6 + 0.5
    });
  }

  function drawFrame() {
    context.clearRect(0, 0, width, height);

    const glow = context.createRadialGradient(
      width * 0.2 + pointerX * 18,
      height * 0.2 + pointerY * 12,
      20,
      width * 0.2 + pointerX * 18,
      height * 0.2 + pointerY * 12,
      Math.max(width, height) * 0.75
    );
    glow.addColorStop(0, "rgba(115, 182, 255, 0.12)");
    glow.addColorStop(0.45, "rgba(157, 125, 255, 0.08)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    for (const star of stars) {
      star.phase += reducedMotion ? 0 : star.twinkleSpeed;
      const twinkle = (Math.sin(star.phase) + 1) * 0.5;
      context.beginPath();
      context.fillStyle = `rgba(255,255,255,${star.alpha * (0.55 + twinkle * 0.45)})`;
      context.arc(star.x + pointerX * star.depth * 10, star.y + pointerY * star.depth * 8, star.radius, 0, Math.PI * 2);
      context.fill();
    }

    if (!reducedMotion && shootingStars.length < 2 && Math.random() < 0.015) {
      spawnShootingStar();
    }

    for (let i = shootingStars.length - 1; i >= 0; i -= 1) {
      const star = shootingStars[i];
      star.life += 0.016;
      star.x += star.vx * 0.016;
      star.y += star.vy * 0.016;

      const progress = star.life / star.maxLife;
      const alpha = 1 - progress;

      context.strokeStyle = `rgba(255,255,255,${alpha * 0.7})`;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(star.x, star.y);
      context.lineTo(star.x - 140, star.y - 36);
      context.stroke();

      if (progress >= 1 || star.x > width + 160 || star.y > height + 120) {
        shootingStars.splice(i, 1);
      }
    }

    window.requestAnimationFrame(drawFrame);
  }

  window.addEventListener("pointermove", (event) => {
    pointerX = (event.clientX / width - 0.5) * 2;
    pointerY = (event.clientY / height - 0.5) * 2;
  });

  window.addEventListener("resize", resize);
  resize();
  window.requestAnimationFrame(drawFrame);
}
