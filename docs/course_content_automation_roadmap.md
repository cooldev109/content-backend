# Course Content Automation Roadmap

Prepared: January 23, 2026

Build an unattended automation that takes a single input (course or module index), generates three outputs per topic (topic index, topic development, voiceover script), and creates the required Google Drive folder structure and Google Docs files automatically.

## Project Goals and Scope

- Single input: a Google Doc/DOCX index file (course or module index).
- Automatic generation per topic: 01_topic_index, 02_topic_development, 03_voiceover_script.
- Automatic Google Drive structure: Course / Module X / Topic Y / (3 Google Docs).
- Zero manual intervention after launch (CLI runner).
- Robust JSON handling (normalize index into a CourseSpec JSON).
- Brief documentation for future use and prompt maintenance.

## Deliverables

- Operational Node.js automation (CLI) with retries, logging, and rerun safety (idempotent).
- Master prompts (stored in Drive and/or mirrored in repo as fallback templates).
- Google Drive folder and document generation logic (Drive + Docs APIs).
- Input-to-JSON normalization (CourseSpec) and schema validation.
- Brief README: setup, configuration, run instructions, troubleshooting.

## Milestones Overview

| Milestone | Outcome | Acceptance Check |
|---|---|---|
| M0 - Security & Access | Keys rotated; service account ready; root folder shared | Script can list root folder contents |
| M1 - Input Contract | Index -> CourseSpec JSON (schema-validated) | CourseSpec lists modules/topics correctly |
| M2 - Drive Writer | Find/create folders + docs (idempotent) | Rerun does not duplicate unexpectedly |
| M3 - Generation Pipeline | 3 docs per topic generated and written to Docs | Docs exist and contain non-empty content |
| M4 - Validation & Repair | Auto checks + targeted fixes | Voiceover ends correctly; structure matches rules |
| M5 - End-to-End Test | Run on real index with sample module | Folder tree + docs match spec |
| M6 - Documentation | Client-ready README + prompt management notes | Another dev can run it from scratch |

---

## Phase 0 - Security and Access Setup

- Rotate any exposed API keys and remove secrets from Drive. Use .env locally.
- Create a Google Service Account and enable Drive API + Docs API.
- Share the client root folder with the service account as Editor.
- Set environment variables: OPENAI_API_KEY, GOOGLE_APPLICATION_CREDENTIALS, ROOT_FOLDER_ID.

**Done when**
- Automation can list the root Drive folder and create a test subfolder and Google Doc.
- Secrets are not stored in Drive and not committed to git.

## Phase 1 - Single Input Contract and Normalization (CourseSpec)

- Support one input file ID (Google Doc or DOCX in Drive).
- Read the index file content and normalize into a strict CourseSpec JSON.
- Validate CourseSpec using JSON Schema (Ajv).
- Handle common index formats: 'MÓDULO X' blocks, numbered lessons (1.1, 1.2), optional outcomes/practice notes.

**Outputs**
- courseSpec.schema.json
- index-to-coursespec parser with tests
- example CourseSpec JSON for a sample course

## Phase 2 - Prompt System (Drive-backed master prompts)

- Fetch prompt documents from Drive at runtime (so the client can edit prompts without code changes).
- Maintain repo fallback prompt templates if Drive prompts are missing.
- Define variable placeholders: course_name, level, audience, objective, module_title, topic_title, topic_outline.
- Force JSON output for the topic index step to keep structure deterministic.

**Outputs**
- PromptLoader (Drive Doc -> text)
- prompt templates for: topic_index, topic_development, voiceover_script, validator/repair

## Phase 3 - Drive and Docs Writer (Idempotent)

- Implement find-or-create for folders and documents under the correct parent folder.
- Create folder tree: Course / Module X / Topic Y.
- Create three Google Docs per topic: 01_topic_index, 02_topic_development, 03_voiceover_script.
- Write content using Docs API batchUpdate (insertText, optional basic formatting).
- Rerun policy: overwrite existing docs (or version suffix if preferred), never duplicate silently.

**Outputs**
- DriveService (list/search/create folders and files)
- DocsService (create doc, write full content)
- idempotency tests (rerun produces stable results)

## Phase 4 - Generation Pipeline (3 steps per topic)

- Step A: Generate topic index (outline) as JSON.
- Step B: Generate full topic development using the outline JSON.
- Step C: Generate voiceover script using course context + topic title + outline (and optionally a short content summary).
- Run with controlled concurrency (p-limit) and retries/backoff for rate limits (OpenAI and Google).
- Save run logs: topic -> doc IDs -> status -> timestamps.

**Quality rules enforced**
- Second-person voice; natural language; no AI mentions.
- Topic development contains Intro, Development, Conclusions, Bibliography.
- Voiceover follows required structure and ends with the required closing line.

## Phase 5 - Automated Validation and Repair

- Validate generated documents with lightweight programmatic checks (structure, required phrases).
- If a check fails, run a targeted repair prompt for that document only.
- Examples: enforce voiceover ending, remove bullet lists in final script, ensure required sections exist.

**Outputs**
- Validators (text checks + JSON checks)
- Repair prompts and retry logic

## Phase 6 - Bibliography Handling (No Fake References)

- Create a Bibliography Bank (JSON or Drive doc) with approved references per course domain.
- Require the model to select only from that list.
- Validate bibliography items against the bank before writing final docs.

**Outputs**
- bibliography_bank.json (or Drive doc ID)
- bibliography validator

## Phase 7 - End-to-End Test and Handoff

- Run the full pipeline on a real course index with at least one module and multiple topics.
- Confirm Drive tree and docs match the client spec exactly.
- Deliver README and a short 'how to modify prompts' guide.
- Provide a run report: created folder IDs, doc IDs, failures (if any), and rerun instructions.

**Final acceptance criteria**
- Single input triggers full automation.
- Folders and 3 docs per topic created in Drive.
- Content matches prompt rules and required structures.
- Rerun is safe and does not create uncontrolled duplicates.
- Documentation allows future reuse and modifications.

---

## Suggested Repository Layout

```
src/
  index.ts (CLI entrypoint)
  config.ts (env + constants)
  google/drive.ts (folders/files)
  google/docs.ts (doc creation/writing)
  openai/client.ts (OpenAI calls)
  pipeline/parseIndex.ts (index -> CourseSpec)
  pipeline/generateTopicIndex.ts
  pipeline/generateTopicDevelopment.ts
  pipeline/generateVoiceover.ts
  pipeline/validateAndRepair.ts
  storage/runLog.ts
prompts/ (fallback templates)
schemas/courseSpec.schema.json
bibliography/bibliography_bank.json
tests/
README.md
```

## CLI Example

```
node dist/index.js --rootFolderId=<ROOT_FOLDER_ID> --indexFileId=<GOOGLE_DOC_OR_DOCX_ID> --mode=course
```
