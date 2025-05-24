import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Typography, Paper, Box, CircularProgress, Alert, Button, Container, TextField, IconButton } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import { UpdateUserPayload, User } from '../../src/api/auth';


const ProfilePage: React.FC = () => {
  const { user, isAuthenticated, logout, updateUser, loading: authLoading, error: authError, clearError } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [editableUser, setEditableUser] = useState<Partial<User>>({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    // Redirect if not authenticated and auth state is determined
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
    // Populate form when user data is available or changes
    if (user) {
      setEditableUser({
        username: user.username || '',
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      });
    }
  }, [isAuthenticated, authLoading, navigate, user]);

  useEffect(() => {
    if (authError) {
      setFormError(authError);
      setSuccessMessage(null); // Clear success message if an error occurs
    } else {
      setFormError(null);
    }
  }, [authError]);

  // Clear errors on component unmount
  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setEditableUser(prev => ({ ...prev, [name]: value }));
  };

  const handleUpdateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    setFormError(null);
    setSuccessMessage(null);

    if (!updateUser) {
      setFormError("Profile update service is unavailable.");
      return;
    }

    const payload: UpdateUserPayload = {};
    if (editableUser.username !== user?.username) payload.username = editableUser.username;
    if (editableUser.email !== user?.email) payload.email = editableUser.email;
    // Ensure empty strings are handled if backend expects null or omits field
    if (editableUser.first_name !== (user?.first_name || '')) payload.first_name = editableUser.first_name;
    if (editableUser.last_name !== (user?.last_name || '')) payload.last_name = editableUser.last_name;


    if (Object.keys(payload).length === 0) {
      setSuccessMessage(t('profilePage.noChanges'));
      setIsEditing(false);
      return;
    }

    try {
      const updatedUserResult = await updateUser(payload);
      if (updatedUserResult) {
        setSuccessMessage(t('profilePage.updateSuccess'));
        setIsEditing(false);
      } else {
        // Error already set by updateUser in AuthContext and handled by useEffect
        // If authError is not set, provide a generic message
        if (!authError) setFormError(t('profilePage.error.genericUpdate'));
      }
    } catch (err: any) {
      // Should be caught by AuthContext's updateUser, but as a fallback:
      setFormError(err.message || t('profilePage.error.genericUpdate'));
    }
  };

  const toggleEditMode = () => {
    if (isEditing && user) { // If cancelling edit
      setEditableUser({ // Reset form to original user data
        username: user.username || '',
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      });
      clearError(); // Clear any errors from failed update attempts
      setFormError(null);
      setSuccessMessage(null);
    }
    setIsEditing(!isEditing);
  };


  if (authLoading && !user) { // Show loading spinner if auth is loading and no user data yet
    return (
      <Container sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>{t('profilePage.loading')}</Typography>
      </Container>
    );
  }

  if (!user && !authLoading) { // If done loading, not authenticated (should have been redirected), or user is null
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="warning">{t('common.pleaseLogin')}</Alert>
        <Button component={RouterLink} to="/login" variant="contained" sx={{ mt: 2 }}>
          {t('loginPage.button.login')}
        </Button>
      </Container>
    );
  }

  if (!user) { // Fallback for user still null after loading, should be rare if authenticated.
      return (
           <Container sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="h6">{t('profilePage.error.noUserData')}</Typography>
               <Button component={RouterLink} to="/login" variant="contained" sx={{ mt: 2 }}>
                 {t('loginPage.button.login')}
               </Button>
           </Container>
      );
  }


  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            {t('profilePage.title')}
          </Typography>
          <IconButton onClick={toggleEditMode} color="primary">
            {isEditing ? <CancelIcon /> : <EditIcon />}
          </IconButton>
        </Box>

        {formError && (
          <Alert severity="error" sx={{ width: '100%', mb: 2 }} onClose={() => {setFormError(null); clearError();}}>
            {formError}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ width: '100%', mb: 2 }} onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}

        <Box component="form" onSubmit={handleUpdateProfile} noValidate sx={{ mt: 2 }}>
          <TextField
            label={t('profilePage.label.username')}
            name="username"
            value={editableUser.username}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            disabled={!isEditing || authLoading}
            InputProps={{
              readOnly: !isEditing,
            }}
            variant={isEditing ? "outlined" : "standard"}
          />
          <TextField
            label={t('profilePage.label.email')}
            name="email"
            type="email"
            value={editableUser.email}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            disabled={!isEditing || authLoading}
            InputProps={{
              readOnly: !isEditing,
            }}
            variant={isEditing ? "outlined" : "standard"}
          />
          <TextField
            label={t('profilePage.label.firstName', 'First Name')}
            name="first_name"
            value={editableUser.first_name}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            disabled={!isEditing || authLoading}
            InputProps={{
              readOnly: !isEditing,
            }}
            variant={isEditing ? "outlined" : "standard"}
          />
          <TextField
            label={t('profilePage.label.lastName', 'Last Name')}
            name="last_name"
            value={editableUser.last_name}
            onChange={handleInputChange}
            fullWidth
            margin="normal"
            disabled={!isEditing || authLoading}
            InputProps={{
              readOnly: !isEditing,
            }}
            variant={isEditing ? "outlined" : "standard"}
          />

          {isEditing && (
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={toggleEditMode} sx={{ mr: 1 }} disabled={authLoading}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={authLoading}>
                {authLoading ? <CircularProgress size={24} /> : t('common.save', 'Save Changes')}
              </Button>
            </Box>
          )}
        </Box>

        {!isEditing && (
            <Box sx={{mt: 4, display: 'flex', justifyContent: 'space-between'}}>
                <Button component={RouterLink} to="/dashboard" variant="outlined">
                    {t('profilePage.link.dashboard')}
                </Button>
                <Button onClick={async () => { await logout(); navigate('/login');}} variant="contained" color="error">
                    {t('dashboardPage.button.logout')}
                </Button>
            </Box>
        )}
      </Paper>
    </Container>
  );
};

export default ProfilePage;