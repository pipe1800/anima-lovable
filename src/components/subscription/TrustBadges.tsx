
import React from 'react';
import { Shield, X, RotateCcw } from 'lucide-react';

export const TrustBadges = () => {
  const badges = [
    {
      icon: Shield,
      title: "Secure SSL Payment",
      description: "Your payment info is protected"
    },
    {
      icon: X,
      title: "Cancel Anytime",
      description: "No long-term commitments"
    },
    {
      icon: RotateCcw,
      title: "30-Day Money-Back",
      description: "Full refund guarantee"
    }
  ];

  return (
    <section className="py-12 px-4 sm:px-6 border-t border-gray-800">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {badges.map((badge, index) => {
            const IconComponent = badge.icon;
            return (
              <div key={index} className="flex flex-col items-center text-center">
                <div className="mb-3 p-3 rounded-full bg-gray-800/50">
                  <IconComponent className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-white font-semibold mb-1 text-sm">
                  {badge.title}
                </h3>
                <p className="text-gray-400 text-xs">
                  {badge.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
