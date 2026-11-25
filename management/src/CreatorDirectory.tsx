import { useEffect, useState } from 'react';
import { Search, RefreshCw, Users } from 'lucide-react';
import './CreatorDirectory.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

type Creator = {
  id: number;
  email: string;
  username: string | null;
  display_name: string | null;
  followers: number | null;
  videos: number | null;
  likes: number | null;
  diamonds_l30d: number | null;
  valid_live_days_l30d: number | null;
};

export default function CreatorDirectory() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadCreators() {
    setLoading(true);
    setError('');

    try {
      const token = sessionStorage.getItem('veyra_management_token');

      const response = await fetch(`${API_BASE_URL}/management/creators`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to load creators.');
      }

      setCreators(result.creators || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCreators();
  }, []);

  const filtered = creators.filter(creator =>
    [
      creator.username,
      creator.display_name,
      creator.email,
      String(creator.id),
    ].some(value => value?.toLowerCase().includes(search.trim().toLowerCase()))
  );

  const number = (value: number | null) =>
    value == null ? '—' : value.toLocaleString();

  return (
    <section className="panel creator-directory">
      <div className="creator-directory-heading">
        <div>
          <h2>Creator directory</h2>
          <p>{creators.length} registered creator accounts</p>
        </div>

        <button
          className="subtle-button"
          onClick={loadCreators}
          disabled={loading}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="creator-directory-toolbar">
        <div className="creator-directory-search">
          <Search size={17} />
          <input
            type="search"
            placeholder="Search creators..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <span>{filtered.length} creators</span>
      </div>

      {error && <div className="creator-directory-error">{error}</div>}

      {loading ? (
        <div className="creator-directory-empty">Loading creators...</div>
      ) : filtered.length === 0 ? (
        <div className="creator-directory-empty">
          <Users size={25} />
          <strong>No creators found</strong>
          <span>{error ? 'Check your connection and refresh.' : 'Try another search.'}</span>
        </div>
      ) : (
        <div className="creator-directory-table-wrap">
          <table className="creator-directory-table">
            <thead>
              <tr>
                <th>CREATOR</th>
                <th>EMAIL</th>
                <th>FOLLOWERS</th>
                <th>LIKES</th>
                <th>DIAMONDS L30D</th>
                <th>LIVE DAYS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(creator => (
                <tr key={creator.id}>
                  <td>
                    <div className="creator-directory-identity">
                      <div className="creator-directory-avatar">
                        {(creator.display_name || creator.username || 'C').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <strong>{creator.display_name || creator.username || 'Unnamed creator'}</strong>
                        <span>@{(creator.username || 'no-username').replace(/^@/, '')}</span>
                      </div>
                    </div>
                  </td>
                  <td>{creator.email}</td>
                  <td>{number(creator.followers)}</td>
                  <td>{number(creator.likes)}</td>
                  <td>{number(creator.diamonds_l30d)}</td>
                  <td>{number(creator.valid_live_days_l30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
