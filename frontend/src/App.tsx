// frontend/src/App.tsx
import React, { Suspense } from 'react';
// Remove: import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom'; // Keep these
// ThemeProvider and AuthProvider are now higher up in main.tsx,
// but App can still be wrapped by them if needed for structure, or they can be solely in main.tsx.
// For simplicity, let's assume App doesn't need to re-declare ThemeProvider if main.tsx does.
// AuthProvider is also in main.tsx wrapping this.
// import { ThemeProvider } from '@mui/material/styles'; // Already in main.tsx
// import CssBaseline from '@mui/material/CssBaseline'; // Already in main.tsx
// import { AuthProvider } from '../context/AuthContext'; // Already in main.tsx
// import theme from './theme'; // Already in main.tsx

import LoginPage from './pages/login';
import SignUpPage from './pages/sign_up';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/profile';
import PrivateRoute from './components/PrivateRoute';
import LanguageSwitcher from './components/LanguageSwitcher';
import { Box, CircularProgress } from '@mui/material';

function App() {
  return (
    // ThemeProvider, CssBaseline, Router (BrowserRouter), and AuthProvider are now in main.tsx
    // So, App.tsx focuses on the Routes and layout within that context.
    <>
      <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 1300 }}>
        <LanguageSwitcher />
      </Box>
      <Suspense fallback={
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <CircularProgress />
        </Box>
      }>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />

          {/* Protected Routes */}
          <Route element={<PrivateRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            {/* Add other private routes here */}
          </Route>

          {/* Redirect root to dashboard if authenticated, otherwise to login */}
          <Route
            path="/"
            element={
              <Navigate replace to="/dashboard" />
            }
          />
          {/* Fallback for any other route */}
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;