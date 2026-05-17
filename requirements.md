# Requirements

Behavioral requirements for the Knowledge Graph Document Chat system,
organized by phase. Each phase maps to a tier in
[implementation.md](./implementation.md). For business context see
[goals.md](./goals.md); for system shape see
[architecture.md](./architecture.md).

## Conventions

- **MUST** — required for the phase's Definition of Done
- **SHOULD** — strongly preferred; document the reason if not met
- **MAY** — optional enhancement
- Requirement IDs use the form `REQ-{phase}.{capability}.{n}` for traceability
  in tickets, tests, and ADRs.
- Each requirement carries acceptance criteria sufficient to write a test
  against.

## Phase map

| Phase | Maps to | Repo | Theme |
|---|---|---|---|
| Phase 1 | Tier 0 + Tier 1 | Public starter (Apache 2.0) | Ingestion, basic management, vector chat with citations |
| Phase 2 | Tier 2 | Private commercial | Multi-tenant, billable, observable |
| Phase 3 | Tier 3 | Private commercial | Full document lifecycle and supersession |
| Phase 4 | Tier 4 | Private commercial | Knowledge graph, hybrid retrieval, truth maintenance |
| Phase 5 | Beyond Tier 4 | Private commercial | Additional sources, multi-version answers, on-prem |

---

## Phase 1 — Portfolio Foundation (PUBLIC)

The open-source starter. Single-tenant, single-workspace, vector-only
retrieval with citations.

### 1.1 Document ingestion

**REQ-1.1.1 — Document upload.** The system MUST accept PDF uploads from
authenticated users.
- Accepts files up to 50 MB
- Returns a document ID synchronously
- Failed uploads return actionable error messages

**REQ-1.1.2 — Asynchronous extraction.** The system MUST extract text from
uploads asynchronously, without blocking the upload response.
- Upload returns immediately with a `pending` status
- Status transitions: `pending → extracting → chunking → embedding → ready` (or `failed`)
- Background job durability survives a deploy

**REQ-1.1.3 — Chunking.** The system MUST split extracted text into chunks
suitable for embedding.
- Chunks respect paragraph and section boundaries where possible
- Chunk size and overlap are configurable (defaults: 500–1000 tokens, ~15% overlap)
- Each chunk preserves source location (page, character offset)

**REQ-1.1.4 — Embedding storage.** The system MUST embed each chunk and
persist embeddings to pgvector with the chunk text and source metadata.
- Embeddings indexed for ANN similarity search (HNSW or ivfflat)
- Vector dimension matches the configured embedding model
- Original chunk text is preserved for citation rendering

**REQ-1.1.5 — Ingestion observability.** The system SHOULD expose per-document
processing progress and failure reasons in the UI.

### 1.2 Document display and management

**REQ-1.2.1 — List documents.** The system MUST display the authenticated
user's documents, sortable by name / upload date / status and filterable by
status, paginated for >50 items.

**REQ-1.2.2 — View metadata.** The system MUST display document metadata
(`title`, `version`, `status`, `effective_date`, upload date, size,
processing state).

**REQ-1.2.3 — Edit metadata.** The system MUST allow editing of editable
metadata fields (not file content) via the UI.

**REQ-1.2.4 — Delete document.** The system MUST allow deleting a document,
which MUST also remove its chunks and embeddings.
- Confirmation required
- Hard delete at this phase (soft delete arrives with the Phase 3 lifecycle)
- Past chat citations to a deleted doc degrade gracefully (e.g., show
  "source no longer available")

**REQ-1.2.5 — Reprocess document.** The system MAY allow re-running
ingestion on an existing document (e.g., after a chunking change).

### 1.3 Document versioning (basic)

**REQ-1.3.1 — Version field.** Every document MUST carry a `version` field
(string; user-supplied or auto-incremented from a sibling).

**REQ-1.3.2 — Status field.** Every document MUST carry a `status` field with
allowed values `draft`, `current`, `retired` at this phase. (Full lifecycle
state machine arrives in Phase 3.)

