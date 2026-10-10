import { Navigate, Route, Routes } from 'react-router-dom';
import { Sparkles, RotateCcw, CloudOff } from 'lucide-react';
import Sidebar from './components/Sidebar';
import { MobileTopbar, BottomNav } from './components/MobileNav';
import Dashboard from './pages/Dashboard';
import { StockCatalog } from './pages/Inventory';
import SalesAnalysis from './pages/SalesAnalysis';
import Advisor from './pages/Advisor';
import Settings from './pages/Settings';
import { useStore } from './store/AppStore';

export default function App() {
  const { backend } = useStore();
  if (backend !== 'online') return <ConnectScreen />;
  return (
    <div className="app">
      <Sidebar />
      <MobileTopbar />
      <main className="app__main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<StockCatalog />} />
          <Route path="/sales" element={<SalesAnalysis />} />
          <Route path="/advisor" element={<Advisor />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

// Shown until the first load from the database succeeds.
function ConnectScreen() {
  const { backend, backendError, refresh } = useStore();
  const offline = backend === 'offline';
  return (
    <div className="connect">
      <div className="connect__card">
        <div className={`connect__mark${offline ? ' connect__mark--off' : ''}`}>
          {offline ? <CloudOff size={26} /> : <Sparkles size={26} />}
        </div>
        <h2>{offline ? 'Can’t reach the database' : 'Loading your shop…'}</h2>
        {offline ? (
          <>
            <p className="muted">Check your internet connection, then try again.</p>
            {backendError && <p className="connect__detail">{backendError}</p>}
            <button className="btn btn--primary" onClick={refresh}><RotateCcw size={16} />Try again</button>
          </>
        ) : (
          <div className="typing"><i /><i /><i /></div>
        )}
      </div>
    </div>
  );
}
