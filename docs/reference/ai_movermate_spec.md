# Реализация AI-модулей для MoverMate (Vision & Smart Planner)

Данное решение закрывает нереализованные задачи из `README.md` проекта **MoverMate** без добавления сторонних тяжеловесных SDK (используются только штатные `FastAPI`, `httpx` и `Pydantic`, уже присутствующие в проекте):
1. **Опись коробки по фото** (`POST /api/projects/{pid}/boxes/{number}/photo-inventory`) — распознавание предметов в открытой коробке или на столе с автоматическим выделением вещей первой необходимости (`first_day`) и хрупких предметов.
2. **План упаковки комнаты по фото (`room-plan`)** (`POST /api/projects/{pid}/room-plan`) — оценка количества коробок и распределение видимых в комнате вещей по коробкам с учётом веса и хрупкости.
3. **Двухшаговый генератор плана переезда с уточняющими вопросами** (`POST /api/projects/{pid}/plan/ai-questions` и `POST /api/projects/{pid}/plan/ai-generate`) — формирование персонализированных задач по этапам (`before`, `moving_day`, `after`).

---

## 1. Настройка окружения (`.env`)

Убедитесь, что в `.env` указана мультимодальная модель (поддерживающая `image_url`), доступная в вашем Spirit LLM Proxy:

```env
AI_BASE_URL=https://llm-proxy.spirit.t-education.com/v1
AI_API_KEY=ваш_ключ
AI_MODEL=openrouter/google/gemini-2.5-flash
AI_TIMEOUT_SECONDS=45
```

---

## 2. Единый клиент LLM / VLM (`backend/app/services/ai_vision.py`)

Создайте файл `backend/app/services/ai_vision.py`. Он отвечает за кодирование изображений в `base64`, отправку запросов в совместимый с OpenAI эндпоинт `/chat/completions` и гарантированный парсинг JSON-ответа.

```python
import base64
import json
import os
import re
import httpx
from fastapi import HTTPException

AI_BASE_URL = os.getenv("AI_BASE_URL", "https://llm-proxy.spirit.t-education.com/v1").rstrip("/")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "openrouter/google/gemini-2.5-flash")
AI_TIMEOUT = float(os.getenv("AI_TIMEOUT_SECONDS", "45"))


def _extract_json(raw_text: str) -> dict:
    """Извлекает JSON даже если модель обернула ответ в markdown-блок ```json ... ```."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AI вернул некорректный JSON: {exc}",
        ) from exc


async def call_llm_json(system_prompt: str, user_content: list | str, max_tokens: int = 1800) -> dict:
    """Выполняет запрос к LLM/VLM с принудительным возвратом JSON-объекта."""
    if not AI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI-провайдер не настроен: отсутствует переменная окружения AI_API_KEY",
        )

    payload = {
        "model": AI_MODEL,
        "response_format": {"type": "json_object"},
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }
    headers = {
        "Authorization": f"Bearer {AI_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=AI_TIMEOUT) as client:
        try:
            resp = await client.post(
                f"{AI_BASE_URL}/chat/completions",
                json=payload,
                headers=headers,
            )
        except httpx.TimeoutException as exc:
            raise HTTPException(status_code=504, detail="Превышено время ожидания ответа от AI") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Сетевая ошибка при обращении к AI: {exc}") from exc

        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Ошибка AI-прокси ({resp.status_code}): {resp.text[:300]}",
            )

        data = resp.json()
        try:
            raw_content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise HTTPException(status_code=502, detail="Некорректная структура ответа от AI-прокси") from exc

        return _extract_json(raw_content)


def image_to_data_url(data: bytes, mime: str = "image/jpeg") -> str:
    """Конвертирует байты изображения в формат Data URL для мультимодального запроса."""
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"
```

---

## 3. Pydantic-схемы (`backend/app/schemas/ai_vision.py`)

Создайте файл `backend/app/schemas/ai_vision.py` со схемами запросов и ответов, полностью совместимыми с существующими сущностями коробок и задач в **MoverMate**.

