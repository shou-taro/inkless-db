import { useState } from 'react';
import WelcomePage from './pages/WelcomePage';

type View = 'welcome' | 'graph' | 'sheet';

export default function App() {
  const [view, setView] = useState<View>('welcome');

  return (
    <div className="flex h-screen flex-col">
      <main className="min-h-0 flex-1">
        {view === 'welcome' && <WelcomePage />}
      </main>
    </div>
  );
}
