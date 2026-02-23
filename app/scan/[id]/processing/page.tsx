"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, ArrowRight, ArrowLeft } from "lucide-react";
import type { ScanRecord } from "@/lib/types";

// Map log messages to a rough progress percentage
function estimateProgress(logs: string[]): number {
  const stages = [
    { pattern: /collecting files/i, progress: 10 },
    { pattern: /filtering/i, progress: 25 },
    { pattern: /assembling prompt/i, progress: 40 },
    { pattern: /sending to/i, progress: 50 },
    { pattern: /generating as_built_agent/i, progress: 65 },
    { pattern: /generating as_built_human/i, progress: 80 },
    { pattern: /generating pdf/i, progress: 90 },
    { pattern: /scan complete/i, progress: 100 },
  ];

  let maxProgress = 5;
  for (const log of logs) {
    for (const stage of stages) {
      if (stage.pattern.test(log)) {
        maxProgress = Math.max(maxProgress, stage.progress);
      }
    }
  }
  return maxProgress;
}

export default function ScanProcessingPage() {
  const { user, loading: authLoading, getIdToken } = useAuth();
  const router = useRouter();
  const params = useParams();
  const scanId = params.id as string;

  const [scan, setScan] = useState<Partial<ScanRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const poll = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;

    try {
      const res = await fetch(`/api/scan/${scanId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch scan status");
      const data = (await res.json()) as { scan: Partial<ScanRecord> };
      setScan(data.scan);

      if (data.scan.status === "completed" || data.scan.status === "partial" || data.scan.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch scan status");
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [scanId, getIdToken]);

  useEffect(() => {
    if (!user) return;
    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, poll]);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [scan?.progressLog]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const logs = scan?.progressLog ?? [];
  const status = scan?.status ?? "pending";
  const progress = status === "completed" || status === "partial" ? 100 : estimateProgress(logs);
  const isFailed = status === "failed";
  const isComplete = status === "completed";
  const isPartial = status === "partial";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Link>
        </Button>

        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold mb-1">
            {isComplete
              ? "Scan complete"
              : isPartial
                ? "Scan partially complete"
                : isFailed
                  ? "Scan failed"
                  : "Scanning your codebase…"}
          </h1>
          {scan?.projectName && (
            <p className="text-sm text-muted-foreground">{scan.projectName}</p>
          )}
        </div>

        {/* Progress bar */}
        <Progress value={progress} className="mb-6 h-2" />

        {/* Log output */}
        <div className="bg-muted/40 border rounded-lg p-4 font-mono text-xs max-h-72 overflow-y-auto mb-6">
          {logs.length === 0 ? (
            <span className="text-muted-foreground">Initializing…</span>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="flex items-start gap-2 mb-1 last:mb-0">
                <span className="text-muted-foreground select-none">›</span>
                <span>{line}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>

        {/* Status / actions */}
        {!isComplete && !isPartial && !isFailed && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>This can take 30–120 seconds depending on codebase size.</span>
          </div>
        )}

        {isComplete && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Documentation generated successfully
            </div>
            <Button asChild size="lg">
              <Link href={`/scan/${scanId}`}>
                View Results
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        )}

        {isPartial && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-amber-600 font-medium text-sm">
              <AlertTriangle className="h-5 w-5" />
              Partial results saved — some sections may be incomplete
            </div>
            <div className="flex gap-2">
              <Button asChild size="lg">
                <Link href={`/scan/${scanId}`}>
                  View Partial Results
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/scan/new">Re-run Scan</Link>
              </Button>
            </div>
          </div>
        )}

        {isFailed && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {scan?.errorMessage ?? "The scan failed. Please try again."}
              <div className="mt-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/scan/new">Try again</Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
