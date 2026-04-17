"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useAuthStore } from "@/store/auth.store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
    Sun, Moon, Monitor, Palette, Bell, Lock, Eye, EyeOff, KeyRound,
    Smartphone, Check,
} from "lucide-react";
import { toast } from "sonner";
import { PushNotificationPrompt } from "@/components/push-notification-prompt";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   EMPLOYEE VIEW — Personal Preferences Only
   Theme, notification prefs, push, password change
   ═══════════════════════════════════════════════════════════════ */

const defaultPrefs = { emailAbsenceAlerts: true, emailLeaveUpdates: true, emailPayrollAlerts: true };
function readNotifPrefs() {
    if (typeof window === "undefined") return defaultPrefs;
    try {
        const s = localStorage.getItem("sdsi-org-settings");
        if (s) {
            const p = JSON.parse(s);
            return {
                emailAbsenceAlerts: p.emailAbsenceAlerts ?? true,
                emailLeaveUpdates: p.emailLeaveUpdates ?? true,
                emailPayrollAlerts: p.emailPayrollAlerts ?? true,
            };
        }
    } catch { /* ignore */ }
    return defaultPrefs;
}

function useNotificationPrefs() {
    const [prefs, setPrefs] = useState(readNotifPrefs);
    const update = (patch: Partial<typeof prefs>) => {
        setPrefs((prev) => {
            const next = { ...prev, ...patch };
            const stored = localStorage.getItem("sdsi-org-settings");
            const full = stored ? { ...JSON.parse(stored), ...next } : next;
            localStorage.setItem("sdsi-org-settings", JSON.stringify(full));
            return next;
        });
    };
    return { prefs, update };
}

