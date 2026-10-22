"""Stage 4C real-browser checks: the "replace your edited chart?" confirmation, the leave-page warning, and drawing speed.
Run with the dev server up (npx vite --port 5173 --host 127.0.0.1). Chromium only; touch is emulated.
  python3 stage4c_browser.py [desktop|mobile|speed]"""
import re, sys, time
from playwright.sync_api import sync_playwright

# These tests are about the "you'll lose edits" warnings, which only matter when a project can't be saved on the device.
from playwright.sync_api import Browser as _B
_orig_nc = _B.new_context
def _nc(self, *a, **k):
    c = _orig_nc(self, *a, **k); c.add_init_script("Object.defineProperty(window,'indexedDB',{value:undefined})"); return c
_B.new_context = _nc

URL = "http://127.0.0.1:5173/"
IMG = "/tmp/claude-0/scratch/hyb/sun-card-34.png"
COLS, ROWS = 96, 144
results = []
def unfold(page):
    """On a phone the setup folds into a bar once a chart is open; open it again before touching setup controls."""
    b = page.locator("[data-testid=setup-change]")
    if b.count() and b.is_visible() and b.get_attribute("aria-expanded") == "false":
        b.click(); time.sleep(0.4)
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)

def pick_radio(page, value):
    for attempt in range(4):
        try:
            unfold(page); page.locator(f'input[type=radio][value="{value}"]').check(force=True); return
        except Exception:
            # When the app asks "replace your edited chart?" the box stays unchecked until it is answered: that is not a failure,
            # and clicking again could land on one of the dialog's buttons.
            if page.locator("dialog.discard[open]").count(): return
            time.sleep(0.5)

def setup(page, size="24x32", colors="10"):
    page.goto(URL); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG)
    for value in (size, colors): pick_radio(page, value)
    create(page)

def create(page):
    (unfold(page), page.get_by_role("button", name=re.compile("Create My Crochet Grid"))).__getitem__(1).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=60000)
    page.wait_for_function("document.querySelector('[data-testid=chart-canvas]').width > 0")
    time.sleep(0.5)

def has_chart(page): return page.locator("[data-testid=chart-canvas]").count() > 0
def dlg(page): return page.locator("dialog.discard[open]")
def checked(page, value): return page.locator(f'input[type=radio][value="{value}"]').is_checked()

def _opts(page): return page.get_by_role("button", name="Options")
def open_options(page):
    if _opts(page).count() and _opts(page).get_attribute("aria-expanded") != "true":
        _opts(page).click(); time.sleep(0.15); return True
    return False
def close_options(page, opened):
    if opened: _opts(page).click(); time.sleep(0.15)
def changed(page):
    o = open_options(page) if page.locator("[data-testid=chart-changed]").count() == 0 or not page.locator("[data-testid=chart-changed]").is_visible() else False
    t = page.locator("[data-testid=chart-changed]").inner_text(); close_options(page, o)
    m = re.match(r"(\d+)", t); return int(m.group(1)) if m else 0

def center_on(page, c, r):
    page.evaluate("""([c,r,cols,rows]) => { const sc=document.querySelector('.chart__scroll'); sc.scrollIntoView({block:'center'});
      const cv=document.querySelector('[data-testid=chart-canvas]'); const cw=cv.width/cols, ch=cv.height/rows;
      sc.scrollLeft=(c+0.5)*cw-sc.clientWidth/2; sc.scrollTop=(r+0.5)*ch-sc.clientHeight/2; }""", [c, r, COLS, ROWS])
    time.sleep(0.15)
def client(page, c, r):
    return page.evaluate("""([c,r,cols,rows]) => { const cv=document.querySelector('[data-testid=chart-canvas]'); const b=cv.getBoundingClientRect();
      return [b.left+(c+0.5)*b.width/cols, b.top+(r+0.5)*b.height/rows]; }""", [c, r, COLS, ROWS])
