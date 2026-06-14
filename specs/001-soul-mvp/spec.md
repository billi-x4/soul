# Feature Specification: Soul MVP

**Feature Branch**: `001-soul-mvp`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Create the baseline specification for Soul's MVP. Describe WHAT we are building and WHY, from the user's perspective only — no technologies, stack, or implementation. Cover: (1) Sign in, (2) Build a soul, (3) Inspect a soul, (4) Grant & revoke access, (5) Use the soul in AI tools, (6) Prove ownership & portability. Mark post-MVP items out of scope."

## Overview

Soul lets a person build a "second soul" — a personal, owned, searchable collection of knowledge
about themselves — **once**, from their own information, and then use it across the AI tools they
already use. The person signs in with a familiar web login, adds their own data, reviews and curates
what Soul knows, and explicitly grants or revokes each AI tool's access. Crucially, the person — not
Soul — owns the result: they can prove it is intact and rebuild it independently of the Soul app.

The product's promise is **"build once, own it, use it everywhere, control who sees it."** This
specification describes WHAT the MVP must do and WHY, entirely from the person's perspective. It does
not prescribe technology or implementation; those belong in the plan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in with no crypto setup (Priority: P1)

A person visits Soul and signs in with a familiar web login they already use elsewhere. Within
moments they have their own personal Soul account — no new password to invent, no wallet to install,
no seed phrase or recovery phrase to write down, and nothing to pay. They are now the owner of an
(initially empty) soul and can begin adding their information.

**Why this priority**: Sign-in is the gateway to every other capability and embodies a core promise —
the web2-simple, no-crypto, no-fee entry point. Nothing else can be demonstrated without it.

**Independent Test**: Sign in with a familiar web login on a fresh account and confirm a personal,
owned, empty soul exists, with no point at which a seed phrase, wallet, token purchase, or fee was
required.

**Acceptance Scenarios**:

1. **Given** a person who has never used Soul, **When** they sign in with their familiar web login,
   **Then** a personal account is created automatically and they land in a signed-in state that
   identifies the soul as theirs.
2. **Given** the sign-in flow, **When** the person completes it, **Then** at no step are they asked
   to create or store a seed phrase / recovery phrase, install a wallet, hold or buy currency, or pay
   a fee.
3. **Given** a returning person, **When** they sign in again, **Then** they reach their existing soul
   without repeating account setup.
4. **Given** a signed-in person, **When** they view their account, **Then** Soul indicates that they
   own their soul.

---

### User Story 2 - Build a soul from my own data (Priority: P1)

A person fills their soul with their own information. They paste text (e.g., a bio or notes), upload
documents (PDF, Word, plain-text, Markdown), connect their GitHub to import their public activity,
and self-import their OWN X and LinkedIn data (by connecting their account or by uploading their own
downloaded data-export archive). Soul turns each source into organized, searchable knowledge, sorted
into clear areas: **About me, Documents, Social** (GitHub imports are filed under Social). The person can see when their information
has finished processing and is ready to search.

**Why this priority**: This is the heart of the product — turning a person's scattered data into an
organized, searchable, owned soul. Without it the soul is empty and the remaining capabilities have
nothing to act on. Depends on US1.

**Independent Test**: Starting from a signed-in empty soul, add information from each of the four
source types and confirm each becomes searchable knowledge filed under the correct area, with a clear
indication of processing vs ready state.

**Acceptance Scenarios**:

1. **Given** a signed-in person, **When** they paste free text, **Then** Soul turns it into one or
   more searchable knowledge items filed under **About me** (or the area the person chooses).
2. **Given** a signed-in person, **When** they upload a PDF, Word, plain-text, or Markdown document,
   **Then** Soul accepts it, derives searchable knowledge from it, and files it under **Documents**.
3. **Given** a signed-in person, **When** they connect their GitHub, **Then** Soul imports their
   public GitHub information and files the resulting knowledge under **Social**.
4. **Given** a signed-in person, **When** they self-import their own X or LinkedIn data, **Then** Soul
   ingests only that person's own data and files the resulting knowledge under **Social**.
5. **Given** information that has just been submitted, **When** processing is still underway,
   **Then** Soul shows a clear "processing / not yet searchable" status and later shows "ready."
