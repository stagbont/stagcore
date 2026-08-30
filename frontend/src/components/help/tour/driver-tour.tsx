"use client";

import { useCallback } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

export type TourId = "quick-start" | "inventory-ledger" | "sales-pos";

const tours: Record<TourId, DriveStep[]> = {
  "quick-start": [
    { element: '[data-tour="dashboard-kpis"]', popover: { title: "Today at a glance", description: "Revenue, profit, valuation, and low-stock counts update live as sales and purchases happen.", side: "bottom" } },
    { element: '[data-tour="dashboard-reorder"]', popover: { title: "Reorder list", description: "Urgency-sorted by velocity forecast. Tap Intelligence → for full forecasts.", side: "top" } },
    { element: '[data-tour="global-search"]', popover: { title: "Global IMEI search", description: "Type any IMEI, serial, or barcode here — one search jumps to that device’s full history.", side: "bottom" } },
  ],
  "inventory-ledger": [
    { element: '[data-tour="stock-levels"]', popover: { title: "Stock is derived", description: "Current stock = sum of movements. Nothing is edited directly — every row here comes from the ledger.", side: "top" } },
    { element: '[data-tour="adjust-stock"]', popover: { title: "Adjust stock", description: "Receive, Sell, Adjust In/Out all create a ledger row. Pick product, action, quantity, optional location, and Apply.", side: "left" } },
    { element: '[data-tour="recent-movements"]', popover: { title: "Recent movements", description: "Last 20 ledger entries. Each adjust appears here as PURCHASE, SALE, or ADJUSTMENT.", side: "top" } },
  ],
  "sales-pos": [
    { element: '[data-tour="new-sale-btn"]', popover: { title: "Start a sale", description: "Click New Sale to open the draft dialog. Add customer (or quick-add) and payment method.", side: "bottom" } },
    { element: '[data-tour="sale-items"]', popover: { title: "Add items", description: "Product mode: qty stepper. Device mode: picker by serial/IMEI (qty is always 1, warranty override optional).", side: "top" } },
    { element: '[data-tour="sales-table"]', popover: { title: "Complete the sale", description: "Create Draft then Complete — stock deduction and device sold + warranty creation happen atomically.", side: "top" } },
  ],
};

export function useTour(tourId: TourId) {
  const start = useCallback(() => {
    const steps = tours[tourId];
    if (!steps?.length) return;
    // Filter to elements currently in DOM
    const available = steps.filter((s) => {
      const sel = s.element as string | undefined;
      return !sel || !!document.querySelector(sel);
    });
    if (!available.length) return;
    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: "rgba(0,0,0,0.55)",
      stagePadding: 6,
      steps: available,
      onDestroyed: () => {
        try { localStorage.setItem(`tour:${tourId}:done`, "1"); } catch {}
      },
    });
    d.drive();
  }, [tourId]);
  return { start };
}
