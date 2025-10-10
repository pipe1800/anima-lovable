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
import { Profile as ProfileQueries, Billing } from '@/data';
import { supabase } from '@/db/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserDashboardOverview } from '@/data/dashboard/queries';
import { AccountSettings } from '@/components/settings/categories/AccountSettings';
import BillingSettings from '@/components/settings/categories/BillingSettings';
import { ProfileHeader } from '@/components/profile/NewProfileHeader';
import { StatsBar } from '@/components/profile/StatsBar';
import type { ProfileOverview } from '@/components/profile/NewProfileHeader';
import type { SupabaseDatabaseClient } from '@/db/rpc';
import type { Database } from '@/integrations/supabase/types';

interface SubscriptionDetails {
  planName: string | null;
}

interface ProfileStatsCounts {
  chats: number;
  characters: number;
  favorites: number;
  personas: number;
}

interface ProfileStatsSummary {
  totalChats: number;
  totalCharacters: number;
  totalFavorites: number;
  totalPersonas: number;
  memberSince: string;
}

interface ProfileQueryResult {
  profile: ProfileOverview | null;
  subscription: SubscriptionDetails | null;
  stats: ProfileStatsSummary;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toProfileOverview = (value: unknown): ProfileOverview | null => {
  if (!isRecord(value)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    username: typeof value.username === 'string' ? value.username : null,
    avatar_url: typeof value.avatar_url === 'string' ? value.avatar_url : null,
    banner_url: typeof value.banner_url === 'string' ? value.banner_url : null,
    bio: typeof value.bio === 'string' ? value.bio : null,
    created_at: typeof value.created_at === 'string' ? value.created_at : null,
    timezone: typeof value.timezone === 'string' ? value.timezone : null,
  };
};

const normalizeCounts = (value: unknown): ProfileStatsCounts => {
  if (!isRecord(value)) {
    return { chats: 0, characters: 0, favorites: 0, personas: 0 };
  }
  return {
    chats: typeof value.chats === 'number' ? value.chats : 0,
    characters: typeof value.characters === 'number' ? value.characters : 0,
    favorites: typeof value.favorites === 'number' ? value.favorites : 0,
    personas: typeof value.personas === 'number' ? value.personas : 0,
  };
};

const extractMemberSince = (profile: ProfileOverview | null): string =>
  profile?.created_at ?? new Date().toISOString();

const extractSubscriptionDetails = (value: unknown): SubscriptionDetails | null => {
  if (!isRecord(value)) return null;
  const plan = value.plan;
  if (!isRecord(plan)) {
    return { planName: null };
  }
  return { planName: typeof plan.name === 'string' ? plan.name : null };
};

const normalizePublicProfileOverview = (value: unknown) => {
  if (!isRecord(value)) {
    return { profile: null, counts: normalizeCounts(null) };
  }
  return {
    profile: toProfileOverview(value.profile ?? null),
    counts: normalizeCounts(value.counts ?? null),
  };
};

// Consolidated data fetching hook for profile + stats
const useUserProfileData = (userId: string | null, isOwnProfile: boolean, subscriptionFromContext: unknown) => {
  return useQuery<ProfileQueryResult>({
    queryKey: ['user-profile-complete', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required to fetch profile data');
      }

      if (isOwnProfile) {
        const supabaseDatabaseClient = supabase as SupabaseDatabaseClient;
  const supabasePublicClient = supabase as SupabaseClient<Database, '__InternalSupabase'>;
        const subscriptionPromise: Promise<{ data: unknown; error: unknown }> =
          subscriptionFromContext !== null && subscriptionFromContext !== undefined
            ? Promise.resolve({ data: subscriptionFromContext, error: null })
            : Billing.getUserSubscription(supabaseDatabaseClient, userId).then(({ data, error }) => ({ data, error }));

        const [profileRes, overviewRes, subscriptionRes] = await Promise.all([
          ProfileQueries.getPrivateProfile(userId),
          getUserDashboardOverview(supabasePublicClient, userId),
          subscriptionPromise,
        ]);

        if (profileRes.error) throw profileRes.error;
        if (overviewRes.error) throw overviewRes.error;
        if (subscriptionRes.error) throw subscriptionRes.error;

        const profile = toProfileOverview(profileRes.data ?? null);
        const counts = normalizeCounts(overviewRes.data?.counts);
        const subscriptionDetails = extractSubscriptionDetails(subscriptionRes.data ?? null);

        return {
          profile,
          subscription: subscriptionDetails,
          stats: {
            totalChats: counts.chats,
            totalCharacters: counts.characters,
            totalFavorites: counts.favorites,
            totalPersonas: counts.personas,
            memberSince: extractMemberSince(profile),
          },
        };
      }

      const { data, error } = await ProfileQueries.getPublicProfileOverview(userId);
      if (error) throw error;
      const overview = normalizePublicProfileOverview(data);

      return {
        profile: overview.profile,
        subscription: null,
        stats: {
          totalChats: overview.counts.chats,
          totalCharacters: overview.counts.characters,
          totalFavorites: overview.counts.favorites,
          totalPersonas: overview.counts.personas,
          memberSince: extractMemberSince(overview.profile),
        },
      };
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
  });
};

export const NewProfileView = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, subscription } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('account');
  const [isEditing, setIsEditing] = useState(false);

  const isOwnProfile = !userId || user?.id === userId;
  const profileUserId = userId || user?.id;

  // For public profile access, don't redirect to auth if no user is logged in
  const shouldRedirectToAuth = !profileUserId && !userId;

  const { data, isLoading, error } = useUserProfileData(profileUserId ?? null, isOwnProfile, subscription);

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      if (!profileUserId) throw new Error('No user ID');
      const updates = { [field]: value };
      return await ProfileQueries.updateProfile(profileUserId, updates);
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

  const profileUsername = data?.profile?.username ?? 'User';

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={isOwnProfile ? "My Profile" : `${profileUsername}'s Profile`}
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
              profile={data?.profile ?? null}
              subscriptionPlanName={data?.subscription?.planName ?? null}
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
                This is {profileUsername}'s public profile. 
                Account settings and personal information are private.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
