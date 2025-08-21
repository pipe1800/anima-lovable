import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Auth as AuthQueries } from '@/data';
import HeroSection from "@/components/HeroSection";
import ValueProposition from "@/components/ValueProposition";
import { LandingSubscriptionPlans } from "@/components/landing/LandingSubscriptionPlans";
import CustomerTestimonial from "@/components/CustomerTestimonial";
import FAQ from "@/components/FAQ";
import ClosingSection from "@/components/ClosingSection";
import Footer from "@/components/Footer";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthStatus = async () => {
      const { data: { session } } = await AuthQueries.getSession();
      
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
      <LandingSubscriptionPlans />
      <CustomerTestimonial />
      <FAQ />
      <ClosingSection />
      <Footer />
    </div>
  );
};

export default Index;
