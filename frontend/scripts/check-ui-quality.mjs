import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'

const source = file => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8')

test('session failures stay distinct from signed-out state and provide retry', () => {
  const app = source('App.tsx')
  assert.match(app, /cause instanceof ApiError && cause\.status === 401/)
  assert.match(app, /setSessionError\(true\)/)
  assert.match(app, /session-recovery/)
  assert.match(app, /onClick=\{\(\) => void loadSession\(\)\}/)
  assert.match(app, /Could not sign out\. Check your connection and try again\./)
  assert.doesNotMatch(app, /Connected/)
})

test('primary navigation and icon-only actions expose semantics to assistive technology', () => {
  const app = source('App.tsx')
  assert.match(app, /<nav aria-label="Primary navigation">/)
  assert.match(app, /aria-current=\{view===tab\.key\?'page':undefined\}/)
  assert.match(app, /aria-label="Sign out"/)
  assert.match(source('Admin.tsx'), /aria-label=\{`Role: \$\{u\.full_name\}`\}/)
  assert.match(source('Admin.tsx'), /htmlFor=\{`criterion-code-\$\{q\.id\}`\}/)
  assert.match(source('Admin.tsx'), /htmlFor=\{`criterion-description-\$\{q\.id\}`\}/)
  assert.match(source('Admin.tsx'), /aria-expanded=\{show\}/)
})

test('failed data loads do not render success-shaped empty states', () => {
  assert.match(source('Customer.tsx'), /!requests\.length && !error && <EmptyState/)
  assert.match(source('Worker.tsx'), /!cases\.length && !error && <EmptyState/)
  assert.match(source('Admin.tsx'), /!events\.length&&!error&&<div className="empty-state">/)
})

test('session recovery has a narrow responsive layout', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/styles.css'), 'utf8')
  assert.match(css, /\.session-recovery-card\{[^}]*width:min\(100%,460px\)/)
  assert.match(css, /@media\(max-width:420px\)\{\.session-recovery/)
})
