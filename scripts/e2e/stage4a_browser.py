import json, re, sys, time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5173/"
IMG = "/tmp/claude-0/scratch/hyb/sun-card-34.png"
COLS, ROWS = 96, 144
results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)

def bresenham(a, b):
    (x, y), (x1, y1) = a, b
    dx, dy = abs(x1 - x), -abs(y1 - y); sx = 1 if x < x1 else -1; sy = 1 if y < y1 else -1; err = dx + dy; out = []
    while True:
        out.append((x, y))
        if (x, y) == (x1, y1): break
        e2 = 2 * err
        if e2 >= dy: err += dy; x += sx
        if e2 <= dx: err += dx; y += sy
    return out

def setup(page):
    page.goto(URL); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", IMG)
    for value in ("24x32", "10"):  # the page re-renders while the picture opens, so retry a radio that did not take
        for attempt in range(4):
            try:
                page.locator(f'input[type=radio][value="{value}"]').check(force=True); break
            except Exception:
                time.sleep(0.5)
    page.get_by_role("button", name=re.compile("Create My Crochet Grid")).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=60000)
    page.wait_for_function("document.querySelector('[data-testid=chart-canvas]').width > 0")
    time.sleep(0.5)

JS_PIXEL = """([c, r]) => { const cv=document.querySelector('[data-testid=chart-canvas]'); const cw=cv.width/%d, ch=cv.height/%d;
  const d=cv.getContext('2d').getImageData(Math.floor((c+0.5)*cw), Math.floor((r+0.5)*ch),1,1).data; return '#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join(''); }""" % (COLS, ROWS)

def px(page, c, r): return page.evaluate(JS_PIXEL, [c, r])

def center_on(page, c, r):
    """Scroll the chart box so stitch (c, r) is in the middle; return a function stitch->client coords."""
    page.evaluate("""([c,r,cols,rows]) => { const sc=document.querySelector('.chart__scroll'); sc.scrollIntoView({block:'center'});
      const cv=document.querySelector('[data-testid=chart-canvas]'); const cw=cv.width/cols, ch=cv.height/rows;
      sc.scrollLeft=(c+0.5)*cw-sc.clientWidth/2; sc.scrollTop=(r+0.5)*ch-sc.clientHeight/2; }""", [c, r, COLS, ROWS])
    time.sleep(0.15)

def client(page, c, r):
    return page.evaluate("""([c,r,cols,rows]) => { const cv=document.querySelector('[data-testid=chart-canvas]'); const b=cv.getBoundingClientRect();
      return [b.left+(c+0.5)*b.width/cols, b.top+(r+0.5)*b.height/rows]; }""", [c, r, COLS, ROWS])

def changed(page):
    o = open_options(page) if page.locator("[data-testid=chart-changed]").count() == 0 else False
    t = page.locator("[data-testid=chart-changed]").inner_text(); close_options(page, o)
    m = re.match(r"(\d+)", t); return int(m.group(1)) if m else 0


def _opts(page): return page.get_by_role("button", name="Options")
def open_options(page):
    """Phones keep zoom, Reset, grid lines and the summary in an Options panel; open it if this layout has one and it is closed."""
    if _opts(page).count() and _opts(page).get_attribute("aria-expanded") != "true":
        _opts(page).click(); time.sleep(0.15); return True
    return False
def close_options(page, opened):
    if opened: _opts(page).click(); time.sleep(0.15)

def set_zoom(page, z):
    o = open_options(page) if page.locator(".chart__zoom input").count() == 0 else False
    page.evaluate("""(z) => { const el=document.querySelector('.chart__zoom input'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,String(z)); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }""", z)
    close_options(page, o); time.sleep(0.3)

def zoom_value(page):
    o = open_options(page) if page.locator(".chart__zoom input").count() == 0 else False
    v = float(page.evaluate("document.querySelector('.chart__zoom input').value")); close_options(page, o); return v

