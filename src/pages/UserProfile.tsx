
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { NewProfileView } from '@/components/profile/NewProfileView';
import { ProfileSettingsView } from '@/components/profile/ProfileSettingsView';

const UserProfile = () => {
  return (
    <Routes>
      <Route path="/" element={<NewProfileView />} />
      <Route path="/:userId" element={<NewProfileView />} />
      <Route path="/settings" element={<ProfileSettingsView />} />
    </Routes>
  );
};

export default UserProfile;
