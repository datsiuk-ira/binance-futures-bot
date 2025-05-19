import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles'; // Імпорт
import CssBaseline from '@mui/material/CssBaseline'; // Для нормалізації стилів
import theme from './theme'; // Імпорт вашої теми
// import './index.css'; // Глобальні CSS можна видалити або залишити для специфічних речей

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}> {/* Обгортка */}
      <CssBaseline /> {/* Застосовує базові стилі та темний фон */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);