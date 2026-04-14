import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, UserRound, Video } from 'lucide-react';

type LoginScreenProps = {
  onSignIn: (payload: {
    username: string;
    password: string;
    category: string;
  }) => Promise<void>;
};

export function LoginScreen({ onSignIn }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
    category?: string;
  }>({});
  const [authError, setAuthError] = useState('');

  const validate = () => {
    const nextErrors: {
      username?: string;
      password?: string;
      category?: string;
    } = {};

    if (!username.trim()) {
      nextErrors.username = 'Please enter your username.';
    }

    if (!password.trim()) {
      nextErrors.password = 'Please enter your password.';
    }

    if (!category) {
      nextErrors.category = 'Please choose a category.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!validate()) return;

    try {
      setIsSubmitting(true);
      await onSignIn({ username: username.trim(), password, category });
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Unable to sign in right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-95 rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur sm:p-6">
      <div className="mx-auto max-w-[320px]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-200">
            <Video className="h-5 w-5" />
          </span>
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-800">
              IE Video CT
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-800">
            Sign in
          </h2>
          <p className="text-sm leading-6 text-slate-500">
            Enter your account to continue.
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Field label="Username">
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={username}
                placeholder="Enter your username"
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors((prev) => ({ ...prev, username: undefined }));
                  setAuthError('');
                }}
                className={`h-11 w-full rounded-2xl border bg-white pl-11 pr-4 text-[15px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                  errors.username
                    ? 'border-red-300 focus:border-red-300 focus:ring-red-50'
                    : 'border-slate-200 focus:border-blue-300 focus:ring-blue-50'
                }`}
              />
            </div>
            {errors.username ? (
              <p className="text-sm font-medium text-red-500">
                {errors.username}
              </p>
            ) : null}
          </Field>

          <Field label="Password">
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                placeholder="Enter your password"
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined }));
                  setAuthError('');
                }}
                className={`h-11 w-full rounded-2xl border bg-white pl-11 pr-12 text-[15px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                  errors.password
                    ? 'border-red-300 focus:border-red-300 focus:ring-red-50'
                    : 'border-slate-200 focus:border-blue-300 focus:ring-blue-50'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password ? (
              <p className="text-sm font-medium text-red-500">
                {errors.password}
              </p>
            ) : null}
          </Field>

          <Field label="Category">
            <div>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setErrors((prev) => ({ ...prev, category: undefined }));
                  setAuthError('');
                }}
                className={`h-11 w-full rounded-2xl border bg-white px-4 text-[15px] text-slate-700 outline-none transition focus:ring-4 ${
                  errors.category
                    ? 'border-red-300 focus:border-red-300 focus:ring-red-50'
                    : 'border-slate-200 focus:border-blue-300 focus:ring-blue-50'
                }`}
              >
                <option value="">Choose option</option>
                <option value="FF28">FF28</option>
                <option value="COSTING">COSTING</option>
                <option value="LSA">LSA</option>
              </select>
            </div>
            {errors.category ? (
              <p className="text-sm font-medium text-red-500">
                {errors.category}
              </p>
            ) : null}
          </Field>

          {authError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-500">
              {authError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-11 w-full items-center justify-center rounded-2xl bg-linear-to-r from-blue-500 to-violet-600 text-[15px] font-semibold text-white shadow-[0_18px_34px_rgba(59,130,246,0.26)] transition hover:-translate-y-px hover:from-blue-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:from-blue-500 disabled:hover:to-violet-600"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
