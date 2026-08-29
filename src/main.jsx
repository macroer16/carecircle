import React from 'react';
import ReactDOM from 'react-dom/client';
import App, { GlobalStyle } from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GlobalStyle />
    <App />
  </React.StrictMode>
);
