import React from 'react';
import ReactDOM from 'react-dom/client';
import AppEntry from './AppEntry';
import './styles/global.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppEntry />
  </React.StrictMode>
);
