import { z } from 'zod'
import {
  EphemeralVmRecipeConnectionResultSchema,
  EphemeralVmRecipeLegacyResultSchema,
  EphemeralVmRecipeResultSchema
} from './ephemeral-vm-recipes'

export const EphemeralVmRuntimeStatusSchema = z.enum([
  'provisioning',
  'running',
  'suspended',
  'suspend_failed',
  'resume_failed',
  'failed',
  'cleanup_pending',
  'cleanup_failed',
  'cleaned'
])

export type EphemeralVmRuntimeStatus = z.infer<typeof EphemeralVmRuntimeStatusSchema>

export const EphemeralVmCleanupStatusSchema = z.enum([
  'not_started',
  'disabled',
  'running',
  'succeeded',
  'failed'
])

export type EphemeralVmCleanupStatus = z.infer<typeof EphemeralVmCleanupStatusSchema>

export const EphemeralVmRuntimeConnectionModeSchema = z.enum(['orca-server', 'ssh'])
export const EphemeralVmWorkspaceSharingSchema = z.enum(['private', 'shared'])
export type EphemeralVmWorkspaceSharing = z.infer<typeof EphemeralVmWorkspaceSharingSchema>

const WorkspaceCreatorProvenanceSchema = z.union([
  z.object({ kind: z.literal('host') }),
  z.object({ kind: z.literal('paired-device'), deviceId: z.string().min(1) })
])

const EphemeralVmRuntimeRecipeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    create: z.string().min(1),
    checkoutMode: z.enum(['orca-worktree', 'provisioned-root']).optional(),
    description: z.string().min(1).optional(),
    suspend: z.string().min(1).optional(),
    resume: z.string().min(1).optional(),
    destroy: z.string().min(1).optional(),
    destroyDisabled: z.boolean().optional()
  })
  .strict()

export const EphemeralVmRuntimeRecordSchema = z.object({
  id: z.string().min(1),
  recipeId: z.string().min(1),
  /** Immutable lifecycle commands used for this runtime even if its source
   * pack is updated, disabled, or removed later. */
  recipe: EphemeralVmRuntimeRecipeSchema.optional(),
  repoId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  workspaceName: z.string().min(1).optional(),
  /** Stable external intent key used to make integrations such as GSD idempotent. */
  externalLaunchId: z.string().min(1).max(200).optional(),
  creatorProvenance: WorkspaceCreatorProvenanceSchema.optional(),
  /** Stable multiplayer account that owns the workspace across devices. */
  ownerMemberKey: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
    .optional(),
  /** Transient members with a live connection to this workspace VM. */
  liveMembers: z
    .array(
      z.object({
        key: z.string().min(1),
        displayName: z.string().min(1),
        worktreeId: z.string().min(1),
        activeTabId: z.string().min(1).optional(),
        activeTabTitle: z.string().min(1).optional(),
        activeTabType: z.enum(['terminal', 'markdown', 'file', 'browser']).optional()
      })
    )
    .optional(),
  /** The caller remains authorized, but the controller could not refresh its child credential.
   * Clients must retain any previously issued credential and retry discovery later. */
  viewerAccessUnavailable: z.boolean().optional(),
  sharing: EphemeralVmWorkspaceSharingSchema.optional(),
  connectionMode: EphemeralVmRuntimeConnectionModeSchema.optional(),
  runtimeEnvironmentId: z.string().min(1).optional(),
  sshTargetId: z.string().min(1).optional(),
  status: EphemeralVmRuntimeStatusSchema,
  cleanupStatus: EphemeralVmCleanupStatusSchema,
  cleanupDisabled: z.boolean().optional(),
  cleanupLastAttemptAt: z.number().finite().optional(),
  cleanupLastError: z.string().min(1).optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  recipeResult: EphemeralVmRecipeResultSchema
})

export type EphemeralVmRuntimeRecord = z.infer<typeof EphemeralVmRuntimeRecordSchema>

export const EphemeralVmRuntimeStoreSchema = z.object({
  version: z.literal(1),
  runtimes: z.array(EphemeralVmRuntimeRecordSchema)
})

export type EphemeralVmRuntimeStore = z.infer<typeof EphemeralVmRuntimeStoreSchema>

const RollbackEphemeralVmRuntimeRecipeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    create: z.string().min(1),
    description: z.string().min(1).optional(),
    suspend: z.string().min(1).optional(),
    resume: z.string().min(1).optional(),
    destroy: z.string().min(1).optional(),
    destroyDisabled: z.boolean().optional()
  })
  .strict()

export const RollbackEphemeralVmRuntimeRecordSchema = EphemeralVmRuntimeRecordSchema.extend({
  recipe: RollbackEphemeralVmRuntimeRecipeSchema.optional(),
  recipeResult: z.union([
    EphemeralVmRecipeLegacyResultSchema,
    EphemeralVmRecipeConnectionResultSchema
  ])
})

export const RollbackEphemeralVmRuntimeStoreSchema = z.object({
  version: z.literal(1),
  runtimes: z.array(RollbackEphemeralVmRuntimeRecordSchema)
})
