import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, ChartNoAxesCombined, Megaphone,
  CalendarDays, Ticket, FileBarChart, Activity, Settings,
  Bell, ChevronDown, ArrowUpRight,
  Plus, MoreHorizontal, Menu, X, Crown, ShieldCheck,
  CircleDollarSign, Radio, Clock3
} from 'lucide-react';
import './App.css';
import './Login.css';
import CreatorDirectory from './CreatorDirectory';
import PerformanceDashboard from './PerformanceDashboard';
import CampaignsDashboard from './CampaignsDashboard';
import AnnouncementsDashboard from './AnnouncementsDashboard';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Creators', icon: Users },
  { label: 'Performance', icon: ChartNoAxesCombined },
  { label: 'Campaigns', icon: Megaphone },
  { label: 'Announcements', icon: Radio },
  { label: 'Events', icon: CalendarDays },
  { label: 'Invitations', icon: Ticket },
  { label: 'Reports', icon: FileBarChart },
  { label: 'Activity Log', icon: Activity },
  { label: 'Settings', icon: Settings },
];

const stats = [
  { label: 'Total creators', value: '—', detail: 'Connect your creator database', icon: Users },
  { label: 'Active creators', value: '—', detail: 'Awaiting backend connection', icon: ShieldCheck },
  { label: 'Total diamonds', value: '—', detail: 'Performance data not connected', icon: CircleDollarSign },
  { label: 'Live creators', value: '—', detail: 'Awaiting live activity data', icon: Radio },
];

