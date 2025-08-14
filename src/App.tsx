import { useState } from 'react';
import WelcomePage from './pages/WelcomePage';
import GraphPage from './pages/GraphPage';

type View = 'welcome' | 'graph' | 'sheet';

export default function App() {
  const [view, setView] = useState<View>('graph');

  return (
    <div className="flex h-screen flex-col">
      <main className="min-h-0 flex-1">
        {view === 'welcome' && <WelcomePage />}
        {view === 'graph' && <GraphPage />}
      </main>
    </div>
  );
}
