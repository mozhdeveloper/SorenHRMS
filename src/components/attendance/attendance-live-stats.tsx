"use client";

/**
 * Attendance Live Stats Widget
 * 
 * Real-time attendance overview for dashboard with auto-refresh.
 * Shows present/absent/late counts with visual indicators.
 */

import { useMemo, useState, useEffect } from "react";
import { useAttendanceStore } from "@/store/attendance.store";
import { useEmployeesStore } from "@/store/employees.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    UserCheck, UserX, Clock, AlertTriangle,
    Activity, Timer, Coffee,
} from "lucide-react";

export function AttendanceLiveStats() {
    const employees = useEmployeesStore((s) => s.employees);
    const { logs, events } = useAttendanceStore();
    const [now, setNow] = useState(new Date());

    // Update time every minute
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    const today = now.toISOString().split("T")[0];
    const activeEmployees = employees.filter((e) => e.status === "active");

    const stats = useMemo(() => {
        const todayLogs = logs.filter((l) => l.date === today);
        const checkedIn = todayLogs.filter((l) => l.checkIn && l.status === "present");
        const checkedOut = todayLogs.filter((l) => l.checkOut);
        const lateArrivals = todayLogs.filter((l) => (l.lateMinutes ?? 0) > 0);
        const onLeave = todayLogs.filter((l) => l.status === "on_leave");
        const absent = activeEmployees.length - checkedIn.length - onLeave.length;

        // Get today's events for break tracking
        const todayEvents = events.filter((e) => e.timestampUTC?.startsWith(today));
        const onBreak = todayEvents.filter(
            (e) => e.eventType === "BREAK_START" &&
            !todayEvents.some((end) => end.eventType === "BREAK_END" && end.employeeId === e.employeeId)
        ).length;

        return {
            total: activeEmployees.length,
            present: checkedIn.length,
            checkedOut: checkedOut.length,
            late: lateArrivals.length,
            onLeave: onLeave.length,
            absent: Math.max(0, absent),
            onBreak,
            avgHours: checkedOut.length > 0
                ? Math.round((checkedOut.reduce((sum, l) => sum + (l.hours ?? 0), 0) / checkedOut.length) * 10) / 10
                : 0,
        };
    }, [logs, events, today, activeEmployees]);

    const attendanceRate = stats.total > 0
        ? Math.round((stats.present / stats.total) * 100)
        : 0;

    const lateRate = stats.present > 0
        ? Math.round((stats.late / stats.present) * 100)
        : 0;

    return (
        <Card className="border border-border/40 shadow-sm bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Live Attendance
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] font-mono">
                        {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Attendance Progress */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Attendance Rate</span>
                        <span className="font-semibold">{attendanceRate}%</span>
                    </div>
                    <Progress value={attendanceRate} className="h-2" />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <StatCard
                        label="Present"
                        value={stats.present}
                        total={stats.total}
                        icon={UserCheck}
                        color="text-emerald-600"
                        bg="bg-emerald-500/10"
                    />
                    <StatCard
                        label="Absent"
                        value={stats.absent}
                        icon={UserX}
                        color="text-red-600"
                        bg="bg-red-500/10"
                    />
                    <StatCard
                        label="Late Today"
                        value={stats.late}
                        icon={AlertTriangle}
                        color="text-amber-600"
                        bg="bg-amber-500/10"
                    />
                    <StatCard
                        label="On Leave"
                        value={stats.onLeave}
                        icon={Clock}
                        color="text-blue-600"
                        bg="bg-blue-500/10"
                    />
                </div>

                {/* Secondary Stats */}
                <div className="flex items-center justify-between pt-2 border-t text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Coffee className="h-3.5 w-3.5" />
                        <span>On Break: <strong className="text-foreground">{stats.onBreak}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Timer className="h-3.5 w-3.5" />
                        <span>Avg Hours: <strong className="text-foreground">{stats.avgHours}h</strong></span>
                    </div>
                </div>

                {/* Late Rate Warning */}
                {lateRate > 20 && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>{lateRate}% of present employees arrived late today</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function StatCard({ label, value, total, icon: Icon, color, bg }: {
    label: string;
    value: number;
    total?: number;
    icon: React.ElementType;
    color: string;
    bg: string;
}) {
    return (
        <div className={`p-3 rounded-xl ${bg} flex items-center gap-3`}>
            <div className={`p-2 rounded-lg bg-background/60 ${color}`}>
                <Icon className="h-4 w-4" />
            </div>
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold">
                    {value}
                    {total !== undefined && (
                        <span className="text-xs text-muted-foreground font-normal">/{total}</span>
                    )}
                </p>
            </div>
        </div>
    );
}

export default AttendanceLiveStats;
