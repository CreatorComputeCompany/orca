import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

const APP_TICKET_PATH = '/api/runtime/app-ticket'
const MAX_BODY_BYTES = 4 * 1024
const APP_TICKET_TTL_MS = 60_000

export type RuntimeAppTicket = {
  pairingUrl: string
  expiresAt: string
  worktreeId?: string
  email?: string
  member?: {
    key: string
    displayName: string
    deviceIds: string[]
  }
}

export function createRuntimeAppTicketHttpHandler(
  issueTicket: (args: {
    subject: string
    name: string
    email?: string
    issuer?: string
    channelId?: string
    expiresAt: number
  }) => RuntimeAppTicket | Promise<RuntimeAppTicket>
) {
  return (request: IncomingMessage, response: ServerResponse): boolean => {
    if (parsePath(request.url) !== APP_TICKET_PATH) {
      return false
    }
    setSecurityHeaders(response)
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      writeJson(response, 405, { error: 'method_not_allowed' })
      return true
    }
    const configuredSecret = process.env.ORCA_RUNTIME_APP_TICKET_SECRET
    const presentedSecret = readBearer(request.headers.authorization)
    if (!configuredSecret || !presentedSecret || !secretsEqual(configuredSecret, presentedSecret)) {
      writeJson(response, 401, { error: 'unauthorized' })
      return true
    }
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      writeJson(response, 415, { error: 'unsupported_media_type' })
      return true
    }
    void readJsonBody(request)
      .then(async (body) => {
        if (!body || typeof body !== 'object') {
          writeJson(response, 400, { error: 'invalid_request' })
          return
        }
        const value = body as Record<string, unknown>
        if (typeof value.subject !== 'string' || !value.subject.trim()) {
          writeJson(response, 400, { error: 'invalid_request' })
          return
        }
        const name =
          typeof value.name === 'string' && value.name.trim()
            ? value.name.trim().slice(0, 100)
            : 'imabird web'
        const email = typeof value.email === 'string' ? value.email.trim().slice(0, 254) : undefined
        const issuer =
          typeof value.issuer === 'string' ? value.issuer.trim().slice(0, 512) : undefined
        const channelId =
          typeof value.channelId === 'string' ? value.channelId.trim().slice(0, 128) : undefined
        writeJson(
          response,
          201,
          await issueTicket({
            subject: value.subject.trim().slice(0, 200),
            name,
            ...(email ? { email } : {}),
            ...(issuer ? { issuer } : {}),
            ...(channelId ? { channelId } : {}),
            expiresAt: Date.now() + APP_TICKET_TTL_MS
          })
        )
      })
      .catch(() => writeJson(response, 400, { error: 'invalid_request' }))
    return true
  }
}

function parsePath(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return null
  }
  try {
    return new URL(rawUrl, 'http://127.0.0.1').pathname
  } catch {
    return null
  }
}

function readBearer(value: string | undefined): string | null {
  const match = value?.match(/^Bearer ([^\s]+)$/)
  return match?.[1] ?? null
}

function secretsEqual(expected: string, presented: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const presentedBytes = Buffer.from(presented)
  return (
    expectedBytes.length === presentedBytes.length && timingSafeEqual(expectedBytes, presentedBytes)
  )
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
      if (size > MAX_BODY_BYTES) {
        oversized = true
        reject(new Error('request_too_large'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (oversized) {
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
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
