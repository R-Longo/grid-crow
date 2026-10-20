"""Phase 2 (phone editor): setup folds into a bar, canvas size, 44 px targets, fit after rotation, desktop unchanged.
Needs the dev server. python3 phone_editor_browser.py"""
import sys, time
from playwright.sync_api import sync_playwright
import blank_browser as b
results = b.results; check = b.check

def box(page): return page.locator(".chart__scroll").bounding_box()
def whole(page): return page.evaluate("() => { const s=document.querySelector('.chart__scroll'); return s.scrollWidth<=s.clientWidth+1 && s.scrollHeight<=s.clientHeight+1; }")

def phone(p):
    br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2); page = ctx.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(b.URL); page.wait_for_selector(".start__card")
    page.locator("[data-testid=start-scratch]").click(force=True); b.radio(page, "12x16")
    page.locator("[data-testid=open-blank]").tap(); page.wait_for_selector("[data-testid=chart-canvas]", state="visible"); time.sleep(1.0)
    bar = page.locator("[data-testid=setup-bar]")
    check("phone: setup folds into a one-line bar after Open", bar.is_visible() and not page.locator("[data-testid=open-blank]").is_visible() and "Blank canvas · 12 × 16 in" in bar.inner_text(), bar.inner_text())
    bb = bar.bounding_box()
    check("phone: the editor is brought into view (bar near the top of the screen)", bb["y"] < 130, f"{bb['y']:.0f}")
    bx = box(page)
    check("phone: whole chart fits on screen on open, no scrolling in the box", whole(page) and bx["y"] + bx["height"] < 844, str(bx))
    check("phone: the chart is wider than before (>= 290 px)", bx["width"] >= 290, f"{bx['width']:.0f}")
    small = page.evaluate("""() => [...document.querySelectorAll('.chart__dock button, .chart__bar button, [data-testid=setup-change]')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect(); return [e.textContent.trim().slice(0,12), Math.round(r.width), Math.round(r.height)];}).filter(x=>x[1]<44||x[2]<44)""")
    check("phone: dock, header buttons and Change are all at least 44 x 44", not small, str(small))
    ch = page.locator("[data-testid=setup-change]"); ch.tap(); time.sleep(0.4)
    check("phone: Change opens the setup again (size options visible)", page.locator('input[type=radio][value="12x16"]').is_visible() and ch.inner_text() == "Hide")
    ch.tap(); time.sleep(0.4)
    check("phone: Hide folds it away again", not page.locator("[data-testid=open-blank]").is_visible() and ch.inner_text() == "Change")
    # rotation: sideways then back; chart is refitted both times
    page.set_viewport_size({"width": 844, "height": 390}); time.sleep(0.8)
    check("phone sideways: the whole chart is still visible (re-fitted)", whole(page))
    page.set_viewport_size({"width": 390, "height": 844}); time.sleep(0.8)
    check("phone upright again: the whole chart is visible", whole(page))
    # Fit to Screen after zooming in and panning
    zi = page.get_by_role("button", name="Options"); zi.tap(); time.sleep(0.3)
    page.evaluate("() => document.querySelector('input[type=range]')?.focus()")
    for _ in range(6): page.keyboard.press("ArrowRight")
    time.sleep(0.3); page.get_by_role("button", name="Options").tap(); time.sleep(0.2)
    check("phone: zoomed in (chart box scrolls)", not whole(page))
    page.get_by_role("button", name="Fit to Screen").tap(); time.sleep(0.5)
    check("phone: Fit to Screen shows the whole chart again", whole(page))
    # picture flow folds too
    page.goto(b.URL); page.wait_for_selector(".start__card"); page.set_input_files("input[type=file]", b.IMG); time.sleep(0.8)
    b.radio(page, "12x16"); page.get_by_role("button", name="Create My Crochet Grid").tap()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=60000); time.sleep(1.0)
    check("phone: a converted chart folds the setup too", page.locator("[data-testid=setup-bar]").is_visible() and "Your picture" in page.locator("[data-testid=setup-bar]").inner_text())
    check("phone: no page errors", not errors, "; ".join(errors)[:200]); br.close()

def desktop(p):
    br = p.chromium.launch(); page = br.new_context(viewport={"width": 1100, "height": 1000}).new_page()
    page.goto(b.URL); page.wait_for_selector(".start__card")
    page.locator("[data-testid=start-scratch]").click(force=True); page.locator("[data-testid=open-blank]").click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible"); time.sleep(0.8)
    check("desktop: setup folds into the summary bar too (the chart is the workspace)", page.locator("[data-testid=setup-bar]").is_visible() and not page.locator("[data-testid=open-blank]").is_visible())
    br.close()

if __name__ == "__main__":
    with sync_playwright() as p: phone(p); desktop(p)
    bad = [r for r in results if not r[1]]; print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad else 0)
