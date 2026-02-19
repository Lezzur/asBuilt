"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useGitHub } from "@/lib/auth/use-github";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Github, Bell, User, AlertCircle } from "lucide-react";
import type { UserSettings } from "@/lib/types";

const FREQUENCY_OPTIONS = [
  { value: "1", label: "Daily" },
  { value: "2", label: "Every 2 days" },
  { value: "3", label: "Every 3 days" },
  { value: "5", label: "Every 5 days" },
  { value: "7", label: "Weekly" },
];

export default function SettingsPage() {
  const { user, loading: authLoading, getIdToken } = useAuth();
  const { connect: connectGitHub, disconnect: disconnectGitHub } = useGitHub();
  const router = useRouter();

  const [settings, setSettings] = useState<UserSettings>({
    reminderEnabled: false,
    reminderFrequencyDays: 3,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const fetchSettings = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch("/api/user/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load settings");
      const data = (await res.json()) as {
        settings: UserSettings;
        githubConnected: boolean;
      };
      setSettings(data.settings);
      setGithubConnected(data.githubConnected ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (user) fetchSettings();
  }, [user, fetchSettings]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const token = await getIdToken();
    if (!token) { setSaving(false); return; }

    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleGitHubToggle() {
    setGithubLoading(true);
    setError(null);
    try {
      if (githubConnected) {
        await disconnectGitHub();
        setGithubConnected(false);
      } else {
        await connectGitHub(); // redirects browser; page will reload
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub action failed");
    } finally {
      setGithubLoading(false);
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

  return (
    <AppShell>
      <div className="max-w-xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your account and preferences.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-5">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-5">
          {/* Account */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Email</div>
                <div className="text-sm font-medium">{user.email}</div>
              </div>
              {user.displayName && (
                <div>
                  <div className="text-xs text-muted-foreground">Name</div>
                  <div className="text-sm font-medium">{user.displayName}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* GitHub */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Github className="h-4 w-4" />
                GitHub Connection
              </CardTitle>
              <CardDescription>
                Connect GitHub to scan private repositories.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {githubConnected ? (
                  <Badge variant="secondary" className="text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline">Not connected</Badge>
                )}
              </div>
              <Button
                variant={githubConnected ? "outline" : "default"}
                size="sm"
                onClick={handleGitHubToggle}
                disabled={githubLoading}
              >
                {githubLoading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {githubConnected ? "Disconnect" : "Connect GitHub"}
              </Button>
            </CardContent>
          </Card>

          {/* Reminders */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Development Reminders
              </CardTitle>
              <CardDescription>
                Get a nudge when you haven&apos;t scanned in a while.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="reminders-toggle" className="text-sm">
                  Email reminders
                </Label>
                <Switch
                  id="reminders-toggle"
                  checked={settings.reminderEnabled}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, reminderEnabled: checked }))
                  }
                />
              </div>

              {settings.reminderEnabled && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <Label className="text-sm">Remind me after</Label>
                    <Select
                      value={String(settings.reminderFrequencyDays)}
                      onValueChange={(v) =>
                        setSettings((s) => ({
                          ...s,
                          reminderFrequencyDays: parseInt(v, 10),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Requires a verified email address.
                    </p>
                  </div>
                </>
              )}

              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : savedFeedback ? (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                  ) : null}
                  {savedFeedback ? "Saved" : "Save changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
