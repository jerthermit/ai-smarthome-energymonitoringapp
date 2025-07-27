import { 
  Bolt,
  Calendar as CalendarIcon,
  CalendarDays as CalendarDaysIcon,
  CalendarRange as CalendarRangeIcon,
  AlertTriangle,
  RefreshCw,
  Cloud,
  DollarSign,
  LineChart,
  TrendingUp,
  TrendingDown,
  Gauge,
  BarChart2,
  User,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react';

// Export all icons with their original names
export const Icons = {
  // Navigation
  dashboard: Gauge,
  devices: Bolt,
  analytics: BarChart2,
  
  // User menu
  user: User,
  settings: Settings,
  logout: LogOut,
  
  // Used in Dashboard.tsx
  calendar: CalendarIcon,
  calendarDays: CalendarDaysIcon,
  calendarRange: CalendarRangeIcon,
  alertTriangle: AlertTriangle,
  refreshCw: RefreshCw,
  
  // Used in StatCard
  bolt: Bolt,
  lineChart: LineChart,
  dollarSign: DollarSign,
  cloud: Cloud,
  trendingUp: TrendingUp,
  trendingDown: TrendingDown,
} as const;

export type IconName = keyof typeof Icons;

export { type LucideIcon };
