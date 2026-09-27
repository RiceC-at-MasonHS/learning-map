# Development Plan

A durably open-source tool that helps students see where they're going in a field and how they're progressing, and helps a teacher plan, guide, and record that journey. It is a successor to [learner-profile-flowchart](https://github.com/crice009/learner-profile-flowchart) (AGPL-3.0), whose 2017 slides already pointed at a Civilization-style tech tree.

## Non-negotiables

These are the tests every feature has to pass. If a feature fails one, it doesn't ship.

1. **Human judgment is central.** The tool records and organizes what a teacher observes and decides. It never assigns a mastery level on its own. It may *suggest*; a person *decides*.
2. **The school owns student data.** Curriculum is shareable and public. Student records live in a local database the school controls. Self-hosting is the first-class path; hosting-as-a-service is a convenience layered on top.
3. **Grades reflect knowledge, not gaming.** Highest credible evidence wins. Growth can only raise a grade. Nobody benefits from sandbagging, and advanced students lose nothing.
4. **Shared experience is protected.** Individual pacing happens between sync points, never instead of them.
5. **A counterpoint to the feed.** Students choose their direction toward visible goals. No streaks, no engagement optimization, no infinite scroll.
6. **Organic growth.** Each phase has to survive a real classroom before the next one starts.

## What changed from the source conversation

The earlier documents had the right vision but a few structural problems that would have been expensive to discover later.

**Evidence and judgment are now separate records.** The earlier `submitActivity()` called `assessAgainstRubric()` and took a `Math.max` to set mastery automatically. That's an auto-grader, which contradicts principle 1. Now, *evidence* is an observation ("Maya ranked attacking IPs with one pipeline, peer-supported"), and a *judgment* is a teacher's decision ("Maya: proficient on ap:4.4.D, because…") that cites evidence. The app can pre-fill a suggested level from the highest evidence; the teacher confirms or changes it.

**There is no "completed" status.** Learning isn't a checkbox. Each student has a judged level per objective or skill. A `requires` edge is satisfied when the prerequisite is judged at or above a threshold (default: developing), or when the teacher records an override. This is also how the student who already knows the terminal skips `hello world`: a two-minute demonstration becomes a judgment, and the path opens.

**Visibility and permission are different things.** Fog of war controls what a student *sees* (revealed by the plan, and by the neighbors of what they've demonstrated). Prerequisites control what the tool *suggests* next. Nothing a student can see is forbidden to explore; curiosity is the point. The only hard gate is infrastructure: an experience whose lab isn't running shows as "waiting on lab," not "locked."

**Plans are ordered steps, not weeks.** Snow days, testing weeks, and two sections moving at different speeds break week numbers. A plan is a sequence; each class section maps steps to dates in its own local calendar.

**Curriculum is authored as plain-text YAML; storage is an implementation choice.** The rule that matters isn't "git, never a database" — it's *no single point of control*. So YAML is the canonical authoring and interchange format and the seed for Phase 0/1 (no app, no lock-in, diffable, forkable). Once the in-app editor exists (Phase 4), the app may keep curriculum in its database if that's the better fit, **on one condition: lossless YAML import and export round-trips, exposed as a one-click operation and a CLI.** Anyone can pull the whole curriculum out as text at any time, edit it in a text editor, and push it back. That keeps the Wikipedia-like fork/PR path open whether or not the running instance happens to use a database.

The one hard rule is separation: student records must never live in the same tables that own curriculum, and there are no foreign keys from student data into curriculum. Student records refer to curriculum by string reference (`ap:3.4.D`, `graph:linux-permissions`) plus the curriculum version they were recorded against. The earlier schema put `curriculum_nodes` in the same database as `students` with foreign keys between them, which re-coupled the two sides the architecture was meant to keep apart; that specific coupling is what we avoid, not databases in general.

**There are two graphs, joined by a crosswalk.** External standards (the AP CED; later Ohio, CSTA, NICE) are read-only frameworks with their own hierarchies. The teacher's graph (domains, skills, techniques, experiences) is editable and aligns *to* one or more frameworks. The earlier documents blurred these, which would have made adding Ohio standards painful.

**Mastery is judged at the learning-objective level.** The CED has 5 units, 24 topics, 79 learning objectives, and 335 essential-knowledge statements. Topics are too coarse to grade; essential knowledge is too fine (and is reference material, not a skill). The 79 objectives are the assessable unit, and teacher-graph skills roll up to them through `aligns`.

**Each edge has one source of truth.** Edges are written on the node that owns them in YAML. The app derives an edge index; it never stores edges twice.

## A finding in the standards: the course is a grid

Units 2 through 5 repeat the same argument at four layers of defense in depth (physical, network, device, application/data): identify attacks, explain how vulnerabilities are exploited, assess risk, apply controls, detect attacks. This is encoded in `framework.yaml` as `layers` and `threads`.

This matters for three reasons. First, it's a spiral curriculum that's already built into the standards, and threads let the map make each spiral explicit ("you assessed physical risk in the building audit; this is the same move at the network layer"). Second, the tech tree can offer a grid view (layers × threads) alongside the dependency view. Third, it suggests an assessment design: the same risk-assessment rubric can be reused across layers, so growth over the year is directly comparable.

## Architecture

```
┌─────────────────────────── shareable (public repo) ───────────────────────────┐
│ curriculum/                                                                    │
│   course.yaml          scale, judgment policy, grading policy, lighthouses     │
│   frameworks/<id>/     external standards (generated) + metadata, threads      │
│   graph/*.yaml         domains, skills, techniques, experiences (teacher-owned)│
│   plans/*.yaml         ordered steps, sync points, choices, reveals, infra     │
└────────────────────────────────────────────────────────────────────────────────┘
                 │ loaded at startup (validated) — pinned to a curriculum version
┌─────────────────────────── local (school-controlled) ─────────────────────────┐
│ app server  ── SQLite file (default) or Postgres                               │
│   people · sections · enrollments · section_calendar · infra_status            │
│   evidence · judgments · overrides · reflections · choices                     │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Local data model (sketch, for Phase 2)

```sql
-- Nothing in this database is ever committed to the curriculum repo.
people        (id, display_name, role /*student|teacher*/, local_ref, created_at)  -- email optional
sections      (id, course_id, title, term, plan_id, curriculum_sha)
enrollments   (section_id, person_id)
section_calendar (section_id, step_id, opens_on, closes_on)        -- plan steps -> real dates
infra_status  (section_id, infra_id, available, updated_at)         -- "is the Docker lab up?"

evidence   (id, student_id, target_ref, experience_id, context /*independent|peer|teacher*/,
            note, artifact_url, recorded_by, observed_at, curriculum_sha)
judgments  (id, student_id, target_ref, level /*1-4*/, rationale, evidence_ids,
            decided_by, decided_at, curriculum_sha)
overrides  (id, student_id, target_ref, kind /*satisfied|excused*/, reason, by, at)
reflections(id, student_id, target_ref, step_id, prompt, response, created_at)
choices    (student_id, step_id, experience_id)                     -- which trail they took
```

Evidence and judgments are append-only. The history *is* the growth story. The current level is the latest judgment. Grade export is a transparent view over judgments plus the `grading` block in `course.yaml`.

### Stack recommendation

**Curriculum format.** YAML validated by JSON Schema. It's human-readable, diffable, works with VS Code autocomplete through the `yaml-language-server` modelines already in each file, and is language-neutral.

**App.** TypeScript end to end, as a single process that serves both UI and API. The recommendation is SvelteKit with the Node adapter, since it's the least code for a small maintainer team. React + Vite is the conventional alternative if a larger contributor pool matters more. Decide this in the first Claude Code session and record it in `DECISIONS.md`.

**Graph rendering.** Cytoscape.js, which continues v4. Use `cytoscape-elk` with the layered algorithm to get a tech-tree layout from the `requires` DAG, and compound nodes for domains. Semantic zoom means toggling classes by `kind` and standards level on zoom events, so zoomed out you see domains and units, and zoomed in you see techniques and essential knowledge. Only render essential knowledge for the focused topic, to keep hundreds of nodes manageable.

**Local database.** SQLite by default: one file, backup by copying it, and it runs on a teacher laptop or a school VM. Postgres is optional. Use an ORM that supports both, such as Drizzle.

**Self-hosting.** One container image and a `compose.yaml`, so `docker compose up` is the whole install. There's a nice symmetry here: the course teaches containers, and the tool is self-hosted with containers. Students could help run it.

**Auth.** Phase 2 is teacher-only on localhost. Phase 3 adds OIDC through Google or Microsoft, since schools already have those accounts.

**Interoperability (later).** These are 1EdTech open standards worth targeting rather than inventing formats. OneRoster CSV for roster import from the SIS. CASE for importing standards frameworks like Ohio's. Open Badges 3.0 and the Comprehensive Learner Record (CLR) for portable, verifiable student records, which is the route to the "universities and employers can read it" goal without building a product for them.

## Phases

Each phase ends with a classroom test: a question only real use can answer.

### Phase 0 — Data foundation (this repo, now)
YAML curriculum, schemas, CSV converter, validator, and coverage report. Fill in official titles for Units 3–5, identify the 16 lighthouses, and extend the graph and plan through the first semester.

**Classroom test:** Can you plan the first nine weeks against the CED and see the gaps before teaching them?

### Phase 1 — The map (read-only, no student data)
A static site built from the YAML and published on GitHub Pages. It includes the tech tree with semantic zoom, the standards↔graph crosswalk, thread highlighting, the plan overlaid as a path, and a coverage heatmap by unit and demand. Because there's no student data yet, there's no privacy risk and nothing to host. During this phase, keep logging evidence however you do now (spreadsheet or notebook), because that becomes the design research for Phase 2.

**Classroom test:** Do you and your students actually use the map on the projector to talk about where the class is and where it's going?

### Phase 2 — Evidence log (teacher only, local)
Roster CSV import, and a quick-log screen: pick a step or experience, see a grid of students, tap a level, add an optional note. The target is under ten seconds per student. The teacher confirms judgments separately from evidence. Includes a per-student timeline and a CSV grade export.

**Classroom test:** After three weeks, is logging faster than your current method, and did you ever go back and use what you logged?

### Phase 3 — Student view
A personal map with fog of war, lighthouses, the plan's path, "choose a trail" steps, reflections, and the teacher's judgments with rationale. Requires sign-in.

**Classroom test:** Can a student explain where they are, where they're headed, and why they chose their trail?

### Phase 4 — In-app editor
Click to add a node, edge, or experience. Edits write YAML and commit to git, so the editor and a text editor stay interchangeable. Includes a plan editor with drag-to-reorder.

**Classroom test:** Can you add a new tool mid-year in under two minutes without opening a code editor?

### Phase 5 — Portability and sharing
Student record export (JSON plus a readable PDF), Open Badges/CLR, CASE import for Ohio standards, multi-section and multi-teacher support, and the optional hosted service.

## Open questions

1. **The 16 lighthouses.** The source conversation says the visible goals should be "the 16 stated primary learning targets" in the CED. The CSV has 5 units, 24 topics, and 79 objectives, and none of those counts is 16. Are they the CED's course skills or practices, which aren't in this CSV? They'd become a second axis in `framework.yaml`, and `course.yaml → lighthouses` would point at them.
2. **Official titles for Units 3–5 and their 15 topics.** They're marked `status: draft` in `standards.yaml` — inferred from their objectives and awaiting the real headings.
3. **Grade formula.** Deliberately deferred until a semester of real evidence exists (see `course.yaml → grading`).
4. **Repo name and home.** Is this v5 of `learner-profile-flowchart`, or a new repo? Keep AGPL-3.0 either way, since its network clause is what keeps hosted forks open.
5. **Two `perform` objectives are hard to make hands-on** in a normal classroom: applying physical-attack detection (`ap:2.4.C`) and configuring wireless security features (`ap:3.2.B`). They're currently covered by an activity and a demo. Fine unless you have the gear (a spare AP, physical sensors) to make them labs.

## Suggested first Claude Code session

> Read CLAUDE.md and docs/DEVELOPMENT_PLAN.md. Run `python tools/validate.py --gaps`. Then propose (don't build yet) the Phase 1 map viewer: framework choice with trade-offs, how the YAML is loaded and typed, and how semantic zoom and fog of war will work in Cytoscape. Record the decisions in docs/DECISIONS.md. After I approve, scaffold the viewer so it renders `curriculum/` as a tech tree with domain compound nodes and zoom-dependent detail.
