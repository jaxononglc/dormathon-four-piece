import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CircleAlert, Box, Search, Download, Pencil, Trash2, Info, Plus, Wallet, X, History, MoreVertical } from 'lucide-react';
import StatusPill from '../components/StatusPill';
import StockForm from '../components/StockForm';
import StockLogModal from '../components/StockLogModal';
import { ConfirmDialog } from '../components/Modal';
import { useStore, stockStatus } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { downloadCSV, localToday, rm2 } from '../lib/format';

// Stock-level filter values used in the URL (?level=…) and the filter dropdown.
// 'restock' = low + out (what the Dashboard "Need restocking" card links to).
const LEVELS = { all: 'All stock levels', restock: 'Need restocking', ok: 'Healthy', low: 'Low stock', out: 'Out of stock' };

function InventoryShell({ children }) {
  const { products, lowCount, outCount, stockValue, retailValue } = useStore();
  const units = products.reduce((s, p) => s + p.stock, 0);
  const [params, setParams] = useSearchParams();
  const level = params.get('level') || 'all';

  // Summary cards double as quick filters; clicking the active one clears it.
  const filterCard = (value) => {
    const active = value === 'all' ? level === 'all' : level === value;
    // "Need restocking" (from the Dashboard card) = low + out, so both cards light up.
    const lit = (active && value !== 'all') || (level === 'restock' && (value === 'low' || value === 'out'));
    return {
      className: `card kpi kpi--filter${lit ? ' is-active' : ''}`,
      'aria-pressed': active,
      title: value === 'all' ? 'Show all items' : active ? 'Click again to show all items' : `Show only: ${LEVELS[value]}`,
      onClick: () => {
        const next = new URLSearchParams(params);
        if (value === 'all' || active) next.delete('level');
        else next.set('level', value);
        setParams(next, { replace: true });
      },
    };
  };

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Stock &amp; inventory</h1>
        </div>
      </header>

      <section className="kpis">
        <button type="button" {...filterCard('all')}>
          <div className="kpi__top"><span className="kpi__label">Items in catalog</span><span className="icon-tile"><Box size={16} /></span></div>
          <div className="kpi__value">{products.length} <small>({units.toLocaleString()} units)</small></div>
        </button>
        <button type="button" {...filterCard('low')}>
          <div className="kpi__top"><span className="kpi__label">Low stock</span><span className="icon-tile icon-tile--amber"><AlertTriangle size={16} /></span></div>
          <div className="kpi__value text-amber">{lowCount} <small>below minimum</small></div>
        </button>
        <button type="button" {...filterCard('out')}>
          <div className="kpi__top"><span className="kpi__label">Out of stock</span><span className="icon-tile icon-tile--red"><CircleAlert size={16} /></span></div>
          <div className="kpi__value text-red">{outCount} <small>urgent restock</small></div>
        </button>
        <div className="card kpi">
          <div className="kpi__top"><span className="kpi__label">Stock value (at cost)</span><span className="icon-tile icon-tile--green"><Wallet size={16} /></span></div>
          <div className="kpi__value">{rm2(stockValue)}</div>
          <span className="small muted">At selling price: {rm2(retailValue)}</span>
        </div>
      </section>
      {children}
    </div>
  );
}

