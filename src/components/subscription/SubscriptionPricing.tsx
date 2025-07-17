
import React, { useState } from 'react';
import PricingTiers from '@/components/PricingTiers';
import { Switch } from '@/components/ui/switch';

export const SubscriptionPricing = () => {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <section className="py-8">
      {/* Billing Toggle */}
      <div className="flex justify-center items-center mb-12">
        <div className="flex items-center space-x-4 bg-[#1a1a2e] rounded-full p-2 border border-gray-700">
          <span className={`px-4 py-2 text-sm font-medium transition-colors ${
            !isYearly ? 'text-white' : 'text-gray-400'
          }`}>
            Monthly
          </span>
          <Switch
            checked={isYearly}
            onCheckedChange={setIsYearly}
            className="data-[state=checked]:bg-[#FF7A00]"
          />
          <span className={`px-4 py-2 text-sm font-medium transition-colors ${
            isYearly ? 'text-white' : 'text-gray-400'
          }`}>
            Yearly
          </span>
          {isYearly && (
            <div className="ml-2">
              <span className="bg-[#FF7A00] text-white text-xs px-2 py-1 rounded-full font-bold">
                Save 20%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Remove the default padding and background from PricingTiers since we're controlling it here */}
      <div className="[&>section]:py-0 [&>section]:bg-transparent">
        <PricingTiers isYearly={isYearly} />
      </div>
    </section>
  );
};
