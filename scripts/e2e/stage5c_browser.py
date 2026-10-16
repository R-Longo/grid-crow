"""Stage 5C real-browser checks: a finished download becomes the saved checkpoint for the discard warnings.
Run with the dev server up (npx vite --port 5173 --host 127.0.0.1). Chromium only; touch is emulated.
  python3 stage5c_browser.py [desktop|mobile]"""
import os, re, sys, time
from playwright.sync_api import sync_playwright
import stage5_browser as s5

URL = s5.URL
results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)

def dlg(page): return page.locator("dialog.discard[open]")
def has_chart(page): return page.locator("[data-testid=chart-canvas]").count() > 0
def checked(page, value): return page.locator(f'input[type=radio][value="{value}"]').is_checked()

def status(page):
    """(changed count, unsaved text) read from the status line, opening Options on a phone if needed."""
    opts = s5._opts(page); opened = False
    if opts.count() and opts.get_attribute("aria-expanded") != "true" and not page.locator("[data-testid=chart-changed]").is_visible():
        opts.click(); time.sleep(0.2); opened = True
    t = page.locator("[data-testid=chart-changed]").inner_text()
    u = page.locator("[data-testid=chart-unsaved]")
    ut = u.inner_text().replace("·", "").strip() if u.count() else ""
    if opened: opts.click(); time.sleep(0.2)
    m = re.match(r"([\d,]+)", t)
    return (int(m.group(1).replace(",", "")) if m else 0), ut

def open_download(page, touch):
    if touch:
        o = page.locator("[data-testid=download-open]")
        if o.get_attribute("aria-expanded") != "true":
            o.tap(); time.sleep(0.3)

def download(page, touch, kind="png"):
    open_download(page, touch)
    btn = page.locator(f"[data-testid=download-{kind}]")
    with page.expect_download(timeout=90000) as dl:
        btn.tap() if touch else btn.click()
    dl.value.path()
    page.wait_for_function("(document.querySelector('[data-testid=download-note]')?.textContent||'').startsWith('Downloaded')", timeout=60000)
    time.sleep(0.3)
    return dl.value.suggested_filename

def pencil_stitches(page, cdp, n, start=(10, 100)):
    """n single-stitch pencil edits in the lightest color (some of these may already match; pick cells that differ)."""
    pal = s5.palette(page)
    lum = [0.299*int(h[:2],16)+0.587*int(h[2:4],16)+0.114*int(h[4:],16) for h, _ in pal]
    page.locator(".chart__color").nth(lum.index(max(lum))).click(); s5.tool(page, "Paint")
    done = 0; c, r = start
    while done < n:
        s5.center_on(page, c, r); x, y = s5.client(page, c, r)
        if cdp: s5.cdp_touch(cdp, "touchStart", [(x, y)]); s5.cdp_touch(cdp, "touchEnd", [])
        else: page.mouse.click(x, y)
        time.sleep(0.2); done += 1; c += 2

def answer(page, which, touch=False):
    b = page.get_by_role("button", name="Keep editing" if which == "keep" else "Discard edits and continue")
    b.tap() if touch else b.click(); time.sleep(0.4)

