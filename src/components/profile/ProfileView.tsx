import React from 'react';
import { ProfileHeader } from './ProfileHeader';
import { ProfileContent } from './ProfileContent';

export const ProfileView = () => {
  return (
    <div className="min-h-screen">
      <ProfileHeader />
      <ProfileContent />
    </div>
  );
};