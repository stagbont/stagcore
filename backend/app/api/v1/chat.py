import json
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.business import Business
from app.schemas.chat import ChatRequest

router = APIRouter()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# In-memory rate limiter: business_id -> list[timestamps]
_rate_store: dict[str, list[float]] = {}


def _get_business_id(current_user: dict, business_id: str | None = None) -> str:
    memberships = current_user.get("memberships", [])
    if not memberships:
        raise HTTPException(status_code=403, detail="No business membership")
    if business_id:
        allowed = {m["business_id"] for m in memberships}
        if business_id not in allowed:
            raise HTTPException(status_code=403, detail="Not a member of this business")
        return business_id
    return memberships[0]["business_id"]


def _check_rate_limit(business_id: str) -> None:
    import time

    now = time.time()
    window = 60
    limit = 20
    lst = _rate_store.get(business_id, [])
    lst = [t for t in lst if now - t < window]
    if len(lst) >= limit:
        raise HTTPException(status_code=429, detail="Too many chat requests, try again shortly")
    lst.append(now)
    _rate_store[business_id] = lst


# Lightweight tutorial index mirrored from frontend src/content/help/tutorials.ts
TUTORIAL_INDEX = [
    {"slug": "quick-start", "title": "Quick Start & First Login", "route": "/dashboard", "persona": "Owner"},
    {"slug": "business-team", "title": "Business & Team Setup", "route": "/dashboard", "persona": "Owner"},
    {"slug": "categories-warranty", "title": "Categories & Warranty Defaults", "route": "/categories", "persona": "Owner"},
    {"slug": "products", "title": "Products (Non-Serialized Inventory)", "route": "/products", "persona": "Inventory Clerk"},
    {"slug": "devices", "title": "Devices (Serialized Inventory)", "route": "/devices", "persona": "Inventory Clerk"},
    {"slug": "inventory-ledger", "title": "Inventory Ledger — Derived Stock", "route": "/inventory", "persona": "Manager"},
    {"slug": "suppliers-customers", "title": "Suppliers & Customers", "route": "/suppliers", "persona": "Manager"},
    {"slug": "purchases", "title": "Purchasing & Goods Receiving", "route": "/purchases", "persona": "Manager"},
    {"slug": "sales-pos", "title": "Sales / POS — Complete a Sale", "route": "/sales", "persona": "Cashier"},
    {"slug": "scanning-search", "title": "Barcode & IMEI Scanning + Global Search", "route": "/devices", "persona": "Cashier"},
    {"slug": "returns-cancellations", "title": "Returns & Cancellations", "route": "/sales", "persona": "Manager"},
    {"slug": "transfers-locations", "title": "Stock Transfers & Locations", "route": "/transfers", "persona": "Manager"},
    {"slug": "warranty", "title": "Warranty — Auto-Created on Device Sale", "route": "/warranty", "persona": "Manager"},
    {"slug": "repairs", "title": "Repairs — Store & Walk-In Devices", "route": "/repairs", "persona": "Manager"},
    {"slug": "dashboard-reports", "title": "Dashboard, Reports & Intelligence", "route": "/reports", "persona": "Owner"},
    {"slug": "platform-admin", "title": "Platform Admin — Feature Flags", "route": "/admin/features", "persona": "Platform Admin"},
]


def _build_system_prompt(business_name: str) -> str:
    return (
        f"You are Stagcore Shop Assistant for '{business_name}'. "
        "You help gadget shop staff with inventory, sales, and operations. "
        "Rules:\n"
        "- Stock is derived from immutable ledger movements; never claim direct edits.\n"
        "- For any stock, revenue, low-stock, or device lookup, CALL the available tool — do not hallucinate numbers.\n"
        "- Keep answers concise (2-4 sentences) and tenant-scoped to this business only.\n"
        "- Cite tutorial route when answering 'how do I…?' (e.g. See /sales, /inventory).\n"
        "- Do not invent business data outside tool results.\n"
        "- Use tabular numbers style when showing prices (e.g. $1,299.00).\n"
        f"- Today is {datetime.now(timezone.utc).date().isoformat()}.\n"
        "Available help tutorials: " + ", ".join(f"{t['title']} ({t['route']})" for t in TUTORIAL_INDEX)
    )


def _get_tools() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "search_help_tutorials",
                "description": "Search help tutorials by keyword, returns matching tutorials with route",
                "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_dashboard_summary",
                "description": "Get today's revenue, profit, low-stock count and inventory valuation",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_products",
                "description": "Search products by name, SKU or barcode (tenant-scoped)",
                "parameters": {"type": "object", "properties": {"q": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["q"]},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_stock_level",
                "description": "Get current stock level for a product by product_id or sku",
                "parameters": {"type": "object", "properties": {"product_id": {"type": "string"}, "sku": {"type": "string"}, "query": {"type": "string"}}, "required": []},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_low_stock",
                "description": "List low-stock products where stock <= minimum threshold",
                "parameters": {"type": "object", "properties": {"limit": {"type": "integer"}}, "required": []},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_devices_by_imei",
                "description": "Lookup device by IMEI, serial, or barcode (tries IMEI then serial then product barcode)",
                "parameters": {"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]},
            },
        },
    ]


