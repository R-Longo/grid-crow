"""Add text tool: type, preview, place by tap, nudge, add as one undo step. Blank canvas, desktop and phone."""
import sys, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"
n_ok = 0; n_bad = 0
def check(name, cond, detail=""):
    global n_ok, n_bad
    if cond: n_ok += 1
    else: n_bad += 1; print(f"FAIL {name}  [{detail}]")

import re
IMG = "/tmp/claude-0/scratch/imgs/hand_line.png"
def counts(page): return [int(re.search(r"(\d+) stitches", t.get_attribute("aria-label")).group(1)) for t in page.locator(".chart__color").all()]
def tbtn(page):
    b = page.locator("button.chart__tool[aria-label=Text]")
    if not b.is_visible():
        o = page.get_by_role("button", name="Options")
        if o.count() and o.get_attribute("aria-expanded") != "true": o.click(); time.sleep(0.2)
    return b

def run(p):
    br = p.chromium.launch(); errors = []
    for (w, h, touch) in [(1440, 900, False), (390, 844, True)]:
        tag = f"{w}x{h}"
        ctx = br.new_context(viewport={"width": w, "height": h}, has_touch=touch); page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); page.wait_for_load_state("networkidle")
        page.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG); time.sleep(1)
        page.get_by_role("button", name=re.compile("Create My Crochet Grid")).click()
        page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=90000); time.sleep(0.8)
        # need a second color to write in: add one
        before = counts(page)
        tbtn(page).click(); time.sleep(0.2)
        check(f"{tag}: panel opens", page.locator("[data-testid=text-panel]").is_visible())
        check(f"{tag}: Add disabled with no text", page.locator("[data-testid=text-add]").is_disabled())
        page.locator("[data-testid=text-input]").fill("Hi")
        time.sleep(0.2)
        check(f"{tag}: size reported", "wide" in page.locator("[data-testid=text-info]").inner_text(), page.locator("[data-testid=text-info]").inner_text())
        check(f"{tag}: nothing painted by preview", counts(page) == before)
        page.locator("[data-testid=text-right]").click(); page.locator("[data-testid=text-down]").click()
        check(f"{tag}: nudge keeps nothing painted", counts(page) == before)
        # click on the chart to place: must not paint
        box = page.locator("[data-testid=chart-canvas]").bounding_box()
        page.mouse.click(box["x"] + box["width"] * 0.3, box["y"] + box["height"] * 0.3) if not touch else page.touchscreen.tap(box["x"] + box["width"] * 0.3, box["y"] + box["height"] * 0.3)
        time.sleep(0.2)
        check(f"{tag}: tapping to place does not paint", counts(page) == before, str(counts(page)))
        # switch active color to a non-background one if available
        swatches = page.locator(".chart__color")
        if swatches.count() > 1: swatches.nth(1).click()
        page.locator("[data-testid=text-add]").click(); time.sleep(0.3)
        after = counts(page)
        check(f"{tag}: lettering adds stitches", after != before and sum(after) == sum(before), f"{before} -> {after}")
        check(f"{tag}: panel closes", page.locator("[data-testid=text-panel]").count() == 0)
        page.get_by_role("button", name="Undo").click(); time.sleep(0.2)
        check(f"{tag}: one undo removes it all", counts(page) == before, str(counts(page)))
        page.get_by_role("button", name="Redo").click(); time.sleep(0.2)
        check(f"{tag}: redo puts it back", counts(page) == after)
        # too big
        tbtn(page).click(); page.locator("[data-testid=text-input]").fill("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        time.sleep(0.2)
        check(f"{tag}: too-big text is refused", page.locator("[data-testid=text-add]").is_disabled() and "bigger than the chart" in page.locator("[data-testid=text-info]").inner_text())
        page.locator("[data-testid=text-cancel]").click(); time.sleep(0.2)
        check(f"{tag}: cancel closes without change", page.locator("[data-testid=text-panel]").count() == 0 and counts(page) == after)
        if not touch: page.screenshot(path="/tmp/claude-0/scratch/text_desktop.png")
        ctx.close()
    br.close()
    check("no page errors", not errors, str(errors[:2]))
with sync_playwright() as p: run(p)
print(f"text: {n_ok} passed, {n_bad} failed"); sys.exit(1 if n_bad else 0)
