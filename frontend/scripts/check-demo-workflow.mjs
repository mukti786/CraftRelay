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
    assert.ok(sampleRequests[0].created_at, 'sample request includes its creation timestamp')
    localApi.loginDemoRole('assessor')
    await assert.rejects(() => call('/worker/requests'), error => error.status === 403)

    localApi.loginDemoRole('customer')
    const workers = await call('/customers/workers?q=masonry&area=raipur')
    assert.equal(workers.length, 1)
    await assert.rejects(() => call('/customer/requests', 'POST', {
      worker_id: workers[0].id, title: 'Repair front steps', service_type: 'Masonry',
      description: 'Rebuild the two loose front steps and level the landing.', location: 'Raipur', preferred_date: '2026-02-31',
    }), error => error.status === 422)
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
    const createdCase = await call('/worker/cases', 'POST', { qualification_id: 'demo-qualification-masonry-v1' })
    assert.equal(createdCase.id, 'demo-case-asha-001', 'the worker continues the existing qualification case')
    assert.equal(createdCase.status, 'IN_PROGRESS')
    assert.equal((await call('/worker/cases', 'POST', { qualification_id: 'demo-qualification-masonry-v1' })).id, createdCase.id, 'duplicate case creation reuses the existing case')
    const openedCase = (await call('/worker/cases')).find(item => item.id === createdCase.id)
    assert.ok(openedCase)
    for (const criterion of openedCase.criteria) {
      const form = new globalThis.FormData()
      form.set('criterion_id', criterion.id)
      form.set('description', `Evidence note for ${criterion.code}`)
      form.set('file', new globalThis.File(['synthetic placeholder'], `${criterion.code}.pdf`, { type: 'application/pdf' }))
      await localApi.demoUpload(`/worker/cases/${openedCase.id}/evidence`, form, () => undefined)
    }
    const task = openedCase.practical_tasks[0]
    assert.ok(task && task.official === false, 'practical task is clearly illustrative')
    assert.equal(task.attempts.length, 1, 'the seeded synthetic task attempt is available for the review workflow')
    await call(`/worker/cases/${openedCase.id}/submit`, 'POST')
    localApi.loginDemoRole('assessor')
    let queue = await call('/assessor/cases')
    let assessment = queue.find(item => item.id === openedCase.id)
    assert.ok(assessment)
    await call(`/assessor/task-attempts/${assessment.practical_tasks[0].attempts[0].id}/review`, 'PUT', {
      result: 'NEEDS_MORE', notes: 'Please explain how you maintained a consistent joint.'
    })
    await assert.rejects(() => call(`/assessor/task-attempts/${assessment.practical_tasks[0].attempts[0].id}/review`, 'PUT', {
      result: 'SATISFACTORY', notes: 'Duplicate review should not be accepted.'
    }), error => error.status === 409)
    localApi.loginDemoRole('worker')
    const remediationCase = (await call('/worker/cases')).find(item => item.id === openedCase.id)
    assert.equal(remediationCase.status, 'NEEDS_MORE')
    const taskRemediation = new globalThis.FormData()
    taskRemediation.set('description', 'Additional explanation and repeat demonstration of joint consistency.')
    taskRemediation.set('file', new globalThis.File(['synthetic placeholder'], 'task-remediation.pdf', { type: 'application/pdf' }))
    await localApi.demoUpload(`/worker/cases/${openedCase.id}/tasks/${task.id}/attempts`, taskRemediation, () => undefined)
    await call(`/worker/cases/${openedCase.id}/submit`, 'POST')
    localApi.loginDemoRole('assessor')
    queue = await call('/assessor/cases')
    assessment = queue.find(item => item.id === openedCase.id)
    const evidence = assessment.criteria[0].evidence[0]
    await call(`/assessor/evidence/${evidence.id}`, 'PATCH', { status: 'NEEDS_MORE', notes: 'Please add a clearer note about alignment.' })
    localApi.loginDemoRole('worker')
    const remediation = new globalThis.FormData()
    remediation.set('criterion_id', remediationCase.criteria[0].id)
    remediation.set('description', 'Additional explanation of alignment')
    remediation.set('file', new globalThis.File(['synthetic placeholder'], 'alignment.pdf', { type: 'application/pdf' }))
    await localApi.demoUpload(`/worker/cases/${openedCase.id}/evidence`, remediation, () => undefined)
    await call(`/worker/cases/${openedCase.id}/submit`, 'POST')
    localApi.loginDemoRole('assessor')
    queue = await call('/assessor/cases')
    assessment = queue.find(item => item.id === openedCase.id)
    const latestAttempt = assessment.practical_tasks[0].attempts.at(-1)
    await call(`/assessor/task-attempts/${latestAttempt.id}/review`, 'PUT', {
      result: 'SATISFACTORY', notes: 'The repeat attempt meets the illustrative rubric.'
    })
    for (const criterion of assessment.criteria) {
      await call(`/assessor/cases/${openedCase.id}/criteria/${criterion.id}`, 'PUT', { result: 'COMPETENT', notes: 'Evidence meets this criterion.' })
    }
    await call(`/assessor/cases/${openedCase.id}/verify`, 'POST')
    localApi.loginDemoRole('customer')
    assert.equal((await call('/customers/workers?verified=true'))[0].verified_qualifications.length, 1)

    const persisted = JSON.parse(saved.get('craftrelay.sih-demo.v1'))
    assert.ok(persisted.requests.some(request => request.id === requestId), 'request persists in localStorage')
    assert.equal(persisted.cases.find(item => item.id === openedCase.id).status, 'VERIFIED', 'formal human decision persists separately')
    assert.equal(persisted.cases.find(item => item.id === openedCase.id).task_attempts.at(-1).review.result, 'SATISFACTORY', 'task outcome and review persist separately from competency')
    const reloaded = await vite.ssrLoadModule('/src/demo.ts?reload-test=1')
    assert.equal((await reloaded.demoApi('/auth/me')).role, 'customer', 'workspace session survives module reload')
    assert.ok((await reloaded.demoApi('/customer/requests')).some(request => request.id === requestId), 'request is visible after module reload')
    localApi.resetDemoState()
  } finally {
    await vite.close()
    delete globalThis.localStorage
  }
})
