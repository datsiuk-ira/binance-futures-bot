import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import {useAuth} from "../../context/AuthContext";

const PrivateRoute: React.FC = () => {
    const { tokens } = useAuth();

    return tokens?.access ? <Outlet /> : <Navigate to="/login" replace />;
};

export default PrivateRoute;
