import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import httpx

sys.path.insert(0, os.path.abspath("backend"))

FRONTEND_URL = "http://localhost:3000"
BACKEND_URL = "http://localhost:8000"

DEMO_USER = {
    "name": "Alex Morgan",
    "email": "demo@stagcore.local",
    "password": "Password123!",
    "business_name": "Stagcore Flagship Store",
    "business_slug": "stagcore-flagship",
}


async def seed():
    print("==================================================")
    print("🌱 SEEDING STAGCORE DEMO DATA")
    print("==================================================")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Sign up user via Better Auth
        print(f"\n1. Creating Better Auth user ({DEMO_USER['email']})...")
        signup_res = await client.post(
            f"{FRONTEND_URL}/api/auth/sign-up/email",
            headers={"Origin": FRONTEND_URL},
            json={
                "name": DEMO_USER["name"],
                "email": DEMO_USER["email"],
                "password": DEMO_USER["password"],
            },
        )
        if signup_res.status_code in [200, 201]:
            print("✓ Better Auth user created.")
        else:
            print(f"Notice: User sign-up returned {signup_res.status_code} (User might already exist, attempting login).")

        # 2. Login via Better Auth to obtain session token
        login_res = await client.post(
            f"{FRONTEND_URL}/api/auth/sign-in/email",
            headers={"Origin": FRONTEND_URL},
            json={
                "email": DEMO_USER["email"],
                "password": DEMO_USER["password"],
            },
        )
        if login_res.status_code not in [200, 201]:
            print(f"Login failed: {login_res.text}")
            return

        login_data = login_res.json()
        token = login_data.get("token") or login_data.get("session", {}).get("token")
        if not token:
            # Check cookies
            cookies = login_res.cookies
            token = cookies.get("better-auth.session_token")
        print(f"✓ Obtained auth token: {token[:15]}...")

        headers = {"Authorization": f"Bearer {token}"}

        # 3. Register Business in Backend
        print("\n2. Initializing Business Workspace...")
        reg_biz_res = await client.post(
            f"{BACKEND_URL}/api/v1/auth/register",
            json={
                "email": DEMO_USER["email"],
                "name": DEMO_USER["name"],
                "password": DEMO_USER["password"],
                "business_name": DEMO_USER["business_name"],
                "business_slug": DEMO_USER["business_slug"],
            },
        )
        
        # Get business id
        biz_res = await client.get(f"{BACKEND_URL}/api/v1/business/", headers=headers)
        businesses = biz_res.json()
        if not businesses:
            print("Error: No business found for user.")
            return
        business = businesses[0]
        biz_id = business["id"]
        print(f"✓ Active Business: {business['name']} (ID: {biz_id})")

        # 4. Enable All Features (Suppliers, Customers, Multi-location, Warranty, Repairs)
        print("\n3. Enabling All Platform Modules & Feature Flags...")
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
        from sqlalchemy import update
        from app.models.feature import BusinessFeature

        engine = create_async_engine("sqlite+aiosqlite:///backend/stagcore.db")
        async_session = async_sessionmaker(engine, expire_on_commit=False)
        async with async_session() as session:
            await session.execute(
                update(BusinessFeature)
                .where(BusinessFeature.business_id == biz_id)
                .values(enabled=True)
            )
            await session.commit()
        print("✓ All feature flags enabled.")

        # 5. Create Categories
        print("\n4. Creating Product Categories...")
        categories_data = [
            {"name": "Smartphones", "slug": "smartphones", "default_warranty_months": 12},
            {"name": "Laptops & Tablets", "slug": "laptops-tablets", "default_warranty_months": 12},
            {"name": "Audio & Wearables", "slug": "audio-wearables", "default_warranty_months": 6},
            {"name": "Charging & Power", "slug": "charging-power", "default_warranty_months": 6},
            {"name": "Protection & Cases", "slug": "protection-cases", "default_warranty_months": 3},
        ]
        cat_map = {}
        for c in categories_data:
            res = await client.post(f"{BACKEND_URL}/api/v1/categories/?business_id={biz_id}", json=c, headers=headers)
            if res.status_code == 201:
                cat_map[c["name"]] = res.json()["id"]
            else:
                # fetch existing
                list_c = await client.get(f"{BACKEND_URL}/api/v1/categories/?business_id={biz_id}", headers=headers)
                for existing in list_c.json():
                    cat_map[existing["name"]] = existing["id"]
        print(f"✓ {len(cat_map)} categories configured.")

        # 6. Create Locations
        print("\n5. Creating Store Locations...")
        loc_map = {}
        locations_data = [
            {"name": "Main Showroom Floor", "address": "Suite 101, Main Avenue"},
            {"name": "Warehouse Depot A", "address": "Bay 4, Industrial Park"},
        ]
        for l in locations_data:
            res = await client.post(f"{BACKEND_URL}/api/v1/locations/?business_id={biz_id}", json=l, headers=headers)
            if res.status_code == 201:
                loc_map[l["name"]] = res.json()["id"]
            else:
                list_l = await client.get(f"{BACKEND_URL}/api/v1/locations/?business_id={biz_id}", headers=headers)
                for existing in list_l.json():
                    loc_map[existing["name"]] = existing["id"]
        print(f"✓ {len(loc_map)} locations configured.")

        # 7. Create Suppliers
        print("\n6. Creating Suppliers...")
        supp_map = {}
        suppliers_data = [
            {"name": "Apple Authorized Global Distro", "phone": "+1-800-555-0199", "email": "supply@apple-distro.com", "address": "1 Infinite Loop, Cupertino CA"},
            {"name": "Samsung Direct Wholesale", "phone": "+1-800-555-0188", "email": "orders@samsung-direct.com", "address": "Ridgefield Park, NJ"},
            {"name": "Anker Innovations Official", "phone": "+1-800-555-0177", "email": "b2b@anker.com", "address": "Seattle, WA"},
        ]
        for s in suppliers_data:
            res = await client.post(f"{BACKEND_URL}/api/v1/suppliers/?business_id={biz_id}", json=s, headers=headers)
            if res.status_code == 201:
                supp_map[s["name"]] = res.json()["id"]
            else:
                list_s = await client.get(f"{BACKEND_URL}/api/v1/suppliers/?business_id={biz_id}", headers=headers)
                for existing in list_s.json():
                    supp_map[existing["name"]] = existing["id"]
        print(f"✓ {len(supp_map)} suppliers configured.")

        # 8. Create Customers
        print("\n7. Creating Customers...")
        cust_map = {}
        customers_data = [
            {"name": "Sarah Jenkins", "phone": "+1-555-0143", "email": "sarah.j@example.com"},
            {"name": "Michael Chang", "phone": "+1-555-0182", "email": "m.chang@example.com"},
            {"name": "Apex Tech Solutions Ltd", "phone": "+1-555-0199", "email": "procurement@apextech.com"},
        ]
        for cu in customers_data:
            res = await client.post(f"{BACKEND_URL}/api/v1/customers/?business_id={biz_id}", json=cu, headers=headers)
            if res.status_code == 201:
                cust_map[cu["name"]] = res.json()["id"]
            else:
                list_cu = await client.get(f"{BACKEND_URL}/api/v1/customers/?business_id={biz_id}", headers=headers)
                for existing in list_cu.json():
                    cust_map[existing["name"]] = existing["id"]
        print(f"✓ {len(cust_map)} customers configured.")

        # 9. Create Non-Serialized Products
        print("\n8. Creating Products & Inventory Ledger Items...")
        products_data = [
            {
                "name": "Anker 65W GaN Fast Wall Charger",
                "sku": "ANK-65W-GAN",
                "barcode": "848061054321",
                "category_id": cat_map.get("Charging & Power"),
                "supplier_id": supp_map.get("Anker Innovations Official"),
                "brand": "Anker",
                "cost_price": "18.00",
                "selling_price": "39.99",
                "minimum_stock_level": 15,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "Apple MagSafe 15W Wireless Charger",
                "sku": "APL-MAG-15W",
                "barcode": "194252192580",
                "category_id": cat_map.get("Charging & Power"),
                "supplier_id": supp_map.get("Apple Authorized Global Distro"),
                "brand": "Apple",
                "cost_price": "22.00",
                "selling_price": "49.00",
                "minimum_stock_level": 10,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "Anker PowerLine+ III USB-C to USB-C 2M",
                "sku": "ANK-CC-2M",
                "barcode": "848061099882",
                "category_id": cat_map.get("Charging & Power"),
                "supplier_id": supp_map.get("Anker Innovations Official"),
                "brand": "Anker",
                "cost_price": "4.50",
                "selling_price": "14.99",
                "minimum_stock_level": 25,
                "unit_of_measurement": "pcs",
            },
            {
                "name": "iPhone 15 Pro Tempered Glass (2-Pack)",
                "sku": "TG-IP15P-2PK",
                "barcode": "719324018241",
                "category_id": cat_map.get("Protection & Cases"),
                "supplier_id": supp_map.get("Anker Innovations Official"),
                "brand": "ArmorShield",
                "cost_price": "2.50",
                "selling_price": "12.99",
                "minimum_stock_level": 20,
                "unit_of_measurement": "pack",
            },
            {
                "name": "Apple AirPods Pro (2nd Gen, USB-C)",
                "sku": "APL-APP2-USBC",
                "barcode": "195949052521",
                "category_id": cat_map.get("Audio & Wearables"),
                "supplier_id": supp_map.get("Apple Authorized Global Distro"),
                "brand": "Apple",
                "cost_price": "160.00",
                "selling_price": "249.00",
                "minimum_stock_level": 6,
                "unit_of_measurement": "unit",
            },
            {
                "name": "Sony WH-1000XM5 Wireless Headphones",
                "sku": "SNY-XM5-BLK",
                "barcode": "027242923591",
                "category_id": cat_map.get("Audio & Wearables"),
                "supplier_id": supp_map.get("Anker Innovations Official"),
                "brand": "Sony",
                "cost_price": "240.00",
                "selling_price": "399.99",
                "minimum_stock_level": 4,
                "unit_of_measurement": "unit",
            },
        ]
        prod_map = {}
        for p in products_data:
            res = await client.post(f"{BACKEND_URL}/api/v1/products/?business_id={biz_id}", json=p, headers=headers)
            if res.status_code == 201:
                prod_map[p["name"]] = res.json()["id"]
            else:
                list_p = await client.get(f"{BACKEND_URL}/api/v1/products/?business_id={biz_id}", headers=headers)
                for existing in list_p.json():
                    prod_map[existing["name"]] = existing["id"]
        print(f"✓ {len(prod_map)} standard products created.")

        # 10. Purchase Orders & Goods Receiving for Non-Serialized Products
        print("\n9. Receiving Inventory Stock via Purchases...")
        purchases = [
            {
                "supplier_id": supp_map.get("Anker Innovations Official"),
                "location_id": loc_map.get("Main Showroom Floor"),
                "invoice_reference": "INV-ANK-8841",
                "items": [
                    {"product_id": prod_map["Anker 65W GaN Fast Wall Charger"], "quantity": 40, "unit_cost": "18.00"},
                    {"product_id": prod_map["Anker PowerLine+ III USB-C to USB-C 2M"], "quantity": 60, "unit_cost": "4.50"},
                    {"product_id": prod_map["iPhone 15 Pro Tempered Glass (2-Pack)"], "quantity": 50, "unit_cost": "2.50"},
                    {"product_id": prod_map["Sony WH-1000XM5 Wireless Headphones"], "quantity": 8, "unit_cost": "240.00"},
                ],
            },
            {
                "supplier_id": supp_map.get("Apple Authorized Global Distro"),
                "location_id": loc_map.get("Main Showroom Floor"),
                "invoice_reference": "INV-APL-9021",
                "items": [
                    {"product_id": prod_map["Apple MagSafe 15W Wireless Charger"], "quantity": 30, "unit_cost": "22.00"},
                    {"product_id": prod_map["Apple AirPods Pro (2nd Gen, USB-C)"], "quantity": 15, "unit_cost": "160.00"},
                ],
            },
        ]
        for pur in purchases:
            p_res = await client.post(f"{BACKEND_URL}/api/v1/purchases?business_id={biz_id}", json=pur, headers=headers)
            if p_res.status_code == 201:
                p_id = p_res.json()["id"]
                await client.post(f"{BACKEND_URL}/api/v1/purchases/{p_id}/receive?business_id={biz_id}", headers=headers)
        print("✓ Non-serialized inventory ledger populated.")

        # 11. Create Serialized Devices (In Stock)
        print("\n10. Registering Serialized Devices (IMEI / Serial units)...")
        devices_to_create = [
            {"product_name": "iPhone 15 Pro 128GB Black Titanium", "serial_number": "DNP98271KL81", "imei": "358921098234111", "category_id": cat_map.get("Smartphones"), "cost_price": "780.00", "selling_price": "999.00"},
            {"product_name": "iPhone 15 Pro 128GB Natural Titanium", "serial_number": "DNP98271KL82", "imei": "358921098234112", "category_id": cat_map.get("Smartphones"), "cost_price": "780.00", "selling_price": "999.00"},
            {"product_name": "iPhone 15 Pro Max 256GB Natural Titanium", "serial_number": "DNP99112KL91", "imei": "358921098234221", "category_id": cat_map.get("Smartphones"), "cost_price": "920.00", "selling_price": "1199.00"},
            {"product_name": "iPhone 15 Pro Max 256GB Blue Titanium", "serial_number": "DNP99112KL92", "imei": "358921098234222", "category_id": cat_map.get("Smartphones"), "cost_price": "920.00", "selling_price": "1199.00"},
            {"product_name": "Samsung Galaxy S24 Ultra 512GB Titanium Gray", "serial_number": "R5CW10892KL1", "imei": "354029108234331", "category_id": cat_map.get("Smartphones"), "cost_price": "950.00", "selling_price": "1299.00"},
            {"product_name": "Samsung Galaxy S24 Ultra 512GB Titanium Black", "serial_number": "R5CW10892KL2", "imei": "354029108234332", "category_id": cat_map.get("Smartphones"), "cost_price": "950.00", "selling_price": "1299.00"},
            {"product_name": "MacBook Air 13\" M3 16GB/512GB Space Gray", "serial_number": "C02G9012MD61", "imei": None, "category_id": cat_map.get("Laptops & Tablets"), "cost_price": "1050.00", "selling_price": "1399.00"},
            {"product_name": "iPad Pro 11\" M4 256GB Wi-Fi Silver", "serial_number": "DMPL4091MD71", "imei": None, "category_id": cat_map.get("Laptops & Tablets"), "cost_price": "750.00", "selling_price": "999.00"},
        ]
        for dev in devices_to_create:
            res = await client.post(f"{BACKEND_URL}/api/v1/devices/?business_id={biz_id}", json=dev, headers=headers)

        dev_list_res = await client.get(f"{BACKEND_URL}/api/v1/devices/?business_id={biz_id}", headers=headers)
        created_devices = dev_list_res.json()
        print(f"✓ {len(created_devices)} serialized devices registered in stock.")

        # 12. Create Completed POS Sales Transactions
        print("\n11. Generating Historical & Today's Completed POS Sales...")
        # Check if we have in-stock devices to sell
        in_stock_devices = [d for d in created_devices if d.get("status") == "in_stock"]
        dev_sold_1 = in_stock_devices[0] if len(in_stock_devices) > 0 else created_devices[0]
        dev_sold_2 = in_stock_devices[1] if len(in_stock_devices) > 1 else created_devices[1]

        sales_batch = [
            # Sale 1: Device + Accessories (Today)
            {
                "customer_id": cust_map.get("Sarah Jenkins"),
                "location_id": loc_map.get("Main Showroom Floor"),
                "payment_method": "card",
                "items": [
                    {"device_id": dev_sold_1["id"], "quantity": 1, "selling_price": "999.00", "discount": "0.00"},
                    {"product_id": prod_map["Apple MagSafe 15W Wireless Charger"], "quantity": 1, "selling_price": "49.00", "discount": "5.00"},
                    {"product_id": prod_map["iPhone 15 Pro Tempered Glass (2-Pack)"], "quantity": 1, "selling_price": "12.99", "discount": "0.00"},
                ],
            },
            # Sale 2: Audio & Charging (Today)
            {
                "customer_id": cust_map.get("Michael Chang"),
                "location_id": loc_map.get("Main Showroom Floor"),
                "payment_method": "mobile_money",
                "items": [
                    {"product_id": prod_map["Apple AirPods Pro (2nd Gen, USB-C)"], "quantity": 1, "selling_price": "249.00", "discount": "10.00"},
                    {"product_id": prod_map["Anker 65W GaN Fast Wall Charger"], "quantity": 2, "selling_price": "39.99", "discount": "0.00"},
                ],
            },
            # Sale 3: Quick Walk-in Accessories (Today)
            {
                "customer_id": None,
                "location_id": loc_map.get("Main Showroom Floor"),
                "payment_method": "cash",
                "items": [
                    {"product_id": prod_map["Anker PowerLine+ III USB-C to USB-C 2M"], "quantity": 3, "selling_price": "14.99", "discount": "2.00"},
                    {"product_id": prod_map["iPhone 15 Pro Tempered Glass (2-Pack)"], "quantity": 2, "selling_price": "12.99", "discount": "0.00"},
                ],
            },
            # Sale 4: Flagship Device + Headphones (Completed)
            {
                "customer_id": cust_map.get("Apex Tech Solutions Ltd"),
                "location_id": loc_map.get("Main Showroom Floor"),
                "payment_method": "card",
                "items": [
                    {"device_id": dev_sold_2["id"], "quantity": 1, "selling_price": "1299.00", "discount": "50.00"},
                    {"product_id": prod_map["Sony WH-1000XM5 Wireless Headphones"], "quantity": 1, "selling_price": "399.99", "discount": "20.00"},
                    {"product_id": prod_map["Anker 65W GaN Fast Wall Charger"], "quantity": 2, "selling_price": "39.99", "discount": "0.00"},
                ],
            },
        ]

        for s_data in sales_batch:
            res = await client.post(f"{BACKEND_URL}/api/v1/sales?business_id={biz_id}", json=s_data, headers=headers)
            if res.status_code == 201:
                sale_id = res.json()["id"]
                await client.post(f"{BACKEND_URL}/api/v1/sales/{sale_id}/complete?business_id={biz_id}", headers=headers)

        print("✓ Completed sales processed with atomic inventory deductions & warranty records.")

        # 13. Summary check
        summary_res = await client.get(f"{BACKEND_URL}/api/v1/dashboard/summary?business_id={biz_id}", headers=headers)
        if summary_res.status_code == 200:
            s_data = summary_res.json()
            print("\n==================================================")
            print("🎉 SEEDING COMPLETE! LIVE DASHBOARD OVERVIEW:")
            print(f"• Today's Revenue:     ${float(s_data['today_sales_total']):,.2f}")
            print(f"• Today's Gross Profit: ${float(s_data['today_gross_profit']):,.2f}")
            print(f"• Total Inventory Val: ${float(s_data['total_inventory_value']):,.2f}")
            print(f"• Active Items:        {s_data['total_products_count']}")
            print(f"• Low Stock Items:     {s_data['low_stock_count']}")
            print("==================================================")
            print("\n🔑 LOGIN CREDENTIALS:")
            print(f"• URL:      {FRONTEND_URL}/login")
            print(f"• Email:    {DEMO_USER['email']}")
            print(f"• Password: {DEMO_USER['password']}")
            print("==================================================")


if __name__ == "__main__":
    asyncio.run(seed())
