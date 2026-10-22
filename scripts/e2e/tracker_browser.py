"""Row + stitch tracker: Track mode, tap / buttons, overlay, saved with the project, backup file, edit mode still paints."""
import json, re, sys, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"
n_ok = 0; n_bad = 0
def check(name, cond, detail=""):
    global n_ok, n_bad
    if cond: n_ok += 1
    else: n_bad += 1; print(f"FAIL {name}  [{detail}]")
def where(page):
    t = page.locator("[data-testid=track-where]").inner_text()
    m = re.search(r"Row\s*(\d+)\s*of\s*(\d+)\s*Stitch\s*(\d+)\s*of\s*(\d+)", t.replace("\n", " "))
    return (int(m[1]), int(m[2]), int(m[3]), int(m[4]), t) if m else None
def chart(page): return page.evaluate("document.querySelector('[data-testid=chart-canvas]').toDataURL()")
def veil_at(page, fx, fy):
    return page.evaluate("""([fx,fy]) => { const c=document.querySelector('[data-testid=track-canvas]'); const d=c.getContext('2d').getImageData(Math.floor(c.width*fx),Math.floor(c.height*fy),1,1).data; return d[3]; }""", [fx, fy])
def saved(page): page.wait_for_function("document.querySelector('[data-testid=save-status]')?.textContent.includes('Saved on this device')", timeout=15000)
def cell_point(page, col, row_from_bottom, cols, rows):
    bb = page.locator("[data-testid=chart-canvas]").bounding_box()
    return bb["x"] + bb["width"] * (col + 0.5) / cols, bb["y"] + bb["height"] * (rows - row_from_bottom - 0.5) / rows
def open_track(page, touch):
    page.locator("[data-testid=mode-track]").click(); time.sleep(0.4)

def run(p):
    b = p.chromium.launch(); errors = []
    for (w, h, touch) in [(1440, 900, False), (390, 844, True)]:
        tag = f"{w}x{h}"
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, accept_downloads=True)
        page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL); page.wait_for_load_state("networkidle")
        page.locator("[data-testid=start-scratch]").click(force=True); time.sleep(0.3)
        page.locator("[data-testid=open-blank]").click()
        page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=30000); time.sleep(0.8)
        check(f"{tag}: no track bar in edit mode", page.locator("[data-testid=track-bar]").count() == 0)
        open_track(page, touch)
        wh = where(page)
        check(f"{tag}: starts at row 1, stitch 1, right to left", wh and wh[0] == 1 and wh[2] == 1 and "right to left" in wh[4], str(wh))
        R, C = wh[1], wh[3]
        check(f"{tag}: edit tools are hidden while tracking", not page.locator(".chart__tools").is_visible() if not touch else not page.locator(".chart__dock").is_visible())
        before = chart(page)
        # next stitch button
        page.locator("[data-testid=track-next]").click(); time.sleep(0.2)
        check(f"{tag}: next stitch moves to stitch 2", where(page)[2] == 2, str(where(page)))
        check(f"{tag}: the finished stitch is veiled", veil_at(page, 1 - 0.5 / C, 1 - 0.5 / R) > 50, str(veil_at(page, 1 - 0.5 / C, 1 - 0.5 / R)))
        check(f"{tag}: the next stitch is not veiled", veil_at(page, 1 - 1.5 / C, 1 - 0.5 / R) < 100)
        page.locator("[data-testid=track-back]").click(); time.sleep(0.2)
        check(f"{tag}: back returns to stitch 1", where(page)[2] == 1)
        page.locator("[data-testid=track-row]").click(); time.sleep(0.2)
        w2 = where(page)
        check(f"{tag}: finish row turns the corner (row 2, stitch {C}, left to right)", w2[0] == 2 and w2[2] == C and "left to right" in w2[4], str(w2))
        check(f"{tag}: percent shown", "%" in page.locator("[data-testid=track-pct]").inner_text())
        # tap a stitch: mark everything up to the left-most stitch of row 1 -> same as above; tap row 3 stitch 3
        x, y = cell_point(page, C - 3, 2, C, R)   # row 3 (0-based 2), stitch 3 (col C-3)
        if touch: page.touchscreen.tap(x, y)
        else: page.mouse.click(x, y)
        time.sleep(0.3)
        w3 = where(page)
        check(f"{tag}: tapping row 3 stitch 3 moves the next stitch to stitch 4", w3[0] == 3 and w3[2] == 4, str(w3))
        if touch: page.touchscreen.tap(x, y)
        else: page.mouse.click(x, y)
        time.sleep(0.3)
        w4 = where(page)
        check(f"{tag}: tapping the last marked stitch again takes it back", w4[0] == 3 and w4[2] == 3, str(w4))
        check(f"{tag}: tapping in Track mode never paints", chart(page) == before)
        if not touch:
            bb = page.locator("[data-testid=chart-canvas]").bounding_box()
            page.mouse.move(bb["x"] + 20, bb["y"] + 20); page.mouse.down(); page.mouse.move(bb["x"] + 80, bb["y"] + 60, steps=5); page.mouse.up(); time.sleep(0.3)
            check(f"{tag}: dragging does not change progress or paint", where(page)[0:3] == w4[0:3] and chart(page) == before)
        # persists
        saved(page)
        page.reload(); page.wait_for_load_state("networkidle"); time.sleep(0.6)
        page.wait_for_selector("[data-testid=projects-toggle]"); page.locator("[data-testid=projects-toggle]").click()
        check(f"{tag}: list shows % crocheted", "crocheted" in page.locator("[data-testid=projects-list]").inner_text(), page.locator("[data-testid=projects-list]").inner_text())
        page.locator("[data-testid=open-project]").first.click()
        page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=30000); time.sleep(0.8)
        open_track(page, touch)
        w5 = where(page)
        check(f"{tag}: progress is back after reopening", w5[0:3] == w4[0:3], f"{w5} vs {w4}")
        # backup file carries progress
        if not touch:
            if page.locator("[data-testid=mode-edit]").count(): page.locator("[data-testid=mode-edit]").click()
            with page.expect_download() as d: page.locator("[data-testid=download-backup]").click()
            path = "/tmp/claude-0/scratch/out/track.gridcrow"; d.value.save_as(path)
            check(f"{tag}: backup file holds the progress", json.load(open(path)).get("progress") == (w4[0] - 1) * C + (w4[2] - 1))
            open_track(page, touch)
        # restart
        page.locator("[data-testid=track-restart]").click(); page.locator("[data-testid=track-restart-yes]").click(); time.sleep(0.2)
        w6 = where(page)
        check(f"{tag}: start over goes back to row 1 stitch 1", w6[0] == 1 and w6[2] == 1)
        # finish
        for _ in range(R): page.locator("[data-testid=track-row]").click()
        check(f"{tag}: finishing the last row shows the done message", "done" in page.locator("[data-testid=track-where]").inner_text().lower() and page.locator("[data-testid=track-next]").is_disabled())
        # edit mode paints again
        page.locator("[data-testid=mode-edit]").click(); time.sleep(0.3)
        check(f"{tag}: back in Edit mode the bar is gone", page.locator("[data-testid=track-bar]").count() == 0)
        ctx.close()
    check("no page errors", not errors, str(errors))
    b.close()
    print(f"tracker: {n_ok} ok, {n_bad} bad"); sys.exit(1 if n_bad else 0)
with sync_playwright() as p: run(p)
