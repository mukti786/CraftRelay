import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { createServer } from 'vite'

const root = process.cwd()

test('customer requests and assessment remediation share persistent browser-local records', async () => {
  const saved = new Map()
  globalThis.localStorage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
    removeItem: key => saved.delete(key),
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
    const localApi = await vite.ssrLoadModule('/src/demo.ts')
    localApi.resetDemoState()
    const call = (path, method = 'GET', body) => localApi.demoApi(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })

    localApi.loginDemoRole('worker')
    const sampleRequests = await call('/worker/requests')
    assert.equal(sampleRequests.length, 1)
    assert.equal(sampleRequests[0].status, 'REQUESTED')
    localApi.loginDemoRole('assessor')
    await assert.rejects(() => call('/worker/requests'), error => error.status === 403)

    localApi.loginDemoRole('customer')
    const workers = await call('/customers/workers?q=masonry&area=raipur')
    assert.equal(workers.length, 1)
    const created = await call('/customer/requests', 'POST', {
      worker_id: workers[0].id, title: 'Repair front steps', service_type: 'Masonry',
      description: 'Rebuild the two loose front steps and level the landing.', location: 'Raipur', preferred_date: '',
    })
    const requestId = created.id
    assert.equal(created.status, 'REQUESTED')
    await assert.rejects(() => call('/customer/requests', 'POST', { worker_id: workers[0].id, title: 'Repair front steps', service_type: 'Masonry',
      description: 'Rebuild the two loose front steps and level the landing.', location: 'Raipur', preferred_date: '' }), error => error.status === 409)
    await assert.rejects(() => call(`/requests/${requestId}`, 'PATCH', { status: 'ACCEPTED' }), error => error.status === 409)
    localApi.loginDemoRole('assessor')
    await assert.rejects(() => call(`/customer/requests/${requestId}/review`, 'POST', { rating: 5 }), error => error.status === 403)
    localApi.loginDemoRole('worker')
    assert.ok((await call('/worker/requests')).some(request => request.id === requestId))
    await call(`/requests/${requestId}`, 'PATCH', { status: 'ACCEPTED' })
    await assert.rejects(() => call(`/requests/${requestId}`, 'PATCH', { status: 'ACCEPTED' }), error => error.status === 409)
    localApi.loginDemoRole('customer')
    assert.equal((await call('/customer/requests')).find(request => request.id === requestId).status, 'ACCEPTED')
    localApi.loginDemoRole('worker')
    await call(`/requests/${requestId}`, 'PATCH', { status: 'IN_PROGRESS' })
    await call(`/requests/${requestId}`, 'PATCH', { status: 'COMPLETED' })
    localApi.loginDemoRole('customer')
    await call(`/customer/requests/${requestId}/review`, 'POST', { rating: 5, comment: 'Clear communication and careful work.' })
    await assert.rejects(() => call(`/customer/requests/${requestId}/review`, 'POST', { rating: 5, comment: '' }), error => error.status === 409)
    assert.equal((await call('/customer/requests')).find(request => request.id === requestId).review.rating, 5)

    localApi.loginDemoRole('worker')
    const openedCase = await call('/worker/cases', 'POST', { qualification_id: 'demo-qualification-masonry-v1' })
    for (const criterion of openedCase.criteria) {
      const form = new globalThis.FormData()
      form.set('criterion_id', criterion.id)
      form.set('description', `Evidence note for ${criterion.code}`)
      form.set('file', new globalThis.File(['synthetic placeholder'], `${criterion.code}.pdf`, { type: 'application/pdf' }))
      await localApi.demoUpload(`/worker/cases/${openedCase.id}/evidence`, form, () => undefined)
    }
    await call(`/worker/cases/${openedCase.id}/submit`, 'POST')
    localApi.loginDemoRole('assessor')
    let queue = await call('/assessor/cases')
    let assessment = queue.find(item => item.id === openedCase.id)
    assert.ok(assessment)
    const evidence = assessment.criteria[0].evidence[0]
    await call(`/assessor/evidence/${evidence.id}`, 'PATCH', { status: 'NEEDS_MORE', notes: 'Please add a clearer note about alignment.' })
    localApi.loginDemoRole('worker')
    const remediationCase = (await call('/worker/cases')).find(item => item.id === openedCase.id)
    assert.equal(remediationCase.status, 'NEEDS_MORE')
    const remediation = new globalThis.FormData()
    remediation.set('criterion_id', remediationCase.criteria[0].id)
    remediation.set('description', 'Additional explanation of alignment')
    remediation.set('file', new globalThis.File(['synthetic placeholder'], 'alignment.pdf', { type: 'application/pdf' }))
    await localApi.demoUpload(`/worker/cases/${openedCase.id}/evidence`, remediation, () => undefined)
    await call(`/worker/cases/${openedCase.id}/submit`, 'POST')
    localApi.loginDemoRole('assessor')
    queue = await call('/assessor/cases')
    assessment = queue.find(item => item.id === openedCase.id)
    for (const criterion of assessment.criteria) {
      await call(`/assessor/cases/${openedCase.id}/criteria/${criterion.id}`, 'PUT', { result: 'COMPETENT', notes: 'Evidence meets this criterion.' })
    }
    await call(`/assessor/cases/${openedCase.id}/verify`, 'POST')
    localApi.loginDemoRole('customer')
    assert.equal((await call('/customers/workers?verified=true'))[0].verified_qualifications.length, 1)

    const persisted = JSON.parse(saved.get('craftrelay.sih-demo.v1'))
    assert.ok(persisted.requests.some(request => request.id === requestId), 'request persists in localStorage')
    assert.equal(persisted.cases.find(item => item.id === openedCase.id).status, 'VERIFIED', 'formal human decision persists separately')
    const reloaded = await vite.ssrLoadModule('/src/demo.ts?reload-test=1')
    assert.equal((await reloaded.demoApi('/auth/me')).role, 'customer', 'workspace session survives module reload')
    assert.ok((await reloaded.demoApi('/customer/requests')).some(request => request.id === requestId), 'request is visible after module reload')
    localApi.resetDemoState()
  } finally {
    await vite.close()
    delete globalThis.localStorage
  }
})
