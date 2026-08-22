import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import type { RpcResponse } from './rpc/core'
import { errorResponse, successResponse } from './rpc/errors'

export function normalizeFederatedRuntimeResponse(
  id: string,
  response: RuntimeRpcResponse<unknown>,
  runtimeId: string
): RpcResponse {
  const meta = { runtimeId }
  if (!response.ok) {
    return errorResponse(id, meta, response.error.code, response.error.message, response.error.data)
  }
  const normalized = successResponse(id, meta, response.result)
  if ('streaming' in response && response.streaming === true) {
    normalized.streaming = true
  }
  return normalized
}
