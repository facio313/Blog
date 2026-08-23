#!/usr/bin/env bash

set -Eeuo pipefail

: "${SERVER_RUNTIME_IMAGE:?SERVER_RUNTIME_IMAGE is required}"
: "${WEB_RUNTIME_IMAGE:?WEB_RUNTIME_IMAGE is required}"
: "${POSTGRES_RUNTIME_IMAGE:?POSTGRES_RUNTIME_IMAGE is required}"
: "${PORTFOLIO_BRANCH:?PORTFOLIO_BRANCH is required}"
: "${PORTFOLIO_AUTH_MODE:?PORTFOLIO_AUTH_MODE is required}"

sh scripts/portfolio-auth-mode.sh check
[[ "$PORTFOLIO_AUTH_MODE" == sso ]] || {
  echo "The deploy runtime smoke expects a protected main/dev SSO build." >&2
  exit 1
}

for executable in curl docker openssl python3; do
  command -v "$executable" >/dev/null
done

run_suffix="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${RANDOM}"
network_name="blog-runtime-smoke-${run_suffix}"
database_container="blog-runtime-db-${run_suffix}"
server_container="blog-runtime-server-${run_suffix}"
web_container="blog-runtime-web-${run_suffix}"
temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/blog-runtime-smoke.XXXXXX")"

cleanup() {
  docker rm --force "$web_container" "$server_container" "$database_container" \
    >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
  case "$temporary_directory" in
    "${TMPDIR:-/tmp}"/blog-runtime-smoke.*)
      rm -rf -- "$temporary_directory"
      ;;
    *)
      echo "Refusing to remove unexpected temporary directory: ${temporary_directory}" >&2
      ;;
  esac
}
trap cleanup EXIT

report_error() {
  status=$?
  echo "Runtime smoke failed near line ${BASH_LINENO[0]} (exit ${status})." >&2
  return "$status"
}
trap report_error ERR

database_password="$(openssl rand -hex 24)"
database_url="postgresql://blog:${database_password}@postgres:5432/blog"

docker network create "$network_name" >/dev/null
docker run --detach \
  --name "$database_container" \
  --network "$network_name" \
  --network-alias postgres \
  --env POSTGRES_DB=blog \
  --env POSTGRES_USER=blog \
  --env "POSTGRES_PASSWORD=${database_password}" \
  "$POSTGRES_RUNTIME_IMAGE" >/dev/null

database_ready=false
for _ in $(seq 1 60); do
  if docker exec "$database_container" pg_isready --dbname blog --username blog >/dev/null 2>&1; then
    database_ready=true
    break
  fi
  if ! docker inspect --format '{{.State.Running}}' "$database_container" 2>/dev/null | grep -qx true; then
    break
  fi
  sleep 1
done
if [[ "$database_ready" != true ]]; then
  docker logs "$database_container"
  echo "PostgreSQL runtime smoke dependency did not become ready." >&2
  exit 1
fi
echo "PostgreSQL runtime smoke dependency is ready."

docker run --detach \
  --name "$server_container" \
  --network "$network_name" \
  --network-alias blogServer \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --env "PORTFOLIO_BRANCH=${PORTFOLIO_BRANCH}" \
  --env "PORTFOLIO_AUTH_MODE=${PORTFOLIO_AUTH_MODE}" \
  --env NODE_ENV=production \
  --env BLOG_HOST=0.0.0.0 \
  --env BLOG_PORT=9176 \
  --env "BLOG_DATABASE_URL=${database_url}" \
  --env BLOG_PUBLIC_BASE_URL=https://bonifacio.work/blog \
  --env BLOG_CONTENT_BUNDLE_PATH=/app/content/seed/posts.json \
  --env BLOG_AUTO_MIGRATE=true \
  --env BLOG_SEED_ON_START=true \
  "$SERVER_RUNTIME_IMAGE" >/dev/null

server_ready=false
for _ in $(seq 1 90); do
  if docker exec "$server_container" node -e \
    "fetch('http://127.0.0.1:9176/blog/api/health').then(async r=>{if(!r.ok||JSON.stringify(await r.json())!=='{\"ok\":true}')process.exit(1)}).catch(()=>process.exit(1))" \
    >/dev/null 2>&1; then
    server_ready=true
    break
  fi
  if ! docker inspect --format '{{.State.Running}}' "$server_container" 2>/dev/null | grep -qx true; then
    break
  fi
  sleep 1
done
if [[ "$server_ready" != true ]]; then
  docker logs "$server_container"
  echo "Server runtime image did not migrate, seed, and become healthy." >&2
  exit 1
fi
echo "Server runtime image is healthy."

[[ "$(docker exec "$server_container" id -u)" == 10001 ]]
[[ "$(docker exec "$server_container" id -g)" == 10001 ]]
docker exec "$server_container" sh -c \
  'test ! -w / && test ! -w /app && test -w /tmp && test -r /app/content/seed/posts.json' \
  >/dev/null
docker exec "$server_container" node -e \
  "fetch('http://127.0.0.1:9176/blog/api/posts?limit=1').then(async r=>{const b=await r.json();if(!r.ok||!Array.isArray(b.items)||b.items.length!==1||b.total<1)process.exit(1)}).catch(()=>process.exit(1))" \
  >/dev/null
