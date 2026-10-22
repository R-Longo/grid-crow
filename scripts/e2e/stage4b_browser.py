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
    page.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG)
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

def dark_color(page):
    labels = page.locator(".chart__color").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    best = None
    for i, l in enumerate(labels):
        hx = re.search(r"#([0-9A-Fa-f]{6})", l).group(1); r, g, b = int(hx[:2], 16), int(hx[2:4], 16), int(hx[4:], 16)
        lum = 0.299*r + 0.587*g + 0.114*b
        if best is None or lum < best[0]: best = (lum, i, "#" + hx.lower())
    return best[1], best[2]

def status_where(page): return page.locator(".chart__where").inner_text()

def status_where(page): return page.locator(".chart__where").inner_text()
def cdp_touch(cdp, kind, pts):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
def tool(page, name): page.get_by_role("button", name=name, exact=True).click()
def grid(page):
    return page.evaluate("""([cols,rows]) => { const cv=document.querySelector('[data-testid=chart-canvas]'); const cw=cv.width/cols, ch=cv.height/rows;
      const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data; const out=[];
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ const i=(Math.floor((r+0.5)*ch)*cv.width+Math.floor((c+0.5)*cw))*4; out.push((d[i]<<16)|(d[i+1]<<8)|d[i+2]); }
      return out.join(','); }""", [COLS, ROWS])
def undo_disabled(page): return page.get_by_role("button", name="Undo", exact=True).is_disabled()
def redo_disabled(page): return page.get_by_role("button", name="Redo", exact=True).is_disabled()
def palette_pick(page, want_hex):
    labels = page.locator(".chart__color").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    for i, l in enumerate(labels):
        if want_hex.upper() in l.upper(): return i
    return None

def desktop(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1100, "height": 1000}); page = ctx.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e))); page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    setup(page)
    g0 = grid(page)
    check("4B desktop: Undo and Redo start disabled", undo_disabled(page) and redo_disabled(page))
    bg = px(page, 2, 2); idx, dark = dark_color(page)
    check("4B desktop: top-left stitch is the background, not the darkest color", bg != dark, f"{bg} vs {dark}")
    # --- fill the background
    page.locator(".chart__color").nth(idx).click()
    tool(page, "Fill")
    check("4B desktop: Fill tool selected", page.get_by_role("button", name="Fill", exact=True).get_attribute("aria-pressed") == "true")
    set_zoom(page, 1); center_on(page, 2, 2)
    x, y = client(page, 2, 2); page.mouse.click(x, y)
    nch = changed(page)
    g1 = grid(page)
    check("4B desktop: fill recolors the whole connected background", nch > 3000 and px(page, 2, 2) == dark, f"{nch} stitches")
    check("4B desktop: the counter equals the stitches that differ on screen", nch == sum(1 for a, b2 in zip(g0.split(","), g1.split(",")) if a != b2))
    check("4B desktop: fill left other colors alone (face/rays not all dark)", len(set(g1.split(","))) >= 2)
    check("4B desktop: Undo is now enabled, Redo not", (not undo_disabled(page)) and redo_disabled(page))
    page.get_by_role("button", name="Undo", exact=True).click()
    check("4B desktop: ONE Undo restores the whole fill exactly", grid(page) == g0 and changed(page) == 0)
    check("4B desktop: Redo is enabled after undo", not redo_disabled(page))
    page.get_by_role("button", name="Redo", exact=True).click()
    check("4B desktop: Redo reapplies the fill exactly", grid(page) == g1 and changed(page) == nch)
    # keyboard
    page.locator(".chart__status").click()
    page.keyboard.press("Control+z")
    check("4B desktop: Ctrl+Z undoes", grid(page) == g0)
    page.keyboard.press("Control+Shift+z")
    check("4B desktop: Ctrl+Shift+Z redoes", grid(page) == g1)
    page.keyboard.press("Control+z"); page.keyboard.press("Control+y")
    check("4B desktop: Ctrl+Y redoes", grid(page) == g1)
    page.keyboard.press("Control+z")
    # --- eyedropper
    tool(page, "Eyedropper")
    other = (48, 70)
    ox, oy = client(page, *other); target = px(page, *other)
    page.mouse.click(ox, oy)
    sel = page.locator(".chart__color[aria-pressed=true]").get_attribute("aria-label")
    check("4B desktop: eyedropper selects the clicked stitch's color", target.upper() in sel.upper(), f"{target} / {sel}")
    check("4B desktop: eyedropper returns to Paint and changes nothing", page.get_by_role("button", name="Paint", exact=True).get_attribute("aria-pressed") == "true" and grid(page) == g0 and undo_disabled(page))
    # --- paint drag is one undo step
    set_zoom(page, 4); center_on(page, 52, 62)
    a, b2 = client(page, 40, 60), client(page, 70, 66)
    n0 = page.locator(".chart__color").count()
    page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b2, steps=8); page.mouse.up()
    gp = grid(page)
    check("4B desktop: paint drag changed something", gp != g0 and changed(page) > 0)
    page.get_by_role("button", name="Undo", exact=True).click()
    check("4B desktop: a whole paint drag undoes in ONE step", grid(page) == g0 and undo_disabled(page))
    # redo cleared by new edit
    page.get_by_role("button", name="Redo", exact=True).click()
    page.get_by_role("button", name="Undo", exact=True).click()
    center_on(page, 52, 62); a, b2 = client(page, 40, 60), client(page, 70, 66)
    page.mouse.move(*a); page.mouse.down(); page.mouse.move(*b2, steps=3); page.mouse.up()
    check("4B desktop: a new edit clears Redo", redo_disabled(page))
    # fill off-chart release does nothing
    tool(page, "Fill"); n = changed(page)
    center_on(page, 52, 62); a = client(page, 40, 60)
    bx = page.evaluate("document.querySelector('.chart__scroll').getBoundingClientRect().left") - 6
    page.mouse.move(*a); page.mouse.down(); page.mouse.move(bx, a[1], steps=4)
    page.mouse.up()
    check("4B desktop: releasing a fill off the chart does nothing", changed(page) == n)
    # reset clears history
    page.get_by_role("button", name="Reset to converted").click()
    check("4B desktop: reset dialog mentions undo history", "undo history" in page.get_by_role("alertdialog").inner_text())
    page.get_by_role("button", name="Yes, reset").click()
    check("4B desktop: reset clears Undo and Redo", undo_disabled(page) and redo_disabled(page) and grid(page) == g0)
    check("4B desktop: palette size unchanged through everything", page.locator(".chart__color").count() == n0)
    # pan mode disables tools
    page.get_by_role("button", name="Pan", exact=True).click()
    pr = lambda n: page.get_by_role("button", name=n, exact=True).get_attribute("aria-pressed")
    check("4B desktop: Pan is a tool in the same group: selecting it unselects Paint", pr("Pan") == "true" and pr("Paint") == "false")
    page.get_by_role("button", name="Fill", exact=True).click()
    check("4B desktop: choosing Fill from Pan goes back to drawing with Fill", pr("Fill") == "true" and pr("Pan") == "false")
    page.get_by_role("button", name="Original", exact=True).click()
    check("4B desktop: tools are disabled while the Original picture is shown", all(page.get_by_role("button", name=n, exact=True).is_disabled() for n in ["Paint", "Fill", "Eyedropper", "Pan"]))
    hts = page.evaluate("""() => [...document.querySelectorAll('.chart__edit .chart__small, .chart__tool')].map(b => Math.round(b.getBoundingClientRect().height))""")
    check("4B desktop: new buttons are at least 44px tall", min(hts) >= 44, str(sorted(set(hts))))
    check("4B desktop: no page errors", not errors, "; ".join(errors)[:200])
    b.close()

