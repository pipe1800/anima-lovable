import { useAuth } from '@/contexts/AuthContext';
import HeroSection from "@/components/HeroSection";
import ValueProposition from "@/components/ValueProposition";
import { LandingSubscriptionPlans } from "@/components/landing/LandingSubscriptionPlans";
import CustomerTestimonial from "@/components/CustomerTestimonial";
import FAQ from "@/components/FAQ";
import ClosingSection from "@/components/ClosingSection";
import Footer from "@/components/Footer";
import { Navigate } from 'react-router-dom';

const Index = () => {
  const { user, profile, loading, profileReady } = useAuth();

  const Splash = (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <img src="/assets/logo_emblem.png" alt="ANIMA" className="w-[300px] h-[300px] object-contain" />
    </div>
  );

  // Show splash while auth session resolving OR waiting for initial profile attempt when user exists
  if (loading || (user && !profileReady)) return Splash;

  if (user) {
    if (profile?.onboarding_completed) return <Navigate to="/dashboard" replace />;
    return <Navigate to="/onboarding" replace />;
  }

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
