import { useEffect, useRef } from 'preact/hooks';
import { plural } from '../../core/dates.ts';
import { Icon, type Dispatch } from './common.tsx';

/** Confirms replacing the open ledger with an empty one, offering to download it first. */
export const NewDialog = ({ count, onDownload, dispatch }: { count: number; onDownload: () => void; dispatch: Dispatch }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d === null) throw new Error('bug: new dialog not mounted');
    d.showModal();
    return () => d.close();
  }, []);
  const cancel = () => dispatch({ type: 'file/cancelNew' });
  return (
    <dialog
      ref={dialog}
      class="modal"
      aria-labelledby="new-h"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div class="modal-body stack-m">
        <div class="row-between">
          <h2 id="new-h" class="display-s">
            Start a new ledger?
          </h2>
          <button type="button" class="icon-btn" aria-label="Close" onClick={cancel}>
            <Icon name="x" />
          </button>
        </div>
        <span class="small-plus">
          This replaces the {plural(count, 'record')} shown now with an empty file. Download decisions.md first if you want to keep them.
        </span>
        <div class="row-s wrap-row">
          <button type="button" class="btn" onClick={onDownload}>
            <Icon name="download" /> Download decisions.md
          </button>
          <button type="button" class="btn btn-bad" onClick={() => dispatch({ type: 'file/new' })}>
            Start fresh
          </button>
          <button type="button" class="btn" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
};
