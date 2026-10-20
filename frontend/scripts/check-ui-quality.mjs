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

test('shared dark UI uses readable controls, contrast-safe disabled states, and visible keyboard focus', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/styles.css'), 'utf8')
  assert.match(css, /body\{font-size:16px;line-height:1\.55\}/)
  assert.match(css, /\.nav-item\{font-size:15px;min-height:44px/)
  assert.match(css, /\.button\{font-size:15px;min-height:44px\}/)
  assert.match(css, /\.status-tag\.verified[^}]*color:#b4f0d8/)
  assert.match(css, /\.alert,\.form-error\{background:#40242b;color:#ffd0cc/)
  assert.match(css, /\.button:disabled[^}]*opacity:1/)
  assert.match(css, /:focus-visible\{outline:3px solid #7bd5ff/)
  assert.match(css, /@media\(max-width:700px\)\{\s*\.content/)

  const luminance = color => color.slice(1).match(/../g).map(part => parseInt(part, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const contrast = (foreground, background) => {
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
    return (lighter + 0.05) / (darker + 0.05)
  }
  for (const background of ['#1679c4', '#087b91', '#0c8098']) {
    assert.ok(contrast('#ffffff', background) >= 4.5, `White button text must meet 4.5:1 contrast on ${background}`)
  }
})
