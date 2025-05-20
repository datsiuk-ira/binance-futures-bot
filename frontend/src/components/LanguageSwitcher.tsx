import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ButtonGroup } from '@mui/material';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <ButtonGroup variant="outlined" aria-label="language switcher" sx={{ position: 'fixed', top: 16, right: 16, zIndex: 1300, backgroundColor: 'background.paper' }}>
      <Button onClick={() => changeLanguage('en')} disabled={i18n.language === 'en'}>EN</Button>
      <Button onClick={() => changeLanguage('uk')} disabled={i18n.language === 'uk'}>UA</Button>
</ButtonGroup>
);
};

export default LanguageSwitcher;