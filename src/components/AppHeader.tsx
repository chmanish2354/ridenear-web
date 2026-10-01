import { Link, useNavigate } from 'react-router-dom';
import { clearSession } from '../auth/session';
import type { SessionUser } from '../auth/session';

type AppHeaderProps = {
  user: SessionUser;
};

export function AppHeader({ user }: AppHeaderProps) {
  const navigate = useNavigate();

  function onLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <header className="h-16 border-b border-ink/20 bg-background text-ink px-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-6 min-w-0">
        <div className="min-w-0">
          <p className="text-[18px] font-semibold leading-[1.3] truncate">
            DRN(DiscoverRideNear)
          </p>
          <p className="text-[12px] font-medium leading-[1.4] text-ink/70">
            Bengaluru
          </p>
        </div>
        <nav className="flex items-center gap-4 text-[14px]">
          <Link to="/" className="text-accent">
            Home
          </Link>
          <Link to="/trips" className="text-accent">
            My trips
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-[14px] font-normal leading-[1.5]">{user.name}</span>
        <button
          type="button"
          onClick={onLogout}
          className="text-[14px] text-accent bg-transparent border-0 cursor-pointer p-0"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