def scenario(page, tag, cdp=None):
    touch = cdp is not None
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    s5.setup(page)
    s5.edit(page, cdp)
    n0, u0 = status(page)
    check(f"{tag}: before any download there is no 'downloaded' note", n0 > 3000 and u0 == "", f"{n0} / '{u0}'")

    # --- download a PNG: everything so far is now the saved checkpoint
    name = download(page, touch, "png")
    n1, u1 = status(page)
    check(f"{tag}: PNG download starts and is named for the chart", name == "gridcrow-pattern-96x144.png", name)
    check(f"{tag}: after the download the status says all downloaded", n1 == n0 and u1 == "all downloaded", f"{n1} / '{u1}'")

    # --- 5 more edits: only those 5 are not downloaded
    pencil_stitches(page, cdp, 5)
    n2, u2 = status(page)
    m = re.match(r"(\d+) not downloaded yet", u2)
    check(f"{tag}: 5 new edits after the download show as 5 not downloaded yet", m and int(m.group(1)) == 5, f"{n2} / '{u2}'")

    # --- the warning counts only those and says "since your last download"
    s5.pick_radio(page, "16x20"); time.sleep(0.4)
    d = dlg(page); txt = d.inner_text() if d.count() else ""
    check(f"{tag}: changing the size asks, naming only the 5 stitches since the last download",
          d.count() == 1 and "5 hand-edited stitches since your last download" in txt, txt.replace("\n", " ")[:180])
    check(f"{tag}: the chart and old size are untouched while the dialog is open", has_chart(page) and checked(page, "24x32"))
    answer(page, "keep", touch)
    check(f"{tag}: Keep editing leaves the chart and the 5 unsaved edits", has_chart(page) and status(page)[1].startswith("5 not downloaded"))

    # --- the leave-page prompt is back for the new edits
    prompts = []
    def on_dialog(dg):
        prompts.append(dg.type); dg.dismiss() if len(prompts) == 1 else dg.accept()
    page.on("dialog", on_dialog)
    try: page.reload()
    except Exception: pass
    time.sleep(0.6)
    check(f"{tag}: new edits after a download bring back the 'Leave this page?' prompt", prompts[:1] == ["beforeunload"], str(prompts))
    check(f"{tag}: choosing to stay keeps the chart", has_chart(page) and status(page)[1].startswith("5 not downloaded"))

    # --- download a PDF: all downloaded again; protection is not turned off for good
    download(page, touch, "pdf")
    check(f"{tag}: PDF download also becomes the checkpoint", status(page)[1] == "all downloaded", str(status(page)))
    prompts.clear()
    s5.pick_radio(page, "16x20"); time.sleep(0.4)
    check(f"{tag}: with everything downloaded, changing the size just works (no dialog)", dlg(page).count() == 0 and checked(page, "16x20") and not has_chart(page))
    page.remove_listener("dialog", on_dialog)

    # --- protection returns after a download: new chart, edit, download, edit again
    s5.pick_radio(page, "24x32"); s5.setup(page)
    s5.edit(page, cdp); download(page, touch, "png")
    pencil_stitches(page, cdp, 2, start=(20, 90))
    check(f"{tag}: edit, download, edit again still warns (protection is not permanently off)", status(page)[1].startswith("2 not downloaded"), str(status(page)))
    # undoing back to the downloaded state makes it clean again
    for _ in range(2): page.get_by_role("button", name="Undo", exact=True).click(); time.sleep(0.2)
    check(f"{tag}: undoing back to the downloaded chart leaves nothing unsaved", status(page)[1] == "all downloaded", str(status(page)))
    # Reset to the converted chart after an export: nothing but the converted chart to lose
    pencil_stitches(page, cdp, 1, start=(30, 80))
    o = s5._opts(page)
    if o.count(): o.click(); time.sleep(0.2)
    page.get_by_role("button", name=re.compile("Reset")).click(); time.sleep(0.3)
    confirm = page.locator(".chart__dialog button").filter(has_text=re.compile("reset", re.I))
    if confirm.count(): confirm.first.click(); time.sleep(0.4)
    if o.count() and o.get_attribute("aria-expanded") == "true": o.click(); time.sleep(0.2)
    check(f"{tag}: Reset after a download goes back to the converted chart (0 changed)", status(page)[0] == 0, str(status(page)))

    # --- a failed download must not clear the unsaved edits
    s5.setup(page)
    s5.edit(page, cdp)
    nf, _ = status(page)
    page.evaluate("() => { window.__realCreate = URL.createObjectURL; URL.createObjectURL = () => { throw new Error('boom'); }; }")
    open_download(page, touch)
    btn = page.locator("[data-testid=download-png]"); btn.tap() if touch else btn.click()
    page.wait_for_function("(document.querySelector('[data-testid=download-note]')?.textContent||'').length > 0", timeout=60000); time.sleep(0.5)
    note = page.locator("[data-testid=download-note]")
    check(f"{tag}: a failed download shows a plain error", note.get_attribute("role") == "alert", note.inner_text()[:120])
    nf2, uf = status(page)
    check(f"{tag}: ... and does not mark anything as downloaded", nf2 == nf and uf == "", f"{nf2} / '{uf}'")
    page.evaluate("() => { URL.createObjectURL = window.__realCreate; }")
    s5.pick_radio(page, "16x20"); time.sleep(0.4)
    d = dlg(page); txt = d.inner_text() if d.count() else ""
    check(f"{tag}: ... so the full discard warning still appears (no 'since your last download')",
          d.count() == 1 and f"{nf:,} hand-edited stitches" in txt and "since your last download" not in txt, txt.replace("\n", " ")[:160])
    answer(page, "keep", touch)

    # --- edits made while the export is running stay unsaved
    page.evaluate("""() => { const real = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, ...a) { setTimeout(() => real.call(this, cb, ...a), 2500); }; }""")
    open_download(page, touch)
    btn = page.locator("[data-testid=download-png]")
    with page.expect_download(timeout=90000) as dl:
        btn.tap() if touch else btn.click()
        time.sleep(0.6)
        # make one more edit while "Making your PNG…" is showing
        busy = page.locator("[data-testid=download-png]").inner_text()
        pencil_stitches(page, cdp, 1, start=(50, 70))
    dl.value.path()
    open_download(page, touch)
    page.wait_for_function("(document.querySelector('[data-testid=download-note]')?.textContent||'').startsWith('Downloaded')", timeout=60000); time.sleep(0.4)
    check(f"{tag}: the button showed it was busy during the slowed export", "Making" in busy, busy)
    ne, ue = status(page)
    check(f"{tag}: an edit made during the export is NOT marked as downloaded", ue.startswith("1 not downloaded"), f"{ne} / '{ue}'")
    check(f"{tag}: no page errors", not errors, "; ".join(errors)[:200])

def desktop(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1100, "height": 1000}, accept_downloads=True); page = ctx.new_page()
    scenario(page, "5C desktop"); b.close()

def mobile(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2, accept_downloads=True); page = ctx.new_page()
    scenario(page, "5C phone", ctx.new_cdp_session(page)); b.close()

if __name__ == "__main__":
    with sync_playwright() as p:
        which = sys.argv[1] if len(sys.argv) > 1 else "all"
        if which in ("all", "desktop"): desktop(p)
        if which in ("all", "mobile"): mobile(p)
    bad = [r for r in results if not r[1]]
    print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
    sys.exit(1 if bad else 0)
