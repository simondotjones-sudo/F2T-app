export type ReportingAccess = {
  scope: 'organisation' | 'country' | 'site' | 'unit';
  unitIds?: string[];
  country: string | null;
  siteId: string | null;
};
