"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message || "Login failed");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">S</div>
            <span className="text-sm font-semibold tracking-tight">Stagcore</span>
          </div>
          <CardTitle className="text-xl tracking-tight text-pretty">Sign in to Stagcore</CardTitle>
          <CardDescription>Enter your email and password to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="Email" htmlFor="email" required>
              <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="e.g. you@example.com…" aria-invalid={!!error} />
            </Field>
            <Field label="Password" htmlFor="password" required>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••…" aria-invalid={!!error} />
            </Field>
            {error && <p role="alert" aria-live="polite" className="text-sm text-[var(--status-critical)] border border-critical/20 bg-critical/10 rounded-md p-2">{error}</p>}
            <Button type="submit" disabled={loading} aria-busy={loading} className="w-full min-h-11">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
