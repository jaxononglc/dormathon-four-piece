import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';

const MAX_SUGGESTIONS = 5;
const MAX_LENGTH = 40;

// Pick-or-create input with auto-complete (used for Category and Supplier).
// - Typing filters `options` (starts-with matches first); at most 5 are shown.
// - "Add new <noun>" is always the first row. Clicking it adds what the user
//   already typed, or switches the input into "type a new <noun>" mode, where
//   Enter (or clicking away) saves and Esc cancels.
// - `onCreate(name)` must persist the new option (the store saves it), so it
//   shows up in every list from then on.
export default function Combobox({ value, onChange, options, onCreate, noun, invalid }) {
  const listId = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [adding, setAdding] = useState(false);
  const [activeRaw, setActive] = useState(0);
  const [error, setError] = useState('');

  const q = query.trim().toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === q);
  const matches = useMemo(() => {
    // An unchanged / exact value shows the full list; filter only on new text.
    if (!q || exact) return options.slice(0, MAX_SUGGESTIONS);
    const starts = options.filter((o) => o.toLowerCase().startsWith(q));
    const contains = options.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [options, q, exact]);

  // Row 0 is always "Add new …"; suggestions follow.
  const rows = [{ type: 'add' }, ...matches.map((o) => ({ type: 'option', value: o }))];
  const active = Math.min(activeRaw, rows.length - 1);

  function choose(v) {
    onChange(v);
    setQuery(v);
    setOpen(false);
    setAdding(false);
    setError('');
  }

  function create(raw) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) return setError(`Type a ${noun} name`);
    if (name.length > MAX_LENGTH) return setError(`Keep it under ${MAX_LENGTH} characters`);
    const existing = options.find((o) => o.toLowerCase() === name.toLowerCase());
    if (!existing) onCreate(name);
    choose(existing || name);
  }

  function startAdding() {
    // If the user already typed something new, "Add" just saves it.
    if (q && !exact) return create(query);
    setAdding(true);
    setQuery('');
    setError('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function cancel() {
    setAdding(false);
    setQuery(value);
    setOpen(false);
    setError('');
  }

  function onKeyDown(e) {
    if (adding) {
      if (e.key === 'Enter') { e.preventDefault(); create(query); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setQuery(value); }
    if (e.key === 'Enter' && open) {
      e.preventDefault();
      const row = rows[active];
      if (row?.type === 'add') startAdding();
      else if (row) choose(row.value);
    }
  }

  function onBlur() {
    if (adding) {
      // Clicking away saves what was typed; an empty box just cancels.
      if (query.trim()) create(query);
      else cancel();
      return;
    }
    setOpen(false);
    // Accept an exact (case-insensitive) match; otherwise restore the saved value.
    if (exact) choose(exact);
    else setQuery(value);
  }

  return (
    <div className="combo">
      <div className={`combo__control input${invalid || error ? ' input--error' : ''}${adding ? ' combo__control--adding' : ''}`}>
        {adding && <Plus size={15} className="combo__lead" />}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={noun}
          value={query}
          placeholder={adding ? `Type the new ${noun} name…` : `Search or pick a ${noun}`}
          onChange={(e) => { setQuery(e.target.value); setOpen(!adding); setActive(e.target.value.trim() && !adding ? 1 : 0); setError(''); }}
          onFocus={(e) => { if (!adding) { setOpen(true); setActive(0); e.target.select(); } }}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        {!adding && (
          <button type="button" className="combo__btn" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen((o) => !o); inputRef.current?.focus(); }} aria-label={`Show ${noun} list`}>
            <ChevronDown size={16} />
          </button>
        )}
      </div>

      {open && !adding && (
        <ul className="combo__list" id={listId} role="listbox">
          {rows.map((row, i) => (
            <li
              key={row.type === 'add' ? '__add' : row.value}
              role="option"
              aria-selected={row.type === 'option' && row.value === value}
              className={`combo__item${i === active ? ' is-active' : ''}${row.type === 'add' ? ' combo__item--add' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => (row.type === 'add' ? startAdding() : choose(row.value))}
            >
              {row.type === 'add' ? (
                <><Plus size={15} />{q && !exact ? <>Add “{query.trim()}”</> : `Add new ${noun}`}</>
              ) : (
                <>
                  <span>{highlight(row.value, q)}</span>
                  {row.value === value && <Check size={14} />}
                </>
              )}
            </li>
          ))}
          {matches.length === 0 && <li className="combo__empty">No match — add it with the first row.</li>}
        </ul>
      )}
      {error && <span className="field__error">{error}</span>}
      {adding && !error && <span className="field__hint">Press Enter to save · Esc to cancel</span>}
    </div>
  );
}

function highlight(text, q) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}
