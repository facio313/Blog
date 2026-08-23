#!/bin/sh
set -eu

portfolio-auth-mode check

if [ "${1:-}" = nginx ]; then
  nginx -t
fi

exec "$@"
