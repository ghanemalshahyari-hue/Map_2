"""
config.py — central env-var loader. Import this BEFORE any other src/ module
that uses environment variables. Validates required keys and exposes typed
config objects.
"""
import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

# Walk up from this file to find .env (project root)
_THIS = Path(__file__).resolve()
_PROJECT_ROOT = _THIS.parent.parent
_DOTENV = _PROJECT_ROOT / ".env"
if _DOTENV.exists():
    load_dotenv(_DOTENV)


def _get(name: str, default: str | None = None, required: bool = False) -> str | None:
    val = os.environ.get(name, default)
    if val is not None:
        val = val.strip() or None
    if required and not val:
        raise RuntimeError(f"Required env var {name} is unset (in {_DOTENV})")
    return val


def _get_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw and raw.strip() else default


def _get_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw and raw.strip() else default


def _get_bool(name: str, default: bool) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return default


@dataclass(frozen=True)
class LLMConfig:
    base_url: str | None
    api_key: str
    model: str
    use_responses_api: bool
    temperature_red: float
    temperature_blue: float
    temperature_adjudicator: float


@dataclass(frozen=True)
class SmartSearchConfig:
    mode: str                # "local" | "http"
    repo_path: Path | None   # only when mode=local
    http_url: str | None     # only when mode=http
    collection: str
    top_k: int


@dataclass(frozen=True)
class PathsConfig:
    project_root: Path
    inputs_dir: Path
    red_force_file: Path
    blue_force_file: Path
    scenario_file: Path
    gis_dir: Path
    output_dir: Path


@dataclass(frozen=True)
class RunModeConfig:
    red_agent: str           # "llm" | "human" | "replay"
    blue_agent: str
    adjudicator: str
    red_fog_of_war: bool
    blue_fog_of_war: bool


@dataclass(frozen=True)
class DoctrinalConfig:
    attack_ratio_decisive: float
    attack_ratio_contested: float
    prepared_defense_mult: float


def load_llm_config() -> LLMConfig:
    api_key = _get("LLM_API_KEY") or _get("OPENAI_API_KEY", required=True)
    return LLMConfig(
        base_url=_get("LLM_BASE_URL"),
        api_key=api_key,
        model=_get("LLM_MODEL", default="gpt-4o"),
        use_responses_api=_get_bool("LLM_USE_RESPONSES_API", True),
        temperature_red=_get_float("LLM_TEMPERATURE_RED", 0.4),
        temperature_blue=_get_float("LLM_TEMPERATURE_BLUE", 0.3),
        temperature_adjudicator=_get_float("LLM_TEMPERATURE_ADJUDICATOR", 0.1),
    )


def load_smart_search_config() -> SmartSearchConfig:
    mode = (_get("SMART_SEARCH_MODE") or "local").lower()
    if mode not in ("local", "http"):
        raise RuntimeError(f"SMART_SEARCH_MODE must be 'local' or 'http' (got {mode!r})")
    repo_path = _resolve_smart_search_repo_path() if mode == "local" else None
    return SmartSearchConfig(
        mode=mode,
        repo_path=repo_path,
        http_url=_get("SMART_SEARCH_HTTP_URL") if mode == "http" else None,
        collection=_get("SMART_SEARCH_COLLECTION", default="ingest__doctrine__bgem3"),
        top_k=_get_int("SMART_SEARCH_TOP_K", 6),
    )


def _looks_like_smart_search_repo(path: Path | None) -> bool:
    return bool(path and (path / "graph" / "retrieval" / "search.py").exists())


def _resolve_smart_search_repo_path() -> Path | None:
    configured = _get("SMART_SEARCH_REPO_PATH")
    configured_path = Path(configured) if configured else None
    if _looks_like_smart_search_repo(configured_path):
        return configured_path

    sibling = _PROJECT_ROOT.parent / "SmartSearch"
    if _looks_like_smart_search_repo(sibling):
        return sibling

    return configured_path


def load_paths_config() -> PathsConfig:
    return PathsConfig(
        project_root=_PROJECT_ROOT,
        inputs_dir=Path(_get("INPUTS_DIR", default="./inputs")),
        red_force_file=Path(_get("RED_FORCE_FILE", default="./inputs/forces/red_team.docx")),
        blue_force_file=Path(_get("BLUE_FORCE_FILE", default="./inputs/forces/blue_team.docx")),
        scenario_file=Path(_get("SCENARIO_FILE", default="./inputs/scenario.json")),
        gis_dir=Path(_get("GIS_DIR", default="./inputs/gis")),
        output_dir=Path(_get("OUTPUT_DIR", default="./runs")),
    )


def load_run_mode_config() -> RunModeConfig:
    return RunModeConfig(
        red_agent=_get("RED_AGENT_MODE", default="llm"),
        blue_agent=_get("BLUE_AGENT_MODE", default="llm"),
        adjudicator=_get("ADJUDICATOR_MODE", default="llm"),
        red_fog_of_war=_get_bool("RED_FOG_OF_WAR", True),
        blue_fog_of_war=_get_bool("BLUE_FOG_OF_WAR", True),
    )


def load_doctrinal_config() -> DoctrinalConfig:
    return DoctrinalConfig(
        attack_ratio_decisive=_get_float("ATTACK_RATIO_DECISIVE", 3.0),
        attack_ratio_contested=_get_float("ATTACK_RATIO_CONTESTED", 1.5),
        prepared_defense_mult=_get_float("PREPARED_DEFENSE_MULT", 1.5),
    )


def summary() -> dict:
    """Diagnostic banner. Sensitive fields are redacted."""
    llm = load_llm_config()
    ss = load_smart_search_config()
    paths = load_paths_config()
    runm = load_run_mode_config()
    doc = load_doctrinal_config()
    return {
        "llm": {
            "base_url": llm.base_url or "(OpenAI cloud default)",
            "model": llm.model,
            "api_key": "set" if llm.api_key else "MISSING",
            "responses_api": llm.use_responses_api,
            "temps_R/B/J": [llm.temperature_red, llm.temperature_blue, llm.temperature_adjudicator],
        },
        "smart_search": {
            "mode": ss.mode,
            "repo_path": str(ss.repo_path) if ss.repo_path else None,
            "http_url": ss.http_url,
            "collection": ss.collection,
            "top_k": ss.top_k,
        },
        "paths": {k: str(v) for k, v in paths.__dict__.items()},
        "run_modes": runm.__dict__,
        "doctrine": doc.__dict__,
    }


if __name__ == "__main__":
    import json
    print(json.dumps(summary(), indent=2, default=str))
