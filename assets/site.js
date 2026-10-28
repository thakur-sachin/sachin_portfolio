// Top bar gets a hairline once the page scrolls.
const topbar = document.querySelector('.topbar');
const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Hero arm: a two-link planar arm solved with analytic inverse kinematics.
// It reaches for the pointer; with no pointer it traces a slow figure-eight.
(() => {
  const canvas = document.getElementById('arm');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const t1El = document.getElementById('t1');
  const t2El = document.getElementById('t2');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const css = getComputedStyle(document.documentElement);
  const INK = css.getPropertyValue('--ink').trim();
  const SERVO = css.getPropertyValue('--servo').trim();
  const RULE = css.getPropertyValue('--rule').trim();
  const WHITE = css.getPropertyValue('--white').trim();

  let W = 0, H = 0, dpr = 1;
  let base, L1, L2;
  const target = { x: 0, y: 0 };   // smoothed point the wrist chases
  const goal = { x: 0, y: 0 };     // raw pointer or idle path
  let pointerActive = false, lastPointer = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    base = { x: W * 0.4, y: H * 0.88 };
    const reach = Math.min(W * 0.56, H * 0.78);
    L1 = reach * 0.55;
    L2 = reach * 0.45;
    if (!target.x) Object.assign(target, idlePoint(0));
  }

  function idlePoint(t) {
    const s = t / 2600;
    return {
      x: base.x + (L1 + L2) * (0.35 + 0.32 * Math.sin(s)),
      y: base.y - (L1 + L2) * (0.62 + 0.22 * Math.sin(2 * s)),
    };
  }

  // Elbow-up solution in canvas coordinates (y grows downward).
  function solve(px, py) {
    const dx = px - base.x, dy = base.y - py;
    const maxR = L1 + L2 - 0.5, minR = Math.abs(L1 - L2) + 0.5;
    let d = Math.hypot(dx, dy);
    const clamped = Math.max(minR, Math.min(maxR, d));
    const c2 = (clamped * clamped - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    const q2 = -Math.acos(Math.max(-1, Math.min(1, c2)));
    const q1 = Math.atan2(dy, dx) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
    return { q1, q2, reachable: d <= maxR && d >= minR };
  }

  function arc(x, y, r, from, to, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    // canvas angles run clockwise, so negate
    ctx.arc(x, y, r, -from, -to, to > from);
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const { q1, q2, reachable } = solve(target.x, target.y);
    const elbow = { x: base.x + L1 * Math.cos(q1), y: base.y - L1 * Math.sin(q1) };
    const a2 = q1 + q2;
    const wrist = { x: elbow.x + L2 * Math.cos(a2), y: elbow.y - L2 * Math.sin(a2) };

    // reach envelope
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(base.x, base.y, L1 + L2, Math.PI, 2 * Math.PI);
    ctx.stroke();

    // ground line
    ctx.setLineDash([]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(base.x - L1 * 0.9, base.y + 18);
    ctx.lineTo(base.x + (L1 + L2) * 1.02, base.y + 18);
    ctx.stroke();
    // hatch under the ground
    ctx.lineWidth = 1;
    for (let x = base.x - L1 * 0.9; x < base.x + (L1 + L2); x += 12) {
      ctx.beginPath(); ctx.moveTo(x, base.y + 18); ctx.lineTo(x - 8, base.y + 28); ctx.stroke();
    }

    // joint angle annotations
    arc(base.x, base.y, 34, 0, q1, SERVO);
    arc(elbow.x, elbow.y, 26, q1, a2, SERVO);
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = RULE;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(base.x + 56, base.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(elbow.x, elbow.y); ctx.lineTo(elbow.x + 40 * Math.cos(q1), elbow.y - 40 * Math.sin(q1)); ctx.stroke();
    ctx.setLineDash([]);

    // links
    const link = (a, b, w) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    link(base, elbow, 22);
    link(elbow, wrist, 16);

    // base plate
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(base.x - 34, base.y + 18);
    ctx.lineTo(base.x - 22, base.y - 6);
    ctx.lineTo(base.x + 22, base.y - 6);
    ctx.lineTo(base.x + 34, base.y + 18);
    ctx.closePath(); ctx.fill();

    // joints
    const joint = (p, r) => {
      ctx.fillStyle = WHITE; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = SERVO;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.38, 0, 2 * Math.PI); ctx.fill();
    };
    joint(base, 15);
    joint(elbow, 12);

    // gripper
    ctx.save();
    ctx.translate(wrist.x, wrist.y);
    ctx.rotate(-a2);
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(14, -9); ctx.lineTo(20, -4);
    ctx.moveTo(0, 9); ctx.lineTo(14, 9); ctx.lineTo(20, 4);
    ctx.moveTo(0, -9); ctx.lineTo(0, 9);
    ctx.stroke();
    ctx.restore();

    // target crosshair; dashed tether when it's out of reach
    if (!reachable) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = SERVO; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(wrist.x, wrist.y); ctx.lineTo(target.x, target.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = SERVO; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(target.x, target.y, 7, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(target.x - 13, target.y); ctx.lineTo(target.x + 13, target.y);
    ctx.moveTo(target.x, target.y - 13); ctx.lineTo(target.x, target.y + 13);
    ctx.stroke();

    const deg = (r) => Math.round((r * 180) / Math.PI);
    t1El.textContent = deg(q1) + '°';
    t2El.textContent = deg(q2) + '°';
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  function frame(t) {
    requestAnimationFrame(frame);
    if (!visible) return;
    if (!pointerActive || t - lastPointer > 2500) {
      pointerActive = false;
      Object.assign(goal, idlePoint(t));
    }
    target.x += (goal.x - target.x) * 0.12;
    target.y += (goal.y - target.y) * 0.12;
    draw();
  }

  function track(e) {
    const r = canvas.getBoundingClientRect();
    goal.x = e.clientX - r.left;
    goal.y = e.clientY - r.top;
    pointerActive = true;
    lastPointer = performance.now();
  }

  resize();
  window.addEventListener('resize', () => { resize(); if (reduceMotion) draw(); });

  if (reduceMotion) {
    Object.assign(target, idlePoint(1800));
    draw();
    return;
  }
  window.addEventListener('pointermove', track, { passive: true });
  window.addEventListener('pointerdown', track, { passive: true });
  requestAnimationFrame(frame);
})();
