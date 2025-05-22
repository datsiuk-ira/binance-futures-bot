import React from 'react';
import { useTranslation } from 'react-i18next';
import { Select, MenuItem, FormControl, InputLabel, SelectChangeEvent } from '@mui/material';

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();

  const handleChangeLanguage = (event: SelectChangeEvent<string>) => {
    i18n.changeLanguage(event.target.value as string);
  };

  return (
    <FormControl size="small" sx={{ minWidth: 120 }}>
      <InputLabel id="language-select-label">{t('languageSwitcher.label')}</InputLabel>
      <Select
        labelId="language-select-label"
        id="language-select"
        value={i18n.language}
        label={t('languageSwitcher.label')}
        onChange={handleChangeLanguage}
      >
        <MenuItem value="en">{t('languageSwitcher.en')}</MenuItem>
        <MenuItem value="uk">{t('languageSwitcher.uk')}</MenuItem>
      </Select>
    </FormControl>
  );
};

export default LanguageSwitcher;