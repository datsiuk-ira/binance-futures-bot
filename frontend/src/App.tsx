// frontend/src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, Link as RouterLink } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { AuthProvider, useAuth } from '../context/AuthContext'; // Шлях до AuthContext
import LoginPage from './pages/login';
import SignUpPage from './pages/sign_up';
import ProfilePage from './pages/profile'; // Використовуйте ProfilePage
import DashboardPage from './pages/DashboardPage';
import PrivateRoute from './components/PrivateRoute'; // Шлях до PrivateRoute
import theme from './theme';
import LanguageSwitcher from "./components/LanguageSwitcher"; // Шлях до LanguageSwitcher
import { useTranslation } from 'react-i18next';
import { AppBar, Toolbar, Typography, Button, Box, Container, CircularProgress } from '@mui/material'; // Додано CircularProgress

// Profile імпортувався двічі, видаляємо один, використовуємо ProfilePage
// import Profile from "./pages/profile"; // Видалено або замінено на ProfilePage

const AppContent: React.FC = () => {
    const { isAuthenticated, logout, loadingAuth } = useAuth();
    const { t } = useTranslation("common");

    if (loadingAuth) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
            <CircularProgress />
        </Box>
      );
    }

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    {/* App Name / Home Link */}
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        <RouterLink to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                            {t('appName')}
                        </RouterLink>
                    </Typography>

                    {/* Group for right-aligned items */}
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <LanguageSwitcher />
                        {isAuthenticated ? (
                            <>
                                <Button color="inherit" component={RouterLink} to="/dashboard" sx={{ ml: 1 }}>
                                    {t('Dashboard')}
                                </Button>
                                <Button color="inherit" component={RouterLink} to="/profile" sx={{ ml: 1 }}>
                                    {t('Profile')}
                                </Button>
                                <Button color="inherit" onClick={logout} sx={{ ml: 1 }}>
                                    {t('logout')}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button color="inherit" component={RouterLink} to="/login" sx={{ ml: 1 }}>
                                    {t('login')}
                                </Button>
                                <Button color="inherit" component={RouterLink} to="/signup" sx={{ ml: 1 }}>
                                    {t('signUp')}
                                </Button>
                            </>
                        )}
                    </Box>
                </Toolbar>
            </AppBar>
            <Container sx={{ marginTop: 4, paddingBottom: 4 }}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/signup" element={<SignUpPage />} />

                    {/* Захищені маршрути */}
                    <Route element={<PrivateRoute/>}>
                        <Route path="/profile" element={<ProfilePage/>}/> {/* Використовуємо ProfilePage для консистентності */}
                        <Route path="/dashboard" element={<DashboardPage/>}/>
                    </Route>

                    {/* Логіка перенаправлення для кореневого шляху */}
                    <Route
                        path="/"
                        element={
                            // loadingAuth вже оброблено вище, тут ми точно знаємо стан isAuthenticated
                            isAuthenticated ? <Navigate to="/dashboard" /> : <Navigate to="/login" />
                        }
                    />
                </Routes>
            </Container>
        </>
    );
};

const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