def mobile(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2); page = ctx.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    cdp = ctx.new_cdp_session(page)
    setup(page)
    g0 = grid(page); idx, dark = dark_color(page)
    page.locator(".chart__color").nth(idx).click()
    set_zoom(page, 2); center_on(page, 5, 5)
    tool(page, "Fill")
    tx, ty = client(page, 5, 5)
    cdp_touch(cdp, "touchStart", [(tx, ty)]); cdp_touch(cdp, "touchEnd", []); time.sleep(0.3)
    g1 = grid(page)
    check("4B mobile: a tap with Fill fills the region", changed(page) > 3000 and px(page, 5, 5) == dark, str(changed(page)))
    page.get_by_role("button", name="Undo", exact=True).click()
    check("4B mobile: Undo button restores it in one step", grid(page) == g0)
    page.get_by_role("button", name="Redo", exact=True).click()
    check("4B mobile: Redo button reapplies it", grid(page) == g1)
    page.get_by_role("button", name="Undo", exact=True).click()
    # second finger during a fill touch: nothing happens
    center_on(page, 5, 5); tx, ty = client(page, 5, 5)
    cdp_touch(cdp, "touchStart", [(tx, ty)]); cdp_touch(cdp, "touchStart", [(tx, ty), (tx + 40, ty + 40)]); cdp_touch(cdp, "touchEnd", []); time.sleep(0.3)
    check("4B mobile: a second finger cancels a fill", changed(page) == 0 and grid(page) == g0)
    cdp_touch(cdp, "touchStart", [(tx, ty)]); cdp_touch(cdp, "touchCancel", []); time.sleep(0.2)
    check("4B mobile: touchCancel cancels a fill", changed(page) == 0)
    # eyedropper by tap
    tool(page, "Eyedropper"); center_on(page, 48, 70); px_, py_ = client(page, 48, 70); target = px(page, 48, 70)
    cdp_touch(cdp, "touchStart", [(px_, py_)]); cdp_touch(cdp, "touchEnd", []); time.sleep(0.2)
    sel = page.locator(".chart__color[aria-pressed=true]").get_attribute("aria-label")
    check("4B mobile: tap with Eyedropper selects that color", target.upper() in sel.upper(), f"{target} / {sel}")
    check("4B mobile: no page errors", not errors, "; ".join(errors)[:200])
    b.close()

with sync_playwright() as p:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "desktop"): desktop(p)
    if which in ("all", "mobile"): mobile(p)
bad = [r for r in results if not r[1]]
print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
sys.exit(1 if bad else 0)
