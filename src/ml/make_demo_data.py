"""Генерирует демо-датасет (вилка зарплат по резюме), чтобы пайплайн работал без реальных данных.

Если data/raw/dataset.csv уже есть (данные кейса) - ничего не делает.
Принудительно пересоздать: python -m src.ml.make_demo_data --force
"""

import argparse

import numpy as np
import pandas as pd

from src.ml.config import ROOT, load_params

ROLES = {"backend": 150, "frontend": 135, "ml_engineer": 190, "data_analyst": 120, "qa": 100}
REGIONS = {"moscow": 1.35, "spb": 1.15, "kazan": 0.95, "novosibirsk": 0.9, "other": 0.8}
EDUCATION = {"school": 0.9, "college": 0.95, "bachelor": 1.0, "master": 1.08}


def generate(n: int = 5000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    role = rng.choice(list(ROLES), n)
    region = rng.choice(list(REGIONS), n, p=[0.3, 0.2, 0.15, 0.1, 0.25])
    education = rng.choice(list(EDUCATION), n, p=[0.05, 0.2, 0.5, 0.25])
    experience = np.clip(rng.gamma(2.0, 2.2, n), 0, 20).round(1)
    skills = np.clip(rng.poisson(5 + experience / 3), 0, 20)
    company_size = rng.choice([10, 50, 200, 1000, 5000], n, p=[0.2, 0.25, 0.25, 0.2, 0.1])
    remote = rng.integers(0, 2, n)

    base = np.array([ROLES[r] for r in role], dtype=float)
    mult = np.array([REGIONS[r] for r in region]) * np.array([EDUCATION[e] for e in education])
    salary = base * mult * (1 + 0.09 * experience) * (1 + 0.015 * skills)
    salary *= 1 + 0.04 * np.log10(company_size) + 0.03 * remote
    salary *= rng.lognormal(0, 0.12, n)  # шум
    salary = (salary * 1000).round(-2)  # рубли

    df = pd.DataFrame(
        {
            "role": role,
            "region": region,
            "education": education,
            "experience_years": experience,
            "skills_count": skills,
            "company_size": company_size,
            "remote": remote,
            "salary": salary,
        }
    )
    # Грязь для EDA: пропуски и выбросы
    for col, frac in [("experience_years", 0.03), ("education", 0.04), ("skills_count", 0.02)]:
        df.loc[rng.random(n) < frac, col] = np.nan
    outliers = rng.choice(n, 15, replace=False)
    df.loc[outliers, "salary"] *= rng.uniform(4, 8, 15)
    return df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    params = load_params()
    path = ROOT / params["data"]["raw_path"]
    if path.exists() and not args.force:
        print(f"{path} уже существует - пропускаю генерацию демо-данных")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    df = generate(seed=params["data"]["seed"])
    df.to_csv(path, index=False)
    print(f"Демо-данные сохранены: {path} ({len(df)} строк)")


if __name__ == "__main__":
    main()
