#!/usr/bin/env python3
"""
Parse Midnight release notes to extract changelog information.
Supports filtering by component and version range.
"""

import json
import re
import sys
from pathlib import Path
from typing import Optional

CACHE_DIR = Path.home() / ".cache" / "midnight-tooling" / "release-notes"

# Component directory mapping
COMPONENT_DIRS = {
    "compact": "compact",
    "compactc": "compact",
    "compiler": "compact",
    "compact-tools": "compact-tools",
    "tools": "compact-tools",
    "proof-server": "proof-server",
    "ledger": "ledger",
    "midnight-js": "midnight-js",
    "lace": "lace",
    "wallet": "wallet",
    "indexer": "midnight-indexer",
    "midnight-indexer": "midnight-indexer",
    "dapp-connector": "dapp-connector-api",
    "dapp-connector-api": "dapp-connector-api",
}


def parse_version_from_filename(filename: str) -> Optional[str]:
    """Extract version from release notes filename."""
    # Patterns like: compact-0-26-0.mdx, minokawa-0-18-26-0.mdx
    patterns = [
        r'(\d+)-(\d+)-(\d+)\.mdx$',  # Simple: 0-26-0.mdx
        r'(\d+)-(\d+)-(\d+)-(\d+)\.mdx$',  # With language version: 0-18-26-0.mdx
    ]

    for pattern in patterns:
        match = re.search(pattern, filename)
        if match:
            groups = match.groups()
            if len(groups) == 3:
                return f"{groups[0]}.{groups[1]}.{groups[2]}"
            elif len(groups) == 4:
                # Format: language-compiler version
                return f"{groups[2]}.{groups[3]}.0 (language {groups[0]}.{groups[1]}.0)"

    return None


def extract_changelog_sections(content: str) -> dict:
    """Extract key sections from release notes content."""
    result = {
        "title": "",
        "summary": "",
        "breaking_changes": [],
        "new_features": [],
        "bug_fixes": [],
        "improvements": []
    }

    # Extract title from frontmatter
    title_match = re.search(r'^title:\s*(.+)$', content, re.MULTILINE)
    if title_match:
        result["title"] = title_match.group(1).strip()

    # Look for common section headers
    lines = content.split('\n')
    current_section = None
    section_content = []

    for line in lines:
        # Check for section headers
        if re.match(r'^##\s*Summary', line, re.IGNORECASE):
            current_section = "summary"
            section_content = []
        elif re.match(r'^##.*breaking', line, re.IGNORECASE):
            current_section = "breaking"
            section_content = []
        elif re.match(r'^##.*new\s*feature', line, re.IGNORECASE) or re.match(r'^###.*new', line, re.IGNORECASE):
            current_section = "features"
            section_content = []
        elif re.match(r'^##.*bug\s*fix', line, re.IGNORECASE) or re.match(r'^###.*fix', line, re.IGNORECASE):
            current_section = "fixes"
            section_content = []
        elif re.match(r'^##\s', line):
            # New section, save previous
            current_section = None
        elif current_section:
            # Extract bullet points
            bullet_match = re.match(r'^[-*]\s+(.+)$', line.strip())
            if bullet_match:
                item = bullet_match.group(1).strip()
                if current_section == "breaking":
                    result["breaking_changes"].append(item)
                elif current_section == "features":
                    result["new_features"].append(item)
                elif current_section == "fixes":
                    result["bug_fixes"].append(item)
            elif current_section == "summary" and line.strip():
                if not result["summary"]:
                    result["summary"] = line.strip()

    # If no structured sections found, try to extract from "Summary of changes"
    summary_match = re.search(r'##\s*Summary of changes\s*\n([\s\S]*?)(?=\n##|\Z)', content)
    if summary_match and not result["summary"]:
        result["summary"] = summary_match.group(1).strip()[:500]

    return result


def get_component_releases(component: str) -> list[dict]:
    """Get all releases for a component."""
    component_key = component.lower().replace(' ', '-')
    component_dir = COMPONENT_DIRS.get(component_key, component_key)

    releases_dir = CACHE_DIR / component_dir
    if not releases_dir.exists():
        return []

    releases = []
    for mdx_file in sorted(releases_dir.glob("*.mdx"), reverse=True):
        version = parse_version_from_filename(mdx_file.name)
        if version:
            try:
                content = mdx_file.read_text()
                changelog = extract_changelog_sections(content)
                releases.append({
                    "file": mdx_file.name,
                    "version": version,
                    "changelog": changelog
                })
            except Exception as e:
                releases.append({
                    "file": mdx_file.name,
                    "version": version,
                    "error": str(e)
                })

    return releases


def list_available_components() -> list[str]:
    """List all components with release notes."""
    if not CACHE_DIR.exists():
        return []

    components = []
    for item in CACHE_DIR.iterdir():
        if item.is_dir() and not item.name.startswith('.'):
            # Check if it has any .mdx files
            if list(item.glob("*.mdx")):
                components.append(item.name)

    return sorted(components)


def main():
    if not CACHE_DIR.exists():
        print(json.dumps({
            "success": False,
            "error": "Release notes cache not found. Run /midnight:sync-releases first."
        }, indent=2))
        sys.exit(1)

    # Parse arguments
    component = sys.argv[1] if len(sys.argv) > 1 else None

    if not component or component == "--list":
        # List available components
        components = list_available_components()
        print(json.dumps({
            "success": True,
            "available_components": components,
            "usage": "python parse-changelog.py <component> [version]"
        }, indent=2))
        sys.exit(0)

    # Get releases for component
    releases = get_component_releases(component)

    if not releases:
        print(json.dumps({
            "success": False,
            "error": f"No release notes found for component: {component}",
            "available_components": list_available_components()
        }, indent=2))
        sys.exit(1)

    # Optional version filter
    version_filter = sys.argv[2] if len(sys.argv) > 2 else None
    if version_filter:
        releases = [r for r in releases if version_filter in r.get("version", "")]

    print(json.dumps({
        "success": True,
        "component": component,
        "release_count": len(releases),
        "releases": releases
    }, indent=2))


if __name__ == "__main__":
    main()
