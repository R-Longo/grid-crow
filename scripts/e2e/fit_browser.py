"""Real-browser checks for Fit to Screen (Stage 4 usability fix). Needs vite on 5173 (or pass a URL as argv[1]) and Playwright."""
import json, re, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/"
IMG = "/tmp/claude-0/scratch/hyb/sun-card-34.png"
ASPECT = 4.5 / 4
SIZES = ["6x8", "8x10", "12x16", "16x20", "18x24", "24x32"]
VIEWPORTS = [(320, 568), (390, 844), (844, 390), (768, 1024), (1024, 768), (1280, 800), (1920, 1080)]
results = []
def unfold(page):
    """Once a chart is open the setup folds into a bar on every screen size; open it before touching setup controls."""
    b = page.locator("[data-testid=setup-change]")
    if b.count() and b.is_visible() and b.get_attribute("aria-expanded") == "false":
        b.click(); time.sleep(0.4)
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def _opts(page): return page.get_by_role("button", name="Options")
def open_options(page):
    """Phones keep zoom, Reset, grid lines and the summary in an Options panel; open it if this layout has one and it is closed."""
    if _opts(page).count() and _opts(page).get_attribute("aria-expanded") != "true":
        _opts(page).click(); time.sleep(0.15); return True
    return False
def close_options(page, opened):
    if opened: _opts(page).click(); time.sleep(0.15)

JS_STATE = """() => {
  const sc = document.querySelector('.chart__scroll'), cv = document.querySelector('[data-testid=chart-canvas]'), z = document.querySelector('.chart__zoom input');
  const b = sc.getBoundingClientRect(), c = cv.getBoundingClientRect();
  return { box: [b.left, b.top, b.right, b.bottom], cv: [c.left, c.top, c.right, c.bottom], cw: cv.width, ch: cv.height,
    scrollW: sc.scrollWidth, clientW: sc.clientWidth, scrollH: sc.scrollHeight, clientH: sc.clientHeight, sl: sc.scrollLeft, st: sc.scrollTop,
    zmin: parseFloat(z.min), zmax: parseFloat(z.max), zval: parseFloat(z.value), iw: innerWidth, ih: innerHeight };
}"""
def state(page):
    o = open_options(page) if page.locator(".chart__zoom input").count() == 0 else False
    st = page.evaluate(JS_STATE); close_options(page, o); return st
def summary(page):
    o = open_options(page) if page.locator(".chart__summary").count() == 0 else False
    t = page.locator(".chart__summary").inner_text(); close_options(page, o); return t
def set_zoom(page, z):
    o = open_options(page) if page.locator(".chart__zoom input").count() == 0 else False
    page.evaluate("""(z) => { const el=document.querySelector('.chart__zoom input'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,String(z)); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }""", z)
    close_options(page, o)
def fit_btn(page): return page.get_by_role("button", name="Fit to Screen")

def make_chart(page, size, orientation):
    page.goto(URL); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", IMG)
    for value in (orientation, size):  # the page re-renders while the picture opens, so retry a radio that did not take
        for attempt in range(4):
            try:
                page.locator(f'input[type=radio][value="{value}"]').check(force=True); break
            except Exception:
                time.sleep(0.5)
        time.sleep(0.3)
    page.get_by_role("button", name=re.compile("Create My Crochet Grid")).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=60000)
    page.wait_for_function("document.querySelector('[data-testid=chart-canvas]').width > 0")
    time.sleep(0.4)
    page.evaluate("document.querySelector('.chart').scrollIntoView({block:'start'})"); time.sleep(0.2)

def settle(page): time.sleep(0.45)  # resize handler is debounced

def check_whole(page, label, cols, rows):
    page.evaluate("document.querySelector('.chart').scrollIntoView({block:'start'})"); time.sleep(0.15)
    s = state(page)
    bl, bt, br, bb = s["box"]; cl, ct, cr, cb = s["cv"]
    no_scroll = s["scrollW"] <= s["clientW"] and s["scrollH"] <= s["clientH"]
    inside = cl >= bl - 0.5 and ct >= bt - 0.5 and cr <= br + 0.5 and cb <= bb + 0.5
    w, h = cr - cl, cb - ct
    ratio_ok = abs((w / cols) / (h / rows) - ASPECT) / ASPECT < 0.02
    at_min = abs(s["zval"] - s["zmin"]) < 1e-6
    # the drawing area is measured from the room it has: inside the window both ways
    fits_window = br <= s["iw"] + 0.5 and bb <= s["ih"] + 0.5
    ok = no_scroll and inside and ratio_ok and at_min and fits_window
    check(f"{label}: whole chart visible, no scrolling, undistorted, slider at its minimum", ok,
          f"canvas {w:.0f}x{h:.0f} box {bb-bt:.0f}h; scroll {s['scrollW']}x{s['scrollH']} vs {s['clientW']}x{s['clientH']}; ratio {(w/cols)/(h/rows):.3f}; zmin {s['zmin']:.3f} z {s['zval']:.3f}")
    return ok

