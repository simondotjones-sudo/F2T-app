'use client';
import {DEFAULT_BRAND} from '@/lib/tenant-types';
import {BrandLogo} from '@/components/branding-provider';
import ProfileMenu from '@/components/profile-menu';
import {useLanguage} from '@/components/language-provider';
import type { ProfileView } from '@/lib/profile';

export default function PageHeader({ title, view }: { title: string; view: ProfileView }) {
  const {t}=useLanguage();
  return <header className="topbar page-topbar">
    <div className="topbar-brand">
      <a href="/" className="brand">{(view==='clients'||view==='catalogue'||view==='operators')?<img className="client-logo" src={DEFAULT_BRAND.logo_url} alt={'Fit2Trade'} width={190} height={46}/>:<BrandLogo/>}</a>
      <h1 className="topbar-title">{t(title)}</h1>
    </div>
    <div className="top-controls"><ProfileMenu view={view}/></div>
  </header>;
}
