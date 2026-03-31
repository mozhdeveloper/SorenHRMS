"use client";

import { useEffect } from "react";
import { hydrateAllStores, startWriteThrough } from "@/services/sync.service";

/**
 * Kiosk layout — initialises Supabase sync so the kiosk always has current
 * employee data and any offline events are written through once connectivity
 * is available.
 *
 * hydrateAllStores() + startWriteThrough() are normally called on user login
 * (client-layout.tsx).  The kiosk routes bypass the normal auth flow, so we
 * call them here instead.
 *
 * Both calls are non-blocking and no-ops in demo mode
 * (NEXT_PUBLIC_DEMO_MODE === "true").
 */
export default function KioskLayout({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        hydrateAllStores().then(() => {
            startWriteThrough();
        });
    }, []);

    return <>{children}</>;
}
