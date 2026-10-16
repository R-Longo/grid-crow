"""Stage 5B real-browser checks: the PDF the browser really downloads. Run with the dev server up (npx vite --port 5173 --host 127.0.0.1).
Opens the downloaded PDF with qpdf, pdftotext and pdftoppm and compares every stitch with the edited chart on screen.
  python3 stage5b_browser.py [desktop|mobile]"""
import json, os, re, subprocess, sys, time
from PIL import Image
from playwright.sync_api import sync_playwright
import stage5_browser as S
from stage5_browser import check, setup, grid, palette, edit, client, center_on, COLS, ROWS, OUT, ROOT, _opts

def run(cmd, **kw): return subprocess.run(cmd, capture_output=True, text=True, **kw)
def probe(n, layout):
    r = run(["npx", "vite-node", "scripts/e2e/pdf_probe.ts", str(COLS), str(ROWS), str(n), layout], cwd=ROOT, timeout=120)
    return json.loads(r.stdout.strip().splitlines()[-1])
def text(path, first=None, last=None):
    args = ["pdftotext", "-layout"] + (["-f", str(first)] if first else []) + (["-l", str(last)] if last else []) + [path, "-"]
    return run(args).stdout
def pages(path): return int(re.search(r"Pages:\s+(\d+)", run(["pdfinfo", path]).stdout).group(1))
def render(path, page, dpi):
    base = os.path.join(OUT, f"r{page}")
    run(["pdftoppm", "-r", str(dpi), "-f", str(page), "-l", str(page), "-png", path, base])
    f = [x for x in os.listdir(OUT) if x.startswith(f"r{page}-") and x.endswith(".png")][0]
    img = Image.open(os.path.join(OUT, f)).convert("RGB"); os.remove(os.path.join(OUT, f)); return img
def rgb(px): return (px[0] << 16) | (px[1] << 8) | px[2]
def near(a, b, tol=6): return all(abs(((a >> s) & 255) - ((b >> s) & 255)) <= tol for s in (0, 8, 16))

