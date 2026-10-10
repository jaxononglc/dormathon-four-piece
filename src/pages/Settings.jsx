import { RotateCcw } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toast';
import { initials } from '../lib/format';

export default function Settings() {
  const { dispatch, aiEnabled, syncError, shop } = useStore();
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
          <div className="shop-card__avatar">{initials(shop.name)}</div>
          <div>
            <div className="shop-card__name">{shop.name}</div>
            <div className="shop-card__meta">{shop.type} · owner {shop.owner}</div>
          </div>
        </div>
        <hr />
        <div>
          <h3>Data</h3>
          <p className="muted small">
            Connected to the database — changes are saved for everyone. AI Advisor: {aiEnabled ? 'Gemini' : 'offline demo answers'}.
          </p>
          {syncError && <p className="small" style={{ color: 'var(--red)' }}>Last save failed ({syncError}). Reload the page to see what was saved.</p>}
        </div>
        <hr />
        <div className="split">
          <div>
            <h3>Reset demo data</h3>
            <p className="muted small">Wipes the shared database and loads the demo shop again. Everyone using this database sees the reset.</p>
          </div>
          <button
            className="btn btn--outline"
            onClick={() => {
              if (window.confirm('Wipe ALL data in the database and load the demo shop again? This cannot be undone.')) {
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
