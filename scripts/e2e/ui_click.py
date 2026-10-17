"""Прокликивает интерфейс в headless Chrome как пользователь: гость, регистрация, план, умный чек-лист, коробки,
статусы, первый день, прогресс, этикетки, кабинет. Ищет элементы по тексту, поэтому переживает смену дизайна,
если надписи на кнопках остались. Создаёт аккаунт - запускать на локальном сервере (scripts/e2e.sh это делает).
С третьим аргументом --demo годится для прода: аккаунт не создаётся (регистрация проверяется до отправки),
вход демо-аккаунтом, работа во временном проекте, который в конце удаляется.
На падении сохраняет скриншот в каталог из второго аргумента."""

import asyncio
import json
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.request

import websockets

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE = sys.argv[1]
OUT = sys.argv[2]
DEMO = "--demo" in sys.argv[3:]
PROJECT = "Переезд UI " + secrets.token_hex(2)

HELPERS = r"""
window.__vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
window.__q = (sel, text) => [...document.querySelectorAll(sel)].find(e => __vis(e) && (!text || e.textContent.replace(/\s+/g,' ').trim().includes(text)));
window.__click = (text, sel='button, a, [role=tab], label, summary') => { const e = __q(sel, text); if (!e) return false; e.click(); return true; };
window.__type = (labelText, value) => {
  const lab = [...document.querySelectorAll('label')].find(l => __vis(l) && l.textContent.includes(labelText));
  const el = lab && (lab.querySelector('input,textarea,select') || document.getElementById(lab.htmlFor));
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
  return true;
};
window.__has = (text) => document.body.innerText.toLowerCase().includes(text.toLowerCase());
"""


