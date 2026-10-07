export type Repeat = 'd' | 'w' | 'm';

export interface Tag {
  id: string;
  workspace_id: string;
  name: string;
  color: number;
  position: number;
}

export interface Subtask {
  id?: string;
  task_id?: string;
  title: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: string;
  folio: number;
  workspace_id: string;
  title: string;
  notes: string;
  tag_id: string | null;
  due_date: string; // YYYY-MM-DD
  priority: boolean;
  repeat: Repeat | null;
  remind_after_days: number | null;
  done_at: string | null; // ISO timestamp
  created_at: string;
  subtasks: Subtask[];
}

export interface Settings {
  user_id: string;
  remind_after_days: number;
  confirm_done: boolean;
  email_digest: boolean;
  display_name?: string | null;
}

export type View = 'hoy' | 'proximas' | 'historial' | 'bitacora' | 'perfil';
