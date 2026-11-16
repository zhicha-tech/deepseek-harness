declare module '*.module.css' {
  /** Class map compiled by the client build's CSS Modules step. */
  const classes: Readonly<Record<string, string>>
  export default classes
}
