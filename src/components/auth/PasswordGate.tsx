"use client";

import { useState, useEffect, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Eye, EyeOff } from 'lucide-react';

// Password hash (SHA-256 of the password)
// To generate: echo -n "your-password" | openssl dgst -sha256
// Set via build-time env var: NEXT_PUBLIC_SITE_PASSWORD_HASH
const PASSWORD_HASH = process.env.NEXT_PUBLIC_SITE_PASSWORD_HASH || '';

// Session storage key
const AUTH_STORAGE_KEY = 'hypnoraffle_auth';
const AUTH_EXPIRY_HOURS = 24;

interface PasswordGateProps {
  children: ReactNode;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredAuth(): { authenticated: boolean; expiry: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function setStoredAuth(): void {
  if (typeof window === 'undefined') return;
  const expiry = Date.now() + AUTH_EXPIRY_HOURS * 60 * 60 * 1000;
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ authenticated: true, expiry }));
}

function clearStoredAuth(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function PasswordGate({ children }: PasswordGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Check if already authenticated
  useEffect(() => {
    // If no password hash is set, allow access (for development)
    if (!PASSWORD_HASH) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    const stored = getStoredAuth();
    if (stored && stored.authenticated && stored.expiry > Date.now()) {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('Please enter the password');
      return;
    }

    const hash = await hashPassword(password.trim());
    
    if (hash === PASSWORD_HASH) {
      setStoredAuth();
      setIsAuthenticated(true);
    } else {
      setError('Incorrect password');
      setPassword('');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">HypnoRaffle</CardTitle>
          <CardDescription>Enter the password to access this site</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button type="submit" className="w-full">
              Enter Site
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Export a hook to check auth status and logout
export function usePasswordAuth() {
  const logout = () => {
    clearStoredAuth();
    window.location.reload();
  };

  return { logout };
}
