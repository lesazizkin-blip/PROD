import uuid

from app.models import Box


def test_locations_filter_before_pagination_and_combine_with_room(
    client, base, project, db_session
):
    statuses = ["packing", "packed", "loaded", "delivered", "unpacked"]
    db_session.add_all(
        [
            Box(
                project_id=uuid.UUID(project["id"]),
                number=n,
                room="Кухня" if n % 2 else "Спальня",
                status=statuses[(n - 1) % 5],
            )
            for n in range(1, 301)
        ]
    )
    db_session.commit()
    other = client.post("/api/projects", json={"name": "Другой", "move_date": "2026-11-01"}).json()
    db_session.add(
        Box(project_id=uuid.UUID(other["id"]), number=1, room="Кухня", status="delivered")
    )
    db_session.commit()
    for location, expected_statuses, count in [
        ("old", {"packing", "packed"}, 120),
        ("truck", {"loaded"}, 60),
        ("new", {"delivered", "unpacked"}, 120),
    ]:
        seen = []
        for page in range(1, (count + 11) // 12 + 1):
            response = client.get(
                f"{base}/boxes", params={"location": location, "page_size": 12, "page": page}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["total"] == count
            assert all(b["status"] in expected_statuses for b in data["items"])
            seen.extend(b["number"] for b in data["items"])
        assert len(set(seen)) == count
        assert seen == sorted(seen)
    kitchen = client.get(
        f"{base}/boxes", params={"location": "new", "room": "Кухня", "page_size": 12}
    ).json()
    assert kitchen["total"] == 60
    assert all(b["room"] == "Кухня" for b in kitchen["items"])
    assert (
        client.get(f"{base}/boxes", params={"location": "truck", "status": "packing"}).json()[
            "total"
        ]
        == 0
    )
    assert client.get(f"{base}/boxes", params={"location": "moon"}).status_code == 422


def test_open_closed_order_is_global_and_stable_across_pages(client, base, project, db_session):
    statuses = ["packed", "loaded", "delivered", "packing", "unpacked"]
    db_session.add_all(
        [
            Box(
                project_id=uuid.UUID(project["id"]),
                number=n,
                room="Кухня" if n % 2 else "Спальня",
                status=statuses[(n - 1) % 5],
            )
            for n in range(1, 101)
        ]
    )
    db_session.commit()
    for order in ["open_first", "closed_first"]:
        rows = []
        for page in range(1, 10):
            r = client.get(base + "/boxes", params={"sort": order, "page_size": 12, "page": page})
            assert r.status_code == 200
            rows.extend(r.json()["items"])
        assert len(rows) == len({b["number"] for b in rows}) == 100

        def key(box, order=order):
            opened = box["status"] in {"packing", "unpacked"}
            return (not opened if order == "open_first" else opened, box["number"])

        assert rows == sorted(rows, key=key)
    filtered = client.get(
        base + "/boxes",
        params={"sort": "open_first", "location": "old", "room": "Кухня", "page_size": 200},
    ).json()["items"]
    assert all(b["room"] == "Кухня" and b["status"] in {"packing", "packed"} for b in filtered)
    assert [b["status"] == "packing" for b in filtered] == sorted(
        [b["status"] == "packing" for b in filtered], reverse=True
    )
    assert client.get(base + "/boxes?sort=unknown").status_code == 422
