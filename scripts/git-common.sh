#!/usr/bin/env bash

git_normalize_context_token() {
  local token="$1"
  case "${token}" in
    posts) printf 'post' ;;
    users) printf 'user' ;;
    images) printf 'image' ;;
    comments) printf 'comment' ;;
    notifications) printf 'notification' ;;
    tests) printf 'test' ;;
    *) printf '%s' "${token}" ;;
  esac
}

git_context_from_path() {
  local path="$1"
  shift

  local stripped raw normalized token ignored
  local context_tokens=()
  local default_ignored=(
    page layout route loading index
    component components
    lib utils util
    hooks hook
    client server
    types shared
    readme id slug
  )
  local ignored_tokens=("${default_ignored[@]}" "$@")

  stripped="$(printf '%s' "${path}" | sed -E 's#^\./##; s#^\.agents/skills/##; s#^docs/##; s#^tests/##; s#^app/##; s#^features/##; s#^components/##; s#^lib/##; s#^scripts/##; s#\.[A-Za-z0-9]+$##')"

  IFS='/' read -r -a raw_tokens <<< "${stripped}"
  for raw in "${raw_tokens[@]}"; do
    [[ "${raw}" =~ ^\[.*\]$ ]] && continue

    normalized="$(
      printf '%s' "${raw}" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g; s/-+/-/g'
    )"

    [[ -z "${normalized}" ]] && continue

    for ignored in "${ignored_tokens[@]}"; do
      if [[ "${normalized}" == "${ignored}" ]]; then
        normalized=""
        break
      fi
    done

    [[ -z "${normalized}" ]] && continue

    token="$(git_normalize_context_token "${normalized}")"
    context_tokens+=("${token}")
    if [[ "${#context_tokens[@]}" -ge 2 ]]; then
      break
    fi
  done

  if [[ "${#context_tokens[@]}" -eq 0 ]]; then
    printf ''
    return
  fi

  (
    IFS='-'
    printf '%s' "${context_tokens[*]}"
  )
}

git_infer_topic_from_diff_text() {
  local diff_lines="$1"
  local diff_lower

  [[ -z "${diff_lines}" ]] && return

  diff_lower="$(printf '%s\n' "${diff_lines}" | tr '[:upper:]' '[:lower:]')"

  if printf '%s\n' "${diff_lower}" | grep -Eq 'og:image|ogimage|opengraph|twitter:image|summary_large_image'; then
    if printf '%s\n' "${diff_lower}" | grep -Eq '\bwidth\b' \
      && printf '%s\n' "${diff_lower}" | grep -Eq '\bheight\b'; then
      printf '%s' 'og-image-aspect-ratio'
    else
      printf '%s' 'og-image-metadata'
    fi
    return
  fi

  if printf '%s\n' "${diff_lower}" | grep -Eq 'aspect_ratio|aspectratio'; then
    printf '%s' 'aspect-ratio'
    return
  fi

  if printf '%s\n' "${diff_lower}" | grep -Eq 'canonical'; then
    printf '%s' 'canonical-metadata'
    return
  fi

  if printf '%s\n' "${diff_lower}" | grep -Eq 'summary_large_image|twitter:image'; then
    printf '%s' 'share-card-image'
  fi
}
