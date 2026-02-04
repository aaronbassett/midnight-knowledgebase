#!/usr/bin/env python3
"""
Detailed prerequisite check for Midnight development environment.
Outputs JSON with comprehensive status information.
"""

import json
import platform
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from typing import Optional


@dataclass
class ToolCheck:
    name: str
    command: str
    version_command: str
    required: bool
    min_version: Optional[str] = None


TOOLS = [
    ToolCheck("Node.js", "node", "node --version", True, "18.0.0"),
    ToolCheck("npm", "npm", "npm --version", True, "9.0.0"),
    ToolCheck("Git", "git", "git --version", True, "2.0.0"),
    ToolCheck("Docker", "docker", "docker --version", True, "20.0.0"),
    ToolCheck("Compact CLI", "compact", "compact --version", True),
    ToolCheck("Compact Compiler", "compact", "compact compile --version", True),
    ToolCheck("Yarn", "yarn", "yarn --version", False),
    ToolCheck("Bun", "bun", "bun --version", False),
]


def run_command(cmd: str, timeout: int = 10) -> tuple[int, str]:
    """Run a shell command and return (returncode, output)."""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        output = result.stdout.strip() or result.stderr.strip()
        return result.returncode, output
    except subprocess.TimeoutExpired:
        return -1, "timeout"
    except Exception as e:
        return -1, str(e)


def parse_version(version_string: str) -> Optional[tuple]:
    """Parse version string into tuple for comparison."""
    match = re.search(r'(\d+)\.(\d+)\.(\d+)', version_string)
    if match:
        return tuple(int(g) for g in match.groups())
    return None


def compare_versions(current: str, minimum: str) -> bool:
    """Check if current version meets minimum requirement."""
    current_tuple = parse_version(current)
    minimum_tuple = parse_version(minimum)

    if not current_tuple or not minimum_tuple:
        return True  # Can't compare, assume OK

    return current_tuple >= minimum_tuple


def check_tool(tool: ToolCheck) -> dict:
    """Check a single tool and return status."""
    result = {
        "name": tool.name,
        "command": tool.command,
        "installed": False,
        "version": None,
        "required": tool.required,
        "meets_minimum": True,
        "minimum_version": tool.min_version,
        "status": "missing"
    }

    # Check if command exists
    if not shutil.which(tool.command):
        result["status"] = "missing" if tool.required else "optional_missing"
        return result

    # Get version
    code, output = run_command(tool.version_command)
    if code == 0 and output:
        result["installed"] = True
        # Extract version number
        version_match = re.search(r'v?(\d+\.\d+\.\d+)', output)
        if version_match:
            result["version"] = version_match.group(1)
        else:
            result["version"] = output[:50]  # Truncate if weird format

        # Check minimum version
        if tool.min_version and result["version"]:
            result["meets_minimum"] = compare_versions(result["version"], tool.min_version)
            if not result["meets_minimum"]:
                result["status"] = "outdated"
            else:
                result["status"] = "ok"
        else:
            result["status"] = "ok"
    else:
        result["installed"] = True
        result["status"] = "version_unknown"

    return result


def check_docker_running() -> dict:
    """Check if Docker daemon is running."""
    result = {
        "name": "Docker Daemon",
        "running": False,
        "status": "not_running"
    }

    code, output = run_command("docker info")
    if code == 0:
        result["running"] = True
        result["status"] = "running"

    return result


def check_proof_server_image() -> dict:
    """Check if proof server Docker image is available."""
    result = {
        "name": "Proof Server Image",
        "available": False,
        "tags": [],
        "status": "not_pulled"
    }

    code, output = run_command("docker images midnightnetwork/proof-server --format '{{.Tag}}'")
    if code == 0 and output:
        result["available"] = True
        result["tags"] = output.split('\n')
        result["status"] = "available"

    return result


def main():
    results = {
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "python_version": platform.python_version()
        },
        "tools": [],
        "services": {},
        "summary": {
            "required_ok": 0,
            "required_missing": 0,
            "required_outdated": 0,
            "optional_ok": 0,
            "optional_missing": 0
        }
    }

    # Check tools
    for tool in TOOLS:
        check = check_tool(tool)
        results["tools"].append(check)

        if check["required"]:
            if check["status"] == "ok":
                results["summary"]["required_ok"] += 1
            elif check["status"] == "outdated":
                results["summary"]["required_outdated"] += 1
            else:
                results["summary"]["required_missing"] += 1
        else:
            if check["status"] == "ok":
                results["summary"]["optional_ok"] += 1
            else:
                results["summary"]["optional_missing"] += 1

    # Check services
    results["services"]["docker_daemon"] = check_docker_running()
    results["services"]["proof_server_image"] = check_proof_server_image()

    # Overall status
    results["ready"] = (
        results["summary"]["required_missing"] == 0 and
        results["summary"]["required_outdated"] == 0 and
        results["services"]["docker_daemon"]["running"]
    )

    print(json.dumps(results, indent=2))

    # Exit code
    if results["ready"]:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