def cdp_touch(cdp, kind, pts):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
def dark_index(page):
    labels = page.locator(".chart__color").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    best = None
    for i, l in enumerate(labels):
        hx = re.search(r"#([0-9A-Fa-f]{6})", l).group(1); r, g, b = int(hx[:2], 16), int(hx[2:4], 16), int(hx[4:], 16)
        lum = 0.299*r + 0.587*g + 0.114*b
        if best is None or lum < best[0]: best = (lum, i)
    return best[1]
def tool(page, name): page.get_by_role("button", name=name, exact=True).click()

def edit_chart(page, cdp=None):
    """Fill the background with the darkest color: one big hand edit."""
    page.locator(".chart__color").nth(dark_index(page)).click()
    tool(page, "Fill")
    center_on(page, 2, 2); x, y = client(page, 2, 2)
    if cdp: cdp_touch(cdp, "touchStart", [(x, y)]); cdp_touch(cdp, "touchEnd", [])
    else: page.mouse.click(x, y)
    time.sleep(0.4)
    return changed(page)

def answer(page, which, touch=False):
    b = page.get_by_role("button", name="Keep editing" if which == "keep" else "Discard edits and continue")
    b.tap() if touch else b.click(); time.sleep(0.4)

def crop_zoom(page, v):
    page.evaluate("""(v) => { const el=document.querySelector('.crop__controls input'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,String(v)); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }""", v)
    time.sleep(0.3)
def crop_value(page): return float(page.locator(".crop__controls input").input_value())

