#!/usr/bin/env python3
"""
Read all curriculum YAML and emit app/public/graph-data.json.

Run from the repo root:
    python tools/build_graph_json.py
    # or, using the project venv:
    .venv/bin/python tools/build_graph_json.py
"""
import json
import pathlib
import sys
import yaml

ROOT = pathlib.Path(__file__).parent.parent
CURRICULUM = ROOT / "curriculum"
OUT = ROOT / "app" / "public" / "graph-data.json"


def load_yaml(path: pathlib.Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def main() -> None:
    # ── standards ──────────────────────────────────────────────────────────
    std_raw = load_yaml(CURRICULUM / "frameworks/ap-cybersecurity/standards.yaml")
    standards: dict = {}
    for s in std_raw["standards"]:
        ref = f"ap:{s['id']}"
        standards[ref] = {
            "id": s["id"],
            "ref": ref,
            "level": s["level"],
            "title": s.get("title", s.get("text", "")),
            "text": s.get("text", s.get("title", "")),
            "parent": f"ap:{s['parent']}" if s.get("parent") else None,
            "demand": s.get("demand"),
            "status": s.get("status", "official"),
        }

    # ── threads ─────────────────────────────────────────────────────────────
    fw_raw = load_yaml(CURRICULUM / "frameworks/ap-cybersecurity/framework.yaml")
    threads: list = []
    for t in fw_raw.get("threads", []):
        thread = {
            "id": t["id"],
            "title": t["title"],
            "objectives": list(t.get("objectives", [])),
        }
        if "foundation" in t and t["foundation"] not in thread["objectives"]:
            thread["objectives"] = [t["foundation"]] + thread["objectives"]
            thread["foundation"] = t["foundation"]
        threads.append(thread)

    # ── graph nodes + edges ─────────────────────────────────────────────────
    nodes: list = []
    edges: list = []
    for yaml_file in sorted((CURRICULUM / "graph").glob("*.yaml")):
        raw = load_yaml(yaml_file)
        for node in raw.get("nodes", []):
            n: dict = {
                "id": node["id"],
                "kind": node["kind"],
                "title": node["title"],
            }
            for opt in ("parent", "summary", "format", "purpose",
                        "duration_min", "evidence", "commands", "notes"):
                if opt in node:
                    n[opt] = node[opt]

            aligns = node.get("aligns", [])
            n["aligns"] = aligns

            # Extract edges from node definitions
            for req in node.get("requires", []):
                edges.append({"source": node["id"], "target": req, "type": "requires"})
            for bo in node.get("builds_on", []):
                edges.append({"source": node["id"], "target": bo, "type": "builds_on"})
            for rel in node.get("relates", []):
                edges.append({"source": node["id"], "target": rel, "type": "relates"})
            for pr in node.get("practices", []):
                edges.append({"source": node["id"], "target": pr, "type": "practices"})

            nodes.append(n)

    # ── thread → node membership ────────────────────────────────────────────
    for thread in threads:
        obj_set = set(thread["objectives"])
        thread["node_ids"] = [
            n["id"] for n in nodes
            if any(a in obj_set for a in n.get("aligns", []))
        ]

    # ── plan steps ──────────────────────────────────────────────────────────
    plan_raw = load_yaml(CURRICULUM / "plans/ap-cyber-starter.yaml")
    plan_steps: list = []
    for step in plan_raw["plan"].get("steps", []):
        ps: dict = {
            "id": step["id"],
            "title": step["title"],
            "sync": step.get("sync", True),
        }
        for opt in ("experiences", "choices", "reveals", "notes"):
            if opt in step:
                ps[opt] = step[opt]
        plan_steps.append(ps)

    # ── write ────────────────────────────────────────────────────────────────
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out = {
        "nodes": nodes,
        "edges": edges,
        "threads": threads,
        "standards": standards,
        "plan_steps": plan_steps,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    node_counts = {k: sum(1 for n in nodes if n["kind"] == k)
                   for k in ("domain", "skill", "technique", "experience")}
    print(f"Wrote {OUT}")
    print(f"  {len(nodes)} nodes: " +
          ", ".join(f"{v} {k}" for k, v in node_counts.items()))
    print(f"  {len(edges)} edges, {len(threads)} threads, "
          f"{len(plan_steps)} plan steps, {len(standards)} standards")


if __name__ == "__main__":
    main()
