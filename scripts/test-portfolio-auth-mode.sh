#!/bin/sh
set -eu

script_directory=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
resolver=$script_directory/portfolio-auth-mode.sh

fail() {
  printf '%s\n' "portfolio auth test: $*" >&2
  exit 1
}

assert_mode() {
  branch=$1
  expected=$2
  actual=$(unset PORTFOLIO_AUTH_MODE GITHUB_REF_NAME; PORTFOLIO_BRANCH=$branch "$resolver" print)
  [ "$actual" = "$expected" ] || fail "expected $expected for $branch, got $actual"
}

assert_rejected() {
  description=$1
  shift
  if "$@" >/dev/null 2>&1; then
    fail "$description was accepted"
  fi
}

assert_mode main sso
assert_mode dev sso
assert_mode codex local
assert_mode feature/auth-contract local
assert_mode refs/heads/main sso

github_mode=$(unset PORTFOLIO_BRANCH PORTFOLIO_AUTH_MODE; GITHUB_REF_NAME=dev "$resolver" print)
[ "$github_mode" = sso ] || fail 'GITHUB_REF_NAME fallback did not resolve dev/sso'

assert_rejected 'main/local mismatch' env PORTFOLIO_BRANCH=main PORTFOLIO_AUTH_MODE=local "$resolver" check
assert_rejected 'feature/sso mismatch' env PORTFOLIO_BRANCH=feature/blog PORTFOLIO_AUTH_MODE=sso "$resolver" check
assert_rejected 'empty explicit branch' env PORTFOLIO_BRANCH= PORTFOLIO_AUTH_MODE=local "$resolver" check
assert_rejected 'unsupported branch characters' env PORTFOLIO_BRANCH='feature/blog update' PORTFOLIO_AUTH_MODE=local "$resolver" check
assert_rejected 'empty exec command' env PORTFOLIO_BRANCH=codex PORTFOLIO_AUTH_MODE=local "$resolver" exec --
assert_rejected 'unknown resolver command' env PORTFOLIO_BRANCH=codex PORTFOLIO_AUTH_MODE=local "$resolver" unknown

topic_contract=$(PORTFOLIO_BRANCH=topic PORTFOLIO_AUTH_MODE=local "$resolver" contract)
[ "$topic_contract" = "$(printf 'topic\nlocal')" ] || fail 'contract output was not the canonical two-line value'

topic_environment=$(PORTFOLIO_BRANCH=topic PORTFOLIO_AUTH_MODE=local "$resolver" exec -- env)
printf '%s\n' "$topic_environment" | grep -Fqx 'PORTFOLIO_BRANCH=topic'
printf '%s\n' "$topic_environment" | grep -Fqx 'PORTFOLIO_AUTH_MODE=local'

printf '%s\n' 'portfolio auth mode contract: ok'
