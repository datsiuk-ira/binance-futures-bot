import React, { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext'; // Using your provided AuthContext
import { Typography, Paper, Box, CircularProgress, Alert, Button, Container } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ProfilePage: React.FC = () => {
  // Using fields from your current AuthContextType: user, isAuthenticated, logout, loading, error
  const { user, isAuthenticated, logout, loading: authLoading, error: authError } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    // Use authLoading to check if auth state is determined
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
    // The AuthContext's initializeAuth now handles fetching user profile if a token exists
    // So, no explicit fetchUserProfile call is needed here from the page itself.
  }, [isAuthenticated, authLoading, navigate]);

  if (authLoading) {
    return (
      <Container sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>{t('profilePage.loading')}</Typography>
      </Container>
    );
  }

  // If there was an error during auth initialization (e.g. fetching profile failed)
  if (authError && !user) { // Show error if it prevented user loading
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">{t('profilePage.error')}: {authError}</Alert>
        <Button component={RouterLink} to="/dashboard" variant="outlined" sx={{ mt: 2, mr: 1 }}>
          {t('profilePage.link.dashboard')}
        </Button>
         <Button onClick={async () => { await logout(); navigate('/login');}} variant="contained" color="primary" sx={{ mt: 2 }}>
            {t('loginPage.button.login')}
        </Button>
      </Container>
    );
  }

  if (!user) {
    // This case might occur if auth is done loading, no error, but user is still null (should be rare if authenticated)
    // Or if user is not authenticated (which should be caught by useEffect redirect)
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="warning">{t('common.pleaseLogin')}</Alert>
        <Button component={RouterLink} to="/login" variant="contained" sx={{ mt: 2 }}>
          {t('loginPage.button.login')}
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {t('profilePage.title')}
        </Typography>

        <Box sx={{ mt: 2 }}>
          <Typography variant="h6">{t('profilePage.label.username')}:</Typography>
          <Typography paragraph>{user.username}</Typography>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6">{t('profilePage.label.email')}:</Typography>
          <Typography paragraph>{user.email}</Typography>
        </Box>
        {/* Add more user details here as needed from the 'user' object */}

        <Box sx={{mt: 3}}>
            <Button component={RouterLink} to="/dashboard" variant="outlined" sx={{ mr: 2 }}>
            {t('profilePage.link.dashboard')}
            </Button>
            <Button onClick={async () => { await logout(); navigate('/login');}} variant="contained" color="error">
                {t('dashboardPage.button.logout')}
            </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default ProfilePage;