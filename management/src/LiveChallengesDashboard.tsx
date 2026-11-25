import { useEffect, useState } from 'react';
import {
  Plus, RefreshCw, Pencil, Trash2, X, Save,
  Trophy, Send, CalendarDays
} from 'lucide-react';
import './LiveChallengesDashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

type Challenge = {
  id: number;
  title: string;
  description: string;
  instructions: string;
  reward: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'draft' | 'published';
  display_status?: 'draft' | 'published' | 'ended';
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type ChallengeForm = {
  title: string;
  description: string;
  instructions: string;
  reward: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'published';
};

const emptyForm: ChallengeForm = {
  title: '',
  description: '',
  instructions: '',
  reward: '',
  start_date: '',
  end_date: '',
  status: 'draft',
};

export default function LiveChallengesDashboard() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ChallengeForm>(emptyForm);

  function headers() {
    return {
      Authorization: `Bearer ${sessionStorage.getItem('veyra_management_token') || ''}`,
      'Content-Type': 'application/json',
    };
  }

  async function loadChallenges() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/management/live-challenges`, {
        headers: headers(),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to load live challenges.');
      }

      setChallenges(Array.isArray(result.challenges) ? result.challenges : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load live challenges.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChallenges();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
    setEditorOpen(true);
  }

  function openEdit(item: Challenge) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description,
      instructions: item.instructions,
      reward: item.reward || '',
      start_date: item.start_date?.slice(0, 10) || '',
      end_date: item.end_date?.slice(0, 10) || '',
      status: item.status,
    });
    setError('');
    setSuccess('');
    setEditorOpen(true);
  }

  async function saveChallenge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim() || !form.description.trim() || !form.instructions.trim()) {
      setError('Please complete the title, description and instructions.');
      return;
    }

    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('The end date cannot be before the start date.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const url = editingId
        ? `${API_BASE_URL}/management/live-challenges/${editingId}`
        : `${API_BASE_URL}/management/live-challenges`;

      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          instructions: form.instructions.trim(),
          reward: form.reward.trim() || null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          status: form.status,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to save live challenge.');
      }

      setEditorOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      setSuccess(
        form.status === 'published'
          ? 'Challenge published and made available to all creators.'
          : 'Challenge draft saved successfully.'
      );
      await loadChallenges();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save live challenge.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteChallenge(item: Challenge) {
    const confirmed = window.confirm(
      `Permanently delete "${item.title}"? This will also remove it from the creator app.`
    );

    if (!confirmed) return;

    setDeletingId(item.id);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/management/live-challenges/${item.id}`,
        { method: 'DELETE', headers: headers() }
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to delete live challenge.');
      }

      setSuccess('Live challenge deleted successfully.');
      await loadChallenges();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete live challenge.');
    } finally {
      setDeletingId(null);
    }
  }

  const publishedCount = challenges.filter(item => item.status === 'published' && item.display_status !== 'ended').length;
  const draftCount = challenges.filter(item => item.status === 'draft').length;
  const endedCount = challenges.filter(item => item.display_status === 'ended').length;

  return (
    <div className="challenges-dashboard">
      <div className="challenge-overview">
        <div className="challenge-stat">
          <span>Total challenges</span>
          <strong>{challenges.length}</strong>
        </div>
        <div className="challenge-stat">
          <span>Published / active</span>
          <strong>{publishedCount}</strong>
        </div>
        <div className="challenge-stat">
          <span>Drafts</span>
          <strong>{draftCount}</strong>
        </div>
        <div className="challenge-stat">
          <span>Ended</span>
          <strong>{endedCount}</strong>
        </div>
      </div>

      <div className="challenge-toolbar">
        <div>
          <h2>Network live challenges</h2>
          <p>Create competitions and challenges that appear in the creator app under Events. Every creator is automatically included when a challenge is published.</p>
        </div>
        <div className="challenge-toolbar-actions">
          <button className="challenge-secondary-button" onClick={() => void loadChallenges()} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="challenge-primary-button" onClick={openCreate}>
            <Plus size={17} /> New challenge
          </button>
        </div>
      </div>

      {error && <div className="challenge-alert challenge-alert-error">{error}</div>}
      {success && <div className="challenge-alert challenge-alert-success">{success}</div>}

      {editorOpen && (
        <form className="challenge-editor" onSubmit={saveChallenge}>
          <div className="challenge-editor-heading">
            <div>
              <span className="challenge-eyebrow">{editingId ? 'EDIT CHALLENGE' : 'NEW CHALLENGE'}</span>
              <h3>{editingId ? 'Update live challenge' : 'Create a live challenge'}</h3>
            </div>
            <button type="button" className="challenge-icon-button" onClick={() => setEditorOpen(false)} aria-label="Close editor">
              <X size={19} />
            </button>
          </div>

          <label>
            Challenge title
            <input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} maxLength={160} placeholder="Enter the challenge title" required />
            <small>{form.title.length}/160 characters</small>
          </label>

          <label>
            Description
            <textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} maxLength={5000} rows={3} placeholder="Explain what the challenge is about..." required />
          </label>

          <label>
            Instructions and rules
            <textarea value={form.instructions} onChange={event => setForm({ ...form, instructions: event.target.value })} maxLength={10000} rows={5} placeholder="Explain how creators take part and any rules they must follow..." required />
          </label>

          <label>
            Reward (optional)
            <input value={form.reward} onChange={event => setForm({ ...form, reward: event.target.value })} maxLength={500} placeholder="Describe the prize or reward, if there is one" />
          </label>

          <div className="challenge-date-grid">
            <label>
              Start date (optional)
              <input type="date" value={form.start_date} onChange={event => setForm({ ...form, start_date: event.target.value })} />
            </label>
            <label>
              End date (optional)
              <input type="date" min={form.start_date || undefined} value={form.end_date} onChange={event => setForm({ ...form, end_date: event.target.value })} />
            </label>
          </div>

          <label>
            Publication status
            <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as 'draft' | 'published' })}>
              <option value="draft">Save as draft — only visible in Management</option>
              <option value="published">Publish — visible to every creator</option>
            </select>
          </label>

          <div className="challenge-editor-actions">
            <button type="button" className="challenge-secondary-button" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</button>
            <button type="submit" className="challenge-primary-button" disabled={saving}>
              {saving ? 'Saving...' : form.status === 'published' ? <><Send size={16} /> Publish challenge</> : <><Save size={16} /> Save draft</>}
            </button>
          </div>
        </form>
      )}

      <div className="challenge-list-heading">
        <h3>All live challenges</h3>
        <span>{challenges.length} total</span>
      </div>

      {loading ? (
        <div className="challenge-empty">Loading live challenges...</div>
      ) : challenges.length === 0 ? (
        <div className="challenge-empty">
          <Trophy size={28} />
          <h3>No live challenges yet</h3>
          <p>Create your first challenge. Save it as a draft or publish it to every creator in VEYRA.</p>
          <button className="challenge-primary-button" onClick={openCreate}><Plus size={16} /> Create challenge</button>
        </div>
      ) : (
        <div className="challenge-list">
          {challenges.map(item => {
            const displayStatus = item.display_status || item.status;
            return (
              <article className="challenge-item" key={item.id}>
                <div className="challenge-item-main">
                  <div className="challenge-item-meta">
                    <span className={`challenge-status ${displayStatus}`}>{displayStatus === 'ended' ? 'Ended' : displayStatus === 'published' ? 'Published' : 'Draft'}</span>
                    <span>Updated {new Date(item.updated_at).toLocaleDateString()}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="challenge-detail"><strong>Rules:</strong> {item.instructions}</div>
                  {item.reward && <div className="challenge-detail"><strong>Reward:</strong> {item.reward}</div>}
                  <div className="challenge-date-meta">
                    <CalendarDays size={14} />
                    <span>{item.start_date ? new Date(`${item.start_date.slice(0, 10)}T00:00:00`).toLocaleDateString() : 'No start date'}</span>
                    <span>→</span>
                    <span>{item.end_date ? new Date(`${item.end_date.slice(0, 10)}T00:00:00`).toLocaleDateString() : 'No end date'}</span>
                  </div>
                </div>
                <div className="challenge-item-actions">
                  <button className="challenge-secondary-button" onClick={() => openEdit(item)}><Pencil size={15} /> Edit</button>
                  <button className="challenge-danger-button" onClick={() => void deleteChallenge(item)} disabled={deletingId === item.id}>
                    <Trash2 size={15} /> {deletingId === item.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}