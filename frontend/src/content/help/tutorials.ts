export type TutorialPersona = "Owner" | "Manager" | "Cashier" | "Inventory Clerk" | "Platform Admin";

export interface TutorialStep {
  title: string;
  detail: string;
  uiAnchor?: string;
  flagNote?: string;
}

export interface TutorialSection {
  heading: string;
  body: string;
  steps?: TutorialStep[];
  callout?: { variant: "info" | "warning" | "critical" | "success"; text: string };
  flagNote?: string;
}

export interface Tutorial {
  slug: string;
  order: number;
  title: string;
  shortTitle: string;
  description: string;
  persona: TutorialPersona[];
  flag: string | null;
  estimatedMinutes: number;
  prerequisites: string[];
  route: string;
  sections: TutorialSection[];
  troubleshooting: { q: string; a: string }[];
  nextSlug: string | null;
}

export const tutorials: Tutorial[] = [
  {
    slug: "quick-start",
    order: 0,
    title: "Quick Start & First Login",
    shortTitle: "Quick Start",
    description: "Create your account, sign in, and reach your dashboard for the first time.",
    persona: ["Owner", "Platform Admin"],
    flag: null,
    estimatedMinutes: 3,
    prerequisites: [],
    route: "/dashboard",
    sections: [
      {
        heading: "Goal",
        body: "Get from no account to a working business workspace in under three minutes.",
      },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Create your account", detail: "Open /register and enter name, email, and password. Submitting creates your User, Business, and BusinessUser (role = Owner) in one step.", uiAnchor: "Create one → Register form" },
          { title: "Sign in", detail: "Go to /login, enter the same email and password, and click Sign in. Better Auth sets a session cookie and redirects to /dashboard.", uiAnchor: "Sign in button" },
          { title: "Confirm your workspace", detail: "The dashboard header shows your business name (or “Workspace” while loading). The sidebar shows Dashboard, Categories, Products, Devices, Inventory, Purchases, Sales, and Reports. Flag-gated items (Locations, Warranty, Repairs, etc.) appear only when your admin enables them.", uiAnchor: "Header business name · Sidebar" },
          { title: "Try the global search", detail: "Type an IMEI, serial, or barcode into the header search bar and press Search. It tries by-imei → by-serial → by-barcode and jumps to /devices. This is the fastest way to look up any unit later.", uiAnchor: "Search IMEI, serial or barcode… input" },
        ],
      },
      {
        heading: "Expected result",
        body: "You land on Executive Dashboard with KPI cards (Today’s Sales Revenue, Gross Profit, Inventory Valuation, Low Stock Attention) and empty states — ready to add categories and products.",
      },
    ],
    troubleshooting: [
      { q: "I see “No business found” on the dashboard", a: "You signed in with a different email than you registered with. Each User is tied to one Business at creation. Register again with the intended email, or ask the Owner to invite you." },
      { q: "I land on /admin/businesses instead of /dashboard", a: "admin@stagcore.local is the Platform Admin account. Log in with your shop email to see the business workspace." },
    ],
    nextSlug: "business-team",
  },
  {
    slug: "business-team",
    order: 1,
    title: "Business & Team Setup",
    shortTitle: "Business & Team",
    description: "Understand roles, permissions, and how your business workspace is scoped.",
    persona: ["Owner"],
    flag: null,
    estimatedMinutes: 4,
    prerequisites: ["quick-start"],
    route: "/team",
    sections: [
      { heading: "Goal", body: "Know who can do what, and how multi-tenancy keeps your data isolated." },
      {
        heading: "Roles & permissions",
        body: "Every business-owned table carries business_id and every query is scoped to it. No cross-tenant access. Roles are OWNER, MANAGER, CASHIER, INVENTORY_CLERK.",
        steps: [
          { title: "Owner — full access", detail: "Views profit, manages users, sets reorder levels, does everything." },
          { title: "Manager — day-to-day", detail: "Sees profit, runs purchases/sales/adjustments, cannot manage users." },
          { title: "Cashier — POS only", detail: "Makes sales, views inventory, no cost/profit visibility." },
          { title: "Inventory Clerk — stock in", detail: "Adds products/devices, purchases, adjustments — no sales, no profit." },
        ],
      },
      {
        heading: "Manage your team",
        body: "Open Team from the sidebar (System group). Only Owners can add, edit roles, or remove members. All prices display in GH₵.",
        steps: [
          { title: "Add a member", detail: "Click Add Member, enter Name, Email, Password (min 8), and Role. Creating also creates their Better Auth login — they can sign in immediately at /login.", uiAnchor: "Team → Add Member → Name / Email / Password / Role" },
          { title: "Change a role", detail: "Click Edit Role on a row, pick Owner / Manager / Cashier / Inventory Clerk, and Save. The last Owner cannot be demoted.", uiAnchor: "Team table → Edit Role" },
          { title: "Remove a member", detail: "Click Remove and confirm. The last Owner cannot be removed. Removed users keep their login but lose business access.", uiAnchor: "Team table → Remove" },
        ],
      },
      {
        heading: "Next steps",
        body: "Keep one Owner email as your primary login and create Cashier logins per counter. Cashiers see Team read-only and sell via POS.",
      },
    ],
    troubleshooting: [{ q: "A Cashier can see costs", a: "Check the role in BusinessUser. Only Owner and Manager are permitted to view profit/cost. Reassign the user to CASHIER." }],
    nextSlug: "categories-warranty",
  },
  {
    slug: "categories-warranty",
    order: 2,
    title: "Categories & Warranty Defaults",
    shortTitle: "Categories",
    description: "Group products and set the default warranty length that auto-applies on device sale.",
    persona: ["Owner", "Manager", "Inventory Clerk"],
    flag: null,
    estimatedMinutes: 3,
    prerequisites: ["quick-start"],
    route: "/categories",
    sections: [
      { heading: "Goal", body: "Create categories (e.g., Phones — 12 mo, Laptops — 6 mo) so every new product/device can inherit them, and warranty expiry is correct on sale." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Open Categories", detail: "From the sidebar, click Categories. You see All Categories table with Name, Slug, Warranty columns.", uiAnchor: "Sidebar → Categories" },
          { title: "Create a category", detail: "Click New Category. Enter Name (e.g., Smartphones), leave Slug blank to auto-generate, set Default warranty (months) — e.g., 12 for phones, 6 for laptops, 3 for accessories.", uiAnchor: "New Category button → Name / Slug / Default warranty inputs" },
          { title: "Edit or delete", detail: "Use Edit to change name/warranty, Delete to remove (with confirmation). Slug auto-updates from name unless overridden.", uiAnchor: "Edit / Delete buttons" },
          { title: "Use in Products & Devices", detail: "The Category select in Products and Devices lists these entries. Warranty auto-created on device sale uses Category.default_warranty_months, overridable at sale time via warranty_months_override.", uiAnchor: "Category select in Products/Devices/Sales" },
        ],
      },
      { heading: "Expected result", body: "Categories appear in the table and are selectable when creating products and devices. A device sold under a 12-month category gets Warranty expires_at = sale_date + 12 months." },
    ],
    troubleshooting: [
      { q: "Warranty shows wrong expiry", a: "Check the device’s Category → Default warranty, and whether the sale line item overrode it. Device warranty picks the override first, then category default." },
    ],
    nextSlug: "products",
  },
  {
    slug: "products",
    order: 3,
    title: "Products (Non-Serialized Inventory)",
    shortTitle: "Products",
    description: "Create and manage quantity-tracked accessories — stock is derived from the ledger, never edited directly.",
    persona: ["Inventory Clerk", "Manager"],
    flag: null,
    estimatedMinutes: 5,
    prerequisites: ["categories-warranty"],
    route: "/products",
    sections: [
      { heading: "Goal", body: "Add accessories (cases, cables, chargers, earbuds) with SKU, barcode, pricing, and reorder threshold. Stock will be derived later via the ledger." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Open Products", detail: "Sidebar → Products. Table shows Name, SKU, Price, and Status.", uiAnchor: "Sidebar → Products" },
          { title: "Create a product", detail: "Click New Product. Required: Name. Optional: SKU (unique per business), Barcode (for scanning), Brand, Category, Supplier, Unit, Status (active/inactive). Pricing: Cost price and Selling price. Min stock: threshold that triggers low-stock alerts.", uiAnchor: "New Product → Name / SKU / Barcode / Category / Supplier / Cost/Selling price / Min stock" },
          { title: "Search & filter", detail: "Use the search box — it matches name, SKU, or barcode. This is the same field scanned at POS when barcode_scanning is enabled.", uiAnchor: "Search by name, SKU, barcode..." },
          { title: "Edit or delete", detail: "Edit re-opens the same form via PATCH; Delete requires confirmation. Deletion is blocked if the product has movements — deactivate via Status instead.", uiAnchor: "Edit / Delete" },
        ],
      },
      { heading: "Where stock appears", body: "Current stock lives on /inventory as sum of movements, and on /reports → Inventory & Valuation. Selling or receiving never edits quantity directly — it creates a ledger movement. See the Inventory Ledger tutorial next." },
    ],
    troubleshooting: [
      { q: "SKU duplicate error", a: "SKU is unique per business. Pick a distinct SKU or leave it blank (nullable)." },
      { q: "Barcode scan does not find the product", a: "Confirm the barcode string matches exactly and that barcode_scanning is enabled (Admin → Features). The POS scan calls /scan/by-barcode/{code}." },
    ],
    nextSlug: "devices",
  },
  {
    slug: "devices",
    order: 4,
    title: "Devices (Serialized Inventory)",
    shortTitle: "Devices",
    description: "Track every phone, laptop, and tablet as an individual unit with IMEI, serial, spec, and status.",
    persona: ["Inventory Clerk", "Manager"],
    flag: null,
    estimatedMinutes: 5,
    prerequisites: ["categories-warranty"],
    route: "/devices",
    sections: [
      { heading: "Goal", body: "Create one row per sellable unit. Stock for serialized items is the count of devices with status in_stock — not a quantity field." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Open Devices", detail: "Sidebar → Devices. Table shows Product name, Serial, IMEI, Status, Price.", uiAnchor: "Sidebar → Devices" },
          { title: "Create a device", detail: "Click New Device. Required: Product name / Model and Serial number. Optional: IMEI, Brand, Spec (JSON like {\"ram\":\"8GB\",\"storage\":\"256GB\"}), Cost/Selling price, Status (in_stock/sold/in_repair/returned), Category, Supplier.", uiAnchor: "New Device → Product name / Serial / IMEI / Spec JSON" },
          { title: "Status matters", detail: "Only in_stock devices appear in the POS device picker. Sold, in_repair, and returned are hidden from sale. Never edit stock directly — status changes happen via sales and repairs.", uiAnchor: "Status select" },
          { title: "Search", detail: "Filter by product name, serial, or IMEI. Header global search and the POS scanner can also jump to a device by IMEI/serial.", uiAnchor: "Search by name, serial, IMEI..." },
        ],
      },
      { heading: "Spec JSON", body: "Spec is free-form JSON for RAM, storage, condition, battery health, etc. Must be valid JSON. Leave blank for none. It is shown read-only on device history via /scan lookups." },
    ],
    troubleshooting: [
      { q: "“Spec must be valid JSON”", a: "Use double quotes: {\"ram\":\"8GB\",\"storage\":\"256GB\",\"condition\":\"new\"}. A trailing comma will fail." },
      { q: "Device not appearing at POS", a: "Its status must be in_stock. Check the Devices table status badge." },
    ],
    nextSlug: "inventory-ledger",
  },
  {
    slug: "inventory-ledger",
    order: 5,
    title: "Inventory Ledger — Derived Stock",
    shortTitle: "Inventory",
    description: "Stock is the sum of movements. Learn to read, filter, and adjust the immutable ledger.",
    persona: ["Inventory Clerk", "Manager", "Owner"],
    flag: "multi_location",
    estimatedMinutes: 6,
    prerequisites: ["products", "devices"],
    route: "/inventory",
    sections: [
      { heading: "The rule", body: "No table stores an editable quantity as truth. Every change is an InventoryMovement row (type, quantity, reference, created_by, notes). Current stock = sum of movements per product. For devices, a status transition (in_stock → sold) plus a ledger entry represents the movement." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "View stock levels", detail: "Open Inventory. Stock Levels table shows Product, SKU, Stock, Min, and Status (Low vs OK). Current stock is fetched per product from /inventory/stock/{id}.", uiAnchor: "Stock Levels table" },
          { title: "Filter by location", detail: "If multi_location is enabled, use the Location filter at top right. It narrows stock, low-stock, and Recent Movements to that location. When disabled, you see All locations.", uiAnchor: "Location filter select" },
          { title: "Adjust stock", detail: "In Adjust Stock, choose Product, Action (Receive/Sell/Adjust In/Adjust Out), Quantity, optional Location, and Notes. Click Apply. Each creates a ledger row: PURCHASE/w (+qty), SALE (−qty), ADJUSTMENT_IN/OUT.", uiAnchor: "Adjust Stock → Product / Action / Quantity / Apply" },
          { title: "Read low stock & movements", detail: "Low Stock Alerts lists items at or below minimum_stock_level. Recent Movements shows the last 20 ledger entries with type (+/−qty), reference, and date. All numeric columns use tabular-nums so quantities align.", uiAnchor: "Low Stock Alerts · Recent Movements tables" },
        ],
      },
      { heading: "Location-aware lesson", body: "A product’s stock at a location equals the sum of its movements at that location. Receiving and selling should select the same location to keep per-location counts correct." },
      { heading: "Feature flag note", body: "The Location filter and per-location stock only function when Platform Admin has enabled multi_location. Otherwise the controls are hidden and all stock is global.", flagNote: "multi_location" },
    ],
    troubleshooting: [
      { q: "Stock did not change after receiving", a: "Receiving via Inventory → Receive creates one movement. If you created a Purchase draft instead, you must Receive it on /purchases to generate the movement." },
      { q: "Stock went negative", a: "The Sell and Adjust Out actions allow going below zero by ledger; Dashboard low-stock counts surface it. Adjust In to correct, and add a note explaining the adjustment." },
    ],
    nextSlug: "suppliers-customers",
  },
  {
    slug: "suppliers-customers",
    order: 6,
    title: "Suppliers & Customers",
    shortTitle: "Suppliers & Customers",
    description: "Manage vendors and buyers — derived views like total purchases and history are computed, not stored.",
    persona: ["Inventory Clerk", "Manager"],
    flag: "suppliers",
    estimatedMinutes: 4,
    prerequisites: [],
    route: "/suppliers",
    sections: [
      { heading: "Goal", body: "Add the people you buy from and sell to. Supplier pages roll up total purchases; customer records attach to sales." },
      {
        heading: "Suppliers",
        body: "",
        steps: [
          { title: "Open Suppliers", detail: "Sidebar → Suppliers (visible only when suppliers flag is enabled). Create with Name (required), Phone, Email, Address.", uiAnchor: "Suppliers table / New Supplier" },
          { title: "Where used", detail: "Supplier select appears in Products, Devices, and Purchases. On Reports → Supplier Analytics you see total spent and last purchase date per supplier.", uiAnchor: "Supplier selects in Products/Devices/Purchases" },
        ],
      },
      {
        heading: "Customers",
        body: "",
        steps: [
          { title: "Open Customers", detail: "Sidebar → Customers (flag-gated on customers). Create with Name, Phone, Email. Or quick-add at POS: in New Sale, type name + phone and click Add to create and select in one step.", uiAnchor: "Customers table / POS Quick add name + Phone → Add" },
          { title: "Where used", detail: "Customer select lives on Sales. After a sale, customer history (purchase + repair + warranty) is available via the customer page and via device IMEI lookup.", uiAnchor: "Customer select in Sales" },
        ],
      },
      { heading: "Feature flags", body: "If Suppliers or Customers are disabled, their nav items and POS selects are fully absent — not grayed out. Ask Platform Admin to enable suppliers/customers in Admin → Features.", flagNote: "suppliers / customers" },
    ],
    troubleshooting: [
      { q: "I don’t see Suppliers or Customers in the sidebar", a: "That business has the flag off. Platform Admin must toggle it. You’ll then see the route appear without redeploying." },
    ],
    nextSlug: "purchases",
  },
  {
    slug: "purchases",
    order: 7,
    title: "Purchasing & Goods Receiving",
    shortTitle: "Purchases",
    description: "Draft a purchase, then Receive it to increase stock via the ledger (or create device units).",
    persona: ["Inventory Clerk", "Manager"],
    flag: null,
    estimatedMinutes: 6,
    prerequisites: ["products", "devices", "suppliers-customers"],
    route: "/purchases",
    sections: [
      { heading: "Goal", body: "Purchases are the only counterpoint to sales: receiving a purchase is what puts stock in. Draft → Receive is the mandatory two-step." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Open Purchases", detail: "Sidebar → Purchases. Table shows Invoice, Status (draft/received/cancelled), Items, Date.", uiAnchor: "Purchases table" },
          { title: "Create a draft", detail: "Click New Purchase. Optional: Supplier, Location, Invoice ref, Payment status (pending/paid/partial), Notes. In Items, toggle Product vs Device. For Product: choose product, Qty, Unit cost. For Device: enter Product name, Serial*, IMEI, Cost. Click Add Item; repeat to build the draft, then Create Draft.", uiAnchor: "New Purchase → Supplier/Location → Items Product/Device → Add Item → Create Draft" },
          { title: "Receive the draft", detail: "In the table’s Actions, click Receive on a draft. Confirm. This creates PURCHASE movements (+qty) for product items and creates Device rows with status in_stock for device items. Stock levels on Inventory update immediately.", uiAnchor: "Actions → Receive" },
          { title: "Other actions", detail: "Cancel moves draft → cancelled (no stock change). Delete only works on draft. Received purchases cannot be deleted.", uiAnchor: "Cancel / Delete" },
        ],
      },
      { heading: "Expected result", body: "Draft becomes received. /inventory Recent Movements shows a PURCHASE row (+qty) per line item; /devices shows new rows for device items." },
    ],
    troubleshooting: [
      { q: "Receive says already received", a: "A purchase can only be received once. Refresh the table; it should show status = received." },
      { q: "Device items not creating devices", a: "Device items require product_name and serial_number. IMEI is optional. Check that you selected Device mode before Add Item." },
    ],
    nextSlug: "sales-pos",
  },
  {
    slug: "sales-pos",
    order: 8,
    title: "Sales / POS — Complete a Sale",
    shortTitle: "Sales / POS",
    description: "Draft → Complete is atomic with stock deduction and device sale. The counter’s fastest path.",
    persona: ["Cashier", "Manager"],
    flag: "barcode_scanning",
    estimatedMinutes: 7,
    prerequisites: ["products", "devices", "inventory-ledger"],
    route: "/sales",
    sections: [
      { heading: "Goal", body: "Complete a sale in under 30 seconds: pick products/devices, take payment, and debit stock atomically." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Open POS", detail: "Sidebar → Sales. Table shows Date, Status (draft/completed/cancelled), Payment, Items, Total.", uiAnchor: "Sales table" },
          { title: "Create a draft", detail: "Click New Sale. Optional: Customer (or quick-add via name + phone → Add), Location, Notes. Payment: Cash / Mobile Money / Card (no credit/installment in v1).", uiAnchor: "New Sale → Customer select / Quick add → Payment select" },
          { title: "Add products", detail: "Toggle Product mode, select product, enter Qty, Price (defaults to selling_price), Discount. Click Add Item. Repeat. Tablet: buttons are min 44×44 for touch.", uiAnchor: "Items Product → Qty / Price / Discount → Add Item" },
          { title: "Add devices", detail: "Toggle Device mode, select an in_stock device from the picker (shows product_name · serial (imei) · status). Selling price and Discount editable; optional Warranty override (months). Add Item — qty is always 1; device already in cart is blocked.", uiAnchor: "Items Device → Select in-stock device → Warranty mo → Add Item" },
          { title: "Review and create", detail: "Running total appears above items (Total). Click Create Draft. The sale enters the table as draft.", uiAnchor: "Total: … → Create Draft" },
          { title: "Complete the sale", detail: "In the table, click Complete on the draft. Confirm. In one transaction: product movements SALE (−qty) are recorded and Device.status becomes sold with buyer/date plus an auto-created warranty (see Warranty tutorial).", uiAnchor: "Actions → Complete" },
          { title: "Cancel or Delete", detail: "Cancel on a completed sale restocks (reverse movements, device back to in_stock). Cancel on a draft just voids it. Delete only on draft.", uiAnchor: "Cancel / Delete" },
        ],
      },
      {
        heading: "Scan flow (when enabled)",
        body: "If barcode_scanning is enabled, a Scan Barcode / IMEI button appears in the sale draft. Camera opens via html5-qrcode, calls /scan/by-barcode or /scan/by-imei, and pre-fills the draft. When disabled, the scan button is hidden and shows “flag off”. Scanning is phone-camera only (no dedicated hardware assumed).",
        flagNote: "barcode_scanning",
      },
      { heading: "Expected result", body: "Draft becomes completed. /inventory Recent Movements shows SALE (−qty). A sold device goes to status sold and a Warranty appears on /warranty computed as sale_date + warranty_months." },
    ],
    troubleshooting: [
      { q: "“Device status X not sellable”", a: "Only in_stock devices are sellable. Check Devices table status." },
      { q: "Insufficient stock error on Complete", a: "Non-serialized product stock is checked at complete time. Reduce quantity or receive stock via Purchases/Inventory first." },
      { q: "Device already in cart", a: "The same device cannot be added twice. Pick a different serial/IMEI." },
    ],
    nextSlug: "scanning-search",
  },
  {
    slug: "scanning-search",
    order: 9,
    title: "Barcode & IMEI Scanning + Global Search",
    shortTitle: "Scanning & Search",
    description: "Find any unit in one search action — from the header, the POS, or the camera.",
    persona: ["Cashier", "Inventory Clerk"],
    flag: "barcode_scanning",
    estimatedMinutes: 4,
    prerequisites: ["devices", "sales-pos"],
    route: "/devices",
    sections: [
      { heading: "Goal", body: "Type or scan an IMEI, serial, or barcode and jump straight to that device’s full history — purchase → sale → warranty → repairs — per DESIGN.md." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Global header search", detail: "On every dashboard page, use the header search input Search IMEI, serial or barcode… Type a code and press Search. The app tries /scan/by-imei, then by-serial, then by-barcode; on hit it goes to /devices, otherwise to /devices?q=code.", uiAnchor: "Header search bar → Search button (ScanLine icon)" },
          { title: "POS scan", detail: "In New Sale, click Scan Barcode (product mode) or Scan IMEI/Serial (device mode). Allow camera, point at barcode/IMEI. On detection, the draft line item is pre-filled with product or device and price.", uiAnchor: "Sales → New Sale → Scan Barcode / IMEI" },
          { title: "Device history", detail: "After lookup, the matched device shows purchase cost, sale price, buyer, sale date, and warranty status in one view. No manual joins.", uiAnchor: "/devices filtered view" },
          { title: "When scanning is off", detail: "If barcode_scanning flag is disabled, Scan buttons are disabled and header search still works for manual typing. The Intelligence/warranty/return flows still function without scanning.", uiAnchor: "Scan button disabled state ‘flag off’" },
        ],
      },
      { heading: "Hardware note", body: "v1 uses phone camera via html5-qrcode. No dedicated scanner required. If scans are unreliable, report to the admin for hardware review before Phase 8 re-scoping." },
    ],
    troubleshooting: [
      { q: "Scan finds nothing but manual search works", a: "Barcode match is exact. Check for hidden spaces or OCR mismatch on the scanned string. Try pasting the code into the header search." },
      { q: "Camera not starting", a: "The browser must be on HTTPS or localhost and have camera permission. Try a different browser or allow camera in site settings." },
    ],
    nextSlug: "returns-cancellations",
  },
  {
    slug: "returns-cancellations",
    order: 10,
    title: "Returns & Cancellations",
    shortTitle: "Returns & Cancels",
    description: "Return sale items with optional restock, and cancel drafts or completed sales.",
    persona: ["Manager", "Cashier"],
    flag: null,
    estimatedMinutes: 5,
    prerequisites: ["purchases", "sales-pos"],
    route: "/sales",
    sections: [
      { heading: "Goal", body: "Undo mistakes without editing stock directly — returns and cancellations are ledger operations." },
      {
        heading: "Sale returns",
        body: "",
        steps: [
          { title: "Return a completed sale", detail: "In Sales table, click Return on a completed row. A dialog opens: checkbox each Sale Item to return, set Qty and Refund per line (defaults to selling_price − discount), choose Reason (damaged/wrong_item/warranty/other), Refund method (cash/mobile_money/card), toggle Restock (on = return to inventory), and optional Notes. Click Submit Return.", uiAnchor: "Sales → Return → per-item checkboxes / Refund / Reason / Restock → Submit Return" },
          { title: "What happens", detail: "A Return record is created with items. If Restock is checked, movements of type CUSTOMER_RETURN (+qty) are created and non-serialized stock increases; device returns set device status to returned. Refund amount is tracked per return item.", uiAnchor: "Return ledger (type CUSTOMER_RETURN)" },
        ],
      },
      {
        heading: "Cancellations",
        body: "",
        steps: [
          { title: "Cancel a sale", detail: "Click Cancel on a draft (void) or on a completed sale (restock — same as return but for the whole sale). Confirm the prompt.", uiAnchor: "Sales → Cancel" },
          { title: "Cancel a purchase", detail: "On Purchases, only draft rows can be Cancelled (status cancelled, no stock change). Received purchases cannot be cancelled — use Inventory Adjust Out if you must correct.", uiAnchor: "Purchases → Cancel" },
        ],
      },
    ],
    troubleshooting: [
      { q: "Restock did not increase stock", a: "Check that Restock was checked. Device restock sets device.status back from sold; product restock creates CUSTOMER_RETURN movement. Both appear in Recent Movements." },
      { q: "Cannot Return — button missing", a: "Only completed sales have Return. Drafts use Cancel or Delete." },
    ],
    nextSlug: "transfers-locations",
  },
  {
    slug: "transfers-locations",
    order: 11,
    title: "Stock Transfers & Locations",
    shortTitle: "Transfers & Locations",
    description: "Move inventory between branches — stock per location is derived from location-scoped movements.",
    persona: ["Manager", "Inventory Clerk"],
    flag: "multi_location",
    estimatedMinutes: 4,
    prerequisites: ["inventory-ledger"],
    route: "/transfers",
    sections: [
      { heading: "Goal", body: "Model real branches as Locations. Transfers move stock via TRANSFER_OUT / TRANSFER_IN movements so per-location counts stay correct." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Create locations", detail: "Sidebar → Locations (hidden unless multi_location is enabled). Create with Name (e.g., Main Shop, Branch B) and optional address.", uiAnchor: "Locations table → New Location" },
          { title: "Transfer stock", detail: "Sidebar → Transfers. Create with Source Location, Destination, Product, Quantity, and optional Device. Receiving the transfer creates TRANSFER_OUT at source (−qty) and TRANSFER_IN at destination (+qty).", uiAnchor: "Transfers → Source / Destination / Product / Qty" },
          { title: "Verify per-location stock", detail: "Go to Inventory, use Location filter to see stock at each location. The sum across locations equals global stock.", uiAnchor: "Inventory → Location filter" },
        ],
      },
      { heading: "Flag note", body: "If multi_location is disabled, Locations and Transfers nav items are absent — not grayed out. Enabling mid-use adds them immediately; existing ledger data is untouched.", flagNote: "multi_location" },
    ],
    troubleshooting: [{ q: "Transfers nav missing", a: "Ask Platform Admin to enable multi_location for this business." }],
    nextSlug: "warranty",
  },
  {
    slug: "warranty",
    order: 12,
    title: "Warranty — Auto-Created on Device Sale",
    shortTitle: "Warranty",
    description: "Warranty length comes from category defaults, auto-created on device sale, with a full claim flow.",
    persona: ["Manager", "Owner"],
    flag: "warranty",
    estimatedMinutes: 5,
    prerequisites: ["categories-warranty", "sales-pos"],
    route: "/warranty",
    sections: [
      { heading: "Goal", body: "Track warranty validity per-device and resolve claims. Warranty = sale_date + warranty_months using calendar arithmetic." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Set default per category", detail: "In Categories, set default_warranty_months (e.g., 12). This is the default used when selling a device of that category. You can override per line item at sale time via warranty_months_override.", uiAnchor: "Categories → Default warranty (months) · POS Device line → Warranty mo" },
          { title: "Sell triggers warranty", detail: "When a device sale is Completed, one Warranty row is auto-created: device_id, sale_id, warranty_months (override or category default), start_date = sale_date, expires_at = sale_date + warranty_months (calendar-accurate), status active, is_valid computed from now vs expires_at.", uiAnchor: "Sales → Complete (creates Warranty)" },
          { title: "View warranties", detail: "Sidebar → Warranty → Warranties tab. Table shows Device, Months, Start, Expires, Remaining (days), Status (active/expired/void), Valid badge. Near-expiry (<30 days) is warning-colored.", uiAnchor: "Warranty table tabs: Warranties / Claims" },
          { title: "File a claim", detail: "Click New Claim. Choose Warranty or Device (one required), optional Customer, Diagnosis/Problem. Create. Claims appear on Claims tab with Status progression: open → diagnosis → awaiting_approval → approved → resolved → closed (or rejected). Use the Status and Resolution selects inline to advance.", uiAnchor: "New Claim → Warranty/Device selects → Diagnosis → Claims table Status/Resolution selects" },
          { title: "Resolution options", detail: "Resolution enum: repair, replace, reject, refund. Expired flag and days_remaining are computed against the warranty expiry.", uiAnchor: "Resolution select" },
        ],
      },
      { heading: "Flag note", body: "Warranty page and auto-creation are gated on warranty. When disabled, the nav item is fully hidden and Claims API returns 403.", flagNote: "warranty" },
    ],
    troubleshooting: [
      { q: "No warranty created after device sale", a: "Check that the sale line item was a device sale (device_id present) and warranty module is enabled. Product (non-serialized) sales do not create warranties." },
      { q: "Warranty shows expired immediately", a: "The device’s sale may be older, or the category default was 0. Check sale_date and warranty_months." },
    ],
    nextSlug: "repairs",
  },
  {
    slug: "repairs",
    order: 13,
    title: "Repairs — Store & Walk-In Devices",
    shortTitle: "Repairs",
    description: "Run the repair FSM for sold devices and walk-in devices not sold by the shop.",
    persona: ["Manager"],
    flag: "repairs",
    estimatedMinutes: 5,
    prerequisites: ["warranty"],
    route: "/repairs",
    sections: [
      { heading: "Goal", body: "Accept repairs for your sold units and for walk-in devices (device_id nullable → device_description). Drive every repair through the strict state machine." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Open Repairs", detail: "Sidebar → Repairs. Table shows Device, Problem, Technician, Status, Est./Actual, Created. Filter by search and status.", uiAnchor: "Repairs table" },
          { title: "Create a repair", detail: "Click New Repair. Toggle Existing device (select a Device) vs Walk-in. Walk-in requires Device description (model/IMEI as given by customer). Both require Problem description. Optional: Customer, Technician (free text), Estimated cost, Location. Create.", uiAnchor: "New Repair → Existing device / Walk-in → Problem description" },
          { title: "Advance the FSM", detail: "FSM is strictly linear: received → diagnosis → awaiting_parts → repairing → ready_for_pickup → collected. Any non-terminal state can go to cancelled. On the row’s Actions: click the → Next button to go one step forward, or Cancel. Only received and cancelled rows can be Deleted.", uiAnchor: "Actions → → next status / Cancel / Delete" },
          { title: "Device history via repair", detail: "A repair’s device can be found via global IMEI/serial search. Repairs appear alongside warranties and sales under the device’s history.", uiAnchor: "Header search → device history" },
        ],
      },
      { heading: "Flag note", body: "Repairs module is gated on repairs. When disabled, nav item and API are hidden/rejected; existing rows stay in DB unread.", flagNote: "repairs" },
    ],
    troubleshooting: [
      { q: "“Only linear transition allowed”", a: "You must advance one step at a time. Clicking → next status goes to the immediate successor. To cancel, use the Cancel button instead." },
      { q: "Cannot delete a repair", a: "Only received and cancelled repairs are deletable. Advance cancelable repairs to cancelled first." },
    ],
    nextSlug: "dashboard-reports",
  },
  {
    slug: "dashboard-reports",
    order: 14,
    title: "Dashboard, Reports & Intelligence",
    shortTitle: "Dashboard & Reports",
    description: "Today’s operations at a glance, six report suites, and velocity-based stockout forecasts.",
    persona: ["Owner", "Manager"],
    flag: "advanced_reports",
    estimatedMinutes: 6,
    prerequisites: ["inventory-ledger", "sales-pos"],
    route: "/reports",
    sections: [
      { heading: "Dashboard — today", body: "Executive Dashboard shows: Today’s Sales Revenue + count, Today’s Gross Profit (post-COGS), Total Inventory Valuation + product count, Low Stock Attention badge. Below: Stock Reorder & Alert List (urgency sorted, shows velocity/reorder suggestion from intelligence) and Today’s Top Performing Products (units sold + revenue) on the right; Operational Activity Feed timeline (sale/purchase/movement) on the side." },
      {
        heading: "Reports (six tabs)",
        body: "Open Reports via sidebar → Reports. Tabs: Sales & Revenue, Inventory & Valuation, Profit & Loss, Product Performance (best sellers / most profitable / slow-moving), Supplier Analytics, Intelligence. Sales/Profit/Product support date presets (Today / 7 Days / 30 Days / Custom with start/end).",
        steps: [
          { title: "Sales & Revenue", detail: "Total revenue, average order value, items sold, discounts; payment method breakdown (Cash/MoMo/Card); Daily breakdown table." },
          { title: "Inventory & Valuation", detail: "Total/serialized/non-serialized valuation, low/out counts; Category valuation; Inventory table with stock/type/status." },
          { title: "Profit & Loss", detail: "Revenue, COGS, Gross Profit, Margin %, and a P&L statement (discounts · COGS → profit)." },
          { title: "Product Performance", detail: "Top volume, most profitable (margin %), zero-sales/slow-moving with category and cost." },
          { title: "Supplier Analytics", detail: "Total spend, supplier count, per-supplier orders/spent/last purchase." },
          { title: "Intelligence (advanced)", detail: "Velocity = units sold ÷ window. Reorder point = velocity × (lead + safety). Suggested = ceil(velocity × (lead + coverage) − current stock). Controls: window presets 7/14/30/60/90d, lead/safety/coverage, location/category/search/sort (urgency/velocity/stockout). Sorted by urgency (critical/low/stable). Flag-gated on advanced_reports — blocked shows Admin enable callout.", flagNote: "advanced_reports" },
        ],
      },
      { heading: "Dashboard intelligence strip", body: "Dashboard Low Stock list already enriches rows with velocity, stockout estimate, and suggested order qty from /intelligence/overview (window 30, sorted urgency). Use Reports → Intelligence → for full controls and exports." },
    ],
    troubleshooting: [
      { q: "Intelligence says “Advanced Reports disabled”", a: "Platform Admin must enable advanced_reports in Admin → Features. The route returns 403 until then, same pattern as other flags." },
      { q: "No products in Product Performance", a: "Select a wider date range. The 30-day preset may exclude products only sold outside it." },
    ],
    nextSlug: "platform-admin",
  },
  {
    slug: "platform-admin",
    order: 15,
    title: "Platform Admin — Feature Flags & Business Ops",
    shortTitle: "Platform Admin",
    description: "How Bob enables modules per business. Platform-only; not exposed to shop settings.",
    persona: ["Platform Admin"],
    flag: null,
    estimatedMinutes: 4,
    prerequisites: ["quick-start"],
    route: "/admin/features",
    sections: [
      { heading: "Goal", body: "Platform Admin (admin@stagcore.local) toggles feature flags per business via a separate admin panel — never from shop settings, no self-service, no redeploy." },
      {
        heading: "Steps",
        body: "",
        steps: [
          { title: "Sign in as admin", detail: "Log in with admin@stagcore.local. You land on /admin/businesses listing business id/name/slug and feature count.", uiAnchor: "/admin/businesses table" },
          { title: "Open Business Features", detail: "Click Manage Features on a business card. View shows per-feature switches: warranty, repairs, multi_location, barcode_scanning, suppliers, customers, advanced_reports — each with enabled toggle, flag key, and description.", uiAnchor: "Manage Features → feature switches" },
          { title: "Toggle and save", detail: "Flip any switch; POST /business/{id}/features updates immediately. Return to the business’ sidebar — enabled modules appear, disabled ones are fully absent (not grayed out). Their APIs reject with 403 while disabled; rows stay in DB.", uiAnchor: "Switch toggles" },
        ],
      },
      { heading: "Behavior notes", body: "Core flow (Products, Devices, Inventory, Purchases, Sales, Dashboard, basic Reports) is never togglable — it’s the product foundation. Toggling should not require redeploying: flags are read per-request from BusinessFeature, not baked into config. Scope as Admin-only and gated server-side, not just hidden client-side." },
    ],
    troubleshooting: [{ q: "Shop cannot see Repairs after admin enables it", a: "Refresh and confirm JWT role still valid. Sidebar nav renders client-side from /business/{id}/features; a hard refresh after toggle ensures the cached flag map is refetched." }],
    nextSlug: null,
  },
];

export function getTutorial(slug: string): Tutorial | undefined {
  return tutorials.find((t) => t.slug === slug);
}

export function getPrevNext(slug: string): { prev: Tutorial | null; next: Tutorial | null } {
  const idx = tutorials.findIndex((t) => t.slug === slug);
  if (idx === -1) return { prev: null, next: null };
  const ordered = [...tutorials].sort((a, b) => a.order - b.order);
  const pos = ordered.findIndex((t) => t.slug === slug);
  return { prev: ordered[pos - 1] ?? null, next: ordered[pos + 1] ?? null };
}

export const personaOptions = ["All", "Owner", "Manager", "Cashier", "Inventory Clerk", "Platform Admin"] as const;
