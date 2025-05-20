// frontend/src/components/PrivateRoute.tsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; // Переконайтесь, що шлях правильний
import { CircularProgress, Box } from '@mui/material'; // Для індикатора завантаження

const PrivateRoute: React.FC = () => {
  const { isAuthenticated, loadingAuth } = useAuth();
  console.log("PrivateRoute: loadingAuth =", loadingAuth, "isAuthenticated =", isAuthenticated);


  if (loadingAuth) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="calc(100vh - 64px)"> {/* 64px - приблизна висота AppBar */}
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    console.log("PrivateRoute: Not authenticated, redirecting to /login");
    return <Navigate to="/login" replace />;
  }

  console.log("PrivateRoute: Authenticated, rendering Outlet");
  return <Outlet />;
};

export default PrivateRoute;
