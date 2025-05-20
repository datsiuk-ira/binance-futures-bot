import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchProfile } from "../api/auth";
import {
  Container,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
  Alert
} from "@mui/material";
import { toast } from 'react-toastify';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface ProfileData {
  email: string;
  balance: string;
  leverage: number;
  risk_percentage: number;
  trade_mode: string;
  binance_api_key?: string;
}

export default function Profile() {
  const { t } = useTranslation(); // Initialize t function
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchProfile();
        setProfileData(response.data);
      } catch (err: any) {
        console.error("Failed to fetch profile:", err);
        let errorMessage = t('profile.errorLoading');
        if (err.response && err.response.data && err.response.data.detail) {
            errorMessage = err.response.data.detail;
        } else if (err.message) {
            errorMessage = err.message;
        }
        setError(errorMessage);
        if (!localStorage.getItem('accessToken')) {
            navigate("/login");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [navigate, t]); // Added t to dependencies

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    toast.info(t('profile.logoutSuccess'));
    navigate("/login");
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !profileData) {
    return (
        <Container maxWidth="sm" sx={{mt: 4}}>
             <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{error}</Alert>
             <Button variant="contained" onClick={() => navigate("/login")}>{t('login.link')}</Button>
        </Container>
    );
  }

  return profileData ? (
    <Container component="main" maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ padding: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: 'center', color: 'primary.main' }}>
          {t('profile.title')}
        </Typography>
        <List>
          <ListItem disablePadding>
            <ListItemText primary={t('profile.email')} secondary={profileData.email} />
          </ListItem>
          <Divider component="li" sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemText
                primary={t('profile.balance')}
                secondary={`$${parseFloat(profileData.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
          </ListItem>
          <Divider component="li" sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemText primary={t('profile.leverage')} secondary={`${profileData.leverage}x`} />
          </ListItem>
          <Divider component="li" sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemText primary={t('profile.riskPerTrade')} secondary={`${profileData.risk_percentage}%`} />
          </ListItem>
          <Divider component="li" sx={{ my: 1 }} />
          <ListItemText
              primary={t('profile.tradeMode')}
              secondary={t(`tradeModes.${profileData.trade_mode}`, profileData.trade_mode)}
          />
          <Divider component="li" sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemText 
                primary={t('profile.apiKeyStatus')} 
                secondary={profileData.binance_api_key ? t('profile.apiKeyConfigured') : t('profile.apiKeyNotConfigured')} 
            />
          </ListItem>
        </List>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleLogout}
            startIcon={<LogoutIcon />}
          >
            {t('profile.logoutButton')}
          </Button>
        </Box>
      </Paper>
    </Container>
  ) : (
     <Container maxWidth="sm" sx={{mt: 4}}>
        <Alert severity="warning">{t('profile.errorLoadingFallback')}</Alert>
     </Container>
  );
}