**REQ-1.3.3 — Effective date.** Every document MUST carry an
`effective_date` field (nullable).

**REQ-1.3.4 — Retrieval filters by status.** The retrieval pipeline MUST
exclude documents marked `retired` from default retrieval.

### 1.4 Chat (vector retrieval)

**REQ-1.4.1 — Authenticated chat.** The system MUST require authentication
to start a chat session.

**REQ-1.4.2 — Vector-search retrieval.** The system MUST retrieve relevant
chunks for a user query using vector similarity search.
- Top-K configurable (default 8)
- Retrieves only from documents owned by the querying user
- Excludes chunks from `retired` documents (REQ-1.3.4)

**REQ-1.4.3 — Streaming responses.** The system MUST stream LLM responses to
the UI as tokens arrive.

**REQ-1.4.4 — Conversation persistence.** The system MUST persist chat
history per user.
- Past conversations are retrievable
- Messages preserve order and timestamps

### 1.5 References and supporting quotations

**REQ-1.5.1 — Inline citations.** Every generated answer MUST include inline
citation markers referencing specific source chunks.

**REQ-1.5.2 — Citation details.** Each citation MUST resolve to: source
document title, version, page (if available), and a quoted excerpt of the
cited passage.

**REQ-1.5.3 — Citation precision (eval).** The system MUST measure citation
precision on the golden Q&A set.
- Metric computed automatically
- Reported on PRs touching retrieval
- Initial target: ≥ 90% on the curated golden set

**REQ-1.5.4 — No hallucinated citations.** The system MUST NOT surface
citation markers that don't resolve to a retrieved chunk.
- If the LLM emits a citation marker not corresponding to a retrieved
  chunk, the system either re-prompts to repair or strips the marker

### 1.6 Phase 1 non-functional

- **REQ-1.NF.1** — Auth via Supabase Auth (email + password minimum).
- **REQ-1.NF.2** — Single workspace per user; multi-tenant deferred to Phase 2.
- **REQ-1.NF.3** — Forker can deploy the public starter to Vercel in <15 min.
- **REQ-1.NF.4** — All API contracts defined in OpenAPI 3.1; contract tests
  in CI.
- **REQ-1.NF.5** — Golden Q&A regression suite runs on every PR that touches
  retrieval.

---

## Phase 2 — Production hardening (PRIVATE)

Multi-tenant, billable, observable. First tier exclusive to the private repo.

### 2.1 Multi-tenancy

**REQ-2.1.1 — Teams.** The system MUST support teams (multiple users per
workspace) with member roles (admin, member).

**REQ-2.1.2 — RLS isolation.** Postgres row-level security MUST enforce
tenant isolation on every table that holds workspace-scoped data.

**REQ-2.1.3 — Permission-aware retrieval.** Retrieval MUST filter chunks by
the querying user's accessible documents **before** the vector search runs.
- Automated tests confirm tenant A cannot retrieve tenant B's chunks under
  any code path (including spoofed-JWT attack scenarios)

### 2.2 Billing

**REQ-2.2.1 — Subscription plans.** The system MUST support multiple
subscription tiers (e.g., Free / Pro / Team).

**REQ-2.2.2 — Usage metering.** The system MUST track per-workspace usage
for documents, queries, and storage.

**REQ-2.2.3 — Customer portal.** The system MUST integrate Stripe Customer
Portal for self-service plan changes.

**REQ-2.2.4 — Usage enforcement.** The system MUST enforce subscription
limits at the API boundary, with clear UX when a limit is hit.

### 2.3 Audit and observability

**REQ-2.3.1 — Audit log.** The system MUST log mutations: who queried what,
who uploaded/edited/retired what, and when. Logs MUST be exportable.

**REQ-2.3.2 — LLM tracing.** Every LLM call MUST be traced (Langfuse) with
input, output, latency, and cost attribution to a workspace.

**REQ-2.3.3 — Error monitoring.** Errors MUST flow to Sentry with
workspace/user context (no PII).

### 2.4 Phase 2 non-functional

