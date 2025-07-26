import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Share2, Flag, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TopBar } from '@/components/ui/TopBar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  getPublicProfile, 
  getPrivateProfile,
  getUserActiveSubscription,
  updateProfile
} from '@/lib/supabase-queries';
import { ProfileHeader } from './NewProfileHeader';
import { StatsBar } from './StatsBar';
import { AccountSettings } from '@/components/settings/categories/AccountSettings';
import { BillingSettings } from '@/components/settings/categories/BillingSettings';
import { supabase } from '@/integrations/supabase/client';

// Consolidated data fetching hook
const useUserProfileData = (userId: string, isOwnProfile: boolean) => {
  return useQuery({
    queryKey: ['user-profile-complete', userId],
    queryFn: async () => {
      // Use private profile for own profile, public for others
      const profileQuery = isOwnProfile ? getPrivateProfile(userId) : getPublicProfile(userId);
      
      // Parallel fetch profile data and subscription
      const [profileResult, subscriptionResult, chatCountResult] = await Promise.allSettled([
        profileQuery,
        getUserActiveSubscription(userId),
        supabase
          .from('chats')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
      ]);

      const profile = profileResult.status === 'fulfilled' ? profileResult.value.data : null;
      const subscription = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value.data : null;
      const chatCount = chatCountResult.status === 'fulfilled' ? chatCountResult.value.count : 0;

      // Get additional stats in parallel
      const [charactersCount, favoritesCount, personasCount] = await Promise.allSettled([
        supabase.from('characters').select('id', { count: 'exact', head: true }).eq('creator_id', userId),
        supabase.from('character_favorites').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        isOwnProfile ? supabase.from('personas').select('id', { count: 'exact', head: true }).eq('user_id', userId) : Promise.resolve({ count: 0 })
      ]);

      return {
        profile,
        subscription,
        stats: {
          totalChats: chatCount || 0,
          totalCharacters: charactersCount.status === 'fulfilled' ? charactersCount.value.count || 0 : 0,
          totalFavorites: favoritesCount.status === 'fulfilled' ? favoritesCount.value.count || 0 : 0,
          totalPersonas: personasCount.status === 'fulfilled' ? personasCount.value.count || 0 : 0,
          memberSince: (profile && typeof profile === 'object' && 'created_at' in profile) ? profile.created_at : new Date().toISOString()
        }
      };
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const NewProfileView = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('account');
  const [isEditing, setIsEditing] = useState(false);

  const isOwnProfile = !userId || user?.id === userId;
  const profileUserId = userId || user?.id;

  // For public profile access, don't redirect to auth if no user is logged in
  const shouldRedirectToAuth = !profileUserId && !userId;

  const { data, isLoading, error } = useUserProfileData(profileUserId!, isOwnProfile);

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      if (!profileUserId) throw new Error('No user ID');
      const updates = { [field]: value };
      return await updateProfile(profileUserId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile-complete', profileUserId] });
      toast({
        title: "Profile updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  });

  if (shouldRedirectToAuth) {
    navigate('/auth');
    return null;
  }

  if (!profileUserId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">User not found</p>
            <Button onClick={() => navigate('/')} className="mt-4">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive">Failed to load profile</p>
            <Button onClick={() => navigate(-1)} className="mt-4">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleShare = () => {
    const url = `${window.location.origin}/user/${profileUserId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Profile link copied!",
      description: "Share this link with others to show your profile.",
    });
  };

  const handleProfileUpdate = async (field: string, value: string) => {
    await updateProfileMutation.mutateAsync({ field, value });
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={isOwnProfile ? "My Profile" : `${(data?.profile && 'username' in data.profile) ? data.profile.username : 'User'}'s Profile`}
        rightContent={
          <div className="flex items-center gap-2">
            <Button
              onClick={handleShare}
              variant="ghost"
              size="sm"
            >
              <Share2 className="w-4 h-4" />
            </Button>
            {!isOwnProfile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Flag className="w-4 h-4 mr-2" />
                    Report User
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Profile Header with Banner */}
        <Card>
          {isLoading ? (
            <div className="relative">
              <Skeleton className="h-48 md:h-64 w-full rounded-t-lg" />
              <div className="relative px-6 pb-6 -mt-16">
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                  <Skeleton className="w-32 h-32 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <ProfileHeader
              profile={data?.profile}
              subscription={data?.subscription}
              isOwnProfile={isOwnProfile}
              isEditing={isEditing}
              onEditToggle={() => setIsEditing(!isEditing)}
              onProfileUpdate={handleProfileUpdate}
            />
          )}
        </Card>

        {/* Stats Bar */}
        {data?.stats && (
          <StatsBar stats={data.stats} />
        )}

        {/* Settings Tabs - Only for Own Profile */}
        {isOwnProfile && (
          <Card>
            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="account">
                    Account & Security
                  </TabsTrigger>
                  <TabsTrigger value="billing">
                    Subscription & Billing
                  </TabsTrigger>
                  {/* Removed Notifications tab */}
                </TabsList>

                <TabsContent value="account" className="space-y-6">
                  <AccountSettings />
                </TabsContent>

                <TabsContent value="billing" className="space-y-6">
                  <BillingSettings />
                </TabsContent>

                {/* Removed Notifications TabsContent */}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Public Profile Message */}
        {!isOwnProfile && (
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="text-lg font-semibold mb-2">Public Profile</h3>
              <p className="text-muted-foreground">
                This is {(data?.profile && 'username' in data.profile) ? data.profile.username : 'this user'}'s public profile. 
                Account settings and personal information are private.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
