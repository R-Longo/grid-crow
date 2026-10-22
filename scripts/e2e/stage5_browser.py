"""Stage 5 real-browser checks: the downloaded files. Run with the dev server up (npx vite --port 5173 --host 127.0.0.1).
Reads the PNG that the browser really downloaded and compares it, stitch by stitch, with the chart on screen.
  python3 stage5_browser.py [desktop|mobile]"""
import json, os, re, subprocess, sys, time
from PIL import Image
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5173/"
IMG = "/tmp/claude-0/scratch/hyb/sun-card-34.png"
OUT = "/tmp/claude-0/scratch/dl"
COLS, ROWS = 96, 144
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.makedirs(OUT, exist_ok=True)
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
        try: unfold(page); page.locator(f'input[type=radio][value="{value}"]').check(force=True); return
        except Exception:
            if page.locator("dialog.discard[open]").count(): return  # the app is asking first; a second click could hit its buttons
            time.sleep(0.5)
def setup(page):
    page.goto(URL); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG)
    for v in ("24x32", "10"): pick_radio(page, v)
    (unfold(page), page.get_by_role("button", name=re.compile("Create My Crochet Grid"))).__getitem__(1).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=60000)
    page.wait_for_function("document.querySelector('[data-testid=chart-canvas]').width > 0"); time.sleep(0.6)
def grid(page):
    return page.evaluate("""([cols,rows]) => { const cv=document.querySelector('[data-testid=chart-canvas]'); const cw=cv.width/cols, ch=cv.height/rows;
      const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data; const out=[];
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ const i=(Math.floor((r+0.5)*ch)*cv.width+Math.floor((c+0.5)*cw))*4; out.push((d[i]<<16)|(d[i+1]<<8)|d[i+2]); }
      return out; }""", [COLS, ROWS])
def palette(page):
    out = []
    for l in page.locator(".chart__color").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))"):
        m = re.search(r"#([0-9A-Fa-f]{6}).*?([\d,]+) stitch", l); out.append((m.group(1).upper(), int(m.group(2).replace(",", ""))))
    return out
def center_on(page, c, r):
    page.evaluate("""([c,r,cols,rows]) => { const sc=document.querySelector('.chart__scroll'); sc.scrollIntoView({block:'center'});
      const cv=document.querySelector('[data-testid=chart-canvas]'); const cw=cv.width/cols, ch=cv.height/rows;
      sc.scrollLeft=(c+0.5)*cw-sc.clientWidth/2; sc.scrollTop=(r+0.5)*ch-sc.clientHeight/2; }""", [c, r, COLS, ROWS]); time.sleep(0.15)
def client(page, c, r):
    return page.evaluate("""([c,r,cols,rows]) => { const cv=document.querySelector('[data-testid=chart-canvas]'); const b=cv.getBoundingClientRect();
      return [b.left+(c+0.5)*b.width/cols, b.top+(r+0.5)*b.height/rows]; }""", [c, r, COLS, ROWS])
def cdp_touch(cdp, kind, pts): cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
def set_zoom(page, z):
    o = False
    if page.locator(".chart__zoom input").count() == 0 or not page.locator(".chart__zoom input").is_visible():
        if _opts(page).count() and _opts(page).get_attribute("aria-expanded") != "true": _opts(page).tap() if False else _opts(page).click(); o = True; time.sleep(0.2)
    page.evaluate("""(z) => { const el=document.querySelector('.chart__zoom input'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,String(z)); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }""", z)
    if o: _opts(page).click(); time.sleep(0.2)
    time.sleep(0.3)
def _opts(page): return page.get_by_role("button", name="Options")
def tool(page, name): page.get_by_role("button", name=name, exact=True).click()

