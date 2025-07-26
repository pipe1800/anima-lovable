import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Calendar, Clock, Plus, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useProfile';

export const ProfileHeader = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useCurrentUser();
  
  const isOwnProfile = true; // This would come from auth context in real app

  if (loading) {
    return (
      <div className="relative min-h-[400px] bg-gradient-to-br from-purple-900/20 to-blue-900/20 animate-pulse">
        <div className="absolute inset-0 bg-black/50" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="relative min-h-[400px] bg-gradient-to-br from-purple-900/20 to-blue-900/20">
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <p className="text-white">Profile not found</p>
        </div>
      </div>
    );
  }

  const subscription = null; // This would come from a subscription hook

  return (
    <div className="relative">
      {/* Banner Section */}
      <div className="relative min-h-[400px] bg-gradient-to-br from-purple-900/20 to-blue-900/20 overflow-hidden">
        {/* Banner Background */}
        {profile.banner_url && (
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${profile.banner_url})` }}
          />
        )}
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/50" />
        
        {/* Content */}
        <div className="relative z-10 container mx-auto px-4 py-8 h-full min-h-[400px] flex flex-col justify-end">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
            {/* Avatar */}
            <div className="flex-shrink-0 relative">
              <Avatar className="w-32 h-32 border-4 border-white/20 shadow-2xl">
                <AvatarImage src={profile.avatar_url} alt={profile.username} />
                <AvatarFallback className="text-3xl">
                  {profile.username?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Profile Info */}
            <div className="flex-grow min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <h1 className="text-4xl font-bold text-white truncate">
                  {profile.username}
                </h1>
                {subscription?.plan_name && (
                  <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-semibold">
                    <Shield className="w-4 h-4 mr-1" />
                    {subscription.plan_name}
                  </Badge>
                )}
              </div>

              {profile.bio && (
                <p className="text-gray-200 text-lg mb-4 max-w-2xl">
                  {profile.bio}
                </p>
              )}

              <div className="flex flex-wrap gap-6 text-sm text-gray-300">
                <span className="flex items-center gap-1">
                  <Plus className="h-4 w-4 text-[#FF7A00]" />
                  25 Characters Created
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4 text-[#FF7A00]" />
                  1.2K Messages Sent
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Joined {format(new Date(profile.created_at), 'MMMM yyyy')}
                </span>
                {profile?.timezone && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {profile.timezone}
                  </span>
                )}
              </div>
            </div>

            {/* Remove Edit Button - Profile is now read-only */}
          </div>
        </div>
      </div>

      {/* Profile Actions */}
      <div className="bg-[#1a1a2e]/80 backdrop-blur-sm border-b border-gray-700/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex-shrink-0">
            {isOwnProfile ? (
              <Button 
                variant="secondary" 
                className="bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                onClick={() => navigate('/profile/settings')}
              >
                Settings
              </Button>
            ) : (
              <Button className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium px-8">
                Follow
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
