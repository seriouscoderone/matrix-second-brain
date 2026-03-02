#!/usr/bin/env python3
"""
generate-blackbox-template.py — Regenerates blackbox/templates/{suite}_test.template.json
from the feature.md files in spec/apps/{app}/features/.

Run this whenever BDD scenarios are added or renamed to keep the template in sync.

Usage:
  python3 scripts/generate-blackbox-template.py --suite matrix-second-brain
  python3 scripts/generate-blackbox-template.py --suite matrix-second-brain --dry-run
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


SCENARIO_PATTERN = re.compile(
    r"^###\s+Scenario(?P<outline>\s+Outline)?:\s+(?P<title>.+)$",
    re.MULTILINE,
)
EXAMPLES_HEADER = re.compile(r"^Examples:", re.MULTILINE)
TABLE_ROW = re.compile(r"^\|(?P<cells>[^|]+(?:\|[^|]+)+)\|", re.MULTILINE)

UNTESTED_SCENARIO = {
    "_type": "scenario",
    "status": "UNTESTED",
    "message": None,
    "error_detail": None,
    "steps_to_reproduce": [],
    "last_run": None,
    "build_id": None,
}

UNTESTED_OUTLINE = {
    "_type": "scenario_outline",
    "status": "UNTESTED",
    "message": None,
    "error_detail": None,
    "steps_to_reproduce": [],
    "last_run": None,
    "build_id": None,
    "examples": [],
}


def parse_feature_file(path: Path) -> dict:
    """Parse a .feature.md file and return a dict of scenario_title -> entry."""
    text = path.read_text(encoding="utf-8")
    feature_match = re.search(r"^#\s+Feature:\s+(.+)$", text, re.MULTILINE)
    feature_name = feature_match.group(1).strip() if feature_match else path.stem

    scenarios = {}
    matches = list(SCENARIO_PATTERN.finditer(text))

    for i, m in enumerate(matches):
        title = m.group("title").strip()
        is_outline = bool(m.group("outline"))

        if is_outline:
            entry = dict(UNTESTED_OUTLINE)
            # Extract examples table from this block (up to next scenario or EOF)
            block_start = m.end()
            block_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            block = text[block_start:block_end]

            ex_match = EXAMPLES_HEADER.search(block)
            if ex_match:
                table_text = block[ex_match.end():]
                rows = TABLE_ROW.findall(table_text)
                if len(rows) >= 2:
                    headers = [c.strip() for c in rows[0].split("|") if c.strip()]
                    examples = []
                    for row in rows[1:]:
                        cells = [c.strip() for c in row.split("|") if c.strip()]
                        if len(cells) == len(headers):
                            # Try to coerce numeric values
                            example = {}
                            for h, c in zip(headers, cells):
                                try:
                                    example[h] = int(c)
                                except ValueError:
                                    try:
                                        example[h] = float(c)
                                    except ValueError:
                                        example[h] = c
                            examples.append(example)
                    entry["examples"] = examples
        else:
            entry = dict(UNTESTED_SCENARIO)

        scenarios[title] = entry

    return {"feature": feature_name, "file": str(path), "scenarios": scenarios}


def merge_with_existing(new_feature: dict, existing_feature: dict) -> dict:
    """
    When regenerating, preserve PASSED/FAILED status for scenarios that still
    exist and have the same title. New scenarios are UNTESTED. Removed scenarios
    are dropped.
    """
    existing_scenarios = existing_feature.get("scenarios", {})
    for title, entry in new_feature["scenarios"].items():
        if title in existing_scenarios:
            old = existing_scenarios[title]
            if old.get("status") in ("PASSED", "FAILED"):
                new_feature["scenarios"][title] = old
    return new_feature


def main():
    parser = argparse.ArgumentParser(description="Generate or regenerate the blackbox test template.")
    parser.add_argument("--suite", required=True, help="Suite name (e.g. matrix-second-brain)")
    parser.add_argument("--app", help="App directory name (defaults to same as --suite)")
    parser.add_argument("--dry-run", action="store_true", help="Print template to stdout, don't write file")
    parser.add_argument("--preserve-results", action="store_true",
                        help="Preserve PASSED/FAILED status from existing template for matching scenarios")
    args = parser.parse_args()

    app_name = args.app or args.suite
    features_dir = Path("spec/apps") / app_name / "features"
    output_path = Path("blackbox/templates") / f"{args.suite}_test.template.json"

    if not features_dir.exists():
        print(f"ERROR: Features directory not found: {features_dir}", file=sys.stderr)
        sys.exit(1)

    feature_files = sorted(features_dir.glob("*.feature.md"))
    if not feature_files:
        print(f"ERROR: No .feature.md files found in {features_dir}", file=sys.stderr)
        sys.exit(1)

    # Load existing template for result preservation
    existing_template = {}
    if args.preserve_results and output_path.exists():
        try:
            existing_template = json.loads(output_path.read_text())
        except Exception:
            pass

    template = {
        "_meta": {
            "suite": args.suite,
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "schema_version": "1.0",
            "note": (
                "This is a Matrix bot service — no browser UI. "
                "The test agent executes scenarios via Matrix API calls "
                "(send message, read reply) rather than browser automation. "
                "base_url in manifest.json is the Matrix homeserver URL (e.g., http://localhost:8008)."
            ),
        },
        app_name: {},
    }

    for feature_file in feature_files:
        feature_key = feature_file.stem.replace(".feature", "")
        parsed = parse_feature_file(feature_file)

        if args.preserve_results:
            existing_app = existing_template.get(app_name, {})
            existing_feature = existing_app.get(feature_key, {})
            parsed = merge_with_existing(parsed, existing_feature)

        template[app_name][feature_key] = parsed

    output_json = json.dumps(template, indent=2, ensure_ascii=False)

    if args.dry_run:
        print(output_json)
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output_json + "\n", encoding="utf-8")
        scenario_count = sum(
            len(f["scenarios"])
            for f in template[app_name].values()
        )
        print(f"✓ Generated {output_path}")
        print(f"  {len(feature_files)} features, {scenario_count} scenarios")


if __name__ == "__main__":
    main()