```python
from typing import Literal
from pydantic import BaseModel, Field

Stage = Literal["before", "moving_day", "after"]


# --- 1. Схемы для описи коробки по фото ---

class RecognizedItem(BaseModel):
    name: str = Field(..., max_length=120, description="Название предмета (с количеством при необходимости)")
    first_day: bool = Field(False, description="Нужна ли вещь в первый день переезда")
    fragile: bool = Field(False, description="Хрупкий ли предмет")


class BoxPhotoInventoryResponse(BaseModel):
    items: list[RecognizedItem] = Field(default_factory=list)
    items_text: str = Field(
        ...,
        description="Готовый список вещей через перенос строки для подстановки в POST .../items/bulk",
    )


# --- 2. Схемы для распределения вещей по коробкам по фото комнаты (room-plan) ---

class SuggestedBoxPlan(BaseModel):
    room: str = Field(..., max_length=60)
    box_label: str = Field(..., description="Краткое назначение коробки, например: Посуда и стекло")
    items: list[str] = Field(default_factory=list)
    items_text: str = Field(..., description="Список вещей через \\n для поля items_text в POST /boxes")
    packing_tip: str = Field("", description="Рекомендация по безопасной упаковке")


class RoomPlanResponse(BaseModel):
    room: str
    estimated_boxes: int = Field(..., ge=1)
    boxes: list[SuggestedBoxPlan] = Field(default_factory=list)


# --- 3. Схемы для двухшагового генератора плана переезда ---

class PlanQuestionsRequest(BaseModel):
    description: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Свободное описание переезда от пользователя",
    )


class ClarifyingQuestion(BaseModel):
    id: str
    question: str
    options: list[str] = Field(default_factory=list, description="Варианты быстрого ответа (чипсы)")


class PlanQuestionsResponse(BaseModel):
    questions: list[ClarifyingQuestion] = Field(default_factory=list)


class QuestionAnswer(BaseModel):
    question: str
    answer: str


class PlanGenerateRequest(BaseModel):
    description: str = Field(..., min_length=3, max_length=1000)
    answers: list[QuestionAnswer] = Field(default_factory=list)
    move_date: str | None = Field(None, description="Планируемая дата переезда (YYYY-MM-DD), если известна")


class GeneratedTask(BaseModel):
    stage: Stage
    title: str = Field(..., max_length=200)
    category: str = Field(..., max_length=40)
    category_color: str = Field("#d94d27")
    due_date: str | None = None


class PlanGenerateResponse(BaseModel):
    tasks: list[GeneratedTask] = Field(default_factory=list)
```

---

## 4. Роутер с промптами и эндпоинтами (`backend/app/routers/ai_vision.py`)

Создайте файл `backend/app/routers/ai_vision.py`.

