import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

type Mapping = Record<string, unknown>

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))

function mapping(value: unknown, label: string): Mapping {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a mapping`)
  }
  return value as Mapping
}

function sequence(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a sequence`)
  return value
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be text`)
  return value
}

async function readWorkspaceFile(relativePath: string): Promise<string> {
  return readFile(path.join(workspaceRoot, relativePath), 'utf8')
}

async function loadWorkspaceYaml(relativePath: string): Promise<Mapping> {
  return mapping(load(await readWorkspaceFile(relativePath)), relativePath)
}

function namedStep(job: Mapping, name: string): Mapping {
  const steps = sequence(job.steps, `${name} job steps`).map((step, index) =>
    mapping(step, `${name} job step ${index + 1}`),
  )
  const step = steps.find((candidate) => candidate.name === name)
  if (!step) throw new Error(`Missing workflow step: ${name}`)
  return step
}

describe('repository deployment contract', () => {
  it('publishes and deploys only the exact main SHA that passed Validate', async () => {
    const source = await readWorkspaceFile('.github/workflows/deploy.yml')
    const workflow = await loadWorkspaceYaml('.github/workflows/deploy.yml')
    const trigger = mapping(mapping(workflow.on, 'deploy trigger').workflow_run, 'workflow_run')
    const jobs = mapping(workflow.jobs, 'deploy jobs')
    const publish = mapping(jobs.publish, 'publish job')
    const deploy = mapping(jobs.deploy, 'deploy job')

    expect(trigger).toMatchObject({ workflows: ['Validate'], types: ['completed'] })
    expect(trigger.branches).toEqual(['dev', 'main'])
    expect(mapping(workflow.permissions, 'workflow permissions')).toEqual({ contents: 'read' })
    expect(mapping(publish.permissions, 'publish permissions')).toEqual({
      contents: 'read',
      packages: 'write',
    })
    expect(mapping(deploy.permissions, 'deploy permissions')).toEqual({
      contents: 'read',
      packages: 'read',
    })
    expect(publish['runs-on']).toBe('ubuntu-24.04-arm')
    expect(deploy['timeout-minutes']).toBe(40)

    const publishCondition = text(publish.if, 'publish condition')
    expect(publishCondition).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(publishCondition).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository',
    )
    expect(publishCondition).toContain("github.event.workflow_run.head_branch != 'main'")
    expect(publishCondition).toContain('github.event.workflow_run.head_sha == github.sha')
    expect(publishCondition).toContain("github.event.workflow_run.event == 'push'")
    expect(publishCondition).toContain("github.event.workflow_run.event == 'workflow_dispatch'")

    const sourceStep = namedStep(publish, 'Validate source identity')
    expect(mapping(sourceStep.env, 'source identity environment').VALIDATED_SHA).toBe(
      '${{ github.event.workflow_run.head_sha }}',
    )
    expect(text(sourceStep.run, 'source identity command')).toContain(
      '[[ "$VALIDATED_SHA" =~ ^[0-9a-f]{40}$ ]]',
    )

    const checkout = namedStep(publish, 'Check out validated source')
    expect(checkout.uses).toBe('actions/checkout@11d5960a326750d5838078e36cf38b85af677262')
    expect(mapping(checkout.with, 'checkout options')).toMatchObject({
      ref: '${{ steps.source.outputs.sha }}',
      'persist-credentials': false,
    })
    expect(
      text(namedStep(publish, 'Verify checked-out commit').run, 'checkout verification'),
    ).toContain('[[ "$(git rev-parse HEAD)" == "$VALIDATED_SHA" ]]')

    for (const [stepName, imageName] of [
      ['Build immutable server runtime image', 'SERVER_IMAGE'],
      ['Build immutable web runtime image', 'WEB_IMAGE'],
    ] as const) {
      const options = mapping(namedStep(publish, stepName).with, `${stepName} options`)
      expect(options.platforms).toBe('linux/arm64')
      expect(options.tags).toBe(`\${{ env.${imageName} }}:\${{ steps.source.outputs.sha }}`)
      expect(options.load).toBe(true)
      expect(options.push).toBe(false)
    }

    const serverTest = mapping(namedStep(publish, 'Test server image').with, 'server test options')
    expect(serverTest).toMatchObject({
      file: './apps/server/Dockerfile',
      target: 'test',
      platforms: 'linux/arm64',
      push: false,
    })
    expect(serverTest['build-args']).toContain(
      'PORTFOLIO_BRANCH=${{ steps.portfolio_auth.outputs.branch }}',
    )
    expect(serverTest['build-args']).toContain(
      'PORTFOLIO_AUTH_MODE=${{ steps.portfolio_auth.outputs.auth_mode }}',
    )

    const serverDockerfile = await readWorkspaceFile('apps/server/Dockerfile')
    const testStage = serverDockerfile
      .split('FROM dependencies AS test\n', 2)[1]
      ?.split('\nFROM dependencies AS build', 1)[0]
    expect(testStage).toBeDefined()
    expect(testStage).toContain('ARG PORTFOLIO_BRANCH')
    expect(testStage).toContain('ARG PORTFOLIO_AUTH_MODE')
    expect(testStage).toContain('ENV PORTFOLIO_BRANCH=${PORTFOLIO_BRANCH}')
    expect(testStage).toContain('PORTFOLIO_AUTH_MODE=${PORTFOLIO_AUTH_MODE}')
    expect(testStage).toContain(
      'COPY scripts/portfolio-auth-mode.sh /usr/local/bin/portfolio-auth-mode',
    )
    expect(testStage).toContain('RUN portfolio-auth-mode check')
    expect(testStage).toContain('npm run typecheck --workspace @bonifacio/blog-server')
    expect(testStage).toContain(
      'npm run test --workspace @bonifacio/blog-server -- test/content.test.ts',
    )
    expect(testStage).not.toContain('postgres.integration.test.ts')

    const publishStep = namedStep(publish, 'Publish the smoke-tested immutable images')
    expect(publishStep.if).toBe("github.event.workflow_run.head_branch == 'main'")
    expect(text(publishStep.run, 'image publish command')).toContain(
      'docker push "$SERVER_RUNTIME_IMAGE"',
    )
    expect(text(publishStep.run, 'image publish command')).toContain(
      'docker push "$WEB_RUNTIME_IMAGE"',
    )

    expect(deploy.needs).toBe('publish')
    expect(deploy.if).toBe("github.event.workflow_run.head_branch == 'main'")
    const deployStep = namedStep(deploy, 'Request restricted server deployment')
    expect(mapping(deployStep.env, 'deploy environment')).toMatchObject({
      DEPLOY_KEY: '${{ secrets.DEPLOY_KEY }}',
      DEPLOY_SHA: '${{ needs.publish.outputs.deploy_sha }}',
      GHCR_TOKEN: '${{ github.token }}',
    })
    const deployCommand = text(deployStep.run, 'deploy command')
    expect(deployCommand).toContain('[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]')
    expect(deployCommand).toContain('"deploy blog $DEPLOY_SHA"')
    expect(source).not.toContain(':latest')
  })

  it('keeps production on immutable images and the external loopback-only cksDB boundary', async () => {
    const composeSource = await readWorkspaceFile('docker-compose.prod.yml')
    const compose = await loadWorkspaceYaml('docker-compose.prod.yml')
    const services = mapping(compose.services, 'production services')
    const server = mapping(services.blogServer, 'blogServer')
    const web = mapping(services.blogWeb, 'blogWeb')
    const networks = mapping(compose.networks, 'production networks')
    const cksDb = mapping(networks.cksDB, 'cksDB network')

    expect(Object.keys(services)).toEqual(['blogServer', 'blogWeb'])
    expect(server.image).toBe(
      'ghcr.io/facio313/blog-server:${BLOG_IMAGE_TAG:?set the exact lowercase 40-character commit SHA}',
    )
    expect(web.image).toBe(
      'ghcr.io/facio313/blog-web:${BLOG_IMAGE_TAG:?set the exact lowercase 40-character commit SHA}',
    )
    expect(composeSource).not.toContain(':latest')
    expect(cksDb).toEqual({ external: true, name: 'cksDB' })
    expect(sequence(server.networks, 'blogServer networks')).toContain('cksDB')

    for (const [name, service, expectedUser, expectedPort] of [
      ['blogServer', server, '10001:10001', '127.0.0.1:9176:9176'],
      ['blogWeb', web, '101:101', '127.0.0.1:5176:8080'],
    ] as const) {
      expect(service.platform, `${name} platform`).toBe('linux/arm64')
      expect(service.user, `${name} user`).toBe(expectedUser)
      expect(service.read_only, `${name} read-only root`).toBe(true)
      expect(sequence(service.ports, `${name} ports`)).toEqual([expectedPort])
      expect(sequence(service.security_opt, `${name} security options`)).toContain(
        'no-new-privileges:true',
      )
      expect(sequence(service.cap_drop, `${name} dropped capabilities`)).toContain('ALL')
      expect(sequence(service.tmpfs, `${name} tmpfs`)[0]).toMatch(/\/tmp:.*noexec.*nosuid.*nodev/)
    }

    expect(mapping(server.environment, 'blogServer environment').BLOG_DATABASE_URL).toContain(
      'dedicated cksDB database URL',
    )
  })

  it('runs the exact images through PostgreSQL, application, and nginx smoke paths before push', async () => {
    const workflow = await loadWorkspaceYaml('.github/workflows/deploy.yml')
    const publish = mapping(mapping(workflow.jobs, 'deploy jobs').publish, 'publish job')
    const smokeStep = namedStep(publish, 'Smoke-test the exact runtime images')
    const smokeEnvironment = mapping(smokeStep.env, 'runtime smoke environment')
    const smoke = await readWorkspaceFile('.github/scripts/smoke-runtime-images.sh')

    expect(smokeStep.run).toBe('bash .github/scripts/smoke-runtime-images.sh')
    expect(smokeEnvironment).toMatchObject({
      SERVER_RUNTIME_IMAGE: '${{ env.SERVER_IMAGE }}:${{ steps.source.outputs.sha }}',
      WEB_RUNTIME_IMAGE: '${{ env.WEB_IMAGE }}:${{ steps.source.outputs.sha }}',
      POSTGRES_RUNTIME_IMAGE: '${{ env.POSTGRES_RUNTIME_IMAGE }}',
    })

    for (const requiredVariable of [
      'SERVER_RUNTIME_IMAGE',
      'WEB_RUNTIME_IMAGE',
      'POSTGRES_RUNTIME_IMAGE',
      'PORTFOLIO_BRANCH',
      'PORTFOLIO_AUTH_MODE',
    ]) {
      expect(smoke).toContain(`\${${requiredVariable}:?${requiredVariable} is required}`)
    }
    expect(smoke).toContain('[[ "$PORTFOLIO_AUTH_MODE" == sso ]]')
    expect(smoke).toContain('"$POSTGRES_RUNTIME_IMAGE"')
    expect(smoke).toContain('"$SERVER_RUNTIME_IMAGE"')
    expect(smoke).toContain('"$WEB_RUNTIME_IMAGE"')
    expect(smoke).toContain("fetch('http://127.0.0.1:9176/blog/api/health')")
    expect(smoke).toContain("fetch('http://127.0.0.1:9176/blog/api/posts?limit=1')")
    expect(smoke).toContain('SELECT count(*) FROM schema_migrations')
    expect(smoke).toContain('[[ "$(docker exec "$server_container" id -u)" == 10001 ]]')
    expect(smoke).toContain('[[ "$(docker exec "$web_container" id -u)" == 101 ]]')
    expect(smoke).toContain('does not match image')
    expect(smoke).toContain('docker exec "$web_container" nginx -t')
    expect(smoke).toContain('"${origin}/blog/"')
    expect(smoke).toContain('"${origin}/blog/posts/runtime-smoke"')
    expect(smoke).toContain('"${origin}/blog/api/health"')
    expect(smoke).toContain("grep -Eiq '^cache-control:.*public.*immutable'")
    expect(smoke).toContain('write-out \'%{http_code}\' "${origin}/"')
  })
})
