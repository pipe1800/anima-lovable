import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '@/contexts/AuthContext';
import HeroSection from "@/components/HeroSection";
import ValueProposition from "@/components/ValueProposition";
import { LandingSubscriptionPlans } from "@/components/landing/LandingSubscriptionPlans";
import CustomerTestimonial from "@/components/CustomerTestimonial";
import FAQ from "@/components/FAQ";
import ClosingSection from "@/components/ClosingSection";
import Footer from "@/components/Footer";

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const isOnboardingCompleted = user.user_metadata?.onboarding_completed;
    navigate(isOnboardingCompleted ? '/discover' : '/onboarding');
  }, [user, navigate]);

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
