import React, { Suspense } from 'react'; // Suspense for loading translations
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import './i18n'; // Імпорт конфігурації i18next
import { CircularProgress, Box } from '@mui/material';
import {AuthProvider} from "../context/AuthContext"; // For loading fallback


const loadingMarkup = (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <CircularProgress />
  </Box>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
        <Suspense fallback={loadingMarkup}> {/* ЦЕ ВАЖЛИВО */}
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ThemeProvider>
        </Suspense>
    </AuthProvider>
  </React.StrictMode>,
);