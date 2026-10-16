#!/usr/bin/env bash
# Отправка кода в GitLab организаторов (проект команды) без потери их файлов.
#   scripts/push-to-gitlab.sh
#
# Что делает:
#   1. подключает remote `gitlab` (адрес без пароля);
#   2. забирает master организаторов (там policy.yml и стартовый .gitlab-ci.yml);
#   3. вливает его в вашу ветку, историю не перезаписывает (никакого force-push);
#      при конфликте .gitlab-ci.yml берётся версия организаторов, ваша сохраняется в docs/;
#   4. пушит текущую ветку в master.
# Пароль: при первом запросе логин - любое имя, пароль - токен доступа GitLab (scope write_repository).
# macOS запомнит его в связке ключей, дальше спрашивать не будет. Токен нигде не сохраняется скриптом.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REMOTE="${GITLAB_REMOTE:-gitlab}"
URL="${GITLAB_URL:-https://gitlab.t-education.com/hack-led-20/prod_1.git}"
TARGET="${GITLAB_BRANCH:-master}"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

git remote get-url "$REMOTE" >/dev/null 2>&1 || git remote add "$REMOTE" "$URL"
[ -z "$(git status --porcelain)" ] || die "Есть незакоммиченные изменения: закоммитьте их и повторите."
BRANCH="$(git branch --show-current)"
[ -n "$BRANCH" ] || die "Вы не на ветке (detached HEAD)."

say "1/4 Забираю $TARGET организаторов ($REMOTE)"
git fetch "$REMOTE" "$TARGET" || die "Не удалось подключиться к GitLab. Проверьте логин (любой) и токен (scope write_repository)."

if git merge-base --is-ancestor "$REMOTE/$TARGET" HEAD; then
  say "2/4 Файлы организаторов уже в вашей истории: сливать нечего"
else
  say "2/4 Вливаю историю организаторов (policy.yml и стартовый CI)"
  # Ваш прежний .gitlab-ci.yml сохраняем: он описывал деплой по SSH и может пригодиться
  if git show "$REMOTE/$TARGET:.gitlab-ci.yml" >/dev/null 2>&1 && [ -f .gitlab-ci.yml ] && [ ! -f docs/gitlab-ci.own.yml ]; then
    cp .gitlab-ci.yml docs/gitlab-ci.own.yml
    git add docs/gitlab-ci.own.yml
    git commit -q -m "docs: keep our own CI config before taking the organizers' one"
  fi
  if ! git merge "$REMOTE/$TARGET" --allow-unrelated-histories --no-edit -m "Merge organizers' $TARGET (policy.yml, default CI)"; then
    conflicted="$(git diff --name-only --diff-filter=U)"
    if [ "$conflicted" = ".gitlab-ci.yml" ]; then
      git checkout --theirs .gitlab-ci.yml
      git add .gitlab-ci.yml
      git commit -q --no-edit
      say "   конфликт .gitlab-ci.yml решён в пользу организаторов (ваш вариант: docs/gitlab-ci.own.yml)"
    else
      git merge --abort || true
      die "Конфликты в файлах: $conflicted. Слияние отменено, ничего не отправлено."
    fi
  fi
fi

say "3/4 Проверяю, что файлы организаторов на месте"
for f in .gitlab-ci.yml policy.yml; do
  [ -f "$f" ] || die "Нет файла $f после слияния: отправка остановлена."
done

say "4/4 Отправляю $BRANCH -> $REMOTE/$TARGET"
if git push "$REMOTE" "HEAD:$TARGET"; then
  say "Готово. Пайплайн: ${URL%.git}/-/pipelines"
else
  cat >&2 <<E

Push в $TARGET отклонён. Частые причины: ветка master защищена (пушить в неё может только Maintainer).
Тогда отправьте в отдельную ветку и откройте Merge Request:
  git push $REMOTE HEAD:refs/heads/dev
E
  exit 1
fi
