// Rising bubbles behind the page: a small nod to two-phase flow.
// Bubbles rise faster the bigger they are, wobble, drift around the pointer,
// coalesce when they touch, and pop when clicked.
(() => {
    const canvas = document.getElementById('flow');
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const MAX_R = 46;          // coalescence never grows a bubble past this
    const POINTER_R = 150;     // radius of the pointer's influence
    let W = 0, H = 0;
    let bubbles = [];
    let bursts = [];
    let colors = {};
    let last = 0;
    let running = false;
    const pointer = { x: -1e4, y: -1e4 };

    function readColors() {
        const css = getComputedStyle(document.documentElement);
        colors = {
            bubble: css.getPropertyValue('--bubble').trim() || '110, 205, 228',
            shine: css.getPropertyValue('--bubble-shine').trim() || '255, 255, 255',
        };
    }

    function reset(b, fromBottom) {
        const r = 3 + 27 * Math.pow(Math.random(), 2.2);
        b.r = r;
        b.x = Math.random() * W;
        b.y = fromBottom ? H + r + Math.random() * H * 0.3 : Math.random() * H;
        b.phase = Math.random() * Math.PI * 2;
        b.freq = 0.7 + Math.random() * 1.1;
        b.amp = 3 + r * 0.35;
        b.dx = 0;
        b.dy = 0;
        return b;
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (w === W && h === H) return;
        W = w;
        H = h;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const target = Math.round(Math.min(70, Math.max(16, (W * H) / 26000)));
        while (bubbles.length < target) bubbles.push(reset({}, false));
        bubbles.length = target;
        if (!running) draw(0);
    }

    // Where a bubble is actually drawn: base path + wobble + pointer drift
    const posX = (b) => b.x + Math.sin(b.phase) * b.amp + b.dx;
    const posY = (b) => b.y + b.dy;

    function update(dt) {
        const damping = Math.exp(-2.2 * dt);
        for (const b of bubbles) {
            b.y -= (10 + b.r * 1.15) * dt;
            b.phase += b.freq * dt;

            const ddx = posX(b) - pointer.x;
            const ddy = posY(b) - pointer.y;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < POINTER_R * POINTER_R) {
                const d = Math.sqrt(d2) || 1;
                const push = Math.pow(1 - d / POINTER_R, 2) * 320 * dt;
                b.dx += (ddx / d) * push;
                b.dy += (ddy / d) * push;
            }
            b.dx *= damping;
            b.dy *= damping;

            if (posY(b) + b.r < -20) reset(b, true);
        }

        // Coalescence: overlapping bubbles merge, conserving volume
        for (let i = 0; i < bubbles.length; i++) {
            const a = bubbles[i];
            for (let j = i + 1; j < bubbles.length; j++) {
                const b = bubbles[j];
                const dx = posX(a) - posX(b);
                const dy = posY(a) - posY(b);
                const reach = (a.r + b.r) * 0.7;
                if (dx * dx + dy * dy > reach * reach) continue;
                const va = a.r ** 3, vb = b.r ** 3;
                const r = Math.cbrt(va + vb);
                if (r > MAX_R) continue;
                a.x = (a.x * va + b.x * vb) / (va + vb);
                a.y = (a.y * va + b.y * vb) / (va + vb);
                a.r = r;
                a.amp = 3 + r * 0.35;
                reset(b, true);
            }
        }

        for (const p of bursts) {
            p.life -= dt / p.ttl;
            if (p.ring) {
                p.r += 90 * dt;
            } else {
                const drag = Math.exp(-4 * dt);
                p.vx *= drag;
                p.vy = p.vy * drag - 40 * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
            }
        }
        bursts = bursts.filter((p) => p.life > 0);
    }

    function drawBubble(x, y, r, t) {
        // Larger bubbles breathe a little: a slow oblate/prolate wobble
        const squash = r > 10 ? Math.sin(t * 2.1 + r) * 0.05 : 0;
        const rx = r * (1 + squash);
        const ry = r * (1 - squash);

        const fill = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
        fill.addColorStop(0, `rgba(${colors.bubble}, 0.02)`);
        fill.addColorStop(0.72, `rgba(${colors.bubble}, 0.06)`);
        fill.addColorStop(1, `rgba(${colors.bubble}, 0.2)`);
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${colors.bubble}, 0.38)`;
        ctx.stroke();

        if (r > 5) {
            ctx.beginPath();
            ctx.ellipse(x - rx * 0.38, y - ry * 0.42, r * 0.22, r * 0.11, -0.75, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${colors.shine}, 0.4)`;
            ctx.fill();
        }
    }

    function draw(t) {
        ctx.clearRect(0, 0, W, H);
        for (const b of bubbles) drawBubble(posX(b), posY(b), b.r, t);
        for (const p of bursts) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            if (p.ring) {
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = `rgba(${colors.bubble}, ${0.5 * p.life})`;
                ctx.stroke();
            } else {
                ctx.fillStyle = `rgba(${colors.bubble}, ${0.45 * p.life})`;
                ctx.fill();
            }
        }
    }

    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
        last = now;
        update(dt);
        draw(now / 1000);
        if (running) requestAnimationFrame(frame);
    }

    function start() {
        if (running || reduceMotion.matches) return;
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
    }

    function pop(b) {
        const x = posX(b), y = posY(b);
        bursts.push({ ring: true, x, y, r: b.r, life: 1, ttl: 0.45 });
        const n = 5 + Math.round(b.r / 5);
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
            const v = 50 + Math.random() * 90 + b.r * 2;
            bursts.push({
                x, y, r: 1 + Math.random() * 2.2,
                vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                life: 1, ttl: 0.8 + Math.random() * 0.6,
            });
        }
        reset(b, true);
    }

    window.addEventListener('pointermove', (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
    }, { passive: true });

    const forgetPointer = () => { pointer.x = pointer.y = -1e4; };
    document.documentElement.addEventListener('pointerleave', forgetPointer);
    window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') forgetPointer(); });
    window.addEventListener('blur', forgetPointer);

    window.addEventListener('pointerdown', (e) => {
        if (!running || document.body.classList.contains('is-locked')) return;
        if (e.target.closest('a, button, input, iframe, dialog, .surface')) return;
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            const dx = posX(b) - e.clientX;
            const dy = posY(b) - e.clientY;
            const hit = b.r + 6;
            if (dx * dx + dy * dy <= hit * hit) {
                pop(b);
                break;
            }
        }
    });

    reduceMotion.addEventListener('change', () => {
        if (reduceMotion.matches) {
            running = false;
            draw(0);
        } else {
            start();
        }
    });

    document.addEventListener('themechange', () => {
        readColors();
        if (!running) draw(0);
    });

    window.addEventListener('resize', resize);
    readColors();
    resize();
    start();
})();