async def main():
    prof = tempfile.mkdtemp()
    proc = subprocess.Popen(
        [
            CHROME,
            "--headless=new",
            "--remote-debugging-port=9334",
            "--hide-scrollbars",
            f"--user-data-dir={prof}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    results = []
    try:
        for _ in range(50):
            try:
                ws_url = next(
                    t["webSocketDebuggerUrl"]
                    for t in json.load(
                        urllib.request.urlopen("http://127.0.0.1:9334/json")
                    )
                    if t["type"] == "page"
                )
                break
            except Exception:
                time.sleep(0.2)
        async with websockets.connect(ws_url, max_size=50_000_000) as ws:
            n = 0
            errors = []

            async def cmd(method, **params):
                nonlocal n
                n += 1
                await ws.send(json.dumps({"id": n, "method": method, "params": params}))
                while True:
                    m = json.loads(await ws.recv())
                    if m.get("method") == "Runtime.exceptionThrown":
                        errors.append(
                            m["params"]["exceptionDetails"].get("text", "")
                            + " "
                            + str(
                                m["params"]["exceptionDetails"]
                                .get("exception", {})
                                .get("description", "")
                            )[:200]
                        )
                    if m.get("id") == n:
                        return m.get("result", {})

            async def js(expr):
                r = await cmd(
                    "Runtime.evaluate",
                    expression=HELPERS + ";" + expr,
                    returnByValue=True,
                    awaitPromise=True,
                )
                return r.get("result", {}).get("value")

            async def wait(expr, timeout=6.0):
                t0 = time.time()
                while time.time() - t0 < timeout:
                    if await js(expr):
                        return True
                    await asyncio.sleep(0.25)
                return False

            async def go(path):
                await cmd("Page.navigate", url=BASE + path)
                await asyncio.sleep(1.2)

            async def step(name, ok):
                results.append((name, bool(ok)))
                if not ok:
                    img = (await cmd("Page.captureScreenshot", format="png"))["data"]
                    import base64

                    open(f"{OUT}/fail_{len(results)}.png", "wb").write(
                        base64.b64decode(img)
                    )

            await cmd("Page.enable")
            await cmd("Runtime.enable")
            await cmd(
                "Emulation.setDeviceMetricsOverride",
                width=1280,
                height=900,
                deviceScaleFactor=1,
                mobile=False,
            )

            # ---- гость ----
            await go("/")
            await step(
                "гость: страница «О нас»", await wait("__has('Почему выбирают нас')")
            )
            await js("__click('Коробки', 'nav button')")
            await step(
                "гость: раздел просит регистрацию",
                await wait("__has('доступен после регистрации')"),
            )
            await js("__click('Вопросы')")
            await step(
                "гость: «Вопросы» открываются", await wait("__has('Вопросы и ответы')")
            )
            await js("__click('Нужно ли что-то устанавливать', 'summary')")
            await step(
                "гость: ответ раскрывается",
                await wait("__has('Это сайт: он работает в браузере')"),
            )
            await js("document.querySelector('dialog .close')?.click()")

            # ---- регистрация ----
            login, pw = "ui" + secrets.token_hex(3), secrets.token_urlsafe(10)
            await go("/auth?mode=register")
            await js(
                f"__type('Логин', '{login}'); __type('Пароль', '{pw}'); __type('Повторите', 'другое-значение')"
            )
            await step(
                "регистрация: несовпадение паролей видно",
                await wait("__has('Пароли не совпадают')"),
            )
            if DEMO:
                await js("fetch('/api/auth/demo', {method: 'POST', credentials: 'include'}).then(r => r.ok)")
                await go("/new")
                await step("вход демо-аккаунтом, форма нового переезда", await wait("__has('Новый переезд')", 8))
            else:
                await js(f"__type('Повторите', '{pw}')")
                await js("__click('Создать аккаунт')")
                await step(
                    "регистрация: вход выполнен, форма нового переезда",
                    await wait("__has('Новый переезд')", 8),
                )

            # ---- новый проект ----
            await js(
                f"__type('Название переезда', '{PROJECT}'); __type('Дата переезда', '2030-05-01')"
            )
            await js("__click('Создать проект')")
            await step(
                "проект создан, план пуст", await wait("__has('Пока задач нет')", 8)
            )

            # ---- умный чек-лист: типовые задачи и своя особенность ----
            await js("__click('Умный чек-лист')")
            await wait("__has('Обычный переезд')")
            await js("__click('Обычный переезд', 'label')")
            await js("__click('Показать, что добавим')")
            await wait("(b => b && !b.disabled)(__q('dialog button', 'Добавить всё'))", 8)
            await js("__click('Добавить всё', 'dialog button')")
            await step(
                "умный чек-лист: типовые задачи добавлены",
                await wait("__has('Добавлено задач')", 8),
            )
            await js("__click('Готово')")
            await step(
                "план: задачи появились",
                await wait("!document.querySelector('dialog[open]') && __has('Заказать грузчиков')", 8),
            )
            await js("__click('Умный чек-лист')")
            await wait("__has('Обычный переезд')")
            await step("умный чек-лист без «Своей особенности»", not await js("__has('Своя особенность')"))
            await js("document.querySelector('dialog .close')?.click()")

            # ---- задача на открытом этапе ----
            await js("__click('День переезда', '[role=tab]')")
            await asyncio.sleep(0.4)
            await js("__click('Добавить задачу', '.add-task')")
            await wait("__has('Название')")
            stage = await js(
                "[...document.querySelectorAll('dialog select')][0]?.value"
            )
            await step("«+ Добавить задачу» в этапе выбирает этот этап", stage == "moving_day")
            await js(
                "__type('Что сделать', 'Проверить счётчики') || __type('Задача', 'Проверить счётчики') || __type('Название', 'Проверить счётчики')"
            )
            await js("__click('Добавить', 'dialog button')")
            await step(
                "своя задача добавлена", await wait("__has('Проверить счётчики')")
            )
            await js(
                "[...document.querySelectorAll('.task-card input[type=checkbox]')][0]?.click()"
            )
            await step(
                "отметка задачи срабатывает сразу",
                await wait(
                    "[...document.querySelectorAll('.task-card input[type=checkbox]')][0]?.checked",
                    1.0,
                ),
            )

            # ---- коробки ----
            await go("/boxes")
            await js("__click('+ Коробка')")
            await wait("__has('Комната')")
            await js(
                "__type('Комната', 'Кухня'); __type('Содержимое', 'Чайник\\nКружки\\nТостер')"
            )
            await js("__click('Создать', 'dialog button')")
            await step(
                "коробка создана (открылась её карточка с вещами)",
                await wait("__has('Коробка') && __has('Чайник') && __has('Тостер')"),
            )
            await js(
                "__type('', '') ; const s=document.querySelector('input[type=search], .search input, input[placeholder*=\"Найти\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(s,'Чайник'); s.dispatchEvent(new Event('input',{bubbles:true}))"
            )
            await step(
                "поиск вещи показывает коробку",
                await wait("__has('Чайник') && __has('Кухня')"),
            )
            await go("/")  # переход в коробку через список
            await go("/boxes")
            await js(
                "(document.querySelector('a[aria-label^=\"Коробка № 1,\"]') || __q('a', '#001') || __q('a', '001'))?.click()"
            )
            await step(
                "карточка коробки открывается", await wait("__has('Сменить статус')")
            )
            await js("__click('Сменить статус')")
            await wait("__has('Статус коробки')")
            await js("__click('Доставлена', 'dialog button')")
            await step(
                "статус коробки меняется любым выбором",
                await wait(
                    "!document.querySelector('dialog[open]') && __has('Доставлена')"
                ),
            )
            await js("__click('Упакована', '.badge-button')")
            await wait("document.querySelector('dialog[open]')")
            await js("__click('Повреждена', 'dialog button')")
            await step("статус вещи меняется в окне", await wait("__has('Повреждена')"))
            await js("__click('Первый день', '.chip-toggle')")
            await step(
                "пометка «Первый день» у вещи",
                await wait("!!document.querySelector('.chip-toggle.on')"),
            )
            await js(
                "[...document.querySelectorAll('button[aria-label^=\"Удалить «Тостер\"]')][0]?.click()"
            )
            await step(
                "удаление: окно подтверждения в стиле сайта",
                await wait("__has('Удалить «Тостер»?')"),
            )
            await js("__click('Удалить', '.confirm-dialog button')")
            await step("удаление: вещь удалена", await wait("!__has('Тостер')"))

            # ---- первый день и прогресс ----
            await go("/")
            await js("__click('Первый день', '[role=tab]')")
            await step(
                "вкладка «Первый день» показывает вещь",
                await wait("__has('Коробка № 1')"),
            )
            await go("/progress")
            await step(
                "прогресс: чек-лист распаковки вещей первого дня",
                await wait("__has('Чек-лист по распаковке вещей первого дня')"),
            )
            await js(
                "document.querySelector('.first-day input[type=checkbox]')?.click()"
            )
            await step(
                "прогресс: отметка «распакована»",
                await wait(
                    "document.querySelector('.first-day input[type=checkbox]')?.checked"
                ),
            )
            await js("__click('Памятка по упаковке', 'a')")
            await step("памятка открывается по ссылке с «Прогресса»", await wait("__has('Как упаковать посуду')"))

            # ---- этикетки, печать, сканер, кабинет ----
            await go("/labels")
            await step(
                "этикетки: список с QR",
                await wait("!!document.querySelector('svg, canvas') && __has('Кухня')"),
            )
            await go("/labels/print")
            await step("печать этикеток: страница", await wait("__has('Печать')"))
            await go("/scan")
            await step(
                "сканер: экран открывается",
                await wait("__has('номер') || __has('Сканер') || __has('камер')"),
            )
            await go("/profile")
            await step(
                "кабинет: проект и настройки",
                await wait(f"__has('Настройки проекта «{PROJECT}»')"),
            )
            await js("__type('Куда', 'ул. Лесная, 12')")
            await js("__click('Сохранить')")
            await step("кабинет: адреса сохраняются", await wait("__has('Сохранено')"))
            await go("/about")
            await step("«О нас» для вошедшего", await wait("__has('Перейти к плану')"))
            await step("ошибок JavaScript нет", not errors)
            if DEMO:  # временный проект на проде не оставляем
                gone = await js(
                    f"fetch('/api/projects', {{credentials: 'include'}}).then(r => r.json()).then(ps => (ps.items || ps)"
                    f".filter(p => p.name === '{PROJECT}').map(p => fetch('/api/projects/' + p.id + '?confirm=true', "
                    "{method: 'DELETE', credentials: 'include'}).then(r => r.status))).then(x => Promise.all(x))"
                )
                print("временный проект удалён:", gone)
            if errors:
                print("JS:", errors[:3])
    finally:
        proc.terminate()
    fails = [n for n, ok in results if not ok]
    for n, ok in results:
        print("OK  " if ok else "FAIL", n)
    print(f"шагов: {len(results)}, ошибок: {len(fails)}")
    sys.exit(1 if fails else 0)


asyncio.run(main())
