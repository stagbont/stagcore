"use client";

import * as React from "react";
import { useSession } from "@/lib/auth-client";
import { API_URL, fetchWithAuth } from "@/lib/fetch-with-auth";

type Business = { id: string; name: string; slug: string };

type FeatureEntry = { feature_key: string; enabled: boolean };

type Membership = { business_id: string; role: string };

type BusinessState = {
  business: Business | null;
  features: Record<string, boolean>;
  role: string | null;
  memberships: Membership[];
  loading: boolean;
  error: string | null;
};

type BusinessActions = {
  refresh: () => Promise<void>;
};

type BusinessMeta = {
  isAdminEmail: boolean;
  currentRole: string | null;
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
    role: null,
    memberships: [],
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
        setState({ business: null, features: {}, role: null, memberships: [], loading: false, error: text });
        return;
      }
      const businesses = (await bizRes.json()) as Business[];
      if (!businesses.length) {
        setState({ business: null, features: {}, role: null, memberships: [], loading: false, error: null });
        return;
      }
      const business = businesses[0];

      // Fetch memberships/role via auth session
      let memberships: Membership[] = [];
      let role: string | null = null;
      try {
        const sessRes = await fetchWithAuth("/api/v1/auth/session", token);
        if (sessRes.ok) {
          const sessData = (await sessRes.json()) as { memberships?: Membership[] };
          memberships = sessData.memberships ?? [];
          const match = memberships.find((m) => m.business_id === business.id);
          role = match?.role ?? (memberships[0]?.role ?? null);
        }
      } catch {
        // ignore, role stays null
      }

      // Platform admin or missing business: features fetch is secondary
      const featRes = await fetchWithAuth(`/api/v1/business/${business.id}/features`, token);
      if (!featRes.ok) {
        // If features fetch fails (e.g. 403), keep business but empty features
        setState({ business, features: {}, role, memberships, loading: false, error: null });
        return;
      }
      const data = (await featRes.json()) as { features: FeatureEntry[] };
      const features: Record<string, boolean> = {};
      for (const f of data.features ?? []) features[f.feature_key] = f.enabled;
      setState({ business, features, role, memberships, loading: false, error: null });
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
      meta: { isAdminEmail, currentRole: state.role },
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

export function useCurrentRole(): string | null {
  const ctx = React.useContext(BusinessContext);
  return ctx?.state.role ?? ctx?.meta.currentRole ?? null;
}

export function hasRole(role: string | null, allowed: string[]): boolean {
  if (!role) return false;
  return allowed.includes(role);
}
