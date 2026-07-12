// These markdown-it plugins ship no types; they're all simple plugin functions.
declare module "markdown-it-deflist" {
  const plugin: import("markdown-it").PluginSimple
  export default plugin
}
declare module "markdown-it-emoji" {
  export const full: import("markdown-it").PluginSimple
  export const light: import("markdown-it").PluginSimple
  export const bare: import("markdown-it").PluginSimple
}
declare module "markdown-it-footnote" {
  const plugin: import("markdown-it").PluginSimple
  export default plugin
}
declare module "markdown-it-sub" {
  const plugin: import("markdown-it").PluginSimple
  export default plugin
}
declare module "markdown-it-sup" {
  const plugin: import("markdown-it").PluginSimple
  export default plugin
}
