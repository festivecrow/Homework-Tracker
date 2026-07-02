import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase-client.js';
import { pushSupported, isPushEnabledForThisDevice, enablePushForThisDevice, disablePushForThisDevice } from './push.js';

// ---- Design tokens ----
// Palette: charcoal court background, warm chalk text, amber "shot clock" urgency accent,
// alarm-red for overdue, court-teal for done/safe.
const COLORS = {
  bg: '#171A21',
  panel: '#1F232C',
  panelBorder: '#2C313D',
  chalk: '#F1EDE4',
  chalkDim: '#9BA1AE',
  amber: '#FF7A29',
  red: '#E8483C',
  teal: '#2FBF9F',
  gold: '#E8B94A',
};

const DISPLAY_FONT = "'Bebas Neue', 'Oswald', 'Arial Narrow', sans-serif";
const BODY_FONT = "'Inter', -apple-system, 'Segoe UI', sans-serif";
const MONO_FONT = "'Space Mono', 'Courier New', monospace";

function loadFont() {
  if (document.getElementById('hwt-fonts')) return;
  const link = document.createElement('link');
  link.id = 'hwt-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@500;700&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap';
  document.head.appendChild(link);
}

const STORAGE_KEY = 'assignments-v1';
const TESTS_KEY = 'tests-v1';
const PROFILE_KEY = 'profile-v1';

