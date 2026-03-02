#!/usr/bin/env python3
"""
summarize-results.py — Reads final_test_results/results.json and prints a
human-readable summary grouped by feature, with FAILED scenario details.

Usage:
  python3 scripts/summarize-results.py --build-token <token>
  python3 scripts/summarize-results.py --build-token <token> --failed-only
"""

import argparse
import json
import sys
from pathlib import Path


SYMBOLS = {"PASSED": "✓", "FAILED": "✗", "UNTESTED": "?"}
COLORS = {
    "PASSED": "\033[32m",   # green
    "FAILED": "\033[31m",   # red
    "UNTESTED": "\033[33m", # yellow
    "RESET": "\033[0m",
}


def colorize(status, text):
    return f"{COLORS.get(status, '')}{text}{COLORS['RESET']}"


def main():
    parser = argparse.ArgumentParser(description="Summarize test results for a build.")
    parser.add_argument("--build-token", required=True)
    parser.add_argument("--failed-only", action="store_true", help="Only show FAILED scenarios")
    parser.add_argument("--no-color", action="store_true", help="Disable ANSI color output")
    args = parser.parse_args()

    if args.no_color:
        for k in COLORS:
            COLORS[k] = ""

    results_path = Path("blackbox/builds") / args.build_token / "final_test_results" / "results.json"
    if not results_path.exists():
        # Fall back to streaming results
        results_path = Path("blackbox/builds") / args.build_token / "test_results.json"
        if not results_path.exists():
            print(f"ERROR: No results found for build token '{args.build_token}'", file=sys.stderr)
            print(f"Expected: {results_path}", file=sys.stderr)
            sys.exit(1)
        print(f"NOTE: Using streaming results (test cycle may still be running)\n")

    data = json.loads(results_path.read_text())
    meta = data.get("_meta", {})

    print("=" * 60)
    print(f"Test Results — {meta.get('suite', 'unknown suite')}")
    print(f"Build:   {meta.get('build_token', args.build_token)}")
    print(f"Tested:  {meta.get('tested_at', 'unknown')}")
    print("=" * 60)
    print()

    total = passed = failed = untested = 0
    failures = []

    for app_key, app_data in data.items():
        if app_key == "_meta":
            continue

        print(f"App: {app_key}")
        print("-" * 40)

        for feature_key, feature_data in app_data.items():
            feature_name = feature_data.get("feature", feature_key)
            scenarios = feature_data.get("scenarios", {})

            if args.failed_only:
                visible = {k: v for k, v in scenarios.items() if v.get("status") == "FAILED"}
            else:
                visible = scenarios

            if not visible:
                continue

            print(f"\n  {feature_name}")

            for scenario_title, result in visible.items():
                status = result.get("status", "UNTESTED")
                symbol = SYMBOLS.get(status, "?")
                line = f"    {symbol} {scenario_title}"
                print(colorize(status, line))

                if status == "FAILED":
                    msg = result.get("message", "")
                    if msg:
                        print(f"        Message: {msg}")
                    failures.append((feature_name, scenario_title, result))

                total += 1
                if status == "PASSED":
                    passed += 1
                elif status == "FAILED":
                    failed += 1
                else:
                    untested += 1

    print()
    print("=" * 60)
    print(f"TOTAL:    {total}")
    print(colorize("PASSED",   f"PASSED:   {passed}"))
    print(colorize("FAILED",   f"FAILED:   {failed}"))
    print(colorize("UNTESTED", f"UNTESTED: {untested}"))
    print("=" * 60)

    if failures:
        print(f"\n{'=' * 60}")
        print("FAILURE DETAILS")
        print("=" * 60)
        for i, (feature, title, result) in enumerate(failures, 1):
            print(f"\n[{i}] {feature} — {title}")
            print(f"    Status:  FAILED")
            print(f"    Message: {result.get('message', '')}")
            error = result.get("error_detail")
            if error:
                print(f"    Error:")
                for line in str(error).splitlines():
                    print(f"      {line}")
            steps = result.get("steps_to_reproduce", [])
            if steps:
                print(f"    Steps to reproduce:")
                for step in steps:
                    print(f"      - {step}")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
