import { useEffect, useState } from 'react';
import './PerformanceDashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

type Creator = {
  id: number;
  email: string;
  username: string;
  display_name: string | null;
  followers: number | null;
  videos: number | null;
  likes: number | null;
  diamonds_l30d: number | null;
  valid_live_days_l30d: number | null;
  live_duration_l30d: number | null;
  diamonds_from_fan_club_l30d: number | null;
  active_fan_club_members_l30d: number | null;
  last_live: string | null;
  tier_status: string | null;
  tier_last_month: string | null;
  achieved_star_creator: boolean | null;
  star_creator_days_this_month: number | null;
  imported_at: string | null;
};

type PerformanceData = {
  total_creators: number;
  creators_with_performance: number;
  creators_without_performance: number;
  totals: Record<string, number>;
  creators: Creator[];
};

type ImportResult = {
  message: string;
  imported: number;
  imported_creators: number;
  matched_creators: number;
  unmatched: number;
  unmatched_usernames: string[];
  invalid_rows: { row: number; reason: string }[];
  fan_club_columns_found: Record<string, boolean>;
  imported_at: string;
};

const numberFormat = new Intl.NumberFormat('en-GB');

function formatNumber(value: number | null | undefined) {
  return value == null ? '—' : numberFormat.format(value);
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB');
}

