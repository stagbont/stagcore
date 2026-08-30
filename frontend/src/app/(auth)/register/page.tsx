"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
          <CardTitle className="text-xl tracking-tight">Create your account</CardTitle>
          <CardDescription>Set up your business in one step</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Doe" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="At least 8 characters" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="business">Business name</Label>
              <Input id="business" autoComplete="organization" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required placeholder="My Gadget Shop" />
            </div>
            {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-critical/20 bg-critical/10 rounded-md p-2">{error}</p>}
            <Button type="submit" disabled={loading} aria-busy={loading} className="w-full">
              {loading ? "Creating account..." : "Create account"}
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
