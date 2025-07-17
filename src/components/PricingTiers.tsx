
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getUserActiveSubscription } from "@/lib/supabase-queries";
import { useState, useEffect } from "react";

interface PricingTiersProps {
  isYearly?: boolean;
}

const PricingTiers = ({ isYearly = false }: PricingTiersProps) => {
  const { user } = useAuth();
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserSubscription = async () => {
      if (!user) {
        setCurrentPlan('Guest Pass'); // Default for non-authenticated users
        setLoading(false);
        return;
      }

      try {
        const { data: subscription } = await getUserActiveSubscription(user.id);
        if (subscription?.plan) {
          setCurrentPlan(subscription.plan.name);
        } else {
          setCurrentPlan('Guest Pass'); // Default for users without subscription
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
        setCurrentPlan('Guest Pass');
      } finally {
        setLoading(false);
      }
    };

    fetchUserSubscription();
  }, [user]);

  const getButtonConfig = (planName: string) => {
    if (loading) {
      return { text: "Loading...", variant: "outline" as const, disabled: true };
    }

    if (!user) {
      return { text: "Create an Account", variant: "default" as const, disabled: false };
    }

    if (currentPlan === planName) {
      return { text: "Current Plan", variant: "outline" as const, disabled: true };
    }

    // Define plan hierarchy for comparison - Guest Pass should be treated as upgradeable
    const planHierarchy = {
      'Guest Pass': 0,
      'The Guest Pass': 0,
      'True Fan': 1,
      'The Whale': 2
    };

    const currentPlanLevel = planHierarchy[currentPlan as keyof typeof planHierarchy] ?? 0;
    const targetPlanLevel = planHierarchy[planName as keyof typeof planHierarchy] ?? 0;

    // Guest Pass users can upgrade to paid plans
    if (currentPlan === 'Guest Pass' && targetPlanLevel > 0) {
      return { text: "Subscribe", variant: "default" as const, disabled: false };
    } else if (targetPlanLevel > currentPlanLevel) {
      return { text: "Upgrade", variant: "default" as const, disabled: false };
    } else if (targetPlanLevel < currentPlanLevel) {
      return { text: "Downgrade", variant: "outline" as const, disabled: false };
    } else {
      return { text: "Select Plan", variant: "default" as const, disabled: false };
    }
  };

  const pricingTiers = [
    {
      name: "The Guest Pass",
      monthlyPrice: "$0",
      yearlyPrice: "$0",
      period: isYearly ? "year" : "month",
      features: [
        "75 Messages/Day",
        "Standard AI Models", 
        "Create 1 Custom Character",
        "Community Access",
        "Queue during peak hours"
      ],
      popular: false,
      savings: null
    },
    {
      name: "True Fan",
      monthlyPrice: "$14.95",
      yearlyPrice: "$143.52",
      period: isYearly ? "year" : "month",
      features: [
        "Unlimited Messages",
        "Access to Premium AI Models",
        "Create up to 50 Characters",
        "No Queue",
        "Enhanced Memory (8k Context)"
      ],
      popular: true,
      savings: "Save 20%"
    },
    {
      name: "The Whale",
      monthlyPrice: "$24.95",
      yearlyPrice: "$239.52",
      period: isYearly ? "year" : "month",
      features: [
        "All 'True Fan' benefits",
        "Priority Access to Experimental Models",
        "God-Tier Memory (16k+ Context)",
        "Monthly Bonus Credits"
      ],
      popular: false,
      savings: "Save 20%"
    }
  ];

  return (
    <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-[#121212]">
      <div className="max-w-7xl mx-auto">
        {/* Section Headline */}
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Choose Your Reality
          </h2>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {pricingTiers.map((tier, index) => {
            const buttonConfig = getButtonConfig(tier.name);
            
            return (
              <div
                key={index}
                className={`relative ${
                  tier.popular 
                    ? "md:scale-105 md:-translate-y-4" 
                    : ""
                }`}
              >
                {/* Most Popular Badge */}
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                    <Badge className="bg-[#FF7A00] text-white px-4 py-1 text-sm font-bold">
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Savings Badge */}
                {isYearly && tier.savings && (
                  <div className="absolute -top-3 right-4 z-10">
                    <Badge className="bg-green-600 text-white px-3 py-1 text-xs font-bold">
                      {tier.savings}
                    </Badge>
                  </div>
                )}

                {/* Pricing Card */}
                <Card 
                  className={`h-full bg-[#1a1a2e] border-2 transition-all duration-300 hover:shadow-xl ${
                    tier.popular 
                      ? "border-[#FF7A00] shadow-[0_0_20px_rgba(255,122,0,0.3)]" 
                      : "border-gray-700/50 hover:border-[#FF7A00]/50"
                  }`}
                >
                  <CardHeader className="text-center pb-4">
                    {/* Tier Name */}
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                      {tier.name}
                    </h3>
                    
                    {/* Price */}
                    <div className="mb-4">
                      <span className="text-4xl sm:text-5xl font-bold text-[#FF7A00]">
                        {isYearly ? tier.yearlyPrice : tier.monthlyPrice}
                      </span>
                      <span className="text-lg text-gray-400 ml-2">
                        / {tier.period}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="px-6 pb-6">
                    {/* Features List */}
                    <ul className="space-y-3">
                      {tier.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-start">
                          <Check className="w-5 h-5 text-[#FF7A00] mr-3 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-300 text-sm sm:text-base leading-relaxed">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="px-6 pb-6">
                    {/* CTA Button */}
                    {!user ? (
                      <a href="/auth?mode=signup" className="w-full">
                        <Button
                          variant="default"
                          size="lg"
                          className="w-full py-3 sm:py-4 text-base sm:text-lg font-bold transition-all duration-300 min-h-[44px] bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white shadow-lg hover:shadow-[#FF7A00]/25 hover:scale-105"
                        >
                          Create an Account
                        </Button>
                      </a>
                    ) : (
                      <Button
                        variant={buttonConfig.variant}
                        size="lg"
                        disabled={buttonConfig.disabled}
                        className={`w-full py-3 sm:py-4 text-base sm:text-lg font-bold transition-all duration-300 min-h-[44px] ${
                          buttonConfig.variant === "outline"
                            ? buttonConfig.disabled
                              ? "border-gray-500 text-gray-500 cursor-not-allowed"
                              : "border-[#FF7A00] text-[#FF7A00] hover:bg-[#FF7A00] hover:text-white"
                            : buttonConfig.disabled
                              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                              : "bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white shadow-lg hover:shadow-[#FF7A00]/25 hover:scale-105"
                        }`}
                      >
                        {buttonConfig.text}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Additional Trust Text */}
        <div className="text-center mt-8 sm:mt-12">
          <p className="text-sm sm:text-base text-gray-400">
            ✓ Cancel anytime ✓ No hidden fees ✓ 14-day money-back guarantee
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingTiers;