def dark_color(page):
    labels = page.locator(".chart__color").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    best = None
    for i, l in enumerate(labels):
        hx = re.search(r"#([0-9A-Fa-f]{6})", l).group(1); r, g, b = int(hx[:2], 16), int(hx[2:4], 16), int(hx[4:], 16)
        lum = 0.299*r + 0.587*g + 0.114*b
        if best is None or lum < best[0]: best = (lum, i, "#" + hx.lower())
    return best[1], best[2]

def status_where(page): return page.locator(".chart__where").inner_text()

def desktop(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1100, "height": 1000}); page = ctx.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e))); page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    setup(page)
    check("desktop: chart appears with 96 x 144 stitches", page.locator(".chart__summary").inner_text().startswith("96 stitches × 144 rows"))
    idx, hexc = dark_color(page)
    page.locator(".chart__color").nth(idx).click()
    check("desktop: selected color shown in status", hexc.upper() in page.locator(".chart__status").inner_text().upper(), hexc)
    set_zoom(page, 4)
    center_on(page, 52, 62)
    page.screenshot(path="desktop_before.png", clip=page.evaluate("(() => {const b=document.querySelector('.chart__scroll').getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height}})()"))
    # hover numbers
    for (c, r) in [(0, 0), (95, 143), (52, 62), (10, 100)]:
        center_on(page, c, r)
        x, y = client(page, c, r); page.mouse.move(x, y)
        want = f"Stitch {96-c} of 96 · Row {144-r} of 144"
        check(f"desktop: hover ({c},{r}) shows '{want}' (then the working direction)", status_where(page).startswith(want + " · "), status_where(page))
    # drag paint, fast, long
    a, b2 = (52, 62), (74, 40)
    center_on(page, 63, 51)
    ax, ay = client(page, *a); bx, by = client(page, *b2)
    before = {s: px(page, *s) for s in bresenham(a, b2)}
    page.mouse.move(ax, ay); page.mouse.down(); page.mouse.move(bx, by, steps=3); page.mouse.up()
    line = bresenham(a, b2)
    painted = [px(page, *s) for s in line]
    check("desktop: fast drag paints every stitch on the line, no gaps", all(v == hexc for v in painted), f"{sum(v==hexc for v in painted)}/{len(line)}")
    nch = changed(page)
    check("desktop: changed counter equals the stitches whose color actually changed", nch == sum(1 for s in line if before[s] != hexc), f"{nch}")
    off = [(c, r) for (c, r) in [(a[0], a[1]-3), (b2[0]+3, b2[1]), (60, 80), (70, 55)] if (c, r) not in set(line)]
    # stitches well off the line keep their original color (compare after reset below)
    page.screenshot(path="desktop_after.png", clip=page.evaluate("(() => {const b=document.querySelector('.chart__scroll').getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height}})()"))
    # pan mode drag: no paint
    page.get_by_role("button", name="Pan", exact=True).click()
    sl0 = page.evaluate("document.querySelector('.chart__scroll').scrollLeft")
    x0, y0 = client(page, 60, 52); page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x0 - 120, y0 - 60, steps=6); page.mouse.up()
    sl1 = page.evaluate("document.querySelector('.chart__scroll').scrollLeft")
    check("desktop: Pan mode drag scrolls the chart", sl1 > sl0, f"{sl0}->{sl1}")
    check("desktop: Pan mode drag paints nothing", changed(page) == nch)
    page.get_by_role("button", name="Paint", exact=True).click()
    # space-drag pans in draw mode
    sl0 = page.evaluate("document.querySelector('.chart__scroll').scrollLeft")
    x0, y0 = client(page, 70, 55)
    page.mouse.move(x0, y0); page.keyboard.down("Space"); page.mouse.down(); page.mouse.move(x0 + 100, y0, steps=5); page.mouse.up(); page.keyboard.up("Space")
    sl1 = page.evaluate("document.querySelector('.chart__scroll').scrollLeft")
    check("desktop: Space+drag pans in Draw mode and paints nothing", sl1 < sl0 and changed(page) == nch, f"{sl0}->{sl1}")
    # ctrl+wheel zoom anchored on pointer
    center_on(page, 60, 60)
    x0, y0 = client(page, 60, 60); page.mouse.move(x0, y0)
    w0 = status_where(page)
    page.keyboard.down("Control"); page.mouse.wheel(0, -300); page.keyboard.up("Control"); time.sleep(0.3)
    z1 = zoom_value(page)
    page.mouse.move(x0 + 1, y0 + 1); page.mouse.move(x0, y0)
    check("desktop: Ctrl+wheel zooms in", z1 > 4, f"zoom {z1}")
    check("desktop: zoom keeps the stitch under the pointer", status_where(page) == w0, f"{w0} -> {status_where(page)}")
    # right click does nothing
    x0, y0 = client(page, 60, 60); page.mouse.click(x0, y0, button="right")
    check("desktop: right click paints nothing", changed(page) == nch)
    # reset
    page.get_by_role("button", name="Reset to converted").click()
    dlg = page.get_by_role("alertdialog")
    check("desktop: reset asks first, in an in-app alert dialog (not a browser dialog)", dlg.count() == 1 and "Reset to the converted chart?" in dlg.inner_text())
    check("desktop: dialog opens with focus on the safe 'Keep editing' button", page.evaluate("document.activeElement && document.activeElement.textContent") == "Keep editing")
    page.keyboard.press("Escape")
    check("desktop: Escape cancels, keeps edits, returns focus to Reset", page.get_by_role("alertdialog").count() == 0 and changed(page) == nch and page.evaluate("document.activeElement.textContent") == "Reset to converted")
    page.get_by_role("button", name="Reset to converted").click()
    page.get_by_role("button", name="Keep editing").click()
    check("desktop: 'Keep editing' keeps the edits", changed(page) == nch)
    page.get_by_role("button", name="Reset to converted").click(); page.get_by_role("button", name="Yes, reset").click()
    check("desktop: reset restores the converted chart", changed(page) == 0 and all(px(page, *s) == before[s] for s in line))
    hts = page.evaluate("""() => [...document.querySelectorAll('.chart__color, .chart__tool, .chart__small')].map(b => Math.round(b.getBoundingClientRect().height))""")
    check("desktop: palette, Draw/Pan and Reset controls are at least 44px tall", min(hts) >= 44, str(sorted(set(hts))))
    check("desktop: no page errors", not errors, "; ".join(errors)[:200])
    b.close()

