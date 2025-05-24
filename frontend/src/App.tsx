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
import Header from "./components/Header";

interface AppProps {
  toggleTheme: () => void;
}

function App({ toggleTheme }: AppProps) {
  return (
    <>
      <Header toggleTheme={toggleTheme} /> {/* Added Header component */}
      {/* Removed redundant LanguageSwitcher Box that was here */}
      <Suspense fallback={
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <CircularProgress />
        </Box>
      }>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} /> // Corrected path from /sign-up to /signup as per Header.tsx
          <Route element={<PrivateRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route
            path="/"
            element={
              <Navigate replace to="/dashboard" />
            }
          />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;