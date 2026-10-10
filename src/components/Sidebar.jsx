import { NavLink } from 'react-router-dom';
import { LayoutGrid, Package, LineChart, Sparkles, Settings } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { initials } from '../lib/format';

// `short` is the label in the mobile bottom bar.
export const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutGrid, end: true },
  { to: '/inventory', label: 'Inventory', short: 'Stock', icon: Package },
  { to: '/sales', label: 'Sales analysis', short: 'Sales', icon: LineChart },
  { to: '/advisor', label: 'AI Advisor', short: 'Advisor', icon: Sparkles, badge: 'advisor' },
];

export default function Sidebar() {
  const { advisorUnread, products, shop } = useStore();
  const navClass = ({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`;

  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo__mark"><Sparkles size={18} /></div>
        <span>Bijak AI</span>
      </div>
      <div className="sidebar__label">MENU</div>
      <nav className="sidebar__nav">
        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink key={to} to={to} end={end} className={navClass}>
            <Icon size={18} />
            <span>{label}</span>
            {badge === 'advisor' && advisorUnread > 0 && <span className="nav-badge">{advisorUnread}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar__spacer" />
      <NavLink to="/settings" className={navClass}>
        <Settings size={18} />
        <span>Settings</span>
      </NavLink>
      <div className="shop-card">
        <div className="shop-card__avatar">{initials(shop.name)}</div>
        <div>
          <div className="shop-card__name">{shop.name}</div>
          <div className="shop-card__meta">{shop.type} · {products.length} products</div>
        </div>
      </div>
    </aside>
  );
}
