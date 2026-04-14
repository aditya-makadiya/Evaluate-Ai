'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  Pencil,
  ChevronDown,
  Folder,
  Mic,
  GitCommit,
  GitPullRequest,
  GitMerge,
  Target,
  ExternalLink,
  AlertCircle,
  CircleDot,
  Circle,
  CheckCircle2,
  SignalHigh,
  SignalMedium,
  SignalLow,
} from 'lucide-react';

// ═══════════════════════════════════════
//  TYPES (shared with page)
// ═══════════════════════════════════════

export interface LinkedChange {
  id: string;
  type: string;
  title: string;
  repo: string;
  branch: string | null;
  externalId: string;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  project: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  meetingDate: string | null;
  matchedChanges: string[];
  linkedChanges: LinkedChange[];
  alignmentScore: number | null;
  source: string;
  createdAt: string;
  aiCost: number;
  aiSessions: number;
}

export interface TaskStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  highPriority: number;
  deliveryRate: number;
}

export interface FilterOptions {
  projects: string[];
  assignees: Array<{ id: string; name: string }>;
}

// ═══════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════

export const STATUS_META: Record<string, { color: string; label: string; icon: typeof Circle }> = {
  completed: { color: 'text-emerald-400', label: 'Done', icon: CheckCircle2 },
  in_progress: { color: 'text-sky-400', label: 'In Progress', icon: CircleDot },
  pending: { color: 'text-text-muted', label: 'Todo', icon: Circle },
};

export const PRIORITY_META: Record<string, { color: string; label: string; icon: typeof SignalHigh }> = {
  high: { color: 'text-orange-400', label: 'Urgent', icon: SignalHigh },
  medium: { color: 'text-amber-400', label: 'Medium', icon: SignalMedium },
  low: { color: 'text-text-muted', label: 'Low', icon: SignalLow },
};

export const STATUS_FLOW: Record<string, string> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
};

export const PRIORITY_ORDER = ['high', 'medium', 'low'];

function buildCommitUrl(repo: string, externalId: string, type: string): string | null {
  if (!repo) return null;
  if (type === 'commit') return `https://github.com/${repo}/commit/${externalId}`;
  const prMatch = externalId.match(/^pr-(\d+)/);
  if (prMatch) return `https://github.com/${repo}/pull/${prMatch[1]}`;
  return null;
}

// ═══════════════════════════════════════
//  DETAIL PANEL
// ═══════════════════════════════════════

