import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronRight,
  LogOut,
  Settings,
  SlidersHorizontal,
  User,
  UserPlus,
  Video,
  ClipboardList,
  PanelsTopLeft,
} from 'lucide-react';

type TopBarProps = {
  onOpenFilter: () => void;
  onSignOut: () => void;
  onOpenCreateUser: () => void;
  onOpenDeleteLogs: () => void;
  onOpenManageStageCategories: () => void;
  displayName: string;
  subtitle: string;
};

export function TopBar({
  onOpenFilter,
  onSignOut,
  onOpenCreateUser,
  onOpenDeleteLogs,
  onOpenManageStageCategories,
  displayName,
  subtitle,
}: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hasNotif, setHasNotif] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="flex h-auto shrink-0 items-center justify-between border-b-2 border-gray-100 bg-white px-3 py-2 sm:h-14 sm:px-4 sm:py-0 lg:px-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-violet-600 shadow-md shadow-blue-200">
            <Video className="h-4 w-4 text-white" />
          </div>
          <span className="truncate text-sm font-bold tracking-tight text-gray-800">
            IE Video CT
          </span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1">
        <button
          onClick={onOpenFilter}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 lg:px-3"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filter</span>
        </button>

        <button
          onClick={() => setHasNotif(false)}
          className="relative rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          <Bell className="h-4 w-4" />
          {hasNotif ? (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
          ) : null}
        </button>

        <div className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-gray-100 sm:px-2"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-violet-600 text-xs font-bold text-white shadow">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden flex-col items-start sm:flex">
              <span className="text-xs leading-tight font-semibold text-gray-700">{displayName}</span>
              <span className="text-[10px] leading-tight text-gray-400">{subtitle}</span>
            </div>
            <ChevronRight
              className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${
                dropdownOpen ? 'rotate-90' : ''
              }`}
            />
          </button>

          {dropdownOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-gray-100 bg-white py-1.5 shadow-lg shadow-gray-200/80">
              <div className="mb-1 border-b border-gray-100 px-3 py-2">
                <p className="text-xs font-semibold text-gray-700">{displayName}</p>
                <p className="text-[10px] text-gray-400">{subtitle}</p>
              </div>

              {[
                { icon: User, label: 'Profile', desc: 'View your profile' },
                { icon: Settings, label: 'Settings', desc: 'App preferences' },
              ].map(({ icon: Icon, label, desc }) => (
                <button
                  key={label}
                  className="w-full px-3 py-2 text-left transition hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                      <Icon className="h-3.5 w-3.5 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-700">{label}</p>
                      <p className="text-[10px] text-gray-400">{desc}</p>
                    </div>
                  </div>
                </button>
              ))}

              <button
                onClick={onOpenCreateUser}
                className="w-full px-3 py-2 text-left transition hover:bg-blue-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <UserPlus className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">Create user</p>
                    <p className="text-[10px] text-slate-400">Add a login account</p>
                  </div>
                </div>
              </button>

              <button
                onClick={onOpenDeleteLogs}
                className="w-full px-3 py-2 text-left transition hover:bg-amber-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                    <ClipboardList className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">Delete logs</p>
                    <p className="text-[10px] text-slate-400">View deleted data history</p>
                  </div>
                </div>
              </button>

              <button
                onClick={onOpenManageStageCategories}
                className="w-full px-3 py-2 text-left transition hover:bg-violet-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                    <PanelsTopLeft className="h-3.5 w-3.5 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">Stage categories</p>
                    <p className="text-[10px] text-slate-400">Manage StageList tabs</p>
                  </div>
                </div>
              </button>

              <div className="mt-1 border-t border-gray-100 pt-1">
                <button
                  onClick={onSignOut}
                  className="group w-full px-3 py-2 text-left transition hover:bg-red-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-50 transition group-hover:bg-red-100">
                      <LogOut className="h-3.5 w-3.5 text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-red-500">Sign out</p>
                      <p className="text-[10px] text-gray-400">End your session</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