- **REQ-2.NF.1** — Per-user and per-workspace rate limiting.
- **REQ-2.NF.2** — Background job durability (in-flight ingestion survives a deploy).
- **REQ-2.NF.3** — Admin dashboard showing usage, audit logs, top errors.

---

## Phase 3 — Document lifecycle (PRIVATE)

Full versioning state machine + supersession + time-travel queries.

### 3.1 Version graph

**REQ-3.1.1 — Version relationships.** Documents MUST have parent/child
version relationships forming a directed version graph.

**REQ-3.1.2 — Full lifecycle state machine.** Documents MUST progress
through `draft → approved → current → retired / superseded`. Every transition
MUST be audited.

### 3.2 Supersession

**REQ-3.2.1 — Supersession workflow.** Marking document A as superseded by
document B MUST update retrieval defaults so A is excluded by default and
B included.

**REQ-3.2.2 — Cascade behavior.** Retiring a document MUST remove its
chunks from default retrieval within one ingestion cycle. Past-chat
citations to retired documents MUST display a "retired source" indicator.

### 3.3 Time-travel queries

**REQ-3.3.1 — Effective-date filter.** The system MUST support "as of [date]"
queries that return historically correct retrievals (the version that was
current at that date).

### 3.4 Lifecycle administration

**REQ-3.4.1 — Admin transitions.** Admin UI MUST support all lifecycle state
transitions with audit-log entries.

**REQ-3.4.2 — Bulk operations.** Admin UI SHOULD support bulk supersession
(replacing a family of related docs with new versions in one operation).

### 3.5 Lifecycle-aware evaluation

**REQ-3.5.1 — Retired-citation penalty.** The eval harness MUST penalize
answers that cite retired documents.

**REQ-3.5.2 — Time-travel correctness.** The eval set MUST include "as of"
questions whose correct answers depend on the date filter.

---

## Phase 4 — Knowledge graph (PRIVATE)

Structured assertions with provenance and truth-maintenance, layered on top
of the existing vector retrieval.

### 4.1 Triple store (Phase 4a — Postgres-based)

**REQ-4.1.1 — Triple persistence.** The system MUST store extracted
assertions as `(subject, predicate, object)` triples with provenance columns
(`source_doc`, `source_chunk`, `effective_date`, `asserted_at`,
`retracted_at`, `confidence`).

**REQ-4.1.2 — Entity and relation extraction.** Ingestion MUST extract
entities and relations from chunks, LLM-assisted, constrained by a
hand-curated starter ontology.

**REQ-4.1.3 — Entity resolution.** The system MUST resolve entity mentions
to canonical IDs, supported by an aliases table.

### 4.2 Hybrid retrieval

**REQ-4.2.1 — Hybrid pipeline.** Retrieval MUST blend vector-search results
with graph-traversal results before LLM context assembly.

**REQ-4.2.2 — Multi-hop questions.** The hybrid pipeline MUST correctly
answer multi-hop questions in the eval set that pure vector retrieval fails.

### 4.3 Truth maintenance

**REQ-4.3.1 — Cascade retraction.** When a source document is retired or
retracted, dependent triples whose provenance derives solely from that
source MUST be marked retracted.

**REQ-4.3.2 — Soft retraction.** Retracted triples MUST be soft-deleted
(kept for audit), not hard-deleted.

### 4.4 SPARQL (Phase 4b)

**REQ-4.4.1 — SPARQL endpoint.** The system MUST expose a SPARQL endpoint
backed by Jena/Fuseki or Stardog (decision per ADR before starting).

**REQ-4.4.2 — Template-driven SPARQL.** LLM-generated SPARQL MUST use a
curated library of query templates rather than free-form generation.

**REQ-4.4.3 — Ontology workshop deliverable.** The system MUST support
ingest of a customer-supplied ontology (RDFS / OWL fragment) and use it
during extraction.

---

## Phase 5 — Enterprise and extension (PRIVATE)

Advanced commercial capabilities beyond Tier 4. Each is scoped as a separate
engagement and may be developed on customer demand.

### 5.1 Additional data sources

