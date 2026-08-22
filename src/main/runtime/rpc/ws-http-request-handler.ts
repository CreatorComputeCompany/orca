import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { createStaticWebClientHandler } from './static-web-client-handler'

export type RuntimeHttpRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => boolean

export function composeRuntimeHttpRequestHandler(
  staticRoot?: string,
  dynamicHandler?: RuntimeHttpRequestHandler
): RequestListener | undefined {
  const staticHandler = staticRoot ? createStaticWebClientHandler(staticRoot) : null
  if (!staticHandler && !dynamicHandler) {
    return undefined
  }
  return (request, response) => {
    if (dynamicHandler?.(request, response)) {
      return
    }
    if (staticHandler) {
      staticHandler(request, response)
      return
    }
    response.statusCode = 404
    response.end()
  }
}
