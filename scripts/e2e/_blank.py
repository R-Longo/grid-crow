"""Shared by the e2e suites: drawing from scratch lives in Manual Mode, so getting to a blank canvas goes through it."""
import time

def start_blank(page, w="12", h="16"):
    """Open Manual Mode at the standard gauge, size w x h inches (12 x 16 by default: 48 x 72 stitches), blank canvas chosen."""
    page.locator("[data-testid=mode-manual-choice]").click(force=True); time.sleep(0.3)
    page.locator("[data-testid=manual-standard]").click()
    page.locator("[data-testid=manual-w]").fill(w); page.locator("[data-testid=manual-h]").fill(h)
    page.locator("[data-testid=manual-start-scratch]").check(force=True); time.sleep(0.2)