def edit(page, cdp=None):
    """A big fill with the darkest color plus a few single pencil stitches in another color."""
    pal = palette(page)
    lum = [0.299*int(h[:2],16)+0.587*int(h[2:4],16)+0.114*int(h[4:],16) for h, _ in pal]
    dark = lum.index(min(lum)); other = lum.index(max(lum))
    def tap(x, y):
        if cdp: cdp_touch(cdp, "touchStart", [(x, y)]); cdp_touch(cdp, "touchEnd", [])
        else: page.mouse.click(x, y)
        time.sleep(0.25)
    set_zoom(page, 2)
    page.locator(".chart__color").nth(dark).click(); tool(page, "Fill"); center_on(page, 2, 2); tap(*client(page, 2, 2))
    page.locator(".chart__color").nth(other).click(); tool(page, "Paint")
    for c, r in [(40, 60), (41, 60), (42, 61)]:
        center_on(page, c, r); tap(*client(page, c, r))
    time.sleep(0.3)

def probe(n):
    r = subprocess.run(["npx", "vite-node", "scripts/e2e/layout_probe.ts", str(COLS), str(ROWS), str(n)], cwd=ROOT, capture_output=True, text=True, timeout=120)
    return json.loads(r.stdout.strip().splitlines()[-1])

def ocr(img, box, psm=7, digits=False, scale=3, hexchars=False):
    crop = img.crop(box).convert("L")
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.LANCZOS)
    p = os.path.join(OUT, "ocr.png"); crop.save(p)
    cfg = ["tesseract", p, "-", "--psm", str(psm)] + (["-c", "tessedit_char_whitelist=0123456789"] if digits else []) + (["-c", "tessedit_char_whitelist=#0123456789ABCDEF"] if hexchars else [])
    return subprocess.run(cfg, capture_output=True, text=True).stdout

def dist(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1): cur.append(min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (ca != cb)))
        prev = cur
    return prev[-1]

