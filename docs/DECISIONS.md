# Decisions

Short records of choices that shape the project. Newest at the bottom. Status: accepted | proposed | superseded.

### D1 — Curriculum authored as YAML; storage is flexible (accepted, amends earlier "git-only" stance)
The requirement is *no single point of control*, not "never a database." YAML is the canonical authoring/interchange format and the Phase 0/1 seed. Once the in-app editor ships, curriculum may be stored in a database **iff** lossless YAML import/export round-trips (one-click + CLI). Student records pin the curriculum version they were recorded against.

### D2 — Local student data, SQLite first (accepted)
Each school runs its own instance. SQLite by default (single file, trivial backup); Postgres optional. Hosted service is an optional layer, never a requirement.

### D2b — Curriculum and student data stay separated (accepted)
No foreign keys from student data into curriculum tables; student records reference curriculum by string ref + version. This is the coupling the earlier design accidentally created, and the one invariant we protect regardless of storage engine.

### D3 — Evidence ≠ judgment (accepted)
Evidence records observations; judgments record a teacher's decided level with rationale. The app never writes a judgment without a human confirming it.

### D4 — Mastery judged at learning-objective level (accepted)
79 AP learning objectives are the assessable unit. Essential knowledge is zoom-in reference. Teacher-graph skills roll up via `aligns`.

### D5 — Plans are ordered steps, not weeks (accepted)
Section calendars map steps to dates locally.

### D6 — Visibility ≠ permission (accepted)
Fog of war controls what is shown; `requires` controls what is suggested; only unavailable infrastructure blocks.

### D7 — Frontend framework (accepted)
React + Vite with TypeScript. Chosen over SvelteKit for larger LLM training corpus (AI tooling produces more reliable output) and broader contributor pool. Static build for Phase 1 via `vite build`; GitHub Pages via `gh-pages` branch. Phase 2+ will add a Node server behind the same Vite build.

### D8 — Graph rendering: D3.js + SVG with build-time-fixed positions (accepted)
Cytoscape.js is superseded. Layout algorithm (dagre) runs once at build time; positions are committed to `app/src/graph-positions.json`. The map never rearranges on page load, preserving student spatial memory. Rendering is D3.js + SVG inside React. Semantic zoom: SVG `transform` scale on a `<g>` container; node detail toggled by CSS class at zoom thresholds. Positions can be regenerated deliberately (a script) or hand-edited for geographic grouping.
