"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FolderOpen,
  Github,
  FileText,
  Loader2,
  AlertCircle,
  Info,
  ShieldCheck,
} from "lucide-react";
import type { LlmProvider } from "@/lib/types";

type InputTab = "zip" | "folder" | "github";

const PROVIDERS: { value: LlmProvider; label: string; description: string }[] = [
  { value: "gemini", label: "Google Gemini", description: "Largest context window — best for big codebases" },
  { value: "claude", label: "Anthropic Claude", description: "Strong structured output and document generation" },
  { value: "openai", label: "OpenAI", description: "Broad general capability" },
];

export default function NewScanPage() {
  const { user, loading: authLoading, getIdToken } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<InputTab>("zip");
  const [provider, setProvider] = useState<LlmProvider>("gemini");
  const [premium, setPremium] = useState(false);
  const [subdirectory, setSubdirectory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Zip upload state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Folder upload state
  const [folderFiles, setFolderFiles] = useState<FileList | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // GitHub state
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [githubConnected, setGithubConnected] = useState(false);

  // PRD upload state
  const [prdFile, setPrdFile] = useState<File | null>(null);
  const prdInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      try {
        const res = await fetch("/api/user/settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { githubConnected?: boolean };
          setGithubConnected(data.githubConnected ?? false);
        }
      } catch { /* non-critical */ }
    })();
  }, [user, getIdToken]);

  const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorCode(null);

    if (activeTab === "zip" && !zipFile) {
      setError("Please select a .zip file.");
      return;
    }
    if (activeTab === "folder" && (!folderFiles || folderFiles.length === 0)) {
      setError("Please select a folder.");
      return;
    }
    if (activeTab === "github" && !repoUrl.trim()) {
      setError("Please enter a GitHub repository URL.");
      return;
    }

    // ── Client-side upload validation (PRD §21) ──
    if (activeTab === "zip" && zipFile) {
      if (!zipFile.name.toLowerCase().endsWith(".zip")) {
        setError("Unsupported file format. Only .zip archives are accepted.");
        return;
      }
      if (zipFile.size > MAX_UPLOAD_BYTES) {
        setError(
          `File too large: ${(zipFile.size / 1024 / 1024).toFixed(1)} MB. Maximum upload size is 100 MB. ` +
            `Try targeting a subdirectory, or exclude large assets before zipping.`,
        );
        return;
      }
    }

    if (activeTab === "folder" && folderFiles) {
      let totalSize = 0;
      for (let i = 0; i < folderFiles.length; i++) {
        totalSize += folderFiles[i].size;
      }
      if (totalSize > MAX_UPLOAD_BYTES) {
        setError(
          `Folder too large: ${(totalSize / 1024 / 1024).toFixed(1)} MB total. Maximum upload size is 100 MB. ` +
            `Try targeting a subdirectory, or use a .zip with build output excluded.`,
        );
        return;
      }
    }

    if (prdFile) {
      const PRD_EXTENSIONS = [".md", ".txt", ".pdf", ".docx"];
      const ext = prdFile.name.slice(prdFile.name.lastIndexOf(".")).toLowerCase();
      if (!PRD_EXTENSIONS.includes(ext)) {
        setError(
          `Unsupported PRD format: ${ext}. Supported formats are .md, .txt, .pdf, and .docx.`,
        );
        return;
      }
    }

    setSubmitting(true);
    const token = await getIdToken();
    if (!token) {
      setError("Not authenticated.");
      setSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append("provider", provider);
    formData.append("tier", premium ? "premium" : "default");
    if (subdirectory.trim()) formData.append("subdirectory", subdirectory.trim());
    if (prdFile) formData.append("prd", prdFile);

    if (activeTab === "zip" && zipFile) {
      formData.append("source", "zip");
      formData.append("file", zipFile);
    } else if (activeTab === "folder" && folderFiles) {
      formData.append("source", "folder");
      for (let i = 0; i < folderFiles.length; i++) {
        const f = folderFiles[i];
        formData.append("files", f, f.webkitRelativePath || f.name);
      }
    } else if (activeTab === "github") {
      formData.append("source", "github");
      formData.append("githubUrl", repoUrl.trim());
      if (branch.trim()) formData.append("githubBranch", branch.trim());
    }

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      let data: { scanId?: string; error?: string; code?: string };
      try {
        data = (await res.json()) as { scanId?: string; error?: string; code?: string };
      } catch {
        setError(`Server error (${res.status}). Please try again.`);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Failed to start scan.");
        setErrorCode(data.code ?? null);
        return;
      }

      router.push(`/scan/${data.scanId}/processing`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan.");
    } finally {
      setSubmitting(false);
    }
  }

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
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">New Scan</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload your codebase to generate documentation.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Input method */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Codebase Input</CardTitle>
              <CardDescription>Choose how to provide your project.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InputTab)}>
                <TabsList className="grid grid-cols-3 mb-4">
                  <TabsTrigger value="zip" className="gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    Zip Upload
                  </TabsTrigger>
                  <TabsTrigger value="folder" className="gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Folder
                  </TabsTrigger>
                  <TabsTrigger value="github" className="gap-1.5">
                    <Github className="h-3.5 w-3.5" />
                    GitHub
                  </TabsTrigger>
                </TabsList>

                {/* Zip */}
                <TabsContent value="zip" className="mt-0">
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
                    onClick={() => zipInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    {zipFile ? (
                      <div>
                        <p className="font-medium text-sm">{zipFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(zipFile.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium">Click to select a .zip file</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Max 100 MB</p>
                      </div>
                    )}
                    <input
                      ref={zipInputRef}
                      type="file"
                      accept=".zip"
                      className="hidden"
                      onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </TabsContent>

                {/* Folder */}
                <TabsContent value="folder" className="mt-0">
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
                    onClick={() => folderInputRef.current?.click()}
                  >
                    <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    {folderFiles && folderFiles.length > 0 ? (
                      <div>
                        <p className="font-medium text-sm">
                          {folderFiles.length} files selected
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {folderFiles[0].webkitRelativePath.split("/")[0]}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium">Click to select a folder</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Selects all files in the folder recursively
                        </p>
                      </div>
                    )}
                    <input
                      ref={folderInputRef}
                      type="file"
                      // @ts-expect-error webkitdirectory is non-standard
                      webkitdirectory=""
                      multiple
                      className="hidden"
                      onChange={(e) => setFolderFiles(e.target.files)}
                    />
                  </div>
                </TabsContent>

                {/* GitHub */}
                <TabsContent value="github" className="mt-0 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="repoUrl">Repository URL</Label>
                    <Input
                      id="repoUrl"
                      placeholder="https://github.com/owner/repo"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="branch">
                      Branch{" "}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="branch"
                      placeholder="main"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </div>
                  {githubConnected ? (
                    <Alert>
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-xs">
                        GitHub connected — public and private repositories are accessible.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        GitHub not connected. Private repos won&apos;t be accessible.{" "}
                        <a href="/settings" className="underline font-medium">
                          Connect in Settings
                        </a>
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scan Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Subdirectory */}
              <div className="space-y-1.5">
                <Label htmlFor="subdirectory">
                  Subdirectory{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="subdirectory"
                  placeholder="packages/api"
                  value={subdirectory}
                  onChange={(e) => setSubdirectory(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Scan only a specific subdirectory. Useful for monorepos.
                </p>
              </div>

              <Separator />

              {/* Provider */}
              <div className="space-y-1.5">
                <Label>LLM Provider</Label>
                <Select
                  value={provider}
                  onValueChange={(v) => setProvider(v as LlmProvider)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <div>
                          <span>{p.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            — {p.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Premium tier */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    Premium tier
                    <Badge variant="outline" className="text-xs font-normal">
                      Opus-class
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deeper analysis for complex codebases. Uses more API credits.
                  </p>
                </div>
                <Switch
                  checked={premium}
                  onCheckedChange={setPremium}
                />
              </div>
            </CardContent>
          </Card>

          {/* PRD upload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">PRD Upload</CardTitle>
              <CardDescription>
                Optionally attach your original PRD to generate a drift analysis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
                onClick={() => prdInputRef.current?.click()}
              >
                <FileText className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                {prdFile ? (
                  <div>
                    <p className="text-sm font-medium">{prdFile.name}</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPrdFile(null); }}
                      className="text-xs text-muted-foreground hover:text-destructive mt-0.5"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm">Click to attach a PRD file</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      .md, .txt, .pdf, or .docx
                    </p>
                  </div>
                )}
                <input
                  ref={prdInputRef}
                  type="file"
                  accept=".md,.txt,.pdf,.docx"
                  className="hidden"
                  onChange={(e) => setPrdFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p>{error}</p>
                {errorCode === "GITHUB_AUTH_ERROR" && (
                  <p className="mt-1.5">
                    <a href="/settings" className="underline font-medium">
                      Go to Settings → GitHub
                    </a>{" "}
                    to connect or reconnect your account.
                  </p>
                )}
                {errorCode === "GITHUB_NOT_FOUND" && (
                  <p className="mt-1.5">
                    Check the URL format (e.g.{" "}
                    <code className="text-xs">https://github.com/owner/repo</code>). For private
                    repos, ensure your account is connected in{" "}
                    <a href="/settings" className="underline font-medium">
                      Settings → GitHub
                    </a>
                    .
                  </p>
                )}
                {errorCode === "GITHUB_RATE_LIMIT" && (
                  <p className="mt-1.5">
                    While waiting for the limit to reset, you can upload via{" "}
                    <button
                      type="button"
                      className="underline font-medium"
                      onClick={() => setActiveTab("zip")}
                    >
                      Zip
                    </button>{" "}
                    or{" "}
                    <button
                      type="button"
                      className="underline font-medium"
                      onClick={() => setActiveTab("folder")}
                    >
                      Folder
                    </button>{" "}
                    upload instead.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Privacy notice (PRD §19.5) */}
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Your code is never stored. Files are processed in memory and deleted
              immediately after your scan completes. <code>.env</code> files are
              never sent to the LLM.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting scan...
                </>
              ) : (
                "Scan"
              )}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
