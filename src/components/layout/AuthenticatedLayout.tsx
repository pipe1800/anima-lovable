import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export const AuthenticatedLayout = ({ children }: AuthenticatedLayoutProps) => {
  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  );
};