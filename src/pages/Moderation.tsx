
import React, { useState } from 'react';
import { ModerationSidebar } from '@/components/moderation/ModerationSidebar';
import { ModerationDashboard } from '@/components/moderation/ModerationDashboard';
import { ModerationContentQueue } from '@/components/moderation/ModerationContentQueue';
import { ModerationUserManagement } from '@/components/moderation/ModerationUserManagement';
import { ModerationRules } from '@/components/moderation/ModerationRules';

const Moderation = () => {
  const [activeSection, setActiveSection] = useState('dashboard');

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <ModerationDashboard />;
      case 'content-queue':
        return <ModerationContentQueue />;
      case 'user-management':
        return <ModerationUserManagement />;
      case 'rules':
        return <ModerationRules />;
      default:
        return <ModerationDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0B0F] text-white flex">
      {/* Fixed Left Sidebar */}
      <ModerationSidebar 
        activeSection={activeSection} 
        onSectionChange={setActiveSection} 
      />
      
      {/* Main Content Area */}
      <main className="flex-1 ml-64 p-6">
        {renderContent()}
      </main>
    </div>
  );
};

export default Moderation;
