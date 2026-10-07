"""Простой нагрузочный тест API (критерий P3, "мини-правка").

Пример: python scripts/load_test.py --url http://localhost:8000 --requests 500 --concurrency 20
"""

import argparse
import asyncio
import statistics
import time

import httpx

PAYLOAD = {
    "role": "backend",
    "region": "moscow",
    "education": "bachelor",
    "experience_years": 3.5,
    "skills_count": 8,
    "company_size": 200,
    "remote": 1,
}


async def worker(client: httpx.AsyncClient, url: str, n: int, lat: list, errors: list) -> None:
    for _ in range(n):
        t0 = time.perf_counter()
        try:
            r = await client.post(f"{url}/predict", json=PAYLOAD)
            if r.status_code != 200:
                errors.append(r.status_code)
        except httpx.HTTPError as exc:
            errors.append(repr(exc))
        lat.append((time.perf_counter() - t0) * 1000)


async def main(url: str, total: int, concurrency: int) -> None:
    lat: list[float] = []
    errors: list = []
    per_worker = total // concurrency
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=30) as client:
        await asyncio.gather(
            *(worker(client, url, per_worker, lat, errors) for _ in range(concurrency))
        )
    elapsed = time.perf_counter() - t0
    lat.sort()
    print(f"requests: {len(lat)}  errors: {len(errors)}  time: {elapsed:.2f}s")
    print(f"throughput: {len(lat) / elapsed:.1f} req/s")
    print(
        f"latency ms: mean={statistics.fmean(lat):.1f} p50={lat[len(lat) // 2]:.1f} "
        f"p95={lat[int(len(lat) * 0.95)]:.1f} p99={lat[int(len(lat) * 0.99)]:.1f}"
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--requests", type=int, default=500)
    ap.add_argument("--concurrency", type=int, default=20)
    a = ap.parse_args()
    asyncio.run(main(a.url, a.requests, a.concurrency))
