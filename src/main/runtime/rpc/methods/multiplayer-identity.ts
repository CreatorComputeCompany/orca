import { MultiplayerIdentityEnrollParamsSchema } from '../../../../shared/multiplayer-identity-contract'
import {
  GsdOrcaLaunchConsumeParamsSchema,
  GsdOrcaLaunchLinkParamsSchema
} from '../../../../shared/gsd-orca-launch-contract'
import {
  MultiplayerAuthRegisterParamsSchema,
  MultiplayerSsoLinkParamsSchema
} from '../../../../shared/multiplayer-auth-contract'
import { defineMethod, type RpcAnyMethod } from '../core'

export const MULTIPLAYER_IDENTITY_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'multiplayer.gsd.consumeLaunch',
    params: GsdOrcaLaunchConsumeParamsSchema,
    handler: async (params, context) => {
      if (!context.pairing?.consumeGsdOrcaLaunch) {
        throw new Error('gsd_launch_unavailable')
      }
      return await context.pairing.consumeGsdOrcaLaunch(params)
    }
  }),
  defineMethod({
    name: 'multiplayer.gsd.linkLaunch',
    params: GsdOrcaLaunchLinkParamsSchema,
    handler: async (params, context) => {
      if (!context.pairing?.linkGsdOrcaLaunch) {
        throw new Error('gsd_launch_unavailable')
      }
      return await context.pairing.linkGsdOrcaLaunch(params)
    }
  }),
  defineMethod({
    name: 'multiplayer.auth.createSsoLink',
    params: MultiplayerSsoLinkParamsSchema,
    handler: async (_params, context) => {
      if (!context.pairing?.createMultiplayerSsoLink) {
        throw new Error('multiplayer_sso_unavailable')
      }
      return await context.pairing.createMultiplayerSsoLink()
    }
  }),
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
