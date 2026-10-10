import { stockStatus } from '../store/AppStore';

export default function StatusPill({ product }) {
  const s = stockStatus(product);
  if (s === 'out') return <span className="pill pill--out"><i />Out of stock</span>;
  if (s === 'low') return <span className="pill pill--low"><i />Low stock ({product.stock} left)</span>;
  return <span className="pill pill--ok"><i />Healthy</span>;
}
