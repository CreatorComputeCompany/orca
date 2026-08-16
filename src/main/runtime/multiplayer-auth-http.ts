import type { IncomingMessage, ServerResponse } from 'node:http'
import { MultiplayerAuthLoginParamsSchema } from '../../shared/multiplayer-auth-contract'
import type { MultiplayerAuthResult } from '../../shared/multiplayer-auth-contract'

const LOGIN_PATH = '/api/multiplayer/login'
const MAX_LOGIN_BODY_BYTES = 4 * 1024
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_ATTEMPT_LIMIT = 5
const GLOBAL_LOGIN_ATTEMPT_LIMIT = 20
const MAX_CONCURRENT_LOGINS = 4

type LoginIssuer = (args: {
  email: string
  password: string
}) => Promise<MultiplayerAuthResult | null>

export function createMultiplayerAuthHttpHandler(issueLogin: LoginIssuer) {
  const attempts = new Map<string, number[]>()
  let globalAttempts: number[] = []
  let activeLogins = 0
  return (request: IncomingMessage, response: ServerResponse): boolean => {
    if (!matchesLoginPath(request.url)) {
      return false
    }
    setSecurityHeaders(response)
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      writeJson(response, 405, { error: 'method_not_allowed' })
      return true
    }
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      writeJson(response, 415, { error: 'unsupported_media_type' })
      return true
    }
    const clientKey = resolveClientKey(request)
    const now = Date.now()
    const recent = (attempts.get(clientKey) ?? []).filter((time) => now - time < LOGIN_WINDOW_MS)
    globalAttempts = globalAttempts.filter((time) => now - time < LOGIN_WINDOW_MS)
    if (
      recent.length >= LOGIN_ATTEMPT_LIMIT ||
      globalAttempts.length >= GLOBAL_LOGIN_ATTEMPT_LIMIT ||
      activeLogins >= MAX_CONCURRENT_LOGINS
    ) {
      response.setHeader('Retry-After', String(LOGIN_WINDOW_MS / 1000))
      writeJson(response, 429, { error: 'too_many_attempts' })
      return true
    }
    attempts.set(clientKey, [...recent, now])
    globalAttempts.push(now)
    activeLogins += 1
    void readJsonBody(request)
      .then((body) => MultiplayerAuthLoginParamsSchema.safeParse(body))
      .then(async (parsed) => {
        if (!parsed.success) {
          writeJson(response, 400, { error: 'invalid_request' })
          return
        }
        let result: MultiplayerAuthResult | null
        try {
          result = await issueLogin(parsed.data)
        } catch {
          writeJson(response, 503, { error: 'login_unavailable' })
          return
        }
        if (!result) {
          writeJson(response, 401, { error: 'invalid_credentials' })
          return
        }
        attempts.delete(clientKey)
        const successfulAttempt = globalAttempts.lastIndexOf(now)
        if (successfulAttempt !== -1) {
          globalAttempts.splice(successfulAttempt, 1)
        }
        writeJson(response, 200, result)
      })
      .catch(() => writeJson(response, 400, { error: 'invalid_request' }))
      .finally(() => {
        activeLogins -= 1
      })
    return true
  }
}

function matchesLoginPath(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false
  }
  try {
    return new URL(rawUrl, 'http://127.0.0.1').pathname.endsWith(LOGIN_PATH)
  } catch {
    return false
  }
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let oversized = false
    request.on('data', (chunk: Buffer) => {
      if (oversized) {
        return
      }
      size += chunk.byteLength
      if (size > MAX_LOGIN_BODY_BYTES) {
        oversized = true
        reject(new Error('request_too_large'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function resolveClientKey(request: IncomingMessage): string {
  for (const header of ['cf-connecting-ip', 'x-real-ip']) {
    const value = request.headers[header]
    if (typeof value === 'string' && value.length <= 64) {
      return value
    }
  }
  return request.socket.remoteAddress ?? 'unknown'
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  if (response.writableEnded) {
    return
  }
  response.statusCode = statusCode
  response.end(JSON.stringify(value))
}