const CLASS_COLORS = ['#FF7A29', '#2FBF9F', '#E8B94A', '#6C8CFF', '#E8483C', '#B084F0', '#4FC3E8'];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function toDateInputValue(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function classColor(index) {
  return CLASS_COLORS[index % CLASS_COLORS.length];
}

function daysHoursLeft(dueISO) {
  const now = new Date();
  const due = new Date(dueISO);
  const diffMs = due - now;
  const diffH = diffMs / 36e5;
  return { diffMs, diffH };
}

function urgencyOf(dueISO, done) {
  if (done) return 'done';
  const { diffH } = daysHoursLeft(dueISO);
  if (diffH < 0) return 'overdue';
  if (diffH <= 24) return 'today';
  if (diffH <= 24 * 7) return 'week';
  return 'later';
}

function clockLabel(dueISO, done) {
  if (done) return 'DONE';
  const { diffMs, diffH } = daysHoursLeft(dueISO);
  const absH = Math.abs(diffH);
  const days = Math.floor(absH / 24);
  const hours = Math.floor(absH % 24);
  const sign = diffMs < 0 ? '-' : '';
  if (days === 0 && hours === 0) return sign + '<1H';
  if (days === 0) return `${sign}${hours}H`;
  return `${sign}${days}D ${hours}H`;
}

const URGENCY_META = {
  overdue: { label: 'OVERDUE', color: COLORS.red },
  today: { label: 'DUE TODAY', color: COLORS.amber },
  week: { label: 'THIS WEEK', color: COLORS.gold },
  later: { label: 'LATER', color: COLORS.chalkDim },
  done: { label: 'DONE', color: COLORS.teal },
};

const TEST_URGENCY_META = {
  overdue: { label: 'PAST', color: COLORS.chalkDim },
  today: { label: 'TODAY', color: COLORS.red },
  week: { label: 'THIS WEEK', color: COLORS.amber },
  later: { label: 'COMING UP', color: COLORS.gold },
  done: { label: 'STUDIED', color: COLORS.teal },
};

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

// Default reminder schedule: how far in advance you get notified scales with
// how much lead time the assignment had when it was created. Nothing fires
// for assignments already marked done, and nothing fires for times already past.
function computeReminders(assignment, profile) {
  if (assignment.done) return [];
  const due = new Date(assignment.due);
  const created = new Date(assignment.createdAt);
  const leadDays = (due - created) / DAY_MS;
  const now = new Date();
  const reminders = [];

  const add = (msBefore, label) => {
    const t = new Date(due.getTime() - msBefore);
    if (t > now) reminders.push({ time: t, label, id: `${assignment.id}-${label}` });
  };

  if (leadDays >= 10) add(7 * DAY_MS, '1 week before');
  if (leadDays >= 4) add(2 * DAY_MS, '2 days before');
  if (leadDays >= 2) add(1 * DAY_MS, '1 day before');
  if (assignment.turnin === 'online' && leadDays < 2) {
    add(5 * HOUR_MS, '5 hours before');
    add(1 * HOUR_MS, '1 hour before');
  }

  if (profile && profile.customReminderTime) {
    const dayBefore = new Date(due);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const [hh, mm] = profile.customReminderTime.split(':').map(Number);
    dayBefore.setHours(hh, mm, 0, 0);
    if (dayBefore > now && dayBefore < due) {
      reminders.push({ time: dayBefore, label: 'Your reminder', id: `${assignment.id}-custom` });
    }
  }

  return reminders.sort((a, b) => a.time - b.time);
}

const GROUP_ORDER = ['overdue', 'today', 'week', 'later', 'done'];

function ScoreboardBadge({ dueISO, done }) {
  const urgency = urgencyOf(dueISO, done);
  const meta = URGENCY_META[urgency];
  return (
    <div
      style={{
        fontFamily: MONO_FONT,
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: 1,
        color: urgency === 'done' ? COLORS.teal : meta.color,
        background: 'rgba(0,0,0,0.28)',
        border: `1px solid ${meta.color}55`,
        borderRadius: 6,
        padding: '4px 8px',
        minWidth: 62,
        textAlign: 'center',
        flexShrink: 0,
      }}
    >
      {clockLabel(dueISO, done)}
    </div>
  );
}

function AssignmentForm({ onSave, onClose, classes, editing, onSaveTemplate }) {
  const editDue = editing ? new Date(editing.due) : null;

  const [title, setTitle] = useState(editing ? editing.title : '');
  const [classId, setClassId] = useState(editing ? (editing.classId || '') : (classes[0]?.id || ''));
  const [turnin, setTurnin] = useState(editing ? editing.turnin : 'person');
  const [date, setDate] = useState(editing ? toDateInputValue(editDue) : '');
  const [time, setTime] = useState(
    editing && editing.turnin === 'online'
      ? `${String(editDue.getHours()).padStart(2, '0')}:${String(editDue.getMinutes()).padStart(2, '0')}`
      : '23:59'
  );
  const [notes, setNotes] = useState(editing ? editing.notes : '');
  const [error, setError] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  const selectedClass = classes.find((c) => c.id === classId);
  const templates = (selectedClass && selectedClass.templates) || [];

  const applyTemplate = (tpl) => {
    setTitle(tpl.title);
    setTurnin(tpl.turnin);
    if (tpl.turnin === 'online' && tpl.time) setTime(tpl.time);
  };

  const submit = () => {
    if (!title.trim()) { setError('Give it a title.'); return; }
    if (!date) { setError('Pick a due date.'); return; }
    if (turnin === 'online' && !time) { setError('Add the exact time it\'s due.'); return; }
    const effectiveTime = turnin === 'online' ? time : '23:59';
    const dueISO = new Date(`${date}T${effectiveTime}`).toISOString();
    const cls = classes.find((c) => c.id === classId);
    onSave({
      id: editing ? editing.id : uid(),
      title: title.trim(),
      classId: cls ? cls.id : null,
      subject: cls ? cls.name : '',
      turnin,
      due: dueISO,
      notes: notes.trim(),
      done: editing ? editing.done : false,
      createdAt: editing ? editing.createdAt : new Date().toISOString(),
    });
    if (saveAsTemplate && cls && onSaveTemplate) {
      onSaveTemplate(cls.id, {
        id: uid(),
        title: title.trim(),
        turnin,
        time: turnin === 'online' ? time : null,
      });
    }
    onClose();
  };

  const inputStyle = {
    width: '100%',
    background: '#14171D',
    border: `1px solid ${COLORS.panelBorder}`,
    borderRadius: 8,
    color: COLORS.chalk,
    fontFamily: BODY_FONT,
    fontSize: 15,
    padding: '10px 12px',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle = {
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.6,
    color: COLORS.chalkDim,
    textTransform: 'uppercase',
    marginBottom: 6,
    display: 'block',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,11,14,0.72)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.panel,
          borderTop: `1px solid ${COLORS.panelBorder}`,
          borderRadius: '18px 18px 0 0',
          width: '100%',
          maxWidth: 480,
          padding: '20px 20px 28px',
          boxSizing: 'border-box',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          width: 40, height: 4, borderRadius: 2, background: COLORS.panelBorder,
          margin: '0 auto 18px',
        }} />
        <h2 style={{
          fontFamily: DISPLAY_FONT, fontSize: 28, letterSpacing: 0.5,
          color: COLORS.chalk, margin: '0 0 18px',
        }}>{editing ? 'Edit assignment' : 'New assignment'}</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>What is it</label>
          <input style={inputStyle} placeholder="Ch. 7 problem set" value={title}
            onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Class</label>
          {classes.length > 0 ? (
            <select
              style={{ ...inputStyle, appearance: 'none' }}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">No class (unassigned)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 13, color: COLORS.chalkDim }}>
              No classes yet — add one from Settings first.
            </div>
          )}
        </div>

        {!editing && templates.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Common for {selectedClass.name}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  style={{
                    background: 'transparent', border: `1px solid ${COLORS.panelBorder}`,
                    color: COLORS.chalk, borderRadius: 20, padding: '6px 12px',
                    fontFamily: BODY_FONT, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {tpl.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Turn in</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {[{ id: 'person', label: 'In person' }, { id: 'online', label: 'Online' }].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTurnin(opt.id)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                  fontFamily: BODY_FONT, fontSize: 14, fontWeight: 600,
                  border: `1px solid ${turnin === opt.id ? COLORS.amber : COLORS.panelBorder}`,
                  background: turnin === opt.id ? `${COLORS.amber}22` : 'transparent',
                  color: turnin === opt.id ? COLORS.amber : COLORS.chalkDim,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Due date</label>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() + 1);
              setDate(toDateInputValue(d));
            }}
            style={{
              width: '100%', background: 'transparent', border: `1px solid ${COLORS.panelBorder}`,
              color: COLORS.chalk, borderRadius: 8, padding: '9px 0', marginBottom: 8,
              fontFamily: BODY_FONT, fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
            }}
          >Tomorrow</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <input style={inputStyle} type="date" value={date}
              onChange={(e) => setDate(e.target.value)} />
          </div>
          {turnin === 'online' && (
            <div style={{ width: 120 }}>
              <label style={labelStyle}>Exact time</label>
              <input style={inputStyle} type="time" value={time}
                onChange={(e) => setTime(e.target.value)} />
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Notes (optional)</label>
          <input style={inputStyle} placeholder="Bring calculator" value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && (
          <div style={{ color: COLORS.red, fontFamily: BODY_FONT, fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {selectedClass && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: COLORS.amber }}
            />
            <span style={{ fontFamily: BODY_FONT, fontSize: 13.5, color: COLORS.chalkDim }}>
              Save as a common assignment for {selectedClass.name}
            </span>
          </label>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: 'transparent', border: `1px solid ${COLORS.panelBorder}`,
            color: COLORS.chalkDim, borderRadius: 10, padding: '12px 0',
            fontFamily: BODY_FONT, fontWeight: 600, fontSize: 15, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={submit} style={{
            flex: 2, background: COLORS.amber, border: 'none',
            color: '#1A1300', borderRadius: 10, padding: '12px 0',
            fontFamily: BODY_FONT, fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}>{editing ? 'Save changes' : 'Add assignment'}</button>
        </div>
      </div>
    </div>
  );
}

function TestForm({ onSave, onClose, classes, editing }) {
  const editDate = editing ? new Date(editing.due) : null;

  const [title, setTitle] = useState(editing ? editing.title : '');
  const [classId, setClassId] = useState(editing ? (editing.classId || '') : (classes[0]?.id || ''));
  const [date, setDate] = useState(editing ? toDateInputValue(editDate) : '');
  const [notes, setNotes] = useState(editing ? editing.notes : '');
  const [error, setError] = useState('');

  const submit = () => {
    if (!title.trim()) { setError('Give it a title.'); return; }
    if (!date) { setError('Pick the test date.'); return; }
    const cls = classes.find((c) => c.id === classId);
    const dueISO = new Date(`${date}T12:00`).toISOString();
    onSave({
      id: editing ? editing.id : uid(),
      title: title.trim(),
      classId: cls ? cls.id : null,
      subject: cls ? cls.name : '',
      due: dueISO,
      notes: notes.trim(),
      done: editing ? editing.done : false,
      createdAt: editing ? editing.createdAt : new Date().toISOString(),
    });
    onClose();
  };

  const inputStyle = {
    width: '100%', background: '#14171D', border: `1px solid ${COLORS.panelBorder}`,
    borderRadius: 8, color: COLORS.chalk, fontFamily: BODY_FONT, fontSize: 15,
    padding: '10px 12px', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = {
    fontFamily: BODY_FONT, fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
    color: COLORS.chalkDim, textTransform: 'uppercase', marginBottom: 6, display: 'block',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,11,14,0.72)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.panel, borderTop: `1px solid ${COLORS.panelBorder}`,
          borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 480,
          padding: '20px 20px 28px', boxSizing: 'border-box', boxShadow: '0 -8px 30px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: COLORS.panelBorder, margin: '0 auto 18px' }} />
        <h2 style={{
          fontFamily: DISPLAY_FONT, fontSize: 28, letterSpacing: 0.5,
          color: COLORS.chalk, margin: '0 0 18px',
        }}>{editing ? 'Edit test' : 'New test or quiz'}</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>What's it on</label>
          <input style={inputStyle} placeholder="Unit 4 exam" value={title}
            onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Class</label>
          {classes.length > 0 ? (
            <select
              style={{ ...inputStyle, appearance: 'none' }}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">No class (unassigned)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 13, color: COLORS.chalkDim }}>
              No classes yet — add one from Settings first.
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Test date</label>
          <input style={inputStyle} type="date" value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>What to study (optional)</label>
          <input style={inputStyle} placeholder="Chapters 4 to 6, vocab list" value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && (
          <div style={{ color: COLORS.red, fontFamily: BODY_FONT, fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: 'transparent', border: `1px solid ${COLORS.panelBorder}`,
            color: COLORS.chalkDim, borderRadius: 10, padding: '12px 0',
            fontFamily: BODY_FONT, fontWeight: 600, fontSize: 15, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={submit} style={{
            flex: 2, background: COLORS.amber, border: 'none',
            color: '#1A1300', borderRadius: 10, padding: '12px 0',
            fontFamily: BODY_FONT, fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}>{editing ? 'Save changes' : 'Add test'}</button>
        </div>
      </div>
    </div>
  );
}

function TestRow({ item, onToggle, onDelete, onEdit, classColorMap, classNameMap }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const due = new Date(item.due);
  const dateLabel = due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const dotColor = item.classId ? classColorMap[item.classId] : null;
  const className = item.classId ? (classNameMap[item.classId] || item.subject) : item.subject;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`,
      borderRadius: 12, padding: '12px 14px', marginBottom: 8,
    }}>
      <button
        onClick={() => onToggle(item.id)}
        aria-label={item.done ? 'Mark as not studied' : 'Mark studied'}
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          border: `1px solid ${item.done ? COLORS.teal : COLORS.panelBorder}`,
          background: item.done ? `${COLORS.teal}22` : 'transparent',
          color: item.done ? COLORS.teal : COLORS.chalkDim,
          borderRadius: 8, padding: '7px 10px', cursor: 'pointer',
          fontFamily: BODY_FONT, fontSize: 12, fontWeight: 700,
        }}
      >
        {item.done ? (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M2 8.5L6 12.5L14 3.5" stroke={COLORS.teal} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span style={{ width: 12, height: 12, borderRadius: 3, border: `1.6px solid ${COLORS.chalkDim}`, display: 'block' }} />
        )}
        {item.done ? 'Studied' : 'Mark studied'}
      </button>

      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEdit(item)}>
        <div style={{
          fontFamily: BODY_FONT, fontWeight: 600, fontSize: 15.5,
          color: item.done ? COLORS.chalkDim : COLORS.chalk,
          textDecoration: item.done ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title}
        </div>
        <div style={{
          fontFamily: BODY_FONT, fontSize: 12.5, color: COLORS.chalkDim, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {dotColor && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[className, dateLabel, item.notes].filter(Boolean).join('  ·  ')}
          </span>
        </div>
      </div>

      <ScoreboardBadge dueISO={item.due} done={item.done} />

      <button onClick={() => onEdit(item)} aria-label="Edit" style={{
        background: 'transparent', border: 'none', color: COLORS.chalkDim,
        cursor: 'pointer', padding: 4, flexShrink: 0, display: 'flex',
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </button>

      {confirmDelete ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onDelete(item.id)} style={{
            background: COLORS.red, border: 'none', color: '#fff', borderRadius: 6,
            fontFamily: BODY_FONT, fontSize: 11, fontWeight: 700, padding: '6px 8px', cursor: 'pointer',
          }}>Delete</button>
          <button onClick={() => setConfirmDelete(false)} style={{
            background: 'transparent', border: `1px solid ${COLORS.panelBorder}`, color: COLORS.chalkDim,
            borderRadius: 6, fontFamily: BODY_FONT, fontSize: 11, padding: '6px 8px', cursor: 'pointer',
          }}>Keep</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} aria-label="Delete" style={{
          background: 'transparent', border: 'none', color: COLORS.chalkDim,
          fontSize: 18, cursor: 'pointer', padding: 4, flexShrink: 0, lineHeight: 1,
        }}>×</button>
      )}
    </div>
  );
}


function Row({ item, onToggle, onDelete, onEdit, classColorMap, classNameMap }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const due = new Date(item.due);
  const dateLabel = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + (item.turnin === 'online' ? ' at ' + due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
  const dotColor = item.classId ? classColorMap[item.classId] : null;
  const className = item.classId ? (classNameMap[item.classId] || item.subject) : item.subject;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`,
      borderRadius: 12, padding: '12px 14px', marginBottom: 8,
    }}>
      <button
        onClick={() => onToggle(item.id)}
        aria-label={item.done ? 'Mark as not complete' : 'Mark complete'}
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          border: `1px solid ${item.done ? COLORS.teal : COLORS.panelBorder}`,
          background: item.done ? `${COLORS.teal}22` : 'transparent',
          color: item.done ? COLORS.teal : COLORS.chalkDim,
          borderRadius: 8, padding: '7px 10px', cursor: 'pointer',
          fontFamily: BODY_FONT, fontSize: 12, fontWeight: 700,
        }}
      >
        {item.done ? (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M2 8.5L6 12.5L14 3.5" stroke={COLORS.teal} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span style={{ width: 12, height: 12, borderRadius: 3, border: `1.6px solid ${COLORS.chalkDim}`, display: 'block' }} />
        )}
        {item.done ? 'Completed' : 'Mark complete'}
      </button>

      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEdit(item)}>
        <div style={{
          fontFamily: BODY_FONT, fontWeight: 600, fontSize: 15.5,
          color: item.done ? COLORS.chalkDim : COLORS.chalk,
          textDecoration: item.done ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title}
        </div>
        <div style={{
          fontFamily: BODY_FONT, fontSize: 12.5, color: COLORS.chalkDim, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {dotColor && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
            {item.turnin === 'online' ? (
              <>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9s1.3-6.4 3.8-9Z" stroke="currentColor" strokeWidth="1.4" />
              </>
            ) : (
              <>
                <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </>
            )}
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[className, dateLabel, item.notes].filter(Boolean).join('  ·  ')}
          </span>
        </div>
      </div>

      <ScoreboardBadge dueISO={item.due} done={item.done} />

      <button onClick={() => onEdit(item)} aria-label="Edit" style={{
        background: 'transparent', border: 'none', color: COLORS.chalkDim,
        cursor: 'pointer', padding: 4, flexShrink: 0, display: 'flex',
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </button>

      {confirmDelete ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onDelete(item.id)} style={{
            background: COLORS.red, border: 'none', color: '#fff', borderRadius: 6,
            fontFamily: BODY_FONT, fontSize: 11, fontWeight: 700, padding: '6px 8px', cursor: 'pointer',
          }}>Delete</button>
          <button onClick={() => setConfirmDelete(false)} style={{
            background: 'transparent', border: `1px solid ${COLORS.panelBorder}`, color: COLORS.chalkDim,
            borderRadius: 6, fontFamily: BODY_FONT, fontSize: 11, padding: '6px 8px', cursor: 'pointer',
          }}>Keep</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} aria-label="Delete" style={{
          background: 'transparent', border: 'none', color: COLORS.chalkDim,
          fontSize: 18, cursor: 'pointer', padding: 4, flexShrink: 0, lineHeight: 1,
        }}>×</button>
      )}
    </div>
  );
}

function ClassRow({ c, onUpdate, onRemove, onRemoveTemplate, assignmentCount }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(c.name);

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== c.name) onUpdate({ ...c, name: trimmed });
    else setName(c.name);
  };

  return (
    <div style={{
      background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`,
      borderRadius: 8, padding: '9px 12px', marginBottom: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontFamily: BODY_FONT, fontSize: 14.5, color: COLORS.chalk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.name}
        </span>
        <button onClick={() => setExpanded((v) => !v)} aria-label="Edit class" style={{
          background: 'transparent', border: 'none', color: COLORS.chalkDim,
          cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </button>
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onRemove(c.id)} style={{
              background: COLORS.red, border: 'none', color: '#fff', borderRadius: 6,
              fontFamily: BODY_FONT, fontSize: 11, fontWeight: 700, padding: '5px 7px', cursor: 'pointer',
            }}>Delete</button>
            <button onClick={() => setConfirmDelete(false)} style={{
              background: 'transparent', border: `1px solid ${COLORS.panelBorder}`, color: COLORS.chalkDim,
              borderRadius: 6, fontFamily: BODY_FONT, fontSize: 11, padding: '5px 7px', cursor: 'pointer',
            }}>Keep</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} aria-label="Remove class" style={{
            background: 'transparent', border: 'none', color: COLORS.chalkDim,
            fontSize: 17, cursor: 'pointer', padding: 2, lineHeight: 1, flexShrink: 0,
          }}>×</button>
        )}
      </div>

      {confirmDelete && (
        <div style={{ fontSize: 12, color: COLORS.chalkDim, marginTop: 8 }}>
          {assignmentCount > 0
            ? `This removes ${c.name} and unlinks ${assignmentCount} assignment${assignmentCount === 1 ? '' : 's'} from it. Their entries stay, just without a class.`
            : `This removes ${c.name}${(c.templates || []).length > 0 ? ' and its saved common assignments' : ''}.`}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.panelBorder}` }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitName(); } }}
            style={{
              width: '100%', background: '#14171D', border: `1px solid ${COLORS.panelBorder}`,
              borderRadius: 8, color: COLORS.chalk, fontFamily: BODY_FONT, fontSize: 14,
              padding: '8px 10px', outline: 'none', boxSizing: 'border-box', marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {CLASS_COLORS.map((hex) => (
              <button
                key={hex}
                onClick={() => onUpdate({ ...c, color: hex })}
                aria-label={`Set color ${hex}`}
                style={{
                  width: 24, height: 24, borderRadius: '50%', background: hex, cursor: 'pointer',
                  border: c.color === hex ? `2px solid ${COLORS.chalk}` : '2px solid transparent',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {(c.templates || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 19 }}>
          {c.templates.map((t) => (
            <span key={t.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: '#14171D', border: `1px solid ${COLORS.panelBorder}`,
              borderRadius: 20, padding: '3px 8px', fontSize: 12, color: COLORS.chalkDim,
            }}>
              {t.title}
              <i
                onClick={() => onRemoveTemplate(c.id, t.id)}
                role="button"
                aria-label={`Remove ${t.title}`}
                style={{ cursor: 'pointer', fontStyle: 'normal' }}
              >×</i>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ClassEditor({ classes, setClasses, items = [] }) {
  const [draft, setDraft] = useState('');

  const inputStyle = {
    flex: 1,
    background: '#14171D',
    border: `1px solid ${COLORS.panelBorder}`,
    borderRadius: 8,
    color: COLORS.chalk,
    fontFamily: BODY_FONT,
    fontSize: 15,
    padding: '10px 12px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const addClass = () => {
    const name = draft.trim();
    if (!name) return;
    setClasses((prev) => [...prev, { id: uid(), name, templates: [], color: classColor(prev.length) }]);
    setDraft('');
  };

  const removeClass = (id) => setClasses((prev) => prev.filter((c) => c.id !== id));
  const updateClass = (updated) => setClasses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  const removeTemplate = (classId, templateId) => setClasses((prev) =>
    prev.map((c) => c.id === classId
      ? { ...c, templates: (c.templates || []).filter((t) => t.id !== templateId) }
      : c
    )
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          style={inputStyle}
          placeholder="e.g. Algebra II"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addClass(); } }}
        />
        <button onClick={addClass} style={{
          background: COLORS.amber, border: 'none', color: '#1A1300', borderRadius: 8,
          padding: '0 18px', fontFamily: BODY_FONT, fontWeight: 700, fontSize: 15, cursor: 'pointer',
        }}>Add</button>
      </div>

      {classes.length === 0 && (
        <div style={{ fontSize: 13, color: COLORS.chalkDim, marginBottom: 8 }}>
          Add at least one class to get started.
        </div>
      )}

      <div>
        {classes.map((c, idx) => (
          <ClassRow
            key={c.id}
            c={{ ...c, color: c.color || classColor(idx) }}
            onUpdate={updateClass}
            onRemove={removeClass}
            onRemoveTemplate={removeTemplate}
            assignmentCount={items.filter((i) => i.classId === c.id).length}
          />
        ))}
      </div>
    </div>
  );
}

function Onboarding({ onComplete }) {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState('');

  const labelStyle = {
    fontFamily: BODY_FONT, fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
    color: COLORS.chalkDim, textTransform: 'uppercase', marginBottom: 6, display: 'block',
  };
  const inputStyle = {
    width: '100%', background: '#14171D', border: `1px solid ${COLORS.panelBorder}`,
    borderRadius: 8, color: COLORS.chalk, fontFamily: BODY_FONT, fontSize: 15,
    padding: '10px 12px', outline: 'none', boxSizing: 'border-box',
  };

  const finish = () => {
    if (classes.length === 0) { setError('Add at least one class before you start.'); return; }
    onComplete({ name: name.trim(), school: school.trim(), classes });
  };

  return (
    <div style={{
      fontFamily: BODY_FONT, background: COLORS.bg, minHeight: '100vh',
      color: COLORS.chalk, padding: '32px 20px 40px', boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <div style={{
          fontFamily: BODY_FONT, fontSize: 11, letterSpacing: 1.5,
          color: COLORS.amber, textTransform: 'uppercase', marginBottom: 4,
        }}>Welcome to</div>
        <h1 style={{ fontFamily: DISPLAY_FONT, fontSize: 44, margin: '0 0 24px', lineHeight: 1 }}>
          The Homework Tracker
        </h1>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Your name (optional)</label>
          <input style={inputStyle} placeholder="Caleb" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>School (optional)</label>
          <input style={inputStyle} placeholder="e.g. Central High School" value={school} onChange={(e) => setSchool(e.target.value)} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Your classes</label>
          <ClassEditor classes={classes} setClasses={setClasses} />
        </div>

        {error && (
          <div style={{ color: COLORS.red, fontSize: 13, margin: '10px 0' }}>{error}</div>
        )}

        <button onClick={finish} style={{
          width: '100%', background: COLORS.amber, border: 'none', color: '#1A1300',
          borderRadius: 10, padding: '14px 0', fontFamily: BODY_FONT, fontWeight: 700,
          fontSize: 16, cursor: 'pointer', marginTop: 14,
        }}>Start tracking</button>
      </div>
    </div>
  );
}

function SettingsPanel({ profile, setProfile, onClose, items, tests, onImportData }) {
  const [name, setName] = useState(profile.name);
  const [school, setSchool] = useState(profile.school);
  const [classes, setClasses] = useState(profile.classes);
  const [customReminderTime, setCustomReminderTime] = useState(profile.customReminderTime || '');
  const [customReminderOn, setCustomReminderOn] = useState(Boolean(profile.customReminderTime));
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = React.useRef(null);

  const [pushState, setPushState] = useState('checking'); // checking | unsupported | off | on | error
  const [pushError, setPushError] = useState('');

  useEffect(() => {
    (async () => {
      if (!pushSupported()) { setPushState('unsupported'); return; }
      const enabled = await isPushEnabledForThisDevice();
      setPushState(enabled ? 'on' : 'off');
    })();
  }, []);

  const togglePush = async () => {
    setPushError('');
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user && data.user.id;
      if (!userId) throw new Error('Not signed in.');
      if (pushState === 'on') {
        await disablePushForThisDevice(userId);
        setPushState('off');
      } else {
        await enablePushForThisDevice(userId);
        setPushState('on');
      }
    } catch (err) {
      setPushError(err.message || 'Something went wrong turning that on.');
    }
  };

  const labelStyle = {
    fontFamily: BODY_FONT, fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
    color: COLORS.chalkDim, textTransform: 'uppercase', marginBottom: 6, display: 'block',
  };
  const inputStyle = {
    width: '100%', background: '#14171D', border: `1px solid ${COLORS.panelBorder}`,
    borderRadius: 8, color: COLORS.chalk, fontFamily: BODY_FONT, fontSize: 15,
    padding: '10px 12px', outline: 'none', boxSizing: 'border-box',
  };

  const save = () => {
    setProfile({
      name: name.trim(),
      school: school.trim(),
      classes,
      customReminderTime: customReminderOn ? customReminderTime : '',
    });
    onClose();
  };

  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile: { name, school, classes, customReminderTime: customReminderOn ? customReminderTime : '' },
      items,
      tests,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = toDateInputValue(new Date());
    a.href = url;
    a.download = `homework-tracker-backup-${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImportError('');
    setImportSuccess(false);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !parsed.profile || !Array.isArray(parsed.items)) {
          setImportError('That file doesn\'t look like a backup from this app.');
          return;
        }
        onImportData({
          profile: parsed.profile,
          items: parsed.items,
          tests: Array.isArray(parsed.tests) ? parsed.tests : [],
        });
        setImportSuccess(true);
      } catch (err) {
        setImportError('Couldn\'t read that file. Make sure it\'s a backup exported from here.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,11,14,0.72)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: COLORS.panel, borderTop: `1px solid ${COLORS.panelBorder}`,
        borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 480,
        padding: '20px 20px 28px', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: COLORS.panelBorder, margin: '0 auto 18px' }} />
        <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 28, color: COLORS.chalk, margin: '0 0 18px' }}>Settings</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Your name</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>School</label>
          <input style={inputStyle} value={school} onChange={(e) => setSchool(e.target.value)} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>Classes</label>
          <ClassEditor classes={classes} setClasses={setClasses} items={items} />
        </div>

        <div style={{
          borderTop: `1px solid ${COLORS.panelBorder}`, paddingTop: 18, marginBottom: 22,
        }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 20, color: COLORS.chalk, marginBottom: 10 }}>
            Notifications
          </div>

          <div style={{
            background: '#14171D', border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8,
            padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: COLORS.chalkDim, lineHeight: 1.6,
          }}>
            Default reminders (everyone gets these):
            <br />• 1 week before — if assigned 10+ days out
            <br />• 2 days before — if assigned 4+ days out
            <br />• 1 day before — if assigned 2+ days out
            <br />• 5 hours and 1 hour before — online only, when due within a day
            <br /><br />
            Marking an assignment complete cancels its remaining reminders.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: customReminderOn ? 10 : 0 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Your own reminder time</label>
            <button
              onClick={() => setCustomReminderOn((v) => !v)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 2,
                background: customReminderOn ? COLORS.amber : COLORS.panelBorder,
                display: 'flex', justifyContent: customReminderOn ? 'flex-end' : 'flex-start',
              }}
              aria-label="Toggle personal reminder"
            >
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: COLORS.chalk, display: 'block' }} />
            </button>
          </div>

          {customReminderOn && (
            <>
              <input
                style={inputStyle}
                type="time"
                value={customReminderTime}
                onChange={(e) => setCustomReminderTime(e.target.value)}
              />
              <div style={{ fontSize: 12, color: COLORS.chalkDim, marginTop: 6 }}>
                Adds one extra reminder the day before each due date, timed for when you're actually home — after practice, for example.
              </div>
            </>
          )}

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${COLORS.panelBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Notify this device</label>
              {pushState !== 'checking' && pushState !== 'unsupported' && (
                <button
                  onClick={togglePush}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 2,
                    background: pushState === 'on' ? COLORS.amber : COLORS.panelBorder,
                    display: 'flex', justifyContent: pushState === 'on' ? 'flex-end' : 'flex-start',
                  }}
                  aria-label="Toggle push notifications on this device"
                >
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: COLORS.chalk, display: 'block' }} />
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: COLORS.chalkDim, lineHeight: 1.5 }}>
              {pushState === 'unsupported' && "This browser doesn't support push notifications."}
              {pushState === 'checking' && 'Checking…'}
              {pushState === 'off' && 'Turn this on to get real notifications on this device when reminders come due — not just the in-app list.'}
              {pushState === 'on' && "This device will get real notifications, even if the app isn't open."}
            </div>
            {pushError && (
              <div style={{ fontSize: 12, color: COLORS.red, marginTop: 6 }}>{pushError}</div>
            )}
          </div>
        </div>

        <div style={{
          borderTop: `1px solid ${COLORS.panelBorder}`, paddingTop: 18, marginBottom: 22,
        }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 20, color: COLORS.chalk, marginBottom: 10 }}>
            Backup
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.chalkDim, marginBottom: 12, lineHeight: 1.6 }}>
            Everything here lives only in this preview. Download a backup now and then so you never lose it, and use it to move your data if you switch devices.
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <button type="button" onClick={exportData} style={{
              flex: 1, background: 'transparent', border: `1px solid ${COLORS.panelBorder}`,
              color: COLORS.chalk, borderRadius: 8, padding: '10px 0',
              fontFamily: BODY_FONT, fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
            }}>Download backup</button>
            <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} style={{
              flex: 1, background: 'transparent', border: `1px solid ${COLORS.panelBorder}`,
              color: COLORS.chalk, borderRadius: 8, padding: '10px 0',
              fontFamily: BODY_FONT, fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
            }}>Restore backup</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
          </div>
          {importError && (
            <div style={{ fontSize: 12, color: COLORS.red }}>{importError}</div>
          )}
          {importSuccess && (
            <div style={{ fontSize: 12, color: COLORS.teal }}>Restored. Close settings to see it.</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: 'transparent', border: `1px solid ${COLORS.panelBorder}`,
            color: COLORS.chalkDim, borderRadius: 10, padding: '12px 0',
            fontFamily: BODY_FONT, fontWeight: 600, fontSize: 15, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={save} style={{
            flex: 2, background: COLORS.amber, border: 'none', color: '#1A1300',
            borderRadius: 10, padding: '12px 0', fontFamily: BODY_FONT, fontWeight: 700,
            fontSize: 15, cursor: 'pointer',
          }}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function HomeworkTracker() {
  const [items, setItems] = useState([]);
  const [tests, setTests] = useState([]);
  const [testsLoaded, setTestsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('homework');
  const [profile, setProfile] = useState(null); // null = not loaded yet, {} shape once loaded
  const [loaded, setLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingTest, setEditingTest] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [hideStudied, setHideStudied] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => { loadFont(); }, []);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) setItems(JSON.parse(result.value));
      } catch (e) {
        // no existing data yet, that's fine
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(TESTS_KEY);
        if (result && result.value) setTests(JSON.parse(result.value));
      } catch (e) {
        // no existing test data yet, that's fine
      } finally {
        setTestsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(PROFILE_KEY);
        if (result && result.value) setProfile(JSON.parse(result.value));
        else setProfile(false); // false = confirmed no profile exists, show onboarding
      } catch (e) {
        setProfile(false);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const res = await window.storage.set(STORAGE_KEY, JSON.stringify(items));
        setSaveError(!res);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [items, loaded]);

  useEffect(() => {
    if (!testsLoaded) return;
    (async () => {
      try {
        const res = await window.storage.set(TESTS_KEY, JSON.stringify(tests));
        setSaveError(!res);
      } catch (e) {
        setSaveError(true);
      }
    })();
  }, [tests, testsLoaded]);

  useEffect(() => {
    if (!profileLoaded || !profile) return;
    (async () => {
      try {
        await window.storage.set(PROFILE_KEY, JSON.stringify(profile));
      } catch (e) {
        // profile save failed silently; settings screen remains editable, user can retry
      }
    })();
  }, [profile, profileLoaded]);

  const addItem = (item) => setItems((prev) => [...prev, item]);
  const upsertItem = (item) => setItems((prev) => {
    const exists = prev.some((i) => i.id === item.id);
    return exists ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item];
  });
  const addTemplateToClass = (classId, template) => {
    setProfile((prev) => ({
      ...prev,
      classes: prev.classes.map((c) =>
        c.id === classId ? { ...c, templates: [...(c.templates || []), template] } : c
      ),
    }));
  };
  const toggleItem = (id) => setItems((prev) => prev.map((i) => i.id === id ? { ...i, done: !i.done } : i));
  const deleteItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));

  const addTest = (test) => setTests((prev) => [...prev, test]);
  const upsertTest = (test) => setTests((prev) => {
    const exists = prev.some((t) => t.id === test.id);
    return exists ? prev.map((t) => (t.id === test.id ? test : t)) : [...prev, test];
  });
  const toggleTest = (id) => setTests((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const deleteTest = (id) => setTests((prev) => prev.filter((t) => t.id !== id));

  const [filterClassId, setFilterClassId] = useState('all');

  const filteredItems = useMemo(() => {
    if (filterClassId === 'all') return items;
    if (filterClassId === 'unassigned') return items.filter((i) => !i.classId);
    return items.filter((i) => i.classId === filterClassId);
  }, [items, filterClassId]);

  const unassignedCount = useMemo(
    () => items.filter((i) => !i.classId).length + tests.filter((t) => !t.classId).length,
    [items, tests]
  );

  const grouped = useMemo(() => {
    const g = { overdue: [], today: [], week: [], later: [], done: [] };
    filteredItems.forEach((i) => g[urgencyOf(i.due, i.done)].push(i));
    Object.keys(g).forEach((k) => g[k].sort((a, b) => new Date(a.due) - new Date(b.due)));
    return g;
  }, [filteredItems]);

  const activeCount = filteredItems.filter((i) => !i.done).length;
  const overdueCount = grouped.overdue.length;
  const todayCount = grouped.today.length;

  const filteredTests = useMemo(() => {
    if (filterClassId === 'all') return tests;
    if (filterClassId === 'unassigned') return tests.filter((t) => !t.classId);
    return tests.filter((t) => t.classId === filterClassId);
  }, [tests, filterClassId]);

  const groupedTests = useMemo(() => {
    const g = { overdue: [], today: [], week: [], later: [], done: [] };
    filteredTests.forEach((t) => g[urgencyOf(t.due, t.done)].push(t));
    Object.keys(g).forEach((k) => g[k].sort((a, b) => new Date(a.due) - new Date(b.due)));
    return g;
  }, [filteredTests]);

  const upcomingTestCount = filteredTests.filter((t) => !t.done).length;
  const testThisWeekCount = groupedTests.today.length + groupedTests.week.length;

  const classColorMap = useMemo(() => {
    const map = {};
    if (profile && profile.classes) {
      profile.classes.forEach((c, idx) => { map[c.id] = c.color || classColor(idx); });
    }
    return map;
  }, [profile]);

  const classNameMap = useMemo(() => {
    const map = {};
    if (profile && profile.classes) {
      profile.classes.forEach((c) => { map[c.id] = c.name; });
    }
    return map;
  }, [profile]);

  const upcomingReminders = useMemo(() => {
    if (!profile) return [];
    const all = [];
    items.forEach((item) => {
      computeReminders(item, profile).forEach((r) => all.push({ ...r, assignmentTitle: item.title }));
    });
    tests.forEach((test) => {
      computeReminders(test, profile).forEach((r) =>
        all.push({ ...r, id: `test-${r.id}`, assignmentTitle: `Study: ${test.title}` })
      );
    });
    return all.sort((a, b) => a.time - b.time).slice(0, 4);
  }, [items, tests, profile]);

  if (!profileLoaded) {
    return (
      <div style={{
        fontFamily: BODY_FONT, background: COLORS.bg, minHeight: '100vh',
        color: COLORS.chalkDim, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        Loading…
      </div>
    );
  }

  if (!profile) {
    return <Onboarding onComplete={(p) => setProfile(p)} />;
  }

  return (
    <div style={{
      fontFamily: BODY_FONT, background: COLORS.bg, minHeight: '100vh',
      color: COLORS.chalk, padding: '20px 16px 100px', boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{
              fontFamily: BODY_FONT, fontSize: 11, letterSpacing: 1.5,
              color: COLORS.chalkDim, textTransform: 'uppercase', marginBottom: 2,
            }}>
              {profile.school ? profile.school : 'The Homework Tracker'}
            </div>
            <h1 style={{
              fontFamily: DISPLAY_FONT, fontSize: 42, letterSpacing: 0.5,
              margin: 0, lineHeight: 1,
            }}>
              {activeTab === 'tests'
                ? (upcomingTestCount === 0 ? 'No tests logged' : `${upcomingTestCount} upcoming`)
                : (activeCount === 0 ? "You're clear" : `${activeCount} on the board`)}
            </h1>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            style={{
              background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`,
              borderRadius: 10, width: 38, height: 38, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              color: COLORS.chalkDim, marginTop: 2,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M19.4 13.5c.04-.5.04-1 0-1.5l1.9-1.4-1.9-3.3-2.2.8a7.6 7.6 0 0 0-1.3-.75L15.5 5h-3.8l-.4 2.35c-.47.2-.9.45-1.3.75l-2.2-.8-1.9 3.3 1.9 1.4c-.04.5-.04 1 0 1.5l-1.9 1.4 1.9 3.3 2.2-.8c.4.3.83.55 1.3.75L11.7 21h3.8l.4-2.35c.47-.2.9-.45 1.3-.75l2.2.8 1.9-3.3-1.9-1.4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18, background: COLORS.panel, borderRadius: 10, padding: 4 }}>
          {[{ id: 'homework', label: 'Homework' }, { id: 'tests', label: 'Tests & quizzes' }].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, border: 'none', borderRadius: 7, padding: '9px 0', cursor: 'pointer',
                fontFamily: BODY_FONT, fontWeight: 700, fontSize: 13.5,
                background: activeTab === tab.id ? COLORS.amber : 'transparent',
                color: activeTab === tab.id ? '#1A1300' : COLORS.chalkDim,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {profile.classes && profile.classes.length > 0 && (
          <div style={{
            display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto',
            paddingBottom: 2, WebkitOverflowScrolling: 'touch',
          }}>
            <button
              onClick={() => setFilterClassId('all')}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                border: `1px solid ${filterClassId === 'all' ? COLORS.amber : COLORS.panelBorder}`,
                background: filterClassId === 'all' ? `${COLORS.amber}22` : 'transparent',
                color: filterClassId === 'all' ? COLORS.amber : COLORS.chalkDim,
                borderRadius: 20, padding: '6px 12px', cursor: 'pointer',
                fontFamily: BODY_FONT, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              All
            </button>
            {profile.classes.map((c, idx) => {
              const color = c.color || classColor(idx);
              const active = filterClassId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setFilterClassId(c.id)}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                    border: `1px solid ${active ? color : COLORS.panelBorder}`,
                    background: active ? `${color}22` : 'transparent',
                    color: active ? color : COLORS.chalkDim,
                    borderRadius: 20, padding: '6px 12px', cursor: 'pointer',
                    fontFamily: BODY_FONT, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                  {c.name}
                </button>
              );
            })}
            {unassignedCount > 0 && (
              <button
                onClick={() => setFilterClassId('unassigned')}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                  border: `1px solid ${filterClassId === 'unassigned' ? COLORS.chalk : COLORS.panelBorder}`,
                  background: filterClassId === 'unassigned' ? `${COLORS.chalkDim}22` : 'transparent',
                  color: filterClassId === 'unassigned' ? COLORS.chalk : COLORS.chalkDim,
                  borderRadius: 20, padding: '6px 12px', cursor: 'pointer',
                  fontFamily: BODY_FONT, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                }}
              >
                Unassigned ({unassignedCount})
              </button>
            )}
          </div>
        )}

        {upcomingReminders.length > 0 && (
          <div style={{
            background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`,
            borderRadius: 10, padding: '10px 14px', marginBottom: 18,
          }}>
            <div style={{
              fontSize: 11, letterSpacing: 0.8, color: COLORS.chalkDim,
              textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke={COLORS.chalkDim} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Upcoming reminders
            </div>
            {upcomingReminders.map((r) => (
              <div key={r.id} style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 12.5,
                color: COLORS.chalk, padding: '4px 0',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>
                  {r.label} · {r.assignmentTitle}
                </span>
                <span style={{ color: COLORS.chalkDim, flexShrink: 0 }}>
                  {r.time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'homework' && (
        <>
        {(overdueCount > 0 || todayCount > 0) && (
          <div style={{
            display: 'flex', gap: 8, marginBottom: 18,
          }}>
            {overdueCount > 0 && (
              <div style={{
                flex: 1, background: `${COLORS.red}1A`, border: `1px solid ${COLORS.red}55`,
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ fontFamily: MONO_FONT, fontSize: 20, fontWeight: 700, color: COLORS.red }}>{overdueCount}</div>
                <div style={{ fontSize: 11, color: COLORS.chalkDim, letterSpacing: 0.5, textTransform: 'uppercase' }}>Overdue</div>
              </div>
            )}
            {todayCount > 0 && (
              <div style={{
                flex: 1, background: `${COLORS.amber}1A`, border: `1px solid ${COLORS.amber}55`,
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ fontFamily: MONO_FONT, fontSize: 20, fontWeight: 700, color: COLORS.amber }}>{todayCount}</div>
                <div style={{ fontSize: 11, color: COLORS.chalkDim, letterSpacing: 0.5, textTransform: 'uppercase' }}>Due today</div>
              </div>
            )}
          </div>
        )}

        {filteredItems.length === 0 && loaded && (
          <div style={{
            textAlign: 'center', padding: '50px 20px', color: COLORS.chalkDim,
          }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, color: COLORS.chalk, marginBottom: 6 }}>
              {filterClassId === 'all' ? 'Nothing on the clock' : 'Nothing for this class'}
            </div>
            <div style={{ fontSize: 14 }}>
              {filterClassId === 'all'
                ? 'Tap the button below to add your first assignment.'
                : 'Tap All to see everything, or add one for this class below.'}
            </div>
          </div>
        )}

        {GROUP_ORDER.filter((k) => k !== 'done' || (hideDone === false && grouped.done.length > 0)).map((key) => {
          const list = grouped[key];
          if (!list || list.length === 0) return null;
          const meta = URGENCY_META[key];
          return (
            <div key={key} style={{ marginBottom: 22 }}>
              <div style={{
                fontFamily: BODY_FONT, fontSize: 12, fontWeight: 700, letterSpacing: 1,
                color: meta.color, textTransform: 'uppercase', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                {meta.label}
              </div>
              {list.map((item) => (
                <Row key={item.id} item={item} onToggle={toggleItem} onDelete={deleteItem} onEdit={setEditingItem} classColorMap={classColorMap} classNameMap={classNameMap} />
              ))}
            </div>
          );
        })}

        {grouped.done.length > 0 && (
          <button onClick={() => setHideDone((v) => !v)} style={{
            background: 'transparent', border: 'none', color: COLORS.chalkDim,
            fontFamily: BODY_FONT, fontSize: 12.5, cursor: 'pointer', padding: '4px 0', marginBottom: 12,
          }}>
            {hideDone ? `Show ${grouped.done.length} done` : 'Hide done'}
          </button>
        )}
        </>
        )}

        {activeTab === 'tests' && (
        <>
        {testThisWeekCount > 0 && (
          <div style={{
            background: `${COLORS.amber}1A`, border: `1px solid ${COLORS.amber}55`,
            borderRadius: 10, padding: '10px 12px', marginBottom: 18,
          }}>
            <div style={{ fontFamily: MONO_FONT, fontSize: 20, fontWeight: 700, color: COLORS.amber }}>{testThisWeekCount}</div>
            <div style={{ fontSize: 11, color: COLORS.chalkDim, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {testThisWeekCount === 1 ? 'Test coming up this week' : 'Tests coming up this week'}
            </div>
          </div>
        )}

        {filteredTests.length === 0 && testsLoaded && (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: COLORS.chalkDim }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, color: COLORS.chalk, marginBottom: 6 }}>
              {filterClassId === 'all' ? 'Nothing on the horizon' : 'Nothing for this class'}
            </div>
            <div style={{ fontSize: 14 }}>
              {filterClassId === 'all'
                ? 'Log a test as soon as you hear about it, so it never sneaks up on you.'
                : 'Tap All to see everything, or add one for this class below.'}
            </div>
          </div>
        )}

        {GROUP_ORDER.filter((k) => k !== 'done' || (hideStudied === false && groupedTests.done.length > 0)).map((key) => {
          const list = groupedTests[key];
          if (!list || list.length === 0) return null;
          const meta = TEST_URGENCY_META[key];
          return (
            <div key={key} style={{ marginBottom: 22 }}>
              <div style={{
                fontFamily: BODY_FONT, fontSize: 12, fontWeight: 700, letterSpacing: 1,
                color: meta.color, textTransform: 'uppercase', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                {meta.label}
              </div>
              {list.map((t) => (
                <TestRow key={t.id} item={t} onToggle={toggleTest} onDelete={deleteTest} onEdit={setEditingTest} classColorMap={classColorMap} classNameMap={classNameMap} />
              ))}
            </div>
          );
        })}

        {groupedTests.done.length > 0 && (
          <button onClick={() => setHideStudied((v) => !v)} style={{
            background: 'transparent', border: 'none', color: COLORS.chalkDim,
            fontFamily: BODY_FONT, fontSize: 12.5, cursor: 'pointer', padding: '4px 0', marginBottom: 12,
          }}>
            {hideStudied ? `Show ${groupedTests.done.length} studied` : 'Hide studied'}
          </button>
        )}
        </>
        )}

        {saveError && (
          <div style={{
            fontFamily: BODY_FONT, fontSize: 12, color: COLORS.red,
            background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}40`,
            borderRadius: 8, padding: '8px 10px', marginBottom: 12,
          }}>
            Couldn't save just now — your changes might not persist. Try again in a moment.
          </div>
        )}
      </div>

      <button
        onClick={() => (activeTab === 'tests' ? setEditingTest('new') : setShowAdd(true))}
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: COLORS.amber, color: '#1A1300', border: 'none',
          borderRadius: 30, padding: '14px 28px',
          fontFamily: BODY_FONT, fontWeight: 700, fontSize: 15,
          boxShadow: '0 8px 24px rgba(255,122,41,0.35)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> {activeTab === 'tests' ? 'Add test' : 'Add assignment'}
      </button>

      {showAdd && (
        <AssignmentForm
          onSave={addItem}
          onClose={() => setShowAdd(false)}
          classes={profile.classes || []}
          onSaveTemplate={addTemplateToClass}
        />
      )}
      {editingItem && (
        <AssignmentForm
          editing={editingItem}
          onSave={upsertItem}
          onClose={() => setEditingItem(null)}
          classes={profile.classes || []}
          onSaveTemplate={addTemplateToClass}
        />
      )}
      {editingTest && (
        <TestForm
          editing={editingTest === 'new' ? null : editingTest}
          onSave={editingTest === 'new' ? addTest : upsertTest}
          onClose={() => setEditingTest(null)}
          classes={profile.classes || []}
        />
      )}
      {showSettings && (
        <SettingsPanel
          profile={profile}
          setProfile={setProfile}
          onClose={() => setShowSettings(false)}
          items={items}
          tests={tests}
          onImportData={({ profile: p, items: i, tests: t }) => {
            setProfile(p);
            setItems(i);
            setTests(t);
          }}
        />
      )}
    </div>
  );
}
