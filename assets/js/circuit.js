// Footer circuit: parallel traces that swap lanes like a routed PCB bus,
// with signals running along them while the footer is on screen.
(() => {
    const canvas = document.getElementById('pcb');
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const LANES = 8;

    let W = 0, H = 0, dpr = 1;
    let paths = [];
    let pads = [];
    let board = null;     // static layer, redrawn only on resize or theme change
    let visible = false;
    let running = false;
    let trace = '148, 163, 184';
    let glow = '244, 183, 64';

    function readColors() {
        const css = getComputedStyle(document.documentElement);
        trace = css.getPropertyValue('--trace').trim() || trace;
        glow = css.getPropertyValue('--glow').trim() || glow;
    }

    function generate() {
        const padY = 28;
        const spacing = (H - padY * 2) / (LANES - 1);
        const startX = 40, endX = W - 40;
        const laneY = (j) => padY + j * spacing;
        const lanes = [...Array(LANES).keys()];   // lanes[j] = path currently on lane j

        paths = lanes.map((j) => ({ points: [{ x: startX, y: laneY(j) }], vias: [] }));
        pads = lanes.flatMap((j) => [{ x: startX, y: laneY(j) }, { x: endX, y: laneY(j) }]);

        let x = startX + 20 + Math.random() * 20;
        lanes.forEach((id, j) => paths[id].points.push({ x, y: laneY(j) }));

        while (x + spacing + 40 < endX) {
            // pick non-adjacent pairs of neighbouring lanes to cross over
            const swap = Array(LANES - 1).fill(false);
            for (let j = 0; j < LANES - 1; j++) {
                if (!(j > 0 && swap[j - 1]) && Math.random() < 0.4) swap[j] = true;
            }
            if (!swap.some(Boolean)) swap[Math.floor(Math.random() * (LANES - 1))] = true;

            const nextX = x + spacing;
            lanes.forEach((id, j) => {
                const to = swap[j] ? j + 1 : j > 0 && swap[j - 1] ? j - 1 : j;
                paths[id].points.push({ x: nextX, y: laneY(to) });
            });
            swap.forEach((s, j) => { if (s) [lanes[j], lanes[j + 1]] = [lanes[j + 1], lanes[j]]; });

            x = Math.min(endX, nextX + 20 + Math.random() * 40);
            lanes.forEach((id, j) => paths[id].points.push({ x, y: laneY(j) }));
        }
        lanes.forEach((id, j) => paths[id].points.push({ x: endX, y: laneY(j) }));

        for (const path of paths) {
            const pts = path.points;
            path.segments = [];
            path.length = 0;
            for (let i = 0; i < pts.length - 1; i++) {
                const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
                path.segments.push({ a: pts[i], b: pts[i + 1], len, at: path.length });
                path.length += len;
            }
            for (let i = 1; i < pts.length - 1; i++) {
                const bends = (pts[i - 1].y === pts[i].y) !== (pts[i].y === pts[i + 1].y);
                if (bends && Math.random() < 0.6) path.vias.push(pts[i]);
            }
            path.speed = 90 + Math.random() * 110;
            path.offset = Math.random() * path.length * 2;
        }
    }

    function ring(c, x, y, outer, inner, color) {
        c.globalCompositeOperation = 'source-over';
        c.beginPath();
        c.arc(x, y, outer, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();
        c.globalCompositeOperation = 'destination-out';
        c.beginPath();
        c.arc(x, y, inner, 0, Math.PI * 2);
        c.fill();
        c.globalCompositeOperation = 'source-over';
    }

    function drawBoard() {
        board = document.createElement('canvas');
        board.width = canvas.width;
        board.height = canvas.height;
        const c = board.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const color = `rgba(${trace}, 0.22)`;

        c.lineWidth = 2;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.strokeStyle = color;
        for (const path of paths) {
            c.beginPath();
            path.points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
            c.stroke();
        }
        for (const path of paths) for (const v of path.vias) ring(c, v.x, v.y, 3.5, 1.3, color);
        for (const p of pads) ring(c, p.x, p.y, 5.5, 2.2, color);
    }

    function pointAt(path, s) {
        for (const seg of path.segments) {
            if (s <= seg.at + seg.len) {
                const t = seg.len ? (s - seg.at) / seg.len : 0;
                return { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
            }
        }
        const end = path.segments[path.segments.length - 1].b;
        return { x: end.x, y: end.y };
    }

    function draw(time) {
        ctx.clearRect(0, 0, W, H);
        if (board) ctx.drawImage(board, 0, 0, W, H);
        if (!running) return;

        // Each signal travels the whole trace, then rests for a while before repeating
        for (const path of paths) {
            const cycle = path.length * 2;
            const head = ((time * path.speed + path.offset) % cycle);
            if (head > path.length + 60) continue;
            for (let k = 0; k < 10; k++) {
                const s = head - k * 6;
                if (s < 0 || s > path.length) continue;
                const p = pointAt(path, s);
                ctx.beginPath();
                ctx.arc(p.x, p.y, k === 0 ? 2.6 : 2.2 - k * 0.15, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${glow}, ${0.9 * (1 - k / 10)})`;
                ctx.fill();
            }
        }
    }

    function loop(now) {
        draw(now / 1000);
        if (running) requestAnimationFrame(loop);
    }

    function setRunning() {
        const should = visible && !reduceMotion.matches;
        if (should === running) return;
        running = should;
        if (running) requestAnimationFrame(loop);
        else draw(0);
    }

    function resize() {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || (w === W && h === H)) return;
        W = w;
        H = h;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        generate();
        drawBoard();
        draw(0);
    }

    new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        setRunning();
    }).observe(canvas);

    reduceMotion.addEventListener('change', setRunning);
    document.addEventListener('themechange', () => {
        readColors();
        if (W) drawBoard();
        draw(0);
    });
    window.addEventListener('resize', resize);
    // The site is hidden behind the gate until it opens; size the board then too
    document.addEventListener('site:unlocked', resize);

    readColors();
    resize();
})();