docker exec --env "BLOG_DATABASE_URL=${database_url}" "$server_container" node -e \
  "const{Client}=require('pg');const c=new Client({connectionString:process.env.BLOG_DATABASE_URL});c.connect().then(()=>c.query('SELECT (SELECT count(*) FROM schema_migrations)::int AS migrations, (SELECT count(*) FROM posts)::int AS posts')).then(r=>{if(r.rows[0].migrations<1||r.rows[0].posts<1)process.exitCode=1}).finally(()=>c.end())" \
  >/dev/null
echo "Server permissions, published content, and database state passed."

[[ "$(docker image inspect --format '{{ index .Config.Labels "work.bonifacio.portfolio.branch" }}' "$SERVER_RUNTIME_IMAGE")" == "$PORTFOLIO_BRANCH" ]]
[[ "$(docker image inspect --format '{{ index .Config.Labels "work.bonifacio.portfolio.auth-mode" }}' "$SERVER_RUNTIME_IMAGE")" == "$PORTFOLIO_AUTH_MODE" ]]
if server_contract_failure="$(docker run --rm \
  --env PORTFOLIO_BRANCH=runtime-smoke \
  --env PORTFOLIO_AUTH_MODE=local \
  "$SERVER_RUNTIME_IMAGE" 2>&1)"; then
  echo "Server runtime resolver accepted a branch/auth contract different from its build." >&2
  exit 1
fi
grep -Fq 'does not match image' <<<"$server_contract_failure"

docker run --detach \
  --name "$web_container" \
  --network "$network_name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --env "PORTFOLIO_BRANCH=${PORTFOLIO_BRANCH}" \
  --env "PORTFOLIO_AUTH_MODE=${PORTFOLIO_AUTH_MODE}" \
  --publish 127.0.0.1::8080 \
  "$WEB_RUNTIME_IMAGE" >/dev/null

web_port="$(docker port "$web_container" 8080/tcp | sed -n '1s/.*://p')"
[[ "$web_port" =~ ^[0-9]+$ ]]
origin="http://127.0.0.1:${web_port}"

web_ready=false
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error "${origin}/healthz" --output /dev/null; then
    web_ready=true
    break
  fi
  if ! docker inspect --format '{{.State.Running}}' "$web_container" 2>/dev/null | grep -qx true; then
    break
  fi
  sleep 1
done
if [[ "$web_ready" != true ]]; then
  docker logs "$web_container"
  echo "Web runtime image did not become healthy." >&2
  exit 1
fi
echo "Web runtime image is healthy."

[[ "$(docker exec "$web_container" id -u)" == 101 ]]
[[ "$(docker exec "$web_container" id -g)" == 101 ]]
docker exec "$web_container" sh -c 'test ! -w / && test -w /tmp' >/dev/null
docker exec "$web_container" nginx -t >/dev/null

[[ "$(docker image inspect --format '{{ index .Config.Labels "work.bonifacio.portfolio.branch" }}' "$WEB_RUNTIME_IMAGE")" == "$PORTFOLIO_BRANCH" ]]
[[ "$(docker image inspect --format '{{ index .Config.Labels "work.bonifacio.portfolio.auth-mode" }}' "$WEB_RUNTIME_IMAGE")" == "$PORTFOLIO_AUTH_MODE" ]]
if web_contract_failure="$(docker run --rm \
  --env PORTFOLIO_BRANCH=runtime-smoke \
  --env PORTFOLIO_AUTH_MODE=local \
  "$WEB_RUNTIME_IMAGE" 2>&1)"; then
  echo "Web runtime resolver accepted a branch/auth contract different from its build." >&2
  exit 1
fi
grep -Fq 'does not match image' <<<"$web_contract_failure"

index_headers="${temporary_directory}/index.headers"
index_body="${temporary_directory}/index.html"
curl --fail --silent --show-error --dump-header "$index_headers" \
  "${origin}/blog/" --output "$index_body"
grep -Eiq '^cache-control:.*no-cache' "$index_headers"
grep -Eiq '^content-security-policy:' "$index_headers"
grep -Eiq '^strict-transport-security:' "$index_headers"
grep -Fq '<div id="root"></div>' "$index_body"

spa_body="${temporary_directory}/spa.html"
curl --fail --silent --show-error "${origin}/blog/posts/runtime-smoke" --output "$spa_body"
cmp --silent "$index_body" "$spa_body"

api_headers="${temporary_directory}/api.headers"
api_body="${temporary_directory}/api.json"
curl --fail --silent --show-error --dump-header "$api_headers" \
  "${origin}/blog/api/health" --output "$api_body"
grep -Eiq '^cache-control:.*no-store' "$api_headers"
grep -Eiq '^x-content-type-options:.*nosniff' "$api_headers"
grep -Eiq '^x-frame-options:.*deny' "$api_headers"
python3 -c \
  'import json, pathlib, sys; assert json.loads(pathlib.Path(sys.argv[1]).read_text()) == {"ok": True}' \
  "$api_body"

asset_path="$(python3 -c \
  'import pathlib, re, sys; match = re.search(r"(?:src|href)=\"(/blog/assets/[^\"]+)\"", pathlib.Path(sys.argv[1]).read_text()); assert match; print(match.group(1))' \
  "$index_body")"
asset_headers="${temporary_directory}/asset.headers"
curl --fail --silent --show-error --dump-header "$asset_headers" \
  "${origin}${asset_path}" --output /dev/null
grep -Eiq '^cache-control:.*public.*immutable' "$asset_headers"

[[ "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "${origin}/")" == 404 ]]

echo "Runtime migration, seed, non-root/read-only execution, nginx, SPA, asset, and API proxy smoke passed."
