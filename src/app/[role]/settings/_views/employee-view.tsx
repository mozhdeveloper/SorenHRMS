"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
    Sun, Moon, Monitor, Palette, Bell, Lock, Eye, EyeOff, KeyRound,
    Smartphone, Check, User, Mail, Phone, Calendar, MapPin,
    AlertCircle, RefreshCw, Loader2, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PushNotificationPrompt } from "@/components/push-notification-prompt";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   EMPLOYEE VIEW — Personal Preferences Only
   Theme, notification prefs, push, profile, password change
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
    { id: "profile", label: "My Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "push", label: "Push Notifications", icon: Smartphone },
    { id: "security", label: "Security", icon: Lock },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const CHANNEL_LABELS: Record<string, string> = {
    in_app: "In-App",
    email: "Email",
    whatsapp: "WhatsApp",
    sms: "SMS",
};

export default function EmployeeSettingsView() {
    const { theme, setTheme, currentUser, changePassword } = useAuthStore();
    const { prefs, update } = useNotificationPrefs();

    /* Password */
    const [pwOld, setPwOld] = useState("");
    const [pwNew, setPwNew] = useState("");
    const [pwConfirm, setPwConfirm] = useState("");
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [pwLoading, setPwLoading] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);

    /* Profile */
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);
    const [phone, setPhone] = useState("");
    const [birthday, setBirthday] = useState("");
    const [address, setAddress] = useState("");
    const [emergencyContact, setEmergencyContact] = useState("");
    const [preferredChannel, setPreferredChannel] = useState("in_app");
    const [whatsappNumber, setWhatsappNumber] = useState("");

    const [activeSection, setActiveSection] = useState<SectionId>("appearance");

    // Load profile fields when section becomes active
    useEffect(() => {
        if (activeSection !== "profile") return;
        setProfileLoading(true);
        fetch("/api/settings/profile")
            .then((r) => r.json())
            .then((d) => {
                if (!d.error) {
                    setPhone(d.phone ?? "");
                    setBirthday(d.birthday ?? "");
                    setAddress(d.address ?? "");
                    setEmergencyContact(d.emergency_contact ?? "");
                    setPreferredChannel(d.preferred_channel ?? "in_app");
                    setWhatsappNumber(d.whatsapp_number ?? "");
                }
            })
            .catch(() => { /* offline / demo mode – silently ignore */ })
            .finally(() => setProfileLoading(false));
    }, [activeSection]);

    const handleSaveProfile = async () => {
        setProfileSaving(true);
        try {
            const res = await fetch("/api/settings/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: phone || null,
                    birthday: birthday || null,
                    address: address || null,
                    emergency_contact: emergencyContact || null,
                    preferred_channel: preferredChannel || null,
                    whatsapp_number: whatsappNumber || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error ?? "Failed to save profile"); return; }
            toast.success("Profile updated successfully.");
        } catch {
            toast.error("Could not save profile. Check your connection.");
        } finally {
            setProfileSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (pwNew.length < 8) { toast.error("New password must be at least 8 characters."); return; }
        if (pwNew !== pwConfirm) { toast.error("Passwords do not match."); return; }
        setPwLoading(true);
        try {
            // Try real Supabase API first
            const res = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newPassword: pwNew }),
            });
            const data = await res.json();
            if (!res.ok) {
                // Fallback to demo store (local dev / demo mode)
                const result = changePassword(currentUser.id, pwOld, pwNew);
                if (!result.ok) { toast.error(result.error ?? data.error); return; }
            }
            toast.success("Password changed successfully.");
            setPwOld(""); setPwNew(""); setPwConfirm("");
        } catch {
            // Offline / demo mode — fall back to local store
            const result = changePassword(currentUser.id, pwOld, pwNew);
            if (!result.ok) { toast.error(result.error ?? "Failed to update password"); return; }
            toast.success("Password changed (demo mode).");
            setPwOld(""); setPwNew(""); setPwConfirm("");
        } finally {
            setPwLoading(false);
        }
    };

    const handleResetPassword = async () => {
        setResetLoading(true);
        try {
            const res = await fetch("/api/auth/reset-password", { method: "POST" });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error ?? "Could not send reset email"); return; }
            toast.success(`Password reset email sent to ${currentUser.email}`);
        } catch {
            toast.error("Could not send reset email. Try again.");
        } finally {
            setResetLoading(false);
        }
    };

    const passwordReady = pwOld.length > 0 && pwNew.length >= 8 && pwConfirm.length > 0;

    const ActiveIcon = SECTIONS.find(s => s.id === activeSection)?.icon || Palette;
    const activeLabel = SECTIONS.find(s => s.id === activeSection)?.label || "Settings";

    const sectionDesc: Record<SectionId, string> = {
        appearance: "Choose your preferred color scheme",
        profile: "Update your contact details and preferences",
        notifications: "Control which alerts you receive",
        push: "Receive real-time alerts on your device",
        security: "Manage your account password",
    };

    return (
        <div className="w-full max-w-5xl px-4 py-8">
            {/* Page header */}
            <div className="mb-6 lg:mb-8">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-sm text-muted-foreground mt-1">Manage your personal preferences</p>
                <Separator className="mt-4" />
            </div>

            <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                {/* ─── Sidebar nav ── */}
                <nav className="lg:w-48 shrink-0">
                    <ul className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
                        {SECTIONS.map((s) => {
                            const Icon = s.icon;
                            const isActive = activeSection === s.id;
                            return (
                                <li key={s.id}>
                                    <button
                                        onClick={() => setActiveSection(s.id)}
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
                </nav>

                {/* ─── Main content ─────────────────────────────────────── */}
                <div className="flex-1 min-w-0 max-w-2xl">
                    <Card className="border border-border/40 shadow-sm overflow-hidden">
                        {/* Compact Header */}
                        <div className="bg-muted/30 border-b border-border/40 px-5 py-4 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                <ActiveIcon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold">{activeLabel}</h2>
                                <p className="text-[11px] text-muted-foreground">{sectionDesc[activeSection]}</p>
                            </div>
                        </div>

                        <CardContent className="p-0">
                            {/* ── Appearance ─────────────────────────────────────── */}
                            {activeSection === "appearance" && (
                                <div className="p-5">
                                    <div className="grid grid-cols-3 gap-3">
                                        {([
                                            { value: "light" as const, icon: Sun, label: "Light" },
                                            { value: "dark" as const, icon: Moon, label: "Dark" },
                                            { value: "system" as const, icon: Monitor, label: "System" },
                                        ]).map((t) => {
                                            const selected = theme === t.value;
                                            return (
                                                <button
                                                    key={t.value}
                                                    onClick={() => { setTheme(t.value); toast.success(`Theme set to ${t.label}`); }}
                                                    className={cn(
                                                        "relative flex items-center justify-center gap-2 rounded-lg border p-3 transition-all",
                                                        selected
                                                            ? "border-primary bg-primary/5 text-primary"
                                                            : "border-border hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                                                    )}
                                                >
                                                    {selected && (
                                                        <span className="absolute top-1.5 right-1.5 rounded-full bg-primary p-0.5 text-primary-foreground hidden sm:block">
                                                            <Check className="h-2.5 w-2.5" />
                                                        </span>
                                                    )}
                                                    <t.icon className="h-4 w-4" />
                                                    <span className="text-xs font-semibold">{t.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── My Profile ─────────────────────────────────────── */}
                            {activeSection === "profile" && (
                                <div className="p-5">
                                    {/* Read-only account info strip */}
                                    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg mb-5 border border-border/30">
                                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                            <User className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate">{currentUser.name}</p>
                                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                                                <Mail className="h-3 w-3" /> {currentUser.email}
                                                <Badge variant="secondary" className="ml-1 text-[10px] py-0 h-4 capitalize">{currentUser.role}</Badge>
                                            </p>
                                        </div>
                                    </div>

                                    {profileLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium flex items-center gap-1.5"><Phone className="h-3 w-3" />Phone</label>
                                                <Input
                                                    value={phone}
                                                    onChange={(e) => setPhone(e.target.value)}
                                                    placeholder="+63 900 000 0000"
                                                    className="h-9 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-medium flex items-center gap-1.5"><Calendar className="h-3 w-3" />Birthday</label>
                                                <Input
                                                    type="date"
                                                    value={birthday}
                                                    onChange={(e) => setBirthday(e.target.value)}
                                                    className="h-9 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1 sm:col-span-2">
                                                <label className="text-xs font-medium flex items-center gap-1.5"><MapPin className="h-3 w-3" />Address</label>
                                                <Input
                                                    value={address}
                                                    onChange={(e) => setAddress(e.target.value)}
                                                    placeholder="Home address"
                                                    className="h-9 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1 sm:col-span-2">
                                                <label className="text-xs font-medium flex items-center gap-1.5"><AlertCircle className="h-3 w-3" />Emergency Contact</label>
                                                <Input
                                                    value={emergencyContact}
                                                    onChange={(e) => setEmergencyContact(e.target.value)}
                                                    placeholder="Name & phone number"
                                                    className="h-9 text-sm"
                                                />
                                            </div>

                                            <Separator className="sm:col-span-2 my-1" />

                                            {/* Preferred Notification Channel */}
                                            <div className="space-y-1.5 sm:col-span-2">
                                                <label className="text-xs font-medium flex items-center gap-1.5"><MessageCircle className="h-3 w-3" />Preferred Notification Channel</label>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {(["in_app", "email", "whatsapp", "sms"] as const).map((ch) => (
                                                        <button
                                                            key={ch}
                                                            type="button"
                                                            onClick={() => setPreferredChannel(ch)}
                                                            className={cn(
                                                                "rounded-lg border px-2 py-2 text-[11px] font-medium transition-all",
                                                                preferredChannel === ch
                                                                    ? "border-primary bg-primary/5 text-primary"
                                                                    : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                                                            )}
                                                        >
                                                            {CHANNEL_LABELS[ch]}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* WhatsApp number (shown if whatsapp is preferred) */}
                                            {preferredChannel === "whatsapp" && (
                                                <div className="space-y-1 sm:col-span-2">
                                                    <label className="text-xs font-medium">WhatsApp Number</label>
                                                    <Input
                                                        value={whatsappNumber}
                                                        onChange={(e) => setWhatsappNumber(e.target.value)}
                                                        placeholder="+63 900 000 0000"
                                                        className="h-9 text-sm"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!profileLoading && (
                                        <div className="mt-5">
                                            <Button
                                                onClick={handleSaveProfile}
                                                disabled={profileSaving}
                                                className="h-9 text-xs px-5 shadow-sm"
                                            >
                                                {profileSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                                                Save Profile
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Notifications ──────────────────────────────────── */}
                            {activeSection === "notifications" && (
                                <div className="divide-y divide-border/40">
                                    {([
                                        { key: "emailAbsenceAlerts" as const, label: "Absence Alerts", desc: "Get notified when you are marked absent" },
                                        { key: "emailLeaveUpdates" as const, label: "Leave Updates", desc: "Get notified when your leave request is approved or rejected" },
                                        { key: "emailPayrollAlerts" as const, label: "Payroll Alerts", desc: "Get notified when new payslips are published" },
                                    ]).map((n) => (
                                        <div key={n.key} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">{n.label}</p>
                                                <p className="text-xs text-muted-foreground">{n.desc}</p>
                                            </div>
                                            <Switch
                                                checked={prefs[n.key]}
                                                onCheckedChange={(checked) => {
                                                    update({ [n.key]: checked });
                                                    toast.success(`${n.label} ${checked ? "enabled" : "disabled"}`);
                                                }}
                                                className="scale-90 data-[state=checked]:bg-primary"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ── Push Notifications ─────────────────────────────── */}
                            {activeSection === "push" && (
                                <div className="p-5">
                                    <PushNotificationPrompt variant="inline" className="w-full" />
                                    <p className="text-[11px] text-muted-foreground mt-2 px-1">
                                        Enable push notifications to receive instant alerts even when the app is closed.
                                    </p>
                                </div>
                            )}

                            {/* ── Security ───────────────────────────────────────── */}
                            {activeSection === "security" && (
                                <div className="p-5 space-y-5">
                                    {/* Change Password */}
                                    <div className="grid gap-4">
                                        <div className="space-y-1">
                                            <label htmlFor="pw-old" className="text-xs font-medium">Current Password</label>
                                            <div className="relative">
                                                <Input
                                                    id="pw-old"
                                                    type={showOld ? "text" : "password"}
                                                    value={pwOld}
                                                    onChange={(e) => setPwOld(e.target.value)}
                                                    placeholder="Enter current password"
                                                    autoComplete="current-password"
                                                    className="h-9 text-sm pr-9"
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                    onClick={() => setShowOld((v) => !v)}
                                                    tabIndex={-1}
                                                >
                                                    {showOld ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </div>

                                        <Separator className="my-0" />

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label htmlFor="pw-new" className="text-xs font-medium">New Password</label>
                                                <div className="relative">
                                                    <Input
                                                        id="pw-new"
                                                        type={showNew ? "text" : "password"}
                                                        value={pwNew}
                                                        onChange={(e) => setPwNew(e.target.value)}
                                                        placeholder="Min. 8 characters"
                                                        autoComplete="new-password"
                                                        className="h-9 text-sm pr-9"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                        onClick={() => setShowNew((v) => !v)}
                                                        tabIndex={-1}
                                                    >
                                                        {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                                {pwNew.length > 0 && pwNew.length < 8 && (
                                                    <p className="text-[10px] text-destructive">Must be at least 8 characters</p>
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <label htmlFor="pw-confirm" className="text-xs font-medium">Confirm Password</label>
                                                <Input
                                                    id="pw-confirm"
                                                    type="password"
                                                    value={pwConfirm}
                                                    onChange={(e) => setPwConfirm(e.target.value)}
                                                    placeholder="Re-enter new password"
                                                    autoComplete="new-password"
                                                    className="h-9 text-sm"
                                                />
                                                {pwConfirm.length > 0 && pwNew !== pwConfirm && (
                                                    <p className="text-[10px] text-destructive">Passwords do not match</p>
                                                )}
                                            </div>
                                        </div>

                                        <Button
                                            onClick={handleChangePassword}
                                            disabled={!passwordReady || pwLoading}
                                            className="w-full sm:w-auto h-9 text-xs px-5 shadow-sm"
                                        >
                                            {pwLoading
                                                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                : <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                                            }
                                            Update Password
                                        </Button>
                                    </div>

                                    {/* Reset Password divider */}
                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <Separator />
                                        </div>
                                        <div className="relative flex justify-center">
                                            <span className="bg-card px-2 text-[10px] text-muted-foreground">OR</span>
                                        </div>
                                    </div>

                                    {/* Reset via email */}
                                    <div className="rounded-lg border border-border/40 p-4 bg-muted/20">
                                        <p className="text-sm font-medium mb-0.5">Forgot your password?</p>
                                        <p className="text-[11px] text-muted-foreground mb-3">
                                            We&apos;ll send a reset link to <span className="font-medium text-foreground">{currentUser.email}</span>. Click the link to set a new password.
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleResetPassword}
                                            disabled={resetLoading}
                                            className="h-8 text-xs"
                                        >
                                            {resetLoading
                                                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                            }
                                            Send Reset Email
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
