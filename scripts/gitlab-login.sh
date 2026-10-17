#!/usr/bin/env bash
# Один раз сохраняет токен GitLab в связку ключей macOS, чтобы git push/fetch работали без запросов.
#   scripts/gitlab-login.sh
# Токен спрашивается скрытым вводом (на экране не виден), проверяется на GitLab организаторов и нигде,
# кроме связки ключей macOS, не сохраняется. Нужны права токена: read_repository и write_repository.
set -eu
HOST="${GITLAB_HOST:-gitlab.t-education.com}"
PROJECT_URL="${GITLAB_URL:-https://$HOST/hack-led-20/prod_1.git}"

say() { printf '\033[1m%s\033[0m\n' "$*"; }

printf 'Вставьте токен GitLab (символы не видны) и нажмите Enter: '
read -rs TOKEN || true
echo
[ -n "${TOKEN:-}" ] || { echo "Пусто. Скопируйте токен (Cmd+C) и запустите скрипт ещё раз."; exit 1; }

# Проверка настоящим запросом git: логин oauth2 и токен как пароль; ничего не сохраняется
AUTH="$(printf 'oauth2:%s' "$TOKEN" | base64 | tr -d '\n')"
if GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c "http.extraheader=Authorization: Basic $AUTH" \
     ls-remote "$PROJECT_URL" >/dev/null 2>&1; then
  printf 'protocol=https\nhost=%s\nusername=oauth2\npassword=%s\n\n' "$HOST" "$TOKEN" | git credential approve
  say "Токен подошёл и сохранён в связке ключей macOS. Отправка - через MR: git push -o merge_request.create -o merge_request.target=master gitlab HEAD:refs/heads/dev"
  exit 0
fi

echo "Токен не подошёл. Разбираюсь, почему (токен в аргументах не передаётся):"
INFO="$(printf 'PRIVATE-TOKEN: %s\n' "$TOKEN" | curl -sS -m 15 -H @- "https://$HOST/api/v4/personal_access_tokens/self" 2>&1 || true)"
printf '%s' "$INFO" | python3 -c '
import sys, json
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print("  ответ GitLab не разобрать:", raw[:160].replace("\n", " "))
    sys.exit(0)
if "scopes" in d:
    print("  имя:", d.get("name"), "| права:", ", ".join(d.get("scopes", [])), "| действует до:", d.get("expires_at"))
    print("  активен:", d.get("active"), "| отозван:", d.get("revoked"))
    need = {"read_repository", "write_repository"} - set(d.get("scopes", []))
    if need:
        print("  НЕ ХВАТАЕТ прав:", ", ".join(sorted(need)))
else:
    print("  GitLab ответил:", d.get("message") or d.get("error") or d)
    print("  Скорее всего, скопировано не то (пустой буфер, пароль, ключ) или токен отозван.")
'
echo "Создайте новый токен: Preferences → Access tokens, права read_repository и write_repository, и запустите скрипт снова."
exit 1
