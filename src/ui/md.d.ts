/** Markdown files are bundled as plain text (esbuild loader: text). */
declare module '*.md' {
  const text: string;
  export default text;
}
