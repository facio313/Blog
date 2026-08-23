# syntax=docker/dockerfile:1.7

FROM node:26.7.0-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS dependencies
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS test
ARG PORTFOLIO_BRANCH
ARG PORTFOLIO_AUTH_MODE
ENV PORTFOLIO_BRANCH=${PORTFOLIO_BRANCH} \
    PORTFOLIO_AUTH_MODE=${PORTFOLIO_AUTH_MODE}
COPY scripts/portfolio-auth-mode.sh /usr/local/bin/portfolio-auth-mode
RUN portfolio-auth-mode check \
    && chmod 0555 /usr/local/bin/portfolio-auth-mode
COPY tsconfig.base.json ./
COPY apps/server apps/server
COPY content/seed/posts.json content/seed/posts.json
RUN npm run typecheck --workspace @bonifacio/blog-server \
    && npm run test --workspace @bonifacio/blog-server -- test/content.test.ts

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/server apps/server
RUN npm run build --workspace @bonifacio/blog-server

FROM node:26.7.0-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS production-dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace @bonifacio/blog-server --include-workspace-root=false \
    && npm cache clean --force

FROM node:26.7.0-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS runtime
ARG PORTFOLIO_BRANCH
ARG PORTFOLIO_AUTH_MODE
ENV NODE_ENV=production \
    PORTFOLIO_BRANCH=${PORTFOLIO_BRANCH} \
    PORTFOLIO_AUTH_MODE=${PORTFOLIO_AUTH_MODE}
LABEL work.bonifacio.portfolio.branch=${PORTFOLIO_BRANCH} \
      work.bonifacio.portfolio.auth-mode=${PORTFOLIO_AUTH_MODE}

COPY scripts/portfolio-auth-mode.sh /usr/local/bin/portfolio-auth-mode
RUN portfolio-auth-mode check \
    && build_branch="${PORTFOLIO_BRANCH#refs/heads/}" \
    && printf '%s\n%s\n' "$build_branch" "$PORTFOLIO_AUTH_MODE" > /etc/portfolio-auth-build \
    && chmod 0444 /etc/portfolio-auth-build \
    && addgroup -S -g 10001 blog \
    && adduser -S -D -H -u 10001 -G blog blog \
    && chmod 0555 /usr/local/bin/portfolio-auth-mode

WORKDIR /app
COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/server/dist ./dist
COPY apps/server/package.json ./package.json
COPY apps/server/migrations ./migrations
COPY content/seed/posts.json ./content/seed/posts.json

RUN chmod -R a=rX /app

USER 10001:10001
RUN test ! -w /app \
    && test -r /app/content/seed/posts.json
EXPOSE 9176
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:9176/blog/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["portfolio-auth-mode", "exec", "--"]
CMD ["node", "dist/server.js"]
