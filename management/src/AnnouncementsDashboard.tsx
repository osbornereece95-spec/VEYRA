import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Pencil, Trash2, X, Save, Radio, Send } from 'lucide-react';
import './AnnouncementsDashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

type Announcement = {
  id: number;
  title: string;
  message: string;
  status: 'draft' | 'published';
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type AnnouncementForm = {
  title: string;
  message: string;
  status: 'draft' | 'published';
};

const emptyForm: AnnouncementForm = {
  title: '',
  message: '',
  status: 'draft',
};

export default function AnnouncementsDashboard() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(emptyForm);

  function headers() {
    return {
      Authorization: `Bearer ${sessionStorage.getItem('veyra_management_token') || ''}`,
      'Content-Type': 'application/json',
    };
  }

  async function loadAnnouncements() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/management/announcements`, {
        headers: headers(),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to load announcements.');
      }

      setAnnouncements(Array.isArray(result.announcements) ? result.announcements : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load announcements.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnnouncements();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
    setEditorOpen(true);
  }

  function openEdit(item: Announcement) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      message: item.message,
      status: item.status,
    });
    setError('');
    setSuccess('');
    setEditorOpen(true);
  }

  async function saveAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim() || !form.message.trim()) {
      setError('Please enter both a title and a message.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const url = editingId
        ? `${API_BASE_URL}/management/announcements/${editingId}`
        : `${API_BASE_URL}/management/announcements`;

      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify({
          title: form.title.trim(),
          message: form.message.trim(),
          status: form.status,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to save announcement.');
      }

      setEditorOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      setSuccess(
        form.status === 'published'
          ? 'Announcement published successfully.'
          : 'Draft saved successfully.'
      );
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save announcement.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnouncement(item: Announcement) {
    const confirmed = window.confirm(
      `Permanently delete "${item.title}"?${item.status === 'published' ? '\n\nIt will also disappear from creators’ Events tab.' : ''}`
    );

    if (!confirmed) return;

    setDeletingId(item.id);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/management/announcements/${item.id}`,
        {
          method: 'DELETE',
          headers: headers(),
        }
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.detail || 'Unable to delete announcement.');
      }

      setSuccess('Announcement deleted successfully.');
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete announcement.');
    } finally {
      setDeletingId(null);
    }
  }

  const publishedCount = announcements.filter((item) => item.status === 'published').length;
  const draftCount = announcements.length - publishedCount;

  return (
    <div className="announcements-dashboard">
      <div className="announcement-overview">
        <div className="announcement-stat">
          <span>Total announcements</span>
          <strong>{announcements.length}</strong>
        </div>
        <div className="announcement-stat">
          <span>Published</span>
          <strong>{publishedCount}</strong>
        </div>
        <div className="announcement-stat">
          <span>Drafts</span>
          <strong>{draftCount}</strong>
        </div>
      </div>

      <div className="announcement-toolbar">
        <div>
          <h2>Network announcements</h2>
          <p>Create updates that appear in the creator app under Events.</p>
        </div>
        <div className="announcement-toolbar-actions">
          <button className="announcement-secondary-button" onClick={() => void loadAnnouncements()} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="announcement-primary-button" onClick={openCreate}>
            <Plus size={17} /> New announcement
          </button>
        </div>
      </div>

      {error && <div className="announcement-alert announcement-alert-error">{error}</div>}
      {success && <div className="announcement-alert announcement-alert-success">{success}</div>}

      {editorOpen && (
        <form className="announcement-editor" onSubmit={saveAnnouncement}>
          <div className="announcement-editor-heading">
            <div>
              <span className="announcement-eyebrow">{editingId ? 'EDIT ANNOUNCEMENT' : 'NEW ANNOUNCEMENT'}</span>
              <h3>{editingId ? 'Update announcement' : 'Create an announcement'}</h3>
            </div>
            <button type="button" className="announcement-icon-button" onClick={() => setEditorOpen(false)} aria-label="Close editor">
              <X size={19} />
            </button>
          </div>

          <label>
            Announcement title
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              maxLength={160}
              placeholder="Enter a clear announcement title"
              required
            />
            <small>{form.title.length}/160 characters</small>
          </label>

          <label>
            Message
            <textarea
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              maxLength={5000}
              rows={6}
              placeholder="Write the update you want creators to see..."
              required
            />
            <small>{form.message.length}/5000 characters</small>
          </label>

          <label>
            Publication status
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as 'draft' | 'published' })}
            >
              <option value="draft">Save as draft — only visible in Management</option>
              <option value="published">Publish — visible to creators in Events</option>
            </select>
          </label>

          <div className="announcement-editor-actions">
            <button type="button" className="announcement-secondary-button" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="announcement-primary-button" disabled={saving}>
              {saving ? 'Saving...' : form.status === 'published' ? <><Send size={16} /> Publish announcement</> : <><Save size={16} /> Save draft</>}
            </button>
          </div>
        </form>
      )}

      <div className="announcement-list-heading">
        <h3>All announcements</h3>
        <span>{announcements.length} total</span>
      </div>

      {loading ? (
        <div className="announcement-empty">Loading announcements...</div>
      ) : announcements.length === 0 ? (
        <div className="announcement-empty">
          <Radio size={28} />
          <h3>No announcements yet</h3>
          <p>Create your first announcement. You can save it as a draft or publish it to the creator app.</p>
          <button className="announcement-primary-button" onClick={openCreate}>
            <Plus size={16} /> Create announcement
          </button>
        </div>
      ) : (
        <div className="announcement-list">
          {announcements.map((item) => (
            <article className="announcement-item" key={item.id}>
              <div className="announcement-item-main">
                <div className="announcement-item-meta">
                  <span className={`announcement-status ${item.status}`}>
                    {item.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                  <span>Updated {new Date(item.updated_at).toLocaleDateString()}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                {item.status === 'published' && item.published_at && (
                  <small>Published {new Date(item.published_at).toLocaleString()}</small>
                )}
              </div>
              <div className="announcement-item-actions">
                <button className="announcement-secondary-button" onClick={() => openEdit(item)}>
                  <Pencil size={15} /> Edit
                </button>
                <button
                  className="announcement-danger-button"
                  onClick={() => void deleteAnnouncement(item)}
                  disabled={deletingId === item.id}
                >
                  <Trash2 size={15} /> {deletingId === item.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}