interface Props {
  task: TaskItem;
  teamMembers: Array<{ id: string; name: string }>;
  onUpdate: (taskId: string, updates: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

export default function TaskDetailPanel({ task, teamMembers, onUpdate, onClose }: Props) {
  const meta = STATUS_META[task.status] ?? STATUS_META.pending;
  const pMeta = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const StatusIcon = meta.icon;
  const PriorityIcon = pMeta.icon;

  const [showAssignee, setShowAssignee] = useState(false);
  const [prevTaskId, setPrevTaskId] = useState(task.id);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [descDraft, setDescDraft] = useState(task.description ?? '');
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset drafts when task changes (setState during render — React-recommended pattern)
  if (prevTaskId !== task.id) {
    setPrevTaskId(task.id);
    setTitleDraft(task.title);
    setDescDraft(task.description ?? '');
    setEditingTitle(false);
    setEditingDesc(false);
    setShowAssignee(false);
  }

  useEffect(() => { if (editingTitle) titleRef.current?.focus(); }, [editingTitle]);
  useEffect(() => { if (editingDesc) descRef.current?.focus(); }, [editingDesc]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function saveTitle() {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) await onUpdate(task.id, { title: trimmed });
    else setTitleDraft(task.title);
  }

  async function saveDesc() {
    setEditingDesc(false);
    if (descDraft.trim() !== (task.description ?? '')) await onUpdate(task.id, { description: descDraft.trim() || null });
  }

  const overdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';

  return (
    <div ref={panelRef} className="h-full flex flex-col bg-bg-card border-l border-border-primary">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onUpdate(task.id, { status: STATUS_FLOW[task.status] ?? 'pending' })}
            className={`p-0.5 rounded transition-colors hover:bg-bg-elevated ${meta.color}`}
            title={`Mark as ${STATUS_META[STATUS_FLOW[task.status] ?? 'pending']?.label}`}
          >
            <StatusIcon className="h-4 w-4" />
          </button>
          <span className="text-[10px] text-text-muted">
            {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-elevated transition-colors text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-5 pb-6 space-y-5">
          {/* Title */}
          <div className="group/title">
            {editingTitle ? (
              <input ref={titleRef} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle} onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false); } }}
                className="w-full text-base font-semibold text-text-primary bg-transparent border-b-2 border-accent-purple focus:outline-none pb-1" />
            ) : (
              <div className="flex items-start gap-2 cursor-text" onClick={() => setEditingTitle(true)}>
                <h2 className={`text-base font-semibold flex-1 leading-snug ${task.status === 'completed' ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                  {task.title}
                </h2>
                <Pencil className="h-3 w-3 mt-1 text-text-muted opacity-0 group-hover/title:opacity-40 shrink-0" />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="group/desc">
            {editingDesc ? (
              <div>
                <textarea ref={descRef} value={descDraft} onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={saveDesc} onKeyDown={(e) => { if (e.key === 'Escape') { setDescDraft(task.description ?? ''); setEditingDesc(false); } }}
                  rows={4} placeholder="Add a description..."
                  className="w-full text-sm text-text-secondary bg-bg-primary border border-border-primary rounded-lg p-3 focus:outline-none focus:border-accent-purple resize-none leading-relaxed" />
                <div className="flex gap-2 mt-1.5">
                  <button onClick={saveDesc} className="text-[11px] font-medium text-accent-purple flex items-center gap-1"><Check className="h-3 w-3" />Save</button>
                  <button onClick={() => { setDescDraft(task.description ?? ''); setEditingDesc(false); }} className="text-[11px] text-text-muted">Cancel</button>
                </div>
              </div>
            ) : (
              <p onClick={() => setEditingDesc(true)}
                className={`text-sm leading-relaxed cursor-text min-h-[20px] ${task.description ? 'text-text-secondary' : 'text-text-muted italic'}`}>
                {task.description || 'Add description...'}
              </p>
            )}
          </div>

          {/* Properties */}
          <div className="border-t border-border-primary pt-4 space-y-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3">Properties</h3>

            {/* Status */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-muted w-20 shrink-0">Status</span>
              <select value={task.status} onChange={(e) => onUpdate(task.id, { status: e.target.value })}
                className={`flex-1 bg-transparent border border-border-primary rounded-lg px-2.5 py-1.5 text-xs font-medium ${meta.color} focus:outline-none focus:border-accent-purple cursor-pointer hover:border-border-hover transition-colors`}>
                <option value="pending">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Done</option>
              </select>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-muted w-20 shrink-0">Priority</span>
              <div className="relative flex-1">
                <select value={task.priority} onChange={(e) => onUpdate(task.id, { priority: e.target.value })}
                  className="w-full bg-transparent border border-border-primary rounded-lg pl-7 pr-2.5 py-1.5 text-xs font-medium text-text-primary focus:outline-none focus:border-accent-purple cursor-pointer hover:border-border-hover transition-colors">
                  {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_META[p]?.label ?? p}</option>)}
                </select>
                <PriorityIcon className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 ${pMeta.color}`} />
              </div>
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-muted w-20 shrink-0">Assignee</span>
              <div className="relative flex-1">
                <button onClick={() => setShowAssignee(!showAssignee)}
                  className="w-full flex items-center gap-2 border border-border-primary rounded-lg px-2.5 py-1.5 text-xs text-left hover:border-border-hover transition-colors">
                  {task.assigneeName ? (
                    <>
                      <span className="h-5 w-5 rounded-full bg-accent-purple/15 flex items-center justify-center text-[9px] font-bold text-accent-purple">
                        {task.assigneeName.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-text-primary flex-1 truncate">{task.assigneeName}</span>
                    </>
                  ) : <span className="text-text-muted flex-1">Unassigned</span>}
                  <ChevronDown className="h-3 w-3 text-text-muted" />
                </button>
                {showAssignee && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowAssignee(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-bg-card border border-border-primary rounded-lg shadow-xl shadow-black/30 py-1 max-h-48 overflow-y-auto">
                      <button onClick={() => { onUpdate(task.id, { assignee_id: null }); setShowAssignee(false); }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-bg-elevated ${!task.assigneeId ? 'text-accent-purple' : 'text-text-secondary'}`}>
                        Unassigned
                      </button>
                      {teamMembers.map((m) => (
                        <button key={m.id} onClick={() => { onUpdate(task.id, { assignee_id: m.id }); setShowAssignee(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-bg-elevated flex items-center gap-2 ${task.assigneeId === m.id ? 'text-accent-purple' : 'text-text-secondary'}`}>
                          <span className="h-5 w-5 rounded-full bg-accent-purple/15 flex items-center justify-center text-[9px] font-bold text-accent-purple">
                            {m.name.charAt(0).toUpperCase()}
                          </span>
                          {m.name}
                          {task.assigneeId === m.id && <CheckCircle2 className="h-3 w-3 ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Deadline */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-muted w-20 shrink-0">Due date</span>
              <div className="relative flex-1">
                <input type="date"
                  value={task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : ''}
                  onChange={(e) => onUpdate(task.id, { deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className={`w-full bg-transparent border border-border-primary rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent-purple cursor-pointer hover:border-border-hover transition-colors ${overdue ? 'text-red-400' : 'text-text-primary'}`} />
                {overdue && <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-red-400" />}
              </div>
            </div>

            {/* Project */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-muted w-20 shrink-0">Project</span>
              <div className="flex items-center gap-1.5 flex-1 text-xs text-text-secondary border border-border-primary rounded-lg px-2.5 py-1.5">
                <Folder className="h-3 w-3 text-sky-400 opacity-60" />
                {task.project ?? <span className="text-text-muted">None</span>}
              </div>
            </div>

            {/* Source */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-muted w-20 shrink-0">Source</span>
              {task.meetingTitle ? (
                <a href="/dashboard/meetings" className="flex items-center gap-1.5 flex-1 text-xs border border-border-primary rounded-lg px-2.5 py-1.5 text-accent-purple hover:border-accent-purple/30 transition-colors">
                  <Mic className="h-3 w-3 opacity-60" /><span className="truncate">{task.meetingTitle}</span>
                </a>
              ) : (
                <div className="flex-1 text-xs text-text-muted border border-border-primary rounded-lg px-2.5 py-1.5 capitalize">{task.source}</div>
              )}
            </div>
            {/* AI Cost */}
            {task.aiCost > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-text-muted w-20 shrink-0">AI Cost</span>
                <div className="flex items-center gap-2 flex-1 text-xs border border-border-primary rounded-lg px-2.5 py-1.5">
                  <span className="font-mono font-semibold text-yellow-400">${task.aiCost.toFixed(2)}</span>
                  <span className="text-text-muted">across {task.aiSessions} session{task.aiSessions !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )}
          </div>

          {/* Code Activity */}
          <div className="border-t border-border-primary pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
              Code Activity
              {task.linkedChanges.length > 0 && (
                <span className="bg-emerald-500/10 text-emerald-400 text-[9px] font-bold rounded px-1.5 py-0.5 normal-case tracking-normal">{task.linkedChanges.length}</span>
              )}
              {task.alignmentScore != null && (
                <span className={`text-[9px] font-bold rounded px-1.5 py-0.5 normal-case tracking-normal ${task.alignmentScore >= 80 ? 'bg-emerald-500/10 text-emerald-400' : task.alignmentScore >= 60 ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  <Target className="h-2.5 w-2.5 inline mr-0.5" />{task.alignmentScore}%
                </span>
              )}
            </h3>
            {task.linkedChanges.length > 0 ? (
              <div className="space-y-1.5">
                {task.linkedChanges.map((ch) => {
                  const isMerge = ch.type === 'pr_merged';
                  const isPR = ch.type.startsWith('pr_');
                  const url = buildCommitUrl(ch.repo, ch.externalId, ch.type);
                  const iconBg = isMerge ? 'bg-purple-500/10' : isPR ? 'bg-sky-500/10' : 'bg-bg-elevated';
                  const badgeCls = isMerge ? 'bg-purple-500/15 text-purple-300' : isPR ? 'bg-sky-500/15 text-sky-300' : 'bg-bg-elevated text-text-muted';
                  return (
                    <div key={ch.id} className="flex items-center gap-2.5 py-2 px-3 rounded-lg border border-border-primary hover:border-border-hover transition-colors group/ch">
                      <div className={`p-1 rounded-md ${iconBg}`}>
                        {isMerge ? <GitMerge className="h-3 w-3 text-purple-400" /> : isPR ? <GitPullRequest className="h-3 w-3 text-sky-400" /> : <GitCommit className="h-3 w-3 text-text-muted" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-text-primary block truncate">{ch.title}</span>
                        <span className="text-[10px] text-text-muted font-mono">
                          {ch.repo.split('/').pop()}{ch.branch && ` / ${ch.branch}`} · {new Date(ch.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <span className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 shrink-0 ${badgeCls}`}>
                        {isMerge ? 'Merged' : isPR ? 'PR' : 'Commit'}
                      </span>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded opacity-0 group-hover/ch:opacity-60 hover:!opacity-100 hover:bg-bg-elevated transition-all text-text-muted">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2.5 py-3 px-3 rounded-lg border border-dashed border-border-primary">
                <GitCommit className="h-3.5 w-3.5 text-text-muted opacity-40" />
                <span className="text-xs text-text-muted">Commits and PRs will link here automatically</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