```python
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from app.schemas.ai_vision import (
    BoxPhotoInventoryResponse,
    PlanGenerateRequest,
    PlanGenerateResponse,
    PlanQuestionsRequest,
    PlanQuestionsResponse,
    RoomPlanResponse,
)
from app.services.ai_vision import call_llm_json, image_to_data_url

router = APIRouter(prefix="/api/projects/{pid}", tags=["ai-features"])

MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 МБ

BOX_PHOTO_PROMPT = """Ты помощник сервиса переезда MoverMate.
По фотографии открытой коробки или разложенных вещей составь точную опись предметов на русском языке.
Правила:
1) Группируй однотипные мелкие предметы (например: "Кружки (4 шт)", "Книги в твёрдом переплёте (6 шт)").
2) Устанавливай first_day=true для вещей первой необходимости (зарядки, удлинители, базовая гигиена, аптечка, документы, чашка/чайник).
3) Устанавливай fragile=true для бьющихся и хрупких вещей (стекло, керамика, мониторы, электроника).
Верни строго JSON по схеме:
{
  "items": [
    {"name": "Электрический чайник", "first_day": true, "fragile": false},
    {"name": "Керамические кружки (4 шт)", "first_day": true, "fragile": true}
  ],
  "items_text": "Электрический чайник\\nКерамические кружки (4 шт)"
}"""

ROOM_PLAN_PROMPT = """Ты опытный логист переезда в сервисе MoverMate.
По фотографии комнаты определи видимые вещи (кроме крупной корпусной мебели) и распредели их по коробкам.
Правила распределения:
1) Не смешивай тяжёлые предметы (книги, инструменты, бытовая техника) с хрупкими (стекло, посуда, декор, хрупкая электроника).
2) Вес одной условной коробки не должен превышать 15–20 кг (книги фасуй небольшими партиями).
3) Для каждой коробки укажи практичный совет по упаковке в поле packing_tip.
Верни строго JSON по схеме:
{
  "room": "Кухня",
  "estimated_boxes": 2,
  "boxes": [
    {
      "room": "Кухня",
      "box_label": "Хрупкая посуда и стекло",
      "items": ["Тарелки глубокие", "Бокалы", "Салатницы"],
      "items_text": "Тарелки глубокие\\nБокалы\\nСалатницы",
      "packing_tip": "Обернуть каждую тарелку бумагой или пупырчатой плёнкой, проложить картон между рядами"
    }
  ]
}"""

QUESTIONS_PROMPT = """Пользователь планирует переезд в сервисе MoverMate.
На основе его исходного описания сформулируй 3 коротких уточняющих вопроса на русском языке, ответы на которые сильнее всего влияют на чек-лист подготовки к переезду (например: наличие грузового лифта и этажность, необходимость разборки крупной мебели, перевозка животных/растений/детей, сдача старой квартиры арендодателю).
Не задавай вопросы о том, что пользователь уже явно указал.
Для каждого вопроса предложи 2–3 коротких варианта ответа в массиве options.
Верни строго JSON:
{
  "questions": [
    {
      "id": "q1",
      "question": "Есть ли грузовой лифт в обоих домах?",
      "options": ["Да, в обоих", "Только в одном", "Нет лифта"]
    }
  ]
}"""

GENERATE_PLAN_PROMPT = """Ты эксперт по организации переездов в сервисе MoverMate.
На основе описания пользователя и его ответов на уточняющие вопросы составь персональный чек-лист задач на русском языке.
Распредели задачи по 3 этапам (stage):
- "before" — подготовка до дня переезда (упаковка, договорённости, документы, разборка мебели)
- "moving_day" — задачи непосредственно в день переезда (контроль погрузки, счётчики, сумка первой необходимости)
- "after" — задачи после переезда (распаковка базовых вещей, проверка техники, регистрация/интернет)

Используй понятные категории (например: "Документы", "Коробки", "Транспорт", "Мебель", "Питомцы", "Быт") и цвета из палитры:
- "#1f8f7a" (зелёный — быт, базовые задачи)
- "#d94d27" (оранжевый — важные организационные задачи, транспорт)
- "#7c3aed" (фиолетовый — особые условия: питомцы, пианино, хрупкое)
- "#315e91" (синий — документы, ЖКХ, интернет)

Если передана дата переезда (move_date), рассчитай логичные даты выполнения due_date в формате YYYY-MM-DD (иначе оставь null).
Верни строго JSON (от 6 до 12 конкретных задач):
{
  "tasks": [
    {
      "stage": "before",
      "title": "Подготовить переноску и запас корма на 2 дня для кота",
      "category": "Питомцы",
      "category_color": "#7c3aed",
      "due_date": null
    }
  ]
}"""


@router.post("/boxes/{number}/photo-inventory", response_model=BoxPhotoInventoryResponse)
async def box_photo_inventory(
    pid: str,
    number: int,
    photo: UploadFile = File(...),
):
    raw = await photo.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Пустой файл изображения")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Размер фото превышает 8 МБ")

    data_url = image_to_data_url(raw, photo.content_type or "image/jpeg")
    result = await call_llm_json(
        BOX_PHOTO_PROMPT,
        [
            {"type": "text", "text": f"Проект {pid}. Составь опись содержимого для коробки № {number}."},
            {"type": "image_url", "image_url": {"url": data_url}},
        ],
    )

    items = result.get("items", [])
    if not result.get("items_text") and items:
        result["items_text"] = "\n".join(
            item["name"] for item in items if isinstance(item, dict) and item.get("name")
        )
    return BoxPhotoInventoryResponse.model_validate(result)


@router.post("/room-plan", response_model=RoomPlanResponse)
async def analyze_room_plan(
    pid: str,
    room: str = Form("Комната"),
    photo: UploadFile = File(...),
):
    raw = await photo.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Пустой файл изображения")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Размер фото превышает 8 МБ")

    data_url = image_to_data_url(raw, photo.content_type or "image/jpeg")
    result = await call_llm_json(
        ROOM_PLAN_PROMPT,
        [
            {"type": "text", "text": f"Проект {pid}. Комната: {room}. Оцени вещи и распредели их по коробкам."},
            {"type": "image_url", "image_url": {"url": data_url}},
        ],
    )

    result.setdefault("room", room)
    boxes = result.get("boxes", [])
    for box in boxes:
        box.setdefault("room", room)
        if not box.get("items_text") and box.get("items"):
            box["items_text"] = "\n".join(box["items"])
    result["estimated_boxes"] = max(1, len(boxes) or result.get("estimated_boxes", 1))

    return RoomPlanResponse.model_validate(result)


@router.post("/plan/ai-questions", response_model=PlanQuestionsResponse)
async def generate_clarifying_questions(pid: str, body: PlanQuestionsRequest):
    result = await call_llm_json(
        QUESTIONS_PROMPT,
        f"Описание переезда от пользователя: {body.description}",
        max_tokens=800,
    )
    return PlanQuestionsResponse.model_validate(result)


@router.post("/plan/ai-generate", response_model=PlanGenerateResponse)
async def generate_personalized_plan(pid: str, body: PlanGenerateRequest):
    answers_block = "\n".join(
        f"- Вопрос: {a.question} | Ответ: {a.answer}" for a in body.answers
    ) or "Дополнительных ответов нет."

    user_prompt = (
        f"Исходное описание переезда: {body.description}\n"
        f"Планируемая дата переезда (move_date): {body.move_date or 'не указана'}\n"
        f"Ответы на уточняющие вопросы:\n{answers_block}"
    )

    result = await call_llm_json(GENERATE_PLAN_PROMPT, user_prompt, max_tokens=1800)
    return PlanGenerateResponse.model_validate(result)
```