export function StockCatalog() {
  const { products, categories, dispatch } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  // Filters live in the URL (?q=…&category=…&level=…) so cards and links can open
  // a filtered view, and it survives a refresh.
  const query = params.get('q') || '';
  const category = params.get('category') || 'all';
  const level = LEVELS[params.get('level')] ? params.get('level') : 'all';
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const filtered = Boolean(query || category !== 'all' || level !== 'all');
  const [editing, setEditing] = useState(null); // product | 'new' | null
  const [deleting, setDeleting] = useState(null);
  const [logging, setLogging] = useState(null); // product whose log is open
  // Phone: the ⋮ menu of one product card is open (id), closed by tapping anywhere else.
  const [menuId, setMenuId] = useState(null);
  useEffect(() => {
    if (!menuId) return undefined;
    const close = (e) => { if (!e.target.closest('.row-menu')) setMenuId(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuId]);

  const q = query.toLowerCase();
  const rows = products.filter(
    (p) =>
      (!q || [p.name, p.sku, p.supplier].some((s) => s.toLowerCase().includes(q))) &&
      (category === 'all' || p.category === category) &&
      (level === 'all' || (level === 'restock' ? stockStatus(p) !== 'ok' : stockStatus(p) === level))
  );

  function exportCSV() {
    downloadCSV(`inventory-${localToday()}.csv`, [
      ['Name', 'SKU', 'Category', 'Supplier', 'Location', 'Stock', 'Min', 'Unit', 'Unit cost (RM)', 'Price (RM)', 'Expiry', 'Status'],
      ...rows.map((p) => [p.name, p.sku, p.category, p.supplier, p.location, p.stock, p.min, p.unit, p.cost.toFixed(2), p.price?.toFixed(2) ?? '', p.expiry, stockStatus(p)]),
    ]);
    toast(`Exported ${rows.length} items`);
  }

  return (
    <InventoryShell>
      <section className="card filters">
        <label className="search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setFilter('q', e.target.value)}
            placeholder="Search by SKU, product name, or supplier…"
          />
        </label>
        <select className="input input--sm" value={category} onChange={(e) => setFilter('category', e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input input--sm" value={level} onChange={(e) => setFilter('level', e.target.value)}>
          {Object.entries(LEVELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        {filtered && (
          <button className="btn btn--ghost btn--sm btn--icon-mobile" onClick={() => setParams({}, { replace: true })} title="Clear filters" aria-label="Clear filters"><X size={14} /><span>Clear</span></button>
        )}
        <button className="btn btn--soft btn--sm btn--icon-mobile" onClick={() => setEditing('new')} title="Add new product" aria-label="Add new product"><Plus size={14} /><span>Add new product</span></button>
        <button className="btn btn--soft btn--sm btn--icon-mobile" onClick={exportCSV} title="Export CSV" aria-label="Export CSV"><Download size={14} /><span>Export CSV</span></button>
      </section>

      <section className="card table-card">
        <div className="table-scroll">
          <table className="table table--cards">
            <thead>
              <tr>
                <th>Product / SKU</th>
                <th>Category</th>
                <th>Supplier</th>
                <th className="center">In stock / Min</th>
                <th>Unit cost / Price</th>
                <th>Stock status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="empty">No products match your filters.</td></tr>}
              {rows.map((p) => {
                const s = stockStatus(p);
                return (
                  <tr key={p.id} className={`row--${s}`}>
                    <td>
                      <div className="cell-title"><span className="cell-title__name" title={p.name}>{p.name}</span>{p.category && <span className="badge badge--inline">{p.category}</span>}</div>
                      <div className="cell-sub"><span className="sku">{p.sku}</span>{p.location && <>Loc: {p.location}</>}</div>
                    </td>
                    <td><span className="badge">{p.category}</span></td>
                    <td className="supplier">{p.supplier || <span className="dash">—</span>}</td>
                    <td className="center" data-label="In stock">
                      <div className={`qty qty--${s}`}>{p.stock} <small>{p.unit}</small></div>
                      <div className="cell-sub">Min: {p.min}</div>
                    </td>
                    <td className="pricing">
                      <div><span className="lbl">Cost</span><b>{rm2(p.cost)}</b></div>
                      <div><span className="lbl">Sell</span><b>{p.price != null ? rm2(p.price) : 'not sold'}</b></div>
                    </td>
                    <td><StatusPill product={p} /></td>
                    <td className="right">
                      {/* Desktop: three icon buttons */}
                      <span className="row-actions">
                        <button className="icon-btn" onClick={() => setLogging(p)} aria-label={`Log for ${p.name}`} title="Log"><History size={16} /></button>
                        <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} title="Edit"><Pencil size={16} /></button>
                        <button className="icon-btn icon-btn--danger" onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`}><Trash2 size={16} /></button>
                      </span>
                      {/* Phone: one ⋮ button that opens the same three actions */}
                      <span className="row-menu">
                        <button className="icon-btn" onClick={() => setMenuId(menuId === p.id ? null : p.id)} aria-label={`Actions for ${p.name}`} aria-expanded={menuId === p.id}><MoreVertical size={18} /></button>
                        {menuId === p.id && (
                          <div className="row-menu__list" role="menu">
                            <button role="menuitem" onClick={() => { setMenuId(null); setLogging(p); }}><History size={16} />History</button>
                            <button role="menuitem" onClick={() => { setMenuId(null); setEditing(p); }}><Pencil size={16} />Edit</button>
                            <button role="menuitem" className="is-danger" onClick={() => { setMenuId(null); setDeleting(p); }}><Trash2 size={16} />Delete</button>
                          </div>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>Showing {rows.length} of {products.length} items</span>
          <span className="row gap-4 hide-mobile"><Info size={14} />Tip: use ✏️ to update stock after a delivery or a shelf count, and 🕘 to see its history.</span>
        </div>
      </section>

      {logging && <StockLogModal product={products.find((x) => x.id === logging.id) || logging} onClose={() => setLogging(null)} />}
      {editing && <StockForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="This removes the product from your catalog. Past sales stay in your reports."
          onConfirm={() => {
            dispatch({ type: 'deleteProduct', id: deleting.id });
            toast(`${deleting.name} deleted`);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </InventoryShell>
  );
}

