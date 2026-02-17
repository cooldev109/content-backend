# Development Rules (Must Keep)

Prepared: January 23, 2026

## Security and secret-handling rules

1. Never hardcode secrets in code, docs, Drive, or logs. Use .env or a secret manager only.

2. Never paste API keys in chat. If a key is exposed, rotate it immediately.

3. Use least-privilege Google scopes (Drive + Docs only).

4. Logs must never contain secrets; redact sensitive values before writing logs.



## Single input and determinism rules

1. The automation must start from exactly one input (index file ID). No extra manual inputs after launch.

2. Always normalize the index into a CourseSpec JSON before generating content.

3. Validate CourseSpec with JSON Schema; if invalid, stop with a clear error report.

4. No generation step may invent structure outside CourseSpec.



## Idempotency and rerun-safety rules

1. All Drive operations must be find-or-create; reruns must not create uncontrolled duplicates.

2. If a doc exists, behavior must be consistent everywhere: overwrite OR version suffix. Pick one and keep it.

3. Each topic must have a recorded status so the pipeline can resume safely.



## Drive and Docs structure rules

1. Folder structure must always be: Course / Module X / Topic Y.

2. Each topic must always contain exactly these docs: 01_topic_index, 02_topic_development, 03_voiceover_script.

3. Naming must be stable and sortable (number prefixes, consistent Module/Topic numbering).



## Prompt and content rules

1. Prompts are configuration: load from Drive at runtime (with repo fallback).

2. Topic index generation must output strict JSON only (no extra text).

3. Topic development and voiceover must follow style constraints: natural professional language, second person, no AI mentions, no robotic filler.

4. Voiceover script must end with the exact sentence: “Nos vemos en la siguiente clase” (or a client-approved equivalent).



## Bibliography integrity rules

1. Never invent references. If web verification is out of scope, use a Bibliography Bank (approved list) and allow only those entries.

2. Validate bibliography output against the allowed list before writing final docs.



## Reliability rules

1. All external calls (OpenAI, Google APIs) must have retries with exponential backoff for 429/5xx.

2. Cap concurrency (e.g., 2–5 topics at once) to avoid quota/rate-limit failures.

3. Failures must be isolated per topic; continue other topics and report failures clearly.



## Observability and documentation rules

1. Every run must produce a run report with created folder IDs, doc IDs, per-topic status, and errors.

2. Document how to run, how to change prompts, and how to update bibliography sources so another developer can operate the system.



## Scope control rules

1. No frontend. Deliver a CLI/runner plus automation logic only.

2. No manual edits required to complete a run. Editing prompts is allowed; the run itself must be hands-off.

3. Any new feature (PDF export, editing pipeline, audio generation) is out-of-scope unless the client explicitly requests it.


