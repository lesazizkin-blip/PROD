"""Метрики в Sage (Remote Write): кодирование проверяется настоящим protobuf, отправка - подменённым sender."""

from google.protobuf import descriptor_pb2, descriptor_pool, message_factory

from app import metrics


def _write_request_class():
    f = descriptor_pb2.FileDescriptorProto(name="rw_test.proto", package="rwtest")
    label = f.message_type.add(name="Label")
    label.field.add(name="name", number=1, type=9, label=1)
    label.field.add(name="value", number=2, type=9, label=1)
    sample = f.message_type.add(name="Sample")
    sample.field.add(name="value", number=1, type=1, label=1)
    sample.field.add(name="timestamp", number=2, type=3, label=1)
    ts = f.message_type.add(name="TimeSeries")
    ts.field.add(name="labels", number=1, type=11, label=3, type_name=".rwtest.Label")
    ts.field.add(name="samples", number=2, type=11, label=3, type_name=".rwtest.Sample")
    wr = f.message_type.add(name="WriteRequest")
    wr.field.add(name="timeseries", number=1, type=11, label=3, type_name=".rwtest.TimeSeries")
    pool = descriptor_pool.DescriptorPool()
    pool.Add(f)
    return message_factory.GetMessageClass(pool.FindMessageTypeByName("rwtest.WriteRequest"))


def _unsnappy(data: bytes) -> bytes:  # литеральный блок snappy, как его пишет snappy_block
    n, shift, i = 0, 0, 0
    while True:
        b = data[i]
        i += 1
        n |= (b & 0x7F) << shift
        shift += 7
        if not b & 0x80:
            break
    out = bytearray()
    while i < len(data):
        tag = data[i] >> 2
        i += 1
        if tag < 60:
            size = tag + 1
        elif tag == 60:
            size, i = data[i] + 1, i + 1
        else:
            size, i = int.from_bytes(data[i : i + 2], "little") + 1, i + 2
        out += data[i : i + size]
        i += size
    assert len(out) == n
    return bytes(out)


def test_write_request_decodes_with_real_protobuf():
    series = [({"__name__": "movermate_boxes", "status": "loaded", "group": "g"}, 7.0)] * 3
    body = metrics.snappy_block(metrics.encode_write_request(series, 1_760_000_000_000))
    msg = _write_request_class().FromString(_unsnappy(body))
    assert len(msg.timeseries) == 3
    ts = msg.timeseries[0]
    assert [(lbl.name, lbl.value) for lbl in ts.labels] == [
        ("__name__", "movermate_boxes"),
        ("group", "g"),
        ("status", "loaded"),
    ]  # по возрастанию имени, как требует протокол
    assert ts.samples[0].value == 7.0 and ts.samples[0].timestamp == 1_760_000_000_000


def test_long_payload_snappy_roundtrip():
    data = bytes(range(256)) * 700  # больше 65536: несколько литеральных блоков
    assert _unsnappy(metrics.snappy_block(data)) == data


def test_pusher_sends_required_labels_and_never_raises(monkeypatch):
    sent = []
    pusher = metrics.MetricsPusher(
        "https://sage.example/frost_remote_write/api/v1/write",
        "key",
        group="hack-led-20",
        env="prod",
        send=lambda url, key, body: sent.append(body) or 204,
        gauges=lambda: [("movermate_projects", {}, 3)],
    )
    metrics.observe_request("GET", 200, 12.5)
    assert pusher.push_once() == 204 and pusher.sent == 1
    msg = _write_request_class().FromString(_unsnappy(sent[0]))
    names = {dict((lbl.name, lbl.value) for lbl in ts.labels)["__name__"] for ts in msg.timeseries}
    assert {"movermate_projects", "movermate_http_requests_total"} <= names
    labels = {lbl.name for lbl in msg.timeseries[0].labels}
    assert {"group", "system", "env", "dc"} <= labels  # обязательные лейблы Sage

    def broken(*_):
        raise OSError("network down")

    pusher.send = broken
    assert pusher.push_once() == 0  # сеть упала - сайт не замечает


def test_group_is_taken_from_logs_url():
    url = "https://sage.spirit.t-education.com/api/hack-led-20/multiline/"
    assert metrics.group_from_logs_url(url) == "hack-led-20"
    assert metrics.group_from_logs_url("") == "hack-led-20"


def test_business_gauges_count_boxes_by_status(client, base):
    client.post(f"{base}/boxes", json={"room": "Кухня", "items_text": "Чайник"})
    rows = {(n, tuple(sorted(lbl.items()))): v for n, lbl, v in metrics.business_gauges()}
    assert rows[("movermate_boxes", (("status", "packing"),))] >= 1
    assert rows[("movermate_projects", ())] >= 1
