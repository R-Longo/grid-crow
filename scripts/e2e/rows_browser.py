"""Written row-by-row PDF and the starting instructions: offered, downloads with its own file name, and says the right things."""
import re, subprocess, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"; IMG = "/tmp/claude-0/scratch/hyb/sun-card-34.png"
ok = bad = 0
def check(n, c, d=""):
    global ok, bad
    if c: ok += 1
    else: bad += 1; print(f"FAIL {n}  [{d}]")
def run(p):
    b = p.chromium.launch()
    for (w, h, touch) in [(1440, 900, False), (390, 844, True)]:
        tag = f"{w}x{h}"
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, accept_downloads=True); pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector(".upload"); pg.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG); time.sleep(1)
        pg.locator('input[type=radio][value="24x32"]').check(force=True); time.sleep(0.3)
        pg.get_by_role("button", name=re.compile("Create My Crochet Grid")).click(); pg.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=90000); time.sleep(1)
        if pg.locator("[data-testid=start-instructions]").count() == 0 and pg.get_by_role("button", name=re.compile("Options")).count(): pg.get_by_role("button", name=re.compile("Options")).first.click(); time.sleep(0.3)
        si = pg.locator("[data-testid=start-instructions]")
        check(f"{tag}: Starting instructions are on screen", si.count() >= 1)
        si.first.locator("summary").click(); time.sleep(0.2)
        txt = si.first.inner_text()
        check(f"{tag}: a 96-wide chart says Chain 97, 96 stitches per row", "Chain 97." in txt and "96 single crochet" in txt and "Chain 1, turn" in txt, txt[:200])
        if touch: pg.get_by_role("button", name="Download").click(); time.sleep(0.3)
        check(f"{tag}: Row-by-row is offered", pg.locator("[data-testid=pdf-rows]").count() == 1)
        pg.locator("[data-testid=pdf-rows]").check(force=True); time.sleep(0.3)
        with pg.expect_download(timeout=90000) as d: pg.locator("[data-testid=download-pdf]").click()
        path = f"/tmp/claude-0/scratch/rows_{w}.pdf"; d.value.save_as(path)
        check(f"{tag}: own file name", d.value.suggested_filename.endswith("row-by-row.pdf"), d.value.suggested_filename)
        t = re.sub(r"\s+", " ", subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True).stdout)
        check(f"{tag}: PDF has the foundation chain and Row 1 (RS) / Row 2 (WS)", "Chain 97." in t and "Row 1 (RS)" in t and "Row 2 (WS)" in t and "Row 144 (WS)" in t, t[:200])
        check(f"{tag}: no page errors", not errs, str(errs[:1]))
        ctx.close()
    b.close(); print(f"{ok}/{ok + bad} checks passed")
with sync_playwright() as p: run(p)
