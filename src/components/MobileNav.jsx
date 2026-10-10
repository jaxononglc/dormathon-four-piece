import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Settings } from 'lucide-react';
import { NAV } from './Sidebar';
import { useStore } from '../store/AppStore';
import { SHOP } from '../data/mockData';

// Phone layout only (CSS hides these on wider screens, where Sidebar is used).

// Top bar: logo on the left, settings + account on the right.
export function MobileTopbar() {
  const { products, backend } = useStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <header className="m-topbar">
      <NavLink to="/" className="logo logo--sm">
        <div className="logo__mark"><Sparkles size={16} /></div>
        <span>Bijak AI</span>
      </NavLink>
      <div className="m-topbar__actions" ref={menuRef}>
        <NavLink to="/settings" className={({ isActive }) => `icon-btn${isActive ? ' icon-btn--active' : ''}`} aria-label="Settings">
          <Settings size={18} />
        </NavLink>
        <button className="m-avatar" onClick={() => setOpen((o) => !o)} aria-label="Account" aria-expanded={open}>
          {SHOP.initials}
        </button>
        {open && (
          <div className="m-account">
            <div className="shop-card">
              <div className="shop-card__avatar">{SHOP.initials}</div>
              <div>
                <div className="shop-card__name">{SHOP.name}</div>
                <div className="shop-card__meta">{SHOP.type} · {products.length} products</div>
              </div>
            </div>
            <div className="m-account__row">
              <span>Owner</span><b>{SHOP.owner}</b>
            </div>
            <div className="m-account__row">
              <span>Data</span><b>{backend === 'online' ? 'Synced to database' : backend === 'connecting' ? 'Connecting…' : 'This device only'}</b>
            </div>
            <button className="btn btn--outline btn--sm" onClick={() => navigate('/settings')}><Settings size={14} />Settings</button>
          </div>
        )}
      </div>
    </header>
  );
}

// Bottom tab bar with the main pages.
export function BottomNav() {
  const { advisorUnread } = useStore();
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV.map(({ to, short, icon: Icon, end, badge }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-nav__item${isActive ? ' is-active' : ''}`}>
          <span className="bottom-nav__icon">
            <Icon size={21} />
            {badge === 'advisor' && advisorUnread > 0 && <span className="bottom-nav__badge">{advisorUnread}</span>}
          </span>
          {short}
        </NavLink>
      ))}
    </nav>
  );
}
