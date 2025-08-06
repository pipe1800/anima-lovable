import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Crown } from 'lucide-react';
import { motion } from 'framer-motion';

// Plan feature component
const PlanFeature = ({ feature, included }: { feature: string; included: boolean }) => (
  <div className="flex items-center gap-2">
    {included ? (
      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
    ) : (
      <div className="w-4 h-4 flex-shrink-0" />
    )}
    <span className={`text-sm ${included ? 'text-gray-200' : 'text-gray-500'}`}>
      {feature}
    </span>
  </div>
);

// Individual plan card component
const LandingPlanCard = ({ 
  plan,
  isPopular,
  onSelect
}: {
  plan: {
    name: string;
    price: number;
    credits: number;
    features: string[];
    description?: string;
  };
  isPopular?: boolean;
  onSelect: () => void;
}) => {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="relative h-full"
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <Badge className="bg-[#FF7A00] text-white px-3 py-1">
            Most Popular
          </Badge>
        </div>
      )}
      
      <Card className={`h-full flex flex-col ${isPopular ? 'border-[#FF7A00] shadow-lg shadow-[#FF7A00]/20' : 'border-gray-700'} 
        bg-[#1a1a2e] hover:border-gray-600 transition-all`}>
        
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                {plan.name}
                {plan.name === 'True Fan' && <Crown className="w-5 h-5 fill-gray-300 text-gray-300" />}
                {plan.name === 'The Whale' && <Crown className="w-5 h-5 fill-yellow-500 text-yellow-500" />}
              </CardTitle>
              {plan.description && (
                <CardDescription className="mt-2">{plan.description}</CardDescription>
              )}
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-white">
                ${plan.price}
              </span>
              <span className="text-gray-400">/month</span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              {plan.credits.toLocaleString()} credits/month
            </p>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col">
          <div className="space-y-3 flex-1">
            {plan.features.map((feature, idx) => (
              <PlanFeature key={idx} feature={feature} included={true} />
            ))}
          </div>
          
          <Button
            onClick={onSelect}
            className="w-full mt-6 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
          >
            Get Started
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};

// Main subscription plans section for landing page
export const LandingSubscriptionPlans = () => {
  const plans = [
    {
      name: 'Guest Pass',
      price: 0,
      credits: 1000,
      description: 'Perfect for trying out the platform',
      features: [
        '1,000 credits/month',
        'Standard AI models',
        'Basic features'
      ]
    },
    {
      name: 'True Fan',
      price: 14.95,
      credits: 15000,
      description: 'For dedicated AI enthusiasts',
      features: [
        '15,000 credits/month',
        'Unlimited characters',
        'Premium AI models',
        '8K context memory',
        'NSFW content access',
        'Priority generation',
        'Credit booster packs',
        'Advanced features',
      ]
    },
    {
      name: 'The Whale',
      price: 24.95,
      credits: 32000,
      description: 'The ultimate AI experience',
      features: [
        '32,000 credits/month',
        'Unlimited characters',
        'Premium AI models',
        '16K+ context memory',
        'NSFW content access',
        'Top priority generation',
        'Credit booster packs',
        'Advanced features',
      ]
    }
  ];

  const handlePlanSelect = (planName: string) => {
    // Navigate to subscription page or open auth modal
    window.location.href = '/subscription';
  };

  return (
    <section className="py-20 px-4 sm:px-6 bg-[#121212]">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Choose Your Plan
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Unlock the full potential of AI conversations with our flexible subscription plans
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {plans.map((plan, idx) => (
            <LandingPlanCard
              key={plan.name}
              plan={plan}
              isPopular={plan.name === 'True Fan'}
              onSelect={() => handlePlanSelect(plan.name)}
            />
          ))}
        </div>

        {/* Trust Indicators */}
        <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-gray-400 mt-12">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-[#FF7A00] rounded-full"></div>
            <span>Cancel anytime</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-[#FF7A00] rounded-full"></div>
            <span>Secure PayPal payments</span>
          </div>
        </div>
      </div>
    </section>
  );
};
