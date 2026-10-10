import { Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import { StockCatalog } from './pages/Inventory';
import SalesAnalysis from './pages/SalesAnalysis';
import Advisor from './pages/Advisor';
import Settings from './pages/Settings';

export default function App() {
  return (
    <div className="app">
      <Sidebar />
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
    </div>
  );
}
