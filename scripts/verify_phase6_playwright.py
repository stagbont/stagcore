import asyncio
import os
import sys
import uuid
from playwright.async_api import async_playwright


async def main():
    print("Starting Playwright E2E verification for Phase 6...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        # Generate unique test user
        uid = uuid.uuid4().hex[:6]
        email = f"e2e_owner_{uid}@stagcore.local"
        password = "Password123!"
        business_name = f"Apex Store {uid}"

        print(f"1. Navigating to registration page with email: {email}...")
        await page.goto("http://localhost:3000/register", wait_until="networkidle", timeout=20000)

        # Fill registration form using id selectors
        await page.fill('#name', f"Owner {uid}")
        await page.fill('#email', email)
        await page.fill('#password', password)
        await page.fill('#business', business_name)
        await page.click('button[type="submit"]')

        # Wait for redirect to dashboard
        print("Waiting for dashboard redirect...")
        await page.wait_for_url("**/dashboard", timeout=20000)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)

        print("2. Verifying Dashboard UI elements...")
        dash_title = await page.text_content("h1")
        assert "Executive Dashboard" in (dash_title or "") or "Dashboard" in (dash_title or ""), f"Unexpected dashboard title: {dash_title}"

        # Verify KPI metric cards are present
        body_text = await page.inner_text("body")
        upper_text = body_text.upper()
        assert "TODAY'S SALES REVENUE" in upper_text, "Missing Sales Revenue KPI"
        assert "TODAY'S GROSS PROFIT" in upper_text, "Missing Gross Profit KPI"
        assert "TOTAL INVENTORY VALUATION" in upper_text, "Missing Inventory Valuation KPI"
        assert "STOCK REORDER & ALERT LIST" in upper_text, "Missing Stock Alert List"
        assert "OPERATIONAL ACTIVITY FEED" in upper_text, "Missing Operational Activity Feed"
        print("✓ Dashboard elements verified successfully.")

        # Take screenshot of Dashboard
        os.makedirs("artifacts/playwright", exist_ok=True)
        await page.screenshot(path="artifacts/playwright/dashboard.png")
        print("Saved dashboard screenshot to artifacts/playwright/dashboard.png")

        # 3. Navigate to Reports
        print("3. Navigating to /reports...")
        await page.goto("http://localhost:3000/reports", wait_until="networkidle", timeout=20000)
        await page.wait_for_timeout(2000)

        reports_title = await page.text_content("h1")
        assert "Business Intelligence & Reports" in (reports_title or ""), f"Unexpected reports title: {reports_title}"

        # Check Tab 1: Sales & Revenue (default)
        sales_text = (await page.inner_text("body")).upper()
        assert "TOTAL SALES REVENUE" in sales_text, "Missing Total Sales Revenue card"
        assert "AVERAGE ORDER VALUE" in sales_text, "Missing Average Order Value card"
        assert "DAILY SALES PERFORMANCE" in sales_text, "Missing Daily Sales Performance table"
        print("✓ Sales & Revenue tab verified.")

        # Click Tab 2: Inventory & Valuation
        print("4. Testing Inventory & Valuation tab...")
        await page.click('button:has-text("Inventory & Valuation")')
        await page.wait_for_timeout(1000)
        inv_text = (await page.inner_text("body")).upper()
        assert "TOTAL INVENTORY VALUATION" in inv_text, "Missing Total Inventory Valuation"
        assert "SERIALIZED DEVICES VALUE" in inv_text, "Missing Serialized Devices Value"
        assert "INVENTORY VALUATION & STOCK TABLE" in inv_text, "Missing Detailed Stock Table"
        print("✓ Inventory & Valuation tab verified.")

        # Click Tab 3: Profit & Loss
        print("5. Testing Profit & Loss tab...")
        await page.click('button:has-text("Profit & Loss")')
        await page.wait_for_timeout(1000)
        pnl_text = (await page.inner_text("body")).upper()
        assert "GROSS REVENUE" in pnl_text, "Missing Gross Revenue"
        assert "COST OF GOODS SOLD" in pnl_text, "Missing COGS"
        assert "P&L FINANCIAL SUMMARY" in pnl_text, "Missing P&L Statement card"
        print("✓ Profit & Loss tab verified.")

        # Click Tab 4: Product Performance
        print("6. Testing Product Performance tab...")
        await page.click('button:has-text("Product Performance")')
        await page.wait_for_timeout(1000)
        prod_text = (await page.inner_text("body")).upper()
        assert "TOP VOLUME PRODUCTS" in prod_text, "Missing Top Volume Products table"
        assert "MOST PROFITABLE PRODUCTS" in prod_text, "Missing Most Profitable Products table"
        print("✓ Product Performance tab verified.")

        # Click Tab 5: Supplier Analytics
        print("7. Testing Supplier Analytics tab...")
        await page.click('button:has-text("Supplier Analytics")')
        await page.wait_for_timeout(1000)
        supp_text = (await page.inner_text("body")).upper()
        assert "SUPPLIER PROCUREMENT SUMMARY" in supp_text, "Missing Supplier Procurement Summary table"
        print("✓ Supplier Analytics tab verified.")

        # Take screenshot of Reports page
        await page.screenshot(path="artifacts/playwright/reports.png")
        print("Saved reports screenshot to artifacts/playwright/reports.png")

        await browser.close()
        print("\n🎉 ALL PLAYWRIGHT E2E TESTS COMPLETED AND VERIFIED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(main())
