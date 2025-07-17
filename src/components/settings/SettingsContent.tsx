
import React from 'react';
import { ProfileSettings } from './categories/ProfileSettings';
import { AccountSettings } from './categories/AccountSettings';
import { NotificationSettings } from './categories/NotificationSettings';
import { BillingSettings } from './categories/BillingSettings';

interface SettingsContentProps {
  activeCategory: string;
}

export const SettingsContent = ({ activeCategory }: SettingsContentProps) => {
  const renderContent = () => {
    switch (activeCategory) {
      case 'profile':
        return <ProfileSettings />;
      case 'account':
        return <AccountSettings />;
      case 'billing':
        return <BillingSettings />;
      case 'notifications':
        return <NotificationSettings />;
      default:
        return <ProfileSettings />;
    }
  };

  return (
    <div className="p-6">
      {renderContent()}
    </div>
  );
};
