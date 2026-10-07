import copy
from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
PARAMS_PATH = ROOT / "params.yaml"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"


@lru_cache(maxsize=4)
def _read(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_params(path: Path = PARAMS_PATH) -> dict:
    """Читает params.yaml один раз; наружу отдаёт копию, чтобы правки не протекали в кэш."""
    return copy.deepcopy(_read(path))
