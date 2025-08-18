import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NSFWProvider } from "@/contexts/NSFWContext";
import OnboardingGuard from "@/components/auth/OnboardingGuard";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import EmailConfirmation from "./pages/EmailConfirmation";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Discover from "./pages/Discover";
import Chat from "./pages/Chat";
import CharacterCreator from "./pages/CharacterCreator";
import TestTags from "./pages/TestTags";
import WorldInfoPage from "./components/world-info/WorldInfoPage";
import WorldInfoEditor from "./components/world-info/WorldInfoEditor";
import WorldInfoEditorWrapper from "./components/world-info/WorldInfoEditorWrapper";
import UserProfile from "./pages/UserProfile";
import Subscription from "./pages/Subscription";
import Settings from "./pages/Settings";
import Moderation from "./pages/Moderation";
import CommunityGuidelines from "./pages/CommunityGuidelines";
import CharacterProfile from "./pages/CharacterProfile";
import PublicDiscover from "./pages/PublicDiscover";
import PublicCharacterProfile from "./pages/PublicCharacterProfile";
import PublicWorldInfoProfile from "./pages/PublicWorldInfoProfile";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import { PayPalVerification } from "./components/PayPalVerification";
import { UpgradeVerification as ComponentUpgradeVerification } from "./components/UpgradeVerification";
import { UpgradeCallback } from "./pages/UpgradeCallback";
import UpgradeVerification from "./pages/UpgradeVerification";
import CreditPurchaseVerification from "./pages/CreditPurchaseVerification";
import DialogueTestPage from "./pages/DialogueTestPage";
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/chatQueries';
import { getPublicProfile, getUserActiveSubscription, getUserFavorites, getUserCharacters } from '@/lib/supabase-queries';
import { getUserPersonas } from '@/lib/persona-operations';
import { getUserSnapshot, seedUserSnapshot } from '@/lib/snapshots';

const PostAuthPrefetch = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      const id = user.id;
      const snap = await getUserSnapshot(id);
      if (snap) seedUserSnapshot(qc, id, snap);
      // TODO world info snapshot prefetch optional
    };
    run();
  }, [user?.id, qc]);
  return null;
};

const App = () => (
  <AuthProvider>
    <NSFWProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <PostAuthPrefetch />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/characters" element={<PublicDiscover />} />
            <Route path="/characters/:characterId" element={<PublicCharacterProfile />} />
            <Route path="/user/:userId" element={<UserProfile />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfUse />} />
            <Route path="/world-info-view/:id" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <PublicWorldInfoProfile />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/auth" element={<Auth />} />
            <Route path="/email-confirmation" element={<EmailConfirmation />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={
              <OnboardingGuard>
                <Onboarding />
              </OnboardingGuard>
            } />
            <Route path="/dashboard" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <Dashboard />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/discover" element={<Navigate to="/characters" replace />} />
            <Route path="/chat" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <Chat />
              </OnboardingGuard>
            } />
            <Route path="/chat/:characterId" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <Chat />
              </OnboardingGuard>
            } />
            <Route path="/chat/:characterId/:chatId" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <Chat />
              </OnboardingGuard>
            } />
            <Route path="/character-creator" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <CharacterCreator />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/test-tags" element={<TestTags />} />
            <Route path="/dialogue-test" element={<DialogueTestPage />} />
            <Route path="/world-info" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <WorldInfoPage />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/world-info/create" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <WorldInfoEditor mode="create" />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/world-info/:id/edit" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <WorldInfoEditorWrapper />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/profile/*" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <UserProfile />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/subscription" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <Subscription />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/settings" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <Settings />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/moderation" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <Moderation />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/guidelines" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <CommunityGuidelines />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/character/:characterId" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <CharacterProfile />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/paypal-verification" element={<PayPalVerification />} />
            <Route path="/upgrade-verification" element={<UpgradeVerification />} />
            <Route path="/credit-purchase-verification" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <CreditPurchaseVerification />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="/upgrade-callback" element={
              <OnboardingGuard requireOnboardingComplete={true}>
                <AuthenticatedLayout>
                  <UpgradeCallback />
                </AuthenticatedLayout>
              </OnboardingGuard>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </NSFWProvider>
  </AuthProvider>
);

export default App;
