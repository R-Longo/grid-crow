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
        pic, opts = rect(pg, ".setup__pic"), rect(pg, ".setup__opts")
        two = w >= 736
        side = bool(pic and opts and opts["x"] > pic["x"] + pic["w"] - 2 and abs(opts["y"] - pic["y"]) < 40)
        check(f"{tag}: picture setup is {'two columns' if two else 'one column'}", side == two, f"pic {pic and round(pic['w'])} opts {opts and round(opts['w'])}")
        if two and pic and opts:
            check(f"{tag}: the two columns are balanced (neither more than 1.6x the other)", 0.6 <= pic["w"] / opts["w"] <= 1.6, f"{pic['w']:.0f}/{opts['w']:.0f}")
        check(f"{tag}: picture setup has no horizontal overflow", not overflow(pg))
        panel = rect(pg, ".panel")
        check(f"{tag}: setup card stays a sensible width (not stretched)", panel["w"] <= 62 * 16 + 1, f"{panel['w']:.0f}")
        pg.locator("[data-testid=start-scratch]").click(force=True); time.sleep(0.4)
        check(f"{tag}: Blank Canvas setup has no upload/crop column", pg.locator(".setup__pic").count() == 0 and pg.locator("input[type=file]").count() == 0)
        pb = rect(pg, ".panel")
        check(f"{tag}: Blank Canvas card is a single column, at most 40rem", pb["w"] <= 40 * 16 + 1, f"{pb['w']:.0f}")
        check(f"{tag}: Blank Canvas setup has no horizontal overflow", not overflow(pg))
        cols3 = pg.evaluate("()=>{const g=document.querySelector('.options--sizes'); return getComputedStyle(g).gridTemplateColumns.split(' ').length}")
        check(f"{tag}: size options {'three across' if pb['w'] >= 40*16-1 else 'two across'} where there is room", cols3 == (3 if pb["w"] >= 40*16-1 else 2), str(cols3))
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