export default function PerformanceDashboard() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function loadPerformance() {
    setLoading(true);
    setError('');

    try {
      const token = sessionStorage.getItem('veyra_management_token');

      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const response = await fetch(`${API_BASE_URL}/management/performance`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error('Your session has expired or access was denied. Please sign in again.');
      }

      if (!response.ok) {
        throw new Error('Unable to load performance data. Please try again.');
      }

      const result: PerformanceData = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!selectedFile) {
      setImportError('Please choose an Excel file first.');
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.xlsx')) {
      setImportError('Please select an Excel .xlsx file.');
      return;
    }

    setImporting(true);
    setImportError('');
    setImportResult(null);

    try {
      const token = sessionStorage.getItem('veyra_management_token');

      if (!token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`${API_BASE_URL}/management/import-backstage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = result.detail;
        const message =
          typeof detail === 'string'
            ? detail
            : detail?.message || 'The Excel import failed. Please check the file and try again.';
        throw new Error(message);
      }

      setImportResult(result as ImportResult);
      setSelectedFile(null);
      setFileInputKey((current) => current + 1);
      await loadPerformance();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'The import failed.');
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    void loadPerformance();
  }, []);

  const filteredCreators = (data?.creators ?? []).filter((creator) => {
    const term = search.toLowerCase();
    return (
      (creator.username ?? '').toLowerCase().includes(term) ||
      (creator.display_name ?? '').toLowerCase().includes(term) ||
      (creator.email ?? '').toLowerCase().includes(term)
    );
  });

  if (loading) {
    return <section className="panel performance-state">Loading performance data...</section>;
  }

  if (error) {
    return (
      <section className="panel performance-state">
        <p className="performance-error">{error}</p>
        <button className="performance-button" onClick={() => void loadPerformance()}>
          Try again
        </button>
      </section>
    );
  }

  if (!data) return null;

  return (
    <div className="performance-page">
      <div className="performance-heading">
        <div>
          <span className="eyebrow">ANALYTICS</span>
          <h2>Performance</h2>
          <p>Creator performance and imported platform metrics.</p>
        </div>
        <button className="performance-button" onClick={() => void loadPerformance()}>
          Refresh data
        </button>
      </div>

      <div className="performance-stats">
        <article className="performance-stat">
          <span>Registered creators</span>
          <strong>{formatNumber(data.total_creators)}</strong>
        </article>
        <article className="performance-stat">
          <span>With performance data</span>
          <strong>{formatNumber(data.creators_with_performance)}</strong>
        </article>
        <article className="performance-stat">
          <span>Awaiting performance data</span>
          <strong>{formatNumber(data.creators_without_performance)}</strong>
        </article>
        <article className="performance-stat">
          <span>Total diamonds · last 30 days</span>
          <strong>{formatNumber(data.totals.diamonds_l30d)}</strong>
        </article>
        <article className="performance-stat">
          <span>Fan Club diamonds · last 30 days</span>
          <strong>{formatNumber(data.totals.diamonds_from_fan_club_l30d)}</strong>
        </article>
        <article className="performance-stat">
          <span>Active Fan Club members</span>
          <strong>{formatNumber(data.totals.active_fan_club_members_l30d)}</strong>
        </article>
      </div>

      <section className="panel performance-import-panel">
        <div>
          <h3>Import Backstage performance</h3>
          <p>Upload the latest TikTok Backstage Excel spreadsheet (.xlsx). Existing performance history will be preserved.</p>
        </div>

        <div className="performance-import-controls">
          <input
            key={fileInputKey}
            className="performance-file-input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null);
              setImportError('');
              setImportResult(null);
            }}
          />
          <button
            className="performance-button"
            onClick={() => void handleImport()}
            disabled={!selectedFile || importing}
          >
            {importing ? 'Importing...' : 'Import Excel'}
          </button>
        </div>

        {selectedFile && (
          <p className="performance-import-file">Selected: {selectedFile.name}</p>
        )}

        {importError && (
          <p className="performance-error">{importError}</p>
        )}

        {importResult && (
          <div className="performance-import-result">
            <strong>Import completed successfully</strong>
            <div className="performance-import-summary">
              <span>Imported: {formatNumber(importResult.imported)}</span>
              <span>Matched to accounts: {formatNumber(importResult.matched_creators)}</span>
              <span>Unmatched: {formatNumber(importResult.unmatched)}</span>
              <span>Invalid rows: {formatNumber(importResult.invalid_rows.length)}</span>
            </div>
            {importResult.unmatched_usernames.length > 0 && (
              <p>Unmatched usernames: {importResult.unmatched_usernames.join(', ')}</p>
            )}
            {importResult.invalid_rows.length > 0 && (
              <details>
                <summary>View invalid rows</summary>
                <ul>
                  {importResult.invalid_rows.map((item) => (
                    <li key={item.row}>Row {item.row}: {item.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="panel performance-table-panel">
        <div className="performance-table-heading">
          <div>
            <h3>Creator metrics</h3>
            <p>Latest imported performance for each registered creator.</p>
          </div>
          <input
            className="performance-search"
            type="search"
            placeholder="Search creators..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="performance-table-wrap">
          <table className="performance-table">
            <thead>
              <tr>
                <th>Creator</th>
                <th>Followers</th>
                <th>Videos</th>
                <th>Likes</th>
                <th>Diamonds · 30d</th>
                <th>Fan Club diamonds · 30d</th>
                <th>Fan Club members</th>
                <th>Live days · 30d</th>
                <th>Live duration</th>
                <th>Last LIVE</th>
                <th>Current tier</th>
                <th>Previous tier</th>
                <th>Star Creator</th>
                <th>Star Creator days</th>
                <th>Last imported</th>
              </tr>
            </thead>
            <tbody>
              {filteredCreators.map((creator) => (
                <tr key={creator.id}>
                  <td>
                    <strong>{creator.display_name || creator.username || 'Unknown'}</strong>
                    <small>@{(creator.username || '').replace(/^@/, '')}</small>
                  </td>
                  <td>{formatNumber(creator.followers)}</td>
                  <td>{formatNumber(creator.videos)}</td>
                  <td>{formatNumber(creator.likes)}</td>
                  <td className="performance-diamonds">{formatNumber(creator.diamonds_l30d)}</td>
                  <td>{formatNumber(creator.diamonds_from_fan_club_l30d)}</td>
                  <td>{formatNumber(creator.active_fan_club_members_l30d)}</td>
                  <td>{formatNumber(creator.valid_live_days_l30d)}</td>
                  <td>{formatNumber(creator.live_duration_l30d)}</td>
                  <td>{formatDate(creator.last_live)}</td>
                  <td>{creator.tier_status || '—'}</td>
                  <td>{creator.tier_last_month || '—'}</td>
                  <td>{creator.achieved_star_creator == null ? '—' : creator.achieved_star_creator ? 'Yes' : 'No'}</td>
                  <td>{formatNumber(creator.star_creator_days_this_month)}</td>
                  <td>{formatDate(creator.imported_at)}</td>
                </tr>
              ))}
              {filteredCreators.length === 0 && (
                <tr>
                  <td colSpan={15} className="performance-empty">
                    No creators match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