async def _exec_search_help(query: str) -> str:
    q = query.lower().strip()
    if not q:
        return json.dumps(TUTORIAL_INDEX[:3])
    matches = [t for t in TUTORIAL_INDEX if q in t["title"].lower() or q in t["slug"]]
    if not matches:
        # fallback: any word match
        words = q.split()
        matches = [t for t in TUTORIAL_INDEX if any(w in t["title"].lower() for w in words)]
    return json.dumps(matches[:3] if matches else TUTORIAL_INDEX[:3])


async def _exec_dashboard(db: AsyncSession, business_id: str) -> str:
    from app.services.reports import ReportService

    data = await ReportService.get_dashboard_summary(db, business_id)
    # Convert Decimal to float/str for JSON
    return json.dumps(
        {
            "today_sales_total": str(data.today_sales_total),
            "today_sales_count": data.today_sales_count,
            "today_gross_profit": str(data.today_gross_profit),
            "total_inventory_value": str(data.total_inventory_value),
            "total_products_count": data.total_products_count,
            "low_stock_count": data.low_stock_count,
            "out_of_stock_count": data.out_of_stock_count,
        },
        default=str,
    )


async def _exec_search_products(db: AsyncSession, business_id: str, q: str, limit: int = 5) -> str:
    from app.models.product import Product

    like = f"%{q}%"
    res = await db.execute(
        select(Product)
        .where(Product.business_id == business_id, or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like)))
        .order_by(Product.name)
        .limit(min(limit, 20))
    )
    rows = res.scalars().all()
    return json.dumps([{"id": r.id, "name": r.name, "sku": r.sku, "barcode": r.barcode, "selling_price": str(r.selling_price)} for r in rows], default=str)


async def _exec_stock_level(db: AsyncSession, business_id: str, product_id: str | None, sku: str | None, query: str | None) -> str:
    from app.models.product import Product
    from app.services.inventory import InventoryService

    prod = None
    if product_id:
        res = await db.execute(select(Product).where(Product.id == product_id, Product.business_id == business_id))
        prod = res.scalars().first()
    elif sku:
        res = await db.execute(select(Product).where(Product.sku == sku, Product.business_id == business_id))
        prod = res.scalars().first()
    elif query:
        like = f"%{query}%"
        res = await db.execute(
            select(Product)
            .where(Product.business_id == business_id, or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like)))
            .limit(1)
        )
        prod = res.scalars().first()
    if not prod:
        return json.dumps({"error": "Product not found", "hint": "Try search_products with a keyword first"})
    stock = await InventoryService.get_current_stock(db, business_id, prod.id)
    return json.dumps({"product_id": prod.id, "name": prod.name, "sku": prod.sku, "current_stock": stock, "minimum": prod.minimum_stock_level}, default=str)


async def _exec_low_stock(db: AsyncSession, business_id: str, limit: int = 10) -> str:
    from app.services.inventory import InventoryService

    rows = await InventoryService.get_low_stock_products(db, business_id)
    out = [{"product_id": r["product"].id, "name": r["product"].name, "sku": r["product"].sku, "stock": r["current_stock"], "minimum": r["product"].minimum_stock_level} for r in rows[:limit]]
    return json.dumps(out, default=str)


async def _exec_device_lookup(db: AsyncSession, business_id: str, code: str) -> str:
    from app.models.device import Device
    from app.models.product import Product

    norm = code.strip()
    res = await db.execute(select(Device).where(Device.business_id == business_id, Device.imei == norm))
    dev = res.scalars().first()
    if not dev:
        res = await db.execute(select(Device).where(Device.business_id == business_id, Device.serial_number == norm))
        dev = res.scalars().first()
    if dev:
        return json.dumps(
            {
                "type": "device",
                "id": dev.id,
                "product_name": dev.product_name,
                "serial_number": dev.serial_number,
                "imei": dev.imei,
                "status": dev.status,
                "selling_price": str(dev.selling_price) if dev.selling_price else None,
            },
            default=str,
        )
    # fallback product barcode
    res = await db.execute(select(Product).where(Product.business_id == business_id, Product.barcode == norm))
    prod = res.scalars().first()
    if prod:
        return json.dumps({"type": "product", "id": prod.id, "name": prod.name, "sku": prod.sku, "barcode": prod.barcode}, default=str)
    return json.dumps({"error": "Not found for code", "code": norm})


