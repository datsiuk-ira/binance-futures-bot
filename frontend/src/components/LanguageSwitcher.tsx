// frontend/src/components/LanguageSwitcher.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Box } from '@mui/material';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <Box>
      <Button
        color="inherit"
        onClick={() => changeLanguage('en')}
        disabled={i18n.language === 'en'}
        sx={{ fontWeight: i18n.language === 'en' ? 'bold' : 'normal' }}
      >
        EN
      </Button>
      <Button
        color="inherit"
        onClick={() => changeLanguage('uk')}
        disabled={i18n.language === 'uk'}
        sx={{ fontWeight: i18n.language === 'uk' ? 'bold' : 'normal' }}
      >
        UA
      </Button>
    </Box>
  );
};

export default LanguageSwitcher;