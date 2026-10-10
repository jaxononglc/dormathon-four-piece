import { useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { Package, Truck, AlertTriangle, CircleAlert, Box, Search, Download, Pencil, Trash2, Info, Minus, Plus, Wallet } from 'lucide-react';
import StatusPill from '../components/StatusPill';
import StockForm from '../components/StockForm';
import { ConfirmDialog } from '../components/Modal';
import { useStore, stockStatus, suggestedQty } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { CATEGORIES, TODAY } from '../data/mockData';
import { downloadCSV, longDate, rm2 } from '../lib/format';

function InventoryShell({ children }) {
  const { products, reorder, lowCount, outCount, stockValue, retailValue } = useStore();
  const units = products.reduce((s, p) => s + p.stock, 0);
  const tab = ({ isActive }) => `tab${isActive ? ' tab--active' : ''}`;

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Stock &amp; inventory</h1>
          <p className="muted">Monitor current quantities, receive incoming stock, and replenish low products.</p>
        </div>
        <nav className="tabs">
          <NavLink to="/inventory" end className={tab}><Package size={16} />Stock catalog</NavLink>
          <NavLink to="/inventory/reorder" className={tab}>
            <Truck size={16} />Reorder helper
            {reorder.length > 0 && <span className="count count--amber">{reorder.length}</span>}
          </NavLink>
        </nav>
      </header>

      <section className="kpis">
        <div className="card kpi">
          <div className="kpi__top"><span className="kpi__label">Items in catalog</span><span className="icon-tile"><Box size={16} /></span></div>
          <div className="kpi__value">{products.length} <small>({units.toLocaleString()} units)</small></div>
        </div>
        <div className="card kpi">
          <div className="kpi__top"><span className="kpi__label">Low stock</span><span className="icon-tile icon-tile--amber"><AlertTriangle size={16} /></span></div>
          <div className="kpi__value text-amber">{lowCount} <small>below minimum</small></div>
        </div>
        <div className="card kpi">
          <div className="kpi__top"><span className="kpi__label">Out of stock</span><span className="icon-tile icon-tile--red"><CircleAlert size={16} /></span></div>
          <div className="kpi__value text-red">{outCount} <small>urgent restock</small></div>
        </div>
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
  const { products, dispatch } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const [category, setCategory] = useState('all');
  const [level, setLevel] = useState('all');
  const [editing, setEditing] = useState(null); // product | 'new' | null
  const [deleting, setDeleting] = useState(null);

  const q = query.toLowerCase();
  const rows = products.filter(
    (p) =>
      (!q || [p.name, p.sku, p.supplier].some((s) => s.toLowerCase().includes(q))) &&
      (category === 'all' || p.category === category) &&
      (level === 'all' || stockStatus(p) === level)
  );

  function exportCSV() {
    downloadCSV(`inventory-${TODAY}.csv`, [
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
            onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
            placeholder="Search by SKU, product name, or supplier…"
          />
        </label>
        <select className="input input--sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input input--sm" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="all">All stock levels</option>
          <option value="ok">Healthy</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <button className="btn btn--soft btn--sm" onClick={() => setEditing('new')}><Plus size={14} />Add stock</button>
        <button className="btn btn--soft btn--sm" onClick={exportCSV}><Download size={14} />Export CSV</button>
      </section>

      <section className="card table-card">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Product / SKU</th>
                <th>Category</th>
                <th className="center">In stock / Min</th>
                <th>Unit cost / Price</th>
                <th>Stock status</th>
                <th className="center">Quick adjust</th>
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
                      <div className="cell-title">{p.name}</div>
                      <div className="cell-sub"><span className="sku">{p.sku}</span>{p.location && <>Loc: {p.location}</>}</div>
                    </td>
                    <td><span className="badge">{p.category}</span></td>
                    <td className="center">
                      <div className={`qty qty--${s}`}>{p.stock} <small>{p.unit}</small></div>
                      <div className="cell-sub">Min: {p.min}</div>
                    </td>
                    <td className="pricing">
                      <div>Cost: <b>{rm2(p.cost)}</b></div>
                      <div>Sell: <b>{p.price != null ? rm2(p.price) : 'not sold'}</b></div>
                    </td>
                    <td><StatusPill product={p} /></td>
                    <td className="center">
                      <div className="stepper stepper--sm">
                        <button disabled={p.stock === 0} onClick={() => dispatch({ type: 'adjustStock', id: p.id, delta: -1 })} aria-label={`Decrease ${p.name}`}><Minus size={12} /></button>
                        <span>{p.stock}</span>
                        <button onClick={() => dispatch({ type: 'adjustStock', id: p.id, delta: 1 })} aria-label={`Increase ${p.name}`}><Plus size={12} /></button>
                      </div>
                    </td>
                    <td className="right">
                      <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><Pencil size={16} /></button>
                      <button className="icon-btn icon-btn--danger" onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>Showing {rows.length} of {products.length} items</span>
          <span className="row gap-4"><Info size={14} />Tip: use +/− for quick shelf counts, or the Reorder helper to receive deliveries.</span>
        </div>
      </section>

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

export function ReorderHelper() {
  const { reorder, dispatch } = useStore();
  const toast = useToast();
  const [qty, setQty] = useState({}); // overrides of the suggested quantity
  const [generatedAt] = useState(() => new Date());

  const qtyFor = (p) => qty[p.id] ?? suggestedQty(p);
  const total = reorder.reduce((s, p) => s + qtyFor(p) * p.cost, 0);

  function receive(items) {
    dispatch({ type: 'receiveMany', items: items.map((p) => ({ id: p.id, qty: qtyFor(p) })) });
    setQty((q) => {
      const next = { ...q };
      items.forEach((p) => delete next[p.id]);
      return next;
    });
    toast(items.length === 1 ? `Received ${qtyFor(items[0])} ${items[0].unit} of ${items[0].name}` : `Received ${items.length} deliveries`);
  }

  return (
    <InventoryShell>
      <section className="card card--pad split">
        <div>
          <h2>Purchase order &amp; stock replenishment</h2>
          <p className="muted">Suggests how much to order so each item gets back to twice its minimum level.</p>
        </div>
        <button className="btn btn--primary" disabled={!reorder.length} onClick={() => receive(reorder)}>Receive all</button>
      </section>

      <section className="card table-card">
        <div className="card__head card--pad">
          <div>
            <h2>Stock reorder requisition</h2>
            <p className="muted small">Generated {longDate(TODAY)} at {generatedAt.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })}</p>
          </div>
          <div className="right">
            <div className="eyebrow">Estimated reorder cost</div>
            <div className="big-number">{rm2(total)}</div>
          </div>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Product / SKU</th>
                <th>Supplier</th>
                <th className="center">Current</th>
                <th className="center">Minimum</th>
                <th className="center">Order qty</th>
                <th className="right">Estimated cost</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reorder.length === 0 && <tr><td colSpan={7} className="empty">🎉 Everything is above its minimum level. Nothing to reorder.</td></tr>}
              {reorder.map((p) => (
                <tr key={p.id} className={`row--${stockStatus(p)}`}>
                  <td>
                    <div className="cell-title">{p.name}</div>
                    <div className="cell-sub"><span className="sku">{p.sku}</span></div>
                  </td>
                  <td className="small">{p.supplier}</td>
                  <td className="center"><span className={`qty qty--${stockStatus(p)}`}>{p.stock}</span> <small className="muted">{p.unit}</small></td>
                  <td className="center muted">{p.min}</td>
                  <td className="center">
                    <div className="stepper stepper--sm stepper--active">
                      <button onClick={() => setQty({ ...qty, [p.id]: Math.max(1, qtyFor(p) - 1) })} aria-label="Order less"><Minus size={12} /></button>
                      <input
                        inputMode="numeric"
                        value={qtyFor(p)}
                        onChange={(e) => setQty({ ...qty, [p.id]: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })}
                        aria-label={`Order quantity for ${p.name}`}
                      />
                      <button onClick={() => setQty({ ...qty, [p.id]: qtyFor(p) + 1 })} aria-label="Order more"><Plus size={12} /></button>
                    </div>
                  </td>
                  <td className="right strong">{rm2(qtyFor(p) * p.cost)}</td>
                  <td className="right"><button className="btn btn--primary btn--sm" onClick={() => receive([p])}>Receive</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </InventoryShell>
  );
}
