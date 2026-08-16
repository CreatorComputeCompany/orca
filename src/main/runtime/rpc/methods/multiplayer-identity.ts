import { MultiplayerIdentityEnrollParamsSchema } from '../../../../shared/multiplayer-identity-contract'
import { MultiplayerAuthRegisterParamsSchema } from '../../../../shared/multiplayer-auth-contract'
import { defineMethod, type RpcAnyMethod } from '../core'

export const MULTIPLAYER_IDENTITY_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'multiplayer.auth.register',
    params: MultiplayerAuthRegisterParamsSchema,
    handler: async (params, context) => {
      if (!context.pairing?.registerMultiplayerAccount) {
        throw new Error('multiplayer_auth_unavailable')
      }
      return await context.pairing.registerMultiplayerAccount(params)
    }
  }),
  defineMethod({
    name: 'multiplayer.identity.enroll',
    params: MultiplayerIdentityEnrollParamsSchema,
    handler: async (params, context) => {
      if (!context.pairing?.enrollMultiplayerIdentity) {
        throw new Error('multiplayer_identity_unavailable')
      }
      return await context.pairing.enrollMultiplayerIdentity(params)
    }
  })
]
