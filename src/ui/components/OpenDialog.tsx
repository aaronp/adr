import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon, type Dispatch, type Effects } from './common.tsx';

/**
 * Open a decisions file three ways: drop it, pick it, or fetch it from a URL. A native <dialog> gives the
 * backdrop, focus handling and Esc-to-close; a loaded file closes it (md/load), a failed URL stays here with its error.
 */
export const OpenDialog = ({ dispatch, fx }: { dispatch: Dispatch; fx: Effects }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d === null) throw new Error('bug: open dialog not mounted');
    d.showModal();
    return () => d.close();
  }, []);

  const close = () => dispatch({ type: 'open/hide' });
  const openFiles = (files: FileList | null | undefined) => {
    const f = files?.[0];
    if (f === undefined) {
      setError('Drop or choose a .md file.');
      return;
    }
    fx.openFile(f);
  };
  const openUrl = () => {
    const u = url.trim();
    if (u === '' || busy) return;
    setBusy(true);
    setError(null);
    fx.openUrl(u).then(
      () => setBusy(false),
      (e: unknown) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    );
  };

  return (
    <dialog
      ref={dialog}
      class="modal"
      aria-labelledby="open-h"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div class="modal-body stack-m">
        <div class="row-between">
          <h2 id="open-h" class="display-s">
            Open a decisions file
          </h2>
          <button type="button" class="icon-btn" aria-label="Close" onClick={close}>
            <Icon name="x" />
          </button>
        </div>

        <div
          class={`drop-zone${dragging ? ' on' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            openFiles(e.dataTransfer?.files);
          }}
        >
          <Icon name="upload" size={24} />
          <span class="small-plus">Drop a .md file here, or</span>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            class="visually-hidden"
            aria-label="Choose a markdown file"
            onChange={(e) => {
              const files = e.currentTarget.files;
              openFiles(files);
              e.currentTarget.value = '';
            }}
          />
          <button type="button" class="btn" onClick={() => fileInput.current?.click()}>
            Choose file…
          </button>
        </div>

        <form
          class="stack-xs"
          onSubmit={(e) => {
            e.preventDefault();
            openUrl();
          }}
        >
          <label for="open-url" class="field-label">
            Or open from a URL
          </label>
          <div class="row-xs">
            <input id="open-url" type="url" class="input mono grow-main" placeholder="https://…/decisions.md" value={url} onInput={(e) => setUrl(e.currentTarget.value)} />
            <button type="submit" class="btn btn-primary" disabled={url.trim() === '' || busy}>
              {busy ? 'Opening…' : 'Open'}
            </button>
          </div>
          <span class="small muted">To share a file, link to it with ?src= instead; opened files replace the records shown here.</span>
        </form>

        {error === null ? null : (
          <div role="alert" class="alert alert-bad small-plus">
            {error}
          </div>
        )}
      </div>
    </dialog>
  );
};
