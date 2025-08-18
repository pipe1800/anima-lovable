import React from 'react';
import { DiscoverContent } from '@/components/discover/DiscoverContent';

// Consolidated: PublicDiscover now delegates to DiscoverContent to avoid duplicate logic.
const PublicDiscover = () => <DiscoverContent />;
export default PublicDiscover;