**REQ-5.1.1 — Office documents.** The system MUST ingest `.docx`, `.xlsx`,
and `.pptx`, extracting text, tables, and structural metadata.

**REQ-5.1.2 — Web sources.** The system MUST ingest web pages with
configurable crawl depth, scope rules, and refresh scheduling.

**REQ-5.1.3 — Database connectors.** The system MAY ingest tabular data
from Postgres, MS SQL, and MySQL with configurable refresh intervals.

**REQ-5.1.4 — SaaS connectors.** The system MAY ingest from named SaaS
sources (Confluence, SharePoint, Google Drive, Notion, etc.).

**REQ-5.1.5 — Uniform provenance contract.** Every data source MUST surface
the same provenance fields (source URI, version/snapshot id, effective_date
where known).

### 5.2 Multi-version answer composition

**REQ-5.2.1 — Cross-version retrieval.** The chat layer MUST support
retrieval that spans multiple versions of the same document in a single
query.

**REQ-5.2.2 — Version-aware answers.** Generated answers MUST distinguish
facts that hold across all versions from facts that vary by version, with
per-version citations.

### 5.3 Version-difference Q&A

**REQ-5.3.1 — Diff queries.** The system MUST answer questions of the form
"what changed between version X and version Y of document D?"

**REQ-5.3.2 — Structured diff output.** Diff answers MUST present
added / removed / modified clauses with citations to both versions.

**REQ-5.3.3 — Semantic vs textual diff.** Diffs MUST go beyond textual
diff: semantically equivalent rewordings SHOULD be classified as
unchanged.

### 5.4 On-prem deployment

**REQ-5.4.1 — Turnkey installer.** The system MUST be installable on
customer infrastructure via a packaged deployment:
- Docker Compose for SMB
- Helm chart for enterprise Kubernetes

**REQ-5.4.2 — Air-gap compatibility.** The on-prem deployment MUST run
without external network egress, with BYO LLM endpoint, BYO embedding
model, and BYO observability stack.

**REQ-5.4.3 — Supported tier.** A support engagement SHOULD be available
covering installation, customization, updates, and SLA-bound incident
response.

**REQ-5.4.4 — No phone-home.** The on-prem deployment MUST NOT report
telemetry to vendor infrastructure unless explicitly enabled.

**REQ-5.4.5 — Update channel.** The on-prem deployment MUST support
operator-driven update via signed release artifacts.

---

## Cross-phase non-functional requirements

### Security

- **NF-SEC.1** — Data encrypted at rest (Supabase default; KMS-managed
  on-prem).
- **NF-SEC.2** — All transport over TLS.
- **NF-SEC.3** — Per-workspace API rate limiting from Phase 2.
- **NF-SEC.4** — Secrets in environment variables, not source; pre-commit
  secret scanning.
- **NF-SEC.5** — RBAC for admin operations from Phase 2.

### Observability

- **NF-OBS.1** — Structured logs with correlation IDs.
- **NF-OBS.2** — LLM trace per chat turn (Langfuse) from Phase 2.
- **NF-OBS.3** — Eval set runs nightly and on every retrieval-touching PR.

### Performance (targets, not commitments)

- **NF-PERF.1** — Vector search P50 < 200 ms at 100K chunks per workspace.
- **NF-PERF.2** — LLM first-token latency < 2 s (subject to provider SLO).
- **NF-PERF.3** — Ingestion throughput ≥ 10 pages/sec per worker.

### Privacy

- **NF-PRIV.1** — Workspace-scoped data; no cross-workspace sharing.
- **NF-PRIV.2** — Audit log access restricted to workspace admins.
- **NF-PRIV.3** — On-prem deployment MUST NOT phone home.

---

## Traceability

Each requirement should link to:
- Source ticket (`gh issue ...`)
- Tests that verify it
- ADRs that affect its implementation

Maintained as a table in `docs/requirements-traceability.md` once the project
is bootstrapped.

---

## See also

- [goals.md](./goals.md) — business goals and project structure
- [architecture.md](./architecture.md) — technology choices and system shape
- [implementation.md](./implementation.md) — tiered execution plan