def main(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 800}); page = ctx.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    for size in SIZES:
        for orientation in ["portrait", "landscape"]:
            page.set_viewport_size({"width": 1280, "height": 800})
            make_chart(page, size, orientation)
            m = re.match(r"(\d+) stitches × (\d+) rows", summary(page)); cols, rows = int(m.group(1)), int(m.group(2))
            for (vw, vh) in VIEWPORTS:
                page.set_viewport_size({"width": vw, "height": vh}); settle(page)
                check_whole(page, f"{size} {orientation} ({cols}x{rows}) at {vw}x{vh}", cols, rows)
    # --- behaviour on one chart
    page.set_viewport_size({"width": 1280, "height": 800}); make_chart(page, "24x32", "portrait"); settle(page)
    s0 = state(page)
    check("opens fitted: Fit to Screen is disabled while the whole chart is showing", fit_btn(page).is_disabled())
    # zoom in with the slider: scrolls, can pan
    set_zoom(page, 4)
    time.sleep(0.4); s1 = state(page)
    check("zoomed in: slider value 4, chart larger than the preview, preview box now fills its room", abs(s1["zval"] - 4) < 0.01 and s1["scrollW"] > s1["clientW"] and s1["scrollH"] > s1["clientH"], f"{s1['scrollW']}x{s1['scrollH']}")
    check("zoomed in: Fit to Screen is enabled", fit_btn(page).is_enabled())
    page.get_by_role("button", name="Pan", exact=True).click()
    page.locator('.chart__scroll').scroll_into_view_if_needed()
    bx = state(page)["box"]; x0, y0 = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x0 - 90, y0 - 70, steps=6); page.mouse.up()
    s2 = state(page)
    check("zoomed in: Pan mode drag pans the chart", s2["sl"] > s1["sl"] and s2["st"] > s1["st"], f"{s1['sl']:.0f},{s1['st']:.0f} -> {s2['sl']:.0f},{s2['st']:.0f}")
    page.get_by_role("button", name="Paint", exact=True).click()
    # ordinary interaction must not reset the manual zoom: hover, toggle grid lines, change tool
    page.mouse.move(x0, y0); page.get_by_role("button", name="Fill", exact=True).click(); page.get_by_role("button", name="Paint", exact=True).click()
    page.locator('.chart__check input').click(); page.locator('.chart__check input').click()
    s3 = state(page)
    check("ordinary clicks (tools, grid lines, hover) leave the chosen zoom and pan alone", abs(s3["zval"] - 4) < 0.01 and abs(s3["sl"] - s2["sl"]) < 1.5, f"{s3['zval']}")
    # a small window-height wobble (address bar) keeps the zoom; a real resize that makes the minimum bigger than it never goes below it
    page.set_viewport_size({"width": 1280, "height": 740}); settle(page); s4 = state(page)
    check("small height change keeps the manual zoom", abs(s4["zval"] - 4) < 0.01, f"{s4['zval']}")
    page.set_viewport_size({"width": 900, "height": 700}); settle(page); s5 = state(page)
    check("resizing the window keeps a manually chosen zoom (not reset to fit)", s5["zval"] > s5["zmin"] + 0.5, f"z {s5['zval']:.2f} min {s5['zmin']:.2f}")
    # Fit to Screen restores the whole chart and resets panning
    fit_btn(page).click(); time.sleep(0.3); s6 = state(page)
    check("Fit to Screen restores the whole chart and resets the pan offsets", s6["sl"] == 0 and s6["st"] == 0 and check_whole(page, "after Fit to Screen", 96, 144))
    # fitted chart follows the window; rotation
    for (vw, vh) in [(844, 390), (390, 844), (1280, 800)]:
        page.set_viewport_size({"width": vw, "height": vh}); settle(page)
        check_whole(page, f"fitted chart re-fits after resize/rotation to {vw}x{vh}", 96, 144)
    # zoom to max then pinch out via ctrl+wheel back to fit
    page.mouse.move(640, 400)
    page.locator('.chart__scroll').scroll_into_view_if_needed()
    bx = state(page)["box"]; cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
    page.mouse.move(cx, cy)
    where0 = page.locator(".chart__where").inner_text()
    page.keyboard.down("Control"); page.mouse.wheel(0, -400); page.keyboard.up("Control"); time.sleep(0.4)
    page.mouse.move(cx + 1, cy); page.mouse.move(cx, cy)
    s7 = state(page); where1 = page.locator(".chart__where").inner_text()
    nums = lambda t: [int(x) for x in re.findall(r"(?:Stitch|Row) (\d+)", t)]
    n0, n1 = nums(where0), nums(where1)
    # at the fitted size a stitch is only ~4 px, so allow the neighbouring stitch (sub-pixel rounding of the scroll position)
    check("Ctrl+wheel zoom from the fitted view keeps the stitch under the pointer (to within 1 stitch)", s7["zval"] > s7["zmin"] and len(n0) == 2 == len(n1) and all(abs(a - b) <= 1 for a, b in zip(n0, n1)), f"{where0} -> {where1}")
    page.keyboard.down("Control"); page.mouse.wheel(0, 3000); page.keyboard.up("Control"); time.sleep(0.4)
    s8 = state(page)
    check("zooming all the way out stops at the fit (never smaller) and Fit state returns", abs(s8["zval"] - s8["zmin"]) < 1e-6 and fit_btn(page).is_disabled())
    # painting still works at the fitted size, and the editing counters still work
    page.locator(".chart__color").nth(1).click()
    bx = state(page)["box"]; cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
    page.mouse.click(cx, cy); 
    n = int(re.match(r"(\d+)", page.locator("[data-testid=chart-changed]").inner_text() or "0").group(1)) if re.match(r"(\d+)", page.locator("[data-testid=chart-changed]").inner_text()) else 0
    check("painting a stitch at the fitted size works", n in (0, 1), f"changed {n}")  # the centre may already have that color
    # new chart opens fitted even after zooming in the previous one
    set_zoom(page, 5)
    time.sleep(0.3)
    unfold(page); page.get_by_role("button", name=re.compile("Create My Crochet Grid")).click(); time.sleep(0.4)
    if page.locator("dialog.discard[open]").count():  # Stage 4C: a chart with hand edits asks before it is replaced
        page.get_by_role("button", name="Discard edits and continue").click()
    page.wait_for_function("document.querySelector('.chart__zoom input') && true"); time.sleep(2.5)
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible")
    check_whole(page, "a newly created chart opens fitted", 96, 144)
    # Original view uses the same box
    page.get_by_role("button", name="Original", exact=True).click(); time.sleep(0.3)
    s9 = state(page)
    check("Original view is also shown whole", s9["scrollW"] <= s9["clientW"] and s9["scrollH"] <= s9["clientH"])
    check("no page errors", not errors, "; ".join(errors)[:200])
    b.close()

