import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const root = process.cwd()
const localeSource = fs.readFileSync(path.join(root, 'src/i18n.tsx'), 'utf8')
const dictionaryKeys = block => [...block.matchAll(/'((?:\\.|[^'])+)'\s*:/g)].map(match => match[1].replaceAll("\\'", "'"))
const englishBlock = localeSource.match(/const english = \{([\s\S]*?)\} as const/)?.[1]
const hindiBlock = localeSource.match(/const hindi: Record<keyof typeof english, string> = \{([\s\S]*?)\n\}/)?.[1]
const draftBlock = localeSource.match(/const draft: Partial<Record<keyof typeof english, string>> = \{([\s\S]*?)\n\}/)?.[1]
assert.ok(englishBlock && hindiBlock && draftBlock, 'Could not read the English, Hindi, and Chhattisgarhi draft dictionaries')
const englishKeys = new Set(dictionaryKeys(englishBlock))
const hindiKeys = new Set(dictionaryKeys(hindiBlock))
const draftKeys = new Set(dictionaryKeys(draftBlock))

test('Hindi contains every English translation key', () => {
  assert.deepEqual([...englishKeys].filter(key => !hindiKeys.has(key)), [])
  assert.deepEqual([...hindiKeys].filter(key => !englishKeys.has(key)), [])
  const hindiValues = [...hindiBlock.matchAll(/'((?:\\.|[^'])+)'\s*:\s*'((?:\\.|[^'])*)'/g)].map(match => match[2])
  assert.ok(hindiValues.every(value => value.trim().length > 0), 'Hindi translations must not be blank')
})

test('all static JSX text and accessible text attributes have translation keys', () => {
  const sourceDir = path.join(root, 'src')
  const files = fs.readdirSync(sourceDir).filter(file => file.endsWith('.tsx') && file !== 'i18n.tsx')
  const visibleText = new Set()
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(sourceDir, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = node => {
      if (ts.isJsxText(node)) {
        const value = node.text.replace(/\s+/g, ' ').trim()
        if (value) visibleText.add(value)
      }
      if (ts.isJsxAttribute(node) && ['placeholder', 'aria-label', 'aria-description', 'title', 'alt'].includes(node.name.getText(source))) {
        const value = node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text.trim() : ''
        if (value) visibleText.add(value)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  const missing = [...visibleText].filter(value => /[A-Za-z]{2,}/.test(value) && !englishKeys.has(value)).sort()
  assert.deepEqual(missing, [])
})

test('draft locale omissions are explicit and visible to users', () => {
  const untranslated = [...englishKeys].filter(key => !draftKeys.has(key))
  assert.ok(untranslated.length > 0, 'Draft locale should retain an explicit review backlog')
  assert.match(localeSource, /missingDraftCount/)
  assert.match(localeSource, /labels remain in English for review/)
})

test('language preference persists and switching does not key or remount workflow forms', () => {
  assert.match(localeSource, /localStorage\.getItem\(preferenceKey\)/)
  assert.match(localeSource, /localStorage\.setItem\(preferenceKey, locale\)/)
  const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  assert.match(appSource, /<LocaleProvider><AppWorkspace\/><\/LocaleProvider>/)
  assert.match(appSource, /value=\{locale\} onChange=\{event=>setLocale/)
  assert.match(localeSource, /document\.documentElement\.lang = locale/)
  assert.match(localeSource, /document\.title = brandLine/)
  assert.match(localeSource, /meta\[name="description"\]/)
  assert.match(localeSource, /Intl\.DateTimeFormat\(language, options\)/)
  assert.match(localeSource, /value\.startsWith\(prefix\)/)
  assert.ok(!appSource.includes('<Localized key='), 'Locale changes must keep the active workflow subtree mounted')
  for (const file of ['Worker.tsx', 'Assessor.tsx', 'Customer.tsx', 'Admin.tsx']) {
    assert.match(fs.readFileSync(path.join(root, 'src', file), 'utf8'), /<Localized>/, `${file} must localize its own custom-component render boundary`)
  }
})

test('English/Hindi switching updates representative page text and stored preference survives a reload', async () => {
  const preference = new Map()
  globalThis.localStorage = {
    getItem: key => preference.get(key) ?? null,
    setItem: (key, value) => preference.set(key, String(value)),
  }
  const vite = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const i18n = await vite.ssrLoadModule('/src/i18n.tsx')
    assert.equal(i18n.readLocalePreference(), 'en')
    const renderWorkerHeading = () => renderToStaticMarkup(React.createElement(
      i18n.LocaleProvider,
      null,
      React.createElement(i18n.Localized, null, React.createElement('h1', null, 'Worker profile')),
    ))

    const english = renderWorkerHeading()
    assert.match(english, /Worker profile/)
    i18n.persistLocalePreference('hi')
    assert.equal(i18n.readLocalePreference(), 'hi')
    const hindi = renderWorkerHeading()
    assert.match(hindi, /कामगार प्रोफ़ाइल/)
    assert.notEqual(hindi, english)

    // A new render simulates a page refresh: the provider restores the persisted locale.
    assert.match(renderWorkerHeading(), /कामगार प्रोफ़ाइल/)
    i18n.persistLocalePreference('en')
    assert.match(renderWorkerHeading(), /Worker profile/)
    assert.equal(i18n.translated('Assessment queue', 'hi'), 'आकलन कतार')
    assert.equal(i18n.translated('Assessment queue', 'en'), 'Assessment queue')
    assert.equal(i18n.translated('IN PROGRESS', 'hi'), 'प्रगति पर')
  } finally {
    await vite.close()
    delete globalThis.localStorage
  }
})

process.stdout.write(`Chhattisgarhi draft coverage: ${draftKeys.size}/${englishKeys.size} labels translated; ${englishKeys.size - draftKeys.size} labels remain in English and are shown with a review notice.\n`)
