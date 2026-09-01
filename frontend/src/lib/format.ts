// Shared formatters — dedupes dashboard/reports logic per plan §4.3.
// Uses Intl.* per Web Interface Guidelines (locale & i18n), falls back to plain text.

export function formatCurrency(val?: string | number | null): string {
  if (val === undefined || val === null || val === "") return "GH₵0.00";
  const n = typeof val === "number" ? val : parseFloat(String(val));
  if (Number.isNaN(n)) return "GH₵0.00";
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `GH₵${n.toFixed(2)}`;
  }
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return iso;
  }
}

export function formatVelocity(val?: string | number | null): string {
  if (val === undefined || val === null || val === "") return "—";
  const n = typeof val === "number" ? val : parseFloat(String(val));
  if (Number.isNaN(n) || n === 0) return "stable";
  return `${n.toFixed(2)}/d`;
}

export function formatStockoutLabel(
  item?: { days_until_stockout?: number | null; estimated_stockout_date?: string | null; stock_status?: string } | null
): string | null {
  if (!item) return null;
  if (item.stock_status === "stable") return "Stable · no recent sales";
  if (item.days_until_stockout === null || item.days_until_stockout === undefined) return null;
  if (item.days_until_stockout === 0) return "Stockout today";
  if (item.days_until_stockout === 1) return "1 day left";
  if (item.estimated_stockout_date) {
    try {
      return `${item.days_until_stockout}d · ${new Date(item.estimated_stockout_date).toLocaleDateString()}`;
    } catch {
      return `${item.days_until_stockout}d`;
    }
  }
  return `${item.days_until_stockout}d`;
}

export function formatVelocityDay(val?: string | number | null): string {
  if (val === undefined || val === null || val === "") return "—";
  const n = typeof val === "number" ? val : parseFloat(String(val));
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}/day`;
}

export function formatStockoutShort(days?: number | null, dateStr?: string | null): string {
  if (days === null || days === undefined) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  const d = dateStr ? new Date(dateStr).toLocaleDateString() : "";
  return `${days}d${d ? ` · ${d}` : ""}`;
}
