"""Phase 3: live resizing, rotation, odd window sizes (installed-app windows), zoomed-in state, mid-stroke resize."""
from _blank import start_blank
import random, re, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"
ok = bad = 0
def check(n, c, d=""):
    global ok, bad
    if c: ok += 1
    else: bad += 1; print(f"FAIL {n}  [{d}]")

JS = """() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height}; };
  const sc = document.querySelector('.chart__scroll');
  const reach = n => { const b = [...document.querySelectorAll('.chart button')].find(e => (e.getAttribute('aria-label')||e.textContent).trim() === n || (e.getAttribute('aria-label')||e.textContent).trim().startsWith(n) && !(e.getAttribute('aria-label')||'').includes(' with ')); if (!b) return false; const bb = b.getBoundingClientRect(); return bb.top >= -1 && bb.bottom <= innerHeight + 1 && bb.left >= -1 && bb.right <= innerWidth + 1; };
  const z = document.querySelector('.chart__zoom input');
  return { cv: r('[data-testid=chart-canvas]'), box: r('.chart__scroll'), rt: r('.chart__ruler--top'), rl: r('.chart__ruler--left'), chart: r('.chart'),
    sl: sc.scrollLeft, st: sc.scrollTop, maxL: sc.scrollWidth - sc.clientWidth, maxT: sc.scrollHeight - sc.clientHeight, scrollW: sc.scrollWidth, clientW: sc.clientWidth, scrollH: sc.scrollHeight, clientH: sc.clientHeight,
    sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, paint: reach('Paint'), undo: reach('Undo'), zoomVal: z ? parseFloat(z.value) : null, zoomMin: z ? parseFloat(z.min) : null }; }"""

def open_chart(page):
    page.goto(URL); page.wait_for_load_state("networkidle"); page.wait_for_selector("[data-testid=mode-manual-choice]", state="attached")
    start_blank(page); time.sleep(0.4)
    page.locator("[data-testid=open-blank]").click(); page.wait_for_selector("[data-testid=chart-canvas]", state="visible"); time.sleep(0.9)

def look(page):
    page.evaluate("document.querySelector('.chart').scrollIntoView({block:'start'})"); time.sleep(0.6)
    return page.evaluate(JS)

def whole(tag, S):
    cv = S["cv"]
    check(f"{tag}: no horizontal page scrolling", S["sw"] <= S["iw"], f"{S['sw']} vs {S['iw']}")
    check(f"{tag}: whole chart on screen, undistorted", cv["l"] >= -0.5 and cv["r"] <= S["iw"] + 0.5 and cv["t"] >= -0.5 and cv["b"] <= S["ih"] + 0.5 and abs((cv["w"] / 48) / (cv["h"] / 72) - 9 / 8) / (9 / 8) < 0.02,
          f"{cv['l']:.0f},{cv['t']:.0f}-{cv['r']:.0f},{cv['b']:.0f} of {S['iw']}x{S['ih']}")
    check(f"{tag}: rulers line up with the chart", S["rt"] and S["rl"] and abs(S["rt"]["l"] - S["box"]["l"]) <= 2 and abs(S["rl"]["t"] - S["box"]["t"]) <= 2)

def run(p):
    b = p.chromium.launch(); errors = []
    def hook(page):
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)

    # 1. odd window sizes, as an installed app window could be
    for (w, h) in [(360, 640), (412, 915), (500, 700), (600, 400), (700, 320), (800, 600), (1024, 600), (1366, 768), (2200, 1200), (3840, 2160)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=w < 900); page = ctx.new_page(); hook(page)
        open_chart(page); S = look(page); tag = f"{w}x{h}"
        whole(tag, S)
        check(f"{tag}: Paint and Undo reachable", S["paint"] and S["undo"], f"{S['paint']} {S['undo']}")
        ctx.close()

    # 2. rotation and resizing keep the chart fitted
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True); page = ctx.new_page(); hook(page); open_chart(page)
    for (w, h) in [(844, 390), (390, 844), (820, 1180), (1180, 820), (844, 390), (390, 844)]:
        page.set_viewport_size({"width": w, "height": h}); time.sleep(0.8); whole(f"rotate to {w}x{h}", look(page))
    ctx.close()

    # 3. zoomed in, then rotate: nothing breaks, scroll stays inside the chart, Fit to Screen restores the whole chart
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); page = ctx.new_page(); hook(page); open_chart(page); look(page)
    for _ in range(4): page.get_by_role("button", name=re.compile("Zoom in|\\+")).first.click(); time.sleep(0.15)
    page.locator(".chart__scroll").evaluate("e => { e.scrollLeft = 99999; e.scrollTop = 99999; }"); time.sleep(0.2)
    for (w, h) in [(900, 700), (600, 900), (1440, 900)]:
        page.set_viewport_size({"width": w, "height": h}); time.sleep(0.8); S = look(page)
        check(f"zoomed, resize to {w}x{h}: scroll stays inside the chart", 0 <= S["sl"] <= S["maxL"] + 1 and 0 <= S["st"] <= S["maxT"] + 1, f"{S['sl']}/{S['maxL']} {S['st']}/{S['maxT']}")
        check(f"zoomed, resize to {w}x{h}: rulers line up", S["rt"] and S["rl"] and abs(S["rt"]["l"] - S["box"]["l"]) <= 2 and abs(S["rl"]["t"] - S["box"]["t"]) <= 2)
        check(f"zoomed, resize to {w}x{h}: no horizontal page scrolling", S["sw"] <= S["iw"])
    page.get_by_role("button", name="Fit to Screen").click(); time.sleep(0.5); whole("zoomed then Fit to Screen", look(page))
    ctx.close()

    # 4. a storm of random resizes ends fitted, with no errors
    ctx = b.new_context(viewport={"width": 1000, "height": 800}); page = ctx.new_page(); hook(page); open_chart(page)
    rnd = random.Random(7)
    for _ in range(25):
        page.set_viewport_size({"width": rnd.randint(320, 1800), "height": rnd.randint(320, 1100)}); time.sleep(0.03)
    page.set_viewport_size({"width": 1280, "height": 760}); time.sleep(1.0); whole("after a storm of resizes", look(page))
    ctx.close()

    # 5. resize in the middle of a brush stroke: no crash, the stroke ends cleanly, undo works
    ctx = b.new_context(viewport={"width": 1200, "height": 800}); page = ctx.new_page(); hook(page); open_chart(page); S = look(page)
    cv = S["cv"]; counts = lambda: page.evaluate("[...document.querySelectorAll('.chart__color')].map(e => e.innerText.replace(/\\s+/g,' '))"); before = counts()
    page.mouse.move(cv["l"] + 40, cv["t"] + 40); page.mouse.down(); page.mouse.move(cv["l"] + 120, cv["t"] + 90, steps=4)
    page.set_viewport_size({"width": 900, "height": 700}); time.sleep(0.6)
    page.mouse.up(); time.sleep(0.4)
    painted = counts()
    page.get_by_role("button", name="Undo").click(); time.sleep(0.3)
    after = counts()
    whole("after a resize mid-stroke", look(page))
    check("a resize mid-stroke leaves a drawing that undoes fully", after == before, f"{before[:2]} {painted[:2]} {after[:2]}")
    ctx.close()

    errs = [e for e in errors if "favicon" not in e and "sw.js" not in e]
    check("no page or console errors", not errs, str(errs[:3]))
    b.close(); print(f"{ok}/{ok + bad} checks passed")
with sync_playwright() as p: run(p)
