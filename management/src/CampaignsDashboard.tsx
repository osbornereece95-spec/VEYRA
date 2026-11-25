import { useEffect, useRef, useState } from 'react';
import {
  Search, RefreshCw, Plus, Megaphone, X, CalendarDays,
  Pencil, Save, Upload, Trash2
} from 'lucide-react';
import './CampaignsDashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

type Creator = {
  id: number;
  email: string;
  username: string | null;
  display_name: string | null;
};

type Campaign = {
  id: number;
  name: string;
  campaign_type?: string | null;
  backstage_status?: string | null;
  description: string;
  objective: string;
  notes: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator_count: number;
  creator_ids: number[];
};

type CampaignForm = {
  name: string;
  description: string;
  objective: string;
  notes: string;
  start_date: string;
  end_date: string;
  status: string;
  creator_ids: number[];
};

const emptyForm: CampaignForm = {
  name: '',
  description: '',
  objective: '',
  notes: '',
  start_date: '',
  end_date: '',
  status: 'draft',
  creator_ids: [],
};

const statuses = ['draft', 'scheduled', 'active', 'completed', 'cancelled'];

export default function CampaignsDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  function headers() {
    return {
      Authorization: `Bearer ${sessionStorage.getItem('veyra_management_token') || ''}`,
      'Content-Type': 'application/json',
    };
  }

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [campaignResponse, creatorResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/management/campaigns`, {
          headers: headers(),
        }),
        fetch(`${API_BASE_URL}/management/creators`, {
          headers: headers(),
        }),
      ]);

      const campaignResult = await campaignResponse.json();
      const creatorResult = await creatorResponse.json();

      if (!campaignResponse.ok) {
        throw new Error(campaignResult.detail || 'Unable to load campaigns.');
      }

      if (!creatorResponse.ok) {
        throw new Error(creatorResult.detail || 'Unable to load creators.');
      }

      setCampaigns(Array.isArray(campaignResult) ? campaignResult : campaignResult.campaigns || []);
      setCreators(creatorResult.creators || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  }

  async function importCampaignFile(file: File) {
    setImporting(true);
    setError('');
    setSuccess('');

    try {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch(`${API_BASE_URL}/management/import-campaigns`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem('veyra_management_token') || ''}`,
        },
        body,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Campaign import failed.');
      }

      await loadData();
      setSuccess(
        `Imported ${result.imported} campaigns. ${result.skipped_duplicates} duplicates skipped.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Campaign import failed.');
    } finally {
      setImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
    setEditorOpen(true);
  }

  function openEdit(campaign: Campaign) {
    setEditingId(campaign.id);
    setForm({
      name: campaign.name,
      description: campaign.description || '',
      objective: campaign.objective || '',
      notes: campaign.notes || '',
      start_date: campaign.start_date || '',
      end_date: campaign.end_date || '',
      status: campaign.status,
      creator_ids: campaign.creator_ids || [],
    });
    setError('');
    setSuccess('');
    setEditorOpen(true);
  }

  function updateField<K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function toggleCreator(id: number) {
    setForm(current => ({
      ...current,
      creator_ids: current.creator_ids.includes(id)
        ? current.creator_ids.filter(creatorId => creatorId !== id)
        : [...current.creator_ids, id],
    }));
  }

  async function saveCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        ...form,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };

      const url = editingId
        ? `${API_BASE_URL}/management/campaigns/${editingId}`
        : `${API_BASE_URL}/management/campaigns`;

      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to save campaign.');
      }

      setEditorOpen(false);
      setSuccess(editingId ? 'Campaign updated successfully.' : 'Campaign created successfully.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save campaign.');
    } finally {
      setSaving(false);
    }
  }


  async function deleteCampaign(campaign: Campaign) {
    const confirmed = window.confirm(
      `Permanently delete "${campaign.name}"?\n\n` +
      'This will remove it from VEYRA Management and the creator app. ' +
      'This action cannot be undone.'
    );

    if (!confirmed) return;

    setDeletingId(campaign.id);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/management/campaigns/${campaign.id}`,
        {
          method: 'DELETE',
          headers: headers(),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to delete campaign.');
      }

      if (editingId === campaign.id) {
        setEditorOpen(false);
        setEditingId(null);
      }

      setSuccess(`"${campaign.name}" was permanently deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete campaign.');
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = campaigns.filter(campaign =>
    [
      campaign.name,
      campaign.campaign_type,
      campaign.backstage_status,
      campaign.status,
      campaign.created_by,
    ].some(value => value?.toLowerCase().includes(search.trim().toLowerCase()))
  );

  const formatDate = (value: string | null) => {
    if (!value) return 'Not set';
    return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString();
  };

  return (
    <section className="campaigns-module">
      <div className="campaigns-summary">
        <div className="campaigns-summary-card">
          <span>Total campaigns</span>
          <strong>{campaigns.length}</strong>
        </div>
        <div className="campaigns-summary-card">
          <span>Active campaigns</span>
          <strong>{campaigns.filter(item => item.status === 'active').length}</strong>
        </div>
        <div className="campaigns-summary-card">
          <span>Draft campaigns</span>
          <strong>{campaigns.filter(item => item.status === 'draft').length}</strong>
        </div>
        <div className="campaigns-summary-card">
          <span>Creators assigned</span>
          <strong>{campaigns.reduce((total, item) => total + (item.creator_count || 0), 0)}</strong>
        </div>
      </div>

      <section className="panel campaigns-panel">
        <div className="campaigns-heading">
          <div>
            <h2>Campaign directory</h2>
            <p>Create campaigns and coordinate creator assignments.</p>
          </div>
          <div className="campaigns-heading-actions">
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx"
              style={{ display: 'none' }}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void importCampaignFile(file);
              }}
            />
            <button
              className="subtle-button"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
            >
              <Upload size={15} /> {importing ? 'Importing...' : 'Import Excel'}
            </button>
            <button className="subtle-button" onClick={loadData} disabled={loading}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button className="primary-button" onClick={openCreate}>
              <Plus size={16} /> New campaign
            </button>
          </div>
        </div>

        <div className="campaigns-toolbar">
          <div className="campaigns-search">
            <Search size={17} />
            <input
              type="search"
              placeholder="Search campaigns..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <span>{filtered.length} campaigns</span>
        </div>

        {success && <div className="campaigns-success">{success}</div>}
        {error && !editorOpen && <div className="campaigns-error">{error}</div>}

        {loading ? (
          <div className="campaigns-empty">Loading campaigns...</div>
        ) : filtered.length === 0 ? (
          <div className="campaigns-empty">
            <Megaphone size={27} />
            <strong>{search ? 'No campaigns found' : 'No campaigns created yet'}</strong>
            <span>{search ? 'Try a different search.' : 'Create your first campaign to get started.'}</span>
          </div>
        ) : (
          <div className="campaigns-list">
            {filtered.map(campaign => (
              <article className="campaign-card" key={campaign.id}>
                <div className="campaign-card-main">
                  <div className="campaign-card-icon"><Megaphone size={19} /></div>
                  <div className="campaign-card-copy">
                    <div className="campaign-card-title">
                      <h3>{campaign.name}</h3>
                      <span className={`campaign-status status-${campaign.status}`}>
                        {campaign.backstage_status || campaign.status}
                      </span>
                    </div>
                    <div className="campaign-card-meta">
                      <span>Type: {campaign.campaign_type || 'Not set'}</span>
                      <span><CalendarDays size={13} /> Start: {formatDate(campaign.start_date)}</span>
                      <span><CalendarDays size={13} /> End: {formatDate(campaign.end_date)}</span>
                      <span>Created by: {campaign.created_by || 'Not set'}</span>
                    </div>
                  </div>
                </div>
                <div className="campaign-card-actions">
                  <button
                    className="campaign-edit-button"
                    onClick={() => openEdit(campaign)}
                    disabled={deletingId === campaign.id}
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    className="campaign-delete-button"
                    onClick={() => void deleteCampaign(campaign)}
                    disabled={deletingId === campaign.id}
                    title="Permanently delete campaign"
                  >
                    <Trash2 size={14} />
                    {deletingId === campaign.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editorOpen && (
        <div className="campaign-editor-backdrop" onMouseDown={event => {
          if (event.target === event.currentTarget && !saving) setEditorOpen(false);
        }}>
          <section className="campaign-editor" role="dialog" aria-modal="true" aria-labelledby="campaign-editor-title">
            <div className="campaign-editor-heading">
              <div>
                <span>VEYRA MANAGEMENT</span>
                <h2 id="campaign-editor-title">{editingId ? 'Edit campaign' : 'Create campaign'}</h2>
              </div>
              <button type="button" className="campaign-close-button" onClick={() => setEditorOpen(false)} disabled={saving} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveCampaign}>
              <label>
                Campaign name *
                <input
                  value={form.name}
                  onChange={event => updateField('name', event.target.value)}
                  maxLength={160}
                  required
                  placeholder="e.g. Winter Creator Launch"
                />
              </label>

              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={event => updateField('description', event.target.value)}
                  maxLength={10000}
                  rows={3}
                  placeholder="Describe the campaign..."
                />
              </label>

              <label>
                Objective
                <input
                  value={form.objective}
                  onChange={event => updateField('objective', event.target.value)}
                  maxLength={5000}
                  placeholder="What should this campaign achieve?"
                />
              </label>

              <div className="campaign-form-grid">
                <label>
                  Start date
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={event => updateField('start_date', event.target.value)}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={form.end_date}
                    min={form.start_date || undefined}
                    onChange={event => updateField('end_date', event.target.value)}
                  />
                </label>
              </div>

              <label>
                Campaign status
                <select value={form.status} onChange={event => updateField('status', event.target.value)}>
                  {statuses.map(status => (
                    <option value={status} key={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                  ))}
                </select>
              </label>

              <div className="campaign-creator-section">
                <div className="campaign-creator-heading">
                  <div>
                    <strong>Assign creators</strong>
                    <span>{form.creator_ids.length} selected</span>
                  </div>
                  <span>{creators.length} available</span>
                </div>
                {creators.length === 0 ? (
                  <p className="campaign-no-creators">No registered creators available.</p>
                ) : (
                  <div className="campaign-creator-list">
                    {creators.map(creator => (
                      <label className="campaign-creator-option" key={creator.id}>
                        <input
                          type="checkbox"
                          checked={form.creator_ids.includes(creator.id)}
                          onChange={() => toggleCreator(creator.id)}
                        />
                        <span>
                          <strong>{creator.display_name || creator.username || 'Unnamed creator'}</strong>
                          <small>{creator.username ? `@${creator.username.replace(/^@/, '')}` : creator.email}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <label>
                Internal notes
                <textarea
                  value={form.notes}
                  onChange={event => updateField('notes', event.target.value)}
                  maxLength={10000}
                  rows={3}
                  placeholder="Private notes for the VEYRA team..."
                />
              </label>

              {error && <div className="campaigns-error">{error}</div>}

              <div className="campaign-editor-actions">
                <button type="button" className="campaign-cancel-button" onClick={() => setEditorOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  <Save size={15} /> {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create campaign'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