def cdp_touch(cdp, kind, pts):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})

def mobile(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2); page = ctx.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    cdp = ctx.new_cdp_session(page)
    setup(page)
    check("mobile: chart appears (96 x 144)", "96 × 144" in page.locator(".chart__where").inner_text())
    idx, hexc = dark_color(page); page.locator(".chart__color").nth(idx).click()
    set_zoom(page, 8)
    center_on(page, 52, 62)
    a, b2 = (52, 62), (58, 56)
    ax, ay = client(page, *a); bx, by = client(page, *b2)
    line = bresenham(a, b2); before = {s: px(page, *s) for s in line}
    cdp_touch(cdp, "touchStart", [(ax, ay)])
    for k in range(1, 7): cdp_touch(cdp, "touchMove", [(ax + (bx-ax)*k/6, ay + (by-ay)*k/6)])
    cdp_touch(cdp, "touchEnd", [])
    time.sleep(0.2)
    got = [px(page, *s) for s in line]
    check("mobile: one-finger drag paints the line", all(v == hexc for v in got), f"{sum(v==hexc for v in got)}/{len(line)}")
    nch = changed(page); check("mobile: changed counter updated", nch == sum(1 for s in line if before[s] != hexc), str(nch))
    page.screenshot(path="mobile_after_draw.png")
    # tap paints one stitch
    center_on(page, 30, 100); c2 = (30, 100); tx, ty = client(page, *c2); pre = px(page, *c2)
    cdp_touch(cdp, "touchStart", [(tx, ty)]); cdp_touch(cdp, "touchEnd", [])
    time.sleep(0.15); check("mobile: a tap paints one stitch (and it really was a different color before)", pre != hexc and px(page, *c2) == hexc and changed(page) == nch + 1, f"{pre}->{px(page,*c2)}")
    nch = changed(page)
    # two-finger pan/pinch must not paint and must zoom/pan
    set_zoom(page, 3); center_on(page, 56, 62)
    cx, cy = client(page, 56, 62); z0 = zoom_value(page); sl0 = page.evaluate("document.querySelector('.chart__scroll').scrollLeft")
    cdp_touch(cdp, "touchStart", [(cx - 40, cy), (cx + 40, cy)])
    for k in range(1, 6): cdp_touch(cdp, "touchMove", [(cx - 40 - 6*k, cy), (cx + 40 + 6*k, cy)])
    cdp_touch(cdp, "touchEnd", []); time.sleep(0.3)
    z1 = zoom_value(page)
    check("mobile: two-finger spread zooms in", z1 > z0, f"{z0}->{z1}")
    check("mobile: pinch paints nothing", changed(page) == nch, f"{changed(page)} vs {nch}")
    # second finger lands in the middle of a stroke: stroke is undone
    set_zoom(page, 6); center_on(page, 60, 50)
    s0 = client(page, 60, 50); s1 = client(page, 66, 50); pre = [px(page, c, 50) for c in range(60, 67)]
    cdp_touch(cdp, "touchStart", [s0])
    for k in range(1, 5): cdp_touch(cdp, "touchMove", [(s0[0] + (s1[0]-s0[0])*k/4, s0[1])])
    mid = [px(page, c, 50) for c in range(60, 67)]
    check("mobile: stroke had really painted before the second finger arrived", sum(1 for a_, b_ in zip(mid, pre) if a_ != b_) >= 3 and mid[0] == hexc, f"{mid[:3]}")
    cdp_touch(cdp, "touchStart", [(s0[0] + (s1[0]-s0[0]), s0[1]), (s0[0], s0[1] + 120)])
    cdp_touch(cdp, "touchMove", [(s0[0] + (s1[0]-s0[0]), s0[1]), (s0[0], s0[1] + 160)])
    cdp_touch(cdp, "touchEnd", []); time.sleep(0.3)
    post = [px(page, c, 50) for c in range(60, 67)]
    check("mobile: a second finger mid-stroke cancels and undoes the stroke", post == pre and changed(page) == nch, f"changed {changed(page)} vs {nch}")
    # browser takes over the touch (touchCancel): stroke is undone
    set_zoom(page, 6); center_on(page, 40, 90)
    t0 = client(page, 40, 90); t1 = client(page, 46, 90); pre = [px(page, c, 90) for c in range(40, 47)]
    cdp_touch(cdp, "touchStart", [t0])
    for k in range(1, 5): cdp_touch(cdp, "touchMove", [(t0[0] + (t1[0]-t0[0])*k/4, t0[1])])
    mid = [px(page, c, 90) for c in range(40, 47)]
    cdp_touch(cdp, "touchCancel", [])
    time.sleep(0.3); post = [px(page, c, 90) for c in range(40, 47)]
    check("mobile: touchCancel undoes the stroke", mid != pre and post == pre and changed(page) == nch, f"changed {changed(page)} vs {nch}")
    # Pan mode one finger scrolls, no paint
    page.get_by_role("button", name="Pan", exact=True).click()
    center_on(page, 56, 62); cx, cy = client(page, 56, 62); sl0 = page.evaluate("document.querySelector('.chart__scroll').scrollLeft")
    cdp_touch(cdp, "touchStart", [(cx, cy)])
    for k in range(1, 6): cdp_touch(cdp, "touchMove", [(cx - 12*k, cy)])
    cdp_touch(cdp, "touchEnd", []); time.sleep(0.2)
    sl1 = page.evaluate("document.querySelector('.chart__scroll').scrollLeft")
    check("mobile: one finger in Pan mode scrolls the chart", sl1 > sl0, f"{sl0}->{sl1}")
    check("mobile: and paints nothing", changed(page) == nch)
    check("mobile: no page errors", not errors, "; ".join(errors)[:200])
    b.close()

with sync_playwright() as p:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "desktop"): desktop(p)
    if which in ("all", "mobile"): mobile(p)
bad = [r for r in results if not r[1]]
print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
json.dump(results, open("results.json", "w"), indent=1)
sys.exit(1 if bad else 0)
