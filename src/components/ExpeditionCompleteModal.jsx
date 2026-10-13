import { useEffect, useState } from 'react';
import { Camera, MapPin, Clock, Send, X, Trash2 } from 'lucide-react';
import { extractExifMeta } from '../lib/exifUtils';
import './ExpeditionMode.css';

/**
 * Finish an expedition: attach a summit/endpoint photo and submit,
 * end without submitting, or go back and keep recording.
 */
export default function ExpeditionCompleteModal({ adventureName, onSubmit, onDiscard, onCancel }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [exif, setExif] = useState(undefined); // undefined = not read yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handleFile = async (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError(null);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setExif(undefined);
    setExif(await extractExifMeta(picked));
  };

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  };

  return (
    <div className="check-in-modal-overlay expedition-modal-overlay">
      <div className="expedition-modal glass-panel animate-scale-in" role="dialog" aria-label="Complete expedition">
        <h2>Complete {adventureName}</h2>
        <p className="expedition-hint">Add a photo from the summit or endpoint. It's matched with your GPS track for verification.</p>

        <label className="expedition-photo-picker">
          {previewUrl
            ? <img src={previewUrl} alt="Summit preview" />
            : <span><Camera size={22} /> Add summit photo</span>}
          <input type="file" accept="image/*" onChange={handleFile} disabled={busy} data-testid="summit-photo-input" />
        </label>

        {file && exif !== undefined && (
          <div className="expedition-exif">
            <span className={exif?.lat != null ? 'ok' : 'warn'}>
              <MapPin size={12} /> {exif?.lat != null ? 'Photo location found' : 'No location in photo; your GPS track will be used'}
            </span>
            <span className={exif?.takenAt ? 'ok' : 'warn'}>
              <Clock size={12} /> {exif?.takenAt ? `Taken ${new Date(exif.takenAt).toLocaleString()}` : 'No capture time in photo'}
            </span>
          </div>
        )}

        {error && <div className="expedition-warn"><span>{error}</span></div>}

        <div className="modal-buttons expedition-modal-buttons">
          <button
            className="check-in-btn-primary"
            disabled={!file || busy}
            onClick={() => run(() => onSubmit(file))}
          >
            <Send size={18} />
            {busy ? 'Submitting…' : 'Submit Expedition & End Trek'}
          </button>

          {!confirmDiscard ? (
            <button className="end-trek-btn-secondary" disabled={busy} onClick={() => setConfirmDiscard(true)}>
              <Trash2 size={16} /> End without submitting
            </button>
          ) : (
            <button className="end-trek-btn-secondary danger" disabled={busy} onClick={() => run(onDiscard)}>
              <Trash2 size={16} /> Confirm: delete this recording
            </button>
          )}

          <button className="dismiss-btn" disabled={busy} onClick={onCancel}>
            <X size={14} /> Keep recording
          </button>
        </div>
      </div>
    </div>
  );
}
