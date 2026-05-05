$css = @"

/* ===== Help Button & Contextual Tooltips ===== */
.help-btn {
  background: none; border: 1px solid var(--accent); border-radius: 50%;
  color: var(--accent); cursor: pointer; font-size: 0.82em;
  margin-left: 7px; padding: 1px 6px; vertical-align: middle;
  transition: background 0.15s; display: inline-flex; align-items: center;
  justify-content: center; width: 22px; height: 22px;
}
.help-btn:hover { background: var(--accent-glow); }
.tooltip-icon {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: 1px solid var(--border); border-radius: 50%;
  color: var(--text2); cursor: pointer; font-size: 0.78em;
  width: 18px; height: 18px; margin-left: 5px; position: relative; vertical-align: middle;
}
.tooltip-icon:hover { border-color: var(--accent); color: var(--accent); }

/* ===== AI Diagnostics Bar ===== */
.ai-diagnostics-bar {
  display: flex; align-items: center; gap: 14px; font-size: 12px;
  color: var(--text2); background: var(--bg3); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 7px 14px; margin-bottom: 10px; flex-wrap: wrap;
}
.ai-diag-item { display: flex; align-items: center; gap: 5px; }
.ai-diag-label { color: var(--text3); font-size: 11px; }
.ai-diag-value { font-weight: 600; color: var(--text); }
.ai-diag-dot {
  width: 10px; height: 10px; border-radius: 50%; background: var(--text3);
  display: inline-block; transition: background 0.3s;
}
.ai-diag-dot.connected { background: var(--success); }
.ai-diag-dot.disconnected { background: var(--danger); }
.ai-diag-dot.checking { background: var(--warning); animation: ai-dot-pulse 1s infinite; }
@keyframes ai-dot-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

/* ===== Help Modal ===== */
.help-modal-box { max-width: 680px; width: 92%; }
.help-modal-body { padding: 20px 24px; max-height: 70vh; overflow-y: auto; }
.help-section-title {
  font-size: 15px; font-weight: 700; color: var(--accent);
  margin: 18px 0 7px; border-bottom: 1px solid var(--border); padding-bottom: 4px;
}
.help-content p { margin-bottom: 8px; color: var(--text); font-size: 14px; }
.help-content ul { margin-left: 18px; margin-bottom: 8px; }
.help-content li { margin-bottom: 4px; color: var(--text2); font-size: 13px; }
.help-nav-row { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.help-nav-btn {
  background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--text2); cursor: pointer; font-size: 13px; padding: 5px 12px;
  transition: background 0.12s, color 0.12s;
}
.help-nav-btn.active, .help-nav-btn:hover { background: var(--accent-glow); color: var(--accent); border-color: var(--accent); }
"@

Add-Content -Path "C:\Users\justi\Claude2\public\css\style.css" -Value $css
Write-Output "CSS appended OK"