def scenario(page, tag, cdp=None):
    touch = cdp is not None
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    setup(page)
    # --- nothing to lose: no questions asked
    pick_radio(page, "16x20"); time.sleep(0.4)
    check(f"{tag}: with no edits, changing the size just works (no dialog)", dlg(page).count() == 0 and checked(page, "16x20") and not has_chart(page))
    pick_radio(page, "24x32"); create(page)
    check(f"{tag}: a fresh chart reports no edits", changed(page) == 0)
    check(f"{tag}: Create again with no edits just rebuilds (no dialog)", (create(page) or True) and dlg(page).count() == 0 and has_chart(page))

    # --- make edits
    n = edit_chart(page, cdp)
    check(f"{tag}: the edit registered", n > 3000, f"{n} stitches")

    # --- size change: asks, Escape keeps everything
    pick_radio(page, "16x20"); time.sleep(0.4)
    d = dlg(page)
    check(f"{tag}: changing the size with edits opens the confirmation", d.count() == 1)
    txt = d.inner_text() if d.count() else ""
    check(f"{tag}: it names the action and the number of edited stitches", "Changing the size" in txt and f"{n:,} hand-edited stitches" in txt and "undo history" in txt, txt.replace("\n", " ")[:160])
    check(f"{tag}: the chart is still there and the radio still shows the old size", has_chart(page) and checked(page, "24x32") and not checked(page, "16x20"))
    focus = page.evaluate("document.activeElement && document.activeElement.textContent")
    check(f"{tag}: focus starts on the safe choice", focus and "Keep editing" in focus, str(focus))
    box = d.bounding_box(); vw = page.evaluate("innerWidth"); vh = page.evaluate("innerHeight")
    check(f"{tag}: dialog fits inside the screen", box and box["x"] >= 0 and box["x"] + box["width"] <= vw and box["y"] >= 0 and box["y"] + box["height"] <= vh, str(box))
    btns = page.locator("dialog.discard button"); hs = [btns.nth(i).bounding_box()["height"] for i in range(btns.count())]
    check(f"{tag}: both buttons are at least 44px tall", btns.count() == 2 and all(h >= 44 for h in hs), str(hs))
    page.screenshot(path=f"/tmp/claude-0/scratch/c4_{tag}_dialog.png")
    # focus stays inside the dialog while tabbing
    inside = True
    for _ in range(6):
        page.keyboard.press("Tab")
        # Focus may pass to the browser's own toolbar (document.body here), never to anything on the page behind.
        inside &= page.evaluate("document.activeElement === document.body || !!document.activeElement.closest('dialog.discard')")
    check(f"{tag}: Tab never reaches the page behind the dialog", inside)
    blocked = False
    try:
        (unfold(page), page.get_by_role("button", name=re.compile("Create My Crochet Grid"))).__getitem__(1).click(timeout=1500)
    except Exception:
        blocked = True
    check(f"{tag}: the page behind the dialog cannot be clicked", blocked and dlg(page).count() == 1)
    # a click on the dimmed area does nothing
    page.mouse.click(3, 3); time.sleep(0.2)
    check(f"{tag}: clicking outside the dialog does not dismiss or discard it", dlg(page).count() == 1 and has_chart(page))
    page.keyboard.press("Escape"); time.sleep(0.3)
    check(f"{tag}: Escape = Keep editing: dialog gone, edits untouched", dlg(page).count() == 0 and has_chart(page) and changed(page) == n and checked(page, "24x32"))

    # --- every other kind of change asks too
    asks = {}
    pick_radio(page, "landscape"); time.sleep(0.3); asks["orientation"] = ("Changing the orientation", dlg(page).count() == 1); answer(page, "keep", touch)
    pick_radio(page, "6"); time.sleep(0.3); asks["colors"] = ("Changing the maximum colors", dlg(page).count() == 1); answer(page, "keep", touch)
    crop_zoom(page, 1.5); time.sleep(0.3); asks["crop"] = ("Changing the crop", dlg(page).count() == 1); answer(page, "keep", touch)
    check(f"{tag}: orientation, max colors and crop each ask first", all(v[1] for v in asks.values()), str({k: v[1] for k, v in asks.items()}))
    check(f"{tag}: after three 'Keep editing' answers nothing changed", has_chart(page) and changed(page) == n and checked(page, "24x32") and checked(page, "portrait") and checked(page, "10") and crop_value(page) == 1.0, f"crop {crop_value(page)}")
    # Create again with edits
    (unfold(page), page.get_by_role("button", name=re.compile("Create My Crochet Grid"))).__getitem__(1).click(); time.sleep(0.4)
    check(f"{tag}: pressing Create again with edits asks first", dlg(page).count() == 1 and "Building a new grid" in dlg(page).inner_text())
    answer(page, "keep", touch)
    check(f"{tag}: Keep editing leaves the edited chart exactly as it was", has_chart(page) and changed(page) == n)
    # Removing / replacing the picture
    # (the upload input replaces the file)
    page.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG); time.sleep(0.4)
    check(f"{tag}: choosing a picture again asks first", dlg(page).count() == 1 and "picture" in dlg(page).inner_text())
    answer(page, "keep", touch)

    # --- leave-page warning (browser's own prompt)
    prompts = []
    def on_dialog(dg):
        prompts.append(dg.type); dg.dismiss() if len(prompts) == 1 else dg.accept()
    page.on("dialog", on_dialog)
    try: page.reload()
    except Exception: pass
    time.sleep(0.5)
    check(f"{tag}: reloading with edits shows the browser's 'Leave this page?' prompt", prompts[:1] == ["beforeunload"], str(prompts))
    check(f"{tag}: choosing to stay keeps the edited chart", has_chart(page) and changed(page) == n)

    # --- discard path: the answer 'Discard' carries the change out
    pick_radio(page, "16x20"); time.sleep(0.4)
    answer(page, "discard", touch); time.sleep(0.5)
    check(f"{tag}: 'Discard edits and continue' applies the change and removes the old chart", dlg(page).count() == 0 and checked(page, "16x20") and not has_chart(page))
    prompts.clear(); page.reload(); time.sleep(0.8)  # nothing to lose now
    check(f"{tag}: once the chart is gone, leaving the page does not ask", prompts == [], str(prompts))
    page.remove_listener("dialog", on_dialog)

    # --- Create after discard: a clean slate
    setup(page)
    n2 = edit_chart(page, cdp)
    (unfold(page), page.get_by_role("button", name=re.compile("Create My Crochet Grid"))).__getitem__(1).click(); time.sleep(0.4)
    answer(page, "discard", touch); page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=60000); time.sleep(0.8)
    check(f"{tag}: discarding then Create gives a brand-new chart with no edits", has_chart(page) and changed(page) == 0 and n2 > 3000)

    # --- undo everything: nothing left to lose, so no question
    n3 = edit_chart(page, cdp)
    undo = page.get_by_role("button", name="Undo", exact=True); undo.click(); time.sleep(0.3)
    pick_radio(page, "16x20"); time.sleep(0.4)
    check(f"{tag}: if undo has removed every edit there is nothing to protect (no dialog)", n3 > 0 and dlg(page).count() == 0 and checked(page, "16x20"))

    # --- Reset still has its own confirmation
    pick_radio(page, "24x32"); create(page)
    edit_chart(page, cdp)
    o = open_options(page); page.get_by_role("button", name=re.compile("Reset")).click(); time.sleep(0.3)
    check(f"{tag}: Reset to converted still asks (separate small confirmation)", page.locator(".chart__dialog").count() == 1 and dlg(page).count() == 0)
    page.keyboard.press("Escape"); close_options(page, o)
    check(f"{tag}: no page errors", not errors, "; ".join(errors)[:200])

