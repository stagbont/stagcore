"use client";

import * as React from "react";
import { useBusiness } from "@/components/providers/business-provider";

/**
 * FeatureGuard — compound guard per vercel-composition-patterns.
 * Omit (return null) when the business has the feature disabled.
 * Mirrors server-side enforcement: disabled modules are absent, not grayed.
 *
 * Usage:
 *   <FeatureGuard feature="barcode_scanning" fallback={<p>Scanning disabled</p>}>
 *     <ScanButton />
 *   </FeatureGuard>
 */
export function FeatureGuard({
  feature,
  fallback = null,
  children,
}: {
  feature: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { state } = useBusiness();
  const enabled = Boolean(state.features[feature]);

  // While loading, avoid flashing fallback; render nothing (sidebar skeletons handle this)
  if (state.loading) return null;

  if (!enabled) return <>{fallback}</>;
  return <>{children}</>;
}

export function useFeatureEnabled(feature: string): boolean {
  const { state } = useBusiness();
  return Boolean(state.features[feature]);
}
