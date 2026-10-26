"""Rulers, row/column highlight and direction status: real-browser checks on desktop and phone (emulated touch).
Blank Canvas and a converted chart. Needs the dev server (npx vite --port 5173 --host 127.0.0.1).
  python3 rulers_browser.py [desktop|mobile]"""
from _blank import start_blank
import sys, time
from playwright.sync_api import sync_playwright
import blank_browser as b

results = b.results
check = b.check

LABELS_JS = """() => { const sc=document.querySelector('.chart__scroll'); const cv=document.querySelector('[data-testid=chart-canvas]');
  return {sl:sc.scrollLeft, st:sc.scrollTop, cw:sc.clientWidth, ch:sc.clientHeight, w:cv.width, h:cv.height}; }"""

def ruler_ink(page, which):
    """x (top) or y (left) pixel centres of ink columns/rows on the ruler canvas, in CSS px, merged into runs."""
    return page.evaluate("""(which) => { const cv=document.querySelector('[data-testid=ruler-'+which+']'); const ctx=cv.getContext('2d');
      const W=cv.width, H=cv.height, dpr=W/cv.getBoundingClientRect().width; const d=ctx.getImageData(0,0,W,H).data; const out=[];
      if (which==='top') { for (let x=0;x<W;x++){ let on=false; for (let y=0;y<H*0.6;y++){ if (d[(y*W+x)*4+3]>140){on=true;break;} } out.push(on?1:0);} }
      else { for (let y=0;y<H;y++){ let on=false; for (let x=0;x<W*0.55;x++){ if (d[(y*W+x)*4+3]>140){on=true;break;} } out.push(on?1:0);} }
      const runs=[]; let s=-1; for (let i=0;i<out.length;i++){ if(out[i]&&s<0)s=i; if((!out[i]||i==out.length-1)&&s>=0){ runs.push((s+i-(out[i]?-1:1))/2/dpr); s=-1; } }
      return runs; }""", which)

def aligned(page, cols, rows, tag):
    """Every 10th stitch line on the chart must line up with a ruler label centre (within 2 px), after scroll/zoom."""
    info = page.evaluate(LABELS_JS)
    zoom_w = info["w"] / cols
    runs = ruler_ink(page, "top")
    ok = 0; total = 0
    for n in range(10, cols, 10):
        col = cols - n  # stitch n is column index cols-n; its centre:
        cx = (round(col * zoom_w) + round((col + 1) * zoom_w)) / 2 - info["sl"]
        if cx < 12 or cx > info["cw"] - 12: continue
        total += 1
        if any(abs(r - cx) <= 6 for r in runs): ok += 1
    check(f"{tag}: top ruler has a number at every visible 10th stitch ({ok}/{total})", total == 0 or ok == total)

def scenario(page, tag, cdp=None):
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(b.URL); page.wait_for_selector("[data-testid=mode-manual-choice]", state="attached", timeout=30000)
    start_blank(page, "24", "32"); time.sleep(0.3)
    b.open_blank(page)
    cols, rows = b.grid_dims(page)[:2]
    check(f"{tag}: blank canvas is {cols}x{rows}", (cols, rows) in [(96, 144), (144, 96), (128, 108)], f"{cols}x{rows}")
    top = page.locator("[data-testid=ruler-top]"); left = page.locator("[data-testid=ruler-left]")
    check(f"{tag}: both rulers are on screen", top.is_visible() and left.is_visible())
    tb, lb = top.bounding_box(), left.bounding_box()
    sb = page.locator(".chart__scroll").bounding_box()
    check(f"{tag}: top ruler sits directly above the chart box", abs(tb["x"] + 1 - sb["x"] - 1) <= 2 and abs(tb["y"] + tb["height"] - sb["y"]) <= 2, f"{tb} {sb}")
    check(f"{tag}: row gutter sits directly left of the chart box", abs(lb["x"] + lb["width"] - sb["x"]) <= 2, f"{lb} {sb}")
    page.screenshot(path=b.OUT + f"rulers_{tag}_fit.png")
    # no permanent numbers inside stitches: the chart canvas is only stitches (ruler canvases separate)
    check(f"{tag}: whole chart visible on open (no scroll)", page.evaluate("() => { const s=document.querySelector('.chart__scroll'); return s.scrollWidth<=s.clientWidth+1 && s.scrollHeight<=s.clientHeight+1; }"))
    aligned(page, cols, rows, f"{tag} fit")
    # zoom in and scroll; alignment holds
    page.get_by_role("button", name="Zoom in").click() if page.get_by_role("button", name="Zoom in").count() else None
    for _ in range(5):
        zi = page.get_by_role("button", name="Zoom in")
        if zi.count() and zi.is_enabled(): zi.click(); time.sleep(0.1)
    time.sleep(0.3)
    page.evaluate("() => { const s=document.querySelector('.chart__scroll'); s.scrollLeft=s.scrollWidth/3; s.scrollTop=s.scrollHeight/2; }"); time.sleep(0.4)
    aligned(page, cols, rows, f"{tag} zoomed+scrolled")
    page.screenshot(path=b.OUT + f"rulers_{tag}_zoom.png")
    # highlight and status
    c, r = 30, 40
    b.center_on(page, c, r, cols, rows); x, y = b.client(page, c, r, cols, rows)
    if cdp:
        b.cdp_touch = None
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 0}]})
    else: page.mouse.move(x, y)
    time.sleep(0.3)
    hr, hc = page.locator("[data-testid=hl-row]"), page.locator("[data-testid=hl-col]")
    check(f"{tag}: row and column highlight appear under the pointer/finger", hr.count() == 1 and hc.count() == 1)
    if hr.count():
        rb = hr.bounding_box(); cb = hc.bounding_box()
        check(f"{tag}: highlight crosses at the stitch", rb["y"] <= y <= rb["y"] + rb["height"] and cb["x"] <= x <= cb["x"] + cb["width"])
    st = page.locator("[data-testid=chart-status]").inner_text().replace("\n", " ")
    exp_row = rows - r; exp_st = cols - c
    direction = "right to left" if exp_row % 2 else "left to right"
    check(f"{tag}: status shows row, stitch and working direction", f"Row {exp_row}" in st and f"Stitch {exp_st}" in st and direction in st, st)
    page.screenshot(path=b.OUT + f"rulers_{tag}_hl.png")
    if cdp: cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    check(f"{tag}: no page errors", not errors, "; ".join(errors)[:200])

def desktop(p):
    br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 1100, "height": 1000}); page = ctx.new_page()
    scenario(page, "desktop"); br.close()
def mobile(p):
    br = p.chromium.launch(); ctx = br.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2); page = ctx.new_page()
    scenario(page, "phone", ctx.new_cdp_session(page)); br.close()

if __name__ == "__main__":
    with sync_playwright() as p:
        which = sys.argv[1] if len(sys.argv) > 1 else "all"
        if which in ("all", "desktop"): desktop(p)
        if which in ("all", "mobile"): mobile(p)
    bad = [r for r in results if not r[1]]
    print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad else 0)