async def _execute_tool(name: str, args: dict[str, Any], db: AsyncSession, business_id: str) -> str:
    try:
        if name == "search_help_tutorials":
            return await _exec_search_help(args.get("query", ""))
        if name == "get_dashboard_summary":
            return await _exec_dashboard(db, business_id)
        if name == "search_products":
            return await _exec_search_products(db, business_id, args.get("q", ""), int(args.get("limit", 5)))
        if name == "get_stock_level":
            return await _exec_stock_level(db, business_id, args.get("product_id"), args.get("sku"), args.get("query"))
        if name == "get_low_stock":
            return await _exec_low_stock(db, business_id, int(args.get("limit", 10)))
        if name == "search_devices_by_imei":
            return await _exec_device_lookup(db, business_id, args.get("code", ""))
        return json.dumps({"error": f"Unknown tool {name}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


@router.post("/chat")
async def chat_endpoint(
    payload: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    business_id = _get_business_id(current_user)
    _check_rate_limit(business_id)

    if not settings.openrouter_api_key:
        raise HTTPException(status_code=503, detail="Chat unavailable — set OPENROUTER_API_KEY on the server (https://openrouter.ai/keys)")

    if len(payload.messages) > 20:
        raise HTTPException(status_code=400, detail="Too many messages (max 20)")

    # Resolve business name for system prompt
    biz_name = business_id
    try:
        res = await db.execute(select(Business).where(Business.id == business_id))
        biz = res.scalars().first()
        if biz:
            biz_name = biz.name
    except Exception:
        pass

    system_prompt = _build_system_prompt(biz_name)
    # Keep last 10 user/assistant messages, prepend system
    msgs = [{"role": "system", "content": system_prompt}]
    for m in payload.messages[-10:]:
        # sanitize
        role = m.role
        if role == "tool":
            # tool messages come from backend loop only, not directly from client
            continue
        msgs.append({"role": role, "content": m.content[:4000]})

    tools = _get_tools()
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": settings.openrouter_site_url,
        "X-Title": settings.openrouter_app_name,
        "Content-Type": "application/json",
    }

    # Helper to call OpenRouter non-streaming
    async def call_openrouter(messages: list[dict]) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                OPENROUTER_URL,
                headers=headers,
                json={
                    "model": settings.openrouter_model,
                    "messages": messages,
                    "tools": tools,
                    "tool_choice": "auto",
                    "max_tokens": 1024,
                    "temperature": 0.4,
                },
            )
            if resp.status_code == 429:
                raise HTTPException(status_code=503, detail="OpenRouter rate limited — try again shortly")
            if resp.status_code >= 400:
                # Surface provider error safely
                detail = resp.text[:500]
                raise HTTPException(status_code=502, detail=f"OpenRouter error {resp.status_code}: {detail}")
            return resp.json()

    # First call to see if tools needed
    try:
        data = await call_openrouter(msgs)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenRouter connection failed: {e}")

    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    tool_calls = msg.get("tool_calls")

    final_content: str | None = None

    if tool_calls:
        # Execute tools and do second call
        # Append assistant tool_calls message
        msgs.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": tool_calls})
        for tc in tool_calls[:5]:
            fname = tc.get("function", {}).get("name", "")
            fargs_raw = tc.get("function", {}).get("arguments", "{}")
            try:
                fargs = json.loads(fargs_raw) if isinstance(fargs_raw, str) else (fargs_raw or {})
            except Exception:
                fargs = {}
            result = await _execute_tool(fname, fargs, db, business_id)
            msgs.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": result})
        # Second call for final answer
        try:
            data2 = await call_openrouter(msgs)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"OpenRouter connection failed on tool follow-up: {e}")
        final_content = (data2.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    else:
        final_content = msg.get("content") or ""

    if not final_content:
        final_content = "I couldn't generate a response — try rephrasing your question."

    # Truncate for safety
    final_content = final_content[:6000]

    if not payload.stream:
        return JSONResponse({"role": "assistant", "content": final_content, "model": settings.openrouter_model})

    # Stream as SSE-style chunks (pseudo-streaming by words to keep widget UX streaming)
    async def event_gen():
        # Yield in word chunks for smooth streaming without true OpenRouter SSE passthrough
        # Frontend expects `data: {"content":"..."}` lines then `data: [DONE]`
        words = final_content.split(" ")
        buf = ""
        for i, w in enumerate(words):
            piece = w + (" " if i < len(words) - 1 else "")
            buf += piece
            # flush every 4 words to reduce chattiness
            if (i + 1) % 4 == 0 or i == len(words) - 1:
                chunk = json.dumps({"content": buf})
                yield f"data: {chunk}\n\n".encode()
                buf = ""
                # small cooperative yield
                import asyncio

                await asyncio.sleep(0.02)
        yield b"data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
