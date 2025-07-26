
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NSFWProvider } from "@/contexts/NSFWContext";
import { TutorialProvider } from "@/contexts/TutorialContext";
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
import WorldInfo from "./pages/WorldInfo";
import WorldInfoEditor from "./pages/WorldInfoEditor";
import ImprovedWorldInfoList from "./components/world-info/ImprovedWorldInfoList";
import { EnhancedWorldInfoList } from "./components/world-info/EnhancedWorldInfoList";
import ImprovedWorldInfoPage from "./components/world-info/ImprovedWorldInfoPage";
import UnifiedWorldInfoEditor from "./components/world-info/UnifiedWorldInfoEditor";
import UnifiedWorldInfoEditorWrapper from "./components/world-info/UnifiedWorldInfoEditorWrapper";
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
import { PayPalVerification } from "./components/PayPalVerification";
import { UpgradeVerification as ComponentUpgradeVerification } from "./components/UpgradeVerification";
import { UpgradeCallback } from "./pages/UpgradeCallback";
import UpgradeVerification from "./pages/UpgradeVerification";
import CreditPurchaseVerification from "./pages/CreditPurchaseVerification";
import DialogueTestPage from "./pages/DialogueTestPage";

const App = () => (
  <AuthProvider>
    <NSFWProvider>
      <TutorialProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/characters" element={<PublicDiscover />} />
          <Route path="/characters/:characterId" element={<PublicCharacterProfile />} />
          <Route path="/user/:userId" element={<UserProfile />} />
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
          <Route path="/discover" element={
            <OnboardingGuard requireOnboardingComplete={true}>
              <AuthenticatedLayout>
                <Discover />
              </AuthenticatedLayout>
            </OnboardingGuard>
          } />
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
                <ImprovedWorldInfoPage />
              </AuthenticatedLayout>
            </OnboardingGuard>
          } />
          <Route path="/world-info/create" element={
            <OnboardingGuard requireOnboardingComplete={true}>
              <AuthenticatedLayout>
                <UnifiedWorldInfoEditor mode="create" />
              </AuthenticatedLayout>
            </OnboardingGuard>
          } />
          <Route path="/world-info/:id/edit" element={
            <OnboardingGuard requireOnboardingComplete={true}>
              <AuthenticatedLayout>
                <UnifiedWorldInfoEditorWrapper />
              </AuthenticatedLayout>
            </OnboardingGuard>
          } />
          <Route path="/world-info-editor" element={
            <OnboardingGuard requireOnboardingComplete={true}>
              <AuthenticatedLayout>
                <WorldInfoEditor />
              </AuthenticatedLayout>
            </OnboardingGuard>
          } />
          <Route path="/world-info-editor/:id" element={
            <OnboardingGuard requireOnboardingComplete={true}>
              <AuthenticatedLayout>
                <WorldInfoEditor />
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
    </TutorialProvider>
    </NSFWProvider>
  </AuthProvider>
);

export default App;
