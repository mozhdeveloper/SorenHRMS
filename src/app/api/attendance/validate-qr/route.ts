import { NextRequest, NextResponse } from "next/server";
import { validateAnyQR } from "@/services/qr-token.service";
import { createAdminSupabaseClient } from "@/services/supabase-server";
import { kioskRateLimiter, getClientIp } from "@/lib/rate-limit";
import { validateKioskAuth } from "@/lib/kiosk-auth";
import { GPS_CONFIG } from "@/lib/constants";
import { nanoid } from "nanoid";

/**
 * POST /api/attendance/validate-qr
 * 
 * Universal QR validator — accepts daily, static, or dynamic QR payloads.
 * On successful validation, writes the attendance event directly to Supabase
 * using the admin client (bypasses RLS — works even without a user session on
 * the kiosk device).
 * 
 * Request: { payload: string, kioskId: string, mode?: "in" | "out", location?: { lat, lng } }
 *   OR legacy: { token: string, kioskId: string, ... }
 *
 * Response: { valid: boolean, employeeId?, qrType?, message?, eventId? }
 */

export async function POST(request: NextRequest) {
    // Rate limiting
    const rl = kioskRateLimiter.check(getClientIp(request));
    if (!rl.ok) {
        return NextResponse.json(
            { valid: false, message: "Too many requests" },
            { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
        );
    }

    // Kiosk device auth
    const auth = validateKioskAuth(request.headers);
    if (!auth.ok) {
        return NextResponse.json({ valid: false, message: auth.error }, { status: auth.status });
    }

    try {
        const body = await request.json();
        const { payload, token, kioskId, location, mode } = body;

        // Accept either "payload" (new) or "token" (legacy)
        const qrPayload = payload || token;

        if (!qrPayload || typeof qrPayload !== "string") {
            return NextResponse.json(
                { valid: false, message: "Missing QR payload" },
                { status: 400 }
            );
        }

        if (!kioskId || typeof kioskId !== "string") {
            return NextResponse.json(
                { valid: false, message: "Missing kiosk ID" },
                { status: 400 }
            );
        }

        if (location) {
            if (
                typeof location.lat !== "number" || 
                typeof location.lng !== "number" ||
                !Number.isFinite(location.lat) ||
                !Number.isFinite(location.lng)
            ) {
                return NextResponse.json(
                    { valid: false, message: "Invalid location coordinates" },
                    { status: 400 }
                );
            }
            // GPS accuracy validation (reject high-accuracy readings)
            if (typeof location.accuracy === "number" && location.accuracy > GPS_CONFIG.MAX_ACCURACY_METERS) {
                return NextResponse.json(
                    { valid: false, message: `GPS accuracy too low (${Math.round(location.accuracy)}m > ${GPS_CONFIG.MAX_ACCURACY_METERS}m threshold). Please move to an area with better GPS signal.` },
                    { status: 400 }
                );
            }
        }

        const result = await validateAnyQR(qrPayload, kioskId, location);

        if (!result.ok) {
            return NextResponse.json(
                { valid: false, message: result.error || "Validation failed" },
                { status: 500 }
            );
        }

        if (!result.valid || !result.employeeId) {
            return NextResponse.json({
                valid: false,
                employeeId: result.employeeId,
                qrType: result.qrType,
                message: result.message,
            });
        }

        // ── Server-side DB write (admin client — bypasses RLS) ──────────────────
        // This is the authoritative attendance record. It works regardless of
        // whether the kiosk device has an active Supabase session.
        const eventType = mode === "out" ? "OUT" : "IN";
        const now = new Date();
        const nowISO = now.toISOString();
        const today = nowISO.split("T")[0];
        const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const eventId = `EVT-${nanoid(8)}`;

        let eventWritten = false;
        try {
            const supabase = await createAdminSupabaseClient();

            // 1. Append to event ledger (immutable)
            const { error: evtError } = await supabase.from("attendance_events").insert({
                id: eventId,
                employee_id: result.employeeId,
                event_type: eventType,
                timestamp_utc: nowISO,
                device_id: kioskId,
                created_at: nowISO,
            });

            if (evtError) {
                console.error("[validate-qr] attendance_events insert:", evtError.message);
            } else {
                eventWritten = true;
            }

            // 2. Upsert daily log (computed summary)
            if (eventType === "IN") {
                await supabase.from("attendance_logs").upsert(
                    {
                        id: `ATT-${today}-${result.employeeId}`,
                        employee_id: result.employeeId,
                        date: today,
                        check_in: timeStr,
                        status: "present",
                        updated_at: nowISO,
                    },
                    { onConflict: "employee_id,date" }
                );
            } else {
                // For check-out: fetch existing log to calculate hours
                const { data: existing } = await supabase
                    .from("attendance_logs")
                    .select("check_in")
                    .eq("employee_id", result.employeeId)
                    .eq("date", today)
                    .single();

                let hours: number | null = null;
                if (existing?.check_in) {
                    const [inH, inM] = (existing.check_in as string).split(":").map(Number);
                    const diffMin = (now.getHours() * 60 + now.getMinutes()) - (inH * 60 + inM);
                    hours = Math.round((Math.max(0, diffMin) / 60) * 10) / 10;
                }

                await supabase
                    .from("attendance_logs")
                    .update({ check_out: timeStr, hours, updated_at: nowISO })
                    .eq("employee_id", result.employeeId)
                    .eq("date", today);
            }
        } catch (dbError) {
            console.error("[validate-qr] DB write failed:", dbError);
            // Non-fatal: kiosk local store will still record the event
        }

        return NextResponse.json({
            valid: true,
            employeeId: result.employeeId,
            qrType: result.qrType,
            message: result.message,
            eventId: eventWritten ? eventId : undefined,
        });
    } catch (error) {
        console.error("[validate-qr] Error:", error);
        return NextResponse.json(
            { valid: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
