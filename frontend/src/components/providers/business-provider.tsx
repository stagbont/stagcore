"use client";

import * as React from "react";
import { useSession } from "@/lib/auth-client";
import { API_URL, fetchWithAuth } from "@/lib/fetch-with-auth";

type Business = { id: string; name: string; slug: string };

type FeatureEntry = { feature_key: string; enabled: boolean };

type BusinessState = {
  business: Business | null;
  features: Record<string, boolean>;
  loading: boolean;
  error: string | null;
};

type BusinessActions = {
  refresh: () => Promise<void>;
};

type BusinessMeta = {
  isAdminEmail: boolean;
};

type BusinessContextValue = {
  state: BusinessState;
  actions: BusinessActions;
  meta: BusinessMeta;
};

// Context interface per vercel-composition-patterns state-context-interface
const BusinessContext = React.createContext<BusinessContextValue | null>(null);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  const token = React.useMemo(() => {
    const s = session as unknown as { session?: { token?: string } } | null | undefined;
    return s?.session?.token ?? "";
  }, [session]);

  const isAdminEmail = React.useMemo(
    () => (session?.user?.email || "").toLowerCase() === "admin@stagcore.local",
    [session]
  );

  const [state, setState] = React.useState<BusinessState>({
    business: null,
    features: {},
    loading: true,
    error: null,
  });

  const refresh = React.useCallback(async () => {
    if (!token || !session?.user) {
      setState((prev) => ({ ...prev, loading: false, error: null }));
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const bizRes = await fetchWithAuth("/api/v1/business/", token);
      if (!bizRes.ok) {
        const text = await bizRes.text();
        setState({ business: null, features: {}, loading: false, error: text });
        return;
      }
      const businesses = (await bizRes.json()) as Business[];
      if (!businesses.length) {
        setState({ business: null, features: {}, loading: false, error: null });
        return;
      }
      const business = businesses[0];

      // Platform admin or missing business: features fetch is secondary
      const featRes = await fetchWithAuth(`/api/v1/business/${business.id}/features`, token);
      if (!featRes.ok) {
        // If features fetch fails (e.g. 403), keep business but empty features
        setState({ business, features: {}, loading: false, error: null });
        return;
      }
      const data = (await featRes.json()) as { features: FeatureEntry[] };
      const features: Record<string, boolean> = {};
      for (const f of data.features ?? []) features[f.feature_key] = f.enabled;
      setState({ business, features, loading: false, error: null });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, [token, session]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const value = React.useMemo<BusinessContextValue>(
    () => ({
      state,
      actions: { refresh },
      meta: { isAdminEmail },
    }),
    [state, refresh, isAdminEmail]
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): BusinessContextValue {
  const ctx = React.useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used within BusinessProvider");
  return ctx;
}

export function useBusinessOptional(): BusinessContextValue | null {
  return React.useContext(BusinessContext);
}

// Convenience hook for callers that only need the token + business id
export function useBusinessId(): string | null {
  const ctx = React.useContext(BusinessContext);
  return ctx?.state.business?.id ?? null;
}
