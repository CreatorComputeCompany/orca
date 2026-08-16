import { defineMethod, type RpcAnyMethod } from '../core'
import {
  PairingGetEndpointsParamsSchema,
  PairingProvisionRelayParamsSchema
} from '../../../../shared/mobile-relay-credential-contract'
import { MobilePairingOfferParamsSchema } from '../../../../shared/mobile-pairing-host-contract'

export const PAIRING_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'pairing.createMobileOffer',
    params: MobilePairingOfferParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing?.createMobileOffer) {
        throw new Error('pairing_context_unavailable')
      }
      return await ctx.pairing.createMobileOffer(params)
    }
  }),
  defineMethod({
    name: 'pairing.getEndpoints',
    params: PairingGetEndpointsParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing) {
        throw new Error('pairing_context_unavailable')
      }
      return await ctx.pairing.getEndpoints(params)
    }
  }),
  defineMethod({
    name: 'pairing.provisionRelay',
    params: PairingProvisionRelayParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing) {
        throw new Error('pairing_context_unavailable')
      }
      return await ctx.pairing.provisionRelay(params)
    }
  })
]
