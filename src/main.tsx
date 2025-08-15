import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConnectionProvider } from '@/store/connection';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConnectionProvider>
      <App />
    </ConnectionProvider>
  </React.StrictMode>
);
