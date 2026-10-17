#!/usr/bin/env python3
"""Mirror a Google Scholar profile into data/scholar.json.

GitHub Pages is static and Google Scholar forbids iframes and cross-origin
requests, so the site can't proxy Scholar live. Instead this script scrapes the
public profile and the page renders the JSON it writes.

It runs from .github/workflows/scholar-sync.yml. Scholar sometimes answers
cloud IPs with a CAPTCHA; when that happens nothing is overwritten and the
site keeps the last good copy. It also runs fine from a home connection:

    pip install beautifulsoup4
    python scripts/sync_scholar.py
"""

import datetime as dt
import json
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

USER_ID = "75eaBvIAAAAJ"
BASE = "https://scholar.google.com"
PAGE_SIZE = 100
OUT = Path(__file__).resolve().parent.parent / "data" / "scholar.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


class Blocked(Exception):
    """Scholar answered with a CAPTCHA, a rate limit, or a page we can't read."""


def fetch(url, attempts=3):
    for attempt in range(1, attempts + 1):
        try:
            with urlopen(Request(url, headers=HEADERS), timeout=30) as resp:
                final_url = resp.geturl()
                html = resp.read().decode("utf-8", "replace")
            if "/sorry/" in final_url or "gsc_prf_in" not in html:
                raise Blocked(f"unexpected page at {final_url}")
            return html
        except (Blocked, HTTPError, URLError) as err:
            if attempt == attempts:
                raise Blocked(str(err)) from err
            wait = 20 * attempt
            print(f"attempt {attempt} failed ({err}); retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)


def text(node):
    return re.sub(r"\s+", " ", node.get_text()).strip() if node else ""


def to_int(value):
    digits = re.sub(r"\D", "", value or "")
    return int(digits) if digits else 0


def parse_metrics(soup):
    table = soup.find(id="gsc_rsb_st")
    if not table:
        return None
    since = re.search(r"\d{4}", " ".join(text(th) for th in table.select("thead th")))
    metrics = {"since_year": int(since.group()) if since else None}
    keys = {"citations": "citations", "h-index": "h_index", "i10-index": "i10_index"}
    for tr in table.select("tbody tr"):
        key = keys.get(text(tr.select_one(".gsc_rsb_sc1")).lower())
        values = [to_int(text(td)) for td in tr.select(".gsc_rsb_std")]
        if key and len(values) == 2:
            metrics[key] = {"all": values[0], "since": values[1]}
    return metrics


def parse_histogram(soup):
    # Years are listed in full; bars exist only for years with citations, and
    # each bar's z-index counts its position back from the most recent year.
    hist = soup.select_one(".gsc_md_hist_b") or soup
    years = [to_int(text(s)) for s in hist.select(".gsc_g_t")]
    counts = [0] * len(years)
    for bar in hist.select(".gsc_g_a"):
        pos = re.search(r"z-index:\s*(\d+)", bar.get("style", ""))
        if pos and 1 <= int(pos.group(1)) <= len(years):
            counts[-int(pos.group(1))] = to_int(text(bar.select_one(".gsc_g_al")))
    return [{"year": y, "count": c} for y, c in zip(years, counts)]


def parse_publications(soup):
    pubs = []
    for row in soup.select("tr.gsc_a_tr"):
        title = row.select_one("a.gsc_a_at")
        if not title:
            continue
        href = title.get("href", "")
        if "citation_for_view" not in href:
            href = title.get("data-href", "")
        pub_id = re.search(r"citation_for_view=([\w-]+:[\w-]+)", href)

        gray = row.select("td.gsc_a_t .gs_gray")
        venue = gray[1] if len(gray) > 1 else None
        if venue:
            for year_suffix in venue.select(".gs_oph"):
                year_suffix.decompose()

        cites = row.select_one("a.gsc_a_ac")
        year = to_int(text(row.select_one(".gsc_a_y span")))

        pubs.append({
            "title": text(title),
            "authors": text(gray[0]) if gray else "",
            "venue": text(venue),
            "year": year or None,
            "citations": to_int(text(cites)),
            "url": (
                f"{BASE}/citations?view_op=view_citation&hl=en&user={USER_ID}"
                f"&citation_for_view={pub_id.group(1)}"
                if pub_id else None
            ),
            "cited_by_url": urljoin(BASE, cites["href"]) if cites and text(cites) and cites.get("href") else None,
        })
    return pubs


def scrape():
    profile_url = f"{BASE}/citations?user={USER_ID}"
    pubs, start = [], 0
    while True:
        html = fetch(f"{profile_url}&hl=en&sortby=pubdate&cstart={start}&pagesize={PAGE_SIZE}")
        soup = BeautifulSoup(html, "html.parser")
        if start == 0:
            data = {
                "profile": {
                    "id": USER_ID,
                    "name": text(soup.find(id="gsc_prf_in")),
                    "affiliation": text(soup.select_one(".gsc_prf_il")),
                    "url": profile_url,
                },
                "metrics": parse_metrics(soup),
                "citations_per_year": parse_histogram(soup),
            }
        page = parse_publications(soup)
        pubs += page
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
        time.sleep(5)

    if not data["profile"]["name"] or not data["metrics"] or not pubs:
        raise Blocked("profile page parsed but name, metrics or publications are missing")
    data["publications"] = sorted(pubs, key=lambda p: p["year"] or 0, reverse=True)
    return data


def main():
    try:
        data = scrape()
    except Blocked as err:
        print(f"::error::Google Scholar could not be read: {err}", file=sys.stderr)
        return 1

    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    previous.pop("updated", None)
    if data == previous:
        print("Scholar data unchanged")
        return 0

    data["updated"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(data['publications'])} publications to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
