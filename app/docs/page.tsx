import { AppShell } from "@/components/app-shell";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { FileCode2, Upload, FolderOpen, Github, Terminal, FileText, HelpCircle, Bot, BookOpen } from "lucide-react";

function Section({ id, title, icon: Icon, children }: {
  id: string;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">{children}</div>
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted rounded-md px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

const TOC = [
  { id: "getting-started", label: "Getting Started" },
  { id: "input-methods", label: "Input Methods" },
  { id: "cli", label: "CLI" },
  { id: "outputs", label: "Understanding Outputs" },
  { id: "faq", label: "FAQ & Troubleshooting" },
];

export default function DocsPage() {
  return (
    <AppShell>
      <div className="flex gap-10 max-w-5xl">
        {/* Sidebar TOC */}
        <aside className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-24">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              On this page
            </p>
            <nav className="space-y-1">
              {TOC.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-0.5"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 space-y-10 min-w-0">
          <div className="mb-2">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-5 w-5" />
              <h1 className="text-xl font-semibold">Documentation</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Everything you need to use as_built effectively.
            </p>
          </div>

          <Separator />

          {/* Getting Started */}
          <Section id="getting-started" title="Getting Started" icon={FileCode2}>
            <p>
              <strong>as_built</strong> analyzes your codebase and generates two AI-optimized
              documents: a technical reference for AI coding assistants and a human-readable
              overview for stakeholders.
            </p>
            <p>To run your first scan:</p>
            <ol className="list-decimal list-inside space-y-1.5 pl-1">
              <li>Sign in and click <strong>New Scan</strong>.</li>
              <li>Choose your input method — zip, folder, or GitHub repo.</li>
              <li>Select an LLM provider and optionally enable the premium tier.</li>
              <li>Click <strong>Scan</strong> and watch the live log.</li>
              <li>Download your documentation when the scan completes.</li>
            </ol>
            <p>
              Scans typically complete in 30–120 seconds depending on codebase size and
              provider. Larger codebases benefit from Gemini&apos;s wider context window.
            </p>
          </Section>

          <Separator />

          {/* Input Methods */}
          <Section id="input-methods" title="Input Methods" icon={Upload}>
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Upload className="h-4 w-4" />
                  <h3 className="font-medium">Zip Upload</h3>
                </div>
                <p>
                  Compress your project folder into a <code>.zip</code> file and upload it.
                  Maximum size is <strong>100 MB</strong>. The zip is extracted, filtered,
                  and deleted immediately after the scan.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <FolderOpen className="h-4 w-4" />
                  <h3 className="font-medium">Folder Upload</h3>
                </div>
                <p>
                  Select a folder directly from your machine using the browser&apos;s
                  directory picker. Files are streamed to the server. This is the most
                  convenient method for local projects.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Github className="h-4 w-4" />
                  <h3 className="font-medium">GitHub Repository</h3>
                </div>
                <p>
                  Paste a GitHub repo URL. For private repositories, connect your GitHub
                  account in <a href="/settings" className="underline">Settings</a> first.
                  You can specify a branch (defaults to <code>main</code>/<code>master</code>)
                  and a subdirectory path for monorepos.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText className="h-4 w-4" />
                  <h3 className="font-medium">Subdirectory Targeting</h3>
                </div>
                <p>
                  Available on all input methods. Enter a relative path (e.g.{" "}
                  <code>packages/api</code>) to scan only that subdirectory. Useful for
                  monorepos where you want documentation for a specific package.
                </p>
              </div>
            </div>
          </Section>

          <Separator />

          {/* CLI */}
          <Section id="cli" title="CLI Companion" icon={Terminal}>
            <p>
              Install the CLI globally and run scans directly from your terminal. Designed
              to integrate with AI coding tools like Claude Code and Cursor.
            </p>

            <div className="space-y-3">
              <h3 className="font-medium">Installation</h3>
              <CodeBlock>npm install -g asbuilt-cli</CodeBlock>

              <h3 className="font-medium">Authentication</h3>
              <CodeBlock>asbuilt login</CodeBlock>
              <p>Opens your browser for authentication. Token stored in <code>~/.asbuilt/config.json</code>.</p>

              <h3 className="font-medium">Commands</h3>
              <CodeBlock>{`asbuilt scan .                          # Scan current directory
asbuilt scan . --model gemini           # Specify provider
asbuilt scan . --premium                # Use Opus-tier model
asbuilt scan . --prd ./docs/PRD.md      # Include PRD for drift analysis
asbuilt scan . --subdir packages/api    # Scan subdirectory
asbuilt scan . --output ~/Desktop       # Save to specific directory
asbuilt history                         # List recent scans
asbuilt logout                          # Clear credentials`}</CodeBlock>

              <h3 className="font-medium">.asbuiltrc Config File</h3>
              <p>
                Place a <code>.asbuiltrc</code> file in your project root for project-level
                defaults. CLI flags override config file values.
              </p>
              <CodeBlock>{`{
  "model": "gemini",
  "output": "./docs",
  "subdir": "packages/core",
  "premium": false
}`}</CodeBlock>

              <h3 className="font-medium">AI Tool Integration</h3>
              <p>Run as_built directly from Claude Code or Cursor:</p>
              <CodeBlock>{`# User: "Run an as_built scan on this project"
asbuilt scan .

# Then reference the output:
# User: "Read AS_BUILT_AGENT.md and use it as context."
`}</CodeBlock>
            </div>
          </Section>

          <Separator />

          {/* Outputs */}
          <Section id="outputs" title="Understanding Outputs" icon={Bot}>
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-medium">AS_BUILT_AGENT.md</h3>
                  <Badge variant="outline" className="text-xs">AI-optimized</Badge>
                </div>
                <p>
                  A dense, technically precise document for AI coding assistants. Contains
                  file paths, function signatures, data shapes, config keys, env vars, and
                  component relationships. Feed this to Claude Code, Cursor, or any AI
                  assistant before starting work on a project.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-medium">AS_BUILT_HUMAN.md / .pdf</h3>
                  <Badge variant="outline" className="text-xs">Human-readable</Badge>
                </div>
                <p>
                  A plain-language overview any stakeholder can understand. The PDF version
                  includes a table of contents and page numbers. Share with product managers,
                  clients, or new team members.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-medium">PRD_DRIFT.md</h3>
                  <Badge variant="outline" className="text-xs">Optional</Badge>
                </div>
                <p>
                  Generated when you attach a PRD to a scan. Documents what was fully
                  implemented, what was changed, what&apos;s missing, and what was added
                  beyond the original plan. Helps teams understand how reality diverged from
                  the spec.
                </p>
              </div>
            </div>
          </Section>

          <Separator />

          {/* FAQ */}
          <Section id="faq" title="FAQ & Troubleshooting" icon={HelpCircle}>
            <div className="space-y-5">
              {[
                {
                  q: "How long does a scan take?",
                  a: "30–120 seconds for most projects. Very large codebases may take longer. The live log shows progress in real-time.",
                },
                {
                  q: "Is my code stored?",
                  a: "No. Your codebase files are processed in memory and deleted immediately after the scan. Only the generated documentation is stored.",
                },
                {
                  q: "The scan failed — what do I do?",
                  a: "Check the error message on the processing screen. Common issues: codebase exceeds the context window (try Gemini or use subdirectory targeting), LLM provider API key issue, or a temporary API outage. You can retry the scan from the dashboard.",
                },
                {
                  q: "Context window exceeded — what does that mean?",
                  a: "Your codebase has more text than the selected LLM can process at once. Switch to Gemini (largest context window) or use subdirectory targeting to scan a smaller portion.",
                },
                {
                  q: "Why are .env files never included?",
                  a: "This is a hard security rule. Environment files may contain API keys and secrets. They are always excluded from scans and never sent to any LLM.",
                },
                {
                  q: "Can I scan the same project multiple times?",
                  a: "Yes. Each scan is independent. Your history keeps up to 100 scans; the oldest is automatically deleted when you exceed that limit.",
                },
              ].map(({ q, a }) => (
                <div key={q}>
                  <h3 className="font-medium mb-1">{q}</h3>
                  <p className="text-muted-foreground">{a}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
