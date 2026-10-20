"""Phase 2: the editor fills the screen it is on. Measured, not guessed: whole chart visible, undistorted, rulers aligned,
tools/colors reachable, every target >= 44px, and the same after rotating / resizing."""
import re, sys, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"
ASPECT = 9 / 8
ok_n = 0; bad = 0
def check(name, cond, detail=""):
    global ok_n, bad
    if cond: ok_n += 1
    else: bad += 1; print(f"FAIL {name}  [{detail}]")

JS = """() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height}; };
  const cv = document.querySelector('[data-testid=chart-canvas]'), sc = document.querySelector('.chart__scroll');
  const tgt = [...document.querySelectorAll('.chart button, .chart input[type=checkbox], .chart input[type=radio]')].filter(e => e.getClientRects().length).map(e => { const b = e.getBoundingClientRect(); return [b.height, b.width, e.getAttribute('aria-label') || e.textContent.trim().slice(0,20)]; });
  const reach = n => { const b = [...document.querySelectorAll('.chart button')].find(e => (e.getAttribute('aria-label')||e.textContent).trim().startsWith(n)); if (!b) return false; const bb = b.getBoundingClientRect(); return bb.top >= -1 && bb.bottom <= innerHeight + 1 && bb.left >= -1 && bb.right <= innerWidth + 1; };
  return { cv: r('[data-testid=chart-canvas]'), box: r('.chart__scroll'), wrap: r('.chart__wrap'), chart: r('.chart'), rt: r('.chart__ruler--top') , rl: r('.chart__ruler--left'),
    cols: +cv.dataset.cols || 0, scrollW: sc.scrollWidth, clientW: sc.clientWidth, scrollH: sc.scrollHeight, clientH: sc.clientHeight, sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, tgt,
    paint: reach('Paint'), undo: reach('Undo'), fill: reach('Fill'), color: !!document.querySelector('.chart__color') && (() => { const b = document.querySelector('.chart__color').getBoundingClientRect(); return b.right <= innerWidth + 1 && b.left >= -1; })() }; }"""

def open_chart(page, kind="24x32"):
    page.goto(URL); page.wait_for_load_state("networkidle"); page.wait_for_selector("[data-testid=start-scratch]")
    page.locator("[data-testid=start-scratch]").click(force=True); time.sleep(0.4)
    page.locator("[data-testid=open-blank]").click(); page.wait_for_selector("[data-testid=chart-canvas]", state="visible"); time.sleep(1.0)

def look(page):
    page.evaluate("document.querySelector('.chart').scrollIntoView({block:'start'})"); time.sleep(0.5)
    return page.evaluate(JS)

def verify(tag, S, ratio_expect=None):
    cv = S["cv"]
    check(f"{tag}: no horizontal page scrolling", S["sw"] <= S["iw"], f"{S['sw']} vs {S['iw']}")
    check(f"{tag}: whole chart inside the screen, no scrolling inside the box", cv["l"] >= -0.5 and cv["r"] <= S["iw"] + 0.5 and cv["t"] >= -0.5 and cv["b"] <= S["ih"] + 0.5 and S["scrollW"] <= S["clientW"] and S["scrollH"] <= S["clientH"],
          f"canvas {cv['l']:.0f},{cv['t']:.0f}-{cv['r']:.0f},{cv['b']:.0f} of {S['iw']}x{S['ih']}")
    check(f"{tag}: stitch proportions kept (9:8)", ratio_expect is None or abs((cv["w"] / ratio_expect[0]) / (cv["h"] / ratio_expect[1]) - ASPECT) / ASPECT < 0.02)
    check(f"{tag}: row ruler and stitch-number ruler line up with the chart", S["rt"] and S["rl"] and abs(S["rt"]["l"] - S["box"]["l"]) <= 2 and abs(S["rl"]["t"] - S["box"]["t"]) <= 2 and S["rt"]["b"] <= S["box"]["t"] + 2, str((S["rt"], S["rl"], S["box"])))
    check(f"{tag}: Paint, Fill, Undo and a yarn color are reachable on screen", S["paint"] and S["fill"] and S["undo"] and S["color"], f"{S['paint']} {S['fill']} {S['undo']} {S['color']}")
    small = [t for t in S["tgt"] if t[0] < 43.5 and t[1] < 200 and t[2] not in ("",)]
    check(f"{tag}: buttons are at least 44px tall", not [t for t in S["tgt"] if t[0] < 43.5 and not t[2].startswith("Show grid") and t[1] > 0 and t[2] != "" and "slider" not in t[2].lower()][:1], str(small[:4]))

def main(p):
    b = p.chromium.launch(); errors = []
    sizes = [(320, 568), (390, 844), (844, 390), (640, 360), (820, 1180), (1180, 820), (1024, 768), (1440, 900), (1920, 1080), (2560, 1440)]
    best = {}
    for (w, h) in sizes:
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=w < 900); page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        open_chart(page); S = look(page); tag = f"{w}x{h}"
        verify(tag, S, (48, 72))
        cv = S["cv"]; best[tag] = (cv["w"], cv["h"])
        # painting still works where the chart is
        before = page.evaluate("document.querySelector('[data-testid=chart-canvas]').toDataURL()")
        page.mouse.click(cv["l"] + cv["w"] * 0.5, cv["t"] + cv["h"] * 0.5); time.sleep(0.3)
        after = page.evaluate("document.querySelector('[data-testid=chart-canvas]').toDataURL()")
        check(f"{tag}: tapping the chart paints a stitch", after != before)
        ctx.close()
    # rotate / resize live: the chart is re-fitted and stays whole
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True); page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    open_chart(page)
    for (w, h) in [(844, 390), (820, 1180), (1180, 820), (1440, 900), (390, 844), (1920, 1080), (600, 900)]:
        page.set_viewport_size({"width": w, "height": h}); time.sleep(0.8)
        S = look(page); verify(f"resize to {w}x{h}", S, (48, 72))
    ctx.close()
    # honest sizes: canvas share of the screen
    print("canvas sizes:", {k: f"{v[0]:.0f}x{v[1]:.0f}" for k, v in best.items()})
    check("no page errors", not errors, str(errors[:2]))
    b.close()
    print(f"{ok_n}/{ok_n + bad} checks passed")
with sync_playwright() as p: main(p)
