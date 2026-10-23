"""Save/reopen: autosave to this device, My projects list, rename/delete, backup export/import, bad files."""
import json, re, sys, time
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:5173/"; IMG = "/tmp/claude-0/scratch/imgs/hand_line.png"
n_ok = 0; n_bad = 0
def check(name, cond, detail=""):
    global n_ok, n_bad
    if cond: n_ok += 1
    else: n_bad += 1; print(f"FAIL {name}  [{detail}]")
def swatches(page): return [t.inner_text().replace("\n", " ") for t in page.locator(".chart__color").all()]
def unfold(page):
    if page.locator("[data-testid=setup-change]").count() and page.locator("[data-testid=setup-change]").inner_text().strip() == "Change":
        page.locator("[data-testid=setup-change]").click(); time.sleep(0.3)
def open_list(page):
    t = page.locator("[data-testid=projects-toggle]")
    if t.get_attribute("aria-expanded") != "true": t.click(); time.sleep(0.2)
def canvas(page): return page.evaluate("document.querySelector('[data-testid=chart-canvas]').toDataURL()")
def saved(page):
    page.wait_for_function("document.querySelector('[data-testid=save-status]')?.textContent.includes('Saved on this device')", timeout=15000)
def paint_center(page):
    cv = page.locator("[data-testid=chart-canvas]").bounding_box()
    page.mouse.click(cv["x"] + cv["width"] * 0.5, cv["y"] + cv["height"] * 0.5); time.sleep(0.4)
def pick_last_color(page): page.locator(".chart__color").nth(1).click(); time.sleep(0.2)

def run(p):
    b = p.chromium.launch(); errors = []
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_load_state("networkidle")
    check("no projects list at first", page.locator("[data-testid=projects-toggle]").count() == 0)
    page.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG); time.sleep(1)
    page.get_by_role("button", name=re.compile("Create My Crochet Grid")).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=90000); time.sleep(0.8)
    saved(page)
    check("status says saved after creating", True)
    pick_last_color(page); paint_center(page); saved(page)
    sw = swatches(page); img = canvas(page)
    # leaving with an edit that is saved does not warn (no beforeunload)
    page.reload(); page.wait_for_load_state("networkidle"); time.sleep(0.6)
    page.wait_for_selector("[data-testid=projects-toggle]", timeout=10000)
    check("My projects shows 1 after reload", "(1)" in page.locator("[data-testid=projects-toggle]").inner_text())
    open_list(page)
    check("list has one item", page.locator("[data-testid=project-item]").count() == 1)
    check("each project has a thumbnail", page.locator("[data-testid=project-thumb]").count() == 1)
    tb = page.locator("[data-testid=project-thumb]").bounding_box()
    check("thumbnail has the chart's proportions (48 x 72 stitches, 9:8)", tb and abs((tb["height"] / tb["width"]) - (72 * 8) / (48 * 9)) < 0.03, str(tb))
    check("thumbnail is not blank (the picture has dark stitches)", page.evaluate("""() => { const c=document.querySelector('[data-testid=project-thumb]'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let dark=0; for(let i=0;i<d.length;i+=4) if(d[i]<100) dark++; return dark>20; }"""))
    check("backup advice is shown with the list", "backup file" in page.locator("[data-testid=projects-safety]").inner_text())
    check("footer says nothing leaves the device", "stay on your device" in page.locator("[data-testid=footer]").inner_text())
    check("no feedback link while no address is set", page.locator("[data-testid=feedback-link]").count() == 0)
    page.locator("[data-testid=open-project]").click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=30000); time.sleep(1.0)
    check("reopened chart has the same colors and counts", swatches(page) == sw, f"{swatches(page)} vs {sw}")
    check("reopened chart looks identical", canvas(page) == img)
    saved(page)
    # undo history starts fresh; painting again saves
    paint_center(page); saved(page)
    # rename
    unfold(page); open_list(page)
    page.locator("[data-testid=rename-project]").click(); page.locator("[data-testid=rename-input]").fill("Raven pattern"); page.keyboard.press("Enter"); time.sleep(0.5)
    check("renamed", "Raven pattern" in page.locator("[data-testid=project-item]").inner_text())
    # backup export
    with page.expect_download() as d:
        page.locator("[data-testid=download-backup]").click()
    dl = d.value; path = "/tmp/claude-0/scratch/out/test.gridcrow"; dl.save_as(path)
    check("backup file name", dl.suggested_filename == "gridcrow-raven-pattern.gridcrow", dl.suggested_filename)
    data = json.load(open(path))
    check("backup is the project format", data.get("format") == "gridcrow-project" and data.get("version") == 1)
    img2 = canvas(page); sw2 = swatches(page)
    # delete, then restore from backup
    page.locator("[data-testid=delete-project]").click(); page.locator("[data-testid=delete-yes]").click(); time.sleep(0.6)
    check("list is gone after delete", page.locator("[data-testid=projects-toggle]").count() == 0)
    page.reload(); page.wait_for_load_state("networkidle"); time.sleep(0.5)
    check("still gone after reload", page.locator("[data-testid=projects-toggle]").count() == 0)
    page.set_input_files("[data-testid=import-backup]", path)
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=30000); time.sleep(1.0)
    check("imported chart identical", canvas(page) == img2 and swatches(page) == sw2)
    saved(page)
    unfold(page)
    check("imported project is in My projects", "Raven pattern" in page.locator("[data-testid=projects]").inner_text() or page.locator("[data-testid=projects-toggle]").count() == 1)
    # bad files
    bad = "/tmp/claude-0/scratch/out/bad.gridcrow"
    for label, content in [("not json", "hello"), ("other json", '{"a":1}'), ("wrong version", json.dumps({**data, "version": 99})), ("bad cell", json.dumps({**data, "current": {**data["current"], "cells": "AAAA"}}))]:
        open(bad, "w").write(content)
        page.set_input_files("[data-testid=import-backup]", bad); time.sleep(0.5)
        check(f"bad file ({label}) shows a friendly message", page.locator("[data-testid=projects-message]").count() == 1 and len(page.locator("[data-testid=projects-message]").inner_text()) > 10)
    # blank canvas project
    page.goto(URL); page.wait_for_load_state("networkidle"); time.sleep(0.5)
    page.locator("[data-testid=start-scratch]").click(force=True); time.sleep(0.3)
    page.locator("[data-testid=open-blank]").click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=30000); time.sleep(0.6)
    paint_center(page); saved(page)
    page.reload(); page.wait_for_load_state("networkidle"); time.sleep(0.5)
    open_list(page)
    check("two projects", page.locator("[data-testid=project-item]").count() == 2, str(page.locator("[data-testid=project-item]").count()))
    check("blank listed", "Blank canvas" in page.locator("[data-testid=projects-list]").inner_text())
    page.locator("[data-testid=project-item]", has_text="Blank canvas").locator("[data-testid=open-project]").click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=30000); time.sleep(0.8)
    check("blank reopened without a picture view", page.get_by_role("button", name="Original").count() == 0)
    paint_center(page); saved(page)
    # saved edits are safe, so replacing the chart does not ask "discard edits?"
    unfold(page); page.locator("[data-testid=open-blank]").click(); time.sleep(0.6)
    check("no discard question when edits are saved", page.locator("dialog.discard[open]").count() == 0)
    check("no page errors", not errors, str(errors))
    b.close()
    print(f"save_project: {n_ok} ok, {n_bad} bad"); sys.exit(1 if n_bad else 0)
with sync_playwright() as p: run(p)
