export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function upload<T>(path: string, body: FormData, onProgress: (percentage: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `${API}/api${path}`)
    request.withCredentials = true
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    request.onerror = () => reject(new Error('The upload could not reach the server. Check your connection and retry.'))
    request.onabort = () => reject(new Error('The upload was cancelled. You can retry it.'))
    request.onload = () => {
      let response: { detail?: unknown } & Record<string, unknown> = {}
      try { response = JSON.parse(request.responseText) as typeof response } catch { /* use status text */ }
      if (request.status < 200 || request.status >= 300) {
        const detail = response.detail
        reject(new Error(typeof detail === 'string' ? detail : `Upload failed (${request.status})`))
        return
      }
      if (request.status === 204) resolve(undefined as T)
      else resolve(response as T)
    }
    request.send(body)
  })
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API}/api${path}`, { ...options, headers, credentials: 'include' })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { const data = await response.json(); message = data.detail ?? message } catch { /* keep status message */ }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
export const json = (value: unknown) => JSON.stringify(value)
export type User = { id: string; email: string; full_name: string; role: 'worker' | 'assessor' | 'customer' | 'admin' }
export type Qualification = { id: string; code: string; version: string; title: string; source_name: string; source_url: string; official: boolean; criterion_count?: number }
export type Criterion = { id: string; code: string; description: string; mandatory: boolean; requires_practical: boolean; evidence_count?: number }
export type Worker = { id: string; full_name: string; trade: string; experience_years: number; service_area: string; bio: string; available: boolean; skills: {id:string;name:string;years_experience:number}[]; verified_qualifications: number | {title:string;code:string;version:string;source_name:string;source_url:string;official:boolean}[] }
