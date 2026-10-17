// Research section: renders data/scholar.json, the copy of the Google Scholar
// profile kept fresh by .github/workflows/scholar-sync.yml.
(() => {
    const metricsEl = document.getElementById('scholar-metrics');
    const pubsEl = document.getElementById('scholar-pubs');
    const updatedEl = document.getElementById('scholar-updated');
    const SELF = /\b(A\.?\s?C\.?\s?Faller|Anderson(?: Carlos)? Faller)\b/;
    const SVG = 'http://www.w3.org/2000/svg';

    function el(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (value != null) node.setAttribute(key, value);
        }
        node.append(...children.filter((child) => child != null));
        return node;
    }

    function svg(tag, attrs = {}) {
        const node = document.createElementNS(SVG, tag);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        return node;
    }

    const external = (href, attrs = {}) => ({ href, target: '_blank', rel: 'noopener', ...attrs });
    const format = (n) => new Intl.NumberFormat('en').format(n);

    function tile(label, metric, since) {
        return el('div', { class: 'tile surface' },
            el('p', { class: 'tile__label' }, label),
            el('p', { class: 'tile__value' }, format(metric.all)),
            since ? el('p', { class: 'tile__sub mono' }, `${format(metric.since)} since ${since}`) : null,
        );
    }

    // Single-series column chart: citations per year, drawn at the plot's real size
    function chart(series) {
        const plot = el('div', { class: 'chart__plot' });
        const tip = el('div', { class: 'chart__tip', hidden: '' });
        const box = el('div', { class: 'chart tile surface' },
            el('p', { class: 'tile__label' }, 'Citations per year'),
            plot,
        );
        const max = Math.max(1, ...series.map((d) => d.count));
        const peak = series.reduce((a, b) => (b.count >= a.count ? b : a), series[0]);
        const short = series.length > 6;

        function draw(W, H) {
            const top = 20, bottom = 22;
            const band = W / series.length;
            const barW = Math.max(4, Math.min(24, band - 2));
            const labelEvery = band < 30 ? 2 : 1;
            const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
                'aria-label': 'Citations per year: ' + series.map((d) => `${d.year}: ${d.count}`).join(', ') });

            series.forEach((d, i) => {
                const cx = band * i + band / 2;
                const h = ((H - top - bottom) * d.count) / max;
                const x = cx - barW / 2, y = H - bottom - h, r = Math.min(4, h, barW / 2);
                let bar = null;
                if (d.count > 0) {
                    // rounded data end, square at the baseline
                    bar = svg('path', { class: 'chart__bar', d:
                        `M${x},${H - bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} ` +
                        `Q${x + barW},${y} ${x + barW},${y + r} V${H - bottom} Z` });
                    root.appendChild(bar);
                }
                if ((series.length - 1 - i) % labelEvery === 0) {
                    const year = svg('text', { class: 'chart__year', x: cx, y: H - 6, 'text-anchor': 'middle' });
                    year.textContent = short ? `’${String(d.year).slice(-2)}` : d.year;
                    root.appendChild(year);
                }
                if (d === peak && d.count > 0) {
                    const value = svg('text', { class: 'chart__value', x: cx, y: y - 6, 'text-anchor': 'middle' });
                    value.textContent = d.count;
                    root.appendChild(value);
                }
                const hit = svg('rect', { class: 'chart__band', x: band * i, y: 0, width: band, height: H });
                hit.addEventListener('pointerenter', () => {
                    bar?.classList.add('is-hover');
                    tip.replaceChildren(el('b', {}, String(d.year)), ` · ${d.count} citation${d.count === 1 ? '' : 's'}`);
                    tip.hidden = false;
                    tip.style.left = `${cx}px`;
                    tip.style.top = `${y}px`;
                });
                hit.addEventListener('pointerleave', () => {
                    bar?.classList.remove('is-hover');
                    tip.hidden = true;
                });
                root.appendChild(hit);
            });
            root.appendChild(svg('line', { class: 'chart__axis', x1: 0, x2: W, y1: H - bottom + 0.5, y2: H - bottom + 0.5 }));
            plot.replaceChildren(root, tip);
        }

        let size = '';
        new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            const next = `${Math.round(width)}x${Math.round(height)}`;
            if (width > 0 && next !== size) {
                size = next;
                draw(Math.round(width), Math.round(height));
            }
        }).observe(plot);
        return box;
    }

    function authors(text) {
        const match = text.match(SELF);
        if (!match) return el('p', { class: 'pub__authors' }, text);
        return el('p', { class: 'pub__authors' },
            text.slice(0, match.index), el('strong', {}, match[0]), text.slice(match.index + match[0].length));
    }

    function publication(pub, previousYear) {
        const cites = pub.citations
            ? `${pub.citations} citation${pub.citations === 1 ? '' : 's'}`
            : null;
        return el('li', { class: pub.year === previousYear ? 'pub is-same-year' : 'pub' },
            el('span', { class: 'pub__year mono' }, pub.year ? String(pub.year) : '—'),
            el('div', { class: 'pub__body' },
                pub.url
                    ? el('a', external(pub.url, { class: 'pub__title' }), pub.title)
                    : el('span', { class: 'pub__title' }, pub.title),
                pub.authors ? authors(pub.authors) : null,
                pub.venue ? el('p', { class: 'pub__venue' }, pub.venue) : null,
            ),
            cites && pub.cited_by_url
                ? el('a', external(pub.cited_by_url, { class: 'pub__cites', 'aria-label': `${cites} on Google Scholar` }), cites)
                : cites ? el('span', { class: 'pub__cites' }, cites) : el('span'),
        );
    }

    function render(data) {
        const m = data.metrics || {};
        const since = m.since_year;
        const series = (data.citations_per_year || []).filter((d) => d.year);
        const tiles = [];
        if (m.citations) tiles.push(tile('Citations', m.citations, since));
        if (m.h_index) tiles.push(tile('h-index', m.h_index, since));
        if (m.i10_index) tiles.push(tile('i10-index', m.i10_index, since));
        tiles.push(el('div', { class: 'tile surface' },
            el('p', { class: 'tile__label' }, 'Publications'),
            el('p', { class: 'tile__value' }, format(data.publications.length)),
            el('p', { class: 'tile__sub mono' }, 'on Google Scholar'),
        ));
        if (series.length > 1) {
            metricsEl.classList.add('has-chart');
            tiles.push(chart(series));
        }
        metricsEl.replaceChildren(...tiles);

        let previousYear;
        pubsEl.replaceChildren(...data.publications.map((pub) => {
            const item = publication(pub, previousYear);
            previousYear = pub.year;
            return item;
        }));

        if (data.updated) {
            const date = new Date(data.updated).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
            updatedEl.textContent = `Synced from Google Scholar · last change ${date}`;
        } else {
            updatedEl.textContent = 'Synced from Google Scholar';
        }
    }

    function fail() {
        metricsEl.remove();
        pubsEl.replaceChildren(el('li', { class: 'scholar__empty' },
            'The publication list could not be loaded right now. The full, always up-to-date list lives on Google Scholar.'));
        updatedEl.textContent = '';
    }

    fetch('data/scholar.json', { cache: 'no-cache' })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
        .then((data) => {
            if (!Array.isArray(data.publications) || !data.publications.length) throw new Error('empty');
            render(data);
        })
        .catch(fail);
})();
