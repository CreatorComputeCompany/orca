import { z } from 'zod'

export const GsdOrcaLaunchConsumeParamsSchema = z.object({
  token: z.string().min(32).max(4096)
})
export type GsdOrcaLaunchConsumeParams = z.infer<typeof GsdOrcaLaunchConsumeParamsSchema>

export type GsdOrcaLaunchConsumeResult = {
  runPublicId: string
  cardPublicId: string
  title: string
  description: string | null
  boardName: string
  listName: string
  cardUrl: string | null
  repository: {
    name: string
    remoteUrl: string
  }
  agent: 'claude' | 'codex'
}

export const GsdOrcaLaunchLinkParamsSchema = z.object({
  token: z.string().min(32).max(4096),
  runtimeEnvironmentId: z.string().min(1).max(200),
  worktreeId: z.string().min(1).max(500),
  url: z.string().url().max(2048)
})
export type GsdOrcaLaunchLinkParams = z.infer<typeof GsdOrcaLaunchLinkParamsSchema>

export type GsdOrcaLaunchLinkResult = { runPublicId: string; url: string }