/* ─── Section nav items ────────────────────────────────────── */
const SECTIONS = [
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "push", label: "Push Notifications", icon: Smartphone },
    { id: "security", label: "Security", icon: Lock },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function EmployeeSettingsView() {
    const { theme, setTheme, currentUser, changePassword } = useAuthStore();
    const { prefs, update } = useNotificationPrefs();

    const [pwOld, setPwOld] = useState("");
    const [pwNew, setPwNew] = useState("");
    const [pwConfirm, setPwConfirm] = useState("");
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [activeSection, setActiveSection] = useState<SectionId>("appearance");

    const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
        appearance: null,
        notifications: null,
        push: null,
        security: null,
    });

    // Intersection observer — highlight the section currently in viewport
    useEffect(() => {
        const refs = sectionRefs.current;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id as SectionId);
                    }
                }
            },
            { rootMargin: "-20% 0px -60% 0px", threshold: 0.1 },
        );
        Object.values(refs).forEach((el) => el && observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const scrollTo = (id: SectionId) => {
        sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const handleChangePassword = () => {
        if (pwNew.length < 6) { toast.error("Password must be at least 6 characters."); return; }
        if (pwNew !== pwConfirm) { toast.error("Passwords do not match."); return; }
        const result = changePassword(currentUser.id, pwOld, pwNew);
        if (!result.ok) { toast.error(result.error); return; }
        toast.success("Password changed successfully.");
        setPwOld(""); setPwNew(""); setPwConfirm("");
    };

    const passwordReady = pwOld.length > 0 && pwNew.length >= 6 && pwConfirm.length > 0;

    return (
        <div className="w-full max-w-5xl px-4 py-8">
            {/* Page header */}
            <div className="mb-8 lg:mb-10">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-1.5">Manage your personal preferences</p>
                <Separator className="mt-6" />
            </div>

            <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
                {/* ─── Sidebar nav (desktop sticky, mobile horizontal scroll) ── */}
                <nav className="lg:w-48 shrink-0">
                    <div className="lg:sticky lg:top-6">
                        <ul className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
                            {SECTIONS.map((s) => {
                                const Icon = s.icon;
                                const isActive = activeSection === s.id;
                                return (
                                    <li key={s.id}>
                                        <button
                                            onClick={() => scrollTo(s.id)}
                                            className={cn(
                                                "flex items-center gap-3 w-full whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                                isActive
                                                    ? "bg-accent/50 text-foreground font-semibold"
                                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                                            )}
                                        >
                                            <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                                            {s.label}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </nav>

                {/* ─── Main content ─────────────────────────────────────── */}
                <div className="flex-1 min-w-0 space-y-12 pb-16 max-w-4xl">

                    {/* ── Appearance ─────────────────────────────────────── */}
                    <section id="appearance" ref={(el) => { sectionRefs.current.appearance = el; }} className="scroll-mt-8">
                        <SectionHeader icon={Palette} title="Appearance" description="Customize how the app looks" />
                        <Card className="border-border/60 shadow-sm">
                            <CardContent className="p-6">
                                <p className="text-sm font-medium mb-1">Theme</p>
                                <p className="text-xs text-muted-foreground mb-4">Choose your preferred color scheme</p>
                                <div className="grid grid-cols-3 gap-3 max-w-md">
                                    {([
                                        { value: "light" as const, icon: Sun, label: "Light", desc: "Bright and clean" },
                                        { value: "dark" as const, icon: Moon, label: "Dark", desc: "Easy on the eyes" },
                                        { value: "system" as const, icon: Monitor, label: "System", desc: "Match your OS" },
                                    ]).map((t) => {
                                        const selected = theme === t.value;
                                        return (
                                            <button
                                                key={t.value}
                                                onClick={() => { setTheme(t.value); toast.success(`Theme set to ${t.label}`); }}
                                                className={cn(
                                                    "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:shadow-sm",
                                                    selected
                                                        ? "border-primary bg-primary/5 shadow-sm"
                                                        : "border-border/60 hover:border-border",
                                                )}
                                            >
                                                {selected && (
                                                    <span className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
                                                        <Check className="h-3 w-3" />
                                                    </span>
                                                )}
                                                <span className={cn("rounded-lg p-2.5", selected ? "bg-primary/10" : "bg-muted")}>
                                                    <t.icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
                                                </span>
                                                <span className="text-sm font-medium">{t.label}</span>
                                                <span className="text-[11px] text-muted-foreground leading-tight hidden sm:block">{t.desc}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* ── Notifications ──────────────────────────────────── */}
                    <section id="notifications" ref={(el) => { sectionRefs.current.notifications = el; }} className="scroll-mt-8">
                        <SectionHeader icon={Bell} title="Notifications" description="Control which alerts you receive" />
                        <Card className="border-border/60 shadow-sm">
                            <CardContent className="p-6 space-y-0 divide-y divide-border/60">
                                {([
                                    { key: "emailAbsenceAlerts" as const, label: "Absence alerts", desc: "Get notified when you are marked absent" },
                                    { key: "emailLeaveUpdates" as const, label: "Leave updates", desc: "Get notified when your leave request is approved or rejected" },
                                    { key: "emailPayrollAlerts" as const, label: "Payroll alerts", desc: "Get notified when new payslips are published" },
                                ]).map((n) => (
                                    <div key={n.key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">{n.label}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
                                        </div>
                                        <Switch
                                            checked={prefs[n.key]}
                                            onCheckedChange={(checked) => {
                                                update({ [n.key]: checked });
                                                toast.success(`${n.label} ${checked ? "enabled" : "disabled"}`);
                                            }}
                                        />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </section>

                    {/* ── Push Notifications ─────────────────────────────── */}
                    <section id="push" ref={(el) => { sectionRefs.current.push = el; }} className="scroll-mt-8">
                        <SectionHeader icon={Smartphone} title="Push Notifications" description="Receive real-time alerts on your device" />
                        <Card className="border-border/60 shadow-sm">
                            <CardContent className="p-6">
                                <PushNotificationPrompt variant="inline" className="w-full justify-start" />
                                <p className="text-xs text-muted-foreground mt-3">
                                    Enable push notifications to receive instant alerts even when the app is closed.
                                </p>
                            </CardContent>
                        </Card>
                    </section>

                    {/* ── Security ───────────────────────────────────────── */}
                    <section id="security" ref={(el) => { sectionRefs.current.security = el; }} className="scroll-mt-8">
                        <SectionHeader icon={Lock} title="Security" description="Manage your account password" />
                        <Card className="border-border/60 shadow-sm">
                            <CardContent className="p-6">
                                <div className="grid gap-5 sm:max-w-md">
                                    {/* Current password */}
                                    <div className="space-y-1.5">
                                        <label htmlFor="pw-old" className="text-sm font-medium">Current Password</label>
                                        <div className="relative">
                                            <Input
                                                id="pw-old"
                                                type={showOld ? "text" : "password"}
                                                value={pwOld}
                                                onChange={(e) => setPwOld(e.target.value)}
                                                placeholder="Enter current password"
                                                autoComplete="current-password"
                                            />
                                            <button
                                                type="button"
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                onClick={() => setShowOld((v) => !v)}
                                                tabIndex={-1}
                                            >
                                                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <Separator />

                                    {/* New password */}
                                    <div className="space-y-1.5">
                                        <label htmlFor="pw-new" className="text-sm font-medium">New Password</label>
                                        <div className="relative">
                                            <Input
                                                id="pw-new"
                                                type={showNew ? "text" : "password"}
                                                value={pwNew}
                                                onChange={(e) => setPwNew(e.target.value)}
                                                placeholder="Min. 6 characters"
                                                autoComplete="new-password"
                                            />
                                            <button
                                                type="button"
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                onClick={() => setShowNew((v) => !v)}
                                                tabIndex={-1}
                                            >
                                                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        {pwNew.length > 0 && pwNew.length < 6 && (
                                            <p className="text-xs text-destructive">Must be at least 6 characters</p>
                                        )}
                                    </div>

                                    {/* Confirm password */}
                                    <div className="space-y-1.5">
                                        <label htmlFor="pw-confirm" className="text-sm font-medium">Confirm New Password</label>
                                        <Input
                                            id="pw-confirm"
                                            type="password"
                                            value={pwConfirm}
                                            onChange={(e) => setPwConfirm(e.target.value)}
                                            placeholder="Re-enter new password"
                                            autoComplete="new-password"
                                        />
                                        {pwConfirm.length > 0 && pwNew !== pwConfirm && (
                                            <p className="text-xs text-destructive">Passwords do not match</p>
                                        )}
                                    </div>

                                    <Button
                                        onClick={handleChangePassword}
                                        disabled={!passwordReady}
                                        className="w-full sm:w-auto"
                                    >
                                        <KeyRound className="w-4 h-4 mr-1.5" />
                                        Update Password
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </section>
                </div>
            </div>
        </div>
    );
}

/* ─── Reusable section header ──────────────────────────────── */
function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
    return (
        <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight items-center flex gap-2">
                <Icon className="h-5 w-5 text-muted-foreground mr-1" />
                {title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 ml-8">{description}</p>
        </div>
    );
}
