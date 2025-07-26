
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import HeroSection from "@/components/HeroSection";
import ValueProposition from "@/components/ValueProposition";
import PricingTiers from "@/components/PricingTiers";
import CustomerTestimonial from "@/components/CustomerTestimonial";
import FAQ from "@/components/FAQ";
import ClosingSection from "@/components/ClosingSection";
import Footer from "@/components/Footer";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const isOnboardingCompleted = session.user.user_metadata?.onboarding_completed;
        
        if (isOnboardingCompleted) {
          navigate('/discover');
        } else {
          navigate('/onboarding');
        }
      }
    };

    checkAuthStatus();
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <HeroSection />
      <ValueProposition />
      <PricingTiers />
      <CustomerTestimonial />
      <FAQ />
      <ClosingSection />
      <Footer />
    </div>
  );
};

export default Index;
