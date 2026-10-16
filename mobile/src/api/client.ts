import type { ApiErrorBody } from "./types";

// Адрес сервера задаётся при сборке: EXPO_PUBLIC_API_URL=https://example.ru
// Эмулятор Android видит хост-машину как 10.0.2.2, физический телефон — по IP в локальной сети.
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, code: string, message: string, requestId?: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.fieldErrors = fieldErrors;
  }

  get isNetwork(): boolean {
    return this.code === "network" || this.code === "timeout";
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query): string {
  const url = `${BASE_URL}/api${path}`;
  if (!query) return url;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `${url}?${parts.join("&")}` : url;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = await res.json();
  } catch {
    // тело не JSON: оставляем общее сообщение
  }
  const fields: Record<string, string> = {};
  for (const e of body.errors ?? []) fields[e.field] = e.message;
  return new ApiError(
    res.status,
    body.code ?? "http_error",
    body.detail ?? `Ошибка сервера (${res.status})`,
    body.request_id,
    fields,
  );
}

export async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: { query?: Query; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new ApiError(
      0,
      aborted ? "timeout" : "network",
      aborted ? "Сервер не отвечает. Попробуйте ещё раз." : "Нет связи с сервером. Проверьте интернет.",
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Человекочитаемое сообщение для любой ошибки (для экранов и диалогов). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Что-то пошло не так";
}
