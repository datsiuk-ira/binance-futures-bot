import React, { useContext } from 'react';
import { AppBar, Toolbar, Typography, Button, IconButton, Box, useTheme, Switch, FormControlLabel } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import AccountCircle from '@mui/icons-material/AccountCircle';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import LoginIcon from '@mui/icons-material/Login';
import AppRegistrationIcon from '@mui/icons-material/AppRegistration';

import { AuthContext } from '../../context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';

interface HeaderProps {
    toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleTheme }) => {
    const { t } = useTranslation();
    const authContext = useContext(AuthContext);
    const navigate = useNavigate();
    const theme = useTheme();

    const handleLogout = () => {
        if (authContext) {
            authContext.logout();
            navigate('/login');
        }
    };

    return (
        <AppBar position="static" color="default" elevation={1}>
            <Toolbar>
                <Typography variant="h6" component={RouterLink} to="/" sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit' }}>
                    {t('appName', 'Trading Bot')}
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <LanguageSwitcher />
                    <IconButton sx={{ ml: 1 }} onClick={toggleTheme} color="inherit">
                        {theme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                    </IconButton>

                    {authContext && authContext.isAuthenticated ? (
                        <>
                            <Button
                                color="inherit"
                                startIcon={<AccountCircle />}
                                component={RouterLink}
                                to="/profile"
                                sx={{ textTransform: 'none', ml: 2 }}
                            >
                                {authContext.user?.username || t('profile', 'Profile')}
                            </Button>
                            <Button
                                color="inherit"
                                startIcon={<ExitToAppIcon />}
                                onClick={handleLogout}
                                sx={{ textTransform: 'none', ml: 1 }}
                            >
                                {t('logout', 'Logout')}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                color="inherit"
                                startIcon={<LoginIcon />}
                                component={RouterLink}
                                to="/login"
                                sx={{ textTransform: 'none', ml: 2 }}
                            >
                                {t('login', 'Login')}
                            </Button>
                            <Button
                                color="inherit"
                                startIcon={<AppRegistrationIcon />}
                                component={RouterLink}
                                to="/sign-up"
                                sx={{ textTransform: 'none', ml: 1 }}
                            >
                                {t('signUp', 'Sign Up')}
                            </Button>
                        </>
                    )}
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default Header;