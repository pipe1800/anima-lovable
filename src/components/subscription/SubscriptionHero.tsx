
import React from 'react';

export const SubscriptionHero = () => {
  return (
    <section className="pt-20 pb-16 px-4 sm:px-6 text-center">
      <div className="max-w-4xl mx-auto">
        {/* Main Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
          Go Beyond the Limit.
        </h1>
        
        {/* Supporting Headline */}
        <p className="text-xl sm:text-2xl text-gray-400 mb-8 leading-relaxed max-w-3xl mx-auto">
          The free experience is just a taste. Upgrade now to unlock unlimited messages, more powerful AI, and an uninterrupted experience.
        </p>
        
        {/* Trust Indicators */}
        <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-gray-400 mt-12">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-[#FF7A00] rounded-full"></div>
            <span>14-day money-back guarantee</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-[#FF7A00] rounded-full"></div>
            <span>Cancel anytime</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-[#FF7A00] rounded-full"></div>
            <span>Secure payments</span>
          </div>
        </div>
      </div>
    </section>
  );
};
