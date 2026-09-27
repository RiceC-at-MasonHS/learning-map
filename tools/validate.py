#!/usr/bin/env python3
"""
Validate everything under curriculum/ and print a standards coverage report.

  python tools/validate.py            # validate + short coverage summary
  python tools/validate.py --gaps     # also list every uncovered learning objective

Exit code 1 on any ERROR (so it can gate CI). WARNINGs never fail the build.

Checks:
  1. Every YAML file matches its JSON Schema.
  2. IDs are unique; every reference resolves
     (parent, requires, builds_on, relates, practices, aligns, plan steps, reveals, infra, threads).
  3. Parent kinds make sense: technique -> skill, skill -> domain.
  4. `requires` has no cycles (it must be a DAG to draw as a tech tree).
  5. Coverage: which learning objectives are reached by at least one experience
     (directly, or through a skill the experience practices), and whether
     `perform` objectives are reached by at least one hands-on experience.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
CUR = ROOT / "curriculum"
SCHEMA = ROOT / "schema"
HANDS_ON = {"lab", "project", "ctf"}

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load(path):
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def check_schema(data, schema_name, path):
    schema = json.loads((SCHEMA / schema_name).read_text())
    for e in sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: list(e.path)):
        loc = "/".join(str(p) for p in e.path) or "(root)"
        err(f"{path.relative_to(ROOT)} @ {loc}: {e.message}")


def main():
    show_gaps = "--gaps" in sys.argv

    # ── Course ─────────────────────────────────────────────────────────────
    course_path = CUR / "course.yaml"
    course = load(course_path)
    check_schema(course, "course.schema.json", course_path)

    # ── Frameworks ─────────────────────────────────────────────────────────
    standards = {}          # "ap:1.1.A" -> record
    prefixes = {}
    threads = []
    for fw_id in course["course"]["frameworks"]:
        fw_dir = CUR / "frameworks" / fw_id
        meta_p, std_p = fw_dir / "framework.yaml", fw_dir / "standards.yaml"
        meta, std = load(meta_p), load(std_p)
        check_schema(meta, "framework.schema.json", meta_p)
        check_schema(std, "standards.schema.json", std_p)
        prefix = meta["framework"]["prefix"]
        prefixes[prefix] = fw_id
        local_ids = set()
        for s in std["standards"]:
            if s["id"] in local_ids:
                err(f"{fw_id}: duplicate standard id {s['id']}")
            local_ids.add(s["id"])
            standards[f"{prefix}:{s['id']}"] = s
        for s in std["standards"]:
            if "parent" in s and s["parent"] not in local_ids:
                err(f"{fw_id}: {s['id']} has unknown parent {s['parent']}")
            if s["status"] == "draft":
                warn(f"{fw_id}: {s['id']} '{s.get('title', '')}' is a DRAFT title — replace with official")
        for t in meta.get("threads", []):
            threads.append(t)
            for ref in t["objectives"] + ([t["foundation"]] if "foundation" in t else []):
                if ref not in standards:
                    err(f"thread {t['id']}: unknown standard {ref}")

    # ── Graph ──────────────────────────────────────────────────────────────
    nodes = {}
    for gp in sorted((CUR / "graph").glob("*.yaml")):
        g = load(gp)
        check_schema(g, "graph.schema.json", gp)
        for n in g.get("nodes", []):
            if n["id"] in nodes:
                err(f"duplicate node id '{n['id']}' in {gp.name}")
            nodes[n["id"]] = n

    expected_parent = {"technique": {"skill"}, "skill": {"domain"}, "experience": set(), "domain": set()}
    for n in nodes.values():
        nid = n["id"]
        if "parent" in n:
            p = nodes.get(n["parent"])
            if not p:
                err(f"{nid}: unknown parent '{n['parent']}'")
            elif p["kind"] not in expected_parent[n["kind"]]:
                err(f"{nid}: a {n['kind']} can't sit under a {p['kind']} ({n['parent']})")
        elif n["kind"] in ("skill", "technique"):
            warn(f"{nid}: {n['kind']} has no parent — it will float outside every domain when zoomed out")
        for field in ("requires", "builds_on", "relates", "practices"):
            for ref in n.get(field, []):
                if ref not in nodes:
                    err(f"{nid}.{field}: unknown node '{ref}'")
                elif field == "practices" and nodes[ref]["kind"] not in ("skill", "technique"):
                    err(f"{nid}.practices: '{ref}' is a {nodes[ref]['kind']}, expected a skill or technique")
        for ref in n.get("aligns", []):
            if ref.split(":")[0] not in prefixes:
                err(f"{nid}.aligns: unknown framework prefix in '{ref}'")
            elif ref not in standards:
                err(f"{nid}.aligns: unknown standard '{ref}'")

    # Cycle check on requires (DFS with colors)
    WHITE, GRAY, BLACK = 0, 1, 2
    color = defaultdict(int)

    def visit(u, stack):
        color[u] = GRAY
        for v in nodes[u].get("requires", []):
            if v not in nodes:
                continue
            if color[v] == GRAY:
                err("requires cycle: " + " -> ".join(stack + [u, v]))
            elif color[v] == WHITE:
                visit(v, stack + [u])
        color[u] = BLACK

    for nid in nodes:
        if color[nid] == WHITE:
            visit(nid, [])

    # ── Plans ──────────────────────────────────────────────────────────────
    planned_experiences = set()
    for pp in sorted((CUR / "plans").glob("*.yaml")):
        doc = load(pp)
        check_schema(doc, "plan.schema.json", pp)
        plan = doc.get("plan", {})
        infra_ids = {i["id"] for i in plan.get("infrastructure", [])}
        step_ids = set()
        for st in plan.get("steps", []):
            if st["id"] in step_ids:
                err(f"{pp.name}: duplicate step id {st['id']}")
            step_ids.add(st["id"])
            for ref in st.get("experiences", []) + st.get("choices", []):
                if ref not in nodes:
                    err(f"{pp.name}/{st['id']}: unknown experience '{ref}'")
                elif nodes[ref]["kind"] != "experience":
                    err(f"{pp.name}/{st['id']}: '{ref}' is a {nodes[ref]['kind']}, not an experience")
                else:
                    planned_experiences.add(ref)
                    for inf in nodes[ref].get("requires_infra", []):
                        if inf not in infra_ids:
                            err(f"{pp.name}: experience '{ref}' needs infra '{inf}' which the plan doesn't declare")
            for ref in st.get("reveals", []):
                if ref not in nodes and ref not in standards:
                    err(f"{pp.name}/{st['id']}: reveals unknown '{ref}'")
        for ref in plan.get("initial_reveal", {}).get("nodes", []):
            if ref not in nodes and ref not in standards:
                err(f"{pp.name}: initial_reveal unknown '{ref}'")

    # ── Coverage ───────────────────────────────────────────────────────────
    # An experience reaches a standard directly (aligns) or via a practiced skill's aligns.
    # Aligning to a topic counts for every learning objective under it.
    def expand(ref):
        s = standards[ref]
        if s["level"] == "learning_objective":
            return {ref}
        prefix = ref.split(":")[0]
        return {k for k, v in standards.items()
                if k.startswith(prefix + ":") and v["level"] == "learning_objective"
                and (k.split(":")[1] + ".").startswith(s["id"] + ".")}

    reached = defaultdict(set)   # LO ref -> set of experience ids
    for x in (n for n in nodes.values() if n["kind"] == "experience"):
        refs = set(x.get("aligns", []))
        for sk in x.get("practices", []):
            refs |= set(nodes.get(sk, {}).get("aligns", []))
        for r in refs:
            if r in standards:
                for lo in expand(r):
                    reached[lo].add(x["id"])

    los = {k: v for k, v in standards.items() if v["level"] == "learning_objective"}
    covered = [k for k in los if reached[k]]
    perform = [k for k, v in los.items() if v.get("demand") == "perform"]
    perform_hands_on = [k for k in perform
                        if any(nodes[x].get("format") in HANDS_ON for x in reached[k])]

    unplanned = sorted(n["id"] for n in nodes.values()
                       if n["kind"] == "experience" and n["id"] not in planned_experiences)

    # ── Report ─────────────────────────────────────────────────────────────
    kinds = defaultdict(int)
    for n in nodes.values():
        kinds[n["kind"]] += 1
    print(f"Graph: " + ", ".join(f"{v} {k}" for k, v in sorted(kinds.items())))
    print(f"Standards: {len(standards)} records, {len(los)} learning objectives, {len(threads)} threads")
    print(f"Coverage: {len(covered)}/{len(los)} learning objectives reached by an experience")
    print(f"          {len(perform_hands_on)}/{len(perform)} 'perform' objectives reached by a hands-on experience")
    by_unit = defaultdict(lambda: [0, 0])
    for k in los:
        u = k.split(":")[1].split(".")[0]
        by_unit[u][1] += 1
        by_unit[u][0] += bool(reached[k])
    print("          by unit: " + "  ".join(f"U{u} {c}/{t}" for u, (c, t) in sorted(by_unit.items())))
    if unplanned:
        warn(f"experiences not used in any plan: {', '.join(unplanned)}")

    if show_gaps:
        print("\nUncovered learning objectives:")
        for k, v in los.items():
            if not reached[k]:
                print(f"  {k:10} [{v.get('demand', '?'):9}] {v['text'][:90]}")

    drafts = [w for w in warnings if "DRAFT" in w]
    others = [w for w in warnings if "DRAFT" not in w]
    if drafts:
        print(f"\nWARNING: {len(drafts)} standards have draft titles (run with care; see standards.yaml status: draft)")
    for w in others:
        print(f"WARNING: {w}")
    for e in errors:
        print(f"ERROR: {e}")
    print(f"\n{'FAIL' if errors else 'OK'} — {len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
