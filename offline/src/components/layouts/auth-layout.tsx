type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 text-slate-800">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_30%),linear-gradient(180deg,#f8fbff_0%,#eef3fb_46%,#e7edf7_100%)]" />

      <div className="absolute left-[-8%] top-[10%] h-64 w-64 rounded-full bg-blue-200/35 blur-3xl" />
      <div className="absolute right-[-10%] top-[4%] h-72 w-72 rounded-full bg-violet-200/20 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        {children}
      </div>
    </div>
  );
}
