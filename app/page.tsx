"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { AppShell } from "@/components/app-shell";
import { ReminderBanner } from "@/components/reminder-banner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  FileCode2,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { ScanSummary } from "@/lib/types";

const STATUS_CONFIG = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "text-green-600",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    className: "text-destructive",
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    className: "text-blue-600 animate-spin",
  },
  partial: {
    label: "Partial",
    icon: AlertTriangle,
    className: "text-amber-600",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    className: "text-muted-foreground",
  },
};

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  claude: "Claude",
  openai: "OpenAI",
};

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ScanRow({
  scan,
  onDelete,
}: {
  scan: ScanSummary;
  onDelete: (id: string) => void;
}) {
  const config = STATUS_CONFIG[scan.status];
  const Icon = config.icon;
  const createdAt =
    scan.createdAt instanceof Date ? scan.createdAt : new Date(scan.createdAt);

  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm truncate">
            {scan.projectName || "Unnamed project"}
          </span>
          <Badge
            variant="outline"
            className="text-xs shrink-0 font-normal"
          >
            {PROVIDER_LABELS[scan.llmProvider] ?? scan.llmProvider}
            {scan.llmTier === "premium" && " Pro"}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="capitalize">{scan.source}</span>
          <span>·</span>
          <span>{scan.fileCount} files</span>
          <span>·</span>
          <span>{formatRelativeTime(createdAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Icon className={`h-4 w-4 ${config.className}`} />
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {config.label}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {(scan.status === "completed" || scan.status === "partial") && (
          <Button asChild size="sm" variant="ghost" className="h-8 px-2">
            <Link href={`/scan/${scan.scanId}`}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
        {scan.status === "processing" && (
          <Button asChild size="sm" variant="ghost" className="h-8 px-2">
            <Link href={`/scan/${scan.scanId}/processing`}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(scan.status === "completed" || scan.status === "partial") && (
              <DropdownMenuItem asChild>
                <Link
                  href={`/scan/${scan.scanId}`}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  View results
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onDelete(scan.scanId)}
              className="flex items-center gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading: authLoading, getIdToken } = useAuth();
  const router = useRouter();
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [loadingScans, setLoadingScans] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const fetchScans = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch("/api/scans", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load scans");
      const data = (await res.json()) as { scans: ScanSummary[] };
      setScans(data.scans);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scans");
    } finally {
      setLoadingScans(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (user) fetchScans();
  }, [user, fetchScans]);

  async function handleDelete(scanId: string) {
    const token = await getIdToken();
    if (!token) return;
    try {
      await fetch(`/api/scan/${scanId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setScans((prev) => prev.filter((s) => s.scanId !== scanId));
    } catch {
      console.error("Failed to delete scan", scanId);
    }
  }

  const lastScan = scans[0];
  const lastScanDate =
    lastScan?.createdAt instanceof Date
      ? lastScan.createdAt
      : lastScan?.createdAt
        ? new Date(lastScan.createdAt)
        : null;
  const daysSinceLast = lastScanDate
    ? Math.floor((Date.now() - lastScanDate.getTime()) / 86_400_000)
    : null;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <AppShell>
      {daysSinceLast !== null && daysSinceLast >= 3 && (
        <ReminderBanner
          daysSinceLastScan={daysSinceLast}
          lastProjectName={lastScan?.projectName}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {scans.length} scan{scans.length !== 1 ? "s" : ""} in history
          </p>
        </div>
        <Button asChild>
          <Link href="/scan/new">
            <Plus className="h-4 w-4 mr-1.5" />
            New Scan
          </Link>
        </Button>
      </div>

      {loadingScans ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setError(null);
                setLoadingScans(true);
                fetchScans();
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : scans.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileCode2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="font-medium mb-1">No scans yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
              Upload a codebase to generate your first set of documentation.
            </p>
            <Button asChild>
              <Link href="/scan/new">
                <Plus className="h-4 w-4 mr-1.5" />
                Run your first scan
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 px-4">
            {scans.map((scan) => (
              <ScanRow key={scan.scanId} scan={scan} onDelete={handleDelete} />
            ))}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
