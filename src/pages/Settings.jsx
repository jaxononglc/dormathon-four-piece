import { RotateCcw } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { SHOP } from '../data/mockData';

export default function Settings() {
  const { dispatch } = useStore();
  const toast = useToast();
  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Settings</h1>
          <p className="muted">Shop profile and demo data</p>
        </div>
      </header>
      <section className="card card--pad settings">
        <div className="shop-card shop-card--lg">
          <div className="shop-card__avatar">{SHOP.initials}</div>
          <div>
            <div className="shop-card__name">{SHOP.name}</div>
            <div className="shop-card__meta">{SHOP.type} · owner {SHOP.owner}</div>
          </div>
        </div>
        <hr />
        <div className="split">
          <div>
            <h3>Reset demo data</h3>
            <p className="muted small">This app has no backend. Your changes are saved in this browser only. Reset to bring back the original mock data.</p>
          </div>
          <button
            className="btn btn--outline"
            onClick={() => {
              if (window.confirm('Reset all stock and sales back to the demo data?')) {
                dispatch({ type: 'reset' });
                toast('Demo data restored');
              }
            }}
          >
            <RotateCcw size={16} />Reset
          </button>
        </div>
      </section>
    </div>
  );
}
