
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProfileView } from '@/components/profile/ProfileView';
import { ProfileSettingsView } from '@/components/profile/ProfileSettingsView';

const UserProfile = () => {
  return (
    <Routes>
      <Route path="/" element={<ProfileView />} />
      <Route path="/settings" element={<ProfileSettingsView />} />
    </Routes>
  );
};

export default UserProfile;
