import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryConfigs } from '@/queries/chatQueries';

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export const AuthenticatedLayout = ({ children }: AuthenticatedLayoutProps) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (user?.id) {
      qc.prefetchQuery(queryConfigs.userCredits(user.id));
      // Remove improper undefined prefetch for global settings
    }
  }, [user?.id, qc]);

  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  );
};