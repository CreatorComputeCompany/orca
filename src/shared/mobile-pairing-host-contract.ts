import { z } from 'zod'
import type { MobilePairingConnectionMode } from './mobile-pairing-connection-mode'
import type { MobileRelayMintFailure } from './mobile-relay-mint-failure'

export const MobilePairingOfferParamsSchema = z
  .object({
    address: z.string().min(1).max(2048),
    connectionMode: z.enum(['automatic', 'local-only']).optional(),
    rotate: z.boolean().optional()
  })
  .strict()

export type MobilePairingOfferParams = z.infer<typeof MobilePairingOfferParamsSchema>

export type MobilePairingOfferResult =
  | {
      available: false
      reason?: string
      guidance?: string
      relayFailure?: MobileRelayMintFailure
    }
  | {
      available: true
      qrDataUrl: string | null
      qrError?: 'encoding_failed'
      pairingUrl: string
      endpoint: string | null
      deviceId: string
      connectionMode: MobilePairingConnectionMode
    }
