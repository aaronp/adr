/**
 * A whole ledger in a link: the markdown file (the data model's saved form), deflated and base64url-encoded.
 * It goes in the URL's #fragment, which never reaches a server, so link length is limited only by the browser.
 */

const pipe = async (bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export const packLedger = async (markdown: string): Promise<string> => {
  const bytes = await pipe(new TextEncoder().encode(markdown), new CompressionStream('deflate-raw'));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Rejects with a readable message when the text is not a packed ledger (e.g. a link cut short when pasted). */
export const unpackLedger = async (packed: string): Promise<string> => {
  try {
    const bin = atob(packed.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(await pipe(Uint8Array.from(bin, (c) => c.charCodeAt(0)), new DecompressionStream('deflate-raw')));
  } catch {
    throw new Error('the shared link is damaged or incomplete');
  }
};
