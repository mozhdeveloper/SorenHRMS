import { useNotificationsStore } from "@/store/notifications.store";
import { toast } from "sonner";
import type { NotificationType, NotificationTrigger } from "@/types";

interface SendNotificationParams {
    type: NotificationType;
    employeeId: string;
    subject: string;
    body: string;
    channel?: "email" | "sms" | "both" | "in_app";
    link?: string;
    // Optional — used to enrich the notification toast if available
    employeeName?: string;
    employeeEmail?: string;
    employeePhone?: string;
}

/**
 * Mock email notification sender.
 * Logs to notification store and shows a toast.
 */
export function sendNotification(params: SendNotificationParams): void {
    const { employeeId, type, subject, body, channel = "email", link, employeeName, employeeEmail, employeePhone } = params;

    // Save to notification store
    const addLog = useNotificationsStore.getState().addLog;
    addLog({ employeeId, type, subject, body, channel, link, recipientEmail: employeeEmail, recipientPhone: employeePhone });

    // Show toast simulating dispatch
    const toLabel = employeeName ?? employeeId;
    const icon = channel === "sms" ? "\uD83D\uDCF1" : channel === "both" ? "\uD83D\uDCE8" : "\uD83D\uDCE7";
    toast.success(`${icon} ${channel === "sms" ? "SMS" : channel === "both" ? "Email + SMS" : "Email"} sent to ${toLabel}`, { description: subject });

    // Console log for debugging / demo
    console.log(
        `[MOCK ${channel.toUpperCase()}] To: ${employeeEmail ?? employeePhone ?? employeeId}\nSubject: ${subject}\nBody: ${body}`
    );
}

/**
 * Dispatch notification using the rules-based system.
 */
export function dispatchNotification(
    trigger: NotificationTrigger,
    vars: Record<string, string>,
    recipientEmployeeId: string,
    recipientEmail?: string,
    recipientPhone?: string
): void {
    const store = useNotificationsStore.getState();
    store.dispatch(trigger, vars, recipientEmployeeId, recipientEmail, recipientPhone);

    // Show toast for the user
    const rule = store.getRuleByTrigger(trigger);
    if (rule && rule.enabled) {
        const subject = rule.subjectTemplate.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
        const channelLabel = rule.channel === "sms" ? "SMS" : rule.channel === "both" ? "Email + SMS" : rule.channel === "in_app" ? "In-app" : "Email";
        const icon = rule.channel === "sms" ? "\uD83D\uDCF1" : rule.channel === "both" ? "\uD83D\uDCE8" : "\uD83D\uDCE7";
        toast.success(`${icon} ${channelLabel} sent (simulated)`, { description: subject });
    }
}

/**
 * Convenience factories for common notification types.
 */
export function notifyProjectAssignment(params: {
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    projectName: string;
}): void {
    sendNotification({
        type: "assignment",
        employeeId: params.employeeId,
        employeeName: params.employeeName,
        employeeEmail: params.employeeEmail,
        subject: `New Project Assignment: ${params.projectName}`,
        body: `Hi ${params.employeeName}, you have been assigned to "${params.projectName}". Please report to the project location. Contact HR for more details.`,
    });
}

export function notifyAbsence(params: {
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    date: string;
}): void {
    sendNotification({
        type: "absence",
        employeeId: params.employeeId,
        employeeName: params.employeeName,
        employeeEmail: params.employeeEmail,
        subject: `Attendance Alert: Marked absent on ${params.date}`,
        body: `Hi ${params.employeeName}, you were marked absent for ${params.date}. Please provide a reason or contact HR if this is an error.`,
    });
}

export function notifyGeofenceViolation(params: {
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    distance: number;
    time: string;
}): void {
    dispatchNotification("geofence_violation", {
        name: params.employeeName,
        time: params.time,
        distance: String(params.distance),
    }, params.employeeId, params.employeeEmail);
}

export function notifyPayslipPublished(params: {
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    employeePhone?: string;
    period: string;
    amount: string;
}): void {
    dispatchNotification("payslip_published", {
        name: params.employeeName,
        period: params.period,
        amount: params.amount,
    }, params.employeeId, params.employeeEmail, params.employeePhone);
}

export function notifyPayslipSigned(params: {
    employeeId: string;
    employeeName: string;
    period: string;
}): void {
    dispatchNotification("payslip_signed", {
        name: params.employeeName,
        period: params.period,
    }, params.employeeId);
}

export function notifyPaymentConfirmed(params: {
    employeeId: string;
    employeeName: string;
    employeePhone?: string;
    period: string;
    amount: string;
}): void {
    dispatchNotification("payment_confirmed", {
        name: params.employeeName,
        period: params.period,
        amount: params.amount,
    }, params.employeeId, undefined, params.employeePhone);
}

export function notifyLocationDisabled(params: {
    employeeId: string;
    employeeName: string;
    time: string;
}): void {
    dispatchNotification("location_disabled", {
        name: params.employeeName,
        time: params.time,
    }, params.employeeId);
}
