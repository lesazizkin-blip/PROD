#!/usr/bin/env python3
"""Собирает чек-листы из docs/checklist.json (единственный источник данных):

  docs/CHECKLIST.md    - обычный Markdown с чекбоксами (GitHub, VS Code, Obsidian, любые заметки)
  docs/checklist.html  - автономная страница: открывается двойным щелчком, без интернета и аккаунтов;
                         отметки хранятся в браузере, есть сохранение в файл и загрузка из файла

Править задачи: отредактируйте docs/checklist.json ("done": true - отмечено по умолчанию),
затем запустите:  python3 scripts/build_checklist.py
"""

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
data = json.loads((DOCS / "checklist.json").read_text(encoding="utf-8"))


def build_markdown() -> str:
    lines = [
        f"# {data['title']}",
        "",
        f"{data['subtitle']}. Отметки: меняйте `[ ]` на `[x]` (в VS Code и Obsidian по чекбоксу можно кликнуть",
        "в режиме просмотра). Интерактивная версия без интернета: `docs/checklist.html`.",
        "Этот файл создаётся скриптом `scripts/build_checklist.py` из `docs/checklist.json`: правьте JSON и пересобирайте.",
        "",
    ]
    total = len(data["items"])
    done = sum(1 for i in data["items"] if i["done"])
    lines += [f"**Выполнено: {done} из {total}**", ""]
    for s in data["sections"]:
        items = [i for i in data["items"] if i["section"] == s["key"]]
        if not items:
            continue
        d = sum(1 for i in items if i["done"])
        lines += [f"## {s['title']} ({d}/{len(items)})", f"_{s['sub']}_", ""]
        for i in items:
            lines.append(f"- [{'x' if i['done'] else ' '}] {i['text']}")
            if i.get("note"):
                lines.append(f"  - {i['note']}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


HTML = r"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
  :root { --bg:#f2f5f7; --surface:#fff; --line:#dce3e8; --fg:#14202a; --muted:#5a6977; --accent:#0f766e; --accent-soft:#d4eeea;
          --next-soft:#fcebc6; --danger:#b42318; --track:#e3e9ed; --on-accent:#fff;
          --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --mono: ui-monospace, "SF Mono", Menlo, monospace; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1316; --surface:#151d22; --line:#26323a; --fg:#e6edf2; --muted:#93a3af;
          --accent:#34d3bd; --accent-soft:#143a38; --next-soft:#3a2d12; --danger:#ff8a80; --track:#222d34; --on-accent:#0d1316; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:400 15px/1.5 var(--sans); }
  .wrap { max-width:760px; margin:0 auto; padding:24px 16px 56px; display:grid; gap:20px; }
  h1 { font-size:clamp(1.6rem,5vw,2.1rem); line-height:1.15; margin:0; }
  .meta { color:var(--muted); display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center; }
  .chip { font:500 .8rem var(--mono); background:var(--accent-soft); color:var(--accent); border-radius:999px; padding:3px 10px; }
  .panel { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:16px; }
  .progress { display:grid; gap:10px; }
  .progress-top { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:12px; }
  .progress-top b { font-size:1.9rem; font-variant-numeric:tabular-nums; }
  .progress-top span { color:var(--muted); }
  .bar { height:8px; background:var(--track); border-radius:999px; overflow:hidden; }
  .bar > i { display:block; height:100%; background:var(--accent); transition:width .25s; }
  .next { background:var(--next-soft); border-color:transparent; display:grid; gap:4px; }
  .next small { font:500 .75rem var(--mono); letter-spacing:.06em; text-transform:uppercase; opacity:.8; }
  .next[hidden] { display:none; }
  .controls { display:flex; flex-wrap:wrap; gap:10px 12px; align-items:center; }
  .controls .grow { flex:1; }
  .toggle { display:inline-flex; align-items:center; gap:8px; cursor:pointer; min-height:44px; }
  .toggle input { width:18px; height:18px; accent-color:var(--accent); }
  button { font:inherit; color:inherit; background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:0 14px; min-height:44px; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  button.primary { background:var(--accent); border-color:var(--accent); color:var(--on-accent); font-weight:600; }
  button.armed { border-color:var(--danger); color:var(--danger); }
  :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  section.group { display:grid; gap:8px; }
  .group-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .group-head h2 { font-size:1.15rem; margin:0; }
  .group-head p { margin:0; color:var(--muted); font-size:.85rem; flex-basis:100%; order:3; }
  .count { font:500 .85rem var(--mono); color:var(--muted); }
  .count.full { color:var(--accent); }
  .mini { height:4px; background:var(--track); border-radius:999px; overflow:hidden; }
  .mini > i { display:block; height:100%; background:var(--accent); transition:width .25s; }
  ul.items { list-style:none; margin:0; padding:0; border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; }
  li.item { display:flex; border-top:1px solid var(--line); }
  li.item:first-child { border-top:0; }
  li.item label { flex:1; min-width:0; display:flex; gap:12px; align-items:flex-start; padding:12px 14px; cursor:pointer; }
  li.item input[type=checkbox] { width:20px; height:20px; margin:2px 0 0; flex:none; accent-color:var(--accent); cursor:pointer; }
  .body { display:grid; gap:2px; min-width:0; overflow-wrap:anywhere; }
  li.done .text { color:var(--muted); text-decoration:line-through; text-decoration-color:var(--line); }
  .note { color:var(--muted); font-size:.85rem; }
  li.is-next { background:var(--next-soft); }
  code { font:400 .85em var(--mono); background:var(--track); border-radius:4px; padding:1px 5px; }
  .x { border:0; background:none; color:var(--muted); min-width:44px; border-radius:0; padding:0 10px; }
  form.add { display:grid; gap:10px; }
  form.add .fields { display:grid; gap:10px; grid-template-columns:1fr minmax(0,11rem); }
  input[type=text], select { font:inherit; color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:0 12px; min-height:44px; width:100%; min-width:0; }
  h3 { margin:0; font-size:1rem; }
  .empty { color:var(--muted); text-align:center; padding:20px; }
  .hint { color:var(--muted); font-size:.85rem; }
  #toast { position:fixed; left:50%; transform:translateX(-50%); bottom:16px; background:var(--fg); color:var(--bg); padding:10px 16px; border-radius:8px; max-width:calc(100% - 32px); }
  #toast[hidden] { display:none; }
  @media (max-width:520px) { form.add .fields { grid-template-columns:1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>__TITLE__</h1>
    <div class="meta"><span>__SUBTITLE__</span><span class="chip" id="countdown"></span></div>
  </header>
  <div class="panel progress" id="progress" aria-live="polite"></div>
  <div class="panel next" id="next" hidden></div>
  <div class="controls">
    <label class="toggle"><input type="checkbox" id="hide-done"> Скрыть выполненное</label>
    <span class="grow"></span>
    <button type="button" id="export">Сохранить в файл</button>
    <button type="button" id="import">Загрузить из файла</button>
    <button type="button" id="reset">Сбросить мои отметки</button>
    <input type="file" id="file" accept="application/json,.json" hidden>
  </div>
  <p class="hint">Отметки хранятся в этом браузере (на этом компьютере). Чтобы перенести или поделиться с командой: «Сохранить в файл», затем «Загрузить из файла» на другом компьютере.</p>
  <div id="groups"></div>
  <form class="panel add" id="add" autocomplete="off">
    <h3>Добавить свою задачу</h3>
    <div class="fields">
      <input type="text" id="new-text" maxlength="200" placeholder="Например: проверить зарядку и кабель HDMI" aria-label="Текст задачи">
      <select id="new-section" aria-label="Раздел"></select>
    </div>
    <div><button class="primary">Добавить</button></div>
  </form>
</div>
<div id="toast" role="status" hidden></div>
<script id="data" type="application/json">__DATA__</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById("data").textContent);
  var KEY = "hackathon-checklist-v1";
  var START = new Date(2026, 9, 16);
  var $ = function (id) { return document.getElementById(id); };
  var SECTIONS = DATA.sections.concat([{ key: "extra", title: "Мои задачи", sub: "добавлено вручную" }]);

  var state = { done: {}, custom: [], hideDone: false };
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) state = Object.assign(state, s); } catch (e) {}
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  load();

  function all() {
    return DATA.items.map(function (i) { return Object.assign({}, i, { done: i.id in state.done ? state.done[i.id] : i.done }); })
      .concat(state.custom.map(function (c) { return Object.assign({ order: 1e9, custom: true }, c, { done: !!state.done[c.id] }); }));
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) { if (k === "class") el.className = attrs[k]; else if (k === "text") el.textContent = attrs[k]; else el.setAttribute(k, attrs[k]); }
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.appendChild(arguments[i]);
    return el;
  }
  function rich(parent, text) {
    String(text || "").split("`").forEach(function (part, i) {
      if (!part) return;
      parent.appendChild(i % 2 ? h("code", { text: part }) : document.createTextNode(part));
    });
    return parent;
  }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3500); }

  function countdown() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var d = Math.round((START - today) / 86400000), el = $("countdown");
    el.textContent = d > 1 ? "до старта " + d + " дн." : d === 1 ? "старт завтра" : d >= -2 ? "хакатон идёт: день " + (1 - d) : "хакатон завершён";
  }
  function sorted(l) { return l.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : 1); }); }

  function render() {
    var focusId = document.activeElement && document.activeElement.id;
    var items = all(), total = items.length, done = items.filter(function (t) { return t.done; }).length;
    var pct = total ? Math.round(done * 100 / total) : 0;
    $("progress").replaceChildren(
      h("div", { class: "progress-top" }, h("b", { text: done + " из " + total }), h("span", { text: pct + "% выполнено" })),
      h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(done) }, h("i", { style: "width:" + pct + "%" })));
    var next = null;
    SECTIONS.some(function (s) {
      var f = sorted(items.filter(function (t) { return (t.section || "extra") === s.key && !t.done; }))[0];
      if (f) { next = f; return true; }
    });
    if (next) { $("next").replaceChildren(h("small", { text: "Дальше" }), rich(h("strong"), next.text)); $("next").hidden = false; } else $("next").hidden = true;

    var nodes = [];
    SECTIONS.forEach(function (s) {
      var inSec = sorted(items.filter(function (t) { return (t.section || "extra") === s.key; }));
      if (!inSec.length) return;
      var sd = inSec.filter(function (t) { return t.done; }).length;
      var vis = state.hideDone ? inSec.filter(function (t) { return !t.done; }) : inSec;
      var ul = h("ul", { class: "items" });
      vis.forEach(function (t) {
        var cb = h("input", { type: "checkbox", id: "c-" + t.id, "data-id": t.id }); cb.checked = t.done;
        var body = h("span", { class: "body" }, rich(h("span", { class: "text" }), t.text));
        if (t.note) body.appendChild(rich(h("span", { class: "note" }), t.note));
        var li = h("li", { class: "item" + (t.done ? " done" : "") + (next && next.id === t.id ? " is-next" : "") }, h("label", {}, cb, body));
        if (t.custom) li.appendChild(h("button", { type: "button", class: "x", id: "x-" + t.id, "data-del": t.id, "aria-label": "Удалить задачу", text: "×" }));
        ul.appendChild(li);
      });
      nodes.push(h("section", { class: "group" },
        h("div", { class: "group-head" }, h("h2", { text: s.title }), h("span", { class: "count" + (sd === inSec.length ? " full" : ""), text: sd + " / " + inSec.length }), h("p", { text: s.sub })),
        h("div", { class: "mini" }, h("i", { style: "width:" + Math.round(sd * 100 / inSec.length) + "%" })),
        vis.length ? ul : h("div", { class: "panel empty", text: "Всё выполнено в этом разделе" })));
    });
    $("groups").replaceChildren.apply($("groups"), nodes);
    if (focusId) { var again = document.getElementById(focusId); if (again) again.focus(); }
  }

  $("groups").addEventListener("change", function (ev) {
    var id = ev.target.getAttribute && ev.target.getAttribute("data-id");
    if (!id) return; state.done[id] = ev.target.checked; save(); render();
  });
  function armed(btn, label, action) {
    if (btn.getAttribute("data-armed")) { clearTimeout(btn._t); btn.removeAttribute("data-armed"); btn.classList.remove("armed"); btn.textContent = btn._label; action(); return; }
    btn._label = btn.textContent; btn.setAttribute("data-armed", "1"); btn.classList.add("armed"); btn.textContent = label;
    btn._t = setTimeout(function () { btn.removeAttribute("data-armed"); btn.classList.remove("armed"); btn.textContent = btn._label; }, 4000);
  }
  $("groups").addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest("[data-del]"); if (!btn) return;
    var id = btn.getAttribute("data-del");
    armed(btn, "Удалить?", function () { state.custom = state.custom.filter(function (c) { return c.id !== id; }); delete state.done[id]; save(); render(); });
  });
  $("reset").addEventListener("click", function () {
    armed($("reset"), "Точно сбросить?", function () { state.done = {}; save(); render(); toast("Отметки сброшены до исходных."); });
  });
  $("hide-done").checked = !!state.hideDone;
  $("hide-done").addEventListener("change", function (ev) { state.hideDone = ev.target.checked; save(); render(); });

  $("export").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "checklist-progress.json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast("Файл checklist-progress.json сохранён.");
  });
  $("import").addEventListener("click", function () { $("file").click(); });
  $("file").addEventListener("change", function (ev) {
    var f = ev.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var s = JSON.parse(r.result);
        if (!s || typeof s.done !== "object") throw new Error("формат");
        state = { done: s.done || {}, custom: Array.isArray(s.custom) ? s.custom : [], hideDone: !!s.hideDone };
        save(); $("hide-done").checked = state.hideDone; render(); toast("Отметки загружены.");
      } catch (e) { toast("Не удалось прочитать файл: это не файл отметок."); }
    };
    r.readAsText(f); ev.target.value = "";
  });

  var sel = $("new-section");
  SECTIONS.forEach(function (s) { sel.appendChild(h("option", { value: s.key, text: s.title })); });
  sel.value = "extra";
  $("add").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var text = $("new-text").value.trim(); if (!text) { $("new-text").focus(); return; }
    state.custom.push({ id: "custom-" + Date.now(), section: sel.value, text: text });
    save(); $("new-text").value = ""; render();
  });

  countdown(); render();
})();
</script>
</body>
</html>
"""


def build_html() -> str:
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return (
        HTML.replace("__TITLE__", html.escape(data["title"]))
        .replace("__SUBTITLE__", html.escape(data["subtitle"]))
        .replace("__DATA__", payload)
    )


if __name__ == "__main__":
    (DOCS / "CHECKLIST.md").write_text(build_markdown(), encoding="utf-8")
    (DOCS / "checklist.html").write_text(build_html(), encoding="utf-8")
    done = sum(1 for i in data["items"] if i["done"])
    print(f"Готово: docs/CHECKLIST.md и docs/checklist.html ({done} из {len(data['items'])} отмечено)")
