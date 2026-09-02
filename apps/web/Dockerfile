# syntax=docker/dockerfile:1.7

FROM node:26.8.1-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS build
ARG PORTFOLIO_BRANCH
ARG PORTFOLIO_AUTH_MODE
ENV PORTFOLIO_BRANCH=${PORTFOLIO_BRANCH} \
    PORTFOLIO_AUTH_MODE=${PORTFOLIO_AUTH_MODE}
WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY scripts/portfolio-auth-mode.sh /usr/local/bin/portfolio-auth-mode
RUN portfolio-auth-mode check \
    && npm ci

COPY apps/web apps/web
RUN npm run build --workspace @bonifacio/blog-web

FROM nginx:1.29.4-alpine@sha256:4870c12cd2ca986de501a804b4f506ad3875a0b1874940ba0a2c7f763f1855b2 AS runtime
ARG PORTFOLIO_BRANCH
ARG PORTFOLIO_AUTH_MODE
ENV PORTFOLIO_BRANCH=${PORTFOLIO_BRANCH} \
    PORTFOLIO_AUTH_MODE=${PORTFOLIO_AUTH_MODE}
LABEL work.bonifacio.portfolio.branch=${PORTFOLIO_BRANCH} \
      work.bonifacio.portfolio.auth-mode=${PORTFOLIO_AUTH_MODE}

COPY scripts/portfolio-auth-mode.sh /usr/local/bin/portfolio-auth-mode
COPY apps/web/docker/blog-web-entrypoint.sh /usr/local/bin/blog-web-entrypoint
COPY apps/web/nginx-main.conf /etc/nginx/nginx.conf
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html/blog

RUN portfolio-auth-mode check \
    && build_branch="${PORTFOLIO_BRANCH#refs/heads/}" \
    && printf '%s\n%s\n' "$build_branch" "$PORTFOLIO_AUTH_MODE" > /etc/portfolio-auth-build \
    && chmod 0444 /etc/portfolio-auth-build \
    && chmod 0555 /usr/local/bin/portfolio-auth-mode /usr/local/bin/blog-web-entrypoint \
    && chmod -R a=rX /usr/share/nginx/html/blog

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
ENTRYPOINT ["/usr/local/bin/blog-web-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]
