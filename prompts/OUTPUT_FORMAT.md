## CRITICAL: Output Structure Requirements

Your COMPLETE response must use these EXACT delimiters to separate the output documents. This is non-negotiable — the response is parsed programmatically and will fail without these delimiters.

Structure your ENTIRE response exactly like this:

===BEGIN_MANIFEST_OUTPUT===
(The complete PROJECT_MANIFEST document goes here.
Include all sections from §1 through §16.
Do not truncate or summarize — write the full document.)
===END_MANIFEST_OUTPUT===

===BEGIN_HUMAN_OUTPUT===
(The complete AS_BUILT_HUMAN.md document goes here.
Include all sections from "What Is This?" through "Glossary".
Do not truncate or summarize — write the full document.)
===END_HUMAN_OUTPUT===

{drift_section}

RULES:
1. Start your response IMMEDIATELY with ===BEGIN_MANIFEST_OUTPUT===. No preamble, no "Here is the output", no commentary before the first delimiter.
2. Each delimiter must appear on its OWN line with NO surrounding whitespace or markdown formatting.
3. The content between delimiters must be the COMPLETE document — do not refer to other sections or say "see above".
4. Do NOT add any text between ===END_MANIFEST_OUTPUT=== and ===BEGIN_HUMAN_OUTPUT===.
5. Do NOT add any text after the final closing delimiter.
6. Both documents analyze the SAME codebase but serve DIFFERENT audiences and DIFFERENT purposes. They are not summaries of each other.
