import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DbProvider } from '@/lib/db/context';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DbProvider>
      <App />
    </DbProvider>
  </React.StrictMode>
);
