export type BuildInfo = {
  commit: string
  subject: string
  dirty: boolean
  builtAt: string
}

declare const __BUILD_INFO__: BuildInfo

/** What this bundle was built from — stamped in by vite.config.ts at build time
 * and surfaced under Settings → About. */
export const BUILD_INFO: BuildInfo = __BUILD_INFO__
