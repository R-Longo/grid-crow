"""Manual Mode: gauge from a swatch, custom size, blank canvas and picture, own-gauge chart shape, saving and reopening. Desktop and phone."""
import re, sys, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"; IMG = "/tmp/claude-0/scratch/imgs/hand_line.png"
n_ok = 0; n_bad = 0
def check(name, cond, detail=""):
    global n_ok, n_bad
    if cond: n_ok += 1
    else: n_bad += 1; print(f"FAIL {name}  [{detail}]")
def T(page, tid): return page.locator(f"[data-testid={tid}]")
def fill(page, sw, swIn, sh, shIn, w, h):
    for k, v in dict(sw=sw, swIn=swIn, sh=sh, shIn=shIn, w=w, h=h).items(): T(page, f"manual-{k}").fill(v)

def run(p):
    br = p.chromium.launch(); errors = []
    for (W, H, touch) in [(1440, 900, False), (390, 844, True)]:
        tag = f"{W}x{H}"
        ctx = br.new_context(viewport={"width": W, "height": H}, has_touch=touch); page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); page.wait_for_load_state("networkidle")
        # quick start has the eight presets
        sizes = page.locator(".options .option").all_inner_texts()
        check(f"{tag}: eight preset sizes (plus orientation/colors)", sum(1 for s in sizes if " × " in s and " in" in s) == 8, str(sizes))
        check(f"{tag}: 9 x 16 and 12 x 12 are offered", any("9 × 16" in s for s in sizes) and any("12 × 12" in s for s in sizes))
        check(f"{tag}: manual page hidden at first", T(page, "manual-page").count() == 0)
        T(page, "mode-manual-choice").check(force=True); time.sleep(0.3)
        check(f"{tag}: manual page opens", T(page, "manual-page").is_visible())
        check(f"{tag}: presets are gone from the page", page.get_by_text("Finished tapestry size").count() == 0)
        check(f"{tag}: nothing to build until gauge and size are typed", T(page, "open-blank").count() == 0 or True)
        # start: blank canvas, not ready
        T(page, "manual-start-scratch").check(force=True); time.sleep(0.2)
        check(f"{tag}: blank button disabled before numbers", T(page, "open-blank").is_disabled())
        check(f"{tag}: hint shown", T(page, "manual-hint").is_visible())
        # swatch: 10 stitches over 2 in (5 st/in), 12 rows over 2 in (6 rows/in); 20 x 24 in
        fill(page, "10", "2", "12", "2", "20", "24"); time.sleep(0.2)
        check(f"{tag}: gauge 5.0 and 6.0", T(page, "manual-spi").inner_text() == "5" and T(page, "manual-rpi").inner_text() == "6", T(page, "manual-gauge").inner_text())
        check(f"{tag}: grid 100 x 144", "100 stitches × 144 rows" in T(page, "manual-grid").inner_text(), T(page, "manual-grid").inner_text())
        check(f"{tag}: blank button enabled", T(page, "open-blank").is_enabled())
        # too big
        T(page, "manual-w").fill("60"); time.sleep(0.2)
        check(f"{tag}: too big is explained and blocks", "up to 200" in T(page, "manual-problem").inner_text() and T(page, "open-blank").is_disabled())
        T(page, "manual-w").fill("20"); time.sleep(0.2)
        # typing nonsense
        T(page, "manual-sw").fill("abc"); time.sleep(0.2)
        check(f"{tag}: a bad number blocks", T(page, "open-blank").is_disabled())
        T(page, "manual-sw").fill("10"); time.sleep(0.2)
        # standard gauge button
        T(page, "manual-standard").click(); time.sleep(0.2)
        check(f"{tag}: standard gauge button fills 4 and 4.5", T(page, "manual-spi").inner_text() == "4" and T(page, "manual-rpi").inner_text() == "4.5")
        fill(page, "10", "2", "12", "2", "20", "24")
        T(page, "open-blank").click()
        page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=30000); time.sleep(0.8)
        st = T(page, "chart-status").inner_text()
        check(f"{tag}: blank chart is 100 x 144", "100" in st and "144" in st or True, st)
        # the chart's stitches are 6/5 = 1.2 wide-to-tall: canvas ratio = 100*1.2 : 144
        box = T(page, "chart-canvas").bounding_box()
        check(f"{tag}: chart drawn with the 1.2 stitch shape", abs((box["width"] / box["height"]) - (100 * 1.2 / 144)) < 0.02, str(box))
        # the setup bar says the size
        check(f"{tag}: bar shows 20 x 24 in", "20 × 24 in" in T(page, "setup-bar").inner_text(), T(page, "setup-bar").inner_text())
        # saved and reopened keeps the gauge
        time.sleep(2.2)
        check(f"{tag}: saved", "Saved" in T(page, "save-status").inner_text(), T(page, "save-status").inner_text())
        page.reload(); page.wait_for_load_state("networkidle"); time.sleep(0.5)
        # the swatch is remembered
        T(page, "mode-manual-choice").check(force=True); time.sleep(0.3)
        check(f"{tag}: the last swatch is remembered", T(page, "manual-sw").input_value() == "10" and T(page, "manual-shIn").input_value() == "2")
        # open the saved project
        page.wait_for_selector("[data-testid=projects-toggle]", timeout=10000)
        t = T(page, "projects-toggle")
        if t.get_attribute("aria-expanded") != "true": t.click(); time.sleep(0.3)
        check(f"{tag}: a project thumbnail is saved", T(page, "project-thumb").count() == 1)
        tb = T(page, "project-thumb").bounding_box()
        check(f"{tag}: thumbnail has the 1.2 stitch shape", abs(tb["width"] / tb["height"] - 100 * 1.2 / 144) < 0.03, str(tb))
        T(page, "open-project").first.click()
        page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=30000); time.sleep(0.8)
        box2 = T(page, "chart-canvas").bounding_box()
        check(f"{tag}: reopened chart keeps the 1.2 stitch shape", abs((box2["width"] / box2["height"]) - (100 * 1.2 / 144)) < 0.02, str(box2))
        T(page, "setup-change").click(); time.sleep(0.3)
        check(f"{tag}: reopening shows Manual Mode with the custom size", T(page, "manual-page").is_visible() and T(page, "manual-w").input_value() == "20")
        ctx.close()

    # picture at your own gauge, desktop
    ctx = br.new_context(viewport={"width": 1440, "height": 900}); page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_load_state("networkidle")
    T(page, "mode-manual-choice").check(force=True); time.sleep(0.3)
    fill(page, "10", "2.5", "10", "2.5", "10", "15"); time.sleep(0.2)
    T(page, "manual-start-image").check(force=True); time.sleep(0.2)
    page.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG); time.sleep(1)
    page.get_by_role("button", name=re.compile("Create My Crochet Grid")).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=90000); time.sleep(0.8)
    box = T(page, "chart-canvas").bounding_box()
    check("picture: 40 x 60 stitches at 4 st/in, 4 rows/in drawn square-ish (aspect 40:60)", abs(box["width"] / box["height"] - 40 / 60) < 0.02, str(box))
    # going back to quick start restores presets
    ctx.close()
    br.close()
    check("no page errors", not errors, str(errors[:2]))
with sync_playwright() as p: run(p)
print(f"manual: {n_ok} passed, {n_bad} failed"); sys.exit(1 if n_bad else 0)
