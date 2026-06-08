import { GitCommit, FileText, Bell, Shield, type LucideIcon } from 'lucide-react';

import templatesData from './templates.json';

const ICON_MAP: Record<string, LucideIcon> = {
  GitCommit,
  FileText,
  Bell,
  Shield,
};

export const TEMPLATES = templatesData.map((t) => ({
  ...t,
  icon: ICON_MAP[t.icon as string] ?? Bell,
}));

export type Template = (typeof TEMPLATES)[number];
