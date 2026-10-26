"""Real-browser checks for the responsive editor layout. Needs vite on 5173 (or a URL as argv[1]) and Playwright."""
import re, sys, time
from playwright.sync_api import sync_playwright
exec(open(__file__.replace("layout_browser.py", "fit_browser.py")).read().split("def main(p):")[0])

JS = """() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height}; };
  const hts = [...document.querySelectorAll('.chart__tool, .chart__small, .chart__color, .chart__round, .chart__toggle button')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.height), Math.round(b.width), e.classList.contains('chart__color') ? 0 : b.right, e.classList.contains('chart__color') ? 0 : b.left]; });  // yarn colors scroll sideways on phones, so only the others must be inside the window
  const side = document.querySelector('.chart__side');
  return { iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth,
    left: r('.chart__left'), side: r('.chart__side'), tools: r('.chart__tools'), colors: r('.chart__colors'), main: r('.chart__scroll'), zoom: r('.chart__zoombar'), edit: r('.chart__edit'), section: r('.chart'),
    sideOverflow: side ? getComputedStyle(side).overflowY : '', sidePos: side ? getComputedStyle(side).position : '', hts };
}"""
def lay(page): return page.evaluate(JS)

def run(p):
    b = p.chromium.launch(); errors = []
    for (w, h) in [(320, 568), (390, 844), (768, 1024), (899, 700), (844, 390), (640, 360), (900, 700), (1024, 768), (1440, 900), (1920, 1080)]:
        ctx = b.new_context(viewport={"width": w, "height": h}); page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
        make_chart(page, "24x32", "portrait"); settle(page)
        page.evaluate("document.querySelector('.chart').scrollIntoView({block:'start'})"); time.sleep(0.3)
        L = lay(page); tag = f"{w}x{h}"
        check(f"{tag}: no horizontal page scrolling", L["sw"] <= L["iw"], f"{L['sw']} vs {L['iw']}")
        check(f"{tag}: every control is at least 44px tall and inside the window", all(hh >= 44 and rr <= L["iw"] + 0.5 and ll >= -0.5 for hh, ww, rr, ll in L["hts"]),
              str(sorted({x[0] for x in L["hts"]})))
        if w >= 900:
            frac = L["left"]["w"] / (L["left"]["w"] + L["side"]["w"])
            check(f"{tag}: two columns, chart takes the room, sidebar a steady 21rem (336px)", L["side"]["l"] >= L["left"]["r"] and 0.5 <= frac and 330 <= L["side"]["w"] <= 342, f"{frac:.2f}, sidebar {L['side']['w']:.0f}px")
            check(f"{tag}: chart and sidebar are side by side at the top", abs(L["side"]["t"] - L["left"]["t"]) < 3)
            check(f"{tag}: sidebar scrolls on its own inside the workspace", L["sideOverflow"] == "auto")
            check(f"{tag}: the chart's column fits on screen with the sidebar", L["left"]["b"] <= L["ih"] + 2 and L["left"]["t"] >= -2, f"{L['left']['t']:.0f}..{L['left']['b']:.0f} of {L['ih']}")
            # scroll the page: both stay visible while inside the section
            page.mouse.wheel(0, 120); time.sleep(0.2); L2 = lay(page)
            check(f"{tag}: after scrolling a little, chart and sidebar are both still on screen", L2["main"]["b"] > 0 and L2["main"]["t"] < L2["ih"] and L2["side"]["b"] > 0 and L2["side"]["t"] < L2["ih"])
        else:
            D = page.evaluate("""() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height}; };
              const vis = s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; };
              return { bar: r('.chart__bar'), box: r('.chart__scroll'), dock: r('.chart__dock'), strip: r('.chart__palette'), dockbar: r('.chart__dockbar'), status: r('.chart__status'),
                tools: [...document.querySelectorAll('.chart__dockbar button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()), dockPos: getComputedStyle(document.querySelector('.chart__dock')).position,
                optionsHidden: !vis('.chart__toggle') && !vis('.chart__check') && !vis('.chart__edit') && !vis('.chart__help'), ih: innerHeight }; }""")
            check(f"{tag}: compact: the chart (and its 20px stitch-number ruler) comes first, right under a one-row header", D["box"]["t"] - D["bar"]["b"] < 20 + 20 and D["bar"]["h"] < 70, f"header {D['bar']['h']:.0f}px, gap {D['box']['t']-D['bar']['b']:.0f}")
            check(f"{tag}: compact: the dock has Paint, Fill, Eyedropper, Text, Pan, Undo, Redo", D["tools"] == ["Paint", "Fill", "Eyedropper", "Text", "Pan", "Undo", "Redo"], str(D["tools"]))
            check(f"{tag}: compact: phone: yarn colors in a one-row strip above the tools (rail layouts put tools first)", w >= 576 or (D["strip"]["b"] <= D["dockbar"]["t"] + 1 and D["strip"]["h"] < 90))
            if w >= 576:   # a phone held sideways or a small tablet: a slim rail of tools and colors beside the chart
                check(f"{tag}: sideways phone: dock is a column to the right of the chart, everything on one screen", D["dock"]["l"] >= D["box"]["r"] - 1 and D["dock"]["r"] <= L["iw"] + 1 and D["box"]["t"] >= -2 and D["box"]["b"] <= D["ih"] + 2 and D["status"]["b"] <= D["ih"] + 2,
                      f"box {D['box']['l']:.0f}-{D['box']['r']:.0f} x {D['box']['t']:.0f}-{D['box']['b']:.0f}, dock {D['dock']['l']:.0f}-{D['dock']['r']:.0f} of {L['iw']}x{D['ih']}")
            else:
                check(f"{tag}: compact: the whole chart, its caption and the dock fit on one screen", D["status"]["b"] <= D["dock"]["t"] + 1 and D["dock"]["b"] <= D["ih"] + 2 and D["box"]["t"] >= -2,
                      f"box {D['box']['t']:.0f}-{D['box']['b']:.0f}, dock {D['dock']['t']:.0f}-{D['dock']['b']:.0f} of {D['ih']}")
            check(f"{tag}: compact: grid lines, view toggle, Reset and help are out of the way (in Options)", D["optionsHidden"])
            _opts(page).click(); time.sleep(0.2)
            opened = page.evaluate("""() => { const vis = s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }; return vis('.chart__toggle') && vis('.chart__check') && vis('.chart__edit') && vis('.chart__help') && vis('.chart__options .chart__zoom input'); }""")
            check(f"{tag}: compact: Options holds the view toggle, grid lines, zoom slider, Reset and help", opened)
            page.keyboard.press("Escape"); time.sleep(0.2)
            check(f"{tag}: compact: Escape closes Options and returns focus to its button", page.locator(".chart__options").count() == 0 and page.evaluate("document.activeElement.textContent.includes('Options')"))
            # selected colour stays reachable: pick the last yarn colour, it must be fully visible in its strip
            n = page.locator(".chart__color").count()
            page.locator(".chart__color").nth(n - 1).click(); time.sleep(0.3)
            vis = page.evaluate("""() => { const u=document.querySelector('.chart__palette').getBoundingClientRect(); const b=document.querySelector('.chart__color[aria-pressed=true]').getBoundingClientRect(); return b.left>=u.left-1 && b.right<=u.right+1; }""")
            check(f"{tag}: compact: the selected yarn color is fully visible in the strip", vis)
        # the whole chart is still visible without scrolling the chart box
        st = state(page); check(f"{tag}: chart shown whole (no inner scrolling)", st["scrollW"] <= st["clientW"] and st["scrollH"] <= st["clientH"])
        ctx.close()
    check("no page errors", not errors, "; ".join(errors)[:200])
    b.close()

with sync_playwright() as p: run(p)
bad = [r for r in results if not r[1]]
print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
sys.exit(1 if bad else 0)