def verify_png(tag, path, before, after, pal):
    img = Image.open(path).convert("RGB")
    used = [(h, n) for h, n in pal if n > 0]
    L = probe(len(used))
    check(f"{tag}: the PNG is {L['width']} x {L['height']} px (inside the phone-safe pixel budget)", img.size == (L["width"], L["height"]) and img.width * img.height <= 12_000_000, f"{img.size}")
    bad = 0; wrong_vs_before = 0
    for r in range(ROWS):
        for c in range(COLS):
            px = img.getpixel((L["x0"] + c * L["cellW"] + 4, L["y0"] + r * L["cellH"] + 4))
            v = (px[0] << 16) | (px[1] << 8) | px[2]
            if v != after[r * COLS + c]: bad += 1
    check(f"{tag}: all {COLS*ROWS} stitches in the PNG match the edited chart on screen exactly", bad == 0, f"{bad} differ")
    edited = [i for i in range(COLS * ROWS) if before[i] != after[i]]
    check(f"{tag}: the PNG contains the edits (fill + pencil), not the unedited conversion", len(edited) > 3000 and all(
        ((lambda px: (px[0] << 16) | (px[1] << 8) | px[2])(img.getpixel((L["x0"] + (i % COLS) * L["cellW"] + 4, L["y0"] + (i // COLS) * L["cellH"] + 4))) == after[i]) for i in edited[::7]), f"{len(edited)} edited stitches")
    # legend swatches: colors in palette order, only colors in use
    sw = []
    for e in L["legend"]:
        px = img.getpixel((e["swatch"]["x"] + e["swatch"]["size"] // 2, e["swatch"]["y"] + e["swatch"]["size"] // 2)); sw.append("%02X%02X%02X" % px)
    check(f"{tag}: legend swatches are the yarn colors in use, in order", sw == [h for h, _ in used], f"{sw} vs {[h for h,_ in used]}")
    # legend text, read back out of the picture
    ok_hex = ok_cnt = 0; seen = []
    for e, (h, n) in zip(L["legend"], used):
        t = e["hexText"]; hx = ocr(img, (t["x"] - 4, int(t["y"] - 22), t["x"] + 220, int(t["y"] + 22)), 7, hexchars=True, scale=4).strip().upper().replace(" ", "")
        t2 = e["countText"]; ct = ocr(img, (t2["x"] - 262, int(t2["y"] - 22), t2["x"] + 6, int(t2["y"] + 22)), 7)
        digits = re.sub(r"\D", "", ct.split("stitch")[0]) if "stitch" in ct.lower() else re.sub(r"\D", "", ct)
        ok_hex += dist(hx.replace("O", "0"), "#" + h) <= 2  # OCR may slip on one or two characters; exact text is checked in the unit tests
        ok_cnt += digits == str(n); seen.append((hx, "#" + h))
    check(f"{tag}: legend hex codes read back from the picture match", ok_hex == len(used), f"{ok_hex}/{len(used)} {[x for x in seen if dist(x[0].replace('O','0'), x[1]) > 0]}")
    check(f"{tag}: legend stitch counts read back from the picture match the chart's counts exactly", ok_cnt == len(used), f"{ok_cnt}/{len(used)}")
    total_txt = ocr(img, (L["total"]["x"], int(L["total"]["y"] - 24), L["total"]["x"] + 900, int(L["total"]["y"] + 24)), 7)
    check(f"{tag}: total line says 13,824 stitches", "13,824" in total_txt.replace(" ", ""), total_txt.strip())
    sumcounts = sum(n for _, n in used)
    check(f"{tag}: on-screen counts add up to every stitch in the chart", sumcounts == COLS * ROWS, str(sumcounts))
    # numbering: stitch 1 at the RIGHT edge (counting 96 at the left) along the top, row 1 at the bottom of the left edge
    top = ocr(img, (L["x0"], L["y0"] - 56, L["x0"] + 4 * L["cellW"], L["y0"] - 8), 7, True).split()
    check(f"{tag}: column numbers start at 96 on the left and fall toward the right", "".join(top).startswith("96959493"), str(top))
    topright = ocr(img, (L["x0"] + (COLS - 3) * L["cellW"], L["y0"] - 56, L["x0"] + COLS * L["cellW"], L["y0"] - 8), 7, True).split()
    check(f"{tag}: ... and the last ones at the right edge are 3, 2, 1", "".join(topright).startswith("32"), str(topright))
    left_bottom = ocr(img, (L["x0"] - 70, L["y0"] + L["chartH"] - 3 * L["cellH"], L["x0"] - 6, L["y0"] + L["chartH"]), 6, True).split()
    left_top = ocr(img, (L["x0"] - 70, L["y0"], L["x0"] - 6, L["y0"] + 3 * L["cellH"]), 6, True).split()
    check(f"{tag}: row 1 is at the BOTTOM (rows 3, 2, 1 reading down the bottom-left)", left_bottom == ["3", "2", "1"], str(left_bottom))
    check(f"{tag}: the top row is row 144 (144, 143, 142 reading down the top-left)", left_top == ["144", "143", "142"], str(left_top))
    check(f"{tag}: nothing from the website is in the picture (background is plain paper at the corners)", img.getpixel((2, 2)) == (251, 247, 240) and img.getpixel((img.width - 3, img.height - 3)) == (251, 247, 240))
    # a reduced copy and a zoomed corner for looking at
    img.resize((img.width // 4, img.height // 4), Image.LANCZOS).save(os.path.join(OUT, f"{tag.replace(' ', '_')}_small.png"))
    img.crop((0, 0, 1400, 900)).save(os.path.join(OUT, f"{tag.replace(' ', '_')}_topleft.png"))
    img.crop((0, img.height - 900, 1400, img.height)).save(os.path.join(OUT, f"{tag.replace(' ', '_')}_legend.png"))

def desktop(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True); page = ctx.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    setup(page)
    btn = page.locator("[data-testid=download-png]")
    check("5A desktop: Download PNG is on the page, visible, in the sidebar", btn.count() == 1 and btn.is_visible())
    check("5A desktop: the button is at least 44px tall", btn.bounding_box()["height"] >= 44, str(btn.bounding_box()))
    before = grid(page); edit(page); after = grid(page); pal = palette(page)
    check("5A desktop: the editor now differs from the conversion", sum(1 for a, b2 in zip(before, after) if a != b2) > 3000)
    with page.expect_download(timeout=60000) as dl:
        btn.click()
    d = dl.value; path = os.path.join(OUT, "desktop.png"); d.save_as(path)
    check("5A desktop: file is named gridcrow-pattern-96x144.png", d.suggested_filename == "gridcrow-pattern-96x144.png", d.suggested_filename)
    time.sleep(0.5)
    check("5A desktop: a 'Downloaded ...' message appears", "Downloaded gridcrow-pattern-96x144.png" in page.locator("[data-testid=download-note]").inner_text())
    check("5A desktop: exporting did not change the chart or the edit counter", grid(page) == after)
    verify_png("5A desktop", path, before, after, pal)
    # export again after more edits: the new file reflects them
    center_on(page, 70, 100); x, y = client(page, 70, 100); page.mouse.click(x, y); time.sleep(0.3)
    after2 = grid(page)
    with page.expect_download(timeout=60000) as dl2: btn.click()
    path2 = os.path.join(OUT, "desktop2.png"); dl2.value.save_as(path2)
    img2 = Image.open(path2).convert("RGB"); L = probe(len([1 for _, n in palette(page) if n > 0]))
    px = img2.getpixel((L["x0"] + 70 * L["cellW"] + 4, L["y0"] + 100 * L["cellH"] + 4)); v = (px[0] << 16) | (px[1] << 8) | px[2]
    check("5A desktop: a second download includes the newest edit", v == after2[100 * COLS + 70] and after2 != after, hex(v))
    check("5A desktop: no page errors", not errors, "; ".join(errors)[:200])
    b.close()

def mobile(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2, accept_downloads=True); page = ctx.new_page()
    cdp = ctx.new_cdp_session(page); errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    setup(page)
    opener = page.locator("[data-testid=download-open]")
    check("5B phone: a Download button is in the bar above the chart", opener.count() == 1 and opener.is_visible())
    hb = opener.bounding_box(); check("5A phone: the Download button is at least 44px tall", hb["height"] >= 44, str(hb))
    check("5A phone: the buttons in the bar fit inside the screen", all(page.locator(".chart__bar > button").nth(i).bounding_box()["x"] >= 0 and page.locator(".chart__bar > button").nth(i).bounding_box()["x"] + page.locator(".chart__bar > button").nth(i).bounding_box()["width"] <= 390 for i in range(3)))
    before = grid(page); edit(page, cdp); after = grid(page); pal = palette(page)
    opener.tap(); time.sleep(0.3)
    btn = page.locator("[data-testid=download-png]")
    check("5A phone: tapping Download opens the panel with Download PNG", btn.is_visible() and opener.get_attribute("aria-expanded") == "true")
    check("5A phone: Download PNG is at least 44px tall and inside the screen", btn.bounding_box()["height"] >= 44 and btn.bounding_box()["x"] >= 0 and btn.bounding_box()["x"] + btn.bounding_box()["width"] <= 390, str(btn.bounding_box()))
    _opts(page).tap(); time.sleep(0.2)
    check("5A phone: opening Options closes the Download panel (one panel at a time)", not btn.is_visible() and _opts(page).get_attribute("aria-expanded") == "true")
    opener.tap(); time.sleep(0.2)
    check("5A phone: ... and the other way round", btn.is_visible() and _opts(page).get_attribute("aria-expanded") == "false")
    page.keyboard.press("Escape"); time.sleep(0.2)
    check("5A phone: Escape closes the panel", not btn.is_visible())
    opener.tap(); time.sleep(0.2)
    with page.expect_download(timeout=90000) as dl: btn.tap()
    path = os.path.join(OUT, "mobile.png"); dl.value.save_as(path)
    check("5A phone: the download starts from a tap and is named gridcrow-pattern-96x144.png", dl.value.suggested_filename == "gridcrow-pattern-96x144.png")
    time.sleep(0.4)
    check("5A phone: the confirmation message is visible in the panel", "Downloaded" in page.locator("[data-testid=download-note]").inner_text() and page.locator("[data-testid=download-note]").is_visible())
    page.screenshot(path=os.path.join(OUT, "mobile_panel.png"))
    verify_png("5A phone", path, before, after, pal)
    check("5A phone: no page errors", not errors, "; ".join(errors)[:200])
    b.close()

if __name__ == "__main__":
  with sync_playwright() as p:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "desktop"): desktop(p)
    if which in ("all", "mobile"): mobile(p)
  bad = [r for r in results if not r[1]]
  print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad else 0)
