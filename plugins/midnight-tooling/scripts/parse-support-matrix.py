#!/usr/bin/env python3
"""
Parse the Midnight support-matrix.mdx file to extract current version information.
Outputs JSON with component versions.
"""

import json
import re
import sys
from pathlib import Path

CACHE_DIR = Path.home() / ".cache" / "midnight-tooling"
SUPPORT_MATRIX_FILE = CACHE_DIR / "release-notes" / "support-matrix.mdx"


def parse_support_matrix() -> dict:
    """Parse support-matrix.mdx and extract version information."""
    result = {
        "success": False,
        "error": None,
        "components": {},
        "source_file": str(SUPPORT_MATRIX_FILE)
    }

    if not SUPPORT_MATRIX_FILE.exists():
        result["error"] = f"Support matrix not found at {SUPPORT_MATRIX_FILE}. Run /midnight:sync-releases first."
        return result

    try:
        content = SUPPORT_MATRIX_FILE.read_text()
    except IOError as e:
        result["error"] = f"Failed to read support matrix: {e}"
        return result

    # Parse the markdown table
    # Looking for lines like: | Runtime & Contracts | Compactc | 0.26.0 | Contract compiler |
    table_pattern = re.compile(
        r'\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|'
    )

    current_area = ""
    for line in content.split('\n'):
        match = table_pattern.match(line)
        if not match:
            continue

        area, component, version, notes = [g.strip() for g in match.groups()]

        # Skip header rows
        if area in ('**Functional Area**', '---', ''):
            if area and area != '---':
                current_area = area
            continue

        # Use the area from previous row if this row's area is empty
        if not area:
            area = current_area
        else:
            current_area = area
            # Clean up markdown bold
            area = area.replace('**', '')

        # Clean up component name
        component = component.replace('**', '')

        # Skip separator rows and empty components
        if '---' in version or not component:
            continue

        # Normalize component names for easier lookup
        component_key = component.lower().replace(' ', '-').replace('(', '').replace(')', '')

        result["components"][component_key] = {
            "name": component,
            "version": version,
            "area": area,
            "notes": notes
        }

    if result["components"]:
        result["success"] = True
    else:
        result["error"] = "No components found in support matrix"

    return result


def main():
    # Check for optional component filter argument
    filter_component = sys.argv[1] if len(sys.argv) > 1 else None

    result = parse_support_matrix()

    if filter_component and result["success"]:
        # Filter to specific component
        component_key = filter_component.lower().replace(' ', '-')
        if component_key in result["components"]:
            result["components"] = {component_key: result["components"][component_key]}
        else:
            # Try partial match
            matches = {k: v for k, v in result["components"].items() if component_key in k}
            if matches:
                result["components"] = matches
            else:
                result["error"] = f"Component '{filter_component}' not found"
                result["success"] = False

    print(json.dumps(result, indent=2))

    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
