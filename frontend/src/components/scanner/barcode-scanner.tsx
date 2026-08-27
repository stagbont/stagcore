"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
};

export function BarcodeScanner({ open, onOpenChange, onDetected }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<unknown>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!open) {
      // cleanup
      if (scannerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = scannerRef.current as any;
        try {
          s.stop().catch(() => {});
          s.clear();
        } catch {}
        scannerRef.current = null;
      }
      setActive(false);
      setError("");
      return;
    }
    let cancelled = false;
    async function start() {
      setError("");
      // Prefer native BarcodeDetector if available and supported formats
      const hasNative = typeof window !== "undefined" && "BarcodeDetector" in window;
      if (hasNative) {
        // We still use html5-qrcode as primary for broader format support; native is fallback handled by html5-qrcode
      }
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        if (!ref.current) return;
        const id = ref.current.id;
        const scanner = new Html5Qrcode(id);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 },
          (decoded) => {
            onDetected(decoded);
            onOpenChange(false);
          },
          () => {}
        );
        setActive(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || "Camera failed. Ensure HTTPS and allow camera permission.");
      }
    }
    // Delay to ensure div mounted
    const t = setTimeout(start, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-surface-raised">
        <DialogHeader>
          <DialogTitle>Scan Barcode / IMEI</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div id="stagcore-scanner" ref={ref} className="w-full min-h-[260px] rounded-md border border-hairline bg-canvas overflow-hidden" />
          {error && <p className="text-sm text-[var(--status-critical)] border border-hairline rounded-md p-2 bg-surface">{error}</p>}
          {!active && !error && <p className="text-sm text-muted-foreground">Requesting camera… allow permission and point at barcode.</p>}
          {active && <p className="text-xs text-muted-foreground">Point camera at barcode / IMEI. Keep steady. Press close when done.</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-11">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
