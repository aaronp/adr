import { useEffect, useRef } from 'preact/hooks';
import type { Adr } from '../../core/schema.ts';
import { ancestors } from '../../core/validate.ts';
import { plural } from '../../core/dates.ts';
import { Icon, type Dispatch } from './common.tsx';

/** Confirms deleting a record. With sub-decisions, asks whether they go too or stay as top-level records. */
export const DeleteDialog = ({ adr, adrs, onClose, dispatch }: { adr: Adr; adrs: readonly Adr[]; onClose: () => void; dispatch: Dispatch }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d === null) throw new Error('bug: delete dialog not mounted');
    d.showModal();
    return () => d.close();
  }, []);
  const children = adrs.filter((a) => a.parent === adr.id);
  const below = adrs.filter((a) => ancestors(a.id, adrs).includes(adr.id)).length;
  const del = (withChildren: boolean) => dispatch({ type: 'adr/delete', id: adr.id, withChildren });
  return (
    <dialog
      ref={dialog}
      class="modal"
      aria-labelledby="del-h"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="modal-body stack-m">
        <div class="row-between">
          <h2 id="del-h" class="display-s">
            Delete {adr.id}?
          </h2>
          <button type="button" class="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <span class="small-plus">
          “{adr.title}” will be removed from the file. This cannot be undone, except by reopening a downloaded copy.
        </span>
        {children.length === 0 ? null : (
          <div class="stack-xs small-plus">
            <span>
              It has {plural(children.length, 'sub-decision')}
              {below > children.length ? ` (${below} records in all below it)` : ''}:
            </span>
            <ul>
              {children.map((c) => (
                <li key={c.id}>
                  <span class="mono">{c.id}</span> {c.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div class="row-s wrap-row">
          {children.length === 0 ? (
            <button type="button" class="btn btn-bad" onClick={() => del(false)}>
              <Icon name="trash" /> Delete
            </button>
          ) : (
            <>
              <button type="button" class="btn btn-bad" onClick={() => del(true)}>
                <Icon name="trash" /> Delete all {below + 1}
              </button>
              <button type="button" class="btn" onClick={() => del(false)}>
                Delete only {adr.id}, keep sub-decisions
              </button>
            </>
          )}
          <button type="button" class="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
};
