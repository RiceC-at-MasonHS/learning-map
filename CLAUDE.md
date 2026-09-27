# CLAUDE.md

Open-source learning map for AP Cybersecurity: a tech-tree view of a course, a teacher's
plan through it, and (later) a locally hosted record of student evidence and teacher judgments.
Read `docs/DEVELOPMENT_PLAN.md` before proposing features. Record decisions in `docs/DECISIONS.md`.

## Non-negotiables (check every change against these)
- The app never assigns mastery. Evidence (observations) and judgments (teacher decisions) are separate records; the app may only *suggest* a level.
- No student data in `curriculum/`, ever. Student data lives only in the local database.
- Student records reference curriculum by string ref (`ap:3.4.D`, `graph:<node-id>`) + curriculum version. No foreign keys into curriculum tables.
- Prerequisites guide; they don't imprison. Only missing infrastructure hard-blocks an experience.
- Growth credit can only raise a grade.
- No engagement mechanics (streaks, notifications-for-engagement, leaderboards).

## Layout
- `curriculum/course.yaml` — entry point: frameworks, mastery scale, judgment/grading policy, lighthouses
- `curriculum/frameworks/<id>/standards.yaml` — GENERATED from `data/source/*.csv` by `tools/csv_to_yaml.py`. Never hand-edit.
- Curriculum is YAML now; a DB is allowed later ONLY with lossless YAML round-trip (import + export). No single point of control.
- `curriculum/frameworks/<id>/framework.yaml` — hand-authored: levels, demands, layers, threads
- `curriculum/graph/*.yaml` — teacher graph. `kind`: domain | skill | technique | experience. Edges (`requires`, `builds_on`, `relates`, `practices`, `aligns`) live on the owning node only.
- `curriculum/plans/*.yaml` — ordered steps (not weeks); dates are per-section local data
- `schema/*.schema.json` — JSON Schema (draft 2020-12) for every YAML file
- `tools/` — Python utilities (converter, validator)

## Commands
```
pip install -r requirements.txt
python tools/csv_to_yaml.py        # regenerate standards.yaml from the CSV
python tools/validate.py           # schemas, refs, requires-DAG, coverage; exit 1 on error
python tools/validate.py --gaps    # also list uncovered learning objectives
```
Run the validator after any change under `curriculum/` or `schema/`. Keep it passing.

## Conventions
- Node ids: lowercase kebab-case slugs. Experiences start with `x-`, techniques with `t-`.
- Standard refs: `<framework-prefix>:<id>`, e.g. `ap:5.2.D`. Mastery is judged at `learning_objective` level.
- When the schema changes, update the schema, the validator, and the example YAML in the same change.
- Prefer boring, well-documented open-source dependencies. SQLite first; Postgres optional.
- The teacher (repo owner) is the product owner. Propose before building anything user-facing.
