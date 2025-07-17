
import React from 'react';
import { ProfileStats } from './ProfileStats';
import { ProfileTabs } from './ProfileTabs';
import { AchievementsSection } from './AchievementsSection';

export const ProfileContent = () => {
  return (
    <div className="px-8 pb-8 space-y-8">
      {/* Stats Section */}
      <ProfileStats />
      
      {/* Achievements Section - Hidden for post-launch */}
      {/* <AchievementsSection /> */}
      
      {/* Tabbed Content */}
      <ProfileTabs />
    </div>
  );
};
