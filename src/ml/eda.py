"""Базовый EDA: статистика, пропуски, выбросы, графики -> reports/eda/. Критерий A / P1.

Запуск: python -m src.ml.eda
"""

import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

from src.ml.config import REPORTS_DIR, ROOT, load_params  # noqa: E402


def run() -> None:
    params = load_params()
    target = params["data"]["target"]
    df = pd.read_csv(ROOT / params["data"]["raw_path"])
    out = REPORTS_DIR / "eda"
    out.mkdir(parents=True, exist_ok=True)

    summary = {
        "rows": len(df),
        "columns": df.columns.tolist(),
        "missing_share": df.isna().mean().round(4).to_dict(),
        "describe": json.loads(df.describe().round(2).to_json()),
    }
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))

    # 1. Распределение таргета (+ лог-шкала: видны выбросы)
    fig, ax = plt.subplots(1, 2, figsize=(11, 4))
    df[target].hist(bins=60, ax=ax[0])
    ax[0].set_title(f"{target}")
    df[target].dropna().pipe(lambda s: s[s > 0]).apply("log10").hist(bins=60, ax=ax[1])
    ax[1].set_title(f"log10({target})")
    fig.tight_layout()
    fig.savefig(out / "target_distribution.png", dpi=120)
    plt.close(fig)

    # 2. Пропуски
    miss = df.isna().mean()
    miss = miss[miss > 0]
    if len(miss):
        fig, ax = plt.subplots(figsize=(6, 3))
        miss.sort_values().plot.barh(ax=ax)
        ax.set_title("Доля пропусков")
        fig.tight_layout()
        fig.savefig(out / "missing.png", dpi=120)
        plt.close(fig)

    # 3. Таргет по категориям
    for col in params["features"]["categorical"]:
        fig, ax = plt.subplots(figsize=(7, 4))
        df.boxplot(column=target, by=col, ax=ax, showfliers=False)
        ax.set_title(f"{target} по {col}")
        plt.suptitle("")
        fig.tight_layout()
        fig.savefig(out / f"target_by_{col}.png", dpi=120)
        plt.close(fig)

    # 4. Числовые признаки vs таргет
    for col in params["features"]["numeric"]:
        if df[col].nunique() > 5:
            fig, ax = plt.subplots(figsize=(6, 4))
            ax.scatter(df[col], df[target], s=4, alpha=0.3)
            ax.set_xlabel(col)
            ax.set_ylabel(target)
            fig.tight_layout()
            fig.savefig(out / f"scatter_{col}.png", dpi=120)
            plt.close(fig)

    # 5. Корреляции
    corr = df.select_dtypes("number").corr()
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(corr, cmap="coolwarm", vmin=-1, vmax=1)
    ax.set_xticks(range(len(corr)), corr.columns, rotation=60, ha="right")
    ax.set_yticks(range(len(corr)), corr.columns)
    fig.colorbar(im)
    fig.tight_layout()
    fig.savefig(out / "correlations.png", dpi=120)
    plt.close(fig)

    print(f"EDA сохранён в {out}")


if __name__ == "__main__":
    run()
