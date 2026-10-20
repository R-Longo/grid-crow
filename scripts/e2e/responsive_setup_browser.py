"""Responsive setup / page shell (Phase 1): layouts per viewport, no overflow, collapse and expand without losing the chart.
Needs the dev server. python3 responsive_setup_browser.py"""
import sys, time
from playwright.sync_api import sync_playwright
import blank_browser as b
results = b.results; check = b.check
VIEWS = [(320, 568), (390, 844), (844, 390), (768, 1024), (820, 1180), (1024, 768), (1180, 820), (1440, 900), (1920, 1080), (2560, 1440)]

def rect(page, sel):
    return page.evaluate("s=>{const e=document.querySelector(s); if(!e||!e.offsetParent&&getComputedStyle(e).position!=='fixed') return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}}", sel)
def overflow(page): return page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")

def run(p):
    br = p.chromium.launch()
    for w, h in VIEWS:
        tag = f"{w}x{h}"
        ctx = br.new_context(viewport={"width": w, "height": h}, has_touch=w < 1000); pg = ctx.new_page()
        errors = []; pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(b.URL); pg.wait_for_selector(".upload")
        check(f"{tag}: setup (empty) has no horizontal overflow", not overflow(pg))
        pg.set_input_files("input[type=file]", b.IMG); time.sleep(0.9)
        panel = rect(pg, ".panel")
        cards = pg.locator(".start__card"); c0, c1 = cards.nth(0).bounding_box(), cards.nth(1).bounding_box()
        check(f"{tag}: the two starting buttons are side by side", abs(c0["y"] - c1["y"]) < 4 and c1["x"] > c0["x"] + c0["width"] - 2)
        up, ori, siz, colr, cta = (rect(pg, s_) for s_ in (".upload, .preview", "fieldset:has(input[value=portrait])", "fieldset:has(input[value=\"12x16\"])", "fieldset:has(input[value=\"6\"])", ".cta .btn--primary"))
        flow = [up and up["y"], ori and ori["y"], siz and siz["y"], colr and colr["y"], cta and cta["y"]]
        check(f"{tag}: single column in the original order (upload, orientation, size, colors, Create)", all(v is not None for v in flow) and flow == sorted(flow), str([round(v) for v in flow if v is not None]))
        check(f"{tag}: nothing is beside anything else (all controls share the same column)", all(r and abs(r["x"] - ori["x"]) < 40 for r in (up, siz, colr)) if ori else False)
        check(f"{tag}: setup is centred", abs((panel["x"] + panel["w"] / 2) - w / 2) < 2, f"{panel['x']:.0f}+{panel['w']:.0f}")
        check(f"{tag}: setup width is modest on big screens and uses the screen on phones", (panel["w"] <= (700 if w >= 900 else 33 * 16) + 1) and (w > 560 or panel["w"] >= w - 24), f"{panel['w']:.0f}")
        check(f"{tag}: picture setup has no horizontal overflow", not overflow(pg))
        pg.locator("[data-testid=start-scratch]").click(force=True); time.sleep(0.4)
        check(f"{tag}: Blank Canvas setup has no upload/crop column", pg.locator(".setup__pic").count() == 0 and pg.locator("input[type=file]").count() == 0)
        pb = rect(pg, ".panel")
        check(f"{tag}: Blank Canvas card is the same single column", abs(pb["w"] - panel["w"]) < 2, f"{pb['w']:.0f}")
        check(f"{tag}: Blank Canvas setup has no horizontal overflow", not overflow(pg))
        pg.locator("[data-testid=open-blank]").click(); pg.wait_for_selector("[data-testid=chart-canvas]", state="visible"); time.sleep(0.8)
        bar = pg.locator("[data-testid=setup-bar]")
        check(f"{tag}: setup folds into a summary bar once the chart opens", bar.is_visible() and not pg.locator("[data-testid=open-blank]").is_visible(), bar.inner_text().replace("\n", " "))
        # paint something, fold/unfold, nothing is lost and nothing is asked
        px0 = pg.evaluate("()=>document.querySelector('[data-testid=chart-canvas]').toDataURL().length")
        b.tool(pg, "Paint") if pg.get_by_role("button", name="Paint", exact=True).count() else None
        c = pg.locator("[data-testid=chart-canvas]").bounding_box()
        pg.mouse.click(c["x"] + c["width"] / 2, c["y"] + c["height"] / 2) if w >= 1000 else pg.touchscreen.tap(c["x"] + c["width"] / 2, c["y"] + c["height"] / 2)
        time.sleep(0.4)
        px1 = pg.evaluate("()=>document.querySelector('[data-testid=chart-canvas]').toDataURL().length")
        ch = pg.locator("[data-testid=setup-change]"); ch.click(); time.sleep(0.4)
        check(f"{tag}: Change opens the setup again with the chart still on screen, no confirmation", pg.locator("[data-testid=open-blank]").is_visible() and pg.locator("dialog.discard[open]").count() == 0 and pg.locator("[data-testid=chart-canvas]").count() == 1)
        ch.click(); time.sleep(0.4)
        px2 = pg.evaluate("()=>document.querySelector('[data-testid=chart-canvas]').toDataURL().length")
        check(f"{tag}: hiding it again keeps the drawing exactly as it was", px2 == px1 and not overflow(pg), f"{px0}/{px1}/{px2}")
        check(f"{tag}: editor has no horizontal overflow", not overflow(pg))
        check(f"{tag}: no page errors", not errors, "; ".join(errors)[:160]); ctx.close()
    br.close()

if __name__ == "__main__":
    with sync_playwright() as p: run(p)
    bad = [r for r in results if not r[1]]; print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad else 0)
