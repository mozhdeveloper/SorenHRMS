"use client";

import { useAuthStore } from "@/store/auth.store";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/types";

const VALID_ROLES: Role[] = ["admin", "hr", "finance", "employee", "supervisor", "payroll_admin", "auditor"];

function RoleLoadingState() {
    return (
        <div className="flex items-center justify-center h-[60vh]">
            <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
        </div>
    );
}

export default function RoleLayout({ children }: { children: React.ReactNode }) {
    const { role: urlRole } = useParams<{ role: string }>();
    const userRole = useAuthStore((s) => s.currentUser.role);
    const router = useRouter();
    const pathname = usePathname();
    const [mounting, setMounting] = useState(true);

    const isValidRole = VALID_ROLES.includes(urlRole as Role);

    useEffect(() => {
        setMounting(false);
    }, []);

    useEffect(() => {
        if (mounting) return;
        if (!isValidRole) {
            router.replace(`/${userRole}/dashboard`);
            return;
        }
        if (urlRole !== userRole) {
            // Redirect to correct role prefix, preserving sub-path
            const subPath = pathname.replace(`/${urlRole}`, "");
            router.replace(`/${userRole}${subPath}`);
        }
    }, [urlRole, userRole, isValidRole, router, pathname, mounting]);

    // Show loading state while mounting or when role mismatch is being resolved
    if (mounting || !isValidRole || urlRole !== userRole) {
        return <RoleLoadingState />;
    }

    return <>{children}</>;
}
