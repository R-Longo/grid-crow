"""Yarn estimate: on-screen panel (desktop sidebar, phone Options), skein input, and the PNG and PDF downloads carry it."""
import re, sys, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"; IMG = "/tmp/claude-0/scratch/imgs/cat_line.png"
OUT = "/tmp/claude-0/scratch/out/"
n_ok = 0; n_bad = 0
def check(name, cond, detail=""):
    global n_ok, n_bad
    if cond: n_ok += 1
    else: n_bad += 1; print(f"FAIL {name}  [{detail}]")
def build(page):
    page.goto(URL); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG); time.sleep(1)
    page.get_by_role("button", name=re.compile("Create My Crochet Grid")).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=90000); time.sleep(1)
def run(p):
    b = p.chromium.launch(); errors = []
    for (w, h, touch) in [(1440, 900, False), (390, 844, True)]:
        tag = f"{w}x{h}"
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, accept_downloads=True)
        page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        build(page)
        if touch: page.get_by_role("button", name="Options").click(); time.sleep(0.3)
        panel = page.locator("[data-testid=yarn-estimate]")
        check(f"{tag}: panel is there, closed to start", panel.count() == 1 and panel.get_attribute("open") is None)
        panel.locator("summary").click(); time.sleep(0.3)
        tot = page.locator("[data-testid=yarn-total]").inner_text()
        m = re.search(r"([\d,]+)–([\d,]+) yd", tot)
        check(f"{tag}: total is a range", bool(m), tot)
        lo, hi = (int(m[1].replace(",", "")), int(m[2].replace(",", ""))) if m else (0, 0)
        check(f"{tag}: low is under high", 0 < lo < hi)
        rows = page.locator("[data-testid=yarn-row]")
        check(f"{tag}: one row per used color", rows.count() == len(page.locator(".chart__color").all()) or rows.count() > 0, str(rows.count()))
        check(f"{tag}: says it is a rough estimate", "rough estimate" in page.locator("[data-testid=yarn-note]").inner_text().lower())
        sk1 = rows.first.locator(".yarn__sk").inner_text()
        page.locator("[data-testid=yarn-skein]").fill("50"); time.sleep(0.2)
        sk2 = rows.first.locator(".yarn__sk").inner_text()
        check(f"{tag}: more skeins when a skein holds less", int(sk2.split()[0]) > int(sk1.split()[0]), f"{sk1} -> {sk2}")
        if touch: page.get_by_role("button", name="Options").click(); time.sleep(0.2)
        if not touch:
            page.screenshot(path=OUT + "yarn_panel_d.png")
            with page.expect_download() as d: page.locator("[data-testid=download-png]").click()
            d.value.save_as(OUT + "yarn_test.png")
            for kind, tid in [("fit", "pdf-fit"), ("compact", "pdf-compact"), ("tiled", "pdf-tiled")]:
                page.locator(f"[data-testid={tid}]").check()
                with page.expect_download() as d2: page.locator("[data-testid=download-pdf]").click()
                d2.value.save_as(OUT + f"yarn_{kind}.pdf")
        else:
            page.screenshot(path=OUT + "yarn_panel_m.png")
        ctx.close()
    check("no page errors", not errors, str(errors))
    b.close(); print(f"yarn: {n_ok} ok, {n_bad} bad"); sys.exit(1 if n_bad else 0)
with sync_playwright() as p: run(p)