---

## 5. Подключение роутера в `backend/app/main.py`

Добавьте подключение нового роутера в основной файл приложения `backend/app/main.py`:

```python
from app.routers import ai_vision

app.include_router(ai_vision.router)
```

---

## 6. Интеграция с фронтендом (`frontend/src/api.ts` и компоненты)

Решение спроектировано так, чтобы не ломать существующие ручки сохранения данных:
- **Опись коробки по фото** возвращает `items_text`, который сразу вставляется в существующее текстовое поле модалки `AddItemsModal` в `BoxPage.tsx` (после чего пользователь может отредактировать список и нажать штатную кнопку сохранения `api.createItemsBulk`).
- **Анализ комнаты (`room-plan`)** возвращает список предложенных коробок `boxes`, каждую из которых можно создать вызовом уже существующего метода `api.createBox(pid, { room: box.room, items_text: box.items_text, fill_later: false })`.
- **Генератор плана** возвращает список задач `tasks`, которые сохраняются вызовом существующего `api.createTask(pid, task)`.

### Добавление методов в `frontend/src/api.ts`

```typescript
export interface RecognizedItem {
  name: string;
  first_day: boolean;
  fragile: boolean;
}

export interface BoxPhotoInventoryResponse {
  items: RecognizedItem[];
  items_text: string;
}

export interface SuggestedBoxPlan {
  room: string;
  box_label: string;
  items: string[];
  items_text: string;
  packing_tip: string;
}

export interface RoomPlanResponse {
  room: string;
  estimated_boxes: number;
  boxes: SuggestedBoxPlan[];
}

// Внутри объекта api:
async recognizeBoxPhoto(pid: string, number: number, file: File): Promise<BoxPhotoInventoryResponse> {
  const form = new FormData();
  form.append("photo", file);
  const res = await fetch(`/api/projects/${pid}/boxes/${number}/photo-inventory`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Не удалось распознать фото коробки");
  return res.json();
},

async analyzeRoomPhoto(pid: string, room: string, file: File): Promise<RoomPlanResponse> {
  const form = new FormData();
  form.append("room", room);
  form.append("photo", file);
  const res = await fetch(`/api/projects/${pid}/room-plan`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Не удалось проанализировать фото комнаты");
  return res.json();
},
```

### Пример кнопки «Заполнить по фото» в `BoxPage.tsx` (внутри `AddItemsModal`)

```tsx
<label className="btn-secondary" style={{ display: "inline-block", cursor: "pointer", marginBottom: 8 }}>
  {aiLoading ? "Распознаём фото..." : "📷 Заполнить опись по фото"}
  <input
    type="file"
    accept="image/*"
    capture="environment"
    hidden
    disabled={aiLoading}
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setAiLoading(true);
      try {
        const res = await api.recognizeBoxPhoto(pid, boxNumber, file);
        setText((prev) => (prev ? `${prev}\n${res.items_text}` : res.items_text));
      } catch (err) {
        alert("Ошибка распознавания фото");
      } finally {
        setAiLoading(false);
      }
    }}
  />
</label>
```