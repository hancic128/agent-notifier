# Releasing

Releases are automated: pushing a `v*` tag publishes to npm and creates a
GitHub release.

## One-time setup

### 1. npm package name

The package is published as `@hancic-site/agent-notifier` (the unscoped name is
taken by an unrelated project). The installed command is still `agent-notifier`
because the `bin` entry keeps that name.

Scoped packages default to private publishing; `publishConfig.access` is set to
`"public"` so no extra flag is needed. Verify ownership:

```bash
npm view @hancic-site/agent-notifier
```


### 2. Authentication — pick one

#### Option A: Trusted Publishing (recommended, no secrets)

Uses GitHub OIDC; nothing long-lived is stored in the repo.

1. Publish the package **once manually** so it exists on npm:
   ```bash
   npm login
   npm publish --access public
   ```
2. On npmjs.com → your package → **Settings → Trusted Publisher** → add a
   GitHub Actions publisher:
   - Organization / user: your GitHub account
   - Repository: `agent-notifier`
   - Workflow filename: `release.yml`
   - Environment: *(leave empty)*
3. That's it. Future tags publish without any token.

> Trusted Publishing requires npm ≥ 11.5.1 and Node ≥ 22.14. The workflow
> upgrades npm before publishing to satisfy this.

#### Option B: Granular access token

1. Create a token at npmjs.com → **Access Tokens → Generate New Token →
   Granular Access Token**, scoped to this package with *Read and write*.
2. Add it as a repository secret named `NPM_TOKEN`.
3. Add the env var back to the publish step:

   ```yaml
   - name: Publish to npm
     run: npm publish --access public --provenance
     env:
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```

Provenance still works with a token, but OIDC is preferred because there is no
secret to leak or rotate.

### 3. Repository metadata

Before the first release, replace the placeholder URLs in `package.json`:

```json
"homepage": "https://github.com/hancic128/agent-notifier#readme",
"repository": { "type": "git", "url": "git+https://github.com/hancic128/agent-notifier.git" },
"bugs": { "url": "https://github.com/hancic128/agent-notifier/issues" }
```

Also update the `curl` examples in `README.md`, `README.zh-CN.md` and
`install.sh` once the final repository path is known.

## Cutting a release

```bash
# 1. bump the version
npm version patch   # or minor / major — updates package.json and creates the tag

# 2. keep src/version.ts in sync
#    (VERSION is a literal so the hook marker stays readable in agent configs)
$EDITOR src/version.ts

# 3. update CHANGELOG.md under a new version heading
$EDITOR CHANGELOG.md

# 4. commit, then push code and tag
git add -A
git commit -m "chore(release): v0.2.1"
git push
git push --tags
```

The tag push triggers `.github/workflows/release.yml`, which:

1. verifies `vX.Y.Z` matches `package.json`
2. runs `sh -n install.sh`, typecheck, tests and the build
3. publishes with `--provenance`
4. creates a GitHub release with auto-generated notes and attaches `install.sh`

## Pre-release versions

```bash
npm version prerelease --preid beta   # 0.2.1-beta.0
git push && git push --tags
```

npm publishes it under the `latest` tag by default. To avoid that, use
`npm publish --tag beta` in the workflow for pre-release versions, or add:

```yaml
- name: Publish pre-release
  if: contains(github.ref_name, '-')
  run: npm publish --tag next --provenance
```

## Verifying a release

```bash
npm view @hancic-site/agent-notifier version
npx @hancic-site/agent-notifier@latest --version

# verify provenance (on npmjs.com the package shows a "Built and signed" badge)
npm audit signatures
```

## Rolling back

npm does not allow republishing a version. If a release is broken:

1. `npm deprecate @hancic-site/agent-notifier@0.2.1 "broken, use 0.2.2"`
2. publish a fixed patch version
3. delete or edit the GitHub release notes if needed

`npm unpublish` is only available within 72 hours and breaks anyone who pinned
the version — prefer deprecation.
