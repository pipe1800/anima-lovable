import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export const AuthenticatedLayout = ({ children }: AuthenticatedLayoutProps) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (user?.id) {
      // credits now from snapshot; no prefetch
    }
  }, [user?.id, qc]);

  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  );
};