def desktop(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1100, "height": 1000}); page = ctx.new_page()
    scenario(page, "4C desktop"); b.close()

def mobile(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2); page = ctx.new_page()
    cdp = ctx.new_cdp_session(page)
    scenario(page, "4C phone", cdp)
    b.close()

def speed(p):
    """How long the screen takes to show a change on the largest chart (Chromium, this machine; a phone will be slower)."""
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1100, "height": 1000}); page = ctx.new_page()
    setup(page)
    page.locator(".chart__color").nth(dark_index(page)).click()
    center_on(page, 2, 2)
    # time from the click to the next painted frame
    def frame_time(action):
        page.evaluate("window.__t = null")
        page.evaluate("""() => { window.__done = new Promise(res => { window.__start = performance.now(); }); }""")
        action()
        return page.evaluate("""() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - window.__start))))""")
    tool(page, "Fill"); x, y = client(page, 2, 2)
    t_fill = frame_time(lambda: page.mouse.click(x, y))
    undo = page.get_by_role("button", name="Undo", exact=True)
    t_undo = frame_time(lambda: undo.click())
    redo = page.get_by_role("button", name="Redo", exact=True)
    t_redo = frame_time(lambda: redo.click())
    tool(page, "Paint")
    center_on(page, 48, 70); x0, y0 = client(page, 48, 70)
    t0 = time.time(); page.mouse.move(x0, y0); page.mouse.down()
    for i in range(400): page.mouse.move(x0 + (i % 40) * 3, y0 + (i // 10) * 2)
    page.mouse.up(); wall = (time.time() - t0) * 1000
    paints = page.evaluate("""() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now()))))""")
    print(f"SPEED fill->frame {t_fill:.0f} ms | undo->frame {t_undo:.0f} ms | redo->frame {t_redo:.0f} ms | 400-move stroke driven in {wall:.0f} ms ({wall/400:.1f} ms per move incl. test overhead)")
    check("4C speed: fill, undo and redo each show on screen within 250 ms (96 x 144)", max(t_fill, t_undo, t_redo) < 250, f"{t_fill:.0f}/{t_undo:.0f}/{t_redo:.0f} ms")
    b.close()

with sync_playwright() as p:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "desktop"): desktop(p)
    if which in ("all", "mobile"): mobile(p)
    if which in ("all", "speed"): speed(p)
bad = [r for r in results if not r[1]]
print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
sys.exit(1 if bad else 0)
