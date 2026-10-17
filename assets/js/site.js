// Page behaviour: theme, navigation, reveal-on-scroll and small interactions.
(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.getElementById('year').textContent = new Date().getFullYear();

    // ---------- theme ----------

    const lichess = document.getElementById('lichess');
    const themeMeta = document.querySelector('meta[name="theme-color"]');

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        themeMeta.setAttribute('content', theme === 'light' ? '#f5f3ee' : '#0a0e14');
        const src = `https://lichess.org/training/frame?theme=brown&bg=${theme}`;
        if (lichess.getAttribute('src') !== src) lichess.setAttribute('src', src);
        document.dispatchEvent(new Event('themechange'));
    }

    document.querySelectorAll('.js-theme').forEach((button) => {
        button.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
            applyTheme(next);
        });
    });

    // Follow the system theme until the visitor picks one
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
        let saved = null;
        try { saved = localStorage.getItem('theme'); } catch (err) { /* private mode */ }
        if (!saved) applyTheme(e.matches ? 'light' : 'dark');
    });

    applyTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

    // ---------- navigation ----------

    const nav = document.getElementById('nav');
    const links = document.getElementById('nav-links');
    const menuButton = document.getElementById('menu-btn');

    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    function setMenu(open) {
        links.classList.toggle('is-open', open);
        menuButton.setAttribute('aria-expanded', String(open));
        menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        menuButton.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    }
    menuButton.addEventListener('click', () => setMenu(!links.classList.contains('is-open')));
    links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

    // Highlight the section currently in view
    const navLinks = [...links.querySelectorAll('a')];
    const spy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            navLinks.forEach((a) => a.classList.toggle('is-active', a.hash === `#${entry.target.id}`));
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    navLinks.forEach((a) => {
        const section = document.querySelector(a.hash);
        if (section) spy.observe(section);
    });

    // ---------- reveal on scroll ----------

    const revealer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            revealer.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    // Hold the hero back until the door opens, so its entrance is seen
    const hero = [...document.querySelectorAll('.hero .reveal')];
    document.querySelectorAll('.reveal').forEach((el) => { if (!hero.includes(el)) revealer.observe(el); });
    document.addEventListener('site:opening', () => hero.forEach((el) => el.classList.add('is-visible')));

    // ---------- "off the clock" typer ----------

    const typer = document.getElementById('typer');
    const words = ['kung fu', 'chess', 'home brewing', 'heavy metal', 'Lines of Action',
        'black holes', 'square packing', 'electronics', 'progressive rock', 'Tak'];

    function startTyper() {
        let w = 0;
        if (reduceMotion) {
            setInterval(() => { w = (w + 1) % words.length; typer.textContent = words[w]; }, 2600);
            return;
        }
        let i = words[0].length;
        let deleting = false;
        const tick = () => {
            const word = words[w];
            if (!deleting && i === word.length) {
                deleting = true;
                return setTimeout(tick, 1900);
            }
            if (deleting && i === 0) {
                deleting = false;
                w = (w + 1) % words.length;
                return setTimeout(tick, 260);
            }
            i += deleting ? -1 : 1;
            typer.textContent = word.slice(0, i);
            setTimeout(tick, deleting ? 38 : 70 + Math.random() * 60);
        };
        tick();
    }
    document.addEventListener('site:unlocked', startTyper, { once: true });

    // ---------- interest cards: glow follows the pointer ----------

    document.getElementById('bento').addEventListener('pointermove', (e) => {
        const card = e.target.closest('.card');
        if (!card) return;
        const box = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - box.left}px`);
        card.style.setProperty('--my', `${e.clientY - box.top}px`);
    });

    // ---------- copy email ----------

    const copyButton = document.getElementById('copy-email');
    const copyStatus = document.getElementById('copy-status');
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(copyButton.dataset.email);
            copyStatus.textContent = 'copied';
        } catch (e) {
            copyStatus.textContent = 'press ctrl+c';
            getSelection().selectAllChildren(document.querySelector('.contact__address'));
        }
        setTimeout(() => { copyStatus.textContent = ''; }, 2200);
    });

    // ---------- a souvenir from the door ----------

    document.addEventListener('gate:solved', (e) => {
        const n = e.detail.moves;
        document.getElementById('door-moves').textContent = `door opened in ${n} move${n === 1 ? '' : 's'}`;
    });
})();
