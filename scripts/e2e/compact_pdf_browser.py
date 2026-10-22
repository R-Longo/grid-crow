"""Compact PDF choice: offered next to Large print, fewer pages, own file name, on desktop and phone."""
import re, subprocess, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"; IMG = "/tmp/claude-0/scratch/hyb/sun-card-34.png"
ok = bad = 0
def check(n, c, d=""):
    global ok, bad
    if c: ok += 1
    else: bad += 1; print(f"FAIL {n}  [{d}]")
def pages(path):
    out = subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout
    return int(re.search(r"Pages:\s+(\d+)", out).group(1))
def run(p):
    b = p.chromium.launch()
    for (w, h, touch) in [(1440, 900, False), (390, 844, True)]:
        tag = f"{w}x{h}"
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, accept_downloads=True); pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector(".upload"); pg.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG); time.sleep(1)
        pg.locator('input[type=radio][value="24x32"]').check(force=True); time.sleep(0.3)
        pg.get_by_role("button", name=re.compile("Create My Crochet Grid")).click(); pg.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=90000); time.sleep(1)
        if touch: pg.get_by_role("button", name="Download").click(); time.sleep(0.3)
        check(f"{tag}: Compact is offered next to Large print", pg.locator("[data-testid=pdf-compact]").count() == 1 and pg.locator("[data-testid=pdf-tiled]").count() == 1)
        out = {}
        for key, name in (("tiled", "large"), ("compact", "compact")):
            pg.locator(f"[data-testid=pdf-{key}]").check(force=True); time.sleep(0.3)
            help_ = pg.locator(f"[data-testid=pdf-{key}-help]").inner_text()
            with pg.expect_download(timeout=90000) as d: pg.locator("[data-testid=download-pdf]").click()
            path = f"/tmp/claude-0/scratch/cmp_{name}_{w}.pdf"; d.value.save_as(path); out[name] = (pages(path), d.value.suggested_filename, help_)
        check(f"{tag}: Large print still 17 pages", out["large"][0] == 17 and out["large"][1].endswith("large-print.pdf"), str(out["large"][:2]))
        check(f"{tag}: Compact is 10 pages with its own file name", out["compact"][0] == 10 and out["compact"][1].endswith("compact.pdf"), str(out["compact"][:2]))
        check(f"{tag}: the page count in the help text matches", "10 pages" in out["compact"][2] and "smaller than the finished piece" in out["compact"][2], out["compact"][2][:80])
        check(f"{tag}: no page errors", not errs, str(errs[:1]))
        ctx.close()
    b.close(); print(f"{ok}/{ok + bad} checks passed")
with sync_playwright() as p: run(p)
