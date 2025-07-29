// frontend/src/pages/Dashboard.tsx
import { useEffect } from 'react';
import Dashboard from '../components/dashboard/Dashboard';

export default function DashboardPage() {
  // Set browser tab title
  useEffect(() => {
    document.title = 'AI Smart Home Energy Monitor | Dashboard';
  }, []);

  return <Dashboard />;
}