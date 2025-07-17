
import React from 'react';

interface SettingsNavigationProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export const SettingsNavigation = ({ activeCategory, onCategoryChange }: SettingsNavigationProps) => {
  const categories = [
    { id: 'profile', label: 'Profile' },
    { id: 'account', label: 'Account & Security' },
    { id: 'billing', label: 'Subscription & Billing' },
    { id: 'notifications', label: 'Notifications' },
  ];

  return (
    <nav className="p-6">
      <div className="space-y-1">
        {categories.map((category) => {
          const isActive = activeCategory === category.id;
          
          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={`
                w-full text-left px-4 py-3 rounded-lg transition-colors relative
                ${isActive 
                  ? 'text-[#FF7A00] font-medium bg-[#FF7A00]/10' 
                  : 'text-gray-300 hover:text-white hover:bg-gray-800/30'
                }
              `}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FF7A00] rounded-r"></div>
              )}
              <span className={isActive ? 'ml-3' : ''}>{category.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
