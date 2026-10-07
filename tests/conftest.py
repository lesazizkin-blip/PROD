import pytest
from fastapi.testclient import TestClient
from src.ml.make_demo_data import generate


@pytest.fixture(scope="session")
def demo_df():
    return generate(n=1500, seed=1)


@pytest.fixture(scope="session")
def trained(tmp_path_factory, demo_df, monkeypatch_session):
    """Обучаем маленькую модель во временной папке - тесты не зависят от models/."""
    import src.ml.config as config
    import src.ml.train as train

    tmp = tmp_path_factory.mktemp("work")
    csv = tmp / "dataset.csv"
    demo_df.to_csv(csv, index=False)

    params = config.load_params()
    params["data"]["raw_path"] = str(csv)
    params["model"].update(max_iter=30, quantiles=[0.1, 0.5, 0.9])
    params["mlflow"]["tracking_uri"] = f"sqlite:///{tmp / 'mlflow.db'}"

    monkeypatch_session.setattr(train, "load_params", lambda: params)
    monkeypatch_session.setattr(train, "ROOT", tmp)
    monkeypatch_session.setattr(train, "MODELS_DIR", tmp / "models")
    metrics = train.run()
    return tmp / "models", metrics


@pytest.fixture(scope="session")
def monkeypatch_session():
    from _pytest.monkeypatch import MonkeyPatch

    mp = MonkeyPatch()
    yield mp
    mp.undo()


@pytest.fixture()
def client(trained):
    from src.app import main

    models_dir, _ = trained
    main.service.models_dir = models_dir
    main.service.load()
    with TestClient(main.app) as c:
        yield c
