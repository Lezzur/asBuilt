# FAQ & Troubleshooting

## How long does a scan take?

30–120 seconds for most projects. Very large codebases may take longer. The live log shows progress in real-time.

## Is my code stored?

No. Your codebase files are processed in memory and deleted immediately after the scan. Only the generated documentation is stored.

## The scan failed — what do I do?

Check the error message on the processing screen. Common issues: codebase exceeds the context window (try Gemini or use subdirectory targeting), LLM provider API key issue, or a temporary API outage. You can retry the scan from the dashboard.

## Context window exceeded — what does that mean?

Your codebase has more text than the selected LLM can process at once. Switch to Gemini (largest context window) or use subdirectory targeting to scan a smaller portion.

## Why are .env files never included?

This is a hard security rule. Environment files may contain API keys and secrets. They are always excluded from scans and never sent to any LLM.

## Can I scan the same project multiple times?

Yes. Each scan is independent. Your history keeps up to 100 scans; the oldest is automatically deleted when you exceed that limit.

## What files are excluded from scans?

node_modules, build outputs, lock files, binaries, media files, archives, minified files, and .env files are always excluded. Your project's .gitignore is also respected on top of these defaults.

## Can I scan private GitHub repositories?

Yes. Connect your GitHub account in Settings first. This uses OAuth — you authorize once and as_built can access your private repos without you managing tokens manually.

## What is the premium tier?

Each LLM provider has a standard (Sonnet-class) and premium (Opus-class) model. Standard handles most projects well. Enable premium for very large or architecturally complex codebases where deeper reasoning improves output quality.

## What PRD formats are supported for drift analysis?

You can attach a PRD as .md, .txt, .pdf, or .docx. Text is extracted server-side before analysis. The PRD_DRIFT.md output documents what was implemented, what changed, what's missing, and what was added beyond the original plan.
