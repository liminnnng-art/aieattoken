"""
CLI tool using argparse with subcommands, file operations, logging,
and JSON-based configuration management.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional, Sequence

logger = logging.getLogger("configctl")

DEFAULT_CONFIG_DIR = Path.home() / ".configctl"
DEFAULT_CONFIG_FILE = DEFAULT_CONFIG_DIR / "settings.json"


@dataclass
class AppConfig:
    """Application configuration model."""
    version: str = "1.0.0"
    author: str = ""
    debug: bool = False
    log_level: str = "INFO"
    output_dir: str = "."
    plugins: list[str] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> AppConfig:
        if not path.exists():
            logger.info("No config found at %s, using defaults", path)
            return cls()
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        known_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known_fields}
        return cls(**filtered)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as fh:
            json.dump(asdict(self), fh, indent=2)
        logger.info("Config saved to %s", path)

    def get_nested(self, dotted_key: str) -> Any:
        """Retrieve a value using dot notation like 'metadata.author'."""
        parts = dotted_key.split(".")
        current: Any = asdict(self)
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
            if current is None:
                return None
        return current


def setup_logging(level_name: str) -> None:
    """Configure the logging format and level."""
    numeric = getattr(logging, level_name.upper(), logging.INFO)
    logging.basicConfig(
        level=numeric,
        format="%(asctime)s [%(levelname)-8s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def resolve_config_path(args: argparse.Namespace) -> Path:
    """Determine the config file path from args or environment."""
    if hasattr(args, "config") and args.config:
        return Path(args.config)
    env_path = os.environ.get("CONFIGCTL_PATH")
    if env_path:
        return Path(env_path)
    return DEFAULT_CONFIG_FILE


# --- Subcommand handlers ---

def cmd_init(args: argparse.Namespace) -> int:
    """Initialize a new configuration file."""
    path = resolve_config_path(args)
    if path.exists() and not args.force:
        logger.error("Config already exists at %s (use --force to overwrite)", path)
        return 1
    config = AppConfig(author=args.author or "", debug=args.debug)
    config.save(path)
    print(f"Initialized config at {path}")
    return 0


def cmd_get(args: argparse.Namespace) -> int:
    """Get a configuration value by key."""
    path = resolve_config_path(args)
    config = AppConfig.load(path)
    value = config.get_nested(args.key)
    if value is None:
        logger.warning("Key '%s' not found in config", args.key)
        return 1
    if isinstance(value, (dict, list)):
        print(json.dumps(value, indent=2))
    else:
        print(value)
    return 0


def cmd_set(args: argparse.Namespace) -> int:
    """Set a configuration value."""
    path = resolve_config_path(args)
    config = AppConfig.load(path)
    data = asdict(config)

    # Parse the value: try JSON first, fall back to string
    try:
        parsed_value = json.loads(args.value)
    except json.JSONDecodeError:
        parsed_value = args.value

    # Handle dot-notation for metadata
    parts = args.key.split(".")
    if len(parts) == 2 and parts[0] == "metadata":
        data.setdefault("metadata", {})[parts[1]] = parsed_value
    elif len(parts) == 1 and parts[0] in data:
        data[parts[0]] = parsed_value
    else:
        logger.error("Unknown or unsupported key: %s", args.key)
        return 1

    updated = AppConfig(**{k: v for k, v in data.items() if k in AppConfig.__dataclass_fields__})
    updated.save(path)
    print(f"Set {args.key} = {parsed_value!r}")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    """Display the full configuration."""
    path = resolve_config_path(args)
    config = AppConfig.load(path)
    output = json.dumps(asdict(config), indent=2)
    if args.output:
        out_path = Path(args.output)
        out_path.write_text(output, encoding="utf-8")
        print(f"Config written to {out_path}")
    else:
        print(output)
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    """Validate the configuration file."""
    path = resolve_config_path(args)
    if not path.exists():
        print(f"FAIL: Config file not found at {path}")
        return 1

    errors: list[str] = []
    try:
        config = AppConfig.load(path)
    except (json.JSONDecodeError, TypeError) as exc:
        print(f"FAIL: Invalid config format - {exc}")
        return 1

    if not config.version:
        errors.append("'version' is empty")
    if config.log_level.upper() not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
        errors.append(f"Invalid log_level: {config.log_level}")
    if config.output_dir and not Path(config.output_dir).is_absolute():
        logger.warning("output_dir '%s' is relative; consider using absolute path", config.output_dir)

    if errors:
        print(f"FAIL: {len(errors)} issue(s) found:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print(f"OK: Config at {path} is valid")
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser with subcommands."""
    parser = argparse.ArgumentParser(
        prog="configctl",
        description="Configuration management CLI tool",
    )
    parser.add_argument("-c", "--config", help="Path to config file")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose output")

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # init
    p_init = subparsers.add_parser("init", help="Initialize a new config")
    p_init.add_argument("--author", default="", help="Author name")
    p_init.add_argument("--debug", action="store_true", help="Enable debug mode")
    p_init.add_argument("--force", action="store_true", help="Overwrite existing config")

    # get
    p_get = subparsers.add_parser("get", help="Get a config value")
    p_get.add_argument("key", help="Config key (supports dot notation)")

    # set
    p_set = subparsers.add_parser("set", help="Set a config value")
    p_set.add_argument("key", help="Config key (supports dot notation)")
    p_set.add_argument("value", help="Value to set (JSON or plain string)")

    # show
    p_show = subparsers.add_parser("show", help="Display full config")
    p_show.add_argument("-o", "--output", help="Write config to file instead of stdout")

    # validate
    subparsers.add_parser("validate", help="Validate the config file")

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """Entry point for the CLI tool."""
    parser = build_parser()
    args = parser.parse_args(argv)

    log_level = "DEBUG" if args.verbose else "INFO"
    setup_logging(log_level)

    handlers: dict[str, Any] = {
        "init": cmd_init,
        "get": cmd_get,
        "set": cmd_set,
        "show": cmd_show,
        "validate": cmd_validate,
    }

    if not args.command:
        parser.print_help()
        return 0

    handler = handlers.get(args.command)
    if handler is None:
        logger.error("Unknown command: %s", args.command)
        return 1

    try:
        return handler(args)
    except Exception as exc:
        logger.exception("Command '%s' failed: %s", args.command, exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