function App() {
  const [activePage, setActivePage] = useState('Overview');
  const [mobileOpen, setMobileOpen] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loginEmail, setLoginEmail] = useState('veyracreatornetwork@gmail.com');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const token = sessionStorage.getItem('veyra_management_token');

      if (!token) {
        if (active) setIsCheckingAuth(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/management/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          sessionStorage.removeItem('veyra_management_token');
        }

        if (active) setIsAuthenticated(response.ok);
      } catch {
        sessionStorage.removeItem('veyra_management_token');
        if (active) setIsAuthenticated(false);
      } finally {
        if (active) setIsCheckingAuth(false);
      }
    }

    checkSession();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const response = await fetch(`${API_BASE_URL}/management/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to sign in. Check your details.');
      }

      if (!result.access_token) {
        throw new Error('The server did not return a login token.');
      }

      sessionStorage.setItem('veyra_management_token', result.access_token);
      setLoginPassword('');
      setIsAuthenticated(true);
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : 'Unable to connect to the management server.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('veyra_management_token');
    setIsAuthenticated(false);
    setLoginPassword('');
    setLoginError('');
    setActivePage('Overview');
  }

  const pageDescriptions: Record<string, string> = {
    Overview: 'Your network at a glance.',
    Creators: 'Manage and oversee your creator network.',
    Performance: 'Monitor creator performance and upload reporting data.',
    Campaigns: 'Create and manage creator campaigns.',
    Announcements: 'Share important updates with your creators.',
    Events: 'Organise and manage network events.',
    Invitations: 'Generate and manage creator invitation codes.',
    Reports: 'Review and export network reports.',
    'Activity Log': 'Track actions and changes across your management system.',
    Settings: 'Manage your management system preferences.',
  };

  const activeNav = navigation.find(item => item.label === activePage);
  const ActiveIcon = activeNav?.icon || LayoutDashboard;

  if (isCheckingAuth) {
    return (
      <div className="login-screen">
        <div className="login-loading">
          <div className="login-brand-mark">V</div>
          <div className="login-brand-name">VEYRA</div>
          <p>SECURE MANAGEMENT ACCESS</p>
          <span className="login-spinner" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="login-screen">
        <div className="login-decoration login-decoration-one" />
        <div className="login-decoration login-decoration-two" />

        <div className="login-card">
          <div className="login-brand-mark">V</div>
          <div className="login-brand-name">VEYRA</div>
          <div className="login-brand-subtitle">MANAGEMENT</div>

          <div className="login-divider" />

          <div className="login-heading">
            <span>FOUNDER ACCESS</span>
            <h1>Welcome back.</h1>
            <p>Sign in to access your private management workspace.</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="founder-email">Founder email</label>
            <input
              id="founder-email"
              type="email"
              autoComplete="username"
              value={loginEmail}
              onChange={event => setLoginEmail(event.target.value)}
              required
            />

            <label htmlFor="founder-password">Password</label>
            <input
              id="founder-password"
              type="password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={event => setLoginPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />

            {loginError && (
              <div className="login-error" role="alert">{loginError}</div>
            )}

            <button className="login-submit" type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? 'AUTHENTICATING...' : 'SIGN IN SECURELY'}
            </button>
          </form>

          <div className="login-security">
            <ShieldCheck size={16} />
            <span>PRIVATE FOUNDER WORKSPACE</span>
          </div>
        </div>

        <div className="login-copyright">VEYRA CREATOR NETWORK · MANAGEMENT PORTAL</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">V</div>
          <div>
            <div className="brand-name">VEYRA</div>
            <div className="brand-subtitle">MANAGEMENT</div>
          </div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-menu">
          {navigation.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={`nav-item ${activePage === item.label ? 'active' : ''}`}
                onClick={() => { setActivePage(item.label); setMobileOpen(false); }}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.label === 'Creators' && <span className="nav-dot" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-card">
            <div className="security-icon"><ShieldCheck size={19} /></div>
            <div>
              <strong>Private workspace</strong>
              <span>Founder access only</span>
            </div>
          </div>
          <div className="sidebar-footer">
            <div className="avatar">F</div>
            <div className="founder-info">
              <strong>Founder</strong>
              <span>VEYRA Network</span>
            </div>
            <button className="logout-button" onClick={handleLogout} title="Sign out">
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
          <div className="breadcrumb">VEYRA <span>/</span> <strong>{activePage}</strong></div>
          <div className="topbar-actions">
            <div className="system-status"><span /> System workspace</div>
            <button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button>
            <div className="top-avatar">F</div>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow"><Crown size={13} /> FOUNDER CONTROL CENTRE</div>
              <h1>{activePage === 'Overview' ? 'Welcome to VEYRA.' : activePage}</h1>
              <p>{pageDescriptions[activePage]}</p>
            </div>
            {activePage !== 'Overview' && activePage !== 'Campaigns' && activePage !== 'Announcements' && (
              <button className="primary-button" onClick={() => alert('This feature will be connected to the backend in a later step.')}>
                <Plus size={17} /> Create new
              </button>
            )}
          </div>

          {activePage === 'Overview' ? (
            <>
              <div className="section-heading">
                <div><h2>Network overview</h2><p>Your network statistics will appear here once connected.</p></div>
                <div className="date-filter"><Clock3 size={15} /> Current overview <ChevronDown size={15} /></div>
              </div>

              <div className="stats-grid">
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div className="stat-card" key={stat.label}>
                      <div className="stat-top"><span>{stat.label}</span><div className="stat-icon"><Icon size={19} /></div></div>
                      <div className="stat-value">{stat.value}</div>
                      <div className="stat-detail">{stat.detail}</div>
                    </div>
                  );
                })}
              </div>

              <div className="dashboard-grid">
                <section className="panel performance-panel">
                  <div className="panel-heading">
                    <div><h3>Performance overview</h3><p>Creator network performance</p></div>
                    <button className="subtle-button">View reports <ArrowUpRight size={15} /></button>
                  </div>
                  <div className="empty-chart">
                    <div className="chart-decoration">
                      <div /><div /><div /><div /><div />
                    </div>
                    <div className="empty-icon"><ChartNoAxesCombined size={25} /></div>
                    <strong>Performance data will appear here</strong>
                    <span>Connect your existing VEYRA performance records to see network trends.</span>
                  </div>
                </section>

                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <div><h3>Recent activity</h3><p>Latest management actions</p></div>
                    <button className="more-button"><MoreHorizontal size={20} /></button>
                  </div>
                  <div className="empty-activity">
                    <div className="activity-symbol"><Activity size={22} /></div>
                    <strong>No activity recorded yet</strong>
                    <span>Management actions will be recorded here.</span>
                  </div>
                </section>
              </div>

              <section className="panel quick-panel">
                <div className="panel-heading">
                  <div><h3>Management shortcuts</h3><p>Quick access to your main tools</p></div>
                </div>
                <div className="quick-grid">
                  {[
                    { label: 'Manage creators', icon: Users, page: 'Creators', desc: 'View your network' },
                    { label: 'Upload performance', icon: ChartNoAxesCombined, page: 'Performance', desc: 'Import Excel data' },
                    { label: 'Create campaign', icon: Megaphone, page: 'Campaigns', desc: 'Launch a campaign' },
                    { label: 'Generate invitations', icon: Ticket, page: 'Invitations', desc: 'Create invite codes' },
                  ].map(item => {
                    const Icon = item.icon;
                    return (
                      <button className="quick-action" key={item.page} onClick={() => setActivePage(item.page)}>
                        <div className="quick-icon"><Icon size={19} /></div>
                        <div><strong>{item.label}</strong><span>{item.desc}</span></div>
                        <ArrowUpRight size={16} className="quick-arrow" />
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : activePage === 'Campaigns' ? (
            <CampaignsDashboard />
          ) : activePage === 'Announcements' ? (
            <AnnouncementsDashboard />
          ) : activePage === 'Performance' ? (
          <PerformanceDashboard />
        ) : activePage === 'Creators' ? (
            <CreatorDirectory />
          ) : (
            <section className="panel section-placeholder">
              <div className="placeholder-icon"><ActiveIcon size={27} /></div>
              <h2>{activePage}</h2>
              <p>{pageDescriptions[activePage]}</p>
              <div className="coming-soon">MODULE READY FOR DEVELOPMENT</div>
              <span className="placeholder-note">This section is part of your new management application. Its data and actions will be connected securely to your existing VEYRA backend in the next development stages.</span>
            </section>
          )}

          <footer className="page-footer">
            <span>VEYRA MANAGEMENT</span>
            <span>FOUNDER CONTROL CENTRE <i /> PRIVATE WORKSPACE</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
