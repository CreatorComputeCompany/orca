import { defineMethod, type RpcAnyMethod } from '../core'
import {
  PairingGetEndpointsParamsSchema,
  PairingProvisionRelayParamsSchema
} from '../../../../shared/mobile-relay-credential-contract'
import { MobilePairingOfferParamsSchema } from '../../../../shared/mobile-pairing-host-contract'
import { z } from 'zod'
import {
  ManagedRuntimeCodexImportParamsSchema,
  ManagedRuntimeOfferParamsSchema,
  ManagedRuntimeRevokeParamsSchema
} from '../../../../shared/managed-runtime-access-contract'

export const PAIRING_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'pairing.importManagedRuntimeCodexAccounts',
    params: ManagedRuntimeCodexImportParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing?.importManagedRuntimeCodexAccounts) {
        throw new Error('pairing_management_unavailable')
      }
      return await ctx.pairing.importManagedRuntimeCodexAccounts(params)
    }
  }),
  defineMethod({
    name: 'pairing.listManagedRuntimePresence',
    params: z.object({}),
    handler: async (_params, ctx) => {
      if (!ctx.pairing?.listManagedRuntimePresence) {
        throw new Error('pairing_management_unavailable')
      }
      return await ctx.pairing.listManagedRuntimePresence()
    }
  }),
  defineMethod({
    name: 'pairing.createManagedRuntimeOffer',
    params: ManagedRuntimeOfferParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing?.createManagedRuntimeOffer) {
        throw new Error('pairing_management_unavailable')
      }
      return await ctx.pairing.createManagedRuntimeOffer(params)
    }
  }),
  defineMethod({
    name: 'pairing.revokeManagedRuntimeAccess',
    params: ManagedRuntimeRevokeParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing?.revokeManagedRuntimeAccess) {
        throw new Error('pairing_management_unavailable')
      }
      return await ctx.pairing.revokeManagedRuntimeAccess(params)
    }
  }),
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