def touch(cdp, kind, pts): cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})

def mobile(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2); page = ctx.new_page()
    cdp = ctx.new_cdp_session(page); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    make_chart(page, "24x32", "portrait"); settle(page)
    check_whole(page, "phone: new chart opens fitted", 96, 144)
    page.locator(".chart__scroll").scroll_into_view_if_needed(); bx = state(page)["box"]; cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
    z0 = state(page)["zval"]
    touch(cdp, "touchStart", [(cx - 20, cy), (cx + 20, cy)])
    for k in range(1, 13): touch(cdp, "touchMove", [(cx - 20 - 8 * k, cy), (cx + 20 + 8 * k, cy)])
    touch(cdp, "touchEnd", []); time.sleep(0.4)
    s = state(page)
    check("phone: two-finger spread from the fitted view zooms in", s["zval"] > z0 * 1.5 and fit_btn(page).is_enabled(), f"{z0:.2f}->{s['zval']:.2f}")
    o = open_options(page); changed = page.locator("[data-testid=chart-changed]").inner_text(); close_options(page, o)
    check("phone: pinch paints nothing", changed == "No edits yet", changed)
    page.get_by_role("button", name="Pan", exact=True).click()
    page.locator(".chart__scroll").scroll_into_view_if_needed(); s = state(page)
    sl0 = s["sl"]; bx = s["box"]; cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
    touch(cdp, "touchStart", [(cx, cy)])
    for k in range(1, 6): touch(cdp, "touchMove", [(cx - 10 * k, cy - 8 * k)])
    touch(cdp, "touchEnd", []); time.sleep(0.3)
    s2 = state(page)
    check("phone: one finger in Pan mode pans the zoomed chart", s2["sl"] > sl0 and s2["st"] > s["st"], f"{sl0:.0f}->{s2['sl']:.0f}")
    fit_btn(page).click(); time.sleep(0.3)
    check_whole(page, "phone: Fit to Screen returns to the whole chart", 96, 144)
    page.set_viewport_size({"width": 844, "height": 390}); settle(page)
    check_whole(page, "phone: rotated to landscape, still whole", 96, 144)
    check("phone: no page errors", not errors, "; ".join(errors)[:200])
    b.close()

with sync_playwright() as p:
    main(p)
    mobile(p)
bad = [r for r in results if not r[1]]
print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
sys.exit(1 if bad else 0)
