"""Strengthen-thin-lines real-browser checks (desktop and phone). Needs the dev server (npx vite --port 5173 --host 127.0.0.1)
and three test pictures in IMGDIR: hand_line.png (line art), skeleton_lady.png (a painting), cat_line.png.
  python3 strengthen_browser.py [desktop|mobile]"""
import re, sys, time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5173/"
IMGDIR = "/tmp/claude-0/scratch/imgs/"
results = []
def unfold(page):
    """On a phone the setup folds into a bar once a chart is open; open it again before touching setup controls."""
    b = page.locator("[data-testid=setup-change]")
    if b.count() and b.is_visible() and b.get_attribute("aria-expanded") == "false":
        b.click(); time.sleep(0.4)
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)

def pick(page, value):
    for _ in range(4):
        try: unfold(page); page.locator(f'input[type=radio][value="{value}"]').check(force=True); return
        except Exception: time.sleep(0.4)
def create(page):
    (unfold(page), page.get_by_role("button", name=re.compile("Create My Crochet Grid"))).__getitem__(1).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=90000)
    page.wait_for_function("document.querySelector('[data-testid=chart-canvas]').width > 0"); time.sleep(0.6)
def dark_share(page):
    return page.evaluate("""() => { const cv=document.querySelector('[data-testid=chart-canvas]'); const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
      let n=0,t=0; for(let i=0;i<d.length;i+=16){ t++; if(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]<100) n++; } return n/t; }""")
def load(page, name):
    page.goto(URL); page.wait_for_load_state("networkidle"); page.set_input_files("input[type=file]", IMGDIR + name); time.sleep(1.0)
def box(page): return page.locator("[data-testid=strengthen]")

def scenario(page, tag):
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    load(page, "hand_line.png")
    check(f"{tag}: on the default 12 x 16 the option is shown and starts off", box(page).count() == 1 and not box(page).is_checked())
    pick(page, "8x10"); time.sleep(0.3)
    check(f"{tag}: not at 8 x 10 (a small size)", box(page).count() == 0)
    pick(page, "24x32"); time.sleep(0.4)
    check(f"{tag}: at 24 x 32 the option is shown and starts unticked", box(page).count() == 1 and box(page).is_visible() and not box(page).is_checked())
    check(f"{tag}: the checkbox is easy to tap (row at least 44px tall)", box(page).locator("xpath=ancestor::label").bounding_box()["height"] >= 44)
    check(f"{tag}: a drawing on light paper gets no warning", "colorful" not in page.locator("[data-testid=strengthen-help]").inner_text())
    pick(page, "16x20"); time.sleep(0.3)
    check(f"{tag}: it is offered at 16 x 20 too", box(page).count() == 1)
    pick(page, "6x8"); time.sleep(0.3)
    check(f"{tag}: and not at the smallest size", box(page).count() == 0)
    pick(page, "24x32"); pick(page, "6")
    create(page); plain = dark_share(page)
    unfold(page); box(page).check(); time.sleep(0.3)
    check(f"{tag}: ticking it clears the old chart (a new Create is needed)", page.locator("[data-testid=chart-canvas]").count() == 0)
    create(page); strong = dark_share(page)
    check(f"{tag}: with it on, the chart has noticeably more line (dark) stitches", strong > plain * 1.1, f"{plain:.3f} -> {strong:.3f}")
    page.screenshot(path="/tmp/claude-0/scratch/strengthen_" + tag.replace(" ", "_") + ".png")
    # editing then changing the option asks first
    labels = page.locator(".chart__color").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    lum = [0.299*int(re.search(r"#([0-9A-Fa-f]{6})", l).group(1)[:2], 16) + 0.587*int(re.search(r"#([0-9A-Fa-f]{6})", l).group(1)[2:4], 16) + 0.114*int(re.search(r"#([0-9A-Fa-f]{6})", l).group(1)[4:], 16) for l in labels]
    page.locator(".chart__color").nth(lum.index(min(lum))).click(); page.get_by_role("button", name="Fill", exact=True).click()
    page.evaluate("document.querySelector('.chart__scroll').scrollIntoView({block:'center'})")
    b = page.locator("[data-testid=chart-canvas]").bounding_box(); page.mouse.click(b["x"] + 6, b["y"] + 6); time.sleep(0.4)
    unfold(page); box(page).click(); time.sleep(0.4)  # the app asks first, so the box stays ticked until answered
    d = page.locator("dialog.discard[open]")
    check(f"{tag}: changing the option after edits asks before discarding", d.count() == 1 and "thin-line" in d.inner_text(), d.inner_text()[:120] if d.count() else "")
    page.get_by_role("button", name="Keep editing").click(); time.sleep(0.3)
    check(f"{tag}: Keep editing leaves it ticked with the chart intact", box(page).is_checked() and page.locator("[data-testid=chart-canvas]").count() == 1)
    # a painting gets the plain-language caution
    load(page, "skeleton_lady.png"); pick(page, "24x32"); time.sleep(0.5)
    help_ = page.locator("[data-testid=strengthen-help]").inner_text()
    check(f"{tag}: a colorful painting gets the caution to check the chart", "colorful" in help_ and "turn this off" in help_, help_[:140])
    check(f"{tag}: no page errors", not errors, "; ".join(errors)[:200])

def desktop(p):
    b = p.chromium.launch(); page = b.new_context(viewport={"width": 1100, "height": 1000}).new_page(); scenario(page, "strengthen desktop"); b.close()
def mobile(p):
    b = p.chromium.launch(); page = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2).new_page(); scenario(page, "strengthen phone"); b.close()

if __name__ == "__main__":
    with sync_playwright() as p:
        which = sys.argv[1] if len(sys.argv) > 1 else "all"
        if which in ("all", "desktop"): desktop(p)
        if which in ("all", "mobile"): mobile(p)
    bad = [r for r in results if not r[1]]
    print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad else 0)