6. **Given** a person attempting to import data, **When** the data is not their own (e.g., a request
   to pull another person's profile), **Then** Soul does not support collecting third-party data.
7. **Given** a person about to add information, **When** they reach the point of adding it, **Then**
   Soul has plainly disclosed who can read their content in readable form under the current setup.

---

### User Story 3 - Inspect and curate my soul (Priority: P2)

A person opens their soul to see exactly what Soul knows about them. They browse by area and search
by describing what they're looking for in their own words. For any item they can see where it came
from (its source) and when it was added, and they can edit or delete it. The person stays in control
of the contents at all times.

**Why this priority**: Trust and control require transparency. Inspection makes the soul honest and
correctable, but a soul can be built and used before a full inspector exists, so it ranks below the
core build/own/use loop. Depends on US1 and US2.

**Independent Test**: With a populated soul, browse each area, run a meaning-based search, open an
item to view its source and date, edit it, and delete another — confirming each action is reflected
in what Soul knows.

**Acceptance Scenarios**:

1. **Given** a populated soul, **When** the person browses, **Then** items are grouped by area
   (About me, Documents, Social) and each item is listed with its source and date added.
2. **Given** a populated soul, **When** the person searches by describing an item in their own words,
   **Then** Soul returns the relevant items even when the exact words don't match.
3. **Given** an item, **When** the person edits its content and saves, **Then** the updated content
   replaces the prior content in what Soul knows and is reflected in future searches.
4. **Given** an item, **When** the person deletes it, **Then** it no longer appears in their soul's
   browse or search results.

---

### User Story 4 - Grant and revoke AI tool access (Priority: P1)

A person connects an external AI tool (such as an AI assistant they use) to their soul. They give the
connection a recognizable label and choose which areas it may access. They can see a list of every
tool currently connected, what each may access, and when it was connected. At any moment they can
revoke a tool — and the revocation is real: that tool can no longer reach the soul afterward. They can
also freeze all access at once. Every grant and revoke is recorded so the person can review the
history.

**Why this priority**: Owner-controlled, real grant/revoke is the differentiating promise that makes
"you own it" meaningful. The moment a revoked tool actually loses access is the headline proof point.
Depends on US1; most valuable once US2 has populated the soul.

**Independent Test**: Connect a tool with access to selected areas, confirm it appears in the
connected-tools list with the correct scope, revoke it, and confirm it can no longer reach the soul;
separately, freeze the account and confirm all tools lose access. Confirm both actions appear in the
history.

**Acceptance Scenarios**:

1. **Given** a signed-in person, **When** they connect a new AI tool and choose the areas it may
   access, **Then** the tool gains access limited to those areas and appears in the connected-tools
   list with its label, scope, and connection date.
2. **Given** one or more connected tools, **When** the person views their permissions, **Then** they
   see every connected tool and exactly what each is allowed to access.
3. **Given** a connected tool, **When** the person revokes it, **Then** that tool can no longer reach
   the soul, and the change is reflected immediately in the connected-tools list.
4. **Given** any state, **When** the person freezes all access, **Then** no connected tool can reach
   the soul until access is restored.
5. **Given** any grant or revoke, **When** it occurs, **Then** it is recorded in a history the person
   can review, with what happened and when.

---

### User Story 5 - Use my soul inside AI tools (Priority: P2)

After connecting an AI tool, the person uses that tool normally. During conversations, the tool can
recall relevant knowledge from the person's soul — limited to the areas it was granted — so it already
knows the person and they don't have to re-explain who they are, what they're working on, or their
preferences. If the tool's access is later revoked or the account is frozen, the tool immediately
stops being able to recall anything.

**Why this priority**: This is the payoff of the whole loop — the soul becomes useful in the tools the
person already uses. It depends on US4 (a granted connection) and US2 (content to recall), so it
follows them.

**Independent Test**: From a connected tool with access to specific areas, ask it something answerable
only from the soul and confirm it recalls the right knowledge; then revoke access and confirm the same
request can no longer be answered from the soul.

**Acceptance Scenarios**:

1. **Given** a tool connected with access to certain areas, **When** the person interacts with the
   tool, **Then** the tool can recall relevant knowledge from those areas without the person
   re-explaining it.
2. **Given** a tool with access to only some areas, **When** it attempts to recall, **Then** it
   retrieves only from its granted areas and not from areas it was not granted.
3. **Given** a connected tool, **When** its access is revoked or the account is frozen, **Then** the
   tool can no longer recall any knowledge from the soul.
4. **Given** two different people each with their own soul, **When** a tool connected to one person
   recalls, **Then** it can only reach that person's soul and never another person's.

---

### User Story 6 - Prove ownership and portability (Priority: P3)

A person wants assurance that the soul is genuinely theirs and not trapped inside one app. They run a
check that confirms their soul is intact and accounted for, and they can rebuild (restore) their
soul's searchable view directly from their own owned store of information — independently of Soul's own
internal convenience records. The restore reports how many items were recovered out of the total,
demonstrating the data is portable and not locked to Soul.

**Why this priority**: Portability and verifiable ownership are central to Soul's premise, and the
restore is a powerful trust demonstration, but daily value (build → control → use) does not depend on
it, so it ranks last among the MVP stories. Depends on US2.

**Independent Test**: With a populated soul, run the integrity check and confirm it reports the soul
as intact; then run a restore that rebuilds the searchable view from the owned store and confirm it
reports recovered-vs-total counts matching the soul's contents.

**Acceptance Scenarios**:

1. **Given** a populated soul, **When** the person runs an integrity check, **Then** Soul reports the
   soul as intact only if every expected item is accounted for and retrievable from the owned store,
   presenting the verified count out of the total and listing any items that could not be verified.
2. **Given** a populated soul, **When** the person runs a restore, **Then** Soul rebuilds the
   searchable view from the person's own owned store and reports how many items were restored out of
   the total.
3. **Given** Soul's internal convenience records were unavailable, **When** the person restores,
   **Then** the soul's contents can still be recovered from the person's owned store.
4. **Given** a signed-in person, **When** they check ownership, **Then** Soul demonstrates that
   ownership of the soul is recorded in a way that does not depend solely on the Soul app.

---

### Edge Cases

- **Processing delay / eventual readiness**: Information just added may not be instantly searchable.
  Soul must communicate "processing" vs "ready" and not present a partially processed soul as
  complete.
- **Unsupported or corrupt upload**: A person uploads a file type Soul does not support, or a damaged
  file. Soul must clearly reject it with a plain-language reason rather than failing silently.
- **Large document**: A very large document is uploaded. Soul MUST enforce a stated maximum size,
  accept documents within it, and reject larger uploads with a plain-language reason — without leaving
  the soul in an inconsistent state.
- **Empty or duplicate input**: A person pastes empty text or re-imports the same source. Soul MUST
  reject empty input with a plain-language reason, and MUST avoid creating duplicate items when the
  same source is re-imported, flagging any obvious duplicates so the person can remove them.
- **Revoke while in use**: A tool is mid-conversation when the person revokes it. The tool must lose
  access within the bound defined in SC-007; further recall attempts must fail.
- **Reconnect after revoke**: A person reconnects a tool they previously revoked. It must be treated
  as a new grant and reappear in the history; the old revoked access must not silently return.
- **Connection limit reached**: A person tries to connect more tools than the soul supports. Soul must
  explain the limit and let them revoke an existing connection to make room.
- **Sign-in interrupted**: Sign-in is abandoned partway. The person must not end up with a broken or
  duplicate account.
- **Delete then search/recall**: After a person deletes an item, it must not appear in subsequent
  searches, browses, or tool recalls.
- **Import of someone else's data**: A person attempts to import data that is not their own. Soul must
  decline to collect third-party data.
- **Privacy expectation mismatch**: A person assumes their content is hidden from the service. Soul
  must have disclosed plainly, before upload, who can read content in readable form under the current
  setup.

## Requirements *(mandatory)*

### Functional Requirements

#### Sign in & ownership

- **FR-001**: System MUST let a person sign in using a single familiar web login they already use,
  without inventing a Soul-specific username/password.
- **FR-002**: System MUST automatically provision one personal account and one soul per person on
  first sign-in, requiring no wallet installation, seed phrase, or recovery phrase.
- **FR-003**: System MUST NOT require the person to hold, buy, or spend any currency or tokens, or pay
  any fee, to sign in or to use any MVP capability.
- **FR-004**: System MUST return a returning person to their existing soul on subsequent sign-ins
  without repeating setup.
- **FR-005**: System MUST establish and represent the person as the owner of their soul.
- **FR-006**: System MUST handle the case where a person permanently loses access to their familiar
  web login. [NEEDS CLARIFICATION: If a person loses access to the web login Soul depends on, what is
  the expected path (if any) to recover access to or ownership of their soul? No safe default is
  assumed, and this materially affects the ownership promise.]

#### Build a soul

- **FR-007**: System MUST let a person add information by pasting free text.
- **FR-008**: System MUST let a person upload documents in PDF, Word, plain-text, and Markdown formats.
- **FR-009**: System MUST let a person connect their GitHub and import their public GitHub information (filed under the Social area).
- **FR-010**: System MUST let a person self-import their OWN X and LinkedIn data, where the person
  supplies their own data (by connecting their own account or by uploading their own downloaded
  data-export archive). [NEEDS CLARIFICATION: For MVP, must self-import support connecting the live X
  / LinkedIn account, or is accepting the person's downloaded data-export archive sufficient? This
  significantly affects scope.]
- **FR-011**: System MUST ingest only the person's OWN data and MUST NOT collect, scrape, or import
  third parties' data.
- **FR-012**: System MUST transform added information into discrete, searchable knowledge items rather
  than only storing the raw input.
- **FR-013**: System MUST organize knowledge into three areas — About me, Documents, Social —
  routing each source to the appropriate area.
- **FR-014**: System MUST let a person find knowledge by describing it in their own words (meaning-
  based search), not only by exact keyword match.
- **FR-015**: System MUST show the status of adding information, clearly distinguishing items still
  being processed from items ready to search.
- **FR-016**: System MUST disclose to the person, in plain language and before they add information,
  who can read their content in readable form under the current setup — including that the service
  processes their content to organize it (i.e., content is not hidden from the service in the default
  mode).

#### Inspect a soul

- **FR-017**: System MUST let a person browse all knowledge in their soul, grouped by area.
- **FR-018**: System MUST let a person search their soul and view matching knowledge items.
- **FR-019**: System MUST show, for each item, its source (where it came from) and the date it was
  added.
- **FR-020**: System MUST let a person edit an item's content, with the change reflected in subsequent
  browsing, search, and tool recall.
- **FR-021**: System MUST let a person delete an item so it no longer appears in browse, search, or
  tool recall. [NEEDS CLARIFICATION: Does "delete" mean permanent, irreversible erasure from all
  storage, or removal from Soul's searchable view while the original may persist in the person's
  underlying owned store? This affects privacy expectations and what the person can promise about
  removed data.]

#### Grant & revoke access

- **FR-022**: System MUST let a person connect an external AI tool to their soul, giving the
  connection a recognizable label.
- **FR-023**: System MUST let the person choose which areas a connected tool may access; area scope
  limits what that tool can retrieve, while revoke (FR-025) and freeze (FR-026) are the absolute,
  owner-controlled cut-offs.
- **FR-024**: System MUST let the person view a list of all connected tools, each showing its label,
  the areas it may access, and when it was connected.
- **FR-025**: System MUST let the person revoke any connected tool such that the tool can no longer
  reach the soul after revocation (revocation is effective, not merely cosmetic).
- **FR-026**: System MUST let the person freeze all access to the soul at once, and later restore
  access.
- **FR-027**: System MUST record every grant, revoke, freeze, import, and restore in a history the
  person can review, showing what happened and when.
- **FR-028**: System MUST support connecting at least 20 tools to a single soul, and MUST clearly
  communicate the limit when reached.

#### Use the soul in AI tools

- **FR-029**: System MUST enable a connected AI tool to recall relevant knowledge from the person's
  soul during the person's conversations, limited to the areas the tool was granted.
- **FR-030**: System MUST allow a connected tool to retrieve relevant context without the person
  re-explaining themselves each session.
- **FR-031**: System MUST ensure that after a tool's access is revoked or the account is frozen, the
  tool can recall nothing from the soul.
- **FR-032**: System MUST scope every tool's recall to its owner's soul only; a tool connected to one
  person's soul MUST NOT reach another person's soul.

#### Prove ownership & portability

- **FR-033**: System MUST let the person verify their soul is intact — confirming every item is
  accounted for and retrievable from their owned store — and present the result, reporting the count
  of items verified out of the total expected and listing any items that could not be verified.
- **FR-034**: System MUST let the person restore (rebuild) their soul's searchable view from their own
  owned store of information, independently of Soul's internal convenience records, and report how
  many items were restored out of the total.
- **FR-035**: System MUST keep the soul recoverable even if Soul's internal convenience records were
  lost, so the soul is not locked to the Soul app.
- **FR-036**: System MUST let the person confirm that ownership of their soul is recorded in a way that
  does not depend solely on the Soul app.

### Key Entities *(include if feature involves data)*

- **Person (Owner)**: The human who signs in; owns exactly one soul; recognized through their familiar
  web login.
- **Soul**: The person's complete, owned collection of knowledge; one per person; the thing that is
  owned, inspected, granted/revoked against, used, and restored.
- **Knowledge item**: A discrete, searchable piece of information derived from a source. Has content,
  a provenance/source, a date added, and an area.
- **Area**: A category that groups knowledge — one of About me, Documents, Social.
- **Source / Imported document**: An original input the person provided (pasted text, uploaded file,
  GitHub import, social self-import). Uploaded documents retain a reference to the original.
- **Connected tool**: An external AI tool the person has granted scoped access. Has a label, the set
  of areas it may access, a connection date, and a status (active / revoked).
- **Activity record**: An entry in the reviewable history capturing grants, revokes, freezes, imports,
  and restores, each with a timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new person can go from arriving at Soul to a signed-in, owned (empty) soul in under 2
  minutes, with zero seed phrases, wallet installs, token purchases, or fees encountered.
- **SC-002**: A person can successfully add information from all four source types — pasted text,
  document upload, GitHub, and X/LinkedIn self-import — and see each filed under the correct area.
- **SC-003**: After adding information, a person can locate a specific known fact by describing it in
  their own words (not exact keywords) and find it among the top 5 results in at least 90% of test
  cases, measured over a fixed evaluation set of known facts.
- **SC-004**: Newly added information becomes searchable within 2 minutes of submission, with a clear
  processing/ready status shown until it is ready.
- **SC-005**: 100% of people are shown a plain-language disclosure of who can read their content before
  their first upload.
- **SC-006**: A connected AI tool can recall the right knowledge in conversation — without the person
  re-explaining — for at least 90% of test prompts about facts known to the soul.
- **SC-007**: When a person revokes a tool, that tool can no longer recall any knowledge from the soul
  within 1 minute, verified by attempting recall after revocation.
- **SC-008**: A person can connect at least 20 AI tools to a single soul.
- **SC-009**: A person can restore their soul from their own owned store and recover 100% of their
  items independently of Soul's internal records, with restored-vs-total counts displayed.
- **SC-010**: A person can confirm ownership of their soul without relying on the Soul app being
  available to assert it.
- **SC-011**: At least 90% of first-time people can build a soul and connect one AI tool without
  assistance.

## Out of Scope (Post-MVP)

The following are explicitly **out of scope** for this MVP and must not be built now unless explicitly
promoted (per the project's scope-discipline principle):

- **"Sign in with Soul" developer SDK** — letting third-party apps authenticate or read souls.
- **Browser extension.**
- **Additional sign-in providers** beyond the single familiar web login. (Note: X and LinkedIn here are
  data-import connections for the person's own data, NOT sign-in providers.)
- **A zero-readable-access privacy mode** in which even the service cannot read the person's content
  (advanced/owner-managed encryption or client-only encryption). MVP discloses that the service can
  read content in readable form to organize it.
- **A self-managed / independent service mode** for moving or hosting the person's data outside the
  default managed experience.
- **Verifiable off-chain computation** guarantees about how the person's data was processed.
- **In-app or agent-to-agent messaging.**
- **A public, shareable identity handle/name** for the soul (optional polish, not MVP-critical).
- **Importing or scraping other people's data** (own-data-only is a hard boundary).

## Assumptions

- **Single web login provider**: MVP supports one familiar web login provider; additional providers are
  out of scope.
- **Default privacy posture**: In the MVP's default mode, the service processes the person's content in
  readable form to organize it; this is disclosed plainly to the person (FR-016). A mode where even the
  service cannot read content is out of scope.
- **Own-data-only imports**: The person imports only their own data; Soul never collects third parties'
  data.
- **Scope vs. absolute control**: Choosing which areas a tool may access limits what that tool
  retrieves; the absolute, owner-guaranteed controls are revoke (FR-025) and freeze (FR-026), which
  fully cut a tool off. Per-area scoping is enforced by Soul's access service.
- **Eventual readiness**: There may be a short delay between adding information and it becoming
  searchable; Soul communicates processing status (FR-015) and the 2-minute target in SC-004 is a
  reasonable default pending validation.
- **Connection capacity**: A soul supports at least 20 connected tools (SC-008); the precise upper
  bound is a reasonable default pending validation.
- **Target metrics are defaults**: The times and percentages in Success Criteria are reasonable default
  targets to be confirmed during validation; they are not contractual until reviewed.
- **Environment**: The person uses a modern web browser with internet connectivity.
- **No fees to the person**: Any costs of operating the soul are borne by the service, never charged to
  the person, for all MVP capabilities (FR-003).

## Dependencies

- The product depends on an external familiar web-login provider for sign-in.
- "Build a soul" depends on external sources the person draws from (their GitHub; their X / LinkedIn
  data, whether connected or supplied as an export archive).
- "Use the soul in AI tools" depends on the person having an external AI tool capable of connecting to
  and recalling from their soul.
