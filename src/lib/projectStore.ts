import type { PackedMatrix, ProjectData } from "../engine/project/format";

/**
 * Projects saved in this browser (IndexedDB). Nothing leaves the device. Two stores: the project itself (chart, settings,
 * progress) and, separately, its original picture, so the frequent autosave of an edited chart never rewrites a big image.
 */
const DB_NAME = "gridcrow";
const DB_VERSION = 1;
const PROJECTS = "projects";
const IMAGES = "images";

export interface ProjectSummary {
  id: string;
  name: string;
  kind: "picture" | "blank";
  updatedAt: number;
  cols: number;
  rows: number;
  progress: number;
  colors: number;
}

type Stored = Omit<ProjectData, "image"> & { hasImage: boolean };

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const created: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser can't save projects on this device."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open storage."));
    req.onblocked = () => reject(new Error("Storage is busy in another tab."));
  }).catch((e) => {
    dbPromise = null; // try again next time
    throw e;
  });
  dbPromise = created;
  return created;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Storage failed."));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Storage failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Storage was full or blocked."));
  });
}

function summary(p: Stored): ProjectSummary {
  return { id: p.id, name: p.name, kind: p.kind, updatedAt: p.updatedAt, cols: p.current.cols, rows: p.current.rows, progress: p.progress, colors: p.current.palette.length };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await open();
  const all = (await wrap(db.transaction(PROJECTS).objectStore(PROJECTS).getAll())) as Stored[];
  return all.map(summary).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<ProjectData | null> {
  const db = await open();
  const tx = db.transaction([PROJECTS, IMAGES]);
  const p = (await wrap(tx.objectStore(PROJECTS).get(id))) as Stored | undefined;
  if (!p) return null;
  const img = p.hasImage ? ((await wrap(tx.objectStore(IMAGES).get(id))) as { name: string; type: string; bytes: Uint8Array } | undefined) : undefined;
  const { hasImage: _h, ...rest } = p;
  void _h;
  return { ...rest, image: img ? { name: img.name, type: img.type, bytes: img.bytes } : null };
}

/** Save a project. The picture is written only when `withImage` is true (when the project is new or the picture changed). */
export async function saveProject(p: ProjectData, opts: { withImage: boolean }): Promise<void> {
  const db = await open();
  const stores = opts.withImage ? [PROJECTS, IMAGES] : [PROJECTS];
  const tx = db.transaction(stores, "readwrite");
  const existing = opts.withImage ? undefined : ((await wrap(tx.objectStore(PROJECTS).get(p.id))) as Stored | undefined);
  const { image, ...rest } = p;
  const stored: Stored = { ...rest, hasImage: opts.withImage ? image !== null : existing?.hasImage ?? false };
  tx.objectStore(PROJECTS).put(stored);
  if (opts.withImage) {
    if (image) tx.objectStore(IMAGES).put({ id: p.id, name: image.name, type: image.type, bytes: image.bytes });
    else tx.objectStore(IMAGES).delete(p.id);
  }
  await done(tx);
}

export async function renameProject(id: string, name: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(PROJECTS, "readwrite");
  const p = (await wrap(tx.objectStore(PROJECTS).get(id))) as Stored | undefined;
  if (p) tx.objectStore(PROJECTS).put({ ...p, name });
  await done(tx);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction([PROJECTS, IMAGES], "readwrite");
  tx.objectStore(PROJECTS).delete(id);
  tx.objectStore(IMAGES).delete(id);
  await done(tx);
}

export type { PackedMatrix };
