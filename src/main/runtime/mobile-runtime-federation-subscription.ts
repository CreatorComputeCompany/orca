import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import {
  encodeTerminalStreamFrame,
  type TerminalStreamFrame
} from '../../shared/terminal-stream-protocol'
import type { MobileRuntimeFederationAccess } from './mobile-runtime-federation-access'
import type { MobileRuntimeFederationDependencies } from './mobile-runtime-federation-dependencies'
import {
  asFederationRecord,
  federatedResponseEndsStream,
  federatedResponseStreamId,
  firstFederationString
} from './mobile-runtime-federation-routing'
import { normalizeFederatedRuntimeResponse } from './mobile-runtime-federation-response'
import type { RpcRequest } from './rpc/core'
import { errorResponse } from './rpc/errors'

export type MobileRuntimeFederationContext = {
  pairedDeviceId?: string
  connectionId?: string
  signal?: AbortSignal
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  registerBinaryStreamHandler: (
    streamId: number,
    handler: (frame: TerminalStreamFrame) => void
  ) => () => void
}

export async function forwardMobileRuntimeSubscription(args: {
  access: MobileRuntimeFederationAccess
  context: MobileRuntimeFederationContext
  dependencies: MobileRuntimeFederationDependencies
  environmentId: string
  request: RpcRequest
  reply: (response: string) => void
  runtimeId: string
  recordResponse: (response: RuntimeRpcResponse<unknown>) => void
}): Promise<void> {
  const ownerKey = args.context.pairedDeviceId ?? 'host'
  const subscriptionKey = makeSubscriptionKey(args.request, args.context.connectionId)
  args.access.getSubscription(subscriptionKey)?.close()
  let unregisterBinary = (): void => {}
  let settled = false
  let finish = (): void => {}
  const closed = new Promise<void>((resolve) => {
    finish = resolve
  })
  const close = (): void => {
    if (settled) {
      return
    }
    settled = true
    unregisterBinary()
    args.access.deleteSubscription(subscriptionKey)
    finish()
  }
  const onAbort = (): void => args.access.getSubscription(subscriptionKey)?.close()
  args.context.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const subscription = await args.dependencies.subscribe(
      args.environmentId,
      args.request.method,
      args.request.params ?? {},
      {
        onEvent: (event) => {
          if (event.type === 'binary') {
            args.context.sendBinary(event.bytes)
            return
          }
          if (event.type === 'response') {
            args.recordResponse(event.response)
            const streamId = federatedResponseStreamId(event.response)
            if (streamId !== null) {
              unregisterBinary()
              unregisterBinary = args.context.registerBinaryStreamHandler(streamId, (frame) => {
                args.access
                  .getSubscription(subscriptionKey)
                  ?.sendBinary(encodeTerminalStreamFrame(frame))
              })
            }
            args.reply(
              JSON.stringify(
                normalizeFederatedRuntimeResponse(args.request.id, event.response, args.runtimeId)
              )
            )
            if (federatedResponseEndsStream(event.response)) {
              args.access.getSubscription(subscriptionKey)?.close()
            }
            return
          }
          if (event.type === 'error') {
            args.reply(
              JSON.stringify(
                errorResponse(
                  args.request.id,
                  { runtimeId: args.runtimeId },
                  event.code,
                  event.message
                )
              )
            )
          }
        },
        onClose: close
      }
    )
    if (settled || args.context.signal?.aborted) {
      subscription.close()
    } else {
      args.access.setSubscription(subscriptionKey, {
        environmentId: args.environmentId,
        ownerKey,
        subscription
      })
    }
    await closed
  } catch (error) {
    args.reply(
      JSON.stringify(
        errorResponse(
          args.request.id,
          { runtimeId: args.runtimeId },
          'runtime_unavailable',
          error instanceof Error ? error.message : String(error)
        )
      )
    )
  } finally {
    args.context.signal?.removeEventListener('abort', onAbort)
    close()
  }
}

function makeSubscriptionKey(request: RpcRequest, connectionId?: string): string {
  const params = asFederationRecord(request.params)
  const resource =
    firstFederationString(params, ['terminal']) ??
    firstFederationString(params, ['worktree', 'worktreeId'])?.replace(/^id:/, '') ??
    request.id
  return `${connectionId ?? 'unknown'}:${request.method}:${resource}`
}
