import { useState } from "react";
import type { ProjectSummary } from "../lib/projectStore";
import { MAX_PROJECT_NAME } from "../engine/project/format";
import { ProjectThumb } from "./ProjectThumb";

interface Props {
  projects: ProjectSummary[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onImport: (file: File) => void;
  /** A problem with storage or the backup file, shown in plain words. */
  message: string | null;
  storageOk: boolean;
}

function describe(p: ProjectSummary): string {
  const total = p.cols * p.rows;
  const pct = total > 0 ? Math.floor((p.progress / total) * 100) : 0;
  const when = new Date(p.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const bits = [`${p.cols} × ${p.rows} stitches`, `${p.colors} ${p.colors === 1 ? "color" : "colors"}`];
  if (p.progress > 0) bits.push(`${pct}% crocheted`);
  bits.push(`saved ${when}`);
  return bits.join(" · ");
}

/** The list of projects saved on this device, plus a way to open a backup file. */
export function ProjectsPanel({ projects, currentId, onOpen, onRename, onDelete, onImport, message, storageOk }: Props) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <section className="projects" data-testid="projects">
      <div className="projects__bar">
        {storageOk && projects.length > 0 && (
          <button
            type="button"
            className="projects__toggle"
            data-testid="projects-toggle"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            My projects ({projects.length})
          </button>
        )}
        <label className="projects__import">
          <input
            type="file"
            accept=".gridcrow,application/json"
            data-testid="import-backup"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onImport(f);
            }}
          />
          <span>Open a backup file</span>
        </label>
      </div>
      {message && (
        <p className="upload__error" role="alert" data-testid="projects-message">
          {message}
        </p>
      )}
      {open && (
        <p className="projects__meta" data-testid="projects-safety">
          Projects live in this browser. Browsers can clear saved data when a device runs low on space, so save a backup file (.gridcrow) of anything you would hate to lose.
        </p>
      )}
      {open && (
        <ul className="projects__list" data-testid="projects-list">
          {projects.map((p) => (
            <li key={p.id} className="projects__item" data-testid="project-item">
              {renaming === p.id ? (
                <form
                  className="projects__rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onRename(p.id, draft);
                    setRenaming(null);
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    maxLength={MAX_PROJECT_NAME}
                    aria-label="Project name"
                    data-testid="rename-input"
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button type="submit" className="projects__btn">Save</button>
                  <button type="button" className="projects__btn" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <ProjectThumb chart={p.thumb} />
                  <div className="projects__info">
                    <span className="projects__name">
                      {p.name}
                      {p.id === currentId ? " (open)" : ""}
                    </span>
                    <span className="projects__meta">{describe(p)}</span>
                  </div>
                  <div className="projects__actions">
                    {confirming === p.id ? (
                      <>
                        <span className="projects__meta">Delete it?</span>
                        <button type="button" className="projects__btn projects__btn--danger" data-testid="delete-yes" onClick={() => { setConfirming(null); onDelete(p.id); }}>
                          Yes, delete
                        </button>
                        <button type="button" className="projects__btn" onClick={() => setConfirming(null)}>Keep</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="projects__btn" data-testid="open-project" onClick={() => onOpen(p.id)}>Open</button>
                        <button type="button" className="projects__btn" data-testid="rename-project" onClick={() => { setDraft(p.name); setRenaming(p.id); }}>Rename</button>
                        <button type="button" className="projects__btn" data-testid="delete-project" onClick={() => setConfirming(p.id)}>Delete</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
