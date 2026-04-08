"use client";

import { ThemeProvider } from "@/components/shell/theme-provider";
import { AppShell } from "@/components/shell/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { useEffect, useState } from "react";
import { createClient, clearAuthStorage, resetClient } from "@/services/supabase-browser";
import { hydrateAllStores, startWriteThrough, startRealtime, stopRealtime, stopWriteThrough } from "@/services/sync.service";

function AppLoadingScreen() {
    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
        </div>
    );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        if (!isAuthenticated && pathname !== "/login") {
            // Hard navigation so the middleware re-evaluates cookies cleanly
            window.location.href = "/login";
        }
    }, [mounted, isAuthenticated, pathname]);

    // Sync stores with Supabase when authenticated (handles page refresh).
    // Also listens for Supabase auth events to handle invalid/expired tokens.
    useEffect(() => {
        if (!mounted || !isAuthenticated) return;

        const supabase = createClient();

        // Handle auth errors that may occur during token refresh
        const handleAuthError = (error: Error | null) => {
            if (!error) return;
            const isRefreshError = 
                error.message?.includes("Refresh Token") ||
                (error as { code?: string }).code === "refresh_token_not_found";
            if (isRefreshError) {
                console.warn("[Auth] Refresh token error — logging out:", error.message);
                clearAuthStorage();
                resetClient();
                stopRealtime();
                stopWriteThrough();
                useAuthStore.getState().logout();
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: import("@supabase/supabase-js").Session | null) => {
            // TOKEN_REFRESHED with no session = refresh token was invalid
            // SIGNED_OUT = explicit logout or server-side session termination
            const shouldSignOut =
                event === "SIGNED_OUT" ||
                (event === "TOKEN_REFRESHED" && !session);

            if (shouldSignOut) {
                console.info("[Auth] Session ended:", event);
                clearAuthStorage();
                resetClient();
                stopRealtime();
                stopWriteThrough();
                useAuthStore.getState().logout();
            }
        });

        // Verify current session is valid
        supabase.auth.getSession().then(({ error }: { error: Error | null }) => handleAuthError(error));

        hydrateAllStores().then(() => {
            startWriteThrough();
            startRealtime();
        });

        return () => {
            subscription.unsubscribe();
            stopRealtime();
        };
    }, [mounted, isAuthenticated]);

    const isLoginPage = pathname === "/login";
    const isRoot      = pathname === "/";
    const isKiosk     = pathname === "/kiosk" || pathname.startsWith("/kiosk/");
    const skipShell   = isLoginPage || isRoot || isKiosk;

    // Show spinner until React has mounted on the client (prevents hydration mismatch)
    if (!mounted) return <AppLoadingScreen />;

    // Show spinner while the unauthenticated redirect is in-flight
    if (!isAuthenticated && !isLoginPage) return <AppLoadingScreen />;

    return (
        <TooltipProvider>
            <ThemeProvider>
                {skipShell ? children : <AppShell>{children}</AppShell>}
            </ThemeProvider>
        </TooltipProvider>
    );
}
