declare module "markdown-it-emoji" {
  import type { PluginSimple } from "markdown-it"
  export const full: PluginSimple
  export const light: PluginSimple
  export const bare: PluginSimple
}

declare module "markdown-it-footnote" {
  import type { PluginSimple } from "markdown-it"
  const plugin: PluginSimple
  export default plugin
}

declare module "markdown-it-sub" {
  import type { PluginSimple } from "markdown-it"
  const plugin: PluginSimple
  export default plugin
}

declare module "markdown-it-sup" {
  import type { PluginSimple } from "markdown-it"
  const plugin: PluginSimple
  export default plugin
}

declare module "markdown-it-deflist" {
  import type { PluginSimple } from "markdown-it"
  const plugin: PluginSimple
  export default plugin
}
