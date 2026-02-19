"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { X, Bell } from "lucide-react";
import Link from "next/link";

interface ReminderBannerProps {
  daysSinceLastScan: number;
  lastProjectName?: string | null;
}

export function ReminderBanner({ daysSinceLastScan, lastProjectName }: ReminderBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const message = lastProjectName
    ? `Welcome back! It's been ${daysSinceLastScan} day${daysSinceLastScan !== 1 ? "s" : ""} since your last scan on ${lastProjectName}. Ready to rescan?`
    : `Welcome back! It's been ${daysSinceLastScan} day${daysSinceLastScan !== 1 ? "s" : ""} since your last scan. Ready to dive back in?`;

  return (
    <Alert className="mb-6 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{message}</span>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild size="sm" variant="outline" className="h-7 border-amber-300 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30">
            <Link href="/scan/new">New scan</Link>
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
