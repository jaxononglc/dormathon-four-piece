import { useState } from 'react';
import { PackagePlus, Pencil } from 'lucide-react';
import Modal from './Modal';
import { UNITS } from '../data/mockData';
import Combobox from './Combobox';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toast';

const EMPTY = {
  name: '', sku: '', category: 'Ingredients', supplier: '', location: '',
  stock: '', min: '', unit: 'kg', cost: '', price: '', expiry: '',
};

// One form for both "Add stock" and "Edit stock details".
export default function StockForm({ product, onClose }) {
  const { products, categories, suppliers, dispatch } = useStore();
  const toast = useToast();
  const editing = Boolean(product);
  const [f, setF] = useState(() =>
    editing ? { ...product, price: product.price ?? '' } : EMPTY
  );
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function submit(e) {
    e.preventDefault();
    const err = {};
    if (!f.name.trim()) err.name = 'Enter a product name';
    if (!f.category) err.category = 'Pick or add a category';
    if (!f.sku.trim()) err.sku = 'Enter a SKU';
    else if (products.some((p) => p.sku.toLowerCase() === f.sku.trim().toLowerCase() && p.id !== product?.id))
      err.sku = 'This SKU is already used';
    for (const k of ['stock', 'min', 'cost']) {
      if (f[k] === '' || Number(f[k]) < 0 || Number.isNaN(Number(f[k]))) err[k] = 'Enter 0 or more';
    }
    if (f.price !== '' && (Number(f.price) < 0 || Number.isNaN(Number(f.price)))) err.price = 'Enter 0 or more';
    setErrors(err);
    if (Object.keys(err).length) return;

    const data = {
      ...f,
      name: f.name.trim(),
      sku: f.sku.trim().toUpperCase(),
      supplier: f.supplier.trim() || 'Own kitchen',
      stock: Number(f.stock),
      min: Number(f.min),
      cost: Number(f.cost),
      price: f.price === '' ? null : Number(f.price),
    };
    if (editing) {
      dispatch({ type: 'updateProduct', id: product.id, patch: data });
      toast(`Saved changes to ${data.name}`);
    } else {
      dispatch({ type: 'addProduct', product: { ...data, id: `p${Date.now()}` } });
      toast(`${data.name} added to inventory`);
    }
    onClose();
  }

  const Field = ({ k, label, children, hint }) => (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {errors[k] ? <span className="field__error">{errors[k]}</span> : hint && <span className="field__hint">{hint}</span>}
    </label>
  );

  return (
    <Modal
      title={editing ? 'Edit stock details' : 'Add stock'}
      subtitle={editing ? `Update ${product.name}` : 'Log a new product or ingredient'}
      icon={editing ? <Pencil size={20} /> : <PackagePlus size={20} />}
      onClose={onClose}
      width={600}
    >
      <form className="modal__body form" onSubmit={submit} noValidate>
        {Field({ k: 'name', label: 'Product name', children: <input className={`input${errors.name ? ' input--error' : ''}`} value={f.name} onChange={set('name')} placeholder="e.g. Tepung gandum" autoFocus /> })}
        <div className="form__row">
          {Field({ k: 'sku', label: 'SKU', children: <input className={`input mono${errors.sku ? ' input--error' : ''}`} value={f.sku} onChange={set('sku')} placeholder="ING-TP-01" /> })}
          {Field({ k: 'location', label: 'Location', children: <input className="input" value={f.location} onChange={set('location')} placeholder="Store room · Rack 1" /> })}
        </div>
        <div className="form__row">
          {/* Not wrapped in <label>: the dropdown rows would forward clicks to the input. */}
          <div className="field">
            <span className="field__label">Category</span>
            <Combobox
              noun="category"
              options={categories}
              value={f.category}
              onChange={(category) => setF((prev) => ({ ...prev, category }))}
              onCreate={(name) => dispatch({ type: 'addOption', list: 'categories', name })}
              invalid={Boolean(errors.category)}
            />
            {errors.category && <span className="field__error">{errors.category}</span>}
          </div>
          <div className="field">
            <span className="field__label">Supplier / vendor</span>
            <Combobox
              noun="supplier"
              options={suppliers}
              value={f.supplier}
              onChange={(supplier) => setF((prev) => ({ ...prev, supplier }))}
              onCreate={(name) => dispatch({ type: 'addOption', list: 'suppliers', name })}
            />
          </div>
        </div>
        <div className="form__row form__row--3">
          {Field({ k: 'stock', label: 'Quantity in stock', children: <input className={`input${errors.stock ? ' input--error' : ''}`} type="number" min="0" value={f.stock} onChange={set('stock')} /> })}
          {Field({ k: 'min', label: 'Min alert level', hint: 'Warn me below this', children: <input className={`input${errors.min ? ' input--error' : ''}`} type="number" min="0" value={f.min} onChange={set('min')} /> })}
          {Field({ k: 'unit', label: 'Unit', children: (
            <select className="input" value={f.unit} onChange={set('unit')}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          ) })}
        </div>
        <div className="form__row form__row--3">
          {Field({ k: 'cost', label: 'Unit cost (RM)', children: <input className={`input${errors.cost ? ' input--error' : ''}`} type="number" min="0" step="0.01" value={f.cost} onChange={set('cost')} /> })}
          {Field({ k: 'price', label: 'Selling price (RM)', hint: 'Leave empty if not sold', children: <input className={`input${errors.price ? ' input--error' : ''}`} type="number" min="0" step="0.01" value={f.price} onChange={set('price')} /> })}
          {Field({ k: 'expiry', label: 'Expiry', children: <input className="input" type="date" value={f.expiry} onChange={set('expiry')} /> })}
        </div>
        <button type="submit" className="btn btn--primary btn--block">
          {editing ? 'Save changes' : 'Add to inventory'}
        </button>
      </form>
    </Modal>
  );
}
