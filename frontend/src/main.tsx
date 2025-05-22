// frontend/src/main.tsx
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import './i18n';
import { CircularProgress, Box } from '@mui/material';
import { AuthProvider } from "../context/AuthContext";


const loadingMarkup = (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <CircularProgress />
  </Box>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter> {/* BrowserRouter now wraps AuthProvider */}
      <AuthProvider> {/* AuthProvider is now INSIDE BrowserRouter */}
        <Suspense fallback={loadingMarkup}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {/* <App /> should contain your Routes, not another BrowserRouter */}
            <App />
          </ThemeProvider>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);