def verify_fit(tag, path, after, pal):
    used = [(h, n) for h, n in pal if n > 0]
    check(f"{tag}: qpdf finds nothing wrong with the file", run(["qpdf", "--check", path]).returncode == 0)
    P = probe(len(used), "fit")
    check(f"{tag}: Fit to one page makes {len(P)} page(s) (chart, then the color key)", pages(path) == len(P) == 2, str(pages(path)))
    t = text(path)
    check(f"{tag}: the text has the size, finished size and exact reference gauge", "96 stitches × 144 rows" in t and "24 × 32 inches" in t and "16 stitches × 18 rows per 4 inches, using worsted-weight #4 yarn and a 5 mm hook" in re.sub(r"\s+", " ", t), "")
    counts = [int(x.replace(",", "")) for x in re.findall(r"([\d,]+) stitches", t) if x.replace(",", "").isdigit()]
    want = [n for _, n in used]
    got = [int(m.replace(",", "")) for m in re.findall(r"([\d,]+) stitch(?:es)?\n|([\d,]+) stitch(?:es)?\s", t) for m in m if m]
    hexes = re.findall(r"#([0-9A-F]{6})", t)
    check(f"{tag}: the key lists every yarn color with its hex and letter", hexes[: len(used)] == [h for h, _ in used] or sorted(hexes[: len(used)]) == sorted(h for h, _ in used), str(hexes[:len(used)]))
    flat = re.sub(r"\s+", " ", t)
    check(f"{tag}: every exact stitch count from the editor appears in the key", all(f"{n:,} stitch" in flat for n in want), str(want))
    check(f"{tag}: total 13,824 stitches", "Total: 13,824 stitches (96 × 144)" in flat)
    # pixels: render the chart page and compare each stitch with the chart on screen
    dpi = 300; k = dpi / 72; c = P[0]["chart"]; img = render(path, 1, dpi)
    bad = 0
    for r in range(ROWS):
        for col in range(COLS):
            x = (c["x0"] + (col + 0.5) * c["cellW"]) * k; y = (c["y0"] + (r + 0.5) * c["cellH"]) * k
            # fit page has no letters at this size, so the middle of the stitch is the plain yarn color
            if not near(rgb(img.getpixel((int(x), int(y)))), after[r * COLS + col], 8): bad += 1
    check(f"{tag}: all {COLS*ROWS} stitches in the rendered PDF match the edited chart on screen", bad == 0, f"{bad} differ")
    check(f"{tag}: nothing is clipped: the page is white at all four edges", all(img.getpixel(p) == (255, 255, 255) for p in [(5, 5), (img.width - 6, 5), (5, img.height - 6), (img.width - 6, img.height - 6)]))
    img.resize((img.width // 3, img.height // 3), Image.LANCZOS).save(os.path.join(OUT, f"{tag.replace(' ', '_')}_page1.png"))

def verify_tiled(tag, path, after, pal):
    used = [(h, n) for h, n in pal if n > 0]
    check(f"{tag}: qpdf finds nothing wrong with the file", run(["qpdf", "--check", path]).returncode == 0)
    P = probe(len(used), "tiled")
    check(f"{tag}: Large print makes 17 pages (overview + 16 chart pages)", pages(path) == 17 == len(P), str(pages(path)))
    first = re.sub(r"\s+", " ", text(path, 1, 1))
    check(f"{tag}: the overview says to print pages 2–17 at 100% and shows page numbers", "Print pages 2–17 at 100% (Actual size)" in first and all(str(n) in first for n in range(2, 18)), "")
    check(f"{tag}: the overview has exact counts and the gauge", all(f"{n:,} stitch" in first for _, n in used) and "worsted-weight #4 yarn and a 5 mm hook" in first)
    t7 = re.sub(r"\s+", " ", text(path, 7, 7))
    check(f"{tag}: page 7 prints global ranges (columns 25–48, rows 73–108) and its neighbours", "Columns 25–48 of 96" in t7 and "Rows 73–108 of 144" in t7 and "Page 7 of 17" in t7 and all(f"Joins page {n}" in t7 for n in (6, 8)), t7[:200])
    # every stitch, every page, read from rendered pixels; then each stitch must be seen exactly once
    dpi = 144; k = dpi / 72; seen = [0] * (COLS * ROWS); bad = 0
    for pg in P[1:]:
        t = pg["tile"]; c = pg["chart"]; img = render(path, t["page"], dpi)
        for r in range(t["r0"], t["r1"]):
            for col in range(t["c0"], t["c1"]):
                x = (c["x0"] + (col - t["c0"]) * c["cellW"] + 3) * k; y = (c["y0"] + (r - t["r0"]) * c["cellH"] + 3) * k  # near a corner: clear of the letter
                seen[r * COLS + col] += 1
                if not near(rgb(img.getpixel((int(x), int(y)))), after[r * COLS + col], 8): bad += 1
        if t["page"] == 7:
            # alignment marks: the joining edges are heavy black lines, the outer edge of page 2 is a thin border
            def dark_run(im, y, x_from, x_to):
                run_, best = 0, 0
                for xx in range(x_from, x_to):
                    run_ = run_ + 1 if sum(im.getpixel((xx, y))) < 150 else 0; best = max(best, run_)
                return best
            ym = int((c["y0"] + 20 * c["cellH"] + 8) * k) # in the middle of a row, away from grid lines
            xl = int(c["x0"] * k)
            check(f"{tag}: page 7 has a bold dark line on its left joining edge (about 3 pt)", dark_run(img, ym, xl - 14, xl + 14) >= 5, str(dark_run(img, ym, xl - 14, xl + 14)))
            # row line 3 down from this page's top is a global multiple of 5 (row 105/106): a tick sticks out into the margin there; line 1 is not, so nothing does
            yt = int((c["y0"] + 3 * c["cellH"]) * k); yn = int((c["y0"] + 1 * c["cellH"]) * k)
            tick = sum(1 for xx in range(xl - 17, xl - 7) if sum(img.getpixel((xx, yt))) < 150)
            none = sum(1 for xx in range(xl - 17, xl - 7) if sum(img.getpixel((xx, yn))) < 150)
            check(f"{tag}: ... with registration ticks sticking out into the margin at every 5th stitch line, and only there", tick >= 7 and none == 0, f"{tick} dark px at a tick line, {none} at a non-tick line")
            img.resize((img.width // 2, img.height // 2), Image.LANCZOS).save(os.path.join(OUT, f"{tag.replace(' ', '_')}_page7.png"))
        if t["page"] == 2:
            xl = int(c["x0"] * k); ym = int((c["y0"] + 20 * c["cellH"] + 8) * k)
            run_ = 0; best = 0
            for xx in range(xl - 14, xl + 14):
                run_ = run_ + 1 if sum(img.getpixel((xx, ym))) < 150 else 0; best = max(best, run_)
            check(f"{tag}: page 2's outer left edge is a thin border, not a joining line", 1 <= best <= 3, str(best))
    check(f"{tag}: every one of the {COLS*ROWS} stitches appears on exactly one page", all(v == 1 for v in seen))
    check(f"{tag}: ... and its rendered color matches the edited chart on screen", bad == 0, f"{bad} differ")

def desktop(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True); page = ctx.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    setup(page)
    png, pdf = page.locator("[data-testid=download-png]"), page.locator("[data-testid=download-pdf]")
    check("5B desktop: Download PNG stays the first, primary button; Download PDF is below it", png.is_visible() and pdf.is_visible() and png.bounding_box()["y"] < pdf.bounding_box()["y"])
    check("5B desktop: PDF defaults to Fit to one page, letters on; PNG letters off; no printing help showing",
          page.locator("[data-testid=pdf-fit]").is_checked() and not page.locator("[data-testid=pdf-tiled]").is_checked() and page.locator("[data-testid=pdf-letters]").is_checked()
          and not page.locator("[data-testid=png-letters]").is_checked() and page.locator("[data-testid=pdf-tiled-help]").count() == 0)
    check("5B desktop: both buttons are at least 44px tall", min(png.bounding_box()["height"], pdf.bounding_box()["height"]) >= 44)
    before = grid(page); edit(page); after = grid(page); pal = palette(page)
    # keyboard: the layout radios work with the arrow keys
    page.locator("[data-testid=pdf-fit]").focus(); page.keyboard.press("ArrowDown"); time.sleep(0.2)
    check("5B desktop: arrow keys move between the layout choices", page.locator("[data-testid=pdf-tiled]").is_checked() and page.locator("[data-testid=pdf-tiled-help]").is_visible())
    help_t = page.locator("[data-testid=pdf-tiled-help]").inner_text()
    check("5B desktop: choosing Large print shows the page count and 'Print at 100%'", "17 pages" in help_t and "100%" in help_t, help_t)
    page.locator("[data-testid=pdf-fit]").check(); time.sleep(0.2)
    check("5B desktop: choosing Fit hides the printing help again", page.locator("[data-testid=pdf-tiled-help]").count() == 0)
    # Fit to one page
    with page.expect_download(timeout=60000) as dl: pdf.click()
    path = os.path.join(OUT, "desktop_fit.pdf"); dl.value.save_as(path)
    check("5B desktop: file is named gridcrow-pattern-96x144.pdf", dl.value.suggested_filename == "gridcrow-pattern-96x144.pdf", dl.value.suggested_filename)
    time.sleep(0.4)
    check("5B desktop: a 'Downloaded ...pdf' message appears", "Downloaded gridcrow-pattern-96x144.pdf" in page.locator("[data-testid=download-note]").inner_text())
    check("5B desktop: exporting did not change the chart", grid(page) == after)
    verify_fit("5B desktop fit", path, after, pal)
    # Large print
    page.locator("[data-testid=pdf-tiled]").check()
    with page.expect_download(timeout=90000) as dl2: pdf.click()
    path2 = os.path.join(OUT, "desktop_tiled.pdf"); dl2.value.save_as(path2)
    check("5B desktop: Large print file is named ...-large-print.pdf", dl2.value.suggested_filename == "gridcrow-pattern-96x144-large-print.pdf", dl2.value.suggested_filename)
    verify_tiled("5B desktop tiled", path2, after, pal)
    # PNG letters option
    page.locator("[data-testid=png-letters]").check()
    with page.expect_download(timeout=60000) as dl3: png.click()
    p3 = os.path.join(OUT, "desktop_letters.png"); dl3.value.save_as(p3)
    img = Image.open(p3).convert("RGB"); L = S.probe(len([1 for _, n in pal if n > 0]))
    diff = sum(1 for r in range(0, ROWS, 4) for c in range(0, COLS, 4)
               if rgb(img.getpixel((int(L["x0"] + (c + .5) * L["cellW"]), int(L["y0"] + (r + .5) * L["cellH"])))) != after[r * COLS + c])
    check("5B desktop: with 'letters' ticked the PNG has letters inside the stitches (center pixels are ink)", diff > 0.3 * (ROWS // 4) * (COLS // 4), str(diff))
    page.locator("[data-testid=png-letters]").uncheck()
    with page.expect_download(timeout=60000) as dl4: png.click()
    p4 = os.path.join(OUT, "desktop_clean.png"); dl4.value.save_as(p4)
    img = Image.open(p4).convert("RGB")
    diff = sum(1 for r in range(0, ROWS, 4) for c in range(0, COLS, 4)
               if rgb(img.getpixel((int(L["x0"] + (c + .5) * L["cellW"]), int(L["y0"] + (r + .5) * L["cellH"])))) != after[r * COLS + c])
    check("5B desktop: with it unticked (the default) the PNG is clean color blocks", diff == 0, str(diff))
    check("5B desktop: no page errors", not errors, "; ".join(errors)[:200])
    b.close()

def mobile(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2, accept_downloads=True); page = ctx.new_page()
    cdp = ctx.new_cdp_session(page); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    setup(page)
    before = grid(page); edit(page, cdp); after = grid(page); pal = palette(page)
    opener = page.locator("[data-testid=download-open]"); opener.tap(); time.sleep(0.3)
    png, pdf = page.locator("[data-testid=download-png]"), page.locator("[data-testid=download-pdf]")
    check("5B phone: the Download panel has both Download PNG (first) and Download PDF", png.is_visible() and pdf.count() == 1)
    pdf.scroll_into_view_if_needed(); time.sleep(0.2)
    bb = pdf.bounding_box()
    check("5B phone: Download PDF is at least 44px tall and inside the screen", bb["height"] >= 44 and bb["x"] >= 0 and bb["x"] + bb["width"] <= 390, str(bb))
    for tid in ("pdf-fit", "pdf-tiled", "pdf-letters", "png-letters"):
        lab = page.locator(f"[data-testid={tid}]").locator("xpath=ancestor::label")
        bx = lab.bounding_box(); check(f"5B phone: the '{tid}' choice is a big touch target (label at least 44px tall, inside the screen)", bx["height"] >= 44 and bx["x"] >= 0 and bx["x"] + bx["width"] <= 390, str(bx))
    check("5B phone: the page does not scroll sideways", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    page.locator("[data-testid=pdf-tiled]").locator("xpath=ancestor::label").tap(); time.sleep(0.3)
    check("5B phone: tapping Large print shows the page count help inside the screen", page.locator("[data-testid=pdf-tiled-help]").is_visible() and "17 pages" in page.locator("[data-testid=pdf-tiled-help]").inner_text())
    page.screenshot(path=os.path.join(OUT, "mobile_pdf_panel.png"))
    page.locator("[data-testid=pdf-fit]").locator("xpath=ancestor::label").tap(); time.sleep(0.2)
    with page.expect_download(timeout=90000) as dl: pdf.tap()
    path = os.path.join(OUT, "mobile_fit.pdf"); dl.value.save_as(path)
    check("5B phone: the PDF download starts from a tap, named gridcrow-pattern-96x144.pdf", dl.value.suggested_filename == "gridcrow-pattern-96x144.pdf", dl.value.suggested_filename)
    time.sleep(0.3)
    check("5B phone: the confirmation shows in the panel", "Downloaded gridcrow-pattern-96x144.pdf" in page.locator("[data-testid=download-note]").inner_text())
    verify_fit("5B phone fit", path, after, pal)
    page.locator("[data-testid=pdf-tiled]").locator("xpath=ancestor::label").tap(); time.sleep(0.2)
    with page.expect_download(timeout=90000) as dl2: pdf.tap()
    path2 = os.path.join(OUT, "mobile_tiled.pdf"); dl2.value.save_as(path2)
    verify_tiled("5B phone tiled", path2, after, pal)
    check("5B phone: no page errors", not errors, "; ".join(errors)[:200])
    b.close()

if __name__ == "__main__":
    with sync_playwright() as p:
        which = sys.argv[1] if len(sys.argv) > 1 else "all"
        if which in ("all", "desktop"): desktop(p)
        if which in ("all", "mobile"): mobile(p)
    bad = [r for r in S.results if not r[1]]
    print(f"\n{len(S.results)-len(bad)}/{len(S.results)} checks passed"); sys.exit(1 if bad else 0)
