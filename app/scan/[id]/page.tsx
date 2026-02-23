"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Download,
  FileText,
  Bot,
  FileSliders,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Clock,
  Cpu,
  Files,
} from "lucide-react";
import type { ScanRecord } from "@/lib/types";

type DownloadType = "manifest-md" | "agent-md" | "human-md" | "human-pdf" | "drift-md";

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  claude: "Anthropic Claude",
  openai: "OpenAI",
};

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: Date | string, end: Date | string | null): string {
  if (!end) return "—";
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const secs = Math.floor((e.getTime() - s.getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function MetaItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

export default function ScanDetailPage() {
  const { user, loading: authLoading, getIdToken } = useAuth();
  const router = useRouter();
  const params = useParams();
  const scanId = params.id as string;

  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<DownloadType | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const fetchScan = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/scan/${scanId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load scan");
      const data = (await res.json()) as { scan: ScanRecord };
      if (data.scan.status !== "completed" && data.scan.status !== "partial") {
        router.push(`/scan/${scanId}/processing`);
        return;
      }
      setScan(data.scan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scan");
    } finally {
      setLoading(false);
    }
  }, [scanId, getIdToken, router]);

  useEffect(() => {
    if (user) fetchScan();
  }, [user, fetchScan]);

  async function handleDownload(type: DownloadType) {
    setDownloading(type);
    const token = await getIdToken();
    if (!token) { setDownloading(null); return; }

    try {
      const res = await fetch(`/api/scan/${scanId}/download/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = type === "human-pdf" ? "pdf" : "md";
      const name = type === "manifest-md"
        ? "PROJECT_MANIFEST.md"
        : type === "human-md"
          ? "AS_BUILT_HUMAN.md"
          : type === "human-pdf"
            ? "AS_BUILT_HUMAN.pdf"
            : "PRD_DRIFT.md";
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
    } finally {
      setDownloading(null);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <AppShell>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  if (!scan) return null;

  const outputs: { type: DownloadType; title: string; description: string; icon: React.ElementType; available: boolean }[] = [
    {
      type: "manifest-md",
      title: "PROJECT_MANIFEST.md",
      description: "Dense technical reference optimized for AI coding assistants.",
      icon: Bot,
      available: !!scan.outputManifestMd,
    },
    {
      type: "human-md",
      title: "AS_BUILT_HUMAN.md",
      description: "Human-readable overview written in plain language.",
      icon: FileText,
      available: !!scan.outputHumanMd,
    },
    {
      type: "human-pdf",
      title: "AS_BUILT_HUMAN.pdf",
      description: "PDF with table of contents and page numbers.",
      icon: FileText,
      available: !!scan.outputHumanMd,
    },
    {
      type: "drift-md",
      title: "PRD_DRIFT.md",
      description: "Comparison of your PRD against what was actually built.",
      icon: FileSliders,
      available: !!scan.outputDriftMd,
    },
  ];

  return (
    <AppShell>
      {/* Back link */}
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Dashboard
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">{scan.projectName || "Untitled scan"}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="capitalize">{scan.source}</Badge>
            <Badge variant="outline">
              {PROVIDER_LABELS[scan.llmProvider] ?? scan.llmProvider}
              {scan.llmTier === "premium" && " Pro"}
            </Badge>
            {scan.prdAttached && <Badge variant="outline">PRD attached</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {/* Downloads — left column (2/3 width) */}
        <div className="md:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Downloads
          </h2>
          {outputs.map((output) => {
            const Icon = output.icon;
            return (
              <Card key={output.type} className={!output.available ? "opacity-40" : ""}>
                <CardContent className="p-4 flex items-center gap-4">
                  <Icon className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{output.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {output.description}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(output.type)}
                    disabled={!output.available || downloading === output.type}
                    className="shrink-0"
                  >
                    {downloading === output.type ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1.5">Download</span>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Metadata — right column */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Metadata
          </h2>
          <Card>
            <CardContent className="p-4 space-y-4">
              <MetaItem
                icon={Clock}
                label="Scanned"
                value={formatDate(scan.createdAt)}
              />
              <Separator />
              <MetaItem
                icon={Clock}
                label="Duration"
                value={formatDuration(scan.createdAt, scan.completedAt)}
              />
              <Separator />
              <MetaItem
                icon={Files}
                label="Files processed"
                value={String(scan.fileCount)}
              />
              <Separator />
              <MetaItem
                icon={Cpu}
                label="Tokens used"
                value={scan.tokenUsage?.totalTokens
                  ? `${scan.tokenUsage.totalTokens.toLocaleString()} total`
                  : "—"}
              />
              {scan.subdirectory && (
                <>
                  <Separator />
                  <MetaItem
                    icon={Files}
                    label="Subdirectory"
                    value={scan.subdirectory}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
