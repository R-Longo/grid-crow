"""Add a NEW yarn color (e.g. pink) and paint with it, on a converted picture and on a blank canvas, desktop and phone."""
import re, sys, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"; IMG = "/tmp/claude-0/scratch/imgs/hand_line.png"
n_ok = 0; n_bad = 0
def check(name, cond, detail=""):
    global n_ok, n_bad
    if cond: n_ok += 1
    else: n_bad += 1; print(f"FAIL {name}  [{detail}]")

def swatches(page): return [t.inner_text().replace("\n", " ") for t in page.locator(".chart__color").all()]
def opts(page): return page.get_by_role("button", name="Options")
def open_editor(page, touch):
    if touch and opts(page).count() and opts(page).get_attribute("aria-expanded") != "true": opts(page).click(); time.sleep(0.2)
    if page.locator("[data-testid=edit-color-open]").get_attribute("aria-expanded") != "true":
        page.locator("[data-testid=edit-color-open]").click(); time.sleep(0.2)

def build(page, mode):
    page.goto(URL); page.wait_for_load_state("networkidle")
    if mode == "blank":
        page.wait_for_selector("[data-testid=start-scratch]"); page.locator("[data-testid=start-scratch]").click(force=True); time.sleep(0.4)
        page.locator("[data-testid=open-blank]").click()
    else:
        page.set_input_files("input[type=file]", IMG); time.sleep(1)
        page.get_by_role("button", name=re.compile("Create My Crochet Grid")).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=90000); time.sleep(0.8)

def run(p):
    b = p.chromium.launch(); errors = []
    for mode in ("picture", "blank"):
        for (w, h, touch) in [(1440, 900, False), (390, 844, True)]:
            tag = f"{mode} {w}x{h}"
            ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch); page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
            build(page, mode); before = swatches(page); n0 = len(before)
            open_editor(page, touch)
            page.locator("[data-testid=color-hex]").fill("#fb60ab")
            page.locator("[data-testid=color-add]").click(); time.sleep(0.4)
            s1 = swatches(page)
            check(f"{tag}: one more yarn color appears with 0 stitches", len(s1) == n0 + 1 and s1[-1].lower().startswith("#fb60ab") and (touch or s1[-1].endswith(" 0")), str(s1[-1:]))
            check(f"{tag}: nothing already painted changed", s1[:n0] == before)
            check(f"{tag}: the new color is selected", page.locator(".chart__color[aria-pressed=true]").count() == 1 and page.locator(".chart__color").last.get_attribute("aria-pressed") == "true")
            # paint one stitch in the middle of the chart with it
            if touch and opts(page).count() and opts(page).get_attribute("aria-expanded") == "true": opts(page).click(); time.sleep(0.2)
            cv = page.locator("[data-testid=chart-canvas]").bounding_box()
            img0 = page.evaluate("document.querySelector('[data-testid=chart-canvas]').toDataURL()")
            page.mouse.click(cv["x"] + cv["width"] * 0.5, cv["y"] + cv["height"] * 0.5); time.sleep(0.4)
            s2 = swatches(page)
            check(f"{tag}: painting changes the chart", page.evaluate("document.querySelector('[data-testid=chart-canvas]').toDataURL()") != img0)
            if not touch:
                check(f"{tag}: painting uses the new color (count 1)", s2[-1].endswith(" 1"), s2[-1])
                check(f"{tag}: only that stitch changed (counts total unchanged)", sum(int(x.split()[-1]) for x in s2) == sum(int(x.split()[-1]) for x in before))
            # the same code again is refused politely
            open_editor(page, touch); page.locator("[data-testid=color-hex]").fill("#fb60ab"); page.locator("[data-testid=color-add]").click(); time.sleep(0.3)
            check(f"{tag}: adding the same color again is refused", len(swatches(page)) == n0 + 1 and "already in your palette" in page.locator("[data-testid=color-message]").inner_text())
            if touch and opts(page).count() and opts(page).get_attribute("aria-expanded") == "true": opts(page).click(); time.sleep(0.2)
            undo = page.get_by_role("button", name="Undo")
            undo.click(); time.sleep(0.3)
            check(f"{tag}: undo removes the painted stitch, keeps the color", (touch or swatches(page)[-1].endswith(" 0")) and len(swatches(page)) == n0 + 1)
            undo.click(); time.sleep(0.3)
            check(f"{tag}: undo again removes the added color and painting still works", len(swatches(page)) == n0 and page.locator(".chart__color[aria-pressed=true]").count() == 1)
            page.get_by_role("button", name="Redo").click(); time.sleep(0.3)
            check(f"{tag}: redo brings the color back", len(swatches(page)) == n0 + 1)
            ctx.close()
    check("no page errors", not errors, str(errors[:2]))
    b.close(); print(f"{n_ok}/{n_ok + n_bad} checks passed")
with sync_playwright() as p: run(p)
