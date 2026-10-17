// The door: a 5x5 Lights Out. All lights off (or all on) opens the site.
(() => {
    const N = 5;
    const gate = document.getElementById('gate');
    const site = document.getElementById('site');
    const board = document.getElementById('board');
    const movesEl = document.getElementById('moves');
    const hint = document.getElementById('hint');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let grid = [];
    let moves = 0;
    let solved = false;
    const cells = [];

    site.inert = true;
    site.setAttribute('aria-hidden', 'true');

    function toggle(r, c) {
        for (const [dr, dc] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < N && nc >= 0 && nc < N) grid[nr][nc] = !grid[nr][nc];
        }
    }

    function isSolved() {
        const flat = grid.flat();
        return flat.every(Boolean) || !flat.some(Boolean);
    }

    function render() {
        cells.forEach(({ el, r, c }) => {
            el.classList.toggle('is-on', grid[r][c]);
            el.setAttribute('aria-pressed', String(grid[r][c]));
        });
        movesEl.textContent = moves;
    }

    // Scramble by pressing distinct random cells, so the puzzle is always solvable
    function shuffle() {
        do {
            grid = Array.from({ length: N }, () => Array(N).fill(false));
            const order = [...Array(N * N).keys()].sort(() => Math.random() - 0.5);
            const presses = 12 + Math.floor(Math.random() * 4);
            order.slice(0, presses).forEach((i) => toggle(Math.floor(i / N), i % N));
        } while (isSolved());
        moves = 0;
        render();
    }

    function press(r, c) {
        if (solved) return;
        toggle(r, c);
        moves++;
        render();
        if (isSolved()) win(r, c);
    }

    function win(r, c) {
        solved = true;
        document.dispatchEvent(new CustomEvent('gate:solved', { detail: { moves } }));
        if (reduceMotion) return open(cells[r * N + c].el);
        cells.forEach((cell) => {
            const dist = Math.abs(cell.r - r) + Math.abs(cell.c - c);
            cell.el.style.animationDelay = `${dist * 55}ms`;
            cell.el.classList.add('is-wave');
        });
        setTimeout(() => open(cells[r * N + c].el), 650);
    }

    // Open a growing hole in the gate, centered on the last cell pressed
    function open(origin) {
        const rect = origin.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        site.inert = false;
        site.removeAttribute('aria-hidden');
        document.body.classList.remove('is-locked');
        document.dispatchEvent(new Event('site:opening'));

        const finish = () => {
            gate.hidden = true;
            document.getElementById('hero-title').focus({ preventScroll: true });
            document.dispatchEvent(new Event('site:unlocked'));
        };

        if (reduceMotion) {
            gate.classList.add('is-fading');
            setTimeout(finish, 650);
            return;
        }

        const maxR = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 80;
        const start = performance.now();
        const duration = 1100;
        const step = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            const r = eased * maxR;
            const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, #000 ${r + 60}px)`;
            gate.style.webkitMaskImage = mask;
            gate.style.maskImage = mask;
            if (t < 1) requestAnimationFrame(step);
            else finish();
        };
        requestAnimationFrame(step);
    }

    function build() {
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'cell';
                el.tabIndex = r === 0 && c === 0 ? 0 : -1;
                el.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);
                el.addEventListener('click', () => press(r, c));
                board.appendChild(el);
                cells.push({ el, r, c });
            }
        }

        // Arrow keys move between cells (one tab stop for the whole board)
        board.addEventListener('keydown', (e) => {
            const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
            const i = cells.findIndex((cell) => cell.el === document.activeElement);
            if (!step || i < 0) return;
            e.preventDefault();
            const r = Math.min(N - 1, Math.max(0, cells[i].r + step[0]));
            const c = Math.min(N - 1, Math.max(0, cells[i].c + step[1]));
            const next = cells[r * N + c].el;
            cells[i].el.tabIndex = -1;
            next.tabIndex = 0;
            next.focus();
        });
    }

    // Light chasing table: bottom row pattern -> cells to press on the top row
    function buildHint() {
        const table = [
            [[1, 1, 1, 0, 0], [0, 1, 0, 0, 0]],
            [[1, 1, 0, 1, 1], [0, 0, 1, 0, 0]],
            [[1, 0, 1, 1, 0], [0, 0, 0, 0, 1]],
            [[1, 0, 0, 0, 1], [1, 1, 0, 0, 0]],
            [[0, 1, 1, 0, 1], [1, 0, 0, 0, 0]],
            [[0, 1, 0, 1, 0], [1, 0, 0, 1, 0]],
            [[0, 0, 1, 1, 1], [0, 0, 0, 1, 0]],
        ];
        const dots = (row) => {
            const wrap = document.createElement('div');
            wrap.className = 'hint__dots';
            row.forEach((on) => {
                const dot = document.createElement('span');
                dot.className = on ? 'hint__dot is-on' : 'hint__dot';
                wrap.appendChild(dot);
            });
            return wrap;
        };
        const container = document.getElementById('hint-table');
        table.forEach(([bottom, top]) => {
            const row = document.createElement('div');
            row.className = 'hint__row';
            row.setAttribute('role', 'img');
            row.setAttribute('aria-label', `bottom ${bottom.join('')}, press on top ${top.join('')}`);
            const arrow = document.createElement('i');
            arrow.className = 'fa-solid fa-arrow-right hint__arrow';
            row.append(dots(bottom), arrow, dots(top));
            container.appendChild(row);
        });

        document.getElementById('hint-open').addEventListener('click', () => hint.showModal());
        document.getElementById('hint-close').addEventListener('click', () => hint.close());
        // A click on the backdrop lands on the dialog itself, outside its box
        hint.addEventListener('click', (e) => {
            const box = hint.getBoundingClientRect();
            const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
            if (e.target === hint && !inside) hint.close();
        });
    }

    document.getElementById('shuffle').addEventListener('click', () => { if (!solved) shuffle(); });

    build();
    buildHint();
    shuffle();
})();
