import asyncio
import os
import uuid
from playwright.async_api import async_playwright

FRONTEND = "http://localhost:3000"
BACKEND = "http://localhost:8000"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()
        # capture console errors
        page.on("console", lambda m: print(f"  console[{m.type}]: {m.text[:300]}"))
        page.on("pageerror", lambda e: print(f"  pageerror: {e}"))

        uid = uuid.uuid4().hex[:6]
        email = f"e2e_help_{uid}@stagcore.local"
        password = "Password123!"
        business = f"Help Shop {uid}"
        print(f"1. Register {email} -> {business}")
        await page.goto(f"{FRONTEND}/register", wait_until="networkidle", timeout=20000)
        await page.fill('#name', f"Owner {uid}")
        await page.fill('#email', email)
        await page.fill('#password', password)
        await page.fill('#business', business)
        await page.click('button[type="submit"]')
        await page.wait_for_url("**/dashboard", timeout=20000)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)
        print("  on dashboard", await page.title())

        # Sidebar Help
        print("2. Check sidebar Help entry")
        help_link = page.locator('a[href="/help"]')
        assert await help_link.count() > 0, "Sidebar Help missing"
        print("  sidebar Help found")

        # Dashboard help button
        print("3. Dashboard HelpButton")
        # Dashboard now links to quick-start
        dash_help = page.locator('a[href="/help/quick-start"]')
        assert await dash_help.count() > 0, "Dashboard HelpButton missing"
        print("  dashboard help ok")

        # Inventory page help
        print("4. Per-page HelpButtons")
        for route, slug in [("/products","products"),("/devices","devices"),("/inventory","inventory-ledger"),("/purchases","purchases"),("/sales","sales-pos"),("/reports","dashboard-reports"),("/categories","categories-warranty"),("/warranty","warranty"),("/repairs","repairs")]:
            await page.goto(f"{FRONTEND}{route}", wait_until="networkidle", timeout=15000)
            await page.wait_for_timeout(800)
            hb = page.locator(f'a[href="/help/{slug}"]')
            c = await hb.count()
            assert c>0, f"HelpButton {slug} missing on {route} (found {c})"
            print(f"  {route} -> /help/{slug} ok")

        # Help index
        print("5. Help index")
        await page.goto(f"{FRONTEND}/help", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(1000)
        body = await page.inner_text("body")
        assert "Help Center" in body, "Help Center title missing"
        # Cards
        cards = await page.locator('a[href^="/help/"]').count()
        print(f"  help links count: {cards}")
        assert cards >= 8, f"Expected >=8 tutorial cards, got {cards}"
        # Search
        print("6. Search filter")
        await page.fill('input[placeholder*="Search tutorials"]', "Inventory Ledger")
        await page.wait_for_timeout(1200)
        body2 = await page.inner_text("body")
        print(f"  body2 snippet after search: {body2[:800].replace(chr(10),' | ')}")
        # More robust: count filtered cards
        filtered_count = await page.locator('a[href^="/help/"]').count()
        print(f"  filtered links count: {filtered_count}")
        assert filtered_count >= 1, f"Search filtered to zero, body: {body2[:500]}"
        assert "Inventory Ledger" in body2 or filtered_count == 1, "Search filter failed"
        await page.fill('input[placeholder*="Search tutorials"]', "")
        await page.wait_for_timeout(800)

        # Persona filter (select Radix)
        print("7. Persona filter")
        # open select trigger
        sel = page.locator('button:has-text("All")').first
        if await sel.count()>0:
            await sel.click()
            await page.wait_for_timeout(300)
            # pick Cashier
            opt = page.locator('[data-slot="select-item"]:has-text("Cashier")')
            if await opt.count()>0:
                await opt.click()
                await page.wait_for_timeout(600)
                fbody = await page.inner_text("body")
                # Cashier should see sales-pos etc, at least one
                assert "Sales" in fbody or "POS" in fbody, "Persona filter Cashier seems empty"
                print("  persona Cashier ok")
                # reset to All
                sel2 = page.locator('button:has-text("Cashier")').first
                if await sel2.count()>0:
                    await sel2.click()
                    await page.wait_for_timeout(300)
                    all_opt = page.locator('[data-slot="select-item"]:has-text("All")')
                    if await all_opt.count()>0:
                        await all_opt.click()
                        await page.wait_for_timeout(400)

        # Detail page
        print("8. Detail page /help/sales-pos")
        await page.goto(f"{FRONTEND}/help/sales-pos", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(800)
        dbody = await page.inner_text("body")
        assert "Sales / POS" in dbody, "Detail title missing"
        assert "Steps" in dbody or "Goal" in dbody, "Sections missing"
        assert "Troubleshooting" in dbody, "Troubleshooting missing"
        # tour button for sales-pos
        tour_btn = page.locator('button:has-text("Take a tour")')
        assert await tour_btn.count()>0, "Take a tour button missing for sales-pos"
        print("  sales-pos detail ok with tour button")
        # quick-start also has tour
        await page.goto(f"{FRONTEND}/help/quick-start", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(600)
        assert await page.locator('button:has-text("Take a tour")').count()>0, "quick-start tour missing"
        print("  quick-start tour ok")
        # inventory-ledger also
        await page.goto(f"{FRONTEND}/help/inventory-ledger", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(600)
        assert await page.locator('button:has-text("Take a tour")').count()>0, "inventory-ledger tour missing"
        print("  inventory tour ok")
        # products should NOT have tour
        await page.goto(f"{FRONTEND}/help/products", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(600)
        assert await page.locator('button:has-text("Take a tour")').count()==0, "products should not have tour"
        print("  products no tour correctly")

        # Flag-gated tutorial visibility: via direct data check
        print("9. Flag gated detail check: warranty (may be enabled or not)")
        await page.goto(f"{FRONTEND}/help/warranty", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(800)
        wbody = await page.inner_text("body")
        assert "Warranty" in wbody, "warranty detail missing"

        # Header help shortcut
        print("10. Header global search help shortcut")
        await page.goto(f"{FRONTEND}/dashboard", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(800)
        # header search input
        search_input = page.locator('input[placeholder*="Search IMEI"]')
        assert await search_input.count()>0, "header search missing"
        await search_input.fill("?help sales")
        await page.locator('button[aria-label="Search device"]').click()
        await page.wait_for_url("**/help**", timeout=8000)
        assert "/help" in page.url, f"Help shortcut did not route to /help, got {page.url}"
        qval = page.url
        assert "sales" in qval.lower(), f"search q not propagated: {qval}"
        print(f"  help shortcut routed to {page.url}")

        # Help shortcut with help prefix too
        await page.goto(f"{FRONTEND}/dashboard", wait_until="networkidle", timeout=10000)
        await page.wait_for_timeout(500)
        await page.fill('input[placeholder*="Search IMEI"]', "help inventory")
        await page.locator('button[aria-label="Search device"]').click()
        await page.wait_for_url("**/help**", timeout=8000)
        assert "/help" in page.url, "help prefix failed"
        print(f"  help prefix routed to {page.url}")

        # Tour data attributes on target pages
        print("11. Verify data-tour attributes on target routes")
        await page.goto(f"{FRONTEND}/dashboard", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(800)
        assert await page.locator('[data-tour="dashboard-kpis"]').count()>0, "dashboard-kpis tour marker missing"
        assert await page.locator('[data-tour="dashboard-reorder"]').count()>0, "dashboard-reorder marker missing"
        assert await page.locator('[data-tour="global-search"]').count()>0, "global-search marker missing"
        await page.goto(f"{FRONTEND}/inventory", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(800)
        assert await page.locator('[data-tour="stock-levels"]').count()>0, "stock-levels marker missing"
        assert await page.locator('[data-tour="adjust-stock"]').count()>0, "adjust-stock marker missing"
        await page.goto(f"{FRONTEND}/sales", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(800)
        assert await page.locator('[data-tour="new-sale-btn"]').count()>0, "new-sale-btn marker missing"
        print("  data-tour markers ok")

        # Screenshots
        os.makedirs("artifacts/playwright", exist_ok=True)
        await page.goto(f"{FRONTEND}/help", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(800)
        await page.screenshot(path="artifacts/playwright/help-index.png", full_page=True)
        await page.goto(f"{FRONTEND}/help/sales-pos", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(600)
        await page.screenshot(path="artifacts/playwright/help-detail-sales.png", full_page=True)
        # mobile
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.goto(f"{FRONTEND}/help", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(600)
        await page.screenshot(path="artifacts/playwright/help-index-mobile.png", full_page=True)
        # tablet
        await page.set_viewport_size({"width": 820, "height": 1180})
        await page.goto(f"{FRONTEND}/help/sales-pos", wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(600)
        await page.screenshot(path="artifacts/playwright/help-detail-tablet.png", full_page=True)

        await browser.close()
        print("\n🎉 HELP CENTER VERIFIED")

if __name__ == "__main__":
    asyncio.run(main())
