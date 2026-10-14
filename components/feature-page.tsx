import type {ReactNode} from 'react';
import {redirect} from 'next/navigation';
import {featureEnabled} from '@/lib/features';
import type {FeatureId} from '@/lib/feature-catalogue';
import {FeatureBoundary} from '@/components/feature-boundary';

export default async function FeaturePage({feature,children}:{feature:FeatureId;children:ReactNode}) {
 if(!await featureEnabled(feature))redirect('/?featureUnavailable=1');
 return <FeatureBoundary feature={feature}>{children}</FeatureBoundary>;
}
