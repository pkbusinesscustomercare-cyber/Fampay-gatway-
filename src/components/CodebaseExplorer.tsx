import React, { useState } from 'react';
import { Copy, Check, Download, FileCode2, Terminal } from 'lucide-react';
import type { ExportFileItem } from '../types';

interface CodebaseExplorerProps {
  files: ExportFileItem[];
  loading: boolean;
}

export const CodebaseExplorer: React.FC<CodebaseExplorerProps> = ({
  files,
  loading,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>('package.json');
  const [copiedPath, setCopiedPath] = useState<string>('');

  const activeFile =
    files.find((f) => f.path === selectedPath) || files[0] || null;

  async function handleCopyFile(file: ExportFileItem) {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopiedPath(file.path);
      setTimeout(() => setCopiedPath(''), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  }

  function handleDownloadSingleFile(file: ExportFileItem) {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.replace(/\//g, '__');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleDownloadInstallerScript() {
    if (!files.length) return;
    const lines: string[] = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "Scaffolding FamPay Automated UPI Payment Gateway (Next.js App Router)..."',
      '',
    ];

    for (const file of files) {
      const dir = file.path.includes('/')
        ? file.path.slice(0, file.path.lastIndexOf('/'))
        : '';
      if (dir) {
        lines.push(`mkdir -p "${dir}"`);
      }
      lines.push(`cat << 'EOF_FAMPAY_FILE' > "${file.path}"`);
      lines.push(file.content);
      lines.push('EOF_FAMPAY_FILE');
      lines.push('');
    }

    lines.push(`cat << 'EOF_FAMPAY_FILE' > "postcss.config.mjs"`);
    lines.push(`export default { plugins: { '@tailwindcss/postcss': {} } };`);
    lines.push('EOF_FAMPAY_FILE');
    lines.push('');
    lines.push('echo "All Next.js App Router files generated! Run: npm install && npm run dev"');

    const blob = new Blob([lines.join('\n')], {
      type: 'text/x-shellscript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'setup-fampay-gateway.sh';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">
            Next.js App Router · Firebase Admin SDK · ImapFlow + Mailparser · Vercel Ready
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Complete Production Repository Codebase
          </h1>
        </div>

        <button
          type="button"
          onClick={handleDownloadInstallerScript}
          disabled={!files.length}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Terminal className="h-4 w-4" />
          Download Repo Builder Script (.sh)
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          Loading repository source files...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* File Tree Navigation */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">
                Project Files
              </span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {files.length} files
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {files.map((file, idx) => {
                const isSelected = activeFile?.path === file.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 text-xs transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <FileCode2
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isSelected ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      />
                      <span className="font-mono truncate">
                        {String(idx + 1).padStart(2, '0')}. {file.path}
                      </span>
                    </span>
                    <span
                      className={`font-mono text-[11px] tabular-nums shrink-0 ${
                        isSelected ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {file.content.split('\n').length}L
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Code Viewer */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {activeFile && (
              <>
                <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-900">
                      {activeFile.path}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-slate-500 font-mono tabular-nums">
                      {activeFile.content.split('\n').length} lines
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyFile(activeFile)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap"
                    >
                      {copiedPath === activeFile.path ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy File
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadSingleFile(activeFile)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                  </div>
                </div>

                <pre className="p-5 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed overflow-x-auto max-h-[640px] overflow-y-auto">
                  <code>{activeFile.content}</code>
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
