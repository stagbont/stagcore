"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Step 1: Create user via Better Auth
    const signUpRes = await authClient.signUp.email({ email, password, name });
    if (signUpRes.error) {
      setError(signUpRes.error.message || "Registration failed");
      setLoading(false);
      return;
    }

    // Step 2: Create business via backend (user now exists in shared DB)
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, business_name: businessName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // If business already exists or user already has one, just proceed to login
        if (res.status !== 409) {
          setError(data.detail || "Failed to create business");
          setLoading(false);
          return;
        }
      }
    } catch {
      setError("Failed to create business — is the backend running?");
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-[var(--shadow-low)]">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">S</div>
            <span className="text-sm font-semibold tracking-tight">Stagcore</span>
          </div>
          <CardTitle className="text-xl tracking-tight text-pretty">Create your account</CardTitle>
          <CardDescription>Set up your business in one step</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="Your name" htmlFor="register-name" required>
              <Input id="register-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Jane Doe…" />
            </Field>
            <Field label="Email" htmlFor="register-email" required>
              <Input id="register-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="e.g. you@example.com…" aria-invalid={!!error} />
            </Field>
            <Field label="Password" htmlFor="register-password" required hint="At least 8 characters">
              <Input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="At least 8 characters…" aria-invalid={!!error} />
            </Field>
            <Field label="Business name" htmlFor="register-business" required>
              <Input id="register-business" autoComplete="organization" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required placeholder="e.g. My Gadget Shop…" />
            </Field>
            {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-critical/20 bg-critical/10 rounded-md p-2">{error}</p>}
            <Button type="submit" disabled={loading} aria-busy={loading} className="w-full min-h-11">
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
