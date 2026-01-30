import React from 'react';
import {
  HomeIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  AcademicCapIcon,
  BookOpenIcon,
  BookmarkIcon,
  CalendarIcon,
  UsersIcon,
  ClipboardIcon,
  ArrowUpTrayIcon,
  ComputerDesktopIcon,
  CheckCircleIcon,
  BellIcon
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeSolidIcon,
  ClipboardDocumentCheckIcon as ClipboardSolidIcon,
  UserGroupIcon as UserGroupSolidIcon,
  ChartBarIcon as ChartBarSolidIcon,
  ShieldCheckIcon as ShieldCheckSolidIcon,
  AcademicCapIcon as AcademicCapSolidIcon,
  BookOpenIcon as BookOpenSolidIcon,
  BookmarkIcon as BookmarkSolidIcon,
  CalendarIcon as CalendarSolidIcon,
  UsersIcon as UsersSolidIcon,
  ClipboardIcon as ClipboardSolidIcon2,
  ArrowUpTrayIcon as ArrowUpTraySolidIcon,
  ComputerDesktopIcon as ComputerDesktopSolidIcon,
  CheckCircleIcon as CheckCircleSolidIcon,
  BellIcon as BellSolidIcon
} from '@heroicons/react/24/solid';
import { UserRole } from '@prisma/client';

export interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  solidIcon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  badge?: number;
}

export const navigationItems: NavigationItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: HomeIcon,
    solidIcon: HomeSolidIcon,
    roles: ['ADMIN', 'COORDINATOR', 'LECTURER', 'CLASS_REP', 'SUPERVISOR', 'ONLINE_SUPERVISOR']
  },
  {
    name: 'Notifications',
    href: '/dashboard/notifications/preferences',
    icon: BellIcon,
    solidIcon: BellSolidIcon,
    roles: ['ADMIN', 'LECTURER', 'SUPERVISOR', 'ONLINE_SUPERVISOR', 'COORDINATOR']
  },
  {
    name: 'Verify Classes',
    href: '/dashboard/supervisor',
    icon: ClipboardDocumentCheckIcon,
    solidIcon: ClipboardSolidIcon,
    roles: ['SUPERVISOR']
  },
  {
    name: 'Online Monitor',
    href: '/dashboard/online-supervisor',
    icon: ComputerDesktopIcon,
    solidIcon: ComputerDesktopSolidIcon,
    roles: ['ONLINE_SUPERVISOR']
  },
  {
    name: 'Admin',
    href: '/dashboard/admin',
    icon: ShieldCheckIcon,
    solidIcon: ShieldCheckSolidIcon,
    roles: ['ADMIN']
  },
  {
    name: 'Coordinator',
    href: '/dashboard/coordinator',
    icon: AcademicCapIcon,
    solidIcon: AcademicCapSolidIcon,
    roles: ['COORDINATOR']
  },
  {
    name: 'Users',
    href: '/dashboard/users',
    icon: UsersIcon,
    solidIcon: UsersSolidIcon,
    roles: ['ADMIN']
  },
  {
    name: 'Programmes',
    href: '/dashboard/programmes',
    icon: BookOpenIcon,
    solidIcon: BookOpenSolidIcon,
    roles: ['ADMIN']
  },
  {
    name: 'Courses',
    href: '/dashboard/courses',
    icon: BookmarkIcon,
    solidIcon: BookmarkSolidIcon,
    roles: ['ADMIN', 'COORDINATOR']
  },
  {
    name: 'Schedules',
    href: '/dashboard/schedules',
    icon: CalendarIcon,
    solidIcon: CalendarSolidIcon,
    roles: ['ADMIN', 'LECTURER']
  },
  {
    name: 'Lecturers',
    href: '/dashboard/lecturers',
    icon: UserGroupIcon,
    solidIcon: UserGroupSolidIcon,
    roles: ['COORDINATOR']
  },
  {
    name: 'Attendance',
    href: '/dashboard/attendance',
    icon: ClipboardIcon,
    solidIcon: ClipboardSolidIcon2,
    roles: ['ADMIN', 'COORDINATOR', 'LECTURER', 'CLASS_REP']
  },
  {
    name: 'Reports',
    href: '/dashboard/reports',
    icon: ChartBarIcon,
    solidIcon: ChartBarSolidIcon,
    roles: ['ADMIN', 'COORDINATOR']
  },
  {
    name: 'Import Data',
    href: '/dashboard/import',
    icon: ArrowUpTrayIcon,
    solidIcon: ArrowUpTraySolidIcon,
    roles: ['ADMIN']
  }
];
