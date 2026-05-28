'use client';

import { useState } from 'react';

type Team = { teamId: string; name: string };

/**
 * Drag-to-reorder seeding list. Renders one `<input type="hidden" name="team_id" />`
 * per team in the current order, so the parent server-action form
 * (`seedBracketFromForm`) reads the order from `formData.getAll('team_id')`
 * unchanged.
 *
 * Two reorder affordances:
 *   - HTML5 native drag-and-drop (desktop, mouse) — driven by the grip
 *     handle on each row;
 *   - up/down arrow buttons (touch + keyboard) — every reorder works
 *     without a pointer.
 *
 * The component is keyed in the parent by the joined team-id sequence so
 * a server-driven reorder (e.g. the Randomize button) re-mounts the
 * component and resyncs state with fresh props.
 */
export function SeedingList({ orderedTeams }: { orderedTeams: ReadonlyArray<Team> }) {
  const [teams, setTeams] = useState<Team[]>(() => orderedTeams.slice());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= teams.length || from === to) return;
    setTeams((prev) => {
      const next = prev.slice();
      const [picked] = next.splice(from, 1);
      if (picked) next.splice(to, 0, picked);
      return next;
    });
  }

  function onDrop(targetId: string) {
    const from = teams.findIndex((t) => t.teamId === draggingId);
    const to = teams.findIndex((t) => t.teamId === targetId);
    if (from >= 0 && to >= 0) move(from, to);
    setDraggingId(null);
    setOverId(null);
  }

  return (
    <ol className="space-y-1">
      {teams.map((t, i) => {
        const isDragging = draggingId === t.teamId;
        const isOver = overId === t.teamId && draggingId !== t.teamId;
        return (
          <li
            key={t.teamId}
            draggable
            onDragStart={(e) => {
              setDraggingId(t.teamId);
              e.dataTransfer.effectAllowed = 'move';
              // Required for Firefox to start the drag.
              e.dataTransfer.setData('text/plain', t.teamId);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overId !== t.teamId) setOverId(t.teamId);
            }}
            onDragLeave={() => {
              if (overId === t.teamId) setOverId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(t.teamId);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setOverId(null);
            }}
            className={`border-border-base/60 bg-bg flex items-center gap-2 rounded border px-2 py-1 text-sm transition ${
              isDragging ? 'opacity-40' : ''
            } ${isOver ? 'border-primary border-dashed' : ''}`}
          >
            <span
              aria-hidden="true"
              className="text-muted hover:text-fg cursor-grab select-none active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripIcon />
            </span>
            <span className="text-muted w-6 text-right tabular-nums">{i + 1}.</span>
            <span className="text-fg flex-1 truncate">{t.name}</span>
            <button
              type="button"
              aria-label={`Move ${t.name} up`}
              onClick={() => move(i, i - 1)}
              disabled={i === 0}
              className="tap-target text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${t.name} down`}
              onClick={() => move(i, i + 1)}
              disabled={i === teams.length - 1}
              className="tap-target text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-30"
            >
              ↓
            </button>
            <input type="hidden" name="team_id" value={t.teamId} />
          </li>
        );
      })}
    </ol>
  );
}

function GripIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}
